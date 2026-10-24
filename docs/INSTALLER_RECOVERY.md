# Missing-executable recovery

## Evidence and limits

The laptop's v0.2.1 log, `operation=promote-stage outcome=failed win32=5`,
establishes that Windows denied the no-overwrite `MoveFileW` from the owned stage
to the new version directory. It does not identify the denying permission,
handle or security filter. Creating a folder in the install root does not prove
permission to add a child to `versions`, rename/delete the source, or exclude
another process's handle. Absence of AGENTS in Task Manager does not exclude those
other causes. No evidence justifies elevation, ACL changes or security exceptions.

Source review of the flat 0.1 installer and the published 0.2.0/0.2.1 installers
found no ordinary staging-failure path that deletes the old root executable.
`CleanStage` temporarily uses the newly created stage as its deletion root and
uses exact build-owned paths with nonrecursive directory removal. Installation
does not invoke a previous uninstaller. This cannot prove what happened on the
laptop: prior file state, logs or external deletion/quarantine evidence is still
needed. An empty `versions` and stale shortcut alone do not establish that history.

Confirmed defects were trusting a versioned recovery executable path without
checking it existed, and claiming a previous version was retained without knowing
whether its executable existed at entry. Version 0.2.2 records that initial state,
avoids creating a new nonexistent recovery target, and describes preservation of
pre-existing files accurately. An older existing recovery shortcut is preserved;
its presence is not a guarantee its target exists.

## Explicit repair path

After the repair candidate is verified and approved for publication:

1. Obtain the matching installer and SHA-256 from its successful Windows package
   run or approved release. Keep the old installation and its diagnostic logs.
2. Open the installer as the normal Windows user. Review normal Windows security
   prompts; the package remains unsigned. Do not change security policy to run it.
3. If it reports the registered executable is missing, choose **Yes** to the
   question offering the fresh per-user location. **No** is the default and keeps
   the selected old location. Silent installers never make this choice themselves.
4. Recovery only accepts an absent `%LOCALAPPDATA%\Programs\Ultimate Agents Both`.
   It never merges into a second existing installation or retries a denied move
   using a copy operation. The chosen location is fixed for this recovery attempt.
5. After successful installation, launch the new **AGENTS** desktop shortcut.
   Check the displayed version, existing memories/settings and permission state.
   The former `D:\Ultimate Agents Both` directory remains intact. Native control
   still requires the separately approved **Test Windows Control** test.

Personal data remains in the existing Electron user-data directory, normally
`%APPDATA%\ULTIMATE AGENTS — BOTH\agents-data`, or the existing custom
`AGENTS_DESKTOP_DATA_DIR`. Recovery does not migrate, replace or reset it. No new
desktop permissions are granted. Only after successful staging do shortcuts and
known HKCU installation values switch to the new payload; activation failure uses
the existing exact snapshot rollback. A real older executable receives a recovery
shortcut; an absent one does not.

If recovery fails, keep the operation/error and persistent log under
`%LOCALAPPDATA%\UltimateAgentsBoth\InstallerLogs`. Only empty recovery directories
created by that attempt may be removed; unknown/locked files and promoted payloads
remain. Do not delete retained directories to retry. The version floor remains:
the repair candidate is newer than 0.2.1, and same-version reinstall/downgrade is
still rejected. Return code 47 means fresh-location recovery was refused before
application changes. `/RECOVERTOUSER` is the explicit equivalent used in isolated
CI; the application updater does not pass it or use silent installation.

## Verification scope

`scripts/test-windows-installer.ps1` uses disposable guarded Windows-runner state.
It retains the authenticated actual v0.2.0 upgrade, payload-byte checks, locks,
activation rollback, collision and downgrade tests. The added broken-layout
fixture contains no old executable, an empty `versions`, stale shortcuts, personal
files and data/approval fixtures. A test-only deny on `versions` allows root mkdir
but forces promotion error 5. The test checks seven bounded retries, exact
diagnostics, unchanged files/registry/shortcuts/ACLs, and recovery to the fresh root
while that original restriction is still in force. It checks every recovered
package file and refuses recovery for an intact previous payload or occupied root.

The injected restriction demonstrates one possible mechanism, not the laptop's
root cause. CI does not click the native recovery question, inspect the laptop,
test SmartScreen acceptance, or exercise real mouse/keyboard control. Those remain
device-specific verification. No paid API or API credentials are used.

The first repair CI run stopped on the new preservation assertion. A separate
fixture-only Windows run (40057238179) reproduced a descriptor mismatch without
executing an installer: `Set-Acl` adds `DiscretionaryAclAutoInherited`. The harness
now establishes that metadata before taking its baseline, allowing no change to
ACL bytes, owner/group or other control bits. Exact descriptor comparisons remain
in force during installer execution and after the fixture restores its ACL. This
fixture normalization never runs in the production installer or on a laptop.
