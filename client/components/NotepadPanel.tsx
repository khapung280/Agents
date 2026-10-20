import { useState } from "react";
import type { Snapshot, Task } from "../../shared/contracts";
import type { NotepadCommand } from "../../shared/notepad";
import { api } from "../api";
export function NotepadPanel({
  s,
  act,
  openTask,
}: {
  s: Snapshot;
  act: (fn: () => Promise<unknown>) => void;
  openTask: (task: Task) => void;
}) {
  const [pending, setPending] = useState(false);
  const apps = s.capabilities.computer.apps.filter(
    (app) => app.allowTestDocuments && app.allowLaunch,
  );
  const ready =
    s.capabilities.computer.available &&
    !s.policy.stopped &&
    s.policy.agents.computer;
  const submit = (notepad: NotepadCommand, projectId: string, key: string) => {
    setPending(true);
    act(async () => {
      try {
        openTask(
          await api<Task>(
            "/tasks",
            "POST",
            {
              agent: "computer",
              tool: "notepad.test",
              objective: "Disposable Notepad test: " + notepad.kind,
              projectId,
              notepad,
            },
            { "Idempotency-Key": key },
          ),
        );
      } finally {
        setPending(false);
      }
    });
  };
  return (
    <section className="connection-card">
      <h3>Disposable Notepad test</h3>
      <p>
        Prepare an empty app-owned file, then approve launch, focus, write and
        save separately. Screens stay local. Each input uses fresh evidence;
        saved text must match exact UTF-8 bytes. Ten-minute deadline. No Save As
        dialogs or existing user files.
      </p>
      <p>
        Windows-only acceptance remains required on your laptop. Process
        handoff, ambiguous editors or unexpected encoding stop the test for
        review.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !ready) return;
          const form = new FormData(event.currentTarget);
          submit(
            {
              kind: "prepare",
              app: String(form.get("notepadApp")),
              text: String(form.get("notepadText")),
            },
            String(form.get("notepadScope")),
            crypto.randomUUID(),
          );
        }}
      >
        <label>
          Allowed Notepad{" "}
          <select name="notepadApp" required disabled={!apps.length}>
            {apps.length ? (
              apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))
            ) : (
              <option value="">No Notepad test permission configured</option>
            )}
          </select>
        </label>
        <label>
          Project{" "}
          <select name="notepadScope">
            <option value="personal">Personal workspace</option>
            {s.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Exact one-line test text{" "}
          <input
            name="notepadText"
            required
            maxLength={500}
            defaultValue="AGENTS approved local Notepad test."
          />
        </label>
        <button
          className="primary"
          disabled={!ready || !apps.length || pending}
        >
          Request test document
        </button>
      </form>
      {s.testDocuments.map((document) => {
        const observation = document.lastObservation;
        const editors =
          observation?.window.elements.filter(
            (e) =>
              ["ControlType.Edit", "ControlType.Document"].includes(
                e.controlType,
              ) &&
              e.enabled &&
              !e.password &&
              e.value != null,
          ) || [];
        const editor = editors.length === 1 ? editors[0] : undefined;
        const active = s.tasks.find(
          (task) =>
            !task.workflow &&
            task.input.notepad &&
            "documentId" in task.input.notepad &&
            task.input.notepad.documentId === document.id &&
            [
              "queued",
              "running",
              "waiting_approval",
              "waiting_dependencies",
            ].includes(task.state),
        );
        const blocked =
          !ready ||
          pending ||
          !!active ||
          ["blocked", "saved"].includes(document.state);
        const expired =
          !observation || Date.parse(observation.expiresAt) <= Date.now();
        const step = (
          kind: "launch" | "observe" | "focus" | "write" | "save",
        ) =>
          submit(
            kind === "launch" || kind === "observe"
              ? { kind, documentId: document.id }
              : {
                  kind,
                  documentId: document.id,
                  observationId: observation!.id,
                  elementId: editor!.id,
                },
            document.projectId,
            "notepad-" +
              document.id +
              "-" +
              kind +
              "-" +
              (observation?.id || "initial"),
          );
        return (
          <div className="approval-card" key={document.id}>
            <h4>
              {document.name} · {document.state}
            </h4>
            <p>
              Scope: {document.projectId}. Deadline:{" "}
              {new Date(document.expiresAt).toLocaleTimeString()}.
            </p>
            <pre>{document.text}</pre>
            {document.error && (
              <p role="alert">
                {document.error} Begin a new disposable test; do not replay
                input.
              </p>
            )}
            {document.savedSha256 && (
              <p>Saved bytes verified: SHA-256 {document.savedSha256}</p>
            )}
            {active && (
              <button className="secondary" onClick={() => openTask(active)}>
                Review pending {active.input.notepad!.kind} task
              </button>
            )}
            {document.state === "prepared" && (
              <button
                className="secondary"
                disabled={blocked}
                onClick={() => step("launch")}
              >
                Request launch approval
              </button>
            )}
            {observation && !["blocked", "saved"].includes(document.state) && (
              <>
                <details>
                  <summary>Review actual window evidence</summary>
                  <img
                    className="computer-observation"
                    src={"/api/artifacts/" + observation.screenshot}
                    alt="Actual registered Notepad window"
                  />
                  <pre>{JSON.stringify(observation.window, null, 2)}</pre>
                </details>
                <button
                  className="secondary"
                  disabled={blocked}
                  onClick={() => step("observe")}
                >
                  Request fresh observation
                </button>
                {editor ? (
                  <>
                    <button
                      className="secondary"
                      disabled={
                        blocked ||
                        expired ||
                        (observation.window.foreground && editor.focused)
                      }
                      onClick={() => step("focus")}
                    >
                      Request focus approval
                    </button>
                    <button
                      className="secondary"
                      disabled={
                        blocked ||
                        expired ||
                        !observation.window.foreground ||
                        !editor.focused ||
                        document.state !== "launched"
                      }
                      onClick={() => step("write")}
                    >
                      Request write approval
                    </button>
                    <button
                      className="secondary"
                      disabled={
                        blocked ||
                        expired ||
                        !observation.window.foreground ||
                        !editor.focused ||
                        document.state !== "written"
                      }
                      onClick={() => step("save")}
                    >
                      Request save approval
                    </button>
                  </>
                ) : (
                  <p>
                    No single readable editor was found. Review evidence; input
                    is disabled.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
