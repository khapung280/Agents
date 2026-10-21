# Windows 11 Notepad handoff implementation and acceptance

Status: scoped implementation follows the updater implementation and focused updater tests. Cloud evidence fixtures and pure native selection fixtures cover the new boundaries. Windows CI compilation and real-device acceptance must be reported separately; neither fixture tests nor an installer build establish successful Notepad control on the owner's laptop.

## Confirmed failure

The previous native worker waited for the launched process's `MainWindowHandle` and failed immediately if that launcher exited. Packaged Windows 11 Notepad may hand the document to another process, so a real editor could open while verification failed. The registered-document path now polls for a fresh matching window for at most ten seconds, even after launcher exit. It launches only once. Generic application launch retains the original process-bound behavior.

The native and server adapters independently require the actual window owner's executable to match the exact policy path. Keep these checks. A `C:\Windows\System32\notepad.exe` permission must not silently authorize a WindowsApps executable. The owner must review and explicitly allow the actual installed packaged editor path; a later Store update changing that path must fail closed until reviewed again.

The document workflow already creates an exclusive GUID-named file, requires separate approvals, binds later input to a window handle/PID/start time, and verifies saved file bytes. Keep all these controls and the no-replay behavior.

Document-title checks now match the complete GUID filename, with the supported English Notepad suffix and optional unsaved marker. Both native and server evidence validators reject extra tabs and ambiguous editors. Native checks also inspect offscreen tab elements. Unsupported/localized title formats fail closed rather than guessing.

## Implemented boundaries

1. Validate the registered empty file and explicit exact executable before starting anything. Keep the existing single quoted file argument, no shell execution and no elevation.
2. Snapshot all existing top-level HWNDs, including hidden/minimized ones, before launching. A restored personal window must not count as a new window.
3. Launch exactly once. For this registered Notepad document only, bounded-poll for a new window whose process belongs to the authorized executable and current Windows session. A launcher exit becomes diagnostic evidence; it never authorizes another launch.
4. Match the complete GUID filename before reading UI Automation contents or capturing the window. Never match merely “Notepad,” an executable basename, or an arbitrary title substring.
5. Require one unambiguous new window and one readable, enabled, non-password empty editor. Reject existing-window/new-tab reuse, personal tabs, unexpected text, unsupported UIA and ambiguous candidates. Do not switch tabs, close personal documents or change Notepad preferences.
6. Bind the real editor PID/start time/HWND to the existing observation. Recheck document identity, process identity, foreground ownership and fresh target evidence before every separately approved focus/write/save step.
7. Verify the exact registered file path and saved UTF-8 bytes independently. A changed file, unexpected encoding or missing write-back fails without retry.

Generic application launching has no registered document identity and should retain its existing strict PID/window behavior. Do not broaden this document-specific exception into arbitrary process handoff.

## Acceptance

Deterministic tests must exercise the actual selection/matching implementation: direct launch, exited launcher with a new valid editor, foreign executable/session, reused hidden HWND, ambiguous candidates, wrong title, multiple tabs/editors, changed content, timeout and cancellation. Verify no repeated launch/input, unchanged approvals and stale PID/start/HWND refusal.

Windows CI must compile the real worker, parse PowerShell, and run pure native selection fixtures without desktop input where practical. Preserve process-only PowerShell settings, stdin transport, deadlines and cancellation. A successful installer build is not Notepad device verification.

On the laptop, review the exact packaged editor policy and begin a fresh disposable test. Separately approve create, launch, focus, write and save, then inspect read-back and Supervisor evidence. Negative tests with personal tabs, tab switching, cancellation and an outdated policy must stop safely without modifying personal documents. If Notepad reuses a personal window, stop; the owner may choose its “open in a new window” preference or manually close personal windows before a new test. AGENTS must not make that choice automatically.
