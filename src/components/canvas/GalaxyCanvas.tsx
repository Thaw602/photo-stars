import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore, type MediaFile } from '../../store';
import { useGalaxyAnimation, type TickOutput } from '../../hooks/useGalaxyAnimation';

// perf v3 — optimized render pipeline: offscreen BG, no sort, culled draw
// ==================== Types ====================

interface CloudParticle {
  x: number; y: number; z: number;
  radius3D: number;
  size: number;
  r: number; g: number; b: number;
  baseAlpha: number;
  phase: number;
  jxPhase: number; jyPhase: number;
  jxSpeed: number; jySpeed: number;
}

interface DustParticle {
  x: number; y: number;
  size: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  r: number; g: number; b: number;
}

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
  flyProgress: number;
  isVideo: boolean;
  jxPhase: number; jyPhase: number;
  jxSpeed: number; jySpeed: number;
}

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

interface VideoFillParticle {
  x: number; y: number; z: number;
  size: number;
  alpha: number;
  phase: number;
  speed: number;
}

// ==================== Constants ====================
const BG_STAR_COUNT = 0;
const HALO_STAR_COUNT = 500;
const SPIRAL_PARTICLE_COUNT = 28000;
const INTER_ARM_PARTICLE_COUNT = 2000;
const HII_REGION_COUNT = 16;
const HII_PARTICLES_PER_REGION = 45;
const DUST_LANE_COUNT = 3000;
const VOLUME_DUST_COUNT = 0;
const DEEP_FIELD_STAR_COUNT = 0;
const DARK_MATTER_CLOUD_COUNT = 14;
const GLOW_TEXTURE_SIZE = 48;
const DISK_RADIUS = 1.0;
const DISK_THICKNESS = 0.11;
const ARM_COUNT = 5;
const ARM_TWIST = 3.8;
const ARM_WIDTH_FACTOR = 0.22;
const MIN_PARTICLE_RADIUS = 0.07;
const ARM_ROTATION_SPEED = 0.0070;
const JITTER_AMPLITUDE = 1.5;
const CORE_SCALE = 30.0;
// Video galaxy — sister galaxy, ~50% area, placed to the right
const VIDEO_GALAXY_SCALE = 0.25;
const VIDEO_GALAXY_X_OFFSET = 1.25;
const VIDEO_GALAXY_Z_OFFSET = -0.25;
const VIDEO_CORE_SCALE = 0.60;
const VIDEO_CONNECT_DIST_FACTOR = 0.70;
const VIDEO_FILL_COUNT = 5000;
const INERTIA_DECAY = 0.94;
const PLANET_COUNT = 7;
const PLANET_TRAIL_LENGTH = 50;
const PLANET_COLORS: { r: number; g: number; b: number }[] = [
  { r: 255, g: 50, b: 50 }, { r: 50, g: 130, b: 255 }, { r: 50, g: 255, b: 100 },
  { r: 220, g: 50, b: 255 }, { r: 255, g: 150, b: 30 }, { r: 30, g: 245, b: 245 }, { r: 255, g: 110, b: 190 },
];

function createRNG(seed: number) {
  let s = seed;
  return function (): number { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function galaxyColor(r: number): { r: number; g: number; b: number } {
  if (r < 0.08) { const f = r / 0.08; return { r: 255, g: 248 + Math.round(f * 7), b: 225 + Math.round(f * 30) }; }
  if (r < 0.22) { const f = (r - 0.08) / 0.14; return { r: 255 - Math.round(f * 215), g: 255 - Math.round(f * 35), b: 255 - Math.round(f * 55) }; }
  if (r < 0.46) { const f = (r - 0.22) / 0.24; return { r: 40 + Math.round(f * 215), g: 220 - Math.round(f * 155), b: 200 - Math.round(f * 110) }; }
  if (r < 0.72) { const f = (r - 0.46) / 0.26; return { r: 255, g: 65 - Math.round(f * 50), b: 90 + Math.round(f * 110) }; }
  const f = Math.min(1, (r - 0.72) / 0.28);
  return { r: 255 - Math.round(f * 175), g: 15 + Math.round(f * 5), b: 200 - Math.round(f * 95) };
}

function createGlowTexture(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!; const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255,252,245,1)'); grad.addColorStop(0.06, 'rgba(240,225,200,0.92)');
  grad.addColorStop(0.20, 'rgba(200,175,145,0.52)'); grad.addColorStop(0.42, 'rgba(140,115,90,0.10)');
  grad.addColorStop(0.68, 'rgba(70,55,40,0.015)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size); return canvas;
}

function sampleDisk3D(rng: () => number, radius: number, thickness: number): { x: number; y: number; z: number; r: number } {
  let u: number, v: number, s: number;
  do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s >= 1);
  const nx = 2 * u * Math.sqrt(1 - s), ny = 2 * v * Math.sqrt(1 - s), nz = 1 - 2 * s;
  const rNorm = Math.pow(rng(), 2.5);
  return { x: nx * rNorm * radius, y: ny * rNorm * thickness, z: nz * rNorm * radius, r: rNorm };
}

function generateBackgroundStars(rng: () => number): DustParticle[] {
  const stars: DustParticle[] = [];
  for (let i = 0; i < BG_STAR_COUNT; i++) {
    const x = rng(), y = rng(), size = 0.08 + rng() * 0.42;
    const colorRoll = rng(); let cr: number, cg: number, cb: number;
    if (colorRoll < 0.48) { cr = 195 + Math.round(rng() * 55); cg = 210 + Math.round(rng() * 40); cb = 235 + Math.round(rng() * 20); }
    else if (colorRoll < 0.85) { cr = 165 + Math.round(rng() * 50); cg = 188 + Math.round(rng() * 42); cb = 225 + Math.round(rng() * 30); }
    else if (colorRoll < 0.94) { cr = 228 + Math.round(rng() * 22); cg = 212 + Math.round(rng() * 28); cb = 170 + Math.round(rng() * 35); }
    else { const v = 190 + Math.round(rng() * 55); cr = v; cg = v; cb = v; }
    const twinklePeriod = 4 + rng() * 2, twinkleSpeed = (2 * Math.PI) / twinklePeriod;
    stars.push({ x, y, size, baseAlpha: 0.012 + rng() * 0.048, twinklePhase: rng() * Math.PI * 2, twinkleSpeed, r: cr, g: cg, b: cb });
  }
  return stars;
}

function generateDeepFieldStars(rng: () => number): DustParticle[] {
  const stars: DustParticle[] = [];
  for (let i = 0; i < DEEP_FIELD_STAR_COUNT; i++) {
    const x = rng(), y = rng(), size = 0.5 + rng() * 1.0;
    const colorRoll = rng(); let cr: number, cg: number, cb: number;
    if (colorRoll < 0.40) { cr = 150 + Math.round(rng() * 40); cg = 185 + Math.round(rng() * 35); cb = 220 + Math.round(rng() * 35); }
    else if (colorRoll < 0.78) { const v = 190 + Math.round(rng() * 50); cr = v; cg = v; cb = Math.min(255, v + 12); }
    else { cr = 130 + Math.round(rng() * 40); cg = 195 + Math.round(rng() * 35); cb = 210 + Math.round(rng() * 40); }
    const twinklePeriod = 3 + rng() * 2, twinkleSpeed = (2 * Math.PI) / twinklePeriod;
    stars.push({ x, y, size, baseAlpha: 0.08 + rng() * 0.22, twinklePhase: rng() * Math.PI * 2, twinkleSpeed, r: cr, g: cg, b: cb });
  }
  return stars;
}

function generateHaloStars(rng: () => number): CloudParticle[] {
  const stars: CloudParticle[] = [];
  for (let i = 0; i < HALO_STAR_COUNT; i++) {
    const pos = sampleDisk3D(rng, 0.95, 0.18), col = galaxyColor(pos.r);
    stars.push({ x: pos.x, y: pos.y, z: pos.z, radius3D: pos.r, size: 0.25 + rng() * 0.7, r: col.r, g: col.g, b: col.b, baseAlpha: 0.03 + (1 - pos.r) * 0.10 + rng() * 0.04, phase: rng() * Math.PI * 2, jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2, jxSpeed: 0.6 + rng() * 2.4, jySpeed: 0.5 + rng() * 2.6 });
  }
  return stars;
}

function generateSpiralParticles(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];
  const NODE_COUNT = 36;
  const nodes: { r: number; armIndex: number; strength: number }[] = [];
  for (let n = 0; n < NODE_COUNT; n++) nodes.push({ r: MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(), armIndex: Math.floor(rng() * ARM_COUNT), strength: 0.4 + rng() * 0.6 });
  for (let i = 0; i < SPIRAL_PARTICLE_COUNT; i++) {
    let r = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng();
    const armIndex = Math.floor(rng() * ARM_COUNT), armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;
    if (rng() < 0.35) { let bestDist = Infinity, bestNode: typeof nodes[0] | null = null;
      for (const node of nodes) { if (node.armIndex !== armIndex) continue; const dist = Math.abs(r - node.r); if (dist < bestDist) { bestDist = dist; bestNode = node; } }
      if (bestNode && bestDist < 0.18) r = r + (bestNode.r - r) * bestNode.strength * 0.7; }
    const spiralAngle = Math.log(1 + r * 10) * ARM_TWIST;
    const perpendicularNoise = (rng() + rng() + rng()) / 3 - 0.5;
    const armWidth = ARM_WIDTH_FACTOR * (0.5 + 0.5 * (1 - r)), angleNoise = perpendicularNoise * armWidth * 2;
    const theta = armOffset + spiralAngle + angleNoise;
    const x = Math.cos(theta) * r * DISK_RADIUS, z = Math.sin(theta) * r * DISK_RADIUS, y = (rng() - 0.5) * DISK_THICKNESS * (0.6 + 0.4 * (1 - r));
    const col = galaxyColor(r);
    const armDist = Math.abs(perpendicularNoise), armBrightness = 1 - armDist * 0.8;
    const outerTaper = r > 0.45 ? Math.max(0.08, 1 - (r - 0.45) / 0.55) : 1;
    const baseAlpha = (0.05 + (1 - r) * 0.16 + rng() * 0.04) * armBrightness * outerTaper;
    const size = 0.35 + (1 - r) * 1.8 + rng() * 0.6;
    particles.push({ x, y, z, radius3D: r, size, r: col.r, g: col.g, b: col.b, baseAlpha: Math.min(1, baseAlpha), phase: rng() * Math.PI * 2, jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2, jxSpeed: 0.5 + rng() * 2.2, jySpeed: 0.5 + rng() * 2.2 });
  }
  return particles;
}

function generateInterArmParticles(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];
  for (let i = 0; i < INTER_ARM_PARTICLE_COUNT; i++) {
    const r = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(), theta = rng() * Math.PI * 2;
    const x = Math.cos(theta) * r * DISK_RADIUS, z = Math.sin(theta) * r * DISK_RADIUS, y = (rng() - 0.5) * DISK_THICKNESS * (0.6 + 0.4 * (1 - r));
    const col = galaxyColor(r), size = 0.12 + rng() * 0.45;
    const outerTaper = r > 0.45 ? Math.max(0.06, 1 - (r - 0.45) / 0.55) : 1;
    const baseAlpha = (0.015 + (1 - r) * 0.06 + rng() * 0.02) * outerTaper;
    particles.push({ x, y, z, radius3D: r, size, r: col.r, g: col.g, b: col.b, baseAlpha: Math.min(1, baseAlpha), phase: rng() * Math.PI * 2, jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2, jxSpeed: 0.4 + rng() * 1.8, jySpeed: 0.4 + rng() * 1.8 });
  }
  return particles;
}

function generateHIIParticles(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];
  const clusters: { r: number; theta: number; size: number }[] = [];
  for (let c = 0; c < HII_REGION_COUNT; c++) { const cr = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(), armIndex = Math.floor(rng() * ARM_COUNT), armOffset = (armIndex / ARM_COUNT) * Math.PI * 2, spiralAngle = Math.log(1 + cr * 10) * ARM_TWIST; clusters.push({ r: cr, theta: armOffset + spiralAngle, size: 0.015 + rng() * 0.03 }); }
  for (const cluster of clusters) { for (let p = 0; p < HII_PARTICLES_PER_REGION; p++) { const gaussR = (rng() + rng() + rng()) / 3, r = cluster.r + (gaussR - 0.5) * cluster.size * 2, gaussTheta = (rng() + rng() + rng()) / 3, theta = cluster.theta + (gaussTheta - 0.5) * cluster.size * 2.5; const x = Math.cos(theta) * r * DISK_RADIUS, z = Math.sin(theta) * r * DISK_RADIUS, y = (rng() - 0.5) * DISK_THICKNESS * 0.4; const colorRoll = rng(); let cr: number, cg: number, cb: number; if (colorRoll < 0.45) { cr = 255; cg = 68 + Math.round(rng() * 80); cb = 136 + Math.round(rng() * 60); } else if (colorRoll < 0.75) { cr = 255; cg = 102 + Math.round(rng() * 70); cb = 68 + Math.round(rng() * 60); } else if (colorRoll < 0.92) { cr = 255; cg = 68 + Math.round(rng() * 60); cb = 170 + Math.round(rng() * 60); } else { cr = 255; cg = 200 + Math.round(rng() * 55); cb = 210 + Math.round(rng() * 45); } const baseAlpha = 0.10 + rng() * 0.18, size = 0.5 + rng() * 1.2; particles.push({ x, y, z, radius3D: Math.min(1, Math.max(0, r)), size, r: cr, g: cg, b: cb, baseAlpha: Math.min(1, baseAlpha), phase: rng() * Math.PI * 2, jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2, jxSpeed: 0.3 + rng() * 1.8, jySpeed: 0.3 + rng() * 1.8 }); } }
  return particles;
}

function generateDustLanes(rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];
  for (let i = 0; i < DUST_LANE_COUNT; i++) { const r = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * rng(), armIndex = Math.floor(rng() * ARM_COUNT), armOffset = (armIndex / ARM_COUNT) * Math.PI * 2, spiralAngle = Math.log(1 + r * 10) * ARM_TWIST; const dustOffset = -0.04 - rng() * 0.06, perpendicularNoise = (rng() + rng() + rng()) / 3 - 0.5, armWidth = ARM_WIDTH_FACTOR * (0.4 + 0.6 * (1 - r)) * 0.6, angleNoise = perpendicularNoise * armWidth * 2 + dustOffset; const theta = armOffset + spiralAngle + angleNoise, x = Math.cos(theta) * r * DISK_RADIUS, z = Math.sin(theta) * r * DISK_RADIUS, y = (rng() - 0.5) * DISK_THICKNESS * 0.3; const tintRoll = rng(); let cr: number, cg: number, cb: number; if (tintRoll < 0.5) { cr = 6 + Math.round(rng() * 8); cg = 3 + Math.round(rng() * 6); cb = 8 + Math.round(rng() * 10); } else { cr = 4 + Math.round(rng() * 6); cg = 6 + Math.round(rng() * 8); cb = 10 + Math.round(rng() * 10); } particles.push({ x, y, z, radius3D: r, size: 0.3 + rng() * 0.6, r: cr, g: cg, b: cb, baseAlpha: 0.015 + rng() * 0.05, phase: rng() * Math.PI * 2, jxPhase: rng() * Math.PI * 2, jyPhase: rng() * Math.PI * 2, jxSpeed: 0.4 + rng() * 0.6, jySpeed: 0.4 + rng() * 0.6 }); }
  return particles;
}

function generateBokeh(rng: () => number): DustParticle[] {
  const bokeh: DustParticle[] = []; const BOKEH_COUNT = 16;
  for (let i = 0; i < BOKEH_COUNT; i++) { const edgeBias = () => { const t = rng(); return t < 0.5 ? Math.pow(t * 2, 3) / 2 : 1 - Math.pow((1 - t) * 2, 3) / 2; }; const x = edgeBias(), y = edgeBias(), size = 15 + rng() * 45; const colorRoll = rng(); let cr: number, cg: number, cb: number; if (colorRoll < 0.35) { cr = 60 + Math.round(rng() * 60); cg = 100 + Math.round(rng() * 60); cb = 180 + Math.round(rng() * 75); } else if (colorRoll < 0.65) { cr = 120 + Math.round(rng() * 50); cg = 60 + Math.round(rng() * 50); cb = 160 + Math.round(rng() * 80); } else if (colorRoll < 0.88) { cr = 80 + Math.round(rng() * 60); cg = 140 + Math.round(rng() * 60); cb = 170 + Math.round(rng() * 70); } else { const v = 170 + Math.round(rng() * 75); cr = v; cg = v; cb = Math.min(255, v + 20); } const baseAlpha = 0.02 + rng() * 0.06, twinklePeriod = 6 + rng() * 4, twinkleSpeed = (2 * Math.PI) / twinklePeriod; bokeh.push({ x, y, size, baseAlpha, twinklePhase: rng() * Math.PI * 2, twinkleSpeed, r: cr, g: cg, b: cb }); }
  return bokeh;
}

function generateVolumeDust(_rng: () => number): CloudParticle[] {
  const particles: CloudParticle[] = [];
  for (let i = 0; i < VOLUME_DUST_COUNT; i++) { /* removed */ }
  return particles;
}

function generatePlanets(rng: () => number): Planet[] {
  const planets: Planet[] = [];
  for (let i = 0; i < PLANET_COUNT; i++) { const color = PLANET_COLORS[i], orbitRadius = 0.2 + rng() * 0.8, orbitSpeed = 0.0004 + rng() * 0.0012, orbitPhase = rng() * Math.PI * 2, orbitInclination = (rng() - 0.5) * 0.6; const cosPhi = Math.cos(orbitPhase), sinPhi = Math.sin(orbitPhase), baseX = cosPhi * orbitRadius * DISK_RADIUS, baseZ = sinPhi * orbitRadius * DISK_RADIUS; const cosInc = Math.cos(orbitInclination), sinInc = Math.sin(orbitInclination); const x = baseX, y = baseZ * sinInc, z = baseZ * cosInc; const trail: { x: number; y: number; z: number }[] = []; for (let t = 0; t < PLANET_TRAIL_LENGTH; t++) trail.push({ x, y, z }); planets.push({ x, y, z, size: 0.8 + rng() * 1.5, r: color.r, g: color.g, b: color.b, trail, trailHead: 0, orbitRadius, orbitSpeed, orbitPhase, orbitInclination }); }
  return planets;
}

/** Place a single node on a golden spiral arm. Returns {x, y, z, r}. Scaled by `scale` for video galaxy. */
function placeOnSpiralArm(rng: () => number, scale: number): { x: number; y: number; z: number; r: number } {
  const r = MIN_PARTICLE_RADIUS + (1 - MIN_PARTICLE_RADIUS) * Math.pow(rng(), 1.8);
  const armIndex = Math.floor(rng() * ARM_COUNT);
  const armOffset = (armIndex / ARM_COUNT) * Math.PI * 2;
  const spiralAngle = Math.log(1 + r * 10) * ARM_TWIST;
  const perpendicularNoise = (rng() + rng() + rng()) / 3 - 0.5;
  const armWidth = ARM_WIDTH_FACTOR * (0.5 + 0.5 * (1 - r));
  const angleNoise = perpendicularNoise * armWidth * 3;
  const theta = armOffset + spiralAngle + angleNoise;
  const x = Math.cos(theta) * r * DISK_RADIUS * scale;
  const z = Math.sin(theta) * r * DISK_RADIUS * scale;
  const y = (rng() - 0.5) * DISK_THICKNESS * (0.6 + 0.4 * (1 - r)) * scale;
  return { x, y, z, r };
}

function generateVideoFillParticles(rng: () => number): VideoFillParticle[] {
  const particles: VideoFillParticle[] = [];
  for (let i = 0; i < VIDEO_FILL_COUNT; i++) {
    const pos = placeOnSpiralArm(rng, VIDEO_GALAXY_SCALE);
    // Bias toward outer arms where density matters more
    const armBias = pos.r;
    particles.push({
      x: pos.x + VIDEO_GALAXY_X_OFFSET,
      y: pos.y,
      z: pos.z + VIDEO_GALAXY_Z_OFFSET,
      size: 0.2 + rng() * 0.6,
      alpha: (0.12 + rng() * 0.40) * (0.6 + armBias * 0.4),
      phase: rng() * Math.PI * 2,
      speed: 1.5 + rng() * 2.5,
    });
  }
  return particles;
}

function generatePhotoNodes(files: MediaFile[]): PhotoNode[] {
  const nodes: PhotoNode[] = [];
  const videoIndices: number[] = [];
  const photoIndices: number[] = [];
  for (let i = 0; i < files.length; i++) {
    if (files[i].type === 'video') videoIndices.push(i);
    else photoIndices.push(i);
  }
  const seeds = files.map((_, i) => (i * 16807 + 137) % 2147483647);
  const rngs = seeds.map(s => createRNG(s));
  for (let vi = 0; vi < videoIndices.length; vi++) {
    const i = videoIndices[vi], rng2 = rngs[i];
    const pos = placeOnSpiralArm(rng2, VIDEO_GALAXY_SCALE);
    const x = pos.x + VIDEO_GALAXY_X_OFFSET;
    const y = pos.y;
    const z = pos.z + VIDEO_GALAXY_Z_OFFSET;
    const baseSize = (1.5 + (1 - pos.r) * 2.8 + rng2() * 1.0) * 0.85; // slightly smaller for fill
    nodes.push({ id: i, fileIndex: i, x, y, z, radius3D: pos.r * VIDEO_GALAXY_SCALE, baseSize, r: 140, g: 210, b: 255, phase: rng2() * Math.PI * 2, hoverScale: 1.0, clickFlash: 0, flyProgress: 0, isVideo: true, jxPhase: rng2() * Math.PI * 2, jyPhase: rng2() * Math.PI * 2, jxSpeed: 0.4 + rng2() * 1.8, jySpeed: 0.4 + rng2() * 1.8 });
  }
  for (let pi = 0; pi < photoIndices.length; pi++) {
    const i = photoIndices[pi], rng2 = rngs[i];
    const pos = placeOnSpiralArm(rng2, 1.0);
    const col = galaxyColor(pos.r), baseSize = 1.5 + (1 - pos.r) * 2.8 + rng2() * 1.0;
    nodes.push({ id: i, fileIndex: i, x: pos.x, y: pos.y, z: pos.z, radius3D: pos.r, baseSize, r: Math.min(255, col.r), g: Math.min(255, col.g), b: Math.min(255, col.b), phase: rng2() * Math.PI * 2, hoverScale: 1.0, clickFlash: 0, flyProgress: 0, isVideo: false, jxPhase: rng2() * Math.PI * 2, jyPhase: rng2() * Math.PI * 2, jxSpeed: 0.4 + rng2() * 1.8, jySpeed: 0.4 + rng2() * 1.8 });
  }
  return nodes;
}

function generateUploadedPhotoNodes(files: MediaFile[], startIndex: number): PhotoNode[] {
  const nodes: PhotoNode[] = [];
  const videoIndices: number[] = [];
  const photoIndices: number[] = [];
  for (let i = 0; i < files.length; i++) {
    if (files[i].type === 'video') videoIndices.push(i);
    else photoIndices.push(i);
  }
  const seeds = files.map((_, i) => ((startIndex + i) * 16807 + 137) % 2147483647);
  const rngs = seeds.map(s => createRNG(s));
  for (let vi = 0; vi < videoIndices.length; vi++) {
    const i = videoIndices[vi], globalIdx = startIndex + i, rng2 = rngs[i];
    const pos = placeOnSpiralArm(rng2, VIDEO_GALAXY_SCALE);
    const x = pos.x + VIDEO_GALAXY_X_OFFSET;
    const y = pos.y;
    const z = pos.z + VIDEO_GALAXY_Z_OFFSET;
    const baseSize = (1.5 + (1 - pos.r) * 2.8 + rng2() * 1.0) * 0.85;
    nodes.push({ id: globalIdx, fileIndex: globalIdx, x, y, z, radius3D: pos.r * VIDEO_GALAXY_SCALE, baseSize, r: 140, g: 210, b: 255, phase: rng2() * Math.PI * 2, hoverScale: 1.0, clickFlash: 0, flyProgress: 0, isVideo: true, jxPhase: rng2() * Math.PI * 2, jyPhase: rng2() * Math.PI * 2, jxSpeed: 0.4 + rng2() * 1.8, jySpeed: 0.4 + rng2() * 1.8 });
  }
  for (let pi = 0; pi < photoIndices.length; pi++) {
    const i = photoIndices[pi], globalIdx = startIndex + i, rng2 = rngs[i];
    const pos = placeOnSpiralArm(rng2, 1.0);
    const baseSize = 1.5 + (1 - pos.r) * 2.8 + rng2() * 1.0;
    const rr = 40 + Math.round(rng2() * 80), gg = 180 + Math.round(rng2() * 75), bb = 210 + Math.round(rng2() * 45);
    nodes.push({ id: globalIdx, fileIndex: globalIdx, x: pos.x, y: pos.y, z: pos.z, radius3D: pos.r, baseSize, r: rr, g: gg, b: bb, phase: rng2() * Math.PI * 2, hoverScale: 1.0, clickFlash: 0, flyProgress: 0, isVideo: false, jxPhase: rng2() * Math.PI * 2, jyPhase: rng2() * Math.PI * 2, jxSpeed: 0.4 + rng2() * 1.8, jySpeed: 0.4 + rng2() * 1.8 });
  }
  return nodes;
}

// ==================== Component ====================
export default function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null); const animRef = useRef<number>(0); const startTimeRef = useRef<number>(0);
  const dustRef = useRef<DustParticle[]>([]); const deepFieldRef = useRef<DustParticle[]>([]); const bokehRef = useRef<DustParticle[]>([]);
  const haloRef = useRef<CloudParticle[]>([]); const spiralRef = useRef<CloudParticle[]>([]); const interArmRef = useRef<CloudParticle[]>([]);
  const volumeDustRef = useRef<CloudParticle[]>([]); const hiiRef = useRef<CloudParticle[]>([]); const dustLaneRef = useRef<CloudParticle[]>([]);
  const photoNodesRef = useRef<PhotoNode[]>([]); const planetsRef = useRef<Planet[]>([]); const videoFillRef = useRef<VideoFillParticle[]>([]);
  const glowTexRef = useRef<HTMLCanvasElement | null>(null); const bgStarsOffscreen = useRef<HTMLCanvasElement | null>(null);
  const darkMatterSeeds = useRef<{ x: number; y: number; r: number; hue: number }[] | null>(null);
  const frameCount = useRef(-1);
  const { tick, triggerGold, setFocus } = useGalaxyAnimation();
  const animStateRef = useRef<TickOutput | null>(null);
  const flyOutScreen = useRef<{ px: number; py: number; fileIndex: number; size: number } | null>(null);
  const rotationX = useRef(0.15); const rotationY = useRef(0); const galaxyRotation = useRef(0); const videoGalaxyRotation = useRef(0);
  const angularVelocity = useRef({ x: 0, y: 0 }); const lastDragPos = useRef({ x: 0, y: 0 }); const pointerDownTime = useRef(0);
  const panX = useRef(0); const panY = useRef(0); const isRightDrag = useRef(false); const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const meteorRef = useRef<{ active: boolean; startX: number; startY: number; endX: number; endY: number; progress: number; speed: number; r: number; g: number; b: number }>({ active: false, startX: 0, startY: 0, endX: 0, endY: 0, progress: 0, speed: 0, r: 255, g: 255, b: 255 });
  const nextMeteorTime = useRef(performance.now() + 25000 + Math.random() * 35000);
  const zoomRef = useRef(1.0); const zoomTargetRef = useRef(1.0); const ZOOM_MIN = 0.15; const ZOOM_MAX = 8.0;
  const hoveredRef = useRef<number>(-1); const isPointerDown = useRef(false); const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, rx: 0, ry: 0 });
  const manifest = useAppStore((s) => s.manifest); const selectFile = useAppStore((s) => s.selectFile);
  const uploadedPhotos = useAppStore((s) => s.uploadedPhotos);

  const initParticles = useCallback(() => {
    if (!manifest) return; const rng = createRNG(137);
    dustRef.current = generateBackgroundStars(rng); deepFieldRef.current = generateDeepFieldStars(rng);
    bokehRef.current = generateBokeh(rng); haloRef.current = generateHaloStars(rng);
    volumeDustRef.current = generateVolumeDust(rng); spiralRef.current = generateSpiralParticles(rng);
    interArmRef.current = generateInterArmParticles(rng); hiiRef.current = generateHIIParticles(rng);
    dustLaneRef.current = generateDustLanes(rng); planetsRef.current = generatePlanets(rng);
    photoNodesRef.current = generatePhotoNodes(manifest.files);
    const vfRng = createRNG(9973);
    videoFillRef.current = generateVideoFillParticles(vfRng);
  }, [manifest]);

  useEffect(() => { const resize = () => { const canvas = canvasRef.current; if (!canvas) return; const parent = canvas.parentElement; if (!parent) return; const w = parent.clientWidth, h = parent.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; bgStarsOffscreen.current = null; }; resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);

  useEffect(() => { if (manifest) { initParticles(); glowTexRef.current = createGlowTexture(GLOW_TEXTURE_SIZE); } }, [manifest, initParticles]);

  useEffect(() => {
    if (!manifest || uploadedPhotos.length === 0) { if (photoNodesRef.current.length > (manifest?.files?.length ?? 0)) photoNodesRef.current = photoNodesRef.current.slice(0, manifest?.files?.length ?? 0); return; }
    const builtInCount = manifest.files.length, totalExpected = builtInCount + uploadedPhotos.length;
    if (photoNodesRef.current.length < totalExpected) { const newStartIndex = photoNodesRef.current.length, newFiles = uploadedPhotos.slice(newStartIndex - builtInCount); if (newFiles.length > 0) { const newNodes = generateUploadedPhotoNodes(newFiles, newStartIndex); photoNodesRef.current = [...photoNodesRef.current, ...newNodes]; } }
    else if (photoNodesRef.current.length > totalExpected) photoNodesRef.current = photoNodesRef.current.slice(0, totalExpected);
  }, [manifest, uploadedPhotos]);

  function rotateVideoGalaxy(x: number, y: number, z: number, angle: number): { x: number; y: number; z: number } {
    const lx = x - VIDEO_GALAXY_X_OFFSET, lz = z - VIDEO_GALAXY_Z_OFFSET;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return { x: lx * cosA + lz * sinA + VIDEO_GALAXY_X_OFFSET, y, z: -lx * sinA + lz * cosA + VIDEO_GALAXY_Z_OFFSET };
  }
  function project3D(x: number, y: number, z: number, cx: number, cy: number, scale: number, cosX: number, sinX: number, cosY: number, sinY: number, zoom: number): { px: number; py: number; depth: number } | null {
    const rx1 = x * cosY + z * sinY, rz1 = -x * sinY + z * cosY, ry1 = y * cosX - rz1 * sinX, rz2 = y * sinX + rz1 * cosX;
    const viewZ = rz2 + 2.2 / zoom; if (viewZ < 0.15) return null;
    const invZ = 1 / viewZ; return { px: cx + rx1 * scale * invZ, py: cy - ry1 * scale * invZ, depth: rz2 };
  }

  const hitTest = useCallback((mx: number, my: number): number => {
    const canvas = canvasRef.current; if (!canvas) return -1;
    const fo = flyOutScreen.current;
    if (fo) { const fdx = mx - fo.px, fdy = my - fo.py, fdist = Math.sqrt(fdx * fdx + fdy * fdy), fhitR = Math.max(12, fo.size * 6); if (fdist < fhitR) return -(fo.fileIndex + 2); }
    const w = canvas.clientWidth, h = canvas.clientHeight, cx = w / 2 + panX.current, cy = h / 2 + panY.current, s = Math.min(w, h) * 0.55;
    const nodes = photoNodesRef.current, rx = rotationX.current, ry = rotationY.current + galaxyRotation.current;
    const cosX = Math.cos(rx), sinX = Math.sin(rx), cosY = Math.cos(ry), sinY = Math.sin(ry);
    const fc = animStateRef.current?.focusCurrent ?? { x: 0, y: 0, z: 0 };
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; const rn = n.isVideo ? rotateVideoGalaxy(n.x, n.y, n.z, videoGalaxyRotation.current) : n; const result = project3D(rn.x - fc.x, rn.y - fc.y, rn.z - fc.z, cx, cy, s, cosX, sinX, cosY, sinY, zoomRef.current); if (!result) continue; const dx = mx - result.px, dy = my - result.py, dist = Math.sqrt(dx * dx + dy * dy); const projectedSize = n.baseSize / Math.max(result.depth + 2.2 / zoomRef.current, 0.3) * 0.6; const hitR = Math.max(8, projectedSize * 5); if (dist < hitR && dist < bestDist) { bestDist = dist; best = i; } }
    return best;
  }, []);

  const getFileByIndex = useCallback((fileIndex: number): MediaFile | undefined => {
    const builtIn = manifest?.files ?? []; if (fileIndex < builtIn.length) return builtIn[fileIndex];
    const upIdx = fileIndex - builtIn.length; return uploadedPhotos[upIdx];
  }, [manifest, uploadedPhotos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => { const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const mx = e.clientX - rect.left, my = e.clientY - rect.top; if (isRightDrag.current) { panX.current = panStart.current.px + (mx - panStart.current.x); panY.current = panStart.current.py + (my - panStart.current.y); return; } if (isPointerDown.current) { const dx = mx - dragStart.current.x, dy = my - dragStart.current.y, holdDuration = performance.now() - pointerDownTime.current; if (Math.abs(dx) > 3 || Math.abs(dy) > 3 || holdDuration > 150) isDragging.current = true; if (isDragging.current) { rotationY.current = dragStart.current.ry + (mx - dragStart.current.x) * 0.006; rotationX.current = dragStart.current.rx + (my - dragStart.current.y) * 0.006; rotationX.current = Math.max(-1.3, Math.min(1.3, rotationX.current)); const frameDx = mx - lastDragPos.current.x, frameDy = my - lastDragPos.current.y; angularVelocity.current = { x: frameDy * 0.006, y: frameDx * 0.006 }; lastDragPos.current = { x: mx, y: my }; return; } } if (useAppStore.getState().phase === 'orbs') { const as = animStateRef.current; let nearOrb = false; if (as?.goldOrb) { const gdx = mx - as.goldOrb.px, gdy = my - as.goldOrb.py; if (Math.sqrt(gdx * gdx + gdy * gdy) < as.goldOrb.r * 1.8) nearOrb = true; } if (!nearOrb && as?.blueOrb) { const bdx = mx - as.blueOrb.px, bdy = my - as.blueOrb.py; if (Math.sqrt(bdx * bdx + bdy * bdy) < as.blueOrb.r * 1.8) nearOrb = true; } if (canvasRef.current) canvasRef.current.style.cursor = nearOrb ? 'pointer' : 'default'; return; }const hit = hitTest(mx, my); if (hit !== hoveredRef.current) { if (hoveredRef.current >= 0) photoNodesRef.current[hoveredRef.current].hoverScale = 1.0; hoveredRef.current = hit; if (canvasRef.current) canvasRef.current.style.cursor = (hit >= 0 || hit <= -2) ? 'pointer' : 'default'; } }, [hitTest]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => { const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const mx = e.clientX - rect.left, my = e.clientY - rect.top; if (e.button === 2) { isRightDrag.current = true; panStart.current = { x: mx, y: my, px: panX.current, py: panY.current }; e.preventDefault(); return; } isPointerDown.current = true; isDragging.current = false; pointerDownTime.current = performance.now(); angularVelocity.current = { x: 0, y: 0 }; lastDragPos.current = { x: mx, y: my }; dragStart.current = { x: mx, y: my, rx: rotationX.current, ry: rotationY.current }; }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => { if (isRightDrag.current) { isRightDrag.current = false; return; } const wasDragging = isDragging.current; isPointerDown.current = false; isDragging.current = false; const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const mx = e.clientX - rect.left, my = e.clientY - rect.top; if (!wasDragging) { const currentPhase = useAppStore.getState().phase; if (currentPhase === 'orbs') { const as = animStateRef.current; let hitOrb = false; if (as?.goldOrb) { const gdx = mx - as.goldOrb.px, gdy = my - as.goldOrb.py; if (Math.sqrt(gdx * gdx + gdy * gdy) < as.goldOrb.r * 1.8) { hitOrb = true; } } if (!hitOrb && as?.blueOrb) { const bdx = mx - as.blueOrb.px, bdy = my - as.blueOrb.py; if (Math.sqrt(bdx * bdx + bdy * bdy) < as.blueOrb.r * 1.8) { hitOrb = true; } } if (hitOrb) { triggerGold(); return; } return; } const hit = hitTest(mx, my); if (hit >= 0) { const node = photoNodesRef.current[hit]; node.clickFlash = 1.0; const file = getFileByIndex(node.fileIndex); if (file) { selectFile(file); if (currentPhase === 'dual') { if (node.isVideo) { setFocus({ x: VIDEO_GALAXY_X_OFFSET, y: 0, z: VIDEO_GALAXY_Z_OFFSET }); } else { setFocus(null); } } } } else if (hit <= -2) { const fileIndex = -(hit + 2); const foNode = photoNodesRef.current.find(n => n.fileIndex === fileIndex); if (foNode) foNode.clickFlash = 1.0; const file = getFileByIndex(fileIndex); if (file) selectFile(file); } } }, [hitTest, manifest, selectFile, uploadedPhotos, triggerGold, setFocus]);

  const handleMouseLeave = useCallback(() => { if (hoveredRef.current >= 0) photoNodesRef.current[hoveredRef.current].hoverScale = 1.0; hoveredRef.current = -1; isPointerDown.current = false; isDragging.current = false; isRightDrag.current = false; }, []);

  const handleWheel = useCallback((e: WheelEvent) => { e.preventDefault(); const delta = -e.deltaY * 0.001; zoomTargetRef.current += delta; zoomTargetRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomTargetRef.current)); }, []);

  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; canvas.addEventListener('wheel', handleWheel, { passive: false }); return () => canvas.removeEventListener('wheel', handleWheel); }, [handleWheel]);

  const lastPinchDist = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => { if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY; lastPinchDist.current = Math.sqrt(dx * dx + dy * dy); } }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => { if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY; const dist = Math.sqrt(dx * dx + dy * dy); if (lastPinchDist.current > 0) { const delta = (dist - lastPinchDist.current) * 0.005; zoomTargetRef.current += delta; zoomTargetRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomTargetRef.current)); } lastPinchDist.current = dist; } }, []);

  function renderBgStarsToOffscreen(elapsed: number, alphaMul: number, w: number, h: number, dpr: number): HTMLCanvasElement { let off = bgStarsOffscreen.current; if (!off || off.width !== w * dpr || off.height !== h * dpr) { off = document.createElement('canvas'); off.width = w * dpr; off.height = h * dpr; bgStarsOffscreen.current = off; } const octx = off.getContext('2d')!; octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.fillStyle = '#03050a'; octx.fillRect(0, 0, w, h); if (!darkMatterSeeds.current) { const seedRng = createRNG(7919); const seeds: { x: number; y: number; r: number; hue: number }[] = []; for (let i = 0; i < DARK_MATTER_CLOUD_COUNT; i++) seeds.push({ x: 0.1 + seedRng() * 0.8, y: 0.1 + seedRng() * 0.8, r: 0.12 + seedRng() * 0.35, hue: seedRng() }); darkMatterSeeds.current = seeds; } const minDim = Math.min(w, h); for (const seed of darkMatterSeeds.current) { const sx = seed.x * w, sy = seed.y * h, radius = seed.r * minDim; const hueShift = 220 + Math.sin(elapsed * 0.08 + seed.hue * 6.28) * 25, sat = 35 + Math.sin(elapsed * 0.06 + seed.hue * 3.14) * 15; const grad = octx.createRadialGradient(sx, sy, radius * 0.2, sx, sy, radius); grad.addColorStop(0, `hsla(${hueShift},${sat}%,8%,0.12)`); grad.addColorStop(0.25, `hsla(${hueShift},${sat}%,6%,0.07)`); grad.addColorStop(0.55, `hsla(${hueShift},${sat}%,4%,0.025)`); grad.addColorStop(0.8, 'rgba(0,0,0,0.005)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); octx.fillStyle = grad; octx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2); } const haloRadius = minDim * 0.75; const haloGrad = octx.createRadialGradient(w / 2, h / 2, minDim * 0.04, w / 2, h / 2, haloRadius); haloGrad.addColorStop(0, 'rgba(200,160,100,0.03)'); haloGrad.addColorStop(0.15, 'rgba(160,120,140,0.015)'); haloGrad.addColorStop(0.4, 'rgba(80,60,120,0.006)'); haloGrad.addColorStop(0.7, 'rgba(30,20,60,0.002)'); haloGrad.addColorStop(1, 'rgba(0,0,0,0)'); octx.fillStyle = haloGrad; octx.fillRect(w / 2 - haloRadius, h / 2 - haloRadius, haloRadius * 2, haloRadius * 2); const deepStars = deepFieldRef.current; for (let i = 0; i < deepStars.length; i++) { const d = deepStars[i]; const driftX = Math.sin(elapsed * 0.12 + d.twinklePhase * 3.7) * 0.004, driftY = Math.cos(elapsed * 0.10 + d.twinklePhase * 2.3) * 0.004; const twinkle = 0.7 + 0.3 * Math.sin(elapsed * d.twinkleSpeed + d.twinklePhase); const alpha = d.baseAlpha * twinkle * alphaMul; if (alpha < 0.006) continue; octx.globalAlpha = alpha; octx.fillStyle = `rgb(${d.r},${d.g},${d.b})`; octx.beginPath(); octx.arc((d.x + driftX) * w, (d.y + driftY) * h, d.size, 0, Math.PI * 2); octx.fill(); } const dust = dustRef.current; for (let i = 0; i < dust.length; i++) { const d = dust[i]; const driftX = Math.sin(elapsed * 0.15 + d.twinklePhase * 1.7) * 0.003, driftY = Math.cos(elapsed * 0.13 + d.twinklePhase * 2.1) * 0.003; const twinkle = 0.8 + 0.2 * Math.sin(elapsed * d.twinkleSpeed + d.twinklePhase); const alpha = d.baseAlpha * twinkle * alphaMul; if (alpha < 0.003) continue; octx.globalAlpha = alpha; octx.fillStyle = `rgb(${d.r},${d.g},${d.b})`; octx.beginPath(); octx.arc((d.x + driftX) * w, (d.y + driftY) * h, d.size, 0, Math.PI * 2); octx.fill(); } octx.globalAlpha = 1; return off; }

  useEffect(() => { if (!manifest) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; startTimeRef.current = performance.now(); const render = (timestamp: number) => {
    const elapsed = (timestamp - startTimeRef.current) / 1000; const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = canvas.clientWidth, h = canvas.clientHeight, cx = w / 2 + panX.current, cy = h / 2 + panY.current, projScale = Math.min(w, h) * 0.55;

    // Animation tick — drives phase machine, orb positions, expansion, focus
    const animState = tick(timestamp, w, h); animStateRef.current = animState;
    const { phase, expandGold, expandBlue, flashAlpha, focusCurrent } = animState;
    const rp = phase === 'orbs' ? 0 : (expandGold > 0 ? expandGold : 1);
    const fc = focusCurrent;

    // === ORBS phase: render orbs only, skip galaxy ===
    if (phase === 'orbs' && animState.goldOrb && animState.blueOrb) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#020508';
      ctx.fillRect(0, 0, w, h);
      const bgOff = renderBgStarsToOffscreen(elapsed, 1.0, w, h, dpr);
      if (bgOff) ctx.drawImage(bgOff, 0, 0);

      ctx.globalCompositeOperation = 'lighter';
      // Gold orb
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
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(go.px, go.py, r, 0, Math.PI * 2); ctx.fill();
      }
      // Blue orb
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
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(bo.px, bo.py, r, 0, Math.PI * 2); ctx.fill();
      }
      // Orbital dashed ring
      ctx.globalAlpha = 0.04;
      ctx.strokeStyle = 'rgba(200,200,220,0.5)'; ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 8]);
      const orx = (go.px + bo.px) / 2, ory = (go.py + bo.py) / 2;
      const orbDist = Math.sqrt((go.px - bo.px) ** 2 + (go.py - bo.py) ** 2) / 2;
      ctx.beginPath(); ctx.ellipse(orx, ory, orbDist, orbDist * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = 'source-over';
      animRef.current = requestAnimationFrame(render);
      return;
    }

    // === EXPAND / DUAL phase: full galaxy rendering ===
    const zoom = zoomRef.current, zoomTarget = zoomTargetRef.current;
    if (Math.abs(zoom - zoomTarget) > 0.001) zoomRef.current += (zoomTarget - zoom) * 0.12; else zoomRef.current = zoomTarget;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);

    if (!isPointerDown.current) { const av = angularVelocity.current; const speed = Math.sqrt(av.x * av.x + av.y * av.y); if (speed > 0.00005) { rotationX.current = Math.max(-1.3, Math.min(1.3, rotationX.current + av.x)); rotationY.current += av.y; av.x *= INERTIA_DECAY; av.y *= INERTIA_DECAY; } else { angularVelocity.current = { x: 0, y: 0 }; rotationY.current += 0.0003; } }
    galaxyRotation.current += ARM_ROTATION_SPEED;
    videoGalaxyRotation.current += ARM_ROTATION_SPEED * 2.2;
    for (let i = 0; i < planetsRef.current.length; i++) { const planet = planetsRef.current[i]; planet.orbitPhase += planet.orbitSpeed; const cosPhi = Math.cos(planet.orbitPhase), sinPhi = Math.sin(planet.orbitPhase); const baseX = cosPhi * planet.orbitRadius * DISK_RADIUS, baseZ = sinPhi * planet.orbitRadius * DISK_RADIUS; const cosInc = Math.cos(planet.orbitInclination), sinInc = Math.sin(planet.orbitInclination); const pertX = Math.sin(elapsed * 0.7 + i * 1.3) * 0.025, pertY = Math.cos(elapsed * 0.9 + i * 2.1) * 0.025, pertZ = Math.sin(elapsed * 0.5 + i * 0.7) * 0.025; planet.x = baseX + pertX; planet.y = baseZ * sinInc + pertY; planet.z = baseZ * cosInc + pertZ; planet.trail[planet.trailHead] = { x: planet.x, y: planet.y, z: planet.z }; planet.trailHead = (planet.trailHead + 1) % PLANET_TRAIL_LENGTH; }

    // Meteor logic
    const meteor = meteorRef.current;
    if (!meteor.active && timestamp > nextMeteorTime.current && phase === 'dual') {
      const corner = Math.floor(Math.random() * 4); let sx: number, sy: number, ex: number, ey: number; const mw = w, mh = h;
      switch (corner) { case 0: sx = mw * 0.1; sy = mh * 0.1; ex = mw * 0.9; ey = mh * 0.9; break; case 1: sx = mw * 0.9; sy = mh * 0.1; ex = mw * 0.1; ey = mh * 0.9; break; case 2: sx = mw * 0.2; sy = mh * 0.9; ex = mw * 0.8; ey = mh * 0.1; break; default: sx = mw * 0.8; sy = mh * 0.9; ex = mw * 0.2; ey = mh * 0.1; break; }
      sx += (Math.random() - 0.5) * mw * 0.15; sy += (Math.random() - 0.5) * mh * 0.15; ex += (Math.random() - 0.5) * mw * 0.15; ey += (Math.random() - 0.5) * mh * 0.15;
      meteor.active = true; meteor.startX = sx; meteor.startY = sy; meteor.endX = ex; meteor.endY = ey; meteor.progress = 0; meteor.speed = 0.6 + Math.random() * 0.4;
      const colorRoll = Math.random(); if (colorRoll < 0.5) { meteor.r = 255; meteor.g = 240; meteor.b = 220; } else if (colorRoll < 0.8) { meteor.r = 220; meteor.g = 235; meteor.b = 255; } else { meteor.r = 255; meteor.g = 255; meteor.b = 255; }
    }
    if (meteor.active) { const totalDist = Math.sqrt((meteor.endX - meteor.startX) ** 2 + (meteor.endY - meteor.startY) ** 2); meteor.progress += (meteor.speed * 1000 / 60) / totalDist; if (meteor.progress >= 1) { meteor.active = false; nextMeteorTime.current = timestamp + 20000 + Math.random() * 30000; } }

    const rx = rotationX.current, ry = rotationY.current + galaxyRotation.current; const cosX = Math.cos(rx), sinX = Math.sin(rx), cosY = Math.cos(ry), sinY = Math.sin(ry); const glowTex = glowTexRef.current; const frameIdx = frameCount.current++;
    ctx.globalCompositeOperation = 'source-over';
    const bgUpdateInterval = rp < 1 ? 1 : 90;
    if (frameIdx % bgUpdateInterval === 0 || !bgStarsOffscreen.current) renderBgStarsToOffscreen(elapsed, rp, w, h, dpr);
    if (bgStarsOffscreen.current) ctx.drawImage(bgStarsOffscreen.current, 0, 0);

    // Helper: lerp 3D position from origin for expansion animation
    const lerpPos = (x: number, y: number, z: number, t: number, ox: number, oy: number, oz: number) => ({
      x: ox + (x - ox) * t,
      y: oy + (y - oy) * t,
      z: oz + (z - oz) * t,
    });

    ctx.globalCompositeOperation = 'lighter'; const volMinAlpha = 0.004; const cullMargin = Math.max(50, 100 / zoom);
    for (let i = 0; i < volumeDustRef.current.length; i++) { const p = volumeDustRef.current[i]; if (p.baseAlpha < volMinAlpha) continue; const lp = lerpPos(p.x, p.y, p.z, expandGold, 0, 0, 0); const result = project3D(lp.x - fc.x, lp.y - fc.y, lp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < -cullMargin || result.px > w + cullMargin || result.py < -cullMargin || result.py > h + cullMargin) continue; const breathe = 1 + Math.sin(elapsed * 0.5 + p.phase) * 0.06; const alpha = Math.min(1, p.baseAlpha * breathe) * rp; if (alpha < volMinAlpha) continue; const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * JITTER_AMPLITUDE * 0.5, jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * JITTER_AMPLITUDE * 0.5; ctx.globalAlpha = alpha; ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.beginPath(); ctx.arc(result.px + jx, result.py + jy, p.size * 0.45, 0, Math.PI * 2); ctx.fill(); }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < haloRef.current.length; i++) { const p = haloRef.current[i]; const lp = lerpPos(p.x, p.y, p.z, expandGold, 0, 0, 0); const result = project3D(lp.x - fc.x, lp.y - fc.y, lp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < -50 || result.px > w + 50 || result.py < -50 || result.py > h + 50) continue; const alpha = Math.min(0.25, p.baseAlpha * (1 + Math.sin(elapsed * 0.6 + p.phase) * 0.08)) * rp; if (alpha < 0.003) continue; const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * JITTER_AMPLITUDE, jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * JITTER_AMPLITUDE; ctx.globalAlpha = alpha; ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.beginPath(); ctx.arc(result.px + jx, result.py + jy, p.size * 0.6, 0, Math.PI * 2); ctx.fill(); }

    const minAlpha = 0.022; const spiralProj: { px: number; py: number; depth: number; size: number; alpha: number; r: number; g: number; b: number; idx: number; radius3D: number; phase: number; jxSpeed: number; jySpeed: number; jxPhase: number; jyPhase: number }[] = [];
    for (let i = 0; i < spiralRef.current.length; i++) { const p = spiralRef.current[i]; if (p.baseAlpha < minAlpha) continue; const lp = lerpPos(p.x, p.y, p.z, expandGold, 0, 0, 0); const result = project3D(lp.x - fc.x, lp.y - fc.y, lp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < -cullMargin || result.px > w + cullMargin || result.py < -cullMargin || result.py > h + cullMargin) continue; const breathe = 1 + Math.sin(elapsed * 1.3 + p.phase) * 0.06; const alpha = Math.min(1, p.baseAlpha * breathe) * rp; if (alpha < minAlpha) continue; const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * JITTER_AMPLITUDE, jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * JITTER_AMPLITUDE; const spx = result.px + jx, spy = result.py + jy; spiralProj.push({ idx: i, px: spx, py: spy, depth: result.depth, size: p.size, alpha, r: p.r, g: p.g, b: p.b, radius3D: p.radius3D, phase: p.phase, jxSpeed: p.jxSpeed, jySpeed: p.jySpeed, jxPhase: p.jxPhase, jyPhase: p.jyPhase }); }
    spiralProj.sort((a, b) => b.depth - a.depth);
    for (const sp of spiralProj) { const glowR = sp.size * 4.5; ctx.globalAlpha = sp.alpha; if (glowTex) ctx.drawImage(glowTex, sp.px - glowR, sp.py - glowR, glowR * 2, glowR * 2); if (sp.alpha > 0.10) { ctx.globalAlpha = Math.min(1, sp.alpha * 1.2); ctx.fillStyle = `rgb(${sp.r},${sp.g},${sp.b})`; ctx.beginPath(); ctx.arc(sp.px, sp.py, sp.size * 0.4, 0, Math.PI * 2); ctx.fill(); } }

    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < dustLaneRef.current.length; i++) { const p = dustLaneRef.current[i]; if (p.baseAlpha < minAlpha * 0.4) continue; const lp = lerpPos(p.x, p.y, p.z, expandGold, 0, 0, 0); const result = project3D(lp.x - fc.x, lp.y - fc.y, lp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < -cullMargin || result.px > w + cullMargin || result.py < -cullMargin || result.py > h + cullMargin) continue; const breathe = 1 + Math.sin(elapsed * 0.9 + p.phase) * 0.04; const alpha = Math.min(1, p.baseAlpha * breathe) * rp; if (alpha < 0.003) continue; const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * JITTER_AMPLITUDE * 0.5, jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * JITTER_AMPLITUDE * 0.5; ctx.globalAlpha = alpha; ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.beginPath(); ctx.arc(result.px + jx, result.py + jy, p.size * 0.55, 0, Math.PI * 2); ctx.fill(); }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < hiiRef.current.length; i++) { const p = hiiRef.current[i]; if (p.baseAlpha < minAlpha) continue; const lp = lerpPos(p.x, p.y, p.z, expandGold, 0, 0, 0); const result = project3D(lp.x - fc.x, lp.y - fc.y, lp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < -cullMargin || result.px > w + cullMargin || result.py < -cullMargin || result.py > h + cullMargin) continue; const breathe = 1 + Math.sin(elapsed * 1.5 + p.phase) * 0.08; const alpha = Math.min(1, p.baseAlpha * breathe) * rp; if (alpha < minAlpha) continue; const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * JITTER_AMPLITUDE, jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * JITTER_AMPLITUDE; const spx = result.px + jx, spy = result.py + jy; const projectedSize = p.size / Math.max(result.depth + 2.2 / zoom, 0.3) * projScale * 0.3; if (alpha > 0.22 && glowTex && projectedSize > 0.5) { const glowR = p.size * 3.5; ctx.globalAlpha = alpha * 0.6; ctx.drawImage(glowTex, spx - glowR, spy - glowR, glowR * 2, glowR * 2); } ctx.globalAlpha = Math.min(1, alpha * 1.1); ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.beginPath(); ctx.arc(spx, spy, p.size * 0.35, 0, Math.PI * 2); ctx.fill(); }

    for (let i = 0; i < interArmRef.current.length; i++) { const p = interArmRef.current[i]; if (p.baseAlpha < minAlpha) continue; const lp = lerpPos(p.x, p.y, p.z, expandGold, 0, 0, 0); const result = project3D(lp.x - fc.x, lp.y - fc.y, lp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < -cullMargin || result.px > w + cullMargin || result.py < -cullMargin || result.py > h + cullMargin) continue; const breathe = 1 + Math.sin(elapsed * 1.1 + p.phase) * 0.05; const alpha = Math.min(1, p.baseAlpha * breathe) * rp; if (alpha < minAlpha) continue; const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * JITTER_AMPLITUDE * 0.7, jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * JITTER_AMPLITUDE * 0.7; ctx.globalAlpha = alpha; ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.beginPath(); ctx.arc(result.px + jx, result.py + jy, p.size * 0.5, 0, Math.PI * 2); ctx.fill(); }

    // Spike/diffraction
    { const spikeCandidates: { px: number; py: number; brightness: number }[] = []; for (let i = 0; i < hiiRef.current.length; i++) { const p = hiiRef.current[i]; if (p.baseAlpha < 0.25) continue; const lp = lerpPos(p.x, p.y, p.z, expandGold, 0, 0, 0); const result = project3D(lp.x - fc.x, lp.y - fc.y, lp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < 0 || result.px > w || result.py < 0 || result.py > h) continue; const jx = Math.sin(elapsed * p.jxSpeed + p.jxPhase) * JITTER_AMPLITUDE, jy = Math.cos(elapsed * p.jySpeed + p.jyPhase) * JITTER_AMPLITUDE; const projectedSize = p.size / Math.max(result.depth + 2.2 / zoom, 0.3) * projScale * 0.3; spikeCandidates.push({ px: result.px + jx, py: result.py + jy, brightness: p.baseAlpha * projectedSize }); } spikeCandidates.sort((a, b) => b.brightness - a.brightness); const topSpikes = spikeCandidates.slice(0, 12); ctx.globalCompositeOperation = 'lighter'; for (const s of topSpikes) { const spikeLen = 2.5 + s.brightness * 8; const alpha = Math.min(0.55, 0.08 + s.brightness * 1.2); ctx.globalAlpha = alpha; const axes: [number, number][] = [[1, 0], [0, 1]]; for (const [ax, ay] of axes) { const spikeGrad = ctx.createLinearGradient(s.px - ax * spikeLen, s.py - ay * spikeLen, s.px + ax * spikeLen, s.py + ay * spikeLen); spikeGrad.addColorStop(0, 'rgba(255,255,255,0)'); spikeGrad.addColorStop(0.45, `rgba(255,255,255,${alpha.toFixed(3)})`); spikeGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)'); spikeGrad.addColorStop(0.55, `rgba(255,255,255,${alpha.toFixed(3)})`); spikeGrad.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = spikeGrad; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(s.px - ax * spikeLen, s.py - ay * spikeLen); ctx.lineTo(s.px + ax * spikeLen, s.py + ay * spikeLen); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.2).toFixed(3)})`; ctx.beginPath(); ctx.moveTo(s.px - ax * spikeLen * 0.5, s.py - ay * spikeLen * 0.5); ctx.lineTo(s.px + ax * spikeLen * 0.5, s.py + ay * spikeLen * 0.5); ctx.stroke(); } } }

    // Planet trails
    for (let i = 0; i < planetsRef.current.length; i++) { const planet = planetsRef.current[i]; for (let t = 0; t < PLANET_TRAIL_LENGTH; t++) { const idx = (planet.trailHead + t) % PLANET_TRAIL_LENGTH; const tp = planet.trail[idx]; const result = project3D(tp.x - fc.x, tp.y - fc.y, tp.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; if (result.px < -20 || result.px > w + 20 || result.py < -20 || result.py > h + 20) continue; const trailAlpha = (t / (PLANET_TRAIL_LENGTH - 1)) * 0.22 * rp; if (trailAlpha < 0.003) continue; const trailSize = planet.size * 0.35 * (0.3 + 0.7 * (t / PLANET_TRAIL_LENGTH)); ctx.globalAlpha = trailAlpha; ctx.fillStyle = `rgb(${planet.r},${planet.g},${planet.b})`; ctx.beginPath(); ctx.arc(result.px, result.py, trailSize, 0, Math.PI * 2); ctx.fill(); } }

    // Video fill particles (decorative, non-clickable)
    if (videoFillRef.current.length > 0 && (phase === 'dual' || expandBlue > 0.3)) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < videoFillRef.current.length; i++) {
        const p = videoFillRef.current[i];
        const lp = lerpPos(p.x, p.y, p.z, expandBlue, VIDEO_GALAXY_X_OFFSET, 0, VIDEO_GALAXY_Z_OFFSET);
        const rv = rotateVideoGalaxy(lp.x, lp.y, lp.z, videoGalaxyRotation.current);
        const result = project3D(rv.x - fc.x, rv.y - fc.y, rv.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
        if (!result) continue;
        if (result.px < -20 || result.px > w + 20 || result.py < -20 || result.py > h + 20) continue;
        const twinkle = 0.6 + 0.4 * Math.sin(elapsed * p.speed + p.phase);
        const alpha = p.alpha * twinkle * Math.max(expandBlue, rp);
        if (alpha < 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(160,225,255,0.9)';
        ctx.beginPath(); ctx.arc(result.px, result.py, p.size * 0.55, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Node projection + rendering
    ctx.globalCompositeOperation = 'source-over'; flyOutScreen.current = null;
    const nodeProj: { n: PhotoNode; px: number; py: number; depth: number; size: number; alpha: number }[] = [];
    const MAX_LINES = 0;
    for (let i = 0; i < photoNodesRef.current.length; i++) {
      const n = photoNodesRef.current[i];
      const et = n.isVideo ? expandBlue : expandGold;
      const originX = n.isVideo ? VIDEO_GALAXY_X_OFFSET : 0;
      const originY = 0;
      const originZ = n.isVideo ? VIDEO_GALAXY_Z_OFFSET : 0;
      const lp = et < 1 ? lerpPos(n.x, n.y, n.z, et, originX, originY, originZ) : { x: n.x, y: n.y, z: n.z };
      const rv = n.isVideo ? rotateVideoGalaxy(lp.x, lp.y, lp.z, videoGalaxyRotation.current) : lp;
      const result = project3D(rv.x - fc.x, rv.y - fc.y, rv.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
      if (!result) continue;
      if (result.px < -30 || result.px > w + 30 || result.py < -30 || result.py > h + 30) continue;
      const breathe = 1 + Math.sin(elapsed * 2.0 + n.phase) * 0.10;
      const targetScale = hoveredRef.current === n.id ? 1.6 : 1.0;
      n.hoverScale += (targetScale - n.hoverScale) * 0.18;
      if (n.clickFlash > 0.001) { n.clickFlash *= 0.82; if (n.clickFlash < 0.001) n.clickFlash = 0; }
      const highlightedIdx = useAppStore.getState().highlightedIndex;
      const targetFly = (highlightedIdx !== null && highlightedIdx === n.fileIndex) ? 1.0 : 0.0;
      n.flyProgress += (targetFly - n.flyProgress) * 0.08;
      const jx = Math.sin(elapsed * n.jxSpeed + n.jxPhase) * JITTER_AMPLITUDE, jy = Math.cos(elapsed * n.jySpeed + n.jyPhase) * JITTER_AMPLITUDE;
      const depthScale = 1 / Math.max(result.depth + 2.2 / zoom, 0.3);
      let px = result.px + jx, py = result.py + jy, size = n.baseSize * n.hoverScale * depthScale * 0.62, depth = result.depth;
      if (n.flyProgress > 0.001) { const fp = n.flyProgress, targetX = cx, targetY = 52; const t = 1 - Math.pow(1 - fp, 3); px = px + (targetX - px) * t; py = py + (targetY - py) * t; size = size * (1 + fp * 3.5); depth = 2.5; if (fp > 0.3) flyOutScreen.current = { px, py, fileIndex: n.fileIndex, size }; }
      const alphaBright = hoveredRef.current === n.id ? 1.8 : 1.0;
      const flash = 1 + n.clickFlash * 3.5;
      let alpha = Math.min(1, 0.90 * breathe * alphaBright * flash) * rp;
      // DUAL focus dimming
      const focusDist = Math.sqrt(fc.x * fc.x + fc.y * fc.y + fc.z * fc.z);
      if (phase === 'dual' && focusDist > 0.01) {
        const focusingVideo = Math.abs(fc.x - VIDEO_GALAXY_X_OFFSET) < 0.1;
        if (focusingVideo && !n.isVideo) alpha *= 0.65;
        if (!focusingVideo && n.isVideo) alpha *= 0.65;
      }
      if (alpha < 0.01) continue;
      nodeProj.push({ n, px, py, depth, size: Math.max(0.6, size), alpha });
    }
    nodeProj.sort((a, b) => a.depth - b.depth);

    // Constellation lines (video only)
    ctx.globalCompositeOperation = 'lighter';
    const lineLimit = Math.min(MAX_LINES, nodeProj.length);
    for (let i = 0; i < lineLimit; i++) { const { n, px, py, depth } = nodeProj[i]; const lineAlpha = (0.04 + n.radius3D * 0.02 + (1 / Math.max(depth + 2.2 / zoom, 0.3)) * 0.015) * rp; ctx.globalAlpha = Math.min(0.07, lineAlpha); ctx.strokeStyle = `rgb(${n.r},${n.g},${n.b})`; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke(); }

    ctx.globalCompositeOperation = 'source-over';
    { const videoNodes = nodeProj.filter(p => p.n.isVideo); if (videoNodes.length > 1) { const CONNECT_DIST = Math.min(w, h) * 0.18 * VIDEO_CONNECT_DIST_FACTOR; ctx.globalCompositeOperation = 'lighter'; for (let a = 0; a < videoNodes.length; a++) { for (let b = a + 1; b < videoNodes.length; b++) { const dx = videoNodes[a].px - videoNodes[b].px, dy = videoNodes[a].py - videoNodes[b].py, dist = Math.sqrt(dx * dx + dy * dy); if (dist < CONNECT_DIST) { const la = (1 - dist / CONNECT_DIST) * 0.15 * rp; if (la > 0.005) { ctx.globalAlpha = la; ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(videoNodes[a].px, videoNodes[a].py); ctx.lineTo(videoNodes[b].px, videoNodes[b].py); ctx.stroke(); } } } } ctx.globalCompositeOperation = 'source-over'; } }

    // Node rendering
    for (let i = 0; i < nodeProj.length; i++) { const { n, px, py, size, alpha } = nodeProj[i]; const glowR = size * 5.0; if (n.isVideo && size > 0.8) { const vgR = size * 8; ctx.globalAlpha = alpha * 0.25; if (glowTex) ctx.drawImage(glowTex, px - vgR, py - vgR, vgR * 2, vgR * 2); ctx.globalAlpha = alpha * 0.35; ctx.fillStyle = 'rgba(160,225,255,0.5)'; ctx.beginPath(); ctx.moveTo(px, py - size * 1.1); ctx.lineTo(px + size * 0.45, py); ctx.lineTo(px, py + size * 1.1); ctx.lineTo(px - size * 0.45, py); ctx.closePath(); ctx.fill(); } if (size > 0.8) { ctx.globalAlpha = alpha * 0.8; if (glowTex) ctx.drawImage(glowTex, px - glowR, py - glowR, glowR * 2, glowR * 2); } ctx.globalAlpha = Math.min(1, alpha * 1.1); ctx.fillStyle = `rgb(${n.r},${n.g},${n.b})`; ctx.beginPath(); ctx.arc(px, py, size * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = Math.min(1, alpha * 1.1); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, size * 0.22, 0, Math.PI * 2); ctx.fill(); if (n.flyProgress > 0.05) { const fp = n.flyProgress; ctx.globalCompositeOperation = 'lighter'; const pulse = 0.7 + 0.3 * Math.sin(elapsed * 2.5 + n.phase); const lineAlpha = Math.min(1, fp * 1.0) * pulse; ctx.globalAlpha = lineAlpha; ctx.strokeStyle = `rgba(255,210,122,${(0.9 * fp).toFixed(2)})`; ctx.lineWidth = 1.8 + fp * 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke(); ctx.lineCap = 'butt'; ctx.globalAlpha = lineAlpha * 0.4; ctx.strokeStyle = `rgba(255,240,200,${(0.3 * fp).toFixed(2)})`; ctx.lineWidth = 5 + fp * 8; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke(); ctx.globalAlpha = lineAlpha * 0.7; ctx.fillStyle = '#fffef0'; ctx.beginPath(); ctx.arc(px, py, 2.5 + fp * 4, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; } }

    // Planets
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < planetsRef.current.length; i++) { const planet = planetsRef.current[i]; const result = project3D(planet.x - fc.x, planet.y - fc.y, planet.z - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom); if (!result) continue; const depthScale = 1 / Math.max(result.depth + 2.2 / zoom, 0.3); const projectedSize = planet.size * depthScale * 0.5; if (glowTex && projectedSize > 0.4) { const glowR = projectedSize * 4.0; ctx.globalAlpha = 0.35 * rp; ctx.drawImage(glowTex, result.px - glowR, result.py - glowR, glowR * 2, glowR * 2); } ctx.globalAlpha = Math.min(1, 0.7 * rp); ctx.fillStyle = `rgb(${planet.r},${planet.g},${planet.b})`; ctx.beginPath(); ctx.arc(result.px, result.py, Math.max(0.5, projectedSize), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = Math.min(1, 0.55 * rp); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(result.px, result.py, Math.max(0.15, projectedSize * 0.25), 0, Math.PI * 2); ctx.fill(); }

    // Bokeh
    for (let i = 0; i < bokehRef.current.length; i++) { const b = bokehRef.current[i]; const px = b.x * w, py = b.y * h; const breathe = 0.7 + 0.3 * Math.sin(elapsed * b.twinkleSpeed + b.twinklePhase); const alpha = b.baseAlpha * breathe * rp; if (alpha < 0.003) continue; const blurLayers = [{ r: b.size * 1.0, a: alpha }, { r: b.size * 0.75, a: alpha * 0.7 }, { r: b.size * 0.5, a: alpha * 0.5 }, { r: b.size * 0.3, a: alpha * 0.35 }, { r: b.size * 0.12, a: alpha * 0.2 }]; for (const layer of blurLayers) { ctx.globalAlpha = Math.min(1, layer.a); ctx.fillStyle = `rgb(${b.r},${b.g},${b.b})`; ctx.beginPath(); ctx.arc(px, py, layer.r, 0, Math.PI * 2); ctx.fill(); } }

    // Meteor
    if (meteorRef.current.active) { const m = meteorRef.current; const mx = m.startX + (m.endX - m.startX) * m.progress, my = m.startY + (m.endY - m.startY) * m.progress; const dx = m.endX - m.startX, dy = m.endY - m.startY; const dist = Math.sqrt(dx * dx + dy * dy); const nx = dx / dist, ny = dy / dist; const tailLen = Math.min(w, h) * 0.22; const streakGrad = ctx.createLinearGradient(mx, my, mx - nx * tailLen, my - ny * tailLen); streakGrad.addColorStop(0, `rgba(${m.r},${m.g},${m.b},0.95)`); streakGrad.addColorStop(0.05, `rgba(${m.r},${m.g},${m.b},0.7)`); streakGrad.addColorStop(0.2, `rgba(${m.r},${m.g},${m.b},0.3)`); streakGrad.addColorStop(0.5, `rgba(${m.r},${m.g},${m.b},0.06)`); streakGrad.addColorStop(1, 'rgba(0,0,0,0)'); ctx.strokeStyle = streakGrad; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - nx * tailLen, my - ny * tailLen); ctx.stroke(); const headGlow = ctx.createRadialGradient(mx, my, 0, mx, my, 12); headGlow.addColorStop(0, `rgba(${m.r},${m.g},${m.b},0.9)`); headGlow.addColorStop(0.3, `rgba(${m.r},${m.g},${m.b},0.4)`); headGlow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = headGlow; ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.fill(); const particleCount = 18; for (let p = 0; p < particleCount; p++) { const t = p / particleCount; const px = mx - nx * tailLen * t, py = my - ny * tailLen * t; const pAlpha = (1 - t) * 0.3 * (1 - m.progress * 0.5); if (pAlpha < 0.01) continue; const pSize = 0.8 + (1 - t) * 2.5; ctx.globalAlpha = pAlpha; ctx.fillStyle = `rgb(${m.r},${m.g},${m.b})`; ctx.beginPath(); ctx.arc(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, pSize, 0, Math.PI * 2); ctx.fill(); } }

    // Flash overlay during expansion
    if (flashAlpha > 0.005) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flashAlpha * 0.3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Main galaxy core glow
    if (phase === 'dual' || expandGold > 0.3) {
      ctx.globalCompositeOperation = 'lighter';
      const coreR = Math.min(w, h) * 0.13 * CORE_SCALE;
      const coreLayers = [{ r: coreR * 2.2, stops: [[0, 'rgba(255,235,190,0.025)'], [0.15, 'rgba(255,220,160,0.012)'], [0.40, 'rgba(180,150,100,0.004)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: coreR * 1.2, stops: [[0, 'rgba(255,240,210,0.08)'], [0.12, 'rgba(255,225,180,0.04)'], [0.40, 'rgba(200,165,120,0.008)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: coreR * 0.55, stops: [[0, 'rgba(255,248,235,0.25)'], [0.10, 'rgba(255,240,215,0.14)'], [0.35, 'rgba(255,220,170,0.04)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: coreR * 0.20, stops: [[0, 'rgba(255,252,248,0.65)'], [0.10, 'rgba(255,248,235,0.35)'], [0.35, 'rgba(255,235,195,0.08)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: coreR * 0.06, stops: [[0, 'rgba(255,255,255,1.0)'], [0.12, 'rgba(255,254,250,0.80)'], [0.40, 'rgba(255,245,215,0.15)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }];
      for (let k = 0; k < coreLayers.length; k++) { const layer = coreLayers[k]; const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, layer.r); for (let s = 0; s < layer.stops.length; s++) grad.addColorStop(layer.stops[s][0] as number, layer.stops[s][1] as string); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, layer.r, 0, Math.PI * 2); ctx.fill(); }
      const flareBase = Math.min(w, h) * 0.20; const spikeAngles6 = [0, Math.PI / 3, 2 * Math.PI / 3, Math.PI, 4 * Math.PI / 3, 5 * Math.PI / 3]; for (let s = 0; s < 6; s++) { const angle = spikeAngles6[s]; const cosA = Math.cos(angle), sinA = Math.sin(angle); const spikeLen = flareBase * (s % 2 === 0 ? 1.0 : 0.65); const spikeGrad = ctx.createLinearGradient(cx, cy, cx + cosA * spikeLen, cy + sinA * spikeLen); spikeGrad.addColorStop(0, 'rgba(255,255,255,0.8)'); spikeGrad.addColorStop(0.03, 'rgba(255,250,240,0.4)'); spikeGrad.addColorStop(0.12, 'rgba(255,220,180,0.10)'); spikeGrad.addColorStop(0.35, 'rgba(180,150,200,0.02)'); spikeGrad.addColorStop(0.7, 'rgba(0,0,0,0)'); ctx.strokeStyle = spikeGrad; ctx.lineWidth = flareBase * 0.018; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + cosA * spikeLen, cy + sinA * spikeLen); ctx.stroke(); ctx.lineWidth = flareBase * 0.06; ctx.strokeStyle = spikeGrad; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + cosA * spikeLen * 0.5, cy + sinA * spikeLen * 0.5); ctx.stroke(); ctx.globalAlpha = 1; }
      const reflColors = [{ dist: 1.5, r: 0.08, color: 'rgba(255,200,150,0.15)' }, { dist: 2.2, r: 0.05, color: 'rgba(150,200,255,0.10)' }, { dist: 3.0, r: 0.1, color: 'rgba(200,255,220,0.07)' }, { dist: 4.0, r: 0.04, color: 'rgba(255,180,200,0.08)' }]; for (const refl of reflColors) { const rr = flareBase * refl.r; for (const sign of [-1, 1]) { const rx = cx + sign * flareBase * refl.dist, ry = cy; const rgrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr); rgrad.addColorStop(0, refl.color); rgrad.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rgrad; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill(); } }
      const whiteCoreR = flareBase * 0.04; const whiteCore = ctx.createRadialGradient(cx, cy, 0, cx, cy, whiteCoreR); whiteCore.addColorStop(0, 'rgba(255,255,255,1)'); whiteCore.addColorStop(0.15, 'rgba(255,255,255,0.9)'); whiteCore.addColorStop(0.5, 'rgba(255,240,220,0.3)'); whiteCore.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = whiteCore; ctx.beginPath(); ctx.arc(cx, cy, whiteCoreR, 0, Math.PI * 2); ctx.fill();
    }

    // Video galaxy core glow
    if (phase === 'dual' || expandBlue > 0.3) {
      const vgCenter = project3D(VIDEO_GALAXY_X_OFFSET - fc.x, -fc.y, VIDEO_GALAXY_Z_OFFSET - fc.z, cx, cy, projScale, cosX, sinX, cosY, sinY, zoom);
      if (vgCenter) {
        ctx.globalCompositeOperation = 'lighter';
        const vgCoreR = Math.min(w, h) * 0.13 * CORE_SCALE * VIDEO_CORE_SCALE;
        const vgLayers = [{ r: vgCoreR * 1.8, stops: [[0, 'rgba(160,210,240,0.018)'], [0.15, 'rgba(140,190,230,0.010)'], [0.40, 'rgba(100,140,180,0.003)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: vgCoreR * 0.9, stops: [[0, 'rgba(180,220,245,0.05)'], [0.12, 'rgba(160,200,235,0.03)'], [0.40, 'rgba(120,160,200,0.006)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: vgCoreR * 0.35, stops: [[0, 'rgba(190,230,250,0.18)'], [0.10, 'rgba(170,210,240,0.10)'], [0.35, 'rgba(140,185,220,0.03)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: vgCoreR * 0.12, stops: [[0, 'rgba(200,240,255,0.45)'], [0.10, 'rgba(180,225,250,0.25)'], [0.35, 'rgba(150,200,235,0.06)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }, { r: vgCoreR * 0.04, stops: [[0, 'rgba(220,245,255,0.85)'], [0.12, 'rgba(200,235,255,0.60)'], [0.40, 'rgba(160,215,245,0.10)'], [1, 'rgba(0,0,0,0)']] as [number, string][] }];
        for (let k = 0; k < vgLayers.length; k++) { const layer = vgLayers[k]; const grad = ctx.createRadialGradient(vgCenter.px, vgCenter.py, 0, vgCenter.px, vgCenter.py, layer.r); for (let s = 0; s < layer.stops.length; s++) grad.addColorStop(layer.stops[s][0] as number, layer.stops[s][1] as string); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(vgCenter.px, vgCenter.py, layer.r, 0, Math.PI * 2); ctx.fill(); }
      }
    }

    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    animRef.current = requestAnimationFrame(render);
  }; animRef.current = requestAnimationFrame(render); return () => cancelAnimationFrame(animRef.current); }, [manifest]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => { e.preventDefault(); }, []);
  const focusMain = useCallback(() => { if (useAppStore.getState().phase === 'dual') setFocus(null); }, [setFocus]);
  const focusVideo = useCallback(() => { if (useAppStore.getState().phase === 'dual') setFocus({ x: VIDEO_GALAXY_X_OFFSET, y: 0, z: VIDEO_GALAXY_Z_OFFSET }); }, [setFocus]);
  const [showFocusBtns, setShowFocusBtns] = useState(false);
  useEffect(() => { const unsub = useAppStore.subscribe((s) => { if (s.phase === 'dual' && !showFocusBtns) setShowFocusBtns(true); if (s.phase !== 'dual' && showFocusBtns) setShowFocusBtns(false); }); return unsub; }, [showFocusBtns]);
  return (
    <>
      <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onContextMenu={handleContextMenu} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} style={{ position: 'absolute', inset: 0, zIndex: 0, cursor: 'default' }} />
      {showFocusBtns && (
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 16, pointerEvents: 'auto' }}>
          <button onClick={focusMain} style={{ padding: '10px 24px', background: 'rgba(255,200,100,0.18)', border: '1px solid rgba(255,200,100,0.4)', borderRadius: 24, color: '#ffe0b0', fontSize: 14, cursor: 'pointer', backdropFilter: 'blur(8px)', fontFamily: 'inherit', letterSpacing: 1, transition: 'all 0.3s' }}>✦ 刹那凝影照永恒</button>
          <button onClick={focusVideo} style={{ padding: '10px 24px', background: 'rgba(140,210,255,0.18)', border: '1px solid rgba(140,210,255,0.4)', borderRadius: 24, color: '#b0dfff', fontSize: 14, cursor: 'pointer', backdropFilter: 'blur(8px)', fontFamily: 'inherit', letterSpacing: 1, transition: 'all 0.3s' }}>❄ 流光瞬息映万象</button>
        </div>
      )}
    </>
  );
}
