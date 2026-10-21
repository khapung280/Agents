# Real dashboard animation capture

`scripts/capture-face-preview.mjs` records the actual built application with Playwright. It does not generate a mockup or submit a task. The twelve animation states are explicitly labeled **Animation Preview Mode**; the real runtime state remains visible.

Build first, then capture on a suitable local browser host:

```sh
npm run build
node scripts/capture-face-preview.mjs
```

In the isolated Linux cloud test container only:

```sh
AGENTS_ISOLATED_BROWSER_TEST=1 node scripts/capture-face-preview.mjs
```

That test flag selects Chromium's software renderer and disables its sandbox only in the isolated test process. It does not change the application's production browser or Windows security policy. If Playwright's recording encoder is missing, install its existing recording component with `npx playwright install ffmpeg`; no new npm dependency or paid API is needed.

The script starts a private temporary service without inheriting provider credentials or loading the repository's `.env`. It pairs once, denies page writes and external page requests, records idle motion and twelve labeled preview states, and asserts that tasks, events, memories, schedules, reasoning sessions, test documents, screen grants, metrics and permissions remain unchanged.

Successful output under `artifacts/`:

- `dashboard-1920x1080.png`: exact PNG pixel dimensions, not a full-page image of a different height.
- `dashboard-1440x900.png`: exact PNG pixel dimensions.
- `face-preview.webm`: actual encoded browser recording, suitable for a video player supporting WebM.
- `face-performance.json`: source commit, dirty-worktree status, app/browser version, platform, measured render samples, artifact SHA-256 values and explicit measurement limitations.

For independent recording-container verification when FFmpeg is installed:

```sh
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of json artifacts/face-preview.webm
```

Rendered FPS and mean/p95 frame intervals include browser scheduling and video-recording overhead. They are not CPU/GPU utilization measurements, Windows GPU results or a claim of 60 FPS. The script has a 150-second overall deadline and cleans up only its own temporary service, browser and files. Outputs are published only after the preview-isolation checks succeed. Capturing this preview does not establish real Windows PC control.

The **Dashboard verification and real preview** GitHub Actions workflow repeats the backend, browser and Electron checks, then uploads these four files as **AGENTS-real-dashboard-preview**. Open a successful run for the desired commit, sign into GitHub, download that artifact and extract it. Open a PNG in an image viewer or `face-preview.webm` in Edge/Chrome or a WebM-capable video player. The recording is the running dashboard, not generated imagery; labeled preview states are visual tests rather than evidence of autonomous execution.
