import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { windowsWorkerArguments } from "../server/computer/windows.js";
import { browserExecutable } from "../server/browser-path.js";
import { uninstallManifest } from "../scripts/installer-manifest.mjs";

test("worker execution policy is process-scoped with a fixed script and no shell command", () => {
  const environmentBefore = process.env.PSExecutionPolicyPreference;
  const args = windowsWorkerArguments();
  assert.deepEqual(args, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Mta",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve("native/windows/worker.ps1"),
  ]);
  assert.ok(!args.includes("-Command"));
  assert.equal(process.env.PSExecutionPolicyPreference, environmentBefore);
  args.push("untrusted mutation");
  assert.ok(!windowsWorkerArguments().includes("untrusted mutation"));
});

test("packaged browser selection finds Windows Edge without claiming an absent browser exists", () => {
  const edge =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  assert.equal(
    browserExecutable({}, "win32", (p) => p === edge),
    edge,
  );
  assert.equal(
    browserExecutable({}, "win32", () => false),
    undefined,
  );
  assert.equal(
    browserExecutable(
      { CHROMIUM_PATH: "D:\\Reviewed\\chrome.exe" },
      "win32",
      () => false,
    ),
    "D:\\Reviewed\\chrome.exe",
  );
  assert.equal(
    browserExecutable({}, "linux", (p) => p === "/usr/bin/chromium"),
    "/usr/bin/chromium",
  );
});

test("installer uninstall list names exact package files, escapes NSIS variables, and rejects symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "agents-installer-test-"));
  try {
    await mkdir(join(root, "resources", "app"), { recursive: true });
    await writeFile(join(root, "AGENTS.exe"), "fixture");
    await writeFile(join(root, "resources", "app", "$literal.txt"), "fixture");
    const manifest = await uninstallManifest(root);
    assert.match(manifest, /Delete "\$INSTDIR\\AGENTS\.exe"/);
    assert.ok(
      manifest.includes('Delete "$INSTDIR\\resources\\app\\$$literal.txt"'),
    );
    assert.ok(!manifest.includes("RMDir /r") && !manifest.includes("*"));
    assert.ok(
      manifest.indexOf('RMDir "$INSTDIR\\resources\\app"') <
        manifest.indexOf('RMDir "$INSTDIR\\resources"'),
    );
    // Symlinks may need Windows developer mode; this assertion runs on the cloud host.
    if (process.platform !== "win32") {
      await symlink(join(root, "AGENTS.exe"), join(root, "external-link"));
      await assert.rejects(
        uninstallManifest(root),
        /Symlink cannot be packaged/,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
