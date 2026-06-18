import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * CentralGlow — 画面中心光源
 *
 * 使用 Canvas 生成径向渐变纹理，通过多层 Sprite 叠加产生明亮白光光源。
 * 灵感来源：https://shiyun.cohenjikan.com
 */
function createGlowTexture(
  innerColor: string,
  midColor: string,
  outerColor: string,
  farColor: string,
  size: number = 256,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);

  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.08, innerColor);       // hold core
  gradient.addColorStop(0.2, midColor);          // mid glow
  gradient.addColorStop(0.45, outerColor);       // outer glow
  gradient.addColorStop(0.72, farColor);         // far outer
  gradient.addColorStop(1, 'rgba(255,255,255,0)'); // edge fade

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 单层光晕 — 始终面向相机的 Sprite
 */
function GlowLayer({
  texture,
  scale,
  opacity,
  color,
  speed = 0,
}: {
  texture: THREE.CanvasTexture;
  scale: number;
  opacity: number;
  color: THREE.Color;
  speed?: number;
}) {
  const material = useMemo(() => {
    return new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      opacity,
      color,
    });
  }, [texture, opacity, color]);

  const spriteRef = useRef<THREE.Sprite>(null);

  useFrame((state) => {
    if (spriteRef.current && speed !== 0) {
      spriteRef.current.material.opacity =
        opacity + Math.sin(state.clock.elapsedTime * speed) * opacity * 0.12;
    }
  });

  return <sprite ref={spriteRef} material={material} scale={[scale, scale, 1]} />;
}

export default function CentralGlow() {
  // 内核纹理 — 纯白高亮核心
  const coreTexture = useMemo(
    () => createGlowTexture(
      'rgba(255,255,255,1.0)',        // pure white core
      'rgba(255,255,255,0.75)',       // white mid
      'rgba(255,250,240,0.30)',       // very faint warm white
      'rgba(255,245,230,0.06)',
      256,
    ),
    [],
  );

  // 中层纹理 — 白光中环
  const midTexture = useMemo(
    () => createGlowTexture(
      'rgba(255,255,255,0.80)',
      'rgba(255,255,250,0.45)',
      'rgba(255,248,235,0.15)',
      'rgba(255,240,220,0.03)',
      256,
    ),
    [],
  );

  // 外层纹理 — 大范围白光光晕
  const outerTexture = useMemo(
    () => createGlowTexture(
      'rgba(255,255,255,0.35)',
      'rgba(255,255,250,0.18)',
      'rgba(255,248,240,0.06)',
      'rgba(255,240,225,0.015)',
      256,
    ),
    [],
  );

  // 超大外层 — 最柔和的漫射光
  const farTexture = useMemo(
    () => createGlowTexture(
      'rgba(255,255,255,0.12)',
      'rgba(255,255,252,0.06)',
      'rgba(255,250,245,0.02)',
      'rgba(255,245,235,0.005)',
      256,
    ),
    [],
  );

  const coreColor = useMemo(() => new THREE.Color('#ffffff'), []);
  const midColor = useMemo(() => new THREE.Color('#fffffa'), []);
  const outerColor = useMemo(() => new THREE.Color('#fffef8'), []);
  const farColor = useMemo(() => new THREE.Color('#fffdf5'), []);

  return (
    <group position={[0, 0, 0]}>
      {/* 超大外层 — 柔和漫射 */}
      <GlowLayer
        texture={farTexture}
        scale={50}
        opacity={0.85}
        color={farColor}
        speed={0.5}
      />
      {/* 外环 — 大范围白光 */}
      <GlowLayer
        texture={outerTexture}
        scale={28}
        opacity={0.9}
        color={outerColor}
        speed={0.65}
      />
      {/* 中环 */}
      <GlowLayer
        texture={midTexture}
        scale={12}
        opacity={0.95}
        color={midColor}
        speed={0.8}
      />
      {/* 内核 — 纯白亮核 */}
      <GlowLayer
        texture={coreTexture}
        scale={4.5}
        opacity={1.0}
        color={coreColor}
      />
    </group>
  );
}
