import { request as httpRequest } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { createApp } from "../server/app.js";
import type { AddressInfo } from "node:net";

test("API session, CSRF, permissions, CRUD, realtime and emergency stop are server enforced", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agents-api-"));
  const runtime = createApp({ directory, pairingToken: "test-pairing-token" });
  await new Promise<void>((r) => runtime.server.listen(0, "127.0.0.1", r));
  runtime.start();
  const base = `http://127.0.0.1:${(runtime.server.address() as AddressInfo).port}`;
  let cookie = "";
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal((await request("/api/state")).status, 401);
    assert.equal(
      (await request("/api/session", "POST", { token: "wrong" })).status,
      401,
    );
    const login = await request("/api/session", "POST", {
      token: "test-pairing-token",
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(login.headers.get("set-cookie")!, /SameSite=Strict/);
    assert.equal(
      (
        await request(
          "/api/stop",
          "POST",
          {},
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    const badHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(
        base + "/api/state",
        { headers: { Host: "evil.example", Cookie: cookie } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(badHost, 403);
    assert.equal(
      (
        await request("/api/tasks", "POST", {
          agent: "supervisor",
          tool: "workspace.write",
          objective: "Write file",
        })
      ).status,
      400,
    );
    const state = await (await request("/api/state")).json();
    assert.equal(state.agents.length, 10);
    assert.equal(JSON.stringify(state).includes("test-pairing-token"), false);
    const memory = await (
      await request("/api/memories", "POST", {
        scope: "personal",
        category: "preference",
        title: "Tone",
        content: "Concise",
      })
    ).json();
    assert.ok(memory.id);
    assert.equal(
      (
        await request(`/api/memories/${memory.id}`, "PATCH", {
          scope: "personal",
          category: "preference",
          title: "Tone",
          content: "Detailed",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/api/memories/${memory.id}`, "DELETE")).status,
      200,
    );
    const snapshot = await new Promise<{ agents: unknown[] }>(
      (resolve, reject) => {
        const ws = new WebSocket(base.replace("http:", "ws:") + "/events", {
          headers: { Cookie: cookie, Origin: base },
        });
        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error("No websocket snapshot"));
        }, 3000);
        ws.on("message", (data) => {
          clearTimeout(timeout);
          resolve(JSON.parse(data.toString()));
          ws.close();
        });
        ws.on("error", reject);
      },
    );
    assert.equal(snapshot.agents.length, 10);
    const stopped = await request("/api/stop", "POST", {});
    assert.equal(stopped.status, 200);
    assert.equal(
      (await request("/api/tasks", "POST", { objective: "Create plan" }))
        .status,
      400,
    );
    await request("/api/resume", "POST", {});
    assert.equal(
      (await request("/api/tasks", "POST", { objective: "Create plan" }))
        .status,
      201,
    );
    await request("/api/logout", "POST", {});
    assert.equal((await request("/api/state")).status, 401);
  } finally {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});
