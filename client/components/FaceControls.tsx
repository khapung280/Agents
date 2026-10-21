import type { CoreState } from "../../shared/contracts";
import { faceLabels, faceStates, type FaceMetrics } from "../faceAnimation";

export function FaceControls({
  preview,
  setPreview,
  runtime,
  metrics,
  paused,
  reduced,
}: {
  preview: CoreState | null;
  setPreview: (state: CoreState | null) => void;
  runtime: CoreState;
  metrics: FaceMetrics | null;
  paused: boolean;
  reduced: boolean;
}) {
  return (
    <details className="face-controls">
      <summary>Animation Preview &amp; render metrics</summary>
      <div className="face-control-row">
        <label>
          <input
            type="checkbox"
            checked={preview !== null}
            onChange={(e) => setPreview(e.target.checked ? "idle" : null)}
          />
          Animation Preview Mode
        </label>
        {preview !== null && (
          <label>
            Preview state
            <select
              aria-label="Preview state"
              value={preview}
              onChange={(e) => setPreview(e.target.value as CoreState)}
            >
              {faceStates.map((state) => (
                <option key={state} value={state}>
                  {faceLabels[state]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {preview !== null ? (
        <p className="face-preview-notice" role="status">
          VISUAL PREVIEW · {faceLabels[preview]}. Actual runtime:{" "}
          {faceLabels[runtime]}. No tasks, audio, permissions or execution
          evidence are generated.
        </p>
      ) : (
        <p>
          Live states follow actual work. Speaking motion follows actual speech
          boundary timing when available; it is not phoneme or output-amplitude
          analysis.
        </p>
      )}
      <div
        className="face-metrics"
        aria-label="Face render measurements"
        data-metrics={metrics ? JSON.stringify(metrics) : undefined}
        data-frames={metrics?.frames ?? 0}
        data-fps={metrics?.fps ?? 0}
        data-quality={metrics?.quality ?? "measuring"}
        data-render-state={
          paused ? "paused" : reduced ? "reduced-motion" : "active"
        }
      >
        <strong>
          {paused
            ? "Rendering paused"
            : reduced
              ? "Reduced motion · static rendering"
              : "Measured rendered frames"}
        </strong>
        {metrics ? (
          <>
            <span>
              {metrics.fps} FPS · mean {metrics.frameMs} ms · p95{" "}
              {metrics.p95FrameMs} ms between frames
            </span>
            <span>
              {metrics.drawCalls} draw calls ·{" "}
              {metrics.triangles.toLocaleString()} triangles ·{" "}
              {metrics.points.toLocaleString()} points
            </span>
            <span>
              {metrics.quality} detail ·{" "}
              {metrics.capped
                ? "30 FPS scheduling cap"
                : "display refresh scheduling"}
            </span>
            <span className="face-renderer">{metrics.renderer}</span>
            {(paused || reduced) && (
              <span>
                Last active sample shown; continuous rendering is suspended.
              </span>
            )}
          </>
        ) : (
          <span>Collecting an active two-second sample…</span>
        )}
        <span>
          Frame intervals include browser scheduling. CPU/GPU utilization and
          GPU execution time are unavailable. This is not a 60 FPS
          certification.
        </span>
      </div>
    </details>
  );
}
