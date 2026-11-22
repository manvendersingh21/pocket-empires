import {
  BUILDINGS,
  MAP_SIZE,
  TAUNTS,
  UNITS,
  type Building,
  type BuildingKind,
  type CivId,
  type FogState,
  type GameState,
  type PlayerBaseBlueprint,
  type Projectile,
  type ResourceKind,
  type Resources,
  type SavedBuildingPlacement,
  type SkirmishSpec,
  type SoundEventKind,
  type TauntId,
  type Team,
  type TileKind,
  type Unit,
  type UnitKind,
  type WildHorse,
} from '../types/rts.js';
import {
  buildMapTiles,
  ENEMY_TC_POS,
  generateDailySpec,
  PLAYER_TC_POS,
} from './dailyGenerator.js';
import {
  buildBlockedGrid,
  findPath,
  inBounds,
  isTileWalkable,
  nearestWalkableTile,
} from './pathfinding.js';
import { hashString } from './rng.js';

export const POP_HARD_CAP = 22;

const WILD_HORSE_MEADOWS: ReadonlyArray<{
  x: number;
  y: number;
  coat: WildHorse['coat'];
  facing: number;
}> = [
  { x: 5.5, y: 11.5, coat: 'chestnut', facing: 1 },
  { x: 10.5, y: 4.5, coat: 'bay', facing: -1 },
  { x: 12.5, y: 9.5, coat: 'dapple', facing: 1 },
  { x: 3.5, y: 6.5, coat: 'chestnut', facing: -1 },
];

export function tileToResource(kind: TileKind): ResourceKind | null {
  if (kind === 'forest') return 'wood';
  if (kind === 'berry' || kind === 'fish') return 'food';
  if (kind === 'gold') return 'gold';
  return null;
}

export function countTamedHorses(state: GameState, team: Team): number {
  if (!state.horses) return 0;
  let count = 0;
  for (const h of state.horses) {
    if (h.team === team) count++;
  }
  return count;
}

export function getCivForTeam(state: GameState, team: Team) {
  return team === 'player' ? state.spec.playerCiv : state.spec.enemyCiv;
}

export function getEffectiveBuildingCost(
  spec: SkirmishSpec,
  team: Team,
  kind: BuildingKind,
): Resources {
  const base = BUILDINGS[kind].cost;
  const civ = team === 'player' ? spec.playerCiv : spec.enemyCiv;
  let wood = base.wood ?? 0;
  let food = base.food ?? 0;
  let gold = base.gold ?? 0;
  if (civ === 'teutons' && kind === 'watchtower') {
    wood = Math.max(40, wood - 15);
  }
  if (spec.modifier === 'wololo_sabbath' && kind === 'monastery') {
    wood = Math.round(wood * 0.7);
    gold = Math.round(gold * 0.7);
  }
  return { wood, food, gold };
}

export function getEffectiveUnitCost(
  spec: SkirmishSpec,
  _team: Team,
  kind: UnitKind,
): Resources {
  const base = UNITS[kind].cost;
  let wood = base.wood ?? 0;
  let food = base.food ?? 0;
  let gold = base.gold ?? 0;
  if (spec.modifier === 'wololo_sabbath' && kind === 'monk') {
    gold = Math.round(gold * 0.7);
  }
  return { wood, food, gold };
}

export function getEffectiveUnitStats(
  spec: SkirmishSpec,
  team: Team,
  kind: UnitKind,
  tamedHorses = 0,
) {
  const base = UNITS[kind];
  const civ = team === 'player' ? spec.playerCiv : spec.enemyCiv;
  let maxHp = base.maxHp;
  let speed = base.speed;
  let damage = base.damage;
  let range = base.range;
  let attackCooldownSec = base.attackCooldownSec;
  let trainTimeSec = base.trainTimeSec;
  let vision = base.vision;
  let convertSpeedMult = 1.0;

  if (civ === 'britons' && kind === 'archer') {
    range += 1.4;
    attackCooldownSec *= 0.86;
  }
  if (civ === 'franks' && kind === 'knight') {
    maxHp = Math.round(maxHp * 1.28);
    damage += 2;
  }
  if (civ === 'byzantines' && kind === 'monk') {
    maxHp += 25;
    convertSpeedMult = 1.35;
  }
  if (civ === 'vikings' && (kind === 'militia' || kind === 'pikeman')) {
    maxHp = Math.round(maxHp * 1.22);
    speed *= 1.18;
  }
  if (civ === 'mongols' && (kind === 'scout' || kind === 'knight')) {
    speed *= 1.24;
    if (kind === 'scout') vision += 2.0;
  }

  if (tamedHorses > 0 && (kind === 'scout' || kind === 'knight')) {
    speed *= 1 + Math.min(0.15, tamedHorses * 0.05);
  }

  if (spec.modifier === 'iron_vanguard' && (kind === 'militia' || kind === 'pikeman')) {
    trainTimeSec *= 0.65;
  }
  if (spec.modifier === 'fletchers_wind' && kind === 'archer') {
    range += 1.0;
  }

  return {
    maxHp,
    speed,
    damage,
    range,
    attackCooldownSec,
    trainTimeSec,
    vision,
    convertSpeedMult,
  };
}

export function getTeamPop(state: GameState, team: Team): { current: number; cap: number } {
  let current = 0;
  for (const u of state.units) {
    if (u.team === team && u.hp > 0) current++;
  }
  for (const b of state.buildings) {
    if (b.team === team && b.hp > 0) current += b.queue.length;
  }
  let cap = 0;
  for (const b of state.buildings) {
    if (b.team === team && b.hp > 0 && b.built) {
      cap += BUILDINGS[b.kind].popProvided;
    }
  }
  return { current, cap: Math.min(POP_HARD_CAP, Math.max(5, cap)) };
}

export function canAfford(have: Resources, cost: Resources): boolean {
  return have.wood >= cost.wood && have.food >= cost.food && have.gold >= cost.gold;
}

function spendResources(have: Resources, cost: Resources) {
  have.wood -= cost.wood;
  have.food -= cost.food;
  have.gold -= cost.gold;
}

function addCallout(
  state: GameState,
  x: number,
  y: number,
  text: string,
  color = '#fde68a',
  ttl = 1.4,
) {
  state.callouts.push({
    id: state.nextId++,
    x,
    y,
    text,
    color,
    ttl,
    maxTtl: ttl,
  });
}

function emitSound(state: GameState, kind: SoundEventKind) {
  if (state.soundEvents.length < 12 && !state.soundEvents.includes(kind)) {
    state.soundEvents.push(kind);
  }
}

function spawnUnit(
  state: GameState,
  team: Team,
  kind: UnitKind,
  x: number,
  y: number,
): Unit {
  const st = getEffectiveUnitStats(state.spec, team, kind);
  const unit: Unit = {
    id: state.nextId++,
    team,
    kind,
    x,
    y,
    hp: st.maxHp,
    maxHp: st.maxHp,
    order: { type: 'idle' },
    path: [],
    pathCooldown: 0,
    attackTimer: 0,
    harvestTimer: 0,
    carryKind: null,
    carryAmount: 0,
    convertTargetId: null,
    convertProgress: 0,
    monkCooldown: 0,
    facing: team === 'player' ? 1 : -1,
    animPhase: (state.nextId * 0.37) % (Math.PI * 2),
  };
  state.units.push(unit);
  return unit;
}

function spawnBuilding(
  state: GameState,
  team: Team,
  kind: BuildingKind,
  tileX: number,
  tileY: number,
  built: boolean,
): Building {
  const spec = BUILDINGS[kind];
  const rawRallyX = tileX + spec.size / 2;
  const rawRallyY = team === 'player' ? tileY - 0.8 : tileY + spec.size + 0.8;
  const building: Building = {
    id: state.nextId++,
    team,
    kind,
    tileX,
    tileY,
    size: spec.size,
    hp: built ? spec.maxHp : Math.round(spec.maxHp * 0.2),
    maxHp: spec.maxHp,
    built,
    buildProgress: built ? 1 : 0.08,
    queue: [],
    rallyX: Math.max(0.5, Math.min(state.mapSize - 0.5, rawRallyX)),
    rallyY: Math.max(0.5, Math.min(state.mapSize - 0.5, rawRallyY)),
    attackTimer: kind === 'farm' ? 2.5 : 0,
  };
  state.buildings.push(building);
  return building;
}

function spawnSymmetricWildHorses(state: GameState) {
  const blocked = buildBlockedGrid(state.tiles, state.buildings, state.mapSize);
  state.horses = [];
  for (const m of WILD_HORSE_MEADOWS) {
    const mx = Math.floor(m.x);
    const my = Math.floor(m.y);
    const spot =
      inBounds(mx, my, state.mapSize) && blocked[my * state.mapSize + mx] === 0
        ? { x: mx, y: my }
        : nearestWalkableTile(blocked, state.mapSize, mx, my, m.x, m.y, 1);
    const hx = spot ? spot.x + 0.5 : m.x;
    const hy = spot ? spot.y + 0.5 : m.y;
    state.horses.push({
      id: state.nextId++,
      x: hx,
      y: hy,
      team: 'neutral',
      coat: m.coat,
      facing: m.facing,
      animPhase: (state.nextId * 0.53) % (Math.PI * 2),
      wanderTimer: 1.5 + (state.nextId % 3) * 0.8,
      targetX: hx,
      targetY: hy,
    });
  }
}

export function recomputeFog(state: GameState) {
  if (state.mode === 'base_builder') {
    state.fog.fill(2);
    return;
  }
  for (let i = 0; i < state.fog.length; i++) {
    if (state.fog[i] === 2) state.fog[i] = 1;
  }
  const revealCircle = (cx: number, cy: number, radius: number) => {
    const rSq = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(state.mapSize - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(state.mapSize - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= rSq) {
          state.fog[y * state.mapSize + x] = 2;
        }
      }
    }
  };

  for (const b of state.buildings) {
    if (b.team !== 'player' || b.hp <= 0) continue;
    const v = BUILDINGS[b.kind].vision;
    revealCircle(b.tileX + b.size / 2, b.tileY + b.size / 2, b.built ? v : 3.2);
  }
  const playerHorses = countTamedHorses(state, 'player');
  for (const u of state.units) {
    if (u.team !== 'player' || u.hp <= 0) continue;
    const st = getEffectiveUnitStats(state.spec, 'player', u.kind, playerHorses);
    revealCircle(u.x, u.y, st.vision);
  }
  if (state.horses) {
    for (const h of state.horses) {
      if (h.team === 'player') {
        revealCircle(h.x, h.y, 2.8);
      }
    }
  }
}

function createBlankMatchStats(): GameState['stats'] {
  return {
    villagersTrained: 0,
    militaryTrained: 0,
    unitsLost: 0,
    enemyUnitsSlain: 0,
    buildingsBuilt: 0,
    enemyBuildingsRazed: 0,
    wololoConversions: 0,
    woodGathered: 0,
    foodGathered: 0,
    goldGathered: 0,
    tauntsUsed: 0,
    cheekyWololo: false,
    horsesTamed: 0,
    countsByUnit: {},
  };
}

export function createInitialState(spec: SkirmishSpec): GameState {
  const tiles = buildMapTiles(spec);
  const fog = new Array<FogState>(MAP_SIZE * MAP_SIZE).fill(0);
  const goldStart = 65 + (spec.startingGoldBonus ?? 0);

  const state: GameState = {
    spec,
    mode: 'skirmish',
    mapSize: MAP_SIZE,
    tiles,
    fog,
    timeSec: 0,
    tick: 0,
    outcome: 'playing',
    nextId: 1,
    resources: {
      player: { wood: 125, food: 115, gold: goldStart },
      enemy: { wood: 125, food: 115, gold: goldStart },
    },
    buildings: [],
    units: [],
    horses: [],
    projectiles: [],
    callouts: [],
    soundEvents: [],
    stats: createBlankMatchStats(),
    enemyWaveTimer: 55,
    enemyBuildStage: 0,
    lastUnderAttackHornSec: -30,
    recentTauntSec: -30,
    ghostBreach: null,
  };

  // Town Centers
  spawnBuilding(state, 'player', 'town_center', PLAYER_TC_POS.x, PLAYER_TC_POS.y, true);
  spawnBuilding(state, 'enemy', 'town_center', ENEMY_TC_POS.x, ENEMY_TC_POS.y, true);

  // Player starting villagers: 1 on Wood, 1 on Berries, 1 Idle next to Gold for tactile first order!
  const pv1 = spawnUnit(state, 'player', 'villager', 8.5, 13.5);
  pv1.order = { type: 'gather', tileX: 6, tileY: 13, resource: 'wood' };
  const pv2 = spawnUnit(state, 'player', 'villager', 11.5, 12.5);
  pv2.order = { type: 'gather', tileX: 12, tileY: 11, resource: 'food' };
  spawnUnit(state, 'player', 'villager', 8.5, 11.6); // Ready near Gold (7, 11)
  spawnUnit(state, 'player', 'scout', 9.5, 10.6);

  // Enemy starting villagers + scout
  const ev1 = spawnUnit(state, 'enemy', 'villager', 7.5, 2.5);
  ev1.order = { type: 'gather', tileX: 9, tileY: 2, resource: 'wood' };
  const ev2 = spawnUnit(state, 'enemy', 'villager', 4.5, 3.5);
  ev2.order = { type: 'gather', tileX: 3, tileY: 4, resource: 'food' };
  const ev3 = spawnUnit(state, 'enemy', 'villager', 7.5, 4.2);
  ev3.order = { type: 'gather', tileX: 8, tileY: 4, resource: 'gold' };
  spawnUnit(state, 'enemy', 'scout', 6.5, 5.2);

  // Spawn 4 symmetric wild horses grazing in the meadows
  spawnSymmetricWildHorses(state);

  recomputeFog(state);
  return state;
}

function canFitBlueprintFootprint(
  state: GameState,
  tileX: number,
  tileY: number,
  size: number,
  allowClearResource: boolean,
): boolean {
  if (!inBounds(tileX, tileY, state.mapSize)) return false;
  if (!inBounds(tileX + size - 1, tileY + size - 1, state.mapSize)) return false;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const tile = state.tiles[ty * state.mapSize + tx];
      if (!tile) return false;
      const isClearGround = tile.kind === 'grass' || tile.kind === 'road';
      const isClearableResource =
        allowClearResource &&
        (tile.kind === 'forest' || tile.kind === 'berry' || tile.kind === 'gold');
      if (!isClearGround && !isClearableResource) return false;
      for (const b of state.buildings) {
        if (b.hp <= 0) continue;
        if (tx >= b.tileX && tx < b.tileX + b.size && ty >= b.tileY && ty < b.tileY + b.size) {
          return false;
        }
      }
    }
  }
  return true;
}

function placeBlueprintBuilding(
  state: GameState,
  team: Team,
  kind: BuildingKind,
  rawX: number,
  rawY: number,
): Building | null {
  const size = BUILDINGS[kind].size;
  const baseX = Math.max(0, Math.min(state.mapSize - size, Math.round(rawX)));
  const baseY = Math.max(0, Math.min(state.mapSize - size, Math.round(rawY)));

  let chosen: { x: number; y: number } | null = null;
  if (canFitBlueprintFootprint(state, baseX, baseY, size, false)) {
    chosen = { x: baseX, y: baseY };
  } else if (canFitBlueprintFootprint(state, baseX, baseY, size, true)) {
    chosen = { x: baseX, y: baseY };
  } else {
    outer: for (let radius = 1; radius <= 3; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const cx = baseX + dx;
          const cy = baseY + dy;
          if (!inBounds(cx, cy, state.mapSize) || !inBounds(cx + size - 1, cy + size - 1, state.mapSize)) {
            continue;
          }
          if (team === 'enemy' && cx + cy > 15) continue;
          if (team === 'player' && cx + cy < 15) continue;
          if (canFitBlueprintFootprint(state, cx, cy, size, true)) {
            chosen = { x: cx, y: cy };
            break outer;
          }
        }
      }
    }
  }

  if (!chosen) return null;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const t = state.tiles[(chosen.y + dy) * state.mapSize + (chosen.x + dx)];
      if (t && t.kind !== 'road') {
        t.kind = 'grass';
        t.amount = 0;
        t.maxAmount = 0;
      }
    }
  }
  return spawnBuilding(state, team, kind, chosen.x, chosen.y, true);
}

function spawnUnitsAroundKeep(
  state: GameState,
  team: Team,
  unitKinds: readonly UnitKind[],
  keep: Building,
) {
  const blocked = buildBlockedGrid(state.tiles, state.buildings, state.mapSize);
  const frontY = team === 'player' ? keep.tileY - 1 : keep.tileY + keep.size;
  const centerX = keep.tileX + keep.size / 2;

  unitKinds.forEach((kind, idx) => {
    const aliveCount = state.units.filter((u) => u.team === team && u.hp > 0).length;
    if (aliveCount >= POP_HARD_CAP) return;
    const angle = (idx * 2.39996) % (Math.PI * 2);
    const ring = 0.8 + Math.floor(idx / 5) * 0.9;
    const goalX = Math.max(0, Math.min(state.mapSize - 1, Math.round(centerX + Math.cos(angle) * ring)));
    const goalY = Math.max(0, Math.min(state.mapSize - 1, Math.round(frontY + Math.sin(angle) * ring)));
    const tileSpot = nearestWalkableTile(
      blocked,
      state.mapSize,
      goalX,
      goalY,
      centerX,
      frontY + 0.5,
      1,
    );
    const sx = tileSpot
      ? tileSpot.x + 0.32 + ((idx * 0.17) % 0.36)
      : Math.max(0.5, Math.min(state.mapSize - 0.5, centerX));
    const sy = tileSpot
      ? tileSpot.y + 0.32 + (((idx + 2) * 0.19) % 0.36)
      : Math.max(0.5, Math.min(state.mapSize - 0.5, frontY + 0.5));
    spawnUnit(state, team, kind, sx, sy);
  });
}

/**
 * Creates a peaceful Clash-of-Clans / AoE Homestead sandbox (`mode = 'base_builder'`)
 * with full map visibility, generous starting resources, and zero enemy AI.
 */
export function createBaseBuilderState(
  saved?: PlayerBaseBlueprint | null,
  ownerName?: string,
): GameState {
  const daily = generateDailySpec();
  const owner = saved?.owner?.trim() || ownerName?.trim() || 'Commander';
  const civ = saved?.civ ?? daily.playerCiv;
  const biome = saved?.biome ?? 'sherwood';
  const enemyCiv: CivId = civ === 'vikings' ? 'britons' : 'vikings';

  const spec: SkirmishSpec = {
    ...daily,
    seed: hashString(`homestead:v1:${biome}`),
    mapName: saved?.empireName?.trim() || `${owner}'s Homestead`,
    biome,
    playerCiv: civ,
    enemyCiv,
    modifier: 'standard',
    chokepointStyle: 'twin_fords',
    parSec: 150,
    isCustom: true,
    customPrompt: `Homestead Builder (${owner})`,
  };

  const tiles = buildMapTiles(spec);
  const fog = new Array<FogState>(MAP_SIZE * MAP_SIZE).fill(2);

  const state: GameState = {
    spec,
    mode: 'base_builder',
    mapSize: MAP_SIZE,
    tiles,
    fog,
    timeSec: 0,
    tick: 0,
    outcome: 'playing',
    nextId: 1,
    resources: {
      player: { wood: 650, food: 500, gold: 400 },
      enemy: { wood: 0, food: 0, gold: 0 },
    },
    buildings: [],
    units: [],
    horses: [],
    projectiles: [],
    callouts: [],
    soundEvents: [],
    stats: createBlankMatchStats(),
    enemyWaveTimer: 999999,
    enemyBuildStage: 0,
    lastUnderAttackHornSec: -30,
    recentTauntSec: -30,
    ghostBreach: null,
  };

  if (saved && saved.buildings.length > 0) {
    // Place Town Center first if present so fortifications align around it
    const ordered = [...saved.buildings].sort((a, b) =>
      a.kind === 'town_center' ? -1 : b.kind === 'town_center' ? 1 : 0,
    );
    for (const item of ordered) {
      const size = BUILDINGS[item.kind].size;
      let tx = item.tileX;
      let ty = item.tileY;
      // If blueprint coordinates were normalized to the northern raid half, reflect back to player half
      if (tx + ty + (size - 1) <= 14) {
        tx = MAP_SIZE - 1 - tx - (size - 1);
        ty = MAP_SIZE - 1 - ty - (size - 1);
      }
      placeBlueprintBuilding(state, 'player', item.kind, tx, ty);
    }
  }

  let playerTc = state.buildings.find((b) => b.team === 'player' && b.kind === 'town_center');
  if (!playerTc) {
    playerTc =
      placeBlueprintBuilding(state, 'player', 'town_center', PLAYER_TC_POS.x, PLAYER_TC_POS.y) ??
      spawnBuilding(state, 'player', 'town_center', PLAYER_TC_POS.x, PLAYER_TC_POS.y, true);
  }

  // Spawn 3 homestead villagers ready to gather, farm, fish, and construct walls
  spawnUnitsAroundKeep(state, 'player', ['villager', 'villager', 'villager'], playerTc);
  const vills = state.units.filter((u) => u.team === 'player' && u.kind === 'villager');
  if (vills[0]) vills[0].order = { type: 'gather', tileX: 6, tileY: 13, resource: 'wood' };
  if (vills[1]) vills[1].order = { type: 'gather', tileX: 12, tileY: 11, resource: 'food' };

  const garrisonToSpawn: UnitKind[] =
    saved && saved.garrison.length > 0 ? saved.garrison.slice(0, 12) : ['scout'];
  spawnUnitsAroundKeep(state, 'player', garrisonToSpawn, playerTc);

  spawnSymmetricWildHorses(state);
  recomputeFog(state);
  return state;
}

/**
 * Serializes all living `'player'` buildings and up to 12 military garrison units
 * into a shareable `PlayerBaseBlueprint` (normalized to northern raid orientation when raided).
 */
export function exportBaseBlueprint(
  state: GameState,
  owner: string,
  empireName?: string,
): PlayerBaseBlueprint {
  const cleanOwner = owner.trim() || 'Commander';
  const cleanName =
    empireName?.trim() || state.spec.mapName?.trim() || `${cleanOwner}'s Keep`;

  const livingPlayerBuildings = state.buildings.filter(
    (b) => b.team === 'player' && b.hp > 0,
  );
  const buildings: SavedBuildingPlacement[] = livingPlayerBuildings.map((b) => ({
    kind: b.kind,
    tileX: b.tileX,
    tileY: b.tileY,
  }));
  if (!buildings.some((b) => b.kind === 'town_center')) {
    buildings.unshift({
      kind: 'town_center',
      tileX: PLAYER_TC_POS.x,
      tileY: PLAYER_TC_POS.y,
    });
  }

  const garrison: UnitKind[] = state.units
    .filter((u) => u.team === 'player' && u.hp > 0 && u.kind !== 'villager')
    .slice(0, 12)
    .map((u) => u.kind);

  return {
    owner: cleanOwner,
    empireName: cleanName,
    civ: state.spec.playerCiv,
    biome: state.spec.biome,
    buildings,
    garrison,
    defenseWins: 0,
    raidsPlayed: 0,
    trophies: 1000,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Creates a Clash-of-Clans style Player Base Raid (`mode = 'raid'`) against `target`:
 * - Reflects player-half fortress coordinates `(tx, ty)` via 180-deg rotation onto the northern Defender bank.
 * - Spawns `target.garrison` as Red defenders guarding their fortified Keep.
 * - Grants the raiding player a Raider Warchest (`220W, 220F, 160G`) + raiding vanguard!
 */
export function createPlayerRaidState(
  target: PlayerBaseBlueprint,
  playerCiv?: CivId,
): GameState {
  const daily = generateDailySpec();
  const resolvedPlayerCiv: CivId =
    playerCiv ??
    (daily.playerCiv === target.civ
      ? target.civ === 'britons'
        ? 'franks'
        : 'britons'
      : daily.playerCiv);

  const spec: SkirmishSpec = {
    ...daily,
    seed: hashString(`homestead:v1:${target.biome}`),
    mapName: target.empireName || `${target.owner}'s Fortress`,
    biome: target.biome,
    playerCiv: resolvedPlayerCiv,
    enemyCiv: target.civ,
    aiLeaderName: target.owner || 'Defender',
    modifier: 'standard',
    chokepointStyle: 'twin_fords',
    parSec: 135,
    isCustom: true,
    customPrompt: `Raid vs ${target.owner}`,
  };

  const tiles = buildMapTiles(spec);
  const fog = new Array<FogState>(MAP_SIZE * MAP_SIZE).fill(0);

  const state: GameState = {
    spec,
    mode: 'raid',
    raidTargetOwner: target.owner,
    mapSize: MAP_SIZE,
    tiles,
    fog,
    timeSec: 0,
    tick: 0,
    outcome: 'playing',
    nextId: 1,
    resources: {
      player: { wood: 220, food: 220, gold: 160 },
      enemy: { wood: 140, food: 140, gold: 90 },
    },
    buildings: [],
    units: [],
    horses: [],
    projectiles: [],
    callouts: [],
    soundEvents: [],
    stats: createBlankMatchStats(),
    enemyWaveTimer: 72,
    enemyBuildStage: 0,
    lastUnderAttackHornSec: -30,
    recentTauntSec: -30,
    ghostBreach: null,
  };

  // 1. Raiding Player Southern Base + Raider Vanguard
  spawnBuilding(state, 'player', 'town_center', PLAYER_TC_POS.x, PLAYER_TC_POS.y, true);
  const pv1 = spawnUnit(state, 'player', 'villager', 8.5, 13.5);
  pv1.order = { type: 'gather', tileX: 6, tileY: 13, resource: 'wood' };
  const pv2 = spawnUnit(state, 'player', 'villager', 11.5, 12.5);
  pv2.order = { type: 'gather', tileX: 12, tileY: 11, resource: 'food' };
  const pv3 = spawnUnit(state, 'player', 'villager', 8.5, 11.6);
  pv3.order = { type: 'gather', tileX: 7, tileY: 11, resource: 'gold' };

  // Raiding vanguard: 2 Men-at-Arms, 2 Archers, 1 Scout
  spawnUnit(state, 'player', 'militia', 9.2, 10.6);
  spawnUnit(state, 'player', 'militia', 10.2, 10.6);
  spawnUnit(state, 'player', 'archer', 8.7, 11.2);
  spawnUnit(state, 'player', 'archer', 10.7, 11.2);
  spawnUnit(state, 'player', 'scout', 9.7, 9.9);

  // 2. Defender Fortress on Northern Half (180-degree reflection if tx + ty > 15)
  const orderedDefenderBlds = [...target.buildings].sort((a, b) =>
    a.kind === 'town_center' ? -1 : b.kind === 'town_center' ? 1 : 0,
  );
  for (const item of orderedDefenderBlds) {
    const size = BUILDINGS[item.kind].size;
    let bx = item.tileX;
    let by = item.tileY;
    if (bx + by > 15) {
      bx = MAP_SIZE - 1 - bx - (size - 1);
      by = MAP_SIZE - 1 - by - (size - 1);
    }
    placeBlueprintBuilding(state, 'enemy', item.kind, bx, by);
  }

  let enemyTc = state.buildings.find((b) => b.team === 'enemy' && b.kind === 'town_center');
  if (!enemyTc) {
    enemyTc =
      placeBlueprintBuilding(state, 'enemy', 'town_center', ENEMY_TC_POS.x, ENEMY_TC_POS.y) ??
      spawnBuilding(state, 'enemy', 'town_center', ENEMY_TC_POS.x, ENEMY_TC_POS.y, true);
  }

  // Spawn Defender Garrison + 2 base villagers
  const defenderGarrison: UnitKind[] =
    target.garrison.length > 0 ? target.garrison.slice(0, 12) : ['pikeman', 'archer', 'militia'];
  spawnUnitsAroundKeep(state, 'enemy', defenderGarrison, enemyTc);
  spawnUnitsAroundKeep(state, 'enemy', ['villager', 'villager'], enemyTc);

  spawnSymmetricWildHorses(state);
  recomputeFog(state);
  return state;
}

export function canPlaceBuilding(
  state: GameState,
  team: Team,
  kind: BuildingKind,
  tileX: number,
  tileY: number,
): boolean {
  const size = BUILDINGS[kind].size;
  if (!inBounds(tileX, tileY, state.mapSize)) return false;
  if (!inBounds(tileX + size - 1, tileY + size - 1, state.mapSize)) return false;

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const idx = ty * state.mapSize + tx;
      const tile = state.tiles[idx];
      if (tile.kind !== 'grass' && tile.kind !== 'road') return false;
      if (team === 'player' && state.fog[idx] === 0) return false;
      for (const b of state.buildings) {
        if (b.hp <= 0) continue;
        if (tx >= b.tileX && tx < b.tileX + b.size && ty >= b.tileY && ty < b.tileY + b.size) {
          return false;
        }
      }
    }
  }
  return true;
}

export function cmdPlaceBuilding(
  state: GameState,
  team: Team,
  kind: BuildingKind,
  tileX: number,
  tileY: number,
  preferredUnitIds?: number[],
): Building | null {
  if (state.outcome !== 'playing') return null;
  if (!canPlaceBuilding(state, team, kind, tileX, tileY)) return null;
  const cost = getEffectiveBuildingCost(state.spec, team, kind);
  if (!canAfford(state.resources[team], cost)) return null;

  spendResources(state.resources[team], cost);
  const b = spawnBuilding(state, team, kind, tileX, tileY, false);

  // Dispatch nearest villager (or selected villagers) to hammer the site
  const candidates = state.units.filter(
    (u) =>
      u.team === team &&
      u.hp > 0 &&
      u.kind === 'villager' &&
      (!preferredUnitIds?.length || preferredUnitIds.includes(u.id)),
  );
  const pool =
    candidates.length > 0
      ? candidates
      : state.units.filter((u) => u.team === team && u.hp > 0 && u.kind === 'villager');

  if (pool.length > 0) {
    // Prefer an idle villager first, else closest villager
    pool.sort((a, bUnit) => {
      const aIdle = a.order.type === 'idle' ? 0 : 1;
      const bIdle = bUnit.order.type === 'idle' ? 0 : 1;
      if (aIdle !== bIdle) return aIdle - bIdle;
      const da = Math.hypot(a.x - (tileX + 0.5), a.y - (tileY + 0.5));
      const db = Math.hypot(bUnit.x - (tileX + 0.5), bUnit.y - (tileY + 0.5));
      return da - db;
    });
    const chosen = preferredUnitIds?.length ? pool.slice(0, 2) : pool.slice(0, 1);
    for (const v of chosen) {
      v.order = { type: 'build', buildingId: b.id };
      v.path = [];
    }
  }

  if (team === 'player') {
    emitSound(state, 'build_place');
    recomputeFog(state);
  }
  return b;
}

export function cmdTrainUnit(
  state: GameState,
  team: Team,
  kind: UnitKind,
  preferredBuildingId?: number,
): boolean {
  if (state.outcome !== 'playing') return false;
  const requiredBuilding = UNITS[kind].trainedAt;
  const producers = state.buildings.filter(
    (b) => b.team === team && b.hp > 0 && b.built && b.kind === requiredBuilding && b.queue.length < 5,
  );
  if (producers.length === 0) return false;

  const pop = getTeamPop(state, team);
  if (pop.current >= pop.cap) return false;

  const cost = getEffectiveUnitCost(state.spec, team, kind);
  if (!canAfford(state.resources[team], cost)) return false;

  producers.sort((a, b) => {
    if (a.id === preferredBuildingId) return -1;
    if (b.id === preferredBuildingId) return 1;
    return a.queue.length - b.queue.length;
  });

  const producer = producers[0];
  spendResources(state.resources[team], cost);
  const st = getEffectiveUnitStats(state.spec, team, kind);
  producer.queue.push({
    unit: kind,
    remainingSec: st.trainTimeSec,
    totalSec: st.trainTimeSec,
  });
  return true;
}

export function cmdIssueOrder(
  state: GameState,
  team: Team,
  unitIds: number[],
  tileX: number,
  tileY: number,
): 'gather' | 'build' | 'attack' | 'convert' | 'move' | null {
  if (state.outcome !== 'playing' || unitIds.length === 0) return null;
  const selected = state.units.filter((u) => u.team === team && u.hp > 0 && unitIds.includes(u.id));
  if (selected.length === 0) return null;

  const tx = Math.max(0, Math.min(state.mapSize - 1, Math.floor(tileX)));
  const ty = Math.max(0, Math.min(state.mapSize - 1, Math.floor(tileY)));
  const clickX = tx + 0.5;
  const clickY = ty + 0.5;

  // 1. Check enemy unit near target tile
  const enemyUnits = state.units
    .filter((u) => u.team !== team && u.hp > 0 && Math.hypot(u.x - clickX, u.y - clickY) <= 1.25)
    .sort((a, b) => Math.hypot(a.x - clickX, a.y - clickY) - Math.hypot(b.x - clickX, b.y - clickY));

  if (enemyUnits.length > 0) {
    const target = enemyUnits[0];
    let anyConvert = false;
    for (const u of selected) {
      u.path = [];
      if (u.kind === 'monk') {
        u.order = { type: 'convert', targetId: target.id };
        anyConvert = true;
      } else {
        u.order = { type: 'attack_unit', targetId: target.id };
      }
    }
    if (team === 'player') emitSound(state, anyConvert ? 'wololo' : 'order_attack');
    return anyConvert ? 'convert' : 'attack';
  }

  // 2. Check building on target tile
  const clickedBuilding = state.buildings.find(
    (b) =>
      b.hp > 0 &&
      tx >= b.tileX &&
      tx < b.tileX + b.size &&
      ty >= b.tileY &&
      ty < b.tileY + b.size,
  );
  if (clickedBuilding) {
    if (clickedBuilding.team !== team) {
      for (const u of selected) {
        u.path = [];
        u.order = { type: 'attack_building', buildingId: clickedBuilding.id };
      }
      if (team === 'player') emitSound(state, 'order_attack');
      return 'attack';
    } else if (!clickedBuilding.built) {
      let assigned = false;
      for (const u of selected) {
        if (u.kind === 'villager') {
          u.path = [];
          u.order = { type: 'build', buildingId: clickedBuilding.id };
          assigned = true;
        }
      }
      if (assigned) {
        if (team === 'player') emitSound(state, 'order_move');
        return 'build';
      }
    }
  }

  // 3. Check resource tile for villagers
  const tile = state.tiles[ty * state.mapSize + tx];
  const resKind = tile ? tileToResource(tile.kind) : null;
  if (resKind && tile.amount > 0) {
    let anyVillager = false;
    for (const u of selected) {
      u.path = [];
      if (u.kind === 'villager') {
        u.order = { type: 'gather', tileX: tx, tileY: ty, resource: resKind };
        anyVillager = true;
      } else {
        u.order = { type: 'move', tx: clickX, ty: clickY, attackMove: true };
      }
    }
    if (anyVillager) {
      if (team === 'player') emitSound(state, 'order_move');
      return 'gather';
    }
  }

  // 4. Standard move / attack-move with gentle formation spread
  selected.forEach((u, idx) => {
    const spreadAngle = (idx * 2.39996) % (Math.PI * 2);
    const radius = idx === 0 ? 0 : Math.min(1.1, 0.35 * Math.ceil(idx / 4));
    const gx = Math.max(0.5, Math.min(state.mapSize - 0.5, clickX + Math.cos(spreadAngle) * radius));
    const gy = Math.max(0.5, Math.min(state.mapSize - 0.5, clickY + Math.sin(spreadAngle) * radius));
    u.path = [];
    u.order = {
      type: 'move',
      tx: gx,
      ty: gy,
      attackMove: u.kind !== 'villager' && u.kind !== 'monk',
    };
  });
  if (team === 'player') emitSound(state, 'order_move');
  return 'move';
}

export function cmdAttackEnemyKeep(state: GameState, team: Team): number {
  const enemyTc = state.buildings.find((b) => b.team !== team && b.kind === 'town_center' && b.hp > 0);
  const army = state.units.filter((u) => u.team === team && u.hp > 0 && u.kind !== 'villager');
  if (!enemyTc || army.length === 0) return 0;
  for (const u of army) {
    u.path = [];
    if (u.kind === 'monk') {
      u.order = {
        type: 'move',
        tx: enemyTc.tileX + 1,
        ty: enemyTc.tileY + (team === 'player' ? 2.8 : -0.8),
        attackMove: false,
      };
    } else {
      u.order = {
        type: 'move',
        tx: enemyTc.tileX + 1,
        ty: enemyTc.tileY + 1,
        attackMove: true,
      };
    }
  }
  if (team === 'player') emitSound(state, 'order_attack');
  return army.length;
}

export function cmdTriggerTaunt(state: GameState, tauntId: TauntId) {
  const taunt = TAUNTS.find((t) => t.id === tauntId);
  if (!taunt) return;
  const tc = state.buildings.find((b) => b.team === 'player' && b.kind === 'town_center');
  const cx = tc ? tc.tileX + 1 : 9.5;
  const cy = tc ? tc.tileY + 0.5 : 12;
  addCallout(state, cx, cy, `[Taunt] ${taunt.quote}`, '#f59e0b', 2.2);
  state.stats.tauntsUsed++;
  if (tauntId === '30') state.recentTauntSec = state.timeSec;
}

function findNearestDropoff(state: GameState, team: Team, x: number, y: number): Building | null {
  let best: Building | null = null;
  let bestDist = Infinity;
  for (const b of state.buildings) {
    if (b.team !== team || b.hp <= 0 || !b.built) continue;
    if (b.kind !== 'town_center' && b.kind !== 'homestead') continue;
    const cx = b.tileX + b.size / 2;
    const cy = b.tileY + b.size / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

function findNearestResourceTile(
  state: GameState,
  resource: ResourceKind,
  fromX: number,
  fromY: number,
  maxDist = 9,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = maxDist;
  for (const t of state.tiles) {
    if (t.amount <= 0) continue;
    if (tileToResource(t.kind) !== resource) continue;
    const d = Math.hypot(t.x + 0.5 - fromX, t.y + 0.5 - fromY);
    if (d < bestDist) {
      bestDist = d;
      best = { x: t.x, y: t.y };
    }
  }
  return best;
}

function moveUnitToward(
  state: GameState,
  blocked: Uint8Array,
  unit: Unit,
  goalX: number,
  goalY: number,
  dt: number,
  goalFootprint = 1,
) {
  const st = getEffectiveUnitStats(
    state.spec,
    unit.team,
    unit.kind,
    countTamedHorses(state, unit.team),
  );
  unit.pathCooldown = Math.max(0, unit.pathCooldown - dt);

  if (unit.path.length === 0 && unit.pathCooldown <= 0) {
    unit.path = findPath(blocked, state.mapSize, unit.x, unit.y, goalX, goalY, goalFootprint);
    unit.pathCooldown = 0.55;
  }

  const next = unit.path[0] ?? { x: goalX, y: goalY };
  const dx = next.x - unit.x;
  const dy = next.y - unit.y;
  const dist = Math.hypot(dx, dy);
  if (Math.abs(dx - dy) > 0.02) {
    // Isometric horizontal direction corresponds to (dx - dy)
    unit.facing = dx - dy >= 0 ? 1 : -1;
  }
  if (dist <= 0.16) {
    if (unit.path.length > 0) unit.path.shift();
    return;
  }
  const step = Math.min(dist, st.speed * dt);
  const nx = Math.max(0.15, Math.min(state.mapSize - 0.15, unit.x + (dx / dist) * step));
  const ny = Math.max(0.15, Math.min(state.mapSize - 0.15, unit.y + (dy / dist) * step));
  const curTx = Math.floor(unit.x);
  const curTy = Math.floor(unit.y);
  const curBlocked =
    inBounds(curTx, curTy, state.mapSize) && blocked[curTy * state.mapSize + curTx] !== 0;
  const ntx = Math.floor(nx);
  const nty = Math.floor(ny);
  if (
    inBounds(ntx, nty, state.mapSize) &&
    (blocked[nty * state.mapSize + ntx] === 0 || (curBlocked && ntx === curTx && nty === curTy))
  ) {
    unit.x = nx;
    unit.y = ny;
    unit.animPhase += dt * st.speed * 4.2;
  } else {
    unit.path = [];
  }
}

function distanceToBuilding(x: number, y: number, b: Building): number {
  const cx = Math.max(b.tileX, Math.min(b.tileX + b.size, x));
  const cy = Math.max(b.tileY, Math.min(b.tileY + b.size, y));
  return Math.hypot(x - cx, y - cy);
}

function computeUnitVsUnitDamage(state: GameState, attacker: Unit, target: Unit): number {
  const st = getEffectiveUnitStats(state.spec, attacker.team, attacker.kind);
  const spec = UNITS[attacker.kind];
  let dmg = st.damage;
  if (spec.bonusVs === 'cavalry' && (target.kind === 'knight' || target.kind === 'scout')) {
    dmg *= spec.bonusMultiplier ?? 1;
  }
  if (spec.bonusVs === 'infantry' && (target.kind === 'militia' || target.kind === 'pikeman')) {
    dmg *= spec.bonusMultiplier ?? 1;
  }
  return Math.round(dmg);
}

function computeUnitVsBuildingDamage(state: GameState, attacker: Unit): number {
  const st = getEffectiveUnitStats(state.spec, attacker.team, attacker.kind);
  const spec = UNITS[attacker.kind];
  let dmg = st.damage;
  if (spec.bonusVs === 'building') {
    dmg *= spec.bonusMultiplier ?? 1;
    if (state.spec.modifier === 'iron_vanguard') dmg *= 1.15;
  }
  if (attacker.kind === 'archer') {
    dmg = Math.max(3, Math.round(dmg * 0.55));
  }
  return Math.round(dmg);
}

function findNearestEnemyUnit(state: GameState, unit: Unit, maxRange: number): Unit | null {
  let best: Unit | null = null;
  let bestDist = maxRange;
  for (const other of state.units) {
    if (other.team === unit.team || other.hp <= 0) continue;
    const d = Math.hypot(other.x - unit.x, other.y - unit.y);
    if (d <= bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function findNearestEnemyBuilding(state: GameState, unit: Unit, maxRange: number): Building | null {
  let best: Building | null = null;
  let bestDist = maxRange;
  for (const b of state.buildings) {
    if (b.team === unit.team || b.hp <= 0) continue;
    const d = distanceToBuilding(unit.x, unit.y, b);
    if (d <= bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

function applyUnitHit(state: GameState, target: Unit, dmg: number) {
  target.hp -= dmg;
  if (
    target.team === 'player' &&
    state.timeSec - state.lastUnderAttackHornSec > 22 &&
    target.hp > 0
  ) {
    state.lastUnderAttackHornSec = state.timeSec;
    emitSound(state, 'war_horn');
  }
  if (target.hp <= 0) {
    target.hp = 0;
    if (target.team === 'player') state.stats.unitsLost++;
    else state.stats.enemyUnitsSlain++;
  }
}

function applyBuildingHit(state: GameState, building: Building, dmg: number) {
  building.hp -= dmg;
  if (
    building.team === 'player' &&
    state.timeSec - state.lastUnderAttackHornSec > 18 &&
    building.hp > 0
  ) {
    state.lastUnderAttackHornSec = state.timeSec;
    emitSound(state, 'war_horn');
  }
  if (building.hp <= 0) {
    building.hp = 0;
    if (building.team === 'enemy') {
      state.stats.enemyBuildingsRazed++;
      addCallout(
        state,
        building.tileX + building.size / 2,
        building.tileY + building.size / 2,
        building.kind === 'town_center' ? 'KEEP RAZED!' : 'RAZED!',
        '#f59e0b',
        2.0,
      );
    }
    if (building.kind === 'town_center') {
      state.outcome = building.team === 'enemy' ? 'victory' : 'defeat';
      emitSound(state, state.outcome === 'victory' ? 'victory' : 'defeat');
    }
  }
}

function performUnitAttackOnUnit(state: GameState, unit: Unit, target: Unit) {
  const st = getEffectiveUnitStats(state.spec, unit.team, unit.kind);
  const dmg = computeUnitVsUnitDamage(state, unit, target);
  unit.attackTimer = st.attackCooldownSec;
  unit.facing = target.x - unit.x - (target.y - unit.y) >= 0 ? 1 : -1;

  if (st.range > 1.5) {
    const proj: Projectile = {
      id: state.nextId++,
      team: unit.team,
      kind: 'arrow',
      fromX: unit.x,
      fromY: unit.y,
      toX: target.x,
      toY: target.y,
      progress: 0,
      speed: 8.5,
      damage: dmg,
      targetUnitId: target.id,
    };
    state.projectiles.push(proj);
    if (unit.team === 'player') emitSound(state, 'bow_shoot');
  } else {
    applyUnitHit(state, target, dmg);
    if (unit.team === 'player') emitSound(state, 'sword_hit');
  }
}

function performUnitAttackOnBuilding(state: GameState, unit: Unit, building: Building) {
  const st = getEffectiveUnitStats(state.spec, unit.team, unit.kind);
  const dmg = computeUnitVsBuildingDamage(state, unit);
  unit.attackTimer = st.attackCooldownSec;
  const bx = building.tileX + building.size / 2;
  const by = building.tileY + building.size / 2;
  unit.facing = bx - unit.x - (by - unit.y) >= 0 ? 1 : -1;

  if (st.range > 1.5) {
    state.projectiles.push({
      id: state.nextId++,
      team: unit.team,
      kind: 'arrow',
      fromX: unit.x,
      fromY: unit.y,
      toX: bx,
      toY: by,
      progress: 0,
      speed: 8.5,
      damage: dmg,
      targetBuildingId: building.id,
    });
    if (unit.team === 'player') emitSound(state, 'bow_shoot');
  } else {
    applyBuildingHit(state, building, dmg);
    if (unit.team === 'player') emitSound(state, 'sword_hit');
  }
}

function stepEnemyAI(state: GameState) {
  const res = state.resources.enemy;
  const enemyBuildings = state.buildings.filter((b) => b.team === 'enemy' && b.hp > 0);
  const enemyUnits = state.units.filter((u) => u.team === 'enemy' && u.hp > 0);
  const tc = enemyBuildings.find((b) => b.kind === 'town_center');
  if (!tc) return;

  const villagers = enemyUnits.filter((u) => u.kind === 'villager');
  const military = enemyUnits.filter((u) => u.kind !== 'villager');

  // 1. Keep up to 5 villagers working wood/food/gold
  if (villagers.length < 5 && tc.queue.length === 0) {
    cmdTrainUnit(state, 'enemy', 'villager', tc.id);
  }
  villagers.forEach((v, idx) => {
    if (v.order.type !== 'idle') return;
    const desired: ResourceKind = idx % 3 === 0 ? 'wood' : idx % 3 === 1 ? 'food' : 'gold';
    const tile = findNearestResourceTile(state, desired, tc.tileX + 1, tc.tileY + 1, 10);
    if (tile) {
      v.order = { type: 'gather', tileX: tile.x, tileY: tile.y, resource: desired };
    }
  });

  // 2. Construct base tech buildings around Enemy TC (5..6, 2..3)
  const hasKind = (k: BuildingKind) => enemyBuildings.some((b) => b.kind === k);
  const tryPlaceAround = (kind: BuildingKind, spots: ReadonlyArray<readonly [number, number]>) => {
    for (const [sx, sy] of spots) {
      if (canPlaceBuilding(state, 'enemy', kind, sx, sy)) {
        return cmdPlaceBuilding(state, 'enemy', kind, sx, sy);
      }
    }
    return null;
  };

  if (!hasKind('homestead') && state.timeSec >= 16) {
    tryPlaceAround('homestead', [
      [8, 2],
      [3, 2],
      [8, 3],
    ]);
  }

  const persona = state.spec.aiPersona;
  const primaryBld: BuildingKind =
    persona === 'longbow_earl'
      ? 'archery_range'
      : persona === 'knight_baron'
        ? 'stable'
        : 'barracks';

  if (!hasKind(primaryBld) && state.timeSec >= 24) {
    tryPlaceAround(primaryBld, [
      [4, 5],
      [7, 5],
      [3, 5],
      [8, 5],
    ]);
  }
  if (persona === 'monk_abbot' && !hasKind('monastery') && state.timeSec >= 48) {
    tryPlaceAround('monastery', [
      [7, 5],
      [4, 5],
      [6, 5],
    ]);
  } else if (!hasKind('barracks') && state.timeSec >= 52) {
    tryPlaceAround('barracks', [
      [7, 5],
      [4, 5],
      [8, 5],
    ]);
  }

  if (!hasKind('watchtower') && state.timeSec >= 65 && res.wood >= 80) {
    tryPlaceAround('watchtower', [
      [6, 6],
      [5, 6],
      [7, 6],
    ]);
  }

  // 3. Train persona units smoothly (capped so matches stay crisp 2-4 min puzzles)
  if (military.length < 9) {
    if (persona === 'longbow_earl') {
      cmdTrainUnit(state, 'enemy', 'archer') || cmdTrainUnit(state, 'enemy', 'pikeman');
    } else if (persona === 'knight_baron') {
      cmdTrainUnit(state, 'enemy', 'knight') || cmdTrainUnit(state, 'enemy', 'militia');
    } else if (persona === 'monk_abbot') {
      const hasMonk = military.some((u) => u.kind === 'monk');
      if (!hasMonk) cmdTrainUnit(state, 'enemy', 'monk');
      cmdTrainUnit(state, 'enemy', 'militia') || cmdTrainUnit(state, 'enemy', 'pikeman');
    } else {
      cmdTrainUnit(state, 'enemy', 'militia') || cmdTrainUnit(state, 'enemy', 'pikeman');
    }
  }

  // 4. Defend Enemy TC if player units step close, else send periodic skirmish raids
  const threatNearTc = state.units.find(
    (u) => u.team === 'player' && u.hp > 0 && Math.hypot(u.x - (tc.tileX + 1), u.y - (tc.tileY + 1)) <= 6.2,
  );
  if (threatNearTc) {
    for (const m of military) {
      if (m.order.type === 'idle') {
        m.order =
          m.kind === 'monk'
            ? { type: 'convert', targetId: threatNearTc.id }
            : { type: 'attack_unit', targetId: threatNearTc.id };
      }
    }
    return;
  }

  if (state.enemyWaveTimer <= 0 && military.length >= 3) {
    state.enemyWaveTimer = 44;
    const raiders = military.slice(0, Math.min(4, military.length));
    for (const r of raiders) {
      r.path = [];
      r.order = {
        type: 'move',
        tx: PLAYER_TC_POS.x + 1,
        ty: PLAYER_TC_POS.y + 0.5,
        attackMove: r.kind !== 'monk',
      };
    }
  }
}

function stepWildHorses(state: GameState, blocked: Uint8Array, dt: number) {
  if (!state.horses || state.horses.length === 0) return;

  for (const horse of state.horses) {
    // Traditional AoE herding/taming when any unit steps within 1.5 tiles
    if (horse.team === 'neutral') {
      let tamer: Unit | null = null;
      let bestDist = 1.5;
      for (const u of state.units) {
        if (u.hp <= 0) continue;
        const d = Math.hypot(u.x - horse.x, u.y - horse.y);
        if (d <= bestDist) {
          bestDist = d;
          tamer = u;
        }
      }
      if (tamer) {
        horse.team = tamer.team;
        horse.wanderTimer = 0;
        state.resources[tamer.team].food += 35;
        if (tamer.team === 'player') {
          state.stats.horsesTamed = (state.stats.horsesTamed ?? 0) + 1;
          state.stats.foodGathered += 35;
          addCallout(state, horse.x, horse.y - 0.3, 'Horse Tamed! +35 Food', '#fde68a', 1.6);
          emitSound(state, 'military_spawn');
        }
      }
    }

    horse.wanderTimer -= dt;

    if (horse.team === 'neutral') {
      let home = WILD_HORSE_MEADOWS[0];
      let bestHomeDist = Math.hypot(horse.x - home.x, horse.y - home.y);
      for (let i = 1; i < WILD_HORSE_MEADOWS.length; i++) {
        const d = Math.hypot(horse.x - WILD_HORSE_MEADOWS[i].x, horse.y - WILD_HORSE_MEADOWS[i].y);
        if (d < bestHomeDist) {
          bestHomeDist = d;
          home = WILD_HORSE_MEADOWS[i];
        }
      }

      if (horse.wanderTimer <= 0) {
        horse.wanderTimer = 2.6 + ((state.tick + horse.id * 7) % 5) * 0.45;
        const angle = (state.tick * 0.63 + horse.id * 2.39996) % (Math.PI * 2);
        const radius = 0.35 + ((state.tick + horse.id * 3) % 3) * 0.22;
        const candX = Math.max(0.5, Math.min(state.mapSize - 0.5, home.x + Math.cos(angle) * radius));
        const candY = Math.max(0.5, Math.min(state.mapSize - 0.5, home.y + Math.sin(angle) * radius));
        const ctx = Math.floor(candX);
        const cty = Math.floor(candY);
        if (
          inBounds(ctx, cty, state.mapSize) &&
          state.tiles[cty * state.mapSize + ctx]?.kind === 'grass' &&
          blocked[cty * state.mapSize + ctx] === 0 &&
          Math.hypot(candX - home.x, candY - home.y) <= 1.45
        ) {
          horse.targetX = candX;
          horse.targetY = candY;
        } else {
          horse.targetX = home.x;
          horse.targetY = home.y;
        }
      }

      const dx = horse.targetX - horse.x;
      const dy = horse.targetY - horse.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.08) {
        if (Math.abs(dx - dy) > 0.02) {
          horse.facing = dx - dy >= 0 ? 1 : -1;
        }
        const step = Math.min(dist, 0.72 * dt);
        const nx = Math.max(0.3, Math.min(state.mapSize - 0.3, horse.x + (dx / dist) * step));
        const ny = Math.max(0.3, Math.min(state.mapSize - 0.3, horse.y + (dy / dist) * step));
        const ntx = Math.floor(nx);
        const nty = Math.floor(ny);
        if (
          inBounds(ntx, nty, state.mapSize) &&
          state.tiles[nty * state.mapSize + ntx]?.kind === 'grass' &&
          blocked[nty * state.mapSize + ntx] === 0
        ) {
          horse.x = nx;
          horse.y = ny;
          horse.animPhase += dt * 3.2;
        } else {
          horse.targetX = horse.x;
          horse.targetY = horse.y;
        }
      }
    } else {
      // Tamed horse: trot back to graze peacefully near friendly Stable (if built) or Town Center
      const stable = state.buildings.find(
        (b) => b.team === horse.team && b.hp > 0 && b.built && b.kind === 'stable',
      );
      const homeBld =
        stable ??
        state.buildings.find(
          (b) => b.team === horse.team && b.hp > 0 && b.kind === 'town_center',
        );
      if (!homeBld) continue;

      const anchorX = homeBld.tileX + homeBld.size / 2;
      const anchorY = homeBld.tileY + homeBld.size / 2;
      const distToAnchor = Math.hypot(horse.x - anchorX, horse.y - anchorY);

      if (distToAnchor > 2.6) {
        if (horse.wanderTimer <= 0) {
          horse.wanderTimer = 0.65;
          const path = findPath(
            blocked,
            state.mapSize,
            horse.x,
            horse.y,
            homeBld.tileX,
            homeBld.tileY,
            homeBld.size,
          );
          if (path.length > 0) {
            horse.targetX = path[0].x;
            horse.targetY = path[0].y;
          }
        }
        const dx = horse.targetX - horse.x;
        const dy = horse.targetY - horse.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0.18) {
          horse.wanderTimer = 0;
        } else {
          if (Math.abs(dx - dy) > 0.02) {
            horse.facing = dx - dy >= 0 ? 1 : -1;
          }
          const step = Math.min(dist, 2.35 * dt);
          const nx = Math.max(0.3, Math.min(state.mapSize - 0.3, horse.x + (dx / dist) * step));
          const ny = Math.max(0.3, Math.min(state.mapSize - 0.3, horse.y + (dy / dist) * step));
          const ntx = Math.floor(nx);
          const nty = Math.floor(ny);
          if (inBounds(ntx, nty, state.mapSize) && blocked[nty * state.mapSize + ntx] === 0) {
            horse.x = nx;
            horse.y = ny;
            horse.animPhase += dt * 7.5;
          } else {
            horse.wanderTimer = 0;
          }
        }
      } else {
        if (horse.wanderTimer <= 0) {
          horse.wanderTimer = 2.5 + ((state.tick + horse.id * 5) % 4) * 0.5;
          const angle = (state.tick * 0.51 + horse.id * 1.91) % (Math.PI * 2);
          const ringR = homeBld.size * 0.7 + 0.85;
          const gx = Math.max(0.5, Math.min(state.mapSize - 0.5, anchorX + Math.cos(angle) * ringR));
          const gy = Math.max(0.5, Math.min(state.mapSize - 0.5, anchorY + Math.sin(angle) * ringR));
          const gtx = Math.floor(gx);
          const gty = Math.floor(gy);
          if (
            inBounds(gtx, gty, state.mapSize) &&
            isTileWalkable(state.tiles[gty * state.mapSize + gtx]) &&
            blocked[gty * state.mapSize + gtx] === 0
          ) {
            horse.targetX = gx;
            horse.targetY = gy;
          } else {
            const near = nearestWalkableTile(
              blocked,
              state.mapSize,
              homeBld.tileX,
              homeBld.tileY,
              horse.x,
              horse.y,
              homeBld.size,
            );
            if (near) {
              horse.targetX = near.x + 0.5;
              horse.targetY = near.y + 0.5;
            }
          }
        }
        const dx = horse.targetX - horse.x;
        const dy = horse.targetY - horse.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.1) {
          if (Math.abs(dx - dy) > 0.02) {
            horse.facing = dx - dy >= 0 ? 1 : -1;
          }
          const step = Math.min(dist, 0.78 * dt);
          const nx = Math.max(0.3, Math.min(state.mapSize - 0.3, horse.x + (dx / dist) * step));
          const ny = Math.max(0.3, Math.min(state.mapSize - 0.3, horse.y + (dy / dist) * step));
          const ntx = Math.floor(nx);
          const nty = Math.floor(ny);
          if (inBounds(ntx, nty, state.mapSize) && blocked[nty * state.mapSize + ntx] === 0) {
            horse.x = nx;
            horse.y = ny;
            horse.animPhase += dt * 3.2;
          }
        }
      }
    }
  }
}

export function stepGame(state: GameState, dt: number) {
  if (state.outcome !== 'playing') return;
  state.timeSec += dt;
  state.tick++;

  const blocked = buildBlockedGrid(state.tiles, state.buildings, state.mapSize);

  // 1. Update buildings: self-assembly progress, farms, training queues, tower/TC arrows
  const buildSpeedMult = state.spec.modifier === 'timber_boom' ? 1.35 : 1.0;
  for (const b of state.buildings) {
    if (b.hp <= 0) continue;
    if (!b.built) {
      // Gentle baseline progress so unassisted buildings still finish eventually
      const spec = BUILDINGS[b.kind];
      b.buildProgress = Math.min(1, b.buildProgress + (dt / (spec.buildTimeSec * 2.6)) * buildSpeedMult);
      b.hp = Math.min(b.maxHp, Math.round(b.maxHp * (0.2 + 0.8 * b.buildProgress)));
      if (b.buildProgress >= 1) {
        b.built = true;
        b.hp = b.maxHp;
        if (b.kind === 'farm') b.attackTimer = 2.5;
        if (b.team === 'player') {
          state.stats.buildingsBuilt++;
          emitSound(state, 'build_done');
          addCallout(state, b.tileX + 0.5, b.tileY + 0.5, `${spec.shortName} Ready!`, '#86efac', 1.5);
        }
      }
      continue;
    }

    // Traditional AoE Wheat Farm continuous Food yield (+2 passive, +4 when tended by nearby villager)
    if (b.kind === 'farm') {
      b.attackTimer -= dt;
      if (b.attackTimer <= 0) {
        b.attackTimer += 2.5;
        if (b.attackTimer <= 0) b.attackTimer = 2.5;
        const fx = b.tileX + 0.5;
        const fy = b.tileY + 0.5;
        const tended = state.units.some(
          (u) =>
            u.team === b.team &&
            u.hp > 0 &&
            u.kind === 'villager' &&
            Math.hypot(u.x - fx, u.y - fy) <= 1.6,
        );
        const yieldFood = tended ? 4 : 2;
        state.resources[b.team].food += yieldFood;
        if (b.team === 'player') {
          state.stats.foodGathered += yieldFood;
          if (tended || (state.tick + b.id * 7) % 2 === 0) {
            addCallout(state, fx, fy - 0.15, `+${yieldFood} Farm`, '#fde68a', 1.1);
          }
        }
      }
      continue;
    }

    // Production queue
    if (b.queue.length > 0) {
      const head = b.queue[0];
      head.remainingSec -= dt;
      if (head.remainingSec <= 0) {
        b.queue.shift();
        const spawnSpot = findPath(
          blocked,
          state.mapSize,
          b.tileX + b.size / 2,
          b.tileY + b.size / 2,
          b.rallyX,
          b.rallyY,
          1,
        );
        const sx = Math.max(0.5, Math.min(state.mapSize - 0.5, spawnSpot[0]?.x ?? b.rallyX));
        const sy = Math.max(0.5, Math.min(state.mapSize - 0.5, spawnSpot[0]?.y ?? b.rallyY));
        const u = spawnUnit(state, b.team, head.unit, sx, sy);
        if (b.team === 'player') {
          if (head.unit === 'villager') {
            state.stats.villagersTrained++;
            emitSound(state, 'villager_spawn');
            // Auto-send newly trained villager to nearest tree if rallied near default
            const nearWood = findNearestResourceTile(state, 'wood', sx, sy, 5.5);
            if (nearWood) {
              u.order = { type: 'gather', tileX: nearWood.x, tileY: nearWood.y, resource: 'wood' };
            }
          } else {
            state.stats.militaryTrained++;
            state.stats.countsByUnit[head.unit] = (state.stats.countsByUnit[head.unit] ?? 0) + 1;
            emitSound(state, 'military_spawn');
          }
        }
      }
    }

    // Defensive arrow fire (Town Center & Watchtower)
    const bSpec = BUILDINGS[b.kind];
    if (bSpec.attackDamage > 0) {
      b.attackTimer = Math.max(0, b.attackTimer - dt);
      if (b.attackTimer <= 0) {
        const civ = getCivForTeam(state, b.team);
        let range = bSpec.attackRange + (civ === 'teutons' ? 1.5 : 0);
        if (state.spec.modifier === 'fletchers_wind') range += 1.0;
        const dmg = Math.round(bSpec.attackDamage * (civ === 'teutons' ? 1.35 : 1.0));
        const cx = b.tileX + b.size / 2;
        const cy = b.tileY + b.size / 2;

        let target: Unit | null = null;
        let bestDist = range;
        for (const u of state.units) {
          if (u.team === b.team || u.hp <= 0) continue;
          const d = Math.hypot(u.x - cx, u.y - cy);
          if (d <= bestDist) {
            bestDist = d;
            target = u;
          }
        }
        if (target) {
          b.attackTimer = bSpec.attackCooldownSec;
          state.projectiles.push({
            id: state.nextId++,
            team: b.team,
            kind: 'bolt',
            fromX: cx,
            fromY: cy,
            toX: target.x,
            toY: target.y,
            progress: 0,
            speed: 9.5,
            damage: dmg,
            targetUnitId: target.id,
          });
        }
      }
    }
  }

  // 1b. Update Wild Horses (wandering, AoE herding/taming, and Stable homing)
  stepWildHorses(state, blocked, dt);

  // 2. Update units
  const playerHorses = countTamedHorses(state, 'player');
  const enemyHorses = countTamedHorses(state, 'enemy');
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    u.attackTimer = Math.max(0, u.attackTimer - dt);
    u.monkCooldown = Math.max(0, u.monkCooldown - dt);
    const st = getEffectiveUnitStats(
      state.spec,
      u.team,
      u.kind,
      u.team === 'player' ? playerHorses : enemyHorses,
    );

    // Monk passive ally healing when not actively converting
    if (u.kind === 'monk' && u.order.type !== 'convert' && u.attackTimer <= 0) {
      const wounded = state.units.find(
        (ally) =>
          ally.team === u.team &&
          ally.hp > 0 &&
          ally.hp < ally.maxHp &&
          ally.id !== u.id &&
          Math.hypot(ally.x - u.x, ally.y - u.y) <= 3.6,
      );
      if (wounded) {
        u.attackTimer = 1.4;
        wounded.hp = Math.min(wounded.maxHp, wounded.hp + 10);
        state.projectiles.push({
          id: state.nextId++,
          team: u.team,
          kind: 'heal',
          fromX: u.x,
          fromY: u.y,
          toX: wounded.x,
          toY: wounded.y,
          progress: 0,
          speed: 7,
          damage: 0,
        });
      } else if (u.order.type === 'idle' && u.monkCooldown <= 0) {
        // Auto-Wololo nearby enemy units in range!
        const nearbyEnemy = findNearestEnemyUnit(state, u, st.range);
        if (nearbyEnemy && nearbyEnemy.kind !== 'monk') {
          u.order = { type: 'convert', targetId: nearbyEnemy.id };
        }
      }
    }

    if (u.order.type === 'idle') {
      u.convertTargetId = null;
      u.convertProgress = 0;
      if (u.kind !== 'villager' && u.kind !== 'monk') {
        const enemy = findNearestEnemyUnit(state, u, Math.max(3.6, st.range + 0.6));
        if (enemy) {
          if (Math.hypot(enemy.x - u.x, enemy.y - u.y) <= st.range + 0.2) {
            if (u.attackTimer <= 0) performUnitAttackOnUnit(state, u, enemy);
          } else {
            moveUnitToward(state, blocked, u, enemy.x, enemy.y, dt);
          }
        } else {
          const enemyBld = findNearestEnemyBuilding(state, u, Math.max(2.6, st.range));
          if (enemyBld && distanceToBuilding(u.x, u.y, enemyBld) <= st.range + 0.25) {
            if (u.attackTimer <= 0) performUnitAttackOnBuilding(state, u, enemyBld);
          }
        }
      }
      continue;
    }

    if (u.order.type === 'move') {
      u.convertTargetId = null;
      u.convertProgress = 0;
      if (u.order.attackMove) {
        const nearEnemy = findNearestEnemyUnit(state, u, Math.max(3.8, st.range + 0.4));
        if (nearEnemy) {
          if (Math.hypot(nearEnemy.x - u.x, nearEnemy.y - u.y) <= st.range + 0.2) {
            if (u.attackTimer <= 0) performUnitAttackOnUnit(state, u, nearEnemy);
          } else {
            moveUnitToward(state, blocked, u, nearEnemy.x, nearEnemy.y, dt);
          }
          continue;
        }
        const nearBld = findNearestEnemyBuilding(state, u, Math.max(2.8, st.range));
        if (nearBld) {
          if (distanceToBuilding(u.x, u.y, nearBld) <= st.range + 0.3) {
            if (u.attackTimer <= 0) performUnitAttackOnBuilding(state, u, nearBld);
          } else {
            moveUnitToward(
              state,
              blocked,
              u,
              nearBld.tileX + nearBld.size / 2,
              nearBld.tileY + nearBld.size / 2,
              dt,
              nearBld.size,
            );
          }
          continue;
        }
      }

      const dGoal = Math.hypot(u.order.tx - u.x, u.order.ty - u.y);
      if (dGoal <= 0.28) {
        u.order = { type: 'idle' };
        u.path = [];
      } else {
        moveUnitToward(state, blocked, u, u.order.tx, u.order.ty, dt);
      }
      continue;
    }

    if (u.order.type === 'build') {
      const site = state.buildings.find((b) => b.id === (u.order as { buildingId: number }).buildingId);
      if (!site || site.hp <= 0 || site.built) {
        u.order = { type: 'idle' };
        continue;
      }
      const dist = distanceToBuilding(u.x, u.y, site);
      if (dist <= 1.25) {
        u.animPhase += dt * 7;
        const spec = BUILDINGS[site.kind];
        site.buildProgress = Math.min(
          1,
          site.buildProgress + (dt / spec.buildTimeSec) * buildSpeedMult,
        );
        site.hp = Math.min(site.maxHp, Math.round(site.maxHp * (0.2 + 0.8 * site.buildProgress)));
        if (site.buildProgress >= 1) {
          site.built = true;
          site.hp = site.maxHp;
          if (site.kind === 'farm') site.attackTimer = 2.5;
          u.order = { type: 'idle' };
          if (site.team === 'player') {
            state.stats.buildingsBuilt++;
            emitSound(state, 'build_done');
            addCallout(
              state,
              site.tileX + 0.5,
              site.tileY + 0.5,
              `${spec.shortName} Built!`,
              '#86efac',
              1.6,
            );
          }
        }
      } else {
        moveUnitToward(state, blocked, u, site.tileX, site.tileY, dt, site.size);
      }
      continue;
    }

    if (u.order.type === 'gather') {
      const { tileX, tileY, resource } = u.order;
      // Carrying full load -> walk back to dropoff
      if (u.carryAmount >= 10 && u.carryKind) {
        const drop = findNearestDropoff(state, u.team, u.x, u.y);
        if (!drop) {
          u.order = { type: 'idle' };
          continue;
        }
        if (distanceToBuilding(u.x, u.y, drop) <= 1.35) {
          state.resources[u.team][u.carryKind] += u.carryAmount;
          if (u.team === 'player') {
            if (u.carryKind === 'wood') state.stats.woodGathered += u.carryAmount;
            if (u.carryKind === 'food') state.stats.foodGathered += u.carryAmount;
            if (u.carryKind === 'gold') state.stats.goldGathered += u.carryAmount;
            const gatherTile = state.tiles[tileY * state.mapSize + tileX];
            const isFishLoad =
              u.carryKind === 'food' &&
              Boolean(gatherTile && (gatherTile.kind === 'fish' || gatherTile.kind === 'water'));
            const label =
              u.carryKind === 'wood'
                ? 'Wood'
                : u.carryKind === 'gold'
                  ? 'Gold'
                  : isFishLoad
                    ? 'Fish'
                    : 'Food';
            addCallout(
              state,
              drop.tileX + drop.size / 2,
              drop.tileY + 0.3,
              `+${u.carryAmount} ${label}`,
              u.carryKind === 'gold' ? '#fde047' : isFishLoad ? '#7dd3fc' : '#d9f99d',
              1.0,
            );
          }
          u.carryAmount = 0;
          u.carryKind = null;
          u.path = [];
        } else {
          moveUnitToward(state, blocked, u, drop.tileX, drop.tileY, dt, drop.size);
        }
        continue;
      }

      // Walk to resource tile (or adjacent shore bank for Pond Fish) and harvest
      const tile = state.tiles[tileY * state.mapSize + tileX];
      if (!tile || tile.amount <= 0 || tileToResource(tile.kind) !== resource) {
        const nextTile = findNearestResourceTile(state, resource, u.x, u.y, 7);
        if (nextTile) {
          u.order = { type: 'gather', tileX: nextTile.x, tileY: nextTile.y, resource };
          u.path = [];
        } else {
          u.order = { type: 'idle' };
        }
        continue;
      }

      const isFishing = tile.kind === 'fish';
      const harvestReach = isFishing ? 1.75 : 1.55;
      const dTile = Math.hypot(tileX + 0.5 - u.x, tileY + 0.5 - u.y);
      if (dTile <= harvestReach) {
        let rate = 4.2; // units per second -> 10 in ~2.4s (faster for AoE shore fishing!)
        if (isFishing) rate *= 1.45;
        if (resource === 'gold' && state.spec.modifier === 'gold_fever') rate *= 1.45;
        if (resource === 'wood' && state.spec.modifier === 'timber_boom') rate *= 1.45;
        const fdx = tileX + 0.5 - u.x;
        const fdy = tileY + 0.5 - u.y;
        if (Math.abs(fdx - fdy) > 0.02) {
          u.facing = fdx - fdy >= 0 ? 1 : -1;
        }
        u.animPhase += dt * 8;
        u.harvestTimer += dt * rate;
        if (u.harvestTimer >= 2) {
          const take = Math.min(2, tile.amount);
          tile.amount -= take;
          u.harvestTimer -= 2;
          u.carryKind = resource;
          u.carryAmount = Math.min(10, u.carryAmount + take);
          if (u.team === 'player' && state.tick % 30 === 0) {
            emitSound(state, resource === 'gold' ? 'gold_clink' : 'wood_chop');
          }
          if (tile.amount <= 0) {
            tile.kind = isFishing ? 'water' : 'grass';
            tile.maxAmount = 0;
          }
        }
      } else {
        moveUnitToward(state, blocked, u, tileX, tileY, dt, 1);
      }
      continue;
    }

    if (u.order.type === 'attack_unit') {
      const targetId = u.order.targetId;
      const target = state.units.find((other) => other.id === targetId && other.hp > 0 && other.team !== u.team);
      if (!target) {
        u.order = { type: 'idle' };
        continue;
      }
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      if (d <= st.range + 0.2) {
        if (u.attackTimer <= 0) performUnitAttackOnUnit(state, u, target);
      } else {
        moveUnitToward(state, blocked, u, target.x, target.y, dt);
      }
      continue;
    }

    if (u.order.type === 'attack_building') {
      const bId = u.order.buildingId;
      const target = state.buildings.find((b) => b.id === bId && b.hp > 0 && b.team !== u.team);
      if (!target) {
        u.order = { type: 'idle' };
        continue;
      }
      const d = distanceToBuilding(u.x, u.y, target);
      if (d <= st.range + 0.3) {
        if (u.attackTimer <= 0) performUnitAttackOnBuilding(state, u, target);
      } else {
        moveUnitToward(state, blocked, u, target.tileX, target.tileY, dt, target.size);
      }
      continue;
    }

    if (u.order.type === 'convert') {
      const targetId = u.order.targetId;
      const target = state.units.find(
        (other) => other.id === targetId && other.hp > 0 && other.team !== u.team,
      );
      if (!target) {
        u.convertTargetId = null;
        u.convertProgress = 0;
        u.order = { type: 'idle' };
        continue;
      }
      if (u.monkCooldown > 0) {
        // Keep safe distance while recharging faith
        u.convertTargetId = null;
        u.convertProgress = 0;
        continue;
      }
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      if (d <= st.range + 0.25) {
        if (u.convertTargetId !== target.id) {
          u.convertTargetId = target.id;
          u.convertProgress = 0;
          if (u.team === 'player') emitSound(state, 'wololo');
          addCallout(state, u.x, u.y - 0.3, 'Wololo…', '#fde047', 1.2);
        }
        u.animPhase += dt * 6;
        u.convertProgress += (dt / 2.45) * st.convertSpeedMult;
        if (u.convertProgress >= 1) {
          target.team = u.team;
          target.order = { type: 'idle' };
          target.path = [];
          u.convertTargetId = null;
          u.convertProgress = 0;
          u.monkCooldown = 6.5;
          u.order = { type: 'idle' };
          addCallout(state, target.x, target.y - 0.4, 'WOLOLO!', '#facc15', 2.0);
          if (u.team === 'player') {
            state.stats.wololoConversions++;
            if (state.timeSec - state.recentTauntSec <= 9) {
              state.stats.cheekyWololo = true;
            }
            if (state.spec.modifier === 'wololo_sabbath') {
              state.resources.player.gold += 50;
              addCallout(state, target.x, target.y - 0.9, '+50 Gold Relic!', '#fde047', 1.5);
            }
            emitSound(state, 'wololo');
          }
        }
      } else {
        u.convertTargetId = null;
        u.convertProgress = 0;
        moveUnitToward(state, blocked, u, target.x, target.y, dt);
      }
    }
  }

  // Soft unit separation so stacked troops fan out visibly like AoE formations
  for (let i = 0; i < state.units.length; i++) {
    const a = state.units[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < state.units.length; j++) {
      const b = state.units[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001 && d < 0.42) {
        const push = (0.42 - d) * 0.25;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        const ax = a.x - ux;
        const ay = a.y - uy;
        const bx = b.x + ux;
        const by = b.y + uy;
        if (inBounds(Math.floor(ax), Math.floor(ay), state.mapSize) && !blocked[Math.floor(ay) * state.mapSize + Math.floor(ax)]) {
          a.x = ax;
          a.y = ay;
        }
        if (inBounds(Math.floor(bx), Math.floor(by), state.mapSize) && !blocked[Math.floor(by) * state.mapSize + Math.floor(bx)]) {
          b.x = bx;
          b.y = by;
        }
      }
    }
  }

  // 3. Advance projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const dist = Math.max(0.6, Math.hypot(p.toX - p.fromX, p.toY - p.fromY));
    p.progress += (p.speed * dt) / dist;
    if (p.progress >= 1) {
      if (p.targetUnitId !== undefined) {
        const t = state.units.find((u) => u.id === p.targetUnitId && u.hp > 0);
        if (t && p.damage > 0) applyUnitHit(state, t, p.damage);
      } else if (p.targetBuildingId !== undefined) {
        const b = state.buildings.find((bld) => bld.id === p.targetBuildingId && bld.hp > 0);
        if (b && p.damage > 0) applyBuildingHit(state, b, p.damage);
      }
      state.projectiles.splice(i, 1);
    }
  }

  // 4. Prune dead entities & decay callouts
  state.units = state.units.filter((u) => u.hp > 0);
  state.buildings = state.buildings.filter((b) => b.hp > 0);
  for (let i = state.callouts.length - 1; i >= 0; i--) {
    state.callouts[i].ttl -= dt;
    if (state.callouts[i].ttl <= 0) state.callouts.splice(i, 1);
  }

  // 5. Step Rival AI once per second (disabled in peaceful base_builder mode)
  if (state.mode !== 'base_builder') {
    state.enemyWaveTimer -= dt;
    if (state.tick % 20 === 0 && state.outcome === 'playing') {
      stepEnemyAI(state);
    }
  }

  // 6. Refresh Player Fog of War every 4 ticks
  if (state.tick % 4 === 0) {
    recomputeFog(state);
  }
}

export interface ScoreSummary {
  victory: boolean;
  crowns: 0 | 1 | 2 | 3;
  score: number;
  timeSec: number;
  strategyLabel: string;
  strategyIcon: string;
}

export function computeScoreSummary(state: GameState): ScoreSummary {
  const victory = state.outcome === 'victory';
  const t = Math.round(state.timeSec);
  const crowns: 0 | 1 | 2 | 3 = !victory
    ? 0
    : t <= state.spec.parSec
      ? 3
      : t <= state.spec.parSec + 65
        ? 2
        : 1;

  const base = victory ? 1600 : 250;
  const speedBonus = victory ? Math.max(0, Math.round((250 - t) * 8)) : 0;
  const combatBonus =
    state.stats.enemyUnitsSlain * 55 +
    state.stats.enemyBuildingsRazed * 110 +
    state.stats.wololoConversions * 200 -
    state.stats.unitsLost * 20;
  const score = Math.max(100, base + speedBonus + combatBonus);

  let strategyLabel = 'Combined Arms Siege';
  let strategyIcon = '⚔️';
  if (state.stats.wololoConversions >= 2) {
    strategyLabel = 'Wololo Cult';
    strategyIcon = '🧙';
  } else if ((state.stats.countsByUnit.knight ?? 0) >= 3) {
    strategyLabel = 'Heavy Cavalry Charge';
    strategyIcon = '🐎';
  } else if ((state.stats.countsByUnit.archer ?? 0) >= 4) {
    strategyLabel = 'Yeoman Longbow Volley';
    strategyIcon = '🏹';
  } else if (victory && t <= 105) {
    strategyLabel = 'Feudal Blitz';
    strategyIcon = '⚡';
  }

  return {
    victory,
    crowns,
    score,
    timeSec: t,
    strategyLabel,
    strategyIcon,
  };
}

export function formatChronicleComment(state: GameState, streak = 1): string {
  const s = computeScoreSummary(state);
  const mins = Math.floor(s.timeSec / 60);
  const secs = String(s.timeSec % 60).padStart(2, '0');
  const crownStr = s.victory ? '👑'.repeat(s.crowns) + '▫️'.repeat(3 - s.crowns) : '💀 Fallen Keep';
  const title = state.spec.isCustom
    ? `Custom Skirmish "${state.spec.mapName}"`
    : `Daily Siege #${state.spec.puzzleNumber} (${state.spec.mapName})`;
  const wololoNote =
    state.stats.wololoConversions > 0 ? ` · ✨ ${state.stats.wololoConversions} Wololo'd` : '';
  return [
    `🏰 **Pocket Empires** — ${title}`,
    `${crownStr} · ⏱️ ${mins}:${secs} · **${s.score.toLocaleString()} pts** · 🔥 Streak ${streak}`,
    `${s.strategyIcon} Strategy: *${s.strategyLabel}*${wololoNote}`,
  ].join('\n');
}
