import {
  Monitor,
  ChevronRight,
  ArrowUpRight,
  Plus,
  Command,
  ShieldCheck,
} from "lucide-react";

import { AgentIcon, Badge } from "../Primitives";

import type { DashboardProps } from "./types";

export function OperationsPanel({
  s,
  active,
  recent,
  openTask,
  setNewTask,
  setNotifications,
}: Pick<
  DashboardProps,
  "s" | "active" | "recent" | "openTask" | "setNewTask" | "setNotifications"
>) {
  return (
    <section className="operations-panel panel">
      <div className="panel-title">
        <span>OPERATIONS</span>
        <button
          className="icon-button"
          aria-label="New workflow"
          onClick={() => setNewTask("project")}
        >
          <Plus size={17} />
        </button>
      </div>
      <div className="operations-heading">
        <h2>In motion</h2>
        <span>{active.length} active</span>
      </div>
      {recent.length ? (
        <div className="recent-tasks">
          {recent.map((t) => (
            <button
              className="recent-task"
              key={t.id}
              onClick={() => openTask(t)}
            >
              <div>
                <AgentIcon id={t.agent} size={15} />
                <Badge state={t.state} />
              </div>
              <h3>{t.objective}</h3>
              <small>
                {
                  s.tasks.filter(
                    (c) => c.parentId === t.id && c.state === "completed",
                  ).length
                }{" "}
                / {s.tasks.filter((c) => c.parentId === t.id).length}{" "}
                checkpoints complete
              </small>
              <div className="checkpoint-track">
                {s.tasks
                  .filter((c) => c.parentId === t.id)
                  .map((c) => (
                    <i key={c.id} className={c.state} />
                  ))}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="operations-empty">
          <div className="empty-orbit">
            <Command size={23} />
          </div>
          <h3>A little quiet. A lot possible.</h3>
          <p>Your active workflows and verified results will appear here.</p>
          <button className="text-button" onClick={() => setNewTask("project")}>
            Create your first workflow
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      <div className="operations-divider" />
      <div className="panel-title small">
        <span>WORKING PREVIEW</span>
        <span className="live-label">
          <i />
          EVENTS
        </span>
      </div>
      <div className="working-preview">
        {s.events.find((e) => e.type === "task.progress") ? (
          <>
            <Monitor size={24} />
            <p>{s.events.find((e) => e.type === "task.progress")!.message}</p>
            <small>Recorded tool event</small>
          </>
        ) : (
          <>
            <Monitor size={25} />
            <p>Waiting for a real observation</p>
            <small>
              Browser captures and tool outputs
              <br />
              appear after execution.
            </small>
          </>
        )}
      </div>
      <div className="approval-summary">
        <ShieldCheck size={19} />
        <div>
          <strong>
            {s.metrics.approvals
              ? "Your approval is needed"
              : "You’re in control"}
          </strong>
          <small>
            {s.metrics.approvals
              ? `${s.metrics.approvals} protected action awaiting review`
              : "Protected actions always ask first."}
          </small>
        </div>
        {s.metrics.approvals > 0 && (
          <button
            className="icon-button"
            aria-label="Review approvals"
            onClick={() => setNotifications(true)}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
