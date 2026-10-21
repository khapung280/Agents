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
!define MUI_ABORTWARNING
!define MUI_CUSTOMFUNCTION_ABORT CleanStage
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  SetShellVarContext current
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\UltimateAgentsBothInstaller") p .r0 ?e'
  Pop $1
  StrCpy $MutexHandle $0
  ${If} $1 = 183
    SetErrorLevel 41
    Abort "Another AGENTS installer is running."
  ${EndIf}
  ReadRegStr $OldVersion HKCU "Software\UltimateAgentsBoth" "Version"
  ${If} $OldVersion != ""
    ${VersionCompare} "${APP_VERSION}" "$OldVersion" $0
    ${If} $0 != 1
      SetErrorLevel 43
      Abort "This version is already installed or older than the registered version. No files were changed."
    ${EndIf}
  ${EndIf}
FunctionEnd

Function CleanStage
  ${If} $OwnStage == "1"
    Push $INSTDIR
    StrCpy $INSTDIR $StageDir
    ; Only this build's own staged files, never user data or arbitrary directories.
    !include "${UNINSTALL_MANIFEST}"
    Delete "$INSTDIR\Uninstall AGENTS.exe"
    Delete "$INSTDIR\installed-version.txt"
    RMDir "$INSTDIR"
    Pop $INSTDIR
    StrCpy $OwnStage "0"
  ${EndIf}
FunctionEnd
Function .onInstFailed
  Call CleanStage
FunctionEnd

Section "AGENTS" SEC_MAIN
  SetShellVarContext current
  StrCpy $VersionDir "$INSTDIR\versions\${APP_VERSION}"
  StrCpy $StageDir "$INSTDIR\.stage-${APP_VERSION}"
  IfFileExists "$VersionDir\*.*" collision
  IfFileExists "$StageDir\*.*" collision
  StrCpy $OldPath ""
  ${If} $OldVersion != ""
    StrCpy $OldPath "$INSTDIR\versions\$OldVersion\AGENTS.exe"
  ${Else}
    IfFileExists "$INSTDIR\AGENTS.exe" 0 +2
      StrCpy $OldPath "$INSTDIR\AGENTS.exe"
  ${EndIf}
  ClearErrors
  CreateDirectory "$StageDir"
  IfErrors stage_failed
  StrCpy $OwnStage "1"
  SetOutPath "$StageDir"
  File /r "${PACKAGE_DIR}\*"
  IfErrors stage_failed
  WriteUninstaller "$StageDir\Uninstall AGENTS.exe"
  FileOpen $0 "$StageDir\installed-version.txt" w
  FileWrite $0 "${APP_VERSION}$\r$\n"
  FileClose $0
  IfErrors stage_failed
  CreateDirectory "$INSTDIR\versions"
  SetOutPath "$INSTDIR"
  Rename "$StageDir" "$VersionDir"
  IfErrors stage_failed
  StrCpy $OwnStage "0"
  ; Staging is complete before any current shortcut changes. Old versions stay.
  ClearErrors
  CreateDirectory "$SMPROGRAMS\Ultimate Agents Both"
  ${If} $OldPath != ""
    CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Previous AGENTS (recovery).lnk" "$OldPath"
  ${EndIf}
  CreateShortcut "$DESKTOP\AGENTS.lnk" "$VersionDir\AGENTS.exe" "" "$VersionDir\AGENTS.exe" 0
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk" "$VersionDir\AGENTS.exe"
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Test Windows Control.lnk" "$VersionDir\Test Windows Control.cmd"
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Uninstall.lnk" "$VersionDir\Uninstall AGENTS.exe"
  IfErrors activation_failed
  WriteRegStr HKCU "Software\UltimateAgentsBoth" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\UltimateAgentsBoth" "Version" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayName" "Ultimate Agents - Both"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "UninstallString" '$\"$VersionDir\Uninstall AGENTS.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayIcon" "$VersionDir\AGENTS.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "NoRepair" 1
  IfErrors activation_failed
  DetailPrint "Installed ${APP_VERSION}. Personal data and permissions were preserved. Previous application files retained."
  SetErrorLevel 0
  Goto done
collision:
  SetErrorLevel 42
  Abort "The target version or staging directory already exists. Refusing to overwrite it; current data and files are retained."
stage_failed:
  Call CleanStage
  SetErrorLevel 44
  Abort "Staging failed. The previous version, shortcuts and personal data were retained."
activation_failed:
  ; Best-effort shortcut recovery; never remove the previous payload or user data.
  ${If} $OldPath != ""
    CreateShortcut "$DESKTOP\AGENTS.lnk" "$OldPath"
    CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk" "$OldPath"
  ${EndIf}
  WriteRegStr HKCU "Software\UltimateAgentsBoth" "Version" "$OldVersion"
  SetErrorLevel 45
  Abort "Shortcut/registration activation failed. Previous files and personal data were retained; review the installer log before retrying."
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
