import { ArrowUpRight, Activity, Radio } from "lucide-react";

import { time } from "../Primitives";

import type { DashboardProps } from "./types";

export function ActivityPanels({
  s,
  setView,
}: Pick<DashboardProps, "s" | "setView">) {
  return (
    <div className="bottom-grid">
      <section className="summary-panel panel">
        <div className="panel-title">
          <span>WORKSPACE PULSE</span>
          <span className="tiny-label">TODAY · UTC</span>
        </div>
        <div className="pulse-metrics">
          <div>
            <span>Completed</span>
            <strong>
              {String(s.metrics.today).padStart(2, "0")}
              <small>workflows</small>
            </strong>
            <div className="micro-line" />
          </div>
          <div>
            <span>Running</span>
            <strong>
              {String(s.metrics.active).padStart(2, "0")}
              <small>tool steps</small>
            </strong>
            <div className="micro-line purple" />
          </div>
          <div>
            <span>API usage</span>
            <strong>
              {s.metrics.tokens}
              <small>tokens</small>
            </strong>
            <p>
              {s.metrics.cost === null
                ? "No recorded model cost"
                : `$${s.metrics.cost.toFixed(4)} estimated`}
            </p>
          </div>
        </div>
      </section>
      <section className="activity-panel panel">
        <div className="panel-title">
          <span>
            <Activity size={14} />
            LIVE ACTIVITY
          </span>
          <button className="text-button" onClick={() => setView("Tasks")}>
            View workflows
            <ArrowUpRight size={12} />
          </button>
        </div>
        {s.events.length ? (
          <div className="activity-rows">
            {s.events.slice(0, 3).map((e) => (
              <div key={e.id}>
                <time>{time(e.at)}</time>
                <i className={e.type.includes("failed") ? "error" : ""} />
                <p>{e.message}</p>
                <span>{e.agent ?? "system"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="activity-empty">
            <Radio size={19} />
            <p>
              Connected and listening.
              <span>Actual system events will appear here as you work.</span>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
