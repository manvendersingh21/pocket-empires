import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type {
  AIPersonaId,
  BiomeId,
  BuildingKind,
  CivId,
  DailyModifierId,
  GameOutcome,
  GameState,
  SkirmishSpec,
  TauntId,
  Team,
  UnitKind,
} from '../src/types/rts.ts';

// Allow Node native TypeScript loader to resolve TypeScript siblings imported with `.js` specifiers.
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

const { BIOMES, BUILDINGS, CIVS, DAILY_MODIFIERS, MAP_SIZE, TAUNTS, UNITS } = await import(
  '../src/types/rts.ts'
);
const { createRng, pick } = await import('../src/engine/rng.ts');
const {
  ENEMY_TC_POS,
  PLAYER_TC_POS,
  buildMapTiles,
  decodeSkirmishCode,
  encodeSkirmishCode,
} = await import('../src/engine/dailyGenerator.ts');
const { buildBlockedGrid, findPath, inBounds } = await import('../src/engine/pathfinding.ts');
const {
  POP_HARD_CAP,
  cmdAttackEnemyKeep,
  cmdCancelQueueItem,
  cmdIssueOrder,
  cmdPlaceBuilding,
  cmdRingTownBell,
  cmdSetRallyPoint,
  cmdTrainUnit,
  cmdTriggerTaunt,
  computeScoreSummary,
  createInitialState,
  getTeamPop,
  stepGame,
} = await import('../src/engine/sim.ts');

const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
const CIV_IDS = Object.keys(CIVS) as CivId[];
const MODIFIER_IDS = Object.keys(DAILY_MODIFIERS) as DailyModifierId[];
const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
const UNIT_KINDS = Object.keys(UNITS) as UnitKind[];
const TAUNT_IDS = TAUNTS.map((t) => t.id) as TauntId[];
const PERSONA_IDS: readonly AIPersonaId[] = [
  'longbow_earl',
  'knight_baron',
  'viking_jarl',
  'monk_abbot',
];
const CHOKE_STYLES: readonly SkirmishSpec['chokepointStyle'][] = [
  'twin_fords',
  'central_bridge',
  ' canyon_pass',
  'open_steppe',
];
const TEAMS: readonly Team[] = ['player', 'enemy'];

/**
 * Exact 180-degree half-map partition around map center (7.5, 7.5).
 * 4*x + 10*y - 105 is always odd for integer (x, y) and negates under (x, y) -> (15 - x, 15 - y).
 */
function sideForTile(x: number, y: number): Team {
  return 4 * x + 10 * y - 105 > 0 ? 'player' : 'enemy';
}

/**
 * Generates a deterministic fuzzed `SkirmishSpec` from `rng`, ensuring coverage across
 * boundary seeds, biomes, civ pairs, modifiers, AI personas, and chokepoint styles.
 */
function generateFuzzedSpec(rng: () => number, index: number): SkirmishSpec {
  const edgeSeeds = [0, 1, 0x7fffffff, 0x80000000, 0xffffffff];
  const seed =
    index < edgeSeeds.length ? edgeSeeds[index] : ((Math.floor(rng() * 0x100000000) >>> 0) || 42);

  const biome = BIOME_IDS[(index + Math.floor(rng() * BIOME_IDS.length)) % BIOME_IDS.length];
  const playerCiv = CIV_IDS[(index + Math.floor(rng() * CIV_IDS.length)) % CIV_IDS.length];
  const enemyChoices = CIV_IDS.filter((c) => c !== playerCiv);
  const enemyCiv = pick(rng, enemyChoices);
  const modifier =
    MODIFIER_IDS[(index + Math.floor(rng() * MODIFIER_IDS.length)) % MODIFIER_IDS.length];
  const aiPersona =
    PERSONA_IDS[(index + Math.floor(rng() * PERSONA_IDS.length)) % PERSONA_IDS.length];
  const chokepointStyle =
    CHOKE_STYLES[(index + Math.floor(rng() * CHOKE_STYLES.length)) % CHOKE_STYLES.length];
  const parSec = 110 + Math.floor(rng() * 55);
  const bonusPool = [undefined, 0, 25, 60, 100] as const;
  const startingGoldBonus = pick(rng, bonusPool);

  return {
    seed,
    dateKey: `2026-12-${String((index % 28) + 1).padStart(2, '0')}`,
    puzzleNumber: index + 1,
    mapName: `Fuzz Battlefield #${index + 1}`,
    biome,
    playerCiv,
    enemyCiv,
    aiPersona,
    aiLeaderName: `Lord Fuzz ${index + 1}`,
    modifier,
    parSec,
    ...(startingGoldBonus !== undefined ? { startingGoldBonus } : {}),
    chokepointStyle,
    isCustom: index % 2 === 1,
  };
}

/**
 * Recursively walks any JS value and asserts zero `NaN` or non-finite numbers exist anywhere.
 */
function assertZeroNaNDeep(value: unknown, pathLabel: string): void {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${pathLabel} must be finite, got ${value}`);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertZeroNaNDeep(value[i], `${pathLabel}[${i}]`);
    }
    return;
  }

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertZeroNaNDeep(v, `${pathLabel}.${k}`);
  }
}

/**
 * Verifies all core `GameState` simulation invariants on every fuzzed tick.
 */
function assertStateInvariants(state: GameState, contextLabel: string): void {
  // 1. Zero NaN / Infinity anywhere in GameState
  assertZeroNaNDeep(state, `${contextLabel}.state`);

  // 2. Map & Fog structural invariants
  assert.equal(state.mapSize, MAP_SIZE, `${contextLabel}: mapSize`);
  assert.equal(state.tiles.length, MAP_SIZE * MAP_SIZE, `${contextLabel}: tiles length`);
  assert.equal(state.fog.length, MAP_SIZE * MAP_SIZE, `${contextLabel}: fog length`);
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    assert.ok(t.amount >= 0 && t.amount <= t.maxAmount, `${contextLabel}: tile[${i}] amount bounds`);
    const f = state.fog[i];
    assert.ok(f === 0 || f === 1 || f === 2, `${contextLabel}: fog[${i}] valid FogState`);
  }

  // 3. Resources >= 0 & Population within [0, POP_HARD_CAP] for both teams
  for (const team of TEAMS) {
    const r = state.resources[team];
    assert.ok(r.wood >= 0, `${contextLabel}: ${team} wood >= 0 (got ${r.wood})`);
    assert.ok(r.food >= 0, `${contextLabel}: ${team} food >= 0 (got ${r.food})`);
    assert.ok(r.gold >= 0, `${contextLabel}: ${team} gold >= 0 (got ${r.gold})`);

    const pop = getTeamPop(state, team);
    assert.ok(
      pop.current >= 0 && pop.current <= POP_HARD_CAP,
      `${contextLabel}: ${team} pop.current ${pop.current} outside [0, ${POP_HARD_CAP}]`,
    );
    assert.ok(
      pop.cap >= 5 && pop.cap <= POP_HARD_CAP,
      `${contextLabel}: ${team} pop.cap ${pop.cap} outside [5, ${POP_HARD_CAP}]`,
    );
  }

  // 4. Living unit HP & coordinate bounds: 0 < unit.hp <= unit.maxHp, 0 <= x, y < MAP_SIZE
  for (const u of state.units) {
    assert.ok(
      u.hp > 0 && u.hp <= u.maxHp,
      `${contextLabel}: unit #${u.id} (${u.kind}) hp=${u.hp} outside (0, ${u.maxHp}]`,
    );
    assert.ok(
      u.x >= 0 && u.x < MAP_SIZE && u.y >= 0 && u.y < MAP_SIZE,
      `${contextLabel}: unit #${u.id} (${u.kind}) coords (${u.x}, ${u.y}) outside [0, ${MAP_SIZE})`,
    );
    assert.ok(
      u.carryAmount >= 0 && u.carryAmount <= 10,
      `${contextLabel}: unit #${u.id} carryAmount=${u.carryAmount}`,
    );
    for (const wp of u.path) {
      assert.ok(
        wp.x >= 0 && wp.x < MAP_SIZE && wp.y >= 0 && wp.y < MAP_SIZE,
        `${contextLabel}: unit #${u.id} waypoint (${wp.x}, ${wp.y}) outside [0, ${MAP_SIZE})`,
      );
    }
  }

  // 5. Living building HP, progress & footprint bounds
  for (const b of state.buildings) {
    assert.ok(
      b.hp > 0 && b.hp <= b.maxHp,
      `${contextLabel}: building #${b.id} (${b.kind}) hp=${b.hp} outside (0, ${b.maxHp}]`,
    );
    assert.ok(
      b.tileX >= 0 &&
        b.tileY >= 0 &&
        b.tileX + b.size <= MAP_SIZE &&
        b.tileY + b.size <= MAP_SIZE,
      `${contextLabel}: building #${b.id} footprint (${b.tileX}, ${b.tileY}, size=${b.size}) out of bounds`,
    );
    assert.ok(
      b.buildProgress >= 0 && b.buildProgress <= 1,
      `${contextLabel}: building #${b.id} buildProgress=${b.buildProgress}`,
    );
  }
}

describe('Property-Based Fuzz Suite (High-Trust Playbook Layer 3)', () => {
  test('50 fuzzed SkirmishSpec seeds satisfy 180-degree tile/resource symmetry and bidirectional A* TC-to-TC connectivity', () => {
    const rng = createRng(0x5eed_2026);

    for (let i = 0; i < 50; i++) {
      const spec = generateFuzzedSpec(rng, i);
      const label = `FuzzSpec[${i}] seed=0x${spec.seed.toString(16)} (${spec.biome}/${spec.chokepointStyle.trim()}/${spec.modifier})`;

      const tiles = buildMapTiles(spec);
      assert.equal(tiles.length, MAP_SIZE * MAP_SIZE, `${label}: expected 256 tiles`);

      const halfResources = {
        player: { wood: 0, berry: 0, gold: 0 },
        enemy: { wood: 0, berry: 0, gold: 0 },
      };

      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          const tile = tiles[y * MAP_SIZE + x];
          const mirror = tiles[(MAP_SIZE - 1 - y) * MAP_SIZE + (MAP_SIZE - 1 - x)];

          assert.equal(tile.x, x, `${label}: tile.x mismatch`);
          assert.equal(tile.y, y, `${label}: tile.y mismatch`);
          assert.equal(
            tile.kind,
            mirror.kind,
            `${label}: 180-deg kind asymmetry at (${x},${y})=${tile.kind} vs (${MAP_SIZE - 1 - x},${MAP_SIZE - 1 - y})=${mirror.kind}`,
          );
          assert.equal(
            tile.amount,
            mirror.amount,
            `${label}: 180-deg amount asymmetry at (${x},${y})=${tile.amount} vs ${mirror.amount}`,
          );
          assert.equal(
            tile.maxAmount,
            mirror.maxAmount,
            `${label}: 180-deg maxAmount asymmetry at (${x},${y})`,
          );

          const side = sideForTile(x, y);
          if (tile.kind === 'forest') halfResources[side].wood += tile.amount;
          if (tile.kind === 'berry') halfResources[side].berry += tile.amount;
          if (tile.kind === 'gold') halfResources[side].gold += tile.amount;
        }
      }

      // Both empires must receive positive and strictly identical Wood, Berry, and Gold reserves
      for (const resKey of ['wood', 'berry', 'gold'] as const) {
        assert.ok(halfResources.player[resKey] > 0, `${label}: zero ${resKey} on player half`);
        assert.equal(
          halfResources.player[resKey],
          halfResources.enemy[resKey],
          `${label}: ${resKey} imbalance ${halfResources.player[resKey]} !== ${halfResources.enemy[resKey]}`,
        );
      }

      // Verify unbroken bidirectional A* TC-to-TC connectivity with both 2x2 Town Centers placed
      const initState = createInitialState(spec);
      assertStateInvariants(initState, `${label}:init`);

      // Verify symmetric Sacred Relics
      assert.equal(initState.relics?.length, 2, `${label}: expected 2 Sacred Relics`);
      const [rel0, rel1] = initState.relics!;
      assert.ok(
        Math.abs(rel0.x + rel1.x - MAP_SIZE) < 1e-6 &&
          Math.abs(rel0.y + rel1.y - MAP_SIZE) < 1e-6,
        `${label}: 180-deg Sacred Relic asymmetry`,
      );

      const blocked = buildBlockedGrid(initState.tiles, initState.buildings, initState.mapSize);
      const pCourtX = PLAYER_TC_POS.x + 0.5;
      const pCourtY = PLAYER_TC_POS.y - 0.5;
      const eGoalTileX = ENEMY_TC_POS.x + 1;
      const eGoalTileY = ENEMY_TC_POS.y + 2;

      const forwardPath = findPath(
        blocked,
        initState.mapSize,
        pCourtX,
        pCourtY,
        eGoalTileX,
        eGoalTileY,
      );
      assert.ok(forwardPath.length > 0, `${label}: broken A* path Player TC -> Enemy TC`);
      assert.deepEqual(
        forwardPath[forwardPath.length - 1],
        { x: eGoalTileX + 0.5, y: eGoalTileY + 0.5 },
        `${label}: forward A* path missed Enemy TC courtyard`,
      );

      let prevX = pCourtX;
      let prevY = pCourtY;
      for (const wp of forwardPath) {
        const tx = Math.floor(wp.x);
        const ty = Math.floor(wp.y);
        assert.ok(inBounds(tx, ty, MAP_SIZE), `${label}: waypoint (${tx},${ty}) out of bounds`);
        assert.equal(blocked[ty * MAP_SIZE + tx], 0, `${label}: waypoint stepped onto blocked tile`);
        assert.ok(
          Math.hypot(wp.x - prevX, wp.y - prevY) <= Math.SQRT2 + 0.05,
          `${label}: discontinuous A* step (${prevX},${prevY}) -> (${wp.x},${wp.y})`,
        );
        // Verify diagonal steps never squeeze past blocked orthogonal corners
        const ptx = Math.floor(prevX);
        const pty = Math.floor(prevY);
        if (tx !== ptx && ty !== pty) {
          assert.equal(
            blocked[pty * MAP_SIZE + tx],
            0,
            `${label}: diagonal corner-cut across (${tx},${pty})`,
          );
          assert.equal(
            blocked[ty * MAP_SIZE + ptx],
            0,
            `${label}: diagonal corner-cut across (${ptx},${ty})`,
          );
        }
        prevX = wp.x;
        prevY = wp.y;
      }

      const reversePath = findPath(
        blocked,
        initState.mapSize,
        eGoalTileX + 0.5,
        eGoalTileY + 0.5,
        PLAYER_TC_POS.x,
        PLAYER_TC_POS.y - 1,
      );
      assert.ok(reversePath.length > 0, `${label}: broken reverse A* path Enemy TC -> Player TC`);

      // Share code encoding/decoding preserves core tactical configuration
      const code = encodeSkirmishCode(spec);
      const decoded = decodeSkirmishCode(code);
      assert.ok(decoded, `${label}: decodeSkirmishCode failed for ${code}`);
      assert.equal(decoded.biome, spec.biome);
      assert.equal(decoded.playerCiv, spec.playerCiv);
      assert.equal(decoded.enemyCiv, spec.enemyCiv);
      assert.equal(decoded.modifier, spec.modifier);
      assert.equal(decoded.chokepointStyle, spec.chokepointStyle);
      assert.equal(decoded.aiPersona, spec.aiPersona);
    }
  });

  test('300-tick randomized command fuzzer preserves resource, population, HP, coordinate, zero-NaN, and terminal-state invariants', () => {
    const rng = createRng(0xbadc0ffe);
    const campaigns = 12;
    const ticksPerCampaign = 300;
    let sawAbsorbingVictory = false;
    let sawAbsorbingDefeat = false;
    let postTerminalTicksVerified = 0;

    for (let run = 0; run < campaigns; run++) {
      const spec = generateFuzzedSpec(rng, run * 3 + 7);
      const state = createInitialState(spec);
      let lockedOutcome: GameOutcome | null = null;

      // Inject extra treasury on odd runs so the fuzzer heavily exercises building + unit queues + Monk Wololo
      if (run % 2 === 1) {
        state.resources.player.wood += 350;
        state.resources.player.food += 350;
        state.resources.player.gold += 350;
        state.resources.enemy.wood += 250;
        state.resources.enemy.food += 250;
        state.resources.enemy.gold += 250;
      }

      assertStateInvariants(state, `Campaign[${run}]:init`);

      for (let tick = 0; tick < ticksPerCampaign; tick++) {
        // Snapshot frozen fields if already in a terminal state
        const preSnapshot =
          lockedOutcome !== null
            ? {
                timeSec: state.timeSec,
                tick: state.tick,
                playerRes: { ...state.resources.player },
                enemyRes: { ...state.resources.enemy },
                unitCount: state.units.length,
                buildingCount: state.buildings.length,
              }
            : null;

        // Issue 1..3 randomized engine commands before stepping the simulation
        const actionsThisTick = 1 + Math.floor(rng() * 3);
        for (let a = 0; a < actionsThisTick; a++) {
          const team = pick(rng, TEAMS);
          const roll = rng();

          if (roll < 0.24) {
            // Fuzz cmdPlaceBuilding (including out-of-bounds, fogged, & courtyard coordinates)
            const bKind = pick(rng, BUILDING_KINDS);
            const nearBase = rng() < 0.7;
            const anchor = team === 'player' ? PLAYER_TC_POS : ENEMY_TC_POS;
            const tx = nearBase
              ? anchor.x + Math.floor(rng() * 9) - 4
              : Math.floor(rng() * 24) - 4;
            const ty = nearBase
              ? anchor.y + Math.floor(rng() * 9) - 4
              : Math.floor(rng() * 24) - 4;
            const teamUnitIds = state.units
              .filter((u) => u.team === team)
              .slice(0, 2)
              .map((u) => u.id);
            const placed = cmdPlaceBuilding(
              state,
              team,
              bKind,
              tx,
              ty,
              rng() < 0.5 ? teamUnitIds : [-1, 999999],
            );
            if (lockedOutcome !== null) {
              assert.equal(placed, null, 'cmdPlaceBuilding must return null after terminal state');
            }
          } else if (roll < 0.52) {
            // Fuzz cmdTrainUnit across all unit kinds & optional building IDs
            const uKind = pick(rng, UNIT_KINDS);
            const maybeBldId =
              rng() < 0.4 && state.buildings.length > 0
                ? pick(rng, state.buildings).id
                : rng() < 0.2
                  ? 999999
                  : undefined;
            const trained = cmdTrainUnit(state, team, uKind, maybeBldId);
            if (lockedOutcome !== null) {
              assert.equal(trained, false, 'cmdTrainUnit must return false after terminal state');
            }
          } else if (roll < 0.82) {
            // Fuzz cmdIssueOrder with valid, mixed-team, dead, empty, and out-of-bounds coordinates
            const teamUnits = state.units.filter((u) => u.team === team);
            const selectedIds: number[] = [];
            for (const u of teamUnits) {
              if (rng() < 0.45) selectedIds.push(u.id);
            }
            if (rng() < 0.15) selectedIds.push(-42, 888888);
            const targetX = Math.floor(rng() * 22) - 3;
            const targetY = Math.floor(rng() * 22) - 3;
            const resOrder = cmdIssueOrder(state, team, selectedIds, targetX, targetY);
            if (lockedOutcome !== null) {
              assert.equal(resOrder, null, 'cmdIssueOrder must return null after terminal state');
            }
          } else if (roll < 0.88) {
            // Fuzz cmdAttackEnemyKeep
            cmdAttackEnemyKeep(state, team);
          } else if (roll < 0.93 && state.buildings.length > 0) {
            // Fuzz cmdSetRallyPoint & cmdCancelQueueItem
            const b = pick(rng, state.buildings);
            const setOk = cmdSetRallyPoint(
              state,
              team,
              b.id,
              Math.floor(rng() * 18) - 1,
              Math.floor(rng() * 18) - 1,
            );
            const cancelOk = cmdCancelQueueItem(state, team, b.id, 0);
            if (lockedOutcome !== null) {
              assert.equal(setOk, false, 'cmdSetRallyPoint must return false after terminal state');
              assert.equal(cancelOk, false, 'cmdCancelQueueItem must return false after terminal state');
            }
          } else if (roll < 0.97) {
            const bellOk = cmdRingTownBell(state, team);
            if (lockedOutcome !== null) {
              assert.equal(bellOk, false, 'cmdRingTownBell must return false after terminal state');
            }
          } else {
            // Fuzz cmdTriggerTaunt
            cmdTriggerTaunt(state, pick(rng, TAUNT_IDS));
          }
        }

        // On two dedicated campaigns, breach Enemy/Player Keep at tick 180 so ticks 181..299 fuzz terminal state!
        if (run === 4 && tick === 180 && state.outcome === 'playing') {
          const enemyTc = state.buildings.find(
            (b) => b.team === 'enemy' && b.kind === 'town_center' && b.hp > 0,
          );
          const striker = state.units.find((u) => u.team === 'player' && u.kind !== 'monk');
          if (enemyTc && striker) {
            enemyTc.hp = 1;
            striker.x = enemyTc.tileX + 1;
            striker.y = enemyTc.tileY + 2.2;
            striker.attackTimer = 0;
            cmdIssueOrder(state, 'player', [striker.id], enemyTc.tileX, enemyTc.tileY);
          }
        } else if (run === 9 && tick === 180 && state.outcome === 'playing') {
          const playerTc = state.buildings.find(
            (b) => b.team === 'player' && b.kind === 'town_center' && b.hp > 0,
          );
          const raider = state.units.find((u) => u.team === 'enemy' && u.kind !== 'monk');
          if (playerTc && raider) {
            playerTc.hp = 1;
            raider.x = playerTc.tileX + 1;
            raider.y = playerTc.tileY - 0.2;
            raider.attackTimer = 0;
            cmdIssueOrder(state, 'enemy', [raider.id], playerTc.tileX, playerTc.tileY);
          }
        }

        // Step simulation (standard 20Hz 0.05s or jittered positive dt)
        const dt = run % 3 === 0 ? 0.05 : 0.04 + rng() * 0.04;
        stepGame(state, dt);

        assertStateInvariants(state, `Campaign[${run}] tick=${tick} outcome=${state.outcome}`);

        // Verify absorbing terminal victory | defeat state
        if (lockedOutcome !== null && preSnapshot !== null) {
          postTerminalTicksVerified++;
          assert.equal(
            state.outcome,
            lockedOutcome,
            `Terminal outcome "${lockedOutcome}" must be absorbing and never revert`,
          );
          assert.equal(state.timeSec, preSnapshot.timeSec, 'timeSec must freeze in terminal state');
          assert.equal(state.tick, preSnapshot.tick, 'tick must freeze in terminal state');
          assert.deepEqual(
            state.resources.player,
            preSnapshot.playerRes,
            'player resources must freeze in terminal state',
          );
          assert.deepEqual(
            state.resources.enemy,
            preSnapshot.enemyRes,
            'enemy resources must freeze in terminal state',
          );
          assert.equal(
            state.units.length,
            preSnapshot.unitCount,
            'unit count must freeze in terminal state',
          );
          assert.equal(
            state.buildings.length,
            preSnapshot.buildingCount,
            'building count must freeze in terminal state',
          );
        } else if (state.outcome === 'victory' || state.outcome === 'defeat') {
          lockedOutcome = state.outcome;
          if (state.outcome === 'victory') sawAbsorbingVictory = true;
          if (state.outcome === 'defeat') sawAbsorbingDefeat = true;
          const summary = computeScoreSummary(state);
          assertZeroNaNDeep(summary, `Campaign[${run}]:scoreSummary`);
          assert.equal(summary.victory, state.outcome === 'victory');
          if (state.outcome === 'defeat') {
            assert.equal(summary.crowns, 0);
          } else {
            assert.ok(summary.crowns >= 1 && summary.crowns <= 3);
          }
        }
      }
    }

    assert.equal(sawAbsorbingVictory, true, 'Expected fuzzer to verify absorbing victory state');
    assert.equal(sawAbsorbingDefeat, true, 'Expected fuzzer to verify absorbing defeat state');
    assert.ok(
      postTerminalTicksVerified >= 200,
      `Expected >= 200 post-terminal fuzz ticks verified, got ${postTerminalTicksVerified}`,
    );
  });
});
