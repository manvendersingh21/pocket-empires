import {
  MAP_SIZE,
  type AIPersonaId,
  type BiomeId,
  type CivId,
  type DailyModifierId,
  type MapTile,
  type SkirmishSpec,
  type TileKind,
} from '../types/rts.js';
import { createRng, hashString, pick, puzzleNumberForDate, todayDateKey } from './rng.js';

const CIV_LIST: readonly CivId[] = [
  'britons',
  'franks',
  'byzantines',
  'vikings',
  'teutons',
  'mongols',
];

const BIOME_LIST: readonly BiomeId[] = [
  'sherwood',
  'black_forest',
  'gold_rush',
  'highlands',
  'autumn_steppe',
  'oasis',
];

const MODIFIER_LIST: readonly DailyModifierId[] = [
  'standard',
  'gold_fever',
  'wololo_sabbath',
  'timber_boom',
  'iron_vanguard',
  'fletchers_wind',
];

const PERSONAS: readonly AIPersonaId[] = [
  'longbow_earl',
  'knight_baron',
  'viking_jarl',
  'monk_abbot',
];

const LEADER_NAMES: Record<AIPersonaId, readonly string[]> = {
  longbow_earl: ['Earl Godwin', 'Lady Rowena', 'Sheriff Fitzroy'],
  knight_baron: ['Duke Roland', 'Baron Guiscard', 'Countess Alix'],
  viking_jarl: ['Jarl Haakon', 'Erik Ironhide', 'Freydis Redshield'],
  monk_abbot: ['Brother Theodoric', 'Abbot Balthazar', 'Prior Simeon'],
};

const MAP_PREFIXES: Record<BiomeId, readonly string[]> = {
  sherwood: ['Twin Fords of', 'King’s Crossing at', 'Greenwood Reach of'],
  black_forest: ['Dark Timber of', 'Ironwood Hollow of', 'Whispering Pines of'],
  gold_rush: ['Gilded Basin of', 'Crown Vein of', 'Sunlit Lode of'],
  highlands: ['Stone Crags of', 'Misty Causeway of', 'High Keep of'],
  autumn_steppe: ['Amber Plains of', 'Redleaf Ford of', 'Banner Fields of'],
  oasis: ['Mirage Wells of', 'Palm Crossing of', 'Golden Springs of'],
};

const MAP_SUFFIXES = [
  'Oakvale',
  'Westmarch',
  'Arundel',
  'Falkirk',
  ' Ravenscroft',
  'Dunmore',
  'Valois',
  'antioch',
  'Carcassonne',
  'Lindisfarne',
].map((s) => s.trim().replace(/^a/, 'A'));

const CHOKE_STYLES: readonly SkirmishSpec['chokepointStyle'][] = [
  'twin_fords',
  'central_bridge',
  ' canyon_pass',
  'open_steppe',
];

export const PLAYER_TC_POS = { x: 9, y: 12 } as const;
export const ENEMY_TC_POS = { x: 5, y: 2 } as const;

export function generateDailySpec(dateKey = todayDateKey()): SkirmishSpec {
  const seed = hashString(`pocket-empires:v1:${dateKey}`);
  const rng = createRng(seed);
  const puzzleNumber = puzzleNumberForDate(dateKey);

  const biome = pick(rng, BIOME_LIST);
  const playerCiv = pick(rng, CIV_LIST);
  let enemyCiv = pick(rng, CIV_LIST);
  if (enemyCiv === playerCiv) {
    enemyCiv = CIV_LIST[(CIV_LIST.indexOf(playerCiv) + 1 + Math.floor(rng() * 4)) % CIV_LIST.length];
  }
  const aiPersona = pick(rng, PERSONAS);
  const aiLeaderName = pick(rng, LEADER_NAMES[aiPersona]);
  const modifier = pick(rng, MODIFIER_LIST);
  const chokepointStyle =
    biome === 'autumn_steppe'
      ? 'open_steppe'
      : biome === 'highlands'
        ? ' canyon_pass'
        : pick(rng, CHOKE_STYLES);

  const mapName = `${pick(rng, MAP_PREFIXES[biome])} ${pick(rng, MAP_SUFFIXES)}`;
  const parSec = chokepointStyle === 'open_steppe' ? 125 : 140;

  return {
    seed,
    dateKey,
    puzzleNumber,
    mapName,
    biome,
    playerCiv,
    enemyCiv,
    aiPersona,
    aiLeaderName,
    modifier,
    parSec,
    chokepointStyle,
  };
}

/**
 * Compact URL/comment-safe share code for custom skirmishes:
 * PE-<biomeIdx><pCivIdx><eCivIdx><modIdx><chokeIdx>-<hexSeed>
 */
export function encodeSkirmishCode(spec: SkirmishSpec): string {
  const b = Math.max(0, BIOME_LIST.indexOf(spec.biome));
  const p = Math.max(0, CIV_LIST.indexOf(spec.playerCiv));
  const e = Math.max(0, CIV_LIST.indexOf(spec.enemyCiv));
  const m = Math.max(0, MODIFIER_LIST.indexOf(spec.modifier));
  const c = Math.max(0, CHOKE_STYLES.indexOf(spec.chokepointStyle));
  const a = Math.max(0, PERSONAS.indexOf(spec.aiPersona));
  const hex = (spec.seed >>> 0).toString(16).padStart(8, '0').slice(0, 6).toUpperCase();
  return `PE-${b}${p}${e}${m}${c}${a}-${hex}`;
}

export function decodeSkirmishCode(code: string): SkirmishSpec | null {
  const clean = code.trim().toUpperCase();
  const match = /^PE-([0-5])([0-5])([0-5])([0-5])([0-3])([0-3])-([0-9A-F]{4,8})$/.exec(clean);
  if (!match) return null;
  const [, bS, pS, eS, mS, cS, aS, hex] = match;
  const seed = parseInt(hex, 16) >>> 0;
  const rng = createRng(seed || 42);
  const biome = BIOME_LIST[Number(bS)];
  const playerCiv = CIV_LIST[Number(pS)];
  const enemyCiv = CIV_LIST[Number(eS)];
  const modifier = MODIFIER_LIST[Number(mS)];
  const chokepointStyle = CHOKE_STYLES[Number(cS)];
  const aiPersona = PERSONAS[Number(aS)];
  const aiLeaderName = pick(rng, LEADER_NAMES[aiPersona]);
  const mapName = `${pick(rng, MAP_PREFIXES[biome])} ${pick(rng, MAP_SUFFIXES)}`;

  return {
    seed,
    dateKey: todayDateKey(),
    puzzleNumber: 0,
    mapName,
    biome,
    playerCiv,
    enemyCiv,
    aiPersona,
    aiLeaderName,
    modifier,
    parSec: 135,
    chokepointStyle,
    isCustom: true,
    customPrompt: `Challenge Code ${clean}`,
  };
}

function setTileKind(tiles: MapTile[], x: number, y: number, kind: TileKind, amount = 0) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return;
  const t = tiles[y * MAP_SIZE + x];
  t.kind = kind;
  t.amount = amount;
  t.maxAmount = amount;
}

/** Sets both (x, y) and its 180-degree symmetric twin (15 - x, 15 - y) for guaranteed fairness. */
function setSymmetric(tiles: MapTile[], x: number, y: number, kind: TileKind, amount = 0) {
  setTileKind(tiles, x, y, kind, amount);
  setTileKind(tiles, MAP_SIZE - 1 - x, MAP_SIZE - 1 - y, kind, amount);
}

function isNearSpawn(x: number, y: number): boolean {
  // Keep generous clearings around Player TC (9..10, 12..13) and Enemy TC (5..6, 2..3)
  const dPlayer = Math.max(Math.abs(x - 9.5), Math.abs(y - 12.5));
  const dEnemy = Math.max(Math.abs(x - 5.5), Math.abs(y - 2.5));
  return dPlayer <= 2.6 || dEnemy <= 2.6;
}

/**
 * Builds a symmetric, guaranteed-playable 16x16 battlefield for any SkirmishSpec.
 * - Midline x + y = 15 forms an iconic horizontal river/pass in isometric projection.
 * - Both empires get identical starting Wood groves, Berry bushes, and safe Gold veins,
 *   plus rich contested Gold along the central crossing!
 */
export function buildMapTiles(spec: SkirmishSpec): MapTile[] {
  const rng = createRng(spec.seed ^ 0x9e3779b9);
  const tiles: MapTile[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      tiles.push({
        x,
        y,
        kind: 'grass',
        amount: 0,
        maxAmount: 0,
        variant: Math.floor(rng() * 4),
      });
    }
  }

  // 1. Midline terrain feature along x + y = 14..16 (horizontal across isometric screen!)
  for (let x = 0; x < MAP_SIZE; x++) {
    for (let y = 0; y < MAP_SIZE; y++) {
      const sum = x + y;
      if (sum < 14 || sum > 16) continue;
      if (spec.chokepointStyle === 'open_steppe') {
        // Small scenic central ponds at flanks, wide open cavalry center
        if ((x <= 2 || x >= 13) && sum === 15) {
          setTileKind(tiles, x, y, 'water', 0);
        }
      } else if (spec.chokepointStyle === ' canyon_pass') {
        if (sum === 15) {
          setTileKind(tiles, x, y, 'cliff', 0);
        }
      } else {
        // River along sum === 15 (and slight bend on sum === 14/16 near edges)
        if (sum === 15 || (sum === 14 && x < 2) || (sum === 16 && x > 13)) {
          setTileKind(tiles, x, y, 'water', 0);
        }
      }
    }
  }

  // 2. Carve crossings / shallows / roads across the midline
  if (spec.chokepointStyle === 'central_bridge') {
    for (const c of [7, 8]) {
      setSymmetric(tiles, c, 15 - c, 'shallows', 0);
      setSymmetric(tiles, c, 14 - c, 'road', 0);
    }
  } else if (spec.chokepointStyle === ' canyon_pass') {
    // Twin mountain passes
    for (const c of [4, 5, 10, 11]) {
      setSymmetric(tiles, c, 15 - c, 'road', 0);
      setSymmetric(tiles, c, 14 - c, 'road', 0);
    }
  } else if (spec.chokepointStyle === 'twin_fords') {
    for (const c of [4, 5, 10, 11]) {
      setSymmetric(tiles, c, 15 - c, 'shallows', 0);
    }
  }

  // 3. Random organic forest groves on the player side (mirrored to enemy side)
  const treeDensity = spec.biome === 'black_forest' ? 16 : spec.biome === 'oasis' ? 7 : 11;
  for (let i = 0; i < treeDensity; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = Math.max(0, 16 - x + Math.floor(rng() * 6));
    if (y >= MAP_SIZE) continue;
    if (isNearSpawn(x, y)) continue;
    if (x + y <= 16) continue; // stay off midline crossings
    setSymmetric(tiles, x, y, 'forest', 125);
  }

  // Edge woodland framing for classic AoE atmosphere
  for (let i = 0; i < MAP_SIZE; i++) {
    if ((i === 0 || i === 1 || i === 14 || i === 15) && !isNearSpawn(i, MAP_SIZE - 1)) {
      if (tiles[(MAP_SIZE - 1) * MAP_SIZE + i].kind === 'grass') {
        setSymmetric(tiles, i, MAP_SIZE - 1, 'forest', 125);
      }
    }
  }

  // 4. Guaranteed starting economy ring around Player TC (9..10, 12..13) -> mirrored to Enemy TC (5..6, 2..3)
  // Clear 5x5 courtyard around TCs first so spawns & construction always have room
  for (let dy = -2; dy <= 3; dy++) {
    for (let dx = -2; dx <= 3; dx++) {
      const px = PLAYER_TC_POS.x + dx;
      const py = PLAYER_TC_POS.y + dy;
      if (px >= 0 && py >= 0 && px < MAP_SIZE && py < MAP_SIZE && px + py > 16) {
        setSymmetric(tiles, px, py, 'grass', 0);
      }
    }
  }

  // Starting Lumber Woodline (close left-south of Player TC)
  setSymmetric(tiles, 6, 13, 'forest', 150);
  setSymmetric(tiles, 6, 14, 'forest', 150);
  setSymmetric(tiles, 7, 14, 'forest', 150);
  setSymmetric(tiles, 12, 13, 'forest', 140);
  setSymmetric(tiles, 13, 13, 'forest', 140);

  // Starting Berry Bushes (close east of Player TC for safe Food)
  setSymmetric(tiles, 12, 11, 'berry', 140);
  setSymmetric(tiles, 12, 12, 'berry', 140);
  setSymmetric(tiles, 8, 14, 'berry', 140);

  // Starting Safe Gold Vein (close west-north of Player TC)
  setSymmetric(tiles, 7, 11, 'gold', 180);
  setSymmetric(tiles, 6, 11, 'gold', 180);

  // 5. High-value Contested Central Gold & Relics near the crossings!
  if (spec.biome === 'gold_rush') {
    setSymmetric(tiles, 7, 8, 'shallows', 0);
    setSymmetric(tiles, 8, 8, 'gold', 260);
    setSymmetric(tiles, 6, 9, 'gold', 240);
  } else {
    setSymmetric(tiles, 8, 8, 'gold', 220);
    setSymmetric(tiles, 3, 12, 'gold', 200);
  }

  // Gentle dirt road connecting Player TC courtyard toward central ford
  setSymmetric(tiles, 9, 11, 'road', 0);
  setSymmetric(tiles, 9, 10, 'road', 0);

  return tiles;
}
