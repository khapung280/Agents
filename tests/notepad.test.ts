import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import {
  WindowsComputer,
  type NativeRequest,
} from "../server/computer/windows.js";
import { TaskInput, type Task } from "../shared/contracts.js";
import type { NotepadCommand, TestDocument } from "../shared/notepad.js";
import type { WindowState } from "../shared/computer.js";

// Explicit native transport simulation. File creation/read-back are real; no Windows input occurs here.
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "agents-notepad-")),
    store = new Store(directory);
  let input = "",
    title = "",
    foreground = false,
    focused = false;
  const requests: NativeRequest[] = [];
  const computer = new WindowsComputer(store, {
    platform: "win32",
    policy: {
      enabled: true,
      apps: [
        {
          id: "notepad",
          name: "Notepad fixture",
          executable: "C:\\Windows\\notepad.exe",
          allowLaunch: true,
          allowTestDocuments: true,
          actions: ["focus", "click", "typeText"],
        },
      ],
    },
    transport: async (request, signal) => {
      signal.throwIfAborted();
      requests.push(request);
      if (request.command.kind === "launch")
        title = request.document!.name + " - Notepad";
      if (request.command.kind === "act") {
        if (request.command.action.kind === "focus") foreground = true;
        if (request.command.action.kind === "click") focused = true;
        if (request.command.action.kind === "typeText")
          input += request.command.action.text;
      }
      if (request.command.kind === "saveDocument")
        await writeFile(request.document!.path, input, "utf8");
      const window: WindowState = {
        windowId: "42",
        processId: 12,
        processStartedAt: "2026-10-19T00:00:00Z",
        executable: "C:\\Windows\\notepad.exe",
        title,
        foreground,
        bounds: { x: 0, y: 0, width: 400, height: 400 },
        elements: [
          {
            id: "1.1",
            name: "Editor",
            controlType: "ControlType.Document",
            enabled: true,
            password: false,
            focused,
            value: input,
            bounds: { x: 0, y: 40, width: 350, height: 300 },
          },
        ],
      };
      return {
        window,
        png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
        verified: "Simulated native boundary only.",
      };
    },
  });
  const engine = new Engine(store, { hosts: [], computer });
  const task = (notepad: NotepadCommand, scope = "personal") =>
    ({
      id: randomUUID(),
      tool: "notepad.test",
      approval: "consumed",
      input: TaskInput.parse({
        agent: "computer",
        tool: "notepad.test",
        objective: "Disposable test",
        notepad,
        projectId: scope,
      }),
    }) as Task;
  const run = async (
    command: NotepadCommand,
    scope = "personal",
    signal = new AbortController().signal,
  ) => engine.notepad.run(task(command, scope), signal, () => {});
  const prepare = () =>
    run({
      kind: "prepare",
      app: "notepad",
      text: "नेपाली and English approved fixture.",
    });
  const target = (document: TestDocument) => ({
    documentId: document.id,
    observationId: document.lastObservation!.id,
    elementId: "1.1",
  });
  return {
    directory,
    store,
    computer,
    engine,
    requests,
    task,
    run,
    prepare,
    target,
    setTitle: (value: string) => {
      title = value;
    },
    close: async () => {
      await engine.close();
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
test("Notepad stages require independent approvals; simulated native actions and real file bytes verify once", async () => {
  const env = await setup();
  try {
    const pending = env.task({ kind: "prepare", app: "notepad", text: "test" });
    pending.approval = "pending";
    await assert.rejects(
      env.engine.notepad.run(pending, new AbortController().signal, () => {}),
      /approval/,
    );
    let { document } = await env.prepare();
    assert.equal((await readFile(document.path)).length, 0);
    assert.equal(env.requests.length, 0);
    ({ document } = await env.run({ kind: "launch", documentId: document.id }));
    ({ document } = await env.run({ kind: "focus", ...env.target(document) }));
    ({ document } = await env.run({ kind: "focus", ...env.target(document) }));
    ({ document } = await env.run({ kind: "write", ...env.target(document) }));
    assert.equal(document.state, "written");
    assert.equal((await readFile(document.path)).length, 0);
    ({ document } = await env.run({ kind: "save", ...env.target(document) }));
    assert.equal(document.state, "saved");
    assert.equal(document.savedSha256, document.expectedSha256);
    assert.equal(await readFile(document.path, "utf8"), document.text);
    await assert.rejects(
      env.run({ kind: "save", ...env.target(document) }),
      /no replay/,
    );
    assert.equal(
      env.requests.filter((r) => r.command.kind === "saveDocument").length,
      1,
    );
    assert.equal(env.requests[0].document?.path, document.path);
    assert.equal(env.engine.snapshot().metrics.tokens, 0);
  } finally {
    await env.close();
  }
});
test("Notepad refuses cross-project access and protects changed files and document titles", async () => {
  const env = await setup();
  try {
    let { document } = await env.prepare();
    await assert.rejects(
      env.run({ kind: "launch", documentId: document.id }, "foreign"),
      /project/,
    );
    await writeFile(document.path, "existing content");
    await assert.rejects(
      env.run({ kind: "launch", documentId: document.id }),
      /No existing content/,
    );
    assert.equal(env.requests.length, 0);
    assert.equal(await readFile(document.path, "utf8"), "existing content");
    ({ document } = await env.prepare());
    ({ document } = await env.run({ kind: "launch", documentId: document.id }));
    env.setTitle("Unrelated document - Notepad");
    await assert.rejects(
      env.run({ kind: "observe", documentId: document.id }),
      /document title/,
    );
    assert.equal(
      env.store.get<TestDocument>("testDocument", document.id)!.state,
      "blocked",
    );
  } finally {
    await env.close();
  }
});
test("Notepad expiration, cancellation and restart cannot replay document actions", async () => {
  const env = await setup();
  try {
    let { document } = await env.prepare();
    document.expiresAt = new Date(0).toISOString();
    env.store.put("testDocument", document.id, document);
    await assert.rejects(
      env.run({ kind: "launch", documentId: document.id }),
      /deadline/,
    );
    ({ document } = await env.prepare());
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      env.run(
        { kind: "launch", documentId: document.id },
        "personal",
        cancelled.signal,
      ),
      /abort/i,
    );
    env.engine.stop();
    assert.equal(
      env.store.get<TestDocument>("testDocument", document.id)!.state,
      "blocked",
    );
    env.engine.resume();
    ({ document } = await env.prepare());
    const restarted = new Engine(env.store, {
      hosts: [],
      computer: env.computer,
    });
    try {
      await assert.rejects(
        restarted.notepad.run(
          env.task({ kind: "launch", documentId: document.id }),
          new AbortController().signal,
          () => {},
        ),
        /no replay/,
      );
    } finally {
      await restarted.close();
    }
    assert.equal(env.requests.length, 0);
  } finally {
    await env.close();
  }
});
test("Notepad tasks use the real engine approval boundary and expose completed checkpoints", async () => {
  const env = await setup();
  try {
    const root = env.engine.submit({
      agent: "computer",
      tool: "notepad.test",
      objective: "Prepare a test document",
      notepad: { kind: "prepare", app: "notepad", text: "approved" },
    });
    await env.engine.tick();
    assert.equal(env.engine.notepad.list().length, 0);
    const child = env.store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "notepad.test")!;
    env.engine.approve(child.id, true);
    env.engine.start();
    const end = Date.now() + 4000;
    while (
      env.store.get<Task>("task", root.id)!.state !== "completed" &&
      Date.now() < end
    )
      await new Promise((r) => setTimeout(r, 20));
    assert.equal(env.store.get<Task>("task", root.id)!.state, "completed");
    assert.equal(env.engine.snapshot().testDocuments.length, 1);
    assert.equal(env.requests.length, 0);
    await assert.rejects(
      env.computer.execute(
        { kind: "saveDocument", observationId: randomUUID(), elementId: "1" },
        "personal",
        randomUUID(),
        new AbortController().signal,
        () => {},
      ),
      /Observation/,
    );
  } finally {
    await env.close();
  }
});
