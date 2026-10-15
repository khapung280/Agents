import { ArrowUp, Command, Mic } from "lucide-react";

import type { AgentId } from "../../../shared/contracts";
import type { DashboardProps } from "./types";

export function CommandBar({
  s,
  commandAgent,
  command,
  setCommand,
  commandSubmit,
  voice,
  setCommandAgent,
}: Pick<
  DashboardProps,
  | "s"
  | "commandAgent"
  | "command"
  | "setCommand"
  | "commandSubmit"
  | "voice"
  | "setCommandAgent"
>) {
  return (
    <section className="command-panel">
      <div className="command-logo">
        <Command size={23} />
      </div>
      <form onSubmit={commandSubmit}>
        <label className="sr-only" htmlFor="command">
          Command your agents
        </label>
        <input
          id="command"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Describe your next mission. Let’s make it happen."
          disabled={s.policy.stopped}
        />
        <div className="command-options">
          <select
            aria-label="Command agent"
            value={commandAgent}
            onChange={(e) => setCommandAgent(e.target.value as AgentId)}
          >
            {s.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span>Built-in workflow</span>
        </div>
        <div className="command-buttons">
          <button
            type="button"
            className={`icon-button ${voice.listening ? "listening" : ""}`}
            aria-label={
              voice.listening ? "Stop listening" : "Start voice input"
            }
            onClick={() => void voice.listen()}
          >
            <Mic size={19} />
          </button>
          <button
            className="submit-command"
            aria-label="Submit command"
            disabled={!command.trim() || s.policy.stopped}
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </form>
    </section>
  );
}
