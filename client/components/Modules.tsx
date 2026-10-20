import { AgentsModule } from "./modules/AgentsModule";
import { TasksModule } from "./modules/TasksModule";
import { ProjectsModule } from "./modules/ProjectsModule";
import { KnowledgeModule } from "./modules/KnowledgeModule";
import { CalendarModule } from "./modules/CalendarModule";
import { ToolsModule } from "./modules/ToolsModule";
import { ConnectionsModule } from "./modules/ConnectionsModule";
import { AnalyticsModule } from "./modules/AnalyticsModule";
import { SettingsModule } from "./modules/SettingsModule";
import { useState, type FormEvent } from "react";

import type { AgentId, Memory, Snapshot, Task } from "../../shared/contracts";

export type View =
  | "Dashboard"
  | "Agents"
  | "Tasks"
  | "Projects"
  | "Knowledge"
  | "Tools"
  | "Browser"
  | "Computer"
  | "Calendar"
  | "Emails"
  | "Analytics"
  | "Settings";
export interface VisualSettings {
  quality: string;
  reduced: boolean;
  paused: boolean;
}
interface Props {
  view: View;
  snapshot: Snapshot;
  agent: AgentId | null;
  act: (fn: () => Promise<unknown>) => void;
  newTask: (agent?: AgentId) => void;
  openTask: (task: Task) => void;
  visual: VisualSettings;
  setVisual: (v: VisualSettings) => void;
}
export function Modules({
  view,
  snapshot: s,
  agent,
  act,
  newTask,
  openTask,
  visual,
  setVisual,
}: Props) {
  const [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Memory | null>(null),
    [scope, setScope] = useState("personal");
  const roots = s.tasks.filter((t) => t.workflow),
    tasks = agent ? s.tasks.filter((t) => t.agent === agent) : roots;
  const handle = (
    event: FormEvent<HTMLFormElement>,
    fn: (data: FormData) => Promise<unknown>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    act(async () => {
      await fn(new FormData(form));
      form.reset();
    });
  };
  if (view === "Agents")
    return (
      <AgentsModule
        s={s}
        agent={agent}
        act={act}
        newTask={newTask}
        openTask={openTask}
      />
    );
  if (view === "Tasks")
    return (
      <TasksModule
        newTask={newTask}
        openTask={openTask}
        query={query}
        setQuery={setQuery}
        tasks={tasks}
      />
    );
  if (view === "Projects") return <ProjectsModule s={s} handle={handle} />;
  if (view === "Knowledge")
    return (
      <KnowledgeModule
        s={s}
        act={act}
        openTask={openTask}
        query={query}
        setQuery={setQuery}
        editing={editing}
        setEditing={setEditing}
        scope={scope}
        setScope={setScope}
        handle={handle}
      />
    );
  if (view === "Calendar")
    return <CalendarModule s={s} act={act} handle={handle} />;
  if (view === "Tools") return <ToolsModule s={s} newTask={newTask} />;
  if (["Browser", "Computer", "Emails"].includes(view))
    return (
      <ConnectionsModule
        s={s}
        view={view}
        act={act}
        newTask={newTask}
        openTask={openTask}
      />
    );
  if (view === "Analytics") return <AnalyticsModule s={s} />;
  if (view === "Settings")
    return (
      <SettingsModule
        s={s}
        act={act}
        visual={visual}
        setVisual={setVisual}
        handle={handle}
      />
    );
  return null;
}

export interface ModuleContext extends Omit<Props, "snapshot"> {
  s: Snapshot;
  query: string;
  setQuery: (text: string) => void;
  editing: Memory | null;
  setEditing: (memory: Memory | null) => void;
  scope: string;
  setScope: (scope: string) => void;
  tasks: Task[];
  handle: (
    event: FormEvent<HTMLFormElement>,
    fn: (data: FormData) => Promise<unknown>,
  ) => void;
}
