// The renderer and release manifest cannot choose identities, keys or roots.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { bundleFromJSON } = require("@sigstore/bundle");
const { TrustedRoot } = require("@sigstore/protobuf-specs");
const {
  Verifier,
  toTrustMaterial,
  toSignedEntity,
} = require("@sigstore/verify");

const REPOSITORY = "https://github.com/khapung280/Agents";
const WORKFLOW_PATH = ".github/workflows/windows.yml";
const REF = "refs/heads/main";
const WORKFLOW = `${REPOSITORY}/${WORKFLOW_PATH}@${REF}`;
const ROOT_HASH =
  "6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66";
const INSTALLER = "Ultimate-Agents-Both-Setup.exe";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function keys(value, expected, label) {
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !== [...expected].sort().join(",")
  )
    fail(`Invalid ${label} fields.`);
}
function versionParts(version) {
  if (
    typeof version !== "string" ||
    !/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(version)
  )
    fail("Only bounded stable numeric release versions are supported.");
  const parts = version.split(".").map(Number);
  if (parts.some((part) => part > 65535))
    fail("Release version component exceeds its limit.");
  return parts;
}
function compareVersions(left, right) {
  const a = versionParts(left),
    b = versionParts(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
function parseBytes(bytes, limit, label) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limit)
    fail(`${label} exceeds its size limit or is empty.`);
  // Fatal decoding avoids accepting different interpretations of malformed UTF-8.
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} is not valid UTF-8 JSON.`);
  }
}

// Structural/compatibility validation is separate from authentication. Callers
// must use verifyRelease before treating a manifest as a trusted update.
function validateManifest(manifest, options) {
  keys(
    manifest,
    [
      "schema",
      "version",
      "sourceCommit",
      "generatedAt",
      "notes",
      "channel",
      "minUpdaterProtocol",
      "dataSchema",
      "installer",
    ],
    "update manifest",
  );
  if (
    manifest.schema !== 1 ||
    manifest.channel !== "stable" ||
    manifest.minUpdaterProtocol !== 1 ||
    manifest.dataSchema !== 1
  )
    fail(
      "Unsupported update protocol, channel or data schema; manual review is required.",
    );
  versionParts(manifest.version);
  if (
    typeof manifest.sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
  )
    fail("Invalid source commit.");
  if (
    typeof manifest.generatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      manifest.generatedAt,
    )
  )
    fail("Invalid release timestamp.");
  const generated = Date.parse(manifest.generatedAt);
  if (
    !Number.isFinite(generated) ||
    generated > Date.now() + 5 * 60000 ||
    generated < Date.now() - 180 * 86400000
  )
    fail(
      "Release metadata is expired or has a future timestamp; manual review is required.",
    );
  if (
    typeof manifest.notes !== "string" ||
    !manifest.notes.trim() ||
    Buffer.byteLength(manifest.notes, "utf8") > 10000 ||
    /\p{Cc}/u.test(
      manifest.notes
        .replaceAll("\n", "")
        .replaceAll("\r", "")
        .replaceAll("\t", ""),
    )
  )
    fail("Invalid release notes.");
  keys(manifest.installer, ["name", "size", "sha256"], "installer");
  if (
    manifest.installer.name !== INSTALLER ||
    !Number.isSafeInteger(manifest.installer.size) ||
    manifest.installer.size < 1024 ||
    manifest.installer.size > 300 * 1024 * 1024 ||
    typeof manifest.installer.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.installer.sha256)
  )
    fail("Invalid fixed Windows x64 installer metadata.");
  if (
    !record(options) ||
    compareVersions(manifest.version, options.currentVersion) < 0 ||
    (options.highestVersion !== undefined &&
      compareVersions(manifest.version, options.highestVersion) < 0)
  )
    fail("Release downgrade refused.");
  return manifest;
}

function derString(value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 255) fail("Certificate policy string is too long.");
  return Buffer.concat([
    Buffer.from(
      bytes.length < 128 ? [12, bytes.length] : [12, 129, bytes.length],
    ),
    bytes,
  ]);
}
function oid(suffix, value) {
  return {
    oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, suffix] },
    value: derString(value),
  };
}
function releasePolicy(commit) {
  return {
    subjectAlternativeName: new RegExp(
      "^" + WORKFLOW.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
    ),
    extensions: { issuer: "https://token.actions.githubusercontent.com" },
    oids: [
      oid(9, WORKFLOW),
      oid(10, commit),
      oid(11, "github-hosted"),
      oid(12, REPOSITORY),
      oid(13, commit),
      oid(14, REF),
      oid(15, "1420101301"),
      oid(16, "https://github.com/khapung280"),
      oid(17, "188821518"),
      oid(18, WORKFLOW),
      oid(19, commit),
      oid(22, "public"),
    ],
  };
}
function trustedVerifier() {
  const bytes = readFileSync(
    join(__dirname, "trust", "sigstore-public-good.json"),
  );
  if (sha256(bytes) !== ROOT_HASH)
    fail("Bundled update trust material changed; updates are disabled.");
  return new Verifier(
    toTrustMaterial(TrustedRoot.fromJSON(JSON.parse(bytes.toString("utf8")))),
    {
      ctlogThreshold: 1,
      tlogThreshold: 1,
      timestampThreshold: 1,
    },
  );
}

function validateStatement(statement, manifest, manifestHash) {
  if (
    !record(statement) ||
    statement._type !== "https://in-toto.io/Statement/v1" ||
    statement.predicateType !== "https://slsa.dev/provenance/v1"
  )
    fail("Expected GitHub SLSA v1 build provenance.");
  if (!Array.isArray(statement.subject) || statement.subject.length !== 1)
    fail("Expected exactly one signed manifest subject.");
  const subject = statement.subject[0];
  if (
    !record(subject) ||
    subject.name !== "agents-update.json" ||
    !record(subject.digest) ||
    Object.keys(subject.digest).length !== 1 ||
    subject.digest.sha256 !== manifestHash
  )
    fail("Signed manifest digest or subject does not match.");
  const build = statement.predicate?.buildDefinition;
  if (
    !record(build) ||
    build.buildType !== "https://actions.github.io/buildtypes/workflow/v1"
  )
    fail("Unsupported provenance build type.");
  const workflow = build.externalParameters?.workflow;
  if (
    workflow?.repository !== REPOSITORY ||
    workflow?.path !== WORKFLOW_PATH ||
    workflow?.ref !== REF
  )
    fail(
      "Provenance did not originate from the approved main-branch workflow.",
    );
  const github = build.internalParameters?.github;
  if (
    github?.repository_id !== "1420101301" ||
    github?.repository_owner_id !== "188821518" ||
    github?.runner_environment !== "github-hosted" ||
    !["push", "workflow_dispatch"].includes(github?.event_name)
  )
    fail("Provenance repository, owner, runner or trigger is not approved.");
  if (
    !Array.isArray(build.resolvedDependencies) ||
    build.resolvedDependencies.length !== 1 ||
    build.resolvedDependencies[0]?.uri !== `git+${REPOSITORY}@${REF}` ||
    build.resolvedDependencies[0]?.digest?.gitCommit !== manifest.sourceCommit
  )
    fail("Provenance source commit differs from the signed manifest.");
  if (
    statement.predicate?.runDetails?.builder?.id !== WORKFLOW ||
    !/^https:\/\/github\.com\/khapung280\/Agents\/actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*$/.test(
      statement.predicate?.runDetails?.metadata?.invocationId ?? "",
    )
  )
    fail("Provenance builder or invocation is not approved.");
}

function verifyRelease(manifestBytes, bundleBytes, options) {
  const manifest = validateManifest(
    parseBytes(manifestBytes, 32768, "Release manifest"),
    options,
  );
  const serialized = parseBytes(bundleBytes, 262144, "Attestation bundle");
  const bundle = bundleFromJSON(serialized);
  if (
    bundle.content?.$case !== "dsseEnvelope" ||
    bundle.content.dsseEnvelope.payloadType !==
      "application/vnd.in-toto+json" ||
    bundle.content.dsseEnvelope.signatures.length !== 1
  )
    fail("Expected a single signed in-toto DSSE envelope.");
  const entity = toSignedEntity(bundle);
  if (entity.key.$case !== "certificate")
    fail("A trusted GitHub workflow certificate is required.");
  // Mandatory certificate chain, certificate transparency, Rekor inclusion,
  // signing timestamp and signature checks run before trusting statement fields.
  trustedVerifier().verify(entity, releasePolicy(manifest.sourceCommit));
  const statement = parseBytes(
    Buffer.from(bundle.content.dsseEnvelope.payload),
    65536,
    "Signed provenance",
  );
  validateStatement(statement, manifest, sha256(manifestBytes));
  return structuredClone(manifest);
}

module.exports = {
  verifyRelease,
  compareVersions,
  validateManifest,
  validateStatement,
};
