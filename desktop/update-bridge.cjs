const { app, ipcMain, dialog, shell } = require("electron");
const { join } = require("node:path");
const { Updater } = require("./updater.cjs");
function stopService(service, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    if (service.exitCode !== null) {
      if (service.exitCode === 0) resolve();
      else
        reject(
          new Error(
            "Local service did not shut down cleanly. Installer was not opened.",
          ),
        );
      return;
    }
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      service.removeListener("exit", exited);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    };
    const exited = (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(
              "Local service did not shut down cleanly. Installer was not opened.",
            ),
      );
    const aborted = () => finish(signal.reason);
    service.once("exit", exited);
    signal.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(
      () =>
        finish(
          new Error(
            "Local workers did not finish shutting down. Installer was not opened; close and restart AGENTS before retrying.",
          ),
        ),
      10000,
    );
    if (!service.connected)
      finish(
        new Error(
          "Local service cannot acknowledge shutdown. Installer was not opened.",
        ),
      );
    else
      service.send({ type: "shutdown" }, (error) => {
        if (error) finish(error);
      });
  });
}
async function attachUpdates({ win, origin, cookie, directory, service }) {
  const updater = new Updater({
    directory: join(directory, "updates"),
    currentVersion: require("../package.json").version,
    platform:
      process.platform === "win32" && !app.isPackaged
        ? "development"
        : process.platform,
  });
  // Called only after the current app's backend has become healthy and paired.
  await updater.initialize().catch(() => {
    /* Error is shown in update status; the app remains usable. */
  });
  updater.on("status", (status) => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed())
      win.webContents.send("agents:update:status", status);
  });
  const handlers = {
    status: () => updater.status(),
    check: () => updater.check(),
    download: () => updater.download(),
    cancel: () => updater.cancel(),
    install: () =>
      updater.install(
        async (release, signal) => {
          const response = await fetch(`${origin}/api/state`, {
            headers: { Cookie: `agents_session=${cookie}` },
            signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
          });
          if (!response.ok) throw new Error("Cannot verify local task status.");
          const state = await response.json();
          if (
            state.tasks.some((task) =>
              ["running", "planning", "queued"].includes(task.state),
            )
          )
            throw new Error(
              "Finish or stop active tasks before installing an update.",
            );
          const choice = await dialog.showMessageBox(win, {
            type: "warning",
            title: "Approve AGENTS update",
            message: `Open the verified installer for AGENTS ${release.version}?`,
            detail: `GitHub build provenance and SHA-256 were verified.\n\nThis installer is unsigned in Windows. SmartScreen, Defender and organization policy remain active. AGENTS will stop its local service, then close after Windows accepts the installer. Follow the installation prompts and reopen AGENTS from its desktop shortcut.\n\nYour data and permissions are retained. No new application permissions are granted.\n\nInstaller SHA-256:\n${release.installer.sha256}`,
            buttons: ["Cancel", "Approve and open installer"],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            signal,
          });
          return choice.response === 1;
        },
        async (path, signal, dispatched) => {
          // Close scheduler and drain workers before opening an installer. Cancellation
          // during shutdown must never dispatch a later Windows shell operation.
          await stopService(service, signal);
          signal.throwIfAborted();
          dispatched();
          // This uses ShellExecute with Internet-zone metadata retained. No silent
          // arguments, elevation, NOZONECHECKS or PowerShell security changes.
          const error = await shell.openPath(path);
          if (error)
            dialog.showErrorBox(
              "Windows did not open the update",
              `${error}\n\nYour previous version and data were retained. Reopen AGENTS from its shortcut.`,
            );
          setTimeout(() => app.quit(), error ? 1000 : 100);
          return error;
        },
      ),
  };
  for (const [name, handler] of Object.entries(handlers))
    ipcMain.handle(`agents:update:${name}`, (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame ||
        new URL(event.senderFrame.url).origin !== origin
      )
        throw new Error(
          "Update requests require the local main application frame.",
        );
      if (args.length)
        throw new Error("Update commands do not accept arguments.");
      return handler();
    });
  app.once("before-quit", () => updater.cancel());
  return updater;
}
module.exports = { attachUpdates };
