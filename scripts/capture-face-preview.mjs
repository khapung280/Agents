// Capture the real built dashboard; no model, microphone, native PC input or task submission.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "artifacts");
const temporary = await mkdtemp(join(tmpdir(), "agents-face-capture-"));
const dataDirectory = join(temporary, "runtime");
const startedAt = new Date().toISOString();
const states = [
  "idle",
  "listening",
  "thinking",
  "planning",
  "observing",
  "delegating",
  "executing",
  "speaking",
  "verifying",
  "success",
  "error",
  "approval",
];
const historyKeys = [
  "tasks",
  "events",
  "memories",
  "projects",
  "schedules",
  "reasoningSessions",
  "testDocuments",
  "screenGrants",
  "policy",
  "metrics",
];
const safeEnvironment = Object.fromEntries(
  [
    "PATH",
    "Path",
    "HOME",
    "USER",
    "LOGNAME",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "SystemRoot",
    "WINDIR",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "TEMP",
    "TMP",
    "TMPDIR",
    "DISPLAY",
    "XAUTHORITY",
    "XDG_RUNTIME_DIR",
    "LANG",
    "LC_ALL",
  ].flatMap((key) =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]],
  ),
);
let service, browser, context, serviceError, overallTimer;
let serviceOutput = "";
let expired = false;
const samples = [],
  browserErrors = [],
  refusedRequests = [];

async function freePort() {
  const reservation = createServer();
  await new Promise((resolvePromise, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolvePromise);
  });
  const port = reservation.address().port;
  await new Promise((resolvePromise, reject) =>
    reservation.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return port;
}
function browserPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const candidates =
    process.platform === "win32"
      ? [
          join(
            process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          join(
            process.env.ProgramFiles || "C:\\Program Files",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          join(
            process.env.ProgramFiles || "C:\\Program Files",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
        ]
      : ["/usr/bin/chromium"];
  return candidates.find((path) => existsSync(path));
}
async function waitForService(origin) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (serviceError) throw serviceError;
    if (service.exitCode !== null || service.signalCode !== null)
      throw new Error("Preview service exited: " + serviceOutput);
    try {
      const response = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && existsSync(join(dataDirectory, "pairing-token")))
        return;
    } catch {
      /* Bounded startup polling; no other app's data is used. */
    }
    await delay(100);
  }
  throw new Error("Preview service did not start within 20 seconds.");
}
async function snapshot(page) {
  const response = await page.request.get("/api/state");
  assert.equal(response.status(), 200, "Isolated owner session is paired");
  return response.json();
}
async function metrics(page, label) {
  const value = await page
    .getByLabel("Face render measurements", { exact: true })
    .evaluate((element) => {
      const serialized = element.getAttribute("data-metrics");
      return serialized ? JSON.parse(serialized) : null;
    });
  assert.ok(
    value && value.frames > 0 && Number.isFinite(value.fps),
    "Actual renderer measurements are available",
  );
  samples.push({
    label,
    capturedAt: new Date().toISOString(),
    viewport: page.viewportSize(),
    ...value,
  });
}
async function pngReceipt(path, width, height) {
  const bytes = await readFile(path);
  assert.equal(
    bytes.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    "Valid PNG signature",
  );
  assert.equal(bytes.readUInt32BE(16), width, "Exact PNG pixel width");
  assert.equal(bytes.readUInt32BE(20), height, "Exact PNG pixel height");
  return {
    width,
    height,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
async function capture() {
  assert.ok(
    existsSync(join(root, "dist/index.html")) &&
      existsSync(join(root, "dist-server/index.js")),
    "Build the application first with npm run build.",
  );
  // Isolated cwd prevents the server from loading a developer's .env.
  await symlink(
    join(root, "dist"),
    join(temporary, "dist"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  service = spawn(process.execPath, [join(root, "dist-server/index.js")], {
    cwd: temporary,
    env: {
      ...safeEnvironment,
      PORT: String(port),
      AGENTS_DATA_DIR: dataDirectory,
      AGENTS_ALLOWED_HOSTS: " ",
    },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  service.on("error", (error) => {
    serviceError = error;
  });
  for (const stream of [service.stdout, service.stderr])
    stream.on("data", (chunk) => {
      serviceOutput = (serviceOutput + chunk.toString()).slice(-8000);
    });
  await waitForService(origin);
  const isolated = process.env.AGENTS_ISOLATED_BROWSER_TEST === "1";
  browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
    env: safeEnvironment,
    timeout: 25000,
    args: [
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      ...(isolated
        ? [
            "--no-sandbox",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ]
        : []),
    ],
  });
  context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    recordVideo: {
      dir: join(temporary, "recording"),
      size: { width: 1920, height: 1080 },
    },
  });
  context.setDefaultTimeout(15000);
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      refusedRequests.push({ origin: url.origin, method: request.method() });
      await route.abort();
    } else await route.continue();
  });
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.protocol === "ws:" && url.host === new URL(origin).host)
      socket.connectToServer();
    else {
      refusedRequests.push({ origin: url.origin, method: "WEBSOCKET" });
      socket.close();
    }
  });
  const token = (
    await readFile(join(dataDirectory, "pairing-token"), "utf8")
  ).trim();
  // Pair once outside the page routing layer; all subsequent page writes are blocked.
  const paired = await context.request.post(origin + "/api/session", {
    data: { token },
  });
  assert.equal(paired.status(), 200, "Preview session pairing succeeded");
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator(".core-panel canvas").waitFor();
  assert.equal(
    await page.locator(".orbit-node").count(),
    10,
    "All ten real agent nodes are present",
  );
  const before = await snapshot(page);
  assert.equal(
    before.provider.configured,
    false,
    "No model credentials are inherited",
  );
  assert.equal(
    before.tasks.length,
    0,
    "Fresh capture has no artificial task history",
  );
  await delay(6000);
  await metrics(page, "live idle / 1920x1080");
  const desktopPng = join(temporary, "dashboard-1920x1080.png");
  await page.screenshot({ path: desktopPng, fullPage: false });
  await page
    .getByText("Animation Preview & render metrics", { exact: true })
    .click();
  await page.getByLabel("Animation Preview Mode", { exact: true }).check();
  for (const state of states) {
    if (expired) throw new Error("Animation capture deadline exceeded.");
    await page.getByLabel("Preview state", { exact: true }).selectOption(state);
    assert.ok(
      (await page.locator(".face-preview-notice").innerText()).includes(
        "VISUAL PREVIEW",
      ),
    );
    await delay(2300);
    await metrics(page, "visual preview / " + state);
  }
  await page.getByLabel("Animation Preview Mode", { exact: true }).uncheck();
  await page
    .getByText("Animation Preview & render metrics", { exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await delay(4000);
  await metrics(page, "live idle / 1440x900");
  const laptopPng = join(temporary, "dashboard-1440x900.png");
  await page.screenshot({ path: laptopPng, fullPage: false });
  const after = await snapshot(page);
  for (const key of historyKeys)
    assert.deepEqual(after[key], before[key], `Preview did not modify ${key}`);
  assert.equal(
    refusedRequests.length,
    0,
    "Preview attempted no API writes or external page requests",
  );
  assert.deepEqual(browserErrors, [], "Dashboard had no browser errors");
  const video = page.video();
  await context.close();
  context = undefined;
  const recording = join(temporary, "face-preview.webm");
  await video.saveAs(recording);
  const videoBytes = await readFile(recording);
  assert.equal(
    videoBytes.subarray(0, 4).toString("hex"),
    "1a45dfa3",
    "Recording has the WebM/EBML container signature",
  );
  assert.ok(
    videoBytes.length > 10000,
    "Recording contains actual encoded frames",
  );
  const receipts = {
    "dashboard-1920x1080.png": await pngReceipt(desktopPng, 1920, 1080),
    "dashboard-1440x900.png": await pngReceipt(laptopPng, 1440, 900),
    "face-preview.webm": {
      bytes: videoBytes.length,
      sha256: createHash("sha256").update(videoBytes).digest("hex"),
    },
  };
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    workingTreeDirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ),
    appVersion: JSON.parse(await readFile(join(root, "package.json"), "utf8"))
      .version,
    hostPlatform: process.platform,
    isolatedSoftwareRendererRequested: isolated,
    browserVersion: browser.version(),
    previewStates: states,
    claims: {
      realDashboard: true,
      previewOnly: true,
      taskHistoryUnchanged: true,
      permissionsUnchanged: true,
      paidCalls: 0,
      windowsDeviceVerified: false,
      gpuUtilizationMeasured: false,
      cpuUtilizationMeasured: false,
    },
    limitations:
      "Rendered FPS and frame intervals include browser/video-capture scheduling. They are not CPU/GPU utilization, a Windows hardware benchmark or 60 FPS certification. Preview states create no operational evidence.",
    samples,
    files: receipts,
  };
  if (expired)
    throw new Error(
      "Animation capture deadline exceeded before artifacts were published.",
    );
  await mkdir(output, { recursive: true });
  for (const [source, name] of [
    [desktopPng, "dashboard-1920x1080.png"],
    [laptopPng, "dashboard-1440x900.png"],
    [recording, "face-preview.webm"],
  ])
    await copyFile(source, join(output, name));
  await writeFile(
    join(output, "face-performance.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "PASS: recorded the actual dashboard and twelve labeled preview states; histories and permissions were unchanged.",
  );
  console.log(
    "Artifacts: artifacts/dashboard-1920x1080.png, dashboard-1440x900.png, face-preview.webm, face-performance.json",
  );
}
try {
  await Promise.race([
    capture(),
    new Promise((_resolve, reject) => {
      overallTimer = setTimeout(() => {
        expired = true;
        reject(
          new Error("Real animation capture exceeded its 150-second deadline."),
        );
      }, 150000);
    }),
  ]);
} finally {
  clearTimeout(overallTimer);
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (service && service.exitCode === null && service.signalCode === null) {
    if (service.connected) service.send({ type: "shutdown" });
    else service.kill();
    await Promise.race([
      new Promise((resolvePromise) => service.once("exit", resolvePromise)),
      delay(5000),
    ]);
    if (service.exitCode === null && service.signalCode === null)
      service.kill("SIGKILL");
  }
  await rm(temporary, { recursive: true, force: true });
}
