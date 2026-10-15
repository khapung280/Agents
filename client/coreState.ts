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
  if (s.metrics.approvals) return "approval";
  if (s.metrics.active)
    return s.tasks.some(
      (t) =>
        !t.workflow && t.state === "running" && t.tool.startsWith("model."),
    )
      ? "thinking"
      : "executing";
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
