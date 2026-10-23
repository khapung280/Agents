# Diagnosing a staging failure

The v0.2.0 installer collapsed directory creation, extraction, uninstaller writing,
version marker writing, working-directory changes and directory promotion into
one message. NSIS error flags are sticky, so that message did not identify the
failed operation. The earlier hosted test installed over a placeholder old file;
it did not execute a prior installer or test a path containing spaces.

Those are confirmed implementation and coverage defects. They do **not** establish
the exact cause of the reported failure at `D:\Ultimate Agents Both`. A temporary
file lock, denied directory permission, unexpected path contents or another
Windows error must be distinguished with actual evidence. Paths containing spaces
are quoted in the installer; no evidence justifies removing spaces or elevating
the installer.

The 0.2.1 candidate records fixed operation names, package-relative item names,
elapsed-system ticks and native error codes. It does not record installation paths,
user names, command lines, credentials, registry contents or personal data. Logs
are retained at `%LOCALAPPDATA%\UltimateAgentsBoth\InstallerLogs\*.log`, outside the
application staging folder. The installer displays the exact log location.
Failure to create the initial log stops installation before changing application
files. A later logging failure is explicitly shown in the installer window.

| Operation | Meaning |
| --- | --- |
| `check-destination` | Existing stage/version, inaccessible path or path collision |
| `create-stage` | Creation of the fresh application-owned staging directory |
| `extract-directory`, `extract-file` | Specific public package-relative extraction target |
| `verify-layout` | Required packaged application entry is absent |
| `write-uninstaller`, `write-version-marker` | Installer-owned metadata write |
| `create-versions-directory` | Immutable version parent creation/type check |
| `release-staging-directory` | Releasing this installer's working directory |
| `promote-stage` | Same-volume move into a previously absent version path |
| `snapshot-activation` | Exact shortcut/registration snapshot before changes |
| `activate-shortcuts`, `register-version` | Activation after staging is complete |
| `restore-activation` | Exact previous activation snapshot restoration |

Native directory errors include 5 (access denied), 32 (sharing violation), 33
(lock violation), 183 (already exists), 3 (path not found) and 112 (disk full).
An NSIS command without a reliable native error reports `win32=unavailable`;
the implementation does not invent a Windows error code. Promotion retries only
5/32/33, at most eight attempts separated by 500 ms. It never deletes or replaces
the target to force the move. Persistent failure preserves the previous payload,
shortcuts and user data. Cleanup uses an exact build-owned file list and retains
unknown or locked files. Never delete a retained stage manually without review.

Installer return codes: 41 concurrent installer, 42 collision, 43 version floor,
44 staging failure, 45 activation/snapshot failure, 46 initial log unavailable.
CRC and updater provenance checks remain enabled. No security settings, ACLs,
SmartScreen exemptions or permissions are changed by the production installer.

## Verification boundaries

`scripts/test-windows-installer.ps1` runs only on disposable GitHub Windows runners.
It authenticates and executes the published v0.2.0 binary, then upgrades it at an
isolated path ending in `Upgrade With Spaces\Ultimate Agents Both`. It injects
an explicit directory permission denial, persistent and transient real Windows
directory locks, and a shortcut write lock. It checks every installed payload
file against the package and checks previous payload, data, shortcuts and
registration for changes after failure. Injected faults are labeled tests, not
evidence that the laptop has the same fault.

CI uploads redacted logs and a results receipt as `AGENTS-installer-diagnostics`,
including on failure. Each installer process has a 180-second test deadline.
The tests do not send mouse/keyboard input, start paid models, change real user
data or establish SmartScreen acceptance. The old flat 0.1.0 application and the
user's actual D: drive still require device-specific acceptance.

Candidate version 0.2.1 must be approved for publication after Windows verification.
The existing v0.2.0 release/tag/assets must not be overwritten. On a laptop failure,
retain the new log and the installer window's operation/code; do not change
machine-wide security policies or remove the previous application.
