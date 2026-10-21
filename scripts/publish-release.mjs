// A version tag is an explicit publication action. Never invoked by a main push.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
const run = promisify(execFile);
const repo = "khapung280/Agents";
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_REPOSITORY !== repo
)
  throw new Error(
    "Publication is restricted to this repository GitHub workflow.",
  );
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const tag = process.env.GITHUB_REF_NAME;
if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== "v" + version)
  throw new Error("Tag must match the source version.");
const sha = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(sha || ""))
  throw new Error("Invalid source commit.");
async function api(path) {
  return JSON.parse(
    (await run("gh", ["api", path], { maxBuffer: 4 * 1024 * 1024 })).stdout,
  );
}
const mode = process.argv[2];
if (mode === "locate") {
  const data = await api(
    `repos/${repo}/actions/workflows/windows.yml/runs?head_sha=${sha}&branch=main&status=success&per_page=30`,
  );
  const builds = data.workflow_runs.filter(
    (r) =>
      r.head_sha === sha &&
      r.head_branch === "main" &&
      r.conclusion === "success" &&
      ["push", "workflow_dispatch"].includes(r.event),
  );
  if (!builds.length)
    throw new Error(
      "No successful Windows build for this exact main commit. Nothing published.",
    );
  await writeFile(process.env.GITHUB_OUTPUT, `run-id=${builds[0].id}\n`, {
    flag: "a",
  });
} else if (mode === "publish") {
  const manifest = JSON.parse(
    await readFile("artifacts/windows/agents-update.json", "utf8"),
  );
  if (manifest.version !== version || manifest.sourceCommit !== sha)
    throw new Error("Artifact and approved tag differ.");
  // gh release create refuses an existing tag release. No --clobber or edit path.
  const notes = "artifacts/windows/release-notes.md";
  await writeFile(notes, manifest.notes);
  await run(
    "gh",
    [
      "release",
      "create",
      tag,
      "--repo",
      repo,
      "--verify-tag",
      "--target",
      sha,
      "--title",
      `AGENTS ${version} preview`,
      "--notes-file",
      notes,
      "artifacts/windows/Ultimate-Agents-Both-Setup.exe",
      "artifacts/windows/Ultimate-Agents-Both-Setup.exe.sha256",
      "artifacts/windows/agents-update.json",
      "artifacts/windows/agents-update.sigstore.json",
      "artifacts/windows/package-info.json",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
} else throw new Error("Use locate or publish.");
