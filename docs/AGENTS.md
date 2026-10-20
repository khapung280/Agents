# Agent configuration guide

The ten identities are registered in `shared/contracts.ts`. They share one bounded local worker service, with up to two concurrent tool calls. “Ready” means a worker accepts a request; it does not mean every possible desktop, model or account integration is connected. Open agent details to see exactly which tools exist.

| Agent               | Implemented capability                                                                | Limit                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Computer Agent      | Scoped files; approved Windows UI Automation, capture, input and launch               | Native adapter requires actual Windows validation and local allowlist                                 |
| Browser Agent       | Isolated Chromium observation and screenshot                                          | Requires allowed public DNS/HTTPS and sandbox support                                                 |
| Developer Agent     | TypeScript review; approved fixed sample repair with real tests; optional model draft | Sample repair uses only a bundled disposable project; no arbitrary repository execution or deployment |
| Research Agent      | Cited source extraction; optional model draft                                         | Single supplied URL per tool call; source observations are not factual verification                   |
| Business Agent      | Recorded-input financial scenarios; optional model draft                              | Default numbers are explicitly illustrative assumptions                                               |
| Marketing Agent     | Real page title/description/heading/link audit; optional model draft                  | No rank/traffic data, paid ads or publishing                                                          |
| Communication Agent | Local template draft or optional model draft; consumes upstream outputs               | No account connected, no sending                                                                      |
| Project Manager     | Persistent scaffold/milestones; optional model draft and typed model plan             | Built-in scaffold is deterministic, not LLM reasoning                                                 |
| Memory Agent        | Unicode scope-filtered retrieval; bounded local summaries with citations              | Deterministic extraction; no embeddings or semantic inference                                         |
| Supervisor Agent    | Dependency completion/evidence validation                                             | Cannot approve actions; not independent factual verification                                          |

Use Settings to pause agents and change the persisted autonomy policy, total model budget and per-agent call cap. Pausing an agent aborts its running tool and blocks it for review. Queued requests wait until the agent is enabled. Failed/blocked steps can be retried as a new workflow after review; retries are not hidden resumes.

The command bar selects a specialist explicitly. New workflow also offers a real coordinated plan: Project and Business run independently, Communication receives their output artifacts, and Supervisor waits for all three. For arbitrary dependency graphs, use the typed `POST /api/workflows` API or an owner-reviewed `model.plan` output.

Memory has an explicit `personal` or project-ID scope. The owner can review/edit/delete memories in Knowledge. Untrusted source instructions are rendered as text, never HTML and never executable tool grants.

The agent/tool registry is source-controlled. Adding a tool requires an implementation, input checks, permission grant, approval decision, cancellation behavior and meaningful tests. Do not allow an LLM to register its own tools or change permissions.

Every identity can use `computer.delegate` to request a typed operation through Computer Agent. The engine creates a separate Computer execution step, preserves approval and project scope, and runs Supervisor afterward. Direct native tool grants stay with Computer Agent. See [Windows control and validation](WINDOWS_CONTROL.md).
