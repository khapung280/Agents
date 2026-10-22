# 0.2.0 update, face and Notepad verification

Implementation baseline: `9075bfcb644ed036d135a2b22cad3bf50e472d8a`. The approved updater design is recorded in [UPDATE_AND_FACE_PLAN.md](UPDATE_AND_FACE_PLAN.md). All ten agent identities, task approvals, emergency stop, the cinematic layout and existing persisted data remain in place. No paid model calls or credential configuration were performed.

## Cloud verification on 2026-10-21

- `npm run check`: typecheck, lint, **128 tests passed**, production client/server build passed.
- `npm run test:e2e`: **24 passed**, including all ten agents/navigation, actual deterministic workflow execution, approval gates, safe browser fixture interaction, labeled face previews, idle movement, pause/reduced motion and updater UI fixtures.
- `DISPLAY=:97 AGENTS_ISOLATED_DESKTOP_TEST=1 npm run test:desktop`: actual Linux Electron launch, restricted bridge, renderer isolation, single-instance behavior, real workflow, approved bundled sample repair tests and service shutdown passed. This used a temporary X server and isolated test-only software-renderer flags.
- Focused Notepad suite: **20 passed**. Native transport is simulated; file creation/read-back is real. Pure evidence tests reject unrelated titles, personal/multiple tabs and ambiguous/unreadable editors.
- NSIS 3.11 compiled the production installer source with a tiny explicit syntax fixture and warnings as errors. That fixture executable is **not** the application installer and is not distributed.
- `AGENTS_ISOLATED_BROWSER_TEST=1 node scripts/capture-face-preview.mjs`: captured valid **1920×1080** and **1440×900** PNGs and a real **43.12-second, 1920×1080 VP9 WebM**, independently checked with `ffprobe`. All task histories and permissions remained unchanged. The cloud software renderer measured 17.4 FPS at desktop idle and 22.9 FPS at laptop idle while recording; these are measured capture samples, not Windows hardware results. The artifact receipt records the checkpoint plus dirty-worktree state accurately; CI captures the eventual clean pushed commit again.

The first local Electron attempt failed because its runtime download was unavailable; the official 44.7.2 Linux archive was fetched and verified against the checksum in the installed npm package. A stale X display also prevented launch; the rerun on a fresh disposable X server passed. Two initial face tests compared raw PNG bytes and failed on 1–2 level compositor color rounding; decoded-pixel comparisons now tolerate only that rounding while still requiring actual idle movement and static paused/reduced rendering.

## Checkout integrity correction on 2026-10-22

Windows run [39641975663](https://github.com/khapung280/Agents/actions/runs/39641975663) passed native compilation, packaging, the actual isolated installer and data-preservation checks, but failed at production release verification. It uploaded no installer. The genuine generated attestation was retrieved from GitHub's public attestation download and its signature, certificate, transparency evidence, publisher policy and source statement passed local verification with the original pinned trust bytes.

Git's Windows-style `core.autocrlf=true` checkout changed the root file hash from the pinned `6494e21e…c0b66` to `fbb8cec6…7674b`, reproducing the integrity rejection. `.gitattributes` now disables text conversion only for the two byte-pinned upstream security artifacts. The same checkout filter now preserves the original hash. No trust root, identity or verification threshold was relaxed. The focused updater/trust suite passed **34 tests**; the full suite now passes **129 tests**. The publisher-rejection test also requires the specific identity error so an unrelated root-loading failure cannot masquerade as successful policy coverage. CI reports the specific verification failure in public annotations while retaining fail-closed behavior.

The clean-commit [dashboard workflow 39641972407](https://github.com/khapung280/Agents/actions/runs/39641972407) passed all checks and published **AGENTS-real-dashboard-preview**. A new Windows run must verify the checkout correction before its installer can be distributed or offered for release publication.

## Implemented boundaries

The updater verifies the fixed GitHub publisher/workflow using certificate-chain, certificate-transparency, Rekor, signature and SLSA provenance checks. Authenticated metadata binds version, compatibility, release notes, source and installer bytes. Tests cover tampering, downgrade/replacement, unsafe URLs, bounded downloads, cancellation/timeouts, native approval, repeated/uncertain handoff prevention and recovery state. Network/Windows shell fixtures are labeled. A genuine upstream Sigstore fixture verifies cryptography, but it is not an AGENTS release; production identity verification must pass on an actual generated AGENTS attestation in Windows CI.

Installation stages versioned payloads before activation, retains old files, leaves user data outside the package, grants no permissions, and uses normal Windows prompts. The application is still unsigned in Windows. Authenticode, SmartScreen reputation and organization policy are not supplied by Sigstore.

The registered Notepad workflow launches once and waits at most ten seconds for one new window from the exact authorized editor/session, including after launcher exit. It excludes pre-existing HWNDs and personal tabs and retains separate approvals, fresh target/focus/process checks and file read-back. Generic application launching is unchanged. Unsupported editor/title patterns fail closed.

## Hosted CI and remaining device acceptance

The **Windows package** workflow must pass native compilation/pure selection fixtures, the packaged watchdog, actual isolated installer execution, data-fixture byte preservation, Windows Internet-zone persistence, real AGENTS provenance verification and artifact upload/download hash verification. Its run conclusion and artifact SHA-256 are the authoritative build receipt; this source report does not pre-claim their result.

The **Dashboard verification and real preview** workflow repeats checks, records the actual dashboard and publishes **AGENTS-real-dashboard-preview**. The recording and `face-performance.json` distinguish actual rendering from labeled preview states and show measured frame intervals. Software-renderer/video-capture results are not Windows GPU benchmarks or a 60 FPS claim.

Still required on the owner's laptop: approved bootstrap installation, normal Windows security prompts, healthy launch, later end-to-end approved update/restart with retained settings/memory/policy, and a fresh disposable Notepad focus/write/save/read-back test. No real laptop input control is claimed. Public-page browser behavior, voice devices and live AI reasoning/vision remain separate acceptance steps.

Release publication is a separate approved action after concrete successful CI/artifact verification. Until then, no version tag or GitHub Release is published. The old 0.1.0 app needs one reviewed bootstrap installer to acquire the in-app updater.
