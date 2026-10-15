import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WindowsComputer,
  type NativeRequest,
  type NativeResult,
  type NativeTransport,
} from "../server/computer/windows.js";
import {
  ComputerRequest,
  type ComputerPolicy,
  type ComputerObservation,
  type WindowState,
} from "../shared/computer.js";
import { agents, type Task, TaskInput } from "../shared/contracts.js";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { executeTool } from "../server/tools.js";
import {
  prepareVision,
  buildOpenAIVisionRequest,
} from "../server/computer/vision.js";
import { deriveCoreState } from "../client/coreState.js";

// Explicit boundary fixture. This never represents actual Windows validation.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);
const policy: ComputerPolicy = {
  enabled: true,
  apps: [
    {
      id: "fixture",
      name: "Test fixture only",
      executable: "C:\\Fixtures\\Desktop.exe",
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
};
const windowState = (): WindowState => ({
  windowId: "100",
  processId: 25,
  processStartedAt: "2026-01-01T00:00:00.0000000Z",
  executable: policy.apps[0].executable,
  title: "Deterministic native fixture",
  foreground: true,
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  elements: [
    {
      id: "1.1",
      name: "Sample input",
      controlType: "ControlType.Edit",
      enabled: true,
      password: false,
      focused: true,
      value: "",
      bounds: { x: 20, y: 40, width: 300, height: 30 },
    },
    {
      id: "1.2",
      name: "[protected]",
      controlType: "ControlType.Edit",
      enabled: true,
      password: true,
      focused: false,
      bounds: { x: 20, y: 90, width: 300, height: 30 },
    },
  ],
});
function result(request: NativeRequest): NativeResult {
  const window = windowState();
  if (
    request.command.kind === "act" &&
    request.command.action.kind === "setText"
  )
    window.elements[0].value = request.command.action.text;
  return {
    window,
    png: png.toString("base64"),
    verified: "Explicit fixture postcondition; not native execution.",
  };
}
async function setup(
  transport?: NativeTransport,
  options: {
    platform?: string;
    now?: () => number;
    policy?: ComputerPolicy;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "agents-computer-test-"));
  const store = new Store(directory);
  let calls = 0;
  const computer = new WindowsComputer(store, {
    platform: options.platform ?? "win32",
    policy: options.policy ?? policy,
    now: options.now,
    transport: async (request, signal) => {
      calls++;
      return (transport ?? (async (r) => result(r)))(request, signal);
    },
  });
  const engine = new Engine(store, { hosts: [], computer });
  engine.start();
  return {
    directory,
    store,
    computer,
    engine,
    calls: () => calls,
    close: async () => {
      await engine.close();
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
async function until(fn: () => boolean) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("Timed out waiting for actual test outcome");
}
const get = (store: Store, id: string) => store.get<Task>("task", id)!;
const observation = (task: Task) =>
  JSON.parse(
    task.output.find((a) => a.name === "Windows observation")!.content!,
  ) as ComputerObservation;
async function observe(env: Awaited<ReturnType<typeof setup>>) {
  const root = env.engine.submit({
    agent: "computer",
    tool: "computer.observe",
    objective: "Observe test fixture",
    computer: { kind: "observe", app: "fixture" },
  });
  const child = env.store
    .tasks()
    .find((t) => t.parentId === root.id && t.agent === "computer")!;
  env.engine.approve(child.id, true);
  await until(() => get(env.store, child.id).state === "completed");
  return observation(get(env.store, child.id));
}

test("native control fails closed on Linux, disabled policy, invalid policy, and unapproved tools", async () => {
  const env = await setup(undefined, { platform: "linux" });
  try {
    assert.equal(env.computer.status().available, false);
    assert.equal(env.engine.snapshot().capabilities.windows, false);
    assert.throws(
      () =>
        env.engine.submit({
          agent: "computer",
          tool: "computer.observe",
          objective: "Observe my PC",
          computer: { kind: "observe", app: "fixture" },
        }),
      /requires a Windows/,
    );
    const disabled = new WindowsComputer(env.store, {
      platform: "win32",
      policy: { enabled: false, apps: [] },
    });
    assert.equal(disabled.status().available, false);
    await writeFile(
      join(env.directory, "windows-policy.json"),
      '{"enabled":true,"apps":"invalid"}',
    );
    assert.match(
      new WindowsComputer(env.store, { platform: "win32" }).status().reason,
      /Invalid/,
    );
    const denied = new WindowsComputer(env.store, {
      platform: "win32",
      policy: {
        enabled: true,
        apps: [
          { ...policy.apps[0], executable: "C:\\Windows\\System32\\cmd.exe" },
        ],
      },
    });
    assert.equal(denied.status().available, false);
    const task = {
      tool: "computer.observe",
      approval: "pending",
      input: TaskInput.parse({
        objective: "No approval",
        computer: { kind: "observe", app: "fixture" },
      }),
    } as Task;
    await assert.rejects(
      executeTool(task, {
        store: env.store,
        hosts: [],
        signal: new AbortController().signal,
        computer: env.computer,
        progress() {},
      }),
      /consumed task-scoped approval/,
    );
    assert.equal(env.calls(), 0);
  } finally {
    await env.close();
  }
});

test("native approval, actual boundary evidence, serialization, and live face states use real engine transitions", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const env = await setup(async (request) => {
    await gate;
    return result(request);
  });
  try {
    const requests = [1, 2].map((n) =>
      env.engine.submit({
        agent: "computer",
        tool: "computer.observe",
        objective: `Observe test window ${n}`,
        computer: { kind: "observe", app: "fixture" },
      }),
    );
    assert.equal(env.calls(), 0);
    assert.equal(
      deriveCoreState(env.engine.snapshot(), true, {
        listening: false,
        speaking: false,
      }),
      "approval",
    );
    const children = requests.map((root) =>
      env.store
        .tasks()
        .find((t) => t.parentId === root.id && t.agent === "computer")!,
    );
    for (const child of children) env.engine.approve(child.id, true);
    await until(() => env.calls() === 1);
    await env.engine.tick();
    assert.equal(env.calls(), 1);
    assert.equal(
      deriveCoreState(env.engine.snapshot(), true, {
        listening: false,
        speaking: false,
      }),
      "executing",
    );
    release();
    await until(() =>
      requests.every((t) => get(env.store, t.id).state === "completed"),
    );
    assert.equal(env.calls(), 2);
    assert.equal(env.engine.snapshot().capabilities.windows, true); // fixture adapter only
    assert.ok(
      env.store
        .events()
        .some((e) => e.type === "task.progress" && e.agent === "computer"),
    );
    assert.equal(
      deriveCoreState(env.engine.snapshot(), true, {
        listening: false,
        speaking: false,
      }),
      "success",
    );
    assert.throws(
      () => env.engine.approve(children[0].id, true),
      /No pending approval/,
    );
  } finally {
    release();
    await env.close();
  }
});

test("all ten specialists delegate through Computer Agent and supervisor without gaining direct input grants", async () => {
  const env = await setup();
  try {
    for (const agent of agents) {
      assert.ok(agent.tools.includes("computer.delegate"));
      if (agent.id !== "computer")
        assert.ok(!agent.tools.includes("computer.act"));
      const root = env.engine.submit({
        agent: agent.id,
        tool: "computer.delegate",
        objective: `${agent.name} requests observation`,
        computer: { kind: "observe", app: "fixture" },
      });
      const child = env.store
        .tasks()
        .find((t) => t.parentId === root.id && t.tool === "computer.observe")!;
      assert.equal(child.agent, "computer");
      assert.equal(child.state, "waiting_approval");
      env.engine.approve(child.id, true);
      await until(() => get(env.store, root.id).state === "completed");
      assert.ok(
        env.store
          .tasks()
          .some(
            (t) => t.parentId === root.id && t.tool === "supervisor.verify",
          ),
      );
    }
    assert.equal(env.calls(), 10);
    const current = env.store.policy();
    env.engine.setPolicy({ agents: { ...current.agents, computer: false } });
    assert.throws(
      () =>
        env.engine.submit({
          agent: "business",
          tool: "computer.delegate",
          objective: "Delegate while paused",
          computer: { kind: "observe", app: "fixture" },
        }),
      /Computer Agent is paused/,
    );
  } finally {
    await env.close();
  }
});

test("desktop mutation consumes observation once, reads back values, and rejects cross-project and password targets", async () => {
  const env = await setup();
  try {
    const before = await observe(env),
      signal = new AbortController().signal;
    const command = ComputerRequest.parse({
      kind: "act",
      observationId: before.id,
      action: { kind: "setText", elementId: "1.1", text: "Reviewed text" },
    });
    await assert.rejects(
      env.computer.execute(
        command as Exclude<typeof command, { kind: "vision" }>,
        "different-project",
        "bad-scope",
        signal,
        () => {},
      ),
      /project or service session/,
    );
    await assert.rejects(
      env.computer.execute(
        {
          kind: "act",
          observationId: before.id,
          action: { kind: "setText", elementId: "1.2", text: "secret" },
        },
        "personal",
        "password",
        signal,
        () => {},
      ),
      /non-password/,
    );
    const root = env.engine.submit({
      agent: "computer",
      tool: "computer.act",
      objective: "Write reviewed text",
      computer: command,
    });
    const child = env.store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "computer.act")!;
    assert.equal(env.calls(), 1);
    env.engine.approve(child.id, true);
    await until(() => get(env.store, root.id).state === "completed");
    assert.equal(
      observation(get(env.store, child.id)).window.elements[0].value,
      "Reviewed text",
    );
    await assert.rejects(
      env.computer.execute(
        command as Exclude<typeof command, { kind: "vision" }>,
        "personal",
        "duplicate",
        signal,
        () => {},
      ),
      /already authorized an action/,
    );
    assert.equal(env.calls(), 2);
  } finally {
    await env.close();
  }
});

test("stale observations, unauthorized applications/actions, and already-satisfied postconditions fail before dispatch", async () => {
  let now = Date.now();
  const env = await setup(undefined, {
    now: () => now,
    policy: {
      enabled: true,
      apps: [{ ...policy.apps[0], allowLaunch: false, actions: ["click"] }],
    },
  });
  try {
    const before = await observe(env),
      signal = new AbortController().signal;
    const exec = (command: Parameters<WindowsComputer["execute"]>[0]) =>
      env.computer.execute(command, "personal", "rejected", signal, () => {});
    await assert.rejects(
      exec({ kind: "launch", app: "fixture" }),
      /launch is not permitted/,
    );
    await assert.rejects(
      exec({ kind: "observe", app: "unknown" }),
      /allowlist/,
    );
    await assert.rejects(
      exec({
        kind: "act",
        observationId: before.id,
        action: { kind: "focus" },
      }),
      /Action is not permitted/,
    );
    await assert.rejects(
      exec({
        kind: "act",
        observationId: before.id,
        action: { kind: "click", elementId: "1.1" },
        expect: { elementId: "1.1", property: "value", equals: "" },
      }),
      /already holds/,
    );
    now += 120001;
    await assert.rejects(
      exec({
        kind: "act",
        observationId: before.id,
        action: { kind: "click", elementId: "1.1" },
        expect: { elementId: "1.1", property: "value", equals: "changed" },
      }),
      /expired/,
    );
    assert.equal(env.calls(), 1);
    assert.equal(
      ComputerRequest.safeParse({
        kind: "act",
        observationId: before.id,
        action: { kind: "click", elementId: "1.1" },
      }).success,
      false,
    );
    assert.equal(
      ComputerRequest.safeParse({
        kind: "launch",
        app: "fixture",
        args: ["unapproved"],
      }).success,
      false,
    );
  } finally {
    await env.close();
  }
});

test("failed postcondition and uncertain input never report completion or automatically retry", async () => {
  const env = await setup(async () => ({
    window: windowState(),
    png: png.toString("base64"),
    verified: "Dispatch receipt alone is insufficient",
  }));
  try {
    const before = await observe(env);
    const root = env.engine.submit({
      agent: "computer",
      tool: "computer.act",
      objective: "Attempt verified text",
      computer: {
        kind: "act",
        observationId: before.id,
        action: { kind: "setText", elementId: "1.1", text: "Expected change" },
      },
    });
    const child = env.store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "computer.act")!;
    env.engine.approve(child.id, true);
    await until(() => get(env.store, child.id).state === "failed");
    assert.equal(get(env.store, child.id).retries, 0);
    assert.equal(get(env.store, child.id).output.length, 0);
    assert.equal(
      env.store.get<{ state: string }>("computer_receipt", child.id)?.state,
      "uncertain",
    );
    const retry = env.engine.retry(child.id);
    const retryChild = env.store
      .tasks()
      .find((t) => t.parentId === retry.id && t.tool === "computer.act")!;
    assert.equal(retryChild.state, "waiting_approval");
    env.engine.approve(retryChild.id, true);
    await until(() => get(env.store, retryChild.id).state === "failed");
    assert.equal(env.calls(), 2);
  } finally {
    await env.close();
  }
});

test("emergency stop cancels native transport, records uncertainty, and blocks queued operations", async () => {
  let interrupted = false;
  const env = await setup(
    (_r, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            interrupted = true;
            reject(new Error("Input interrupted"));
          },
          { once: true },
        );
      }),
  );
  try {
    const root = env.engine.submit({
      agent: "computer",
      tool: "computer.launch",
      objective: "Launch fixture",
      computer: { kind: "launch", app: "fixture" },
    });
    const child = env.store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "computer.launch")!;
    env.engine.approve(child.id, true);
    await until(() => env.calls() === 1);
    env.engine.stop();
    await until(() => !env.engine.active.size);
    assert.equal(interrupted, true);
    assert.equal(get(env.store, child.id).state, "cancelled");
    assert.equal(
      env.store.get<{ state: string }>("computer_receipt", child.id)?.state,
      "uncertain",
    );
    assert.equal(
      deriveCoreState(env.engine.snapshot(), true, {
        listening: false,
        speaking: false,
      }),
      "offline",
    );
    assert.throws(
      () => env.engine.submit({ objective: "New operation" }),
      /Emergency stop/,
    );
  } finally {
    await env.close();
  }
});

test("restart invalidates observations and blocks a previously approved native action", async () => {
  const env = await setup();
  try {
    const before = await observe(env);
    await env.engine.close();
    const root = env.engine.submit({
      agent: "computer",
      tool: "computer.act",
      objective: "Pending action",
      computer: {
        kind: "act",
        observationId: before.id,
        action: { kind: "focus" },
      },
    });
    const child = env.store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "computer.act")!;
    child.approval = "approved";
    child.state = "queued";
    env.store.put("task", child.id, child);
    const restarted = new WindowsComputer(env.store, {
      platform: "win32",
      policy,
    });
    const engine = new Engine(env.store, { hosts: [], computer: restarted });
    assert.equal(get(env.store, child.id).state, "blocked");
    assert.throws(
      () => restarted.observation(before.id, "personal"),
      /service session/,
    );
    assert.equal(restarted.status().verifiedThisSession, false);
    await engine.close();
  } finally {
    await env.close();
  }
});

test("offline vision bundles bind actual image bytes and cannot cause network calls or input", async () => {
  const env = await setup();
  const oldFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Network forbidden in offline preparation");
  };
  try {
    const before = await observe(env);
    const bundle = prepareVision(before, "Review the visible form", png);
    const request = buildOpenAIVisionRequest(
      "explicit-vision-model",
      bundle,
      png,
    );
    assert.equal(request.input[0].role, "system");
    assert.match(JSON.stringify(request), /data:image\/png;base64/);
    assert.throws(
      () =>
        buildOpenAIVisionRequest(
          "explicit-vision-model",
          bundle,
          Buffer.from("changed"),
        ),
      /does not match/,
    );
    const root = env.engine.submit({
      agent: "project",
      tool: "computer.delegate",
      objective: "Prepare offline vision review",
      computer: { kind: "vision", observationId: before.id },
    });
    await until(() => get(env.store, root.id).state === "completed");
    assert.ok(
      get(env.store, root.id).output.some(
        (a) => a.name === "Offline vision review bundle",
      ),
    );
    assert.equal(requests, 0);
    assert.equal(env.calls(), 1);
  } finally {
    globalThis.fetch = oldFetch;
    await env.close();
  }
});

test("malformed screenshot or mismatched process evidence cannot produce a successful observation", async () => {
  const env = await setup(async (request) => ({
    ...result(request),
    png: Buffer.from("not an image").toString("base64"),
  }));
  try {
    await mkdir(join(env.directory, "artifacts"), { recursive: true });
    await assert.rejects(
      env.computer.execute(
        { kind: "observe", app: "fixture" },
        "personal",
        "bad-image",
        new AbortController().signal,
        () => {},
      ),
      /screenshot/,
    );
    assert.equal(env.computer.status().verifiedThisSession, false);
    const mismatched = new WindowsComputer(env.store, {
      platform: "win32",
      policy,
      transport: async (request) => ({
        ...result(request),
        window: { ...windowState(), executable: "C:\\Unexpected.exe" },
      }),
    });
    await assert.rejects(
      mismatched.execute(
        { kind: "observe", app: "fixture" },
        "personal",
        "bad-process",
        new AbortController().signal,
        () => {},
      ),
      /does not match/,
    );
  } finally {
    await env.close();
  }
});
