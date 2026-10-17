import { mkdtempSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  superviseValidation,
  validationLimits,
} from "./windows-validation-supervisor.js";

const watchdogSelfTest = process.argv.includes("--watchdog-self-test");
if (process.platform !== "win32" && !watchdogSelfTest) {
  console.error(
    "NOT RUN: Windows native validation requires an actual interactive Windows machine. No PC control is verified on this host.",
  );
  process.exitCode = 1;
} else {
  try {
    const directory = mkdtempSync(join(tmpdir(), "agents-windows-validation-"));
    if (watchdogSelfTest) {
      writeSync(
        1,
        "SELF-TEST: watchdog only; no UI Automation, application launch, capture, or desktop input.\n",
      );
      const probe = await superviseValidation({
        executable: process.execPath,
        args: [
          "-e",
          "process.send({type:'stage',name:'watchdog self-test'},()=>{while(true){}})",
        ],
        directory,
        limits: {
          ...validationLimits,
          stageMs: 300,
          totalMs: 20000,
          heartbeatMs: 100,
        },
        print: (line) => writeSync(1, line + "\n"),
      });
      const verified =
        !probe.passed &&
        probe.harnessExitConfirmed &&
        probe.error?.includes(
          "Stage deadline exceeded during watchdog self-test",
        );
      writeSync(
        1,
        `${verified ? "PASS" : "FAIL"}: watchdog self-test only; no Windows control is verified.\n`,
      );
      process.exit(verified ? 0 : 1);
    }
    const source = fileURLToPath(import.meta.url);
    const harness = join(
      dirname(source),
      source.endsWith(".ts")
        ? "windows-validation.ts"
        : "windows-validation.js",
    );
    const result = await superviseValidation({
      executable: process.execPath,
      args: [...process.execArgv, harness, directory],
      directory,
      print: (line) => writeSync(1, line + "\n"),
    });
    // Standalone validation only: no lingering test handle can keep the launcher waiting.
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    writeSync(
      2,
      `FAIL: Could not start validation: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
