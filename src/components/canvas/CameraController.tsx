import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 自定义轨道相机控制器
 * 支持拖拽旋转 + 滚轮缩放，带惯性阻尼
 */
export default function CameraController() {
  const { camera, gl } = useThree();

  const isDragging = useRef(false);
  const pointerDown = useRef(false);
  const hasMoved = useRef(false);
  const prevMouse = useRef(new THREE.Vector2());
  const spherical = useRef(new THREE.Spherical(80, Math.PI / 3, 0));
  const autoRotate = useRef(true);
  const autoRotateSpeed = 0.12;
  const damping = 0.94;
  const DRAG_THRESHOLD = 3; // pixels before considered a drag

  // Velocity for inertia
  const velocity = useRef({ theta: 0, phi: 0 });

  useEffect(() => {
    camera.position.setFromSpherical(spherical.current);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.current = true;
      autoRotate.current = false;
      hasMoved.current = false;
      prevMouse.current.set(e.clientX, e.clientY);
      velocity.current = { theta: 0, phi: 0 };
    };

    const onPointerMove = (e: PointerEvent) => {
      // 必须按下鼠标才能拖拽
      if (!pointerDown.current) return;

      const dx = e.clientX - prevMouse.current.x;
      const dy = e.clientY - prevMouse.current.y;

      // Only start dragging after exceeding threshold
      if (!hasMoved.current) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        hasMoved.current = true;
        isDragging.current = true;
      }

      prevMouse.current.set(e.clientX, e.clientY);
      velocity.current.theta = -dx * 0.005;
      velocity.current.phi = -dy * 0.005;

      spherical.current.theta += velocity.current.theta;
      spherical.current.phi += velocity.current.phi;
      spherical.current.phi = Math.max(0.15, Math.min(Math.PI * 0.85, spherical.current.phi));

      const pos = new THREE.Vector3().setFromSpherical(spherical.current);
      camera.position.copy(pos);
      camera.lookAt(0, 0, 0);
    };

    const onPointerUp = () => {
      pointerDown.current = false;
      isDragging.current = false;
      hasMoved.current = false;
      setTimeout(() => {
        if (!isDragging.current) autoRotate.current = true;
      }, 2000);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.current.radius += e.deltaY * 0.05;
      spherical.current.radius = Math.max(8, Math.min(180, spherical.current.radius));

      const pos = new THREE.Vector3().setFromSpherical(spherical.current);
      camera.position.copy(pos);
      camera.lookAt(0, 0, 0);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    // 惯性阻尼
    if (!isDragging.current && !autoRotate.current) {
      velocity.current.theta *= damping;
      velocity.current.phi *= damping;

      if (Math.abs(velocity.current.theta) > 0.0001 || Math.abs(velocity.current.phi) > 0.0001) {
        spherical.current.theta += velocity.current.theta;
        spherical.current.phi += velocity.current.phi;
        spherical.current.phi = Math.max(0.15, Math.min(Math.PI * 0.85, spherical.current.phi));

        const pos = new THREE.Vector3().setFromSpherical(spherical.current);
        camera.position.copy(pos);
        camera.lookAt(0, 0, 0);
      }
    }

    // 自动旋转
    if (autoRotate.current && !isDragging.current) {
      const dt = Math.min(delta, 0.1);
      spherical.current.theta += autoRotateSpeed * dt;
      const pos = new THREE.Vector3().setFromSpherical(spherical.current);
      camera.position.copy(pos);
      camera.lookAt(0, 0, 0);
    }
  });

  return null;
}
