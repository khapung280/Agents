# Windows Computer Agent: implementation and validation

This phase preserves the existing dashboard, ten agents, and holographic face. It adds a local Windows adapter and reviewed observe–act–verify workflows. **No actual Windows PC has been controlled or verified in the Linux cloud environment.** Native source and the Windows harness must be run on Windows before claiming support for a particular app.

## Audit and delivered phases

The original repository already had durable workflows, tool grants, task approvals, event streaming, stop/cancellation, Playwright inspection, and the cinematic UI. Its Computer Agent only inventoried and created scoped files; it had no Windows executor. Browser inspection did not perform interactions, and model adapters only accepted text.

1. Added strict shared Windows/browser request schemas, a disabled-by-default local application policy, a fixed PowerShell/C# worker, and a Node adapter. No new package dependencies.
2. Added application launch, window observation/capture, UI Automation focus/invoke/value patterns, Win32 mouse movement/clicks, Unicode typing and a bounded key set. Added fresh evidence, postconditions, receipts, serialization, and approval/cancellation integration.
3. Added `computer.delegate` to all ten agents. The engine creates a Computer Agent child step with its own approval and a Supervisor review. Other agents do not acquire direct input privileges. Workflow dependencies can consume the resulting artifacts. Pausing either the delegating agent or Computer Agent stops its active work.
4. Added working Computer/Browser task fields, exact approval details, real-event face state mapping, and an offline OpenAI vision/reasoning request builder.
5. Added cross-platform boundary tests, real Chromium interaction tests, and a separate native Windows validation harness.

## Execution boundary

The authenticated local Node service spawns the checked-in `native/windows/worker.ps1` via a fixed absolute Windows PowerShell path. JSON goes over stdin; task data is never interpolated into PowerShell or a shell command. The worker compiles the checked-in `Automation.cs` against Microsoft UI Automation and Win32. No arbitrary executable arguments, script execution, shell commands, remote listener, or elevation are exposed.

Native execution runs in the same interactive Windows session as the service. This cloud host cannot reach your Windows desktop. The adapter is not a remotely reachable Windows service and does not use RDP credentials. Run the repository locally on Windows for testing.

The service reads `windows-policy.json` from its data directory **at startup**. No policy has been installed or enabled in this cloud task. Missing/invalid policy disables native control. The policy lists exact executable paths, launch permission, and permitted input kinds. Command interpreters are rejected. The worker and launched apps inherit a minimal Windows environment, excluding provider/proxy secrets.

Every observation, launch, and input requires a task-specific approval, even in Autonomous mode. Protected schedules pause for interactive review. An observation is scoped to one project and service session, expires after two minutes, and can authorize at most one input. Native operations are serialized across agents. A restart invalidates observations and blocks approved-but-unexecuted protected tasks.

Before input, the native worker rechecks process ID, process start time, executable, window geometry, target runtime ID, target geometry/content, enabled/password status, and foreground ownership. Clicks are restricted to a visible UI Automation target's center and refuse occluded targets. Keyboard input requires the observed target to already own focus. Held modifier keys block input. Background, minimized, locked, elevated, or inaccessible windows fail closed; the worker does not escalate privileges.

`focus` verifies foreground ownership; `move` verifies the cursor; `setText` reads the UI Automation value back. Click, invoke, type, and key operations require an explicit name/value/focus postcondition that did not already hold. An input dispatch alone never completes the task. Expectation targets must already exist in the observation; newly created dialogs require a new observation and a separate reviewed step.

The worker has a 30-second deadline inside the engine's 45-second deadline. Stop kills the worker and the desktop slot remains occupied until it exits. Already dispatched OS input cannot be undone. An uncertain result is recorded as uncertain, never a successful completion; no native input or browser interaction automatically retries. Obtain a fresh observation and review current application state before another request.

## Screenshots and privacy

Capture uses `PrintWindow` for the authorized window only, with no whole-desktop fallback. Identified UI Automation password fields are masked, and their names/values are excluded. Traversal is bounded and refuses capture when the control tree cannot be fully traversed within the limit. PNG evidence stays in the local authenticated artifact store.

Masking is not general secret detection. Custom-rendered fields may not identify themselves as passwords; ordinary document content, names, tokens, and application titles may be sensitive. The owner must review the target before approving capture. Some GPU-rendered applications return blank or unsupported `PrintWindow` content; an API return value does not establish screenshot fidelity. Validate visually on Windows.

Global input has an unavoidable foreground/user-interference race between checking a target and OS delivery. Do not operate the mouse or keyboard during a test. Focus checks, target checks, one-operation approvals, and short-lived observations reduce this risk; they do not establish OS-level isolation from another same-user process. Multi-monitor DPI, accessibility provider differences, UAC, focus denial, and locked-session behavior remain Windows acceptance items.

## First native test: disposable application only

Requirements: interactive Windows 10/11 x64 and Windows PowerShell 5.1/.NET Framework with UI Automation. The packaged **Test Windows Control** shortcut includes the Node runtime; a source checkout requires Node 24.

Both fixed project scripts now run with child-process-only execution policy: `build-validation.ps1` uses `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <absolute-project-builder-path> -OutputPath <temporary-fixture-executable>`; `worker.ps1` uses `powershell.exe -NoLogo -NoProfile -NonInteractive -Mta -ExecutionPolicy Bypass -File <absolute-project-worker-path>`. The worker setting applies in the test harness and approved normal application tasks. Task JSON travels over stdin, never through command interpolation. No caller supplies a script path.

The setting expires with each PowerShell child. No `Set-ExecutionPolicy`, security registry edit, administrator elevation, or CurrentUser/LocalMachine policy change occurs. The worker removes `PSExecutionPolicyPreference` from an application's inherited environment before launching it. Application allowlists, individual approvals, stale-observation checks, postconditions, and stop controls are unchanged. Organization-enforced MachinePolicy/UserPolicy takes precedence; use the organization's signing/review process if the fixed scripts remain blocked.

From this existing checkout:

```powershell
npm ci
npm run typecheck
npm test
npm run test:windows
```

`test:windows` compiles a small disposable WinForms executable into a unique temporary directory. It does not enable the normal app policy or change cloud environment settings. Its in-memory test policy allows only that exact temporary executable. The test explicitly approves its own fixture operations: launch, observe, focus, Unicode text, value read-back, Tab, move, click, and InvokePattern. It also checks password metadata, supervisor execution, and emergency-stop rejection. It retains JSON/database/PNG evidence in the printed temporary directory and closes the fixture process on completion when its process ID has been observed. If launch fails before a process ID is returned, close only the disposable validation window manually.

A Linux invocation reports **NOT RUN** with a nonzero exit code. Fixture-backed cloud tests are not a substitute for this native run. A native failure is a test failure, not evidence that the PC is controllable. If Windows denies foreground activation, focus the disposable window manually and rerun; never bypass the focus check.

After the harness passes, manually validate:

- Inspect every retained screenshot, including password masking and expected window content.
- Move/resize/switch windows after observing; old actions must be rejected without input.
- Lock the session and test UAC/elevated targets; operations must fail without elevation.
- Test primary/secondary displays and 100%, 150%, and 200% scaling.
- Stop during execution; inspect actual state before approving a fresh action. Verify no queued input runs after stop.
- Test the exact intended application versions and their UI Automation providers. Do not generalize a fixture pass to all Windows applications.

## Opt-in application testing after native validation

Keep environment configuration pending until the native harness is reviewed. Then create a local policy in the service data directory. Example **template only**, disabled by default:

```json
{
  "enabled": false,
  "apps": [
    {
      "id": "reviewed-app",
      "name": "Your reviewed test application",
      "executable": "C:\\Path\\To\\ReviewedApp.exe",
      "allowLaunch": false,
      "actions": [
        "focus",
        "move",
        "click",
        "invoke",
        "setText",
        "typeText",
        "key"
      ]
    }
  ]
}
```

Use the actual application path, narrow the actions, and enable only for testing after review. Restart the local service. Browser mode uses `.data/windows-policy.json`; Electron uses `windows-policy.json` inside its own `agents-data` directory under Electron userData. These are separate stores. Do not copy Linux `.env` paths into a Windows setup or overwrite existing local settings.

In **Computer → Create workspace task**, choose `computer.observe`, select the application, and approve capture. If the application has multiple visible windows, the worker returns matching window handles; specify the intended one. Then select `computer.act`, a fresh captured observation, the exact target/action, and a postcondition. Review and approve once. `computer.delegate` exposes the same flow to every specialist. Use the same project scope as the observation.

The launch tool deliberately verifies the exact newly started process. Apps that hand off to an existing process or use launch shims can fail this check even though a window opens. Observe the already-open allowlisted application instead of repeatedly launching it.

## Playwright interaction

`browser.interact` performs one approved fill, click, or key action in a fresh isolated Chromium context and verifies an exact accessible role/name target's value, text, or visibility. It requires a changed postcondition; ambiguous and password targets are denied. The existing exact-host, public-HTTPS, DNS-pinning, no-download, no-popup and GET/HEAD-only policy remains enforced. It does not attach to a personal browser, use account cookies, submit POST requests, or preserve an interactive session across tasks. Multi-step authenticated browser sessions remain future work.

The real Chromium tests exercise local intercepted fixtures. Public browsing remains blocked by this cloud host's direct DNS; this task did not weaken that boundary or modify its network configuration.

## OpenAI preparation and credentials

`computer.vision.prepare` creates an offline bundle from an actual in-session observation. The pure `buildOpenAIVisionRequest` helper builds a Responses API image/text request and verifies the PNG hash. No fetch, provider key lookup, or execution occurs. The proposal schema describes one bounded action, never a completion claim. Screenshots and UI text are marked untrusted.

Live vision/model planning is intentionally not enabled here. Before adding transport, require explicit approval for sending the image, a verified vision-capable model, API credentials, token/cost reservations, response-schema validation, fresh observation binding, and a separate execution approval. Existing `model.draft`/`model.plan` remain optional credentialed text tools. All implementation and local tests in this phase require no paid API access.

## Remaining work

The owner reports a PASS for the controlled Windows fixture. Remaining work includes the broader application acceptance matrix above, live provider/vision acceptance, persistent browser sessions and account-specific external actions, signed packaging and independent security review. Deterministic local tools do not provide free-form reasoning. The Responses planner and reviewed vision session transport are now implemented and offline-tested; no paid live test has been performed. See [AI brain phases](AI_BRAIN_PHASES.md). Owner-defined DAGs execute and verify through the existing orchestrator, but computer inputs remain individually approved.

## Worker lifecycle reliability update

The output collector now keeps the desktop execution slot until the PowerShell child's `close` event on every outcome, including output overflow and process errors. Requesting termination alone cannot allow another desktop operation to start. Cancellation during launch setup is also caught before writing a request. If termination is refused and the child remains alive, the slot remains occupied; it does not permit overlapping desktop operations.

The collector limits stdout to 16 MiB of bytes, discards later output after failure, and preserves UTF-8 characters split across stdout/stderr chunks. Timeout, cancellation, invalid evidence, and oversized output cannot become successful observations even if the child later exits with code zero. There is no automatic input retry.

Five cross-platform regression tests use explicit process-boundary fixtures for Unicode/BOM decoding, overlapping-operation rejection during delayed close, cancellation before/after listener setup, the 30-second deadline, and failure diagnostics. These establish service behavior, not actual PowerShell termination or Windows UI behavior. Fixed script paths, process-only execution policy, stdin JSON, minimal child environment, approvals, and application allowlists are preserved.

## Diagnosing a Windows validation stall

The installed **Test Windows Control** shortcut now starts an independent watchdog before compiling the disposable fixture. The terminal prints elapsed-time stage lines and a heartbeat every five seconds; `validation.log` and `validation-result.json` are saved under the printed `%TEMP%\agents-windows-validation-*` directory. A failure is printed and persisted before engine cleanup, so an unresponsive worker cannot hide it. A zero exit code without the harness's verified result is a failure. PASS is printed only after all fixture checks and cleanup finish and the harness exits successfully.

Bounds: runtime startup 15 seconds, each stage 45 seconds, native worker 30 seconds, cleanup 5 seconds, overall test 180 seconds. On failure the watchdog requests termination of only its own validation process tree, with a five-second termination deadline and one-second reporting grace. It reports unconfirmed termination explicitly; no automatic retry or input follows. The terminal's final “press any key” pause only keeps the completed result visible. Close a leftover disposable fixture before retrying.

Native stderr reports compilation, stdin reading, desktop checks, application/window startup, UIA observation, target validation, action dispatch, postcondition checks, capture, and evidence serialization. It does not log screenshot bytes, passwords, or observed window contents. UIA uses a worker in the MTA apartment, with no UI owned by that worker. An already-foreground authorized window is accepted by the focus operation, and fresh foreground verification remains required. No foreground-lock bypass or security policy change was added.

A reproduced communication bug allowed a launched descendant to retain stdout/stderr after its worker exited. The collector now observes actual worker exit, allows one second for pending evidence, then closes inherited pipe readers. It still holds the desktop slot while the worker is alive; invalid, incomplete, interrupted, or unsuccessful evidence cannot produce success. UI Automation and PrintWindow calls themselves may block in a provider, so the separate worker/watchdog bounds are essential. These changes do not prove the exact cause of the owner's laptop stall without its new diagnostics.

If validation fails, share `validation.log` and `validation-result.json` from the printed directory, plus the installer build used. Review filenames and personal paths before sharing; do not send API keys or the whole runtime database. Screenshots can be reviewed locally for masking. Do not enable normal-application control until this fixture test passes on the device.

CI runs `--watchdog-self-test` through the packaged runtime. Its expected FAIL for a deliberately stalled child is followed by **PASS: watchdog self-test only**; this mode performs no native UI actions and is not a Windows control result.

## Guided screen sessions

Computer now includes guided reasoning sessions. Capture approval, exact-image sharing approval, each proposed input, and final evidence acceptance remain separate. A session uses the same native adapter and never bypasses its live focus/content/geometry checks. See [the session controls and current verification limits](AI_BRAIN_PHASES.md). The existing `computer.vision.prepare` tool remains offline; only `model.vision` can make an explicitly approved provider request. Screen sharing remains unavailable until compatible model configuration, verified prices, and an image token reservation are provided securely.
