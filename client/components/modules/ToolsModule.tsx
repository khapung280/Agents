import { requiresApproval } from "../../../shared/contracts";
import { ArrowUpRight } from "lucide-react";

import { AgentIcon } from "../Primitives";
import type { ModuleContext } from "../Modules";
export function ToolsModule({
  s,
  newTask,
}: Pick<ModuleContext, "s" | "newTask">) {
  return (
    <>
      <div className="notice">
        Tool grants are enforced by the service. Models cannot add capabilities
        or approve their own actions.
      </div>
      <div className="tool-list">
        {s.agents.flatMap((a) =>
          a.tools.map((tool) => (
            <article key={`${a.id}-${tool}`}>
              <AgentIcon id={a.id} />
              <div>
                <code>{tool}</code>
                <p>{a.name}</p>
              </div>
              <span className="muted">
                {tool === "model.draft"
                  ? s.provider.configured
                    ? "provider configured"
                    : "provider required"
                  : requiresApproval(tool)
                    ? "approval required"
                    : "bounded local tool"}
              </span>
              <button className="text-button" onClick={() => newTask(a.id)}>
                Use tool
                <ArrowUpRight size={14} />
              </button>
            </article>
          )),
        )}
      </div>
    </>
  );
}
