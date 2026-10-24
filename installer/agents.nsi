Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!ifndef PACKAGE_DIR
  !error "PACKAGE_DIR is required"
!endif
!ifndef UNINSTALL_MANIFEST
  !error "UNINSTALL_MANIFEST is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif
!ifndef APP_VERSION
  !error "APP_VERSION is required"
!endif
!ifndef EXTRACT_MANIFEST
  !error "EXTRACT_MANIFEST is required"
!endif
Name "Ultimate Agents - Both ${APP_VERSION}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Ultimate Agents Both"
InstallDirRegKey HKCU "Software\UltimateAgentsBoth" "InstallDir"
RequestExecutionLevel user
CRCCheck force
SetCompressor /SOLID lzma
Var StageDir
Var VersionDir
Var OldVersion
Var OldPath
Var OwnStage
Var MutexHandle
Var OldInstallDir
Var LogPath
Var LogFailed
Var Operation
Var InstallItem
Var Outcome
Var Win32Error
Var Attempt
Var FailureOperation
Var FailureError
Var PreviousState
Var RecoveryRoot
Var OwnRecoveryRoot
Var OwnRecoveryVersions

; Log only fixed operation names, public package-relative names and numeric OS
; errors. Never dump the command line, install path, registry values or user data.
!macro BeginOperation name
  StrCpy $Operation "${name}"
  StrCpy $InstallItem "-"
  StrCpy $Win32Error "unavailable"
  StrCpy $Outcome "start"
  Call Diagnostic
  ClearErrors
!macroend
!define MUI_ABORTWARNING
!define MUI_CUSTOMFUNCTION_ABORT CleanStage
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_PRE DirectoryPage
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!include "activation.nsh"
!include "recovery.nsh"

Function DirectoryPage
  ; The native recovery question already names the exact fresh location.
  ${If} $RecoveryRoot == "1"
    Abort
  ${EndIf}
FunctionEnd

Function .onInit
  SetShellVarContext current
  CreateDirectory "$LOCALAPPDATA\UltimateAgentsBoth\InstallerLogs"
  GetTempFileName $LogPath "$LOCALAPPDATA\UltimateAgentsBoth\InstallerLogs"
  IfErrors log_unavailable
  Rename "$LogPath" "$LogPath.log"
  IfErrors log_unavailable
  StrCpy $LogPath "$LogPath.log"
  StrCpy $Operation "initialize"
  StrCpy $InstallItem "-"
  StrCpy $Outcome "start"
  StrCpy $Win32Error "unavailable"
  Call Diagnostic
  ${If} $LogFailed == "1"
    Goto log_unavailable
  ${EndIf}
  DetailPrint "Persistent installation log: $LogPath"
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\UltimateAgentsBothInstaller") p .r0 ?e'
  Pop $1
  StrCpy $MutexHandle $0
  ${If} $0 == 0
  ${OrIf} $1 = 183
    StrCpy $Operation "installer-mutex"
    StrCpy $Outcome "failed"
    StrCpy $Win32Error $1
    Call Diagnostic
    SetErrorLevel 41
    Abort "Cannot acquire the exclusive AGENTS installer lock. No application files were changed."
  ${EndIf}
  ReadRegStr $OldVersion HKCU "Software\UltimateAgentsBoth" "Version"
  ReadRegStr $OldInstallDir HKCU "Software\UltimateAgentsBoth" "InstallDir"
  Call InspectPreviousPayload
  ${If} $OldVersion != ""
    ${VersionCompare} "${APP_VERSION}" "$OldVersion" $0
    ${If} $0 != 1
      StrCpy $Operation "version-floor"
      StrCpy $Outcome "rejected"
      Call Diagnostic
      SetErrorLevel 43
      Abort "This version is already installed or older than the registered version. No files were changed."
    ${EndIf}
  ${EndIf}
  ; An explicit selection, never an automatic fallback around denied promotion.
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/RECOVERTOUSER" $1
  ${IfNot} ${Errors}
    Call SelectRecoveryRoot
  ${ElseIf} $PreviousState == "missing"
    IfSilent init_done
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "The registered AGENTS executable is already missing. The installer cannot determine how it disappeared.$\r$\n$\r$\nInstall in a fresh per-user location at $LOCALAPPDATA\Programs\Ultimate Agents Both?$\r$\n$\r$\nYes leaves the old directory intact and keeps the existing personal data location. No keeps the selected install directory. No permissions or security settings will change." IDNO init_done
    Call SelectRecoveryRoot
  ${EndIf}
init_done:
  Return
log_unavailable:
  SetErrorLevel 46
  Abort "Cannot create a persistent installation log under LocalAppData\UltimateAgentsBoth\InstallerLogs. No application files were changed."
FunctionEnd

Function Diagnostic
  Push $0
  Push $1
  Push $2
  ; Logging must not clear or introduce an NSIS operation's error flag.
  StrCpy $2 "0"
  IfErrors 0 +2
    StrCpy $2 "1"
  ClearErrors
  FileOpen $0 "$LogPath" a
  IfErrors diagnostic_failed
  ; NSIS 'a' means OPEN_ALWAYS, not FILE_APPEND_DATA: seek explicitly on every
  ; reopen so cleanup can never overwrite the operation that actually failed.
  FileSeek $0 0 END
  ${If} ${Errors}
    FileClose $0
    Goto diagnostic_failed
  ${EndIf}
  System::Call 'kernel32::GetTickCount() i .r1'
  FileWrite $0 "version=${APP_VERSION} tick=$1 operation=$Operation item=$InstallItem outcome=$Outcome win32=$Win32Error$\r$\n"
  IfErrors 0 +2
    StrCpy $LogFailed "1"
  FileClose $0
  Goto diagnostic_done
diagnostic_failed:
  StrCpy $LogFailed "1"
diagnostic_done:
  ${If} $LogFailed == "1"
    DetailPrint "WARNING: persistent diagnostic log could not be updated. Installation status must be read in this window."
  ${EndIf}
  ClearErrors
  ${If} $2 == "1"
    SetErrors
  ${EndIf}
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function CleanStage
  ${If} $OwnStage == "1"
    ; Release our own working-directory handle before attempting cleanup.
    SetOutPath "$TEMP"
    Push $INSTDIR
    StrCpy $INSTDIR $StageDir
    ; Only this build's own staged files, never user data or arbitrary directories.
    !include "${UNINSTALL_MANIFEST}"
    Delete "$INSTDIR\Uninstall AGENTS.exe"
    Delete "$INSTDIR\installed-version.txt"
    RMDir "$INSTDIR"
    Pop $INSTDIR
    StrCpy $OwnStage "0"
    StrCpy $Operation "cleanup-owned-stage"
    StrCpy $InstallItem "-"
    StrCpy $Win32Error "unavailable"
    StrCpy $Outcome "complete"
    IfFileExists "$StageDir" 0 +2
      StrCpy $Outcome "retained-locked-or-unknown-files"
    Call Diagnostic
  ${EndIf}
  ; Only directories created by this recovery attempt; nonrecursive removal
  ; retains any unknown/locked files. Never clean the registered old root.
  ${If} $OwnRecoveryRoot == "1"
    SetOutPath "$TEMP"
    ${If} $OwnRecoveryVersions == "1"
      RMDir "$INSTDIR\versions"
    ${EndIf}
    RMDir "$INSTDIR"
    StrCpy $OwnRecoveryRoot "0"
    StrCpy $Operation "cleanup-owned-recovery-root"
    StrCpy $InstallItem "-"
    StrCpy $Win32Error "unavailable"
    StrCpy $Outcome "removed-empty-root"
    IfFileExists "$INSTDIR" 0 +2
      StrCpy $Outcome "retained-nonempty-or-locked-root"
    Call Diagnostic
  ${EndIf}
FunctionEnd
Function .onInstFailed
  Call CleanStage
FunctionEnd

Section "AGENTS" SEC_MAIN
  SetShellVarContext current
  StrCpy $VersionDir "$INSTDIR\versions\${APP_VERSION}"
  StrCpy $StageDir "$INSTDIR\.stage-${APP_VERSION}"
  !insertmacro BeginOperation "check-destination"
  ; Reject files as well as directories; never merge into an existing stage.
  System::Call 'kernel32::GetFileAttributesW(w "$VersionDir") i .r0 ?e'
  Pop $Win32Error
  ${If} $0 != -1
    Goto collision
  ${EndIf}
  ${If} $Win32Error != 2
  ${AndIf} $Win32Error != 3
    Goto stage_failed
  ${EndIf}
  System::Call 'kernel32::GetFileAttributesW(w "$StageDir") i .r0 ?e'
  Pop $Win32Error
  ${If} $0 != -1
    Goto collision
  ${EndIf}
  ${If} $Win32Error != 2
  ${AndIf} $Win32Error != 3
    Goto stage_failed
  ${EndIf}
  !insertmacro BeginOperation "create-install-root"
  ${If} $LogFailed == "1"
    Goto stage_failed
  ${EndIf}
  ${If} $RecoveryRoot == "1"
    ; The chosen recovery root must remain fresh even if another process races
    ; the initial check. Never merge with an existing default installation.
    ${If} $INSTDIR != "$LOCALAPPDATA\Programs\Ultimate Agents Both"
      StrCpy $Win32Error "87"
      Goto stage_failed
    ${EndIf}
    CreateDirectory "$LOCALAPPDATA\Programs"
    IfErrors stage_failed
    System::Call 'kernel32::CreateDirectoryW(w "$INSTDIR", p 0) i .r0 ?e'
    Pop $Win32Error
    ${If} $0 == 0
      Goto stage_failed
    ${EndIf}
    StrCpy $OwnRecoveryRoot "1"
  ${Else}
    CreateDirectory "$INSTDIR"
    IfErrors stage_failed
  ${EndIf}
  !insertmacro BeginOperation "create-stage"
  System::Call 'kernel32::CreateDirectoryW(w "$StageDir", p 0) i .r0 ?e'
  Pop $Win32Error
  ${If} $0 == 0
    Goto stage_failed
  ${EndIf}
  StrCpy $OwnStage "1"
  !insertmacro BeginOperation "extract-payload"
  DetailPrint "Extracting application payload. Failures record the package-relative file in the persistent log."
  SetDetailsPrint none
  !include "${EXTRACT_MANIFEST}"
  SetDetailsPrint both
  !insertmacro BeginOperation "verify-layout"
  !macro RequireFile relative
    StrCpy $InstallItem "${relative}"
    IfFileExists "$StageDir\${relative}" +2
      Goto stage_failed
  !macroend
  !insertmacro RequireFile "AGENTS.exe"
  !insertmacro RequireFile "resources\app\package.json"
  !insertmacro RequireFile "resources\app\desktop\main.cjs"
  !insertmacro RequireFile "resources\app\desktop\trust\sigstore-public-good.json"
  !insertmacro RequireFile "resources\app\dist\index.html"
  !insertmacro RequireFile "resources\app\dist-server\index.js"
  !insertmacro RequireFile "resources\app\dist-server\windows-smoke.js"
  !insertmacro RequireFile "Test Windows Control.cmd"
  !insertmacro BeginOperation "write-uninstaller"
  WriteUninstaller "$StageDir\Uninstall AGENTS.exe"
  IfErrors stage_failed
  !insertmacro BeginOperation "write-version-marker"
  FileOpen $0 "$StageDir\installed-version.txt" w
  IfErrors stage_failed
  FileWrite $0 "${APP_VERSION}$\r$\n"
  FileClose $0
  IfErrors stage_failed
  !insertmacro BeginOperation "create-versions-directory"
  System::Call 'kernel32::CreateDirectoryW(w "$INSTDIR\versions", p 0) i .r0 ?e'
  Pop $Win32Error
  ${If} $0 != 0
  ${AndIf} $OwnRecoveryRoot == "1"
    StrCpy $OwnRecoveryVersions "1"
  ${EndIf}
  ${If} $0 == 0
    ${If} $Win32Error != 183
      Goto stage_failed
    ${EndIf}
    System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\versions") i .r0 ?e'
    Pop $Win32Error
    IntOp $1 $0 & 0x410
    ; LogicLib != compares strings; IntOp emits decimal, not a hex literal.
    ${If} $1 != 16
      StrCpy $Win32Error "183"
      Goto stage_failed
    ${EndIf}
  ${EndIf}
  !insertmacro BeginOperation "release-staging-directory"
  SetOutPath "$TEMP"
  IfErrors stage_failed
  !insertmacro BeginOperation "promote-stage"
  StrCpy $Attempt "0"
promote_attempt:
  ; MoveFile never replaces an existing destination. Capture the OS error before
  ; any logging can clobber it. Retry only transient access/sharing/lock failures.
  System::Call 'kernel32::MoveFileW(w "$StageDir", w "$VersionDir") i .r0 ?e'
  Pop $Win32Error
  ${If} $0 == 0
    IntOp $Attempt $Attempt + 1
    ${If} $Attempt < 8
      ${If} $Win32Error == 5
      ${OrIf} $Win32Error == 32
      ${OrIf} $Win32Error == 33
        StrCpy $Outcome "retry"
        Call Diagnostic
        Sleep 500
        Goto promote_attempt
      ${EndIf}
    ${EndIf}
    Call PromotionDiagnostics
    Goto stage_failed
  ${EndIf}
  StrCpy $Outcome "complete"
  StrCpy $Win32Error "0"
  Call Diagnostic
  StrCpy $OwnStage "0"
  StrCpy $OwnRecoveryRoot "0"
  ; Staging is complete before any current shortcut changes. Old versions stay.
  !insertmacro BeginOperation "snapshot-activation"
  Call BackupActivation
  ${If} $RollbackReady != "1"
    Goto activation_backup_failed
  ${EndIf}
  !insertmacro BeginOperation "activate-shortcuts"
  CreateDirectory "$SMPROGRAMS\Ultimate Agents Both"
  ${If} $OldPath != ""
    CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Previous AGENTS (recovery).lnk" "$OldPath"
  ${EndIf}
  CreateShortcut "$DESKTOP\AGENTS.lnk" "$VersionDir\AGENTS.exe" "" "$VersionDir\AGENTS.exe" 0
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk" "$VersionDir\AGENTS.exe"
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Test Windows Control.lnk" "$VersionDir\Test Windows Control.cmd"
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Uninstall.lnk" "$VersionDir\Uninstall AGENTS.exe"
  IfErrors activation_failed
  !insertmacro BeginOperation "register-version"
  WriteRegStr HKCU "Software\UltimateAgentsBoth" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\UltimateAgentsBoth" "Version" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayName" "Ultimate Agents - Both"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "UninstallString" '$\"$VersionDir\Uninstall AGENTS.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayIcon" "$VersionDir\AGENTS.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "NoRepair" 1
  IfErrors activation_failed
  StrCpy $Operation "installation"
  StrCpy $Outcome "success"
  StrCpy $Win32Error "0"
  Call Diagnostic
  DetailPrint "Installed ${APP_VERSION}. Personal data and permissions were preserved. Previous application files retained."
  DetailPrint "Persistent installation log: $LogPath"
  SetErrorLevel 0
  Goto done
collision:
  StrCpy $Win32Error "183"
  StrCpy $Outcome "collision"
  Call Diagnostic
  SetErrorLevel 42
  Abort "The target version or staging directory already exists. Refusing to overwrite it; current data and files are retained."
stage_failed:
  SetDetailsPrint both
  StrCpy $FailureOperation $Operation
  StrCpy $FailureError $Win32Error
  StrCpy $Outcome "failed"
  Call Diagnostic
  Call CleanStage
  SetErrorLevel 44
  Abort "Staging failed at $FailureOperation (Windows error: $FailureError). Pre-existing files, shortcuts and personal data were not replaced. Previous payload state at startup: $PreviousState. Log: $LogPath"
activation_failed:
  StrCpy $Outcome "failed"
  Call Diagnostic
  Call RestoreActivation
  StrCpy $Operation "restore-activation"
  StrCpy $Outcome "complete"
  ${If} $RollbackFailed == "1"
    StrCpy $Outcome "incomplete"
  ${EndIf}
  Call Diagnostic
  SetErrorLevel 45
  Abort "Shortcut/registration activation failed. Previous files and personal data were retained. Log: $LogPath"
activation_backup_failed:
  StrCpy $Outcome "failed-before-activation"
  Call Diagnostic
  SetErrorLevel 45
  Abort "Could not snapshot existing shortcuts and registration. Nothing was activated. All payloads and personal data retained. Log: $LogPath"
done:
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  ReadRegStr $0 HKCU "Software\UltimateAgentsBoth" "Version"
  ${If} $0 == "${APP_VERSION}"
    Delete "$DESKTOP\AGENTS.lnk"
    Delete "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk"
    Delete "$SMPROGRAMS\Ultimate Agents Both\Test Windows Control.lnk"
    Delete "$SMPROGRAMS\Ultimate Agents Both\Uninstall.lnk"
    ; The retained recovery shortcut is intentional if an older version exists.
    RMDir "$SMPROGRAMS\Ultimate Agents Both"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth"
    DeleteRegKey HKCU "Software\UltimateAgentsBoth"
  ${EndIf}
  ; Uninstaller resides inside its immutable version directory.
  !include "${UNINSTALL_MANIFEST}"
  Delete "$INSTDIR\installed-version.txt"
  Delete "$INSTDIR\Uninstall AGENTS.exe"
  RMDir "$INSTDIR"
SectionEnd
