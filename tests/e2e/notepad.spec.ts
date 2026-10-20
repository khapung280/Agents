import { test, expect } from "@playwright/test";
import express from "express";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.js";
import { WindowsComputer } from "../../server/computer/windows.js";

test("Notepad UI creates a real disposable file only after approval and keeps launch separately gated", async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), "agents-notepad-ui-"));
  let nativeCalls = 0;
  const runtime = createApp({
    directory,
    pairingToken: "local-notepad-ui-fixture",
    hosts: [],
    computerFactory: (store) =>
      new WindowsComputer(store, {
        platform: "win32",
        policy: {
          enabled: true,
          apps: [
            {
              id: "notepad",
              name: "Explicit Notepad transport fixture",
              executable: "C:\\Windows\\notepad.exe",
              allowLaunch: true,
              allowTestDocuments: true,
              actions: ["focus", "click", "typeText"],
            },
          ],
        },
        transport: async () => {
          nativeCalls++;
          throw new Error(
            "This UI test must never authorize native execution.",
          );
        },
      }),
  });
  runtime.app.use(express.static(resolve("dist")));
  runtime.app.get("/", (_req, res) => res.sendFile(resolve("dist/index.html")));
  try {
    await new Promise<void>((r) => runtime.server.listen(0, "127.0.0.1", r));
    runtime.start();
    const base =
      "http://127.0.0.1:" + (runtime.server.address() as AddressInfo).port;
    expect(
      (
        await page.request.post(base + "/api/session", {
          data: { token: "local-notepad-ui-fixture" },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto(base);
    await page.getByRole("button", { name: "Computer", exact: true }).click();
    await page
      .getByLabel("Exact one-line test text")
      .fill("Reviewed नेपाली sample");
    await page
      .getByRole("button", { name: "Request test document", exact: true })
      .click();
    expect(runtime.engine.notepad.list()).toHaveLength(0);
    const detail = page.getByRole("dialog").last();
    await expect(
      detail.getByText("External model processing and API cost", {
        exact: true,
      }),
    ).toHaveCount(0);
    await detail
      .getByRole("button", { name: "Approve once", exact: true })
      .click();
    await expect.poll(() => runtime.engine.notepad.list().length).toBe(1);
    const document = runtime.engine.notepad.list()[0];
    expect(document.text).toBe("Reviewed नेपाली sample");
    expect((await readFile(document.path)).length).toBe(0);
    await detail.getByRole("button", { name: "Close panel" }).click();
    await page
      .getByRole("button", { name: "Request launch approval", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .last()
        .getByText("Registered document and exact approved text", {
          exact: true,
        }),
    ).toBeVisible();
    expect(nativeCalls).toBe(0);
    await page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "Reject", exact: true })
      .click();
    expect(nativeCalls).toBe(0);
    expect(runtime.engine.notepad.list()[0].state).toBe("prepared");
  } finally {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});
