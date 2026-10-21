# Isolated hosted-runner installation test. Silent installation is CI-only.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This test is restricted to disposable GitHub Actions runners.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = (Resolve-Path 'artifacts/windows/Ultimate-Agents-Both-Setup.exe').Path
$root = Join-Path $env:RUNNER_TEMP ('agents-upgrade-' + [guid]::NewGuid())
$data = Join-Path $env:APPDATA 'ULTIMATE AGENTS — BOTH\agents-data'
$reg = 'HKCU:\Software\UltimateAgentsBoth'
$uninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AGENTS.lnk'
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Ultimate Agents Both'
# Check every location touched by installation or cleanup before creating fixtures.
foreach ($path in @($root,$data,$reg,$uninstall,$desktop,$menu)) {
  if (Test-Path -LiteralPath $path) { throw "Runner is not isolated; refusing to overwrite existing AGENTS state: $path" }
}
function Install-Checked([int]$Expected) {
  $log = Join-Path $env:RUNNER_TEMP ('agents-install-' + [guid]::NewGuid())
  # NSIS /D must be last; /S is used only for this isolated CI acceptance test.
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$root") -PassThru -RedirectStandardOutput "$log.out" -RedirectStandardError "$log.err"
  if (!$process.WaitForExit(120000)) { $process.Kill(); throw 'Installer exceeded 120 seconds.' }
  $process.WaitForExit()
  if ($process.ExitCode -ne $Expected) { throw "Installer exit $($process.ExitCode), expected $Expected. Logs: $log" }
}
try {
  New-Item -ItemType Directory -Path $root,$data -Force | Out-Null
  # Prior layout is an explicit fixture, not a claim of running a prior binary.
  Set-Content (Join-Path $root 'AGENTS.exe') 'retained previous-version fixture' -Encoding ascii
  Set-Content (Join-Path $root 'personal-note.txt') 'must remain unchanged' -Encoding utf8
  Set-Content (Join-Path $data 'windows-policy.json') '{"enabled":false,"apps":[]}' -Encoding utf8
  Set-Content (Join-Path $data 'memory-fixture.json') '{"private":"preserve me"}' -Encoding utf8
  Set-Content (Join-Path $data 'database-fixture.bin') 'database-byte-preservation fixture' -Encoding ascii
  $before = Get-ChildItem $data -File | ForEach-Object { @{ Path=$_.FullName; Hash=(Get-FileHash $_.FullName -Algorithm SHA256).Hash } }
  # Fail before staging against an existing target; current files must survive.
  $collision = Join-Path $root ".stage-$version"
  New-Item -ItemType Directory -Path $collision | Out-Null
  Set-Content (Join-Path $collision 'owner-file') 'do not overwrite'
  Install-Checked 42
  if ((Get-Content (Join-Path $collision 'owner-file') -Raw).Trim() -ne 'do not overwrite') { throw 'Collision path was changed.' }
  Remove-Item $collision -Recurse
  Install-Checked 0
  $versionDir = Join-Path $root "versions\$version"
  if (!(Test-Path (Join-Path $versionDir 'AGENTS.exe'))) { throw 'Installed executable missing.' }
  $installed = Get-Content (Join-Path $versionDir 'resources\app\package.json') -Raw | ConvertFrom-Json
  if ($installed.version -ne $version) { throw 'Installed application version differs.' }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($desktop)
  if ($shortcut.TargetPath -ne (Join-Path $versionDir 'AGENTS.exe')) { throw 'Desktop shortcut did not activate the new version.' }
  $recovery = $shell.CreateShortcut((Join-Path $menu 'Previous AGENTS (recovery).lnk'))
  if ($recovery.TargetPath -ne (Join-Path $root 'AGENTS.exe')) { throw 'Previous-version recovery shortcut is missing or incorrect.' }
  if ((Get-Content (Join-Path $root 'AGENTS.exe') -Raw).Trim() -ne 'retained previous-version fixture') { throw 'Previous application files changed.' }
  if (!(Test-Path (Join-Path $root 'personal-note.txt'))) { throw 'Unknown application-root files were removed.' }
  Install-Checked 43
  Set-ItemProperty $reg Version '65535.0.0'
  Install-Checked 43
  Set-ItemProperty $reg Version $version
  foreach ($item in $before) { if ((Get-FileHash $item.Path -Algorithm SHA256).Hash -ne $item.Hash) { throw 'User data or permissions changed.' } }
  # Actual Windows NTFS Internet-zone persistence, without running the marked file.
  $env:AGENTS_MOTW_TEST_PATH = Join-Path $env:RUNNER_TEMP ('agents-zone-' + [guid]::NewGuid() + '.exe')
  Copy-Item $installer $env:AGENTS_MOTW_TEST_PATH
  node -e "require('./desktop/updater.cjs').markInternetDownload(process.env.AGENTS_MOTW_TEST_PATH,require('./package.json').version).then(()=>console.log('PASS: Windows Internet-zone metadata written and verified'))"
  if ($LASTEXITCODE -ne 0) { throw 'Windows Internet-zone test failed.' }
  Write-Host 'PASS: production installer staged/activated version, rejected collision/reinstall/downgrade, preserved previous payload and personal-data fixture bytes.'
  'Real installer executed on hosted Windows with an explicit prior-layout fixture. Personal laptop installation and SmartScreen remain unverified.' | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
} finally {
  # Only this disposable runner test's files/keys/shortcuts are removed.
  foreach ($path in @($root,$data,$env:AGENTS_MOTW_TEST_PATH)) { if ($path -and (Test-Path $path)) { Remove-Item -LiteralPath $path -Recurse -Force } }
  foreach ($path in @($reg,$uninstall)) { if (Test-Path $path) { Remove-Item $path -Recurse -Force } }
  if (Test-Path $desktop) { Remove-Item $desktop }
  if (Test-Path $menu) { Remove-Item $menu -Recurse -Force }
}
