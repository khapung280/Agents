# Fixed local worker. No command text, executable arguments, or scripts accepted from requests.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Windows is required.' }
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Drawing, System.Windows.Forms
  $references = @([System.Windows.Automation.AutomationElement].Assembly.Location, [System.Windows.Automation.ControlType].Assembly.Location, [System.Windows.Rect].Assembly.Location, [System.Drawing.Bitmap].Assembly.Location, [System.Windows.Forms.Form].Assembly.Location)
  Add-Type -Path (Join-Path $PSScriptRoot 'Automation.cs') -ReferencedAssemblies $references
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $command = $request.command
  $exe = [IO.Path]::GetFullPath([string]$request.executable)
  if (-not [IO.File]::Exists($exe)) { throw 'Authorized executable does not exist.' }
  [AgentsDesktop.Native]::CheckDesktop()
  $windowId = 0L
  if ($command.kind -eq 'launch') {
    # No arguments, shell resolution, URI activation, or automatic elevation.
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $exe
    $start.UseShellExecute = $false
    # The worker process override must not propagate to the launched application.
    $start.EnvironmentVariables.Remove('PSExecutionPolicyPreference')
    $process = [Diagnostics.Process]::Start($start)
    if (-not $process) { throw 'Application did not start.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
      Start-Sleep -Milliseconds 100
      $process.Refresh()
      if ($process.HasExited) { throw 'Launched process exited or handed off to another process. Observe the application manually before continuing.' }
      $windowId = $process.MainWindowHandle.ToInt64()
    } while ($windowId -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    if ($windowId -eq 0) { throw 'No window appeared for the launched process.' }
  } elseif ($command.kind -eq 'observe') {
    if ($command.windowId) { $windowId = [long]::Parse($command.windowId) }
    else { $windowId = [AgentsDesktop.Native]::FindWindow($exe) }
  } elseif ($command.kind -eq 'act') {
    if (-not $request.before) { throw 'An observation is required.' }
    $windowId = [long]::Parse($request.before.windowId)
  } else { throw 'Unsupported Windows command.' }
  $window = [AgentsDesktop.Native]::Observe($windowId, $exe)
  $verification = 'Observed the authorized application window and captured a masked window image.'
  if ($command.kind -eq 'act') {
    $before = $request.before
    if ($window.processId -ne $before.processId -or $window.processStartedAt -ne $before.processStartedAt) { throw 'Process identity changed; observe again.' }
    foreach ($property in @('x','y','width','height')) {
      if ([Math]::Abs($window.bounds.$property - $before.bounds.$property) -gt 1) { throw 'Window moved or resized; observe again.' }
    }
    $action = $command.action
    $target = $null
    if ($action.kind -ne 'focus') {
      $oldTarget = @($before.elements | Where-Object { $_.id -eq $action.elementId })
      $target = @($window.elements | Where-Object { $_.id -eq $action.elementId })
      if ($oldTarget.Count -ne 1 -or $target.Count -ne 1) { throw 'Element is stale or ambiguous; observe again.' }
      $oldTarget = $oldTarget[0]; $target = $target[0]
      if ($target.password -or -not $target.enabled -or $target.name -ne $oldTarget.name -or $target.controlType -ne $oldTarget.controlType -or $target.value -ne $oldTarget.value) { throw 'Element content or permissions changed; observe again.' }
      foreach ($property in @('x','y','width','height')) {
        if ([Math]::Abs($target.bounds.$property - $oldTarget.bounds.$property) -gt 1) { throw 'Element moved; observe again.' }
      }
    }
    [AgentsDesktop.Native]::Act($windowId, $exe, [string]$action.kind, [string]$action.elementId, [string]$action.text, [string]$action.key)
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    $ok = $false
    do {
      Start-Sleep -Milliseconds 100
      $window = [AgentsDesktop.Native]::Observe($windowId, $exe)
      if ($action.kind -eq 'focus') { $ok = $window.foreground }
      elseif ($action.kind -eq 'move') { $ok = [AgentsDesktop.Native]::CursorOnElement($windowId, [string]$action.elementId) }
      elseif ($action.kind -eq 'setText') {
        $afterTarget = @($window.elements | Where-Object { $_.id -eq $action.elementId -and -not $_.password })
        $ok = $afterTarget.Count -eq 1 -and $afterTarget[0].value -ceq [string]$action.text
      } else {
        if (-not $command.expect) { throw 'Postcondition is required.' }
        $expected = @($window.elements | Where-Object { $_.id -eq $command.expect.elementId -and -not $_.password })
        if ($expected.Count -eq 1) {
          $property = [string]$command.expect.property
          if (@('name','value','focused') -notcontains $property) { throw 'Invalid postcondition property.' }
          $actual = [string]$expected[0].$property
          if ($property -eq 'focused') { $actual = $actual.ToLowerInvariant() }
          $ok = $actual -ceq [string]$command.expect.equals
        }
      }
    } while (-not $ok -and [DateTime]::UtcNow -lt $deadline)
    if (-not $ok) { throw 'Input dispatched, but its postcondition was not verified. Do not repeat blindly; observe again.' }
    $verification = "Windows $($action.kind) dispatched once; postcondition independently observed through UI Automation/Win32."
  } elseif ($command.kind -eq 'launch') {
    $verification = 'Started the exact allowlisted executable without arguments and verified its process and visible window.'
  }
  $png = [AgentsDesktop.Native]::Capture($windowId, $exe)
  @{ window = $window; png = $png; verified = $verification } | ConvertTo-Json -Depth 12 -Compress | ForEach-Object { [Console]::Out.Write($_) }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
