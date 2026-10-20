import { Square, ShieldCheck } from "lucide-react";
import { api } from "../../api";

import type { DashboardProps } from "./types";

export function StatusFooter({
  voice,
  act,
}: Pick<DashboardProps, "voice" | "act">) {
  return (
    <footer className="page-footer">
      <span>
        <ShieldCheck size={12} />
        LOCAL-FIRST · OWNER-CONTROLLED
      </span>
      <span>
        AGENTS OS <b>v0.1</b>
        <i />
        Tool evidence and permissions visible
      </span>
      <button
        onClick={() => {
          voice.stop();
          voice.interrupt();
          act(() => api("/stop", "POST"));
        }}
        className="emergency-stop"
      >
        <Square size={11} />
        EMERGENCY STOP
      </button>
    </footer>
  );
}
