import { Plus, Trash2, Pause, Play, ShieldCheck } from "lucide-react";

import { api } from "../../api";
import { Badge } from "../Primitives";
import type { ModuleContext } from "../Modules";
export function CalendarModule({
  s,
  act,
  handle,
}: Pick<ModuleContext, "s" | "act" | "handle">) {
  return (
    <>
      <div className="notice">
        <ShieldCheck size={18} />
        Scheduled execution requires Autonomous mode, an active service, and
        enabled agents. Protected tools require an interactive request.
      </div>
      <form
        className="form inset"
        onSubmit={(e) =>
          handle(e, (f) =>
            api("/schedules", "POST", {
              name: f.get("name"),
              request: {
                objective: f.get("objective"),
                agent: f.get("agent"),
              },
              nextRun: new Date(String(f.get("nextRun"))).toISOString(),
              intervalMinutes: f.get("interval")
                ? Number(f.get("interval"))
                : null,
            }),
          )
        }
      >
        <h3>Schedule a local workflow</h3>
        <label>
          Name
          <input name="name" required placeholder="Weekly workspace review" />
        </label>
        <label>
          Objective
          <input name="objective" required minLength={3} />
        </label>
        <div className="form-grid">
          <label>
            Tool
            <select name="agent">
              <option value="computer">Workspace inventory</option>
              <option value="supervisor">Review completed work</option>
              <option value="business">Revenue scenario brief</option>
            </select>
          </label>
          <label>
            Start time
            <input type="datetime-local" name="nextRun" required />
          </label>
          <label>
            Repeat every (minutes)
            <input
              name="interval"
              type="number"
              min="5"
              placeholder="Leave blank for once"
            />
          </label>
        </div>
        <button className="primary">
          <Plus size={16} />
          Save schedule
        </button>
      </form>
      {s.schedules.map((job) => (
        <article className="schedule-card" key={job.id}>
          <div>
            <h3>{job.name}</h3>
            <p>
              {new Date(job.nextRun).toLocaleString()} ·{" "}
              {job.intervalMinutes
                ? `every ${job.intervalMinutes} minutes`
                : "one-time"}
            </p>
            <small>
              {job.lastTaskId
                ? `Last workflow: ${job.lastTaskId.slice(0, 8)}`
                : "Not yet executed"}
            </small>
          </div>
          <Badge
            state={
              job.paused
                ? "paused"
                : s.policy.mode === "autonomous"
                  ? "scheduled"
                  : "waiting for autonomy"
            }
          />
          <button
            className="icon-button"
            aria-label={`${job.paused ? "Resume" : "Pause"} schedule`}
            onClick={() =>
              act(() =>
                api(`/schedules/${job.id}`, "PATCH", { paused: !job.paused }),
              )
            }
          >
            {job.paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="Delete schedule"
            onClick={() => act(() => api(`/schedules/${job.id}`, "DELETE"))}
          >
            <Trash2 size={17} />
          </button>
        </article>
      ))}
    </>
  );
}
