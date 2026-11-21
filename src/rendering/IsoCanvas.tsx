import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BIOMES,
  BUILDINGS,
  type BiomeDef,
  type Building,
  type BuildingKind,
  type FogState,
  type GameState,
  type MapTile,
  type Projectile,
  type Team,
  type Unit,
} from '../types/rts.js';
import { canPlaceBuilding } from '../engine/sim.js';
import {
  clampCamera,
  createInitialCamera,
  screenToTile,
  TILE_H,
  TILE_W,
  tileToScreen,
  tileToWorld,
  zoomCameraAtPoint,
  type CameraState,
} from './isoMath.js';

export interface IsoCanvasProps {
  stateRef: React.MutableRefObject<GameState>;
  selectedUnitIds: number[];
  selectedBuildingId: number | null;
  placementKind: BuildingKind | null;
  onSelectUnits: (ids: number[]) => void;
  onSelectBuilding: (id: number | null) => void;
  onIssueTileOrder: (tileX: number, tileY: number) => void;
  onPlaceBuildingAt: (tileX: number, tileY: number) => void;
  onCancelPlacement: () => void;
}

interface OrderRipple {
  id: number;
  tileX: number;
  tileY: number;
  kind: 'move' | 'attack' | 'build';
  bornMs: number;
  durationMs: number;
}

interface SelectionBox {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

interface GhostBannerSnapshot {
  username: string;
  timeSec: number;
  tileX: number;
  tileY: number;
}

interface TeamPalette {
  main: string;
  light: string;
  dark: string;
  trim: string;
  banner: string;
}

const TEAM_PALETTES: Record<Team, TeamPalette> = {
  player: {
    main: '#2563eb',
    light: '#60a5fa',
    dark: '#1e3a8a',
    trim: '#fbbf24',
    banner: '#3b82f6',
  },
  enemy: {
    main: '#dc2626',
    light: '#f87171',
    dark: '#7f1d1d',
    trim: '#fbbf24',
    banner: '#ef4444',
  },
};

type RenderableEntity =
  | {
      kind: 'prop';
      depth: number;
      tile: MapTile;
      twilight: boolean;
    }
  | {
      kind: 'building';
      depth: number;
      building: Building;
      twilight: boolean;
    }
  | {
      kind: 'unit';
      depth: number;
      unit: Unit;
    };

// Deterministic fast hash in [0, 1) for rock-steady terrain details
function tileHash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Fast memoized 45% twilight veil color mixer for fog === 1 props & buildings
const twilightColorCache = new Map<string, string>();
function veilColor(hex: string, twilight: boolean): string {
  if (!twilight || !hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
    return hex;
  }
  const cached = twilightColorCache.get(hex);
  if (cached) return cached;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  }
  // Blend 55% original + 45% deep twilight (#0c1322 -> 12, 19, 34)
  const nr = Math.round(r * 0.55 + 12 * 0.45);
  const ng = Math.round(g * 0.55 + 19 * 0.45);
  const nb = Math.round(b * 0.55 + 34 * 0.45);
  const out = `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  twilightColorCache.set(hex, out);
  return out;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function traceDiamond(
  ctx: CanvasRenderingContext2D,
  topX: number,
  topY: number,
  size = 1,
  pad = 0,
) {
  const hw = (TILE_W / 2) * size + pad;
  const hh = (TILE_H / 2) * size + pad * 0.5;
  ctx.beginPath();
  ctx.moveTo(topX, topY - pad * 0.5);
  ctx.lineTo(topX + hw, topY + hh);
  ctx.lineTo(topX, topY + hh * 2 + pad * 0.5);
  ctx.lineTo(topX - hw, topY + hh);
  ctx.closePath();
}

function drawWorldSkirt(ctx: CanvasRenderingContext2D, mapSize: number, biome: BiomeDef) {
  const north = tileToWorld(0, 0);
  const east = tileToWorld(mapSize, 0);
  const south = tileToWorld(mapSize, mapSize);
  const west = tileToWorld(0, mapSize);
  const skirtDepth = 22;

  // Ambient drop shadow beneath the floating medieval battlefield slab
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
  ctx.beginPath();
  ctx.moveTo(west.wx - 8, west.wy + 10);
  ctx.lineTo(east.wx + 8, east.wy + 10);
  ctx.lineTo(south.wx, south.wy + skirtDepth + 16);
  ctx.closePath();
  ctx.fill();

  // Left-south earth & stone bevel (west -> south)
  ctx.fillStyle = biome.cliffSide;
  ctx.beginPath();
  ctx.moveTo(west.wx, west.wy);
  ctx.lineTo(south.wx, south.wy);
  ctx.lineTo(south.wx, south.wy + skirtDepth);
  ctx.lineTo(west.wx, west.wy + skirtDepth);
  ctx.closePath();
  ctx.fill();

  // Right-south darker earth bevel (south -> east)
  ctx.fillStyle = '#292520';
  ctx.beginPath();
  ctx.moveTo(south.wx, south.wy);
  ctx.lineTo(east.wx, east.wy);
  ctx.lineTo(east.wx, east.wy + skirtDepth);
  ctx.lineTo(south.wx, south.wy + skirtDepth);
  ctx.closePath();
  ctx.fill();

  // Subtle brass tabletop rim around entire 16x16 diamond
  ctx.strokeStyle = 'rgba(217, 169, 78, 0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(north.wx, north.wy);
  ctx.lineTo(east.wx, east.wy);
  ctx.lineTo(south.wx, south.wy);
  ctx.lineTo(west.wx, west.wy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawGroundTile(
  ctx: CanvasRenderingContext2D,
  tile: MapTile,
  fog: FogState,
  tiles: MapTile[],
  mapSize: number,
  biome: BiomeDef,
  animSec: number,
) {
  const { x: tx, y: ty, kind, variant } = tile;
  const { wx, wy } = tileToWorld(tx, ty);
  const cx = wx;
  const cy = wy + TILE_H / 2;

  // Unexplored dark medieval shroud
  if (fog === 0) {
    traceDiamond(ctx, wx, wy, 1, 0.55);
    ctx.fillStyle = (tx + ty) % 2 === 0 ? '#0a0e16' : '#0d121c';
    ctx.fill();

    // Subtle cartographic hatch speck on shroud
    if ((tx + ty * 3 + variant) % 5 === 0) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.stroke();
    }
    return;
  }

  // 1. Base Diamond Fill
  traceDiamond(ctx, wx, wy, 1, 0.45);
  if (kind === 'water') {
    ctx.fillStyle = (tx + ty + variant) % 2 === 0 ? biome.waterTop : biome.waterDeep;
  } else if (kind === 'shallows') {
    ctx.fillStyle = biome.shallows;
  } else if (kind === 'road') {
    ctx.fillStyle = biome.roadColor;
  } else if (kind === 'cliff') {
    ctx.fillStyle = biome.cliffSide;
  } else if (kind === 'forest') {
    ctx.fillStyle = biome.grassEdge;
  } else {
    ctx.fillStyle = (tx + ty + variant) % 2 === 0 ? biome.grassTop : biome.grassAlt;
  }
  ctx.fill();

  // 2. Painterly Tile Details
  if (kind === 'water') {
    // Sunken earthen bank along NW / NE edges if bordering non-water
    const northNeighbor = ty > 0 ? tiles[(ty - 1) * mapSize + tx] : null;
    const westNeighbor = tx > 0 ? tiles[ty * mapSize + (tx - 1)] : null;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = biome.cliffSide;
    if (northNeighbor && northNeighbor.kind !== 'water' && northNeighbor.kind !== 'shallows') {
      ctx.beginPath();
      ctx.moveTo(wx, wy + 0.8);
      ctx.lineTo(wx + TILE_W / 2 - 1, wy + TILE_H / 2 + 0.8);
      ctx.stroke();
    }
    if (westNeighbor && westNeighbor.kind !== 'water' && westNeighbor.kind !== 'shallows') {
      ctx.beginPath();
      ctx.moveTo(wx, wy + 0.8);
      ctx.lineTo(wx - TILE_W / 2 + 1, wy + TILE_H / 2 + 0.8);
      ctx.stroke();
    }

    // Animated water wave crests
    const wave1 = Math.sin(animSec * 2.3 + tx * 0.9 + ty * 1.2) * 3.5;
    const wave2 = Math.cos(animSec * 1.9 - tx * 1.1 + ty * 0.8) * 3.0;
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.36)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 10 + wave1, cy - 3);
    ctx.quadraticCurveTo(cx + wave1, cy - 5.2, cx + 8 + wave1, cy - 3);
    ctx.moveTo(cx - 7 + wave2, cy + 4.5);
    ctx.quadraticCurveTo(cx + wave2, cy + 2.5, cx + 9 + wave2, cy + 4.5);
    ctx.stroke();
  } else if (kind === 'shallows') {
    // White water ford ripples + stepping stones!
    const ripple = Math.sin(animSec * 3.1 + tx + ty) * 2.2;
    ctx.strokeStyle = 'rgba(240, 249, 255, 0.52)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - 13 + ripple, cy - 2);
    ctx.lineTo(cx - 3 + ripple, cy - 2);
    ctx.moveTo(cx + 2 - ripple, cy + 4);
    ctx.lineTo(cx + 12 - ripple, cy + 4);
    ctx.stroke();

    // Stepping-stone cobbles across the ford
    const stones: ReadonlyArray<readonly [number, number, number]> = [
      [-10, -1, 4.4],
      [-2, 3, 4.8],
      [7, -2, 4.2],
      [13, 2.5, 3.6],
    ];
    for (let i = 0; i < stones.length; i++) {
      const [ox, oy, r] = stones[i];
      const jx = ox + (tileHash(tx, ty, i + 10) - 0.5) * 2.5;
      const jy = oy + (tileHash(tx, ty, i + 20) - 0.5) * 2.0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx + jx, cy + jy + 0.6, r + 1.3, (r + 1.3) * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8b8579';
      ctx.beginPath();
      ctx.ellipse(cx + jx, cy + jy, r, r * 0.54, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#b5afa2';
      ctx.beginPath();
      ctx.ellipse(cx + jx - 0.5, cy + jy - 0.5, r * 0.72, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'road') {
    // Soft grassy verge corners + warm cobblestone ovals
    ctx.fillStyle = 'rgba(255, 244, 214, 0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 17, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 5; i++) {
      const rx = (tileHash(tx, ty, 30 + i) - 0.5) * 26;
      const ry = (tileHash(tx, ty, 40 + i) - 0.5) * 12;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(92, 72, 44, 0.28)' : 'rgba(250, 236, 205, 0.25)';
      ctx.beginPath();
      ctx.ellipse(cx + rx, cy + ry, 3.3, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Subtle isometric tile bevel on grass / resource tiles
    ctx.strokeStyle = 'rgba(255, 255, 230, 0.07)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(wx - TILE_W / 2 + 1, wy + TILE_H / 2);
    ctx.lineTo(wx, wy + 0.6);
    ctx.lineTo(wx + TILE_W / 2 - 1, wy + TILE_H / 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.beginPath();
    ctx.moveTo(wx - TILE_W / 2 + 1, wy + TILE_H / 2);
    ctx.lineTo(wx, wy + TILE_H - 0.6);
    ctx.lineTo(wx + TILE_W / 2 - 1, wy + TILE_H / 2);
    ctx.stroke();

    if (kind === 'grass') {
      // Deterministic meadow tufts & occasional wildflowers
      const tuftCount = 2 + (variant % 2);
      ctx.strokeStyle = biome.grassEdge;
      ctx.lineWidth = 1.05;
      for (let i = 0; i < tuftCount; i++) {
        const gx = cx + (tileHash(tx, ty, 50 + i) - 0.5) * 30;
        const gy = cy + (tileHash(tx, ty, 60 + i) - 0.5) * 14;
        ctx.beginPath();
        ctx.moveTo(gx - 1.5, gy + 1);
        ctx.lineTo(gx - 2.4, gy - 2.4);
        ctx.moveTo(gx, gy + 1);
        ctx.lineTo(gx + 0.4, gy - 3.1);
        ctx.moveTo(gx + 1.5, gy + 1);
        ctx.lineTo(gx + 2.6, gy - 2.1);
        ctx.stroke();
      }

      if ((tx * 19 + ty * 31 + variant) % 5 === 0) {
        const fx = cx + (tileHash(tx, ty, 77) - 0.5) * 22;
        const fy = cy + (tileHash(tx, ty, 88) - 0.5) * 10;
        const flowerColors = ['#fef08a', '#f8fafc', '#fda4af', '#bae6fd'];
        ctx.fillStyle = flowerColors[(tx + ty + variant) % flowerColors.length];
        ctx.beginPath();
        ctx.arc(fx, fy - 1, 1.35, 0, Math.PI * 2);
        ctx.arc(fx + 3.2, fy + 0.8, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'gold') {
      // Mineral gravel bed beneath gold mound
      ctx.fillStyle = 'rgba(120, 98, 62, 0.55)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 1, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'berry') {
      // Rich fertile soil patch beneath berry bushes
      ctx.fillStyle = 'rgba(42, 68, 28, 0.45)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 1, 17, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Explored Fog of War (45% twilight veil on ground)
  if (fog === 1) {
    traceDiamond(ctx, wx, wy, 1, 0.5);
    ctx.fillStyle = 'rgba(10, 16, 28, 0.45)';
    ctx.fill();
  }
}

function drawFogEdgeFeather(
  ctx: CanvasRenderingContext2D,
  fog: FogState[],
  mapSize: number,
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(8, 12, 20, 0.65)';
  ctx.lineWidth = 3.2;
  for (let ty = 0; ty < mapSize; ty++) {
    for (let tx = 0; tx < mapSize; tx++) {
      if (fog[ty * mapSize + tx] !== 0) continue;
      const { wx, wy } = tileToWorld(tx, ty);
      const nOpen = ty > 0 && fog[(ty - 1) * mapSize + tx] > 0;
      const eOpen = tx < mapSize - 1 && fog[ty * mapSize + (tx + 1)] > 0;
      const sOpen = ty < mapSize - 1 && fog[(ty + 1) * mapSize + tx] > 0;
      const wOpen = tx > 0 && fog[ty * mapSize + (tx - 1)] > 0;
      if (!nOpen && !eOpen && !sOpen && !wOpen) continue;

      ctx.beginPath();
      if (nOpen) {
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + TILE_W / 2, wy + TILE_H / 2);
      }
      if (eOpen) {
        ctx.moveTo(wx + TILE_W / 2, wy + TILE_H / 2);
        ctx.lineTo(wx, wy + TILE_H);
      }
      if (sOpen) {
        ctx.moveTo(wx, wy + TILE_H);
        ctx.lineTo(wx - TILE_W / 2, wy + TILE_H / 2);
      }
      if (wOpen) {
        ctx.moveTo(wx - TILE_W / 2, wy + TILE_H / 2);
        ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawTerrainProp(
  ctx: CanvasRenderingContext2D,
  tile: MapTile,
  biome: BiomeDef,
  twilight: boolean,
  animSec: number,
) {
  const { x: tx, y: ty, kind, amount, maxAmount, variant } = tile;
  const { wx, wy } = tileToWorld(tx, ty);
  const cx = wx;
  const cy = wy + TILE_H / 2;

  if (kind === 'cliff') {
    const h = 18 + (variant % 3) * 3;
    const hw = TILE_W / 2 - 1;
    const hh = TILE_H / 2 - 0.5;
    const sideDark = veilColor(biome.cliffSide, twilight);
    const topLight = veilColor(biome.cliffTop, twilight);
    const sideMid = veilColor('#645e54', twilight);

    // Left vertical rock wall
    ctx.fillStyle = sideDark;
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx, cy + hh - h);
    ctx.lineTo(cx - hw, cy - h);
    ctx.closePath();
    ctx.fill();

    // Right vertical rock wall
    ctx.fillStyle = sideMid;
    ctx.beginPath();
    ctx.moveTo(cx, cy + hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx + hw, cy - h);
    ctx.lineTo(cx, cy + hh - h);
    ctx.closePath();
    ctx.fill();

    // Extruded plateau top diamond
    ctx.fillStyle = topLight;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh - h);
    ctx.lineTo(cx + hw, cy - h);
    ctx.lineTo(cx, cy + hh - h);
    ctx.lineTo(cx - hw, cy - h);
    ctx.closePath();
    ctx.fill();

    // Crag spire & fissure highlights
    ctx.fillStyle = sideDark;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - h + 2);
    ctx.lineTo(cx - 2, cy - h - 7);
    ctx.lineTo(cx + 6, cy - h + 1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = veilColor('#9c9588', twilight);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - hw + 2, cy - h);
    ctx.lineTo(cx, cy + hh - h);
    ctx.lineTo(cx + hw - 2, cy - h);
    ctx.stroke();
    return;
  }

  if (kind === 'forest') {
    const ratio = maxAmount > 0 ? Math.max(0.15, amount / maxAmount) : 1;
    const totalSlots = 4;
    const standingTrees = Math.max(1, Math.round(ratio * totalSlots));
    const slots: ReadonlyArray<readonly [number, number]> = [
      [0, -6],
      [-11, 1],
      [10, 0.5],
      [0, 6.5],
    ];
    const cPrimary = veilColor(biome.treePrimary, twilight);
    const cSecondary = veilColor(biome.treeSecondary, twilight);
    const cTrunk = veilColor('#5c3d24', twilight);
    const cStumpTop = veilColor('#c8a272', twilight);
    const isPalm = biome.id === 'oasis';
    const isConifer = biome.id === 'black_forest' || biome.id === 'highlands';

    for (let i = 0; i < totalSlots; i++) {
      const [ baseOx, baseOy ] = slots[i];
      const ox = baseOx + (tileHash(tx, ty, 100 + i) - 0.5) * 4;
      const oy = baseOy + (tileHash(tx, ty, 110 + i) - 0.5) * 2.5;
      const px = cx + ox;
      const py = cy + oy;

      if (i >= standingTrees) {
        // Chopped lumber stump showing harvest progress!
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(px + 1, py + 1, 3.6, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = cTrunk;
        ctx.fillRect(px - 2.5, py - 3, 5, 3.5);
        ctx.fillStyle = cStumpTop;
        ctx.beginPath();
        ctx.ellipse(px, py - 3, 2.5, 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const sway = twilight
        ? 0
        : Math.sin(animSec * 1.85 + tx * 0.7 + ty * 1.1 + i * 1.4) * 1.5;
      const scale = 0.88 + tileHash(tx, ty, 120 + i) * 0.24;

      // Ground tree shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      ctx.beginPath();
      ctx.ellipse(px + 3, py + 1.5, 7.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isPalm) {
        // Curved desert palm trunk + radiating fronds
        ctx.strokeStyle = cTrunk;
        ctx.lineWidth = 2.6 * scale;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + 2.5, py - 11 * scale, px + sway, py - 21 * scale);
        ctx.stroke();

        const topX = px + sway;
        const topY = py - 21 * scale;
        ctx.strokeStyle = cSecondary;
        ctx.lineWidth = 2.1 * scale;
        const angles = [-2.5, -1.6, -0.6, 0.4, 1.3, 2.3];
        for (const a of angles) {
          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(
            topX + Math.cos(a) * 6 * scale,
            topY + Math.sin(a) * 3 * scale - 3,
            topX + Math.cos(a) * 11 * scale,
            topY + Math.sin(a) * 5 * scale + 3,
          );
          ctx.stroke();
        }
      } else if (isConifer) {
        // Layered AoE II pine tree
        ctx.fillStyle = cTrunk;
        ctx.fillRect(px - 1.6, py - 6, 3.2, 6.5);

        for (let tier = 0; tier < 3; tier++) {
          const baseY = py - 5 - tier * 6.2 * scale;
          const halfW = (9.2 - tier * 2.1) * scale;
          const tipY = baseY - (9.5 - tier * 1.2) * scale;
          ctx.fillStyle = tier === 2 ? cSecondary : cPrimary;
          ctx.beginPath();
          ctx.moveTo(px + sway * (0.4 + tier * 0.3), tipY);
          ctx.lineTo(px + halfW + sway * 0.3, baseY);
          ctx.lineTo(px - halfW + sway * 0.3, baseY);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // Lush broadleaf oak/maple canopy
        ctx.fillStyle = cTrunk;
        ctx.fillRect(px - 1.8, py - 8, 3.6, 8.5);

        ctx.fillStyle = cPrimary;
        ctx.beginPath();
        ctx.arc(px - 3.5 + sway * 0.6, py - 13 * scale, 6.5 * scale, 0, Math.PI * 2);
        ctx.arc(px + 3.8 + sway * 0.6, py - 12.5 * scale, 6.2 * scale, 0, Math.PI * 2);
        ctx.arc(px + sway * 0.85, py - 17.5 * scale, 6.8 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Sunlit top crown highlight
        ctx.fillStyle = cSecondary;
        ctx.beginPath();
        ctx.arc(px - 1.5 + sway * 0.9, py - 18.5 * scale, 4.8 * scale, 0, Math.PI * 2);
        ctx.arc(px + 3 + sway * 0.7, py - 14.5 * scale, 4.1 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  if (kind === 'berry') {
    const ratio = maxAmount > 0 ? Math.max(0.25, amount / maxAmount) : 1;
    const bushCount = Math.max(1, Math.round(ratio * 3));
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [-8, -1.5],
      [7.5, -1],
      [0, 3.5],
    ];
    const leafDark = veilColor('#1f5a27', twilight);
    const leafLight = veilColor('#36863c', twilight);
    const berryRed = veilColor('#e11d48', twilight);
    const berryPink = veilColor('#fda4af', twilight);

    for (let i = 0; i < bushCount; i++) {
      const [ox, oy] = offsets[i];
      const bx = cx + ox;
      const by = cy + oy;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(bx + 1, by + 2, 7, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = leafDark;
      ctx.beginPath();
      ctx.arc(bx - 3, by - 2.5, 4.8, 0, Math.PI * 2);
      ctx.arc(bx + 3, by - 2.2, 4.6, 0, Math.PI * 2);
      ctx.arc(bx, by - 5.2, 5.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = leafLight;
      ctx.beginPath();
      ctx.arc(bx - 1, by - 6, 3.6, 0, Math.PI * 2);
      ctx.fill();

      // Plump crimson berries
      const pips: ReadonlyArray<readonly [number, number]> = [
        [-3.2, -3.5],
        [0.5, -6.2],
        [3.1, -3.0],
        [-0.8, -2.0],
      ];
      for (const [px, py] of pips) {
        ctx.fillStyle = berryRed;
        ctx.beginPath();
        ctx.arc(bx + px, by + py, 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = berryPink;
        ctx.fillRect(bx + px - 0.5, by + py - 0.7, 0.7, 0.7);
      }
    }
    return;
  }

  if (kind === 'gold') {
    const ratio = maxAmount > 0 ? Math.max(0.25, amount / maxAmount) : 1;
    const nuggetCount = Math.max(2, Math.round(ratio * 4));
    const nuggets: ReadonlyArray<readonly [number, number, number]> = [
      [-8, 0.5, 6.2],
      [7, 1.0, 5.8],
      [-1, -3.2, 7.2],
      [1.5, 4.0, 5.4],
    ];
    const goldShadow = veilColor('#92400e', twilight);
    const goldMid = veilColor('#f59e0b', twilight);
    const goldBright = veilColor('#fde047', twilight);

    for (let i = 0; i < nuggetCount; i++) {
      const [ox, oy, sz] = nuggets[i];
      const gx = cx + ox;
      const gy = cy + oy;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(gx + 1, gy + 2, sz * 1.1, sz * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // Faceted metallic ore polygon
      ctx.fillStyle = goldShadow;
      ctx.beginPath();
      ctx.moveTo(gx - sz, gy + 1);
      ctx.lineTo(gx - sz * 0.45, gy - sz * 0.95);
      ctx.lineTo(gx + sz * 0.5, gy - sz * 0.85);
      ctx.lineTo(gx + sz, gy + 1);
      ctx.lineTo(gx, gy + sz * 0.45);
      ctx.closePath();
      ctx.fill();

      // Sunlit upper facet
      ctx.fillStyle = goldMid;
      ctx.beginPath();
      ctx.moveTo(gx - sz * 0.85, gy);
      ctx.lineTo(gx - sz * 0.45, gy - sz * 0.95);
      ctx.lineTo(gx + sz * 0.45, gy - sz * 0.85);
      ctx.lineTo(gx + 0.5, gy + 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = goldBright;
      ctx.beginPath();
      ctx.moveTo(gx - sz * 0.45, gy - sz * 0.95);
      ctx.lineTo(gx + sz * 0.2, gy - sz * 0.88);
      ctx.lineTo(gx - sz * 0.1, gy - sz * 0.25);
      ctx.closePath();
      ctx.fill();
    }

    // Glinting 4-point sparkle stars on sunlit gold veins!
    if (!twilight) {
      for (let s = 0; s < 2; s++) {
        const pulse = Math.sin(animSec * 3.8 + tx * 1.7 + ty * 2.3 + s * 2.4);
        if (pulse <= 0.25) continue;
        const alpha = (pulse - 0.25) / 0.75;
        const sx = cx + (s === 0 ? -4 : 6);
        const sy = cy + (s === 0 ? -8 : -3);
        const arm = 3.8 * alpha + 1.2;
        ctx.strokeStyle = `rgba(254, 249, 195, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(sx - arm, sy);
        ctx.lineTo(sx + arm, sy);
        ctx.moveTo(sx, sy - arm);
        ctx.lineTo(sx, sy + arm);
        ctx.stroke();
      }
    }
  }
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  halfW: number,
  halfH: number,
  height: number,
  leftColor: string,
  rightColor: string,
  topColor: string,
) {
  // Left wall
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, baseY);
  ctx.lineTo(cx, baseY + halfH);
  ctx.lineTo(cx, baseY + halfH - height);
  ctx.lineTo(cx - halfW, baseY - height);
  ctx.closePath();
  ctx.fill();

  // Right wall
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(cx, baseY + halfH);
  ctx.lineTo(cx + halfW, baseY);
  ctx.lineTo(cx + halfW, baseY - height);
  ctx.lineTo(cx, baseY + halfH - height);
  ctx.closePath();
  ctx.fill();

  // Flat top
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - halfH - height);
  ctx.lineTo(cx + halfW, baseY - height);
  ctx.lineTo(cx, baseY + halfH - height);
  ctx.lineTo(cx - halfW, baseY - height);
  ctx.closePath();
  ctx.fill();
}

function drawPitchedRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  eaveY: number,
  halfW: number,
  halfH: number,
  peakRise: number,
  leftSlopeColor: string,
  rightSlopeColor: string,
  trimColor: string,
) {
  // Left/front-left pitched slope
  ctx.fillStyle = leftSlopeColor;
  ctx.beginPath();
  ctx.moveTo(cx - halfW - 2, eaveY + 1);
  ctx.lineTo(cx, eaveY + halfH + 2);
  ctx.lineTo(cx, eaveY - peakRise);
  ctx.closePath();
  ctx.fill();

  // Right/front-right pitched slope
  ctx.fillStyle = rightSlopeColor;
  ctx.beginPath();
  ctx.moveTo(cx, eaveY + halfH + 2);
  ctx.lineTo(cx + halfW + 2, eaveY + 1);
  ctx.lineTo(cx, eaveY - peakRise);
  ctx.closePath();
  ctx.fill();

  // Back-left slope visible edge
  ctx.fillStyle = leftSlopeColor;
  ctx.beginPath();
  ctx.moveTo(cx - halfW - 2, eaveY + 1);
  ctx.lineTo(cx, eaveY - halfH);
  ctx.lineTo(cx, eaveY - peakRise);
  ctx.closePath();
  ctx.fill();

  // Back-right slope visible edge
  ctx.fillStyle = rightSlopeColor;
  ctx.beginPath();
  ctx.moveTo(cx + halfW + 2, eaveY + 1);
  ctx.lineTo(cx, eaveY - halfH);
  ctx.lineTo(cx, eaveY - peakRise);
  ctx.closePath();
  ctx.fill();

  // Golden ridge finial trim
  ctx.strokeStyle = trimColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - halfW - 1.5, eaveY + 1);
  ctx.lineTo(cx, eaveY - peakRise);
  ctx.lineTo(cx + halfW + 1.5, eaveY + 1);
  ctx.stroke();
}

function drawPennant(
  ctx: CanvasRenderingContext2D,
  poleX: number,
  poleBaseY: number,
  poleHeight: number,
  teamColor: string,
  trimColor: string,
  animSec: number,
  seed: number,
) {
  ctx.strokeStyle = trimColor;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(poleX, poleBaseY);
  ctx.lineTo(poleX, poleBaseY - poleHeight);
  ctx.stroke();

  const wave = Math.sin(animSec * 5.2 + seed) * 2.2;
  const topY = poleBaseY - poleHeight;
  ctx.fillStyle = teamColor;
  ctx.beginPath();
  ctx.moveTo(poleX, topY);
  ctx.quadraticCurveTo(poleX + 6, topY + 1.5 + wave * 0.5, poleX + 12, topY + 2 + wave);
  ctx.lineTo(poleX + 9.5, topY + 4.5 + wave * 0.7);
  ctx.lineTo(poleX + 12, topY + 7 + wave);
  ctx.quadraticCurveTo(poleX + 6, topY + 6.5, poleX, topY + 6.5);
  ctx.closePath();
  ctx.fill();
}

function drawBuildingFlames(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  hpRatio: number,
  animSec: number,
  id: number,
) {
  const count = hpRatio < 0.25 ? 3 : 2;
  const spread = size === 2 ? 15 : 8;
  for (let i = 0; i < count; i++) {
    const ox = (i - (count - 1) * 0.5) * spread;
    const oy = -12 - (i % 2) * 6;
    const flicker = Math.sin(animSec * 13 + id * 3 + i * 2.1) * 2.5;
    const fx = cx + ox;
    const fy = cy + oy;

    // Rising smoke puff
    const smokeLift = ((animSec * 14 + i * 5) % 14);
    ctx.fillStyle = `rgba(30, 30, 34, ${(0.38 * (1 - smokeLift / 14)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(fx + flicker * 0.4, fy - 10 - smokeLift, 3.2 + smokeLift * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Outer orange tongue
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(fx - 4, fy);
    ctx.quadraticCurveTo(fx - 5, fy - 7, fx + flicker * 0.6, fy - 12 - Math.abs(flicker));
    ctx.quadraticCurveTo(fx + 5, fy - 7, fx + 4, fy);
    ctx.closePath();
    ctx.fill();

    // Inner bright yellow core
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(fx - 2, fy);
    ctx.quadraticCurveTo(fx, fy - 7 - Math.abs(flicker) * 0.5, fx + 2, fy);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: Building,
  selected: boolean,
  twilight: boolean,
  animSec: number,
  ghostAlpha = 1,
) {
  const top = tileToWorld(b.tileX, b.tileY);
  const cx = top.wx;
  const cy = top.wy + (TILE_H / 2) * b.size;
  const pal = TEAM_PALETTES[b.team];

  const cMain = veilColor(pal.main, twilight);
  const cLight = veilColor(pal.light, twilight);
  const cDark = veilColor(pal.dark, twilight);
  const cTrim = veilColor(pal.trim, twilight);
  const stoneLeft = veilColor('#9ca3af', twilight);
  const stoneRight = veilColor('#d1d5db', twilight);
  const stoneTop = veilColor('#e5e7eb', twilight);
  const plasterLeft = veilColor('#cfc3a8', twilight);
  const plasterRight = veilColor('#e7dcc4', twilight);
  const timber = veilColor('#5c3d24', twilight);
  const windowGlow = veilColor('#fbbf24', twilight);

  ctx.save();
  if (ghostAlpha < 1) {
    ctx.globalAlpha = ghostAlpha;
  }

  // Selected footprint highlight + defensive range ring for TC / Watchtower
  if (selected && ghostAlpha === 1) {
    const bSpec = BUILDINGS[b.kind];
    if (bSpec.attackRange > 0 && b.built) {
      const rx = bSpec.attackRange * (TILE_W / 2);
      const ry = bSpec.attackRange * (TILE_H / 2);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const pulse = 0.7 + 0.3 * Math.sin(animSec * 5);
    traceDiamond(ctx, top.wx, top.wy, b.size, 2.2);
    ctx.strokeStyle = `rgba(74, 222, 128, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    traceDiamond(ctx, top.wx, top.wy, b.size, 0.5);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Foundation shadow & courtyard pad
  traceDiamond(ctx, top.wx, top.wy, b.size, -1.5);
  ctx.fillStyle = veilColor('#6b655b', twilight);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Unfinished construction site: rising masonry + timber scaffolding + progress bar!
  if (!b.built && ghostAlpha === 1) {
    const prog = Math.max(0.05, Math.min(1, b.buildProgress));
    const maxH = b.kind === 'watchtower' ? 34 : b.size === 2 ? 26 : 18;
    const curH = 4 + maxH * prog;
    const hw = b.size === 2 ? 36 : 20;
    const hh = hw * 0.5;

    drawIsoBox(ctx, cx, cy + 2, hw, hh, curH, stoneLeft, stoneRight, stoneTop);

    // Timber scaffolding poles & cross-braces
    const scafH = curH + 7;
    ctx.strokeStyle = veilColor('#b48246', twilight);
    ctx.lineWidth = 1.5;
    const posts = [
      [cx - hw, cy + 2],
      [cx + hw, cy + 2],
      [cx, cy + hh + 2],
      [cx, cy - hh + 2],
    ];
    ctx.beginPath();
    for (const [px, py] of posts) {
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - scafH);
    }
    // Cross-beams
    ctx.moveTo(cx - hw, cy + 2 - scafH * 0.65);
    ctx.lineTo(cx, cy + hh + 2 - scafH * 0.65);
    ctx.lineTo(cx + hw, cy + 2 - scafH * 0.65);
    ctx.moveTo(cx - hw, cy + 2);
    ctx.lineTo(cx, cy + hh + 2 - scafH * 0.65);
    ctx.moveTo(cx + hw, cy + 2);
    ctx.lineTo(cx, cy + hh + 2 - scafH * 0.65);
    ctx.stroke();

    // Construction progress bar
    if (!twilight) {
      const barW = b.size === 2 ? 44 : 30;
      const barY = cy - scafH - 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(cx - barW / 2 - 1, barY - 1, barW + 2, 6);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx - barW / 2, barY, barW * prog, 4);
    }
    ctx.restore();
    return;
  }

  // Completed architectural sprites by BuildingKind
  if (b.kind === 'town_center') {
    // Paved stone courtyard lines + stockpile crates
    ctx.fillStyle = veilColor('#857d70', twilight);
    traceDiamond(ctx, top.wx, top.wy, 2, -5);
    ctx.fill();

    // Courtyard crates & resource barrels on east corner
    drawIsoBox(ctx, cx + 26, cy + 3, 5, 2.5, 5, timber, veilColor('#855834', twilight), veilColor('#a47148', twilight));

    // Southern open colonnade pillars (AoE II Town Center courtyard!)
    const pillars: ReadonlyArray<readonly [number, number]> = [
      [cx - 24, cy + 10],
      [cx - 4, cy + 20],
      [cx + 16, cy + 10],
    ];
    for (const [px, py] of pillars) {
      drawIsoBox(ctx, px, py, 3.2, 1.6, 15, stoneLeft, stoneRight, stoneTop);
    }
    // Courtyard canopy awning connecting pillars
    drawPitchedRoof(ctx, cx - 4, cy - 4, 24, 11, 9, cDark, cMain, cTrim);

    // Northern Great Hall keep body
    const hallCx = cx + 2;
    const hallCy = cy - 7;
    drawIsoBox(ctx, hallCx, hallCy, 26, 13, 21, plasterLeft, plasterRight, stoneTop);

    // Timber framing beams on Great Hall walls
    ctx.strokeStyle = timber;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(hallCx - 26, hallCy - 10);
    ctx.lineTo(hallCx, hallCy + 3);
    ctx.lineTo(hallCx + 26, hallCy - 10);
    ctx.stroke();

    // Warm lit arched windows
    ctx.fillStyle = windowGlow;
    ctx.fillRect(hallCx - 16, hallCy - 11, 4, 5.5);
    ctx.fillRect(hallCx - 8, hallCy - 7, 4, 5.5);
    ctx.fillRect(hallCx + 7, hallCy - 7, 4, 5.5);
    ctx.fillRect(hallCx + 15, hallCy - 11, 4, 5.5);

    // Great Hall steep team-colored roof
    drawPitchedRoof(ctx, hallCx, hallCy - 21, 28, 14, 17, cDark, cMain, cTrim);

    // Stone chimney + animated smoke puffs
    const chimX = hallCx - 14;
    const chimY = hallCy - 27;
    drawIsoBox(ctx, chimX, chimY, 3.5, 1.8, 9, stoneLeft, stoneRight, stoneTop);
    if (!twilight && ghostAlpha === 1) {
      for (let s = 0; s < 3; s++) {
        const phase = (animSec * 0.75 + s * 0.33) % 1;
        const sy = chimY - 10 - phase * 16;
        const sx = chimX + Math.sin(animSec * 2 + s) * 2.5 + phase * 4;
        ctx.fillStyle = `rgba(226, 232, 240, ${(0.42 * (1 - phase)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.4 + phase * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tall Royal/Imperial Pennant Flag
    drawPennant(ctx, hallCx, hallCy - 37, 15, cLight, cTrim, animSec, b.id);
  } else if (b.kind === 'homestead') {
    // Cozy cottage + lumber/grain drop-off annex
    drawIsoBox(ctx, cx - 2, cy + 2, 16, 8, 13, plasterLeft, plasterRight, stoneTop);
    drawPitchedRoof(ctx, cx - 2, cy - 11, 18, 9, 11, cDark, cMain, veilColor('#d6b370', twilight));

    // Warm cottage window & door
    ctx.fillStyle = timber;
    ctx.fillRect(cx + 3, cy + 1, 4.5, 7);
    ctx.fillStyle = windowGlow;
    ctx.fillRect(cx - 10, cy - 4, 4, 4);

    // Stacked resource logs & grain sack outside
    ctx.fillStyle = timber;
    ctx.fillRect(cx + 10, cy + 3, 7, 3);
    ctx.fillStyle = veilColor('#eab308', twilight);
    ctx.beginPath();
    ctx.arc(cx - 13, cy + 5, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.kind === 'barracks') {
    // Fortified stone & timber garrison hall
    drawIsoBox(ctx, cx - 2, cy + 1, 19, 9.5, 15, stoneLeft, stoneRight, stoneTop);
    drawPitchedRoof(ctx, cx - 2, cy - 14, 21, 10.5, 11, cDark, cMain, cTrim);

    // Arched barracks gate
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(cx - 12, cy - 2, 6, 9);

    // Combat training dummy in front-right yard
    ctx.strokeStyle = timber;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + 13, cy + 7);
    ctx.lineTo(cx + 13, cy - 2);
    ctx.moveTo(cx + 9.5, cy + 1);
    ctx.lineTo(cx + 16.5, cy + 1);
    ctx.stroke();
    ctx.fillStyle = veilColor('#d6b370', twilight);
    ctx.beginPath();
    ctx.arc(cx + 13, cy - 3.2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    drawPennant(ctx, cx - 2, cy - 25, 10, cLight, cTrim, animSec, b.id);
  } else if (b.kind === 'archery_range') {
    // Fletcher pavilion + bullseye target
    drawIsoBox(ctx, cx - 5, cy, 15, 7.5, 13, plasterLeft, plasterRight, stoneTop);
    drawPitchedRoof(ctx, cx - 5, cy - 13, 17, 8.5, 9.5, cMain, cLight, cTrim);

    // Iconic red-white-blue bullseye archery target in yard
    const tx = cx + 11;
    const ty = cy + 3;
    ctx.strokeStyle = timber;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(tx, ty - 4);
    ctx.lineTo(tx + 3, ty + 4);
    ctx.moveTo(tx - 2, ty + 4);
    ctx.lineTo(tx + 2, ty + 4);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(tx, ty - 1, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(tx, ty - 1, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(tx, ty - 1, 1.9, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.kind === 'stable') {
    // High-barn cavalry stable + paddock fence
    drawIsoBox(ctx, cx - 3, cy + 1, 18, 9, 15, timber, veilColor('#7c5333', twilight), stoneTop);
    drawPitchedRoof(ctx, cx - 3, cy - 14, 20, 10, 12, cDark, cMain, cTrim);

    // Dark horse stall opening + golden hay bale
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(cx + 2, cy - 1, 7, 8);
    ctx.fillStyle = veilColor('#facc15', twilight);
    ctx.fillRect(cx + 11, cy + 4, 5.5, 3.5);

    // Wooden paddock rail
    ctx.strokeStyle = veilColor('#a47148', twilight);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy + 4);
    ctx.lineTo(cx - 3, cy + 12);
    ctx.lineTo(cx + 12, cy + 5);
    ctx.stroke();
  } else if (b.kind === 'monastery') {
    // Limestone abbey chapel + stained glass + golden cross spire!
    drawIsoBox(ctx, cx, cy + 2, 18, 9, 18, veilColor('#d6d3d1', twilight), veilColor('#f5f5f4', twilight), stoneTop);
    drawPitchedRoof(ctx, cx, cy - 16, 20, 10, 15, cDark, cMain, cTrim);

    // Luminous stained-glass lancet & rose windows
    ctx.fillStyle = veilColor('#38bdf8', twilight);
    ctx.beginPath();
    ctx.arc(cx - 8, cy - 8, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = windowGlow;
    ctx.fillRect(cx + 6, cy - 9, 3.5, 7);
    ctx.fillRect(cx + 11, cy - 11, 3.5, 7);

    // Golden cross spire atop the sanctuary
    const spireX = cx;
    const spireBaseY = cy - 31;
    ctx.strokeStyle = cTrim;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(spireX, spireBaseY + 2);
    ctx.lineTo(spireX, spireBaseY - 10);
    ctx.moveTo(spireX - 4, spireBaseY - 6);
    ctx.lineTo(spireX + 4, spireBaseY - 6);
    ctx.stroke();
  } else if (b.kind === 'watchtower') {
    // Tall crenelated medieval stone keep tower!
    drawIsoBox(ctx, cx, cy + 3, 13, 6.5, 32, stoneLeft, stoneRight, stoneTop);

    // Projecting stone battlement parapet + merlons
    drawIsoBox(ctx, cx, cy - 29, 15.5, 7.8, 5, veilColor('#78716c', twilight), stoneLeft, stoneTop);
    drawPitchedRoof(ctx, cx, cy - 34, 12, 6, 10, cDark, cMain, cTrim);

    // Arrow slits & hanging team banner on tower face
    ctx.fillStyle = '#111827';
    ctx.fillRect(cx - 7, cy - 18, 2, 6);
    ctx.fillRect(cx + 6, cy - 18, 2, 6);

    ctx.fillStyle = cMain;
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 24);
    ctx.lineTo(cx + 9, cy - 21);
    ctx.lineTo(cx + 9, cy - 11);
    ctx.lineTo(cx + 6, cy - 9);
    ctx.lineTo(cx + 3, cy - 13);
    ctx.closePath();
    ctx.fill();
  }

  // Flickering flames on heavily damaged buildings
  const hpRatio = b.maxHp > 0 ? b.hp / b.maxHp : 1;
  if (ghostAlpha === 1 && !twilight && hpRatio < 0.5) {
    drawBuildingFlames(ctx, cx, cy, b.size, hpRatio, animSec, b.id);
  }

  // Overhead HP bar (when damaged or selected) & unit training progress bar
  if (ghostAlpha === 1 && !twilight) {
    const topBarY =
      b.kind === 'watchtower'
        ? cy - 50
        : b.kind === 'town_center'
          ? cy - 58
          : b.kind === 'monastery'
            ? cy - 46
            : cy - 34;
    const barW = b.size === 2 ? 48 : 32;

    if (selected || b.hp < b.maxHp) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(cx - barW / 2 - 1, topBarY - 1, barW + 2, 5.5);
      ctx.fillStyle = hpRatio > 0.55 ? '#22c55e' : hpRatio > 0.28 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(cx - barW / 2, topBarY, Math.max(0, barW * hpRatio), 3.5);
    }

    if (b.team === 'player' && b.queue.length > 0) {
      const head = b.queue[0];
      const qProg =
        head.totalSec > 0 ? Math.max(0, Math.min(1, 1 - head.remainingSec / head.totalSec)) : 0;
      const qY = topBarY + 6;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(cx - barW / 2 - 1, qY - 1, barW + 2, 4.5);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - barW / 2, qY, barW * qProg, 2.5);
    }
  }

  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  u: Unit,
  selected: boolean,
  isBeingConverted: boolean,
  animSec: number,
) {
  const { wx, wy } = tileToWorld(u.x, u.y);
  const pal = TEAM_PALETTES[u.team];
  const isMounted = u.kind === 'knight' || u.kind === 'scout';
  const isMoving = u.path.length > 0 || u.order.type === 'move';
  const stride = Math.sin(u.animPhase * 1.4);
  const bob = isMoving ? Math.abs(stride) * 1.6 : Math.sin(animSec * 2.5 + u.id) * 0.4;
  const actionSwing =
    u.attackTimer > 0
      ? Math.sin(u.attackTimer * 14) * 4
      : u.order.type === 'gather' || u.order.type === 'build'
        ? Math.sin(u.animPhase * 2.1) * 3.2
        : 0;

  ctx.save();

  // 1. Monk pulsing golden WOLOLO aura at feet!
  if (u.kind === 'monk' && (u.convertTargetId !== null || u.order.type === 'convert')) {
    const pulse = (animSec * 2.2) % 1;
    ctx.strokeStyle = `rgba(250, 204, 21, ${(0.85 * (1 - pulse)).toFixed(2)})`;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 9 + pulse * 13, 4.5 + pulse * 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(253, 224, 71, 0.22)';
    ctx.beginPath();
    ctx.ellipse(wx, wy, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Golden shimmer under enemy unit currently targeted by Wololo
  if (isBeingConverted) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 12, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Classic AoE II bright green selection ring under selected player units
  if (selected && u.team === 'player') {
    const rx = isMounted ? 12.5 : 9.5;
    const ry = isMounted ? 6.4 : 4.9;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
    ctx.beginPath();
    ctx.ellipse(wx, wy, rx + 1.5, ry + 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.ellipse(wx, wy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. Soft elliptical ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(wx, wy + 1, isMounted ? 10.5 : 7.2, isMounted ? 5.2 : 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4. Facing-oriented unit sprite body
  ctx.save();
  ctx.translate(wx, wy - bob);
  ctx.scale(u.facing >= 0 ? 1 : -1, 1);

  if (u.kind === 'villager') {
    // Legs
    ctx.strokeStyle = '#4b3621';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(-2.5 + stride * 1.8, 0);
    ctx.moveTo(2, -6);
    ctx.lineTo(2.5 - stride * 1.8, 0);
    ctx.stroke();

    // Team tunic + leather belt
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.roundRect(-4.5, -14, 9, 8.5, 2);
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-4.5, -9, 9, 1.6);

    // Head + straw/cloth cap
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -17, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6b370';
    ctx.beginPath();
    ctx.ellipse(0, -19.2, 4.2, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Carried resource bundle when carryAmount > 0!
    if (u.carryAmount > 0 && u.carryKind) {
      if (u.carryKind === 'wood') {
        // Brown timber log on shoulder
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(-6.5, -15.5, 9.5, 3.8);
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(3, -13.6, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (u.carryKind === 'gold') {
        // Gleaming gold ore sack
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(-4.2, -13, 4.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(-5, -14.2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Woven berry basket brimming with red berries
        ctx.fillStyle = '#b48246';
        ctx.fillRect(2, -13.5, 5.8, 4.2);
        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.arc(3.5, -14.2, 1.5, 0, Math.PI * 2);
        ctx.arc(6.0, -14.0, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Work tool / axe / hammer in hand
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(3, -11);
      ctx.lineTo(7.5, -15 + actionSwing);
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6.5, -16.8 + actionSwing, 3, 2.5);
    }
  } else if (u.kind === 'scout') {
    // Swift light brown courser horse + rider
    ctx.strokeStyle = '#5c3a21';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-7.5 + stride * 2.8, 0);
    ctx.moveTo(-2, -6);
    ctx.lineTo(-1 - stride * 2.5, 0);
    ctx.moveTo(4, -6);
    ctx.lineTo(3 + stride * 2.5, 0);
    ctx.moveTo(7, -6);
    ctx.lineTo(8.5 - stride * 2.8, 0);
    ctx.stroke();

    // Horse body + neck + head
    ctx.fillStyle = '#8b5a2b';
    ctx.beginPath();
    ctx.ellipse(0, -9, 9.2, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5.5, -10);
    ctx.lineTo(10.5, -16.5);
    ctx.lineTo(13, -14.5);
    ctx.lineTo(8.5, -7.5);
    ctx.closePath();
    ctx.fill();

    // Scout rider in team jerkin + spear
    ctx.fillStyle = pal.main;
    ctx.fillRect(-3.5, -18, 6.2, 7.5);
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(-0.2, -20.5, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.light;
    ctx.fillRect(-3, -23, 5.5, 1.8);

    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4, -13);
    ctx.lineTo(13 + actionSwing * 0.5, -17);
    ctx.stroke();
  } else if (u.kind === 'militia') {
    // Man-at-Arms: chainmail, team tabard, steel helmet, shield & broadsword
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-2.2, -6);
    ctx.lineTo(-2.8 + stride * 2, 0);
    ctx.moveTo(2.2, -6);
    ctx.lineTo(2.8 - stride * 2, 0);
    ctx.stroke();

    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.roundRect(-5, -15, 10, 9.5, 2);
    ctx.fill();
    ctx.fillStyle = pal.main;
    ctx.fillRect(-3.2, -14.5, 6.4, 8.5);

    // Kettle steel helm
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -17.5, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(0, -18.5, 3.8, Math.PI, 0);
    ctx.fill();

    // Gleaming broadsword
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(4.5, -12);
    ctx.lineTo(10.5, -19.5 + actionSwing);
    ctx.stroke();

    // Team heater shield with brass boss
    ctx.fillStyle = pal.dark;
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(-6.5, -14.5, 5.8, 7.5, 2);
    ctx.fill();
    ctx.stroke();
  } else if (u.kind === 'pikeman') {
    // Halberdier: conical iron helm, sash, tall diagonal anti-cavalry pike!
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(-2.5 + stride * 2, 0);
    ctx.moveTo(2, -6);
    ctx.lineTo(2.5 - stride * 2, 0);
    ctx.stroke();

    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.roundRect(-4.6, -15, 9.2, 9.5, 2);
    ctx.fill();
    ctx.fillStyle = pal.main;
    ctx.fillRect(-4.6, -11, 9.2, 3.5);

    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -17.5, 3, 0, Math.PI * 2);
    ctx.fill();
    // Conical morion helm
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(-4.5, -18);
    ctx.lineTo(0, -23);
    ctx.lineTo(4.5, -18);
    ctx.closePath();
    ctx.fill();

    // Long diagonal wood shaft + steel halberd head
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-4, -7);
    ctx.lineTo(11 + actionSwing * 0.5, -26);
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(10 + actionSwing * 0.5, -24.5);
    ctx.lineTo(13.5 + actionSwing * 0.5, -29);
    ctx.lineTo(8.5 + actionSwing * 0.5, -27);
    ctx.closePath();
    ctx.fill();
  } else if (u.kind === 'archer') {
    // Yeoman Longbowman: quiver, hooded team tunic, curved yew longbow
    ctx.strokeStyle = '#3f2e1e';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(-2.4 + stride * 1.9, 0);
    ctx.moveTo(2, -6);
    ctx.lineTo(2.4 - stride * 1.9, 0);
    ctx.stroke();

    // Back arrow quiver
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-6.2, -17, 2.8, 7);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-6.4, -18.8, 3.2, 2);

    // Body + ranger hood
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.roundRect(-4.2, -14.5, 8.4, 9, 2);
    ctx.fill();

    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0.5, -17.2, 2.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.arc(-0.3, -18, 3.5, Math.PI * 0.75, Math.PI * 2.1);
    ctx.fill();

    // Curved yew longbow + bowstring
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(3.5, -12.5, 7.2, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(5.2, -19.2);
    ctx.lineTo(5.2, -5.8);
    ctx.stroke();
  } else if (u.kind === 'knight') {
    // Heavy Armored Destrier + Team Caparison Barding + Plume + Couched Lance!
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-6.5, -6);
    ctx.lineTo(-8 + stride * 2.6, 0);
    ctx.moveTo(-2.5, -6);
    ctx.lineTo(-1.5 - stride * 2.4, 0);
    ctx.moveTo(4, -6);
    ctx.lineTo(3 + stride * 2.4, 0);
    ctx.moveTo(7.5, -6);
    ctx.lineTo(9 - stride * 2.6, 0);
    ctx.stroke();

    // Warhorse body draped in Royal Sapphire / Imperial Crimson caparison
    ctx.fillStyle = '#f3f4f6';
    ctx.beginPath();
    ctx.ellipse(0, -9.5, 10.5, 5.0, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.main;
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.roundRect(-9.5, -12, 18.5, 7.2, 3);
    ctx.fill();
    ctx.stroke();

    // Armored horse neck & chamfron head
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(6, -11);
    ctx.lineTo(11.5, -18.5);
    ctx.lineTo(14.5, -15.5);
    ctx.lineTo(9.5, -8.5);
    ctx.closePath();
    ctx.fill();

    // Plate-armored Knight torso + visored Great Helm + flowing plume!
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.roundRect(-4.2, -20.5, 7.5, 9.5, 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-2.6, -25.2, 5.2, 5);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-0.2, -23.5, 2.8, 1.1);

    // Flowing team helmet plume
    ctx.fillStyle = pal.light;
    ctx.beginPath();
    ctx.ellipse(-3.8, -26, 3.8, 1.8, -0.35, 0, Math.PI * 2);
    ctx.fill();

    // Kite shield
    ctx.fillStyle = pal.dark;
    ctx.strokeStyle = pal.trim;
    ctx.beginPath();
    ctx.moveTo(-5, -19);
    ctx.lineTo(0.5, -19);
    ctx.lineTo(-2.2, -11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Couched heavy jousting lance!
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-6, -15);
    ctx.lineTo(18 + actionSwing * 0.5, -17.5);
    ctx.lineTo(-6, -13.2);
    ctx.closePath();
    ctx.fill();
  } else if (u.kind === 'monk') {
    // AoE II Monk: white/gold flowing robe, team stole, relic staff!
    const chanting = u.convertTargetId !== null || u.order.type === 'convert';
    const armLift = chanting ? -5 - Math.sin(animSec * 9) * 1.8 : 0;

    // Flowing cream-white monastic robe with gold hem
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-5.5, 0);
    ctx.lineTo(-3.8, -15.5);
    ctx.lineTo(3.8, -15.5);
    ctx.lineTo(5.5, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.trim;
    ctx.fillRect(-5.3, -2, 10.6, 2);
    // Team liturgical stole
    ctx.fillStyle = pal.main;
    ctx.fillRect(-1.5, -15, 3, 12);

    // Tonsured head + golden halo when chanting!
    if (chanting) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, -22, 4.8, 2.0, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -18, 3.1, 0, Math.PI * 2);
    ctx.fill();

    // Raised Golden Crozier Staff!
    const staffX = 5.5;
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(staffX, -1 + armLift * 0.5);
    ctx.lineTo(staffX + 1, -22 + armLift * 0.5);
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(staffX + 1, -23.5 + armLift * 0.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // end facing transform

  // 5. Overhead HP bar & Idle Villager '!' badge
  const topOffset = isMounted ? 31 : 25;
  const hpRatio = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 1;
  if (selected || u.hp < u.maxHp || u.kind !== 'villager') {
    const barW = isMounted ? 20 : 15;
    const barH = selected || u.hp < u.maxHp ? 3.2 : 2.2;
    const by = wy - topOffset - bob;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(wx - barW / 2 - 0.8, by - 0.8, barW + 1.6, barH + 1.6);
    ctx.fillStyle =
      hpRatio > 0.55 ? (u.team === 'player' ? '#4ade80' : '#f87171') : hpRatio > 0.28 ? '#fbbf24' : '#ef4444';
    ctx.fillRect(wx - barW / 2, by, barW * hpRatio, barH);
  }

  // Idle '!' badge above idle player villagers!
  if (u.team === 'player' && u.kind === 'villager' && u.order.type === 'idle') {
    const badgeY = wy - 31 - Math.abs(Math.sin(animSec * 4.2 + u.id)) * 3;
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(wx, badgeY, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', wx, badgeY + 0.5);
  }

  ctx.restore();
}

function drawMonkWololoBeams(
  ctx: CanvasRenderingContext2D,
  units: Unit[],
  fog: FogState[],
  mapSize: number,
  animSec: number,
) {
  for (const monk of units) {
    if (monk.hp <= 0 || monk.kind !== 'monk' || monk.convertTargetId === null) continue;
    const target = units.find((t) => t.id === monk.convertTargetId && t.hp > 0);
    if (!target) continue;

    // Hide enemy beam if both endpoints are hidden in fog
    if (monk.team === 'enemy') {
      const mf = fog[Math.floor(monk.y) * mapSize + Math.floor(monk.x)] ?? 0;
      const tf = fog[Math.floor(target.y) * mapSize + Math.floor(target.x)] ?? 0;
      if (mf !== 2 && tf !== 2) continue;
    }

    const from = tileToWorld(monk.x, monk.y);
    const to = tileToWorld(target.x, target.y);
    const x1 = from.wx + monk.facing * 5.5;
    const y1 = from.wy - 24;
    const x2 = to.wx;
    const y2 = to.wy - 14;
    const midX = (x1 + x2) * 0.5;
    const midY = Math.min(y1, y2) - 14 + Math.sin(animSec * 8) * 3;

    ctx.save();
    // Outer golden halo beam
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.38)';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(midX, midY, x2, y2);
    ctx.stroke();

    // Bright sacred core beam
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(midX, midY, x2, y2);
    ctx.stroke();

    // Travelling golden sparkles along the faith beam
    for (let i = 0; i < 3; i++) {
      const t = (animSec * 1.9 + i * 0.33) % 1;
      const omt = 1 - t;
      const sx = omt * omt * x1 + 2 * omt * t * midX + t * t * x2;
      const sy = omt * omt * y1 + 2 * omt * t * midY + t * t * y2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Conversion progress arc above target
    if (monk.convertProgress > 0) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(
        to.wx,
        to.wy - 26,
        6,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, monk.convertProgress),
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  projectiles: Projectile[],
  fog: FogState[],
  mapSize: number,
) {
  for (const p of projectiles) {
    const t = Math.max(0, Math.min(1, p.progress));
    const curTileX = p.fromX + (p.toX - p.fromX) * t;
    const curTileY = p.fromY + (p.toY - p.fromY) * t;
    if (p.team === 'enemy') {
      const tx = Math.max(0, Math.min(mapSize - 1, Math.floor(curTileX)));
      const ty = Math.max(0, Math.min(mapSize - 1, Math.floor(curTileY)));
      if (fog[ty * mapSize + tx] !== 2) continue;
    }

    const start = tileToWorld(p.fromX, p.fromY);
    const end = tileToWorld(p.toX, p.toY);
    const groundX = start.wx + (end.wx - start.wx) * t;
    const groundY = start.wy + (end.wy - start.wy) * t;

    const span = Math.hypot(end.wx - start.wx, end.wy - start.wy);
    const arcPeak = Math.min(34, Math.max(10, span * 0.22));
    const liftStart = p.kind === 'bolt' ? 22 : 13;
    const liftEnd = 11;
    const baseLift = liftStart + (liftEnd - liftStart) * t;
    const arcZ = Math.sin(t * Math.PI) * arcPeak + baseLift;

    const px = groundX;
    const py = groundY - arcZ;

    // Tangent vector for arrow/bolt orientation
    const dt = 0.04;
    const t2 = Math.min(1, t + dt);
    const gx2 = start.wx + (end.wx - start.wx) * t2;
    const gy2 = start.wy + (end.wy - start.wy) * t2;
    const az2 =
      Math.sin(t2 * Math.PI) * arcPeak + (liftStart + (liftEnd - liftStart) * t2);
    const angle = Math.atan2(gy2 - az2 - py, gx2 - px);

    ctx.save();
    // Subtle ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(groundX, groundY, 3, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.kind === 'heal') {
      ctx.fillStyle = 'rgba(134, 239, 172, 0.4)';
      ctx.beginPath();
      ctx.arc(px, py, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.translate(px, py);
      ctx.rotate(angle);
      const len = p.kind === 'bolt' ? 11 : 9;

      // Motion streak
      ctx.strokeStyle =
        p.kind === 'bolt' ? 'rgba(251, 191, 36, 0.45)' : 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = p.kind === 'bolt' ? 2.0 : 1.2;
      ctx.beginPath();
      ctx.moveTo(-len * 1.4, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();

      // Wooden shaft
      ctx.strokeStyle = p.kind === 'bolt' ? '#fde68a' : '#d6b370';
      ctx.lineWidth = p.kind === 'bolt' ? 1.8 : 1.3;
      ctx.beginPath();
      ctx.moveTo(-len * 0.5, 0);
      ctx.lineTo(len * 0.5, 0);
      ctx.stroke();

      // Steel arrowhead
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(len * 0.5 + 2.5, 0);
      ctx.lineTo(len * 0.5 - 1.5, -1.8);
      ctx.lineTo(len * 0.5 - 1.5, 1.8);
      ctx.closePath();
      ctx.fill();

      // Team fletching
      ctx.fillStyle = p.team === 'player' ? '#60a5fa' : '#f87171';
      ctx.fillRect(-len * 0.5 - 1, -1.4, 2.6, 2.8);
    }
    ctx.restore();
  }
}

function drawOrderRipples(
  ctx: CanvasRenderingContext2D,
  ripples: OrderRipple[],
  nowMs: number,
) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    const age = nowMs - r.bornMs;
    if (age >= r.durationMs) {
      ripples.splice(i, 1);
      continue;
    }
    const t = age / r.durationMs;
    const alpha = 1 - t;
    const { wx, wy } = tileToWorld(r.tileX + 0.5, r.tileY + 0.5);
    const color =
      r.kind === 'attack'
        ? `rgba(248, 113, 113, ${alpha.toFixed(2)})`
        : r.kind === 'build'
          ? `rgba(251, 191, 36, ${alpha.toFixed(2)})`
          : `rgba(74, 222, 128, ${alpha.toFixed(2)})`;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 5 + t * 16, 2.5 + t * 8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Crisp downward chevron bounce
    const bounce = Math.sin(t * Math.PI) * 5;
    ctx.beginPath();
    ctx.moveTo(wx - 4, wy - 8 - bounce);
    ctx.lineTo(wx, wy - 3 - bounce);
    ctx.lineTo(wx + 4, wy - 8 - bounce);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlacementPreview(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  kind: BuildingKind,
  placeTx: number,
  placeTy: number,
  animSec: number,
) {
  const spec = BUILDINGS[kind];
  const size = spec.size;
  const valid = canPlaceBuilding(state, 'player', kind, placeTx, placeTy);
  const top = tileToWorld(placeTx, placeTy);
  const cx = top.wx;
  const cy = top.wy + (TILE_H / 2) * size;

  ctx.save();
  // Range preview ring for defensive keeps & towers!
  if (spec.attackRange > 0) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = valid ? 'rgba(74, 222, 128, 0.55)' : 'rgba(248, 113, 113, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      spec.attackRange * (TILE_W / 2),
      spec.attackRange * (TILE_H / 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  // Per-tile validity highlight diamonds
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const tx = placeTx + dx;
      const ty = placeTy + dy;
      const tPos = tileToWorld(tx, ty);
      traceDiamond(ctx, tPos.wx, tPos.wy, 1, -0.8);
      ctx.fillStyle = valid ? 'rgba(34, 197, 94, 0.34)' : 'rgba(239, 68, 68, 0.42)';
      ctx.fill();
      ctx.strokeStyle = valid ? '#4ade80' : '#f87171';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  // Translucent ghost silhouette of the building
  const ghostBuilding: Building = {
    id: 999999,
    team: 'player',
    kind,
    tileX: placeTx,
    tileY: placeTy,
    size,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    built: true,
    buildProgress: 1,
    queue: [],
    rallyX: placeTx,
    rallyY: placeTy,
    attackTimer: 0,
  };
  drawBuilding(ctx, ghostBuilding, false, false, animSec, valid ? 0.68 : 0.38);

  if (!valid) {
    ctx.strokeStyle = '#fecaca';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 15);
    ctx.lineTo(cx + 7, cy - 1);
    ctx.moveTo(cx + 7, cy - 15);
    ctx.lineTo(cx - 7, cy - 1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGhostBreachBeacon(
  ctx: CanvasRenderingContext2D,
  breach: NonNullable<GameState['ghostBreach']>,
  animSec: number,
) {
  const { wx, wy } = tileToWorld(breach.tileX + 0.5, breach.tileY + 0.5);
  const pulse = 0.5 + 0.5 * Math.sin(animSec * 4.2);

  ctx.save();
  ctx.strokeStyle = `rgba(192, 132, 252, ${(0.45 + 0.4 * pulse).toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(wx, wy, 14 + pulse * 5, 7 + pulse * 2.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Spectral banner standard
  ctx.strokeStyle = '#e9d5ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.lineTo(wx, wy - 24);
  ctx.stroke();

  ctx.fillStyle = 'rgba(139, 92, 246, 0.85)';
  ctx.beginPath();
  ctx.moveTo(wx, wy - 24);
  ctx.lineTo(wx + 12, wy - 20);
  ctx.lineTo(wx, wy - 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFloatingCallouts(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
) {
  if (state.callouts.length === 0) return;
  ctx.save();
  ctx.font = '800 13px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const c of state.callouts) {
    const progress = c.maxTtl > 0 ? 1 - c.ttl / c.maxTtl : 0;
    const alpha = c.ttl < 0.35 ? Math.max(0, c.ttl / 0.35) : 1;
    const { sx, sy } = tileToScreen(c.x, c.y, cam, viewportW, viewportH);
    const drawY = sy - 18 - progress * 24;

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.strokeText(c.text, sx, drawY);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, sx, drawY);
  }
  ctx.restore();
}

function renderDiamondMinimap(
  miniCanvas: HTMLCanvasElement,
  state: GameState,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
  dpr: number,
) {
  const cssW = miniCanvas.clientWidth || 132;
  const cssH = miniCanvas.clientHeight || 84;
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (miniCanvas.width !== targetW || miniCanvas.height !== targetH) {
    miniCanvas.width = targetW;
    miniCanvas.height = targetH;
  }

  const mctx = miniCanvas.getContext('2d');
  if (!mctx) return;

  mctx.save();
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, cssW, cssH);

  // Dark obsidian backing
  mctx.fillStyle = 'rgba(11, 15, 23, 0.92)';
  mctx.fillRect(0, 0, cssW, cssH);

  const mapSize = state.mapSize;
  const biome = BIOMES[state.spec.biome];
  const centerX = cssW * 0.5;
  const padX = 7;
  const padY = 6;
  const halfW = cssW * 0.5 - padX;
  const totalH = cssH - padY * 2;
  const cellHalfW = halfW / mapSize;
  const cellHalfH = (totalH * 0.5) / mapSize;

  const toMini = (tx: number, ty: number) => ({
    mx: centerX + (tx - ty) * cellHalfW,
    my: padY + (tx + ty) * cellHalfH,
  });

  // Outer gilded diamond bevel
  mctx.strokeStyle = 'rgba(217, 169, 78, 0.55)';
  mctx.lineWidth = 1.2;
  mctx.beginPath();
  mctx.moveTo(centerX, padY - 1);
  mctx.lineTo(centerX + halfW + 1, padY + totalH * 0.5);
  mctx.lineTo(centerX, padY + totalH + 1);
  mctx.lineTo(centerX - halfW - 1, padY + totalH * 0.5);
  mctx.closePath();
  mctx.stroke();

  // Terrain + Fog cells
  for (let ty = 0; ty < mapSize; ty++) {
    for (let tx = 0; tx < mapSize; tx++) {
      const idx = ty * mapSize + tx;
      const fog = state.fog[idx];
      const { mx, my } = toMini(tx, ty);

      if (fog === 0) {
        mctx.fillStyle = '#070b12';
      } else {
        const kind = state.tiles[idx].kind;
        let col = biome.grassTop;
        if (kind === 'water') col = '#2563eb';
        else if (kind === 'shallows') col = '#38bdf8';
        else if (kind === 'forest') col = biome.treePrimary;
        else if (kind === 'gold') col = '#facc15';
        else if (kind === 'berry') col = '#fb7185';
        else if (kind === 'cliff') col = biome.cliffTop;
        else if (kind === 'road') col = biome.roadColor;
        mctx.fillStyle = fog === 1 ? veilColor(col, true) : col;
      }

      mctx.beginPath();
      mctx.moveTo(mx, my - 0.35);
      mctx.lineTo(mx + cellHalfW + 0.35, my + cellHalfH);
      mctx.lineTo(mx, my + cellHalfH * 2 + 0.35);
      mctx.lineTo(mx - cellHalfW - 0.35, my + cellHalfH);
      mctx.closePath();
      mctx.fill();
    }
  }

  // Buildings on minimap
  for (const b of state.buildings) {
    if (b.hp <= 0) continue;
    let seen = b.team === 'player';
    if (!seen) {
      for (let dy = 0; dy < b.size && !seen; dy++) {
        for (let dx = 0; dx < b.size; dx++) {
          if (state.fog[(b.tileY + dy) * mapSize + (b.tileX + dx)] > 0) {
            seen = true;
            break;
          }
        }
      }
    }
    if (!seen) continue;
    const { mx, my } = toMini(b.tileX + b.size * 0.5, b.tileY + b.size * 0.5);
    const r = b.size === 2 ? 3.0 : 2.1;
    mctx.fillStyle = b.team === 'player' ? '#60a5fa' : '#f87171';
    mctx.fillRect(mx - r, my - r * 0.8, r * 2, r * 1.6);
  }

  // Units on minimap
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    if (u.team === 'enemy') {
      const tx = Math.max(0, Math.min(mapSize - 1, Math.floor(u.x)));
      const ty = Math.max(0, Math.min(mapSize - 1, Math.floor(u.y)));
      if (state.fog[ty * mapSize + tx] !== 2) continue;
    }
    const { mx, my } = toMini(u.x, u.y);
    mctx.fillStyle = u.team === 'player' ? '#eff6ff' : '#ef4444';
    mctx.fillRect(mx - 1.2, my - 1.2, 2.4, 2.4);
  }

  // Ghost breach marker on minimap
  if (state.ghostBreach) {
    const { mx, my } = toMini(state.ghostBreach.tileX + 0.5, state.ghostBreach.tileY + 0.5);
    mctx.strokeStyle = '#c084fc';
    mctx.lineWidth = 1.3;
    mctx.beginPath();
    mctx.arc(mx, my, 3.2, 0, Math.PI * 2);
    mctx.stroke();
  }

  // White RTS camera viewport frame
  const topInset = Math.min(48, viewportH * 0.1);
  const botInset = Math.min(115, viewportH * 0.18);
  const cTL = screenToTile(0, topInset, cam, viewportW, viewportH);
  const cTR = screenToTile(viewportW, topInset, cam, viewportW, viewportH);
  const cBR = screenToTile(viewportW, viewportH - botInset, cam, viewportW, viewportH);
  const cBL = screenToTile(0, viewportH - botInset, cam, viewportW, viewportH);

  const mTL = toMini(cTL.tileX, cTL.tileY);
  const mTR = toMini(cTR.tileX, cTR.tileY);
  const mBR = toMini(cBR.tileX, cBR.tileY);
  const mBL = toMini(cBL.tileX, cBL.tileY);

  mctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  mctx.lineWidth = 1.1;
  mctx.beginPath();
  mctx.moveTo(mTL.mx, mTL.my);
  mctx.lineTo(mTR.mx, mTR.my);
  mctx.lineTo(mBR.mx, mBR.my);
  mctx.lineTo(mBL.mx, mBL.my);
  mctx.closePath();
  mctx.stroke();

  mctx.restore();
}

export function IsoCanvas({
  stateRef,
  selectedUnitIds,
  selectedBuildingId,
  placementKind,
  onSelectUnits,
  onSelectBuilding,
  onIssueTileOrder,
  onPlaceBuildingAt,
  onCancelPlacement,
}: IsoCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  const viewportRef = useRef({ width: 0, height: 0 });
  const cameraRef = useRef<CameraState | null>(null);
  const cameraInitializedRef = useRef(false);
  const lastSeedRef = useRef<number | null>(null);
  const lastMatchTimeRef = useRef<number>(0);

  // Sync latest props into refs for 60 FPS rAF & pointer handlers without listener churn
  const selectedUnitIdsRef = useRef(selectedUnitIds);
  selectedUnitIdsRef.current = selectedUnitIds;
  const selectedBuildingIdRef = useRef(selectedBuildingId);
  selectedBuildingIdRef.current = selectedBuildingId;
  const placementKindRef = useRef(placementKind);
  placementKindRef.current = placementKind;

  const callbacksRef = useRef({
    onSelectUnits,
    onSelectBuilding,
    onIssueTileOrder,
    onPlaceBuildingAt,
    onCancelPlacement,
  });
  callbacksRef.current = {
    onSelectUnits,
    onSelectBuilding,
    onIssueTileOrder,
    onPlaceBuildingAt,
    onCancelPlacement,
  };

  const hoverTileRef = useRef<{ tileX: number; tileY: number } | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const ripplesRef = useRef<OrderRipple[]>([]);
  const nextRippleIdRef = useRef(1);
  const spacePressedRef = useRef(false);
  const arrowKeysRef = useRef({ up: false, down: false, left: false, right: false });
  const lastTapUnitRef = useRef<{ kind: Unit['kind']; timeMs: number } | null>(null);

  const [ghostBanner, setGhostBanner] = useState<GhostBannerSnapshot | null>(null);
  const ghostBannerKeyRef = useRef<string>('');
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(false);

  const ensureCamera = useCallback((): CameraState => {
    const { width, height } = viewportRef.current;
    const w = width || window.innerWidth || 800;
    const h = height || window.innerHeight || 600;
    if (!cameraRef.current) {
      cameraRef.current = createInitialCamera(w, h, stateRef.current.mapSize);
      cameraInitializedRef.current = true;
    }
    return cameraRef.current;
  }, [stateRef]);

  const spawnRipple = useCallback((tileX: number, tileY: number, kind: OrderRipple['kind']) => {
    ripplesRef.current.push({
      id: nextRippleIdRef.current++,
      tileX,
      tileY,
      kind,
      bornMs: performance.now(),
      durationMs: 560,
    });
  }, []);

  const computeSnappedPlacement = useCallback(
    (rawTileX: number, rawTileY: number, kind: BuildingKind) => {
      const size = BUILDINGS[kind].size;
      const mapSize = stateRef.current.mapSize;
      const offset = size > 1 ? (size - 1) * 0.5 : 0;
      const tx = Math.max(0, Math.min(mapSize - size, Math.floor(rawTileX - offset)));
      const ty = Math.max(0, Math.min(mapSize - size, Math.floor(rawTileY - offset)));
      return { tx, ty };
    },
    [stateRef],
  );

  // Camera HUD buttons (+, -, Home)
  const handleZoomStep = useCallback(
    (factor: number) => {
      const cam = ensureCamera();
      const { width, height } = viewportRef.current;
      const w = width || 800;
      const h = height || 600;
      cameraRef.current = zoomCameraAtPoint(
        cam,
        cam.zoom * factor,
        w * 0.5,
        h * 0.46,
        w,
        h,
        stateRef.current.mapSize,
      );
    },
    [ensureCamera, stateRef],
  );

  const handleResetHome = useCallback(() => {
    const { width, height } = viewportRef.current;
    const w = width || window.innerWidth || 800;
    const h = height || window.innerHeight || 600;
    cameraRef.current = createInitialCamera(w, h, stateRef.current.mapSize);
  }, [stateRef]);

  // ResizeObserver for crisp DPR sizing & responsive framing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      viewportRef.current = { width: w, height: h };
      setIsCompactViewport(w < 540);

      if (!cameraInitializedRef.current || !cameraRef.current) {
        cameraRef.current = createInitialCamera(w, h, stateRef.current.mapSize);
        cameraInitializedRef.current = true;
      } else {
        cameraRef.current = clampCamera(cameraRef.current, w, h, stateRef.current.mapSize);
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [stateRef]);

  // Keyboard shortcuts for smooth arrow-key camera pan & Escape cancel/deselect
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') spacePressedRef.current = true;
      if (e.key === 'ArrowUp') arrowKeysRef.current.up = true;
      if (e.key === 'ArrowDown') arrowKeysRef.current.down = true;
      if (e.key === 'ArrowLeft') arrowKeysRef.current.left = true;
      if (e.key === 'ArrowRight') arrowKeysRef.current.right = true;

      if (e.key === 'Escape') {
        if (placementKindRef.current !== null) {
          callbacksRef.current.onCancelPlacement();
        } else if (
          selectedUnitIdsRef.current.length > 0 ||
          selectedBuildingIdRef.current !== null
        ) {
          callbacksRef.current.onSelectUnits([]);
          callbacksRef.current.onSelectBuilding(null);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spacePressedRef.current = false;
      if (e.key === 'ArrowUp') arrowKeysRef.current.up = false;
      if (e.key === 'ArrowDown') arrowKeysRef.current.down = false;
      if (e.key === 'ArrowLeft') arrowKeysRef.current.left = false;
      if (e.key === 'ArrowRight') arrowKeysRef.current.right = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Desktop + Mobile Unified Pointer & Wheel RTS Input Controller
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const activePointers = new Map<number, { x: number; y: number; pointerType: string }>();
    let pinchLastDist = 0;
    let pinchLastMid = { x: 0, y: 0 };

    let gesture: {
      pointerId: number;
      button: number;
      pointerType: string;
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      dragMode: 'none' | 'pan' | 'box';
      multiTouchInterrupted: boolean;
    } | null = null;

    const localCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        sx: clientX - rect.left,
        sy: clientY - rect.top,
      };
    };

    const hitTestScene = (sx: number, sy: number, pointerType: string) => {
      const state = stateRef.current;
      const cam = ensureCamera();
      const { width, height } = viewportRef.current;
      const w = width || 800;
      const h = height || 600;
      const { tileX, tileY } = screenToTile(sx, sy, cam, w, h);
      const hitRadius = pointerType === 'mouse' ? 21 : 28;

      let hitPlayerUnit: Unit | null = null;
      let bestPlayerDist = hitRadius;
      let hitEnemyUnit: Unit | null = null;
      let bestEnemyDist = hitRadius;

      for (const u of state.units) {
        if (u.hp <= 0) continue;
        if (u.team === 'enemy') {
          const utx = Math.max(0, Math.min(state.mapSize - 1, Math.floor(u.x)));
          const uty = Math.max(0, Math.min(state.mapSize - 1, Math.floor(u.y)));
          if (state.fog[uty * state.mapSize + utx] !== 2) continue;
        }
        const { sx: usx, sy: usy } = tileToScreen(u.x, u.y, cam, w, h);
        const bodyCy = usy - 12 * cam.zoom;
        const d = Math.hypot(sx - usx, sy - bodyCy);
        if (u.team === 'player') {
          if (d <= bestPlayerDist) {
            bestPlayerDist = d;
            hitPlayerUnit = u;
          }
        } else if (d <= bestEnemyDist) {
          bestEnemyDist = d;
          hitEnemyUnit = u;
        }
      }

      let hitBuilding: Building | null = null;
      // Iterate front-to-back (higher depth first) for accurate building roof clicks
      const sortedBuildings = [...state.buildings]
        .filter((b) => b.hp > 0)
        .sort((a, b) => b.tileX + b.tileY + b.size - (a.tileX + a.tileY + a.size));

      for (const b of sortedBuildings) {
        if (b.team === 'enemy') {
          let explored = false;
          for (let dy = 0; dy < b.size && !explored; dy++) {
            for (let dx = 0; dx < b.size; dx++) {
              if (state.fog[(b.tileY + dy) * state.mapSize + (b.tileX + dx)] > 0) {
                explored = true;
                break;
              }
            }
          }
          if (!explored) continue;
        }

        const inFootprint =
          tileX >= b.tileX - 0.12 &&
          tileX <= b.tileX + b.size + 0.12 &&
          tileY >= b.tileY - 0.12 &&
          tileY <= b.tileY + b.size + 0.12;

        const centerScreen = tileToScreen(
          b.tileX + b.size * 0.5,
          b.tileY + b.size * 0.5,
          cam,
          w,
          h,
        );
        const roofH = (b.kind === 'watchtower' ? 42 : b.size === 2 ? 44 : 28) * cam.zoom;
        const halfBoxW = (b.size === 2 ? 44 : 24) * cam.zoom;
        const inRoofSprite =
          Math.abs(sx - centerScreen.sx) <= halfBoxW &&
          sy >= centerScreen.sy - roofH &&
          sy <= centerScreen.sy + 14 * cam.zoom;

        if (inFootprint || inRoofSprite) {
          hitBuilding = b;
          break;
        }
      }

      return { tileX, tileY, hitPlayerUnit, hitEnemyUnit, hitBuilding };
    };

    const issueSmartOrderAt = (rawTileX: number, rawTileY: number, rippleKind?: OrderRipple['kind']) => {
      const state = stateRef.current;
      const tx = Math.max(0, Math.min(state.mapSize - 1, Math.floor(rawTileX)));
      const ty = Math.max(0, Math.min(state.mapSize - 1, Math.floor(rawTileY)));
      callbacksRef.current.onIssueTileOrder(tx, ty);

      let kind: OrderRipple['kind'] = rippleKind ?? 'move';
      if (!rippleKind) {
        const hasEnemy =
          state.units.some(
            (u) =>
              u.team === 'enemy' &&
              u.hp > 0 &&
              state.fog[Math.floor(u.y) * state.mapSize + Math.floor(u.x)] === 2 &&
              Math.hypot(u.x - (tx + 0.5), u.y - (ty + 0.5)) <= 1.25,
          ) ||
          state.buildings.some(
            (b) =>
              b.team === 'enemy' &&
              b.hp > 0 &&
              tx >= b.tileX &&
              tx < b.tileX + b.size &&
              ty >= b.tileY &&
              ty < b.tileY + b.size,
          );
        kind = hasEnemy ? 'attack' : 'move';
      }
      spawnRipple(tx, ty, kind);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { sx, sy } = localCoords(e.clientX, e.clientY);
      const cam = ensureCamera();
      const { width, height } = viewportRef.current;
      const w = width || 800;
      const h = height || 600;
      const factor = Math.exp(-e.deltaY * 0.0014);
      cameraRef.current = zoomCameraAtPoint(
        cam,
        cam.zoom * factor,
        sx,
        sy,
        w,
        h,
        stateRef.current.mapSize,
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      const { sx, sy } = localCoords(e.clientX, e.clientY);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic pointer events without hardware pointerId
      }
      activePointers.set(e.pointerId, { x: sx, y: sy, pointerType: e.pointerType });
      hoverTileRef.current = screenToTile(
        sx,
        sy,
        ensureCamera(),
        viewportRef.current.width || 800,
        viewportRef.current.height || 600,
      );

      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        pinchLastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchLastMid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        if (gesture) gesture.multiTouchInterrupted = true;
        selectionBoxRef.current = null;
        return;
      }

      if (activePointers.size === 1) {
        gesture = {
          pointerId: e.pointerId,
          button: e.button,
          pointerType: e.pointerType,
          startX: sx,
          startY: sy,
          lastX: sx,
          lastY: sy,
          dragMode: e.button === 1 ? 'pan' : 'none',
          multiTouchInterrupted: false,
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const { sx, sy } = localCoords(e.clientX, e.clientY);
      const cam = ensureCamera();
      const { width, height } = viewportRef.current;
      const w = width || 800;
      const h = height || 600;

      hoverTileRef.current = screenToTile(sx, sy, cam, w, h);

      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: sx, y: sy, pointerType: e.pointerType });
      }

      // Two-finger touch pan + pinch zoom
      if (activePointers.size >= 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const mid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };

        let nextCam: CameraState = {
          ...cam,
          wx: cam.wx - (mid.x - pinchLastMid.x) / cam.zoom,
          wy: cam.wy - (mid.y - pinchLastMid.y) / cam.zoom,
        };
        if (pinchLastDist > 12) {
          const ratio = dist / pinchLastDist;
          nextCam = zoomCameraAtPoint(
            nextCam,
            nextCam.zoom * ratio,
            mid.x,
            mid.y,
            w,
            h,
            stateRef.current.mapSize,
          );
        } else {
          nextCam = clampCamera(nextCam, w, h, stateRef.current.mapSize);
        }
        cameraRef.current = nextCam;
        pinchLastDist = dist;
        pinchLastMid = mid;
        return;
      }

      if (!gesture || gesture.pointerId !== e.pointerId || gesture.multiTouchInterrupted) return;

      const totalMove = Math.hypot(sx - gesture.startX, sy - gesture.startY);
      const dragThreshold = gesture.pointerType === 'mouse' ? 7 : 10;

      if (gesture.dragMode === 'none' && totalMove > dragThreshold) {
        if (
          gesture.button === 1 ||
          gesture.button === 2 ||
          spacePressedRef.current ||
          gesture.pointerType !== 'mouse' ||
          placementKindRef.current !== null
        ) {
          gesture.dragMode = 'pan';
        } else if (gesture.button === 0) {
          gesture.dragMode = 'box';
        }
      }

      if (gesture.dragMode === 'pan') {
        const dx = sx - gesture.lastX;
        const dy = sy - gesture.lastY;
        cameraRef.current = clampCamera(
          {
            ...cam,
            wx: cam.wx - dx / cam.zoom,
            wy: cam.wy - dy / cam.zoom,
          },
          w,
          h,
          stateRef.current.mapSize,
        );
      } else if (gesture.dragMode === 'box') {
        selectionBoxRef.current = {
          startX: gesture.startX,
          startY: gesture.startY,
          curX: sx,
          curY: sy,
        };
      }

      gesture.lastX = sx;
      gesture.lastY = sy;
    };

    const finishGesture = (e: PointerEvent, cancelled: boolean) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        pinchLastDist = 0;
      }

      if (!gesture || gesture.pointerId !== e.pointerId) return;
      const g = gesture;
      gesture = null;

      if (cancelled || g.multiTouchInterrupted) {
        selectionBoxRef.current = null;
        return;
      }

      const { sx, sy } = localCoords(e.clientX, e.clientY);
      const cam = ensureCamera();
      const { width, height } = viewportRef.current;
      const w = width || 800;
      const h = height || 600;
      const state = stateRef.current;

      // Finish Desktop Green Selection Box
      if (g.dragMode === 'box') {
        selectionBoxRef.current = null;
        const minX = Math.min(g.startX, sx);
        const maxX = Math.max(g.startX, sx);
        const minY = Math.min(g.startY, sy);
        const maxY = Math.max(g.startY, sy);

        const boxed = state.units.filter((u) => {
          if (u.team !== 'player' || u.hp <= 0) return false;
          const pos = tileToScreen(u.x, u.y, cam, w, h);
          const cy = pos.sy - 12 * cam.zoom;
          return pos.sx >= minX && pos.sx <= maxX && cy >= minY && cy <= maxY;
        });

        // Classic AoE II box priority: prefer military if mixed, else villagers
        const military = boxed.filter((u) => u.kind !== 'villager');
        const chosen = (military.length > 0 ? military : boxed).map((u) => u.id);

        callbacksRef.current.onSelectBuilding(null);
        callbacksRef.current.onSelectUnits(chosen);
        return;
      }

      if (g.dragMode === 'pan') {
        return;
      }

      // Clean Click / Tap!
      const { tileX, tileY, hitPlayerUnit, hitEnemyUnit, hitBuilding } = hitTestScene(
        sx,
        sy,
        g.pointerType,
      );

      // Right-click (Desktop)
      if (g.button === 2) {
        if (placementKindRef.current !== null) {
          callbacksRef.current.onCancelPlacement();
          return;
        }
        if (selectedUnitIdsRef.current.length > 0) {
          if (hitEnemyUnit) {
            issueSmartOrderAt(hitEnemyUnit.x, hitEnemyUnit.y, 'attack');
          } else if (hitBuilding && hitBuilding.team === 'enemy') {
            issueSmartOrderAt(hitBuilding.tileX, hitBuilding.tileY, 'attack');
          } else if (hitBuilding && hitBuilding.team === 'player' && !hitBuilding.built) {
            issueSmartOrderAt(hitBuilding.tileX, hitBuilding.tileY, 'build');
          } else {
            issueSmartOrderAt(tileX, tileY);
          }
        }
        return;
      }

      if (g.button !== 0) return;

      // Building Placement Mode (Left-click / Tap)
      if (placementKindRef.current !== null) {
        const { tx, ty } = computeSnappedPlacement(tileX, tileY, placementKindRef.current);
        if (canPlaceBuilding(state, 'player', placementKindRef.current, tx, ty)) {
          callbacksRef.current.onPlaceBuildingAt(tx, ty);
          spawnRipple(tx, ty, 'build');
        }
        return;
      }

      // 1. Clicked/tapped a Player Unit -> Select (or double-tap to select all of kind!)
      if (hitPlayerUnit) {
        const now = performance.now();
        const prev = lastTapUnitRef.current;
        if (prev && prev.kind === hitPlayerUnit.kind && now - prev.timeMs < 350) {
          const sameKindOnScreen = state.units
            .filter((u) => {
              if (u.team !== 'player' || u.hp <= 0 || u.kind !== hitPlayerUnit.kind) return false;
              const p = tileToScreen(u.x, u.y, cam, w, h);
              return p.sx >= 0 && p.sx <= w && p.sy >= 0 && p.sy <= h;
            })
            .map((u) => u.id);
          callbacksRef.current.onSelectBuilding(null);
          callbacksRef.current.onSelectUnits(
            sameKindOnScreen.length > 0 ? sameKindOnScreen : [hitPlayerUnit.id],
          );
          lastTapUnitRef.current = null;
        } else if (e.shiftKey) {
          const cur = selectedUnitIdsRef.current;
          const next = cur.includes(hitPlayerUnit.id)
            ? cur.filter((id) => id !== hitPlayerUnit.id)
            : [...cur, hitPlayerUnit.id];
          callbacksRef.current.onSelectBuilding(null);
          callbacksRef.current.onSelectUnits(next);
          lastTapUnitRef.current = { kind: hitPlayerUnit.kind, timeMs: now };
        } else {
          callbacksRef.current.onSelectBuilding(null);
          callbacksRef.current.onSelectUnits([hitPlayerUnit.id]);
          lastTapUnitRef.current = { kind: hitPlayerUnit.kind, timeMs: now };
        }
        return;
      }

      // 2. Clicked/tapped an Enemy Unit while player units are selected -> Smart Attack/Convert!
      if (hitEnemyUnit && selectedUnitIdsRef.current.length > 0) {
        issueSmartOrderAt(hitEnemyUnit.x, hitEnemyUnit.y, 'attack');
        return;
      }

      // 3. Clicked/tapped a Building
      if (hitBuilding) {
        if (hitBuilding.team === 'enemy') {
          if (selectedUnitIdsRef.current.length > 0) {
            issueSmartOrderAt(hitBuilding.tileX, hitBuilding.tileY, 'attack');
          }
          return;
        }
        // Unfinished player foundation with selected villager -> help hammer on tap!
        if (!hitBuilding.built && selectedUnitIdsRef.current.length > 0) {
          const hasSelectedVillager = state.units.some(
            (u) =>
              u.team === 'player' &&
              u.hp > 0 &&
              u.kind === 'villager' &&
              selectedUnitIdsRef.current.includes(u.id),
          );
          if (hasSelectedVillager) {
            issueSmartOrderAt(hitBuilding.tileX, hitBuilding.tileY, 'build');
            return;
          }
        }
        callbacksRef.current.onSelectUnits([]);
        callbacksRef.current.onSelectBuilding(hitBuilding.id);
        return;
      }

      // 4. Clicked/tapped Ground or Resource Tile
      const inMap =
        tileX >= 0 && tileX < state.mapSize && tileY >= 0 && tileY < state.mapSize;
      if (inMap && selectedUnitIdsRef.current.length > 0) {
        issueSmartOrderAt(tileX, tileY);
      } else {
        callbacksRef.current.onSelectUnits([]);
        callbacksRef.current.onSelectBuilding(null);
      }
    };

    const onPointerUp = (e: PointerEvent) => finishGesture(e, false);
    const onPointerCancel = (e: PointerEvent) => finishGesture(e, true);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [computeSnappedPlacement, ensureCamera, spawnRipple, stateRef]);

  // Interactive Diamond Minimap pointer panning
  const panCameraFromMinimapEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      const mini = minimapRef.current;
      if (!mini) return;
      const rect = mini.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const cssW = rect.width || 132;
      const cssH = rect.height || 84;
      const padX = 7;
      const padY = 6;
      const halfW = cssW * 0.5 - padX;
      const totalH = cssH - padY * 2;

      const duMinusDv = (mx - cssW * 0.5) / halfW;
      const duPlusDv = (my - padY) / (totalH * 0.5);
      const u = (duPlusDv + duMinusDv) * 0.5;
      const v = (duPlusDv - duMinusDv) * 0.5;

      const mapSize = stateRef.current.mapSize;
      const tileX = Math.max(0, Math.min(mapSize, u * mapSize));
      const tileY = Math.max(0, Math.min(mapSize, v * mapSize));
      const world = tileToWorld(tileX, tileY);

      const cam = ensureCamera();
      const { width, height } = viewportRef.current;
      cameraRef.current = clampCamera(
        { ...cam, wx: world.wx, wy: world.wy },
        width || 800,
        height || 600,
        mapSize,
      );
    },
    [ensureCamera, stateRef],
  );

  // Main 60 FPS High-DPI Canvas Render Loop
  useEffect(() => {
    let rafId = 0;
    let prevNow = performance.now();
    const renderList: RenderableEntity[] = [];

    const renderFrame = (nowMs: number) => {
      const dt = Math.min(0.05, Math.max(0, (nowMs - prevNow) / 1000));
      prevNow = nowMs;
      const animSec = nowMs * 0.001;

      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const state = stateRef.current;
      const { width, height } = viewportRef.current;
      const w = width || canvas.clientWidth || 800;
      const h = height || canvas.clientHeight || 600;
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      const targetPxW = Math.max(1, Math.round(w * dpr));
      const targetPxH = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== targetPxW || canvas.height !== targetPxH) {
        canvas.width = targetPxW;
        canvas.height = targetPxH;
      }

      // Re-frame camera cleanly if a brand new skirmish spec or rematch started
      if (
        lastSeedRef.current !== null &&
        (state.spec.seed !== lastSeedRef.current ||
          (state.timeSec < 0.2 && lastMatchTimeRef.current > 1.5))
      ) {
        cameraRef.current = createInitialCamera(w, h, state.mapSize);
      }
      lastSeedRef.current = state.spec.seed;
      lastMatchTimeRef.current = state.timeSec;

      let cam = ensureCamera();

      // Smooth keyboard arrow-key panning
      const keys = arrowKeysRef.current;
      if (keys.up || keys.down || keys.left || keys.right) {
        const panSpeed = 320 / cam.zoom;
        const vx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        const vy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        cam = clampCamera(
          { ...cam, wx: cam.wx + vx * panSpeed * dt, wy: cam.wy + vy * panSpeed * dt },
          w,
          h,
          state.mapSize,
        );
        cameraRef.current = cam;
      }

      // Sync ghostBreach banner state without unnecessary re-renders
      const gb = state.ghostBreach ?? null;
      const gbKey = gb ? `${gb.username}:${gb.timeSec}:${gb.tileX}:${gb.tileY}` : '';
      if (gbKey !== ghostBannerKeyRef.current) {
        ghostBannerKeyRef.current = gbKey;
        setGhostBanner(gb ? { ...gb } : null);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const biome = BIOMES[state.spec.biome];

      // 1. Atmospheric Sky Backdrop (Screen Space)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = biome.skyBg;
      ctx.fillRect(0, 0, w, h);

      // Subtle warm atmospheric center glow behind the tabletop island
      const bgGrad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        20,
        w * 0.5,
        h * 0.48,
        Math.max(w, h) * 0.68,
      );
      bgGrad.addColorStop(0, 'rgba(251, 191, 36, 0.06)');
      bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Switch to World Isometric Camera Transform!
      const scale = cam.zoom * dpr;
      const transX = (w * 0.5 - cam.wx * cam.zoom) * dpr;
      const transY = (h * 0.5 - cam.wy * cam.zoom) * dpr;
      ctx.setTransform(scale, 0, 0, scale, transX, transY);

      drawWorldSkirt(ctx, state.mapSize, biome);

      // 3. Ground Isometric Tiles + Fog Base
      for (let ty = 0; ty < state.mapSize; ty++) {
        for (let tx = 0; tx < state.mapSize; tx++) {
          const idx = ty * state.mapSize + tx;
          drawGroundTile(
            ctx,
            state.tiles[idx],
            state.fog[idx],
            state.tiles,
            state.mapSize,
            biome,
            animSec,
          );
        }
      }
      drawFogEdgeFeather(ctx, state.fog, state.mapSize);

      // 4. Collect & Depth-Sort 3D Props, Buildings, and Visible Units (tileX + tileY)
      renderList.length = 0;

      for (let ty = 0; ty < state.mapSize; ty++) {
        for (let tx = 0; tx < state.mapSize; tx++) {
          const idx = ty * state.mapSize + tx;
          const fog = state.fog[idx];
          if (fog === 0) continue;
          const tile = state.tiles[idx];
          if (
            tile.kind === 'forest' ||
            tile.kind === 'cliff' ||
            tile.kind === 'gold' ||
            tile.kind === 'berry'
          ) {
            renderList.push({
              kind: 'prop',
              depth: tx + ty + 0.98,
              tile,
              twilight: fog === 1,
            });
          }
        }
      }

      for (const b of state.buildings) {
        if (b.hp <= 0) continue;
        let maxFog: FogState = b.team === 'player' ? 2 : 0;
        if (b.team === 'enemy') {
          for (let dy = 0; dy < b.size; dy++) {
            for (let dx = 0; dx < b.size; dx++) {
              const f = state.fog[(b.tileY + dy) * state.mapSize + (b.tileX + dx)] ?? 0;
              if (f > maxFog) maxFog = f;
            }
          }
        }
        if (maxFog === 0) continue;
        renderList.push({
          kind: 'building',
          depth: b.tileX + b.tileY + b.size,
          building: b,
          twilight: maxFog === 1,
        });
      }

      // Track units currently targeted by Monk conversion
      const convertedTargetIds = new Set<number>();
      for (const u of state.units) {
        if (u.hp > 0 && u.kind === 'monk' && u.convertTargetId !== null) {
          convertedTargetIds.add(u.convertTargetId);
        }
      }

      for (const u of state.units) {
        if (u.hp <= 0) continue;
        if (u.team === 'enemy') {
          const utx = Math.max(0, Math.min(state.mapSize - 1, Math.floor(u.x)));
          const uty = Math.max(0, Math.min(state.mapSize - 1, Math.floor(u.y)));
          if (state.fog[uty * state.mapSize + utx] !== 2) continue;
        }
        renderList.push({
          kind: 'unit',
          depth: u.x + u.y,
          unit: u,
        });
      }

      renderList.sort((a, b) => a.depth - b.depth);

      const selUnitSet = new Set(selectedUnitIdsRef.current);
      const selBldId = selectedBuildingIdRef.current;

      for (let i = 0; i < renderList.length; i++) {
        const item = renderList[i];
        if (item.kind === 'prop') {
          drawTerrainProp(ctx, item.tile, biome, item.twilight, animSec);
        } else if (item.kind === 'building') {
          drawBuilding(
            ctx,
            item.building,
            item.building.id === selBldId,
            item.twilight,
            animSec,
          );
        } else {
          drawUnit(
            ctx,
            item.unit,
            selUnitSet.has(item.unit.id),
            convertedTargetIds.has(item.unit.id),
            animSec,
          );
        }
      }

      // 5. Monk Golden WOLOLO Faith Beams, Projectiles, Order Ripples, Ghost Breach & Placement Ghost
      drawMonkWololoBeams(ctx, state.units, state.fog, state.mapSize, animSec);
      drawProjectiles(ctx, state.projectiles, state.fog, state.mapSize);
      drawOrderRipples(ctx, ripplesRef.current, nowMs);

      if (state.ghostBreach) {
        drawGhostBreachBeacon(ctx, state.ghostBreach, animSec);
      }

      if (placementKindRef.current !== null) {
        const rawHover =
          hoverTileRef.current ?? screenToTile(w * 0.5, h * 0.46, cam, w, h);
        const { tx, ty } = computeSnappedPlacement(
          rawHover.tileX,
          rawHover.tileY,
          placementKindRef.current,
        );
        drawPlacementPreview(ctx, state, placementKindRef.current, tx, ty, animSec);
      }

      // 6. Screen-Space Overlays: Floating Callouts & Green Desktop Selection Box
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFloatingCallouts(ctx, state, cam, w, h);

      const box = selectionBoxRef.current;
      if (box) {
        const bx = Math.min(box.startX, box.curX);
        const by = Math.min(box.startY, box.curY);
        const bw = Math.abs(box.curX - box.startX);
        const bh = Math.abs(box.curY - box.startY);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.16)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(bx, by, bw, bh);
      }

      // 7. Interactive Diamond Minimap Sync
      if (minimapRef.current) {
        renderDiamondMinimap(minimapRef.current, state, cam, w, h, dpr);
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [computeSnappedPlacement, ensureCamera, stateRef]);

  const handleFocusGhostBreach = useCallback(() => {
    if (!ghostBanner) return;
    const cam = ensureCamera();
    const { width, height } = viewportRef.current;
    const target = tileToWorld(ghostBanner.tileX + 0.5, ghostBanner.tileY + 0.5);
    cameraRef.current = clampCamera(
      { ...cam, wx: target.wx, wy: target.wy },
      width || 800,
      height || 600,
      stateRef.current.mapSize,
    );
  }, [ensureCamera, ghostBanner, stateRef]);

  const miniW = isCompactViewport ? 116 : 140;
  const miniH = isCompactViewport ? 74 : 88;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: placementKind ? 'crosshair' : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
        }}
      />

      {/* Rival Ghost Breach Banner */}
      {ghostBanner && (
        <button
          type="button"
          onClick={handleFocusGhostBreach}
          style={{
            position: 'absolute',
            top: 56,
            left: 10,
            zIndex: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: isCompactViewport ? 'calc(100% - 142px)' : 340,
            padding: '5px 10px',
            borderRadius: 8,
            border: '1px solid rgba(192, 132, 252, 0.65)',
            background: 'linear-gradient(180deg, rgba(30, 18, 48, 0.92), rgba(17, 12, 28, 0.92))',
            color: '#f3e8ff',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          title="Click to inspect Rival Ghost breach location"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M9.5 1.5L3.5 9h4l-1 5.5L12.5 7h-4l1-5.5z" fill="#d8b4fe" stroke="#9333ea" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            u/{ghostBanner.username} breached ({formatClock(ghostBanner.timeSec)})
          </span>
        </button>
      )}

      {/* Interactive Diamond Minimap + Camera Controls (top: 54px, right: 10px) */}
      <div
        style={{
          position: 'absolute',
          top: 54,
          right: 10,
          zIndex: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 5,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            padding: 2,
            borderRadius: 8,
            background: 'linear-gradient(180deg, #3b2a18 0%, #1c140c 100%)',
            border: '1.5px solid rgba(217, 169, 78, 0.72)',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.55)',
          }}
        >
          <canvas
            ref={minimapRef}
            onPointerDown={(e) => {
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Ignore synthetic pointer events
              }
              panCameraFromMinimapEvent(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 0) {
                panCameraFromMinimapEvent(e);
              }
            }}
            style={{
              display: 'block',
              width: miniW,
              height: miniH,
              borderRadius: 5,
              cursor: 'pointer',
              touchAction: 'none',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 4,
          }}
        >
          {[
            {
              label: '+',
              title: 'Zoom In',
              onClick: () => handleZoomStep(1.22),
            },
            {
              label: '−',
              title: 'Zoom Out',
              onClick: () => handleZoomStep(1 / 1.22),
            },
            {
              label: '⌂',
              title: 'Center on Base (Home)',
              onClick: handleResetHome,
            },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              title={btn.title}
              aria-label={btn.title}
              onClick={(e) => {
                e.stopPropagation();
                btn.onClick();
              }}
              style={{
                width: isCompactViewport ? 30 : 32,
                height: isCompactViewport ? 26 : 28,
                borderRadius: 6,
                border: '1px solid rgba(217, 169, 78, 0.6)',
                background: 'rgba(22, 18, 13, 0.9)',
                color: '#fef3c7',
                fontSize: 14,
                fontWeight: 800,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.45)',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default IsoCanvas;
