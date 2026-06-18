import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * 设置 raycaster 的 Points 阈值，使点击更容易命中粒子
 */
export default function RaycasterSetup() {
  const { raycaster } = useThree();

  useEffect(() => {
    if (raycaster) {
      raycaster.params.Points.threshold = 5.0;
    }
  }, [raycaster]);

  return null;
}
