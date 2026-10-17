import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  superviseValidation,
  validationLimits,
} from "../scripts/windows-validation-supervisor.js";

// Actual child processes exercising the watchdog, never native desktop actions.
async function runFixture(
  code: string,
  limits = {
    ...validationLimits,
    startupMs: 5000,
    stageMs: 300,
    totalMs: 8000,
    cleanupMs: 300,
    heartbeatMs: 100,
    killMs: 1000,
  },
) {
  const directory = await mkdtemp(join(tmpdir(), "agents-watchdog-test-"));
  try {
    const result = await superviseValidation({
      executable: process.execPath,
      args: ["-e", code],
      directory,
      limits,
    });
    const log = await readFile(join(directory, "validation.log"), "utf8");
    const report = JSON.parse(
      await readFile(join(directory, "validation-result.json"), "utf8"),
    );
    return { result, log, report };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "independent watchdog stops a blocked child event loop and saves explicit FAIL",
  { timeout: 15000 },
  async () => {
    const { result, log, report } = await runFixture(`
    process.send({type:'stage', name:'simulated UI Automation stall'}, () => { while(true) {} });
  `);
    assert.equal(result.passed, false);
    assert.match(result.error!, /Stage deadline.*UI Automation stall/);
    assert.match(log, /WAIT:/);
    assert.match(log, /FAIL:/);
    assert.equal(report.passed, false);
    assert.ok(report.elapsedMs < 7000);
  },
);

test(
  "a reported failure cannot disappear behind hanging engine cleanup",
  { timeout: 15000 },
  async () => {
    const { result, log, report } = await runFixture(`
    process.send({type:'stage', name:'launch'});
    process.send({type:'result', passed:false, error:'Fixture worker timeout'});
    setInterval(() => {}, 1000);
  `);
    assert.equal(result.passed, false);
    assert.match(log, /FAIL: Fixture worker timeout/);
    assert.equal(report.error, "Fixture worker timeout");
  },
);

test(
  "cleanup has its own deadline and does not turn incomplete checks into PASS",
  { timeout: 15000 },
  async () => {
    const { result, log } = await runFixture(`
    process.send({type:'stage', name:'cleanup'});
    setInterval(() => {}, 1000);
  `);
    assert.equal(result.passed, false);
    assert.match(log, /Stage deadline exceeded during cleanup/);
    assert.doesNotMatch(log, /PASS:/);
  },
);

test(
  "exit zero without verified result is FAIL; PASS requires result and clean exit",
  { timeout: 15000 },
  async () => {
    const empty = await runFixture("process.exit(0)");
    assert.equal(empty.result.passed, false);
    assert.match(empty.log, /without a verified PASS/);
    const pass = await runFixture(
      `process.send({type:'result',passed:true,checks:['explicit supervisor fixture only']}, () => process.disconnect())`,
    );
    assert.equal(pass.result.passed, true);
    assert.equal(pass.report.harnessExitConfirmed, true);
    assert.deepEqual(pass.report.checks, ["explicit supervisor fixture only"]);
    assert.match(pass.log, /PASS:/);
  },
);

test(
  "overall deadline cannot be extended by repeated stage or progress messages",
  { timeout: 15000 },
  async () => {
    const { result } = await runFixture(
      `
    setInterval(() => process.send({type:'stage',name:'still busy'}), 50);
  `,
      {
        ...validationLimits,
        startupMs: 5000,
        stageMs: 5000,
        totalMs: 1000,
        cleanupMs: 300,
        heartbeatMs: 100,
        killMs: 1000,
      },
    );
    assert.equal(result.passed, false);
    assert.match(result.error!, /Overall validation deadline/);
  },
);
