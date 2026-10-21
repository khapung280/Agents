import { test, expect } from "@playwright/test";
import { openDashboard } from "./dashboard-session.js";
import { faceStates, faceLabels } from "../../client/faceAnimation.js";

async function evidence(page: import("@playwright/test").Page) {
  const s = await (await page.request.get("/api/state")).json();
  return {
    tasks: s.tasks,
    events: s.events,
    policy: s.policy,
    memories: s.memories,
    reasoningSessions: s.reasoningSessions,
  };
}

test("twelve clearly labeled face previews change rendering without creating operational activity", async ({
  page,
}) => {
  await openDashboard(page);
  await expect(page.locator(".orbit-node")).toHaveCount(10);
  const before = await evidence(page);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method()))
      writes.push(r.method() + " " + r.url());
  });
  await page
    .getByText("Animation Preview & render metrics", { exact: true })
    .click();
  await page.getByLabel("Animation Preview Mode", { exact: true }).check();
  for (const state of faceStates) {
    await page.getByLabel("Preview state", { exact: true }).selectOption(state);
    await expect(page.locator(".face-preview-badge")).toContainText(
      faceLabels[state],
    );
    await expect(page.locator(".face-preview-badge")).toContainText(
      "Actual runtime:",
    );
    await expect(page.locator(".core-panel")).toHaveAttribute(
      "data-preview",
      state,
    );
    await expect(page.locator(".orbit-node")).toHaveCount(10);
  }
  expect(writes).toEqual([]);
  expect(await evidence(page)).toEqual(before);
  await page.getByLabel("Animation Preview Mode", { exact: true }).uncheck();
  await expect(page.locator(".face-preview-badge")).toHaveCount(0);
});

test("real idle animation moves, reports measured frames, and pauses without continuing its render schedule", async ({
  page,
}) => {
  await openDashboard(page);
  await page
    .getByText("Animation Preview & render metrics", { exact: true })
    .click();
  await page.getByLabel("Animation Preview Mode", { exact: true }).check();
  const metrics = page.getByLabel("Face render measurements", { exact: true });
  await expect
    .poll(async () => Number(await metrics.getAttribute("data-frames")), {
      timeout: 12000,
    })
    .toBeGreaterThan(0);
  const parsed = JSON.parse((await metrics.getAttribute("data-metrics"))!);
  expect(parsed.fps).toBeGreaterThan(0);
  expect(parsed.renderer.length).toBeGreaterThan(0);
  expect(parsed.drawCalls).toBeGreaterThan(0);
  const canvas = page.locator("canvas");
  const a = await canvas.screenshot();
  await page.waitForTimeout(450);
  const b = await canvas.screenshot();
  expect(a.equals(b)).toBe(false);
  await page
    .getByRole("button", { name: "Pause visual effects", exact: true })
    .click();
  await expect(metrics).toHaveAttribute("data-render-state", "paused");
  await page.waitForTimeout(400);
  const frameCount = await metrics.getAttribute("data-frames");
  const paused = await canvas.screenshot({path:"artifacts/face-paused-a.png"});
  await page.waitForTimeout(2200);
  expect(await metrics.getAttribute("data-frames")).toBe(frameCount);
  expect((await canvas.screenshot({path:"artifacts/face-paused-b.png"})).equals(paused)).toBe(true);
  await page
    .getByRole("button", { name: "Resume visual effects", exact: true })
    .click();
  await expect
    .poll(async () => Number(await metrics.getAttribute("data-frames")), {
      timeout: 12000,
    })
    .toBeGreaterThan(Number(frameCount));
});

test("reduced motion leaves the face static and preview does not bypass it", async ({
  page,
}) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reduced = page
    .getByRole("dialog")
    .getByLabel("Reduced motion", { exact: true });
  await reduced.check();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page
    .getByText("Animation Preview & render metrics", { exact: true })
    .click();
  await page.getByLabel("Animation Preview Mode", { exact: true }).check();
  await page
    .getByLabel("Preview state", { exact: true })
    .selectOption("speaking");
  const metrics = page.getByLabel("Face render measurements", { exact: true });
  await expect(metrics).toHaveAttribute("data-render-state", "reduced-motion");
  await page.waitForTimeout(400);
  const image = await page.locator("canvas").screenshot({path:"artifacts/face-reduced-a.png"});
  const frames = await metrics.getAttribute("data-frames");
  await page.waitForTimeout(1200);
  expect((await page.locator("canvas").screenshot({path:"artifacts/face-reduced-b.png"})).equals(image)).toBe(true);
  expect(await metrics.getAttribute("data-frames")).toBe(frames);
});
