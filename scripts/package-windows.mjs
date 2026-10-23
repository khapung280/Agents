import { uninstallManifest, extractionManifest } from "./installer-manifest.mjs";
import { createRequire } from "node:module";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { downloadArtifact } = require("@electron/get");
const { extract } = require("@electron-internal/extract-zip");
const run = promisify(execFile);
const root = resolve(".");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const electronVersion = require("electron/package.json").version;
const output = join(root, "artifacts", "windows");
const stage = join(output, "AGENTS");
// This generated staging directory belongs to this build, never user runtime data.
await mkdir(output, { recursive: true });
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const zip = await downloadArtifact({
  version: electronVersion,
  artifactName: "electron",
  platform: "win32",
  arch: "x64",
  checksums: require("electron/checksums.json"),
  cacheRoot: process.env.electron_config_cache,
});
await extract(zip, { dir: stage });
await rename(join(stage, "electron.exe"), join(stage, "AGENTS.exe"));
const app = join(stage, "resources", "app");
await mkdir(app, { recursive: true });
// Explicit source allowlist: no .env, credentials, runtime databases, caches, or tests output.
for (const name of [
  "dist",
  "dist-server",
  "desktop",
  "native",
  "docs",
  "README.md",
  "package.json",
  "package-lock.json",
]) {
  await access(join(root, name));
  await cp(join(root, name), join(app, name), { recursive: true });
}
// Resolve only frozen runtime dependencies. Lifecycle scripts cannot run in the package step.
// npm's JS entry avoids shell/cmd argument interpolation on Windows.
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error("Run this packager through npm run package:windows.");
await run(
  process.execPath,
  [npmCli, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: app, maxBuffer: 4 * 1024 * 1024 },
);
await rm(join(app, "node_modules", ".bin"), { recursive: true, force: true });
await writeFile(
  join(app, "package.json"),
  JSON.stringify({ ...manifest, main: "desktop/main.cjs" }, null, 2) + "\n",
);
await cp(
  join(root, "installer", "Test Windows Control.cmd"),
  join(stage, "Test Windows Control.cmd"),
);
await cp(
  join(root, "installer", "PACKAGED_README.txt"),
  join(stage, "README.txt"),
);
await writeFile(join(output, "uninstall.nsh"), await uninstallManifest(stage));
await writeFile(join(output, "extract.nsh"), await extractionManifest(stage));
const exe = await readFile(join(stage, "AGENTS.exe"));
if (exe.toString("ascii", 0, 2) !== "MZ")
  throw new Error("Packaged runtime is not a Windows PE executable.");
const commit = (
  await run("git", ["rev-parse", "HEAD"], { cwd: root })
).stdout.trim();
const workingTreeDirty = Boolean(
  (await run("git", ["status", "--porcelain"], { cwd: root })).stdout.trim(),
);
await writeFile(
  join(output, "package-info.json"),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      electronVersion,
      platform: "win32",
      arch: "x64",
      commit,
      workingTreeDirty,
      runtimeSha256: createHash("sha256").update(exe).digest("hex"),
      windowsExecutionVerified: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Windows x64 package assembled at ${stage}. Windows execution is not verified by packaging.`,
);
