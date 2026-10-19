import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  agents,
  requiresApproval,
  TaskInput,
  WorkflowInput,
  type Policy,
  type Snapshot,
  type Task,
  type TaskRequest,
  type ToolName,
} from "../shared/contracts.js";
import { Store } from "./store.js";
import {
  executeTool,
  providerInfo,
  type ToolContext,
  type ToolResult,
} from "./tools.js";
import { WindowsComputer } from "./computer/windows.js";
import { redact } from "./security.js";

const terminal = (t: Task) =>
  ["completed", "failed", "cancelled"].includes(t.state);
const defaultTool: Record<TaskRequest["agent"], ToolName> = {
  computer: "workspace.inventory",
  browser: "browser.inspect",
  developer: "code.review",
  research: "research.collect",
  business: "business.brief",
  marketing: "marketing.audit",
  communication: "communication.draft",
  project: "project.plan",
  memory: "memory.search",
  supervisor: "supervisor.verify",
};
export class Engine extends EventEmitter {
  readonly computer: WindowsComputer;
  active = new Map<string, AbortController>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;
  private closed = false;
  private started = Date.now();
  constructor(
    public store: Store,
    public options: {
      hosts: string[];
      computer?: WindowsComputer;
      browserPath?: string;
      browserReady?: boolean;
      browserNoSandbox?: boolean;
      runner?: (task: Task, ctx: ToolContext) => Promise<ToolResult>;
    },
  ) {
    super();
    this.computer = options.computer ?? new WindowsComputer(store);
    mkdirSync(join(store.directory, "workspace"), { recursive: true });
    mkdirSync(join(store.directory, "artifacts"), { recursive: true });
    for (const task of store.tasks())
      if (
        ["running", "planning", "retrying"].includes(task.state) ||
        (!task.workflow &&
          requiresApproval(task.tool) &&
          task.approval === "approved")
      ) {
        task.state = "blocked";
        task.error =
          "Service restarted during execution. Review evidence before explicitly retrying; protected actions were not replayed.";
        store.put("task", task.id, task);
        store.event("task.blocked", task.error, task);
      }
  }
  start() {
    this.timer = setInterval(() => void this.tick(), 300);
    void this.tick();
  }
  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    for (const c of this.active.values()) c.abort();
    while (this.active.size) await new Promise((r) => setTimeout(r, 10));
  }
  changed() {
    this.emit("change");
  }
  event(type: string, message: string, task?: Task) {
    this.store.event(type, redact(message), task);
    this.changed();
  }
  save(task: Task) {
    this.store.put("task", task.id, task);
  }
  private validateComputer(input: TaskRequest, tool: ToolName) {
    if (tool === "browser.interact" && (!input.browser || !input.url))
      throw new Error(
        "Browser interaction requires a URL, action, and postcondition.",
      );
    if (!tool.startsWith("computer.")) return;
    if (!input.computer)
      throw new Error("A typed computer request is required.");
    const expected = (
      {
        "computer.observe": "observe",
        "computer.launch": "launch",
        "computer.act": "act",
        "computer.vision.prepare": "vision",
      } as Partial<Record<ToolName, string>>
    )[tool];
    if (expected && input.computer.kind !== expected)
      throw new Error("Computer tool and command differ.");
    if (input.computer.kind !== "vision" && !this.computer.status().available)
      throw new Error(this.computer.status().reason);
  }
  private delegate(input: TaskRequest): TaskRequest {
    if (input.tool !== "computer.delegate") return input;
    const tool = {
      observe: "computer.observe",
      launch: "computer.launch",
      act: "computer.act",
      vision: "computer.vision.prepare",
    }[input.computer!.kind] as ToolName;
    if (!this.store.policy().agents.computer)
      throw new Error("Computer Agent is paused.");
    return { ...input, agent: "computer", tool };
  }
  private make(
    input: TaskRequest,
    parentId: string | null,
    workflow = false,
  ): Task {
    const tool = input.tool ?? defaultTool[input.agent];
    return {
      workflow,
      id: randomUUID(),
      parentId,
      agent: input.agent,
      tool,
      objective: input.objective,
      input,
      state: requiresApproval(tool) ? "waiting_approval" : "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      retries: 0,
      maxRetries: [
        "browser.inspect",
        "research.collect",
        "marketing.audit",
      ].includes(tool)
        ? 1
        : 0,
      output: [],
      verification: null,
      error: null,
      usage: null,
      approval: requiresApproval(tool) ? "pending" : "not_required",
      dependsOn: input.dependsOn,
    };
  }
  submit(raw: unknown, key?: string): Task {
    const input = TaskInput.parse(raw),
      policy = this.store.policy();
    if (key) {
      const existing = this.store.get<{ id: string; request: string }>(
        "idempotency",
        key,
      );
      if (existing) {
        if (existing.request !== JSON.stringify(input))
          throw new Error("Idempotency key belongs to a different request.");
        return this.store.get<Task>("task", existing.id)!;
      }
    }
    if (policy.stopped)
      throw new Error("Emergency stop is active. Resume the system first.");
    if (!policy.agents[input.agent]) throw new Error("This agent is paused.");
    const tool = input.tool ?? defaultTool[input.agent];
    if (!agents.find((a) => a.id === input.agent)!.tools.includes(tool))
      throw new Error("Agent is not authorized for that tool.");
    if (input.dependsOn.some((id) => !this.store.get<Task>("task", id)))
      throw new Error("Dependency does not exist.");
    if (tool.startsWith("model.") && !providerInfo().configured)
      throw new Error(
        "No model provider is configured. Use a built-in tool or configure a provider.",
      );
    this.validateComputer(input, tool);
    const delegated = this.delegate(input);
    return this.store.transaction(() => {
      const root = this.make(input, null, true);
      root.state = "planning";
      root.approval = "not_required";
      this.save(root);
      const work = this.make(delegated, root.id);
      this.save(work);
      if (delegated.agent !== "supervisor") {
        const review = this.make(
          {
            ...input,
            agent: "supervisor",
            tool: "supervisor.verify",
            objective: `Verify: ${input.objective}`,
            dependsOn: [work.id],
          },
          root.id,
        );
        review.state = "waiting_dependencies";
        this.save(review);
      }
      if (key)
        this.store.put("idempotency", key, {
          id: root.id,
          request: JSON.stringify(input),
        });
      this.store.event("task.created", input.objective, root);
      this.store.event(
        "workflow.delegated",
        `Assigned ${work.tool} to ${agents.find((a) => a.id === work.agent)!.name} for ${input.agent}`,
        work,
      );
      if (work.approval === "pending")
        this.store.event(
          "task.approval_required",
          `Approval required for ${tool}`,
          work,
        );
      queueMicrotask(() => {
        this.changed();
        void this.tick();
      });
      return root;
    });
  }
  submitWorkflow(raw: unknown, key?: string): Task {
    const plan = WorkflowInput.parse(raw);
    const policy = this.store.policy();
    if (key) {
      const old = this.store.get<{ id: string; request: string }>(
        "idempotency",
        key,
      );
      if (old) {
        if (old.request !== JSON.stringify(plan))
          throw new Error("Idempotency key belongs to a different request.");
        return this.store.get<Task>("task", old.id)!;
      }
    }
    if (policy.stopped) throw new Error("Emergency stop is active.");
    const keys = new Set<string>();
    for (const step of plan.steps) {
      if (keys.has(step.key) || step.after.some((dep) => !keys.has(dep)))
        throw new Error(
          "Workflow keys must be unique and dependencies must reference earlier steps.",
        );
      if (!policy.agents[step.request.agent])
        throw new Error(`Agent ${step.request.agent} is paused.`);
      const tool = step.request.tool ?? defaultTool[step.request.agent];
      if (
        !agents.find((a) => a.id === step.request.agent)!.tools.includes(tool)
      )
        throw new Error("Agent is not authorized for that tool.");
      if (tool.startsWith("model.") && !providerInfo().configured)
        throw new Error("No model provider is configured.");
      this.validateComputer(step.request, tool);
      this.delegate(step.request);
      if (step.request.dependsOn.length)
        throw new Error("Use plan step keys for workflow dependencies.");
      keys.add(step.key);
    }
    return this.store.transaction(() => {
      const root = this.make(
        TaskInput.parse({ objective: plan.objective, agent: "project" }),
        null,
        true,
      );
      root.state = "planning";
      this.save(root);
      const ids = new Map<string, string>();
      const work: Task[] = [];
      for (const step of plan.steps) {
        const task = this.make(
          {
            ...this.delegate(step.request),
            dependsOn: step.after.map((key) => ids.get(key)!),
          },
          root.id,
        );
        ids.set(step.key, task.id);
        work.push(task);
        this.save(task);
        this.store.event(
          "workflow.delegated",
          `Assigned ${task.tool} to ${task.agent}`,
          task,
        );
      }
      const review = this.make(
        TaskInput.parse({
          objective: `Verify: ${plan.objective}`,
          agent: "supervisor",
          tool: "supervisor.verify",
          dependsOn: work.map((t) => t.id),
        }),
        root.id,
      );
      review.state = "waiting_dependencies";
      this.save(review);
      if (key)
        this.store.put("idempotency", key, {
          id: root.id,
          request: JSON.stringify(plan),
        });
      this.store.event("task.created", plan.objective, root);
      queueMicrotask(() => {
        this.changed();
        void this.tick();
      });
      return root;
    });
  }
  approve(id: string, approve: boolean) {
    const task = this.store.get<Task>("task", id);
    if (
      !task ||
      task.state !== "waiting_approval" ||
      task.approval !== "pending"
    )
      throw new Error("No pending approval for this task.");
    if (this.store.policy().stopped) throw new Error("System is stopped.");
    task.approval = approve ? "approved" : "rejected";
    task.state = approve ? "queued" : "cancelled";
    if (!approve) task.finishedAt = new Date().toISOString();
    this.save(task);
    this.event(
      approve ? "approval.granted" : "approval.rejected",
      `${task.tool}: ${approve ? "approved for one execution" : "rejected"}`,
      task,
    );
    void this.tick();
  }
  cancel(id: string) {
    const targets = this.store
      .tasks()
      .filter((t) => (t.id === id || t.parentId === id) && !terminal(t));
    for (const t of targets) {
      this.active.get(t.id)?.abort();
      t.state = "cancelled";
      t.finishedAt = new Date().toISOString();
      this.save(t);
      this.event("task.cancelled", "Cancelled by owner", t);
    }
  }
  retry(id: string) {
    const t = this.store.get<Task>("task", id);
    if (!t || t.workflow || !["failed", "blocked"].includes(t.state))
      throw new Error("Only failed or blocked execution steps can be retried.");
    return this.submit({ ...t.input, dependsOn: [] });
  }
  setPolicy(changes: Partial<Policy>) {
    const policy = { ...this.store.policy(), ...changes };
    this.store.put("config", "policy", policy);
    this.event("policy.updated", `Policy updated; mode ${policy.mode}`);
    for (const [id, c] of this.active) {
      const t = this.store.get<Task>("task", id)!;
      const parent = t.parentId
        ? this.store.get<Task>("task", t.parentId)
        : undefined;
      if (!policy.agents[t.agent] || (parent && !policy.agents[parent.agent])) {
        c.abort();
        t.state = "blocked";
        t.error = "Agent paused by owner.";
        this.save(t);
      }
    }
    return policy;
  }
  stop() {
    this.store.put("config", "policy", {
      ...this.store.policy(),
      stopped: true,
    });
    for (const t of this.store.tasks()) if (!terminal(t)) this.cancel(t.id);
    this.event(
      "system.stopped",
      "Emergency stop engaged. New tool execution and schedules are blocked.",
    );
  }
  resume() {
    this.store.put("config", "policy", {
      ...this.store.policy(),
      stopped: false,
    });
    this.event(
      "system.resumed",
      "System resumed; cancelled workflows are not replayed.",
    );
  }
  async tick() {
    if (this.closed || this.ticking) return;
    this.ticking = true;
    try {
      const policy = this.store.policy();
      if (policy.stopped) return;
      if (policy.mode === "autonomous")
        for (const schedule of this.store.schedules()) {
          if (schedule.paused || Date.parse(schedule.nextRun) > Date.now())
            continue;
          const tool =
            schedule.request.tool ?? defaultTool[schedule.request.agent];
          if (requiresApproval(tool)) {
            schedule.paused = true;
            this.store.put("schedule", schedule.id, schedule);
            this.event(
              "schedule.blocked",
              "Schedule paused: protected tools require an interactive request.",
            );
            continue;
          }
          if (!policy.agents[schedule.request.agent]) continue;
          this.store.transaction(() => {
            const prior = schedule.nextRun;
            schedule.paused = schedule.intervalMinutes === null;
            schedule.nextRun = new Date(
              Date.now() + (schedule.intervalMinutes ?? 0) * 60000,
            ).toISOString();
            this.store.put("schedule", schedule.id, schedule);
            // submit opens a transaction, so schedule claims are committed before it is called below.
            this.store.put("schedule_claim", schedule.id, {
              request: schedule.request,
              key: `schedule:${schedule.id}:${prior}`,
            });
          });
        }
      if (policy.mode === "autonomous")
        for (const claim of this.store.list<{
          request: TaskRequest;
          key: string;
        }>("schedule_claim")) {
          const scheduleId = claim.key.split(":")[1];
          const task = this.submit(claim.request, claim.key);
          const schedule = this.store.get<
            import("../shared/contracts.js").Schedule
          >("schedule", scheduleId);
          if (schedule) {
            schedule.lastTaskId = task.id;
            this.store.put("schedule", schedule.id, schedule);
          }
          this.store.remove("schedule_claim", scheduleId);
          this.event("schedule.started", "Scheduled workflow started", task);
        }
      this.aggregate();
      for (const task of this.store.tasks().reverse()) {
        if (this.active.size >= policy.maxConcurrent) break;
        if (
          task.workflow ||
          !["queued", "waiting_dependencies", "retrying"].includes(
            task.state,
          ) ||
          !policy.agents[task.agent] ||
          (task.parentId &&
            !policy.agents[this.store.get<Task>("task", task.parentId)!.agent])
        )
          continue;
        const deps = task.dependsOn.map((id) =>
          this.store.get<Task>("task", id),
        );
        if (
          deps.some(
            (d) => !d || ["failed", "cancelled", "blocked"].includes(d.state),
          )
        ) {
          task.state = "blocked";
          task.error =
            "A dependency did not complete. Review the upstream task.";
          this.save(task);
          this.event("task.blocked", task.error, task);
          continue;
        }
        if (deps.some((d) => d?.state !== "completed")) {
          if (task.state !== "waiting_dependencies") {
            task.state = "waiting_dependencies";
            this.save(task);
          }
          continue;
        }
        // Serialize all native operations; independent agents cannot race for desktop focus.
        if (
          task.tool.startsWith("computer.") &&
          [...this.active.keys()].some((id) =>
            this.store.get<Task>("task", id)?.tool.startsWith("computer."),
          )
        )
          continue;
        // Serialize paid calls so budget reservations cannot race.
        if (
          task.tool.startsWith("model.") &&
          [...this.active.keys()].some((id) =>
            this.store.get<Task>("task", id)?.tool.startsWith("model."),
          )
        )
          continue;
        if (requiresApproval(task.tool) && task.approval !== "approved") {
          task.state = "waiting_approval";
          task.approval = "pending";
          this.save(task);
          continue;
        }
        void this.run(task);
      }
    } catch (e) {
      this.event(
        "system.error",
        e instanceof Error ? e.message : "Scheduler error",
      );
    } finally {
      this.ticking = false;
    }
  }
  private aggregate() {
    for (const root of this.store
      .tasks()
      .filter((t) => t.workflow && !terminal(t) && t.state !== "blocked")) {
      const children = this.store.tasks().filter((t) => t.parentId === root.id);
      if (!children.length) continue;
      let state: Task["state"] = "running";
      if (children.some((t) => t.state === "waiting_approval"))
        state = "waiting_approval";
      else if (children.some((t) => t.state === "failed")) state = "failed";
      else if (children.some((t) => t.state === "cancelled"))
        state = "cancelled";
      else if (children.some((t) => t.state === "blocked")) state = "blocked";
      else if (children.every((t) => t.state === "completed"))
        state = "completed";
      if (state !== root.state) {
        root.state = state;
        if (terminal(root)) {
          root.finishedAt = new Date().toISOString();
          root.output = children
            .slice()
            .reverse()
            .flatMap((t) => t.output);
          root.verification =
            state === "completed"
              ? "All execution steps and supervisor checks completed."
              : null;
          root.error = children.find((t) => t.error)?.error ?? null;
        }
        this.save(root);
        this.event(
          `task.${state}`,
          `${root.objective}: ${state.replaceAll("_", " ")}`,
          root,
        );
      }
    }
  }
  private async run(task: Task) {
    const controller = new AbortController();
    this.active.set(task.id, controller);
    task.state = "running";
    task.startedAt = new Date().toISOString();
    if (task.approval === "approved") task.approval = "consumed";
    this.save(task);
    this.event("agent.started", `Executing ${task.tool}`, task);
    const timer = setTimeout(
      () => controller.abort(new Error("Tool deadline exceeded (45 seconds)")),
      45000,
    );
    try {
      if (!agents.find((a) => a.id === task.agent)!.tools.includes(task.tool))
        throw new Error("Tool permission denied.");
      const upstream = task.dependsOn
        .map((id) => this.store.get<Task>("task", id))
        .filter((t): t is Task => !!t && t.state === "completed");
      const result = await (this.options.runner ?? executeTool)(task, {
        store: this.store,
        signal: controller.signal,
        upstream,
        ...this.options,
        computer: this.computer,
        progress: (message) => this.event("task.progress", message, task),
      });
      // Preserve usage even when cancellation arrives after the provider processed a call.
      const fresh = this.store.get<Task>("task", task.id)!;
      if (result.usage) {
        fresh.usage = result.usage;
        this.save(fresh);
      }
      if (controller.signal.aborted || fresh.state !== "running") return;
      if (!result.artifacts.length || !result.verification)
        throw new Error("Tool did not provide evidence and verification.");
      task.output = result.artifacts;
      task.verification = result.verification;
      task.usage = result.usage ?? null;
      task.state = "completed";
      task.finishedAt = new Date().toISOString();
      this.save(task);
      this.event("agent.completed", result.verification, task);
    } catch (e) {
      const fresh = this.store.get<Task>("task", task.id)!;
      if (fresh.state !== "running") return;
      task.usage = fresh.usage;
      const message = redact(
        e instanceof Error ? e.message : "Tool execution failed",
      );
      task.error = message;
      if (
        !controller.signal.aborted &&
        task.retries < task.maxRetries &&
        /timeout|temporar|ECONNRESET/i.test(message)
      ) {
        task.retries++;
        task.state = "retrying";
        this.save(task);
        this.event(
          "task.retrying",
          `Transient failure; bounded retry ${task.retries}`,
          task,
        );
      } else {
        task.state = "failed";
        task.finishedAt = new Date().toISOString();
        this.save(task);
        this.event("agent.failed", message, task);
      }
    } finally {
      clearTimeout(timer);
      this.active.delete(task.id);
      this.aggregate();
      this.changed();
    }
  }
  snapshot(): Snapshot {
    const all = this.store.tasks(),
      roots = all.filter((t) => t.workflow),
      completed = roots.filter((t) => t.state === "completed").length,
      failed = roots.filter((t) => t.state === "failed").length;
    const usages = all
      .filter((t) => !t.workflow && t.usage)
      .map((t) => t.usage!);
    return {
      agents,
      tasks: all.slice(0, 300),
      events: this.store.events(),
      memories: this.store.memories(),
      projects: this.store.projects(),
      schedules: this.store.schedules(),
      policy: this.store.policy(),
      provider: providerInfo(),
      capabilities: {
        browser: this.options.browserReady ?? false,
        windows: this.computer.status().verifiedThisSession,
        computer: this.computer.status(),
        voice: "browser-dependent",
        allowedHosts: this.options.hosts,
      },
      metrics: {
        completed,
        active: this.active.size,
        approvals: all.filter(
          (t) => !t.workflow && t.state === "waiting_approval",
        ).length,
        failed,
        successRate:
          completed + failed
            ? Math.round((completed / (completed + failed)) * 100)
            : null,
        tokens: usages.reduce((n, u) => n + u.inputTokens + u.outputTokens, 0),
        cost:
          usages.length && usages.every((u) => u.estimatedCost !== null)
            ? usages.reduce((n, u) => n + (u.estimatedCost ?? 0), 0)
            : null,
        today: roots.filter(
          (t) =>
            t.state === "completed" &&
            t.finishedAt?.slice(0, 10) ===
              new Date().toISOString().slice(0, 10),
        ).length,
      },
      uptimeSeconds: Math.floor((Date.now() - this.started) / 1000),
    };
  }
}
