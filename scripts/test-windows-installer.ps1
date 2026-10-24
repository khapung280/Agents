# Real installers, isolated Windows runner, no desktop input. /S is CI-only.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Restricted to disposable GitHub Actions runners.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = (Resolve-Path 'artifacts/windows/Ultimate-Agents-Both-Setup.exe').Path
$testRoot = Join-Path $env:RUNNER_TEMP ('agents-upgrade-' + [guid]::NewGuid())
$root = Join-Path $testRoot 'Upgrade With Spaces\Ultimate Agents Both'
$brokenRoot = Join-Path $testRoot 'Broken Installation With Spaces\Ultimate Agents Both'
$defaultRoot = Join-Path $env:LOCALAPPDATA 'Programs\Ultimate Agents Both'
$recoveryAttempted = $false
$data = Join-Path $env:APPDATA 'ULTIMATE AGENTS — BOTH\agents-data'
$logDir = Join-Path $env:LOCALAPPDATA 'UltimateAgentsBoth\InstallerLogs'
$diagnostics = Join-Path $pwd 'artifacts/installer-diagnostics'
$reg = 'HKCU:\Software\UltimateAgentsBoth'
$uninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\UltimateAgentsBoth'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AGENTS.lnk'
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Ultimate Agents Both'
foreach ($path in @($testRoot,$defaultRoot,$data,$logDir,$reg,$uninstall,$desktop,$menu)) {
  if (Test-Path -LiteralPath $path) { throw 'Runner has existing AGENTS state; refusing to modify it.' }
}
$results = [Collections.Generic.List[string]]::new()
function Pass([string]$name) { $results.Add($name); Write-Host "PASS: $name" }
function Snapshot([string[]]$Paths) {
  $snapshot = @{}
  foreach ($path in $Paths) {
    if (!(Test-Path -LiteralPath $path)) { $snapshot[$path] = 'absent'; continue }
    if (Test-Path -LiteralPath $path -PathType Leaf) { $snapshot[$path] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash; continue }
    foreach ($file in Get-ChildItem -LiteralPath $path -Recurse -File -Force) { $snapshot[$file.FullName] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
  }
  return ($snapshot.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "`n"
}
function RegistrySnapshot {
  $values = @()
  foreach ($path in @($reg,$uninstall)) {
    if (!(Test-Path $path)) { $values += "$path=absent"; continue }
    $key = Get-Item $path
    foreach ($name in ($key.GetValueNames() | Sort-Object)) { $values += "$path/$name/$($key.GetValueKind($name))=$($key.GetValue($name))" }
  }
  return $values -join "`n"
}
function Read-NewLog([string[]]$Before) {
  $files = @(Get-ChildItem $logDir -File | Where-Object { $_.FullName -notin $Before })
  if ($files.Count -ne 1) { throw 'Expected exactly one persistent log per candidate installer run.' }
  $text = Get-Content -LiteralPath $files[0].FullName -Raw
  if ($text -notmatch '^version=[^\r\n]+ operation=initialize ' -or [regex]::Matches($text,'(?m)^version=').Count -lt 2) {
    throw 'Persistent installer log lost earlier operations instead of appending.'
  }
  foreach ($private in @($root,$brokenRoot,$defaultRoot,$data,$env:USERPROFILE,'private-memory-fixture','sample-sensitive-value')) {
    if ($private -and $text.Contains($private)) { throw 'Installer log exposed private fixture data or an absolute path.' }
  }
  return $text
}
function Install-Checked([string]$Exe,[int]$Expected,[string]$Fault = '',[string]$TargetRoot = $root,[switch]$RecoverToUser) {
  $beforeLogs = @(Get-ChildItem $logDir -File -ErrorAction SilentlyContinue | ForEach-Object FullName)
  $handle = [IntPtr]::Zero
  if ($Fault -eq 'activation-lock') {
    $handle = [AgentsInstallerLock]::OpenShortcut((Join-Path $menu 'Test Windows Control.lnk'))
    if ($handle -eq [IntPtr]::new(-1)) { throw 'Could not acquire isolated shortcut lock.' }
  }
  # NSIS /D must be last, with no extra quoting around the directory value.
  $arguments = @('/S')
  if ($RecoverToUser) { $arguments += '/RECOVERTOUSER' }
  $arguments += "/D=$TargetRoot"
  $process = Start-Process -FilePath $Exe -ArgumentList $arguments -PassThru
  $clock = [Diagnostics.Stopwatch]::StartNew()
  try {
    if ($Fault -in @('persistent-lock','transient-lock','original-lock')) {
      $stageVersion = if ($Fault -eq 'original-lock') { '0.2.0' } else { $version }
      $stage = Join-Path $TargetRoot ".stage-$stageVersion"
      while (!$process.HasExited -and $clock.Elapsed.TotalSeconds -lt 45) {
        if (Test-Path -LiteralPath $stage -PathType Container) {
          $handle = [AgentsInstallerLock]::Open($stage)
          if ($handle -ne [IntPtr]::new(-1)) { break }
          $handle = [IntPtr]::Zero
        }
        Start-Sleep -Milliseconds 10
      }
      if ($handle -eq [IntPtr]::Zero) { throw 'Could not synchronize isolated staging lock.' }
      if ($Fault -eq 'persistent-lock') {
        Set-Content (Join-Path $stage 'unknown-owner-file.txt') 'retain this unknown fixture' -Encoding ascii
      } elseif ($Fault -eq 'transient-lock') {
        $sawRetry = $false
        while (!$process.HasExited -and $clock.Elapsed.TotalSeconds -lt 100) {
          foreach ($file in @(Get-ChildItem $logDir -File | Where-Object { $_.FullName -notin $beforeLogs })) {
            if ((Get-Content $file.FullName -Raw) -match 'operation=promote-stage .*outcome=retry win32=(5|32|33)') { $sawRetry = $true; break }
          }
          if ($sawRetry) { break }
          Start-Sleep -Milliseconds 25
        }
        if (!$sawRetry) { throw 'Transient-lock test did not observe a real Windows sharing failure.' }
        [AgentsInstallerLock]::Close($handle); $handle = [IntPtr]::Zero
      }
    }
    $remaining = [Math]::Max(1,180000 - [int]$clock.ElapsedMilliseconds)
    if (!$process.WaitForExit($remaining)) { $process.Kill(); throw 'Installer exceeded its 180-second CI bound.' }
    $process.WaitForExit()
    if ($Exe -eq $installer) {
      $script:lastLog = Read-NewLog $beforeLogs
      if ($process.ExitCode -ne $Expected) { Write-Host $script:lastLog; throw "Candidate installer exit $($process.ExitCode), expected $Expected." }
    } elseif ($process.ExitCode -ne $Expected) { throw "Pinned previous installer exit $($process.ExitCode), expected $Expected." }
  } finally {
    if ($handle -ne [IntPtr]::Zero) { [AgentsInstallerLock]::Close($handle) }
    if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }
  }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AgentsInstallerLock {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  // Access=0 opens only metadata and does not enforce the desired sharing lock.
  public static IntPtr Open(string path) { return CreateFileW(path, 0x80000000, 3, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero); }
  public static IntPtr OpenShortcut(string path) { return CreateFileW(path, 0x80000000, 1, IntPtr.Zero, 3, 0, IntPtr.Zero); }
  public static void Close(IntPtr handle) { CloseHandle(handle); }
}
'@
try {
  New-Item -ItemType Directory -Path $testRoot,$data,$diagnostics -Force | Out-Null
  $previous = Join-Path $testRoot 'previous-release'
  New-Item -ItemType Directory -Path $previous | Out-Null
  foreach ($name in @('Ultimate-Agents-Both-Setup.exe','agents-update.json','agents-update.sigstore.json')) {
    & "$env:SystemRoot\System32\curl.exe" --fail --location --silent --show-error --max-time 180 --retry 2 --output (Join-Path $previous $name) "https://github.com/khapung280/Agents/releases/download/v0.2.0/$name"
    if ($LASTEXITCODE -ne 0) { throw 'Could not download pinned previous release.' }
  }
  $oldInstaller = Join-Path $previous 'Ultimate-Agents-Both-Setup.exe'
  if ((Get-FileHash $oldInstaller -Algorithm SHA256).Hash -ne '3005B62F3B03AE30FA6C9AC2ECA8AAD911002E8F96EAC17E2FA22E66049DA4A0') { throw 'Previous installer checksum differs from approved v0.2.0.' }
  $env:AGENTS_PREVIOUS_RELEASE = $previous
  node -e 'const fs=require("node:fs"),p=require("node:path"),d=process.env.AGENTS_PREVIOUS_RELEASE,m=require("./desktop/update-trust.cjs").verifyRelease(fs.readFileSync(p.join(d,"agents-update.json")),fs.readFileSync(p.join(d,"agents-update.sigstore.json")),{currentVersion:"0.2.0"});if(m.sourceCommit!=="2b73836b0a855b3299b56aafd5b770224835a9de"||m.installer.sha256!=="3005b62f3b03ae30fa6c9ac2eca8aad911002e8f96eac17e2fa22e66049da4a0")throw Error("Previous provenance mismatch");'
  if ($LASTEXITCODE -ne 0) { throw 'Previous release publisher/provenance verification failed.' }
  # Reproduce v0.2.0's generic failure with a real directory handle. The old
  # flat file/InstallDir registry are explicitly a layout fixture, not a prior app.
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  New-Item -Path $reg -Force | Out-Null
  Set-ItemProperty $reg InstallDir $root
  Set-Content (Join-Path $root 'AGENTS.exe') 'retained flat-layout fixture' -Encoding ascii
  $legacyBefore = Snapshot @((Join-Path $root 'AGENTS.exe'),$data,$desktop,$menu)
  $legacyRegistry = RegistrySnapshot
  Install-Checked $oldInstaller 44 'original-lock'
  if ((Snapshot @((Join-Path $root 'AGENTS.exe'),$data,$desktop,$menu)) -ne $legacyBefore -or (RegistrySnapshot) -ne $legacyRegistry) { throw 'Original failing installer changed protected fixture state.' }
  $originalStage = Join-Path $root '.stage-0.2.0'
  if (Test-Path $originalStage) { Remove-Item -LiteralPath $originalStage -Recurse -Force }
  Pass 'Published v0.2.0 generic staging failure reproduced with an injected directory lock; legacy-layout fixture retained'
  Install-Checked $oldInstaller 0
  Pass 'Actual authenticated v0.2.0 installed at a path containing spaces'
  $oldDir = Join-Path $root 'versions\0.2.0'
  if (!(Test-Path (Join-Path $oldDir 'AGENTS.exe'))) { throw 'Previous installation payload missing.' }
  Set-Content (Join-Path $root 'personal-note.txt') 'sample-sensitive-value' -Encoding utf8
  Set-Content (Join-Path $data 'windows-policy.json') '{"enabled":false,"apps":[]}' -Encoding utf8
  Set-Content (Join-Path $data 'memory-fixture.json') '{"private":"private-memory-fixture"}' -Encoding utf8
  Set-Content (Join-Path $data 'database-fixture.bin') 'database-byte-preservation fixture' -Encoding ascii
  $protected = @($oldDir,$data,(Join-Path $root 'personal-note.txt'),$desktop,$menu)
  $before = Snapshot $protected
  $dataBefore = Snapshot @($oldDir,$data,(Join-Path $root 'personal-note.txt'))
  $regBefore = RegistrySnapshot
  function Assert-Preserved {
    if ((Snapshot $protected) -ne $before -or (RegistrySnapshot) -ne $regBefore) { throw 'Previous payload, shortcuts, registry, user data or permissions changed after failed upgrade.' }
  }
  $stage = Join-Path $root ".stage-$version"
  Set-Content $stage 'owned by someone else'
  Install-Checked $installer 42
  if ((Get-Content $stage -Raw).Trim() -ne 'owned by someone else') { throw 'Collision file was modified.' }
  Assert-Preserved
  Remove-Item -LiteralPath $stage
  Pass 'Preexisting staging file rejected without changing prior installation'
  $acl = Get-Acl -LiteralPath $root
  $denied = Get-Acl -LiteralPath $root
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity,[Security.AccessControl.FileSystemRights]::CreateDirectories,[Security.AccessControl.AccessControlType]::Deny)
  $denied.AddAccessRule($rule)
  try {
    Set-Acl -LiteralPath $root -AclObject $denied
    Install-Checked $installer 44
    if ($script:lastLog -notmatch 'operation=create-stage .*outcome=failed win32=5') { throw 'Stage permission failure lacks exact Windows error.' }
  } finally { Set-Acl -LiteralPath $root -AclObject $acl }
  Assert-Preserved
  Pass 'Permission-denied staging reports Windows error 5 and preserves previous state'
  Install-Checked $installer 44 'persistent-lock'
  if ($script:lastLog -notmatch 'operation=promote-stage .*outcome=failed win32=(5|32|33)') { throw 'Promotion lock lacks precise Windows diagnostic.' }
  if ([regex]::Matches($script:lastLog,'operation=promote-stage .*outcome=retry').Count -ne 7) { throw 'Promotion retries are not bounded to seven.' }
  if (!(Test-Path (Join-Path $stage 'unknown-owner-file.txt'))) { throw 'Cleanup removed unknown staging file.' }
  Assert-Preserved
  Remove-Item -LiteralPath $stage -Recurse -Force # owned isolated fixture only
  Pass 'Persistent directory lock fails within a bound and preserves previous state and unknown files'
  Install-Checked $installer 45 'activation-lock'
  if ($script:lastLog -notmatch 'operation=activate-shortcuts .*outcome=failed') { throw 'Injected shortcut failure did not reach activation.' }
  Assert-Preserved
  # Retained candidate payload belongs to this disposable test, not a user install.
  Remove-Item -LiteralPath (Join-Path $root "versions\$version") -Recurse -Force
  Pass 'Activation failure restores exact previous shortcut bytes and registry values'
  Install-Checked $installer 0 'transient-lock'
  if ($script:lastLog -notmatch 'operation=installation .*outcome=success') { throw 'Successful upgrade receipt missing.' }
  $versionDir = Join-Path $root "versions\$version"
  $installed = Get-Content (Join-Path $versionDir 'resources\app\package.json') -Raw | ConvertFrom-Json
  if ($installed.version -ne $version) { throw 'Installed application version differs.' }
  $payload = (Resolve-Path 'artifacts/windows/AGENTS').Path
  foreach ($file in Get-ChildItem -LiteralPath $payload -Recurse -File -Force) {
    $relative = [IO.Path]::GetRelativePath($payload,$file.FullName)
    if ((Get-FileHash -LiteralPath (Join-Path $versionDir $relative) -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) { throw 'Installed payload differs from verified package.' }
  }
  $shell = New-Object -ComObject WScript.Shell
  if ($shell.CreateShortcut($desktop).TargetPath -ne (Join-Path $versionDir 'AGENTS.exe')) { throw 'Desktop shortcut did not activate new version.' }
  if ($shell.CreateShortcut((Join-Path $menu 'Previous AGENTS (recovery).lnk')).TargetPath -ne (Join-Path $oldDir 'AGENTS.exe')) { throw 'Recovery shortcut does not point to actual previous installation.' }
  if ((Snapshot @($oldDir,$data,(Join-Path $root 'personal-note.txt'))) -ne $dataBefore) { throw 'Successful upgrade changed retained payload or personal data.' }
  Pass 'Actual v0.2.0 upgrade recovers from transient lock; every packaged file and recovery target verified'
  Install-Checked $installer 43
  Install-Checked $oldInstaller 43
  Pass 'Same-version reinstall and downgrade rejected'

  # Recovery is an explicit new-location operation, not a way to bypass the
  # version floor or move an intact installation. Register the genuine retained
  # older payload so this refusal is tested independently of the version floor.
  Set-ItemProperty $reg Version '0.2.0'
  $validRecoveryBefore = Snapshot @($root,$data,$desktop,$menu)
  $validRecoveryRegistry = RegistrySnapshot
  Install-Checked $installer 47 -RecoverToUser
  if ((Snapshot @($root,$data,$desktop,$menu)) -ne $validRecoveryBefore -or (RegistrySnapshot) -ne $validRecoveryRegistry -or (Test-Path -LiteralPath $defaultRoot)) {
    throw 'Recovery request changed an intact registered installation.'
  }
  Pass 'Explicit recovery refuses an existing previous executable without changing files or registration'

  # Reproduce the observed broken state, not an unproven history of how it arose:
  # an existing root with spaces, empty versions, no old executable and a stale
  # shortcut. These are disposable layout/data fixtures, not a working old app.
  $brokenVersions = Join-Path $brokenRoot 'versions'
  New-Item -ItemType Directory -Path $brokenVersions,(Join-Path $brokenRoot 'unknown-owner-directory') -Force | Out-Null
  Set-Content (Join-Path $brokenRoot 'personal-settings.json') '{"preserve":"sample-sensitive-value"}' -Encoding utf8
  Set-Content (Join-Path $brokenRoot 'unknown-owner-directory\keep.txt') 'retain this owner file' -Encoding ascii
  Set-Content (Join-Path $data 'approvals-fixture.json') '{"approvedActions":[],"screenCapture":false}' -Encoding utf8
  Set-ItemProperty $reg InstallDir $brokenRoot
  Set-ItemProperty $reg Version '0.2.1'
  Set-ItemProperty $reg UnknownOwnerValue 'retain this registration value'
  Set-ItemProperty $uninstall DisplayVersion '0.2.1'
  Set-ItemProperty $uninstall DisplayIcon (Join-Path $brokenRoot 'AGENTS.exe')
  Set-ItemProperty $uninstall UninstallString ('"' + (Join-Path $brokenRoot 'Uninstall AGENTS.exe') + '"')
  foreach ($shortcutPath in @($desktop,(Join-Path $menu 'AGENTS.lnk'))) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $brokenRoot 'AGENTS.exe'
    $shortcut.Save()
  }
  $staleTest = $shell.CreateShortcut((Join-Path $menu 'Test Windows Control.lnk'))
  $staleTest.TargetPath = Join-Path $brokenRoot 'Test Windows Control.cmd'
  $staleTest.Save()
  $staleUninstall = $shell.CreateShortcut((Join-Path $menu 'Uninstall.lnk'))
  $staleUninstall.TargetPath = Join-Path $brokenRoot 'Uninstall AGENTS.exe'
  $staleUninstall.Save()
  $previousShortcut = Join-Path $menu 'Previous AGENTS (recovery).lnk'
  Remove-Item -LiteralPath $previousShortcut
  if ((Test-Path (Join-Path $brokenRoot 'AGENTS.exe')) -or @(Get-ChildItem -LiteralPath $brokenVersions -Force).Count -ne 0) {
    throw 'Broken-install fixture does not match the missing-executable and empty-versions observations.'
  }
  $brokenBefore = Snapshot @($brokenRoot,$data,$desktop,$menu)
  $brokenRegistryBefore = RegistrySnapshot
  $brokenDataBefore = Snapshot @($brokenRoot,$data)
  $versionsAcl = Get-Acl -LiteralPath $brokenVersions
  $deniedVersionsAcl = Get-Acl -LiteralPath $brokenVersions
  $denyDestinationCreate = [Security.AccessControl.FileSystemAccessRule]::new($identity,[Security.AccessControl.FileSystemRights]::CreateDirectories,[Security.AccessControl.AccessControlType]::Deny)
  $deniedVersionsAcl.AddAccessRule($denyDestinationCreate)
  try {
    # This ACL exists only in the disposable CI fixture. It shows that creating
    # a root child can succeed while moving a directory into versions fails.
    # The production installer neither writes ACLs nor treats this as proof of
    # the laptop's underlying access-denied cause.
    Set-Acl -LiteralPath $brokenVersions -AclObject $deniedVersionsAcl
    $mkdirProof = Join-Path $brokenRoot 'root-mkdir-proof'
    New-Item -ItemType Directory -Path $mkdirProof | Out-Null
    Remove-Item -LiteralPath $mkdirProof
    $deniedSddl = (Get-Acl -LiteralPath $brokenVersions).Sddl
    Install-Checked $installer 44 -TargetRoot $brokenRoot
    if ($script:lastLog -notmatch 'operation=previous-payload .*outcome=missing' -or $script:lastLog -notmatch 'operation=promote-stage .*outcome=failed win32=5') {
      throw 'Broken-install promotion denial lacks the missing-payload and exact access-denied diagnostics.'
    }
    if ([regex]::Matches($script:lastLog,'operation=promote-stage .*outcome=retry').Count -ne 7) {
      throw 'Broken-install promotion denial did not stop after seven retries.'
    }
    if ($script:lastLog -notmatch 'operation=promotion-parent-add-directory-access .*outcome=denied-or-unavailable win32=5' -or $script:lastLog -notmatch 'operation=promotion-source-attributes .*outcome=attributes-[0-9]+ win32=0') {
      throw 'Promotion diagnostics did not observe denied destination access and the existing source directory.'
    }
    if ((Get-Acl -LiteralPath $brokenVersions).Sddl -ne $deniedSddl) { throw 'Installer changed fixture access controls.' }
  } finally { Set-Acl -LiteralPath $brokenVersions -AclObject $versionsAcl }
  if ((Snapshot @($brokenRoot,$data,$desktop,$menu)) -ne $brokenBefore -or (RegistrySnapshot) -ne $brokenRegistryBefore -or (Get-Acl -LiteralPath $brokenVersions).Sddl -ne $versionsAcl.Sddl) {
    throw 'Failed broken-install repair changed existing files, data, shortcuts, registration or access controls.'
  }
  if (@(Get-ChildItem -LiteralPath $brokenVersions -Force).Count -ne 0 -or (Test-Path (Join-Path $brokenRoot ".stage-$version")) -or (Test-Path (Join-Path $brokenRoot 'AGENTS.exe'))) {
    throw 'Failed broken-install repair changed the original empty-versions state or left an owned stage.'
  }
  Pass 'Missing-executable fixture permits root mkdir but denies promotion with Windows error 5; bounded failure preserves data, ACLs and stale shortcuts'

  $recoveryAttempted = $true
  try {
    Set-Acl -LiteralPath $brokenVersions -AclObject $deniedVersionsAcl
    $deniedSddl = (Get-Acl -LiteralPath $brokenVersions).Sddl
    Install-Checked $installer 0 -TargetRoot $brokenRoot -RecoverToUser
    if ((Get-Acl -LiteralPath $brokenVersions).Sddl -ne $deniedSddl) { throw 'Fresh-location recovery changed original access controls.' }
  } finally { Set-Acl -LiteralPath $brokenVersions -AclObject $versionsAcl }
  $recoveredVersion = Join-Path $defaultRoot "versions\$version"
  if ($script:lastLog -notmatch 'operation=previous-payload .*outcome=missing' -or $script:lastLog -notmatch 'operation=installation .*outcome=success') {
    throw 'Explicit recovery lacks missing-payload and successful-installation receipts.'
  }
  foreach ($file in Get-ChildItem -LiteralPath $payload -Recurse -File -Force) {
    $relative = [IO.Path]::GetRelativePath($payload,$file.FullName)
    if ((Get-FileHash -LiteralPath (Join-Path $recoveredVersion $relative) -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
      throw 'Recovered application differs from the verified package.'
    }
  }
  foreach ($shortcutPath in @($desktop,(Join-Path $menu 'AGENTS.lnk'))) {
    if ($shell.CreateShortcut($shortcutPath).TargetPath -ne (Join-Path $recoveredVersion 'AGENTS.exe')) { throw 'Recovery did not activate the real new executable.' }
  }
  if ($shell.CreateShortcut((Join-Path $menu 'Test Windows Control.lnk')).TargetPath -ne (Join-Path $recoveredVersion 'Test Windows Control.cmd')) {
    throw 'Recovery did not activate the packaged validation command.'
  }
  if ((Get-ItemProperty $reg).InstallDir -ne $defaultRoot -or (Get-ItemProperty $reg).Version -ne $version -or (Get-ItemProperty $reg).UnknownOwnerValue -ne 'retain this registration value') {
    throw 'Recovery registration is incorrect or lost an unknown owner value.'
  }
  if ((Snapshot @($brokenRoot,$data)) -ne $brokenDataBefore -or (Test-Path -LiteralPath $previousShortcut) -or @(Get-ChildItem -LiteralPath $brokenVersions -Force).Count -ne 0) {
    throw 'Recovery changed original files/data or advertised a nonexistent previous executable.'
  }
  Pass 'Explicit recovery installs verified package bytes at a fresh per-user root, repairs shortcuts and preserves original files, memories, approvals and policy'

  # A repeat explicit request against the broken registration must not merge
  # into the now-existing recovery root. Use the stale older registration so
  # this exercises destination refusal rather than the separate version floor.
  Set-ItemProperty $reg InstallDir $brokenRoot
  Set-ItemProperty $reg Version '0.2.1'
  $occupiedRecoveryBefore = Snapshot @($defaultRoot,$brokenRoot,$data,$desktop,$menu)
  $occupiedRecoveryRegistry = RegistrySnapshot
  Install-Checked $installer 47 -TargetRoot $brokenRoot -RecoverToUser
  if ((Snapshot @($defaultRoot,$brokenRoot,$data,$desktop,$menu)) -ne $occupiedRecoveryBefore -or (RegistrySnapshot) -ne $occupiedRecoveryRegistry) {
    throw 'Explicit recovery overwrote an existing recovery destination or changed protected state.'
  }
  Pass 'Explicit recovery refuses an occupied default destination without changing either installation'

  $env:AGENTS_MOTW_TEST_PATH = Join-Path $testRoot 'internet-zone-test.exe'
  Copy-Item $installer $env:AGENTS_MOTW_TEST_PATH
  node -e 'require("./desktop/updater.cjs").markInternetDownload(process.env.AGENTS_MOTW_TEST_PATH,require("./package.json").version).then(()=>console.log("PASS: Windows Internet-zone metadata retained"))'
  if ($LASTEXITCODE -ne 0) { throw 'Windows Internet-zone test failed.' }
  Pass 'Windows Internet-zone persistence'
} catch {
  $safe = $_.Exception.Message.Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
  Write-Output "::error title=Installer acceptance failed::$safe"
  if ($script:lastLog) {
    $tail = (($script:lastLog -split "`n" | Select-Object -Last 12) -join "`n").Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
    Write-Output "::error title=Redacted installer diagnostic::$tail"
  }
  throw
} finally {
  New-Item -ItemType Directory -Path $diagnostics -Force | Out-Null
  if (Test-Path $logDir) { Copy-Item (Join-Path $logDir '*.log') $diagnostics }
  @{candidate=$version;previous='0.2.0';testsPassed=@($results);realLaptopVerified=$false} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $diagnostics 'results.json') -Encoding utf8
  if ($env:GITHUB_STEP_SUMMARY) { ($results | ForEach-Object { "PASS: $_" }) -join "`n`n" | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8 }
  foreach ($path in @($testRoot,$data,$logDir,$reg,$uninstall,$desktop,$menu)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
  }
  if ($recoveryAttempted -and (Test-Path -LiteralPath $defaultRoot)) { Remove-Item -LiteralPath $defaultRoot -Recurse -Force }
}
