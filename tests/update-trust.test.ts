import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { bundleFromJSON } from "@sigstore/bundle";
import { TrustedRoot } from "@sigstore/protobuf-specs";
import { Verifier, toTrustMaterial, toSignedEntity } from "@sigstore/verify";
const { verifyRelease, validateManifest, validateStatement, compareVersions } =
  createRequire(import.meta.url)("../desktop/update-trust.cjs");
const official = JSON.parse(
  readFileSync("tests/fixtures/update/official-sigstore-bundle.json", "utf8"),
);
const roots = TrustedRoot.fromJSON(
  JSON.parse(readFileSync("desktop/trust/sigstore-public-good.json", "utf8")),
);
const verifier = () =>
  new Verifier(toTrustMaterial(roots), {
    ctlogThreshold: 1,
    tlogThreshold: 1,
    timestampThreshold: 1,
  });
const manifest = () => ({
  schema: 1,
  version: "0.2.0",
  sourceCommit: "a".repeat(40),
  generatedAt: new Date().toISOString(),
  notes: "Preview fixture, not a published release.",
  channel: "stable",
  minUpdaterProtocol: 1,
  dataSchema: 1,
  installer: {
    name: "Ultimate-Agents-Both-Setup.exe",
    size: 1024,
    sha256: "b".repeat(64),
  },
});
const options = { currentVersion: "0.1.0" };

test("pinned upstream trust and signature fixture bytes survive platform checkout unchanged", () => {
  for (const [path, expected] of [
    [
      "desktop/trust/sigstore-public-good.json",
      "6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
    ],
    [
      "tests/fixtures/update/official-sigstore-bundle.json",
      "0fb27faaccc8efe29c485d584adc5fc08b54e70acc48e637a8257e7bda50cc94",
    ],
  ]) {
    assert.equal(
      createHash("sha256").update(readFileSync(path)).digest("hex"),
      expected,
      path,
    );
  }
});

test("official upstream Sigstore fixture passes real offline signature, certificate and transparency verification", () => {
  const signed = verifier().verify(toSignedEntity(bundleFromJSON(official)), {
    subjectAlternativeName: "brian@dehamer.com",
    extensions: { issuer: "https://github.com/login/oauth" },
  });
  assert.equal(signed.identity?.subjectAlternativeName, "brian@dehamer.com");
  // This is genuine upstream cryptography, explicitly NOT an AGENTS release.
});
test("tampered signed payload, signature, log evidence and wrong identity fail cryptographic verification", () => {
  const payload = structuredClone(official);
  payload.dsseEnvelope.payload = Buffer.from("tampered").toString("base64");
  const signature = structuredClone(official);
  signature.dsseEnvelope.signatures[0].sig = Buffer.alloc(70, 1).toString(
    "base64",
  );
  const log = structuredClone(official);
  log.verificationMaterial.tlogEntries = [];
  for (const value of [payload, signature, log])
    assert.throws(() =>
      verifier().verify(toSignedEntity(bundleFromJSON(value))),
    );
  assert.throws(() =>
    verifier().verify(toSignedEntity(bundleFromJSON(official)), {
      subjectAlternativeName:
        "https://github.com/khapung280/Agents/.github/workflows/windows.yml@refs/heads/main",
    }),
  );
});
test("production verifier rejects genuine signatures from another publisher and malformed bundles", () => {
  const bytes = Buffer.from(JSON.stringify(manifest()));
  assert.throws(
    () => verifyRelease(bytes, Buffer.from(JSON.stringify(official)), options),
    /certificate identity error/,
  );
  for (const bundle of [
    Buffer.from("{}"),
    Buffer.from("{"),
    Buffer.alloc(262145),
  ])
    assert.throws(() => verifyRelease(bytes, bundle, options));
});
test("manifest validation rejects downgrade, extra fields, incompatible schema, URLs, invalid size and stale timestamps", () => {
  assert.equal(validateManifest(manifest(), options).version, "0.2.0");
  assert.equal(compareVersions("0.10.0", "0.2.0"), 1);
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
  for (const patch of [
    { version: "0.0.9" },
    { version: "0.2.0-beta.1" },
    { version: "00.2.0" },
    { schema: 2 },
    { dataSchema: 2 },
    { minUpdaterProtocol: 2 },
    { channel: "beta" },
    { sourceCommit: "main" },
    { generatedAt: "2020-01-01T00:00:00Z" },
    { generatedAt: new Date(Date.now() + 3600000).toISOString() },
    { url: "https://attacker.invalid/update.exe" },
    { notes: "\0bad" },
  ])
    assert.throws(() => validateManifest({ ...manifest(), ...patch }, options));
  for (const patch of [
    { name: "other.exe" },
    { size: 0 },
    { size: 301 * 1024 * 1024 },
    { sha256: "bad" },
    { url: "https://github.com/unrelated.exe" },
  ])
    assert.throws(() =>
      validateManifest(
        { ...manifest(), installer: { ...manifest().installer, ...patch } },
        options,
      ),
    );
  assert.throws(() =>
    validateManifest(manifest(), { ...options, highestVersion: "0.3.0" }),
  );
});
test("signed provenance structure binds manifest digest, repository, owner, workflow and exact source commit", () => {
  const repo = "https://github.com/khapung280/Agents";
  const workflow = repo + "/.github/workflows/windows.yml@refs/heads/main";
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [
      { name: "agents-update.json", digest: { sha256: "d".repeat(64) } },
    ],
    predicate: {
      buildDefinition: {
        buildType: "https://actions.github.io/buildtypes/workflow/v1",
        externalParameters: {
          workflow: {
            repository: repo,
            path: ".github/workflows/windows.yml",
            ref: "refs/heads/main",
          },
        },
        internalParameters: {
          github: {
            repository_id: "1420101301",
            repository_owner_id: "188821518",
            runner_environment: "github-hosted",
            event_name: "push",
          },
        },
        resolvedDependencies: [
          {
            uri: "git+" + repo + "@refs/heads/main",
            digest: { gitCommit: "a".repeat(40) },
          },
        ],
      },
      runDetails: {
        builder: { id: workflow },
        metadata: { invocationId: repo + "/actions/runs/123/attempts/1" },
      },
    },
  };
  validateStatement(statement, manifest(), "d".repeat(64));
  assert.throws(() => validateStatement(statement, manifest(), "e".repeat(64)));
  for (const change of [
    (s: typeof statement) => {
      s.predicate.buildDefinition.internalParameters.github.repository_id = "1";
    },
    (s: typeof statement) => {
      s.predicate.buildDefinition.externalParameters.workflow.ref =
        "refs/heads/evil";
    },
    (s: typeof statement) => {
      s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit =
        "b".repeat(40);
    },
    (s: typeof statement) => {
      s.predicate.runDetails.builder.id = "https://attacker.invalid";
    },
  ]) {
    const s = structuredClone(statement);
    change(s);
    assert.throws(() => validateStatement(s, manifest(), "d".repeat(64)));
  }
});
