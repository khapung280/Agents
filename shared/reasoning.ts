import { z } from "zod";
import {
  ComputerAction,
  ComputerExpectation,
  type ComputerObservation,
} from "./computer.js";
import type { WorkflowRequest } from "./contracts.js";

export const SessionInput = z
  .object({
    objective: z.string().trim().min(3).max(4000),
    projectId: z.string().min(1).max(100).default("personal"),
    app: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,39}$/)
      .optional(),
  })
  .strict();

export const VisionDecision = z
  .object({
    observationId: z.uuid(),
    outcome: z.enum(["action", "blocked", "needs_observation", "complete"]),
    explanation: z.string().min(1).max(2000),
    action: ComputerAction.nullable(),
    expect: ComputerExpectation.nullable(),
  })
  .strict();
export type ScreenDecision = z.infer<typeof VisionDecision>;
export interface ScreenShareGrant {
  id: string;
  sessionId: string;
  taskId: string | null;
  observationId: string;
  projectId: string;
  imageSha256: string;
  windowId: string;
  processId: number;
  processStartedAt: string;
  expiresAt: string;
  state: "pending" | "approved" | "consumed" | "revoked";
  model: string | null;
  sensitiveContentApproved: boolean;
}
export type SessionState =
  | "planning"
  | "awaiting_plan"
  | "executing_plan"
  | "observing"
  | "awaiting_share"
  | "reasoning"
  | "awaiting_action"
  | "acting"
  | "awaiting_completion"
  | "completed"
  | "blocked"
  | "cancelled";
export interface ReasoningSession {
  id: string;
  objective: string;
  projectId: string;
  app: string | null;
  state: SessionState;
  createdAt: string;
  deadline: string;
  steps: number;
  replans: number;
  taskIds: string[];
  verifiedTaskIds: string[];
  currentTaskId: string | null;
  observation: ComputerObservation | null;
  grantId: string | null;
  proposalId: string | null;
  decision: ScreenDecision | null;
  plan: WorkflowRequest | null;
  error: string | null;
  lastCaptureAt: number;
}
