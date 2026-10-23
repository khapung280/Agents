; Exact rollback of the app-owned activation entries only. Snapshot bytes stay in
; this installer's private temporary directory/memory and never enter logs.
Var RollbackReady
Var RollbackFailed
Var RollbackAppKeyPresent
Var RollbackUninstallKeyPresent
Var RollbackAppHandle
Var RollbackUninstallHandle
Var RollbackMenuPresent

!define RollbackAppKey "Software\UltimateAgentsBoth"
!define RollbackUninstallKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth"

!macro RollbackValueVars prefix
  Var ${prefix}Present
  Var ${prefix}Type
  Var ${prefix}Size
  Var ${prefix}Data
!macroend
!insertmacro RollbackValueVars RollbackInstallDir
!insertmacro RollbackValueVars RollbackVersion
!insertmacro RollbackValueVars RollbackDisplayName
!insertmacro RollbackValueVars RollbackDisplayVersion
!insertmacro RollbackValueVars RollbackUninstallString
!insertmacro RollbackValueVars RollbackDisplayIcon
!insertmacro RollbackValueVars RollbackNoModify
!insertmacro RollbackValueVars RollbackNoRepair
Var RollbackDesktopPresent
Var RollbackMenuAppPresent
Var RollbackMenuTestPresent
Var RollbackMenuUninstallPresent
Var RollbackMenuRecoveryPresent

!macro RollbackReadValue handle name prefix
  StrCpy $${prefix}Present "0"
  StrCpy $${prefix}Data "0"
  ${If} ${handle} != 0
    System::Call 'advapi32::RegQueryValueExW(p ${handle}, w "${name}", p 0, *i .r1, p 0, *i .r2) i .r0'
    ${If} $0 == 0
      ; Bound snapshot memory independently of untrusted registry content.
      ${If} $2 > 65536
      ${OrIf} $2 < 0
        Goto rollback_backup_failed
      ${EndIf}
      StrCpy $${prefix}Type $1
      StrCpy $${prefix}Size $2
      IntOp $3 $2 + 1
      System::Alloc $3
      Pop $${prefix}Data
      ${If} $${prefix}Data == 0
        Goto rollback_backup_failed
      ${EndIf}
      System::Call 'advapi32::RegQueryValueExW(p ${handle}, w "${name}", p 0, *i .r1, p $${prefix}Data, *i r2r3) i .r0'
      ${If} $0 != 0
      ${OrIf} $1 != $${prefix}Type
      ${OrIf} $3 != $${prefix}Size
        Goto rollback_backup_failed
      ${EndIf}
      StrCpy $${prefix}Present "1"
    ${ElseIf} $0 != 2
      Goto rollback_backup_failed
    ${EndIf}
  ${EndIf}
!macroend

!macro RollbackCopyShortcut source name presence
  StrCpy ${presence} "0"
  System::Call 'kernel32::GetFileAttributesW(w "${source}") i .r0 ?e'
  Pop $1
  ${If} $0 != -1
    IntOp $2 $0 & 0x410
    ${If} $2 != 0
      Goto rollback_backup_failed
    ${EndIf}
    ClearErrors
    CopyFiles /SILENT /FILESONLY "${source}" "$PLUGINSDIR\activation\${name}.lnk"
    IfErrors rollback_backup_failed
    StrCpy ${presence} "1"
  ${ElseIf} $1 != 2
  ${AndIf} $1 != 3
    Goto rollback_backup_failed
  ${EndIf}
!macroend

Function BackupActivation
  Push $0
  Push $1
  Push $2
  Push $3
  StrCpy $RollbackReady "0"
  StrCpy $RollbackFailed "0"
  StrCpy $RollbackAppHandle "0"
  StrCpy $RollbackUninstallHandle "0"
  StrCpy $RollbackAppKeyPresent "0"
  StrCpy $RollbackUninstallKeyPresent "0"
  ClearErrors
  InitPluginsDir
  CreateDirectory "$PLUGINSDIR\activation"
  IfErrors rollback_backup_failed

  System::Call 'advapi32::RegOpenKeyExW(p 0x80000001, w "${RollbackAppKey}", i 0, i 1, *p .r1) i .r0'
  ${If} $0 == 0
    StrCpy $RollbackAppHandle $1
    StrCpy $RollbackAppKeyPresent "1"
  ${ElseIf} $0 != 2
    Goto rollback_backup_failed
  ${EndIf}
  System::Call 'advapi32::RegOpenKeyExW(p 0x80000001, w "${RollbackUninstallKey}", i 0, i 1, *p .r1) i .r0'
  ${If} $0 == 0
    StrCpy $RollbackUninstallHandle $1
    StrCpy $RollbackUninstallKeyPresent "1"
  ${ElseIf} $0 != 2
    Goto rollback_backup_failed
  ${EndIf}
  !insertmacro RollbackReadValue $RollbackAppHandle "InstallDir" RollbackInstallDir
  !insertmacro RollbackReadValue $RollbackAppHandle "Version" RollbackVersion
  !insertmacro RollbackReadValue $RollbackUninstallHandle "DisplayName" RollbackDisplayName
  !insertmacro RollbackReadValue $RollbackUninstallHandle "DisplayVersion" RollbackDisplayVersion
  !insertmacro RollbackReadValue $RollbackUninstallHandle "UninstallString" RollbackUninstallString
  !insertmacro RollbackReadValue $RollbackUninstallHandle "DisplayIcon" RollbackDisplayIcon
  !insertmacro RollbackReadValue $RollbackUninstallHandle "NoModify" RollbackNoModify
  !insertmacro RollbackReadValue $RollbackUninstallHandle "NoRepair" RollbackNoRepair

  StrCpy $RollbackMenuPresent "0"
  IfFileExists "$SMPROGRAMS\Ultimate Agents Both" 0 +2
    StrCpy $RollbackMenuPresent "1"
  !insertmacro RollbackCopyShortcut "$DESKTOP\AGENTS.lnk" "desktop" $RollbackDesktopPresent
  !insertmacro RollbackCopyShortcut "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk" "app" $RollbackMenuAppPresent
  !insertmacro RollbackCopyShortcut "$SMPROGRAMS\Ultimate Agents Both\Test Windows Control.lnk" "test" $RollbackMenuTestPresent
  !insertmacro RollbackCopyShortcut "$SMPROGRAMS\Ultimate Agents Both\Uninstall.lnk" "uninstall" $RollbackMenuUninstallPresent
  !insertmacro RollbackCopyShortcut "$SMPROGRAMS\Ultimate Agents Both\Previous AGENTS (recovery).lnk" "recovery" $RollbackMenuRecoveryPresent
  StrCpy $RollbackReady "1"
  Goto rollback_backup_done
rollback_backup_failed:
  StrCpy $RollbackFailed "1"
rollback_backup_done:
  ${If} $RollbackAppHandle != 0
    System::Call 'advapi32::RegCloseKey(p $RollbackAppHandle)'
  ${EndIf}
  ${If} $RollbackUninstallHandle != 0
    System::Call 'advapi32::RegCloseKey(p $RollbackUninstallHandle)'
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro RollbackWriteValue handle name prefix
  ${If} ${handle} != 0
    ${If} $${prefix}Present == "1"
      System::Call 'advapi32::RegSetValueExW(p ${handle}, w "${name}", i 0, i $${prefix}Type, p $${prefix}Data, i $${prefix}Size) i .r0'
    ${Else}
      System::Call 'advapi32::RegDeleteValueW(p ${handle}, w "${name}") i .r0'
      ${If} $0 == 2
        StrCpy $0 "0"
      ${EndIf}
    ${EndIf}
    ${If} $0 != 0
      StrCpy $RollbackFailed "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro RollbackRestoreShortcut target name presence
  ClearErrors
  ${If} ${presence} == "1"
    CopyFiles /SILENT /FILESONLY "$PLUGINSDIR\activation\${name}.lnk" "${target}"
  ${Else}
    System::Call 'kernel32::DeleteFileW(w "${target}") i .r0 ?e'
    Pop $1
    ${If} $0 == 0
    ${AndIf} $1 != 2
    ${AndIf} $1 != 3
      SetErrors
    ${EndIf}
  ${EndIf}
  IfErrors 0 +2
    StrCpy $RollbackFailed "1"
!macroend

Function RestoreActivation
  Push $0
  Push $1
  StrCpy $RollbackFailed "0"
  ${If} $RollbackReady != "1"
    StrCpy $RollbackFailed "1"
    Goto rollback_restore_done
  ${EndIf}
  !insertmacro RollbackRestoreShortcut "$DESKTOP\AGENTS.lnk" "desktop" $RollbackDesktopPresent
  !insertmacro RollbackRestoreShortcut "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk" "app" $RollbackMenuAppPresent
  !insertmacro RollbackRestoreShortcut "$SMPROGRAMS\Ultimate Agents Both\Test Windows Control.lnk" "test" $RollbackMenuTestPresent
  !insertmacro RollbackRestoreShortcut "$SMPROGRAMS\Ultimate Agents Both\Uninstall.lnk" "uninstall" $RollbackMenuUninstallPresent
  !insertmacro RollbackRestoreShortcut "$SMPROGRAMS\Ultimate Agents Both\Previous AGENTS (recovery).lnk" "recovery" $RollbackMenuRecoveryPresent
  ${If} $RollbackMenuPresent != "1"
    ; Never remove unknown entries created by someone else.
    IfFileExists "$SMPROGRAMS\Ultimate Agents Both" 0 rollback_menu_done
      ClearErrors
      RMDir "$SMPROGRAMS\Ultimate Agents Both"
      IfErrors 0 +2
        StrCpy $RollbackFailed "1"
rollback_menu_done:
  ${EndIf}
  StrCpy $RollbackAppHandle "0"
  StrCpy $RollbackUninstallHandle "0"
  System::Call 'advapi32::RegCreateKeyExW(p 0x80000001, w "${RollbackAppKey}", i 0, p 0, i 0, i 2, p 0, *p .r1, p 0) i .r0'
  ${If} $0 == 0
    StrCpy $RollbackAppHandle $1
  ${Else}
    StrCpy $RollbackFailed "1"
  ${EndIf}
  System::Call 'advapi32::RegCreateKeyExW(p 0x80000001, w "${RollbackUninstallKey}", i 0, p 0, i 0, i 2, p 0, *p .r1, p 0) i .r0'
  ${If} $0 == 0
    StrCpy $RollbackUninstallHandle $1
  ${Else}
    StrCpy $RollbackFailed "1"
  ${EndIf}
  !insertmacro RollbackWriteValue $RollbackAppHandle "InstallDir" RollbackInstallDir
  !insertmacro RollbackWriteValue $RollbackAppHandle "Version" RollbackVersion
  !insertmacro RollbackWriteValue $RollbackUninstallHandle "DisplayName" RollbackDisplayName
  !insertmacro RollbackWriteValue $RollbackUninstallHandle "DisplayVersion" RollbackDisplayVersion
  !insertmacro RollbackWriteValue $RollbackUninstallHandle "UninstallString" RollbackUninstallString
  !insertmacro RollbackWriteValue $RollbackUninstallHandle "DisplayIcon" RollbackDisplayIcon
  !insertmacro RollbackWriteValue $RollbackUninstallHandle "NoModify" RollbackNoModify
  !insertmacro RollbackWriteValue $RollbackUninstallHandle "NoRepair" RollbackNoRepair
  ${If} $RollbackAppHandle != 0
    System::Call 'advapi32::RegCloseKey(p $RollbackAppHandle)'
  ${EndIf}
  ${If} $RollbackUninstallHandle != 0
    System::Call 'advapi32::RegCloseKey(p $RollbackUninstallHandle)'
  ${EndIf}
  ${If} $RollbackAppKeyPresent != "1"
    ClearErrors
    DeleteRegKey /ifempty HKCU "${RollbackAppKey}"
    IfErrors 0 +2
      StrCpy $RollbackFailed "1"
  ${EndIf}
  ${If} $RollbackUninstallKeyPresent != "1"
    ClearErrors
    DeleteRegKey /ifempty HKCU "${RollbackUninstallKey}"
    IfErrors 0 +2
      StrCpy $RollbackFailed "1"
  ${EndIf}
rollback_restore_done:
  Pop $1
  Pop $0
FunctionEnd
