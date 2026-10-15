import { lazy, Suspense } from "react";

import { ShieldCheck, Pause } from "lucide-react";

import { AgentIcon } from "../Primitives";

import type { DashboardProps } from "./types";
const Core = lazy(() => import("../Core").then((m) => ({ default: m.Core })));
export function CommandCore({
  s,
  coreState,
  visual,
  voice,
  connected,
  setVisual,
  view,
  newTask,
  taskId,
  notifications,
  openAgent,
}: Pick<
  DashboardProps,
  | "s"
  | "coreState"
  | "visual"
  | "voice"
  | "connected"
  | "setVisual"
  | "view"
  | "newTask"
  | "taskId"
  | "notifications"
  | "openAgent"
>) {
  return (
    <section className="core-panel panel">
      <header>
        <div>
          <span className="eyebrow">AGENTS — AI COMMAND CORE</span>
          <h2>Intelligence, in orbit.</h2>
        </div>
        <div className="core-indicator">
          <i />
          {coreState === "idle" ? "STANDING BY" : coreState.toUpperCase()}
        </div>
      </header>
      <div className="core-stage">
        <div className="core-grid" />
        <div className="core-halo" />
        <div className="core-cross top-left" />
        <div className="core-cross bottom-right" />
        <div className="canvas-wrap">
          <Suspense
            fallback={
              <div className="gpu-fallback">Loading neural geometry…</div>
            }
          >
            <Core
              state={coreState}
              quality={visual.quality}
              level={voice.level}
              reduced={visual.reduced}
              paused={
                visual.paused ||
                view !== "Dashboard" ||
                !!newTask ||
                !!taskId ||
                notifications
              }
            />
          </Suspense>
        </div>
        <svg
          className="neural-paths"
          viewBox="0 0 600 540"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {s.agents.map((a, i) => {
            const side = i < 5 ? -1 : 1,
              row = i % 5,
              y = 80 + row * 88,
              active =
                connected &&
                s.tasks.some(
                  (t) =>
                    connected &&
                    !t.workflow &&
                    t.agent === a.id &&
                    t.state === "running",
                );
            return (
              <path
                key={a.id}
                className={active ? "signal active" : "signal"}
                d={`M 300 270 Q ${300 + side * 90} ${y} ${300 + side * 205} ${y}`}
                style={{ stroke: active ? a.color : undefined }}
              />
            );
          })}
        </svg>
        <div className="orbit-agents">
          {s.agents.map((a, i) => {
            const running = s.tasks.filter(
              (t) =>
                connected &&
                !t.workflow &&
                t.agent === a.id &&
                t.state === "running",
            );
            return (
              <button
                key={a.id}
                className={`orbit-node ${i < 5 ? "left" : "right"} ${running.length ? "working" : ""}`}
                style={
                  {
                    "--agent-color": a.color,
                    top: `${11 + (i % 5) * 17}%`,
                    "--node-shift": `${[13, 0, -5, 0, 13][i % 5]}px`,
                  } as React.CSSProperties
                }
                onClick={() => openAgent(a.id)}
              >
                <span className="orb-icon">
                  <AgentIcon id={a.id} size={18} />
                </span>
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {running.length
                      ? `${running.length} executing`
                      : !connected
                        ? "OFFLINE"
                        : s.policy.agents[a.id]
                          ? ["browser", "research", "marketing"].includes(
                              a.id,
                            ) && !s.capabilities.browser
                            ? "NETWORK REQUIRED"
                            : "READY"
                          : "PAUSED"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="core-caption">
          <span>AGENTS</span>
          <p>
            {s.policy.stopped
              ? "EXECUTION HALTED"
              : coreState === "idle"
                ? "READY WHEN YOU ARE"
                : coreState === "approval"
                  ? "AWAITING YOUR AUTHORIZATION"
                  : coreState.replaceAll("_", " ").toUpperCase()}
          </p>
        </div>
        <div className="stage-corner left">
          <span>LOCAL CORE</span>
          <b>01 / {connected ? "CONNECTED" : "OFFLINE"}</b>
        </div>
        <button
          className="stage-corner right"
          onClick={() => setVisual({ ...visual, paused: !visual.paused })}
          aria-label={
            visual.paused ? "Resume visual effects" : "Pause visual effects"
          }
        >
          <Pause size={12} />
          {visual.paused ? "EFFECTS PAUSED" : "LIVE RENDER"}
        </button>
      </div>
      <div className="core-footer">
        <span>
          <ShieldCheck size={13} />
          Permission-aware execution
        </span>
        <span>
          <i className="status-dot online" />
          {s.provider.configured
            ? "Model connected"
            : "Built-in tools · no model connected"}
        </span>
      </div>
    </section>
  );
}
