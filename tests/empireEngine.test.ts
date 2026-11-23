import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { Building, GameState, MapTile, SkirmishSpec, Team, UnitKind } from '../src/types/rts.ts';

// Allow Node v24 native TypeScript loader to resolve TypeScript siblings imported with `.js` specifiers.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.endsWith('.js') &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL
    ) {
      const jsUrl = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(jsUrl))) {
        const tsUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(tsUrl))) {
          return nextResolve(tsUrl.href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { BUILDINGS, CASTLE_AGE_COST, MAP_SIZE, UNITS } = await import('../src/types/rts.ts');
const { createRng, hashString, puzzleNumberForDate } = await import('../src/engine/rng.ts');
const {
  buildMapTiles,
  decodeSkirmishCode,
  encodeSkirmishCode,
  generateDailySpec,
} = await import('../src/engine/dailyGenerator.ts');
const { buildBlockedGrid, findPath, isTileWalkable } = await import('../src/engine/pathfinding.ts');
const {
  canPlaceBuilding,
  cmdAdvanceAge,
  cmdDemolishBuilding,
  cmdIssueOrder,
  cmdPlaceBuilding,
  cmdTrainUnit,
  cmdTriggerTaunt,
  computeRaidDestruction,
  computeScoreSummary,
  countTamedHorses,
  createBaseBuilderState,
  createInitialState,
  createPlayerRaidState,
  exportBaseBlueprint,
  formatChronicleComment,
  getEffectiveBuildingCost,
  getEffectiveUnitStats,
  getTeamPop,
  stepGame,
} = await import('../src/engine/sim.ts');

function makeNeutralSpec(overrides: Partial<SkirmishSpec> = {}): SkirmishSpec {
  return {
    seed: 123456,
    dateKey: '2026-11-21',
    puzzleNumber: 113,
    mapName: 'Test Meadow of Oakvale',
    biome: 'sherwood',
    playerCiv: 'byzantines', // Does not alter pikeman/militia/knight melee damage or HP
    enemyCiv: 'britons', // Does not alter pikeman/militia/knight melee damage or HP
    aiPersona: 'viking_jarl',
    aiLeaderName: 'Jarl Haakon',
    modifier: 'standard',
    parSec: 140,
    chokepointStyle: 'open_steppe',
    ...overrides,
  };
}

function makeFlatGrassTiles(size: number): MapTile[] {
  const tiles: MapTile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      tiles.push({
        x,
        y,
        kind: 'grass',
        amount: 0,
        maxAmount: 0,
        variant: 0,
      });
    }
  }
  return tiles;
}

/** Helper that builds a production structure and trains a real unit via engine commands. */
function trainUnitViaBuilding(
  state: GameState,
  team: Team,
  unitKind: UnitKind,
  tileX: number,
  tileY: number,
) {
  const bKind = UNITS[unitKind].trainedAt;
  state.resources[team].wood += 300;
  state.resources[team].food += 300;
  state.resources[team].gold += 300;

  let producer = state.buildings.find((b) => b.team === team && b.kind === bKind && b.hp > 0);
  if (!producer) {
    let px = tileX;
    let py = tileY;
    if (team === 'player') {
      state.fog[py * state.mapSize + px] = 2;
    }
    if (!canPlaceBuilding(state, team, bKind, px, py)) {
      outer: for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const cx = tileX + dx;
          const cy = tileY + dy;
          if (cx >= 0 && cy >= 0 && cx < state.mapSize && cy < state.mapSize) {
            if (team === 'player') state.fog[cy * state.mapSize + cx] = 2;
            if (canPlaceBuilding(state, team, bKind, cx, cy)) {
              px = cx;
              py = cy;
              break outer;
            }
          }
        }
      }
    }
    const site = cmdPlaceBuilding(state, team, bKind, px, py);
    assert.ok(site, `Expected to place ${bKind} at (${px}, ${py})`);
    producer = site;
  }
  if (!producer.built) {
    state.enemyWaveTimer = 999;
    for (let i = 0; i < 400 && !producer.built; i++) {
      stepGame(state, 0.05);
    }
    assert.equal(producer.built, true, `Expected ${bKind} construction to complete`);
  }

  const beforeIds = new Set(state.units.map((u) => u.id));
  const queued = cmdTrainUnit(state, team, unitKind, producer.id);
  assert.equal(queued, true, `Expected cmdTrainUnit(${team}, ${unitKind}) to succeed`);

  for (let i = 0; i < 300; i++) {
    state.enemyWaveTimer = 999;
    stepGame(state, 0.05);
    const spawned = state.units.find(
      (u) => !beforeIds.has(u.id) && u.team === team && u.kind === unitKind,
    );
    if (spawned) return spawned;
  }
  assert.fail(`Unit ${unitKind} did not spawn in time`);
}

describe('Daily Generator & Share Codes', () => {
  test('deterministic daily generation yields identical spec & tiles for same date and varied puzzles across dates', () => {
    const specA = generateDailySpec('2026-11-21');
    const specB = generateDailySpec('2026-11-21');
    assert.deepEqual(specA, specB);

    const tilesA = buildMapTiles(specA);
    const tilesB = buildMapTiles(specB);
    assert.equal(tilesA.length, MAP_SIZE * MAP_SIZE);
    assert.deepEqual(tilesA, tilesB);

    // PRNG & epoch helpers
    assert.equal(hashString('pocket-empires:v1:2026-11-21'), specA.seed);
    assert.equal(puzzleNumberForDate('2026-08-01'), 1);
    assert.equal(puzzleNumberForDate('2026-08-02'), 2);
    const r1 = createRng(42);
    const r2 = createRng(42);
    assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);

    // Varied puzzles across 15 consecutive dates
    const biomes = new Set<string>();
    const modifiers = new Set<string>();
    const seeds = new Set<number>();
    for (let d = 1; d <= 15; d++) {
      const dateKey = `2026-11-${String(d).padStart(2, '0')}`;
      const s = generateDailySpec(dateKey);
      assert.notEqual(s.playerCiv, s.enemyCiv);
      assert.ok(s.puzzleNumber > 0);
      biomes.add(s.biome);
      modifiers.add(s.modifier);
      seeds.add(s.seed);
    }
    assert.equal(seeds.size, 15);
    assert.ok(biomes.size >= 3, 'Expected multiple biomes across 15 days');
    assert.ok(modifiers.size >= 3, 'Expected multiple daily modifiers across 15 days');
  });

  test('encodeSkirmishCode and decodeSkirmishCode handle valid and invalid inputs', () => {
    const spec = generateDailySpec('2026-11-15');
    const code = encodeSkirmishCode(spec);
    assert.match(code, /^PE-[0-5]{4}[0-3]{2}-[0-9A-F]{6}$/);

    const decoded = decodeSkirmishCode(code);
    assert.ok(decoded);
    assert.equal(decoded.biome, spec.biome);
    assert.equal(decoded.playerCiv, spec.playerCiv);
    assert.equal(decoded.enemyCiv, spec.enemyCiv);
    assert.equal(decoded.modifier, spec.modifier);
    assert.equal(decoded.chokepointStyle, spec.chokepointStyle);
    assert.equal(decoded.aiPersona, spec.aiPersona);
    assert.equal(decoded.isCustom, true);
    assert.equal(decoded.seed, (spec.seed >>> 8) >>> 0);

    // Lowercase + surrounding whitespace should decode identically
    const sloppy = decodeSkirmishCode(`   ${code.toLowerCase()} \n`);
    assert.ok(sloppy);
    assert.equal(sloppy.seed, decoded.seed);
    assert.equal(sloppy.biome, decoded.biome);

    // Valid 4-char and 8-char hex seeds
    assert.ok(decodeSkirmishCode('PE-012301-BEEF'));
    assert.ok(decodeSkirmishCode('PE-012301-CAFEBABE'));

    // Invalid codes must return null
    const invalidInputs = [
      '',
      '   ',
      'PE-012301',
      'AOE-012301-ABCDEF',
      'PE-612301-ABCDEF', // biome index 6 out of range 0..5
      'PE-062301-ABCDEF', // playerCiv index 6 out of range 0..5
      'PE-012341-ABCDEF', // chokepoint index 4 out of range 0..3
      'PE-012304-ABCDEF', // persona index 4 out of range 0..3
      'PE-012301-123', // hex seed too short (< 4)
      'PE-012301-123456789', // hex seed too long (> 8)
      'PE-012301-ZZZZZZ', // non-hex characters
    ];
    for (const bad of invalidInputs) {
      assert.equal(decodeSkirmishCode(bad), null, `Expected null for invalid code "${bad}"`);
    }
  });
});

describe('A* Pathfinding', () => {
  test('avoids water, cliffs, and buildings while traversing shallows and respecting ignoreBuildingId', () => {
    const size = 8;
    const tiles = makeFlatGrassTiles(size);

    // Vertical river at x = 4 except a shallows ford at (4, 6)
    for (let y = 0; y < size; y++) {
      tiles[y * size + 4].kind = y === 6 ? 'shallows' : y < 3 ? 'cliff' : 'water';
    }
    assert.equal(isTileWalkable(tiles[6 * size + 4]), true);
    assert.equal(isTileWalkable(tiles[5 * size + 4]), false);
    assert.equal(isTileWalkable(tiles[1 * size + 4]), false);

    // Place a building obstacle at (2, 6) forcing a slight detour on the left bank
    const obstacleBuilding: Building = {
      id: 77,
      team: 'player',
      kind: 'barracks',
      tileX: 2,
      tileY: 6,
      size: 1,
      hp: 320,
      maxHp: 320,
      built: true,
      buildProgress: 1,
      queue: [],
      rallyX: 2.5,
      rallyY: 5.2,
      attackTimer: 0,
    };

    const blocked = buildBlockedGrid(tiles, [obstacleBuilding], size);
    assert.equal(blocked[6 * size + 2], 1);

    const ignoredBlocked = buildBlockedGrid(tiles, [obstacleBuilding], size, 77);
    assert.equal(ignoredBlocked[6 * size + 2], 0);

    const path = findPath(blocked, size, 1.5, 6.5, 6, 1);
    assert.ok(path.length > 0, 'Expected valid path across shallows ford');
    assert.deepEqual(path[path.length - 1], { x: 6.5, y: 1.5 });

    // Must cross through (4.5, 6.5) shallows and never touch blocked tiles
    assert.ok(
      path.some((wp) => wp.x === 4.5 && wp.y === 6.5),
      'Expected path to cross via the shallows tile (4, 6)',
    );
    for (const wp of path) {
      const tx = Math.floor(wp.x);
      const ty = Math.floor(wp.y);
      assert.equal(blocked[ty * size + tx], 0, `Path stepped onto blocked tile (${tx}, ${ty})`);
    }

    // Seal the ford -> unreachable far bank must return []
    tiles[6 * size + 4].kind = 'water';
    const sealed = buildBlockedGrid(tiles, [], size);
    const noPath = findPath(sealed, size, 1.5, 1.5, 6, 6);
    assert.deepEqual(noPath, []);
  });

  test('enforces diagonal corner safety around water/cliff/building corners', () => {
    const size = 8;
    const tiles = makeFlatGrassTiles(size);

    // Block (3, 2) with water while leaving (2, 2), (2, 3), and (3, 3) walkable grass
    tiles[2 * size + 3].kind = 'water';
    const blocked = buildBlockedGrid(tiles, [], size);

    // Moving from (2.5, 2.5) to tile (3, 3) cannot cut diagonally past (3, 2)
    const path = findPath(blocked, size, 2.5, 2.5, 3, 3);
    assert.deepEqual(path, [
      { x: 2.5, y: 3.5 },
      { x: 3.5, y: 3.5 },
    ]);

    // Pinch both orthogonal neighbors (3, 2) and (2, 3) with water -> must route around, never squeeze diagonally
    tiles[3 * size + 2].kind = 'water';
    const pinched = buildBlockedGrid(tiles, [], size);
    const detour = findPath(pinched, size, 2.5, 2.5, 3, 3);
    assert.ok(detour.length >= 4, `Expected multi-step detour around diagonal pinch, got ${detour.length}`);
    assert.notDeepEqual(detour[0], { x: 3.5, y: 3.5 });
  });
});

describe('Economy, Construction & Population', () => {
  test('villager gathering and drop-off increases state.resources.player for wood, food, and gold', () => {
    const state = createInitialState(makeNeutralSpec());
    state.enemyWaveTimer = 999;

    const startWood = state.resources.player.wood;
    const startFood = state.resources.player.food;
    const startGold = state.resources.player.gold;

    // Order the idle starting villager near (8.5, 11.6) onto the safe Gold vein at (7, 11)
    const idleVillager = state.units.find(
      (u) => u.team === 'player' && u.kind === 'villager' && u.order.type === 'idle',
    );
    assert.ok(idleVillager, 'Expected one idle starting villager');
    const orderKind = cmdIssueOrder(state, 'player', [idleVillager.id], 7, 11);
    assert.equal(orderKind, 'gather');

    // Step 16 seconds of economy without spending
    for (let i = 0; i < 320; i++) {
      stepGame(state, 0.05);
    }

    assert.ok(state.resources.player.wood > startWood, 'Expected player wood to increase');
    assert.ok(state.resources.player.food > startFood, 'Expected player food to increase');
    assert.ok(state.resources.player.gold > startGold, 'Expected player gold to increase');
    assert.equal(state.resources.player.wood - startWood, state.stats.woodGathered);
    assert.equal(state.resources.player.food - startFood, state.stats.foodGathered);
    assert.equal(state.resources.player.gold - startGold, state.stats.goldGathered);
  });

  test('cmdPlaceBuilding dispatches villager, completes construction, and increases pop cap for homestead', () => {
    const state = createInitialState(makeNeutralSpec());
    state.enemyWaveTimer = 999;

    const popBefore = getTeamPop(state, 'player');
    assert.equal(popBefore.cap, 10);
    assert.equal(popBefore.current, 4);

    // Reject placement on occupied TC tile (9, 12) or unexplored fog (0, 0)
    assert.equal(cmdPlaceBuilding(state, 'player', 'homestead', 9, 12), null);
    assert.equal(cmdPlaceBuilding(state, 'player', 'homestead', 0, 0), null);

    const woodBefore = state.resources.player.wood;
    const homestead = cmdPlaceBuilding(state, 'player', 'homestead', 8, 11);
    assert.ok(homestead, 'Expected homestead placement at (8, 11) to succeed');
    assert.equal(homestead.built, false);
    assert.equal(state.resources.player.wood, woodBefore - (BUILDINGS.homestead.cost.wood ?? 0));

    // Unbuilt homestead must not increase pop cap yet
    assert.equal(getTeamPop(state, 'player').cap, 10);

    // A villager should have been automatically assigned to build the homestead
    const builder = state.units.find(
      (u) =>
        u.team === 'player' &&
        u.kind === 'villager' &&
        u.order.type === 'build' &&
        u.order.buildingId === homestead.id,
    );
    assert.ok(builder, 'Expected a villager assigned to build the new homestead');

    for (let i = 0; i < 200 && !homestead.built; i++) {
      stepGame(state, 0.05);
    }

    assert.equal(homestead.built, true);
    assert.equal(homestead.hp, homestead.maxHp);
    assert.equal(state.stats.buildingsBuilt, 1);
    assert.equal(getTeamPop(state, 'player').cap, 15);
  });
});

describe('Combat & Monk Wololo Mechanics', () => {
  test('rock-paper-scissors combat bonuses: pikeman deals 3x vs knight and militia deals 2x vs building', () => {
    const state = createInitialState(makeNeutralSpec());
    state.enemyWaveTimer = 999;

    const pikeman = trainUnitViaBuilding(state, 'player', 'pikeman', 11, 10);
    const playerMilitia = trainUnitViaBuilding(state, 'player', 'militia', 11, 10);
    const enemyKnight = trainUnitViaBuilding(state, 'enemy', 'knight', 4, 5);
    const enemyMilitia = trainUnitViaBuilding(state, 'enemy', 'militia', 7, 5);
    const enemyBarracks = state.buildings.find((b) => b.team === 'enemy' && b.kind === 'barracks');
    assert.ok(enemyBarracks);

    // Clear active projectiles and isolate combatants in open meadow out of TC range
    state.projectiles = [];

    // 1a. Pikeman vs Enemy Militia (non-cavalry baseline = 8 dmg)
    pikeman.x = 2.5;
    pikeman.y = 9.5;
    pikeman.attackTimer = 0;
    enemyMilitia.x = 3.2;
    enemyMilitia.y = 9.5;
    enemyMilitia.attackTimer = 99;
    const militiaHpBefore = enemyMilitia.hp;
    assert.equal(cmdIssueOrder(state, 'player', [pikeman.id], 3, 9), 'attack');
    stepGame(state, 0.05);
    const basePikeDmg = militiaHpBefore - enemyMilitia.hp;
    assert.equal(basePikeDmg, UNITS.pikeman.damage); // 8

    // Park enemyMilitia away so it doesn't interfere
    enemyMilitia.x = 1.5;
    enemyMilitia.y = 1.5;
    enemyMilitia.order = { type: 'idle' };

    // 1b. Pikeman vs Enemy Knight (3x vs cavalry = 24 dmg)
    pikeman.x = 2.5;
    pikeman.y = 9.5;
    pikeman.attackTimer = 0;
    enemyKnight.x = 3.2;
    enemyKnight.y = 9.5;
    enemyKnight.attackTimer = 99;
    const knightHpBefore = enemyKnight.hp;
    assert.equal(cmdIssueOrder(state, 'player', [pikeman.id], 3, 9), 'attack');
    stepGame(state, 0.05);
    const bonusPikeDmg = knightHpBefore - enemyKnight.hp;
    assert.equal(bonusPikeDmg, UNITS.pikeman.damage * 3); // 24
    assert.equal(bonusPikeDmg, basePikeDmg * 3);

    // Park pikeman away
    pikeman.x = 11.5;
    pikeman.y = 14.5;
    pikeman.order = { type: 'idle' };

    // 2a. Militia vs Enemy Knight unit (unit baseline = 11 dmg)
    playerMilitia.x = 2.5;
    playerMilitia.y = 9.5;
    playerMilitia.attackTimer = 0;
    enemyKnight.x = 3.2;
    enemyKnight.y = 9.5;
    enemyKnight.attackTimer = 99;
    const knightHpBeforeMilitia = enemyKnight.hp;
    assert.equal(cmdIssueOrder(state, 'player', [playerMilitia.id], 3, 9), 'attack');
    stepGame(state, 0.05);
    const baseMilitiaDmg = knightHpBeforeMilitia - enemyKnight.hp;
    assert.equal(baseMilitiaDmg, UNITS.militia.damage); // 11

    // Park enemyKnight away
    enemyKnight.x = 1.5;
    enemyKnight.y = 2.5;
    enemyKnight.order = { type: 'idle' };

    // 2b. Militia vs Enemy Building (2x siege bonus = 22 dmg)
    enemyBarracks.tileX = 2;
    enemyBarracks.tileY = 8;
    enemyBarracks.hp = enemyBarracks.maxHp;
    playerMilitia.x = 2.5;
    playerMilitia.y = 9.5; // distance 0.5 to building [2..3, 8..9] <= melee range
    playerMilitia.attackTimer = 0;
    const bldHpBefore = enemyBarracks.hp;
    assert.equal(cmdIssueOrder(state, 'player', [playerMilitia.id], 2, 8), 'attack');
    stepGame(state, 0.05);
    const siegeMilitiaDmg = bldHpBefore - enemyBarracks.hp;
    assert.equal(siegeMilitiaDmg, UNITS.militia.damage * 2); // 22
    assert.equal(siegeMilitiaDmg, baseMilitiaDmg * 2);
  });

  test("Monk 'Wololo!' conversion flips enemy Knight to player team and sets cheekyWololo after taunt '30'", () => {
    const state = createInitialState(makeNeutralSpec({ modifier: 'wololo_sabbath' }));
    state.enemyWaveTimer = 999;

    const monk = trainUnitViaBuilding(state, 'player', 'monk', 11, 10);
    const enemyKnight1 = trainUnitViaBuilding(state, 'enemy', 'knight', 4, 5);
    const enemyKnight2 = trainUnitViaBuilding(state, 'enemy', 'knight', 4, 5);

    // Park all other military units far away so nobody kills the Knights mid-chant
    for (const u of state.units) {
      if (u.id !== monk.id && u.id !== enemyKnight1.id && u.id !== enemyKnight2.id && u.kind !== 'villager') {
        u.x = u.team === 'player' ? 14.5 : 1.5;
        u.y = u.team === 'player' ? 14.5 : 1.5;
        u.order = { type: 'idle' };
      }
    }
    enemyKnight2.x = 1.5;
    enemyKnight2.y = 1.5;
    enemyKnight2.order = { type: 'idle' };

    // Place Monk at (3.5, 10.5) and enemyKnight1 at (3.5, 6.3):
    // Distance = 4.2 <= Monk range (5.0), but > Knight idle aggro (3.6) and outside Enemy TC range!
    monk.x = 3.5;
    monk.y = 10.5;
    monk.monkCooldown = 0;
    enemyKnight1.x = 3.5;
    enemyKnight1.y = 6.3;
    enemyKnight1.order = { type: 'idle' };

    const goldBeforeWololo = state.resources.player.gold;
    const convertAction = cmdIssueOrder(state, 'player', [monk.id], 3, 6);
    assert.equal(convertAction, 'convert');

    for (let i = 0; i < 80 && enemyKnight1.team === 'enemy'; i++) {
      state.enemyWaveTimer = 999;
      stepGame(state, 0.05);
    }

    assert.equal(enemyKnight1.team, 'player', 'Expected enemy Knight #1 to flip to player team');
    assert.equal(state.stats.wololoConversions, 1);
    assert.equal(state.stats.cheekyWololo, false, 'cheekyWololo should remain false without taunt 30');
    assert.ok(
      state.resources.player.gold >= goldBeforeWololo + 50,
      'Expected +50 gold relic bonus under wololo_sabbath',
    );

    // Recharge monk faith, sound Taunt '30', and convert enemyKnight2 -> cheekyWololo = true!
    monk.monkCooldown = 0;
    monk.x = 3.5;
    monk.y = 10.5;
    enemyKnight1.x = 14.5;
    enemyKnight1.y = 14.5;
    enemyKnight2.x = 3.5;
    enemyKnight2.y = 6.3;
    enemyKnight2.order = { type: 'idle' };

    cmdTriggerTaunt(state, '30');
    assert.equal(state.stats.tauntsUsed, 1);
    assert.equal(cmdIssueOrder(state, 'player', [monk.id], 3, 6), 'convert');

    for (let i = 0; i < 80 && enemyKnight2.team === 'enemy'; i++) {
      state.enemyWaveTimer = 999;
      stepGame(state, 0.05);
    }

    assert.equal(enemyKnight2.team, 'player', 'Expected enemy Knight #2 to flip to player team');
    assert.equal(state.stats.wololoConversions, 2);
    assert.equal(state.stats.cheekyWololo, true, "Expected cheekyWololo=true when preceded by taunt '30'");
  });
});

describe('Score Summary & Chronicle Formatting', () => {
  test('computeScoreSummary awards crowns, combat/speed bonuses, and strategy badges accurately', () => {
    const state = createInitialState(makeNeutralSpec({ parSec: 140 }));

    // 3-crown fast Heavy Cavalry Charge victory
    state.outcome = 'victory';
    state.timeSec = 118;
    state.stats.countsByUnit.knight = 3;
    state.stats.enemyUnitsSlain = 10;
    state.stats.enemyBuildingsRazed = 3;
    const cavSummary = computeScoreSummary(state);
    assert.equal(cavSummary.victory, true);
    assert.equal(cavSummary.crowns, 3);
    assert.equal(cavSummary.strategyLabel, 'Heavy Cavalry Charge');
    assert.equal(cavSummary.strategyIcon, '🐎');
    assert.ok(cavSummary.score > 2500);

    // 2-crown Wololo Cult victory (parSec < timeSec <= parSec + 65, wololoConversions >= 2)
    state.timeSec = 180;
    state.stats.wololoConversions = 2;
    const wololoSummary = computeScoreSummary(state);
    assert.equal(wololoSummary.crowns, 2);
    assert.equal(wololoSummary.strategyLabel, 'Wololo Cult');
    assert.equal(wololoSummary.strategyIcon, '🧙');

    // 1-crown late victory (> parSec + 65)
    state.timeSec = 230;
    state.stats.wololoConversions = 0;
    state.stats.countsByUnit = { archer: 4 };
    const archerSummary = computeScoreSummary(state);
    assert.equal(archerSummary.crowns, 1);
    assert.equal(archerSummary.strategyLabel, 'Yeoman Longbow Volley');

    // Defeat -> 0 crowns
    state.outcome = 'defeat';
    const defeatSummary = computeScoreSummary(state);
    assert.equal(defeatSummary.victory, false);
    assert.equal(defeatSummary.crowns, 0);
  });

  test('formatChronicleComment renders Daily Siege, Custom Skirmish, Wololo notes, and Defeat', () => {
    const state = createInitialState(
      makeNeutralSpec({ puzzleNumber: 113, mapName: 'Gilded Basin of Antioch', parSec: 140 }),
    );
    state.outcome = 'victory';
    state.timeSec = 95; // 1:35 -> Feudal Blitz + 3 crowns
    state.stats.wololoConversions = 1;

    const dailyComment = formatChronicleComment(state, 5);
    assert.match(dailyComment, /Daily Siege #113 \(Gilded Basin of Antioch\)/);
    assert.match(dailyComment, /👑👑👑/);
    assert.match(dailyComment, /1:35/);
    assert.match(dailyComment, /Streak 5/);
    assert.match(dailyComment, /Feudal Blitz/);
    assert.match(dailyComment, /1 Wololo'd/);

    // Custom skirmish + defeat formatting
    state.spec.isCustom = true;
    state.outcome = 'defeat';
    const customDefeat = formatChronicleComment(state, 1);
    assert.match(customDefeat, /Custom Skirmish "Gilded Basin of Antioch"/);
    assert.match(customDefeat, /💀 Fallen Keep/);
  });
});

describe('AoE Pond Fish, Wild Horses, Farms, Walls & Clash Base Raids', () => {
  test('pond fish shore harvesting yields food and turns depleted pond into water', () => {
    const state = createInitialState(makeNeutralSpec());
    const fishTile = state.tiles.find((t: MapTile) => t.kind === 'fish' && t.x + t.y > 16);
    assert.ok(fishTile, 'Expected symmetric player-side pond fish tile');
    fishTile.amount = 10;

    const villager = state.units.find((u) => u.team === 'player' && u.kind === 'villager')!;
    villager.x = fishTile.x + 0.5;
    villager.y = Math.max(0.5, fishTile.y - 0.6);
    const order = cmdIssueOrder(state, 'player', [villager.id], fishTile.x, fishTile.y);
    assert.equal(order, 'gather');

    const foodBefore = state.resources.player.food;
    for (let i = 0; i < 200; i++) {
      state.enemyWaveTimer = 999;
      stepGame(state, 0.05);
    }
    assert.ok(state.resources.player.food > foodBefore, 'Expected shore fishing to increase player food');
    assert.equal(fishTile.kind, 'water', 'Depleted fish pond should become water, not grass');
  });

  test('wild horses tame on unit proximity (+35 food) and boost cavalry speed', () => {
    const state = createInitialState(makeNeutralSpec());
    assert.ok((state.horses?.length ?? 0) >= 4, 'Expected symmetric wild horses on initial map');
    const wild = state.horses!.find((h) => h.team === 'neutral')!;
    const scout = state.units.find((u) => u.team === 'player' && u.kind === 'scout')!;
    const baseSpeed = getEffectiveUnitStats(state.spec, 'player', 'scout', 0).speed;

    const foodBefore = state.resources.player.food;
    scout.x = wild.x + 0.3;
    scout.y = wild.y + 0.3;
    stepGame(state, 0.05);

    assert.equal(wild.team, 'player');
    assert.equal(countTamedHorses(state, 'player'), 1);
    assert.equal(state.resources.player.food, foodBefore + 35);
    const boostedSpeed = getEffectiveUnitStats(state.spec, 'player', 'scout', 1).speed;
    assert.ok(boostedSpeed > baseSpeed, 'Expected tamed horse to boost Scout Cavalry speed');
  });

  test('farms remain walkable while stone walls block movement, and base blueprints round-trip into raids', () => {
    const builder = createBaseBuilderState(null, 'LadyAethelflaed');
    assert.equal(builder.mode, 'base_builder');
    assert.equal(builder.buildings.filter((b) => b.team === 'enemy').length, 0);

    const farm = cmdPlaceBuilding(builder, 'player', 'farm', 11, 12);
    const wall = cmdPlaceBuilding(builder, 'player', 'stone_wall', 8, 10);
    assert.ok(farm, 'Expected farm placement to succeed');
    assert.ok(wall, 'Expected stone_wall placement to succeed');
    farm!.built = true;
    wall!.built = true;

    const blocked = buildBlockedGrid(builder.tiles, builder.buildings, builder.mapSize);
    assert.equal(blocked[12 * builder.mapSize + 11], 0, 'Wheat farms must remain walkable');
    assert.equal(blocked[10 * builder.mapSize + 8], 1, 'Stone walls must block enemy pathing');

    const friendlyBlocked = buildBlockedGrid(
      builder.tiles,
      builder.buildings,
      builder.mapSize,
      undefined,
      'player',
    );
    const enemyBlocked = buildBlockedGrid(
      builder.tiles,
      builder.buildings,
      builder.mapSize,
      undefined,
      'enemy',
    );
    assert.equal(
      friendlyBlocked[10 * builder.mapSize + 8],
      0,
      'Friendly stone walls act as passable portcullis gates for same-team units',
    );
    assert.equal(
      enemyBlocked[10 * builder.mapSize + 8],
      1,
      'Stone walls block opposing-team invaders',
    );

    const blueprint = exportBaseBlueprint(builder, 'LadyAethelflaed', 'Iron Pond Keep');
    assert.equal(blueprint.owner, 'LadyAethelflaed');
    assert.ok(blueprint.buildings.some((b) => b.kind === 'stone_wall'));
    assert.ok(blueprint.buildings.some((b) => b.kind === 'farm'));

    const raid = createPlayerRaidState(blueprint, 'vikings');
    assert.equal(raid.mode, 'raid');
    assert.equal(raid.raidTargetOwner, 'LadyAethelflaed');
    assert.ok(
      raid.buildings.some((b) => b.team === 'enemy' && b.kind === 'stone_wall'),
      'Expected defender walls spawned on raid battlefield',
    );
    assert.ok(
      raid.buildings.some((b) => b.team === 'enemy' && b.kind === 'town_center'),
      'Expected defender Town Center spawned on raid battlefield',
    );
  });

  test('fluffy sheep herd on proximity (+45 food) and wild boars yield +120 food when hunted', () => {
    const state = createInitialState(makeNeutralSpec());
    state.enemyWaveTimer = 999;

    const sheep = state.horses?.find((h) => h.kind === 'sheep' && h.team === 'neutral');
    const boar = state.horses?.find((h) => h.kind === 'boar' && h.team === 'neutral');
    assert.ok(sheep, 'Expected symmetric neutral fluffy sheep on initial map');
    assert.ok(boar, 'Expected symmetric neutral wild boar on initial map');

    const scout = state.units.find((u) => u.team === 'player' && u.kind === 'scout')!;
    const foodBeforeSheep = state.resources.player.food;
    scout.x = sheep.x + 0.25;
    scout.y = sheep.y + 0.25;
    stepGame(state, 0.05);
    assert.equal(sheep.team, 'player', 'Expected sheep to join player flock');
    assert.equal(state.resources.player.food, foodBeforeSheep + 45);
    assert.equal(state.stats.sheepHerded, 1);

    const militia = trainUnitViaBuilding(state, 'player', 'militia', 11, 10);
    for (const u of state.units) {
      if (u.kind === 'villager') u.order = { type: 'idle' };
    }
    for (const h of state.horses ?? []) {
      if (h.id !== boar.id && h.team === 'neutral') {
        h.x = 14.5;
        h.y = 14.5;
        h.targetX = 14.5;
        h.targetY = 14.5;
      }
    }
    const foodBeforeBoar = state.resources.player.food;
    militia.x = boar.x + 0.3;
    militia.y = boar.y + 0.3;
    militia.order = { type: 'idle' };
    scout.x = boar.x - 0.3;
    scout.y = boar.y - 0.3;
    scout.order = { type: 'idle' };

    for (let i = 0; i < 60 && state.horses?.some((h) => h.id === boar.id); i++) {
      state.enemyWaveTimer = 999;
      stepGame(state, 0.05);
    }

    assert.equal(
      state.horses?.some((h) => h.id === boar.id),
      false,
      'Expected hunted wild boar to be cleared once HP reaches 0',
    );
    assert.equal(state.resources.player.food, foodBeforeBoar + 120);
    assert.equal(state.stats.boarsHunted, 1);
  });

  test('Castle Age progression buffs TC & units (+15%) and unlocks Counterweight Trebuchet (90 siege boulder damage)', () => {
    const state = createInitialState(makeNeutralSpec());
    state.enemyWaveTimer = 999;

    const tower = cmdPlaceBuilding(state, 'player', 'watchtower', 11, 10);
    assert.ok(tower, 'Expected watchtower placement to succeed');
    tower.built = true;
    tower.hp = tower.maxHp;

    state.resources.player = { wood: 300, food: 300, gold: 300 };
    assert.equal(
      cmdTrainUnit(state, 'player', 'trebuchet', tower.id),
      false,
      'Trebuchet must remain locked in Feudal Age (Age 1)',
    );

    const playerTc = state.buildings.find((b) => b.team === 'player' && b.kind === 'town_center')!;
    const tcMaxBefore = playerTc.maxHp;
    const militiaAge1 = getEffectiveUnitStats(state.spec, 'player', 'militia', 0, 1);

    const advanced = cmdAdvanceAge(state, 'player');
    assert.equal(advanced, true, 'Expected cmdAdvanceAge to succeed with sufficient Food & Gold');
    assert.equal(state.ages?.player, 2);
    assert.equal(state.resources.player.food, 300 - CASTLE_AGE_COST.food);
    assert.equal(state.resources.player.gold, 300 - CASTLE_AGE_COST.gold);
    assert.equal(playerTc.maxHp, tcMaxBefore + 250);
    assert.equal(cmdAdvanceAge(state, 'player'), false, 'Cannot advance past Castle Age II');

    const militiaAge2 = getEffectiveUnitStats(state.spec, 'player', 'militia', 0, 2);
    assert.equal(militiaAge2.maxHp, Math.round(militiaAge1.maxHp * 1.15));
    assert.equal(militiaAge2.damage, Math.round(militiaAge1.damage * 1.15));

    const trebuchet = trainUnitViaBuilding(state, 'player', 'trebuchet', 11, 10);
    assert.equal(trebuchet.kind, 'trebuchet');

    for (const u of state.units) {
      if (u.id !== trebuchet.id) {
        u.order = { type: 'idle' };
        if (u.kind !== 'villager') {
          u.x = u.team === 'player' ? 14.5 : 1.5;
          u.y = u.team === 'player' ? 14.5 : 1.5;
        }
      }
    }
    state.projectiles = [];

    const enemyWall: Building = {
      id: state.nextId++,
      team: 'enemy',
      kind: 'stone_wall',
      tileX: 5,
      tileY: 5,
      size: 1,
      hp: BUILDINGS.stone_wall.maxHp,
      maxHp: BUILDINGS.stone_wall.maxHp,
      built: true,
      buildProgress: 1,
      queue: [],
      rallyX: 5.5,
      rallyY: 6.2,
      attackTimer: 0,
    };
    state.buildings.push(enemyWall);

    trebuchet.x = 5.5;
    trebuchet.y = 11.5;
    trebuchet.attackTimer = 0;
    assert.equal(cmdIssueOrder(state, 'player', [trebuchet.id], 5, 5), 'attack');

    stepGame(state, 0.05);
    const boulder = state.projectiles.find((p) => p.kind === 'boulder');
    assert.ok(boulder, 'Expected trebuchet to launch a boulder projectile');
    assert.equal(boulder.damage, 90, 'Expected 90 siege damage vs building');

    const wallHpBefore = enemyWall.hp;
    for (let i = 0; i < 60 && state.projectiles.some((p) => p.id === boulder.id); i++) {
      state.enemyWaveTimer = 999;
      stepGame(state, 0.05);
    }
    assert.equal(wallHpBefore - enemyWall.hp, 90);
  });

  test('cmdDemolishBuilding refunds 75% cost while protecting Town Center, and computeRaidDestruction tracks stars', () => {
    const builder = createBaseBuilderState(null, 'MasterBuilder');
    const tc = builder.buildings.find((b) => b.kind === 'town_center')!;
    assert.equal(
      cmdDemolishBuilding(builder, 'player', tc.tileX, tc.tileY),
      false,
      'Must never demolish own Town Center',
    );

    const towerCost = getEffectiveBuildingCost(builder.spec, 'player', 'watchtower');
    const placed = cmdPlaceBuilding(builder, 'player', 'watchtower', 8, 10);
    assert.ok(placed);
    const woodAfterPlace = builder.resources.player.wood;
    const goldAfterPlace = builder.resources.player.gold;

    assert.equal(cmdDemolishBuilding(builder, 'player', 8, 10), true);
    assert.equal(builder.resources.player.wood, woodAfterPlace + Math.round(towerCost.wood * 0.75));
    assert.equal(builder.resources.player.gold, goldAfterPlace + Math.round(towerCost.gold * 0.75));
    assert.equal(
      builder.buildings.some((b) => b.id === placed.id),
      false,
      'Demolished building must be removed from state.buildings',
    );

    const bp = exportBaseBlueprint(builder, 'DefenderX', 'Granite Citadel');
    bp.buildings.push(
      { kind: 'watchtower', tileX: 8, tileY: 10 },
      { kind: 'barracks', tileX: 11, tileY: 11 },
      { kind: 'stone_wall', tileX: 9, tileY: 10 },
    );
    const raid = createPlayerRaidState(bp, 'franks');
    assert.deepEqual(computeRaidDestruction(raid), { destructionPct: 0, raidStars: 0 });

    const nonTc = raid.buildings.filter((b) => b.team === 'enemy' && b.kind !== 'town_center');
    for (const b of nonTc) b.hp = 0;
    raid.buildings = raid.buildings.filter((b) => b.hp > 0);
    raid.stats.enemyBuildingsRazed = nonTc.length;

    const mid = computeRaidDestruction(raid);
    assert.ok(mid.destructionPct >= 50 && mid.destructionPct < 100);
    assert.equal(mid.raidStars, 1);

    raid.buildings = raid.buildings.filter((b) => b.team !== 'enemy');
    raid.stats.enemyBuildingsRazed += 1;
    raid.outcome = 'victory';
    raid.timeSec = 95;
    assert.deepEqual(computeRaidDestruction(raid), { destructionPct: 100, raidStars: 3 });
  });
});
