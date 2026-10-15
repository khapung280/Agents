import { Check, Monitor } from "lucide-react";

import { api } from "../../api";

import type { ModuleContext } from "../Modules";
export function SettingsModule({
  s,
  act,
  visual,
  setVisual,
  handle,
}: Pick<ModuleContext, "s" | "act" | "visual" | "setVisual" | "handle">) {
  return (
    <div className="settings">
      <section>
        <h3>Operating policy</h3>
        <p>Changes are persisted and enforced by the service.</p>
        <div className="mode-options">
          {(["manual", "assisted", "autonomous"] as const).map((mode) => (
            <button
              key={mode}
              className={s.policy.mode === mode ? "selected" : ""}
              onClick={() => act(() => api("/policy", "PATCH", { mode }))}
            >
              <span>
                {mode}
                {s.policy.mode === mode && <Check size={15} />}
              </span>
              <small>
                {mode === "manual"
                  ? "Run only requested workflows."
                  : mode === "assisted"
                    ? "Run requested low-risk work; approve protected steps."
                    : "Also run your authorized schedules while the service is on."}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Spending controls</h3>
        <form
          className="form"
          onSubmit={(e) =>
            handle(e, (f) =>
              api("/policy", "PATCH", {
                budgetUsd: Number(f.get("budget")),
                maxCallsPerAgent: Number(f.get("calls")),
              }),
            )
          }
        >
          <div className="form-grid">
            <label>
              Total model budget (USD)
              <input
                type="number"
                name="budget"
                min="0"
                max="1000"
                step="0.01"
                defaultValue={s.policy.budgetUsd}
                required
              />
            </label>
            <label>
              Model calls per agent
              <input
                type="number"
                name="calls"
                min="1"
                max="1000"
                defaultValue={s.policy.maxCallsPerAgent}
                required
              />
            </label>
          </div>
          <button className="secondary">Save limits</button>
        </form>
      </section>
      <section>
        <h3>Model connection</h3>
        <div className="provider-status">
          <span
            className={`status-dot ${s.provider.configured ? "online" : ""}`}
          />
          {s.provider.configured
            ? `${s.provider.name} / ${s.provider.model ?? "model name required"}`
            : "No model provider configured"}
        </div>
        <p>
          Configure provider credentials and token prices in the server
          environment. Secrets never enter this interface. Built-in local tools
          work without a model.
        </p>
      </section>
      <section>
        <h3>Visual experience</h3>
        <label className="setting-row">
          Render quality
          <select
            value={visual.quality}
            onChange={(e) => setVisual({ ...visual, quality: e.target.value })}
          >
            <option value="high">Cinematic</option>
            <option value="performance">Performance</option>
          </select>
        </label>
        <label className="setting-row">
          Reduced motion
          <input
            type="checkbox"
            checked={visual.reduced}
            onChange={(e) =>
              setVisual({ ...visual, reduced: e.target.checked })
            }
          />
        </label>
        <label className="setting-row">
          Pause 3D rendering
          <input
            type="checkbox"
            checked={visual.paused}
            onChange={(e) => setVisual({ ...visual, paused: e.target.checked })}
          />
        </label>
      </section>
      <section>
        <h3>Runtime connections</h3>
        <p>
          <Monitor size={15} /> Local Node service ·{" "}
          {Math.floor(s.uptimeSeconds / 60)} minutes uptime
        </p>
        <p>Windows desktop service: not connected</p>
        <p>
          Voice: browser-dependent; English recognition requested. Nepali, wake
          word and offline recognition are not validated.
        </p>
        <p>
          Persistent storage: local SQLite · memory search: scoped lexical
          retrieval
        </p>
      </section>
    </div>
  );
}
