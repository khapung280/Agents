import type { CoreState, Snapshot } from "../shared/contracts";

// Render only persisted service activity and actual local voice events; no simulated work.
export function deriveCoreState(
  s: Snapshot,
  connected: boolean,
  voice: { listening: boolean; speaking: boolean },
  now = Date.now(),
): CoreState {
  if (!connected || s.policy.stopped) return "offline";
  if (voice.listening) return "listening";
  if (voice.speaking) return "speaking";
  if (
    s.metrics.approvals ||
    s.reasoningSessions.some((session) => session.state.startsWith("awaiting_"))
  )
    return "approval";
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
    now - Date.parse(s.events[0].at) < 1200
  )
    return "delegating";
  if (s.tasks.some((t) => t.workflow && t.state === "planning"))
    return "planning";
  const lastTerminal = s.tasks.find(
    (t) => t.workflow && t.finishedAt && now - Date.parse(t.finishedAt) < 5000,
  );
  return lastTerminal?.state === "completed"
    ? "success"
    : ["failed", "blocked"].includes(lastTerminal?.state ?? "")
      ? "error"
      : "idle";
}
