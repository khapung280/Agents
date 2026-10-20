import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { NotepadRequest, type TestDocument } from "../../shared/notepad.js";
import type { Task } from "../../shared/contracts.js";
import type { ComputerObservation } from "../../shared/computer.js";
import type { Store } from "../store.js";
import { scopedPath } from "../security.js";
import type { WindowsComputer, NativeDocument } from "./windows.js";
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export class NotepadTests {
  private busy = new Set<string>();
  constructor(
    private store: Store,
    private computer: WindowsComputer,
  ) {
    this.blockAll(
      "Service restarted. No document operation will replay; begin a new disposable test.",
    );
  }
  list() {
    return this.store.list<TestDocument>("testDocument");
  }
  blockAll(reason: string) {
    for (const document of this.list())
      if (!["saved", "blocked"].includes(document.state)) {
        document.state = "blocked";
        document.error = reason;
        this.save(document);
      }
  }
  private save(document: TestDocument) {
    this.store.put("testDocument", document.id, document);
  }
  private async file(document: TestDocument) {
    const path = await scopedPath(
      join(this.store.directory, "workspace"),
      "notepad-tests/" + document.id + "/" + document.name,
    );
    if (path !== document.path)
      throw new Error("Registered document path changed.");
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.size > 4096
    )
      throw new Error(
        "Test document must remain a small, private, regular file.",
      );
    return await readFile(path);
  }
  async run(
    task: Task,
    signal: AbortSignal,
    progress: (message: string) => void,
  ) {
    if (task.tool !== "notepad.test" || task.approval !== "consumed")
      throw new Error("Each Notepad step requires its own consumed approval.");
    const command = NotepadRequest.parse(task.input.notepad);
    signal.throwIfAborted();
    if (command.kind === "prepare") {
      const app = this.computer.policy.apps.find(
        (app) => app.id === command.app,
      );
      if (
        !app?.allowLaunch ||
        !app.allowTestDocuments ||
        !/\\notepad\.exe$/i.test(app.executable)
      )
        throw new Error(
          "Allowlist the exact Notepad executable with launch and test-document permissions first.",
        );
      const id = randomUUID(),
        name = "agents-" + id + ".txt";
      const base = await scopedPath(
        join(this.store.directory, "workspace"),
        "notepad-tests",
      );
      await mkdir(base, { recursive: true, mode: 0o700 });
      const directory = await scopedPath(
        join(this.store.directory, "workspace"),
        "notepad-tests/" + id,
      );
      await mkdir(directory, { mode: 0o700 });
      const path = join(directory, name);
      await writeFile(path, "", { flag: "wx", mode: 0o600 });
      signal.throwIfAborted();
      const document: TestDocument = {
        id,
        app: app.id,
        projectId: task.input.projectId,
        text: command.text,
        expectedSha256: hash(command.text),
        path,
        name,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
        state: "prepared",
        taskIds: [task.id],
      };
      this.save(document);
      if ((await this.file(document)).length !== 0)
        throw new Error("Prepared document was not empty on read-back.");
      return {
        document,
        verification:
          "Created and read back one empty app-owned test file. No application launch or input occurred.",
      };
    }
    const document = this.store.get<TestDocument>(
      "testDocument",
      command.documentId,
    );
    if (!document || document.projectId !== task.input.projectId)
      throw new Error("Test document is unavailable in this project.");
    if (
      ["blocked", "saved"].includes(document.state) ||
      this.busy.has(document.id)
    )
      throw new Error(
        "Document is completed, blocked, or busy; no replay is permitted.",
      );
    if (Date.parse(document.expiresAt) <= Date.now()) {
      document.state = "blocked";
      document.error =
        "Ten-minute document deadline expired. Begin a new test.";
      this.save(document);
      throw new Error(document.error);
    }
    this.busy.add(document.id);
    document.taskIds.push(task.id);
    this.save(document);
    const deadline = AbortSignal.timeout(
      Math.max(1, Date.parse(document.expiresAt) - Date.now()),
    );
    const bounded = AbortSignal.any([signal, deadline]);
    try {
      const bytes = await this.file(document);
      if (bytes.length !== 0)
        throw new Error(
          "Test file changed before the approved save. No existing content will be overwritten.",
        );
      const metadata: NativeDocument = {
        path: document.path,
        name: document.name,
        expectedText: document.state === "written" ? document.text : "",
      };
      let outcome: { observation: ComputerObservation; verification: string };
      const execute = (native: Parameters<WindowsComputer["execute"]>[0]) =>
        this.computer.execute(
          native,
          document.projectId,
          task.id,
          bounded,
          progress,
          metadata,
        );
      if (command.kind === "launch") {
        if (document.state !== "prepared")
          throw new Error(
            "This document was already launched; it cannot launch twice.",
          );
        outcome = await execute({ kind: "launch", app: document.app });
        document.state = "launched";
      } else {
        const prior = document.lastObservation;
        if (!prior || document.state === "prepared")
          throw new Error("Launch this registered document first.");
        if (command.kind === "observe") {
          outcome = await execute({
            kind: "observe",
            app: document.app,
            windowId: prior.window.windowId,
          });
        } else {
          if (command.observationId !== prior.id)
            throw new Error(
              "Use the document's latest observation; actions never replay an older checkpoint.",
            );
          const observation = this.computer.observation(
            command.observationId,
            task.input.projectId,
          );
          const candidates = observation.window.elements.filter(
            (e) =>
              ["ControlType.Edit", "ControlType.Document"].includes(
                e.controlType,
              ) &&
              e.enabled &&
              !e.password &&
              e.value != null,
          );
          if (
            candidates.length !== 1 ||
            candidates[0].id !== command.elementId ||
            candidates[0].value !== metadata.expectedText
          )
            throw new Error(
              "Expected exactly one document editor with the approved current text; controls are ambiguous or changed.",
            );
          const target = candidates[0];
          metadata.elementId = target.id;
          if (command.kind === "focus") {
            if (!observation.window.foreground)
              outcome = await execute({
                kind: "act",
                observationId: prior.id,
                action: { kind: "focus" },
              });
            else if (!target.focused)
              outcome = await execute({
                kind: "act",
                observationId: prior.id,
                action: { kind: "click", elementId: target.id },
                expect: {
                  elementId: target.id,
                  property: "focused",
                  equals: "true",
                },
              });
            else
              throw new Error("Editor is already focused. No input is needed.");
          } else if (command.kind === "write") {
            if (
              document.state !== "launched" ||
              !observation.window.foreground ||
              !target.focused
            )
              throw new Error(
                "Focus the empty registered editor before requesting one approved write.",
              );
            outcome = await execute({
              kind: "act",
              observationId: prior.id,
              action: {
                kind: "typeText",
                elementId: target.id,
                text: document.text,
              },
              expect: {
                elementId: target.id,
                property: "value",
                equals: document.text,
              },
            });
            document.state = "written";
          } else {
            if (
              document.state !== "written" ||
              !observation.window.foreground ||
              !target.focused
            )
              throw new Error(
                "Save requires a focused editor with verified approved text.",
              );
            outcome = await execute({
              kind: "saveDocument",
              observationId: prior.id,
              elementId: target.id,
            });
            progress(
              "Verifying: save dispatched once; checking registered file bytes",
            );
            const end = Date.now() + 3000;
            let saved: Buffer | undefined;
            do {
              bounded.throwIfAborted();
              const value = await this.file(document);
              // Empty files are launched as UTF-8. Refuse unexpected encoding/BOM or content.
              if (hash(value) === document.expectedSha256) {
                saved = value;
                break;
              }
              await delay(100, undefined, { signal: bounded });
            } while (Date.now() < end);
            if (!saved)
              throw new Error(
                "Save was not verified by exact UTF-8 bytes/hash within three seconds. No retry or Save As automation.",
              );
            document.savedSha256 = hash(saved);
            document.state = "saved";
          }
        }
        if (
          outcome.observation.window.windowId !== prior.window.windowId ||
          outcome.observation.window.processId !== prior.window.processId ||
          outcome.observation.window.processStartedAt !==
            prior.window.processStartedAt
        )
          throw new Error("Registered document process identity changed.");
      }
      bounded.throwIfAborted();
      document.lastObservation = outcome.observation;
      this.save(document);
      return {
        document,
        observation: outcome.observation,
        verification:
          document.state === "saved"
            ? "PASS: approved text matched fresh UI Automation evidence and exact saved UTF-8 file SHA-256. This verifies this document only."
            : outcome.verification,
      };
    } catch (error) {
      document.state = "blocked";
      document.error = error instanceof Error ? error.message : String(error);
      this.save(document);
      throw error;
    } finally {
      this.busy.delete(document.id);
    }
  }
}
