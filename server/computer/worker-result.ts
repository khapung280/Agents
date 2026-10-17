import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import { WindowEvidence } from "../../shared/computer.js";
import type { NativeRequest, NativeResult } from "./windows.js";

// Collect only the already-started fixed worker. This does not expose a launch path.
export function collectWindowsWorkerResult(
  child: Pick<
    ChildProcessWithoutNullStreams,
    "stdin" | "stdout" | "stderr" | "kill"
  > &
    Pick<EventEmitter, "on" | "once">,
  request: NativeRequest,
  signal: AbortSignal,
  diagnostic: (message: string) => void = () => {},
): Promise<NativeResult> {
  return new Promise((resolve, reject) => {
    const stdout = new StringDecoder("utf8");
    const stderr = new StringDecoder("utf8");
    let output = "";
    let errorText = "";
    let bytes = 0;
    let failure: Error | undefined;
    let lastStage = "not reported";
    let stageBuffer = "";
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (message: string) => {
      if (failure) return;
      failure = new Error(
        `${message}; an input may already have occurred. Observe again before any retry. Last native stage: ${lastStage}.`,
      );
      // A kill request is not proof of exit. Keep the desktop slot until close.
      diagnostic(
        `Worker termination requested: ${message}; last stage: ${lastStage}`,
      );
      child.kill();
    };
    const abort = () => stop("Windows execution interrupted");
    const timer = setTimeout(
      () => stop("Windows worker exceeded its 30-second deadline"),
      30000,
    );
    child.on("error", (error: Error) => {
      // An error does not prove termination; failed spawn also emits close.
      failure ??= error;
    });
    child.stdin.on("error", () => {
      /* close and stderr carry the worker outcome, including script-policy errors */
    });
    child.stdout.on("error", () => stop("Windows evidence stream failed"));
    child.stderr.on("error", () => stop("Windows diagnostic stream failed"));
    child.stdout.on("data", (chunk: Buffer) => {
      if (failure) return;
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) {
        output = "";
        stop("Windows evidence exceeded size limit");
        return;
      }
      output += stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const decoded = stderr.write(chunk);
      errorText = (errorText + decoded).slice(-4000);
      stageBuffer += decoded;
      const lines = stageBuffer.split(/\r?\n/);
      stageBuffer = lines.pop()!.slice(-4000);
      for (const line of lines) {
        const match = /^AGENTS_STAGE: ([a-z-]{1,40})$/.exec(line);
        if (match) {
          lastStage = match[1];
          diagnostic(`Native stage: ${lastStage}`);
        }
      }
    });
    child.once("exit", (code) => {
      // A launched application may retain inherited pipe handles after the worker
      // has exited. Exit proves the worker stopped; allow a bounded final drain,
      // then close our pipe readers instead of waiting for the application to quit.
      clearTimeout(timer);
      diagnostic(`Worker exited (${code ?? "signal"}); draining evidence`);
      drainTimer = setTimeout(() => {
        diagnostic(
          "Worker exited but pipes remained open; closing inherited readers",
        );
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
      }, 1000);
    });
    child.once("close", (code) => {
      clearTimeout(drainTimer);
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (failure) return reject(failure);
      errorText = (errorText + stderr.end()).slice(-4000);
      if (code !== 0)
        return reject(
          new Error(`Windows worker failed: ${errorText || "no diagnostic"}`),
        );
      try {
        resolve(
          z
            .object({
              window: WindowEvidence,
              png: z.string().max(14 * 1024 * 1024),
              verified: z.string().min(1),
            })
            .parse(JSON.parse((output + stdout.end()).replace(/^\uFEFF/, ""))),
        );
      } catch {
        reject(
          new Error(
            "Windows worker returned invalid evidence; do not assume the action succeeded.",
          ),
        );
      }
    });
    signal.addEventListener("abort", abort, { once: true });
    // Catch cancellation between the caller's pre-spawn check and listener setup.
    if (signal.aborted) abort();
    else child.stdin.end(JSON.stringify(request));
  });
}
