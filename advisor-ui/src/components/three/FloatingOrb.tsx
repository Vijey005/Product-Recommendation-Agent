"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function OrbScene({ isDevilMode }: { isDevilMode: boolean }) {
  const orbRef = useRef<THREE.Mesh>(null);
  const outerShellRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Setup color interpolation sets
  const standardColors = useMemo(() => ({
    c1: new THREE.Color("#1a1f6b"), // deep indigo
    c2: new THREE.Color("#5B6BF8"), // bright indigo-blue
  }), []);

  const devilColors = useMemo(() => ({
    c1: new THREE.Color("#6b1a1a"), // deep red
    c2: new THREE.Color("#DC2626"), // bright red
  }), []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    // 1. Rotate the central orb slightly
    if (orbRef.current) {
      orbRef.current.rotation.y = time * 0.1;
      orbRef.current.rotation.x = time * 0.05;

      // Pulse scaling slightly
      const pulse = 1.0 + Math.sin(time * 2.0) * 0.04;
      orbRef.current.scale.set(pulse, pulse, pulse);

      // Lerp color between deep and bright accents
      const material = orbRef.current.material as THREE.MeshStandardMaterial;
      const targetColors = isDevilMode ? devilColors : standardColors;
      const mix = (Math.sin(time * 1.5) + 1) / 2; // 0 to 1
      material.color.copy(targetColors.c1).lerp(targetColors.c2, mix);
    }

    // 2. Rotate outer wireframe shell in reverse direction
    if (outerShellRef.current) {
      outerShellRef.current.rotation.y = -time * 0.15;
      outerShellRef.current.rotation.z = time * 0.08;
    }

    // 3. Orbiting light animation
    if (lightRef.current) {
      lightRef.current.position.x = Math.sin(time * 2.0) * 2.5;
      lightRef.current.position.z = Math.cos(time * 2.0) * 2.5;
      lightRef.current.position.y = Math.sin(time * 1.0) * 1.2;
    }

    // 4. Rotate data rings at different speeds and inclinations
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = time * 0.4;
      ring1Ref.current.rotation.y = time * 0.2;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = -time * 0.5;
      ring2Ref.current.rotation.z = time * 0.3;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.x = -time * 0.2;
      ring3Ref.current.rotation.z = -time * 0.6;
    }
  });

  const accentColor = isDevilMode ? "#DC2626" : "#5B6BF8";

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 3, 3]} intensity={1.5} />
      <pointLight ref={lightRef} intensity={3} distance={6} color={accentColor} />

      {/* Central Solid Orb */}
      <mesh ref={orbRef}>
        <sphereGeometry args={[1.2, 64, 64]} />
        <meshStandardMaterial roughness={0.1} metalness={0.4} />
      </mesh>

      {/* Outer Rotating Wireframe Shell */}
      <mesh ref={outerShellRef}>
        <sphereGeometry args={[1.35, 24, 24]} />
        <meshBasicMaterial
          color={accentColor}
          wireframe
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* Dynamic Torus Data-Rings */}
      {/* Ring 1 (XY plane slant) */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[1.7, 0.015, 8, 64]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.3} />
      </mesh>

      {/* Ring 2 (YZ plane slant) */}
      <mesh ref={ring2Ref} rotation={[0, Math.PI / 3, Math.PI / 6]}>
        <torusGeometry args={[1.9, 0.012, 8, 64]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.2} />
      </mesh>

      {/* Ring 3 (Horizontal slant) */}
      <mesh ref={ring3Ref} rotation={[Math.PI / 2.2, Math.PI / 8, 0]}>
        <torusGeometry args={[2.1, 0.01, 8, 64]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.15} />
      </mesh>
    </>
  );
}

interface FloatingOrbProps {
  isDevilMode?: boolean;
}

export default function FloatingOrb({ isDevilMode = false }: FloatingOrbProps) {
  return (
    <div className="w-[320px] h-[320px] mx-auto select-none pointer-events-none relative">
      {/* Subtle outer glow backdrop */}
      <div
        className="absolute inset-[30px] rounded-full blur-[40px] opacity-25 transition-colors duration-500"
        style={{
          backgroundColor: isDevilMode ? "rgba(220, 38, 38, 0.5)" : "rgba(91, 107, 248, 0.5)",
          boxShadow: isDevilMode ? "0 0 40px rgba(220, 38, 38, 0.3)" : "0 0 40px rgba(91, 107, 248, 0.3)",
        }}
      />
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 50 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 2, 2));
        }}
        className="w-full h-full relative z-10"
      >
        <OrbScene isDevilMode={isDevilMode} />
      </Canvas>
    </div>
  );
}
