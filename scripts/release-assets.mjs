import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const { verifyRelease, validateManifest, compareVersions } = createRequire(
  import.meta.url,
)("../desktop/update-trust.cjs");
const [mode, directoryArg = "artifacts/windows"] = process.argv.slice(2);
const directory = resolve(directoryArg);
const name = "Ultimate-Agents-Both-Setup.exe";
const installer = await readFile(join(directory, name));
const sha256 = createHash("sha256").update(installer).digest("hex");
const info = JSON.parse(
  await readFile(join(directory, "package-info.json"), "utf8"),
);
const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
// Validate before using the version in the release-notes path.
compareVersions(pkg.version, pkg.version);
if (
  info.version !== pkg.version ||
  info.platform !== "win32" ||
  info.arch !== "x64" ||
  info.workingTreeDirty ||
  !/^[a-f0-9]{40}$/.test(info.commit) ||
  (process.env.GITHUB_SHA && info.commit !== process.env.GITHUB_SHA)
)
  throw new Error(
    "Release source/package identity does not match this clean build.",
  );
if (installer.length < 1024 || installer[0] !== 0x4d || installer[1] !== 0x5a)
  throw new Error("Installer is not a Windows executable.");
if (mode === "prepare") {
  const notes = await readFile(
    new URL(`../docs/releases/${pkg.version}.md`, import.meta.url),
    "utf8",
  );
  const manifest = {
    schema: 1,
    version: pkg.version,
    sourceCommit: info.commit,
    generatedAt: new Date().toISOString(),
    notes,
    channel: "stable",
    minUpdaterProtocol: 1,
    dataSchema: 1,
    installer: { name, size: installer.length, sha256 },
  };
  validateManifest(manifest, { currentVersion: pkg.version });
  await writeFile(
    join(directory, "agents-update.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await writeFile(join(directory, name + ".sha256"), sha256 + "\n");
  console.log("Prepared unsigned manifest for attestation; not yet trusted.");
} else if (mode === "verify") {
  const manifest = verifyRelease(
    await readFile(join(directory, "agents-update.json")),
    await readFile(join(directory, "agents-update.sigstore.json")),
    { currentVersion: pkg.version },
  );
  if (
    manifest.version !== pkg.version ||
    manifest.sourceCommit !== info.commit ||
    manifest.installer.size !== installer.length ||
    manifest.installer.sha256 !== sha256
  )
    throw new Error(
      "Signed release does not match the built installer/source.",
    );
  if (
    (await readFile(join(directory, name + ".sha256"), "utf8"))
      .trim()
      .toLowerCase() !== sha256
  )
    throw new Error("Installer checksum sidecar differs.");
  console.log(
    JSON.stringify({
      verified: true,
      version: manifest.version,
      commit: manifest.sourceCommit,
      sha256,
    }),
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\nVerified signed release metadata and installer SHA-256: ${sha256}\nSource: ${info.commit}\n`,
      { flag: "a" },
    );
} else throw new Error("Use prepare or verify.");
