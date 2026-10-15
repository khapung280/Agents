import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  agentIds,
  type AgentId,
  type Memory,
  type Policy,
  type Project,
  type Schedule,
  type SystemEvent,
  type Task,
} from "../shared/contracts.js";

export class Store {
  db: DatabaseSync;
  constructor(public directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, "agents.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,task_id TEXT,agent TEXT,message TEXT NOT NULL,at TEXT NOT NULL);`);
    if (!this.get<Policy>("config", "policy"))
      this.put("config", "policy", {
        mode: "manual",
        stopped: false,
        maxConcurrent: 2,
        maxCallsPerAgent: 20,
        budgetUsd: 5,
        agents: Object.fromEntries(agentIds.map((a) => [a, true])),
      });
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  list<T>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid DESC")
        .all(kind) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  put(kind: string, id: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, id, JSON.stringify(value));
  }
  remove(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  event(type: string, message: string, task?: Pick<Task, "id" | "agent">) {
    this.db
      .prepare(
        "INSERT INTO events(type,task_id,agent,message,at) VALUES(?,?,?,?,?)",
      )
      .run(
        type,
        task?.id ?? null,
        task?.agent ?? null,
        message,
        new Date().toISOString(),
      );
  }
  events(): SystemEvent[] {
    return this.db
      .prepare(
        "SELECT id,type,task_id as taskId,agent,message,at FROM events ORDER BY id DESC LIMIT 100",
      )
      .all() as unknown as SystemEvent[];
  }
  policy() {
    return this.get<Policy>("config", "policy")!;
  }
  tasks() {
    return this.list<Task>("task");
  }
  memories() {
    return this.list<Memory>("memory");
  }
  projects() {
    return this.list<Project>("project");
  }
  schedules() {
    return this.list<Schedule>("schedule");
  }
  createProject(name: string, objective: string, repository = ""): Project {
    const p = {
      id: randomUUID(),
      name,
      objective,
      repository,
      milestones: [],
      createdAt: new Date().toISOString(),
    };
    this.put("project", p.id, p);
    return p;
  }
  agentUsage(agent: AgentId) {
    return this.tasks().filter((t) => t.agent === agent && t.usage).length;
  }
  close() {
    this.db.close();
  }
}
