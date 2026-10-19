import { test, expect } from "@playwright/test";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.js";

// Actual browser -> HTTP/WS -> engine -> local tools. Only the external model
// transport is a deterministic fixture; no paid API or desktop input occurs.
test("guided session UI enforces paid-call approval, plan review and final evidence acceptance", async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), "agents-session-e2e-"));
  const keys = [
    "AGENTS_MODEL_PROVIDER",
    "AGENTS_MODEL",
    "AGENTS_OPENAI_API_KEY",
    "AGENTS_INPUT_PRICE_PER_MILLION",
    "AGENTS_OUTPUT_PRICE_PER_MILLION",
  ];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  Object.assign(process.env, {
    AGENTS_MODEL_PROVIDER: "openai",
    AGENTS_MODEL: "offline-fixture-model",
    AGENTS_OPENAI_API_KEY: "offline-fixture-key",
    AGENTS_INPUT_PRICE_PER_MILLION: "1",
    AGENTS_OUTPUT_PRICE_PER_MILLION: "2",
  });
  globalThis.fetch = async (url) => {
    if (url !== "https://api.openai.com/v1/responses")
      throw new Error("Unexpected external request in offline browser fixture");
    calls++;
    return new Response(
      JSON.stringify({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [
          {
            type: "function_call",
            name: "propose_workflow",
            status: "completed",
            arguments: JSON.stringify({
              objective: "Inventory the isolated workspace",
              steps: [
                {
                  key: "inventory",
                  agent: "computer",
                  tool: "workspace.inventory",
                  objective: "Inventory the isolated workspace",
                  after: [],
                  url: null,
                  text: null,
                  path: null,
                  customers: null,
                  price: null,
                  expenses: null,
                },
              ],
            }),
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const runtime = createApp({
    directory,
    pairingToken: "offline-ui-fixture-token",
    hosts: [],
  });
  runtime.app.use(express.static(resolve("dist")));
  runtime.app.get("/", (_req, res) => res.sendFile(resolve("dist/index.html")));
  try {
    await new Promise<void>((r) => runtime.server.listen(0, "127.0.0.1", r));
    runtime.start();
    const base = `http://127.0.0.1:${(runtime.server.address() as AddressInfo).port}`;
    expect(
      (
        await page.request.post(base + "/api/reasoning-sessions", {
          data: { objective: "Unpaired request" },
        })
      ).status(),
    ).toBe(401);
    await page.request.post(base + "/api/session", {
      data: { token: "offline-ui-fixture-token" },
    });
    await page.goto(base);
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    const panel = page.locator(".reasoning-panel");
    await panel
      .getByLabel("Session goal")
      .fill("Inspect the approved isolated workspace");
    await panel
      .getByRole("button", { name: "Create reviewed session" })
      .click();
    await expect(panel.getByRole("status")).toContainText("planning");
    expect(calls).toBe(0);
    await panel
      .getByRole("button", {
        name: "Review current task, approval and evidence",
      })
      .click();
    const task = page.getByRole("dialog").last();
    await task
      .getByRole("button", { name: "Approve once", exact: true })
      .click();
    await expect(
      task.getByText("Proposed workflow", { exact: true }),
    ).toBeVisible();
    expect(calls).toBe(1);
    await task.getByRole("button", { name: "Close panel" }).click();
    await expect(panel.getByRole("status")).toContainText("awaiting plan");
    await panel
      .getByRole("button", { name: "Execute this reviewed plan" })
      .click();
    await expect(panel.getByRole("status")).toContainText(
      "awaiting completion",
    );
    expect(runtime.engine.reasoning.list()[0].state).toBe(
      "awaiting_completion",
    );
    await panel
      .getByRole("button", { name: "Accept the reviewed result" })
      .click();
    await expect(panel.getByRole("status")).toContainText("completed");
    expect(calls).toBe(1);
    await page.reload();
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    await expect(
      page.locator(".reasoning-panel").getByRole("status"),
    ).toContainText("completed");
  } finally {
    await runtime.close();
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("screen review UI requires fresh image acknowledgement and separate action approval", async ({
  page,
}) => {
  const { WindowsComputer } = await import("../../server/computer/windows.js");
  const directory = await mkdtemp(join(tmpdir(), "agents-screen-e2e-"));
  const keys = [
    "AGENTS_MODEL_PROVIDER",
    "AGENTS_MODEL",
    "AGENTS_OPENAI_API_KEY",
    "AGENTS_INPUT_PRICE_PER_MILLION",
    "AGENTS_OUTPUT_PRICE_PER_MILLION",
    "AGENTS_VISION_INPUT_TOKEN_RESERVE",
  ];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let paid = 0;
  let native = 0;
  let value = "";
  Object.assign(process.env, {
    AGENTS_MODEL_PROVIDER: "openai",
    AGENTS_MODEL: "offline-vision-fixture",
    AGENTS_OPENAI_API_KEY: "offline-fixture-key",
    AGENTS_INPUT_PRICE_PER_MILLION: "1",
    AGENTS_OUTPUT_PRICE_PER_MILLION: "2",
    AGENTS_VISION_INPUT_TOKEN_RESERVE: "4096",
  });
  globalThis.fetch = async (url, init) => {
    if (url !== "https://api.openai.com/v1/responses")
      throw new Error("Unexpected network request in offline screen fixture");
    paid++;
    const body = JSON.parse(init!.body as string);
    const observation = JSON.parse(body.input[1].content[0].text).observation;
    const result = {
      observationId: observation.id,
      outcome: value ? "complete" : "action",
      explanation: "Deterministic UI test fixture",
      action: value
        ? null
        : { kind: "setText", elementId: "note", text: "Verified browser note" },
      expect: null,
    };
    return new Response(
      JSON.stringify({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(result) }],
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const runtime = createApp({
    directory,
    pairingToken: "offline-ui-fixture-token",
    hosts: [],
    computerFactory: (store) =>
      new WindowsComputer(store, {
        platform: "win32",
        policy: {
          enabled: true,
          apps: [
            {
              id: "fixture",
              name: "Offline fixture window",
              executable: "C:\\Fixtures\\Desktop.exe",
              allowLaunch: false,
              actions: ["setText"],
            },
          ],
        },
        transport: async (request) => {
          native++;
          if (
            request.command.kind === "act" &&
            request.command.action.kind === "setText"
          )
            value = request.command.action.text;
          return {
            window: {
              windowId: "100",
              processId: 25,
              processStartedAt: "2026-01-01T00:00:00Z",
              executable: "C:\\Fixtures\\Desktop.exe",
              title: "Offline fixture window",
              foreground: true,
              bounds: { x: 0, y: 0, width: 600, height: 400 },
              elements: [
                {
                  id: "note",
                  name: "Note",
                  controlType: "ControlType.Edit",
                  enabled: true,
                  password: false,
                  focused: true,
                  value,
                  bounds: { x: 10, y: 10, width: 200, height: 40 },
                },
              ],
            },
            png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
            verified:
              "Explicit offline transport fixture; not real Windows input.",
          };
        },
      }),
  });
  runtime.app.use(express.static(resolve("dist")));
  runtime.app.get("/", (_req, res) => res.sendFile(resolve("dist/index.html")));
  try {
    await new Promise<void>((r) => runtime.server.listen(0, "127.0.0.1", r));
    runtime.start();
    const base = `http://127.0.0.1:${(runtime.server.address() as AddressInfo).port}`;
    await page.request.post(base + "/api/session", {
      data: { token: "offline-ui-fixture-token" },
    });
    await page.goto(base);
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    const panel = page.locator(".reasoning-panel");
    await panel
      .getByLabel("Session goal")
      .fill("Write and verify the fixture note");
    await panel.getByLabel("Session mode").selectOption("screen");
    await panel
      .getByRole("button", { name: "Create reviewed session" })
      .click();
    expect(native).toBe(0);
    expect(paid).toBe(0);
    await panel
      .getByRole("button", {
        name: "Review current task, approval and evidence",
      })
      .click();
    const task = page.getByRole("dialog").last();
    await task
      .getByRole("button", { name: "Approve once", exact: true })
      .click();
    await expect(
      task.getByText("Windows observation", { exact: true }),
    ).toBeVisible();
    await task.getByRole("button", { name: "Close panel" }).click();
    const share = panel.getByRole("button", {
      name: "Approve this image and one paid vision call",
    });
    await expect(share).toBeDisabled();
    await expect(panel.getByRole("checkbox")).not.toBeChecked();
    await panel.getByRole("checkbox").check();
    await share.click();
    await expect(panel.getByRole("status")).toContainText("awaiting action");
    expect(native).toBe(1);
    expect(paid).toBe(1);
    await panel
      .getByRole("button", { name: "Approve this action once" })
      .click();
    await expect(panel.getByRole("status")).toContainText("awaiting share");
    expect(native).toBe(2);
    await expect(panel.getByRole("checkbox")).not.toBeChecked();
    await expect(share).toBeDisabled();
    await panel.getByRole("checkbox").check();
    await share.click();
    await expect(panel.getByRole("status")).toContainText(
      "awaiting completion",
    );
    expect(paid).toBe(2);
    await panel
      .getByRole("button", { name: "Accept the reviewed result" })
      .click();
    await expect(panel.getByRole("status")).toContainText("completed");
  } finally {
    await runtime.close();
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
