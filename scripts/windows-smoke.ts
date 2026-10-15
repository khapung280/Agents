import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { WindowsComputer } from "../server/computer/windows.js";
import type {
  ComputerCommand,
  ComputerObservation,
} from "../shared/computer.js";
import type { Task } from "../shared/contracts.js";

if (process.platform !== "win32") {
  console.error(
    "NOT RUN: Windows native validation requires an actual interactive Windows machine. No PC control is verified on this host.",
  );
  process.exitCode = 1;
} else {
  const directory = await mkdtemp(join(tmpdir(), "agents-windows-validation-"));
  const executable = join(directory, "AgentsValidation.exe");
  const powershell = join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  await promisify(execFile)(
    powershell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      resolve("native/windows/build-validation.ps1"),
      "-OutputPath",
      executable,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  const store = new Store(directory);
  const computer = new WindowsComputer(store, {
    policy: {
      enabled: true,
      apps: [
        {
          id: "validation",
          name: "Disposable validation window",
          executable,
          allowLaunch: true,
          actions: [
            "focus",
            "move",
            "click",
            "invoke",
            "setText",
            "typeText",
            "key",
          ],
        },
      ],
    },
  });
  const engine = new Engine(store, { hosts: [], computer });
  engine.start();
  let pid: number | undefined;
  const checks: string[] = [];
  async function run(command: ComputerCommand) {
    // Explicit invocation of this harness authorizes only its own disposable fixture window.
    const root = engine.submit({
      agent: "computer",
      tool: "computer.delegate",
      objective: `Validate native ${command.kind} against the disposable fixture`,
      computer: command,
    });
    const child = store
      .tasks()
      .find((t) => t.parentId === root.id && t.agent === "computer")!;
    assert.equal(child.state, "waiting_approval");
    engine.approve(child.id, true);
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      const task = store.get<Task>("task", child.id)!;
      if (
        task.state === "completed" &&
        store.get<Task>("task", root.id)?.state === "completed"
      ) {
        checks.push(task.verification!);
        return JSON.parse(
          task.output.find((a) => a.name === "Windows observation")!.content!,
        ) as ComputerObservation;
      }
      if (["failed", "cancelled", "blocked"].includes(task.state))
        throw new Error(task.error ?? task.state);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Native validation timed out.");
  }
  try {
    let current = await run({ kind: "launch", app: "validation" });
    pid = current.window.processId;
    current = await run({
      kind: "observe",
      app: "validation",
      windowId: current.window.windowId,
    });
    assert.ok(
      current.window.elements.some(
        (e) => e.password && e.name === "[protected]" && !e.value,
      ),
    );
    current = await run({
      kind: "act",
      observationId: current.id,
      action: { kind: "focus" },
    });
    const find = (name: string) => {
      const element = current.window.elements.find((e) => e.name === name);
      assert.ok(element, `UI Automation element missing: ${name}`);
      return element.id;
    };
    current = await run({
      kind: "act",
      observationId: current.id,
      action: {
        kind: "typeText",
        elementId: find("Sample input"),
        text: "AGENTS sample",
      },
      expect: {
        elementId: find("Sample input"),
        property: "value",
        equals: "AGENTS sample",
      },
    });
    current = await run({
      kind: "act",
      observationId: current.id,
      action: {
        kind: "setText",
        elementId: find("Sample input"),
        text: "Reviewed sample",
      },
    });
    current = await run({
      kind: "act",
      observationId: current.id,
      action: { kind: "key", elementId: find("Sample input"), key: "Tab" },
      expect: {
        elementId: find("Sample input"),
        property: "focused",
        equals: "false",
      },
    });
    current = await run({
      kind: "act",
      observationId: current.id,
      action: { kind: "move", elementId: find("Confirm sample") },
    });
    current = await run({
      kind: "act",
      observationId: current.id,
      action: { kind: "click", elementId: find("Confirm sample") },
      expect: {
        elementId: find("Waiting"),
        property: "name",
        equals: "Confirmed",
      },
    });
    assert.ok(current.window.elements.some((e) => e.name === "Confirmed"));
    current = await run({
      kind: "act",
      observationId: current.id,
      action: { kind: "invoke", elementId: find("Reset sample") },
      expect: {
        elementId: find("Confirmed"),
        property: "name",
        equals: "Waiting",
      },
    });
    engine.stop();
    assert.throws(
      () => engine.submit({ objective: "Blocked after stop" }),
      /Emergency stop/,
    );
    await writeFile(
      join(directory, "validation-result.json"),
      JSON.stringify(
        {
          passed: true,
          platform: process.platform,
          at: new Date().toISOString(),
          checks,
          screenshot: current.screenshot,
          limits:
            "Disposable fixture only; validate real app versions, DPI, focus races, locked desktop, and cancellation manually.",
        },
        null,
        2,
      ),
    );
    console.log(
      `PASS: real native fixture validation completed. Evidence retained at ${directory}`,
    );
  } finally {
    await engine.close();
    store.close();
    if (pid) {
      try {
        process.kill(pid);
      } catch {
        /* fixture may already have been closed */
      }
    }
  }
}
