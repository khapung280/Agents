# Update trust material and provenance

The verifier uses the official Sigstore packages pinned in the lockfile: @sigstore/verify4.1.2, @sigstore/bundle5.0.0, @sigstore/protobuf-specs0.5.2, and transitive @sigstore/core4.0.1. There is no signing client, private key, paid signing service or runtime network trust override.

Bundled public-good root: sigstore/root-signing commit `742eb2ab924b1967adeaca0c8d59358615b56a6f`, `targets/trusted_root.json`, SHA-256 `6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66`. The upstream license is retained in desktop/trust/LICENSE. The production verifier pins these exact bytes and rejects unreviewed changes.

The genuine upstream cryptographic test fixture is sigstore/sigstore-js commit `769a53d8713248a8bf49edfc2a5d1955b0dcc24d`, `tests/bundles/bundleV03-intoto.sigstore`, SHA-256 `0fb27faaccc8efe29c485d584adc5fc08b54e70acc48e637a8257e7bda50cc94`. It authenticates an upstream test identity, **not AGENTS**. Its real signature/certificate/transparency verification passes, while the production AGENTS identity policy correctly rejects it. See the retained fixture license.

CI uses actions/attest commit `1e69f48acb82d1966a394da916b4c1698aa569d6` (v4.2.2). The official action and @actions/attest SLSA builder were reviewed for statement fields. Verification pins the main workflow SAN and GitHub OIDC issuer, modern Fulcio source/build claim OIDs, immutable repository1420101301 and owner188821518, hosted runner, source SHA and main ref. Repository IDs were read from public GitHub repository metadata. It also binds signed subject hash/name, SLSA build type, workflow, dependencies and invocation.

Certificate-chain, certificate-transparency, transparency-log and timestamp thresholds remain at least one. A newly generated AGENTS bundle must pass this production verifier in Windows CI before distribution. Any mismatch fails the build; fixture tests alone cannot establish that the AGENTS publication path works.

References: https://github.com/actions/attest ; https://github.com/actions/toolkit/tree/main/packages/attest ; https://github.com/sigstore/sigstore-js ; https://github.com/sigstore/root-signing .
