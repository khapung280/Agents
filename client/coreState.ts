import type { AgentId, CoreState, Snapshot } from "../shared/contracts";

// Render only persisted service activity and actual local voice events; no simulated work.
export function deriveCoreState(
  s: Snapshot,
  connected: boolean,
  voice: { listening: boolean; speaking: boolean },
  now = Date.now(),
): CoreState {
  if (!connected || s.policy.stopped) return "offline";
  if (
    s.metrics.approvals ||
    s.reasoningSessions.some((session) => session.state.startsWith("awaiting_"))
  )
    return "approval";
  if (voice.listening) return "listening";
  if (voice.speaking) return "speaking";
  const running = s.tasks.filter((t) => !t.workflow && t.state === "running");
  if (running.length) {
    const progress = s.events.find(
      (e) =>
        e.type === "task.progress" && running.some((t) => t.id === e.taskId),
    );
    if (progress?.message.startsWith("Verifying:")) return "verifying";
    if (running.some((t) => t.tool === "model.plan")) return "planning";
    if (running.some((t) => t.tool === "model.vision")) return "observing";
    if (running.some((t) => t.tool.startsWith("model."))) return "thinking";
    if (
      running.some(
        (t) =>
          t.tool === "computer.observe" || t.tool === "computer.vision.prepare",
      )
    )
      return "observing";
    if (running.every((t) => t.tool === "supervisor.verify"))
      return "verifying";
    return "executing";
  }
  if (
    s.events[0]?.type === "workflow.delegated" &&
    now - Date.parse(s.events[0].at) >= 0 &&
    now - Date.parse(s.events[0].at) < 1200
  )
    return "delegating";
  if (s.tasks.some((t) => t.workflow && t.state === "planning"))
    return "planning";
  const lastTerminal = s.tasks.find(
    (t) =>
      t.workflow &&
      t.finishedAt &&
      now - Date.parse(t.finishedAt) >= 0 &&
      now - Date.parse(t.finishedAt) < 5000,
  );
  return lastTerminal?.state === "completed"
    ? "success"
    : ["failed", "blocked"].includes(lastTerminal?.state ?? "")
      ? "error"
      : "idle";
}

// Operational node indicators consume the same real task records as the core.
// Local animation previews never call this function with invented task records.
export function deriveAgentVisual(
  s: Snapshot,
  agent: AgentId,
  connected: boolean,
  now = Date.now(),
) {
  if (!connected || s.policy.stopped)
    return { phase: "offline", label: "OFFLINE", detail: "", active: false };
  if (!s.policy.agents[agent])
    return { phase: "paused", label: "PAUSED", detail: "", active: false };
  const tasks = s.tasks.filter(
    (task) => !task.workflow && task.agent === agent,
  );
  const running = tasks.filter((task) => task.state === "running");
  if (running.length) {
    const progress = s.events.find(
      (event) =>
        event.type === "task.progress" &&
        running.some((task) => task.id === event.taskId),
    );
    const verifying =
      progress?.message.startsWith("Verifying:") ||
      running.every((task) => task.tool === "supervisor.verify");
    return {
      phase: verifying ? "verifying" : "running",
      label: verifying ? "VERIFYING" : `${running.length} EXECUTING`,
      detail: progress?.message || running[0].objective,
      active: true,
    };
  }
  if (tasks.some((task) => task.state === "waiting_approval"))
    return {
      phase: "approval",
      label: "APPROVAL",
      detail: "Waiting for owner approval",
      active: false,
    };
  const delegated = s.events.find(
    (event) =>
      event.type === "workflow.delegated" &&
      event.agent === agent &&
      now - Date.parse(event.at) >= 0 &&
      now - Date.parse(event.at) < 2000 &&
      tasks.some(
        (task) =>
          task.id === event.taskId &&
          ["queued", "planning", "waiting_dependencies"].includes(task.state),
      ),
  );
  if (delegated)
    return {
      phase: "delegating",
      label: "DELEGATED",
      detail: delegated.message,
      active: true,
    };
  if (
    tasks.some((task) =>
      ["queued", "planning", "waiting_dependencies", "retrying"].includes(
        task.state,
      ),
    )
  )
    return {
      phase: "waiting",
      label: "WAITING",
      detail: "Queued work or dependency pending",
      active: false,
    };
  const recent = tasks
    .filter(
      (task) =>
        task.finishedAt &&
        now - Date.parse(task.finishedAt) >= 0 &&
        now - Date.parse(task.finishedAt) < 5000,
    )
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!))[0];
  if (
    recent &&
    ["completed", "failed", "blocked", "cancelled"].includes(recent.state)
  )
    return {
      phase:
        recent.state === "completed"
          ? "success"
          : recent.state === "cancelled"
            ? "waiting"
            : "error",
      label:
        recent.state === "completed"
          ? "STEP COMPLETE"
          : recent.state.toUpperCase(),
      detail: recent.objective,
      active: false,
    };
  return {
    phase: "idle",
    label:
      ["browser", "research", "marketing"].includes(agent) &&
      !s.capabilities.browser
        ? "NETWORK REQUIRED"
        : "READY",
    detail: "",
    active: false,
  };
}
