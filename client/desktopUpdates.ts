export type UpdatePhase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "awaiting_restart"
  | "installed"
  | "failed"
  | "cancelled"
  | "unavailable";

export interface UpdateStatus {
  currentVersion: string;
  phase: UpdatePhase;
  version?: string;
  notes?: string;
  received?: number;
  total?: number;
  error?: string;
  message?: string;
  sha256?: string;
}

export interface DesktopUpdates {
  getStatus(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  cancel(): Promise<UpdateStatus>;
  install(): Promise<UpdateStatus>;
  onStatus(listener: (status: UpdateStatus) => void): () => void;
}

declare global {
  interface Window {
    agentsUpdates?: DesktopUpdates;
  }
}
