ULTIMATE AGENTS - BOTH

Double-click AGENTS.exe to launch the dashboard. Node.js, npm, and VS Code
are not required for this packaged application. No API key is required for
built-in local workflows. Native desktop control remains disabled until you
review an application policy; installing does not authorize PC actions.

For the dedicated Windows test, double-click "Test Windows Control.cmd".
It operates only on its own disposable test application. Avoid touching the
keyboard or mouse during validation. It retains diagnostic evidence in a
unique directory under your Windows temporary folder. Look for stage logs every
five seconds and explicit PASS/FAIL; the overall limit is three minutes.
The result directory contains validation.log and validation-result.json.
The final press-any-key pause only keeps the completed result visible.
Close any leftover disposable validation window before retrying. A failed test must
not be counted as working PC control.

The trusted worker and validation scripts use child-process-only PowerShell execution
policy settings. No permanent Windows policy is modified. Organization
policies still take precedence. App allowlists and approvals remain enforced.

This package is unsigned. It has not been certified or validated on your
Windows laptop. Do not disable Defender, SmartScreen, or organization policy.
If your security policy blocks it, use your normal approval/signing process.

Persistent data is under the application's Windows user-data directory,
not the install directory. The uninstaller leaves personal runtime data
intact. No API keys or personal configuration are included in this package.

Browser tools require an installed supported browser (Chrome/Edge) or a
Playwright Chromium installation. External authenticated accounts are not
configured. Live OpenAI vision processing remains a future approved step.

Full documentation: resources\app\docs\WINDOWS_CONTROL.md

GUIDED REASONING (OPTIONAL)
Computer includes reviewed plan and screen sessions. Built-in local tools still
need no API key. Live model calls require secure provider configuration and
explicit approval. Every screen upload requires review of the exact capture;
every proposed input requires separate approval. No model response alone can
complete a session. Restart blocks checkpoints; interrupted input is not replayed.
See docs/AI_BRAIN_PHASES.md in the source repository for configuration and limits.
These AI workflows have been tested with offline fixtures, not a paid live model.
