import { useEffect, useRef, useCallback } from 'react';
import { useAppStore, type MediaFile } from '../../store';

// ==================== Types ====================

/** Cloud particle — 3D position in spherical volume (used for halo + spiral particles) */
interface CloudParticle {
  x: number; y: number; z: number;  // 3D position (normalized, -1~1)
  radius3D: number;                  // distance from origin
  size: number;
  r: number; g: number; b: number;
  baseAlpha: number;
  phase: number;
}

/** Tiny background dust particle — 2D screen-space, fills the void */
interface DustParticle {
  x: number; y: number;       // normalized screen coords (0~1)
  size: number;               // pixel size
  baseAlpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  r: number; g: number; b: number;
}

/** Interactive photo node — clickable */
interface PhotoNode {
  id: number;
  fileIndex: number;
  x: number; y: number; z: number;
  radius3D: number;
  baseSize: number;
  r: number; g: number; b: number;
  phase: number;
  hoverScale: number;
  clickFlash: number;
}

// ==================== Constants ====================

const DUST_COUNT = 7000;              // Tiny background dust — fills the void
const HALO_STAR_COUNT = 2000;        // Outer halo — richer spherical distribution
const SPIRAL_PARTICLE_COUNT = 22000; // Spiral arm particles — dense, lush arms
const GLOW_TEXTURE_SIZE = 48;        // Smaller texture = sharper particles

// Galaxy shape
const DISK_RADIUS = 1.0;
const DISK_THICKNESS = 0.11;       // Thicker disk for more nebula feel
const ARM_COUNT = 5;               // More arms = fuller disk
const ARM_TWIST = 3.8;             // Tighter winding for grand-design spiral
const ARM_WIDTH_FACTOR = 0.22;     // Wider, thicker arms

// ==================== Seeded PRNG ====================

function createRNG(seed: number) {
  let s = seed;
  return function (): number {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ==================== Background dust ====================

/** Generate tiny 2D dust particles that fill the entire background */
function generateDustParticles(rng: () => number): DustParticle[] {
  const dust: DustParticle[] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    // Slightly concentrate near center via beta distribution
    const u = rng();
    const v = rng();
    const cx = 0.5, cy = 0.5;
    // Mix: 70% uniform, 30% pulled toward center
    const pullX = (rng() - 0.5) * 0.35;
    const pullY = (rng() - 0.5) * 0.35;
    const x = u * 0.7 + (cx + pullX) * 0.3;
    const y = v * 0.7 + (cy + pullY) * 0.3;

    // Tint: slightly warm near center, cooler at edges
    const distFromCenter = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2);
    const t = Math.min(1, distFromCenter / 0.7);
    const col = galaxyColor(t * 0.6 + 0.15); // use galaxy palette sub-sampled

    dust.push({
      x, y,
      size: 0.15 + rng() * 0.8,
      baseAlpha: 0.03 + rng() * 0.12 * (1 - t * 0.5), // brighter near center
      twinklePhase: rng() * Math.PI * 2,
      twinkleSpeed: 0.3 + rng() * 3.5,
      r: col.r, g: col.g, b: col.b,
    });
  }
  return dust;
}

// ==================== Color — spiral galaxy palette ====================

/**
 * Rich galaxy color gradient — more vibrant and saturated.
 *
 * Core (r<0.10):   blazing white → warm gold     (galactic nucleus)
 * Inner (0.10-0.28): gold → vivid cyan/teal       (young hot stars)
 * Mid   (0.28-0.52): teal → rich amber/gold        (transition + HII regions)
 * Outer (0.52-0.76): amber → vivid rose/magenta    (older stars, nebula)
 * Edge  (0.76-1.0):  magenta → deep indigo         (outer disk, cool)
 */
function galaxyColor(r: number): { r: number; g: number; b: number } {
  if (r < 0.10) {
    // Blazing white → warm gold
    const f = r / 0.10;
    return {
      r: 255,
      g: 245 + Math.round(f * 10),
      b: 210 + Math.round(f * 40),
    };
  }
  if (r < 0.28) {
    // Warm gold → vivid cyan/teal
    const f = (r - 0.10) / 0.18;
    return {
      r: 255 - Math.round(f * 195),   // 255 → 60
      g: 255 - Math.round(f * 20),    // 255 → 235
      b: 250 - Math.round(f * 55),    // 250 → 195
    };
  }
  if (r < 0.52) {
    // Cyan/teal → rich amber/gold
    const f = (r - 0.28) / 0.24;
    return {
      r: 60 + Math.round(f * 195),     // 60 → 255
      g: 235 + Math.round(f * 15),     // 235 → 250
      b: 195 - Math.round(f * 140),    // 195 → 55
    };
  }
  if (r < 0.76) {
    // Amber → vivid rose/magenta
    const f = (r - 0.52) / 0.24;
    return {
      r: 255,
      g: 250 - Math.round(f * 185),    // 250 → 65
      b: 55 + Math.round(f * 120),     // 55 → 175
    };
  }
  // Rose/magenta → deep indigo
  const f = Math.min(1, (r - 0.76) / 0.24);
  return {
    r: 255 - Math.round(f * 170),     // 255 → 85
    g: 65 - Math.round(f * 50),       // 65 → 15
    b: 175 - Math.round(f * 70),      // 175 → 105
  };
}

// ==================== Glow texture (warm galaxy glow) ====================

function createGlowTexture(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255,252,245,1)');
  grad.addColorStop(0.06, 'rgba(240,225,200,0.92)');
  grad.addColorStop(0.20, 'rgba(200,175,145,0.52)');
  grad.addColorStop(0.42, 'rgba(140,115,90,0.10)');
  grad.addColorStop(0.68, 'rgba(70,55,40,0.015)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// ==================== Spiral galaxy particle generation ====================

/**
 * Sample a point in the galactic disk (XZ plane, very thin Y).
 * For halo stars, pass isHalo=true to get spherical distribution.
 */
function sampleDisk3D(
  rng: () => number,
  radius: number,
  thickness: number,
): { x: number; y: number; z: number; r: number } {
  // Uniform on sphere surface (Marsaglia 1972)
  let u: number, v: number;
  let s: number;
  do {
    u = rng() * 2 - 1;
    v = rng() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1);

  const nx = 2 * u * Math.sqrt(1 - s);
  const ny = 2 * v * Math.sqrt(1 - s);
  const nz = 1 - 2 * s;

  // Radius: power decay → dense core, sparse edges
  const rNorm = Math.pow(rng(), 2.5);

  return {
    x: nx * rNorm * radius,
    y: ny * rNorm * thickness,
    z: nz * rNorm * radius,
    r: rNorm,
  };
}

/** Generate sparse outer halo stars (3D spherical, very faint) */
function generateHaloStars(rng: () => number): CloudParticle[] {
  const stars: CloudParticle[] = [];
  for (let i = 0; i < HALO_STAR_COUNT; i++) {
    // Spherical distribution, power decay
    const pos = sampleDisk3D(rng, 1.15, 0.55); // Nearly spherical, slightly flattened
    const col = galaxyColor(pos.r);

    stars.push({
      x: pos.x, y: pos.y, z: pos.z,
      radius3D: pos.r,
      size: 0.25 + rng() * 0.7,
      r: col.r, g: col.g, b: col.b,
      baseAlpha: 0.03 + (1 - pos.r) * 0.10 + rng() * 0.04,
      phase: rng() * Math.PI * 2,
    });
  }
  return stars;
}

/** Generate spiral arm particles */
function generateSpiralParticles(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];

  for (let i = 0; i < SPIRAL_PARTICLE_COUNT; i++) {
    // Radius: power-law decay — dense core
    const r = Math.pow(rng(), 2.5);

    // Pick a random arm
    const armIndex = Math.floor(rng() * ARM_COUNT);
    const armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;

    // Spiral angle: log(1+k*r)*twist — tight near center, opening up
    const spiralAngle = Math.log(1 + r * 10) * ARM_TWIST;

    // Gaussian-like noise perpendicular to the arm (wider near center)
    const perpendicularNoise = (rng() + rng() + rng()) / 3 - 0.5;
    const armWidth = ARM_WIDTH_FACTOR * (0.5 + 0.5 * (1 - r)); // narrower at edges
    const angleNoise = perpendicularNoise * armWidth * 2;

    const theta = armOffset + spiralAngle + angleNoise;

    // Convert polar to cartesian (disk in XZ plane)
    const x = Math.cos(theta) * r * DISK_RADIUS;
    const z = Math.sin(theta) * r * DISK_RADIUS;

    // Vertical scatter: very thin disk, thicker near center
    const y = (rng() - 0.5) * DISK_THICKNESS * (0.6 + 0.4 * (1 - r));

    const col = galaxyColor(r);

    // Brighter in arm center, dimmer at arm edges (softer falloff)
    const armDist = Math.abs(perpendicularNoise); // 0~0.5
    const armBrightness = 1 - armDist * 0.8;     // 0.6~1.0 — less falloff, arms feel fuller

    const baseAlpha = (0.08 + (1 - r) * 0.28 + rng() * 0.07) * armBrightness;
    const size = 0.35 + (1 - r) * 1.6 + rng() * 0.5;

    particles.push({
      x, y, z,
      radius3D: r,
      size,
      r: col.r, g: col.g, b: col.b,
      baseAlpha: Math.min(1, baseAlpha),
      phase: rng() * Math.PI * 2,
    });
  }
  return particles;
}

/** Place photo nodes along spiral arms with some scatter */
function generatePhotoNodes(
  rng: () => number,
  files: MediaFile[],
): PhotoNode[] {
  const nodes: PhotoNode[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Deterministic position using file index
    const seed = (i * 16807 + 137) % 2147483647;
    const rng2 = createRNG(seed);

    // Distribute along spiral arms, but with more spread
    const r = Math.pow(rng2(), 1.8);

    const armIndex = Math.floor(rng2() * ARM_COUNT);
    const armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;
    const spiralAngle = Math.log(1 + r * 10) * ARM_TWIST;
    const perpendicularNoise = (rng2() + rng2() + rng2()) / 3 - 0.5;
    const armWidth = ARM_WIDTH_FACTOR * (0.5 + 0.5 * (1 - r));
    const angleNoise = perpendicularNoise * armWidth * 3; // Slightly more spread

    const theta = armOffset + spiralAngle + angleNoise;
    const x = Math.cos(theta) * r * DISK_RADIUS;
    const z = Math.sin(theta) * r * DISK_RADIUS;
    const y = (rng2() - 0.5) * DISK_THICKNESS * (0.6 + 0.4 * (1 - r));

    const col = galaxyColor(r);
    const isVideo = file.type === 'video';

    // Interactive nodes: noticeably larger than arm particles
    const baseSize = 1.5 + (1 - r) * 2.8 + rng2() * 1.0;

    nodes.push({
      id: i,
      fileIndex: i,
      x, y, z,
      radius3D: r,
      baseSize,
      r: isVideo ? 220 : Math.min(255, col.r),
      g: isVideo ? 230 : Math.min(255, col.g),
      b: isVideo ? 255 : Math.min(255, col.b),
      phase: rng2() * Math.PI * 2,
      hoverScale: 1.0,
      clickFlash: 0,
    });
  }

  return nodes;
}

// ==================== Component ====================

export default function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const dustRef = useRef<DustParticle[]>([]);
  const haloRef = useRef<CloudParticle[]>([]);
  const spiralRef = useRef<CloudParticle[]>([]);
  const photoNodesRef = useRef<PhotoNode[]>([]);
  const glowTexRef = useRef<HTMLCanvasElement | null>(null);

  // Rotation state
  const rotationX = useRef(0.15);
  const rotationY = useRef(0);

  // Zoom state
  const zoomRef = useRef(1.0);
  const zoomTargetRef = useRef(1.0);
  const ZOOM_MIN = 0.15;
  const ZOOM_MAX = 8.0;

  // Interaction
  const hoveredRef = useRef<number>(-1);
  const isPointerDown = useRef(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, rx: 0, ry: 0 });

  // Store
  const manifest = useAppStore((s) => s.manifest);
  const selectFile = useAppStore((s) => s.selectFile);

  // ---- Initialize ----
  const initParticles = useCallback(() => {
    if (!manifest) return;
    const rng = createRNG(137);

    dustRef.current = generateDustParticles(rng);
    haloRef.current = generateHaloStars(rng);
    spiralRef.current = generateSpiralParticles(rng);
    photoNodesRef.current = generatePhotoNodes(rng, manifest.files);
  }, [manifest]);

  // ---- Resize ----
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (manifest) {
      initParticles();
      glowTexRef.current = createGlowTexture(GLOW_TEXTURE_SIZE);
    }
  }, [manifest, initParticles]);

  // ---- 3D projection ----
  function project3D(
    x: number, y: number, z: number,
    cx: number, cy: number, scale: number,
    cosX: number, sinX: number,
    cosY: number, sinY: number,
    zoom: number,
  ): { px: number; py: number; depth: number } | null {
    // Rotate around Y axis
    const rx1 = x * cosY + z * sinY;
    const rz1 = -x * sinY + z * cosY;

    // Rotate around X axis
    const ry1 = y * cosX - rz1 * sinX;
    const rz2 = y * sinX + rz1 * cosX;

    // Perspective: zoom adjusts the camera distance
    const viewZ = rz2 + 2.2 / zoom;
    if (viewZ < 0.15) return null;

    const invZ = 1 / viewZ;
    const px = cx + rx1 * scale * invZ;
    const py = cy - ry1 * scale * invZ;

    return { px, py, depth: rz2 };
  }

  // ---- Hit test ----
  const hitTest = useCallback((mx: number, my: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const s = Math.min(w, h) * 0.55;

    const nodes = photoNodesRef.current;
    const rx = rotationX.current;
    const ry = rotationY.current;
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);

    let best = -1;
    let bestDist = Infinity;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const result = project3D(n.x, n.y, n.z, cx, cy, s, cosX, sinX, cosY, sinY, zoomRef.current);
      if (!result) continue;

      const dx = mx - result.px;
      const dy = my - result.py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Hit radius grows for closer (larger) particles
      const projectedSize = n.baseSize / Math.max(result.depth + 2.2 / zoomRef.current, 0.3) * 0.6;
      const hitR = Math.max(8, projectedSize * 5);

      if (dist < hitR && dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }

    return best;
  }, []);

  // ---- Mouse handlers ----
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isPointerDown.current) {
      const dx = mx - dragStart.current.x;
      const dy = my - dragStart.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDragging.current = true;
      if (isDragging.current) {
        rotationY.current = dragStart.current.ry + (mx - dragStart.current.x) * 0.006;
        rotationX.current = dragStart.current.rx + (my - dragStart.current.y) * 0.006;
        rotationX.current = Math.max(-1.3, Math.min(1.3, rotationX.current));
        return;
      }
    }

    const hit = hitTest(mx, my);
    if (hit !== hoveredRef.current) {
      if (hoveredRef.current >= 0) photoNodesRef.current[hoveredRef.current].hoverScale = 1.0;
      hoveredRef.current = hit;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hit >= 0 ? 'pointer' : 'default';
      }
    }
  }, [hitTest]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    isPointerDown.current = true;
    isDragging.current = false;
    dragStart.current = { x: mx, y: my, rx: rotationX.current, ry: rotationY.current };
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDragging = isDragging.current;
    isPointerDown.current = false;
    isDragging.current = false;

    if (!wasDragging) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(mx, my);
      if (hit >= 0) {
        const node = photoNodesRef.current[hit];
        node.clickFlash = 1.0;
        const file = manifest?.files[node.fileIndex];
        if (file) selectFile(file);
      }
    }
  }, [hitTest, manifest, selectFile]);

  const handleMouseLeave = useCallback(() => {
    if (hoveredRef.current >= 0) photoNodesRef.current[hoveredRef.current].hoverScale = 1.0;
    hoveredRef.current = -1;
    isPointerDown.current = false;
    isDragging.current = false;
  }, []);

  // ---- Wheel zoom ----
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    zoomTargetRef.current += delta;
    zoomTargetRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomTargetRef.current));
  }, []);

  // ---- Touch pinch zoom ----
  const lastPinchDist = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist.current > 0) {
        const delta = (dist - lastPinchDist.current) * 0.005;
        zoomTargetRef.current += delta;
        zoomTargetRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomTargetRef.current));
      }
      lastPinchDist.current = dist;
    }
  }, []);

  // ---- Animation loop ----
  useEffect(() => {
    if (!manifest) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    startTimeRef.current = performance.now();

    const render = (timestamp: number) => {
      const elapsed = (timestamp - startTimeRef.current) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const projScale = Math.min(w, h) * 0.55;

      // Smooth zoom interpolation
      const zoom = zoomRef.current;
      const zoomTarget = zoomTargetRef.current;
      if (Math.abs(zoom - zoomTarget) > 0.001) {
        zoomRef.current += (zoomTarget - zoom) * 0.12;
      } else {
        zoomRef.current = zoomTarget;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Pure black background (宇宙深空)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Auto-rotation: subtle spin when user is not dragging
      if (!isPointerDown.current) {
        rotationY.current += 0.0003;
      }

      const rx = rotationX.current;
      const ry = rotationY.current;
      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const glowTex = glowTexRef.current;

      // ===== LAYER 0: Background dust — dense tiny particles filling the void =====
      ctx.globalCompositeOperation = 'source-over';
      for (const d of dustRef.current) {
        const twinkle = 0.4 + 0.6 * Math.sin(elapsed * d.twinkleSpeed + d.twinklePhase);
        const alpha = d.baseAlpha * twinkle;
        if (alpha < 0.008) continue;
        const px = d.x * w;
        const py = d.y * h;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${d.r},${d.g},${d.b})`;
        ctx.beginPath();
        ctx.arc(px, py, d.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 1: Halo stars — faint 3D spherical outer halo =====
      ctx.globalCompositeOperation = 'lighter';
      for (const p of haloRef.current) {
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue;

        const breathe = 1 + Math.sin(elapsed * 0.6 + p.phase) * 0.08;
        const alpha = Math.min(0.25, p.baseAlpha * breathe);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.beginPath();
        ctx.arc(result.px, result.py, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 2: Spiral arm particles (additive, front-to-back for glow) =====
      const spiralProj: { p: CloudParticle; px: number; py: number; depth: number; size: number; alpha: number; r: number; g: number; b: number }[] = [];

      for (const p of spiralRef.current) {
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue;

        const breathe = 1 + Math.sin(elapsed * 1.3 + p.phase) * 0.06;
        const alpha = Math.min(1, p.baseAlpha * breathe);

        spiralProj.push({
          p, px: result.px, py: result.py, depth: result.depth,
          size: p.size, alpha, r: p.r, g: p.g, b: p.b,
        });
      }
      // Sort front-to-back for additive layering
      spiralProj.sort((a, b) => b.depth - a.depth);

      for (const cp of spiralProj) {
        const glowR = cp.size * 4.5;
        ctx.globalAlpha = cp.alpha;

        if (glowTex) {
          ctx.drawImage(glowTex, cp.px - glowR, cp.py - glowR, glowR * 2, glowR * 2);
        }

        // Sharp micro core — brighter
        if (cp.alpha > 0.12) {
          ctx.globalAlpha = Math.min(1, cp.alpha * 1.6);
          ctx.fillStyle = `rgb(${cp.r},${cp.g},${cp.b})`;
          ctx.beginPath();
          ctx.arc(cp.px, cp.py, cp.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ===== LAYER 3: Photo nodes (source-over, back-to-front) =====
      ctx.globalCompositeOperation = 'source-over';
      const nodeProj: { n: PhotoNode; px: number; py: number; depth: number; size: number; alpha: number }[] = [];

      for (const n of photoNodesRef.current) {
        const result = project3D(n.x, n.y, n.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -30 || result.px > w + 30 || result.py < -30 || result.py > h + 30) continue;

        const breathe = 1 + Math.sin(elapsed * 2.0 + n.phase) * 0.10;
        const targetScale = hoveredRef.current === n.id ? 1.6 : 1.0;
        n.hoverScale += (targetScale - n.hoverScale) * 0.18;

        if (n.clickFlash > 0.001) {
          n.clickFlash *= 0.82;
          if (n.clickFlash < 0.001) n.clickFlash = 0;
        }

        const depthScale = 1 / Math.max(result.depth + 2.2 / zoom, 0.3);
        const size = n.baseSize * n.hoverScale * depthScale * 0.62;
        const alphaBright = hoveredRef.current === n.id ? 1.8 : 1.0;
        const flash = 1 + n.clickFlash * 3.5;
        const alpha = Math.min(1, 0.90 * breathe * alphaBright * flash);

        nodeProj.push({ n, px: result.px, py: result.py, depth: result.depth, size: Math.max(0.6, size), alpha });
      }
      // Sort back-to-front for proper alpha
      nodeProj.sort((a, b) => a.depth - b.depth);

      // ===== Connection lines: center → each photo node =====
      ctx.globalCompositeOperation = 'lighter';
      for (const np of nodeProj) {
        const { n, px, py, depth } = np;
        // Opacity fades with distance from center and depth
        const lineAlpha = 0.04 + n.radius3D * 0.02 + (1 / Math.max(depth + 2.2 / zoom, 0.3)) * 0.015;
        ctx.globalAlpha = Math.min(0.18, lineAlpha);
        ctx.strokeStyle = `rgb(${n.r},${n.g},${n.b})`;
        ctx.lineWidth = 0.25;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
      }

      // ===== LAYER 3: Photo nodes (source-over, back-to-front) =====
      ctx.globalCompositeOperation = 'source-over';
      for (const np of nodeProj) {
        const { n, px, py, size, alpha } = np;
        const glowR = size * 5.0;

        // Soft glow
        ctx.globalAlpha = alpha * 0.8;
        if (glowTex) {
          ctx.drawImage(glowTex, px - glowR, py - glowR, glowR * 2, glowR * 2);
        }

        // Sharp core
        ctx.globalAlpha = Math.min(1, alpha * 1.4);
        ctx.fillStyle = `rgb(${n.r},${n.g},${n.b})`;
        ctx.beginPath();
        ctx.arc(px, py, size * 0.75, 0, Math.PI * 2);
        ctx.fill();

        // Bright pinprick center (诗云 signature)
        ctx.globalAlpha = Math.min(1, alpha * 1.1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, size * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== Central blazing core — galactic nucleus (larger, more intense) =====
      ctx.globalCompositeOperation = 'lighter';
      const coreR = Math.min(w, h) * 0.13;
      const coreLayers = [
        // Outermost soft halo — wider reach
        { r: coreR * 3.5, stops: [
          [0, 'rgba(255,240,200,0.06)'],
          [0.12, 'rgba(255,230,180,0.035)'],
          [0.35, 'rgba(200,175,130,0.008)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        // Outer glow
        { r: coreR * 2.0, stops: [
          [0, 'rgba(255,245,220,0.14)'],
          [0.12, 'rgba(255,235,195,0.07)'],
          [0.40, 'rgba(200,175,130,0.012)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        // Mid glow
        { r: coreR * 0.9, stops: [
          [0, 'rgba(255,248,230,0.32)'],
          [0.10, 'rgba(255,240,210,0.18)'],
          [0.35, 'rgba(255,225,170,0.04)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        // Inner bright glow
        { r: coreR * 0.35, stops: [
          [0, 'rgba(255,252,245,0.70)'],
          [0.10, 'rgba(255,248,230,0.35)'],
          [0.35, 'rgba(255,235,190,0.08)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        // Pinprick center — blazing white
        { r: coreR * 0.10, stops: [
          [0, 'rgba(255,255,255,1.0)'],
          [0.12, 'rgba(255,253,245,0.85)'],
          [0.40, 'rgba(255,245,210,0.18)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
      ];

      for (const layer of coreLayers) {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, layer.r);
        for (const [pos, color] of layer.stops) {
          grad.addColorStop(pos as number, color as string);
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, layer.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Reset
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [manifest]);

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      style={{ position: 'absolute', inset: 0, zIndex: 0, cursor: 'default' }}
    />
  );
}
