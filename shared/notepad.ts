import { z } from "zod";
import type { ComputerObservation } from "./computer.js";
const document = { documentId: z.uuid() };
const observed = { ...document, observationId: z.uuid() };
const target = { ...observed, elementId: z.string().min(1).max(160) };
export const NotepadRequest = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("prepare"),
      app: z.string().min(1).max(40),
      text: z
        .string()
        .min(1)
        .max(500)
        .refine(
          (v) =>
            [...v].every(
              (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
            ),
          "The first Notepad test supports one line of plain text.",
        ),
    })
    .strict(),
  z.object({ kind: z.literal("launch"), ...document }).strict(),
  z.object({ kind: z.literal("observe"), ...document }).strict(),
  z.object({ kind: z.literal("focus"), ...target }).strict(),
  z.object({ kind: z.literal("write"), ...target }).strict(),
  z.object({ kind: z.literal("save"), ...target }).strict(),
]);
export type NotepadCommand = z.infer<typeof NotepadRequest>;
export interface TestDocument {
  id: string;
  app: string;
  projectId: string;
  text: string;
  expectedSha256: string;
  path: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  state: "prepared" | "launched" | "written" | "saved" | "blocked";
  taskIds: string[];
  lastObservation?: ComputerObservation;
  savedSha256?: string;
  error?: string;
}
