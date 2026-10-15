import { CheckCircle2, Clock3, FileText, Volume2 } from "lucide-react";
import {
  WorkflowInput,
  type Snapshot,
  type Task,
} from "../../shared/contracts";
import { AgentIcon, Badge, human, time } from "./Primitives";
import { api } from "../api";
export function TaskDetail({
  task,
  snapshot,
  act,
  onSpeak,
}: {
  task: Task;
  snapshot: Snapshot;
  act: (fn: () => Promise<unknown>) => void;
  onSpeak: (text: string) => void;
}) {
  const children = snapshot.tasks.filter((t) => t.parentId === task.id);
  const events = snapshot.events
    .filter(
      (e) => e.taskId === task.id || children.some((t) => t.id === e.taskId),
    )
    .reverse();
  return (
    <div className="detail">
      <div className="detail-heading">
        <Badge state={task.state} />
        <span className="mono">{task.id.slice(0, 8)}</span>
      </div>
      <h3 className="task-objective">{task.objective}</h3>
      <div className="metadata">
        <span>
          <AgentIcon id={task.agent} />
          {snapshot.agents.find((a) => a.id === task.agent)?.name}
        </span>
        <span>
          <Clock3 size={15} />
          {new Date(task.createdAt).toLocaleString()}
        </span>
      </div>
      {task.error && <div className="notice error">{task.error}</div>}
      {[task, ...children].some(
        (t) =>
          t.tool.startsWith("computer.") &&
          t.approval === "consumed" &&
          ["failed", "cancelled", "blocked"].includes(t.state),
      ) && (
        <div className="notice amber">
          An interrupted PC operation may already have changed the application.
          Capture a fresh observation before requesting another action. The old
          input will not be replayed automatically.
        </div>
      )}
      {!["completed", "failed", "cancelled"].includes(task.state) && (
        <button
          className="danger-outline"
          onClick={() => act(() => api(`/tasks/${task.id}/cancel`, "POST"))}
        >
          Cancel workflow
        </button>
      )}
      {!task.workflow && ["failed", "blocked"].includes(task.state) && (
        <button
          className="secondary"
          onClick={() => act(() => api(`/tasks/${task.id}/retry`, "POST"))}
        >
          Create reviewed retry
        </button>
      )}
      {children.length > 0 && (
        <section>
          <h4>EXECUTION PLAN</h4>
          <div className="steps">
            {children.reverse().map((t, i) => (
              <div className="step" key={t.id}>
                <span className={`step-number ${t.state}`}>
                  {t.state === "completed" ? <CheckCircle2 size={16} /> : i + 1}
                </span>
                <div>
                  <strong>{human(t.tool.replace(".", " / "))}</strong>
                  <p>
                    {snapshot.agents.find((a) => a.id === t.agent)?.name} ·{" "}
                    {t.dependsOn.length
                      ? "after upstream completion"
                      : "ready to execute"}
                  </p>
                  {t.error && <p className="error-text">{t.error}</p>}
                  {["failed", "blocked"].includes(t.state) && (
                    <button
                      className="text-button"
                      onClick={() =>
                        act(() => api(`/tasks/${t.id}/retry`, "POST"))
                      }
                    >
                      Review & retry as a new workflow
                    </button>
                  )}
                </div>
                <Badge state={t.state} />
              </div>
            ))}
          </div>
        </section>
      )}
      {[task, ...children]
        .filter((t) => t.approval === "pending")
        .map((t) => (
          <div className="approval-card" key={t.id}>
            <h3>Authorization required</h3>
            <p>
              {t.tool === "workspace.write"
                ? "Create a new file in your isolated workspace."
                : t.tool.startsWith("computer.")
                  ? "Observe or control only the specified allowlisted Windows application. This may reveal private screen content or change application state."
                  : t.tool === "browser.interact"
                    ? "Perform the exact browser interaction below once, then verify its postcondition."
                    : "Make one paid model request under your configured budget."}
            </p>
            <dl>
              <dt>Agent</dt>
              <dd>{t.agent}</dd>
              <dt>Target</dt>
              <dd>
                {t.input.computer
                  ? JSON.stringify(t.input.computer)
                  : (t.input.url ?? t.input.path ?? snapshot.provider.name)}
              </dd>
              <dt>Impact</dt>
              <dd>
                {t.tool === "workspace.write"
                  ? "Local file creation; no overwrite"
                  : t.tool.startsWith("computer.")
                    ? "Local screen capture or PC input; review the exact command. No automatic retry."
                    : t.tool === "browser.interact"
                      ? "Browser input on the allowed website; may change page state"
                      : "External model processing and API cost"}
              </dd>
            </dl>
            {t.input.computer &&
              "observationId" in t.input.computer &&
              (() => {
                const command = t.input.computer;
                const evidence = snapshot.tasks
                  .filter((task) => !task.workflow)
                  .flatMap((task) => task.output)
                  .find(
                    (a) =>
                      a.name === "Windows observation" &&
                      a.content &&
                      JSON.parse(a.content).id === command.observationId,
                  );
                return evidence ? (
                  <details>
                    <summary>
                      Review the captured window and target context
                    </summary>
                    <pre>{evidence.content}</pre>
                    <img
                      className="computer-observation"
                      src={`/api/artifacts/${JSON.parse(evidence.content!).screenshot}`}
                      alt="Window observation associated with this approval"
                    />
                  </details>
                ) : (
                  <p className="hint">
                    Observation must still be available in this service session;
                    expired observations cannot authorize input.
                  </p>
                );
              })()}
            <pre>
              {t.input.computer || t.input.browser
                ? JSON.stringify(
                    t.input.computer ?? {
                      url: t.input.url,
                      ...t.input.browser,
                    },
                    null,
                    2,
                  )
                : (t.input.text ?? t.objective)}
            </pre>
            <div className="button-row">
              <button
                className="primary"
                onClick={() =>
                  act(() =>
                    api(`/approvals/${t.id}`, "POST", { approve: true }),
                  )
                }
              >
                Approve once
              </button>
              <button
                className="secondary"
                onClick={() =>
                  act(() =>
                    api(`/approvals/${t.id}`, "POST", { approve: false }),
                  )
                }
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      <section>
        <h4>VERIFIED OUTPUTS</h4>
        {task.verification && (
          <div className="notice">
            <CheckCircle2 size={17} />
            {task.verification}
          </div>
        )}
        {(task.output.length
          ? task.output
          : children.flatMap((c) => c.output)
        ).map((a) => (
          <article className="artifact" key={a.id}>
            <header>
              <span>
                <FileText size={16} />
                {a.name}
              </span>
              {a.kind === "text" && (
                <button
                  className="icon-button"
                  onClick={() => onSpeak(a.content ?? "")}
                  aria-label={`Read ${a.name} aloud`}
                >
                  <Volume2 size={16} />
                </button>
              )}
            </header>
            {a.kind === "image" ? (
              <img src={`/api/artifacts/${a.path}`} alt={a.name} />
            ) : (
              <pre>{a.content}</pre>
            )}
            {a.name === "Proposed workflow" && a.content && (
              <button
                className="primary"
                onClick={() =>
                  act(() =>
                    api(
                      "/workflows",
                      "POST",
                      WorkflowInput.parse(JSON.parse(a.content!)),
                      { "Idempotency-Key": `plan-${a.id}` },
                    ),
                  )
                }
              >
                Execute reviewed plan
              </button>
            )}
          </article>
        ))}
        {!task.output.length && !children.some((t) => t.output.length) && (
          <p className="hint">
            Artifacts will appear after a tool returns real evidence.
          </p>
        )}
      </section>
      <section>
        <h4>EXECUTION TIMELINE</h4>
        <div className="timeline">
          {events.map((e) => (
            <div key={e.id}>
              <time>{time(e.at)}</time>
              <i />
              <p>{e.message}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
