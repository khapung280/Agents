import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { executeTool } from "../server/tools.js";

test("configured model adapter validates plans, records actual reported usage and reserves uncertain spend", async () => {
  const keys = [
    "AGENTS_MODEL_PROVIDER",
    "AGENTS_MODEL",
    "OPENAI_API_KEY",
    "AGENTS_OPENAI_API_KEY",
    "AGENTS_INPUT_PRICE_PER_MILLION",
    "AGENTS_OUTPUT_PRICE_PER_MILLION",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const directory = await mkdtemp(join(tmpdir(), "agents-provider-"));
  const store = new Store(directory);
  const engine = new Engine(store, { hosts: [] });
  try {
    Object.assign(process.env, {
      AGENTS_MODEL_PROVIDER: "openai",
      AGENTS_MODEL: "test-fixture-model",
      OPENAI_API_KEY: "fixture-only-not-a-real-key",
      AGENTS_OPENAI_API_KEY: "fixture-only-not-a-real-key",
      AGENTS_INPUT_PRICE_PER_MILLION: "1",
      AGENTS_OUTPUT_PRICE_PER_MILLION: "2",
    });
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  objective: "Plan work",
                  steps: [
                    {
                      key: "plan",
                      request: {
                        agent: "project",
                        objective: "Create the plan",
                      },
                      after: [],
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const root = engine.submit({
      agent: "project",
      tool: "model.plan",
      objective: "Prepare a coordinated plan",
    });
    const task = store
      .tasks()
      .find((t) => t.parentId === root.id && t.tool === "model.plan")!;
    await assert.rejects(
      executeTool(task, {
        store,
        signal: new AbortController().signal,
        hosts: [],
        progress() {},
      }),
      /consumed task-scoped approval/,
    );
    assert.equal(calls, 0);
    // This adapter unit fixture starts at the engine's post-approval execution boundary.
    // Engine integration tests separately prove that owners must grant and consume approval once.
    task.approval = "consumed";
    const result = await executeTool(task, {
      store,
      signal: new AbortController().signal,
      hosts: [],
      progress: () => {},
    });
    assert.equal(result.artifacts[0].name, "Proposed workflow");
    assert.equal(result.usage!.inputTokens, 100);
    assert.equal(result.usage!.estimatedCost, 0.0002);
    assert.equal(calls, 1);
    assert.equal(store.list("model_reservation").length, 0);
    engine.setPolicy({ budgetUsd: 0 });
    await assert.rejects(
      executeTool(task, {
        store,
        signal: new AbortController().signal,
        hosts: [],
        progress: () => {},
      }),
      /Budget/,
    );
    assert.equal(calls, 1);
    engine.setPolicy({ budgetUsd: 5 });
    globalThis.fetch = async () => {
      throw new Error("Connection lost after request");
    };
    await assert.rejects(
      executeTool(task, {
        store,
        signal: new AbortController().signal,
        hosts: [],
        progress: () => {},
      }),
      /Connection lost/,
    );
    assert.equal(store.list("model_reservation").length, 1);
    // Invalid model plans are rejected by the execution boundary even if an LLM returns them.
    assert.throws(
      () =>
        engine.submitWorkflow({
          objective: "Malicious plan",
          steps: [
            {
              key: "hack",
              request: {
                agent: "supervisor",
                tool: "workspace.write",
                objective: "Write anything",
              },
              after: [],
            },
          ],
        }),
      /not authorized/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    await engine.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
