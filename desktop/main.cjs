const { app, BrowserWindow, session, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { join } = require("node:path");
const { readFile } = require("node:fs/promises");
const { attachUpdates } = require("./update-bridge.cjs");
let service;
app.setName("ULTIMATE AGENTS — BOTH");
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const root = join(__dirname, "..");
      const directory =
        process.env.AGENTS_DESKTOP_DATA_DIR ||
        join(app.getPath("userData"), "agents-data");
      const port = Number(process.env.AGENTS_DESKTOP_PORT || 4318);
      const debug = (message) => {
        if (process.env.AGENTS_DESKTOP_DEBUG === "1")
          console.log(`Desktop: ${message}`);
      };
      const childEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(port),
        AGENTS_DATA_DIR: directory,
      };
      delete childEnv.NODE_OPTIONS;
      service = spawn(process.execPath, [join(root, "dist-server/index.js")], {
        cwd: root,
        env: childEnv,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      debug("service spawned");
      const origin = `http://127.0.0.1:${port}`;
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try {
          const res = await fetch(`${origin}/api/health`, {
            signal: AbortSignal.timeout(800),
          });
          if (res.ok) {
            ready = true;
            break;
          }
        } catch {
          /* service starting */
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      debug(`service readiness: ${ready}`);
      if (!ready)
        throw new Error(
          "Local service could not start. Inspect the service output.",
        );
      const token = (
        await readFile(join(directory, "pairing-token"), "utf8")
      ).trim();
      debug("pairing");
      const response = await fetch(`${origin}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("Desktop pairing failed.");
      debug("pairing complete");
      const cookie = response.headers
        .get("set-cookie")
        .match(/agents_session=([^;]+)/)[1];
      debug("setting session cookie");
      await session.defaultSession.cookies.set({
        url: origin,
        name: "agents_session",
        value: cookie,
        httpOnly: true,
        sameSite: "strict",
      });
      debug("cookie stored");
      session.defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback, details) =>
          callback(
            permission === "media" &&
              webContents.getURL().startsWith(origin + "/") &&
              !details.mediaTypes?.includes("video"),
          ),
      );
      const win = new BrowserWindow({
        width: 1560,
        height: 980,
        minWidth: 980,
        minHeight: 700,
        backgroundColor: "#070c13",
        title: "ULTIMATE AGENTS — BOTH",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          preload: join(__dirname, "preload.cjs"),
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(origin + "/")) event.preventDefault();
      });
      debug("window created");
      await attachUpdates({ win, origin, cookie, directory, service });
      await win.loadURL(origin);
    })
    .catch((error) => {
      console.error(error.message);
      dialog.showErrorBox("AGENTS could not start", error.message);
      app.quit();
    });
}
app.on("window-all-closed", () => app.quit());
let shutdownRequested = false;
app.on("before-quit", (event) => {
  if (!service || service.exitCode !== null || shutdownRequested) return;
  event.preventDefault();
  shutdownRequested = true;
  const timer = setTimeout(() => {
    service.kill();
    app.quit();
  }, 8000);
  service.once("exit", () => {
    clearTimeout(timer);
    app.quit();
  });
  if (service.connected) service.send({ type: "shutdown" });
  else service.kill();
});
