import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  blinkOpenness,
  damp,
  faceAudioLevel,
  faceProfiles,
  faceStates,
  frameSample,
} from "../client/faceAnimation.js";
import { deriveAgentVisual, deriveCoreState } from "../client/coreState.js";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";

test("face damping is elapsed-time based at 30, 60 and 144 frames per second", () => {
  const simulate = (fps: number) => {
    let value = 0;
    for (let n = 0; n < fps * 2; n++) value = damp(value, 1, 2, 1 / fps);
    return value;
  };
  assert.ok(Math.abs(simulate(30) - simulate(144)) < 1e-12);
  assert.ok(Math.abs(simulate(60) - simulate(144)) < 1e-12);
  assert.equal(damp(0.4, 1, 2, 0), 0.4, "suspension does not advance the rig");
});

test("blink envelope closes and opens smoothly without fixed hard cuts", () => {
  assert.equal(blinkOpenness(0), 1);
  assert.ok(blinkOpenness(3.75) < 0.1);
  assert.equal(blinkOpenness(4), 1);
  let previous = blinkOpenness(0);
  for (let t = 0.001; t < 80; t += 0.001) {
    const value = blinkOpenness(t);
    assert.ok(value >= 0.089 && value <= 1);
    assert.ok(Math.abs(value - previous) < 0.011);
    previous = value;
  }
});

test("actual speech animation requires a real level; preview envelopes remain explicitly separate", () => {
  for (const state of faceStates)
    assert.equal(faceAudioLevel(state, 0, false, 2), 0);
  assert.equal(faceAudioLevel("speaking", Number.NaN, false, 2), 0);
  assert.equal(faceAudioLevel("speaking", 0.8, false, 2), 0.8);
  assert.equal(faceAudioLevel("speaking", 9, false, 2), 1);
  assert.equal(faceAudioLevel("idle", 0.8, false, 2), 0);
  assert.ok(faceAudioLevel("speaking", 0, true, 2) > 0);
  assert.equal(
    new Set(faceStates.map((state) => JSON.stringify(faceProfiles[state])))
      .size,
    12,
  );
});

test("render sampling reports actual intervals and preserves input samples", () => {
  const times = [10, 20, 30, 40, 100];
  assert.deepEqual(frameSample(times), {
    fps: 25,
    frameMs: 40,
    p95FrameMs: 100,
  });
  assert.deepEqual(times, [10, 20, 30, 40, 100]);
  assert.deepEqual(frameSample([]), { fps: 0, frameMs: 0, p95FrameMs: 0 });
});

test("node and face indicators honor real approvals, stopped/disconnected states and recent task evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agents-face-state-"));
  const store = new Store(directory);
  const engine = new Engine(store, { hosts: [] });
  try {
    const root = engine.submit({
      agent: "computer",
      objective: "Inspect isolated fixture",
    });
    const task = store
      .tasks()
      .find((t) => t.parentId === root.id && t.agent === "computer")!;
    const s = engine.snapshot();
    s.tasks = [{ ...task, state: "waiting_approval" }];
    s.metrics.approvals = 1;
    assert.equal(
      deriveCoreState(s, true, { listening: true, speaking: true }),
      "approval",
    );
    assert.equal(deriveAgentVisual(s, "computer", true).phase, "approval");
    assert.equal(deriveAgentVisual(s, "computer", true).active, false);
    s.tasks[0].state = "running";
    assert.equal(deriveAgentVisual(s, "computer", false).phase, "offline");
    assert.equal(deriveAgentVisual(s, "computer", false).active, false);
    s.policy.stopped = true;
    assert.equal(deriveAgentVisual(s, "computer", true).active, false);
    assert.equal(
      deriveCoreState(s, true, { listening: false, speaking: true }),
      "offline",
    );
    s.policy.stopped = false;
    s.events = [
      {
        id: 1,
        type: "task.progress",
        agent: "computer",
        taskId: task.id,
        at: new Date().toISOString(),
        message: "Verifying: fixture output",
      },
    ];
    assert.equal(deriveAgentVisual(s, "computer", true).phase, "verifying");
    s.tasks[0].state = "completed";
    s.tasks[0].finishedAt = "2026-10-21T00:00:00.000Z";
    const finished = Date.parse(s.tasks[0].finishedAt);
    assert.equal(
      deriveAgentVisual(s, "computer", true, finished + 100).phase,
      "success",
    );
    assert.equal(
      deriveAgentVisual(s, "computer", true, finished + 6000).phase,
      "idle",
    );
    assert.equal(
      deriveAgentVisual(s, "computer", true, finished - 100).phase,
      "idle",
    );
    assert.equal(
      deriveAgentVisual(s, "developer", true, finished + 100).phase,
      "idle",
    );
  } finally {
    await engine.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("delegation lights only the recorded participant with matching pending work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agents-face-delegation-"));
  const store = new Store(directory);
  const engine = new Engine(store, { hosts: [] });
  try {
    const root = engine.submit({
      agent: "computer",
      objective: "Inspect isolated fixture",
    });
    const task = store
      .tasks()
      .find((t) => t.parentId === root.id && t.agent === "computer")!;
    const s = engine.snapshot();
    const now = Date.now();
    s.tasks = [{ ...task, state: "queued" }];
    s.events = [
      {
        id: 1,
        type: "workflow.delegated",
        agent: "computer",
        taskId: task.id,
        at: new Date(now).toISOString(),
        message: "Assigned actual fixture task",
      },
    ];
    assert.equal(
      deriveAgentVisual(s, "computer", true, now).phase,
      "delegating",
    );
    assert.equal(deriveAgentVisual(s, "developer", true, now).active, false);
    assert.equal(
      deriveAgentVisual(s, "computer", true, now + 2100).phase,
      "waiting",
    );
    s.tasks = [];
    assert.equal(deriveAgentVisual(s, "computer", true, now).active, false);
  } finally {
    await engine.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
