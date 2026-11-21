import { MAP_SIZE } from '../types/rts.js';

export const TILE_W = 64;
export const TILE_H = 32;

export const MIN_ZOOM = 0.65;
export const MAX_ZOOM = 1.85;

/**
 * Default initial camera anchor comfortably framing the Player Town Center,
 * starting economy ring, southern riverbank, and central crossing on frame 1.
 */
export const DEFAULT_FOCUS_TILE = {
  tileX: 8.5,
  tileY: 9.8,
} as const;

export interface WorldPoint {
  wx: number;
  wy: number;
}

export interface TilePoint {
  tileX: number;
  tileY: number;
}

export interface ScreenPoint {
  sx: number;
  sy: number;
}

export interface CameraState {
  /** World X placed at horizontal viewport center */
  wx: number;
  /** World Y placed at vertical viewport center */
  wy: number;
  /** Zoom factor in [MIN_ZOOM, MAX_ZOOM] */
  zoom: number;
}

/**
 * Projects continuous isometric tile coordinates (tileX, tileY) to 2D world coordinates.
 * Integer (tx, ty) is the top (north) vertex of tile (tx, ty);
 * (tx + 0.5, ty + 0.5) is the visual center of tile (tx, ty).
 */
export function tileToWorld(tileX: number, tileY: number): WorldPoint {
  return {
    wx: (tileX - tileY) * (TILE_W / 2),
    wy: (tileX + tileY) * (TILE_H / 2),
  };
}

/**
 * Inverse projection from 2D world coordinates back to continuous tile coordinates.
 * Use Math.floor(tileX), Math.floor(tileY) to obtain integer grid cell indices.
 */
export function worldToTile(wx: number, wy: number): TilePoint {
  const halfW = TILE_W / 2;
  const halfH = TILE_H / 2;
  return {
    tileX: (wy / halfH + wx / halfW) * 0.5,
    tileY: (wy / halfH - wx / halfW) * 0.5,
  };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/**
 * Computes an automatic initial zoom tailored to both mobile (e.g. 390x844 -> ~0.86)
 * and desktop (e.g. 1280x800 -> ~1.35) viewports so starting economy + river crossing
 * fill the screen readably without clipping.
 */
export function computeDefaultZoom(viewportW: number, viewportH: number): number {
  const safeW = Math.max(320, viewportW);
  const safeH = Math.max(360, viewportH);
  const fitWidth = safeW / 455;
  const usableHeight = Math.max(300, safeH - 150);
  const fitHeight = usableHeight / 480;
  const raw = Math.min(fitWidth, fitHeight);
  return clampZoom(Math.min(1.55, raw));
}

/**
 * Clamps camera world coordinates to the 16x16 isometric diamond bounds with
 * comfortable HUD padding so any corner tile can be centered cleanly.
 */
export function clampCamera(
  cam: CameraState,
  _viewportW = 800,
  _viewportH = 600,
  mapSize = MAP_SIZE,
): CameraState {
  const zoom = clampZoom(cam.zoom);
  const maxHalfSpanX = mapSize * (TILE_W / 2) + 36;
  const minWy = -36;
  const maxWy = mapSize * TILE_H + 72;

  return {
    wx: Math.max(-maxHalfSpanX, Math.min(maxHalfSpanX, cam.wx)),
    wy: Math.max(minWy, Math.min(maxWy, cam.wy)),
    zoom,
  };
}

/**
 * Creates initial framing centered on (tileX ~ 8.5, tileY ~ 9.8), biased slightly
 * upward on screen so bottom RTS command UI never crowds the player's Town Center.
 */
export function createInitialCamera(
  viewportW: number,
  viewportH: number,
  mapSize = MAP_SIZE,
): CameraState {
  const zoom = computeDefaultZoom(viewportW, viewportH);
  const focus = tileToWorld(DEFAULT_FOCUS_TILE.tileX, DEFAULT_FOCUS_TILE.tileY);
  // Shift camera wy slightly south so the focus point sits ~26px above raw screen midpoint
  const hudBiasWorldY = 26 / zoom;
  return clampCamera(
    {
      wx: focus.wx,
      wy: focus.wy + hudBiasWorldY,
      zoom,
    },
    viewportW,
    viewportH,
    mapSize,
  );
}

export function worldToScreen(
  wx: number,
  wy: number,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
): ScreenPoint {
  return {
    sx: (wx - cam.wx) * cam.zoom + viewportW * 0.5,
    sy: (wy - cam.wy) * cam.zoom + viewportH * 0.5,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
): WorldPoint {
  return {
    wx: (sx - viewportW * 0.5) / cam.zoom + cam.wx,
    wy: (sy - viewportH * 0.5) / cam.zoom + cam.wy,
  };
}

export function tileToScreen(
  tileX: number,
  tileY: number,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
): ScreenPoint {
  const { wx, wy } = tileToWorld(tileX, tileY);
  return worldToScreen(wx, wy, cam, viewportW, viewportH);
}

export function screenToTile(
  sx: number,
  sy: number,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
): TilePoint {
  const { wx, wy } = screenToWorld(sx, sy, cam, viewportW, viewportH);
  return worldToTile(wx, wy);
}

/**
 * Zooms camera smoothly while keeping the world coordinate underneath
 * (pivotSx, pivotSy) anchored in place (ideal for wheel & pinch zoom).
 */
export function zoomCameraAtPoint(
  cam: CameraState,
  nextZoom: number,
  pivotSx: number,
  pivotSy: number,
  viewportW: number,
  viewportH: number,
  mapSize = MAP_SIZE,
): CameraState {
  const z = clampZoom(nextZoom);
  const anchor = screenToWorld(pivotSx, pivotSy, cam, viewportW, viewportH);
  const wx = anchor.wx - (pivotSx - viewportW * 0.5) / z;
  const wy = anchor.wy - (pivotSy - viewportH * 0.5) / z;
  return clampCamera({ wx, wy, zoom: z }, viewportW, viewportH, mapSize);
}
