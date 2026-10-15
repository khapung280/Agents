import express from "express";
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import {
  MemoryInput,
  PolicyInput,
  ProjectInput,
  ScheduleInput,
  type Memory,
  type Schedule,
} from "../shared/contracts.js";
import { Store } from "./store.js";
import { Engine } from "./engine.js";

export function createApp(options: {
  directory: string;
  pairingToken?: string;
  hosts?: string[];
  browserPath?: string;
  browserNoSandbox?: boolean;
  runner?: ConstructorParameters<typeof Engine>[1]["runner"];
}) {
  const store = new Store(options.directory);
  const engine = new Engine(store, {
    hosts: options.hosts ?? ["example.com"],
    browserPath: options.browserPath,
    browserNoSandbox: options.browserNoSandbox,
    runner: options.runner,
  });
  const tokenFile = join(options.directory, "pairing-token");
  const pairingToken =
    options.pairingToken ??
    (existsSync(tokenFile)
      ? readFileSync(tokenFile, "utf8").trim()
      : randomBytes(32).toString("hex"));
  if (!options.pairingToken && !existsSync(tokenFile))
    writeFileSync(tokenFile, pairingToken, { mode: 0o600 });
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { count: number; until: number }>();
  const createSession = () => {
    const id = randomBytes(32).toString("hex");
    sessions.set(id, Date.now() + 12 * 60 * 60 * 1000);
    return id;
  };
  const validSession = (cookie?: string) => {
    const id = cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("agents_session="))
      ?.slice(15);
    return !!id && (sessions.get(id) ?? 0) > Date.now();
  };
  const validHost = (host?: string) =>
    !!host && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  const validOrigin = (origin: string | undefined, host: string | undefined) =>
    !origin || origin === `http://${host}`;
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    );
    if (
      !validHost(req.headers.host) ||
      !validOrigin(req.headers.origin, req.headers.host)
    )
      return res.status(403).json({ error: "Untrusted host or origin." });
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", application: "AGENTS OS" }),
  );
  app.post("/api/session", (req, res) => {
    const ip = req.socket.remoteAddress ?? "local";
    let entry = attempts.get(ip);
    if (!entry || entry.until < Date.now()) {
      entry = { count: 0, until: Date.now() + 60000 };
      attempts.set(ip, entry);
    }
    if (++entry.count > 10)
      return res
        .status(429)
        .json({ error: "Too many pairing attempts; wait one minute." });
    const token = z
      .object({ token: z.string().max(256) })
      .parse(req.body).token;
    const a = Buffer.from(token),
      b = Buffer.from(pairingToken);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return res.status(401).json({ error: "Pairing token is incorrect." });
    const session = createSession();
    res.setHeader(
      "Set-Cookie",
      `agents_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
    );
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    if (!validSession(req.headers.cookie))
      return res
        .status(401)
        .json({ error: "Pair this browser using the local pairing token." });
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/state", (_req, res) => res.json(engine.snapshot()));
  app.post("/api/logout", (req, res) => {
    const id = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("agents_session="))
      ?.slice(15);
    if (id) sessions.delete(id);
    res.setHeader(
      "Set-Cookie",
      "agents_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.json({ ok: true });
  });
  app.post("/api/tasks", (req, res) => {
    const key = req.headers["idempotency-key"];
    if (key && !z.string().min(1).max(100).safeParse(key).success)
      throw new Error("Invalid idempotency key.");
    if (
      store
        .tasks()
        .filter(
          (t) =>
            !["completed", "failed", "cancelled", "blocked"].includes(t.state),
        ).length > 100
    )
      throw new Error("Queue capacity reached.");
    const task = engine.submit(
      req.body,
      typeof key === "string" ? key : undefined,
    );
    res.status(201).json(task);
  });
  app.post("/api/workflows", (req, res) => {
    if (
      store
        .tasks()
        .filter(
          (t) =>
            !["completed", "failed", "cancelled", "blocked"].includes(t.state),
        ).length > 100
    )
      throw new Error("Queue capacity reached.");
    const key = z
      .string()
      .max(100)
      .optional()
      .parse(req.headers["idempotency-key"]);
    res.status(201).json(engine.submitWorkflow(req.body, key));
  });
  app.post("/api/tasks/:id/cancel", (req, res) => {
    engine.cancel(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/tasks/:id/retry", (req, res) =>
    res.status(201).json(engine.retry(req.params.id)),
  );
  app.post("/api/approvals/:id", (req, res) => {
    engine.approve(
      req.params.id,
      z.object({ approve: z.boolean() }).parse(req.body).approve,
    );
    res.json({ ok: true });
  });
  app.patch("/api/policy", (req, res) =>
    res.json(engine.setPolicy(PolicyInput.parse(req.body))),
  );
  app.post("/api/stop", (_req, res) => {
    engine.stop();
    res.json({ ok: true });
  });
  app.post("/api/resume", (_req, res) => {
    engine.resume();
    res.json({ ok: true });
  });
  app.post("/api/memories", (req, res) => {
    const input = MemoryInput.parse(req.body);
    if (input.scope !== "personal" && !store.get("project", input.scope))
      throw new Error("Unknown memory scope.");
    if (
      store
        .memories()
        .some(
          (m) =>
            m.scope === input.scope &&
            m.title === input.title &&
            m.content === input.content,
        )
    )
      throw new Error("This memory already exists in the selected scope.");
    const memory = {
      ...input,
      id: randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    store.put("memory", memory.id, memory);
    engine.event("memory.created", `Memory added to ${memory.scope}`);
    res.status(201).json(memory);
  });
  app.patch("/api/memories/:id", (req, res) => {
    const old = store.get<Memory>("memory", req.params.id);
    if (!old) return res.status(404).json({ error: "Memory not found." });
    const input = MemoryInput.parse(req.body);
    if (input.scope !== "personal" && !store.get("project", input.scope))
      throw new Error("Unknown memory scope.");
    const memory = { ...old, ...input, updatedAt: new Date().toISOString() };
    store.put("memory", old.id, memory);
    engine.event("memory.updated", `Memory corrected in ${memory.scope}`);
    res.json(memory);
  });
  app.delete("/api/memories/:id", (req, res) => {
    store.remove("memory", req.params.id);
    engine.event("memory.deleted", "Owner deleted a memory");
    res.json({ ok: true });
  });
  app.post("/api/projects", (req, res) => {
    const input = ProjectInput.parse(req.body);
    const p = store.createProject(
      input.name,
      input.objective,
      input.repository,
    );
    engine.event("project.created", p.name);
    res.status(201).json(p);
  });
  app.patch("/api/projects/:id", (req, res) => {
    const p = store.projects().find((p) => p.id === req.params.id);
    if (!p) return res.status(404).json({ error: "Project not found." });
    const data = z
      .object({ milestones: z.array(z.string().min(1).max(500)).max(50) })
      .parse(req.body);
    p.milestones = data.milestones;
    store.put("project", p.id, p);
    engine.event("project.updated", p.name);
    res.json(p);
  });
  app.post("/api/schedules", (req, res) => {
    const input = ScheduleInput.parse(req.body);
    if (Date.parse(input.nextRun) < Date.now() - 1000)
      throw new Error("Choose a future schedule time.");
    const schedule = {
      ...input,
      id: randomUUID(),
      paused: false,
      lastTaskId: null,
    };
    store.put("schedule", schedule.id, schedule);
    engine.event("schedule.created", schedule.name);
    res.status(201).json(schedule);
  });
  app.patch("/api/schedules/:id", (req, res) => {
    const s = store.get<Schedule>("schedule", req.params.id);
    if (!s) return res.status(404).json({ error: "Schedule not found." });
    s.paused = z.object({ paused: z.boolean() }).parse(req.body).paused;
    store.put("schedule", s.id, s);
    engine.event(
      "schedule.updated",
      `${s.name}: ${s.paused ? "paused" : "enabled"}`,
    );
    res.json(s);
  });
  app.delete("/api/schedules/:id", (req, res) => {
    store.remove("schedule", req.params.id);
    store.remove("schedule_claim", req.params.id);
    engine.event("schedule.deleted", "Schedule removed");
    res.json({ ok: true });
  });
  app.get("/api/artifacts/:file", (req, res) => {
    const file = req.params.file;
    if (
      !/^[a-f0-9-]+\.png$/.test(file) ||
      !store.tasks().some((t) => t.output.some((a) => a.path === file))
    )
      return res.status(404).end();
    res.sendFile(resolve(options.directory, "artifacts", file));
  });
  const socketCookies = new WeakMap<WebSocket, string | undefined>();
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/events" ||
      !validHost(req.headers.host) ||
      !validOrigin(req.headers.origin, req.headers.host) ||
      !validSession(req.headers.cookie)
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      socketCookies.set(ws, req.headers.cookie);
      ws.send(JSON.stringify(engine.snapshot()));
      ws.on("error", () => ws.close());
    });
  });
  const sessionTimer = setInterval(() => {
    for (const ws of wss.clients)
      if (!validSession(socketCookies.get(ws)))
        ws.close(1008, "Session expired");
  }, 10000);
  let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  engine.on("change", () => {
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = undefined;
      const payload = JSON.stringify(engine.snapshot());
      for (const ws of wss.clients) {
        if (
          validSession(socketCookies.get(ws)) &&
          ws.readyState === WebSocket.OPEN &&
          ws.bufferedAmount < 1000000
        )
          ws.send(payload);
        else ws.close();
      }
    }, 35);
  });
  const errorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(";")
        : err instanceof Error
          ? err.message
          : "Request failed";
    res.status(400).json({ error: message });
  };
  app.use("/api", errorHandler);
  return {
    app,
    server,
    store,
    engine,
    createSession,
    start: () => engine.start(),
    close: async () => {
      clearInterval(sessionTimer);
      if (broadcastTimer) clearTimeout(broadcastTimer);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await engine.close();
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
    },
  };
}
