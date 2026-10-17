import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { join, resolve } from "node:path";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { WindowsComputer } from "../server/computer/windows.js";
import type {
  ComputerCommand,
  ComputerObservation,
} from "../shared/computer.js";
import type { Task } from "../shared/contracts.js";

const directory = process.argv[2];
if (!directory)
  throw new Error(
    "Run this test through npm run test:windows or the Test Windows Control shortcut.",
  );
const stage = (name: string) => process.send?.({ type: "stage", name });
const log = (message: string) => process.send?.({ type: "log", message });
let engine: Engine | undefined;
let store: Store | undefined;
let pid: number | undefined;
let screenshot: string | undefined;
let failure: string | undefined;
const checks: string[] = [];
try {
  stage("compile disposable fixture");
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
      // Applies only to this child process running the fixed validation builder.
      // Do not change CurrentUser/LocalMachine policy.
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve("native/windows/build-validation.ps1"),
      "-OutputPath",
      executable,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  store = new Store(directory);
  const computer = new WindowsComputer(store, {
    diagnostic: (message) => log(message),
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
  engine = new Engine(store, { hosts: [], computer });
  engine.start();

  const activeEngine = engine,
    activeStore = store;
  async function run(command: ComputerCommand) {
    stage(
      command.kind === "act" ? `action: ${command.action.kind}` : command.kind,
    );
    // Explicit invocation of this harness authorizes only its own disposable fixture window.
    const root = activeEngine.submit({
      agent: "computer",
      tool: "computer.delegate",
      objective: `Validate native ${command.kind} against the disposable fixture`,
      computer: command,
    });
    const child = activeStore
      .tasks()
      .find((t) => t.parentId === root.id && t.agent === "computer")!;
    assert.equal(child.state, "waiting_approval");
    activeEngine.approve(child.id, true);
    const end = Date.now() + 45000;
    let previous = "";
    while (Date.now() < end) {
      const task = activeStore.get<Task>("task", child.id)!;
      const parent = activeStore.get<Task>("task", root.id)!;
      const states = `worker=${task.state}, supervisor=${parent.state}`;
      if (states !== previous) {
        log(states);
        previous = states;
      }
      if (["failed", "cancelled", "blocked"].includes(task.state))
        throw new Error(task.error ?? task.state);
      if (["failed", "cancelled", "blocked"].includes(parent.state))
        throw new Error(parent.error ?? `Supervisor ${parent.state}`);
      if (
        task.state === "completed" &&
        activeStore.get<Task>("task", root.id)?.state === "completed"
      ) {
        log(`Verified: ${task.verification}`);
        checks.push(task.verification!);
        return JSON.parse(
          task.output.find((a) => a.name === "Windows observation")!.content!,
        ) as ComputerObservation;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Native validation timed out.");
  }
  let current = await run({ kind: "launch", app: "validation" });
  pid = current.window.processId;
  log(
    `Fixture PID ${pid}; foreground=${current.window.foreground}; UIA elements=${current.window.elements.length}`,
  );
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
    () => activeEngine.submit({ objective: "Blocked after stop" }),
    /Emergency stop/,
  );
  screenshot = current.screenshot;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  process.send?.({ type: "result", passed: false, error: failure });
} finally {
  stage("cleanup");
  // The independent supervisor bounds this wait and reports failure before it.
  engine?.stop();
  if (pid) {
    try {
      process.kill(pid);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        failure ??= `Fixture cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
        process.send?.({ type: "result", passed: false, error: failure });
      }
    }
  } else
    log(
      "If a disposable fixture window remains, close that window before retrying.",
    );
  await engine?.close();
  store?.close();
}
if (!failure)
  process.send?.({ type: "result", passed: true, checks, screenshot });
process.exitCode = failure ? 1 : 0;
if (process.connected) process.disconnect();
