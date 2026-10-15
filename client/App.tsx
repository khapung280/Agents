import { deriveCoreState } from "./coreState";
import { TeamPanel } from "./components/dashboard/TeamPanel";
import { CommandCore } from "./components/dashboard/CommandCore";
import { OperationsPanel } from "./components/dashboard/OperationsPanel";
import { CommandBar } from "./components/dashboard/CommandBar";
import { ActivityPanels } from "./components/dashboard/ActivityPanels";
import { StatusFooter } from "./components/dashboard/StatusFooter";
import {
  Component,
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  LayoutDashboard,
  Network,
  ListTodo,
  FolderKanban,
  BookOpen,
  Wrench,
  Globe,
  Monitor,
  CalendarDays,
  Mail,
  ChartNoAxesCombined,
  Settings2,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  Square,
  Bell,
  ShieldCheck,
  Check,
  VolumeX,
  Hexagon,
  LogOut,
  SlidersHorizontal,
} from "lucide-react";
import { api, useSystem } from "./api";
import { useVoice } from "./voice";
import { Dialog, Empty } from "./components/Primitives";
import { Modules, type View, type VisualSettings } from "./components/Modules";
import { TaskForm } from "./components/TaskForm";
import { TaskDetail } from "./components/TaskDetail";
import type {
  AgentId,
  Snapshot,
  Task,
  TaskRequest,
  WorkflowRequest,
} from "../shared/contracts";
const navigation: [View, typeof LayoutDashboard][] = [
  ["Dashboard", LayoutDashboard],
  ["Agents", Network],
  ["Tasks", ListTodo],
  ["Projects", FolderKanban],
  ["Knowledge", BookOpen],
  ["Tools", Wrench],
  ["Browser", Globe],
  ["Computer", Monitor],
  ["Calendar", CalendarDays],
  ["Emails", Mail],
  ["Analytics", ChartNoAxesCombined],
  ["Settings", Settings2],
];
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>The command center needs to reload.</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>Reload interface</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <Application />
    </ErrorBoundary>
  );
}
function Application() {
  const system = useSystem();
  const [pairError, setPairError] = useState("");
  async function pair(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPairError("");
    try {
      await api("/session", "POST", {
        token: new FormData(e.currentTarget).get("token"),
      });
      await system.refresh();
    } catch (e) {
      setPairError((e as Error).message);
    }
  }
  if (system.authenticated === false)
    return (
      <div className="pairing">
        <div className="pairing-art">
          <Hexagon size={70} />
          <span className="eyebrow">YOUR INTELLIGENCE. YOUR CONTROL.</span>
          <h1>
            AGENTS<span>OS</span>
          </h1>
          <p>
            One command center.
            <br />
            An entire team of possibilities.
          </p>
          <div className="pairing-rings" />
        </div>
        <form onSubmit={(e) => void pair(e)}>
          <span className="eyebrow">ULTIMATE AGENTS — BOTH</span>
          <h2>Connect your workspace.</h2>
          <p>
            Pair this browser with the private token stored in your local AGENTS
            data directory.
          </p>
          <label>
            Local pairing token
            <input
              name="token"
              type="password"
              required
              autoComplete="off"
              placeholder="Paste your private pairing token"
            />
          </label>
          <small>
            Default file: .data/pairing-token. The Electron desktop app pairs
            automatically.
          </small>
          {pairError && (
            <div role="alert" className="notice error">
              {pairError}
            </div>
          )}
          <button className="primary">
            Enter command center
            <ArrowUpRight size={18} />
          </button>
          <div className="secure-note">
            <ShieldCheck size={15} />
            Local session · Your credentials stay on the server
          </div>
        </form>
      </div>
    );
  if (!system.snapshot)
    return (
      <div className="boot">
        <Hexagon size={48} />
        <h1>AGENTS OS</h1>
        <p>Connecting to your local command core…</p>
      </div>
    );
  return (
    <CommandCenter snapshot={system.snapshot} connected={system.connected} />
  );
}
function CommandCenter({
  snapshot: s,
  connected,
}: {
  snapshot: Snapshot;
  connected: boolean;
}) {
  const [view, setView] = useState<View>("Dashboard"),
    [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null),
    [taskId, setTaskId] = useState<string | null>(null),
    [newTask, setNewTask] = useState<AgentId | null>(null),
    [command, setCommand] = useState(""),
    [clock, setClock] = useState(new Date()),
    [toast, setToast] = useState(""),
    [notifications, setNotifications] = useState(false),
    [commandAgent, setCommandAgent] = useState<AgentId>("project");
  const toastRef = useRef<HTMLDivElement>(null);
  const [visual, setVisualState] = useState<VisualSettings>(() => {
    try {
      const stored = localStorage.getItem("agents-visual");
      if (stored) return JSON.parse(stored);
    } catch {
      /* use safe defaults */
    }
    return {
      quality: navigator.hardwareConcurrency <= 4 ? "performance" : "high",
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      paused: false,
    };
  });
  const setVisual = (v: VisualSettings) => {
    setVisualState(v);
    localStorage.setItem("agents-visual", JSON.stringify(v));
  };
  const act = (fn: () => Promise<unknown>) => {
    void fn().catch((e) => setToast((e as Error).message));
  };
  const voice = useVoice(setCommand, () => act(() => api("/stop", "POST")));
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (toast) {
      toastRef.current?.showPopover();
      const t = setTimeout(() => setToast(""), 8000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    document.documentElement.classList.toggle("reduced-motion", visual.reduced);
  }, [visual.reduced]);
  const openAgent = (id: AgentId) => {
    setSelectedAgent(id);
    setView("Agents");
  };
  const openTask = (t: Task) => setTaskId(t.id);
  const createTask = async (
    request: Partial<TaskRequest> | WorkflowRequest,
  ) => {
    const task = await api<Task>(
      "steps" in request ? "/workflows" : "/tasks",
      "POST",
      request,
    );
    setNewTask(null);
    setCommand("");
    setTaskId(task.id);
  };
  const roots = s.tasks.filter((t) => t.workflow),
    active = roots.filter(
      (t) => !["completed", "failed", "cancelled", "blocked"].includes(t.state),
    ),
    recent = roots.slice(0, 4);
  const coreState = deriveCoreState(s, connected, voice);
  const task = s.tasks.find((t) => t.id === taskId);
  function commandSubmit(e: FormEvent) {
    e.preventDefault();
    if (!command.trim()) return;
    if (
      ["browser", "research", "marketing", "developer", "computer"].includes(
        commandAgent,
      )
    ) {
      setNewTask(commandAgent);
      return;
    }
    act(() => createTask({ objective: command, agent: commandAgent }));
  }
  return (
    <div className={`app-shell ${visual.reduced ? "reduced-motion" : ""}`}>
      <aside className="sidebar">
        <button
          className="brand-mark"
          aria-label="AGENTS OS dashboard"
          onClick={() => setView("Dashboard")}
        >
          <Hexagon size={34} />
          <span>A</span>
        </button>
        <div className="nav-items">
          {navigation.map(([name, Icon], i) => (
            <div className={i === 6 ? "nav-divider" : ""} key={name}>
              <button
                aria-label={name}
                title={name}
                className={`nav-button ${view === name ? "active" : ""}`}
                onClick={() => {
                  setView(name);
                  setSelectedAgent(null);
                }}
              >
                <Icon size={20} />
                {view === name && <i />}
              </button>
            </div>
          ))}
        </div>
        <button
          className="profile"
          aria-label="Open profile settings"
          onClick={() => setView("Settings")}
        >
          OP
          <span />
        </button>
      </aside>
      <div className="shell-body">
        <header className="topbar">
          <div className="wordmark">
            AGENTS<span>OS</span>
            <i />
            <small>ULTIMATE AGENTS — BOTH</small>
          </div>
          <div className="top-metrics">
            <span>
              <i className="status-dot online" />
              <b>{s.agents.length}</b> Registered agents
            </span>
            <span>
              <b>{s.metrics.active}</b> Running
            </span>
            <button onClick={() => setNotifications(true)}>
              <b>{s.metrics.approvals}</b> Approvals
            </button>
            <span>
              <b>
                {s.metrics.successRate === null
                  ? "—"
                  : `${s.metrics.successRate}%`}
              </b>{" "}
              Verified
            </span>
          </div>
          <div className="top-right">
            <div className="clock">
              <b>
                {clock.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </b>
              <span>
                {clock.toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <button
              className="icon-button notification-button"
              aria-label="Open notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {s.metrics.approvals > 0 && <i />}
            </button>
          </div>
        </header>
        <main>
          <div className="workspace-heading">
            <div>
              <div className="breadcrumb">
                WORKSPACE <ChevronRight size={12} /> COMMAND CENTER
              </div>
              <h1>
                Your intelligence, amplified<span>.</span>
              </h1>
              <p>
                A clear view of your agents. Complete control of what happens
                next.
              </p>
            </div>
            <div className="heading-actions">
              <span
                className={`connection ${connected ? "online" : "offline"}`}
              >
                <i />
                {connected ? "SYSTEM CONNECTED" : "RECONNECTING"}
              </span>
              <button
                className="secondary compact"
                onClick={() => setView("Settings")}
              >
                <SlidersHorizontal size={15} />
                {s.policy.mode.charAt(0).toUpperCase() +
                  s.policy.mode.slice(1)}{" "}
                mode
                <ChevronDown size={13} />
              </button>
            </div>
          </div>
          {s.policy.stopped && (
            <div className="stop-banner">
              <Square size={17} />
              <span>
                Emergency stop is active. Tools and schedules are paused.
              </span>
              <button onClick={() => act(() => api("/resume", "POST"))}>
                Resume system
              </button>
            </div>
          )}
          <div className="dashboard-grid">
            <TeamPanel
              s={s}
              clock={clock}
              active={active}
              openAgent={openAgent}
              setView={setView}
            />
            <CommandCore
              s={s}
              coreState={coreState}
              visual={visual}
              voice={voice}
              connected={connected}
              setVisual={setVisual}
              view={view}
              newTask={newTask}
              taskId={taskId}
              notifications={notifications}
              openAgent={openAgent}
            />
            <OperationsPanel
              s={s}
              active={active}
              recent={recent}
              openTask={openTask}
              setNewTask={setNewTask}
              setNotifications={setNotifications}
            />
          </div>
          <CommandBar
            s={s}
            commandAgent={commandAgent}
            command={command}
            setCommand={setCommand}
            commandSubmit={commandSubmit}
            voice={voice}
            setCommandAgent={setCommandAgent}
          />
          {voice.error && (
            <p className="voice-error" role="alert">
              {voice.error}
            </p>
          )}
          {voice.speaking && (
            <button className="secondary" onClick={voice.interrupt}>
              <VolumeX size={16} />
              Interrupt response
            </button>
          )}
          <ActivityPanels s={s} setView={setView} />
          <StatusFooter voice={voice} act={act} />
        </main>
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            ref={toastRef}
            popover="manual"
            className="toast"
            role="alert"
            initial={{ y: 20, x: "-50%", opacity: 0 }}
            animate={{ y: 0, x: "-50%", opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span>{toast}</span>
            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {view !== "Dashboard" && (
        <Dialog
          title={
            selectedAgent
              ? s.agents.find((a) => a.id === selectedAgent)!.name
              : view
          }
          wide
          onClose={() => {
            setView("Dashboard");
            setSelectedAgent(null);
          }}
        >
          <Modules
            view={view}
            snapshot={s}
            agent={selectedAgent}
            act={act}
            newTask={(a) => setNewTask(a ?? "project")}
            openTask={openTask}
            visual={visual}
            setVisual={setVisual}
          />
          {view === "Settings" && (
            <button
              className="text-button"
              onClick={() =>
                act(async () => {
                  await api("/logout", "POST");
                  location.reload();
                })
              }
            >
              <LogOut size={16} />
              Unpair this browser
            </button>
          )}
        </Dialog>
      )}
      {newTask && (
        <Dialog
          title="Give your team a mission"
          kicker="NEW WORKFLOW"
          onClose={() => setNewTask(null)}
        >
          <TaskForm
            snapshot={s}
            initialAgent={newTask}
            initialObjective={command}
            onSubmit={createTask}
          />
        </Dialog>
      )}
      {task && (
        <Dialog
          title="Workflow details"
          kicker="EXECUTION / EVIDENCE"
          onClose={() => setTaskId(null)}
        >
          <TaskDetail
            task={task}
            snapshot={s}
            act={act}
            onSpeak={voice.speak}
          />
        </Dialog>
      )}
      {notifications && (
        <Dialog
          title="Approvals & notifications"
          onClose={() => setNotifications(false)}
        >
          {s.tasks
            .filter((t) => !t.workflow && t.approval === "pending")
            .map((t) => (
              <article className="notification-card" key={t.id}>
                <ShieldCheck size={22} />
                <div>
                  <h3>{t.objective}</h3>
                  <p>{t.tool} · waiting for your authorization</p>
                  <button
                    className="primary"
                    onClick={() => {
                      setNotifications(false);
                      setTaskId(t.id);
                    }}
                  >
                    Review action
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </article>
            ))}
          {s.events
            .filter((e) => /completed|failed|blocked|stopped/.test(e.type))
            .slice(0, 15)
            .map((e) => (
              <article className="notification-card" key={e.id}>
                <Check size={18} />
                <div>
                  <h3>{e.message}</h3>
                  <small>{new Date(e.at).toLocaleString()}</small>
                  {e.taskId && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setNotifications(false);
                        setTaskId(e.taskId);
                      }}
                    >
                      View workflow
                    </button>
                  )}
                </div>
              </article>
            ))}
          {!s.metrics.approvals &&
            !s.events.some((e) =>
              /completed|failed|blocked|stopped/.test(e.type),
            ) && (
              <Empty title="Nothing needs your attention">
                Approvals and execution outcomes will appear here.
              </Empty>
            )}
        </Dialog>
      )}
    </div>
  );
}
