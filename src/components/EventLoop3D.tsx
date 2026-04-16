/**
 * EventLoop3D — a top-down 3D torus with 6 phase nodes and a traveling runner.
 * The camera sits directly above the torus so it reads like a clock face.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Html } from '@react-three/drei';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

const PHASE_COUNT = 6;
const LOOP_RADIUS = 3.2;

const PHASE_META = [
  { name: 'Timers',   color: '#facc15' },
  { name: 'Pending',  color: '#a78bfa' },
  { name: 'Idle',     color: '#94a3b8' },
  { name: 'Poll',     color: '#60a5fa' },
  { name: 'Check',    color: '#4ade80' },
  { name: 'Close',    color: '#f87171' },
];

// The main torus track
function LoopTrack() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[LOOP_RADIUS, 0.07, 16, 120]} />
      <meshStandardMaterial
        color="#1e293b"
        emissive="#334155"
        emissiveIntensity={1.2}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

// One phase node sphere + HTML label above it
function PhaseNode({
  index,
  isActive,
  onClick,
}: {
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { name, color } = PHASE_META[index];
  const angle = (index / PHASE_COUNT) * Math.PI * 2;
  const x = Math.cos(angle) * LOOP_RADIUS;
  const z = Math.sin(angle) * LOOP_RADIUS;

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const pulse = isActive ? 1 + Math.sin(t * 7) * 0.13 : 1;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <group position={[x, 0, z]}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={() => { document.body.style.cursor = 'pointer'; }}
        onPointerLeave={() => { document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.8 : 0.35}
          transparent
          opacity={isActive ? 1 : 0.65}
        />
      </mesh>
      {/* Glow ring around active node */}
      {isActive && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.025, 8, 64]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} transparent opacity={0.6} />
        </mesh>
      )}
      {isActive && <pointLight color={color} intensity={3} distance={4} />}
      {/* HTML label — rendered via drei Html, visible as DOM overlay */}
      <Html
        distanceFactor={9}
        center
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            color: isActive ? color : 'rgba(255,255,255,0.35)',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginTop: '-48px',
            whiteSpace: 'nowrap',
            textShadow: isActive ? `0 0 12px ${color}, 0 0 24px ${color}88` : 'none',
            transition: 'color 0.3s, text-shadow 0.3s',
          }}
        >
          {name}
        </div>
      </Html>
    </group>
  );
}

// The glowing sphere that travels around the loop
function LoopRunner({
  onNearPhase,
}: {
  onNearPhase: (index: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const angleRef = useRef(0);
  const lastPhaseRef = useRef(-1);

  useFrame((_, delta) => {
    angleRef.current += delta * 0.85; // rad/s — one full revolution ≈ 7.4 s
    const a = angleRef.current;
    const x = Math.cos(a) * LOOP_RADIUS;
    const z = Math.sin(a) * LOOP_RADIUS;

    if (meshRef.current) meshRef.current.position.set(x, 0.02, z);
    if (lightRef.current) lightRef.current.position.set(x, 0.05, z);
    if (trailRef.current) {
      trailRef.current.position.set(
        Math.cos(a - 0.18) * LOOP_RADIUS,
        0,
        Math.sin(a - 0.18) * LOOP_RADIUS
      );
    }

    // Detect which phase we are nearest to
    const normalised = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const phaseAngle = Math.PI * 2;
    let nearest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < PHASE_COUNT; i++) {
      const pa = (i / PHASE_COUNT) * phaseAngle;
      let diff = Math.abs(normalised - pa);
      if (diff > Math.PI) diff = phaseAngle - diff;
      if (diff < minDiff) { minDiff = diff; nearest = i; }
    }
    if (nearest !== lastPhaseRef.current && minDiff < 0.35) {
      lastPhaseRef.current = nearest;
      onNearPhase(nearest);
    }
  });

  return (
    <>
      {/* Trail ghost */}
      <mesh ref={trailRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={1.5} transparent opacity={0.3} />
      </mesh>
      {/* Main runner */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.19, 32, 32]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={5} />
      </mesh>
      {/* Dynamic glow light */}
      <pointLight ref={lightRef} color="white" intensity={3.5} distance={2.5} />
    </>
  );
}

// Subtle grid floor
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <planeGeometry args={[30, 30, 30, 30]} />
      <meshStandardMaterial
        color="#0f172a"
        wireframe
        transparent
        opacity={0.12}
      />
    </mesh>
  );
}

interface EventLoop3DProps {
  activeIndex: number;
  onPhaseClick: (index: number) => void;
}

export function EventLoop3D({ activeIndex, onPhaseClick }: EventLoop3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 9, 2.5], fov: 52 }}
      gl={{ antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#050505']} />
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 10, 0]} intensity={0.4} color="#ffffff" />

      <Stars radius={80} depth={30} count={2500} factor={3} saturation={0} fade speed={0.3} />

      <LoopTrack />
      <Floor />

      {PHASE_META.map((_, i) => (
        <PhaseNode
          key={i}
          index={i}
          isActive={i === activeIndex}
          onClick={() => onPhaseClick(i)}
        />
      ))}

      <LoopRunner onNearPhase={onPhaseClick} />
    </Canvas>
  );
}

// Helper hook: sync the 3D runner's auto-detected phase back to parent state
export function useLoopSync(
  setLoopIndex: (i: number) => void,
  isAutoLooping: boolean
) {
  useEffect(() => {
    // No-op — the LoopRunner calls onNearPhase directly.
    // This hook is kept for potential future use.
    void setLoopIndex;
    void isAutoLooping;
  }, [setLoopIndex, isAutoLooping]);
}
