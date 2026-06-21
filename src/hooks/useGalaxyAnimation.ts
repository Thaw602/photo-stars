import { useRef, useCallback } from 'react';
import { useAppStore } from '../store';

export type AnimPhase = 'orbs' | 'expand_gold' | 'expand_blue' | 'dual';

interface OrbState {
  px: number; py: number; r: number;
}

export interface TickOutput {
  phase: AnimPhase;
  goldOrb: OrbState | null;
  blueOrb: OrbState | null;
  expandGold: number;
  expandBlue: number;
  flashAlpha: number;
  focusCurrent: { x: number; y: number; z: number };
}

const ORBIT_RADIUS_FRAC = 0.15;
const ORB_RADIUS_FRAC = 0.08;
const ORBIT_SPEED = 1.0;
const EXPAND_DURATION = 1.5;
const FLASH_DURATION = 0.2;
const BLUE_DELAY = 0.8;
const FOCUS_DURATION = 0.8;

export function useGalaxyAnimation() {
  const setPhase = useAppStore(s => s.setPhase);

  const startTimeRef = useRef(0);
  const goldExpandStart = useRef(0);
  const blueExpandStart = useRef(0);
  const focusTarget = useRef({ x: 0, y: 0, z: 0 });
  const focusCurrent = useRef({ x: 0, y: 0, z: 0 });
  const focusStartTime = useRef(0);
  const prevFocusTarget = useRef({ x: 0, y: 0, z: 0 });

  const tick = useCallback((timestamp: number, w: number, h: number): TickOutput => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = (timestamp - startTimeRef.current) / 1000;
    const minDim = Math.min(w, h);
    const cx = w / 2, cy = h / 2;
    const orbitR = minDim * ORBIT_RADIUS_FRAC;
    const orbR = minDim * ORB_RADIUS_FRAC;
    const currentPhase = useAppStore.getState().phase;

    // Orb positions
    const goldAngle = elapsed * ORBIT_SPEED;
    const blueAngle = goldAngle + Math.PI;
    const goldR = orbitR * (1 + Math.sin(elapsed * 0.7) * 0.08);
    const blueR = orbitR * (1 + Math.cos(elapsed * 0.7) * 0.08);
    const goldOrb: OrbState = {
      px: cx + Math.cos(goldAngle) * goldR,
      py: cy + Math.sin(goldAngle) * goldR * 0.7,
      r: orbR,
    };
    const blueOrb: OrbState = {
      px: cx + Math.cos(blueAngle) * blueR,
      py: cy + Math.sin(blueAngle) * blueR * 0.7,
      r: orbR,
    };

    // Expansion progress
    let expandGold = 0, expandBlue = 0, flashAlpha = 0;
    if (currentPhase === 'expand_gold' || currentPhase === 'expand_blue' || currentPhase === 'dual') {
      if (goldExpandStart.current === 0) goldExpandStart.current = timestamp;
      const goldElapsed = (timestamp - goldExpandStart.current) / 1000;
      if (goldElapsed < FLASH_DURATION) {
        flashAlpha = 1 - goldElapsed / FLASH_DURATION;
      }
      if (goldElapsed < EXPAND_DURATION) {
        const t = goldElapsed / EXPAND_DURATION;
        expandGold = 1 - Math.pow(1 - t, 3);
      } else {
        expandGold = 1;
        if (currentPhase === 'expand_gold') {
          const sinceGoldDone = goldElapsed - EXPAND_DURATION;
          if (sinceGoldDone >= BLUE_DELAY) {
            setPhase('expand_blue');
            blueExpandStart.current = timestamp;
          }
        }
      }
    }
    if (currentPhase === 'expand_blue' || currentPhase === 'dual') {
      if (blueExpandStart.current === 0) blueExpandStart.current = timestamp;
      const blueElapsed = (timestamp - blueExpandStart.current) / 1000;
      if (blueElapsed < FLASH_DURATION) {
        flashAlpha = Math.max(flashAlpha, 1 - blueElapsed / FLASH_DURATION);
      }
      if (blueElapsed < EXPAND_DURATION) {
        const t = blueElapsed / EXPAND_DURATION;
        expandBlue = 1 - Math.pow(1 - t, 3);
      } else {
        expandBlue = 1;
        if (currentPhase === 'expand_blue') setPhase('dual');
      }
    }

    // Focus lerp
    const ft = focusTarget.current;
    const pc = prevFocusTarget.current;
    if (ft.x !== pc.x || ft.y !== pc.y || ft.z !== pc.z) {
      focusStartTime.current = timestamp;
      prevFocusTarget.current = { ...ft };
    }
    const focusElapsed = (timestamp - focusStartTime.current) / 1000;
    const focusT = Math.min(1, focusElapsed / FOCUS_DURATION);
    const easedFocusT = focusT < 1
      ? 1 - Math.pow(1 - focusT, 3)
      : 1;
    focusCurrent.current = {
      x: pc.x + (ft.x - pc.x) * easedFocusT,
      y: pc.y + (ft.y - pc.y) * easedFocusT,
      z: pc.z + (ft.z - pc.z) * easedFocusT,
    };

    // Orb visibility
    const showGoldOrb = currentPhase === 'orbs' || currentPhase === 'expand_gold';
    const showBlueOrb = currentPhase === 'orbs' ||
      (currentPhase === 'expand_gold' && expandGold >= 1) ||
      currentPhase === 'expand_blue';

    return {
      phase: currentPhase,
      goldOrb: showGoldOrb ? goldOrb : null,
      blueOrb: showBlueOrb ? blueOrb : null,
      expandGold,
      expandBlue,
      flashAlpha,
      focusCurrent: focusCurrent.current,
    };
  }, [setPhase]);

  const triggerGold = useCallback(() => {
    if (useAppStore.getState().phase !== 'orbs') return;
    setPhase('expand_gold');
  }, [setPhase]);

  const setFocus = useCallback((t: { x: number; y: number; z: number } | null) => {
    prevFocusTarget.current = { ...focusCurrent.current };
    if (t) {
      focusTarget.current = { ...t };
    } else {
      focusTarget.current = { x: 0, y: 0, z: 0 };
    }
    focusStartTime.current = performance.now();
  }, []);

  return { tick, triggerGold, setFocus };
}
