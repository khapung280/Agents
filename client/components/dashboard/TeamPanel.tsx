import { ArrowUpRight } from "lucide-react";

import { AgentIcon } from "../Primitives";
import { deriveAgentVisual } from "../../coreState";

import type { DashboardProps } from "./types";

export function TeamPanel({
  s,
  connected,
  clock,
  active,
  openAgent,
  setView,
}: Pick<
  DashboardProps,
  "s" | "connected" | "clock" | "active" | "openAgent" | "setView"
>) {
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
          {!connected
            ? "Connection interrupted. Execution status is unavailable."
            : active.length
              ? `${active.length} workflow${active.length > 1 ? "s" : ""} in progress. You're in control.`
              : "Your workspace is quiet. Give your team its next mission."}
        </p>
      </div>
      <div className="team-list">
        {s.agents.map((a) => {
          const indicator = deriveAgentVisual(s, a.id, connected);
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
                  {indicator.phase === "idle" ? a.role : indicator.label}
                </small>
              </span>
              <i className={`agent-dot ${indicator.active ? "running" : ""}`} />
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
