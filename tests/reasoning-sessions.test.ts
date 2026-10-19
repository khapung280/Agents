import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { WindowsComputer } from "../server/computer/windows.js";
import type { ComputerObservation, WindowState } from "../shared/computer.js";
import type {
  ReasoningSession,
  ScreenShareGrant,
} from "../shared/reasoning.js";
import type { Task } from "../shared/contracts.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);
const window = (): WindowState => ({
  windowId: "100",
  processId: 25,
  processStartedAt: "2026-01-01T00:00:00Z",
  executable: "C:\\Fixtures\\Desktop.exe",
  title: "Explicit offline fixture",
  foreground: true,
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  elements: [
    {
      id: "note",
      name: "Note",
      controlType: "ControlType.Edit",
      enabled: true,
      password: false,
      focused: true,
      value: "",
      bounds: { x: 10, y: 10, width: 200, height: 40 },
    },
  ],
});
const reply = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
const modelReply = (decision: unknown) =>
  reply({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(decision) }],
      },
    ],
    usage: { input_tokens: 150, output_tokens: 60 },
  });
const decision = (observation: ComputerObservation, outcome = "action") => ({
  observationId: observation.id,
  outcome,
  explanation: "Fixture decision only; no live model reasoning.",
  action:
    outcome === "action"
      ? { kind: "setText", elementId: "note", text: "Verified note" }
      : null,
  expect: null,
});
async function fixture(
  run: (f: {
    directory: string;
    store: Store;
    engine: Engine;
    nativeCalls: () => number;
    failPostcondition: () => void;
    session: (id: string) => ReasoningSession;
    wait: (predicate: () => boolean) => Promise<void>;
    observe: () => Promise<ReasoningSession>;
    grant: (id: string) => ScreenShareGrant;
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "agents-reasoning-"));
  const store = new Store(directory);
  let calls = 0;
  let note = "";
  let failReadback = false;
  const computer = new WindowsComputer(store, {
    platform: "win32",
    policy: {
      enabled: true,
      apps: [
        {
          id: "fixture",
          name: "Offline fixture",
          executable: "C:\\Fixtures\\Desktop.exe",
          allowLaunch: false,
          actions: ["setText"],
        },
      ],
    },
    transport: async (request) => {
      calls++;
      const state = window();
      if (
        request.command.kind === "act" &&
        request.command.action.kind === "setText"
      )
        note = request.command.action.text;
      state.elements[0].value = failReadback ? "Unexpected value" : note;
      return {
        window: state,
        png: png.toString("base64"),
        verified: "Explicit native transport fixture; not real Windows input.",
      };
    },
  });
  const engine = new Engine(store, { hosts: [], computer });
  const keys = [
    "AGENTS_MODEL_PROVIDER",
    "AGENTS_MODEL",
    "AGENTS_OPENAI_API_KEY",
    "AGENTS_INPUT_PRICE_PER_MILLION",
    "AGENTS_OUTPUT_PRICE_PER_MILLION",
    "AGENTS_REASONING_EFFORT",
    "AGENTS_VISION_INPUT_TOKEN_RESERVE",
    "AGENTS_DAILY_BUDGET_USD",
    "AGENTS_TASK_BUDGET_USD",
    "AGENTS_MAX_OUTPUT_TOKENS",
    "AGENTS_MAX_PLAN_STEPS",
  ];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, {
    AGENTS_MODEL_PROVIDER: "openai",
    AGENTS_MODEL: "fixture-model",
    AGENTS_OPENAI_API_KEY: "fixture-only-key",
    AGENTS_INPUT_PRICE_PER_MILLION: "1",
    AGENTS_OUTPUT_PRICE_PER_MILLION: "2",
    AGENTS_VISION_INPUT_TOKEN_RESERVE: "4096",
  });
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request in offline fixture");
  };
  const session = (id: string) =>
    store.get<ReasoningSession>("reasoning_session", id)!;
  const wait = async (predicate: () => boolean) => {
    for (let n = 0; n < 200 && !predicate(); n++) {
      await engine.tick();
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(
      predicate(),
      true,
      JSON.stringify(
        engine.reasoning
          .list()
          .map((s) => ({ state: s.state, error: s.error })),
      ),
    );
  };
  const observe = async () => {
    const s = engine.reasoning.create({
      objective: "Write and verify a short fixture note",
      app: "fixture",
    });
    assert.equal(calls, 0);
    const child = store
      .tasks()
      .find(
        (t) => t.parentId === s.currentTaskId && t.tool === "computer.observe",
      )!;
    assert.equal(child.approval, "pending");
    engine.approve(child.id, true);
    await wait(() => session(s.id).state === "awaiting_share");
    return session(s.id);
  };
  try {
    await run({
      directory,
      store,
      engine,
      nativeCalls: () => calls,
      failPostcondition: () => {
        failReadback = true;
      },
      session,
      wait,
      observe,
      grant: (id) =>
        store.get<ScreenShareGrant>("screen_grant", session(id).grantId!)!,
    });
  } finally {
    await engine.close();
    store.close();
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
}

test("screen session requires exact-image and action approvals, verifies fresh evidence, then requires owner completion", async () => {
  await fixture(
    async ({ engine, store, session, wait, observe, grant, nativeCalls }) => {
      const s = await observe();
      let paid = 0;
      globalThis.fetch = async (url, init) => {
        paid++;
        assert.equal(url, "https://api.openai.com/v1/responses");
        const body = JSON.parse(init!.body as string);
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        assert.equal(body.text.format.name, "screen_decision");
        const observation = JSON.parse(
          body.input[1].content[0].text,
        ).observation;
        assert.equal(
          body.input[1].content[1].image_url,
          `data:image/png;base64,${png.toString("base64")}`,
        );
        return modelReply(
          decision(observation, paid === 1 ? "action" : "complete"),
        );
      };
      assert.throws(
        () =>
          engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, false),
        /explicitly approve/,
      );
      assert.throws(
        () => engine.reasoning.approveShare(s.id, "0".repeat(64), true),
        /explicitly approve/,
      );
      assert.equal(paid, 0);
      engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
      await wait(() => session(s.id).state === "awaiting_action");
      assert.equal(nativeCalls(), 1);
      assert.equal(paid, 1);
      assert.equal(grant(s.id).state, "consumed");
      assert.throws(
        () => engine.reasoning.approveAction(s.id, "wrong-proposal"),
        /matching action/,
      );
      engine.reasoning.approveAction(s.id, session(s.id).proposalId!);
      await wait(() => session(s.id).state === "awaiting_share");
      assert.equal(nativeCalls(), 2);
      assert.equal(
        session(s.id).observation!.window.elements[0].value,
        "Verified note",
      );
      assert.equal(session(s.id).verifiedTaskIds.length, 1);
      engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
      await wait(() => session(s.id).state === "awaiting_completion");
      assert.equal(session(s.id).state, "awaiting_completion"); // A model's complete response does not finish the session.
      engine.reasoning.confirm(s.id);
      assert.equal(session(s.id).state, "completed");
      assert.equal(store.list("model_charge").length, 2);
      assert.equal(nativeCalls(), 2);
      assert.throws(
        () => engine.reasoning.approveAction(s.id, session(s.id).proposalId!),
        /closed/,
      );
    },
  );
});

test("image tampering, revoked approval and unsupported vision accounting block upload before network", async () => {
  await fixture(
    async ({
      engine,
      directory,
      session,
      wait,
      observe,
      grant,
      nativeCalls,
    }) => {
      const s = await observe();
      let paid = 0;
      globalThis.fetch = async () => {
        paid++;
        throw new Error("Must not upload");
      };
      await writeFile(
        join(directory, "artifacts", s.observation!.screenshot),
        Buffer.from("tampered image"),
      );
      engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
      await wait(() => session(s.id).state === "blocked");
      assert.equal(paid, 0);
      assert.equal(nativeCalls(), 1);
      assert.equal(grant(s.id).state, "revoked");
      assert.match(session(s.id).error!, /changed after approval/);
    },
  );
  await fixture(async ({ engine, session, wait, observe, grant }) => {
    const s = await observe();
    delete process.env.AGENTS_VISION_INPUT_TOKEN_RESERVE;
    let paid = 0;
    globalThis.fetch = async () => {
      paid++;
      throw new Error("Must not upload");
    };
    engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
    await wait(() => session(s.id).state === "blocked");
    assert.equal(paid, 0);
    assert.match(session(s.id).error!, /AGENTS_VISION_INPUT_TOKEN_RESERVE/);
  });
});

test("model completion without action evidence and invalid UIA targets cannot fabricate success", async () => {
  for (const outcome of ["complete", "invented"])
    await fixture(
      async ({ engine, session, wait, observe, grant, nativeCalls, store }) => {
        const s = await observe();
        globalThis.fetch = async () =>
          modelReply(
            outcome === "complete"
              ? decision(s.observation!, "complete")
              : {
                  ...decision(s.observation!),
                  action: { kind: "click", elementId: "invented" },
                  expect: {
                    elementId: "note",
                    property: "value",
                    equals: "different",
                  },
                },
          );
        engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
        await wait(() => session(s.id).state === "blocked");
        assert.equal(nativeCalls(), 1);
        assert.equal(store.list("model_charge").length, 1);
        assert.throws(
          () => engine.reasoning.confirm(s.id),
          /requires verified/,
        );
      },
    );
});

test("expired grants, session deadlines, recovery limits and single-session concurrency fail closed", async () => {
  await fixture(
    async ({ engine, session, observe, grant, store, nativeCalls }) => {
      const s = await observe();
      assert.throws(
        () =>
          engine.reasoning.create({
            objective: "Second simultaneous session",
            app: "fixture",
          }),
        /one active/,
      );
      store.put("screen_grant", grant(s.id).id, {
        ...grant(s.id),
        expiresAt: "2000-01-01T00:00:00Z",
      });
      assert.throws(
        () =>
          engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true),
        /explicitly approve/,
      );
      store.put("reasoning_session", s.id, { ...session(s.id), replans: 2 });
      assert.throws(() => engine.reasoning.recover(s.id), /Recovery limit/);
      store.put("reasoning_session", s.id, {
        ...session(s.id),
        deadline: "2000-01-01T00:00:00Z",
      });
      await engine.tick();
      assert.equal(session(s.id).state, "blocked");
      assert.equal(grant(s.id).state, "revoked");
      assert.equal(nativeCalls(), 1);
    },
  );
});

test("emergency stop aborts paid vision, retains uncertain spend and prevents late input or completion", async () => {
  await fixture(
    async ({ engine, session, wait, observe, grant, nativeCalls, store }) => {
      const s = await observe();
      let entered = false;
      globalThis.fetch = async (_url, init) =>
        new Promise((_resolve, reject) => {
          entered = true;
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("Stopped fixture transport")),
            { once: true },
          );
        });
      engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
      await wait(() => entered);
      engine.stop();
      await wait(() => !engine.active.size);
      assert.equal(session(s.id).state, "cancelled");
      assert.equal(nativeCalls(), 1);
      assert.equal(store.list("model_reservation").length, 1);
      engine.resume();
      await engine.tick();
      assert.equal(session(s.id).state, "cancelled");
    },
  );
});

test("restart revokes pending image grants, blocks checkpoints and never replays actions", async () => {
  await fixture(
    async ({ engine, store, session, observe, grant, nativeCalls }) => {
      const s = await observe();
      await engine.close();
      // Persist the pre-crash checkpoint to exercise constructor recovery explicitly.
      store.put("reasoning_session", s.id, { ...s, state: "awaiting_share" });
      store.put("screen_grant", grant(s.id).id, {
        ...grant(s.id),
        state: "approved",
      });
      const next = new Engine(store, { hosts: [] });
      try {
        assert.equal(session(s.id).state, "blocked");
        assert.match(session(s.id).error!, /restarted/);
        assert.equal(grant(s.id).state, "revoked");
        await next.tick();
        assert.equal(nativeCalls(), 1);
      } finally {
        await next.close();
      }
    },
  );
});

test("plan sessions require separate paid-call approval, plan review and evidence acceptance", async () => {
  await fixture(async ({ engine, store, session, wait, nativeCalls }) => {
    let paid = 0;
    globalThis.fetch = async () => {
      paid++;
      return reply({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [
          {
            type: "function_call",
            status: "completed",
            name: "propose_workflow",
            arguments: JSON.stringify({
              objective: "Inspect authorized workspace",
              steps: [
                {
                  key: "inspect",
                  agent: "computer",
                  tool: "workspace.inventory",
                  objective: "Inspect authorized workspace",
                  after: [],
                  url: null,
                  text: null,
                  path: null,
                  customers: null,
                  price: null,
                  expenses: null,
                },
              ],
            }),
          },
        ],
      });
    };
    const s = engine.reasoning.create({
      objective: "Inspect the scoped workspace",
    });
    const task = store
      .tasks()
      .find((t) => t.parentId === s.currentTaskId && t.tool === "model.plan")!;
    await engine.tick();
    assert.equal(paid, 0);
    assert.equal(task.approval, "pending");
    engine.approve(task.id, true);
    await wait(() => session(s.id).state === "awaiting_plan");
    assert.equal(paid, 1);
    assert.equal(
      store
        .tasks()
        .filter((t) => !t.workflow && t.tool === "workspace.inventory").length,
      0,
    );
    engine.reasoning.executePlan(s.id);
    await wait(() => session(s.id).state === "awaiting_completion");
    engine.reasoning.confirm(s.id);
    assert.equal(session(s.id).state, "completed");
    assert.equal(nativeCalls(), 0);
  });
});

test("standalone vision task cannot borrow a session grant for another task or model", async () => {
  await fixture(async ({ engine, store, session, wait, observe, grant }) => {
    const s = await observe();
    let paid = 0;
    globalThis.fetch = async () => {
      paid++;
      return modelReply(decision(s.observation!));
    };
    const unauthorized = engine.submit({
      agent: "computer",
      tool: "model.vision",
      objective: "Attempt unapproved screenshot upload",
      visionGrantId: grant(s.id).id,
    });
    const child = store
      .tasks()
      .find(
        (t) => t.parentId === unauthorized.id && t.tool === "model.vision",
      )!;
    engine.approve(child.id, true);
    await wait(() => store.get<Task>("task", child.id)!.state === "failed");
    assert.equal(paid, 0);
    assert.equal(session(s.id).state, "awaiting_share");
    engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
    await wait(() => session(s.id).state === "awaiting_action");
    assert.equal(paid, 1);
    const replay = engine.retry(child.id);
    const replayChild = store
      .tasks()
      .find((t) => t.parentId === replay.id && t.tool === "model.vision")!;
    engine.approve(replayChild.id, true);
    await wait(
      () => store.get<Task>("task", replayChild.id)!.state === "failed",
    );
    assert.equal(paid, 1);
  });
});

test("failed native verification blocks the session without retry or fabricated completion", async () => {
  await fixture(
    async ({
      engine,
      store,
      session,
      wait,
      observe,
      grant,
      nativeCalls,
      failPostcondition,
    }) => {
      const s = await observe();
      globalThis.fetch = async () => modelReply(decision(s.observation!));
      engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
      await wait(() => session(s.id).state === "awaiting_action");
      failPostcondition();
      engine.reasoning.approveAction(s.id, session(s.id).proposalId!);
      await wait(() => session(s.id).state === "blocked");
      assert.match(session(s.id).error!, /read-back/);
      assert.equal(nativeCalls(), 2);
      assert.equal(session(s.id).verifiedTaskIds.length, 0);
      const act = store
        .tasks()
        .find((t) => !t.workflow && t.tool === "computer.act")!;
      assert.equal(act.retries, 0);
      assert.equal(
        store.get<{ state: string }>("computer_receipt", act.id)!.state,
        "uncertain",
      );
      await engine.tick();
      assert.equal(nativeCalls(), 2);
      assert.throws(() => engine.reasoning.confirm(s.id), /requires verified/);
    },
  );
});

test("session call budget includes previous and uncertain requests, and out-of-policy actions are rejected", async () => {
  await fixture(async ({ engine, store, session, wait, observe, grant }) => {
    const s = await observe();
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return modelReply(decision(s.observation!));
    };
    for (let i = 0; i < 8; i++)
      store.put("model_reservation", `pending-${i}`, {
        taskId: `pending-${i}`,
        workflowId: s.id,
        agent: "computer",
        amount: 0.001,
        at: new Date().toISOString(),
      });
    engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
    await wait(() => session(s.id).state === "blocked");
    assert.equal(calls, 0);
    assert.match(session(s.id).error!, /model-call limit/);
  });
  await fixture(
    async ({ engine, session, wait, observe, grant, nativeCalls }) => {
      const s = await observe();
      globalThis.fetch = async () =>
        modelReply({ ...decision(s.observation!), action: { kind: "focus" } });
      engine.reasoning.approveShare(s.id, grant(s.id).imageSha256, true);
      await wait(() => session(s.id).state === "blocked");
      assert.equal(nativeCalls(), 1);
    },
  );
});
