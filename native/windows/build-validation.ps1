param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$references = @([System.Windows.Forms.Form].Assembly.Location, [System.Drawing.Point].Assembly.Location)
Add-Type -Path (Join-Path $PSScriptRoot 'ValidationApp.cs') -ReferencedAssemblies $references -OutputAssembly $OutputPath -OutputType WindowsApplication
