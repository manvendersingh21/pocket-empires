/**
 * Headless Daily Balance Verifier & Simulated Siege Runner (`npm run verify:levels`)
 *
 * Verifies 30 consecutive Daily Sieges (2026-11-01 through 2026-11-30):
 *  1. Valid SkirmishSpec, distinct playerCiv !== enemyCiv, positive puzzleNumber.
 *  2. 180-degree rotational map symmetry & exact Wood/Berry/Gold resource fairness.
 *  3. Unbroken A* pathfinding across central river/canyon crossings between Town Centers.
 *  4. Round-trip encodeSkirmishCode -> decodeSkirmishCode fidelity.
 *  5. Full headless simulated match(es) where a scripted Player Commander gathers resources,
 *     constructs a Barracks & Stable, trains Knights + Men-at-Arms, marches across the ford
 *     (`cmdAttackEnemyKeep`), and razes the Enemy Town Center (`state.outcome === 'victory'`)
 *     within <= 240s with zero NaN coordinates!
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

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

const { BIOMES, CIVS, DAILY_MODIFIERS, MAP_SIZE } = await import('../src/types/rts.ts');
const {
  ENEMY_TC_POS,
  PLAYER_TC_POS,
  buildMapTiles,
  decodeSkirmishCode,
  encodeSkirmishCode,
  generateDailySpec,
} = await import('../src/engine/dailyGenerator.ts');
const { buildBlockedGrid, findPath, inBounds } = await import('../src/engine/pathfinding.ts');
const {
  cmdAttackEnemyKeep,
  cmdIssueOrder,
  cmdPlaceBuilding,
  cmdTrainUnit,
  computeScoreSummary,
  createInitialState,
  stepGame,
} = await import('../src/engine/sim.ts');

const VALID_PERSONAS = new Set(['longbow_earl', 'knight_baron', 'viking_jarl', 'monk_abbot']);
const VALID_CHOKES = new Set(['twin_fords', 'central_bridge', ' canyon_pass', 'open_steppe']);

let failures = 0;
function fail(msg) {
  failures++;
  console.error(`  [FAIL] ${msg}`);
}

/**
 * Partition the 16x16 map into two exact 180-degree symmetric halves around (7.5, 7.5):
 * Player TC center is (10, 13); Enemy TC center is (6, 3).
 * Dot product 4*x + 10*y - 105 is always odd (never 0) and negates under (x, y) -> (15 - x, 15 - y).
 */
function sideForTile(x, y) {
  return 4 * x + 10 * y - 105 > 0 ? 'player' : 'enemy';
}

function findNearestTileOfKind(state, kind, fromX, fromY, maxDist = 11) {
  let best = null;
  let bestDist = maxDist;
  for (const t of state.tiles) {
    if (t.kind !== kind || t.amount <= 0) continue;
    const d = Math.hypot(t.x + 0.5 - fromX, t.y + 0.5 - fromY);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function assertFiniteState(state, label) {
  if (!Number.isFinite(state.timeSec)) {
    fail(`${label}: state.timeSec is NaN/infinite`);
    return false;
  }
  for (const team of ['player', 'enemy']) {
    const r = state.resources[team];
    if (![r.wood, r.food, r.gold].every((v) => Number.isFinite(v) && v >= -1e-6)) {
      fail(`${label}: ${team} resources invalid ${JSON.stringify(r)}`);
      return false;
    }
  }
  for (const u of state.units) {
    if (
      !Number.isFinite(u.x) ||
      !Number.isFinite(u.y) ||
      !Number.isFinite(u.hp) ||
      u.x < 0 ||
      u.x > state.mapSize ||
      u.y < 0 ||
      u.y > state.mapSize
    ) {
      fail(`${label}: unit #${u.id} (${u.kind}) invalid coords/hp (${u.x}, ${u.y}, hp=${u.hp})`);
      return false;
    }
    for (const wp of u.path) {
      if (!Number.isFinite(wp.x) || !Number.isFinite(wp.y)) {
        fail(`${label}: unit #${u.id} path contains NaN waypoint`);
        return false;
      }
    }
  }
  for (const b of state.buildings) {
    if (
      !Number.isFinite(b.tileX) ||
      !Number.isFinite(b.tileY) ||
      !Number.isFinite(b.hp) ||
      !Number.isFinite(b.rallyX) ||
      !Number.isFinite(b.rallyY)
    ) {
      fail(`${label}: building #${b.id} (${b.kind}) has NaN field`);
      return false;
    }
  }
  for (const p of state.projectiles) {
    if (![p.fromX, p.fromY, p.toX, p.toY, p.progress].every(Number.isFinite)) {
      fail(`${label}: projectile #${p.id} has NaN coordinate/progress`);
      return false;
    }
  }
  return true;
}

// Guaranteed-clear courtyard tiles leaving wide walking lanes around Player TC (9..10, 12..13)
const BUILD_SPOTS = {
  goldWoodCamp: [
    [7, 12],
    [8, 12],
  ],
  southHomes: [
    [10, 15],
    [9, 15],
    [11, 15],
    [12, 14],
  ],
  militaryCluster: [
    [11, 10],
    [12, 10],
    [11, 14],
    [10, 14],
    [13, 11],
    [13, 12],
  ],
};

function tryBuildFromSpots(state, kind, spots, builderIds) {
  for (const [x, y] of spots) {
    const placed = cmdPlaceBuilding(state, 'player', kind, x, y, builderIds);
    if (placed) return placed;
  }
  return null;
}

/**
 * Runs a full headless match up to maxSec (240s) driven purely by engine commands.
 */
function runSimulatedMatch(spec, maxSec = 240) {
  const state = createInitialState(spec);
  const dt = 0.05; // 20 Hz simulation tick matching sim.ts
  const maxTicks = Math.round(maxSec / dt);
  let attackLaunched = false;
  let attackOrdersIssued = 0;

  for (let tick = 0; tick < maxTicks && state.outcome === 'playing'; tick++) {
    if (tick % 20 === 0) {
      const pBuildings = state.buildings.filter((b) => b.team === 'player' && b.hp > 0);
      const pUnits = state.units.filter((u) => u.team === 'player' && u.hp > 0);
      const tc = pBuildings.find((b) => b.kind === 'town_center');
      const villagers = pUnits.filter((u) => u.kind === 'villager');
      const army = pUnits.filter((u) => u.kind !== 'villager');

      const anyUnderConstruction = pBuildings.some((b) => !b.built);
      const homesteads = pBuildings.filter((b) => b.kind === 'homestead');
      const barracksList = pBuildings.filter((b) => b.kind === 'barracks');
      const stablesList = pBuildings.filter((b) => b.kind === 'stable');
      const rangesList = pBuildings.filter((b) => b.kind === 'archery_range');

      const builderCandidate =
        villagers.find((v) => v.order.type === 'idle') ??
        villagers.find((v) => v.order.type === 'gather' && v.order.resource === 'wood') ??
        villagers[0];
      const builderIds = builderCandidate ? [builderCandidate.id] : undefined;

      // 1. Construct Homestead (next to Gold+Wood), Barracks, Stable, Homestead #2, Archery Range
      if (!anyUnderConstruction) {
        if (homesteads.length === 0) {
          tryBuildFromSpots(state, 'homestead', BUILD_SPOTS.goldWoodCamp, builderIds);
        } else if (barracksList.length === 0) {
          tryBuildFromSpots(state, 'barracks', BUILD_SPOTS.militaryCluster, builderIds);
        } else if (stablesList.length === 0) {
          tryBuildFromSpots(state, 'stable', BUILD_SPOTS.militaryCluster, builderIds);
        } else if (homesteads.length === 1) {
          tryBuildFromSpots(state, 'homestead', BUILD_SPOTS.southHomes, builderIds);
        } else if (rangesList.length === 0) {
          tryBuildFromSpots(state, 'archery_range', BUILD_SPOTS.militaryCluster, builderIds);
        } else if (homesteads.length === 2 && pUnits.length >= 12) {
          tryBuildFromSpots(state, 'homestead', BUILD_SPOTS.southHomes, builderIds);
        } else if (rangesList.length < 2 && state.resources.player.wood >= 120) {
          tryBuildFromSpots(state, 'archery_range', BUILD_SPOTS.militaryCluster, builderIds);
        }
      }

      // 2. Train up to 6 villagers
      if (tc && villagers.length < 6 && tc.queue.length === 0) {
        cmdTrainUnit(state, 'player', 'villager', tc.id);
      }

      // 3. Keep 2 Wood, 2 Food (while safe berries remain), 2 Gold harvesters active
      const safeBerry = findNearestTileOfKind(
        state,
        'berry',
        PLAYER_TC_POS.x + 1,
        PLAYER_TC_POS.y + 1,
        6.5,
      );
      const countOn = (res) =>
        villagers.filter((v) => v.order.type === 'gather' && v.order.resource === res).length;

      for (const v of villagers) {
        if (v.order.type === 'build') continue;
        const onWood = countOn('wood');
        const onFood = countOn('food');
        const onGold = countOn('gold');

        const isIdle = v.order.type === 'idle';
        const isExcessWood =
          v.order.type === 'gather' && v.order.resource === 'wood' && onWood > 2;

        if (!isIdle && !isExcessWood) continue;

        let desiredKind = null;
        if (onGold < 2) {
          desiredKind = 'gold';
        } else if (safeBerry && onFood < 2) {
          desiredKind = 'berry';
        } else if (onWood < 2) {
          desiredKind = 'forest';
        } else if (isIdle) {
          // Once berries are exhausted, mine contested/secondary Gold & Wood for Archers/Knights!
          desiredKind = state.resources.player.gold <= state.resources.player.wood ? 'gold' : 'forest';
        }

        if (desiredKind) {
          const tile = findNearestTileOfKind(
            state,
            desiredKind,
            PLAYER_TC_POS.x + 1,
            PLAYER_TC_POS.y + 1,
            10.5,
          );
          if (tile) {
            cmdIssueOrder(state, 'player', [v.id], tile.x, tile.y);
          }
        }
      }

      // 4. Train Knights + Men-at-Arms + Longbowmen
      const builtBarracks = barracksList.filter((b) => b.built);
      const builtStables = stablesList.filter((b) => b.built);
      const builtRanges = rangesList.filter((b) => b.built);
      const knightsTrained = state.stats.countsByUnit.knight ?? 0;
      const militiaTrained = state.stats.countsByUnit.militia ?? 0;

      if (builtStables.length > 0 && builtStables.some((s) => s.queue.length < 2)) {
        cmdTrainUnit(state, 'player', 'knight');
      }
      if (
        builtBarracks.length > 0 &&
        builtBarracks.some((b) => b.queue.length < 2) &&
        (militiaTrained < 2 || (knightsTrained >= 2 && militiaTrained < 4))
      ) {
        cmdTrainUnit(state, 'player', 'militia');
      }
      if (
        builtRanges.length > 0 &&
        builtRanges.some((r) => r.queue.length < 2) &&
        (knightsTrained >= 1 || !safeBerry)
      ) {
        cmdTrainUnit(state, 'player', 'archer');
      }

      // Keep pre-push army gathered directly in front of Player TC (10, 11) so TC + whole army crush raids together!
      if (!attackLaunched && tick % 60 === 0 && army.length > 0) {
        const raidersNearBase = state.units.some(
          (u) => u.team === 'enemy' && u.hp > 0 && Math.hypot(u.x - 10, u.y - 12) <= 5.5,
        );
        if (!raidersNearBase) {
          const displaced = army.filter((u) => Math.hypot(u.x - 10.5, u.y - 11.2) > 2.2 && u.order.type === 'idle');
          if (displaced.length > 0) {
            cmdIssueOrder(
              state,
              'player',
              displaced.map((u) => u.id),
              10,
              11,
            );
          }
        }
      }

      // 5. March across the ford & raze the Enemy Town Center!
      const readyToPush =
        army.length >= 7 &&
        (state.stats.countsByUnit.knight ?? 0) >= 2 &&
        (state.stats.countsByUnit.militia ?? 0) >= 2;

      if (!attackLaunched && readyToPush) {
        const marched = cmdAttackEnemyKeep(state, 'player');
        if (marched > 0) {
          attackLaunched = true;
          attackOrdersIssued++;
        }
      } else if (attackLaunched && tick % 100 === 0 && army.length > 0) {
        cmdAttackEnemyKeep(state, 'player');
        attackOrdersIssued++;
      }
    }

    stepGame(state, dt);
    if (!assertFiniteState(state, `Sim(${spec.dateKey} t=${state.timeSec.toFixed(2)}s)`)) {
      break;
    }
  }

  return { state, attackOrdersIssued };
}

// ---------------------------------------------------------------------------
// 1. Verify 30 consecutive Daily Sieges (2026-11-01 .. 2026-11-30) + Simulated Siege on ALL 30!
// ---------------------------------------------------------------------------
const dailyRows = [];
let prevPuzzleNumber = null;

for (let day = 1; day <= 30; day++) {
  const dateKey = `2026-11-${String(day).padStart(2, '0')}`;
  const spec = generateDailySpec(dateKey);
  const label = `${dateKey} (#${spec.puzzleNumber})`;

  // Spec validity
  if (spec.dateKey !== dateKey) fail(`${label}: dateKey mismatch ${spec.dateKey}`);
  if (!Number.isInteger(spec.seed) || spec.seed < 0) fail(`${label}: invalid seed ${spec.seed}`);
  if (!Number.isInteger(spec.puzzleNumber) || spec.puzzleNumber <= 0) {
    fail(`${label}: non-positive puzzleNumber ${spec.puzzleNumber}`);
  }
  if (prevPuzzleNumber !== null && spec.puzzleNumber !== prevPuzzleNumber + 1) {
    fail(`${label}: puzzleNumber ${spec.puzzleNumber} did not increment from ${prevPuzzleNumber}`);
  }
  prevPuzzleNumber = spec.puzzleNumber;

  if (!(spec.biome in BIOMES)) fail(`${label}: invalid biome ${spec.biome}`);
  if (!(spec.playerCiv in CIVS) || !(spec.enemyCiv in CIVS)) {
    fail(`${label}: invalid civs ${spec.playerCiv} vs ${spec.enemyCiv}`);
  }
  if (spec.playerCiv === spec.enemyCiv) {
    fail(`${label}: playerCiv === enemyCiv (${spec.playerCiv})`);
  }
  if (!(spec.modifier in DAILY_MODIFIERS)) fail(`${label}: invalid modifier ${spec.modifier}`);
  if (!VALID_PERSONAS.has(spec.aiPersona)) fail(`${label}: invalid aiPersona ${spec.aiPersona}`);
  if (!VALID_CHOKES.has(spec.chokepointStyle)) {
    fail(`${label}: invalid chokepointStyle ${spec.chokepointStyle}`);
  }
  if (!spec.mapName || typeof spec.mapName !== 'string') fail(`${label}: empty mapName`);
  if (!Number.isFinite(spec.parSec) || spec.parSec <= 0) fail(`${label}: invalid parSec`);

  // Map tiles & 180-degree resource symmetry
  const tiles = buildMapTiles(spec);
  if (tiles.length !== MAP_SIZE * MAP_SIZE) {
    fail(`${label}: expected ${MAP_SIZE * MAP_SIZE} tiles, got ${tiles.length}`);
  }

  const totals = {
    player: { wood: 0, berry: 0, gold: 0 },
    enemy: { wood: 0, berry: 0, gold: 0 },
  };

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const t = tiles[y * MAP_SIZE + x];
      const mirror = tiles[(MAP_SIZE - 1 - y) * MAP_SIZE + (MAP_SIZE - 1 - x)];
      if (t.kind !== mirror.kind || t.amount !== mirror.amount) {
        fail(
          `${label}: 180-deg symmetry broken at (${x},${y})=${t.kind}:${t.amount} vs (${MAP_SIZE - 1 - x},${MAP_SIZE - 1 - y})=${mirror.kind}:${mirror.amount}`,
        );
      }
      const side = sideForTile(x, y);
      if (t.kind === 'forest') totals[side].wood += t.amount;
      if (t.kind === 'berry') totals[side].berry += t.amount;
      if (t.kind === 'gold') totals[side].gold += t.amount;
    }
  }

  for (const resKey of ['wood', 'berry', 'gold']) {
    if (totals.player[resKey] <= 0) {
      fail(`${label}: zero ${resKey} on player half`);
    }
    if (totals.player[resKey] !== totals.enemy[resKey]) {
      fail(
        `${label}: resource imbalance for ${resKey}: player=${totals.player[resKey]} vs enemy=${totals.enemy[resKey]}`,
      );
    }
  }

  // Unbroken A* path from Player TC courtyard tile (9, 11) to Enemy TC courtyard tile (6, 4)
  const initState = createInitialState(spec);
  const blocked = buildBlockedGrid(initState.tiles, initState.buildings, initState.mapSize);
  const startX = PLAYER_TC_POS.x + 0.5;
  const startY = PLAYER_TC_POS.y - 0.5;
  const goalTileX = ENEMY_TC_POS.x + 1;
  const goalTileY = ENEMY_TC_POS.y + 2;
  const path = findPath(blocked, initState.mapSize, startX, startY, goalTileX, goalTileY);

  if (path.length === 0) {
    fail(`${label}: broken A* path between Player TC courtyard and Enemy TC courtyard`);
  } else {
    const last = path[path.length - 1];
    if (Math.abs(last.x - (goalTileX + 0.5)) > 1e-3 || Math.abs(last.y - (goalTileY + 0.5)) > 1e-3) {
      fail(
        `${label}: A* path did not reach Enemy TC courtyard (${last.x},${last.y}) != (${goalTileX + 0.5},${goalTileY + 0.5})`,
      );
    }
    let prevX = startX;
    let prevY = startY;
    for (const wp of path) {
      const tx = Math.floor(wp.x);
      const ty = Math.floor(wp.y);
      if (!inBounds(tx, ty, MAP_SIZE) || blocked[ty * MAP_SIZE + tx] !== 0) {
        fail(`${label}: A* path stepped onto blocked tile (${tx},${ty})`);
        break;
      }
      if (Math.hypot(wp.x - prevX, wp.y - prevY) > Math.SQRT2 + 0.05) {
        fail(`${label}: A* path discontinuous step (${prevX},${prevY}) -> (${wp.x},${wp.y})`);
        break;
      }
      prevX = wp.x;
      prevY = wp.y;
    }
  }

  // Share code round-trip fidelity
  const code = encodeSkirmishCode(spec);
  const decoded = decodeSkirmishCode(code);
  const expectedSeed24 = (spec.seed >>> 8) >>> 0;
  if (!decoded) {
    fail(`${label}: decodeSkirmishCode returned null for ${code}`);
  } else if (
    decoded.biome !== spec.biome ||
    decoded.playerCiv !== spec.playerCiv ||
    decoded.enemyCiv !== spec.enemyCiv ||
    decoded.modifier !== spec.modifier ||
    decoded.chokepointStyle !== spec.chokepointStyle ||
    decoded.aiPersona !== spec.aiPersona ||
    decoded.seed !== expectedSeed24
  ) {
    fail(`${label}: round-trip mismatch for ${code} -> ${JSON.stringify(decoded)}`);
  }

  // Also verify reverse A* path from Enemy TC courtyard tile (6, 4) to Player TC courtyard tile (9, 11)
  const reversePath = findPath(blocked, initState.mapSize, goalTileX + 0.5, goalTileY + 0.5, PLAYER_TC_POS.x, PLAYER_TC_POS.y - 1);
  if (reversePath.length === 0) {
    fail(`${label}: broken reverse A* path from Enemy TC courtyard to Player TC courtyard`);
  }

  dailyRows.push({
    dateKey,
    puzzle: `#${spec.puzzleNumber}`,
    matchup: `${CIVS[spec.playerCiv].name} vs ${CIVS[spec.enemyCiv].name}`,
    biome: spec.biome,
    choke: spec.chokepointStyle.trim(),
    modifier: spec.modifier,
    wood: totals.player.wood,
    food: totals.player.berry,
    gold: totals.player.gold,
    pathLen: path.length,
    code,
  });
}

// ---------------------------------------------------------------------------
// 2. Full Headless Simulated Siege (Scripted Player Commander <= 240s)
// ---------------------------------------------------------------------------
const featuredDate = '2026-11-21';
const featuredSpec = generateDailySpec(featuredDate);
const { state: simState, attackOrdersIssued } = runSimulatedMatch(featuredSpec, 240);
const summary = computeScoreSummary(simState);

const builtBarracks =
  simState.buildings.some((b) => b.team === 'player' && b.kind === 'barracks' && b.built) ||
  (simState.stats.countsByUnit.militia ?? 0) > 0;
const builtStable =
  simState.buildings.some((b) => b.team === 'player' && b.kind === 'stable' && b.built) ||
  (simState.stats.countsByUnit.knight ?? 0) > 0;
const knightsTrained = simState.stats.countsByUnit.knight ?? 0;
const militiaTrained = simState.stats.countsByUnit.militia ?? 0;
const totalGathered =
  simState.stats.woodGathered + simState.stats.foodGathered + simState.stats.goldGathered;

if (simState.outcome !== 'victory') {
  fail(
    `Headless simulation (${featuredDate}) ended with outcome='${simState.outcome}' at ${simState.timeSec.toFixed(1)}s`,
  );
}
if (simState.timeSec > 240) {
  fail(`Headless simulation exceeded 240s (${simState.timeSec.toFixed(1)}s)`);
}
if (totalGathered <= 0) fail('Commander gathered zero resources');
if (!builtBarracks || !builtStable) {
  fail(`Commander missing required buildings (barracks=${builtBarracks}, stable=${builtStable})`);
}
if (knightsTrained < 1 || militiaTrained < 1) {
  fail(`Commander did not train both Knights (${knightsTrained}) and Men-at-Arms (${militiaTrained})`);
}
if (attackOrdersIssued < 1) {
  fail('Commander never issued cmdAttackEnemyKeep');
}

// ---------------------------------------------------------------------------
// 3. Summary Report
// ---------------------------------------------------------------------------
console.log('====================================================================================================');
console.log(' POCKET EMPIRES — 30-DAY DAILY SIEGE BALANCE & SYMMETRY REPORT (2026-11-01 .. 2026-11-30)');
console.log('====================================================================================================');
console.log(
  'Date        | Siege | Matchup              | Biome          | Crossing       | Res (W/F/G)     | A* | Code',
);
console.log(
  '------------+-------+----------------------+----------------+----------------+-----------------+----+---------------',
);
for (const r of dailyRows) {
  const resStr = `${r.wood}/${r.food}/${r.gold}`;
  console.log(
    `${r.dateKey.padEnd(11)} | ${r.puzzle.padEnd(5)} | ${r.matchup.padEnd(20)} | ${r.biome.padEnd(14)} | ${r.choke.padEnd(14)} | ${resStr.padEnd(15)} | ${String(r.pathLen).padStart(2)} | ${r.code}`,
  );
}
console.log('----------------------------------------------------------------------------------------------------');
console.log(
  `Headless Siege (${featuredSpec.dateKey} — Daily Siege #${featuredSpec.puzzleNumber}: ${featuredSpec.mapName}):`,
);
console.log(
  `  Outcome: ${simState.outcome.toUpperCase()} in ${simState.timeSec.toFixed(1)}s (<= 240s) | Crowns: ${summary.crowns}/3 | Score: ${summary.score} pts (${summary.strategyLabel})`,
);
console.log(
  `  Economy: Wood=${simState.stats.woodGathered}, Food=${simState.stats.foodGathered}, Gold=${simState.stats.goldGathered} | Buildings Built=${simState.stats.buildingsBuilt}`,
);
console.log(
  `  Army Trained: Knights=${knightsTrained}, Men-at-Arms=${militiaTrained}, Archers=${simState.stats.countsByUnit.archer ?? 0} | Enemy Slain=${simState.stats.enemyUnitsSlain}, Razed=${simState.stats.enemyBuildingsRazed} | NaN Coords=0`,
);
console.log('====================================================================================================');

if (failures > 0) {
  console.error(`verify:levels FAILED with ${failures} error(s).`);
  process.exit(1);
}
console.log('verify:levels PASS — 30/30 Daily Sieges & Headless Commander Siege verified 100% green!');
