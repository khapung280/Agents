import { ArrowUpRight } from "lucide-react";

import { AgentIcon } from "../Primitives";

import type { DashboardProps } from "./types";

export function TeamPanel({
  s,
  clock,
  active,
  openAgent,
  setView,
}: Pick<DashboardProps, "s" | "clock" | "active" | "openAgent" | "setView">) {
  return (
    <section className="team-panel panel">
      <div className="panel-title">
        <span>YOUR AGENT TEAM</span>
        <span className="subtle-number">10</span>
      </div>
      <div className="team-intro">
        <span className="tiny-label">
          GOOD{" "}
          {clock.getHours() < 12
            ? "MORNING"
            : clock.getHours() < 18
              ? "AFTERNOON"
              : "EVENING"}
          , OPERATOR
        </span>
        <h2>
          Room to think.
          <br />A team to execute.
        </h2>
        <p>
          {active.length
            ? `${active.length} workflow${active.length > 1 ? "s" : ""} in progress. You're in control.`
            : "Your workspace is quiet. Give your team its next mission."}
        </p>
      </div>
      <div className="team-list">
        {s.agents.map((a) => {
          const running = s.tasks.some(
            (t) => !t.workflow && t.agent === a.id && t.state === "running",
          );
          return (
            <button
              key={a.id}
              onClick={() => openAgent(a.id)}
              style={{ "--agent-color": a.color } as React.CSSProperties}
            >
              <span className="team-icon">
                <AgentIcon id={a.id} size={17} />
              </span>
              <span>
                <strong>{a.name}</strong>
                <small>
                  {!s.policy.agents[a.id]
                    ? "Paused"
                    : running
                      ? "Executing task"
                      : a.role}
                </small>
              </span>
              <i className={`agent-dot ${running ? "running" : ""}`} />
            </button>
          );
        })}
      </div>
      <button className="panel-link" onClick={() => setView("Agents")}>
        Manage your team
        <ArrowUpRight size={14} />
      </button>
    </section>
  );
}
