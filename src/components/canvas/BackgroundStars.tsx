import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 背景微小星光层 — 增强空间深度感
 * 散布在更大范围内的极微光点
 */
export default function BackgroundStars() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 800;

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    // 散布在比主层更大的球形空间内
    const radius = 70;

    for (let i = 0; i < count; i++) {
      // 随机球面 + 径向深度
      const phi = Math.acos(1 - 2 * Math.random());
      const theta = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // 微弱白色/蓝色星光
      const brightness = 0.15 + Math.random() * 0.25;
      const tint = Math.random();
      if (tint < 0.3) {
        // 暖色
        col[i * 3] = brightness;
        col[i * 3 + 1] = brightness * 0.7;
        col[i * 3 + 2] = brightness * 0.5;
      } else if (tint < 0.5) {
        // 冷色
        col[i * 3] = brightness * 0.5;
        col[i * 3 + 1] = brightness * 0.7;
        col[i * 3 + 2] = brightness;
      } else {
        // 白色
        col[i * 3] = brightness;
        col[i * 3 + 1] = brightness;
        col[i * 3 + 2] = brightness;
      }
    }

    return { positions: pos, colors: col };
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: /* glsl */ `
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 2.5 * (140.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
            vColor = color;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float alpha = exp(-d * 3.0) * 0.7;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(vColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useFrame(() => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.00002;
      pointsRef.current.rotation.x += 0.00001;
    }
  });

  return (
    <points
      ref={pointsRef}
      geometry={
        new THREE.BufferGeometry()
          .setAttribute('position', new THREE.BufferAttribute(positions, 3))
          .setAttribute('color', new THREE.BufferAttribute(colors, 3))
      }
      material={material}
      frustumCulled={false}
    />
  );
}
