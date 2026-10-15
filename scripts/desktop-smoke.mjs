import { _electron } from "playwright";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const directory = await mkdtemp(join(tmpdir(), "agents-desktop-test-"));
let app, child;
try {
  const args = [resolve("desktop/main.cjs")];
  if (process.env.AGENTS_ISOLATED_DESKTOP_TEST === "1")
    args.unshift(
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    );
  app = await _electron.launch({
    args,
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENTS_DESKTOP_DATA_DIR: directory,
      AGENTS_DESKTOP_PORT: "4338",
    },
    timeout: 25000,
  });
  child = app.process();
  const page = await app.firstWindow({ timeout: 20000 });
  await page.waitForSelector(".core-panel", { timeout: 15000 });
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  await page
    .getByLabel("Command your agents")
    .fill("Verify the desktop workflow service");
  await page
    .getByRole("button", { name: "Submit command", exact: true })
    .click();
  await page
    .getByText("All execution steps and supervisor checks completed.", {
      exact: true,
    })
    .waitFor({ timeout: 10000 });
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/electron-desktop.png" });
  console.log(
    "PASS: Electron launched, paired, rendered the core, kept Node out of the renderer, and completed a real workflow.",
  );
} finally {
  if (app) {
    await Promise.race([app.close(), new Promise((r) => setTimeout(r, 5000))]);
    if (child && !child.killed && child.exitCode === null)
      child.kill("SIGTERM");
  }
  await rm(directory, { recursive: true, force: true });
}
