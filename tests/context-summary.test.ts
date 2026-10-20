import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarizeContext } from "../server/context-summary.js";
import { TaskInput, type Task } from "../shared/contracts.js";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { textArtifact } from "../server/tools.js";

test("local summaries bound UTF-8 excerpts, cite sources, redact secrets and expose omissions", () => {
  const artifact = textArtifact(
    "Evidence",
    "योजना नेपाली परीक्षण ".repeat(500),
  );
  const task = {
    id: "a",
    input: TaskInput.parse({ objective: "Evidence", projectId: "personal" }),
    tool: "communication.draft",
    state: "completed",
    output: [artifact],
  } as Task;
  const tasks = Array.from({ length: 130 }, (_, i) => ({
    ...task,
    id: `t${i}`,
    output: [{ ...artifact, id: `a${i}` }],
  }));
  const result = summarizeContext({
    projectId: "personal",
    text: "api_key=sk-not-a-real-test-secret-12345\nKeep the useful detail.",
    tasks,
    memories: [],
  });
  assert.ok(Buffer.byteLength(JSON.stringify(result, null, 2)) <= 12000);
  assert.equal(result.omittedTaskRecords, 30);
  assert.ok(result.omittedSources > 0);
  assert.ok(result.entries.some((e) => e.shortened));
  assert.ok(result.entries[0].redacted);
  assert.ok(!JSON.stringify(result).includes("sk-not-a-real"));
  assert.ok(!JSON.stringify(result).includes("\ufffd"));
  assert.equal(result.entries[1].sourceId, "t0/a0");
  assert.equal(result.entries[1].redactedSourceSha256.length, 64);
  assert.deepEqual(
    result,
    summarizeContext({
      projectId: "personal",
      text: "api_key=sk-not-a-real-test-secret-12345\nKeep the useful detail.",
      tasks,
      memories: [],
    }),
  );
});

test("summaries reject cross-project data and screen artifacts and preserve failed checkpoints", () => {
  const input = TaskInput.parse({
    objective: "Summary",
    projectId: "personal",
  });
  const tasks = [
    {
      id: "foreign",
      input: { ...input, projectId: "private" },
      tool: "communication.draft",
      state: "completed",
      output: [textArtifact("Private", "Do not include")],
    },
    {
      id: "failed",
      input,
      tool: "workspace.write",
      state: "failed",
      error: "File already exists; not overwritten.",
      output: [],
    },
    {
      id: "screen",
      input,
      tool: "computer.observe",
      state: "completed",
      output: [textArtifact("Windows observation", "Private screen text")],
    },
    {
      id: "notepad",
      input,
      tool: "notepad.test",
      state: "completed",
      output: [
        textArtifact(
          "Notepad document checkpoint",
          "Private editor content and window metadata",
        ),
      ],
    },
    {
      id: "browser",
      input,
      tool: "browser.inspect",
      state: "completed",
      output: [
        { id: "image", name: "Screenshot", kind: "image", path: "private.png" },
        textArtifact("Page evidence", "Public page summary"),
      ],
    },
  ] as unknown as Task[];
  const summary = summarizeContext({
    projectId: "personal",
    tasks,
    memories: [
      {
        id: "secret",
        scope: "private",
        title: "Other project",
        content: "Private memory",
        category: "project",
        updatedAt: "now",
      },
    ],
  });
  assert.equal(summary.entries.length, 2);
  assert.equal(summary.entries[0].state, "failed");
  assert.equal(summary.excludedScreenArtifacts, 3);
  assert.ok(!JSON.stringify(summary).includes("Private"));
});

test("Memory summary executes locally and persisted evidence survives restart without replay", async () => {
  const path = await mkdtemp(join(tmpdir(), "agents-summary-"));
  let store = new Store(path),
    engine = new Engine(store, { hosts: [] });
  try {
    store.put("memory", "m", {
      id: "m",
      scope: "personal",
      title: "योजना",
      content: "स्थानीय परीक्षण",
      category: "project",
      updatedAt: new Date().toISOString(),
    });
    const root = engine.submit(
      {
        agent: "memory",
        tool: "memory.summarize",
        objective: "Summarize local context",
      },
      "summary-once",
    );
    engine.start();
    const end = Date.now() + 4000;
    while (
      store.get<Task>("task", root.id)!.state !== "completed" &&
      Date.now() < end
    )
      await new Promise((r) => setTimeout(r, 20));
    assert.equal(store.get<Task>("task", root.id)!.state, "completed");
    const output = store.get<Task>("task", root.id)!.output;
    assert.ok(JSON.stringify(output).includes("स्थानीय परीक्षण"));
    const count = store.tasks().length;
    await engine.close();
    store.close();
    store = new Store(path);
    engine = new Engine(store, { hosts: [] });
    await engine.tick();
    assert.deepEqual(store.get<Task>("task", root.id)!.output, output);
    assert.equal(
      engine.submit(
        {
          agent: "memory",
          tool: "memory.summarize",
          objective: "Summarize local context",
        },
        "summary-once",
      ).id,
      root.id,
    );
    assert.equal(store.tasks().length, count);
    assert.equal(engine.snapshot().metrics.tokens, 0);
  } finally {
    await engine.close();
    store.close();
    await rm(path, { recursive: true, force: true });
  }
});
