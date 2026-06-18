import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useAppStore } from '../../store';
import PhotoStars from './PhotoStars';
import BackgroundStars from './BackgroundStars';
import CameraController from './CameraController';
import RaycasterSetup from './RaycasterSetup';
import CentralGlow from './CentralGlow';
import ConnectionLines from './ConnectionLines';

function StarField() {
  const manifest = useAppStore((s) => s.manifest);

  const { positions, colors, fileIds, sizes } = useMemo(() => {
    if (!manifest) {
      return { positions: new Float32Array(), colors: new Float32Array(), fileIds: [], sizes: new Float32Array() };
    }

    const count = manifest.files.length;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const ids: number[] = [];

    // Fibonacci 球面分布 + 随机扰动，空间感更强
    const baseRadius = 50;
    const phi = Math.PI * (3 - Math.sqrt(5));

    // 用确定性种子生成伪随机，避免每次渲染位置不同
    let seed = 42;

    for (let i = 0; i < count; i++) {
      const file = manifest.files[i];
      const t = i / (count - 1 || 1);

      // 伪随机函数
      seed = (seed * 16807 + 0) % 2147483647;
      const r1 = (seed - 1) / 2147483646;
      seed = (seed * 16807 + 0) % 2147483647;
      const r2 = (seed - 1) / 2147483646;
      seed = (seed * 16807 + 0) % 2147483647;
      const r3 = (seed - 1) / 2147483646;

      // 基础 Fibonacci 球面位置
      const y_base = 1 - t * 2;
      const radiusAtY = Math.sqrt(1 - y_base * y_base);
      const theta = phi * i;

      // 随机抖动：位置偏移 ±6 单位
      const jitterAmount = 6.0;
      const px = Math.cos(theta) * radiusAtY * baseRadius + (r1 - 0.5) * jitterAmount * 2;
      const py = y_base * baseRadius + (r2 - 0.5) * jitterAmount * 2;
      const pz = Math.sin(theta) * radiusAtY * baseRadius + (r3 - 0.5) * jitterAmount * 2;

      // 半径也随机微调 ±8 单位
      const dist = Math.sqrt(px * px + py * py + pz * pz);
      const radiusJitter = 1.0 + (r1 - 0.5) * 0.32; // ±16%
      const scale = (baseRadius * radiusJitter) / (dist || 1);

      pos[i * 3] = px * scale;
      pos[i * 3 + 1] = py * scale;
      pos[i * 3 + 2] = pz * scale;

      // 颜色区分照片/视频，并加入随机抖动
      const jitter = 0.12;
      if (file.type === 'video') {
        // 视频：冰蓝色
        col[i * 3] = 0.15 + (Math.random() - 0.5) * jitter;
        col[i * 3 + 1] = 0.65 + (Math.random() - 0.5) * jitter;
        col[i * 3 + 2] = 0.9 + (Math.random() - 0.5) * jitter;
      } else {
        // 照片：暖金色系
        col[i * 3] = 0.95 + (Math.random() - 0.5) * jitter;
        col[i * 3 + 1] = 0.6 + (Math.random() - 0.5) * jitter;
        col[i * 3 + 2] = 0.25 + (Math.random() - 0.5) * jitter;
      }
      ids.push(file.id);
      siz[i] = file.type === 'video' ? 3.0 : 2.2;
    }

    return { positions: pos, colors: col, fileIds: ids, sizes: siz };
  }, [manifest]);

  if (!manifest) return null;

  return (
    <PhotoStars
      positions={positions}
      colors={colors}
      sizes={sizes}
      count={manifest.files.length}
      fileIds={fileIds}
    />
  );
}

export default function Scene() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <Canvas
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        camera={{ position: [0, 0, 80], fov: 50, near: 0.1, far: 300 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#04050a']} />
        <RaycasterSetup />
        <CentralGlow />
        <ConnectionLines />
        <BackgroundStars />
        <StarField />
        <CameraController />
        <EffectComposer>
          <Bloom
            intensity={0.9}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
          <Vignette darkness={0.5} offset={0.1} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
