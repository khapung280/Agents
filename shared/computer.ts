import { z } from "zod";

const id = z.string().min(1).max(160);
export const ComputerAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("focus") }).strict(),
  z.object({ kind: z.literal("move"), elementId: id }).strict(),
  z.object({ kind: z.literal("click"), elementId: id }).strict(),
  z.object({ kind: z.literal("invoke"), elementId: id }).strict(),
  z
    .object({
      kind: z.literal("setText"),
      elementId: id,
      text: z.string().max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("typeText"),
      elementId: id,
      text: z
        .string()
        .min(1)
        .max(500)
        .refine(
          (v) =>
            [...v].every(
              (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
            ),
          "Use explicit key actions for control characters",
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("key"),
      elementId: id,
      key: z.enum([
        "Tab",
        "Escape",
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "Control+A",
      ]),
    })
    .strict(),
]);
export const ComputerExpectation = z
  .object({
    elementId: id,
    property: z.enum(["name", "value", "focused"]),
    equals: z.string().max(2000),
  })
  .strict();
export const ComputerRequest = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("observe"),
      app: id,
      windowId: z.string().regex(/^\d+$/).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("launch"), app: id }).strict(),
  z
    .object({
      kind: z.literal("act"),
      observationId: z.uuid(),
      action: ComputerAction,
      expect: ComputerExpectation.optional(),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (
        ["click", "invoke", "typeText", "key"].includes(v.action.kind) &&
        !v.expect
      )
        ctx.addIssue({
          code: "custom",
          message: "This action requires an explicit observable postcondition",
          path: ["expect"],
        });
    }),
  z.object({ kind: z.literal("vision"), observationId: z.uuid() }).strict(),
]);
export type ComputerCommand = z.infer<typeof ComputerRequest>;
export type NativeAction = z.infer<typeof ComputerAction>;
export const Rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const ElementEvidence = z.object({
  id,
  name: z.string().max(2000),
  controlType: z.string(),
  enabled: z.boolean(),
  password: z.boolean(),
  focused: z.boolean(),
  value: z.string().max(2000).nullish(),
  bounds: Rect,
});
export const WindowEvidence = z.object({
  windowId: z.string().regex(/^\d+$/),
  processId: z.number().int().positive(),
  processStartedAt: z.string(),
  executable: z.string(),
  title: z.string().max(2000),
  bounds: Rect,
  foreground: z.boolean(),
  elements: z.array(ElementEvidence).max(200),
});
export type WindowState = z.infer<typeof WindowEvidence>;
export interface ComputerObservation {
  id: string;
  app: string;
  projectId: string;
  observedAt: string;
  expiresAt: string;
  window: WindowState;
  screenshot: string;
}
export const WindowsPolicy = z
  .object({
    enabled: z.boolean().default(false),
    apps: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
            name: z.string().min(1).max(100),
            executable: z.string().regex(/^[a-zA-Z]:\\.+\.exe$/i),
            allowLaunch: z.boolean().default(false),
            allowTestDocuments: z.boolean().optional(),
            actions: z
              .array(
                z.enum([
                  "focus",
                  "move",
                  "click",
                  "invoke",
                  "setText",
                  "typeText",
                  "key",
                ]),
              )
              .default([]),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
  .refine(
    (p) => new Set(p.apps.map((a) => a.id)).size === p.apps.length,
    "App IDs must be unique",
  );
export type ComputerPolicy = z.infer<typeof WindowsPolicy>;
export interface ComputerStatus {
  platform: string;
  enabled: boolean;
  available: boolean;
  verifiedThisSession: boolean;
  reason: string;
  apps: Pick<
    ComputerPolicy["apps"][number],
    "id" | "name" | "allowLaunch" | "allowTestDocuments" | "actions"
  >[];
}

const locator = z
  .object({
    role: z.enum([
      "button",
      "link",
      "textbox",
      "checkbox",
      "combobox",
      "heading",
    ]),
    name: z.string().min(1).max(200),
  })
  .strict();
export const BrowserInteraction = z
  .object({
    action: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("click"), target: locator }).strict(),
      z
        .object({
          kind: z.literal("fill"),
          target: locator,
          text: z.string().max(2000),
        })
        .strict(),
      z
        .object({
          kind: z.literal("press"),
          target: locator,
          key: z.enum(["Tab", "Enter", "Escape", "ArrowDown", "ArrowUp"]),
        })
        .strict(),
    ]),
    expect: z
      .object({
        target: locator,
        property: z.enum(["text", "value", "visible"]),
        equals: z.string().max(2000),
      })
      .strict(),
  })
  .strict();
export type BrowserAction = z.infer<typeof BrowserInteraction>;
