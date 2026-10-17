# Compilation-only CI check: no desktop input and no process launch.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Drawing, System.Windows.Forms
$references = @([System.Windows.Automation.AutomationElement].Assembly.Location, [System.Windows.Automation.ControlType].Assembly.Location, [System.Windows.Rect].Assembly.Location, [System.Drawing.Bitmap].Assembly.Location, [System.Windows.Forms.Form].Assembly.Location)
Add-Type -Path (Join-Path $PSScriptRoot 'Automation.cs') -ReferencedAssemblies $references
[Console]::WriteLine('PASS: native Windows worker compiled. No desktop actions were performed.')

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
