# Real AI brain: audit, implementation and next approval

## Evidence boundary

The owner reports that the installed Windows validation fixture passed on their Windows 11 laptop: native dispatch, independent postconditions, capture, cleanup and exit 0. This is owner-reported real-device fixture acceptance, not an independently observed unrestricted desktop test. The preceding Windows build is [run 38998963320](https://github.com/khapung280/Agents/actions/runs/38998963320), source `958980de422dc2e1f66ffe1ecfa1ee2420920afb`.

No paid model requests or screen uploads were made during this implementation. Provider tests intercept fetch and use explicit fixture responses. They establish integration behavior, not model intelligence or live account compatibility. Existing cloud configuration was read and left unchanged; no provider key is present in this runtime or saved binding.

## Audit of the existing implementation

| Component              | Operational before this phase                                                                                                           | Missing before this phase                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Windows Computer Agent | Allowlisted UIA/Win32 fixture, approval, bounded worker, image evidence, foreground/identity checks, no replay, emergency stop          | General app acceptance, Notepad save workflow, model-guided observation loop                               |
| Provider               | Optional OpenAI Chat Completions / Anthropic text request, token prices, total budget reservations                                      | Responses API, strict function proposals, daily cap, safe failed-output usage settlement                   |
| Planner                | Optional model JSON proposal and owner-reviewed DAG submission                                                                          | Model-output grant/dependency validation at generation boundary, reasoning options, bounded output parsing |
| Orchestrator           | SQLite task DAG, dependency outputs, two execution slots, one native operation at a time, approvals, reviewed retries, restart blocking | Central observation/replanning session, per-session capabilities, safe checkpoint resumption               |
| Ten agents             | Explicit responsibilities and tool registry, structured task input, evidence artifacts, Computer delegation                             | General business/account capabilities, arbitrary code execution, model reasoning in every specialist       |
| Vision                 | Real window images, offline request builder and image hash binding                                                                      | Image-sharing consent, live provider submission, screen-change analysis, visual verification loop          |
| Dashboard              | Existing cinematic face, ten nodes, actual WebSocket task history and activity                                                          | Distinct observing/verifying states and failed-call usage detail                                           |
| Recovery               | Bounded read-only retries; protected input never auto-replayed                                                                          | Model error analysis/replanning and reviewed recovery checkpoints                                          |

The local project plan and correspondence tools are explicitly deterministic scaffolds. Business defaults are illustrative assumptions; memory is lexical retrieval. Provider tests and computer transport fixtures are test doubles, not production fake activity. No production mock agent activity was added.

## Delivered in this change

### Phase A: Responses provider and structured planning — offline verified

- OpenAI requests use `/v1/responses`, `store:false`, configurable model, optional `reasoning.effort`, bounded `max_output_tokens`, and no hidden transport retries.
- `model.plan` requests exactly one strict `propose_workflow` function call. The function produces an owner-reviewable plan; it cannot invoke the OS. Drafts accept text output only.
- Schema, selected agent grants, paused agents, earlier-only dependency keys, step count, approved HTTPS hosts and relative workspace paths are validated before storing the proposal. Project scope comes from the initiating task, not model output. Native input and recursive planning are deliberately excluded from this static planning contract.
- Every existing agent can be selected through its current permitted tools. The central planner does not spawn ten model conversations. `model.draft` steps remain additional individually approved paid requests.
- The existing **Execute reviewed plan** action submits a real DAG. Engine permissions, file approvals, supervisor evidence checks, cancellation and emergency stop remain authoritative.
- Provider usage is persisted before output validation. Refusal, incomplete output, malformed plans and cancellation cannot erase confirmed token charges. Unknown outcomes retain reservations across restart and UTC midnight; no automatic replay.
- Cost estimates include the entire serialized request, schema and instructions, a conservative text-token allowance and maximum output (including reasoning). Cache tokens are recorded without assuming a discount. These are estimates from owner-configured standard token rates, not provider billing reconciliation or a guarantee against pricing changes.
- Existing total budget and per-agent limits remain. New UTC daily and per-workflow limits default to $1 and $0.25 respectively; zero blocks all paid work. Maximum plan steps defaults to eight. Each request has a 40-second deadline inside the engine's 45-second deadline and a 1 MiB response limit.
- Only supplied text and same-project upstream textual evidence enter the request. Screen/vision artifacts and image bytes are excluded. A 32 KB context cap fails visibly; there is no silent truncation or paid summarization. Full context summarization remains pending.
- Anthropic drafting remains supported with its own request/response contract; no live verification was performed.

### Phases B/C: offline safeguards only

The vision builder now requests strict structured output and disables provider response storage. The local proposal validator binds the current observation, rejects expired/wrong IDs, invented/disabled/password targets, unexpected foreground state, missing required postconditions and already-satisfied postconditions. It never executes the proposal. The existing native adapter must independently revalidate live process identity, target geometry, focus, permissions and postconditions at actual dispatch.

No screenshot transmission, screen interpretation, autonomous input or visual completion judgment is enabled. An image hash proves byte identity, not privacy. Existing masking does not establish that other private screen content is safe to share.

### Phase D: bounded planning through the existing ten-agent registry

Typed model proposals can coordinate existing tools across all ten identities. A test executes a fixture-produced dependency plan through the real engine, including separate file approval and read-back verification. This is not a live reasoning acceptance test or a dynamic replanning loop.

### Phase E: existing face retained

Real running `model.plan` maps to planning, observation tasks to observing, model drafts to thinking, and supervisor/output checks to verifying. Listening/speaking still depend on actual voice events. Approvals and emergency stop retain priority. Task details show actual provider-reported tokens and estimated cost even after a failed call. The mesh, dashboard layout and ten nodes are preserved.

### Phase F: tested failure boundaries

Tests cover disallowed tools/URLs/paths, project injection, cycles/forward references, duplicate calls, refusal/truncation, invalid/oversized responses, invalid usage, lost responses, daily/per-workflow budgets, persistent accounting, emergency stop with late responses, and explicit execution approval. No claim of comprehensive prompt-injection prevention or independent penetration testing is made. Untrusted content cannot grant capabilities; the deterministic permission boundary is authoritative.

## Configuration for a later approved live test

Keep the existing server-side provider/model/key configuration. Verify model availability and rates before a live test; there is no invented default reasoning model. The existing example `gpt-4.1-mini` is not a claim that it supports reasoning effort. Leave `AGENTS_REASONING_EFFORT` blank for models without that capability.

New optional settings in `.env.example`:

| Setting                    | Default | Purpose                                                         |
| -------------------------- | ------- | --------------------------------------------------------------- |
| `AGENTS_REASONING_EFFORT`  | unset   | Send only a documented effort supported by the configured model |
| `AGENTS_MAX_OUTPUT_TOKENS` | 1500    | 256–8192; includes reasoning output                             |
| `AGENTS_MAX_PLAN_STEPS`    | 8       | 1–8; engine still revalidates the plan                          |
| `AGENTS_DAILY_BUDGET_USD`  | 1       | UTC daily estimate cap, in addition to saved lifetime budget    |
| `AGENTS_TASK_BUDGET_USD`   | 0.25    | Aggregate cap for paid child tasks in one workflow              |

In the dashboard, choose Project Manager → `model.plan`, provide a goal and approved source text, then review the paid-call approval. Review the returned workflow before choosing **Execute reviewed plan**. Protected child actions require their own approval. This interface is prepared for a separately authorized small-budget live test; it was not used to spend money during development.

Usage estimates appear in task progress, and confirmed tokens/cost appear in task details. Unknown reservations are deliberately not cleared by retry or restart. They currently require local billing reconciliation before an operator changes accounting; there is no unsafe automatic reservation-reset button.

## Proposed next architecture — requires owner approval before implementation

The owner requested approval before significant architecture changes. The following bounded session design is concrete enough to review; it is not implemented or enabled:

1. Add a persistent `ReasoningSession` record: objective, project, dependency workflow IDs, verified evidence IDs, pending proposal, step/call counters, spend, deadline and checkpoint state. It wraps the existing Engine, rather than replacing it.
2. Add explicit `ScreenShareGrant` records tied to one task, one window/process identity, one image SHA-256 and expiry. Show the exact window capture before each external transfer. No full-desktop capture, ambient background vision or implicit grant from “allow application.” Secret/payment/private windows require explicit owner authorization and must otherwise be blocked. Do not promise pixel classification can reliably remove all private content.
3. Add an approved `model.vision` tool that uses that exact reviewed image plus bounded UIA metadata. It returns one typed proposal or a blocked/needs-observation outcome. It cannot submit arbitrary tool names, coordinates, shell commands, URLs, file paths or permission changes.
4. Bind each input proposal to a fresh observation and the existing task-scoped approval. Execute once via Computer Agent, then require fresh native postcondition evidence. Use a second model call only if visual interpretation is necessary. Start with explicit owner checkpoints; autonomous capability grants would be a later separately reviewed change.
5. Replan only after a failure has been classified and fresh evidence obtained. Never replay an uncertain mouse/key action. Default to eight steps, two replans, five minutes, one in-flight session/native action and the existing cost limits. A failed or ambiguous postcondition pauses for review; text saying “done” is insufficient.
6. On restart, block active sessions for review and invalidate screenshot/input grants. Emergency stop aborts the session, native worker and provider signal. Preserve uncertain spend and input receipts. No automatic resume.
7. Emit real session events into the existing dashboard. Store decisions and evidence references; do not request or display hidden chain-of-thought. Model summaries explain next actions without claiming facts beyond tool evidence.

The next change would add these records and tools within the existing Node/SQLite/Windows design, with no new orchestration framework, administrator privilege, paid SDK dependency or dashboard redesign. Approval of this design would authorize implementation and offline tests only, not paid API use or desktop input on the owner's machine.

## Acceptance workflow status

| Requested workflow                  | Verified now                                                                                       | Remaining acceptance                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A: Notepad note and save            | Scoped file creation/read-back and native controlled fixture (owner-reported)                      | Notepad version-specific UIA, safe Save As dialog/path policy, real-device run                         |
| B: Website research                 | Isolated browser fixtures, typed research/model-plan contract and citations from supplied evidence | Approved public website + live model report; factual/source review                                     |
| C: Fix sample repository            | Existing TypeScript syntax review and scoped exclusive write                                       | Isolated repository runner, patch approval, command allowlist and real tests; no arbitrary shell added |
| D: Research/business/project/report | Real local DAG coordination and fixture-generated reviewed-plan execution                          | Live model planning and evidence-based report quality                                                  |

Phase G installer preparation can package this code using the existing Windows workflow; native code is unchanged. A successful build is not acceptance of the new AI workflows. End-to-end autonomy remains incomplete until approved live provider tests and real Windows workflow tests pass.

## Official API references

Request fields were checked against the current official [OpenAI Responses SDK resource](https://github.com/openai/openai-node/blob/master/src/resources/responses/responses.ts) and [reasoning configuration types](https://github.com/openai/openai-node/blob/master/src/resources/shared.ts). The implementation uses the existing fetch transport rather than adding an SDK dependency. See also [function calling](https://developers.openai.com/api/docs/guides/function-calling), [reasoning](https://developers.openai.com/api/docs/guides/reasoning), and [vision](https://developers.openai.com/api/docs/guides/images-vision). The prose documentation host returned HTTP 403 in this environment; the official SDK source was accessible and inspected. Model-specific support and current pricing still require verification before any live call.

## Cloud validation of this implementation

- `npm run check`: 61 backend/security tests passed, plus type checking, lint and production build. Provider fixture tests use no live API access.
- `npm run test:e2e`: 12 browser journeys passed, including the real dashboard, all ten nodes, approvals, navigation and local tool workflows.
- `npm run test:desktop`: Linux/Xvfb Electron smoke passed: private-service pairing, real workflow completion, single-instance behavior, renderer isolation and shutdown.
- `npm run test:windows`: correctly reported NOT RUN on Linux and exited nonzero. The owner's earlier fixture PASS is separate evidence.
- Focused provider tests were rerun after tightening the final function-call completion-status check.

No native Windows input code, PowerShell policy, dependencies, lockfile, private credentials, unrelated repository or external deployment was changed. The screenshot proposal helper remains offline. Successful tests do not establish live model quality or general autonomous desktop acceptance.
