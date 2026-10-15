import type { FormEvent } from "react";
import type {
  AgentId,
  CoreState,
  Snapshot,
  Task,
} from "../../../shared/contracts";
import type { useVoice } from "../../voice";
import type { View, VisualSettings } from "../Modules";
export interface DashboardProps {
  s: Snapshot;
  clock: Date;
  active: Task[];
  recent: Task[];
  connected: boolean;
  coreState: CoreState;
  visual: VisualSettings;
  voice: ReturnType<typeof useVoice>;
  view: View;
  newTask: AgentId | null;
  taskId: string | null;
  notifications: boolean;
  command: string;
  commandAgent: AgentId;
  openAgent: (id: AgentId) => void;
  openTask: (task: Task) => void;
  setView: (view: View) => void;
  setVisual: (settings: VisualSettings) => void;
  setNewTask: (id: AgentId | null) => void;
  setNotifications: (open: boolean) => void;
  setCommand: (text: string) => void;
  setCommandAgent: (id: AgentId) => void;
  commandSubmit: (e: FormEvent) => void;
  act: (fn: () => Promise<unknown>) => void;
}
