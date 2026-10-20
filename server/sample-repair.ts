import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scopedPath } from "./security.js";
import type { Task } from "../shared/contracts.js";
import type { ToolContext } from "./tools.js";

const broken = "exports.add = (a, b) => a - b;\n";
const fixed = "exports.add = (a, b) => a + b;\n";
const harness = [
  'const { test } = require("node:test");',
  'const assert = require("node:assert/strict");',
  'const { add } = require("./calculator.cjs");',
  'test("positive addition", () => assert.equal(add(3, 2), 5));',
  'test("negative addition", () => assert.equal(add(-3, -2), -5));',
  'test("zero identity", () => assert.equal(add(7, 0), 7));',
  'test("fractional addition", () => assert.equal(add(0.5, 0.25), 0.75));',
  "",
].join("\n");
const sha = (data: string) => createHash("sha256").update(data).digest("hex");
const manifest =
  JSON.stringify(
    { name: "agents-fixed-addition-sample", private: true },
    null,
    2,
  ) + "\n";

async function verifyFiles(directory: string, source: string) {
  const folder = await lstat(directory);
  if (!folder.isDirectory() || folder.isSymbolicLink())
    throw new Error("Sample directory was replaced.");
  for (const [name, expected] of Object.entries({
    "package.json": manifest,
    "calculator.cjs": source,
    "calculator.test.cjs": harness,
  })) {
    const path = join(directory, name),
      stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      sha(await readFile(path, "utf8")) !== sha(expected)
    )
      throw new Error(
        "Bundled sample integrity check failed; no untrusted program will execute.",
      );
  }
}

async function runTests(
  directory: string,
  source: string,
  signal: AbortSignal,
) {
  await verifyFiles(directory, source);
  signal.throwIfAborted();
  // Fixed, verified application fixture only. This is not an arbitrary-code sandbox.
  const env: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: "1" };
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
    if (process.env[key]) env[key] = process.env[key];
  return await new Promise<{ exitCode: number; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--no-addons",
          "--test-isolation=none",
          "--test",
          "--test-reporter=tap",
          "calculator.test.cjs",
        ],
        {
          cwd: directory,
          env,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "",
        bytes = 0,
        failure: Error | undefined;
      const stop = (error: Error) => {
        failure ??= error;
        child.kill("SIGKILL");
      };
      const cancel = () =>
        stop(new Error("Sample test cancelled; no patch/replay is permitted."));
      const timer = setTimeout(
        () => stop(new Error("Sample test exceeded its 10-second deadline.")),
        10000,
      );
      const capture = (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 65536)
          stop(new Error("Sample test exceeded its output limit."));
        else output += chunk.toString("utf8");
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      child.once("error", (error) => {
        failure ??= error;
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        if (failure) reject(failure);
        else if (code === null)
          reject(new Error("Sample test exited without a result."));
        else resolve({ exitCode: code, output });
      });
    },
  );
}

export async function repairSample(task: Task, ctx: ToolContext) {
  if (task.tool !== "code.sample.repair" || task.approval !== "consumed")
    throw new Error("Sample repair requires its exact consumed task approval.");
  if (
    task.input.path ||
    task.input.url ||
    task.input.text ||
    task.input.computer ||
    task.input.browser
  )
    throw new Error(
      "Sample repair accepts only the bundled fixture, never a path, program, URL or command.",
    );
  ctx.signal.throwIfAborted();
  const base = await scopedPath(
    join(ctx.store.directory, "workspace"),
    "sample-projects",
  );
  await mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await scopedPath(
    join(ctx.store.directory, "workspace"),
    "sample-projects/" + task.id,
  );
  await mkdir(directory, { mode: 0o700 }); // An existing run is never reused.
  const checkpoint = (stage: string, extra = {}) =>
    ctx.store.put("sampleRepair", task.id, {
      taskId: task.id,
      projectId: task.input.projectId,
      directory,
      stage,
      ...extra,
    });
  checkpoint("prepared");
  try {
    for (const [name, content] of Object.entries({
      "package.json": manifest,
      "calculator.cjs": broken,
      "calculator.test.cjs": harness,
    }))
      await writeFile(join(directory, name), content, {
        flag: "wx",
        mode: 0o600,
      });
    await verifyFiles(directory, broken);
    checkpoint("testing-original");
    ctx.progress("Running the bundled sample's real failing tests");
    const before = await runTests(directory, broken, ctx.signal);
    checkpoint("original-tested", { before });
    if (
      before.exitCode !== 1 ||
      !/^# fail 3\r?$/m.test(before.output) ||
      !/^# pass 1\r?$/m.test(before.output)
    )
      throw new Error(
        "Original tests did not reproduce the expected three arithmetic failures; no patch applied.",
      );
    ctx.signal.throwIfAborted();
    await verifyFiles(directory, broken);
    // A newly created private fixture; all unrelated paths are excluded.
    await writeFile(join(directory, "calculator.cjs"), fixed);
    await verifyFiles(directory, fixed);
    checkpoint("testing-patch", { before });
    ctx.progress(
      "Verifying: fixed subtraction-to-addition patch with real tests",
    );
    const after = await runTests(directory, fixed, ctx.signal);
    ctx.signal.throwIfAborted();
    await verifyFiles(directory, fixed);
    if (
      after.exitCode !== 0 ||
      !/^# fail 0\r?$/m.test(after.output) ||
      !/^# pass 4\r?$/m.test(after.output)
    )
      throw new Error("Patched tests failed; the repair is not verified.");
    const report = {
      fixture:
        "Bundled arithmetic sample; deterministic repair, not AI debugging",
      directory,
      before,
      after,
      sourceSha256Before: sha(broken),
      sourceSha256After: sha(fixed),
      testSha256: sha(harness),
      diff: "- " + broken.trim() + "\n+ " + fixed.trim(),
      verification:
        "Observed three failing tests before the exact patch and four passing tests afterward.",
    };
    checkpoint("verified", report);
    return report;
  } catch (error) {
    const prior = ctx.store.get<Record<string, unknown>>(
      "sampleRepair",
      task.id,
    );
    ctx.store.put("sampleRepair", task.id, {
      ...prior,
      stage: "blocked",
      error: error instanceof Error ? error.message : String(error),
      replay: "Never automatic; review retained evidence.",
    });
    throw error;
  }
}
