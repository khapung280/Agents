import { ArrowUpRight, Plus, Search } from "lucide-react";

import { AgentIcon, Badge, Empty } from "../Primitives";
import type { ModuleContext } from "../Modules";
export function TasksModule({
  newTask,
  openTask,
  query,
  setQuery,
  tasks,
}: Pick<
  ModuleContext,
  "newTask" | "openTask" | "query" | "setQuery" | "tasks"
>) {
  return (
    <>
      <div className="section-lead">
        <p>Persistent workflows, execution steps, and verified results.</p>
        <button className="primary" onClick={() => newTask()}>
          <Plus size={16} />
          New workflow
        </button>
      </div>
      <div className="search-field">
        <Search size={17} />
        <input
          aria-label="Search tasks"
          placeholder="Search workflows…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {tasks.length ? (
        <div className="task-table">
          {tasks
            .filter((t) =>
              `${t.objective} ${t.state}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((t) => (
              <button key={t.id} onClick={() => openTask(t)}>
                <AgentIcon id={t.agent} />
                <div>
                  <strong>{t.objective}</strong>
                  <small>
                    {new Date(t.createdAt).toLocaleString()} ·{" "}
                    {t.id.slice(0, 8)}
                  </small>
                </div>
                <Badge state={t.state} />
                <ArrowUpRight size={16} />
              </button>
            ))}
        </div>
      ) : (
        <Empty title="Your first workflow starts here">
          Assign a goal to an agent. Every step and output will be recorded.
        </Empty>
      )}
    </>
  );
}
