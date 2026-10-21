# Compilation-only CI check: no desktop input and no process launch.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Drawing, System.Windows.Forms
$references = @([System.Windows.Automation.AutomationElement].Assembly.Location, [System.Windows.Automation.ControlType].Assembly.Location, [System.Windows.Rect].Assembly.Location, [System.Drawing.Bitmap].Assembly.Location, [System.Windows.Forms.Form].Assembly.Location)
Add-Type -Path (Join-Path $PSScriptRoot 'Automation.cs') -ReferencedAssemblies $references
[Console]::WriteLine('PASS: native Windows worker compiled. No desktop actions were performed.')

# Pure fixtures call the same selection/validation methods used by the worker.
# They do not enumerate real windows, launch Notepad, capture a screen or send input.
function Assert-Rejected([scriptblock]$Operation, [string]$Reason) {
  $rejected = $false
  try { & $Operation } catch {
    if ($_.Exception.ToString() -notmatch $Reason) { throw }
    $rejected = $true
  }
  if (-not $rejected) { throw "Expected rejection: $Reason" }
}
$documentName = 'agents-12345678-1234-4234-8234-123456789abc.txt'
foreach ($title in @($documentName, "$documentName - Notepad", "*$documentName - Notepad")) {
  if (-not [AgentsDesktop.Native]::TestDocumentTitle($title, $documentName)) { throw 'Exact document title was rejected.' }
}
foreach ($title in @("other $documentName - Notepad", "$documentName - Notepad - personal", 'Personal - Notepad')) {
  if ([AgentsDesktop.Native]::TestDocumentTitle($title, $documentName)) { throw 'Unrelated document title was accepted.' }
}
if ([AgentsDesktop.Native]::SelectNewDocumentHandle([long[]]@(), [long[]]@(1, 2)) -ne 0) { throw 'Missing editor must remain pending.' }
if ([AgentsDesktop.Native]::SelectNewDocumentHandle([long[]]@(3), [long[]]@(1, 2)) -ne 3) { throw 'New editor selection failed.' }
Assert-Rejected { [AgentsDesktop.Native]::SelectNewDocumentHandle([long[]]@(1), [long[]]@(1, 2)) } 'reused an existing window'
Assert-Rejected { [AgentsDesktop.Native]::SelectNewDocumentHandle([long[]]@(1, 3), [long[]]@(1, 2)) } 'reused an existing window'
Assert-Rejected { [AgentsDesktop.Native]::SelectNewDocumentHandle([long[]]@(3, 4), [long[]]@(1, 2)) } 'ambiguous handoff'
Assert-Rejected { [AgentsDesktop.Native]::SelectNewDocumentHandle([long[]]@(0), [long[]]@()) } 'Invalid registered'
$editor = New-Object AgentsDesktop.Element
$editor.controlType = 'ControlType.Document'; $editor.enabled = $true; $editor.value = ''
$tab = New-Object AgentsDesktop.Element
$tab.controlType = 'ControlType.TabItem'; $tab.name = $documentName
$window = New-Object AgentsDesktop.Window
$window.title = "$documentName - Notepad"; $window.elements = @($editor, $tab)
[AgentsDesktop.Native]::ValidateIsolatedEditor($window, $documentName, '')
$editor.value = 'personal text'
Assert-Rejected { [AgentsDesktop.Native]::ValidateIsolatedEditor($window, $documentName, '') } 'contents changed'
$editor.value = ''; $tab.name = 'Personal.txt'
Assert-Rejected { [AgentsDesktop.Native]::ValidateIsolatedEditor($window, $documentName, '') } 'personal or unidentified'
$tab.name = $documentName; $window.elements = @($editor, $tab, $tab)
Assert-Rejected { [AgentsDesktop.Native]::ValidateIsolatedEditor($window, $documentName, '') } 'one isolated'
$window.elements = @($editor, $editor)
Assert-Rejected { [AgentsDesktop.Native]::ValidateIsolatedEditor($window, $documentName, '') } 'one isolated'
$window.elements = @($editor); $editor.password = $true
Assert-Rejected { [AgentsDesktop.Native]::ValidateIsolatedEditor($window, $documentName, '') } 'one isolated'
[Console]::WriteLine('PASS: native Notepad title, new-window selection and isolated-editor fixtures. No real Windows control was tested.')

# Parse the actual worker and compile the disposable fixture without launching it.
foreach ($name in @('worker.ps1', 'build-validation.ps1')) {
  $tokens = $null; $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name), [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
}
$fixtureDirectory = Join-Path ([IO.Path]::GetTempPath()) ('agents-compile-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixtureDirectory)
try {
  & (Join-Path $PSScriptRoot 'build-validation.ps1') -OutputPath (Join-Path $fixtureDirectory 'AgentsValidation.exe')
  [Console]::WriteLine('PASS: validation fixture compiled and worker scripts parsed. No desktop actions were performed.')
} finally { [IO.Directory]::Delete($fixtureDirectory, $true) }
