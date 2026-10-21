import { _electron } from "playwright";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
  const bridge = await page.evaluate(async () => ({
    keys: Object.keys(window.agentsUpdates).sort(),
    status: await window.agentsUpdates.getStatus(),
  }));
  assert.deepEqual(bridge.keys, ["cancel", "check", "download", "getStatus", "install", "onStatus"]);
  assert.equal(bridge.status.currentVersion, JSON.parse(await readFile("package.json", "utf8")).version);
  assert.equal(bridge.status.phase, "unavailable");
  console.log("PASS: sandboxed update bridge exposes only fixed verbs and refuses development installation.");
  await promisify(execFile)(child.spawnfile, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENTS_DESKTOP_DATA_DIR: directory,
      AGENTS_DESKTOP_PORT: "4338",
    },
    timeout: 15000,
  });
  assert.equal(
    app.windows().length,
    1,
    "Second launch must reuse the existing instance",
  );
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
    "PASS: Electron launched, paired, rendered the core, reused its existing instance, kept Node out of the renderer, and completed a real workflow.",
  );
  // The service uses Electron-as-Node in the installed app. Verify the new fixed
  // sample runner with that actual executable, not just the development Node.
  const sample = await page.evaluate(async () => {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "developer",
        tool: "code.sample.repair",
        objective: "Verify packaged-runtime sample tests",
      }),
    });
    if (!response.ok) throw new Error("Sample submission failed");
    return response.json();
  });
  const sampleTask = await page.evaluate(async (id) => {
    const state = await (await fetch("/api/state")).json();
    return state.tasks.find(
      (task) => task.parentId === id && task.tool === "code.sample.repair",
    );
  }, sample.id);
  assert.equal(sampleTask.state, "waiting_approval");
  const approved = await page.evaluate(async (id) => {
    const response = await fetch("/api/approvals/" + id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    return response.ok;
  }, sampleTask.id);
  assert.ok(approved);
  await page.waitForFunction(
    async (id) => {
      const state = await (await fetch("/api/state")).json();
      const task = state.tasks.find((task) => task.id === id);
      if (task?.state === "failed") throw new Error(task.error);
      return task?.state === "completed";
    },
    sample.id,
    { timeout: 15000 },
  );
  console.log(
    "PASS: Electron-as-Node executed the approved bundled repair with real failing and passing tests.",
  );
  await app.close();
  app = undefined;
  await assert.rejects(
    fetch("http://127.0.0.1:4338/api/health", {
      signal: AbortSignal.timeout(2000),
    }),
  );
  console.log("PASS: closing Electron stopped its local service.");
} finally {
  if (app) {
    await Promise.race([app.close(), new Promise((r) => setTimeout(r, 5000))]);
    if (child && !child.killed && child.exitCode === null)
      child.kill("SIGTERM");
  }
  await rm(directory, { recursive: true, force: true });
}
