# Setup and operations

## Prerequisites

Node 24, npm and a modern WebGL-capable browser. Electron 44 includes its own runtime for the desktop service. The project uses Node's built-in SQLite; no PostgreSQL, Redis or paid cloud resource is required for this single-owner workflow. No repository worktree is needed: cloud tasks already have an isolated checkout.

## Cloud environment

Working directory: `/workspace/Agents`.

```bash
mkdir -p /workspace/.cache/npm /workspace/.cache/electron
ELECTRON_GET_USE_PROXY=1 \
GLOBAL_AGENT_HTTPS_PROXY="$HTTPS_PROXY" \
GLOBAL_AGENT_HTTP_PROXY="$HTTP_PROXY" \
electron_config_cache=/workspace/.cache/electron \
XDG_CACHE_HOME=/workspace/.cache \
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
NODE_USE_ENV_PROXY=1 ELECTRON_GET_USE_PROXY=1 electron_config_cache=/workspace/.cache/electron XDG_CACHE_HOME=/workspace/.cache npm run setup:desktop
npm run build
npm test
npm start
```

The existing cloud Chromium is `/usr/bin/chromium`. The downloaded Electron artifact retains its package integrity verification. Do not disable TLS/checksum verification. For a fresh machine without system Chromium, use `npx playwright install chromium`; on Windows omit `CHROMIUM_PATH` to use Playwright's installed browser.

Health check: request `/api/health` on loopback port 4317 and expect `{"status":"ok","application":"AGENTS OS"}`. A health check alone does not establish workflow readiness. Pair, create a Computer Agent inventory task, wait for the parent workflow to complete, then inspect its inventory and Supervisor report. The backend test suite does this against temporary storage.

For UI verification run `npm run test:e2e`. It starts a separate service on 4319 with a temporary test-only database; your `.data` is not used. The E2E Chromium process uses SwiftShader in this cloud container; screenshots and frame timing do not represent hardware GPU performance. It does not establish 60 FPS on your Windows computer.

## Local Windows setup

```powershell
npm ci
npm run setup:desktop
npx playwright install chromium
Copy-Item .env.example .env
# Edit .env securely. Remove the Linux CHROMIUM_PATH line.
npm run build
npm run desktop
```

The Windows UI Automation adapter and disposable native test harness are implemented but not Windows-validated. Start with `npm run test:windows` on an actual interactive Windows machine; follow [Windows control](WINDOWS_CONTROL.md) before enabling a local app policy. No API key is required. Cloud configuration changes remain pending during this phase.

## Runtime state

- Browser service: `.data/agents.sqlite`, `.data/workspace`, `.data/artifacts`, `.data/pairing-token`.
- Electron: the Electron OS user-data directory, under `agents-data`.
- Credentials: injected environment variables or an ignored `.env`. They are not stored in SQLite or the browser bundle.
- Session cookies are intentionally runtime-only. Pair again after a service restart.
- Back up after stopping the service, or use SQLite's online backup mechanism. Copying only the main database while WAL writes are active can lose records.

Retained files survive a snapshot; processes do not. Future cloud tasks must start the service explicitly. Running services and network/microphone connections are not evidence that a published or fresh-task environment works. No environment publication was performed by this task.

## Network and providers

Installation needs npm registry hosts and Electron's GitHub release asset hosts. Browser automation needs exact public hosts in `AGENTS_ALLOWED_HOSTS`, public DNS resolution and HTTPS access. The cloud host uses a managed HTTP proxy and does not expose normal public DNS; public browser tasks currently fail closed. This is separate from the successful local UI browser tests.

OpenAI is selected. Configure `AGENTS_OPENAI_API_KEY`, `AGENTS_MODEL_PROVIDER=openai`, the model name and verified pricing rates in environment settings/local `.env`. Cloud secret destinations should include `api.openai.com`. Node model requests use the standard managed proxy. The `OPENAI_API_KEY` alias is supported locally, but cloud configuration reserves platform names beginning `OPENAI_`, hence the app-specific alias.

For Anthropic use `AGENTS_MODEL_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, a supported model and verified pricing. No real provider request has been made during this build. Proxy-bound keys must only be used through their authorized HTTPS destination.

## Costs

Built-in local tools use no model tokens. Electricity, storage and machine hosting are separate costs.

For the selected OpenAI model:

`estimated USD = input_tokens × input_USD_per_million / 1,000,000 + output_tokens × output_USD_per_million / 1,000,000`

A workload of 100 calls with 2,000 input and 500 output tokens per call therefore costs `0.20 × input_rate + 0.05 × output_rate` USD before other charges. This is a workload calculation, not a current provider quote. Verify model availability/prices at OpenAI before entering them. No prices are invented or hardcoded. The default total budget is $5 and the default call cap is 20 per agent; both can be lowered in Settings.

## Troubleshooting

- **401**: pair this browser using the token file. Do not expose the token in logs.
- **403 Host/Origin**: use loopback directly; do not disable the checks for remote access.
- **DNS/Chromium sandbox error**: public browsing requires a suitable worker machine; the local app remains usable.
- **Model unavailable**: confirm variable presence, model name, destination access and prices. Never paste secret values into chat.
- **Blocked after restart**: inspect prior evidence and side effects, then retry the affected step as a new workflow. Old approvals are not replayed.
- **Stopped system**: click Resume system. Cancelled work stays cancelled.
- **Voice unavailable**: use text. Browser recognition may use a remote browser-vendor service; microphone permission does not establish language accuracy or offline speech support.
