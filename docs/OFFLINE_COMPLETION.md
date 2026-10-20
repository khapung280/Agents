# API-independent completion phase

Audit base: `main` at `56668d1dc0b8e21e5111f6715e365706ffc0820f`, fetched on 19 October 2026. No credential setup, paid model call or external deployment is part of this phase.

## Prioritized checklist and audit

| Priority | Area              | Existing evidence                                                                                                                                                  | Remaining API-independent work                                                                                                                                                                         |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Security/recovery | One-use approvals, emergency stop, native deadlines/uncertain receipts, blocked restart checkpoints, task idempotency                                              | Scope-check dependency evidence, sensitive workspace paths, cancellation/late completion regression coverage                                                                                           |
| 2        | Windows           | Real UIA/Win32 launch/observe/focus/input/capture implementation; owner-reported disposable Windows fixture PASS; cloud native transports are explicitly simulated | Notepad-specific write/save/read-back workflow and actual-device acceptance; current worker accepts no launch arguments or save operation                                                              |
| 3        | Developer         | Actual TypeScript syntax review/transpilation, scoped exclusive file creation                                                                                      | Bundled sample bug diagnosis, reviewed exact patch and real tests in a private per-task directory; no arbitrary repository runner exists                                                               |
| 4        | Memory/context    | Persistent scoped memories, lexical search, durable task/session checkpoints                                                                                       | Bounded deterministic context summaries with evidence references and visible omissions; Nepali-safe tokenization                                                                                       |
| 5        | Browser           | Allowlisted HTTPS navigation, visible extraction/screenshots, approved fill/click/key and postcondition checks, real isolated Chromium tests                       | Broaden protected-field and cancellation regression coverage; keep external form submission/network mutations blocked                                                                                  |
| 6        | Ten agents        | Registry/tool grants, DAG dependencies, supervisor evidence checks, all-agent Computer delegation                                                                  | One complete deterministic acceptance matrix for all ten identities; stronger project isolation and duplicate/restart assertions                                                                       |
| 7        | Voice             | Browser SpeechRecognition, actual microphone meter and speechSynthesis; English only; browser/OS support unverified                                                | Explicit English/Nepali selection, recognition privacy/availability, installed local output voices, bounded recording and cancellation race handling; no downloaded speech model or paid voice service |
| 8        | Dashboard         | Cinematic face/ten nodes, real WebSocket events, task artifacts/approval/usage views                                                                               | Show new truthful capabilities and scope/summary/voice limitations; retain existing appearance                                                                                                         |

Deterministic project scaffolds, financial arithmetic and correspondence templates are working local tools, not simulated model intelligence. Model responses and native transports in tests are fixtures. A passed cloud transport test does not establish Windows app compatibility. Current pricing, model quality and autonomous live reasoning remain unverified and are deferred to final API integration.

## Architecture decisions requiring owner approval

The owner explicitly approved both designs below in chat for implementation and offline/CI testing. That approval does not authorize actions on the owner's laptop or paid calls. The existing engine, database, UI and ten-agent registry remain authoritative; no new service, orchestration framework, dependency, shell access or administrator permission is proposed.

### A. Fixed sample-project repair

- Add one protected Developer tool restricted to an application-bundled arithmetic fixture; do not accept a repository path, command, executable, package name, URL or user-supplied program.
- Create a fresh private per-task sample project under the app's own workspace; use exclusive creation and reject an existing run directory. Preserve all unrelated projects and files.
- Include a small known bug (addition implemented as subtraction), fixed test cases and a fixed patch. Describe this accurately as a deterministic sample repair, not general AI debugging.
- Run only the checked-in test harness with the current Node/Electron-as-Node executable, fixed argument vector, no shell, no package installation and an environment without provider credentials. Check fixture hashes before execution; refuse altered code or symlinks.
- Record actual failing tests, exact before/after source hashes and diff, then actual passing tests. A nonzero result, timeout or cancelled process cannot produce a success report. Bound runtime/output and await child exit before releasing its execution slot.
- Require the existing task-specific approval before creating/patching/running the sample. Cancellation/restart never replay the repair. Tests use only generated temporary sample projects.
- This trusted fixture is not a sandbox for arbitrary repository code. Supporting owner repositories later needs a separate isolation/command-permission design and approval.

### B. Disposable Notepad document workflow

- Add an explicit test-document record containing the approved text, app identity, unique workspace path, expected content hash, native observations and checkpoints. Reuse engine tasks and approvals; no automatic desktop actions.
- Exclusively create an empty document in a fresh application-owned test directory. Extend the fixed launch boundary only to pass that registered document path as a single argument to the exact allowlisted Notepad executable. No arbitrary arguments or external path selection.
- Require launch permission and explicit launch approval. If Windows Notepad hands off to another process, has ambiguous windows/controls or lacks usable UIA evidence, stop for review instead of guessing a target.
- Observe and verify the registered document/window. Propose at most one focus/edit action at a time, with separate approval and fresh native postconditions. Extend read-only UIA text evidence only where needed to read Notepad's TextPattern; do not relax password, identity or foreground checks.
- Add a narrowly scoped save action for the registered test document only. Its approval binds the document, expected text, process/window identity and fresh observation. Verify live target/document identity, issue one save operation, then independently read and compare the exact app-owned file bytes/hash. Do not automate Save As dialogs or overwrite an existing user file.
- Keep a bounded workflow deadline, existing native watchdog, emergency stop, one-operation receipts and no replay after uncertainty/restart. Retain actual evidence and explicit Windows-only acceptance status.
- Cloud tests may simulate native transport and real local file checks. Native compilation can run in Windows CI. Actual Notepad launch/input/save must still pass on the owner's Windows laptop before it is described as working there.

## Delivered without paid API access

- **Security and coordination:** dependencies, workflow roots, Supervisor fallback and shared evidence now stay in one project. Duplicate dependency IDs are rejected. Tools that return after cancellation/deadline cannot leave a task permanently running or claim success. Credential/configuration filenames, Windows devices, alternate streams and ambiguous trailing-dot/space paths are rejected.
- **Developer:** `code.sample.repair` requires a one-use approval and creates a fresh private sample project. Its real Node test harness produces three expected failures before the fixed patch and four passes afterward. Source/test hashes, exact diff and both test transcripts are retained. Modified fixtures, caller programs/paths, reused directories and cancelled runs fail closed. The sample is deterministic; arbitrary repositories and general AI debugging remain outside this approved scope.
- **Notepad:** `notepad.test` exposes separate prepare, launch, observe, focus, write and save approvals in Computer. It accepts one line of up to 500 characters in an app-owned empty UTF-8 file. A ten-minute workflow deadline, two-minute observation lifetime, existing 30-second worker limit and 45-second task limit bound execution. Only an exact Notepad allowlist entry with `allowTestDocuments: true` permits the new document argument/save. TextPattern adds read-only editor evidence; input still requires unchanged identity/content/geometry and live foreground checks. Save sends Ctrl+S once, then requires exact file-byte SHA-256 read-back. Restart, emergency stop, uncertainty, changed files and failed verification block further steps.
- **Browser:** existing navigation/fill/click/key/postconditions remain. Credential, payment and file controls are rejected. Aborting an action closes its isolated page so a pending delayed click cannot execute afterward. POST requests, personal cookies, downloads and authenticated multi-step sessions remain unavailable.
- **Memory:** `memory.summarize` creates a local deterministic extractive summary, capped at 12 KB with source references, source hashes and visible omissions/truncation. It excludes screen artifacts and preserves originals. Search retains Nepali letters/marks. Native/Notepad screen metadata is excluded from ordinary model context and correspondence evidence.
- **Voice:** English/Nepali selection, local-only recognition by default, explicit per-session browser-service consent, installed local speech-output selection, bounded recording/startup, exact English/Nepali stop commands and late microphone-cancellation cleanup. No language pack is downloaded and no paid voice service is used. Actual microphones, installed language packs/voices and recognition accuracy need device testing.
- **Dashboard:** existing holographic face and all ten agents remain. New document checkpoints, approval requests and file-hash results use actual stored events. Local tools no longer inherit a misleading paid-model approval description. Voice states follow actual browser events. No fabricated activity or completion was added.

## Acceptance evidence and limitations

Cloud backend tests exercise all ten existing identities: seven real local specialist tools, Browser/Research/Marketing worker contracts with explicit source fixtures, and all ten identities delegating through the same Computer approval boundary. Real Chromium tests cover rendered navigation and approved interactions against deterministic intercepted pages; real Electron tests exercise the installed-runtime path with Electron-as-Node. Native transport and provider responses in tests are explicitly simulated.

The final report records the exact completed test counts and GitHub Actions run. Native compilation and installer checksum verification in Windows CI do not establish interactive Notepad support. The owner's prior disposable-fixture PASS does not verify these new Notepad steps.

Remaining API-independent acceptance is device-specific: this installer on Windows 11, the disposable native fixture, actual Notepad launch/focus/type/save (including process handoff/tab behavior), DPI/lock/stop behavior, microphone/speech output, and target-hardware animation performance. Unsupported/ambiguous UIA evidence stops the new workflow; it never guesses, switches to Save As, bypasses focus protections, or enables general shell execution.

Authenticated browser sessions, arbitrary repository execution, sending accounts, wake-word recognition and advanced facial visemes are outside the two scoped designs. They require separate integration/isolation decisions; an API key alone does not complete them.

## Repeatable checks

```sh
npm run check
npm run test:e2e
npm run test:desktop
```

The Linux desktop smoke needs a display (this cloud run uses Xvfb and the existing isolated-container test flag). `npm run test:windows` explicitly reports NOT RUN on Linux. Windows CI runs checks, compiles/parses native source, packages the app, tests its packaged watchdog, creates the NSIS installer, uploads it, downloads it again and compares the installer SHA-256 and source commit.

## Work completed within existing boundaries

Context summaries, scope checks, file protections, browser safeguards, all-agent regression tests and voice improvements reuse existing boundaries. No new dependency, production service, paid call, API credential or external deployment was added.

## Final API integration remains deferred

Only after the API-independent work and available acceptance checks are complete: verify current official model capabilities/prices/account access; configure a restricted credential privately; set explicit budgets and image-token allowance; approve one synthetic planning request; separately approve a reviewed window image; only then consider an exact approved input and fresh verification. None of those paid or screenshot/input permissions are implied by this phase.

## Files changed in this delivery

- `README.md`
- `client/App.tsx`
- `client/components/Modules.tsx`
- `client/components/NotepadPanel.tsx`
- `client/components/TaskDetail.tsx`
- `client/components/TaskForm.tsx`
- `client/components/VoiceControls.tsx`
- `client/components/dashboard/CommandBar.tsx`
- `client/components/dashboard/StatusFooter.tsx`
- `client/components/modules/ConnectionsModule.tsx`
- `client/components/modules/KnowledgeModule.tsx`
- `client/voice-policy.ts`
- `client/voice.ts`
- `docs/AGENTS.md`
- `docs/OFFLINE_COMPLETION.md`
- `docs/VERIFICATION.md`
- `docs/WINDOWS_CONTROL.md`
- `native/windows/Automation.cs`
- `native/windows/worker.ps1`
- `scripts/desktop-smoke.mjs`
- `server/computer/browser.ts`
- `server/computer/notepad.ts`
- `server/computer/windows.ts`
- `server/context-summary.ts`
- `server/engine.ts`
- `server/model-plan.ts`
- `server/model-provider.ts`
- `server/sample-repair.ts`
- `server/security.ts`
- `server/tools.ts`
- `shared/computer.ts`
- `shared/contracts.ts`
- `shared/notepad.ts`
- `tests/context-summary.test.ts`
- `tests/e2e/dashboard-session.ts`
- `tests/e2e/notepad.spec.ts`
- `tests/e2e/voice.spec.ts`
- `tests/e2e/workspace.spec.ts`
- `tests/notepad.test.ts`
- `tests/offline-security.test.ts`
- `tests/provider.test.ts`
- `tests/sample-repair.test.ts`
- `tests/voice-policy.test.ts`
