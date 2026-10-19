import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CoreState } from "../../shared/contracts";

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
}: {
  state: CoreState;
  quality: string;
  level: number;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null),
    rings = useRef<THREE.Group>(null),
    mouth = useRef<THREE.Mesh>(null),
    leftEye = useRef<THREE.Mesh>(null),
    rightEye = useRef<THREE.Mesh>(null);
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
    const t = s.clock.elapsedTime;
    const active = [
      "thinking",
      "planning",
      "delegating",
      "executing",
      "observing",
      "verifying",
    ].includes(state);
    uniforms.uColor.value.lerp(
      new THREE.Color(palette[state]),
      Math.min(1, delta * 4),
    );
    uniforms.uTime.value = reduced ? 0 : t;
    uniforms.uActivity.value = level;
    if (group.current) {
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        reduced ? 0 : Math.sin(t * 0.22) * 0.1 + s.pointer.x * 0.1,
        0.03,
      );
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        -s.pointer.y * 0.06,
        0.03,
      );
      group.current.position.y = reduced ? 0 : Math.sin(t * 0.7) * 0.025;
    }
    if (rings.current && !reduced)
      rings.current.rotation.z += delta * (active ? 0.11 : 0.025);
    if (mouth.current)
      mouth.current.scale.y = 0.14 * (state === "speaking" ? 1 + level * 3 : 1);
    const blink = reduced ? 1 : t % 6 < 0.14 ? 0.15 : 1;
    if (leftEye.current) leftEye.current.scale.y = blink;
    if (rightEye.current) rightEye.current.scale.y = blink;
  });
  return (
    <group>
      <ambientLight intensity={0.4} />
      <pointLight position={[2, 3, 4]} intensity={14} color="#69d5ff" />
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
            vertexShader={`uniform float uTime; uniform float uActivity; varying float vLight; void main(){vec3 p=position; vLight=.35+.65*pow(.5+.5*sin(p.y*12.-uTime*1.4+p.x*5.),3.); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(1.4+vLight*.9+uActivity)* (5./-mv.z);}`}
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
        ))}
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
      <points geometry={particles}>
        <pointsMaterial
          color={palette[state]}
          size={0.013}
          transparent
          opacity={0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
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
function FrameBudget({ onSlow }: { onSlow: () => void }) {
  const budget = useRef({ seconds: 0, frames: 0, reported: false });
  useFrame((_state, delta) => {
    const b = budget.current;
    if (b.reported || delta > 1) return;
    b.seconds += delta;
    b.frames++;
    if (b.seconds > 3) {
      b.reported = true;
      if (b.frames / b.seconds < 35) onSlow();
    }
  });
  return null;
}
export function Core(props: {
  state: CoreState;
  quality: string;
  level: number;
  reduced: boolean;
  paused: boolean;
}) {
  const [effectiveQuality, setEffectiveQuality] = useState(props.quality);
  useEffect(() => setEffectiveQuality(props.quality), [props.quality]);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
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
            if (
              debug &&
              /swiftshader|llvmpipe|softpipe/i.test(
                String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)),
              )
            )
              setEffectiveQuality("performance");
          }}
          frameloop={
            !visible || props.paused || props.reduced ? "demand" : "always"
          }
          gl={{
            alpha: true,
            antialias: props.quality === "high",
            powerPreference: "low-power",
          }}
        >
          <FrameBudget onSlow={() => setEffectiveQuality("performance")} />
          <Face {...props} quality={effectiveQuality} />
        </Canvas>
      </Suspense>
    </RenderBoundary>
  );
}
