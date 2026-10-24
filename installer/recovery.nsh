; Observe existing payload before any installation mutation. Absence is distinct
; from denied access; neither is evidence that this installer deleted a file.
Function InspectPreviousPayload
  StrCpy $OldPath ""
  StrCpy $PreviousState "unregistered"
  StrCpy $Operation "previous-payload"
  StrCpy $InstallItem "-"
  StrCpy $Win32Error "0"
  ${If} $OldInstallDir != ""
    StrCpy $0 "$OldInstallDir\AGENTS.exe"
    ${If} $OldVersion != ""
      StrCpy $0 "$OldInstallDir\versions\$OldVersion\AGENTS.exe"
    ${EndIf}
    System::Call 'kernel32::GetFileAttributesW(w r0) i .r1 ?e'
    Pop $Win32Error
    ${If} $1 == -1
      StrCpy $PreviousState "unreadable"
      ${If} $Win32Error == 2
      ${OrIf} $Win32Error == 3
        StrCpy $PreviousState "missing"
      ${EndIf}
    ${Else}
      StrCpy $Win32Error "0"
      IntOp $1 $1 & 0x410
      StrCpy $PreviousState "unusable"
      ${If} $1 == 0
        StrCpy $PreviousState "present"
        StrCpy $OldPath $0
      ${EndIf}
    ${EndIf}
  ${EndIf}
  StrCpy $Outcome $PreviousState
  Call Diagnostic
FunctionEnd

Function SelectRecoveryRoot
  StrCpy $Operation "select-recovery-root"
  StrCpy $InstallItem "-"
  StrCpy $Outcome "rejected"
  StrCpy $Win32Error "0"
  ${If} $PreviousState != "missing"
    Goto recovery_rejected
  ${EndIf}
  ; Never merge into a second installation, even if it has no executable. This
  ; option only uses a fresh directory and never changes access/security policy.
  System::Call 'kernel32::GetFileAttributesW(w "$LOCALAPPDATA\Programs\Ultimate Agents Both") i .r0 ?e'
  Pop $Win32Error
  ${If} $0 != -1
    StrCpy $Win32Error "183"
    Goto recovery_rejected
  ${EndIf}
  ${If} $Win32Error != 2
  ${AndIf} $Win32Error != 3
    Goto recovery_rejected
  ${EndIf}
  StrCpy $RecoveryRoot "1"
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Ultimate Agents Both"
  StrCpy $Outcome "explicitly-selected"
  StrCpy $Win32Error "0"
  Call Diagnostic
  Return
recovery_rejected:
  Call Diagnostic
  SetErrorLevel 47
  Abort "Fresh-location recovery requires a missing registered executable and an absent default installation directory. No application files were changed. Log: $LogPath"
FunctionEnd

; Nonmutating observations after promotion failure. Preserve the original failure
; operation and error. Requested access is a diagnostic probe, not an ACL change;
; its result does not identify the policy or process behind a denied operation.
!macro ObserveAttributes name path
  StrCpy $Operation "${name}"
  System::Call 'kernel32::GetFileAttributesW(w "${path}") i .r0 ?e'
  Pop $Win32Error
  StrCpy $Outcome "unreadable"
  ${If} $0 != -1
    StrCpy $Outcome "attributes-$0"
    StrCpy $Win32Error "0"
  ${EndIf}
  Call Diagnostic
!macroend
!macro ObserveAccess name path access
  StrCpy $Operation "${name}"
  System::Call 'kernel32::CreateFileW(w "${path}", i ${access}, i 7, p 0, i 3, i 0x02000000, p 0) p .r0 ?e'
  Pop $Win32Error
  StrCpy $Outcome "denied-or-unavailable"
  ${If} $0 != -1
    System::Call 'kernel32::CloseHandle(p r0)'
    StrCpy $Win32Error "0"
    StrCpy $Outcome "access-granted"
  ${EndIf}
  Call Diagnostic
!macroend
Function PromotionDiagnostics
  Push $Operation
  Push $Win32Error
  Push $0
  !insertmacro ObserveAttributes "promotion-source-attributes" "$StageDir"
  !insertmacro ObserveAttributes "promotion-parent-attributes" "$INSTDIR\versions"
  !insertmacro ObserveAttributes "promotion-target-attributes" "$VersionDir"
  !insertmacro ObserveAccess "promotion-source-delete-access" "$StageDir" 0x10000
  !insertmacro ObserveAccess "promotion-parent-add-directory-access" "$INSTDIR\versions" 4
  Pop $0
  Pop $Win32Error
  Pop $Operation
FunctionEnd
