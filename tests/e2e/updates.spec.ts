import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { UpdateStatus } from "../../client/desktopUpdates";
import { openDashboard } from "./dashboard-session.js";
const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

// The browser fixture replaces Electron IPC and native approval only. These are
// UI tests, not signature-verification, Windows installer or SmartScreen tests.
interface UpdateFixture {
  calls: { method: string; arguments: number }[];
  listeners: number;
  approve: boolean;
  noUpdate: boolean;
  finishDownload(): void;
  fail(message: string): void;
}
type FixtureWindow = Window & { updateFixture: UpdateFixture };

async function openUpdates(page: Page, fixture = true) {
  if (fixture)
    await page.addInitScript((version) => {
      let status: UpdateStatus = { currentVersion: version, phase: "idle" };
      const listeners = new Set<(status: UpdateStatus) => void>();
      let finish: ((status: UpdateStatus) => void) | undefined;
      const value: UpdateFixture = {
        calls: [],
        listeners: 0,
        approve: false,
        noUpdate: false,
        finishDownload() {
          send({ phase: "ready", received: 100, total: 100 });
          finish?.(status);
          finish = undefined;
        },
        fail(message) {
          send({ phase: "failed", error: message });
        },
      };
      function send(next: Partial<UpdateStatus>) {
        status = { ...status, ...next };
        for (const listener of listeners) listener(structuredClone(status));
      }
      const record = (method: string, args: unknown[]) =>
        value.calls.push({ method, arguments: args.length });
      window.agentsUpdates = {
        async getStatus(...args: unknown[]) {
          record("getStatus", args);
          return structuredClone(status);
        },
        async check(...args: unknown[]) {
          record("check", args);
          send({
            phase: value.noUpdate ? "current" : "available",
            version: value.noUpdate ? version : "9.0.0",
            notes: "UI fixture release notes: <img src=x onerror=alert(1)>",
            sha256: "a".repeat(64),
            error: undefined,
          });
          return structuredClone(status);
        },
        async download(...args: unknown[]) {
          record("download", args);
          send({ phase: "downloading", received: 25, total: 100 });
          return new Promise<UpdateStatus>((resolve) => {
            finish = resolve;
          });
        },
        async cancel(...args: unknown[]) {
          record("cancel", args);
          send({
            phase: "cancelled",
            message: "Fixture cancellation: no installer was started.",
          });
          finish?.(structuredClone(status));
          finish = undefined;
          return structuredClone(status);
        },
        async install(...args: unknown[]) {
          record("install", args);
          send({
            phase: value.approve ? "awaiting_restart" : "ready",
            message: value.approve
              ? "Fixture Windows handoff pending."
              : "Fixture native approval was declined.",
          });
          return structuredClone(status);
        },
        onStatus(listener) {
          listeners.add(listener);
          value.listeners = listeners.size;
          return () => {
            listeners.delete(listener);
            value.listeners = listeners.size;
          };
        },
      };
      Object.defineProperty(window, "updateFixture", { value });
    }, version);
  await openDashboard(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  return page
    .getByRole("dialog")
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Application updates",
        exact: true,
      }),
    });
}

test("browser update panel reports actual version and cannot install software", async ({
  page,
}) => {
  const panel = await openUpdates(page, false);
  await expect(
    panel.getByLabel("Current application version", { exact: true }),
  ).toHaveText(version);
  await expect(panel.getByRole("status", { name: "Update status" })).toHaveText(
    "Windows desktop application required",
  );
  await expect(
    panel.getByRole("button", { name: "Check for Updates" }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Review installation" }),
  ).toHaveCount(0);
});

test("mock Electron update flow is explicit, cancellable and separate from task history", async ({
  page,
}) => {
  const panel = await openUpdates(page);
  const before = await (await page.request.get("/api/state")).json();
  expect(
    await page.evaluate(() =>
      (window as unknown as FixtureWindow).updateFixture.calls.map(
        (c) => c.method,
      ),
    ),
  ).toEqual(["getStatus"]);
  await panel.getByRole("button", { name: "Check for Updates" }).click();
  await expect(panel.getByRole("status", { name: "Update status" })).toHaveText(
    "Verified update available",
  );
  await expect(panel.getByLabel("Verified release notes")).toHaveText(
    "UI fixture release notes: <img src=x onerror=alert(1)>",
  );
  await expect(panel.locator("img")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Review installation" }),
  ).toHaveCount(0);

  await panel.getByRole("button", { name: "Download verified update" }).click();
  await expect(
    panel.getByRole("progressbar", { name: "Update download progress" }),
  ).toHaveAttribute("value", "25");
  await expect(
    panel.getByRole("button", { name: "Check for Updates" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Cancel update" }).click();
  await expect(panel.getByRole("status", { name: "Update status" })).toHaveText(
    "Update cancelled",
  );
  await expect(
    panel.getByRole("button", { name: "Check for Updates" }),
  ).toBeEnabled();

  await panel.getByRole("button", { name: "Check for Updates" }).click();
  await panel.getByRole("button", { name: "Download verified update" }).click();
  await page.evaluate(() =>
    (window as unknown as FixtureWindow).updateFixture.finishDownload(),
  );
  await expect(
    panel.getByRole("button", { name: "Review installation" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as unknown as FixtureWindow).updateFixture.calls.filter(
        (c) => c.method === "install",
      ),
    ),
  ).toHaveLength(0);
  await panel.getByRole("button", { name: "Review installation" }).click();
  await expect(
    panel.getByText("Fixture native approval was declined.", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("status", { name: "Update status" })).toHaveText(
    "Download verified — installation needs approval",
  );
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).updateFixture.approve = true;
  });
  await panel.getByRole("button", { name: "Review installation" }).click();
  await expect(panel.getByRole("status", { name: "Update status" })).toHaveText(
    "Installation pending — follow Windows prompts",
  );
  await expect(
    panel.getByText("Updated version started successfully", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as unknown as FixtureWindow).updateFixture.calls.every(
        (c) => c.arguments === 0,
      ),
    ),
  ).toBe(true);
  const after = await (await page.request.get("/api/state")).json();
  for (const field of ["tasks", "memories", "policy", "reasoningSessions"])
    expect(after[field]).toEqual(before[field]);
});

test("mock current and failed updates show honest status and retain a reviewable retry", async ({
  page,
}) => {
  const panel = await openUpdates(page);
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).updateFixture.noUpdate = true;
  });
  await panel.getByRole("button", { name: "Check for Updates" }).click();
  await expect(panel.getByRole("status", { name: "Update status" })).toHaveText(
    "No newer verified version",
  );
  await expect(
    panel.getByRole("button", { name: "Download verified update" }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as FixtureWindow).updateFixture.fail(
      "Fixture rejected an invalid update signature.",
    ),
  );
  await expect(panel.getByRole("alert")).toHaveText(
    "Fixture rejected an invalid update signature.",
  );
  await expect(
    panel.getByRole("button", { name: "Review installation" }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Check for Updates" }),
  ).toBeEnabled();
  await expect(
    panel.getByText(/no automatic rollback or installer replay occurs/),
  ).toBeVisible();
});
