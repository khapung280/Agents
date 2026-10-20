import { ArrowUpRight } from "lucide-react";
import { ReasoningPanel } from "../ReasoningPanel";
import { NotepadPanel } from "../NotepadPanel";

import { AgentIcon, Badge, Empty } from "../Primitives";
import type { ModuleContext } from "../Modules";
export function ConnectionsModule({
  s,
  view,
  newTask,
  openTask,
  act,
}: Pick<ModuleContext, "s" | "view" | "newTask" | "openTask" | "act">) {
  const id =
    view === "Browser"
      ? "browser"
      : view === "Computer"
        ? "computer"
        : "communication";
  const items = s.tasks.filter((t) => t.agent === id && t.workflow);
  return (
    <>
      <div className="connection-card">
        <div className="big-agent-icon">
          <AgentIcon id={id} size={32} />
        </div>
        <h3>
          {view === "Browser"
            ? "An isolated browser, with evidence."
            : view === "Computer"
              ? "Local operations, with observed evidence."
              : "Thoughtful communication starts with a draft."}
        </h3>
        <p>
          {view === "Browser"
            ? `Chromium can inspect public HTTPS pages on: ${s.capabilities.allowedHosts.join(", ")}. It uses a fresh session and records real page evidence.`
            : view === "Computer"
              ? "File inventory and approved file creation remain available. Windows UI Automation, window captures, mouse, keyboard and app launch require a local allowlist and approval for each operation."
              : "Prepare correspondence locally. No email account is connected, and sending is unavailable. Review and copy drafts into your authorized account."}
        </p>
        {view === "Computer" && (
          <p role="status">{s.capabilities.computer.reason}</p>
        )}
        <button className="primary" onClick={() => newTask(id)}>
          {view === "Browser"
            ? "Inspect a website"
            : view === "Computer"
              ? "Create workspace task"
              : "Prepare a draft"}
          <ArrowUpRight size={17} />
        </button>
      </div>
      {view === "Computer" && (
        <NotepadPanel s={s} act={act} openTask={openTask} />
      )}
      {view === "Computer" && (
        <ReasoningPanel s={s} act={act} openTask={openTask} />
      )}
      {items.length ? (
        <div className="task-table">
          {items.map((t) => (
            <button key={t.id} onClick={() => openTask(t)}>
              <AgentIcon id={t.agent} />
              <div>
                <strong>{t.objective}</strong>
                <small>{new Date(t.createdAt).toLocaleString()}</small>
              </div>
              <Badge state={t.state} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title={
            view === "Browser"
              ? "No browser observations yet"
              : view === "Computer"
                ? "No workspace operations yet"
                : "Your drafts will appear here"
          }
        >
          Only actual execution results are shown.
        </Empty>
      )}
    </>
  );
}
