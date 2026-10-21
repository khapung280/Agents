import type { CoreState } from "../shared/contracts";

export const faceStates = [
  "idle",
  "listening",
  "thinking",
  "planning",
  "observing",
  "delegating",
  "executing",
  "speaking",
  "verifying",
  "success",
  "error",
  "approval",
] as const satisfies readonly CoreState[];
export const faceLabels: Record<CoreState, string> = {
  idle: "Idle / Standby",
  listening: "Listening",
  thinking: "Thinking",
  planning: "Planning",
  observing: "Screen Observation",
  delegating: "Agent Delegation",
  executing: "Executing",
  speaking: "Speaking",
  verifying: "Verification",
  success: "Success",
  error: "Error",
  approval: "Awaiting Approval",
  offline: "Offline / Stopped",
};
export interface FaceProfile {
  ring: number;
  scan: number;
  pulse: number;
  gaze: number;
  tilt: number;
  brow: number;
  energy: number;
}
// Render-only profiles. No profile starts work, produces evidence or grants authority.
export const faceProfiles: Record<CoreState, FaceProfile> = {
  idle: {
    ring: 0.045,
    scan: 0.5,
    pulse: 0.7,
    gaze: 0.8,
    tilt: 0,
    brow: 0,
    energy: 0.14,
  },
  listening: {
    ring: 0.07,
    scan: 0.7,
    pulse: 1.1,
    gaze: 0.35,
    tilt: -0.035,
    brow: 0.018,
    energy: 0.3,
  },
  thinking: {
    ring: -0.08,
    scan: 1.1,
    pulse: 1.4,
    gaze: 0.45,
    tilt: 0.04,
    brow: -0.012,
    energy: 0.38,
  },
  planning: {
    ring: 0.12,
    scan: 0.85,
    pulse: 1.7,
    gaze: 0.55,
    tilt: 0.02,
    brow: 0.012,
    energy: 0.42,
  },
  observing: {
    ring: 0.035,
    scan: 2.1,
    pulse: 0.6,
    gaze: 1.15,
    tilt: -0.02,
    brow: 0.025,
    energy: 0.35,
  },
  delegating: {
    ring: 0.22,
    scan: -1.1,
    pulse: 2,
    gaze: 0.6,
    tilt: 0.015,
    brow: 0.014,
    energy: 0.48,
  },
  executing: {
    ring: 0.17,
    scan: 1.45,
    pulse: 1.8,
    gaze: 0.25,
    tilt: -0.015,
    brow: -0.008,
    energy: 0.45,
  },
  speaking: {
    ring: 0.08,
    scan: 0.8,
    pulse: 0.9,
    gaze: 0.55,
    tilt: 0,
    brow: 0.016,
    energy: 0.25,
  },
  verifying: {
    ring: -0.055,
    scan: -1.8,
    pulse: 1.2,
    gaze: 0.2,
    tilt: 0.025,
    brow: -0.006,
    energy: 0.33,
  },
  success: {
    ring: 0.1,
    scan: 0.5,
    pulse: 0.65,
    gaze: 0.65,
    tilt: -0.02,
    brow: 0.03,
    energy: 0.45,
  },
  error: {
    ring: -0.025,
    scan: 0.25,
    pulse: 1.25,
    gaze: 0.15,
    tilt: 0.025,
    brow: -0.025,
    energy: 0.26,
  },
  approval: {
    ring: 0.025,
    scan: 0.3,
    pulse: 0.8,
    gaze: 0.25,
    tilt: -0.01,
    brow: 0.02,
    energy: 0.27,
  },
  offline: {
    ring: 0.018,
    scan: 0.25,
    pulse: 0.5,
    gaze: 0.2,
    tilt: 0,
    brow: 0,
    energy: 0.04,
  },
};
export function damp(
  current: number,
  target: number,
  rate: number,
  delta: number,
) {
  return (
    current + (target - current) * (1 - Math.exp(-rate * Math.max(0, delta)))
  );
}
export function blinkOpenness(seconds: number) {
  const cycle = Math.floor(seconds / 8);
  const elapsed = seconds - cycle * 8 - (3.6 + ((cycle * 7) % 5) * 0.31);
  return elapsed < 0 || elapsed > 0.3
    ? 1
    : 1 - 0.91 * Math.sin((elapsed / 0.3) * Math.PI) ** 2;
}
export function faceAudioLevel(
  state: CoreState,
  level: number,
  preview: boolean,
  seconds: number,
) {
  if (state !== "speaking" && state !== "listening") return 0;
  if (preview) return 0.18 + 0.35 * Math.sin(seconds * 5.5) ** 2;
  return Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
}
export interface FaceMetrics {
  fps: number;
  frameMs: number;
  p95FrameMs: number;
  frames: number;
  drawCalls: number;
  triangles: number;
  points: number;
  renderer: string;
  quality: string;
  capped: boolean;
}
export function frameSample(intervals: number[]) {
  if (!intervals.length) return { fps: 0, frameMs: 0, p95FrameMs: 0 };
  const mean =
    intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const sorted = [...intervals].sort((a, b) => a - b);
  return {
    fps: Math.round((1000 / mean) * 10) / 10,
    frameMs: Math.round(mean * 10) / 10,
    p95FrameMs:
      Math.round(
        sorted[
          Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
        ] * 10,
      ) / 10,
  };
}
