import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { executeTool } from "../server/tools.js";
import { validateModelPlan } from "../server/model-plan.js";
import type { Task } from "../shared/contracts.js";

const plan = () => ({
  objective: "Prepare a project plan",
  steps: [
    {
      key: "plan",
      agent: "project",
      tool: "project.plan",
      objective: "Create the plan",
      after: [],
      url: null,
      text: null,
      path: null,
    },
  ],
});
const responseBody = (proposal: unknown = plan()) => ({
  status: "completed",
  output: [
    {
      type: "function_call",
      name: "propose_workflow",
      call_id: "call_fixture",
      arguments: JSON.stringify(proposal),
      status: "completed",
    },
  ],
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    input_tokens_details: { cached_tokens: 10 },
    output_tokens_details: { reasoning_tokens: 20 },
  },
});
const reply = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
async function fixture(
  run: (f: {
    store: Store;
    engine: Engine;
    create: (tool?: "model.plan" | "model.draft") => Task;
    execute: (task: Task) => ReturnType<typeof executeTool>;
  }) => Promise<void>,
) {
  const keys = [
    "AGENTS_MODEL_PROVIDER",
    "AGENTS_MODEL",
    "AGENTS_OPENAI_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "AGENTS_INPUT_PRICE_PER_MILLION",
    "AGENTS_OUTPUT_PRICE_PER_MILLION",
    "AGENTS_REASONING_EFFORT",
    "AGENTS_MAX_OUTPUT_TOKENS",
    "AGENTS_MAX_PLAN_STEPS",
    "AGENTS_DAILY_BUDGET_USD",
    "AGENTS_TASK_BUDGET_USD",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const directory = await mkdtemp(join(tmpdir(), "agents-provider-"));
  const store = new Store(directory);
  const engine = new Engine(store, { hosts: ["example.com"] });
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, {
      AGENTS_MODEL_PROVIDER: "openai",
      AGENTS_MODEL: "test-fixture-model",
      AGENTS_OPENAI_API_KEY: "fixture-only-not-a-real-key",
      AGENTS_INPUT_PRICE_PER_MILLION: "1",
      AGENTS_OUTPUT_PRICE_PER_MILLION: "2",
    });
    // All tests replace transport. No test is permitted to contact a provider.
    globalThis.fetch = async () => {
      throw new Error("Unexpected provider transport invocation");
    };
    const create = (tool: "model.plan" | "model.draft" = "model.plan") => {
      const root = engine.submit({
        agent: "project",
        tool,
        objective: "Prepare a coordinated plan",
        projectId: "test-project",
      });
      const task = store
        .tasks()
        .find((t) => t.parentId === root.id && t.tool === tool)!;
      task.approval = "consumed";
      return task;
    };
    await run({
      store,
      engine,
      create,
      execute: (task) =>
        executeTool(task, {
          store,
          signal: new AbortController().signal,
          hosts: ["example.com"],
          progress() {},
        }),
    });
  } finally {
    globalThis.fetch = originalFetch;
    await engine.close();
    store.close();
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    await rm(directory, { recursive: true, force: true });
  }
}

test("Responses planning sends one strict typed proposal request and records actual usage without executing the plan", async () => {
  await fixture(async ({ create, execute, store }) => {
    process.env.AGENTS_REASONING_EFFORT = "low";
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init!.redirect, "error");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.store, false);
      assert.deepEqual(body.reasoning, { effort: "low" });
      assert.equal(body.max_output_tokens, 1500);
      assert.equal(body.parallel_tool_calls, false);
      assert.equal(body.tools[0].name, "propose_workflow");
      assert.equal(body.tools[0].strict, true);
      assert.equal(body.tools[0].parameters.additionalProperties, false);
      assert.deepEqual(body.tool_choice, {
        type: "function",
        name: "propose_workflow",
      });
      assert.ok(!JSON.stringify(body).includes("fixture-only-not-a-real-key"));
      return reply(responseBody());
    };
    const task = create();
    task.input.text = "Key: fixture-only-not-a-real-key";
    task.approval = "pending";
    await assert.rejects(execute(task), /consumed task-scoped approval/);
    assert.equal(calls, 0);
    task.approval = "consumed";
    const result = await execute(task);
    assert.equal(result.artifacts[0].name, "Proposed workflow");
    const workflow = JSON.parse(result.artifacts[0].content!);
    assert.equal(workflow.steps[0].request.projectId, "test-project");
    assert.equal(result.usage!.estimatedCost, 0.0002);
    assert.equal(result.usage!.reasoningTokens, 20);
    assert.equal(result.usage!.cachedInputTokens, 10);
    assert.equal(store.list("model_reservation").length, 0);
    assert.equal(store.list("model_charge").length, 1);
    assert.equal(store.projects().length, 0);
    assert.equal(calls, 1);
    await assert.rejects(execute(task), /already attempted/);
    assert.equal(calls, 1);
  });
});

test("paid planning rejects invalid graphs, grants, scope injection and native input while retaining known usage", async () => {
  await fixture(async ({ create, execute, store }) => {
    const proposals = [
      { ...plan(), steps: [plan().steps[0], plan().steps[0]] },
      { ...plan(), steps: [{ ...plan().steps[0], after: ["later"] }] },
      {
        ...plan(),
        steps: [
          { ...plan().steps[0], agent: "supervisor", tool: "workspace.write" },
        ],
      },
      {
        ...plan(),
        steps: [{ ...plan().steps[0], projectId: "private-other-project" }],
      },
      {
        ...plan(),
        steps: [
          { ...plan().steps[0], agent: "computer", tool: "computer.act" },
        ],
      },
      {
        ...plan(),
        steps: [
          {
            ...plan().steps[0],
            agent: "research",
            tool: "research.collect",
            url: "https://unapproved.example",
          },
        ],
      },
      {
        ...plan(),
        steps: [
          {
            ...plan().steps[0],
            agent: "computer",
            tool: "workspace.write",
            path: "../outside",
            text: "blocked",
          },
        ],
      },
    ];
    for (const proposal of proposals) {
      globalThis.fetch = async () => reply(responseBody(proposal));
      const task = create();
      await assert.rejects(
        execute(task),
        /failed schema, dependency, scope, or tool permission/,
      );
      assert.equal(store.get<Task>("task", task.id)!.usage!.inputTokens, 100);
    }
    assert.equal(store.list("model_charge").length, proposals.length);
    assert.equal(store.list("model_reservation").length, 0);
  });
});

test("incomplete, refused, extra-call and invalid output responses cannot complete but are accounted", async () => {
  await fixture(async ({ create, execute, store }) => {
    const good = responseBody();
    const bodies = [
      { ...good, status: "incomplete" },
      {
        ...good,
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      },
      { ...good, output: [...good.output, ...good.output] },
      { ...good, output: [{ ...good.output[0], status: "in_progress" }] },
      { ...good, output: [{ ...good.output[0], name: "execute_shell" }] },
      { ...good, output: [{ ...good.output[0], arguments: "{not JSON" }] },
    ];
    for (const body of bodies) {
      globalThis.fetch = async () => reply(body);
      await assert.rejects(
        execute(create()),
        /incomplete|refused|exactly one|invalid workflow JSON/,
      );
    }
    assert.equal(store.list("model_charge").length, bodies.length);
    assert.equal(store.list("model_reservation").length, 0);
  });
});

test("malformed usage and network uncertainty remain reserved and do not retry", async () => {
  await fixture(async ({ create, execute, store }) => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new Error("fixture-only-not-a-real-key connection lost");
    };
    const task = create();
    await assert.rejects(
      execute(task),
      (e: Error) =>
        /Uncertain spend/.test(e.message) &&
        !e.message.includes("fixture-only"),
    );
    await assert.rejects(execute(task), /already attempted/);
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      reply({
        ...responseBody(),
        usage: { input_tokens: -1, output_tokens: 4 },
      });
    await assert.rejects(execute(create()), /valid usage/);
    assert.equal(store.list("model_reservation").length, 2);
    assert.equal(store.list("model_charge").length, 0);
  });
});

test("total, daily, per-task and agent-call budgets prevent network requests", async () => {
  await fixture(async ({ create, execute, engine, store }) => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return reply(responseBody());
    };
    engine.setPolicy({ budgetUsd: 0 });
    await assert.rejects(execute(create()), /Budget/);
    engine.setPolicy({ budgetUsd: 5 });
    process.env.AGENTS_DAILY_BUDGET_USD = "0";
    await assert.rejects(execute(create()), /Budget/);
    delete process.env.AGENTS_DAILY_BUDGET_USD;
    process.env.AGENTS_TASK_BUDGET_USD = "0";
    await assert.rejects(execute(create()), /Budget/);
    delete process.env.AGENTS_TASK_BUDGET_USD;
    assert.equal(calls, 0);
    await execute(create());
    engine.setPolicy({ maxCallsPerAgent: 1 });
    await assert.rejects(execute(create()), /model-call limit/);
    assert.equal(calls, 1);
    assert.equal(store.list("model_charge").length, 1);
  });
});

test("known HTTP rejection releases reservation without logging provider body", async () => {
  await fixture(async ({ create, execute, store }) => {
    globalThis.fetch = async () =>
      new Response("private provider content", { status: 401 });
    await assert.rejects(execute(create()), /HTTP 401; no automatic retry/);
    assert.equal(store.list("model_reservation").length, 0);
    globalThis.fetch = async () =>
      new Response("private provider content", { status: 500 });
    await assert.rejects(execute(create()), /HTTP 500/);
    assert.equal(store.list("model_reservation").length, 1);
  });
});

test("context and output limits fail closed and drafts do not accept tools", async () => {
  await fixture(async ({ create, execute }) => {
    const large = create();
    large.input.text = "x".repeat(32001);
    await assert.rejects(execute(large), /context exceeds/);
    globalThis.fetch = async () => new Response("x".repeat(1024 * 1024 + 1));
    await assert.rejects(execute(create()), /size limit/);
    globalThis.fetch = async () => reply(responseBody());
    await assert.rejects(
      execute(create("model.draft")),
      /Unexpected function call/,
    );
    process.env.AGENTS_REASONING_EFFORT = "unsupported";
    await assert.rejects(execute(create()), /Invalid AGENTS_REASONING_EFFORT/);
  });
});

test("Responses draft parses output text and omits unsupported optional reasoning unless configured", async () => {
  await fixture(async ({ create, execute }) => {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      assert.equal(request.reasoning, undefined);
      assert.equal(request.tools, undefined);
      return reply({
        ...responseBody(),
        output: [
          { type: "reasoning" },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Draft based on supplied evidence.",
              },
            ],
          },
        ],
      });
    };
    assert.match(
      (await execute(create("model.draft"))).artifacts[0].content!,
      /Draft based on/,
    );
  });
});

test("Anthropic drafting remains available with bounded usage and no Responses-only fields", async () => {
  await fixture(async ({ create, execute }) => {
    process.env.AGENTS_MODEL_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-fixture";
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      const request = JSON.parse(init!.body as string);
      assert.equal(request.store, undefined);
      return reply({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "An explicit draft." }],
        usage: { input_tokens: 30, output_tokens: 10 },
      });
    };
    assert.equal((await execute(create("model.draft"))).usage!.inputTokens, 30);
  });
});

test("valid model dependencies execute through the existing engine, including separate file approval", async () => {
  await fixture(async ({ create, execute, engine, store }) => {
    const proposal = {
      objective: "Create and verify a scoped note",
      steps: [
        {
          key: "inventory",
          agent: "computer",
          tool: "workspace.inventory",
          objective: "Inspect approved workspace",
          after: [],
          url: null,
          text: null,
          path: null,
        },
        {
          key: "note",
          agent: "computer",
          tool: "workspace.write",
          objective: "Write an approved note",
          after: ["inventory"],
          url: null,
          text: "A safe fixture note.",
          path: "fixture-note.txt",
        },
      ],
    };
    globalThis.fetch = async () => reply(responseBody(proposal));
    const proposed = await execute(create());
    const root = engine.submitWorkflow(
      JSON.parse(proposed.artifacts[0].content!),
    );
    const write = store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "workspace.write")!;
    assert.equal(write.approval, "pending");
    engine.approve(write.id, true);
    for (
      let n = 0;
      n < 60 && store.get<Task>("task", root.id)?.state !== "completed";
      n++
    ) {
      await engine.tick();
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(store.get<Task>("task", root.id)?.state, "completed");
    assert.match(
      store.get<Task>("task", write.id)!.verification!,
      /read-back succeeded/,
    );
  });
});

test("plan validation supports all ten registered agents without changing grants", async () => {
  await fixture(async ({ create, store }) => {
    const task = create();
    const pairs = [
      ["computer", "workspace.inventory"],
      ["browser", "browser.inspect"],
      ["developer", "code.review"],
      ["research", "research.collect"],
      ["business", "business.brief"],
      ["marketing", "marketing.audit"],
      ["communication", "communication.draft"],
      ["project", "project.plan"],
      ["memory", "memory.search"],
      ["supervisor", "supervisor.verify"],
    ];
    for (const [agent, tool] of pairs) {
      const candidate = {
        ...plan(),
        steps: [
          plan().steps[0],
          {
            key: "work",
            agent,
            tool,
            objective: "Perform bounded work",
            after: ["plan"],
            url: "https://example.com",
            text: "const sample = 1;",
            path: null,
          },
        ],
      };
      const result = validateModelPlan(
        candidate,
        task,
        ["example.com"],
        store.policy().agents,
        8,
      );
      assert.equal(result.steps[1].request.agent, agent);
    }
  });
});

test("engine failure preserves paid usage and emergency stop cannot turn late responses into success", async () => {
  await fixture(async ({ store, engine }) => {
    globalThis.fetch = async () =>
      reply({ ...responseBody(), status: "incomplete" });
    const root = engine.submit({
      agent: "project",
      tool: "model.plan",
      objective: "Invalid response fixture",
    });
    const child = store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "model.plan")!;
    engine.approve(child.id, true);
    for (
      let n = 0;
      n < 100 && store.get<Task>("task", child.id)?.state !== "failed";
      n++
    ) {
      await engine.tick();
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(store.get<Task>("task", child.id)!.state, "failed");
    assert.equal(store.get<Task>("task", child.id)!.usage!.outputTokens, 50);
    assert.equal(engine.snapshot().metrics.tokens, 150);
    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    let entered = false;
    globalThis.fetch = async () => {
      entered = true;
      await pending;
      return reply(responseBody());
    };
    const later = engine.submit({
      agent: "project",
      tool: "model.plan",
      objective: "Stop late response fixture",
    });
    const laterChild = store
      .tasks()
      .find((t) => t.parentId === later.id && t.tool === "model.plan")!;
    engine.approve(laterChild.id, true);
    for (let n = 0; n < 100 && !entered; n++) {
      await engine.tick();
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(entered, true);
    engine.stop();
    release();
    for (let n = 0; n < 100 && engine.active.size; n++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(store.get<Task>("task", laterChild.id)!.state, "cancelled");
    assert.equal(store.get<Task>("task", laterChild.id)!.output.length, 0);
    assert.equal(
      store.get<Task>("task", laterChild.id)!.usage!.inputTokens,
      100,
    );
  });
});

test("same-workflow spending and prior-day uncertainty are enforced after reopening the database", async () => {
  await fixture(async ({ create, execute, store }) => {
    globalThis.fetch = async () => reply(responseBody());
    const first = create();
    await execute(first);
    const persisted = new Store(store.directory);
    try {
      assert.equal(persisted.list("model_charge").length, 1);
    } finally {
      persisted.close();
    }
    process.env.AGENTS_TASK_BUDGET_USD = "0.01";
    store.put("model_charge", "fixture-charge", {
      taskId: "fixture-charge",
      workflowId: first.parentId,
      agent: "project",
      at: new Date().toISOString(),
      usage: {
        provider: "openai",
        model: "fixture",
        inputTokens: 1,
        outputTokens: 1,
        estimatedCost: 0.01,
      },
    });
    const next = create();
    next.parentId = first.parentId;
    await assert.rejects(execute(next), /Budget/);
    delete process.env.AGENTS_TASK_BUDGET_USD;
    store.put("model_reservation", "old-unknown", {
      amount: 1,
      agent: "project",
      taskId: "old-unknown",
      at: "2020-01-01T00:00:00.000Z",
    });
    await assert.rejects(execute(create()), /Budget/);
  });
});
