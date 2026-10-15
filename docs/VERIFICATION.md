# Verification and delivery status

This is a functioning local-first foundation for **ULTIMATE AGENTS — BOTH**. It does not meet the entire production-grade, general-purpose autonomous Windows/business-system definition of done yet. Unconnected integrations are not counted as working.

## Completed architecture milestones

| Phase                     | Delivered and checked                                                                                                                                                                 | Outstanding                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: Architecture/setup     | TypeScript, Vite, Node, Electron, lint/format, typed schemas, lockfile, documentation, tests                                                                                          | Production packaging/signing and CI hosting                                                                                                     |
| 2: Command center         | Live procedural 3D face, surface particles, orbital nodes, all navigation modules, command bar, agent/task details, honest metrics                                                    | More sophisticated rig/visemes and owner visual acceptance                                                                                      |
| 3: Orchestration          | Typed DAG workflows, two concurrent tool slots, dependent outputs, supervisor checks, SQLite history, restart blocking, idempotency, approval enforcement                             | Distributed workers and richer general-purpose planning strategies                                                                              |
| 4: Browser/computer tools | Scoped file inventory and approved creation; isolated Chromium inspector implementation; real fixture browser tests                                                                   | Public-site execution is blocked by this cloud host's direct DNS; Windows UI Automation adapter implemented; native Windows testing outstanding |
| 5: Ten agents             | Exactly ten identities, explicit grants, queues/history/errors, at least one tested local or fixture-backed tool per identity                                                         | Full real-world capability set and authenticated account integrations                                                                           |
| 6: Voice/memory           | Scoped searchable memory CRUD, speech-recognition/synthesis adapters, real microphone level analyzer, text fallback                                                                   | Live microphone, speech output, English/Nepali accuracy, wake word, offline STT; embeddings/pgvector                                            |
| 7: Autonomy/scheduling    | Persistent one-time/recurring schedules, policy mode, pause/resume, history, budget/call limits, emergency stop                                                                       | Remote worker service, OS background-service installer, richer scheduling/notifications                                                         |
| 8: Cinematic polish       | Shader particles on actual facial surface, features/contours, rings, actual-state effects, reduced motion, pause, software-renderer detection, frame-rate downgrade, resource cleanup | 60 FPS validation on target Windows hardware and advanced lip rig                                                                               |
| 9: Verification           | Type checking, lint, build, backend/security tests, Chromium E2E, Electron smoke, visual screenshots, dependency audit                                                                | Live paid-provider, external account, Windows automation and independent penetration testing                                                    |

## Test evidence

- `npm run check`: TypeScript and ESLint pass; all **32 backend/integration/security tests** pass; production client/server build passes.
- `npm run test:e2e`: **12 browser journeys** cover rendering and viewport geometry, every navigation destination, real workflow execution and retained history, memory correction/deletion, approval enforcement, emergency stop, policy settings, deterministic browser navigation, coordinated multi-agent work, project/schedule controls, typed Computer controls, and verified Playwright fill/click/key interactions with rejection tests.
- `npm run test:windows`: **NOT RUN on Windows**. Invoking it on Linux exits nonzero with the platform requirement. Native C#/PowerShell compilation and PC control remain unverified.
- `npm run test:desktop`: Electron **44.7.2** launches, pairs to its private service, renders the core, exposes no renderer `require`, and completes a real project workflow plus supervisor verification. Tested on Linux/Xvfb in the isolated cloud container. This is not a Windows validation result. Test-mode Chromium sandbox disabling is explicitly isolated to this environment.
- `bash scripts/cloud-install.sh`: frozen-lockfile installation, explicit Electron binary setup with checksum verification, build and backend tests executed successfully. Dependencies are reusable; the Electron 44 binary download uses Node's supported environment proxy.
- Development mode: Vite middleware page renders with no JavaScript page errors.
- `npm audit`: **0 known vulnerabilities** across runtime and development dependencies after upgrading Electron. The earlier version's findings were resolved. An audit result is not a security certification.
- Source review: no API keys in tracked files; no arbitrary shell tool; no forbidden product branding; no external deployment, publication, message sending or Git push.

Assertions check the actual outcome: no protected file before approval; consumed approval cannot be reused; unauthorized tools fail; traversal/symlink writes fail; memory is scope-filtered; untrusted content cannot register tools; cancellation prevents subsequent worker steps; restart does not replay in-flight actions; independent workers overlap and dependent workers receive actual artifacts.

The provider adapter test uses a deterministic response fixture to validate plan parsing, token accounting, budget rejection and uncertain-charge reservations. It does **not** establish OpenAI or Anthropic connectivity, account access, current model availability, or actual model output quality.

The Browser/Research/Marketing worker contract tests use explicit source fixtures. A separate real Chromium test navigates an intercepted, isolated fixture URL and records its actual rendered screenshot. These do **not** establish live public-site fetching through this cloud environment. Public network tasks currently fail closed on unavailable direct DNS.

## Screenshots and performance

Actual running-app captures (not generated mockups):

- `artifacts/dashboard-1920.png`: 1920 × 1080 target viewport.
- `artifacts/dashboard-1440.png`: laptop viewport.
- `artifacts/dashboard-1280.png`: smaller laptop viewport.
- `artifacts/dashboard-390.png`: narrow responsive layout.
- `artifacts/verified-workflow.png`: executed plan and evidence.
- `artifacts/coordinated-workflow.png`: multiple specialists and dependent outputs.
- `artifacts/electron-desktop.png`: real Electron workflow result.
- `artifacts/browser-fixture.png`: real rendering of the explicitly labeled browser test fixture.
- `artifacts/browser-interaction-fixture.png`: real Chromium interaction postcondition in a labeled fixture.
- `artifacts/computer-control-panel.png`: running Computer panel showing the actual Linux host limitation.

Viewport checks verify all ten orbital nodes, no node/label overlap, no horizontal overflow, and no JavaScript page errors. Smaller displays scroll rather than clip controls; the stop control remains available. Hardware performance is not certified. Initial SwiftShader software rendering was slow, which prompted automatic detail reduction and batching the orbital ticks into one draw call. Modal panels pause expensive rendering. The latest production-build profile at 1440 × 900 measured approximately 21 browser animation frames per second under SwiftShader after automatic quality reduction. See `artifacts/performance.json`; this measures browser animation cadence, not direct Three.js render count, a hardware GPU benchmark, or a 60 FPS claim.

## OpenAI and environment configuration

OpenAI is selected. The ignored local `.env` records the provider/model and Linux Chromium path, but contains no secret. The environment draft saves:

- `install_script` and `start_skill` with tested working directories and validation instructions.
- Provider/model requirements and two token-price variables.
- `AGENTS_OPENAI_API_KEY` as a secret requirement bound to `api.openai.com`.
- The secret destination adds `api.openai.com` to the draft's network access.

The `OPENAI_` prefix is reserved by the cloud platform, so the app uses `AGENTS_OPENAI_API_KEY`. Enter the actual key securely in environment settings, verify the model and token prices, then review/save and publish the environment when appropriate. The draft save does not supply credentials, apply runtime configuration, execute scripts, or publish anything. No new-task restoration is claimed.

## Next milestones

1. Configure OpenAI and prices, run one explicitly approved low-cost draft and one reviewed model plan, and verify usage against the provider response.
2. Run the browser worker on a machine with public DNS/HTTPS and a working OS sandbox. Validate allowed navigation, screenshots, redirects, denial of private networks, and cancellation against public test sites.
3. Run the implemented Windows native fixture harness and application acceptance matrix on an actual Windows machine; review results before enabling local app policies. A remote Windows service remains out of scope.
4. Validate microphone/STT/TTS on the owner's Windows machine; evaluate Nepali support with actual samples before enabling that language.
5. Add secure OS keychain integration, account-specific email/calendar connectors, external-action idempotency and receipt verification.
6. Add isolated coding workers, structured document ingestion, reviewed memory summaries, and optional PostgreSQL/pgvector when deployment scale warrants them.
7. Complete signed packaging, migrations/backups, retention limits, telemetry, load testing, and independent security review before production use.

## Windows integration phase update

The native UI Automation/Win32 worker, typed delegation across ten agents, one-use observations, guarded input, approved Playwright interactions and offline vision builder are implemented. Cloud tests use explicitly labeled native transport fixtures; they establish orchestration and boundary behavior, not Windows OS behavior. The native harness has not run on Windows. See [implementation audit and Windows acceptance guide](WINDOWS_CONTROL.md).

The previously saved environment draft remains pending and unchanged during this phase. No keys, prices, network rules, startup configuration, or publication were changed. No paid API call was made.
