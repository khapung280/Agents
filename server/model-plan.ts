import { z } from "zod";
import {
  agents,
  agentIds,
  toolNames,
  WorkflowInput,
  type Task,
} from "../shared/contracts.js";

// No observation identifiers can be invented at planning time. Native actions need
// a separate, fresh observation and review; this planner cannot grant permission.
export const planningTools = toolNames.filter(
  (tool) =>
    !tool.startsWith("computer.") &&
    !["model.plan", "browser.interact"].includes(tool),
);
export const ModelPlan = z
  .object({
    objective: z.string().min(3).max(4000),
    steps: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
            agent: z.enum(agentIds),
            tool: z.enum(planningTools),
            objective: z.string().min(3).max(4000),
            after: z.array(z.string()).max(8),
            url: z.string().max(2048).nullable(),
            text: z.string().max(12000).nullable(),
            path: z.string().max(240).nullable(),
            customers: z.number().int().min(0).max(10000000).nullable(),
            price: z.number().min(0).max(10000000).nullable(),
            expenses: z.number().min(0).max(1000000000).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

export const planFunction = {
  type: "function",
  name: "propose_workflow",
  description:
    "Propose a dependency-ordered workflow for owner review. This does not execute actions or grant permissions.",
  strict: true,
  parameters: z.toJSONSchema(ModelPlan, { target: "draft-7" }),
};

export function validateModelPlan(
  raw: unknown,
  task: Task,
  hosts: string[],
  enabled: Record<string, boolean>,
  maxSteps: number,
) {
  const proposal = ModelPlan.parse(raw);
  if (proposal.steps.length > maxSteps)
    throw new Error("Model plan exceeds the configured step limit.");
  const seen = new Set<string>();
  for (const step of proposal.steps) {
    if (
      seen.has(step.key) ||
      step.after.some((dep) => !seen.has(dep)) ||
      new Set(step.after).size !== step.after.length
    )
      throw new Error(
        "Model plan dependencies must be unique and reference earlier steps.",
      );
    if (
      !enabled[step.agent] ||
      !agents.find((a) => a.id === step.agent)!.tools.includes(step.tool)
    )
      throw new Error(
        "Model plan agent is paused or not authorized for the selected tool.",
      );
    if (step.url !== null) {
      const url = new URL(step.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        !hosts.includes(url.hostname)
      )
        throw new Error("Model plan URL is outside the permitted HTTPS hosts.");
    }
    if (
      ["browser.inspect", "research.collect", "marketing.audit"].includes(
        step.tool,
      ) &&
      !step.url
    )
      throw new Error("Model plan source tool requires a URL.");
    if (
      step.path !== null &&
      (!step.path ||
        step.path.startsWith("/") ||
        /[\\\0:]/.test(step.path) ||
        step.path.split("/").includes(".."))
    )
      throw new Error("Model plan path escapes the isolated workspace.");
    if (step.tool === "workspace.write" && (!step.path || !step.text))
      throw new Error("Model plan file creation requires a path and content.");
    if (step.tool === "code.review" && !step.path && !step.text)
      throw new Error(
        "Model plan code review requires source or a workspace path.",
      );
    if (step.tool === "supervisor.verify" && !step.after.length)
      throw new Error(
        "Model plan verification requires evidence dependencies.",
      );
    seen.add(step.key);
  }
  return WorkflowInput.parse({
    objective: proposal.objective,
    steps: proposal.steps.map(
      ({
        key,
        after,
        agent,
        tool,
        objective,
        url,
        text,
        path,
        customers,
        price,
        expenses,
      }) => ({
        key,
        after,
        request: {
          agent,
          tool,
          objective,
          projectId: task.input.projectId,
          ...(url === null ? {} : { url }),
          ...(text === null ? {} : { text }),
          ...(path === null ? {} : { path }),
          ...(customers === null ? {} : { customers }),
          ...(price === null ? {} : { price }),
          ...(expenses === null ? {} : { expenses }),
        },
      }),
    ),
  });
}
