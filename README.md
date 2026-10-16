# ULTIMATE AGENTS — BOTH

**AGENTS OS** is a local-first command center with a real animated Three.js intelligence, ten specialized agent identities, durable workflows, scoped tools, approvals, and observable execution.

This repository is a working foundation, not a completed general-purpose autonomous computer operator. Built-in workflows run without a model. OpenAI is the selected optional provider; live API calls need configuration. The Windows control adapter is implemented but has not been validated on Windows. Connected email sending, live voice/language validation, general sandboxed coding, and production deployment remain incomplete. See [verification and phase status](docs/VERIFICATION.md).

## Windows desktop installation

A per-user Windows x64 installer and desktop shortcut are now supported. See [installation and native test steps](docs/WINDOWS_INSTALL.md). The package includes its runtime; no VS Code, Node installation, or API key is needed for built-in workflows. The installer can be cross-compiled in Linux; that does **not** verify Windows execution. Real-device acceptance remains pending.

## Start locally

Use Node **24 LTS**, npm, and a current desktop browser.

```bash
npm ci
npm run setup:desktop
npx playwright install chromium
npm run build
npm start
```

The service binds **127.0.0.1, port 4317**. Open that address in your local browser. Pair using the private contents of `.data/pairing-token`; do not paste it into chat or commit it. Electron pairs automatically.

```bash
npm run desktop
```

Electron runs its own service on port **4318** and stores data under the OS application-data directory. The browser service and desktop service intentionally have separate databases. Build first. A graphical desktop is required; the cloud environment can use the browser interface. No deployment or publishing happens automatically.

For hot reload:

```bash
npm run dev
```

On this prepared Linux cloud machine, Chromium is already installed at `/usr/bin/chromium`. Installation may require npm/Electron caches in a writable directory and Electron's documented proxy configuration. See [cloud setup](docs/SETUP.md).

## Try meaningful local workflows

- Enter a goal in the command bar with **Project Manager** selected. Inspect the generated persistent plan and Supervisor report.
- Open **New workflow**, select **Coordinate project, business & communication**. Project and Business run concurrently; Communication receives their outputs; Supervisor checks all steps.
- Open **Computer → Create workspace task**, select `workspace.write`, enter a relative path and content. The backend waits for approval, then creates a new file and reads it back. Existing files are never overwritten.
- Use **Developer Agent → code.review** with TypeScript text. Review actual compiler syntax diagnostics and emitted JavaScript. This does not execute code or claim full type checking.
- Add, correct, search, and delete scoped knowledge in **Knowledge**.
- Schedule a workspace inventory in **Calendar**. It runs only in **Autonomous** mode while the local service is active.
- Select **Browser Agent**, supply an allowed public HTTPS URL, and inspect actual page text/screenshot evidence. Browser tools require DNS, HTTPS egress and Chromium sandbox support.
- Use **Emergency stop** to cancel active/queued work and stop scheduling. Resume explicitly; cancelled workflows are not replayed.

## Windows control phase

The Computer Agent now has opt-in UI Automation, window capture, approved mouse/keyboard input, application launch, and postcondition verification. All ten agents delegate through the same controls. Native execution is disabled until a local Windows app policy is reviewed. No Windows PC control has been verified in this Linux workspace.

Read [Windows setup and native validation](docs/WINDOWS_CONTROL.md). `npm run test:windows` targets only a disposable Windows fixture and needs no API key. The offline vision builder sends nothing to OpenAI. Keep cloud environment configuration pending until Windows testing is reviewed.

## Model configuration

Copy `.env.example` to `.env` and configure it locally. Never commit `.env`.

```dotenv
AGENTS_MODEL_PROVIDER=openai
AGENTS_MODEL=gpt-4.1-mini
AGENTS_OPENAI_API_KEY=<enter securely in your local environment>
AGENTS_INPUT_PRICE_PER_MILLION=<verified model input rate>
AGENTS_OUTPUT_PRICE_PER_MILLION=<verified model output rate>
```

The model name is a configurable starting choice, not a claim of current availability for your account. Verify available models and current prices with OpenAI. `OPENAI_API_KEY` also works locally; the `AGENTS_` alias supports cloud secret bindings without using a reserved platform name. Do not put credentials in frontend variables.

Use `model.draft` for a provider-generated draft or **Project Manager → model.plan** for a typed workflow proposal. Approve the paid call, review the resulting plan, then choose **Execute reviewed plan**. Every step is revalidated, and protected tools still need their own approval. Anthropic's adapter is also present but has not been live-tested.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

E2E uses an isolated test database and a real Chromium browser. `CHROMIUM_PATH` overrides the executable; the cloud default is `/usr/bin/chromium`. Screenshots are in `artifacts/`. The tests include fixture-backed browser and provider checks, which are labeled separately from live integration checks.

## Repository map

```text
client/             React interface, modules, speech adapter, R3F face
server/             API, authenticated sessions, engine, SQLite, tools
shared/             Zod contracts and exactly ten agent definitions
desktop/            Hardened Electron launcher
tests/              Backend/security tests and Playwright journeys
docs/               Architecture, setup, security, costs and phase status
artifacts/          Screenshots from real executions
.data/              Private local runtime state (ignored by Git)
```

Read [architecture](docs/ARCHITECTURE.md), [agent guide](docs/AGENTS.md), [security](docs/SECURITY.md), [setup](docs/SETUP.md), and [verification/roadmap](docs/VERIFICATION.md).
