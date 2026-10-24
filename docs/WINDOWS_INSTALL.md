# Windows desktop installation and testing

This is a Windows x64 preview of the existing AGENTS application. The cinematic face and all ten agents are preserved. No API key is needed for built-in local workflows. Native Windows control is implemented but **not verified on an actual Windows device by this cloud build**.

## Install and launch without development tools

1. Obtain `Ultimate-Agents-Both-Setup.exe` from the delivery artifact, or from the **Windows package** GitHub Actions run for the desired commit. Actions artifacts are available only after that run succeeds; source ZIPs do not contain an installer. Check the run/commit and SHA-256 before use.
2. Run the installer as your normal Windows user. It installs under `%LOCALAPPDATA%\Programs\Ultimate Agents Both` by default and creates the **AGENTS** desktop shortcut and **Ultimate Agents Both** Start menu folder. No administrator access, Node installation, npm command, or VS Code is required.
3. Open **AGENTS** from the desktop. It starts and pairs with its private local service automatically. A second launch brings the existing window forward. Closing it stops its service. Try a Project Manager workflow and inspect its Supervisor evidence.
4. For the native test, open **Start → Ultimate Agents Both → Test Windows Control**. This explicitly authorizes operations only against the test's temporary application. Leave the keyboard/mouse untouched during the test. Progress appears every five seconds with named stages, a three-minute overall limit, and an explicit PASS/FAIL. The window stays open with the completed result; it prints the retained evidence directory under `%TEMP%\agents-windows-validation-*`. If a validation window remains after failure, close that specific window.
5. Review the result before enabling any real-application policy. Follow the [Windows control acceptance matrix](WINDOWS_CONTROL.md). If it fails, retain `validation.log` and `validation-result.json` from the printed directory. The final “press any key” pause is intentional after completion. A fixture pass does not verify every app, DPI configuration, locked-session behavior, or input cancellation race.

The installer is unsigned. It does not disable Defender, SmartScreen, or organization policy. A policy requiring signed packages/scripts may still block execution; follow the organization's review/signing process. Do not change machine-wide execution policy. The fixed worker and validation PowerShell children receive `-ExecutionPolicy Bypass` for their own process only. MachinePolicy/UserPolicy can override this setting.

The installer retains redacted installation logs under `%LOCALAPPDATA%\UltimateAgentsBoth\InstallerLogs`. A failure names the operation and, where available, the native Windows error. Keep that log; do not delete the previous installation or alter its permissions. See [staging diagnostics](INSTALLER_STAGING.md) and [0.2.2 missing-executable recovery and verification boundaries](INSTALLER_RECOVERY.md).

Application allowlists and per-action approvals remain required. Installation and running the fixture do not enable control of your normal applications. Native capture/input still fails closed without a reviewed local policy. The installer adds only application install/uninstall registry entries under HKCU; it makes no PowerShell security registry changes.

Persistent data stays in Electron's user-data directory (normally `%APPDATA%\ULTIMATE AGENTS — BOTH\agents-data`). Application payloads are staged into `versions\<version>` beneath the installation root before shortcuts are switched. Previous payloads and a recovery shortcut are retained; recovery is an explicit choice, not a database rollback. The uninstaller removes known files for its own version while retaining personal runtime data and unknown files. Close AGENTS before updating or uninstalling.

Older installations need one reviewed 0.2.0 bootstrap installer. Then use **Settings → Application updates → Check for Updates**. Signed GitHub provenance and installer integrity must pass before download/install approval. The application remains unsigned in Windows; the ordinary Windows shell and security prompts remain in effect. See [updates, data preservation and failure recovery](UPDATES.md).

Browser tools use installed Edge or Chrome when available, or the configured `CHROMIUM_PATH`. They use an isolated browser profile, with the existing public-HTTPS/host restrictions and no personal browser cookies. Public DNS/HTTPS and the browser sandbox must work locally.

## Source checkout alternative

Use Node **24 LTS**. In a terminal opened in the directory **containing `package.json`**:

```cmd
npm ci
npm run test:windows
```

The earlier `ENOENT package.json` error meant the terminal was one directory above the project (for the user's extracted ZIP, the project was `D:\steam\Agents-main\Agents-main`). Prefer a fresh ZIP of the published commit or a normal `git pull --ff-only` in an existing clean clone. Do not overwrite local configuration or changes.

The test calls the fixed builder and worker scripts itself; no manual `Set-ExecutionPolicy` is needed. See [exact invocation and safety controls](WINDOWS_CONTROL.md).

## Reproducible installer build

The committed `Windows package` workflow uses `windows-latest`, Node 24, the lockfile, the same checks, native compilation/pure selection fixtures, Electron's published checksums, and checksum-pinned NSIS 3.11. It runs the actual installer in an isolated directory, checks collision/downgrade rejection and data-fixture preservation, writes a signed GitHub build attestation and verifies it with the production updater. The uploaded artifact is downloaded again and reverified. It deliberately does not send desktop input on a hosted CI runner. A successful build is not native UI validation or SmartScreen acceptance.

Build with Node 24 and NSIS installed:

```powershell
npm ci
npm run check
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File native/windows/check-build.ps1
npm run package:windows
& "${env:ProgramFiles(x86)}\NSIS\makensis.exe" /WX "/DAPP_VERSION=$((Get-Content package.json -Raw | ConvertFrom-Json).version)" "/DPACKAGE_DIR=$pwd\artifacts\windows\AGENTS" "/DUNINSTALL_MANIFEST=$pwd\artifacts\windows\uninstall.nsh" "/DEXTRACT_MANIFEST=$pwd\artifacts\windows\extract.nsh" "/DOUTPUT_FILE=$pwd\artifacts\windows\Ultimate-Agents-Both-Setup.exe" installer/agents.nsi
Get-FileHash artifacts/windows/Ultimate-Agents-Both-Setup.exe -Algorithm SHA256
```

`package:windows` stages a Windows x64 Electron distribution with an explicit application-file allowlist and frozen production dependencies. The package excludes local `.env`, credentials, databases, caches, and test output. Existing Playwright and TypeScript dependencies are included because the service imports them at runtime. Electron provides the Node runtime. It does not bundle a second browser download.

The same NSIS source can be cross-compiled on Linux with `makensis -D...`. This produces a real Windows executable but cannot establish that the installer or native automation runs on Windows. `package-info.json` records the source HEAD, dirty-worktree flag, Electron version and runtime hash, and explicitly records Windows execution as unverified. A local build is not automatically trusted by the in-app updater: publishing requires the fixed successful main-branch Windows workflow's attestation, exact artifacts and explicit owner release approval.

Live OpenAI vision transport, real model calls, external account integrations, signing, and the broader roadmap remain separate work. No paid API call or API credential is needed for this package or its local validation.
