import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../../store';

interface PhotoStarsProps {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
  fileIds: number[];
}

/**
 * 照片星空粒子系统
 *
 * 增强版：多层光晕 + 发光模式 + 时间微动
 */
export default function PhotoStars({ positions, colors, sizes, count, fileIds }: PhotoStarsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const manifest = useAppStore((s) => s.manifest);
  const selectFile = useAppStore((s) => s.selectFile);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const ids = new Float32Array(count);
    for (let i = 0; i < count; i++) ids[i] = i;
    geo.setAttribute('fileIndex', new THREE.BufferAttribute(ids, 1));
    return geo;
  }, [positions, colors, sizes, count]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float aSize;
        varying vec3 vColor;
        varying float vSize;
        uniform float uTime;

        // 简单伪随机
        float hash(float n) {
          return fract(sin(n) * 43758.5453123);
        }

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float size = aSize * (700.0 / -mvPosition.z);
          gl_PointSize = clamp(size, 1.0, 20.0);
          gl_Position = projectionMatrix * mvPosition;
          // 颜色随亮度提升
          vColor = color * 1.5;
          vSize = aSize;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vSize;

        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;

          // 超广外圈柔光
          float outerGlow = exp(-d * 0.9) * 0.28;
          // 中层光晕（增强）
          float midGlow = exp(-d * 2.8) * 0.50;
          // 内层亮光（增强）
          float innerGlow = exp(-d * 5.5) * 0.35;
          // 耀眼核心（大幅增强）
          float core = exp(-d * 10.0) * 0.65;
          // 极亮点
          float hotCore = exp(-d * 20.0) * 0.45;

          float alpha = outerGlow + midGlow + innerGlow + core + hotCore;

          if (alpha < 0.005) discard;

          // 发光模式：颜色叠加增强，白热核心
          vec3 glowColor = vColor + vec3(hotCore * 0.6);
          gl_FragColor = vec4(glowColor, alpha * 0.98);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useFrame((state) => {
    if (material.uniforms) {
      material.uniforms.uTime.value = state.clock.elapsedTime * 0.05;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.00003;
    }
  });

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.index !== undefined && e.index < count && manifest) {
        const fileId = fileIds[e.index];
        const file = manifest.files.find((f) => f.id === fileId);
        if (file) selectFile(file);
      }
    },
    [fileIds, count, manifest, selectFile]
  );

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      onClick={handleClick}
      frustumCulled={true}
    />
  );
}
