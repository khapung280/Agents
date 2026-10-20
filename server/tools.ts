import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lookup } from "node:dns/promises";
import ts from "typescript";
import { chromium } from "playwright";
import {
  requiresApproval,
  type Artifact,
  type Task,
  type Usage,
} from "../shared/contracts.js";
import { allowedUrl, publicAddress, redact, scopedPath } from "./security.js";
import { ComputerRequest, BrowserInteraction } from "../shared/computer.js";
import type { WindowsComputer } from "./computer/windows.js";
import { prepareVision } from "./computer/vision.js";
import { interactWithPage } from "./computer/browser.js";
import { Store } from "./store.js";
import { requestModel } from "./model-provider.js";
import { summarizeContext } from "./context-summary.js";
import { repairSample } from "./sample-repair.js";
import type { NotepadTests } from "./computer/notepad.js";
export { providerInfo } from "./model-provider.js";

export interface ToolResult {
  artifacts: Artifact[];
  verification: string;
  usage?: Usage;
}
export interface PageEvidence {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  links: number;
  screenshot: string;
  interactionVerification?: string;
}
export interface ToolContext {
  store: Store;
  computer?: WindowsComputer;
  notepad?: NotepadTests;
  signal: AbortSignal;
  upstream?: Task[];
  hosts: string[];
  browserPath?: string;
  browserNoSandbox?: boolean;
  inspect?: (
    url: string,
    task: Task,
    ctx: ToolContext,
  ) => Promise<PageEvidence>;
  progress: (message: string) => void;
}
export const jsonArtifact = (name: string, data: unknown): Artifact => ({
  id: randomUUID(),
  name,
  kind: "json",
  content: JSON.stringify(data, null, 2),
});
export const textArtifact = (name: string, text: string): Artifact => ({
  id: randomUUID(),
  name,
  kind: "text",
  content: redact(text),
});

export async function inspectPage(
  raw: string,
  task: Task,
  ctx: ToolContext,
): Promise<PageEvidence> {
  const url = await allowedUrl(raw, ctx.hosts);
  const mappings = [];
  for (const host of ctx.hosts) {
    try {
      await allowedUrl(`https://${host}`, ctx.hosts);
      const r = await lookup(host, { family: 4 });
      if (!publicAddress(r.address)) throw new Error("Unsafe DNS result");
      mappings.push(`MAP ${host} ${r.address}`);
    } catch {
      /* unresolvable hosts remain blocked by interception */
    }
  }
  ctx.signal.throwIfAborted();
  const browser = await chromium.launch({
    headless: true,
    executablePath: ctx.browserPath,
    chromiumSandbox: !ctx.browserNoSandbox,
    args: [
      `--host-resolver-rules=${mappings.join(",")}`,
      "--disable-dev-shm-usage",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
  });
  const abort = () => {
    void browser.close();
  };
  ctx.signal.addEventListener("abort", abort, { once: true });
  try {
    ctx.signal.throwIfAborted();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      try {
        const request = route.request();
        if (
          !["GET", "HEAD"].includes(request.method()) ||
          ["websocket", "media"].includes(request.resourceType())
        )
          return route.abort();
        await allowedUrl(request.url(), ctx.hosts);
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    page.on("popup", (p) => {
      void p.close();
    });
    page.on("dialog", (d) => {
      void d.dismiss();
    });
    ctx.progress(`Opening ${url.hostname} in an isolated browser`);
    const response = await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    if (!response || !response.ok())
      throw new Error(
        `Page retrieval failed (${response?.status() ?? "no response"})`,
      );
    await allowedUrl(page.url(), ctx.hosts);
    let interactionVerification: string | undefined;
    if (task.tool === "browser.interact") {
      ctx.progress(
        "Executing one approved browser action and checking its postcondition",
      );
      interactionVerification = await interactWithPage(
        page,
        BrowserInteraction.parse(task.input.browser),
        ctx.signal,
      );
      await allowedUrl(page.url(), ctx.hosts);
    }
    const data = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") || "",
      headings: Array.from(document.querySelectorAll("h1,h2"))
        .map((e) => e.textContent?.trim() || "")
        .slice(0, 30),
      text: (document.body?.innerText || "").slice(0, 20000),
      links: document.querySelectorAll("a[href]").length,
    }));
    // Fresh isolated context has no user account cookies or form input. Mask form controls nevertheless.
    const filename = `${task.id}.png`;
    await page.screenshot({
      path: join(ctx.store.directory, "artifacts", filename),
      mask: [page.locator('input,textarea,[contenteditable="true"]')],
      timeout: 5000,
    });
    ctx.signal.throwIfAborted();
    return {
      ...data,
      text: redact(data.text),
      screenshot: filename,
      interactionVerification,
    };
  } finally {
    ctx.signal.removeEventListener("abort", abort);
    await browser.close();
  }
}

async function modelDraft(task: Task, ctx: ToolContext): Promise<ToolResult> {
  const result = await requestModel(task, ctx);
  return {
    artifacts: [
      result.decision
        ? jsonArtifact("Vision decision", result.decision)
        : result.plan
          ? jsonArtifact("Proposed workflow", result.plan)
          : textArtifact("Model draft", result.content),
    ],
    verification: result.decision
      ? "Provider returned a typed decision for the approved image. No input occurred; any completion suggestion requires evidence and owner review."
      : result.plan
        ? "Provider returned a validated workflow proposal and token usage. Owner review is required before execution; no proposed actions occurred."
        : "Provider returned a draft and token usage. Factual claims require human review.",
    usage: result.usage,
  };
}

export async function executeTool(
  task: Task,
  ctx: ToolContext,
): Promise<ToolResult> {
  ctx.signal.throwIfAborted();
  if (requiresApproval(task.tool) && task.approval !== "consumed")
    throw new Error(
      "A consumed task-scoped approval is required for this tool.",
    );
  const { input } = task;
  const workspace = join(ctx.store.directory, "workspace");
  const result = (artifacts: Artifact[], verification: string): ToolResult => ({
    artifacts,
    verification,
  });
  switch (task.tool) {
    case "notepad.test": {
      if (!ctx.notepad) throw new Error("Notepad test adapter is unavailable.");
      const report = await ctx.notepad.run(task, ctx.signal, ctx.progress);
      return result(
        [
          jsonArtifact("Notepad document checkpoint", report.document),
          ...(report.observation
            ? [
                jsonArtifact("Windows observation", report.observation),
                {
                  id: randomUUID(),
                  name: "Windows window capture",
                  kind: "image" as const,
                  path: report.observation.screenshot,
                },
              ]
            : []),
        ],
        report.verification,
      );
    }
    case "code.sample.repair": {
      const report = await repairSample(task, ctx);
      return result(
        [
          jsonArtifact("Sample repair evidence", report),
          textArtifact("Exact sample patch", report.diff),
        ],
        report.verification,
      );
    }
    case "computer.observe":
    case "computer.launch":
    case "computer.act":
    case "computer.vision.prepare": {
      if (!ctx.computer)
        throw new Error("Windows execution adapter is unavailable.");
      const command = ComputerRequest.parse(input.computer);
      const expectedKind = {
        "computer.observe": "observe",
        "computer.launch": "launch",
        "computer.act": "act",
        "computer.vision.prepare": "vision",
      }[task.tool];
      if (command.kind !== expectedKind)
        throw new Error("Computer command does not match the authorized tool.");
      if (command.kind === "vision") {
        const observation = ctx.computer.observation(
          command.observationId,
          input.projectId,
        );
        const bundle = prepareVision(
          observation,
          task.objective,
          await ctx.computer.image(observation),
        );
        return result(
          [jsonArtifact("Offline vision review bundle", bundle)],
          "Prepared a local vision/reasoning contract from actual evidence. No provider request or PC action occurred.",
        );
      }
      const { observation, verification } = await ctx.computer.execute(
        command,
        input.projectId,
        task.id,
        ctx.signal,
        ctx.progress,
      );
      return result(
        [
          jsonArtifact("Windows observation", observation),
          {
            id: randomUUID(),
            name: "Windows window capture",
            kind: "image",
            path: observation.screenshot,
          },
        ],
        verification,
      );
    }
    case "computer.delegate":
      throw new Error(
        "Delegation must be resolved by the orchestrator before execution.",
      );
    case "workspace.inventory": {
      const entries = await readdir(workspace, { withFileTypes: true });
      return result(
        [
          jsonArtifact(
            "Workspace inventory",
            entries.map((e) => ({
              name: e.name,
              type: e.isDirectory()
                ? "directory"
                : e.isSymbolicLink()
                  ? "blocked symlink"
                  : "file",
            })),
          ),
        ],
        `Observed ${entries.length} entries in the authorized workspace.`,
      );
    }
    case "workspace.write": {
      const path = await scopedPath(workspace, input.path ?? "");
      if (!input.text) throw new Error("File content is required.");
      ctx.signal.throwIfAborted();
      await mkdir(join(path, ".."), { recursive: true });
      ctx.signal.throwIfAborted();
      // Exclusive create: never silently overwrite existing work.
      await writeFile(path, input.text, { flag: "wx", mode: 0o600 });
      const written = await readFile(path, "utf8");
      if (written !== input.text) throw new Error("File verification failed.");
      return result(
        [
          textArtifact(
            "File verification",
            `Created ${input.path}. Verified ${Buffer.byteLength(written)} bytes by reading the file back.`,
          ),
        ],
        "Exclusive file creation and read-back succeeded.",
      );
    }
    case "code.review": {
      let source = input.text;
      if (input.path)
        source = await readFile(
          await scopedPath(workspace, input.path),
          "utf8",
        );
      if (!source)
        throw new Error("Provide TypeScript source text or a workspace path.");
      const transpiled = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          strict: true,
        },
        reportDiagnostics: true,
        fileName: "review.ts",
      });
      const diagnostics = (transpiled.diagnostics ?? []).map((d) => ({
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      }));
      return result(
        [
          jsonArtifact("TypeScript syntax review", {
            diagnostics,
            lines: source.split("\n").length,
            scope:
              "Syntax/transpilation only. No program-wide type check or code execution.",
            transpiled: transpiled.outputText,
          }),
        ],
        `TypeScript compiler executed; ${diagnostics.length} syntax diagnostics. Findings are not a claim that the code is correct.`,
      );
    }
    case "browser.interact":
    case "browser.inspect":
    case "research.collect":
    case "marketing.audit": {
      if (!input.url) throw new Error("A public HTTPS source URL is required.");
      const page = await (ctx.inspect ?? inspectPage)(input.url, task, ctx);
      if (task.tool === "browser.interact" && !page.interactionVerification)
        throw new Error(
          "Browser action did not supply postcondition evidence.",
        );
      const artifacts: Artifact[] = [
        jsonArtifact("Source evidence", {
          url: page.url,
          retrievedAt: new Date().toISOString(),
          title: page.title,
          description: page.description,
          headings: page.headings,
          links: page.links,
          text: page.text,
        }),
        {
          id: randomUUID(),
          name: "Browser observation",
          kind: "image",
          path: page.screenshot,
        },
      ];
      if (task.tool === "marketing.audit")
        artifacts.unshift(
          jsonArtifact("On-page SEO audit", {
            source: page.url,
            checks: [
              {
                name: "Page title",
                pass: page.title.length > 0,
                value: page.title,
              },
              {
                name: "Meta description",
                pass: page.description.length > 0,
                value: page.description,
              },
              {
                name: "Heading present",
                pass: page.headings.length > 0,
                value: page.headings,
              },
            ],
            limitations:
              "This audit does not measure rankings, backlinks, traffic or performance.",
          }),
        );
      return result(
        artifacts,
        page.interactionVerification ??
          `Retrieved ${page.url} in Chromium; captured page text and screenshot. Sources are observations, not independently verified claims.`,
      );
    }
    case "business.brief": {
      const customers = input.customers ?? 10,
        price = input.price ?? 100,
        expenses = input.expenses ?? 200;
      return result(
        [
          jsonArtifact("Revenue scenarios", {
            basis:
              "User inputs where supplied; otherwise illustrative assumptions, not forecasts.",
            assumptions: { customers, price, expenses },
            scenarios: [0.5, 1, 1.5].map((f) => ({
              customers: Math.round(customers * f),
              revenue: Math.round(customers * f) * price,
              profit: Math.round(customers * f) * price - expenses,
            })),
            objective: task.objective,
          }),
        ],
        "Recomputed revenue and expense scenarios from the recorded assumptions.",
      );
    }
    case "communication.draft":
      return result(
        [
          textArtifact(
            "Correspondence draft",
            `Subject: ${task.objective}\n\nHello [recipient],\n\n${input.text ?? task.objective}${
              ctx.upstream?.length
                ? "\n\nUpstream task outputs for your review:\n" +
                  ctx.upstream
                    .filter(
                      (t) =>
                        t.input.projectId === input.projectId &&
                        !t.tool.startsWith("computer.") &&
                        t.tool !== "model.vision" &&
                        t.tool !== "notepad.test",
                    )
                    .map((t) =>
                      t.output
                        .filter(
                          (a) =>
                            a.content &&
                            a.kind !== "image" &&
                            !/Windows|vision/i.test(a.name),
                        )
                        .map((a) => a.content)
                        .join("\n"),
                    )
                    .join("\n")
                    .slice(0, 12000)
                : ""
            }\n\nPlease let me know the next steps and a suitable time to connect.\n\nBest regards,\n[Your name]\n\n— Template draft. Review recipients, facts and tone before sending. No message has been sent.`,
          ),
        ],
        "Prepared a local draft; no external delivery was attempted.",
      );
    case "project.plan": {
      const steps = [
        "Confirm scope and acceptance criteria",
        "Collect required inputs and evidence",
        "Execute the approved work",
        "Review deliverables and verify outcomes",
      ];
      const project =
        input.projectId === "personal"
          ? ctx.store.createProject(
              task.objective.slice(0, 100),
              task.objective,
            )
          : ctx.store.get<import("../shared/contracts.js").Project>(
              "project",
              input.projectId,
            );
      if (!project) throw new Error("Project does not exist.");
      project.milestones = steps;
      ctx.store.put("project", project.id, project);
      return result(
        [
          jsonArtifact("Project plan", {
            projectId: project.id,
            objective: task.objective,
            milestones: steps,
            method:
              "Deterministic planning scaffold; refine these milestones to your project.",
          }),
        ],
        "Project and four editable planning checkpoints persisted.",
      );
    }
    case "memory.summarize": {
      ctx.progress(
        "Summarizing local scoped evidence with source references; no model request",
      );
      const summary = summarizeContext({
        projectId: input.projectId,
        text: input.text,
        tasks: ctx.upstream?.length
          ? ctx.upstream
          : ctx.store
              .tasks()
              .filter(
                (t) =>
                  !t.workflow &&
                  t.id !== task.id &&
                  t.parentId !== task.parentId,
              ),
        memories: ctx.store.memories(),
      });
      return result(
        [jsonArtifact("Scoped context summary", summary)],
        `Retained ${summary.entries.length} source excerpts; ${summary.omittedSources} sources omitted and ${summary.excludedScreenArtifacts} screen artifacts excluded. Originals remain in local history.`,
      );
    }
    case "memory.search": {
      const terms = (input.text ?? task.objective)
        .toLowerCase()
        .normalize("NFC")
        .split(/[^\p{L}\p{N}\p{M}]+/u)
        .filter((w) => w.length > 2);
      const matches = ctx.store
        .memories()
        .filter((m) => m.scope === input.projectId)
        .map((m) => ({
          memory: m,
          score: terms.reduce(
            (n, t) =>
              n +
              Number(
                `${m.title} ${m.content}`
                  .normalize("NFC")
                  .toLowerCase()
                  .includes(t),
              ),
            0,
          ),
        }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return result(
        [
          jsonArtifact("Scoped memory results", {
            scope: input.projectId,
            method: "Lexical relevance; no embeddings",
            matches,
          }),
        ],
        `Searched only ${input.projectId}; found ${matches.length} matching memories.`,
      );
    }
    case "supervisor.verify": {
      if (
        task.dependsOn.some((id) => {
          const dependency = ctx.store.get<Task>("task", id);
          return !dependency || dependency.input.projectId !== input.projectId;
        })
      )
        throw new Error(
          "Supervisor dependencies must exist in the same project scope.",
        );
      const targets = task.dependsOn.length
        ? task.dependsOn
            .map((id) => ctx.store.get<Task>("task", id))
            .filter((t): t is Task => !!t)
        : ctx.store
            .tasks()
            .filter(
              (t) =>
                t.id !== task.id &&
                t.state === "completed" &&
                t.input.projectId === input.projectId,
            )
            .slice(0, 20);
      const checks = targets.map((t) => ({
        taskId: t.id,
        state: t.state,
        hasArtifacts: t.output.length > 0,
        verified: !!t.verification,
        pass:
          t.state === "completed" && t.output.length > 0 && !!t.verification,
      }));
      if (checks.some((c) => !c.pass))
        throw new Error("Supervisor found an incomplete dependent task.");
      return result(
        [
          jsonArtifact("Verification report", {
            checks,
            scope:
              "Checks completion records and tool evidence; does not independently establish factual truth.",
            reviewed: checks.length,
          }),
        ],
        `${checks.length} completed task records checked. ${checks.length === 0 ? "No prior work was available to review." : "All selected records include tool verification and artifacts."}`,
      );
    }
    case "model.draft":
    case "model.plan":
    case "model.vision":
      return modelDraft(task, ctx);
  }
}
