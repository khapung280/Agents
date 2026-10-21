# Face, updates and Notepad: approved implementation plan

Audit baseline: `9075bfcb644ed036d135a2b22cad3bf50e472d8a`, origin/main. The owner approved the scoped updater architecture on 2026-10-20; that approval remains valid after the development environment restart. Release publication needs separate approval of concrete verified assets.

## Audit

The existing Electron app has a sandboxed renderer and paired loopback service, all ten agents, SQLite memory/checkpoints, approvals and emergency stop. Preserve these. The Three.js face already has twelve runtime states, geometry, rings and real voice callbacks; blinking is abrupt, motion largely shared, particles static, and performance adaptation limited. No preview or continuous metrics exist.

Windows automation already restricts exact executable identity, fresh observations and individual approvals. Disposable Notepad verifies exact files. Its launch currently assumes the returned launcher process owns the window; packaged Windows11 handoff breaks this. Substring document titles and personal-tab ambiguity also need tightening.

The unsigned per-user NSIS installer preserves external data but replaces package files in place. There is no updater or authenticated release metadata. Existing CI hashes artifacts; hashes alone do not authenticate a publisher.

## Approved scope and acceptance

1. Improve the existing face with time-based idle motion, smooth blinking/gaze, moving holographic detail, distinct state profiles and real-event agent nodes. Add an explicitly labeled render-only Animation Preview Mode. No fake tasks, evidence, audio or permissions. Measure rendered FPS/frame intervals/draw calls, adapt detail, pause hidden/minimized/reduced-motion rendering. Capture real PNGs and a playable recording; cloud software-renderer metrics are not Windows60FPS evidence.
2. Add a narrow main-process update bridge. Renderer methods accept no arbitrary URLs, commands, paths or trust roots. Verify signed GitHub Actions/Sigstore provenance for the fixed repository/main workflow and exact release manifest. Pin official public trust roots, workflow/issuer/repository identity and commit. Reject altered hashes, same-version replacements, downgrades, incompatible schemas and stale metadata. No private signing key or paid service is required.
3. Restrict HTTPS downloads to GitHub asset hosts, bound time/size, retain progress, support cancellation and discard incomplete downloads. Reverify before install. Require native owner confirmation; preserve Internet-zone metadata and invoke the normal Windows shell. No silent installation, elevation, SmartScreen/Defender exception or security-policy change. Stop and drain workers first. Never replay an uncertain handoff.
4. Install application payloads in version-specific directories, switch shortcuts only after successful staging, retain the previous version and all existing user data. No automatic privilege grants or destructive migrations. Recovery is explicit and data-schema compatible, not automatic database rollback.
5. After updater tests, fix Notepad handoff only for a fresh registered document and the explicitly authorized actual editor executable. Launch once; poll new windows, excluding all pre-existing HWNDs. Match exact process/session and complete GUID document, reject ambiguity/personal tabs, retain every separate approval and exact file read-back. No automatic System32-to-WindowsApps permission expansion.
6. Run focused tests, full backend/browser/type/lint/build/Electron checks, real capture, Windows native compilation, isolated installer/upgrade checks and artifact/provenance verification. Then present version/commit/assets for publication approval. Never overwrite release assets or force-push.

## Trust and verification limits

Sigstore authenticates a GitHub repository build; it does not supply Windows Authenticode reputation. Windows/organization policies may block the unsigned app and remain authoritative. Initial trusted installation is required; unknown future trust roots fail closed. A compromised authorized repository or hostile same-user process is outside this boundary.

Fixtures must be labeled. Windows CI installation is distinct from laptop acceptance. Neither cloud tests nor native compilation establish real Windows Notepad control. No paid API calls or API-key requests are authorized.
