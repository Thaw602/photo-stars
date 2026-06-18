import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../../store';

/**
 * ConnectionLines — 从中心光源向外围粒子发散的细线
 *
 * 每张照片/视频对应一条从原点 (0,0,0) 到粒子位置的半透明细线，
 * 营造星座连线般的视觉效果。
 */
export default function ConnectionLines() {
  const manifest = useAppStore((s) => s.manifest);
  const linesRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    if (!manifest) return null;

    const count = manifest.files.length;
    // 每条线段 2 个顶点：中心 + 粒子位置
    const positions = new Float32Array(count * 2 * 3);
    // 每个顶点的颜色（用于渐变效果）
    const colors = new Float32Array(count * 2 * 3);

    const baseRadius = 50;
    const phi = Math.PI * (3 - Math.sqrt(5));

    // 与 Scene.tsx 中 StarField 完全相同的确定性伪随机位置计算
    let seed = 42;

    for (let i = 0; i < count; i++) {
      const file = manifest.files[i];
      const t = i / (count - 1 || 1);

      seed = (seed * 16807 + 0) % 2147483647;
      const r1 = (seed - 1) / 2147483646;
      seed = (seed * 16807 + 0) % 2147483647;
      const r2 = (seed - 1) / 2147483646;
      seed = (seed * 16807 + 0) % 2147483647;
      const r3 = (seed - 1) / 2147483646;

      const y_base = 1 - t * 2;
      const radiusAtY = Math.sqrt(1 - y_base * y_base);
      const theta = phi * i;

      const jitterAmount = 6.0;
      const px = Math.cos(theta) * radiusAtY * baseRadius + (r1 - 0.5) * jitterAmount * 2;
      const py = y_base * baseRadius + (r2 - 0.5) * jitterAmount * 2;
      const pz = Math.sin(theta) * radiusAtY * baseRadius + (r3 - 0.5) * jitterAmount * 2;

      const dist = Math.sqrt(px * px + py * py + pz * pz);
      const radiusJitter = 1.0 + (r1 - 0.5) * 0.32;
      const scale = (baseRadius * radiusJitter) / (dist || 1);

      const fx = px * scale;
      const fy = py * scale;
      const fz = pz * scale;

      // 偶数顶点：中心 (0,0,0)
      const ci = i * 2;
      positions[ci * 3] = 0;
      positions[ci * 3 + 1] = 0;
      positions[ci * 3 + 2] = 0;

      // 中心端颜色：较亮
      const isVideo = file.type === 'video';
      if (isVideo) {
        colors[ci * 3] = 0.5;
        colors[ci * 3 + 1] = 0.8;
        colors[ci * 3 + 2] = 1.0;
      } else {
        colors[ci * 3] = 1.0;
        colors[ci * 3 + 1] = 0.85;
        colors[ci * 3 + 2] = 0.6;
      }

      // 奇数顶点：粒子位置
      positions[(ci + 1) * 3] = fx;
      positions[(ci + 1) * 3 + 1] = fy;
      positions[(ci + 1) * 3 + 2] = fz;

      // 粒子端颜色：较暗（远端渐隐）
      if (isVideo) {
        colors[(ci + 1) * 3] = 0.15;
        colors[(ci + 1) * 3 + 1] = 0.4;
        colors[(ci + 1) * 3 + 2] = 0.7;
      } else {
        colors[(ci + 1) * 3] = 0.7;
        colors[(ci + 1) * 3 + 1] = 0.4;
        colors[(ci + 1) * 3 + 2] = 0.15;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [manifest]);

  const material = useMemo(() => {
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
  }, []);

  // 缓慢旋转，与 StarField 同步
  useFrame(() => {
    if (linesRef.current) {
      linesRef.current.rotation.y += 0.00003;
    }
  });

  if (!geometry) return null;

  return (
    <lineSegments ref={linesRef} geometry={geometry} material={material} />
  );
}
