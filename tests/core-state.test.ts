import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCoreState } from "../client/coreState.js";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("face maps actual running planner, observation, verification and approval states without invented activity", async () => {
  const path = await mkdtemp(join(tmpdir(), "agents-core-state-"));
  const store = new Store(path);
  const engine = new Engine(store, { hosts: [] });
  try {
    const s = engine.snapshot();
    const voice = { listening: false, speaking: false };
    assert.equal(deriveCoreState(s, true, voice), "idle");
    const root = engine.submit({
      objective: "Inventory fixture",
      agent: "computer",
    });
    const task = store
      .tasks()
      .find((t) => t.parentId === root.id && t.agent === "computer")!;
    s.tasks = [{ ...task, state: "running", tool: "model.plan" }];
    assert.equal(deriveCoreState(s, true, voice), "planning");
    s.tasks[0].tool = "computer.observe";
    assert.equal(deriveCoreState(s, true, voice), "observing");
    s.tasks[0].tool = "supervisor.verify";
    assert.equal(deriveCoreState(s, true, voice), "verifying");
    s.tasks[0].tool = "model.draft";
    assert.equal(deriveCoreState(s, true, voice), "thinking");
    s.events = [
      {
        id: 1,
        type: "task.progress",
        taskId: task.id,
        agent: task.agent,
        message: "Verifying: checking output",
        at: new Date().toISOString(),
      },
    ];
    assert.equal(deriveCoreState(s, true, voice), "verifying");
    s.metrics.approvals = 1;
    assert.equal(deriveCoreState(s, true, voice), "approval");
    assert.equal(deriveCoreState(s, false, voice), "offline");
  } finally {
    await engine.close();
    store.close();
    await rm(path, { recursive: true, force: true });
  }
});
