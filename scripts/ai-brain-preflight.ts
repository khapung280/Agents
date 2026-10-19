// OFFLINE ONLY. This script cannot dispatch a live model request. It intercepts
// the production provider's fetch before invoking it and never calls the saved
// fetch. It neither loads .env nor starts a service/native worker/browser.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Store } from "../server/store.js";
import { Engine } from "../server/engine.js";
import { requestModel } from "../server/model-provider.js";

const { values } = parseArgs({
  options: {
    "input-price": { type: "string" },
    "output-price": { type: "string" },
  },
  strict: true,
  allowPositionals: false,
});
const rate = (value: string | undefined) => {
  if (value === undefined) return null;
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < 0)
    throw new Error("Prices must be nonnegative USD per million tokens.");
  return number;
};
const inputRate = rate(values["input-price"]);
const outputRate = rate(values["output-price"]);
if ((inputRate === null) !== (outputRate === null))
  throw new Error("Supply both rates or neither; no current price is assumed.");
const request = JSON.parse(
  await readFile(
    new URL("../docs/ai-brain-reasoning-test.json", import.meta.url),
    "utf8",
  ),
);
const settings = {
  AGENTS_MODEL_PROVIDER: "openai",
  // Official SDK-listed candidate, NOT proof of current account availability.
  AGENTS_MODEL: "gpt-5-mini-2025-08-07",
  AGENTS_OPENAI_API_KEY: "offline-preflight-not-a-credential",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  AGENTS_INPUT_PRICE_PER_MILLION: "1",
  AGENTS_OUTPUT_PRICE_PER_MILLION: "1",
  AGENTS_REASONING_EFFORT: "low",
  AGENTS_MAX_OUTPUT_TOKENS: "1024",
  AGENTS_MAX_PLAN_STEPS: "2",
  AGENTS_DAILY_BUDGET_USD: "1",
  AGENTS_TASK_BUDGET_USD: "1",
};
const old = Object.fromEntries(
  Object.keys(settings).map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;
let intercepted = 0;
let inputAllowance = 0;
let requestBytes = 0;
const outputAllowance = 1024;
const directory = await mkdtemp(join(tmpdir(), "agents-offline-preflight-"));
const store = new Store(directory);
const engine = new Engine(store, { hosts: [] });
try {
  globalThis.fetch = async (url, init) => {
    intercepted++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init?.redirect, "error");
    assert.equal(typeof init?.body, "string");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.store, false);
    assert.equal(body.model, settings.AGENTS_MODEL);
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.max_output_tokens, outputAllowance);
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.tools.length, 1);
    assert.equal(body.tools[0].name, "propose_workflow");
    assert.equal(body.tools[0].strict, true);
    assert.equal(typeof body.input, "string");
    assert.ok(
      !(init!.body as string).includes("offline-preflight-not-a-credential"),
    );
    requestBytes = Buffer.byteLength(init!.body as string);
    inputAllowance = requestBytes + 4096;
    const reservations = store.list<{ amount: number }>("model_reservation");
    assert.equal(reservations.length, 1);
    assert.equal(
      reservations[0].amount,
      (inputAllowance + outputAllowance) / 1e6,
    );
    // Explicit transport fixture: zero reported tokens are not real model usage.
    return new Response(
      JSON.stringify({
        status: "completed",
        usage: { input_tokens: 0, output_tokens: 0 },
        output: [
          {
            type: "function_call",
            status: "completed",
            name: "propose_workflow",
            arguments: JSON.stringify({
              objective: "Fictional arithmetic test",
              steps: [
                {
                  key: "arithmetic",
                  agent: "business",
                  tool: "business.brief",
                  objective: "Calculate the fictional scenario",
                  after: [],
                  url: null,
                  text: null,
                  path: null,
                  customers: 2,
                  price: 3,
                  expenses: 1,
                },
                {
                  key: "report",
                  agent: "communication",
                  tool: "communication.draft",
                  objective: "Summarize the fictional test evidence",
                  after: ["arithmetic"],
                  url: null,
                  text: "This is a fictional integration test.",
                  path: null,
                  customers: null,
                  price: null,
                  expenses: null,
                },
              ],
            }),
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  Object.assign(process.env, settings);
  const root = engine.submit(request);
  const task = store
    .tasks()
    .find((t) => t.parentId === root.id && t.tool === "model.plan")!;
  assert.equal(task.state, "waiting_approval");
  assert.equal(intercepted, 0);
  // This temporary fixture approval never touches the owner's database.
  task.approval = "consumed";
  const result = await requestModel(task, {
    store,
    hosts: [],
    signal: new AbortController().signal,
    progress() {},
  });
  assert.equal(intercepted, 1);
  assert.equal(result.plan!.steps.length, 2);
  assert.equal(result.plan!.steps[0].request.customers, 2);
  assert.deepEqual(result.plan!.steps[1].after, ["arithmetic"]);
  assert.equal(
    store.tasks().some((t) => t.tool === "business.brief"),
    false,
  );
  const estimate =
    inputRate === null || outputRate === null
      ? null
      : (inputAllowance * inputRate + outputAllowance * outputRate) / 1e6;
  console.log(
    JSON.stringify(
      {
        mode: "OFFLINE ONLY — intercepted provider transport",
        liveRequests: 0,
        captures: 0,
        pcActions: 0,
        proposedPlanExecuted: false,
        currentPricingVerified: false,
        accountModelAccessVerified: false,
        candidateModel: settings.AGENTS_MODEL,
        reasoningEffort: "low",
        serializedRequestBytes: requestBytes,
        conservativeInputTokenAllowance: inputAllowance,
        maximumOutputTokensIncludingReasoning: outputAllowance,
        reservationFormulaUsd: `(${inputAllowance} * inputRate + ${outputAllowance} * outputRate) / 1000000`,
        suppliedRatesUsdPerMillion:
          inputRate === null ? null : { input: inputRate, output: outputRate },
        calculatedReservationUsd: estimate,
        proposedReasoningBudgetUsd: 0.01,
        fitsProposedBudgetAtSuppliedRates:
          estimate === null ? null : estimate <= 0.01,
        liveReady: false,
        next: "Verify official current rates, model capabilities/account access, secure configuration, and obtain explicit owner approval before any live task.",
      },
      null,
      2,
    ),
  );
} finally {
  globalThis.fetch = originalFetch;
  await engine.close();
  store.close();
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(directory, { recursive: true, force: true });
}
