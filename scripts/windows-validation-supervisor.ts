import { spawn, execFile } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const validationLimits = {
  startupMs: 15000,
  stageMs: 45000,
  totalMs: 180000,
  cleanupMs: 5000,
  heartbeatMs: 5000,
  killMs: 5000,
};

// A separate process supervises the engine, so blocked native calls or engine
// cleanup cannot suppress the final result. It launches only the fixed harness.
export function superviseValidation(options: {
  executable: string;
  args: string[];
  directory: string;
  limits?: typeof validationLimits;
  print?: (line: string) => void;
}) {
  const limits = options.limits ?? validationLimits;
  const started = Date.now();
  const logFile = join(options.directory, "validation.log");
  const resultFile = join(options.directory, "validation-result.json");
  const log = (message: string) => {
    const line = `[${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`;
    appendFileSync(logFile, line + "\n", { mode: 0o600 });
    options.print?.(line);
  };
  log(`START: Windows fixture validation. Evidence: ${options.directory}`);
  log(
    "Only the disposable fixture is authorized. Leave mouse/keyboard untouched.",
  );
  log(
    `Limits: startup ${limits.startupMs / 1000}s, stage ${limits.stageMs / 1000}s, total ${limits.totalMs / 1000}s, cleanup ${limits.cleanupMs / 1000}s.`,
  );
  return new Promise<{
    passed: boolean;
    error?: string;
    harnessExitConfirmed: boolean;
  }>((resolve) => {
    const child = spawn(options.executable, options.args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let stage = "starting validation runtime";
    let stageDeadline = Date.now() + limits.startupMs;
    let reportedPass = false;
    let failure: string | undefined;
    let finished = false;
    let exitConfirmed = false;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const details: { checks?: string[]; screenshot?: string } = {};
    const save = (passed: boolean) =>
      writeFileSync(
        resultFile,
        JSON.stringify(
          {
            passed,
            error: failure,
            stage,
            platform: process.platform,
            at: new Date().toISOString(),
            elapsedMs: Date.now() - started,
            harnessExitConfirmed: exitConfirmed,
            ...details,
            limits:
              "Disposable fixture only; this does not certify other applications, DPI configurations, or locked-session behavior.",
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(watchdog);
      clearInterval(heartbeat);
      clearTimeout(stopTimer);
      const passed = reportedPass && !failure && exitConfirmed;
      if (!passed) failure ??= "Harness exited without a verified PASS result.";
      save(passed);
      log(
        `${passed ? "PASS" : "FAIL"}: ${passed ? "Native fixture checks and cleanup completed." : failure}`,
      );
      if (!exitConfirmed)
        log(
          "WARNING: process termination could not be confirmed. Close the disposable validation window; do not retry while it remains active.",
        );
      log(`Result: ${resultFile}`);
      log(`Log: ${logFile}`);
      child.stdout!.destroy();
      child.stderr!.destroy();
      if (child.connected) child.disconnect();
      child.unref();
      resolve({ passed, error: failure, harnessExitConfirmed: exitConfirmed });
    };
    const fail = (message: string) => {
      if (failure || finished) return;
      failure = message;
      save(false); // Persist/report failure before attempting any potentially stuck cleanup.
      log(`FAIL: ${message}`);
      log(
        "Stopping this validation process tree only; no automatic input retry.",
      );
      stopTimer = setTimeout(finish, limits.killMs + 1000);
      if (process.platform === "win32" && child.pid) {
        // Only descendants of the harness started above. Never kill by image name,
        // invoke a shell, request elevation, or touch the normal AGENTS instance.
        execFile(
          join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "taskkill.exe",
          ),
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, timeout: limits.killMs },
          (error) => {
            if (error && !exitConfirmed) {
              log(
                "Validation tree termination was not confirmed; requesting harness termination.",
              );
              child.kill();
            }
          },
        );
      } else child.kill();
    };
    const watchdog = setInterval(() => {
      if (Date.now() - started >= limits.totalMs)
        fail(`Overall validation deadline exceeded during ${stage}.`);
      else if (Date.now() >= stageDeadline)
        fail(`Stage deadline exceeded during ${stage}.`);
    }, 100);
    const heartbeat = setInterval(
      () =>
        log(
          `WAIT: ${stage}; ${Math.max(0, Math.ceil((stageDeadline - Date.now()) / 1000))}s remaining in stage.`,
        ),
      limits.heartbeatMs,
    );
    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) =>
      log(`Harness: ${chunk.slice(-4000).trim()}`),
    );
    child.stderr!.on("data", (chunk: string) =>
      log(`Harness diagnostic: ${chunk.slice(-4000).trim()}`),
    );
    child.on("message", (message: unknown) => {
      if (finished || failure || !message || typeof message !== "object")
        return;
      const m = message as Record<string, unknown>;
      if (m.type === "stage" && typeof m.name === "string") {
        stage = m.name.slice(0, 200);
        stageDeadline =
          Date.now() +
          (stage === "cleanup" ? limits.cleanupMs : limits.stageMs);
        log(`STAGE: ${stage}`);
      } else if (m.type === "log" && typeof m.message === "string")
        log(m.message.slice(0, 4000));
      else if (m.type === "result") {
        if (m.passed !== true)
          fail(
            typeof m.error === "string"
              ? m.error.slice(0, 4000)
              : "Harness reported failure.",
          );
        else {
          reportedPass = true;
          if (Array.isArray(m.checks))
            details.checks = m.checks
              .filter((s): s is string => typeof s === "string")
              .slice(0, 30);
          if (typeof m.screenshot === "string")
            details.screenshot = m.screenshot;
          stage = "waiting for harness exit";
          stageDeadline = Date.now() + limits.cleanupMs;
        }
      }
    });
    child.on("error", (error) =>
      fail(`Cannot run validation harness: ${error.message}`),
    );
    child.once("exit", (code) => {
      exitConfirmed = true;
      if (code !== 0)
        failure ??= `Validation harness exited with code ${code}.`;
      finish(); // Do not wait indefinitely for descendant-held stdout/stderr.
    });
    child.once("close", () => {
      if (!finished) finish();
    });
  });
}
