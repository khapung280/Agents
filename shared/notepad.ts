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
export function matchesTestDocumentTitle(title: string, name: string) {
  if (!/^agents-[a-f0-9-]{36}\.txt$/.test(name)) return false;
  const value = title.startsWith("*") ? title.slice(1) : title;
  return value === name || value === `${name} - Notepad`;
}
export function validateTestDocumentWindow(
  window: ComputerObservation["window"],
  name: string,
) {
  if (!matchesTestDocumentTitle(window.title, name))
    throw new Error(
      "Registered document title could not be verified; no target guessing is allowed.",
    );
  const tabs = window.elements.filter(
    (e) => e.controlType === "ControlType.TabItem",
  );
  if (
    tabs.length > 1 ||
    tabs.some((e) => !matchesTestDocumentTitle(e.name, name))
  )
    throw new Error("Personal or ambiguous Notepad tabs are prohibited.");
  const editors = window.elements.filter(
    (e) =>
      ["ControlType.Edit", "ControlType.Document"].includes(e.controlType) &&
      e.enabled &&
      !e.password &&
      e.value != null,
  );
  if (editors.length !== 1)
    throw new Error("Expected one isolated Notepad document editor.");
}
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
