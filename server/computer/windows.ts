import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { collectWindowsWorkerResult } from "./worker-result.js";
import {
  WindowsPolicy,
  WindowEvidence,
  type ComputerPolicy,
  type ComputerStatus,
  type ComputerCommand,
  type ComputerObservation,
  type WindowState,
} from "../../shared/computer.js";
import type { Store } from "../store.js";

export interface NativeRequest {
  command: ComputerCommand;
  executable: string;
  before?: WindowState;
}
export interface NativeResult {
  window: WindowState;
  png: string;
  verified: string;
}
export type NativeTransport = (
  request: NativeRequest,
  signal: AbortSignal,
  diagnostic?: (message: string) => void,
) => Promise<NativeResult>;

// Process-only policy for this fixed, trusted project script; never a user-supplied path.
export function windowsWorkerArguments() {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    // UI Automation clients run in MTA; this worker owns no UI thread.
    "-Mta",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve("native/windows/worker.ps1"),
  ];
}
// Fixed executable and script only. User data travels over stdin, never command interpolation.
export const runWindowsWorker: NativeTransport = async (
  request,
  signal,
  diagnostic,
) => {
  signal.throwIfAborted();
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const child = spawn(
    join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    windowsWorkerArguments(),
    {
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      // Do not pass model keys, proxy credentials, NODE_OPTIONS, or unrelated service secrets to applications.
      env: {
        ...Object.fromEntries(
          [
            "SystemRoot",
            "WINDIR",
            "TEMP",
            "TMP",
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "ProgramW6432",
            "USERNAME",
            "USERDOMAIN",
            "COMPUTERNAME",
          ].flatMap((key) =>
            process.env[key] ? [[key, process.env[key]!]] : [],
          ),
        ),
        PATH: join(systemRoot, "System32"),
      },
    },
  );
  return collectWindowsWorkerResult(child, request, signal, diagnostic);
};

export class WindowsComputer {
  private observations = new Map<string, ComputerObservation>();
  private consumed = new Set<string>();
  private busy = false;
  private verified = false;
  private configurationError = "";
  readonly policy: ComputerPolicy;
  constructor(
    private store: Store,
    private options: {
      platform?: string;
      policy?: ComputerPolicy;
      transport?: NativeTransport;
      now?: () => number;
      diagnostic?: (message: string) => void;
    } = {},
  ) {
    try {
      const file = join(store.directory, "windows-policy.json");
      this.policy = WindowsPolicy.parse(
        options.policy ??
          (existsSync(file)
            ? JSON.parse(readFileSync(file, "utf8"))
            : { enabled: false, apps: [] }),
      );
      for (const app of this.policy.apps) {
        if (
          /(?:^|\\)(?:cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|python\d*|node|bash|wsl)\.exe$/i.test(
            app.executable,
          )
        )
          throw new Error(
            "Command interpreters cannot be authorized as desktop applications.",
          );
      }
    } catch {
      this.policy = { enabled: false, apps: [] };
      this.configurationError =
        "Invalid windows-policy.json; native execution is disabled.";
    }
  }
  status(): ComputerStatus {
    const platform = this.options.platform ?? process.platform;
    const available =
      platform === "win32" && this.policy.enabled && !this.configurationError;
    return {
      platform,
      enabled: this.policy.enabled,
      available,
      verifiedThisSession: this.verified,
      reason:
        this.configurationError ||
        (platform !== "win32"
          ? "Native Windows control requires a Windows machine; this host cannot control your PC."
          : !this.policy.enabled
            ? "Windows control is disabled. Review a local application policy before testing."
            : this.verified
              ? "A native observation succeeded in this service session. Individual actions still require verification."
              : "Adapter configured; native observation and input are not yet verified."),
      apps: this.policy.apps.map(({ id, name, allowLaunch, actions }) => ({
        id,
        name,
        allowLaunch,
        actions,
      })),
    };
  }
  observation(id: string, scope: string): ComputerObservation {
    const observation = this.observations.get(id);
    if (!observation || observation.projectId !== scope)
      throw new Error(
        "Observation is unavailable in this project or service session. Observe again.",
      );
    if (Date.parse(observation.expiresAt) < this.now())
      throw new Error(
        "Observation expired. Capture a fresh observation and request a new approval.",
      );
    return observation;
  }
  private now() {
    return (this.options.now ?? Date.now)();
  }
  async execute(
    command: Exclude<ComputerCommand, { kind: "vision" }>,
    projectId: string,
    taskId: string,
    signal: AbortSignal,
    progress: (message: string) => void,
  ) {
    if (!this.status().available) throw new Error(this.status().reason);
    if (this.busy) throw new Error("Another desktop operation is in progress.");
    signal.throwIfAborted();
    const before =
      command.kind === "act"
        ? this.observation(command.observationId, projectId)
        : undefined;
    const app = this.policy.apps.find(
      (a) => a.id === (before?.app ?? (command as { app: string }).app),
    );
    if (!app)
      throw new Error("Application is not in the local Windows allowlist.");
    if (command.kind === "launch" && !app.allowLaunch)
      throw new Error(
        "Application launch is not permitted by the local policy.",
      );
    if (command.kind === "act") {
      if (this.consumed.has(command.observationId))
        throw new Error(
          "This observation has already authorized an action. Observe again; inputs are never replayed.",
        );
      if (!app.actions.includes(command.action.kind))
        throw new Error("Action is not permitted for this application.");
      if (command.action.kind !== "focus") {
        const elementId = command.action.elementId;
        const element = before!.window.elements.find((e) => e.id === elementId);
        if (!element || element.password || !element.enabled)
          throw new Error(
            "Target must be a visible, enabled, non-password element from the observation.",
          );
      }
      if (
        command.expect &&
        !before!.window.elements.some(
          (e) => e.id === command.expect!.elementId && !e.password,
        )
      )
        throw new Error(
          "Postcondition must reference a non-password element in the observation.",
        );
      if (command.expect) {
        const element = before!.window.elements.find(
          (e) => e.id === command.expect!.elementId,
        )!;
        if (
          String(element[command.expect.property] ?? "") ===
          command.expect.equals
        )
          throw new Error(
            "Postcondition already holds. Choose evidence of an actual change.",
          );
      }
      this.consumed.add(command.observationId);
    }
    this.busy = true;
    this.store.put("computer_receipt", taskId, {
      taskId,
      app: app.id,
      kind: command.kind,
      state: "dispatched",
      at: new Date(this.now()).toISOString(),
      warning:
        "Dispatch is not proof of execution. Interrupted actions must not be replayed.",
    });
    progress(
      `Windows ${command.kind}: dispatching approved operation to ${app.name}`,
    );
    try {
      const native = await (this.options.transport ?? runWindowsWorker)(
        { command, executable: app.executable, before: before?.window },
        signal,
        this.options.diagnostic,
      );
      signal.throwIfAborted();
      const window = WindowEvidence.parse(native.window);
      if (window.executable.toLowerCase() !== app.executable.toLowerCase())
        throw new Error(
          "Observed process does not match the authorized executable.",
        );
      if (command.kind === "act") {
        if (
          window.windowId !== before!.window.windowId ||
          window.processId !== before!.window.processId ||
          window.processStartedAt !== before!.window.processStartedAt
        )
          throw new Error("Action evidence changed process identity.");
        if (command.action.kind === "focus" && !window.foreground)
          throw new Error("Foreground activation was not verified.");
        if (command.action.kind === "setText") {
          const action = command.action;
          if (
            !window.elements.some(
              (e) =>
                e.id === action.elementId &&
                !e.password &&
                e.value === action.text,
            )
          )
            throw new Error(
              "Written text did not match UI Automation read-back.",
            );
        }
        if (command.expect) {
          const expected = command.expect;
          if (
            !window.elements.some(
              (e) =>
                e.id === expected.elementId &&
                !e.password &&
                String(e[expected.property] ?? "") === expected.equals,
            )
          )
            throw new Error(
              "Action postcondition did not match fresh evidence.",
            );
        }
      }
      const png = Buffer.from(native.png, "base64");
      if (
        png.length < 24 ||
        png.length > 10 * 1024 * 1024 ||
        png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
      )
        throw new Error("Invalid screenshot evidence.");
      const id = randomUUID(),
        screenshot = `${id}.png`;
      await writeFile(
        join(this.store.directory, "artifacts", screenshot),
        png,
        { flag: "wx", mode: 0o600 },
      );
      signal.throwIfAborted();
      const observation: ComputerObservation = {
        id,
        app: app.id,
        projectId,
        observedAt: new Date(this.now()).toISOString(),
        expiresAt: new Date(this.now() + 120000).toISOString(),
        window,
        screenshot,
      };
      for (const [key, value] of this.observations)
        if (Date.parse(value.expiresAt) < this.now()) {
          this.observations.delete(key);
          this.consumed.delete(key);
        }
      this.observations.set(id, observation);
      this.verified = true;
      this.store.put("computer_receipt", taskId, {
        taskId,
        app: app.id,
        kind: command.kind,
        state: "verified",
        observationId: id,
        verification: native.verified,
        at: observation.observedAt,
      });
      progress(
        `Windows ${command.kind}: captured fresh evidence and verified the requested postcondition`,
      );
      return { observation, verification: native.verified };
    } catch (e) {
      this.store.put("computer_receipt", taskId, {
        taskId,
        app: app.id,
        kind: command.kind,
        state: "uncertain",
        at: new Date(this.now()).toISOString(),
        warning:
          "Outcome not verified. Observe again before requesting another action; no automatic retry.",
      });
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async image(observation: ComputerObservation) {
    return readFile(
      join(this.store.directory, "artifacts", observation.screenshot),
    );
  }
}
