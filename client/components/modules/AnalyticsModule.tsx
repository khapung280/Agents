import { AgentIcon } from "../Primitives";
import type { ModuleContext } from "../Modules";
export function AnalyticsModule({ s }: Pick<ModuleContext, "s">) {
  return (
    <>
      <div className="analytics-grid">
        {[
          ["Completed workflows", s.metrics.completed],
          ["Failed workflows", s.metrics.failed],
          [
            "Verified success rate",
            s.metrics.successRate === null ? "—" : `${s.metrics.successRate}%`,
          ],
          ["Recorded tokens", s.metrics.tokens],
          [
            "Estimated API cost",
            s.metrics.cost === null
              ? "Unavailable"
              : `$${s.metrics.cost.toFixed(4)}`,
          ],
          [
            "Queued steps",
            s.tasks.filter((t) => !t.workflow && t.state === "queued").length,
          ],
        ].map(([name, value]) => (
          <div className="metric-tile" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="hint">
        Success rate counts completed and failed workflows. Cancelled and
        blocked work is excluded. Costs appear only when a provider returns
        usage and verified token prices are configured. Today uses UTC.
      </p>
      <h4>AGENT EXECUTION DISTRIBUTION</h4>
      <div className="distribution">
        {s.agents.map((a) => {
          const count = s.tasks.filter(
            (t) => !t.workflow && t.agent === a.id && t.state === "completed",
          ).length;
          return (
            <div key={a.id}>
              <span>
                <AgentIcon id={a.id} />
                {a.name}
              </span>
              <div className="bar">
                <i
                  style={{
                    width: `${(count / Math.max(1, s.tasks.filter((t) => !t.workflow && t.state === "completed").length)) * 100}%`,
                    background: a.color,
                  }}
                />
              </div>
              <b>{count}</b>
            </div>
          );
        })}
      </div>
    </>
  );
}
