import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { chromium } from "playwright";
import { allowedUrl } from "./security.js";
import { browserExecutable } from "./browser-path.js";
import { createApp } from "./app.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const directory = resolve(process.env.AGENTS_DATA_DIR || ".data");
const runtime = createApp({
  directory,
  hosts: (process.env.AGENTS_ALLOWED_HOSTS || "example.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  browserPath: browserExecutable(),
  browserNoSandbox: process.env.AGENTS_BROWSER_NO_SANDBOX === "1",
});
if (!process.argv.includes("--dev") && existsSync("dist/index.html")) {
  runtime.app.use(express.static(resolve("dist")));
  runtime.app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/index.html")),
  );
} else {
  runtime.app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; object-src 'none'; frame-ancestors 'none'",
    );
    next();
  });
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  runtime.app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4317);
runtime.server.listen(port, "127.0.0.1", () => {
  runtime.start();
  void (async () => {
    try {
      const hosts = runtime.engine.options.hosts;
      if (hosts.length) {
        await allowedUrl(`https://${hosts[0]}`, hosts);
        runtime.engine.options.browserReady = existsSync(
          runtime.engine.options.browserPath || chromium.executablePath(),
        );
        runtime.engine.changed();
      }
    } catch {
      /* Browser network prerequisites remain unavailable. */
    }
  })();
  console.log(
    `AGENTS OS listening on port ${port}. Pairing token: ${directory}/pairing-token (keep private).`,
  );
});
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  void runtime.close().then(() => process.exit(0));
};
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, shutdown);
process.on("disconnect", shutdown);
process.on("message", (message) => {
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "shutdown"
  )
    shutdown();
});
