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
): Promise<NativeResult> {
  return new Promise((resolve, reject) => {
    const stdout = new StringDecoder("utf8");
    const stderr = new StringDecoder("utf8");
    let output = "";
    let diagnostic = "";
    let bytes = 0;
    let failure: Error | undefined;
    const stop = (message: string) => {
      if (failure) return;
      failure = new Error(
        `${message}; an input may already have occurred. Observe again before any retry.`,
      );
      // A kill request is not proof of exit. Keep the desktop slot until close.
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
      diagnostic = (diagnostic + stderr.write(chunk)).slice(-4000);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (failure) return reject(failure);
      diagnostic = (diagnostic + stderr.end()).slice(-4000);
      if (code !== 0)
        return reject(
          new Error(`Windows worker failed: ${diagnostic || "no diagnostic"}`),
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
