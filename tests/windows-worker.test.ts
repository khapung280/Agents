import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectWindowsWorkerResult } from "../server/computer/worker-result.js";
import {
  WindowsComputer,
  type NativeRequest,
  type NativeResult,
} from "../server/computer/windows.js";
import { Store } from "../server/store.js";

// Child-process boundary fixtures only; no Windows process or desktop input.
function worker() {
  let kills = 0;
  const process = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => {
      kills++;
      return true; // Deliberately does not imply process exit.
    },
  });
  return {
    process,
    kills: () => kills,
  };
}
const request: NativeRequest = {
  command: { kind: "observe", app: "fixture" },
  executable: "C:\\Fixtures\\Desktop.exe",
};
const evidence: NativeResult = {
  window: {
    windowId: "100",
    processId: 25,
    processStartedAt: "2026-01-01T00:00:00Z",
    executable: request.executable,
    title: "नमस्ते 🪟 — Unicode fixture",
    bounds: { x: 0, y: 0, width: 600, height: 400 },
    foreground: true,
    elements: [],
  },
  png: "fixture-only",
  verified: "Explicit transport fixture, not native verification.",
};

test("worker preserves UTF-8 and BOM split across chunks and sends only stdin JSON", async () => {
  const child = worker();
  const promise = collectWindowsWorkerResult(
    child.process,
    request,
    new AbortController().signal,
  );
  assert.equal(child.process.stdin.read().toString(), JSON.stringify(request));
  for (const byte of Buffer.from(`\uFEFF${JSON.stringify(evidence)}`))
    child.process.stdout.emit("data", Buffer.from([byte]));
  child.process.emit("close", 0);
  assert.deepEqual(await promise, evidence);
  assert.equal(child.kills(), 0);
});

test("oversized evidence holds the desktop slot until close and never records success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agents-worker-test-"));
  const store = new Store(directory);
  const child = worker();
  let calls = 0;
  const computer = new WindowsComputer(store, {
    platform: "win32",
    policy: {
      enabled: true,
      apps: [
        {
          id: "fixture",
          name: "Fixture",
          executable: request.executable,
          allowLaunch: false,
          actions: [],
        },
      ],
    },
    transport: (input, signal) => {
      calls++;
      return collectWindowsWorkerResult(child.process, input, signal);
    },
  });
  const run = (id: string) =>
    computer.execute(
      { kind: "observe", app: "fixture" },
      "personal",
      id,
      new AbortController().signal,
      () => {},
    );
  try {
    const first = run("overflow");
    const rejected = assert.rejects(first, /size limit.*Observe again/);
    let settled = false;
    void first.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    // More than 16 MiB in bytes but fewer than 16 MiB in UTF-8 characters.
    child.process.stdout.emit("data", Buffer.alloc(16 * 1024 * 1024 + 2, "é"));
    await Promise.resolve();
    assert.equal(child.kills(), 1);
    assert.equal(settled, false);
    await assert.rejects(run("overlapping"), /Another desktop operation/);
    assert.equal(calls, 1);
    child.process.stdout.emit("data", Buffer.from(JSON.stringify(evidence)));
    child.process.emit("close", 0); // Even exit zero cannot turn overflow into success.
    await rejected;
    assert.equal(computer.status().verifiedThisSession, false);
    assert.equal(
      store.get<{ state: string }>("computer_receipt", "overflow")?.state,
      "uncertain",
    );
  } finally {
    child.process.emit("close", 1);
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("stop and pre-listener cancellation wait for close and cannot resolve late evidence", async () => {
  for (const alreadyAborted of [false, true]) {
    const child = worker();
    const controller = new AbortController();
    if (alreadyAborted) controller.abort();
    const promise = collectWindowsWorkerResult(
      child.process,
      request,
      controller.signal,
    );
    const rejected = assert.rejects(promise, /interrupted.*Observe again/);
    let settled = false;
    void promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    controller.abort();
    if (alreadyAborted) assert.equal(child.process.stdin.read(), null);
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(child.kills(), 1);
    child.process.stdout.emit("data", Buffer.from(JSON.stringify(evidence)));
    child.process.emit("close", 0);
    await rejected;
  }
});

test("worker deadline requests termination but does not release before close", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const child = worker();
  const promise = collectWindowsWorkerResult(
    child.process,
    request,
    new AbortController().signal,
  );
  const rejected = assert.rejects(promise, /30-second deadline.*Observe again/);
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  t.mock.timers.tick(30000);
  await Promise.resolve();
  assert.equal(child.kills(), 1);
  assert.equal(settled, false);
  child.process.emit("close", null);
  await rejected;
});

test("worker diagnostics preserve split Unicode, malformed evidence fails, and errors await close", async () => {
  const child = worker();
  const promise = collectWindowsWorkerResult(
    child.process,
    request,
    new AbortController().signal,
  );
  const rejected = assert.rejects(
    promise,
    /Windows worker failed: अनुमति अस्वीकार/,
  );
  for (const byte of Buffer.from("अनुमति अस्वीकार"))
    child.process.stderr.emit("data", Buffer.from([byte]));
  child.process.emit("close", 1);
  await rejected;

  const malformed = worker();
  const invalid = collectWindowsWorkerResult(
    malformed.process,
    request,
    new AbortController().signal,
  );
  const invalidRejected = assert.rejects(invalid, /invalid evidence/);
  malformed.process.stdout.emit("data", Buffer.from("{}"));
  malformed.process.emit("close", 0);
  await invalidRejected;

  const failed = worker();
  const error = collectWindowsWorkerResult(
    failed.process,
    request,
    new AbortController().signal,
  );
  const errorRejected = assert.rejects(error, /spawn fixture ENOENT/);
  let settled = false;
  void error.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  failed.process.emit("error", new Error("spawn fixture ENOENT"));
  await Promise.resolve();
  assert.equal(settled, false);
  failed.process.emit("close", -2);
  await errorRejected;
});
