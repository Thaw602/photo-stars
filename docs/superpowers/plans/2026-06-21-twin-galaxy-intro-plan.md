# 双星系开场动画 + 双视角聚焦 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前双星系页面改为：开场双光球绕转 → 点击展开 → 双星系交互 + 焦点切换

**Architecture:** 新增 `useGalaxyAnimation` hook 管理动画阶段机（ORBS→EXPAND_GOLD→EXPAND_BLUE→DUAL）；GalaxyCanvas 按阶段分派不同渲染路径；store 增加 `phase` 字段供 HUD 隐藏；焦点切换通过 project3D 的 3D 坐标偏移实现，非新增摄像机。

**Tech Stack:** React 19, TypeScript 5, Zustand 5, HTML5 Canvas 2D

## Global Constraints

- 不得引入任何新 npm 依赖（零成本）
- `npm run build` 必须零 TS 错误（`noUnusedLocals: true`, `noUnusedParameters: true`）
- 不破坏现有功能：拖拽旋转、缩放、搜索、上传、查看器
- 视频星系面积 ≈ 照片星系的 50%（`VIDEO_GALAXY_SCALE = 0.70`）

---

### Task 1: Store — 添加 phase 字段

**Files:**
- Modify: `src/store/index.ts`

**Interfaces:**
- Produces: `AppState.phase: 'orbs' | 'expand_gold' | 'expand_blue' | 'dual'`, `AppState.setPhase: (p) => void`

- [ ] **Step 1: 在 AppState interface 中添加 phase 字段**

在 `AppState` interface 中，`showViewer` 之后插入：

```typescript
  // Animation phase
  phase: 'orbs' | 'expand_gold' | 'expand_blue' | 'dual';
  setPhase: (p: 'orbs' | 'expand_gold' | 'expand_blue' | 'dual') => void;
```

- [ ] **Step 2: 在 store 初始值中添加默认值和 setter**

在 `create<AppState>((set) => ({` 块中，`showViewer: false,` 之后插入：

```typescript
  phase: 'orbs',
  setPhase: (p) => set({ phase: p }),
```

- [ ] **Step 3: 运行 build 确认无 TS 错误**

Run: `cd "D:/photo-stars" && npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add phase field to store for animation state machine

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 创建 useGalaxyAnimation hook

**Files:**
- Create: `src/hooks/useGalaxyAnimation.ts`

**Interfaces:**
- Consumes: `useAppStore` — `phase`, `setPhase`
- Produces:
  - `tick(timestamp: number, w: number, h: number): { phase, orbs, expandGold, expandBlue, focusCurrent, flashAlpha }`
  - `triggerGold(): void`
  - `hitTestOrb(mx: number, my: number): 'gold' | 'blue' | null`
  - `setFocus(t: {x,y,z} | null): void`

- [ ] **Step 1: 创建 hook 文件和类型定义**

```typescript
// src/hooks/useGalaxyAnimation.ts
import { useRef, useCallback } from 'react';
import { useAppStore } from '../store';

export type AnimPhase = 'orbs' | 'expand_gold' | 'expand_blue' | 'dual';

interface OrbState {
  px: number; py: number; r: number;
}

interface TickOutput {
  phase: AnimPhase;
  goldOrb: OrbState | null;
  blueOrb: OrbState | null;
  expandGold: number;   // 0→1 eased
  expandBlue: number;   // 0→1 eased
  flashAlpha: number;   // 0→1→0 during flash
  focusCurrent: { x: number; y: number; z: number };
}

export function useGalaxyAnimation() {
  const phase = useAppStore(s => s.phase);
  const setPhase = useAppStore(s => s.setPhase);

  // Internal refs — not reactive, read/written in tick()
  const startTimeRef = useRef(0);
  const goldExpandStart = useRef(0);
  const blueExpandStart = useRef(0);
  const flashStart = useRef(0);
  const focusTarget = useRef({ x: 0, y: 0, z: 0 });
  const focusCurrent = useRef({ x: 0, y: 0, z: 0 });
  const focusStartTime = useRef(0);
  const focusDuration = 0.8; // seconds
  const prevFocusTarget = useRef({ x: 0, y: 0, z: 0 });

  const ORBIT_RADIUS = 0.15;  // fraction of min(w,h)
  const ORB_RADIUS = 0.08;    // fraction of min(w,h)
  const ORBIT_SPEED = 1.0;    // rad/s
  const EXPAND_DURATION = 1.5; // seconds
  const FLASH_DURATION = 0.2;  // seconds
  const BLUE_DELAY = 0.8;      // seconds after gold finishes

  const tick = useCallback((timestamp: number, w: number, h: number): TickOutput => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = (timestamp - startTimeRef.current) / 1000;
    const minDim = Math.min(w, h);
    const cx = w / 2, cy = h / 2;
    const orbitR = minDim * ORBIT_RADIUS;
    const orbR = minDim * ORB_RADIUS;
    const currentPhase = useAppStore.getState().phase;

    // --- Orb positions (always computed) ---
    const goldAngle = elapsed * ORBIT_SPEED;
    const blueAngle = goldAngle + Math.PI;
    // Slight elliptical breathing
    const goldR = orbitR * (1 + Math.sin(elapsed * 0.7) * 0.08);
    const blueR = orbitR * (1 + Math.cos(elapsed * 0.7) * 0.08);
    const goldOrb: OrbState = {
      px: cx + Math.cos(goldAngle) * goldR,
      py: cy + Math.sin(goldAngle) * goldR * 0.7, // elliptical
      r: orbR,
    };
    const blueOrb: OrbState = {
      px: cx + Math.cos(blueAngle) * blueR,
      py: cy + Math.sin(blueAngle) * blueR * 0.7,
      r: orbR,
    };

    // --- Expansion progress ---
    let expandGold = 0, expandBlue = 0, flashAlpha = 0;
    if (currentPhase === 'expand_gold' || currentPhase === 'expand_blue' || currentPhase === 'dual') {
      if (goldExpandStart.current === 0) goldExpandStart.current = timestamp;
      const goldElapsed = (timestamp - goldExpandStart.current) / 1000;
      // Flash phase
      if (goldElapsed < FLASH_DURATION) {
        flashAlpha = 1 - goldElapsed / FLASH_DURATION;
      }
      // Expansion easeOutCubic
      if (goldElapsed < EXPAND_DURATION) {
        const t = goldElapsed / EXPAND_DURATION;
        expandGold = 1 - Math.pow(1 - t, 3);
      } else {
        expandGold = 1;
        // Auto-trigger blue after delay
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

    // --- Focus lerp ---
    const ft = focusTarget.current;
    const pc = prevFocusTarget.current;
    if (ft.x !== pc.x || ft.y !== pc.y || ft.z !== pc.z) {
      focusStartTime.current = timestamp;
      prevFocusTarget.current = { ...ft };
    }
    const focusElapsed = (timestamp - focusStartTime.current) / 1000;
    const focusT = Math.min(1, focusElapsed / focusDuration);
    const easedFocusT = focusT < 1
      ? 1 - Math.pow(1 - focusT, 3) // easeOutCubic for smooth arrival
      : 1;
    focusCurrent.current = {
      x: pc.x + (ft.x - pc.x) * easedFocusT,
      y: pc.y + (ft.y - pc.y) * easedFocusT,
      z: pc.z + (ft.z - pc.z) * easedFocusT,
    };

    return {
      phase: currentPhase,
      goldOrb: currentPhase === 'orbs' || currentPhase === 'expand_gold' ? goldOrb : null,
      blueOrb: currentPhase === 'orbs' || (currentPhase === 'expand_gold' && expandGold >= 1) || currentPhase === 'expand_blue' ? blueOrb : null,
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

  const hitTestOrb = useCallback((mx: number, my: number): 'gold' | 'blue' | null => {
    // Returns which orb was clicked. orb positions are computed from last tick state.
    // Called after tick() so orb positions are fresh from the render loop.
    return null; // Hit testing done in canvas where orb positions are available
  }, []);

  const setFocus = useCallback((t: { x: number; y: number; z: number } | null) => {
    if (t) {
      prevFocusTarget.current = { ...focusCurrent.current };
      focusTarget.current = { ...t };
      focusStartTime.current = performance.now();
    } else {
      prevFocusTarget.current = { ...focusCurrent.current };
      focusTarget.current = { x: 0, y: 0, z: 0 };
      focusStartTime.current = performance.now();
    }
  }, []);

  return { tick, triggerGold, setFocus };
}
```

- [ ] **Step 2: 验证 hook 文件无语法错误**

Run: `cd "D:/photo-stars" && npx tsc --noEmit src/hooks/useGalaxyAnimation.ts 2>&1 | head -20`
Expected: No errors (may show project config warnings, that's OK)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGalaxyAnimation.ts
git commit -m "feat: add useGalaxyAnimation hook with phase machine and focus system

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: GalaxyCanvas — 光球阶段渲染 + 点击处理

**Files:**
- Modify: `src/components/canvas/GalaxyCanvas.tsx`

**Interfaces:**
- Consumes: `useGalaxyAnimation().tick`, `useGalaxyAnimation().triggerGold`
- Produces: ORBS phase rendering (replaces current `!particlesRevealed` hint glow)

- [ ] **Step 1: 在 GalaxyCanvas 顶部 import hook 并调用**

在 component 函数体开头（`const canvasRef` 行之后）添加：

```typescript
const { tick, triggerGold, setFocus } = useGalaxyAnimation();
```

在 `const initParticles` 之前添加 render 阶段用的变量存储：

```typescript
const animStateRef = useRef<ReturnType<typeof tick> | null>(null);
```

移除旧变量（行 320）：
```typescript
// REMOVE:
const particlesRevealed = useRef(false); const revealStartTime = useRef(0); const revealProgress = useRef(0);
```

- [ ] **Step 2: 修改渲染循环开头 — 调用 tick()，替换旧 reveal 逻辑**

在 `const render = (timestamp: number) => {` （约第 394 行）之后，**替换**旧的 reveal 相关代码：

```typescript
// REMOVE this block:
// if (particlesRevealed.current && revealProgress.current < 1) { ... }
// const rp = revealProgress.current;

// ADD:
const animState = tick(timestamp, w, h);
animStateRef.current = animState;
const { phase, expandGold, expandBlue, flashAlpha, focusCurrent } = animState;
const rp = phase === 'orbs' ? 0 : (expandGold > 0 ? expandGold : 1);
```

- [ ] **Step 3: 渲染分派 — ORBS 阶段提前返回**

在 `const rp = ...` 行之后，`const zoom = zoomRef.current` 之前，插入 ORBS 阶段的分支渲染：

```typescript
// === ORBS phase: render orbs only, skip galaxy ===
if (phase === 'orbs' && animState.goldOrb && animState.blueOrb) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#020508';
  ctx.fillRect(0, 0, w, h);

  // Background deep stars (reuse dustRef / deepFieldRef)
  const bgOff = renderBgStarsToOffscreen(elapsed, 1.0, w, h, dpr);
  if (bgOff) ctx.drawImage(bgOff, 0, 0);

  ctx.globalCompositeOperation = 'lighter';

  // Draw gold orb
  const go = animState.goldOrb;
  for (let layer = 0; layer < 5; layer++) {
    const ratios = [2.0, 1.2, 0.6, 0.25, 0.08];
    const alphas = [0.015, 0.06, 0.22, 0.55, 0.9];
    const r = go.r * ratios[layer];
    const grad = ctx.createRadialGradient(go.px, go.py, 0, go.px, go.py, r);
    const a = alphas[layer];
    grad.addColorStop(0, `rgba(255,240,200,${a})`);
    grad.addColorStop(0.15, `rgba(255,220,160,${a * 0.7})`);
    grad.addColorStop(0.4, `rgba(200,150,80,${a * 0.2})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(go.px, go.py, r, 0, Math.PI * 2); ctx.fill();
  }

  // Draw blue orb
  const bo = animState.blueOrb;
  for (let layer = 0; layer < 5; layer++) {
    const ratios = [2.0, 1.2, 0.6, 0.25, 0.08];
    const alphas = [0.015, 0.05, 0.18, 0.45, 0.8];
    const r = bo.r * ratios[layer];
    const grad = ctx.createRadialGradient(bo.px, bo.py, 0, bo.px, bo.py, r);
    const a = alphas[layer];
    grad.addColorStop(0, `rgba(180,220,255,${a})`);
    grad.addColorStop(0.15, `rgba(150,200,240,${a * 0.7})`);
    grad.addColorStop(0.4, `rgba(80,140,200,${a * 0.2})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bo.px, bo.py, r, 0, Math.PI * 2); ctx.fill();
  }

  // Orbital trail lines
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = 'rgba(200,200,220,0.5)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 8]);
  const orbitCx = cx, orbitCy = cy;
  const orbitRx = animState.goldOrb.r * (0.15 / 0.08); // orbit radius in px
  const orbitRy = orbitRx * 0.7;
  ctx.beginPath();
  ctx.ellipse(orbitCx, orbitCy, orbitRx, orbitRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.globalCompositeOperation = 'source-over';
  animRef.current = requestAnimationFrame(render);
  return; // Skip rest of galaxy rendering
}
```

- [ ] **Step 4: 修改 handleMouseUp — ORBS 阶段点击光球**

在 `handleMouseUp` 中，修改 `!particlesRevealed.current` 检查块（约第 380 行）：

```typescript
// REMOVE:
// if (!particlesRevealed.current) { const cx = rect.width / 2, ... }

// ADD:
if (phase === 'orbs') {
  const as = animStateRef.current;
  if (as?.goldOrb) {
    const gdx = mx - as.goldOrb.px, gdy = my - as.goldOrb.py;
    if (Math.sqrt(gdx * gdx + gdy * gdy) < as.goldOrb.r * 1.8) {
      triggerGold();
      return;
    }
  }
  if (as?.blueOrb) {
    const bdx = mx - as.blueOrb.px, bdy = my - as.blueOrb.py;
    if (Math.sqrt(bdx * bdx + bdy * bdy) < as.blueOrb.r * 1.8) {
      triggerGold(); // clicking either orb starts with gold
      return;
    }
  }
  return;
}
```

需要注入 `phase` 变量到 handler 闭包中。在 `handleMouseMove` 和 `handleMouseUp` 中读取 `useAppStore.getState().phase`：

```typescript
// Inside handleMouseUp, after `const rect = ...`
const currentPhase = useAppStore.getState().phase;
```

- [ ] **Step 5: 修改 handleMouseMove — ORBS 阶段光标**

在 `handleMouseMove` 中，替换 `!particlesRevealed.current` 检查：

```typescript
// REMOVE:
// if (!particlesRevealed.current) { const cx = ... }

// ADD:
if (useAppStore.getState().phase === 'orbs') {
  const as = animStateRef.current;
  let nearOrb = false;
  if (as?.goldOrb) {
    const gdx = mx - as.goldOrb.px, gdy = my - as.goldOrb.py;
    if (Math.sqrt(gdx * gdx + gdy * gdy) < as.goldOrb.r * 1.8) nearOrb = true;
  }
  if (!nearOrb && as?.blueOrb) {
    const bdx = mx - as.blueOrb.px, bdy = my - as.blueOrb.py;
    if (Math.sqrt(bdx * bdx + bdy * bdy) < as.blueOrb.r * 1.8) nearOrb = true;
  }
  if (canvasRef.current) canvasRef.current.style.cursor = nearOrb ? 'pointer' : 'default';
  return;
}
```

- [ ] **Step 6: 在 invoke 渲染循环中，核心辉光处加入 phase 条件**

在主星系核心辉光渲染代码块（约第 406 行，`const coreR = Math.min(w, h) * 0.13 * CORE_SCALE;` 之前）和视频核心辉光代码块（约第 408 行，`{ const vgCenter = ...`）外包裹条件：

```typescript
// Only draw core glows in dual phase (or during expansion with progress)
if (phase === 'dual' || expandGold > 0.3) {
  // ... existing main core glow code ...
}
if (phase === 'dual' || expandBlue > 0.3) {
  // ... existing video core glow code ...
}
```

- [ ] **Step 7: 在 invoke 渲染循环中，移除旧的 hint glow**

删除 `if (rp < 0.02)` 块（约第 405 行），ORBS 阶段已经提前返回，这段不再需要：

```typescript
// REMOVE:
// if (rp < 0.02) { ctx.globalCompositeOperation = 'lighter'; const hintR = ... }
```

- [ ] **Step 8: Build 验证**

Run: `cd "D:/photo-stars" && npm run build`
Expected: 零 TS 错误

- [ ] **Step 9: Commit**

```bash
git add src/components/canvas/GalaxyCanvas.tsx
git commit -m "feat: add ORBS phase rendering with dual orb rotation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: GalaxyCanvas — 展开动画（粒子飞散 + 闪光）

**Files:**
- Modify: `src/components/canvas/GalaxyCanvas.tsx`

**Interfaces:**
- Consumes: `expandGold`, `expandBlue`, `flashAlpha` from tick()
- Produces: Particle position lerp during expansion, flash overlay

- [ ] **Step 1: 在 project3D 调用处添加展开 lerp**

在 `render` 函数中，每个 `project3D(p.x, p.y, p.z, ...)` 调用前插入 lerp 逻辑。最简洁的方式是创建一个包装函数，在所有 `project3D` 调用前定义：

```typescript
// After `const { phase, expandGold, expandBlue, flashAlpha, focusCurrent } = animState;`
// Define expansion lerp helpers
const expandForNode = (n: PhotoNode): number => n.isVideo ? expandBlue : expandGold;
const lerp3D = (x: number, y: number, z: number, t: number, originX: number, originY: number, originZ: number) => ({
  x: originX + (x - originX) * t,
  y: originY + (y - originY) * t,
  z: originZ + (z - originZ) * t,
});
```

然后在 node projection 循环中（`for (let i = 0; i < photoNodesRef.current.length; i++)`），修改 `project3D` 调用：

```typescript
// Before project3D:
const et = expandForNode(n);
const lpos = et < 1 ? lerp3D(n.x, n.y, n.z, et, 0, n.isVideo ? VIDEO_GALAXY_Y_OFFSET : 0, n.isVideo ? VIDEO_GALAXY_Z_OFFSET : 0) : { x: n.x, y: n.y, z: n.z };
const result = project3D(lpos.x, lpos.y, lpos.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
```

同样修改 spiral particle、halo、HII、inter-arm、dust lane 的 `project3D` 调用。对于主星系粒子（origin = (0,0,0)），t = expandGold。对于视频星系粒子（origin = (0, VIDEO_GALAXY_Y_OFFSET, VIDEO_GALAXY_Z_OFFSET)），t = expandBlue。

但视频星系粒子在当前代码中是一起渲染的（spiralRef 包含两者），需要区分。由于当前架构中 spiral particles 不区分星系，展开动画仅对 PHOTO NODES（可点击节点）做 lerp。背景旋臂粒子（spiralRef、haloRef 等）统一使用 expandGold 做 lerp（它们从主星系核心爆开）。

简化方案：所有非节点粒子使用 `expandGold`；节点使用其 `isVideo` 对应的 expand。

具体修改点：
1. 螺旋粒子 loop（第 394 行附近）的 `project3D` 调用前加 lerp
2. halo loop 的 `project3D` 调用前加 lerp
3. HII loop 的 `project3D` 调用前加 lerp
4. inter-arm loop 的 `project3D` 调用前加 lerp
5. dust lane loop 的 `project3D` 调用前加 lerp
6. planet loop 的 `project3D` 调用前加 lerp

对每个，在 `project3D(p.x, p.y, p.z, ...)` 前添加：

```typescript
const et = expandGold < 1 ? expandGold : 1;
const lx = p.x * et, ly = p.y * et, lz = p.z * et;
const result = project3D(lx, ly, lz, ...);
```

- [ ] **Step 2: 添加闪光覆盖层**

在渲染循环末尾（`ctx.globalCompositeOperation = 'source-over'` 之后，`ctx.globalAlpha = 1` 之前），添加闪光效果：

```typescript
// Flash overlay during expansion
if (flashAlpha > 0.005) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = flashAlpha * 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
```

- [ ] **Step 3: Build 验证**

Run: `cd "D:/photo-stars" && npm run build`
Expected: 零 TS 错误

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/GalaxyCanvas.tsx
git commit -m "feat: add expansion animation with particle lerp and flash overlay

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 视频星系参数更新 + 视频装饰粒子生成

**Files:**
- Modify: `src/components/canvas/GalaxyCanvas.tsx`

**Interfaces:**
- Consumes: Constants region at top of file
- Produces: Updated video galaxy appearance, video fill particles

- [ ] **Step 1: 更新常量**

在 constants 区域（第 76-81 行），替换视频星系参数：

```typescript
// Video galaxy — sister galaxy, ~50% area
const VIDEO_GALAXY_SCALE = 0.70;
const VIDEO_GALAXY_Z_OFFSET = -0.25;
const VIDEO_GALAXY_Y_OFFSET = -0.45;
const VIDEO_CORE_SCALE = 0.60;
const VIDEO_CONNECT_DIST_FACTOR = 0.70;
```

- [ ] **Step 2: 添加视频装饰粒子生成函数**

在 `generateUploadedPhotoNodes` 函数之后（约第 309 行），添加：

```typescript
interface VideoFillParticle {
  x: number; y: number; z: number;
  size: number;
  alpha: number;
  phase: number;
  speed: number;
}

function generateVideoFillParticles(rng: () => number): VideoFillParticle[] {
  const particles: VideoFillParticle[] = [];
  const COUNT = 4000;
  for (let i = 0; i < COUNT; i++) {
    const pos = placeOnSpiralArm(rng, VIDEO_GALAXY_SCALE);
    const x = pos.x;
    const y = pos.y + VIDEO_GALAXY_Y_OFFSET;
    const z = pos.z + VIDEO_GALAXY_Z_OFFSET;
    particles.push({
      x, y, z,
      size: 0.5 + rng() * 1.0,
      alpha: 0.15 + rng() * 0.35,
      phase: rng() * Math.PI * 2,
      speed: 1.5 + rng() * 2.5,
    });
  }
  return particles;
}
```

- [ ] **Step 3: 在组件中添加 ref 并在 initParticles 中生成**

在 component 函数体中，ref 声明区域（约第 317 行附近）添加：

```typescript
const videoFillRef = useRef<VideoFillParticle[]>([]);
```

在 `initParticles` callback 中（约第 339 行后）添加：

```typescript
const vfRng = createRNG(9973);
videoFillRef.current = generateVideoFillParticles(vfRng);
```

- [ ] **Step 4: 在渲染循环中绘制视频填充粒子**

在渲染循环中节点投影之前（约在 `nodeProj.sort(...)` 之前），添加视频填充粒子渲染：

```typescript
// Video fill particles (decorative, non-clickable)
if (videoFillRef.current.length > 0 && (phase === 'dual' || expandBlue > 0.3)) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < videoFillRef.current.length; i++) {
    const p = videoFillRef.current[i];
    const et = expandBlue < 1 ? expandBlue : 1;
    const lx = VIDEO_GALAXY_Y_OFFSET * (1 - et) + p.x * et; // lerp from offset origin
    const ly = VIDEO_GALAXY_Y_OFFSET + (p.y - VIDEO_GALAXY_Y_OFFSET) * et;
    const lz = VIDEO_GALAXY_Z_OFFSET + (p.z - VIDEO_GALAXY_Z_OFFSET) * et;
    const result = project3D(lx, ly, lz, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
    if (!result) continue;
    if (result.px < -20 || result.px > w + 20 || result.py < -20 || result.py > h + 20) continue;
    const twinkle = 0.6 + 0.4 * Math.sin(elapsed * p.speed + p.phase);
    const alpha = p.alpha * twinkle * expandBlue;
    if (alpha < 0.01) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(140,210,255,0.8)';
    ctx.beginPath();
    ctx.arc(result.px, result.py, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
```

- [ ] **Step 5: Build 验证**

Run: `cd "D:/photo-stars" && npm run build`
Expected: 零 TS 错误

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/GalaxyCanvas.tsx
git commit -m "feat: update video galaxy params + add 4000 decorative fill particles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 焦点切换 — 3D 偏移渲染 + 点击切换

**Files:**
- Modify: `src/components/canvas/GalaxyCanvas.tsx`

**Interfaces:**
- Consumes: `focusCurrent` from tick(), `setFocus` from hook
- Produces: Focus offset in all project3D calls, click-to-focus in DUAL phase

- [ ] **Step 1: 在 project3D 调用中统一减去 focusCurrent**

在所有 `project3D` 调用处，将 `(p.x, p.y, p.z, ...)` 改为 `(p.x - focusCurrent.x, p.y - focusCurrent.y, p.z - focusCurrent.z, ...)`。

由于修改点很多（~10 处 project3D 调用），逐个替换：

1. 螺旋粒子：`project3D(p.x - fc.x, p.y - fc.y, p.z - fc.z, ...)` 其中 `fc = focusCurrent`
2. halo、HII、inter-arm、dust lane、volume dust：同上
3. 节点：`project3D(lpos.x - fc.x, lpos.y - fc.y, lpos.z - fc.z, ...)`
4. 行星 trail + 行星本体：同上
5. 视频填充粒子：同上
6. 核心辉光投影：视频星系中心投影改为 `project3D(-fc.x, VIDEO_GALAXY_Y_OFFSET - fc.y, VIDEO_GALAXY_Z_OFFSET - fc.z, ...)`，主星系改为 `project3D(-fc.x, -fc.y, -fc.z, ...)`

为了代码简洁，在渲染循环中定义 `fc` 别名：

```typescript
const fc = focusCurrent;
```

- [ ] **Step 2: DUAL 阶段点击视频/照片粒子切换焦点**

在 `handleMouseUp` 中，`hit >= 0` 分支内（打开查看器之后），添加焦点切换：

```typescript
// After `selectFile(file)`:
if (phase === 'dual') {
  if (node.isVideo) {
    setFocus({ x: 0, y: VIDEO_GALAXY_Y_OFFSET, z: VIDEO_GALAXY_Z_OFFSET });
  } else {
    setFocus(null); // back to main galaxy
  }
}
```

- [ ] **Step 3: DUAL 阶段非聚焦星系降低透明度**

在节点渲染循环中（`for (let i = 0; i < nodeProj.length; i++)`），根据焦点调整透明度：

```typescript
// After `const { n, px, py, size, alpha } = nodeProj[i];`
const focusDist = Math.sqrt(fc.x * fc.x + fc.y * fc.y + fc.z * fc.z);
let focusAlphaMul = 1.0;
if (focusDist > 0.01) {
  const nIsVideo = n.isVideo;
  const focusingVideo = Math.abs(fc.y - VIDEO_GALAXY_Y_OFFSET) < 0.1;
  if (focusingVideo && !nIsVideo) focusAlphaMul = 0.65; // dim main galaxy
  if (!focusingVideo && nIsVideo) focusAlphaMul = 0.65; // dim video galaxy
}
const finalAlpha = alpha * focusAlphaMul;
// Use finalAlpha instead of alpha below
```

- [ ] **Step 4: Build 验证**

Run: `cd "D:/photo-stars" && npm run build`
Expected: 零 TS 错误

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/GalaxyCanvas.tsx
git commit -m "feat: add focus switching with 3D offset and dimming

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 集成验证 + 部署

- [ ] **Step 1: 完整构建**

Run: `cd "D:/photo-stars" && npm run build`
Expected: 零 TS 错误，bundle 成功

- [ ] **Step 2: 本地功能检查清单**

用 `npm run dev` 启动，验证：
1. 页面加载 → 两个旋转光球（金色+冰蓝），暗黑背景
2. 光球绕中心旋转，周期 ~6s，椭圆轨道
3. 悬停光球时光标变 pointer
4. 点击金色光球 → 白闪 → 粒子螺旋扩散展开
5. 冰蓝光球在金色完成后自动跟随展开
6. 双星系完整显示后可拖拽旋转
7. 点击视频粒子 → 焦点平滑滑向视频星系
8. 点击照片粒子 → 焦点滑回
9. 缩放/搜索/上传功能正常

- [ ] **Step 3: 部署到 gh-pages**

使用 memory 中的手动部署流程。先配置 git：

```bash
git config --global user.name "Thaw602"
git config --global user.email "thaw602@users.noreply.github.com"
```

构建并部署：

```bash
cd "D:/photo-stars" && npm run build
rm -rf /tmp/photo-stars-deploy && mkdir /tmp/photo-stars-deploy
cp -r dist/* /tmp/photo-stars-deploy/
cd /tmp/photo-stars-deploy
git init
git checkout -b gh-pages
git add -A
git commit -m "deploy: twin galaxy intro animation $(date +%Y-%m-%d)"
git remote add origin https://github.com/Thaw602/photo-stars.git
git push -f origin gh-pages
```

- [ ] **Step 4: 推送主分支**

```bash
cd "D:/photo-stars" && git push origin main
```

- [ ] **Step 5: Commit 部署记录**

```bash
git add -A && git commit -m "chore: deployment record
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 文件结构总览（实施后）

```
src/
├── hooks/
│   └── useGalaxyAnimation.ts    ← NEW: 阶段机 + 光球 + 焦点
├── components/
│   └── canvas/
│       └── GalaxyCanvas.tsx     ← MODIFIED: 按阶段渲染 + 展开动画 + 焦点偏移
├── store/
│   └── index.ts                 ← MODIFIED: +phase field
```
