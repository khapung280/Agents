import { createHash, randomUUID } from "node:crypto";
import {
  SessionInput,
  type ReasoningSession,
  type ScreenShareGrant,
} from "../shared/reasoning.js";
import { WorkflowInput, type Task } from "../shared/contracts.js";
import type { ComputerObservation } from "../shared/computer.js";
import type { Engine } from "./engine.js";
import { validateScreenDecision } from "./screen-sharing.js";
import { validateVisionProposal } from "./computer/vision.js";
import { providerInfo } from "./model-provider.js";
import { redact } from "./security.js";

const final = (s: ReasoningSession) =>
  ["completed", "cancelled", "blocked"].includes(s.state);
const running = (s: ReasoningSession) =>
  ["planning", "executing_plan", "observing", "reasoning", "acting"].includes(
    s.state,
  );
export class ReasoningSessions {
  constructor(private engine: Engine) {
    for (const grant of this.grants())
      if (["pending", "approved"].includes(grant.state))
        this.store.put("screen_grant", grant.id, {
          ...grant,
          state: "revoked",
        });
    for (const session of this.list())
      if (!final(session))
        this.block(
          session,
          "Service restarted. Review the checkpoint; image grants and pending actions were invalidated. Nothing was replayed.",
        );
  }
  private get store() {
    return this.engine.store;
  }
  list() {
    return this.store.list<ReasoningSession>("reasoning_session");
  }
  grants() {
    return this.store.list<ScreenShareGrant>("screen_grant");
  }
  private get(id: string) {
    const s = this.store.get<ReasoningSession>("reasoning_session", id);
    if (!s) throw new Error("Reasoning session not found.");
    return s;
  }
  private live(id: string) {
    const s = this.get(id);
    if (
      this.store.policy().stopped ||
      ["completed", "cancelled"].includes(s.state)
    )
      throw new Error("Reasoning session is stopped or closed.");
    if (Date.parse(s.deadline) <= Date.now()) {
      this.block(
        s,
        "Session deadline exceeded (five minutes). Start a new reviewed session.",
      );
      throw new Error("Reasoning session deadline exceeded.");
    }
    return s;
  }
  private save(s: ReasoningSession, message: string) {
    this.store.put("reasoning_session", s.id, s);
    this.engine.event(`session.${s.state}`, message);
  }
  private revoke(s: ReasoningSession) {
    if (!s.grantId) return;
    const g = this.store.get<ScreenShareGrant>("screen_grant", s.grantId);
    if (g && g.state !== "consumed")
      this.store.put("screen_grant", g.id, { ...g, state: "revoked" });
  }
  private block(s: ReasoningSession, error: string) {
    this.revoke(s);
    s.state = "blocked";
    s.error = redact(error);
    // Persist the block before task cancellation can emit more service events.
    this.save(s, s.error);
    for (const id of s.taskIds) this.engine.cancel(id);
  }
  private attach(
    s: ReasoningSession,
    task: Task,
    state: ReasoningSession["state"],
  ) {
    s.currentTaskId = task.id;
    s.taskIds.push(task.id);
    s.state = state;
    s.error = null;
    this.save(
      s,
      `Session checkpoint: ${state}. Each protected task still requires its own approval.`,
    );
  }
  private begin(s: ReasoningSession) {
    const request = s.app
      ? {
          agent: "computer",
          tool: "computer.observe",
          objective: `Observe the approved window for: ${s.objective}`.slice(
            0,
            4000,
          ),
          projectId: s.projectId,
          computer: { kind: "observe", app: s.app },
        }
      : {
          agent: "project",
          tool: "model.plan",
          objective: s.objective,
          projectId: s.projectId,
          text: s.replans
            ? `Reviewed recovery attempt ${s.replans}. Prior checkpoint: ${s.error ?? "owner requested a new plan"}. Do not replay prior protected actions.`
            : undefined,
        };
    this.attach(
      s,
      this.engine.submit(request),
      s.app ? "observing" : "planning",
    );
  }
  create(raw: unknown) {
    const input = SessionInput.parse(raw);
    if (this.list().some((s) => !final(s)))
      throw new Error("Only one active reasoning session is permitted.");
    if (
      input.projectId !== "personal" &&
      !this.store.get("project", input.projectId)
    )
      throw new Error("Unknown session project.");
    if (
      input.app &&
      !this.engine.computer.status().apps.some((a) => a.id === input.app)
    )
      throw new Error("Session application is not allowlisted.");
    const s: ReasoningSession = {
      ...input,
      app: input.app ?? null,
      id: randomUUID(),
      state: "planning",
      createdAt: new Date().toISOString(),
      deadline: new Date(Date.now() + 300000).toISOString(),
      steps: 0,
      replans: 0,
      taskIds: [],
      verifiedTaskIds: [],
      currentTaskId: null,
      observation: null,
      grantId: null,
      proposalId: null,
      decision: null,
      plan: null,
      error: null,
      lastCaptureAt: 0,
    };
    this.begin(s);
    return this.get(s.id);
  }
  executePlan(id: string) {
    const s = this.live(id);
    if (s.state !== "awaiting_plan" || !s.plan)
      throw new Error("No reviewed plan is awaiting execution.");
    this.attach(
      s,
      this.engine.submitWorkflow(s.plan, `session-plan-${s.id}-${s.replans}`),
      "executing_plan",
    );
    return this.get(id);
  }
  approveShare(id: string, digest: string, sensitiveContentApproved: boolean) {
    const s = this.live(id);
    const grant = this.store.get<ScreenShareGrant>(
      "screen_grant",
      s.grantId ?? "",
    );
    if (
      s.state !== "awaiting_share" ||
      !grant ||
      grant.state !== "pending" ||
      grant.imageSha256 !== digest ||
      !sensitiveContentApproved ||
      Date.parse(grant.expiresAt) <= Date.now()
    )
      throw new Error(
        "Review and explicitly approve the current exact image and any sensitive content before sharing.",
      );
    const provider = providerInfo();
    if (!provider.configured || provider.name !== "openai" || !provider.model)
      throw new Error(
        "Configure the OpenAI model securely before approving a vision request.",
      );
    this.engine.computer.observation(grant.observationId, s.projectId);
    const root = this.engine.submit({
      agent: "computer",
      tool: "model.vision",
      objective: s.objective,
      projectId: s.projectId,
      visionGrantId: grant.id,
    });
    const child = this.store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "model.vision")!;
    this.store.put("screen_grant", grant.id, {
      ...grant,
      taskId: child.id,
      state: "approved",
      model: provider.model,
      sensitiveContentApproved: true,
    });
    this.attach(s, root, "reasoning");
    // This endpoint is the owner's explicit approval for exactly one image upload
    // and paid request, not an authorization inferred from the session objective.
    this.engine.approve(child.id, true);
    return this.get(id);
  }
  approveAction(id: string, proposalId: string) {
    const s = this.live(id);
    if (
      s.state !== "awaiting_action" ||
      !s.decision ||
      !s.observation ||
      s.proposalId !== proposalId
    )
      throw new Error("No matching action proposal is awaiting approval.");
    if (s.steps >= 8) throw new Error("Session action limit reached.");
    const observation = this.engine.computer.observation(
      s.observation.id,
      s.projectId,
    );
    const { outcome: _outcome, ...proposal } = s.decision;
    const command = validateVisionProposal(proposal, observation);
    const root = this.engine.submit({
      agent: "computer",
      tool: "computer.act",
      objective: s.objective,
      projectId: s.projectId,
      computer: command,
    });
    const child = this.store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "computer.act")!;
    s.steps++;
    this.attach(s, root, "acting");
    this.engine.approve(child.id, true);
    return this.get(id);
  }
  confirm(id: string) {
    const s = this.live(id);
    if (s.state !== "awaiting_completion" || !s.verifiedTaskIds.length)
      throw new Error(
        "Completion requires verified tool evidence and owner review.",
      );
    if (
      !s.verifiedTaskIds.every((id) => {
        const t = this.store.get<Task>("task", id);
        return t?.state === "completed" && t.output.length && t.verification;
      })
    )
      throw new Error("Recorded completion evidence is no longer valid.");
    s.state = "completed";
    this.revoke(s);
    this.save(
      s,
      "Owner accepted the result after reviewing completed tool evidence. This does not establish unrestricted desktop capability.",
    );
    return s;
  }
  recover(id: string) {
    const s = this.live(id);
    if (
      ![
        "blocked",
        "awaiting_action",
        "awaiting_share",
        "awaiting_completion",
      ].includes(s.state)
    )
      throw new Error(
        "Wait for the current task before requesting reviewed recovery.",
      );
    if (
      s.replans >= 2 ||
      this.list().some((other) => other.id !== id && !final(other))
    )
      throw new Error("Recovery limit reached or another session is active.");
    if (s.app && Date.now() - s.lastCaptureAt < 2000)
      throw new Error("Wait two seconds before another screen observation.");
    this.revoke(s);
    s.replans++;
    s.decision = null;
    s.proposalId = null;
    s.grantId = null;
    s.plan = null;
    this.begin(s);
    return this.get(id);
  }
  cancel(id: string) {
    const s = this.get(id);
    if (["completed", "cancelled"].includes(s.state)) return s;
    this.revoke(s);
    s.state = "cancelled";
    this.save(
      s,
      "Reasoning session cancelled; pending input and image permissions revoked.",
    );
    for (const task of s.taskIds) this.engine.cancel(task);
    return s;
  }
  stopAll(reason: string, cancelled = false) {
    for (const s of this.list())
      if (!final(s)) {
        if (cancelled) this.cancel(s.id);
        else this.block(s, reason);
      }
  }
  private async prepareShare(
    s: ReasoningSession,
    observation: ComputerObservation,
  ) {
    const actual = this.engine.computer.observation(
      observation.id,
      s.projectId,
    );
    if (actual.app !== s.app)
      throw new Error(
        "Observed application changed outside the session allowlist.",
      );
    const png = await this.engine.computer.image(actual);
    const fresh = this.live(s.id);
    if (fresh.state !== s.state || fresh.currentTaskId !== s.currentTaskId)
      return;
    this.revoke(fresh);
    const grant: ScreenShareGrant = {
      id: randomUUID(),
      sessionId: s.id,
      taskId: null,
      observationId: actual.id,
      projectId: s.projectId,
      imageSha256: createHash("sha256").update(png).digest("hex"),
      windowId: actual.window.windowId,
      processId: actual.window.processId,
      processStartedAt: actual.window.processStartedAt,
      expiresAt: actual.expiresAt,
      state: "pending",
      model: null,
      sensitiveContentApproved: false,
    };
    this.store.put("screen_grant", grant.id, grant);
    fresh.observation = actual;
    fresh.grantId = grant.id;
    fresh.state = "awaiting_share";
    fresh.lastCaptureAt = Date.now();
    fresh.decision = null;
    fresh.proposalId = null;
    if (
      s.state === "acting" &&
      s.currentTaskId &&
      !fresh.verifiedTaskIds.includes(s.currentTaskId)
    )
      fresh.verifiedTaskIds.push(s.currentTaskId);
    this.save(
      fresh,
      "Fresh window evidence is ready. Nothing is uploaded until the exact image and one paid request are explicitly approved.",
    );
  }
  async tick() {
    for (const s of this.list()) {
      if (final(s)) continue;
      try {
        this.live(s.id);
        if (!running(s) || !s.currentTaskId) continue;
        const task = this.store.get<Task>("task", s.currentTaskId);
        if (!task) throw new Error("Session task disappeared.");
        if (["failed", "cancelled", "blocked"].includes(task.state))
          throw new Error(
            task.error ??
              "Session task did not complete; review evidence before recovery.",
          );
        if (task.state !== "completed") continue;
        if (s.state === "planning") {
          const artifact = task.output.find(
            (a) => a.name === "Proposed workflow",
          );
          if (!artifact?.content)
            throw new Error("Planner supplied no reviewable workflow.");
          s.plan = WorkflowInput.parse(JSON.parse(artifact.content));
          s.state = "awaiting_plan";
          this.save(
            s,
            "Typed plan is ready for owner review. Proposed steps have not executed.",
          );
        } else if (s.state === "executing_plan") {
          s.verifiedTaskIds.push(task.id);
          s.state = "awaiting_completion";
          this.save(
            s,
            "Workflow and supervisor completed. Review the evidence before accepting the session result.",
          );
        } else if (["observing", "acting"].includes(s.state)) {
          const artifact = task.output.find(
            (a) => a.name === "Windows observation",
          );
          if (!artifact?.content)
            throw new Error("Native task supplied no window evidence.");
          await this.prepareShare(s, JSON.parse(artifact.content));
        } else if (s.state === "reasoning") {
          if (!s.observation)
            throw new Error("Vision session has no bound observation.");
          const artifact = task.output.find(
            (a) => a.name === "Vision decision",
          );
          if (!artifact?.content)
            throw new Error("Vision task supplied no typed decision.");
          s.decision = validateScreenDecision(
            JSON.parse(artifact.content),
            s.observation,
          );
          s.proposalId = randomUUID();
          if (s.decision.outcome === "action") {
            if (s.steps >= 8) throw new Error("Session action limit reached.");
            s.state = "awaiting_action";
            this.save(
              s,
              "One observed-element action is proposed. No input occurs until the owner approves this exact proposal.",
            );
          } else if (s.decision.outcome === "complete") {
            if (!s.verifiedTaskIds.length)
              throw new Error(
                "Model suggested completion without verified task evidence. Review or obtain fresh evidence.",
              );
            s.state = "awaiting_completion";
            this.save(
              s,
              "Model suggests completion. Owner must review independently verified tool evidence.",
            );
          } else
            throw new Error(
              `Model requested ${s.decision.outcome}: ${s.decision.explanation}`,
            );
        }
      } catch (error) {
        const fresh = this.get(s.id);
        if (!final(fresh))
          this.block(
            fresh,
            error instanceof Error
              ? error.message
              : "Reasoning session failed.",
          );
      }
    }
  }
}
