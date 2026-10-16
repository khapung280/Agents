# Compilation-only CI check: no desktop input and no process launch.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Drawing, System.Windows.Forms
$references = @([System.Windows.Automation.AutomationElement].Assembly.Location, [System.Windows.Automation.ControlType].Assembly.Location, [System.Windows.Rect].Assembly.Location, [System.Drawing.Bitmap].Assembly.Location, [System.Windows.Forms.Form].Assembly.Location)
Add-Type -Path (Join-Path $PSScriptRoot 'Automation.cs') -ReferencedAssemblies $references
[Console]::WriteLine('PASS: native Windows worker compiled. No desktop actions were performed.')
