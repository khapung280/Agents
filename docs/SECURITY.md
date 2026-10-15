# Security and permissions

## Trust boundary

The local Node service is authoritative. UI state and model output cannot approve tools. The app binds to loopback only and rejects unexpected Host/Origin values. Browsers pair using a 256-bit token stored with owner-only file permissions. Sessions use HttpOnly, SameSite=Strict cookies and expire after 12 hours. Pairing attempts are rate-limited. The HTTP transport is appropriate only for loopback; do not bind this service to a public interface or put an unconfigured reverse proxy in front of it.

Electron disables renderer Node integration, isolates context, enables the renderer sandbox, blocks new windows and external navigation, and only permits audio requests from its own origin. The desktop launcher does not grant OS automation privileges.

## Tools and approvals

Each agent has an explicit tool allowlist in `shared/contracts.ts`. Typed plans are limited to ten ordered steps; dependencies must point backward, preventing cycles. Tools cannot be chosen from untrusted page content. Returned model plans are data until the owner requests execution. The central engine validates every plan again.

`workspace.write`, `model.draft`, `model.plan`, `browser.interact`, and native capture/launch/input tools require an immutable task-specific approval. Approval is consumed before executing. It cannot be reused or granted by Supervisor. The filesystem writer only creates new files, blocks absolute/traversing paths and symlink components, and verifies content by reading it back. There is no shell, arbitrary PowerShell, arbitrary process launch or unrestricted code execution tool.

The directory boundary assumes the same OS user is trusted. It is not a defense against another hostile process changing directory entries between checks; stronger OS isolation is required before supporting untrusted local co-tenants.

The three policy modes are saved in SQLite. Manual and Assisted both require explicit requests and approve consequential actions; Autonomous additionally executes owner-created recurring schedules. No mode bypasses approvals. Changing mode is not authority to discover and perform unrelated work.

## Browser network boundary

Tools accept exact configured hostnames, public HTTPS, standard port, and no embedded credentials. Private/reserved IPv4 and all IPv6 destinations are rejected. Hostnames are DNS-checked and pinned when Chromium launches. Every request is checked; only GET/HEAD is allowed. WebSockets, service workers, popups, downloads and nonproxied WebRTC UDP are blocked. Each session starts without account cookies; screenshots mask form controls.

The cloud host currently has proxy-only external networking and no direct public DNS. Browser tools fail closed here. The app does not silently relax public-address checks or disable TLS verification to get around that restriction. Run the browser worker on a suitably networked local machine or add a reviewed trusted public-egress proxy architecture in a subsequent task.

Chromium's OS sandbox is required by default. `AGENTS_BROWSER_NO_SANDBOX=1` is an explicit isolated-test escape hatch, not a recommended production setting. UI E2E uses no-sandbox inside the existing cloud container; it only visits the app and deterministic fixtures. This does not validate hostile public-page isolation.

## Model spending and data

OpenAI/Anthropic keys stay in server environment variables. The app supports standard HTTPS proxy routing without copying credentials into the frontend. The app checks a total dollar budget and a per-agent lifetime call cap, serializes paid calls, and reserves a conservative maximum token charge before network I/O. Reservations survive unknown outcomes, missing usage, parse errors, cancellation and crashes so spending is not silently forgotten. Completed calls record provider-reported tokens and a cost estimate from user-configured rates.

Unknown-cost reservations are intentionally conservative. They remain charged against the budget until the local administrator reconciles them with provider billing. The initial UI has no reconciliation editor. Do not delete reservations simply to continue spending. Refunds, cached-token pricing, reasoning-token nuances, taxes, tools and provider-side retries may affect invoices; recorded estimates are not invoices.

Only task objective/source text and explicitly dependent task outputs are sent to the selected model. No automatic global memory dump occurs. Logs redact common credential patterns, but this is not a complete DLP solution: avoid putting secrets or unrelated personal data into task text, memory or websites. Local SQLite and artifacts are protected by OS permissions, not application-level encryption. Use disk encryption and your OS secret manager for a hardened deployment.

## Stop, timeouts and recovery

Emergency stop is persisted. It aborts running tools, cancels pending work and prevents further requests/scheduler execution. A tool may already have performed a partial action before cancellation; inspect its evidence and workspace before retrying. Calls have a 45-second deadline; observations have at most one retry on a transient failure. Paid calls and file writes do not auto-retry. Running/planning steps interrupted by restart become blocked for explicit review. Idempotency keys and schedule claims prevent accidental duplication, not arbitrary distributed exactly-once guarantees.

## Boundaries still to implement

Actual Windows validation and hardening of the local allowlisted UI Automation worker; a remote service is not implemented; OS sandbox for generated code; secure OS keychain management; account-scoped email/calendar connectors; multi-user authentication and authorization; encryption/backup/retention policy; signed installers and updater; independent penetration testing. Do not deploy publicly or call this production-hardened until these are addressed.

## Windows execution phase

The fixed local PowerShell/C# worker accepts only typed JSON operations over stdin. It has no remote listener, arbitrary command text, launch arguments, or elevation path. Per-app allowlists, task approvals, session/project-scoped single-use observations, target/process/focus rechecks, and post-action evidence gate input. All ten agents delegate through Computer Agent. Native operations serialize, uncertain outcomes never auto-retry, and restart invalidates observations. The worker receives a minimal environment without model/proxy credentials.

Window capture masks identified password controls but cannot detect every secret in custom application content. Foreground/user interference remains a Windows input race, not an OS sandbox. Native source has not been compiled or executed on Windows in this cloud session. See [native boundaries and acceptance tests](WINDOWS_CONTROL.md).

The offline vision builder has no network or execution capability. Actual screenshot upload requires a future explicit data-sharing approval and paid-provider integration; no image is sent automatically.
