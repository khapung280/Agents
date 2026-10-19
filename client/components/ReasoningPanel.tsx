import { useState } from "react";
import type { Snapshot, Task } from "../../shared/contracts";
import type {
  ReasoningSession,
  ScreenShareGrant,
} from "../../shared/reasoning";
import { api } from "../api";

type Props = {
  s: Snapshot;
  act: (fn: () => Promise<unknown>) => void;
  openTask: (task: Task) => void;
};
function ImageReview({
  session,
  grant,
  act,
  ready,
}: {
  session: ReasoningSession;
  grant: ScreenShareGrant;
  act: Props["act"];
  ready: boolean;
}) {
  const [approved, setApproved] = useState(false);
  return (
    <div className="approval-card">
      <h3>Review this exact window before sharing</h3>
      <p>
        One request sends this image and its visible UI Automation metadata to
        your configured OpenAI model. It incurs API cost. Review the image for
        private content; authorization to use an application does not authorize
        sharing its screen.
      </p>
      <img
        className="computer-observation"
        src={`/api/artifacts/${session.observation!.screenshot}`}
        alt="Exact window capture awaiting external sharing approval"
      />
      <p>
        {session.observation!.window.title} · Approval expires{" "}
        {new Date(grant.expiresAt).toLocaleTimeString()}
      </p>
      <details>
        <summary>Reviewed image identity and metadata</summary>
        <pre>
          {JSON.stringify(
            { sha256: grant.imageSha256, window: session.observation!.window },
            null,
            2,
          )}
        </pre>
      </details>
      <label>
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => setApproved(e.target.checked)}
        />{" "}
        I reviewed this capture and metadata, and explicitly authorize sharing
        any private or sensitive content shown.
      </label>
      <button
        className="primary"
        disabled={!approved || !ready}
        onClick={() =>
          act(() =>
            api(`/reasoning-sessions/${session.id}/share`, "POST", {
              imageSha256: grant.imageSha256,
              sensitiveContentApproved: true,
            }),
          )
        }
      >
        Approve this image and one paid vision call
      </button>
      {!ready && (
        <p>
          Screen reasoning needs a configured OpenAI model, token prices, and a
          verified image-token budget before approval.
        </p>
      )}
    </div>
  );
}

export function ReasoningPanel({ s, act, openTask }: Props) {
  const [mode, setMode] = useState("plan");
  const active = s.reasoningSessions.some(
    (session) => !["completed", "cancelled", "blocked"].includes(session.state),
  );
  return (
    <section className="connection-card reasoning-panel">
      <h3>Guided reasoning sessions</h3>
      <p>
        Plan with the existing agents, or review a permitted Windows window one
        action at a time. Every model call and protected action needs approval.
        Sessions have a five-minute limit; interrupted input is never replayed.
      </p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          act(() =>
            api("/reasoning-sessions", "POST", {
              objective: String(data.get("objective")),
              projectId: String(data.get("projectId")),
              ...(mode === "screen" ? { app: String(data.get("app")) } : {}),
            }),
          );
        }}
      >
        <label>
          Session goal
          <textarea
            name="objective"
            required
            minLength={3}
            maxLength={4000}
            rows={3}
          />
        </label>
        <label>
          Session mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="plan">Plan with the ten-agent registry</option>
            <option
              value="screen"
              disabled={!s.capabilities.computer.available}
            >
              Review an approved Windows window
            </option>
          </select>
        </label>
        <label>
          Session project
          <select name="projectId">
            <option value="personal">Personal</option>
            {s.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {mode === "screen" && (
          <label>
            Open allowlisted application
            <select name="app" required>
              {s.capabilities.computer.apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
            <small>
              Open the application first. This session does not launch it
              automatically.
            </small>
          </label>
        )}
        <button
          className="primary"
          disabled={
            active ||
            s.policy.stopped ||
            (mode === "plan" && !s.provider.configured)
          }
        >
          Create reviewed session
        </button>
        {!s.provider.configured && (
          <p>
            Model configuration is pending. No live AI reasoning or screen
            upload is available yet.
          </p>
        )}
      </form>
      {s.reasoningSessions.map((session) => {
        const task = s.tasks.find((t) => t.id === session.currentTaskId);
        const grant = s.screenGrants.find((g) => g.id === session.grantId);
        return (
          <article className="artifact" key={session.id}>
            <h4>{session.objective}</h4>
            <p role="status">
              {session.state.replaceAll("_", " ")} · {session.steps}/8 actions ·{" "}
              {session.replans}/2 recoveries
            </p>
            <p>Deadline: {new Date(session.deadline).toLocaleTimeString()}</p>
            {session.error && (
              <div className="notice error">{session.error}</div>
            )}
            {task && (
              <button className="secondary" onClick={() => openTask(task)}>
                Review current task, approval and evidence
              </button>
            )}
            {session.state === "awaiting_plan" && session.plan && (
              <div className="approval-card">
                <pre>{JSON.stringify(session.plan, null, 2)}</pre>
                <button
                  className="primary"
                  onClick={() =>
                    act(() =>
                      api(
                        `/reasoning-sessions/${session.id}/execute-plan`,
                        "POST",
                      ),
                    )
                  }
                >
                  Execute this reviewed plan
                </button>
                <p>
                  Paid and protected child steps still require their own
                  approvals.
                </p>
              </div>
            )}
            {session.state === "awaiting_share" &&
              grant &&
              session.observation && (
                <ImageReview
                  key={grant.id}
                  session={session}
                  grant={grant}
                  act={act}
                  ready={
                    s.provider.configured &&
                    s.provider.name === "openai" &&
                    !!s.provider.model &&
                    s.provider.pricesConfigured &&
                    s.provider.visionBudgetConfigured
                  }
                />
              )}
            {session.state === "awaiting_action" && session.decision && (
              <div className="approval-card">
                <h3>Review one proposed action</h3>
                <p>{session.decision.explanation}</p>
                <pre>
                  {JSON.stringify(
                    {
                      action: session.decision.action,
                      expect: session.decision.expect,
                      observationId: session.decision.observationId,
                    },
                    null,
                    2,
                  )}
                </pre>
                {session.observation && (
                  <img
                    className="computer-observation"
                    src={`/api/artifacts/${session.observation.screenshot}`}
                    alt="Window evidence for the proposed action"
                  />
                )}
                <button
                  className="primary"
                  onClick={() =>
                    act(() =>
                      api(`/reasoning-sessions/${session.id}/act`, "POST", {
                        proposalId: session.proposalId,
                      }),
                    )
                  }
                >
                  Approve this action once
                </button>
              </div>
            )}
            {session.state === "awaiting_completion" && (
              <div className="approval-card">
                <p>
                  The model or workflow suggests completion. Review the recorded
                  tool evidence; a model statement alone is not proof.
                </p>
                {session.verifiedTaskIds.map((id) => {
                  const evidence = s.tasks.find((t) => t.id === id);
                  return evidence ? (
                    <button
                      className="secondary"
                      key={id}
                      onClick={() => openTask(evidence)}
                    >
                      Review verified result: {evidence.objective}
                    </button>
                  ) : null;
                })}
                <button
                  className="primary"
                  onClick={() =>
                    act(() =>
                      api(`/reasoning-sessions/${session.id}/confirm`, "POST"),
                    )
                  }
                >
                  Accept the reviewed result
                </button>
              </div>
            )}
            {[
              "blocked",
              "awaiting_action",
              "awaiting_share",
              "awaiting_completion",
            ].includes(session.state) && (
              <button
                className="secondary"
                disabled={session.replans >= 2}
                onClick={() =>
                  act(() =>
                    api(`/reasoning-sessions/${session.id}/recover`, "POST"),
                  )
                }
              >
                {session.app
                  ? "Request a fresh reviewed observation"
                  : "Request a revised plan"}
              </button>
            )}
            {!["completed", "cancelled"].includes(session.state) && (
              <button
                className="danger-outline"
                onClick={() =>
                  act(() =>
                    api(`/reasoning-sessions/${session.id}/cancel`, "POST"),
                  )
                }
              >
                Cancel session
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
