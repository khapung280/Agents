import { ArrowUpRight, Pause, Play } from "lucide-react";

import { api } from "../../api";
import { AgentIcon, Badge } from "../Primitives";
import type { ModuleContext } from "../Modules";
export function AgentsModule({
  s,
  agent,
  act,
  newTask,
  openTask,
}: Pick<ModuleContext, "s" | "agent" | "act" | "newTask" | "openTask">) {
  return (
    <>
      <div className="section-lead">
        <p>Ten specialists. One coordinated workspace.</p>
        <span className="badge">{s.metrics.active} executing</span>
      </div>
      <div className="agent-cards">
        {s.agents
          .filter((a) => !agent || a.id === agent)
          .map((a) => {
            const jobs = s.tasks.filter((t) => !t.workflow && t.agent === a.id);
            return (
              <article
                className="agent-card"
                key={a.id}
                style={{ "--agent-color": a.color } as React.CSSProperties}
              >
                <header>
                  <span className="agent-icon">
                    <AgentIcon id={a.id} size={24} />
                  </span>
                  <div>
                    <h3>{a.name}</h3>
                    <span>{a.role}</span>
                  </div>
                  <Badge
                    state={
                      !s.policy.agents[a.id]
                        ? "paused"
                        : jobs.some((t) => t.state === "running")
                          ? "running"
                          : ["browser", "research", "marketing"].includes(
                                a.id,
                              ) && !s.capabilities.browser
                            ? "network required"
                            : "idle"
                    }
                  />
                </header>
                <p>{a.description}</p>
                <div className="tool-tags">
                  {a.tools.map((t) => (
                    <code key={t}>{t}</code>
                  ))}
                </div>
                <div className="agent-card-stats">
                  <span>
                    {jobs.filter((t) => t.state === "completed").length}{" "}
                    completed
                  </span>
                  <span>
                    {
                      jobs.filter((t) =>
                        ["queued", "waiting_dependencies"].includes(t.state),
                      ).length
                    }{" "}
                    queued
                  </span>
                  <span>
                    {jobs.filter((t) => t.state === "failed").length} errors
                  </span>
                </div>
                <div className="button-row">
                  <button className="secondary" onClick={() => newTask(a.id)}>
                    Assign task
                    <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${s.policy.agents[a.id] ? "Pause" : "Resume"} ${a.name}`}
                    onClick={() =>
                      act(() =>
                        api("/policy", "PATCH", {
                          agents: {
                            ...s.policy.agents,
                            [a.id]: !s.policy.agents[a.id],
                          },
                        }),
                      )
                    }
                  >
                    {s.policy.agents[a.id] ? (
                      <Pause size={17} />
                    ) : (
                      <Play size={17} />
                    )}
                  </button>
                </div>
                {agent && jobs.length > 0 && (
                  <div className="compact-tasks">
                    {jobs.map((t) => (
                      <button key={t.id} onClick={() => openTask(t)}>
                        <span>{t.objective}</span>
                        <Badge state={t.state} />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
      </div>
    </>
  );
}
