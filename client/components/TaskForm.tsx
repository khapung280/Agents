import { useState, type FormEvent } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import {
  agents,
  requiresApproval,
  type AgentId,
  type Snapshot,
  type TaskRequest,
  type WorkflowRequest,
  type ToolName,
} from "../../shared/contracts";
import {
  ComputerFields,
  BrowserFields,
  computerFromForm,
  browserFromForm,
} from "./ComputerFields";
export function TaskForm({
  snapshot,
  initialAgent = "project",
  initialObjective = "",
  onSubmit,
}: {
  snapshot: Snapshot;
  initialAgent?: AgentId;
  initialObjective?: string;
  onSubmit: (request: Partial<TaskRequest> | WorkflowRequest) => Promise<void>;
}) {
  const [agent, setAgent] = useState<AgentId>(initialAgent),
    [tool, setTool] = useState<ToolName>(
      agents.find((a) => a.id === initialAgent)!.tools[0],
    ),
    [strategy, setStrategy] = useState("single"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (strategy === "team") {
        const objective = String(f.get("objective")),
          projectId = String(f.get("projectId"));
        await onSubmit({
          objective,
          steps: [
            {
              key: "plan",
              request: {
                agent: "project",
                tool: "project.plan",
                objective,
                projectId,
                dependsOn: [],
              },
              after: [],
            },
            {
              key: "scenarios",
              request: {
                agent: "business",
                tool: "business.brief",
                objective,
                projectId,
                dependsOn: [],
              },
              after: [],
            },
            {
              key: "draft",
              request: {
                agent: "communication",
                tool: "communication.draft",
                objective: `Prepare a review request for: ${objective}`,
                projectId,
                dependsOn: [],
              },
              after: ["plan", "scenarios"],
            },
          ],
        });
        return;
      }
      await onSubmit({
        agent,
        tool,
        ...(tool.startsWith("computer.")
          ? { computer: computerFromForm(f, tool) }
          : {}),
        ...(tool === "browser.interact" ? { browser: browserFromForm(f) } : {}),
        objective: String(f.get("objective")),
        projectId: String(f.get("projectId")),
        url: f.get("url") ? String(f.get("url")) : undefined,
        text: f.get("text") ? String(f.get("text")) : undefined,
        path: f.get("path") ? String(f.get("path")) : undefined,
        ...(tool === "business.brief"
          ? {
              customers: Number(f.get("customers")),
              price: Number(f.get("price")),
              expenses: Number(f.get("expenses")),
            }
          : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const description = agents.find((a) => a.id === agent)!;
  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <label>
        Objective
        <textarea
          name="objective"
          required
          minLength={3}
          maxLength={4000}
          defaultValue={initialObjective}
          placeholder="What would you like to accomplish?"
          rows={3}
        />
      </label>
      <label>
        Execution strategy
        <select
          aria-label="Execution strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
        >
          <option value="single">One specialist + supervisor</option>
          <option value="team">
            Coordinate project, business & communication
          </option>
        </select>
      </label>
      {strategy === "team" && (
        <div className="notice">
          Project and Business run independently. Communication receives both
          outputs, then Supervisor checks the whole workflow. Financial values
          use clearly labeled illustrative assumptions.
        </div>
      )}
      {strategy === "single" && (
        <div className="form-grid">
          <label>
            Assigned agent
            <select
              aria-label="Assigned agent"
              value={agent}
              onChange={(e) => {
                const id = e.target.value as AgentId;
                setAgent(id);
                setTool(agents.find((a) => a.id === id)!.tools[0]);
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Execution tool
            <select
              aria-label="Execution tool"
              value={tool}
              onChange={(e) => setTool(e.target.value as ToolName)}
            >
              {description.tools.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {strategy === "single" && (
        <p className="hint">{description.description}</p>
      )}
      <label>
        Project scope
        <select name="projectId">
          <option value="personal">Personal workspace</option>
          {snapshot.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {strategy === "single" &&
        [
          "browser.inspect",
          "browser.interact",
          "research.collect",
          "marketing.audit",
        ].includes(tool) && (
          <label>
            Source URL
            <input
              name="url"
              type="url"
              required
              placeholder="https://example.com"
            />
            <small>
              Allowed hosts:{" "}
              {snapshot.capabilities.allowedHosts.join(", ") || "none"}
            </small>
          </label>
        )}
      {strategy === "single" &&
        ["code.review", "workspace.write"].includes(tool) && (
          <label>
            Workspace file path
            <input
              name="path"
              required={tool === "workspace.write"}
              placeholder="notes/brief.txt"
            />
            <small>
              Relative to the isolated AGENTS workspace. Existing files are
              never overwritten.
            </small>
          </label>
        )}
      {strategy === "single" &&
        [
          "code.review",
          "workspace.write",
          "communication.draft",
          "memory.search",
          "model.draft",
          "model.plan",
        ].includes(tool) && (
          <label>
            {tool === "memory.search"
              ? "Search terms"
              : "Source text / content"}
            <textarea
              aria-label={
                tool === "memory.search"
                  ? "Search terms"
                  : "Source text / content"
              }
              name="text"
              rows={6}
              required={tool === "workspace.write"}
              placeholder={
                tool === "code.review"
                  ? 'const message: string = "Hello, AGENTS";'
                  : "Provide the context for this task…"
              }
            />
          </label>
        )}
      {strategy === "single" && tool.startsWith("computer.") && (
        <ComputerFields key={tool} snapshot={snapshot} tool={tool} />
      )}
      {strategy === "single" && tool === "browser.interact" && (
        <BrowserFields />
      )}
      {strategy === "single" && tool === "business.brief" && (
        <div className="form-grid triple">
          <label>
            Customers
            <input
              name="customers"
              type="number"
              min="0"
              defaultValue="10"
              required
            />
          </label>
          <label>
            Price per customer
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              defaultValue="100"
              required
            />
          </label>
          <label>
            Expenses
            <input
              name="expenses"
              type="number"
              min="0"
              step="0.01"
              defaultValue="200"
              required
            />
          </label>
        </div>
      )}
      {strategy === "single" && requiresApproval(tool) && (
        <div className="notice amber">
          <LockKeyhole size={17} />
          This task will wait for your approval before executing.
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <button className="primary" disabled={busy || snapshot.policy.stopped}>
        {busy ? "Creating workflow…" : "Create workflow"}
        <ArrowUpRight size={17} />
      </button>
    </form>
  );
}
