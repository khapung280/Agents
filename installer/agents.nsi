Unicode true
!include "MUI2.nsh"
!ifndef PACKAGE_DIR
  !error "PACKAGE_DIR is required"
!endif
!ifndef UNINSTALL_MANIFEST
  !error "UNINSTALL_MANIFEST is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif
Name "Ultimate Agents - Both"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Ultimate Agents Both"
InstallDirRegKey HKCU "Software\UltimateAgentsBoth" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "AGENTS" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${PACKAGE_DIR}/*"
  WriteUninstaller "$INSTDIR\Uninstall AGENTS.exe"
  WriteRegStr HKCU "Software\UltimateAgentsBoth" "InstallDir" "$INSTDIR"
  CreateDirectory "$SMPROGRAMS\Ultimate Agents Both"
  CreateShortcut "$DESKTOP\AGENTS.lnk" "$INSTDIR\AGENTS.exe" "" "$INSTDIR\AGENTS.exe" 0
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk" "$INSTDIR\AGENTS.exe"
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Test Windows Control.lnk" "$INSTDIR\Test Windows Control.cmd"
  CreateShortcut "$SMPROGRAMS\Ultimate Agents Both\Uninstall.lnk" "$INSTDIR\Uninstall AGENTS.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayName" "Ultimate Agents - Both"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "UninstallString" '$\"$INSTDIR\Uninstall AGENTS.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "DisplayIcon" "$INSTDIR\AGENTS.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  ; Delete only known application-owned package paths, never userData or unrelated files.
  Delete "$DESKTOP\AGENTS.lnk"
  Delete "$SMPROGRAMS\Ultimate Agents Both\AGENTS.lnk"
  Delete "$SMPROGRAMS\Ultimate Agents Both\Test Windows Control.lnk"
  Delete "$SMPROGRAMS\Ultimate Agents Both\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Ultimate Agents Both"
  !include "${UNINSTALL_MANIFEST}"
  Delete "$INSTDIR\Uninstall AGENTS.exe"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth"
  DeleteRegKey HKCU "Software\UltimateAgentsBoth"
  ; Unknown files and personal runtime data are preserved.
  RMDir "$INSTDIR"
SectionEnd
