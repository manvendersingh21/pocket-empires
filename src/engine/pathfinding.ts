import type { Building, MapTile } from '../types/rts.js';

export function inBounds(x: number, y: number, mapSize: number): boolean {
  return x >= 0 && y >= 0 && x < mapSize && y < mapSize;
}

export function isTileWalkable(tile: MapTile | undefined): boolean {
  if (!tile) return false;
  return (
    tile.kind === 'grass' ||
    tile.kind === 'shallows' ||
    tile.kind === 'road'
  );
}

export function buildBlockedGrid(
  tiles: MapTile[],
  buildings: Building[],
  mapSize: number,
  ignoreBuildingId?: number,
): Uint8Array {
  const blocked = new Uint8Array(mapSize * mapSize);
  for (let i = 0; i < tiles.length; i++) {
    if (!isTileWalkable(tiles[i])) blocked[i] = 1;
  }
  for (const b of buildings) {
    if (b.hp <= 0 || b.id === ignoreBuildingId || b.kind === 'farm') continue;
    for (let dy = 0; dy < b.size; dy++) {
      for (let dx = 0; dx < b.size; dx++) {
        const tx = b.tileX + dx;
        const ty = b.tileY + dy;
        if (inBounds(tx, ty, mapSize)) {
          blocked[ty * mapSize + tx] = 1;
        }
      }
    }
  }
  return blocked;
}

/** Find the closest unblocked tile to (goalX, goalY), biased toward (fromX, fromY). */
export function nearestWalkableTile(
  blocked: Uint8Array,
  mapSize: number,
  goalX: number,
  goalY: number,
  fromX: number,
  fromY: number,
  footprintSize = 1,
): { x: number; y: number } | null {
  const gx = Math.max(0, Math.min(mapSize - 1, Math.round(goalX)));
  const gy = Math.max(0, Math.min(mapSize - 1, Math.round(goalY)));
  if (footprintSize === 1 && blocked[gy * mapSize + gx] === 0) {
    return { x: gx, y: gy };
  }
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let radius = 1; radius <= 5; radius++) {
    for (let y = gy - radius; y <= gy + footprintSize - 1 + radius; y++) {
      for (let x = gx - radius; x <= gx + footprintSize - 1 + radius; x++) {
        if (!inBounds(x, y, mapSize)) continue;
        if (blocked[y * mapSize + x] !== 0) continue;
        // Distance to the goal footprint
        const cx = Math.max(gx, Math.min(gx + footprintSize - 1, x));
        const cy = Math.max(gy, Math.min(gy + footprintSize - 1, y));
        const dGoal = Math.hypot(x - cx, y - cy);
        if (dGoal > radius + 0.5) continue;
        const dFrom = Math.hypot(x - fromX, y - fromY);
        const score = dGoal * 10 + dFrom;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

const DIRS: ReadonlyArray< readonly [number, number, number] > = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

/**
 * Deterministic A* pathfinder on the 16x16 grid.
 * Returns tile centers [{ x: tx + 0.5, y: ty + 0.5 }, ...] excluding the starting tile.
 */
export function findPath(
  blocked: Uint8Array,
  mapSize: number,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  goalFootprint = 1,
): Array<{ x: number; y: number }> {
  const sx = Math.max(0, Math.min(mapSize - 1, Math.floor(startX)));
  const sy = Math.max(0, Math.min(mapSize - 1, Math.floor(startY)));
  const resolved = nearestWalkableTile(
    blocked,
    mapSize,
    goalX,
    goalY,
    startX,
    startY,
    goalFootprint,
  );
  if (!resolved) return [];
  const tx = resolved.x;
  const ty = resolved.y;
  if (sx === tx && sy === ty) {
    return [{ x: tx + 0.5, y: ty + 0.5 }];
  }

  const total = mapSize * mapSize;
  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int16Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open: number[] = [];

  const startIdx = sy * mapSize + sx;
  const goalIdx = ty * mapSize + tx;
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(tx - sx, ty - sy);
  open.push(startIdx);

  while (open.length > 0) {
    let bestPos = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestPos]]) bestPos = i;
    }
    const current = open[bestPos];
    open.splice(bestPos, 1);

    if (current === goalIdx) {
      const result: Array<{ x: number; y: number }> = [];
      let cur = current;
      while (cur !== startIdx && cur !== -1) {
        const cx = cur % mapSize;
        const cy = Math.floor(cur / mapSize);
        result.push({ x: cx + 0.5, y: cy + 0.5 });
        cur = cameFrom[cur];
      }
      result.reverse();
      return result;
    }

    closed[current] = 1;
    const cx = current % mapSize;
    const cy = Math.floor(current / mapSize);

    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, mapSize)) continue;
      const nIdx = ny * mapSize + nx;
      if (closed[nIdx] || blocked[nIdx]) continue;
      // Prevent diagonal corner-cutting past water/cliffs/buildings
      if (dx !== 0 && dy !== 0) {
        if (blocked[cy * mapSize + nx] || blocked[ny * mapSize + cx]) continue;
      }
      const tentativeG = gScore[current] + cost;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + Math.hypot(tx - nx, ty - ny);
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }

  return [];
}
