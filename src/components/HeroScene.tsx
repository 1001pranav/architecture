import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';

function NodeNucleus() {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (outerRef.current) {
      outerRef.current.rotation.y = t * 0.2;
      outerRef.current.rotation.z = t * 0.08;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y = -t * 0.35;
      innerRef.current.rotation.x = t * 0.15;
    }
  });

  return (
    <group>
      {/* Outer wireframe geodesic — the "runtime boundary" */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[1.6, 2]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.25}
          wireframe
        />
      </mesh>
      {/* Inner solid core — the JS heap */}
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshStandardMaterial
          color="#15803d"
          emissive="#22c55e"
          emissiveIntensity={0.55}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Glow halo */}
      <mesh>
        <sphereGeometry args={[2.1, 32, 32]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.08}
          transparent
          opacity={0.06}
          side={THREE.BackSide}
        />
      </mesh>
      <pointLight color="#22c55e" intensity={4} distance={9} />
    </group>
  );
}

function OrbitalRing({
  radius,
  speed,
  color,
  rotation,
  startAngle = 0,
}: {
  radius: number;
  speed: number;
  color: string;
  rotation: [number, number, number];
  startAngle?: number;
}) {
  const dotRef = useRef<THREE.Mesh>(null);
  const angleRef = useRef(startAngle);

  useFrame((_, delta) => {
    angleRef.current += speed * delta;
    const a = angleRef.current;
    if (dotRef.current) {
      dotRef.current.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }
  });

  return (
    <group rotation={rotation}>
      <mesh>
        <torusGeometry args={[radius, 0.022, 8, 120]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.75}
          transparent
          opacity={0.45}
        />
      </mesh>
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
      </mesh>
    </group>
  );
}

function FloatingBlock({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const baseY = position[1];
  const offsetRef = useRef(Math.random() * Math.PI * 2);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y =
        baseY + Math.sin(state.clock.elapsedTime * 0.9 + offsetRef.current) * 0.18;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.25;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.4 + offsetRef.current) * 0.15;
    }
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      <mesh ref={meshRef}>
        <boxGeometry args={[1.1, 0.32, 0.22]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.45}
          transparent
          opacity={0.8}
        />
      </mesh>
      <pointLight color={color} intensity={0.6} distance={3} />
    </group>
  );
}

export function HeroScene() {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 12], fov: 60 }} gl={{ antialias: true }}>
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.08} />
        <pointLight position={[10, 8, 6]} intensity={0.5} color="#3b82f6" />
        <pointLight position={[-10, -5, 4]} intensity={0.35} color="#8b5cf6" />

        <Stars radius={110} depth={55} count={7000} factor={4} saturation={0} fade speed={0.4} />

        <NodeNucleus />

        {/* Three orbital rings — each represents a loop cycle plane */}
        <OrbitalRing radius={3.4} speed={1.3} color="#4ade80" rotation={[0, 0, 0]} startAngle={0} />
        <OrbitalRing radius={4.4} speed={0.75} color="#818cf8" rotation={[Math.PI / 3, 0, 0]} startAngle={2} />
        <OrbitalRing radius={5.4} speed={0.38} color="#fb923c" rotation={[Math.PI / 4, Math.PI / 4, 0]} startAngle={4} />

        {/* Four architecture component blocks */}
        <FloatingBlock position={[4.6, 2.8, -2.5]} color="#3b82f6" />   {/* V8 */}
        <FloatingBlock position={[-4.6, 1.8, -2.5]} color="#10b981" />  {/* Bindings */}
        <FloatingBlock position={[-4.2, -2.2, -2.5]} color="#8b5cf6" /> {/* Libuv */}
        <FloatingBlock position={[4.2, -2.6, -2.5]} color="#f97316" />  {/* Threads */}

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.28}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={(Math.PI * 2) / 3}
        />
      </Canvas>
    </div>
  );
}
