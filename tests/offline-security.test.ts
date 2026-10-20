import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { executeTool, textArtifact } from "../server/tools.js";
import { scopedPath } from "../server/security.js";
import { TaskInput, type Task } from "../shared/contracts.js";

async function fixture(
  run: (s: Store, e: Engine, path: string) => Promise<void>,
) {
  const path = await mkdtemp(join(tmpdir(), "agents-offline-security-"));
  const store = new Store(path);
  const engine = new Engine(store, { hosts: [] });
  try {
    await run(store, engine, path);
  } finally {
    await engine.close();
    store.close();
    await rm(path, { recursive: true, force: true });
  }
}

test("dependency and DAG scopes cannot share another project's evidence", async () => {
  await fixture(async (store, engine) => {
    const a = engine.submit({
      agent: "computer",
      objective: "Private inventory",
      projectId: "private",
    });
    assert.throws(
      () =>
        engine.submit({
          agent: "communication",
          objective: "Read other project",
          projectId: "personal",
          dependsOn: [a.id],
        }),
      /same project/,
    );
    assert.throws(
      () =>
        engine.submit({
          agent: "communication",
          objective: "Duplicate dependency",
          projectId: "private",
          dependsOn: [a.id, a.id],
        }),
      /Duplicate/,
    );
    const steps = [
      {
        key: "a",
        request: {
          agent: "computer",
          objective: "Inventory A",
          projectId: "private",
        },
      },
      {
        key: "b",
        request: {
          agent: "communication",
          objective: "Use inventory",
          projectId: "personal",
        },
        after: ["a"],
      },
    ];
    assert.throws(
      () => engine.submitWorkflow({ objective: "Mixed scope", steps }),
      /same project/,
    );
    steps[1].request.projectId = "private";
    const root = engine.submitWorkflow(
      { objective: "Same scope", steps },
      "scoped-dag",
    );
    assert.equal(
      engine.submitWorkflow({ objective: "Same scope", steps }, "scoped-dag")
        .id,
      root.id,
    );
    assert.ok(
      store
        .tasks()
        .filter((t) => t.id === root.id || t.parentId === root.id)
        .every((t) => t.input.projectId === "private"),
    );
  });
});

test("supervisor fallback stays in scope and rejects missing or cross-scope dependencies", async () => {
  await fixture(async (store) => {
    const foreign = {
      id: "private-task",
      input: TaskInput.parse({ objective: "Private", projectId: "private" }),
      state: "completed",
      output: [textArtifact("private", "secret project evidence")],
      verification: "verified",
    } as Task;
    store.put("task", foreign.id, foreign);
    const task = {
      id: "review",
      tool: "supervisor.verify",
      input: TaskInput.parse({
        objective: "Review local",
        projectId: "personal",
      }),
      dependsOn: [],
    } as unknown as Task;
    const ctx = {
      store,
      hosts: [],
      signal: new AbortController().signal,
      progress() {},
    };
    const result = await executeTool(task, ctx);
    assert.equal(JSON.parse(result.artifacts[0].content!).reviewed, 0);
    for (const id of [foreign.id, "missing"])
      await assert.rejects(
        executeTool({ ...task, dependsOn: [id] }, ctx),
        /same project/,
      );
  });
});

test("a tool resolving after its deadline becomes failed, not permanently running", async (t) => {
  await fixture(async (store, engine) => {
    let release!: () => void;
    engine.options.runner = async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        artifacts: [textArtifact("Late", "Late result")],
        verification: "Late result",
      };
    };
    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const root = engine.submit({
        agent: "computer",
        objective: "Delayed read-only fixture",
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(engine.active.size, 1);
      t.mock.timers.tick(45001);
      release();
      await new Promise<void>((resolve) => setImmediate(resolve));
      const child = store
        .tasks()
        .find((x) => x.parentId === root.id && x.agent === "computer")!;
      assert.equal(child.state, "failed");
      assert.match(child.error!, /deadline/);
      assert.equal(engine.active.size, 0);
      assert.equal(store.get<Task>("task", root.id)!.state, "failed");
    } finally {
      t.mock.timers.reset();
    }
  });
});

test("workspace tools reject credential files and Windows device/alternate-stream aliases", async () => {
  await fixture(async (_store, _engine, path) => {
    const root = join(path, "workspace");
    for (const name of [
      ".env",
      "notes/.env.local",
      ".ssh/id_rsa",
      ".git/config",
      "credentials.json",
      "service-account.json",
      "client_secret.json",
      "private.pem",
    ])
      await assert.rejects(scopedPath(root, name), /Sensitive/, name);
    for (const name of [
      "note.txt:stream",
      "NUL",
      "folder/COM1.txt",
      "note.txt.",
      "note.txt ",
      "folder//note",
      "C:notes",
      "bad\u0001.txt",
    ])
      await assert.rejects(scopedPath(root, name), /unsafe/, name);
    assert.equal(
      await scopedPath(root, "notes/योजना.txt"),
      join(root, "notes/योजना.txt"),
    );
  });
});

test("Nepali scoped memory search retains Unicode letters and marks", async () => {
  await fixture(async (store) => {
    for (const scope of ["personal", "private"])
      store.put("memory", scope, {
        id: scope,
        scope,
        title: "परियोजना योजना",
        content: "नेपाली परीक्षण",
        category: "project",
        updatedAt: new Date().toISOString(),
      });
    const input = TaskInput.parse({
      agent: "memory",
      tool: "memory.search",
      objective: "योजना खोज्नुहोस्",
      text: "योजना",
    });
    const result = await executeTool(
      { input, tool: "memory.search", objective: input.objective } as Task,
      { store, hosts: [], signal: new AbortController().signal, progress() {} },
    );
    const matches = JSON.parse(result.artifacts[0].content!).matches;
    assert.equal(matches.length, 1);
    assert.equal(matches[0].memory.scope, "personal");
  });
});
