import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { executeTool } from "../server/tools.js";
import type { Task } from "../shared/contracts.js";

test("approved fixed sample runs real tests, preserves the patch and cannot replay or execute caller code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agents-sample-")),
    store = new Store(directory),
    engine = new Engine(store, { hosts: [] });
  try {
    const root = engine.submit(
      {
        agent: "developer",
        tool: "code.sample.repair",
        objective: "Repair the bundled addition sample",
      },
      "fixed-sample",
    );
    const task = store
      .tasks()
      .find((t) => t.parentId === root.id && t.agent === "developer")!;
    const ctx = {
      store,
      signal: new AbortController().signal,
      hosts: [],
      progress: (_message: string) => {},
    };
    await assert.rejects(executeTool(task, ctx), /approval/);
    assert.equal(task.maxRetries, 0);
    engine.approve(task.id, true);
    engine.start();
    const deadline = Date.now() + 15000;
    while (
      !["completed", "failed"].includes(
        store.get<Task>("task", root.id)!.state,
      ) &&
      Date.now() < deadline
    )
      await new Promise((r) => setTimeout(r, 20));
    assert.equal(
      store.get<Task>("task", root.id)!.state,
      "completed",
      JSON.stringify(store.tasks()),
    );
    const completed = store.get<Task>("task", task.id)!;
    const evidence = JSON.parse(completed.output[0].content!);
    assert.equal(evidence.before.exitCode, 1);
    assert.match(evidence.before.output, /# fail 3/);
    assert.equal(evidence.after.exitCode, 0);
    assert.match(evidence.after.output, /# pass 4/);
    assert.notEqual(evidence.sourceSha256Before, evidence.sourceSha256After);
    assert.equal(
      await readFile(join(evidence.directory, "calculator.cjs"), "utf8"),
      "exports.add = (a, b) => a + b;\n",
    );
    await assert.rejects(executeTool(completed, ctx), /EEXIST/);
    await assert.rejects(
      executeTool(
        {
          ...completed,
          input: { ...completed.input, text: "process.exit(0)" },
        },
        ctx,
      ),
      /only the bundled fixture/,
    );
    assert.equal(engine.submit(root.input, "fixed-sample").id, root.id);
    assert.equal(engine.snapshot().metrics.tokens, 0);
  } finally {
    await engine.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("sample integrity changes and cancellation cannot execute a modified harness or claim a repair", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agents-sample-guard-")),
    store = new Store(directory),
    engine = new Engine(store, { hosts: [] });
  try {
    for (const mode of ["tamper", "cancel"] as const) {
      const root = engine.submit({
        agent: "developer",
        tool: "code.sample.repair",
        objective: "Verify fixed sample guard",
      });
      const task = store
        .tasks()
        .find(
          (t) => t.parentId === root.id && t.tool === "code.sample.repair",
        )!;
      task.approval = "consumed";
      const controller = new AbortController();
      await assert.rejects(
        executeTool(task, {
          store,
          signal: controller.signal,
          hosts: [],
          progress: (message) => {
            if (message.startsWith("Running")) {
              if (mode === "cancel") controller.abort();
              else
                writeFileSync(
                  join(
                    directory,
                    "workspace",
                    "sample-projects",
                    task.id,
                    "calculator.test.cjs",
                  ),
                  'throw new Error("Modified harness must not run");',
                );
            }
          },
        }),
        mode === "cancel" ? /abort/i : /integrity check/,
      );
      const record = store.get<{ stage: string; before?: unknown }>(
        "sampleRepair",
        task.id,
      )!;
      assert.equal(record.stage, "blocked");
      assert.equal(record.before, undefined);
      assert.equal(
        await readFile(
          join(
            directory,
            "workspace",
            "sample-projects",
            task.id,
            "calculator.cjs",
          ),
          "utf8",
        ),
        "exports.add = (a, b) => a - b;\n",
      );
    }
  } finally {
    await engine.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
