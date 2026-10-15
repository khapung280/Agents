import { useEffect, useRef, type ReactNode } from "react";
import {
  Monitor,
  Globe,
  Code2,
  ScanSearch,
  BriefcaseBusiness,
  Megaphone,
  MessagesSquare,
  ListTodo,
  BrainCircuit,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AgentId } from "../../shared/contracts";
export const icons: Record<AgentId, LucideIcon> = {
  computer: Monitor,
  browser: Globe,
  developer: Code2,
  research: ScanSearch,
  business: BriefcaseBusiness,
  marketing: Megaphone,
  communication: MessagesSquare,
  project: ListTodo,
  memory: BrainCircuit,
  supervisor: ShieldCheck,
};
export function AgentIcon({ id, size = 18 }: { id: AgentId; size?: number }) {
  const Icon = icons[id];
  return <Icon size={size} />;
}
export const human = (text: string) => text.replaceAll("_", " ");
export const time = (date: string) =>
  new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export function Badge({ state }: { state: string }) {
  return (
    <span className={`badge ${state}`}>
      <i />
      {human(state)}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">⌁</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Dialog({
  title,
  kicker,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const element = ref.current;
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-content">
        <header className="sheet-header">
          <div>
            <span className="eyebrow">{kicker ?? "AGENTS OS / WORKSPACE"}</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </dialog>
  );
}
