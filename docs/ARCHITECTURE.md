# ULTIMATE AGENTS — BOTH architecture

A single-owner, local-first application. The Node 24 service is the only authority for tasks, policy, approvals, memory, model credentials, and audit history. React is a projection of that state. Ten specialized identities execute typed tools within one bounded worker service; they are not ten always-running LLM processes.

## Services and boundaries

- **client/**: React + TypeScript + Vite, Three.js/R3F procedural facial surface, event-driven orbital agent graph, accessible operation panels. No API keys in the frontend.
- **shared/**: Zod input schemas, typed task/event contracts, agent registry and tool grants.
- **server/**: HTTP/session boundary, WebSocket snapshots, SQLite persistence, typed workflow engine, scheduler, tools and provider adapters. Model output is data and cannot grant permissions.
- **desktop/**: Electron launcher with sandboxed renderer, isolated context, no renderer Node access, restricted navigation. Uses the same local API.
- **tests/**: Node integration/security tests and Playwright user journeys/screenshots.
- **docs/**: setup, configuration, security, verification and phase record.

SQLite in WAL mode is intentional for a single local user: transactions, restart recovery and no required external infrastructure. Multi-user deployments should migrate to PostgreSQL with tenant-scoped access. Semantic embeddings/pgvector are deferred; current memory retrieval is scoped lexical search, explicitly labeled.

## Execution

Command → validated plan → parent workflow + dependent child tasks → per-agent permission check → immutable approval gate where required → bounded tool execution → persisted artifact → supervisor verification → completion event. Independent children can run concurrently, up to two tools. Events and task changes are persisted; WebSockets carry fresh bounded snapshots. Reconnect fetches current state, not assumed transient events.

Running tasks interrupted by restart become blocked for review. They are never automatically replayed. Queued idempotent work can resume. Approval attaches to one immutable task and is consumed once. Schedules store their next run transactionally before queuing; missed intervals coalesce to one run. Manual/assisted modes do not authorize recurring unattended work. Emergency stop is persisted and aborts active work, cancels queued work and pauses scheduling until explicitly reset.

## Security

Loopback binding, pairing-token exchange, HttpOnly SameSite session cookies, strict Origin/Host checks, request limits, Zod schemas, exact tool grants, task-scoped approvals, per-agent call limits, configurable token prices and budgets, bounded deadlines and payloads. No arbitrary shell tool. Browser requests use exact public HTTPS host allowlists, DNS address checks, interception of every request, blocked downloads/popups and no existing browser profile. Retrieved page text is untrusted data; tools are selected by typed plans, never source instructions.

## Phases and acceptance

1. Toolchain, schema and architecture: TypeScript/lint; registry has exactly ten agents.
2. Command center: real WebGL geometry, all nodes, operational navigation and honest empty states.
3. Orchestrator: persistent task/dependency transitions, recovery, approvals, cancellation, realtime.
4. Tools: actual scoped filesystem and deterministic Playwright observation; Windows-specific desktop control remains gated by Windows validation.
5. Ten identities: at least one real local tool per identity with output and supervisor checks. Provider-powered drafts are optional, never simulated.
6. Memory CRUD/search, speech capability detection, push-to-talk and synthesis. Live microphone/language validation requires owner hardware.
7. Persisted schedules, policy modes, budgets, pause/resume and stop.
8. Adaptive cinematic polish and reduced-motion settings.
9. Automated checks, real browser screenshots, security tests and explicit unresolved integration record.

No paid resources or external deployment are part of this implementation.

## Windows execution extension

`shared/computer.ts` defines native and browser actions. `server/computer/windows.ts` owns the local policy, short-lived observations, one-use action binding and execution receipts. It invokes the fixed `native/windows/worker.ps1` / `Automation.cs` pair in the interactive Windows session. A new native worker runs for each request; no remote control port exists. Task-specific approval precedes launch/capture/input, the engine serializes desktop work, and Supervisor checks completed evidence. Every specialist can delegate without receiving direct native grants.

`server/computer/browser.ts` applies one approved Playwright action and verifies its postcondition under the existing isolated network boundary. `server/computer/vision.ts` constructs offline image/reasoning requests only. `client/coreState.ts` maps actual service snapshots and local voice state onto the existing face states, with approval and emergency-stop priority. [Windows validation guide](WINDOWS_CONTROL.md) documents remaining platform testing.
