"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

function Particles({ count, size, opacity, color }: { count: number; size: number; opacity: number; color: string }) {
  const { mouse, viewport } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Generate particle data once
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      temp.push({
        x: (Math.random() - 0.5) * 16,
        y: (Math.random() - 0.5) * 16,
        z: (Math.random() - 0.5) * 8 - 1,
        speedX: (Math.random() - 0.5) * 0.003,
        speedY: (Math.random() - 0.5) * 0.003,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
      });
    }
    return temp;
  }, [count]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    // Translate NDC mouse (-1 to 1) to viewport units
    const mouseX = (mouse.x * viewport.width) / 2;
    const mouseY = (mouse.y * viewport.height) / 2;

    if (meshRef.current) {
      particles.forEach((p, i) => {
        // Slow sinusoidal drift
        p.x += Math.sin(time + p.phaseX) * p.speedX;
        p.y += Math.cos(time + p.phaseY) * p.speedY;

        // Mouse magnetic repulsion (push away from pointer within 3.0 units)
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 3.0 && dist > 0.01) {
          const force = (3.0 - dist) * 0.015;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        // Boundary wrap-around check
        const limitX = viewport.width / 2 + 1;
        const limitY = viewport.height / 2 + 1;
        if (Math.abs(p.x) > limitX) p.x = -Math.sign(p.x) * (limitX - 0.1);
        if (Math.abs(p.y) > limitY) p.y = -Math.sign(p.y) * (limitY - 0.1);

        dummy.position.set(p.x, p.y, p.z);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null as any, null as any, count]}>
      <sphereGeometry args={[size, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  );
}

interface ParticleFieldProps {
  isDevilMode?: boolean;
}

export default function ParticleField({ isDevilMode = false }: ParticleFieldProps) {
  // Use red accent color in Devil's Advocate mode, electric indigo in standard mode
  const color = isDevilMode ? "#DC2626" : "#5B6BF8";

  return (
    <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden bg-transparent">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ alpha: true, antialias: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 2, 2));
        }}
        className="w-full h-full"
      >
        <ambientLight intensity={1.5} />
        {/* Layer 1: 600 small, bright particles */}
        <Particles count={600} size={0.015} opacity={0.35} color={color} />
        {/* Layer 2: 200 larger, background particles */}
        <Particles count={200} size={0.08} opacity={0.08} color={color} />
      </Canvas>
    </div>
  );
}
