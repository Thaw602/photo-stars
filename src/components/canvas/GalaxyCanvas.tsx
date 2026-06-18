import { useEffect, useRef, useCallback } from 'react';
import { useAppStore, type MediaFile } from '../../store';

// perf v3 — optimized render pipeline: offscreen BG, no sort, culled draw
// ==================== Types ====================

/** Cloud particle — 3D position in spherical volume (used for halo + spiral particles) */
interface CloudParticle {
  x: number; y: number; z: number;  // 3D position (normalized, -1~1)
  radius3D: number;                  // distance from origin
  size: number;
  r: number; g: number; b: number;
  baseAlpha: number;
  phase: number;
  // Jitter — subtle irregular motion (screen-space)
  jxPhase: number; jyPhase: number;
  jxSpeed: number; jySpeed: number;
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
  // Jitter — subtle irregular motion (screen-space)
  jxPhase: number; jyPhase: number;
  jxSpeed: number; jySpeed: number;
}

/** Planet — drifts through the galaxy with a colored fading trail */
interface Planet {
  x: number; y: number; z: number;
  size: number;
  r: number; g: number; b: number;
  trail: { x: number; y: number; z: number }[];
  trailHead: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitInclination: number;
}

// ==================== Constants ====================

const BG_STAR_COUNT = 0;             // Removed — background dust particles
const HALO_STAR_COUNT = 500;         // Reduced from 2000 to reduce peripheral overexposure
const SPIRAL_PARTICLE_COUNT = 28000; // +27% from original 22000
const INTER_ARM_PARTICLE_COUNT = 2000; // Reduced from 6000
const GLOW_TEXTURE_SIZE = 24;        // Smaller than before (was 48)

// HII Regions — pink emission nebulae clustered along spiral arms
const HII_REGION_COUNT = 16;
const HII_PARTICLES_PER_REGION = 45;

// Dark dust lanes — trace the inner edge of spiral arms
const DUST_LANE_COUNT = 3000;

// Volume dust — tiny 3D particles (removed)
const VOLUME_DUST_COUNT = 0;

// Deep field stars (removed)
const DEEP_FIELD_STAR_COUNT = 0;

const CORE_SCALE = 30.0;            // Core glow scale (doubled from 15.0)

// Galaxy shape
const DISK_RADIUS = 1.0;
const DISK_THICKNESS = 0.11;
const ARM_COUNT = 5;
const ARM_TWIST = 3.8;
const ARM_WIDTH_FACTOR = 0.22;

// Rotation & inertia
const ARM_ROTATION_SPEED = 0.0070;   // Much faster (was 0.0012)
const INERTIA_DECAY = 0.94;

// Planet/trail
const PLANET_COUNT = 7;
const PLANET_TRAIL_LENGTH = 50;

// Connection lines (removed)
const MAX_LINES = 0;

// Particle distribution
const MIN_PARTICLE_RADIUS = 0.07;

// ==================== Seeded PRNG ====================

function createRNG(seed: number) {
  let s = seed;
  return function (): number {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ==================== Color — realistic spiral galaxy palette ====================

/**
 * Nebula-inspired galaxy color gradient.
 *
 * Core (r<0.08):   blazing white → warm gold     (galactic nucleus)
 * Inner (0.08-0.22): gold → vivid cyan/teal       (young hot stars)
 * Mid   (0.22-0.46): cyan/teal → rose/magenta      (transition + HII)
 * Outer (0.46-0.72): rose/magenta → deep purple    (older stars)
 * Edge  (0.72-1.0):  deep purple → cool blue-black (outer disk)
 */
function galaxyColor(r: number): { r: number; g: number; b: number } {
  if (r < 0.08) {
    // Blazing white → warm gold (tighter core)
    const f = r / 0.08;
    return { r: 255, g: 248 + Math.round(f * 7), b: 225 + Math.round(f * 30) };
  }
  if (r < 0.22) {
    // Warm gold → vivid cyan/teal
    const f = (r - 0.08) / 0.14;
    return { r: 255 - Math.round(f * 215), g: 255 - Math.round(f * 35), b: 255 - Math.round(f * 55) };
  }
  if (r < 0.46) {
    // Cyan/teal → rose/magenta
    const f = (r - 0.22) / 0.24;
    return { r: 40 + Math.round(f * 215), g: 220 - Math.round(f * 155), b: 200 - Math.round(f * 110) };
  }
  if (r < 0.72) {
    // Rose/magenta → deep purple
    const f = (r - 0.46) / 0.26;
    return { r: 255, g: 65 - Math.round(f * 50), b: 90 + Math.round(f * 110) };
  }
  // Deep purple → cool blue-black
  const f = Math.min(1, (r - 0.72) / 0.28);
  return { r: 255 - Math.round(f * 175), g: 15 + Math.round(f * 5), b: 200 - Math.round(f * 95) };
}

// ==================== Glow texture ====================

function createGlowTexture(size: number, r: number, g: number, b: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.06, `rgba(${r},${g},${b},0.92)`);
  grad.addColorStop(0.20, `rgba(${Math.round(r*0.78)},${Math.round(g*0.72)},${Math.round(b*0.60)},0.52)`);
  grad.addColorStop(0.42, `rgba(${Math.round(r*0.55)},${Math.round(g*0.47)},${Math.round(b*0.37)},0.10)`);
  grad.addColorStop(0.68, `rgba(${Math.round(r*0.27)},${Math.round(g*0.22)},${Math.round(b*0.17)},0.015)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// ==================== Spiral galaxy particle generation ====================

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

  // Uniformly distributed radius (was power-law)
  const rNorm = Math.pow(rng(), 1.0);

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
    const pos = sampleDisk3D(rng, 0.95, 0.55); // Reduced radius from 1.15
    const col = galaxyColor(pos.r);

    stars.push({
      x: pos.x, y: pos.y, z: pos.z,
      radius3D: pos.r,
      size: 0.25 + rng() * 0.7,
      r: col.r, g: col.g, b: col.b,
      baseAlpha: 0.03 + (1 - pos.r) * 0.10 + rng() * 0.04,
      phase: rng() * Math.PI * 2,
      jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2,
      jxSpeed: 0.3 + rng() * 1.5, jySpeed: 0.3 + rng() * 1.5,
    });
  }
  return stars;
}

/** Generate spiral arm particles with clumping */
function generateSpiralParticles(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];

  // Pre-generate clumping nodes (bright star-forming regions)
  const NODE_COUNT = 36;
  const nodes: { r: number; armIndex: number; strength: number }[] = [];
  for (let n = 0; n < NODE_COUNT; n++) {
    nodes.push({
      r: MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(), // UNIFORM distribution
      armIndex: Math.floor(rng() * ARM_COUNT),
      strength: 0.4 + rng() * 0.6,
    });
  }

  for (let i = 0; i < SPIRAL_PARTICLE_COUNT; i++) {
    // Uniform radial distribution (was power-law)
    let r = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng();

    const armIndex = Math.floor(rng() * ARM_COUNT);
    const armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;

    // Clumping: 35% of particles pulled toward nearby nodes
    if (rng() < 0.35) {
      let bestDist = Infinity;
      let bestNode: typeof nodes[0] | null = null;
      for (const node of nodes) {
        const dr = Math.abs(r - node.r);
        const armDist = Math.min(
          Math.abs(armIndex - node.armIndex),
          ARM_COUNT - Math.abs(armIndex - node.armIndex),
        );
        const dist = dr * 1.2 + armDist * 0.06;
        if (dist < bestDist) {
          bestDist = dist;
          bestNode = node;
        }
      }
      if (bestNode) {
        r += (bestNode.r - r) * 0.55 * bestNode.strength;
        r = Math.max(MIN_PARTICLE_RADIUS, Math.min(1.0, r));
      }
    }

    const spiralAngle = Math.log(1 + r * 10) * ARM_TWIST;
    const perpendicularNoise = (rng() + rng() + rng()) / 3 - 0.5;
    const armWidth = ARM_WIDTH_FACTOR * (0.5 + 0.5 * (1 - r));
    const angleNoise = perpendicularNoise * armWidth * 2;
    const theta = armOffset + spiralAngle + angleNoise;

    const x = Math.cos(theta) * r * DISK_RADIUS;
    const z = Math.sin(theta) * r * DISK_RADIUS;
    const y = (rng() - 0.5) * DISK_THICKNESS * (0.6 + 0.4 * (1 - r));

    const col = galaxyColor(r);
    const armDist = Math.abs(perpendicularNoise);
    const armBrightness = 1 - armDist * 0.8;
    const outerTaper = r > 0.45 ? Math.max(0.08, 1 - (r - 0.45) / 0.55) : 1;
    const baseAlpha = (0.05 + (1 - r) * 0.16 + rng() * 0.04) * armBrightness * outerTaper;
    const size = 0.35 + (1 - r) * 1.6 + rng() * 0.5;

    particles.push({
      x, y, z,
      radius3D: r,
      size,
      r: col.r, g: col.g, b: col.b,
      baseAlpha: Math.min(1, baseAlpha),
      phase: rng() * Math.PI * 2,
      jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2,
      jxSpeed: 0.5 + rng() * 2.0, jySpeed: 0.5 + rng() * 2.0,
    });
  }
  return particles;
}

/** Generate HII region particles — pink emission nebulae */
function generateHIIParticles(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];

  for (let h = 0; h < HII_REGION_COUNT; h++) {
    const centerR = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(); // UNIFORM
    const armIndex = Math.floor(rng() * ARM_COUNT);
    const armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;
    const spiralAngle = Math.log(1 + centerR * 10) * ARM_TWIST;
    const centerTheta = armOffset + spiralAngle + (rng() - 0.5) * ARM_WIDTH_FACTOR * 1.2;
    const cx = Math.cos(centerTheta) * centerR;
    const cz = Math.sin(centerTheta) * centerR;

    for (let p = 0; p < HII_PARTICLES_PER_REGION; p++) {
      // Gaussian scatter around cluster center
      const dx = (rng() + rng() + rng() + rng()) / 4 - 0.5;
      const dz = (rng() + rng() + rng() + rng()) / 4 - 0.5;
      const scatterR = 0.015 + rng() * 0.04;
      const px = cx + dx * scatterR;
      const pz = cz + dz * scatterR;
      const y = (rng() - 0.5) * DISK_THICKNESS * 0.5;
      const dist = Math.sqrt(px * px + pz * pz);

      // Pink/magenta colors
      const colorMix = rng();
      let cr: number, cg: number, cb: number;
      if (colorMix < 0.5) {
        cr = 255; cg = 68 + Math.round(rng() * 80); cb = 136 + Math.round(rng() * 60);
      } else if (colorMix < 0.8) {
        cr = 255; cg = 140 + Math.round(rng() * 60); cb = 140 + Math.round(rng() * 60);
      } else {
        cr = 255; cg = 200 + Math.round(rng() * 55); cb = 200 + Math.round(rng() * 55);
      }

      const baseAlpha = 0.10 + rng() * 0.18;
      const size = 0.4 + rng() * 1.0;

      particles.push({
        x: px, y, z: pz,
        radius3D: dist,
        size,
        r: cr, g: cg, b: cb,
        baseAlpha,
        phase: rng() * Math.PI * 2,
        jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2,
        jxSpeed: 0.2 + rng() * 0.8, jySpeed: 0.2 + rng() * 0.8,
      });
    }
  }
  return particles;
}

/** Generate dark dust lanes — silhouettes on inner edge of spiral arms */
function generateDustLanes(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];

  for (let i = 0; i < DUST_LANE_COUNT; i++) {
    const r = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(); // UNIFORM
    const armIndex = Math.floor(rng() * ARM_COUNT);
    const armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;
    const spiralAngle = Math.log(1 + r * 10) * ARM_TWIST;

    // Offset to inner edge of arm
    const perpendicularNoise = (rng() + rng() + rng()) / 3 - 0.5;
    const armWidth = ARM_WIDTH_FACTOR * (0.5 + 0.5 * (1 - r));
    const angleNoise = perpendicularNoise * armWidth * 2 - 0.06; // Inner edge bias

    const theta = armOffset + spiralAngle + angleNoise;
    const x = Math.cos(theta) * r * DISK_RADIUS;
    const z = Math.sin(theta) * r * DISK_RADIUS;
    const y = (rng() - 0.5) * DISK_THICKNESS * 0.4;

    // Very dark, subtle colors
    const dr = 6 + Math.round(rng() * 8);
    const dg = 3 + Math.round(rng() * 6);
    const db = 8 + Math.round(rng() * 10);
    const baseAlpha = 0.015 + rng() * 0.05;
    const size = 0.3 + rng() * 0.8;

    particles.push({
      x, y, z,
      radius3D: r,
      size,
      r: dr, g: dg, b: db,
      baseAlpha,
      phase: rng() * Math.PI * 2,
      jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2,
      jxSpeed: 0.2 + rng() * 0.6, jySpeed: 0.2 + rng() * 0.6,
    });
  }
  return particles;
}

/** Generate inter-arm fill particles */
function generateInterArmParticles(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];
  for (let i = 0; i < INTER_ARM_PARTICLE_COUNT; i++) {
    const r = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(); // UNIFORM
    const theta = rng() * Math.PI * 2;
    const x = Math.cos(theta) * r * DISK_RADIUS;
    const z = Math.sin(theta) * r * DISK_RADIUS;
    const y = (rng() - 0.5) * DISK_THICKNESS * 1.5;

    const col = galaxyColor(r);
    const outerTaper = r > 0.45 ? Math.max(0.06, 1 - (r - 0.45) / 0.55) : 1;
    const baseAlpha = (0.02 + (1 - r) * 0.05 + rng() * 0.02) * outerTaper;
    const size = 0.2 + rng() * 0.6;

    particles.push({
      x, y, z,
      radius3D: r,
      size,
      r: col.r, g: col.g, b: col.b,
      baseAlpha,
      phase: rng() * Math.PI * 2,
      jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2,
      jxSpeed: 0.3 + rng() * 1.0, jySpeed: 0.3 + rng() * 1.0,
    });
  }
  return particles;
}

/** Place photo nodes along spiral arms */
function generatePhotoNodes(
  rng: () => number,
  files: MediaFile[],
): PhotoNode[] {
  const nodes: PhotoNode[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const seed = (i * 16807 + 137) % 2147483647;
    const rng2 = createRNG(seed);

    const r = Math.pow(rng2(), 1.8);
    const armIndex = Math.floor(rng2() * ARM_COUNT);
    const armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;
    const spiralAngle = Math.log(1 + r * 10) * ARM_TWIST;
    const perpendicularNoise = (rng2() + rng2() + rng2()) / 3 - 0.5;
    const armWidth = ARM_WIDTH_FACTOR * (0.5 + 0.5 * (1 - r));
    const angleNoise = perpendicularNoise * armWidth * 3;

    const theta = armOffset + spiralAngle + angleNoise;
    const x = Math.cos(theta) * r * DISK_RADIUS;
    const z = Math.sin(theta) * r * DISK_RADIUS;
    const y = (rng2() - 0.5) * DISK_THICKNESS * (0.6 + 0.4 * (1 - r));

    const col = galaxyColor(r);
    const isVideo = file.type === 'video';
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
      jxPhase: rng2() * Math.PI * 2, jyPhase: rng2() * Math.PI * 2,
      jxSpeed: 0.2 + rng2() * 0.5, jySpeed: 0.2 + rng2() * 0.5,
    });
  }

  return nodes;
}

// ==================== Planet generation ====================

function generatePlanets(rng: () => number): Planet[] {
  const planets: Planet[] = [];
  const planetColors = [
    { r: 255, g: 180, b: 100 }, // warm orange
    { r: 120, g: 200, b: 255 }, // cool blue
    { r: 255, g: 140, b: 200 }, // pink
    { r: 180, g: 255, b: 160 }, // mint
    { r: 255, g: 220, b: 100 }, // gold
    { r: 200, g: 150, b: 255 }, // lavender
    { r: 255, g: 120, b: 120 }, // coral
  ];

  for (let i = 0; i < PLANET_COUNT; i++) {
    const color = planetColors[i];
    const orbitRadius = 0.18 + rng() * 0.78;
    const trail: { x: number; y: number; z: number }[] = [];
    for (let t = 0; t < PLANET_TRAIL_LENGTH; t++) {
      trail.push({ x: 0, y: 0, z: 0 });
    }

    planets.push({
      x: 0, y: 0, z: 0,
      size: 1.2 + rng() * 2.5,
      r: color.r, g: color.g, b: color.b,
      trail,
      trailHead: 0,
      orbitRadius,
      orbitSpeed: 0.15 + rng() * 0.55,
      orbitPhase: rng() * Math.PI * 2,
      orbitInclination: (rng() - 0.5) * 0.6,
    });
  }
  return planets;
}

// ==================== Component ====================

export default function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  const dustRef = useRef<DustParticle[]>([]);
  const haloRef = useRef<CloudParticle[]>([]);
  const spiralRef = useRef<CloudParticle[]>([]);
  const hiiRef = useRef<CloudParticle[]>([]);
  const dustLaneRef = useRef<CloudParticle[]>([]);
  const interArmRef = useRef<CloudParticle[]>([]);
  const photoNodesRef = useRef<PhotoNode[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const glowTexRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rotation state
  const rotationX = useRef(0.15);
  const rotationY = useRef(0);
  const velocityX = useRef(0);
  const velocityY = useRef(0);

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

    dustRef.current = [];
    haloRef.current = generateHaloStars(rng);
    spiralRef.current = generateSpiralParticles(rng);
    hiiRef.current = generateHIIParticles(rng);
    dustLaneRef.current = generateDustLanes(rng);
    interArmRef.current = generateInterArmParticles(rng);
    photoNodesRef.current = generatePhotoNodes(rng, manifest.files);
    planetsRef.current = generatePlanets(rng);
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
      glowTexRef.current = createGlowTexture(GLOW_TEXTURE_SIZE, 255, 252, 245);
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
    const rx1 = x * cosY + z * sinY;
    const rz1 = -x * sinY + z * cosY;
    const ry1 = y * cosX - rz1 * sinX;
    const rz2 = y * sinX + rz1 * cosX;
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

  // ---- Build offscreen background ----
  const buildBackground = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = w * dpr;
    bgCanvas.height = h * dpr;
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Deep black background
    bgCtx.fillStyle = '#000000';
    bgCtx.fillRect(0, 0, w, h);

    // Dark matter: subtle radial clouds
    const dmCx = w / 2;
    const dmCy = h / 2;
    const dmR = Math.max(w, h) * 1.1;
    const dmGrad = bgCtx.createRadialGradient(dmCx, dmCy, dmR * 0.05, dmCx, dmCy, dmR);
    dmGrad.addColorStop(0, 'rgba(18,14,28,0.25)');
    dmGrad.addColorStop(0.25, 'rgba(12,10,20,0.12)');
    dmGrad.addColorStop(0.55, 'rgba(6,5,10,0.04)');
    dmGrad.addColorStop(1, 'rgba(0,0,0,0)');
    bgCtx.fillStyle = dmGrad;
    bgCtx.fillRect(0, 0, w, h);

    // Ambient halo: warm core fading to cool edges
    const ambGrad = bgCtx.createRadialGradient(dmCx, dmCy, 0, dmCx, dmCy, dmR);
    ambGrad.addColorStop(0, 'rgba(25,18,12,0.18)');
    ambGrad.addColorStop(0.06, 'rgba(18,14,22,0.10)');
    ambGrad.addColorStop(0.25, 'rgba(8,7,15,0.03)');
    ambGrad.addColorStop(1, 'rgba(0,0,0,0)');
    bgCtx.fillStyle = ambGrad;
    bgCtx.fillRect(0, 0, w, h);

    bgCanvasRef.current = bgCanvas;
  }, []);

  // ---- Animation loop ----
  useEffect(() => {
    if (!manifest) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    startTimeRef.current = performance.now();
    buildBackground();

    // Generate foreground bokeh particles
    const bokehRng = createRNG(977);
    const bokehParticles: { x: number; y: number; size: number; alpha: number; r: number; g: number; b: number }[] = [];
    for (let i = 0; i < 16; i++) {
      bokehParticles.push({
        x: bokehRng() * 2 - 0.5,
        y: bokehRng() * 2 - 0.5,
        size: 8 + bokehRng() * 45,
        alpha: 0.03 + bokehRng() * 0.08,
        r: 180 + Math.round(bokehRng() * 75),
        g: 120 + Math.round(bokehRng() * 100),
        b: 180 + Math.round(bokehRng() * 75),
      });
    }

    // Meteor streak
    let meteorPhase = bokehRng() * Math.PI * 2;
    let meteorSpeed = 0.4 + bokehRng() * 1.2;

    const render = (timestamp: number) => {
      const elapsed = (timestamp - startTimeRef.current) / 1000;
      timeRef.current = elapsed;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const projScale = Math.min(w, h) * 0.55;

      // Smooth zoom
      const zoom = zoomRef.current;
      const zoomTarget = zoomTargetRef.current;
      if (Math.abs(zoom - zoomTarget) > 0.001) {
        zoomRef.current += (zoomTarget - zoom) * 0.12;
      } else {
        zoomRef.current = zoomTarget;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ===== LAYER 0: Offscreen background =====
      ctx.globalCompositeOperation = 'source-over';
      if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
      }

      // Auto-rotation + inertia
      if (!isPointerDown.current) {
        velocityY.current += ARM_ROTATION_SPEED * 0.001;
      }
      velocityY.current *= INERTIA_DECAY;
      rotationY.current += velocityY.current;
      velocityX.current *= INERTIA_DECAY;
      rotationX.current += velocityX.current;

      const rx = rotationX.current;
      const ry = rotationY.current;
      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const glowTex = glowTexRef.current;

      // ===== LAYER 0.5: Volume dust (removed) =====

      // ===== LAYER 1: Halo stars =====
      ctx.globalCompositeOperation = 'lighter';
      for (const p of haloRef.current) {
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue;

        const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * 2.5;
        const jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * 2.5;

        const breathe = 1 + Math.sin(elapsed * 0.6 + p.phase) * 0.08;
        const alpha = Math.min(0.25, p.baseAlpha * breathe);

        if (alpha < 0.022) continue;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.beginPath();
        ctx.arc(result.px + jx, result.py + jy, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 2: Spiral arm particles =====
      const spiralProj: { idx: number; px: number; py: number; depth: number; size: number; alpha: number; r: number; g: number; b: number }[] = [];

      for (let i = 0; i < spiralRef.current.length; i++) {
        const p = spiralRef.current[i];
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue;

        const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * 2.5;
        const jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * 2.5;

        const breathe = 1 + Math.sin(elapsed * 1.3 + p.phase) * 0.06;
        const alpha = Math.min(1, p.baseAlpha * breathe);

        if (alpha < 0.022) continue;

        const spx = result.px + jx;
        const spy = result.py + jy;

        spiralProj.push({
          idx: i, px: spx, py: spy, depth: result.depth,
          size: p.size, alpha, r: p.r, g: p.g, b: p.b,
        });
      }
      spiralProj.sort((a, b) => b.depth - a.depth);

      for (const cp of spiralProj) {
        const glowR = cp.size * 4.5;
        ctx.globalAlpha = cp.alpha;

        if (glowTex) {
          ctx.drawImage(glowTex, cp.px - glowR, cp.py - glowR, glowR * 2, glowR * 2);
        }

        // Sharp micro core
        if (cp.alpha > 0.12) {
          ctx.globalAlpha = Math.min(1, cp.alpha * 1.6);
          ctx.fillStyle = `rgb(${cp.r},${cp.g},${cp.b})`;
          ctx.beginPath();
          ctx.arc(cp.px, cp.py, cp.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Subtle trail — radius-based probability, no gradient
        const p = spiralRef.current[cp.idx];
        const trailProb = 0.02 + 0.98 * (p.radius3D - MIN_PARTICLE_RADIUS) / (1.0 - MIN_PARTICLE_RADIUS);
        const hash = ((cp.idx * 16807 + 13) % 2147483647) / 2147483647;
        const projectedSize = cp.size / Math.max(cp.depth + 2.2 / zoom, 0.3) * 0.6;
        if (cp.alpha > 0.08 && hash < trailProb) {
          const tangentAngle = Math.atan2(p.x, p.z) + Math.PI / 2;
          const tx = Math.cos(tangentAngle);
          const ty = Math.sin(tangentAngle);
          const trailLen = projectedSize * 0.10;
          ctx.globalAlpha = cp.alpha * 0.12;
          ctx.strokeStyle = `rgb(${cp.r},${cp.g},${cp.b})`;
          ctx.lineWidth = projectedSize * 0.06;
          ctx.beginPath();
          ctx.moveTo(cp.px, cp.py);
          ctx.lineTo(cp.px + tx * trailLen, cp.py + ty * trailLen);
          ctx.stroke();
        }
      }

      // ===== LAYER 2.1: Dust lanes =====
      ctx.globalCompositeOperation = 'source-over';
      for (const p of dustLaneRef.current) {
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue;

        const alpha = p.baseAlpha;
        if (alpha < 0.012) continue;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.beginPath();
        ctx.arc(result.px, result.py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 2.3: HII regions =====
      ctx.globalCompositeOperation = 'lighter';
      for (const p of hiiRef.current) {
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue;

        const alpha = p.baseAlpha * (1 + Math.sin(elapsed * 2.5 + p.phase) * 0.15);
        if (alpha < 0.022) continue;

        const glowR = p.size * 3.5;
        ctx.globalAlpha = alpha;

        if (glowTex) {
          ctx.drawImage(glowTex, result.px - glowR, result.py - glowR, glowR * 2, glowR * 2);
        }

        if (alpha > 0.08) {
          ctx.globalAlpha = Math.min(1, alpha * 1.4);
          ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
          ctx.beginPath();
          ctx.arc(result.px, result.py, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ===== LAYER 2.5: Inter-arm fill =====
      for (const p of interArmRef.current) {
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue;
        const alpha = p.baseAlpha;
        if (alpha < 0.022) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.beginPath();
        ctx.arc(result.px, result.py, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 2.7: Mini diffraction spikes on brightest HII =====
      const brightHII: { px: number; py: number; alpha: number }[] = [];
      for (const p of hiiRef.current) {
        const result = project3D(p.x, p.y, p.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (p.baseAlpha > 0.22) {
          brightHII.push({ px: result.px, py: result.py, alpha: p.baseAlpha });
        }
      }
      brightHII.sort((a, b) => b.alpha - a.alpha);
      for (let i = 0; i < Math.min(12, brightHII.length); i++) {
        const { px, py, alpha } = brightHII[i];
        const spikeLen = 3 + alpha * 10;
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
          ctx.beginPath();
          ctx.moveTo(px - Math.cos(angle) * spikeLen, py - Math.sin(angle) * spikeLen);
          ctx.lineTo(px + Math.cos(angle) * spikeLen, py + Math.sin(angle) * spikeLen);
          ctx.stroke();
        }
      }

      // ===== LAYER 2.8: Planet trails =====
      for (const planet of planetsRef.current) {
        planet.orbitPhase += planet.orbitSpeed * 0.008;
        const inclineAngle = planet.orbitInclination;
        const orbitX = Math.cos(planet.orbitPhase) * planet.orbitRadius;
        const orbitZ = Math.sin(planet.orbitPhase) * planet.orbitRadius;
        const orbitY = Math.sin(planet.orbitPhase * 1.7) * planet.orbitRadius * Math.sin(inclineAngle) * 0.3;
        planet.trail[planet.trailHead] = { x: orbitX, y: orbitY, z: orbitZ };
        planet.trailHead = (planet.trailHead + 1) % PLANET_TRAIL_LENGTH;

        // Draw trail
        for (let t = 0; t < PLANET_TRAIL_LENGTH; t++) {
          const idx = (planet.trailHead + t) % PLANET_TRAIL_LENGTH;
          const tp = planet.trail[idx];
          if (tp.x === 0 && tp.y === 0 && tp.z === 0) continue;
          const tr = project3D(tp.x, tp.y, tp.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
          if (!tr) continue;
          const trailAlpha = (t / PLANET_TRAIL_LENGTH) * 0.35;
          ctx.globalAlpha = trailAlpha;
          ctx.fillStyle = `rgb(${planet.r},${planet.g},${planet.b})`;
          ctx.beginPath();
          ctx.arc(tr.px, tr.py, planet.size * 0.3 * (t / PLANET_TRAIL_LENGTH), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ===== LAYER 3: Connection lines (removed) =====

      // ===== LAYER 4: Photo nodes =====
      ctx.globalCompositeOperation = 'source-over';
      const nodeProj: { n: PhotoNode; px: number; py: number; depth: number; size: number; alpha: number }[] = [];

      for (const n of photoNodesRef.current) {
        const result = project3D(n.x, n.y, n.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -30 || result.px > w + 30 || result.py < -30 || result.py > h + 30) continue;

        const jx = Math.sin(elapsed * n.jxSpeed + n.jxPhase) * 1.8;
        const jy = Math.cos(elapsed * n.jySpeed + n.jyPhase) * 1.8;

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

        nodeProj.push({ n, px: result.px + jx, py: result.py + jy, depth: result.depth, size: Math.max(0.6, size), alpha });
      }
      nodeProj.sort((a, b) => a.depth - b.depth);

      for (const np of nodeProj) {
        const { n, px, py, size, alpha } = np;
        const glowR = size * 5.0;

        ctx.globalAlpha = alpha * 0.8;
        if (glowTex) {
          ctx.drawImage(glowTex, px - glowR, py - glowR, glowR * 2, glowR * 2);
        }

        ctx.globalAlpha = Math.min(1, alpha * 1.4);
        ctx.fillStyle = `rgb(${n.r},${n.g},${n.b})`;
        ctx.beginPath();
        ctx.arc(px, py, size * 0.75, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = Math.min(1, alpha * 1.1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, size * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 4.5: Planet cores =====
      for (const planet of planetsRef.current) {
        const result = project3D(planet.x, planet.y, planet.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        const pSize = Math.max(1.5, planet.size / Math.max(result.depth + 2.2 / zoom, 0.3) * 0.55);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = `rgb(${planet.r},${planet.g},${planet.b})`;
        ctx.beginPath();
        ctx.arc(result.px, result.py, pSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 4.7: Foreground bokeh =====
      for (const b of bokehParticles) {
        const bx = w * 0.5 + (b.x - 0.5) * w * 1.3;
        const by = h * 0.5 + (b.y - 0.5) * h * 1.3;
        ctx.globalAlpha = b.alpha * (0.7 + 0.3 * Math.sin(elapsed * 0.4 + b.x * 10));
        ctx.fillStyle = `rgb(${b.r},${b.g},${b.b})`;
        ctx.beginPath();
        ctx.arc(bx, by, b.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== LAYER 4.8: Meteor streak =====
      meteorPhase += meteorSpeed * 0.006;
      const meteorAngle = meteorPhase;
      const meteorDist = 0.55 + 0.35 * Math.sin(meteorPhase * 3.7);
      const mx = cx + Math.cos(meteorAngle) * meteorDist * Math.min(w, h);
      const my = cy + Math.sin(meteorAngle) * meteorDist * Math.min(w, h);
      const streakLen = 18 + Math.abs(Math.sin(meteorPhase * 5.5)) * 45;
      ctx.globalAlpha = 0.25 + Math.abs(Math.sin(meteorPhase * 2.3)) * 0.3;
      ctx.strokeStyle = '#fffef5';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx - Math.cos(meteorAngle) * streakLen, my - Math.sin(meteorAngle) * streakLen);
      ctx.stroke();

      // ===== LAYER 5: Hint ring / core glow =====
      const coreR = Math.min(w, h) * 0.20;
      const coreLayers = [
        { r: coreR * 2.2, stops: [
          [0, 'rgba(255,235,190,0.025)'],
          [0.15, 'rgba(255,220,155,0.012)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        { r: coreR * 1.2, stops: [
          [0, 'rgba(255,240,210,0.08)'],
          [0.12, 'rgba(255,225,170,0.03)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        { r: coreR * 0.55, stops: [
          [0, 'rgba(255,248,235,0.25)'],
          [0.10, 'rgba(255,240,210,0.12)'],
          [0.35, 'rgba(255,225,170,0.025)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        { r: coreR * 0.20, stops: [
          [0, 'rgba(255,252,248,0.65)'],
          [0.12, 'rgba(255,245,220,0.25)'],
          [0.40, 'rgba(255,230,180,0.06)'],
          [1, 'rgba(0,0,0,0)'],
        ]},
        { r: coreR * 0.06, stops: [
          [0, 'rgba(255,255,255,1.0)'],
          [0.15, 'rgba(255,253,248,0.70)'],
          [0.45, 'rgba(255,240,200,0.12)'],
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

      // ===== LAYER 6: Lens flare =====
      const flareBase = Math.min(w, h) * 0.20;
      // Horizontal spike
      ctx.globalAlpha = 0.8;
      const spikeGrad = ctx.createLinearGradient(cx - flareBase * 1.8, cy, cx + flareBase * 1.8, cy);
      spikeGrad.addColorStop(0, 'rgba(255,255,255,0)');
      spikeGrad.addColorStop(0.48, 'rgba(255,252,245,0.02)');
      spikeGrad.addColorStop(0.5, 'rgba(255,255,255,0.60)');
      spikeGrad.addColorStop(0.52, 'rgba(255,252,245,0.02)');
      spikeGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spikeGrad;
      ctx.fillRect(cx - flareBase * 1.8, cy - 1.0, flareBase * 3.6, 2.0);

      // Vertical spike
      const vGrad = ctx.createLinearGradient(cx, cy - flareBase * 1.8, cx, cy + flareBase * 1.8);
      vGrad.addColorStop(0, 'rgba(255,255,255,0)');
      vGrad.addColorStop(0.48, 'rgba(255,252,245,0.02)');
      vGrad.addColorStop(0.5, 'rgba(255,255,255,0.60)');
      vGrad.addColorStop(0.52, 'rgba(255,252,245,0.02)');
      vGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(cx - 1.0, cy - flareBase * 1.8, 2.0, flareBase * 3.6);

      // Secondary diagonal spikes
      ctx.globalAlpha = 0.18;
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x1 = cx - cos * flareBase * 1.2;
        const y1 = cy - sin * flareBase * 1.2;
        const x2 = cx + cos * flareBase * 1.2;
        const y2 = cy + sin * flareBase * 1.2;
        const dGrad = ctx.createLinearGradient(x1, y1, x2, y2);
        dGrad.addColorStop(0, 'rgba(255,255,255,0)');
        dGrad.addColorStop(0.48, 'rgba(255,200,180,0.01)');
        dGrad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
        dGrad.addColorStop(0.52, 'rgba(255,200,180,0.01)');
        dGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = dGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Ghost reflections
      ctx.globalAlpha = 0.04;
      for (let g = 0; g < 3; g++) {
        const gDist = flareBase * (1.5 + g * 1.1);
        const gSize = coreR * (0.18 - g * 0.04);
        if (gSize < 2) continue;
        const gx = cx + gDist * 0.3;
        const gy = cy - gDist * 0.25;
        const gGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gSize);
        gGrad.addColorStop(0, 'rgba(255,245,220,0.7)');
        gGrad.addColorStop(0.4, 'rgba(200,180,240,0.3)');
        gGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gGrad;
        ctx.beginPath();
        ctx.arc(gx, gy, gSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Reset
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [manifest, buildBackground]);

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
