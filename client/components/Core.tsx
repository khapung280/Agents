import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CoreState } from "../../shared/contracts";
import {
  blinkOpenness,
  damp,
  faceAudioLevel,
  faceProfiles,
  frameSample,
  type FaceMetrics,
} from "../faceAnimation";

const palette: Record<CoreState, string> = {
  idle: "#49bef5",
  offline: "#354b60",
  listening: "#71f5df",
  thinking: "#b79aff",
  observing: "#5addcf",
  verifying: "#b2d69b",
  planning: "#8f9cff",
  delegating: "#8ab9ff",
  executing: "#48d7ed",
  speaking: "#7de4ff",
  success: "#6df1b8",
  error: "#ff917b",
  approval: "#e8b979",
};
function faceGeometry(detail: number) {
  const positions: number[] = [],
    indices: number[] = [];
  const rows = detail,
    cols = Math.round(detail * 0.8);
  for (let y = 0; y <= rows; y++) {
    const v = y / rows,
      py = (v - 0.5) * 3.55;
    const width =
      Math.sqrt(Math.max(0, 1 - ((v - 0.5) * 1.99) ** 2)) *
      (v < 0.45 ? 1.0 + v * 0.6 : 1.27);
    for (let x = 0; x <= cols; x++) {
      const nx = (x / cols - 0.5) * 2,
        px = nx * width;
      let z = Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.62;
      const g = (cx: number, cy: number, sx: number, sy: number) =>
        Math.exp(-((px - cx) ** 2 / sx + (py - cy) ** 2 / sy));
      z += 0.56 * g(0, -0.02, 0.033, 0.24) + 0.31 * g(0, -0.28, 0.065, 0.028); // bridge and nose tip
      z -=
        0.15 * g(-0.39, 0.31, 0.05, 0.035) + 0.15 * g(0.39, 0.31, 0.05, 0.035); // eye sockets
      z +=
        0.11 * g(-0.41, 0.51, 0.08, 0.018) + 0.11 * g(0.41, 0.51, 0.08, 0.018); // brow ridge
      z +=
        0.1 * g(-0.55, -0.18, 0.045, 0.13) + 0.1 * g(0.55, -0.18, 0.045, 0.13); // cheeks
      z -= 0.08 * g(0, -0.64, 0.13, 0.006); // lip separation
      z +=
        0.055 * g(0, -0.56, 0.13, 0.004) +
        0.07 * g(0, -0.73, 0.1, 0.007) +
        0.12 * g(0, -1.12, 0.15, 0.07);
      positions.push(px, py, z);
      if (y < rows && x < cols) {
        const a = y * (cols + 1) + x,
          b = a + cols + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return mesh;
}
function Face({
  state,
  quality,
  level,
  reduced,
  animate,
  preview,
}: {
  state: CoreState;
  quality: string;
  level: number;
  reduced: boolean;
  animate: boolean;
  preview: boolean;
}) {
  const group = useRef<THREE.Group>(null),
    rings = useRef<THREE.Group>(null),
    mouth = useRef<THREE.Mesh>(null),
    leftEye = useRef<THREE.Mesh>(null),
    rightEye = useRef<THREE.Mesh>(null),
    leftLid = useRef<THREE.Group>(null),
    rightLid = useRef<THREE.Group>(null),
    particleField = useRef<THREE.Points>(null),
    scan = useRef<THREE.Mesh>(null),
    light = useRef<THREE.PointLight>(null);
  const time = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const motion = useRef({
    ...faceProfiles[state],
    audio: 0,
    scanTime: 0,
    pulseTime: 0,
  });
  const targetColor = useMemo(() => new THREE.Color(palette[state]), [state]);
  const geometry = useMemo(
    () => faceGeometry(quality === "high" ? 100 : 55),
    [quality],
  );
  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < (quality === "high" ? 500 : 140); i++) {
      const a = i * 2.399963,
        r = 1.7 + ((i % 19) / 18) * 1.6;
      arr.push(
        Math.cos(a) * r,
        Math.sin(a) * r * 0.85,
        Math.sin(i * 1.63) * 1.4 - 1.2,
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }, [quality]);
  const contours = useMemo(
    () =>
      [
        [
          [-0.76, 0.52, 0.62],
          [-0.48, 0.62, 0.7],
          [-0.23, 0.53, 0.71],
        ],
        [
          [0.76, 0.52, 0.62],
          [0.48, 0.62, 0.7],
          [0.23, 0.53, 0.71],
        ],
        [
          [-0.1, 0.19, 1.03],
          [-0.13, -0.2, 1.18],
          [0, -0.36, 1.22],
          [0.13, -0.2, 1.18],
          [0.1, 0.19, 1.03],
        ],
        [
          [-0.28, -0.64, 0.73],
          [-0.13, -0.58, 0.77],
          [0, -0.61, 0.78],
          [0.13, -0.58, 0.77],
          [0.28, -0.64, 0.73],
        ],
        [
          [-0.28, -0.66, 0.73],
          [0, -0.74, 0.77],
          [0.28, -0.66, 0.73],
        ],
      ].map(
        (points) =>
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(
              points.map(
                (p) => new THREE.Vector3(...(p as [number, number, number])),
              ),
            ),
            32,
            0.0045,
            4,
            false,
          ),
      ),
    [],
  );
  const ticks = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 60; i++) {
      const angle = (i * Math.PI) / 30,
        outer = 2.45 + (i % 5 === 0 ? 0.065 : 0.025);
      points.push(
        Math.cos(angle) * 2.45,
        Math.sin(angle) * 2.45,
        -0.8,
        Math.cos(angle) * outer,
        Math.sin(angle) * outer,
        -0.8,
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(palette[state]) },
      uActivity: { value: 0 },
      uEnergy: { value: 0.14 },
      uScan: { value: 0.5 },
    }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      particles.dispose();
    },
    [geometry, particles],
  );
  useEffect(
    () => () => {
      contours.forEach((g) => g.dispose());
      ticks.dispose();
    },
    [contours, ticks],
  );
  useFrame((s, delta) => {
    // Time is local to active rendering; resume never jumps by hidden elapsed time.
    const dt = animate ? Math.min(delta, 0.1) : 0;
    if (animate) {
      time.current += dt;
      pointer.current.x = s.pointer.x;
      pointer.current.y = s.pointer.y;
    }
    const t = reduced ? 0 : time.current;
    const profile = faceProfiles[state];
    const m = motion.current;
    for (const key of Object.keys(profile) as (keyof typeof profile)[])
      m[key] = reduced ? profile[key] : damp(m[key], profile[key], 3, dt);
    m.audio = reduced
      ? 0
      : damp(m.audio, faceAudioLevel(state, level, preview, t), 13, dt);
    m.scanTime += dt * m.scan;
    m.pulseTime += dt * m.pulse;
    uniforms.uColor.value.lerp(
      targetColor,
      !animate ? 1 : 1 - Math.exp(-dt * 4),
    );
    uniforms.uTime.value = t;
    uniforms.uActivity.value = m.audio;
    uniforms.uEnergy.value = m.energy;
    uniforms.uScan.value = reduced ? 0 : m.scanTime;
    if (group.current) {
      group.current.rotation.y = reduced
        ? 0
        : damp(
            group.current.rotation.y,
            Math.sin(t * 0.22) * 0.085 + pointer.current.x * 0.085,
            2,
            dt,
          );
      group.current.rotation.x = reduced
        ? 0
        : damp(
            group.current.rotation.x,
            Math.sin(t * 0.31) * 0.017 - pointer.current.y * 0.045 + m.tilt,
            2,
            dt,
          );
      group.current.rotation.z = reduced ? 0 : Math.sin(t * 0.17) * 0.012;
      group.current.position.y = reduced ? 0 : Math.sin(t * 0.7) * 0.026;
      group.current.scale.setScalar(
        reduced ? 1 : 1 + Math.sin(t * 0.7) * 0.003,
      );
    }
    if (rings.current && animate) rings.current.rotation.z += dt * m.ring;
    if (particleField.current) {
      particleField.current.rotation.z = reduced ? 0 : t * 0.012;
      particleField.current.rotation.y = reduced
        ? 0
        : Math.sin(t * 0.13) * 0.12;
    }
    if (scan.current) {
      scan.current.position.y = reduced
        ? 0.3
        : Math.sin(m.scanTime * 0.6) * 1.65;
      (scan.current.material as THREE.MeshBasicMaterial).opacity = reduced
        ? 0.06
        : 0.035 + m.energy * 0.075;
    }
    if (light.current) {
      light.current.color.copy(uniforms.uColor.value);
      light.current.intensity =
        12 + m.audio * 5 + (reduced ? 0 : Math.sin(m.pulseTime) * m.energy * 2);
    }
    if (mouth.current)
      mouth.current.scale.y =
        0.14 * (1 + (state === "speaking" ? m.audio * 3 : 0));
    const blink = reduced ? 1 : blinkOpenness(t);
    for (const eye of [leftEye.current, rightEye.current]) {
      if (!eye) continue;
      eye.scale.y = blink;
      eye.position.x = reduced
        ? 0
        : Math.sin(t * 0.4) * 0.017 * m.gaze + pointer.current.x * 0.013;
      eye.position.y = reduced
        ? 0
        : Math.sin(t * 0.27) * 0.008 + pointer.current.y * 0.009;
    }
    for (const lid of [leftLid.current, rightLid.current])
      if (lid) {
        lid.scale.y = blink;
        lid.position.y = (reduced ? 0 : Math.sin(t * 0.53) * 0.002) + m.brow;
      }
  });
  return (
    <group>
      <ambientLight intensity={0.4} />
      <pointLight
        ref={light}
        position={[2, 3, 4]}
        intensity={14}
        color="#69d5ff"
      />
      <pointLight position={[-2, 1, 2]} intensity={4} color="#806ee6" />
      <group ref={group} position={[0, 0.05, 0]}>
        <mesh geometry={geometry}>
          <meshStandardMaterial
            color="#12618b"
            emissive="#093849"
            emissiveIntensity={0.3}
            transparent
            opacity={0.24}
            metalness={0.45}
            roughness={0.6}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={palette[state]}
            transparent
            opacity={state === "offline" ? 0.04 : 0.08}
            wireframe
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <points geometry={geometry}>
          <shaderMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uniforms={uniforms}
            vertexShader={`uniform float uTime; uniform float uActivity; uniform float uEnergy; uniform float uScan; varying float vLight; void main(){vec3 p=position; p.z += sin(p.y*5.+uTime*.7)*sin(p.x*4.-uTime*.3)*.008*(.4+uEnergy); vLight=.35+.65*pow(.5+.5*sin(p.y*12.-uScan+p.x*5.),3.); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(1.4+vLight*.9+uActivity)* (5./-mv.z);}`}
            fragmentShader={`uniform vec3 uColor; varying float vLight; void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(uColor,(1.-d*2.)*(.42+vLight*.58));}`}
          />
        </points>
        {contours.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshBasicMaterial
              color={palette[state]}
              transparent
              opacity={0.5}
            />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.39, 0.3, 0.61]}
            rotation={[0, side * -0.12, side * -0.06]}
          >
            <mesh ref={side === -1 ? leftEye : rightEye}>
              <sphereGeometry args={[0.045, 20, 12]} />
              <meshBasicMaterial
                color={state === "offline" ? "#436275" : "#b4f6ff"}
                toneMapped={false}
              />
            </mesh>
            <group ref={side === -1 ? leftLid : rightLid}>
              <mesh scale={[1, 0.28, 1]}>
                <torusGeometry args={[0.19, 0.009, 8, 48]} />
                <meshBasicMaterial
                  color={palette[state]}
                  transparent
                  opacity={0.9}
                />
              </mesh>
              <mesh scale={[1, 0.25, 1]}>
                <circleGeometry args={[0.16, 32]} />
                <meshBasicMaterial
                  color={palette[state]}
                  transparent
                  opacity={0.14}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          </group>
        ))}
        <mesh ref={scan} position={[0, 0.3, 0.9]}>
          <planeGeometry args={[2.4, 0.013]} />
          <meshBasicMaterial
            color={palette[state]}
            transparent
            opacity={0.06}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh ref={mouth} position={[0, -0.65, 0.69]} scale={[1, 0.14, 1]}>
          <torusGeometry args={[0.26, 0.008, 6, 48, Math.PI * 2]} />
          <meshBasicMaterial color={palette[state]} transparent opacity={0.8} />
        </mesh>
        <mesh position={[0, -1.92, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.46, 0.47, 64]} />
          <meshBasicMaterial
            color={palette[state]}
            transparent
            opacity={0.45}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <group ref={rings}>
        {[2.25, 2.43, 2.75].map((r, i) => (
          <mesh
            key={r}
            rotation={[i === 1 ? 0.38 : 0, i === 1 ? 0.25 : 0, i * 0.7]}
            position={[0, 0, -0.8]}
          >
            <torusGeometry
              args={[r, 0.006, 4, 140, i === 2 ? Math.PI * 1.7 : Math.PI * 2]}
            />
            <meshBasicMaterial
              color={palette[state]}
              transparent
              opacity={i === 1 ? 0.38 : 0.16}
            />
          </mesh>
        ))}
        <lineSegments geometry={ticks}>
          <lineBasicMaterial
            color={palette[state]}
            transparent
            opacity={0.35}
          />
        </lineSegments>
      </group>
      <points ref={particleField} geometry={particles}>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={uniforms}
          vertexShader={`uniform float uTime; uniform float uActivity; varying float vLight; void main(){vec3 p=position; p.y+=sin(p.x*2.+uTime*.35)*.035; p.x+=cos(p.y*2.+uTime*.22)*.025; vLight=.35+.3*sin(p.z*3.+uTime*.8)+uActivity*.35; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(1.2+uActivity)*5./-mv.z;}`}
          fragmentShader={`uniform vec3 uColor; varying float vLight; void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(uColor,(1.-d*2.)*vLight);}`}
        />
      </points>
    </group>
  );
}
class RenderBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="gpu-fallback">
        3D rendering unavailable
        <br />
        <small>All task controls remain available.</small>
      </div>
    ) : (
      this.props.children
    );
  }
}
function FrameDriver({ active, capped }: { active: boolean; capped: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    let id = 0,
      last = 0;
    const frame = (now: number) => {
      if (!capped || now - last >= 1000 / 30 - 0.5) {
        invalidate();
        last = now;
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [active, capped, invalidate]);
  return null;
}
function RenderMeasurements({
  active,
  quality,
  capped,
  renderer,
  onMetrics,
  onSlow,
}: {
  active: boolean;
  quality: string;
  capped: boolean;
  renderer: string;
  onMetrics?: (metrics: FaceMetrics) => void;
  onSlow: () => void;
}) {
  const counts = useRef({
    frames: 0,
    previous: 0,
    start: 0,
    intervals: [] as number[],
    slow: 0,
  });
  useEffect(() => {
    const c = counts.current;
    c.previous = 0;
    c.start = 0;
    c.intervals = [];
    c.slow = 0;
  }, [active, quality, capped]);
  useFrame(({ gl, scene, camera }) => {
    // A positive render priority makes this the actual render boundary. Metrics
    // are read after this draw, not inferred from task activity or a timer.
    gl.render(scene, camera);
    if (!active) return;
    const c = counts.current,
      now = performance.now();
    c.frames++;
    if (c.previous) c.intervals.push(now - c.previous);
    c.previous = now;
    if (!c.start) c.start = now;
    if (now - c.start < 2000 || !c.intervals.length) return;
    const sample = frameSample(c.intervals);
    onMetrics?.({
      ...sample,
      frames: c.frames,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      points: gl.info.render.points,
      renderer,
      quality,
      capped,
    });
    if (!capped && sample.fps < 35) c.slow++;
    else c.slow = 0;
    if (c.slow >= 2) onSlow();
    c.start = now;
    c.intervals = [];
  }, 1);
  return null;
}
export function Core(props: {
  state: CoreState;
  quality: string;
  level: number;
  reduced: boolean;
  paused: boolean;
  preview?: boolean;
  onMetrics?: (metrics: FaceMetrics) => void;
}) {
  const [effectiveQuality, setEffectiveQuality] = useState(props.quality);
  const [software, setSoftware] = useState(false);
  const [slow, setSlow] = useState(false);
  const [renderer, setRenderer] = useState("Renderer information unavailable");
  useEffect(() => {
    setEffectiveQuality(software ? "performance" : props.quality);
    setSlow(false);
  }, [props.quality, software]);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  const active = visible && !props.paused && !props.reduced;
  const capped = software || slow || effectiveQuality === "performance";
  return (
    <RenderBoundary>
      <Suspense
        fallback={
          <div className="gpu-fallback">Initializing command core…</div>
        }
      >
        <Canvas
          aria-label="Animated holographic AGENTS face"
          camera={{ position: [0, 0, 7], fov: 46 }}
          dpr={effectiveQuality === "high" ? [1, 1.5] : 1}
          onCreated={({ gl }) => {
            const context = gl.getContext();
            const debug = context.getExtension("WEBGL_debug_renderer_info");
            const name = debug
              ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
              : String(context.getParameter(context.RENDERER));
            setRenderer(name);
            setSoftware(/swiftshader|llvmpipe|softpipe/i.test(name));
          }}
          frameloop="demand"
          gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
        >
          <FrameDriver active={active} capped={capped} />
          <Face
            {...props}
            preview={props.preview ?? false}
            animate={active}
            quality={effectiveQuality}
          />
          <RenderMeasurements
            active={active}
            quality={effectiveQuality}
            capped={capped}
            renderer={renderer}
            onMetrics={props.onMetrics}
            onSlow={() => {
              setEffectiveQuality("performance");
              setSlow(true);
            }}
          />
        </Canvas>
      </Suspense>
    </RenderBoundary>
  );
}
