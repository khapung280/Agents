const { EventEmitter } = require("node:events");
const { createHash, randomUUID } = require("node:crypto");
const { createReadStream } = require("node:fs");
const fs = require("node:fs/promises");
const { join, dirname } = require("node:path");
const { verifyRelease, compareVersions } = require("./update-trust.cjs");
const RELEASES = "https://github.com/khapung280/Agents/releases";
const LATEST = "https://api.github.com/repos/khapung280/Agents/releases/latest";
const INSTALLER = "Ultimate-Agents-Both-Setup.exe";
const HOSTS = new Set([
  "api.github.com",
  "github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function abortable(work, signal) {
  signal.throwIfAborted();
  let aborted;
  try {
    const cancellation = new Promise((_resolve, reject) => {
      aborted = () => reject(signal.reason);
      signal.addEventListener("abort", aborted, { once: true });
    });
    return await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return work();
      }),
      cancellation,
    ]);
  } finally {
    signal.removeEventListener("abort", aborted);
  }
}
function permittedUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !HOSTS.has(url.hostname)
  )
    throw new Error("Update URL is outside the restricted GitHub HTTPS hosts.");
  return url;
}
async function response(url, signal, transport) {
  for (let hops = 0; hops <= 5; hops++) {
    signal.throwIfAborted();
    const target = permittedUrl(url);
    const result = await transport(target.href, {
      redirect: "manual",
      credentials: "omit",
      signal,
      headers: {
        Accept:
          target.hostname === "api.github.com"
            ? "application/vnd.github+json"
            : "application/octet-stream",
        "User-Agent": "AGENTS-Updater/1",
      },
    });
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      await result.body?.cancel();
      const location = result.headers.get("location");
      if (!location) throw new Error("Update redirect has no destination.");
      url = new URL(location, target).href;
      continue;
    }
    if (!result.ok) {
      await result.body?.cancel();
      throw new Error(`GitHub update request failed (HTTP ${result.status}).`);
    }
    return result;
  }
  throw new Error("Too many update redirects.");
}
async function bytes(url, limit, signal, transport) {
  const result = await response(url, signal, transport);
  if (!result.body) throw new Error("Update response has no body.");
  const parts = [];
  let length = 0;
  for await (const chunk of result.body) {
    signal.throwIfAborted();
    length += chunk.length;
    if (length > limit)
      throw new Error("Update metadata exceeds its size limit.");
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}
async function privateDirectory(directory) {
  // The same OS user remains trusted, as for the application's data directory.
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (let path = directory; ; path = dirname(path)) {
    const stat = await fs.lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Update directory must not contain redirected paths.");
    if (dirname(path) === path) break;
  }
}
async function fileHash(path) {
  const stat = await fs.lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new Error("Update installer must be a private regular file.");
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > 300 * 1024 * 1024)
      throw new Error("Installer exceeds size limit.");
    hash.update(chunk);
  }
  return { size, sha256: hash.digest("hex") };
}
async function markInternetDownload(path, version) {
  if (process.platform !== "win32")
    throw new Error("Windows Internet-zone marking is unavailable.");
  const zone = `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${RELEASES}/download/v${version}/${INSTALLER}\r\n`;
  await fs.writeFile(path + ":Zone.Identifier", zone, { encoding: "utf8" });
  if ((await fs.readFile(path + ":Zone.Identifier", "utf8")) !== zone)
    throw new Error("Could not verify Windows Internet-zone metadata.");
}
class Updater extends EventEmitter {
  constructor({
    directory,
    currentVersion,
    platform = process.platform,
    transport = globalThis.fetch,
    verify = verifyRelease,
    markDownload = markInternetDownload,
    timeoutMs = 240000,
  }) {
    super();
    Object.assign(this, {
      directory,
      currentVersion,
      platform,
      transport,
      verify,
      markDownload,
      timeoutMs,
    });
    // Injection points are for isolated module tests, never renderer IPC input.
    this.state = {
      currentVersion,
      phase: platform === "win32" ? "idle" : "unavailable",
      message:
        platform === "win32"
          ? "Check for a signed GitHub release. Installation always needs approval."
          : "Installer updates are available in the Windows desktop application.",
    };
    this.record = {};
    this.initialized = false;
  }
  status() {
    return structuredClone(this.state);
  }
  publish(change) {
    this.state = { ...this.state, ...change };
    this.emit("status", this.status());
    return this.status();
  }
  async save() {
    await privateDirectory(this.directory);
    const temporary = join(this.directory, `state-${randomUUID()}.tmp`);
    await fs.writeFile(temporary, JSON.stringify(this.record) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    try {
      await fs.rename(temporary, join(this.directory, "state.json"));
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async initialize() {
    if (this.initialized) return this.status();
    try {
      await privateDirectory(this.directory);
      try {
        const path = join(this.directory, "state.json");
        const stat = await fs.lstat(path);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.nlink !== 1 ||
          stat.size > 4096
        )
          throw new Error("Invalid update history file.");
        const data = JSON.parse(await fs.readFile(path, "utf8"));
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          Object.keys(data).some(
            (key) =>
              !["highestVersion", "manifestHash", "pendingVersion"].includes(
                key,
              ),
          ) ||
          (data.highestVersion !== undefined &&
            (typeof data.highestVersion !== "string" ||
              !/^\d+\.\d+\.\d+$/.test(data.highestVersion))) ||
          (data.manifestHash !== undefined &&
            (typeof data.manifestHash !== "string" ||
              !/^[a-f0-9]{64}$/.test(data.manifestHash))) ||
          (data.pendingVersion !== undefined &&
            (typeof data.pendingVersion !== "string" ||
              !/^\d+\.\d+\.\d+$/.test(data.pendingVersion))) ||
          Boolean(data.highestVersion) !== Boolean(data.manifestHash)
        )
          throw new Error("Invalid update history; manual review is required.");
        this.record = data;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      for (const entry of await fs.readdir(this.directory, {
        withFileTypes: true,
      })) {
        if (
          !entry.isDirectory() ||
          !/^download-[a-zA-Z0-9]{6}$/.test(entry.name)
        )
          continue;
        const partial = join(this.directory, entry.name, INSTALLER + ".part");
        const stat = await fs.lstat(partial).catch((error) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        });
        if (stat?.isFile() && !stat.isSymbolicLink()) await fs.unlink(partial);
      }
      if (this.record.pendingVersion) {
        const installed = this.record.pendingVersion === this.currentVersion;
        this.publish({
          phase: installed ? "installed" : "failed",
          message: installed
            ? `Version ${this.currentVersion} started its local service successfully.`
            : "The previous installation has not become active. No installer was replayed. Review Windows prompts or use the retained previous version.",
        });
        delete this.record.pendingVersion;
        await this.save();
      }
      this.initialized = true;
    } catch (error) {
      this.publish({ phase: "failed", error: error.message });
      throw error;
    }
    return this.status();
  }
  async operation(phase, work) {
    if (this.active || this.handoffConsumed || this.platform !== "win32")
      return this.status();
    const abort = new AbortController();
    this.active = abort;
    const signal = AbortSignal.any([
      abort.signal,
      AbortSignal.timeout(
        phase === "checking" ? Math.min(this.timeoutMs, 30000) : this.timeoutMs,
      ),
    ]);
    this.publish({ phase, error: undefined, message: undefined });
    try {
      await this.initialize();
      await work(signal);
    } catch (error) {
      this.publish({
        phase:
          !this.shellDispatched && abort.signal.aborted
            ? "cancelled"
            : "failed",
        error:
          !this.shellDispatched && abort.signal.aborted
            ? undefined
            : error.message,
        message: this.shellDispatched
          ? "Windows installer handoff has an uncertain outcome. Review its prompts and restart AGENTS; no installer will be replayed."
          : abort.signal.aborted
            ? "Update cancelled. No installer was started."
            : "The update did not complete. The installed application and its data were retained.",
      });
    } finally {
      this.active = undefined;
    }
    return this.status();
  }
  async discardDownload() {
    this.installer = undefined;
    if (this.downloadDirectory) {
      const owned = this.downloadDirectory;
      this.downloadDirectory = undefined;
      await fs.rm(owned, { recursive: true, force: true });
    }
  }
  async check() {
    return this.operation("checking", async (signal) => {
      this.candidate = undefined;
      await this.discardDownload();
      const latest = JSON.parse(
        (await bytes(LATEST, 65536, signal, this.transport)).toString("utf8"),
      );
      if (
        latest.draft !== false ||
        latest.prerelease !== false ||
        typeof latest.tag_name !== "string" ||
        !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(latest.tag_name)
      )
        throw new Error("GitHub did not return a stable versioned release.");
      const base = `${RELEASES}/download/${latest.tag_name}`;
      const manifestBytes = await bytes(
        `${base}/agents-update.json`,
        32768,
        signal,
        this.transport,
      );
      const bundleBytes = await bytes(
        `${base}/agents-update.sigstore.json`,
        262144,
        signal,
        this.transport,
      );
      const manifest = await this.verify(manifestBytes, bundleBytes, {
        currentVersion: this.currentVersion,
        highestVersion: this.record.highestVersion,
      });
      signal.throwIfAborted();
      if (`v${manifest.version}` !== latest.tag_name)
        throw new Error(
          "Signed version differs from the requested GitHub release.",
        );
      const manifestHash = digest(manifestBytes);
      if (
        manifest.version === this.record.highestVersion &&
        this.record.manifestHash !== manifestHash
      )
        throw new Error(
          "This version's signed manifest changed; manual review is required.",
        );
      this.record.highestVersion = manifest.version;
      this.record.manifestHash = manifestHash;
      await this.save();
      const newer = compareVersions(manifest.version, this.currentVersion) > 0;
      this.candidate = { manifest, manifestBytes, bundleBytes, base };
      this.publish({
        phase: newer ? "available" : "current",
        version: manifest.version,
        notes: manifest.notes,
        total: manifest.installer.size,
        received: 0,
        sha256: manifest.installer.sha256,
        message: newer
          ? "GitHub build provenance verified. This installer has no Windows publisher certificate."
          : "The installed version matches the authenticated stable release.",
      });
    });
  }
  async download() {
    return this.operation("downloading", async (signal) => {
      const candidate = this.candidate;
      if (
        !candidate ||
        compareVersions(candidate.manifest.version, this.currentVersion) <= 0
      )
        throw new Error("Check for a newer authenticated release first.");
      await this.discardDownload();
      this.downloadDirectory = await fs.mkdtemp(
        join(this.directory, "download-"),
      );
      const partial = join(this.downloadDirectory, INSTALLER + ".part");
      let file;
      try {
        const result = await response(
          `${candidate.base}/${INSTALLER}`,
          signal,
          this.transport,
        );
        const expected = candidate.manifest.installer;
        const declared = result.headers.get("content-length");
        if (declared !== null && Number(declared) !== expected.size)
          throw new Error(
            "Installer response size does not match signed metadata.",
          );
        if (!result.body) throw new Error("Installer download has no body.");
        file = await fs.open(partial, "wx", 0o600);
        let received = 0,
          lastProgress = 0;
        const hash = createHash("sha256");
        for await (const chunk of result.body) {
          signal.throwIfAborted();
          received += chunk.length;
          if (received > expected.size)
            throw new Error("Installer exceeded its signed size.");
          hash.update(chunk);
          await file.writeFile(chunk);
          if (Date.now() - lastProgress > 100) {
            this.publish({ received, total: expected.size });
            lastProgress = Date.now();
          }
        }
        if (
          received !== expected.size ||
          hash.digest("hex") !== expected.sha256
        )
          throw new Error("Installer integrity verification failed.");
        signal.throwIfAborted();
        await file.sync();
        await file.close();
        file = undefined;
        this.installer = join(this.downloadDirectory, INSTALLER);
        await fs.rename(partial, this.installer);
        this.publish({
          phase: "ready",
          received,
          total: expected.size,
          message:
            "Download verified. Review installation to approve opening the unsigned installer with normal Windows security prompts.",
        });
      } catch (error) {
        await file?.close();
        await this.discardDownload();
        throw error;
      }
    });
  }
  async install(confirm, launch) {
    return this.operation("ready", async (signal) => {
      const candidate = this.candidate;
      if (
        !candidate ||
        !this.installer ||
        compareVersions(candidate.manifest.version, this.currentVersion) <= 0
      )
        throw new Error("A verified newer installer is required.");
      const reverify = async () => {
        await this.verify(candidate.manifestBytes, candidate.bundleBytes, {
          currentVersion: this.currentVersion,
          highestVersion: this.record.highestVersion,
        });
        const actual = await fileHash(this.installer);
        if (
          actual.size !== candidate.manifest.installer.size ||
          actual.sha256 !== candidate.manifest.installer.sha256
        )
          throw new Error(
            "Installer changed after download; installation refused.",
          );
        signal.throwIfAborted();
      };
      await reverify();
      if (
        !(await abortable(() => confirm(candidate.manifest, signal), signal))
      ) {
        this.publish({
          phase: "ready",
          message: "Installation was not approved. No installer was started.",
        });
        return;
      }
      await reverify();
      await this.markDownload(this.installer, candidate.manifest.version);
      signal.throwIfAborted();
      this.record.pendingVersion = candidate.manifest.version;
      await this.save();
      signal.throwIfAborted();
      // Once handoff begins no same-process replay is possible, even on uncertainty.
      this.handoffConsumed = true;
      const error = await abortable(
        () =>
          launch(this.installer, signal, () => {
            signal.throwIfAborted();
            this.shellDispatched = true;
          }),
        signal,
      );
      if (error)
        throw new Error(`Windows did not open the installer: ${error}`);
      this.publish({
        phase: "awaiting_restart",
        message:
          "Installer handed to Windows. Follow its prompts; installation is verified only when the new version starts successfully.",
      });
    });
  }
  cancel() {
    this.active?.abort();
    return this.status();
  }
}
module.exports = { Updater, permittedUrl, markInternetDownload, fileHash };
