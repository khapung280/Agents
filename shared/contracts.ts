import { z } from "zod";
import {
  ComputerRequest,
  BrowserInteraction,
  type ComputerStatus,
} from "./computer.js";

export const agentIds = [
  "computer",
  "browser",
  "developer",
  "research",
  "business",
  "marketing",
  "communication",
  "project",
  "memory",
  "supervisor",
] as const;
export type AgentId = (typeof agentIds)[number];
export const toolNames = [
  "workspace.inventory",
  "browser.inspect",
  "code.review",
  "research.collect",
  "business.brief",
  "marketing.audit",
  "communication.draft",
  "project.plan",
  "memory.search",
  "supervisor.verify",
  "workspace.write",
  "model.draft",
  "model.plan",
  "computer.observe",
  "computer.launch",
  "computer.act",
  "computer.delegate",
  "computer.vision.prepare",
  "browser.interact",
] as const;
export type ToolName = (typeof toolNames)[number];
export const taskStates = [
  "queued",
  "planning",
  "waiting_dependencies",
  "running",
  "waiting_approval",
  "retrying",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskState = (typeof taskStates)[number];
export type CoreState =
  | "idle"
  | "listening"
  | "thinking"
  | "planning"
  | "delegating"
  | "executing"
  | "speaking"
  | "success"
  | "error"
  | "approval"
  | "offline";
export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  tools: ToolName[];
  description: string;
}
export const agents: AgentDefinition[] = [
  {
    id: "computer",
    name: "Computer Agent",
    role: "Workspace operations",
    color: "#6edbff",
    tools: [
      "workspace.inventory",
      "workspace.write",
      "computer.observe",
      "computer.launch",
      "computer.act",
      "computer.vision.prepare",
    ],
    description:
      "Scoped workspace tools and opt-in Windows UI Automation. Native observation, approved input, and launch require an allowlisted application on a Windows host.",
  },
  {
    id: "browser",
    name: "Browser Agent",
    role: "Browser automation",
    color: "#6598ff",
    tools: ["browser.inspect", "browser.interact"],
    description:
      "Opens allowlisted public HTTPS pages in an isolated Chromium session and captures verified page evidence.",
  },
  {
    id: "developer",
    name: "Developer Agent",
    role: "Code intelligence",
    color: "#ad8fff",
    tools: ["code.review", "model.draft"],
    description:
      "Analyzes TypeScript source with compiler diagnostics. Can prepare model-assisted code drafts when a provider is configured; no unrestricted shell execution.",
  },
  {
    id: "research",
    name: "Research Agent",
    role: "Evidence & sources",
    color: "#5addcf",
    tools: ["research.collect", "model.draft"],
    description:
      "Collects cited page evidence from allowlisted sources. Source content cannot authorize tools.",
  },
  {
    id: "business",
    name: "Business Agent",
    role: "Strategy & analysis",
    color: "#e5b979",
    tools: ["business.brief", "model.draft"],
    description:
      "Builds explicit revenue scenarios from supplied inputs, labeling assumptions and estimates.",
  },
  {
    id: "marketing",
    name: "Marketing Agent",
    role: "SEO & content",
    color: "#d68fdc",
    tools: ["marketing.audit", "model.draft"],
    description:
      "Audits the real title, description, headings and links of a permitted page. Does not publish campaigns.",
  },
  {
    id: "communication",
    name: "Communication Agent",
    role: "Drafts & follow-ups",
    color: "#7ed8c5",
    tools: ["communication.draft", "model.draft"],
    description:
      "Prepares editable correspondence drafts. Sending accounts are not connected; nothing is sent.",
  },
  {
    id: "project",
    name: "Project Manager",
    role: "Plans & coordination",
    color: "#86b6ff",
    tools: ["project.plan", "model.draft", "model.plan"],
    description:
      "Creates persistent project milestones and verifies completion checkpoints through typed tasks.",
  },
  {
    id: "memory",
    name: "Memory Agent",
    role: "Context & knowledge",
    color: "#c0a1ef",
    tools: ["memory.search"],
    description:
      "Searches user-reviewed memories within one project scope. Memories can be edited and deleted.",
  },
  {
    id: "supervisor",
    name: "Supervisor Agent",
    role: "Verification & policy",
    color: "#b2d69b",
    tools: ["supervisor.verify"],
    description:
      "Checks persisted output evidence and reports incomplete work. Cannot grant approvals or override policy.",
  },
];
for (const agent of agents) agent.tools.push("computer.delegate");

export const requiresApproval = (tool: ToolName) =>
  [
    "workspace.write",
    "model.draft",
    "model.plan",
    "computer.observe",
    "computer.launch",
    "computer.act",
    "computer.delegate",
    "browser.interact",
  ].includes(tool);

export const TaskInput = z.object({
  objective: z.string().trim().min(3).max(4000),
  agent: z.enum(agentIds).default("project"),
  tool: z.enum(toolNames).optional(),
  projectId: z.string().max(100).default("personal"),
  computer: ComputerRequest.optional(),
  browser: BrowserInteraction.optional(),
  url: z.url().max(2048).optional(),
  text: z.string().max(50000).optional(),
  path: z.string().max(240).optional(),
  customers: z.number().int().min(0).max(10000000).optional(),
  price: z.number().min(0).max(10000000).optional(),
  expenses: z.number().min(0).max(1000000000).optional(),
  dependsOn: z.array(z.string()).max(10).default([]),
});
export type TaskRequest = z.infer<typeof TaskInput>;
export interface Artifact {
  id: string;
  name: string;
  kind: "text" | "json" | "image";
  content?: string;
  path?: string;
}
export interface Usage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number | null;
}
export interface Task {
  workflow: boolean;
  id: string;
  parentId: string | null;
  agent: AgentId;
  tool: ToolName;
  objective: string;
  input: TaskRequest;
  state: TaskState;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  retries: number;
  maxRetries: number;
  output: Artifact[];
  verification: string | null;
  error: string | null;
  usage: Usage | null;
  approval: "not_required" | "pending" | "approved" | "rejected" | "consumed";
  dependsOn: string[];
}
export interface SystemEvent {
  id: number;
  type: string;
  taskId: string | null;
  agent: AgentId | null;
  message: string;
  at: string;
}
export interface Memory {
  id: string;
  scope: string;
  category: string;
  title: string;
  content: string;
  updatedAt: string;
}
export interface Project {
  id: string;
  name: string;
  objective: string;
  repository: string;
  milestones: string[];
  createdAt: string;
}
export interface Schedule {
  id: string;
  name: string;
  request: TaskRequest;
  nextRun: string;
  intervalMinutes: number | null;
  paused: boolean;
  lastTaskId: string | null;
}
export interface Policy {
  mode: "manual" | "assisted" | "autonomous";
  stopped: boolean;
  maxConcurrent: number;
  maxCallsPerAgent: number;
  budgetUsd: number;
  agents: Record<AgentId, boolean>;
}
export interface Snapshot {
  agents: AgentDefinition[];
  tasks: Task[];
  events: SystemEvent[];
  memories: Memory[];
  projects: Project[];
  schedules: Schedule[];
  policy: Policy;
  provider: {
    configured: boolean;
    name: string | null;
    model: string | null;
    pricesConfigured: boolean;
  };
  capabilities: {
    browser: boolean;
    windows: boolean;
    computer: ComputerStatus;
    voice: "browser-dependent";
    allowedHosts: string[];
  };
  metrics: {
    completed: number;
    active: number;
    approvals: number;
    failed: number;
    successRate: number | null;
    tokens: number;
    cost: number | null;
    today: number;
  };
  uptimeSeconds: number;
}
export const MemoryInput = z.object({
  scope: z.string().min(1).max(100),
  category: z.enum([
    "preference",
    "project",
    "document",
    "business",
    "decision",
    "workflow",
  ]),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20000),
});
export const ProjectInput = z.object({
  name: z.string().trim().min(1).max(100),
  objective: z.string().max(4000),
  repository: z.string().max(500).default(""),
});
export const ScheduleInput = z.object({
  name: z.string().trim().min(1).max(120),
  request: TaskInput,
  nextRun: z.iso.datetime(),
  intervalMinutes: z.number().int().min(5).max(525600).nullable().default(null),
});
export const PolicyInput = z.object({
  mode: z.enum(["manual", "assisted", "autonomous"]).optional(),
  maxCallsPerAgent: z.number().int().min(1).max(1000).optional(),
  budgetUsd: z.number().min(0).max(1000).optional(),
  agents: z.record(z.enum(agentIds), z.boolean()).optional(),
});

export const WorkflowInput = z.object({
  objective: z.string().trim().min(3).max(4000),
  steps: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
        request: TaskInput,
        after: z.array(z.string()).max(10).default([]),
      }),
    )
    .min(1)
    .max(10),
});
export type WorkflowRequest = z.infer<typeof WorkflowInput>;
