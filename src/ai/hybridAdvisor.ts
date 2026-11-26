import {
  BIOMES,
  BUILDINGS,
  CIVS,
  DAILY_MODIFIERS,
  MAP_SIZE,
  type AIPersonaId,
  type BiomeId,
  type Building,
  type CivId,
  type DailyModifierId,
  type GameState,
  type SkirmishSpec,
  type Unit,
} from '../types/rts.js';
import {
  buildMapTiles,
  decodeSkirmishCode,
  ENEMY_TC_POS,
  encodeSkirmishCode,
  PLAYER_TC_POS,
} from '../engine/dailyGenerator.js';
import { buildBlockedGrid, findPath } from '../engine/pathfinding.js';
import { createRng, hashString, pick, todayDateKey } from '../engine/rng.js';
import { computeScoreSummary, getTeamPop, POP_HARD_CAP } from '../engine/sim.js';

export type AIInferenceSource = 'on-device-local' | 'royal-tactician-local';

export interface AdvisorWhisper {
  text: string;
  source: AIInferenceSource;
  urgency: 'tip' | 'warn' | 'opportunity';
}

export interface CraftedSkirmishResult {
  spec: SkirmishSpec;
  shareCode: string;
  flavorSummary: string;
  source: AIInferenceSource;
}

/* -------------------------------------------------------------------------- */
/*  Optional Local Browser `window.LanguageModel` Probing & Session           */
/* -------------------------------------------------------------------------- */

type AvailabilityStatus =
  | 'available'
  | 'readily'
  | 'downloadable'
  | 'after-download'
  | 'downloading'
  | 'unavailable'
  | 'no';

interface BrowserLanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy?(): void;
}

interface BrowserLanguageModelFactory {
  availability?(options?: Record<string, unknown>): Promise<AvailabilityStatus>;
  capabilities?(): Promise<{ available?: AvailabilityStatus }>;
  create(options?: {
    systemPrompt?: string;
    initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }): Promise<BrowserLanguageModelSession>;
}

interface GlobalWithBrowserLanguageModel {
  LanguageModel?: BrowserLanguageModelFactory;
  ai?: {
    languageModel?: BrowserLanguageModelFactory;
  };
}

const WHISPER_MAX_CHARS = 115;
const EPIGRAPH_MAX_CHARS = 165;
const FLAVOR_MAX_CHARS = 160;
const ON_DEVICE_PROBE_TIMEOUT_MS = 900;
const ON_DEVICE_PROMPT_TIMEOUT_MS = 2600;

function getBrowserLanguageModelFactory(): BrowserLanguageModelFactory | null {
  const g = globalThis as unknown as GlobalWithBrowserLanguageModel;
  if (g.LanguageModel && typeof g.LanguageModel.create === 'function') {
    return g.LanguageModel;
  }
  if (g.ai?.languageModel && typeof g.ai.languageModel.create === 'function') {
    return g.ai.languageModel;
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    });
    return await Promise.race([promise, timeout]);
  } catch {
    return fallback;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function isOnDeviceModelReady(): Promise<boolean> {
  const factory = getBrowserLanguageModelFactory();
  if (!factory) return false;

  const checkPromise = (async (): Promise<boolean> => {
    try {
      if (typeof factory.availability === 'function') {
        const status = await factory.availability();
        return status === 'available' || status === 'readily';
      }
      if (typeof factory.capabilities === 'function') {
        const caps = await factory.capabilities();
        return caps?.available === 'readily' || caps?.available === 'available';
      }
      return false;
    } catch {
      return false;
    }
  })();

  return withTimeout(checkPromise, ON_DEVICE_PROBE_TIMEOUT_MS, false);
}

async function tryOnDevicePrompt(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const factory = getBrowserLanguageModelFactory();
  if (!factory) return null;
  const ready = await isOnDeviceModelReady();
  if (!ready) return null;

  const runSession = async (): Promise<string | null> => {
    let session: BrowserLanguageModelSession | null = null;
    try {
      try {
        session = await factory.create({
          initialPrompts: [{ role: 'system', content: systemPrompt }],
        });
      } catch {
        session = await factory.create({ systemPrompt });
      }
      const raw = await session.prompt(userPrompt);
      if (typeof raw !== 'string') return null;
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    } finally {
      try {
        session?.destroy?.();
      } catch {
        // Ignore session teardown errors
      }
    }
  };

  return withTimeout(runSession(), ON_DEVICE_PROMPT_TIMEOUT_MS, null);
}

async function runLocalModelCascade(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; source: 'on-device-local' } | null> {
  const localReply = await tryOnDevicePrompt(systemPrompt, userPrompt);
  if (localReply) {
    return { text: localReply, source: 'on-device-local' };
  }
  return null;
}

export async function detectHybridAICapability(): Promise<{
  onDeviceAvailable: boolean;
  modeLabel: string;
}> {
  const onDeviceAvailable = await isOnDeviceModelReady();
  const modeLabel = onDeviceAvailable
    ? 'Royal War-Council (On-Device)'
    : 'Royal War-Council Tactician';

  return {
    onDeviceAvailable,
    modeLabel,
  };
}

/* -------------------------------------------------------------------------- */
/*  Prose Sanitizer & Length Clamping (Zero AI Slop, <= 115 char Whispers)    */
/* -------------------------------------------------------------------------- */

const SLOP_PATTERNS = [
  /\bas an ai\b/i,
  /\blanguage model\b/i,
  /\bi cannot\b/i,
  /\bi'm sorry\b/i,
  /\bhere(?:'s| is) (?:a|your)\b/i,
  /\bsure[,!]\s/i,
  /\bcertainly[,!]\s/i,
];

function sanitizeRoyalProse(raw: string, maxChars: number): string | null {
  let text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\r?\n+/g, ' ')
    .replace(/^\s*(?:royal\s+advisor|advisor|chronicler|tip|whisper)\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!text || text.length < 12) return null;
  if (SLOP_PATTERNS.some((re) => re.test(text))) return null;

  return clampText(text, maxChars);
}

function clampText(input: string, maxChars: number): string {
  const clean = input.replace(/\s{2,}/g, ' ').trim();
  if (clean.length <= maxChars) return clean;

  const budget = maxChars - 1;
  const slice = clean.slice(0, budget);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace >= Math.floor(budget * 0.62) ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-—\s]+$/, '')}…`;
}

/* -------------------------------------------------------------------------- */
/*  Live Battlefield Inspection & Instant Royal Tactician Whispers            */
/* -------------------------------------------------------------------------- */

function isEnemySpotted(state: GameState, enemy: Unit): boolean {
  const tx = Math.max(0, Math.min(state.mapSize - 1, Math.floor(enemy.x)));
  const ty = Math.max(0, Math.min(state.mapSize - 1, Math.floor(enemy.y)));
  if (state.fog[ty * state.mapSize + tx] === 2) {
    return true;
  }
  // Fallback line-of-sight proximity check in case state was mutated between fog refreshes
  for (const u of state.units) {
    if (u.team !== 'player' || u.hp <= 0) continue;
    if (Math.hypot(u.x - enemy.x, u.y - enemy.y) <= 5.2) return true;
  }
  for (const b of state.buildings) {
    if (b.team !== 'player' || b.hp <= 0) continue;
    const cx = b.tileX + b.size / 2;
    const cy = b.tileY + b.size / 2;
    if (Math.hypot(cx - enemy.x, cy - enemy.y) <= BUILDINGS[b.kind].vision) return true;
  }
  return false;
}

function chokeDisplayName(choke: SkirmishSpec['chokepointStyle']): string {
  switch (choke) {
    case 'central_bridge':
      return 'stone bridge';
    case ' canyon_pass':
      return 'canyon pass';
    case 'open_steppe':
      return 'open steppe';
    case 'twin_fords':
    default:
      return 'twin fords';
  }
}

export function getInstantAdvisorWhisper(state: GameState): AdvisorWhisper {
  const localWhisper = (
    text: string,
    urgency: AdvisorWhisper['urgency'],
  ): AdvisorWhisper => ({
    text: clampText(text, WHISPER_MAX_CHARS),
    source: 'royal-tactician-local',
    urgency,
  });

  if (state.outcome === 'victory') {
    return localWhisper(
      'Their Keep lies in embers, Sire! Sound Taunt 11 and claim your rightful crown.',
      'opportunity',
    );
  }
  if (state.outcome === 'defeat') {
    return localWhisper(
      'Our Town Center fell, my liege—remuster the realm and avenge these ashes!',
      'warn',
    );
  }

  const playerUnits = state.units.filter((u) => u.team === 'player' && u.hp > 0);
  const enemyUnits = state.units.filter((u) => u.team === 'enemy' && u.hp > 0);
  const playerBuildings = state.buildings.filter((b) => b.team === 'player' && b.hp > 0);
  const enemyTc = state.buildings.find(
    (b) => b.team === 'enemy' && b.kind === 'town_center' && b.hp > 0,
  );
  const playerTc = playerBuildings.find((b) => b.kind === 'town_center');

  const tcCenterX = (playerTc?.tileX ?? PLAYER_TC_POS.x) + 1;
  const tcCenterY = (playerTc?.tileY ?? PLAYER_TC_POS.y) + 1;

  // 1. Raids near Player Town Center
  const raidersNearTc = enemyUnits.filter(
    (u) => Math.hypot(u.x - tcCenterX, u.y - tcCenterY) <= 6.8,
  );
  if (raidersNearTc.length > 0) {
    const hasEnemyKnight = raidersNearTc.some((u) => u.kind === 'knight');
    if (hasEnemyKnight) {
      return localWhisper(
        'To arms, Sire! Enemy Knights raid our Keep—muster Pikemen to the courtyard!',
        'warn',
      );
    }
    const raiderNoun = raidersNearTc.length === 1 ? '1 raider storms' : `${raidersNearTc.length} raiders storm`;
    return localWhisper(
      `War horns at the Keep! ${raiderNoun} our gates—rally defenders, Sire!`,
      'warn',
    );
  }

  // 2. Pop-cap block ("Housed!")
  const pop = getTeamPop(state, 'player');
  if (pop.cap < POP_HARD_CAP && pop.current >= pop.cap) {
    const buildingCamp = playerBuildings.some((b) => b.kind === 'homestead' && !b.built);
    if (buildingCamp) {
      return localWhisper(
        `Housed at ${pop.current}/${pop.cap} pop, Sire! Finish hammering that Homestead Camp fast.`,
        'warn',
      );
    }
    return localWhisper(
      `Housed at ${pop.current}/${pop.cap} pop, my liege! Build a Homestead Camp (Q) to reopen queues.`,
      'warn',
    );
  }

  const playerVillagers = playerUnits.filter((u) => u.kind === 'villager');
  const playerMilitary = playerUnits.filter((u) => u.kind !== 'villager');
  const playerPikemen = playerMilitary.filter((u) => u.kind === 'pikeman').length;
  const playerMonks = playerMilitary.filter((u) => u.kind === 'monk').length;
  const playerKnights = playerMilitary.filter((u) => u.kind === 'knight').length;

  // 3. Spotted enemy Knights -> counter with Pikemen or Monk Wololo
  const spottedEnemyKnights = enemyUnits.filter(
    (u) => u.kind === 'knight' && isEnemySpotted(state, u),
  );
  if (
    spottedEnemyKnights.length > 0 &&
    playerPikemen + playerMonks * 2 < spottedEnemyKnights.length
  ) {
    return localWhisper(
      "Enemy Knights spotted! Train Barracks Pikemen or chant a Monk's Wololo, Sire!",
      'warn',
    );
  }

  // 4. Spotted enemy Archers -> counter with Knights
  const spottedEnemyArchers = enemyUnits.filter(
    (u) => u.kind === 'archer' && isEnemySpotted(state, u),
  );
  if (
    spottedEnemyArchers.length > 0 &&
    playerKnights < Math.max(1, Math.ceil(spottedEnemyArchers.length / 2))
  ) {
    return localWhisper(
      'Enemy Archers spotted ahead! Raise a Stable and charge Knights through their line!',
      'warn',
    );
  }

  // 5. Floating Wood / Gold without military production buildings
  const res = state.resources.player;
  const hasMilitaryProduction = playerBuildings.some(
    (b) =>
      b.kind === 'barracks' ||
      b.kind === 'archery_range' ||
      b.kind === 'stable' ||
      b.kind === 'monastery',
  );
  if (!hasMilitaryProduction) {
    if (res.wood >= 155 && res.gold >= 115) {
      return localWhisper(
        `${res.wood}W & ${res.gold}G gather cobwebs, Sire! Erect a Stable, Range, or Monastery!`,
        'tip',
      );
    }
    if (res.wood >= 165) {
      return localWhisper(
        `${res.wood} Wood sits idle in the yard, Sire! Raise a Barracks (W) or Range (E)!`,
        'tip',
      );
    }
    if (res.gold >= 135) {
      return localWhisper(
        `${res.gold} Gold gleams unspent, my liege! Build a Monastery for Wololo or a Stable!`,
        'tip',
      );
    }
  }

  // 6. Ready army >= 5 urging siege!
  if (playerMilitary.length >= 5) {
    const leader = state.spec.aiLeaderName;
    if (enemyTc && enemyTc.hp < enemyTc.maxHp) {
      return localWhisper(
        `${leader}'s Keep splinters! Keep ${playerMilitary.length} banners pressing the siege, Sire!`,
        'opportunity',
      );
    }
    return localWhisper(
      `${playerMilitary.length} banners stand mustered, Sire! Cross the ${chokeDisplayName(state.spec.chokepointStyle)} and raze ${leader}'s Keep!`,
      'opportunity',
    );
  }

  // 7. Idle villagers
  const idleVillagers = playerVillagers.filter((v) => v.order.type === 'idle');
  if (idleVillagers.length > 0) {
    if (idleVillagers.length === 1 && state.timeSec < 20) {
      return localWhisper(
        'An idle Villager naps near the Gold vein, Sire—task them to mine coin for the Crown!',
        'tip',
      );
    }
    return localWhisper(
      `${idleVillagers.length} idle Villager${idleVillagers.length > 1 ? 's' : ''} loafing by the hearth, Sire! Put idle hands to Wood or Gold.`,
      idleVillagers.length >= 2 ? 'warn' : 'tip',
    );
  }

  // 8. Proactive Royal War-Council economy, scouting & decree counsel
  if (
    playerVillagers.length < 5 &&
    playerTc &&
    playerTc.queue.length === 0 &&
    res.food >= 50 &&
    pop.current < pop.cap
  ) {
    return localWhisper(
      'Our Town Center hearth sits quiet, Sire—queue a Villager (50 Food) to boom!',
      'tip',
    );
  }

  const idleScout = playerMilitary.find((u) => u.kind === 'scout' && u.order.type === 'idle');
  if (idleScout && state.timeSec < 65) {
    return localWhisper(
      `Ride your Scout across the ${chokeDisplayName(state.spec.chokepointStyle)}, Sire—spy on ${state.spec.aiLeaderName}!`,
      'tip',
    );
  }

  const unclaimedRelic = (state.relics ?? []).find(
    (r) => r.owner === 'neutral' && r.carrierUnitId === null,
  );
  if (unclaimedRelic && hasMilitaryProduction && playerMilitary.length > 0) {
    return localWhisper(
      'A Sacred Relic gleams near the crossing, Sire—escort it to our Keep or Monastery for endless Gold!',
      'opportunity',
    );
  }

  if (state.spec.modifier === 'wololo_sabbath' && playerMonks === 0) {
    return localWhisper(
      'Age of Wololo reigns, Sire—discounted Monks earn +50 Gold for every foe converted!',
      'opportunity',
    );
  }

  if (state.spec.modifier === 'gold_fever') {
    return localWhisper(
      `Gold Fever burns! Seize the central Gold lode (+45% harvest) before ${state.spec.aiLeaderName}!`,
      'opportunity',
    );
  }

  return localWhisper(
    `Muster ${CIVS[state.spec.playerCiv].name} steel for the ${chokeDisplayName(state.spec.chokepointStyle)}, Sire—par is ${state.spec.parSec}s!`,
    'tip',
  );
}

/* -------------------------------------------------------------------------- */
/*  Royal War-Council Scout Advisor (`askHybridScoutAdvisor`)                 */
/* -------------------------------------------------------------------------- */

const ADVISOR_SYSTEM_PROMPT = [
  'You are the Royal War-Council Tactical Advisor in Pocket Empires, an Age of Empires II-style micro-RTS.',
  'Address the player as "Sire" or "my liege".',
  'Speak with sharp, witty medieval war-room urgency—zero generic AI filler, no markdown, no bullet points.',
  'Give ONE concrete, actionable tactical sentence strictly under 110 characters based on the live battlefield state.',
  'Use authentic counters: Pikemen or Monk Wololo vs Knights; Knights vs Archers; Men-at-Arms & Knights to raze Town Centers.',
].join(' ');

function buildAdvisorUserPrompt(state: GameState, baseline: AdvisorWhisper): string {
  const pop = getTeamPop(state, 'player');
  const res = state.resources.player;
  const playerUnits = state.units.filter((u) => u.team === 'player' && u.hp > 0);
  const idleVills = playerUnits.filter(
    (u) => u.kind === 'villager' && u.order.type === 'idle',
  ).length;
  const vills = playerUnits.filter((u) => u.kind === 'villager').length;
  const army = playerUnits.filter((u) => u.kind !== 'villager');

  const spottedEnemies = state.units.filter(
    (u) => u.team === 'enemy' && u.hp > 0 && isEnemySpotted(state, u),
  );
  const spottedSummary =
    spottedEnemies.length > 0
      ? spottedEnemies.map((u) => u.kind).join(', ')
      : `unscouted (${state.spec.aiLeaderName}, ${state.spec.aiPersona})`;

  const playerBlds = state.buildings
    .filter((b) => b.team === 'player' && b.hp > 0)
    .map((b) => (b.built ? b.kind : `${b.kind}(building)`))
    .join(', ');

  return [
    `Map: ${state.spec.mapName} (${BIOMES[state.spec.biome].name}, ${chokeDisplayName(state.spec.chokepointStyle)}).`,
    `Matchup: Player ${CIVS[state.spec.playerCiv].name} vs ${state.spec.aiLeaderName} (${CIVS[state.spec.enemyCiv].name}).`,
    `Decree: ${DAILY_MODIFIERS[state.spec.modifier].name} (${DAILY_MODIFIERS[state.spec.modifier].decree}).`,
    `Clock: ${Math.round(state.timeSec)}s / Par ${state.spec.parSec}s. Outcome: ${state.outcome}.`,
    `Treasury: ${res.wood}W, ${res.food}F, ${res.gold}G. Pop: ${pop.current}/${pop.cap}.`,
    `Villagers: ${vills} (${idleVills} idle). Army (${army.length}): ${army.map((u) => u.kind).join(', ') || 'none'}.`,
    `Buildings: ${playerBlds || 'town_center'}.`,
    `Spotted Enemies: ${spottedSummary}.`,
    `Priority Alert (${baseline.urgency}): ${baseline.text}`,
    'Reply with one razor-sharp Royal Advisor sentence (<= 110 chars):',
  ].join('\n');
}

function buildPersonaScoutFallback(state: GameState, baseline: AdvisorWhisper): AdvisorWhisper {
  // Always preserve critical warnings or siege opportunities directly
  if (baseline.urgency !== 'tip' || state.outcome !== 'playing') {
    return baseline;
  }

  // Enrich quiet moments with rival-persona recon while staying <= 115 chars
  const leader = state.spec.aiLeaderName;
  switch (state.spec.aiPersona) {
    case 'knight_baron':
      return {
        text: clampText(
          `Scouts warn ${leader} grooms heavy Knights, Sire—ready Barracks Pikemen or Monks!`,
          WHISPER_MAX_CHARS,
        ),
        source: 'royal-tactician-local',
        urgency: 'tip',
      };
    case 'longbow_earl':
      return {
        text: clampText(
          `${leader} masses Longbows beyond the ${chokeDisplayName(state.spec.chokepointStyle)}—Stable Knights crush them, Sire!`,
          WHISPER_MAX_CHARS,
        ),
        source: 'royal-tactician-local',
        urgency: 'tip',
      };
    case 'monk_abbot':
      return {
        text: clampText(
          `Beware ${leader}'s Wololo Monks, my liege—snipe those robes from afar with Archers!`,
          WHISPER_MAX_CHARS,
        ),
        source: 'royal-tactician-local',
        urgency: 'tip',
      };
    case 'viking_jarl':
    default:
      return baseline;
  }
}

export async function askHybridScoutAdvisor(state: GameState): Promise<AdvisorWhisper> {
  const baseline = getInstantAdvisorWhisper(state);
  const userPrompt = buildAdvisorUserPrompt(state, baseline);

  const localModel = await runLocalModelCascade(ADVISOR_SYSTEM_PROMPT, userPrompt);
  if (localModel) {
    const cleaned = sanitizeRoyalProse(localModel.text, WHISPER_MAX_CHARS);
    if (cleaned) {
      return {
        text: cleaned,
        source: localModel.source,
        urgency: baseline.urgency,
      };
    }
  }

  // Keep urgent actionable baseline cues (idle villager, floating resources) first;
  // weave in rival persona scouting once basic economy is humming.
  const playerUnits = state.units.filter((u) => u.team === 'player' && u.hp > 0);
  const hasIdleVillager = playerUnits.some(
    (u) => u.kind === 'villager' && u.order.type === 'idle',
  );
  const hasProdBuilding = state.buildings.some(
    (b) =>
      b.team === 'player' &&
      b.hp > 0 &&
      (b.kind === 'barracks' ||
        b.kind === 'archery_range' ||
        b.kind === 'stable' ||
        b.kind === 'monastery'),
  );
  if (!hasIdleVillager && hasProdBuilding) {
    return buildPersonaScoutFallback(state, baseline);
  }

  return baseline;
}

/* -------------------------------------------------------------------------- */
/*  Natural-Language Skirmish Crafter & Walkability Verifier                  */
/* -------------------------------------------------------------------------- */

const ALL_CIVS: readonly CivId[] = [
  'britons',
  'franks',
  'byzantines',
  'vikings',
  'teutons',
  'mongols',
];

const ALL_BIOMES: readonly BiomeId[] = [
  'sherwood',
  'black_forest',
  'gold_rush',
  'highlands',
  'autumn_steppe',
  'oasis',
];

const ALL_MODIFIERS: readonly DailyModifierId[] = [
  'standard',
  'gold_fever',
  'wololo_sabbath',
  'timber_boom',
  'iron_vanguard',
  'fletchers_wind',
];

const ALL_CHOKES: readonly SkirmishSpec['chokepointStyle'][] = [
  'twin_fords',
  'central_bridge',
  ' canyon_pass',
  'open_steppe',
];

const ALL_PERSONAS: readonly AIPersonaId[] = [
  'longbow_earl',
  'knight_baron',
  'viking_jarl',
  'monk_abbot',
];

const PERSONA_LEADERS: Record<AIPersonaId, readonly string[]> = {
  longbow_earl: ['Earl Godwin', 'Lady Rowena', 'Sheriff Fitzroy'],
  knight_baron: ['Duke Roland', 'Baron Guiscard', 'Countess Alix'],
  viking_jarl: ['Jarl Haakon', 'Erik Ironhide', 'Freydis Redshield'],
  monk_abbot: ['Brother Theodoric', 'Abbot Balthazar', 'Prior Simeon'],
};

const CUSTOM_MAP_TITLES: Record<BiomeId, readonly string[]> = {
  sherwood: ['King’s Ford of Sherwood', 'Greenwood Twin Shallows', 'Yeoman’s River Reach'],
  black_forest: ['Whispering Timber Siege', 'Ironwood Narrow Cut', 'Dark Canopy Bastion'],
  gold_rush: ['El Dorado Crown Basin', 'Gilded Hill of Kings', 'Sovereign Lode Valley'],
  highlands: ['Cragstone Defile', 'Falkirk Slate Causeway', 'Highland Narrow Keep'],
  autumn_steppe: ['Crimson Banner Steppe', 'Amber Lancers’ Plain', 'Redleaf Horse Grounds'],
  oasis: ['Mirage Relic Springs', 'Turquoise Palm Crossing', 'Dune Abbot’s Oasis'],
};

const CIV_PATTERNS: ReadonlyArray<{ civ: CivId; regex: RegExp }> = [
  {
    civ: 'britons',
    regex: /\b(britons?|british|english|england|longbows?|longbowm[ae]n|yeom[ae]n|agincourt)\b/i,
  },
  {
    civ: 'franks',
    regex: /\b(franks?|french|france|paladins?|chivalry|chevaliers?|charlemagne)\b/i,
  },
  {
    civ: 'byzantines',
    regex: /\b(byzantines?|byzantium|constantinople|cataphracts?|eastern\s+rome)\b/i,
  },
  {
    civ: 'vikings',
    regex: /\b(vikings?|norse|norsem[ae]n|berserk(?:er)?s?|shieldwalls?|ragnar|nordic)\b/i,
  },
  {
    civ: 'teutons',
    regex: /\b(teutons?|teutonic|germans?|crusaders?|crenellations?|barbarossa|iron\s+keep)\b/i,
  },
  {
    civ: 'mongols',
    regex: /\b(mongols?|mongolia|steppe\s+horde|horde|mangudai|genghis|khans?|keshiks?)\b/i,
  },
];

function extractCivMentions(text: string): CivId[] {
  const hits: Array<{ civ: CivId; index: number }> = [];
  for (const { civ, regex } of CIV_PATTERNS) {
    const m = regex.exec(text);
    if (m) {
      hits.push({ civ, index: m.index });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits.map((h) => h.civ);
}

function parseBiomeFromText(lower: string, rng: () => number): BiomeId {
  if (/\b(black\s*forest|dense\s*(?:wood|forest|trees)|dark\s*(?:wood|forest)|pines?|lumber\s*wall)\b/.test(lower)) {
    return 'black_forest';
  }
  if (/\b(oasis|desert|dunes?|mirage|sand|arabia|palms?|sahara|arid)\b/.test(lower)) {
    return 'oasis';
  }
  if (/\b(gold\s*rush|golden\s*basin|gold\s*(?:hill|pit|valley|center|mine)|el\s*dorado|klondike)\b/.test(lower)) {
    return 'gold_rush';
  }
  if (/\b(highlands?|mountains?|crags?|cliffs?|canyons?|gorge|scottish|altitude)\b/.test(lower)) {
    return 'highlands';
  }
  if (/\b(steppes?|autumn|amber|plains?|prairie|open\s*field|meadows?|redleaf)\b/.test(lower)) {
    return 'autumn_steppe';
  }
  if (/\b(sherwood|greenwood|meadow|robin\s*hood|lush|river\s*ford)\b/.test(lower)) {
    return 'sherwood';
  }
  return pick(rng, ALL_BIOMES);
}

function parseModifierFromText(lower: string): DailyModifierId | null {
  if (/\b(wololo|monks?|monaster(?:y|ies)|priests?|relics?|convert|conversion|cult|sabbath|faith|holy)\b/.test(lower)) {
    return 'wololo_sabbath';
  }
  if (/\b(gold\s*fever|rich|wealthy?|treasure|coins?|bounty|miners?|veins?|greed|gold\s*boom|mega\s*gold)\b/.test(lower)) {
    return 'gold_fever';
  }
  if (/\b(timber|lumber(?:jacks?)?|wood\s*boom|chop(?:ping)?|sawmill|fast\s*build|logging)\b/.test(lower)) {
    return 'timber_boom';
  }
  if (/\b(infantry|militia|swordsm[ae]n|m[ae]n-at-arms|pikem[ae]n|halberds?|pikes?|melee|vanguard|shieldwall|barracks\s*rush)\b/.test(lower)) {
    return 'iron_vanguard';
  }
  if (/\b(archers?|longbows?|volleys?|arrows?|fletchers?|tailwind|ranged|snipers?|bowm[ae]n|crossbows?)\b/.test(lower)) {
    return 'fletchers_wind';
  }
  if (/\b(standard|classic|vanilla|normal|balanced)\b/.test(lower)) {
    return 'standard';
  }
  return null;
}

function parseChokepointFromText(
  lower: string,
  biome: BiomeId,
  rng: () => number,
): SkirmishSpec['chokepointStyle'] {
  if (/\b(bridge|single\s*crossing|one\s*crossing|narrow\s*bridge|bottleneck|chokepoint|choke|causeway|meat\s*grinder|thermopylae)\b/.test(lower)) {
    return 'central_bridge';
  }
  if (/\b(canyon|pass|gorge|ravine|cliffs?|defilade|mountain\s*pass)\b/.test(lower)) {
    return ' canyon_pass';
  }
  if (/\b(open|wide|no\s*river|land\s*map|all[\s-]*out|flanks?|plains|arena|arabia)\b/.test(lower)) {
    return 'open_steppe';
  }
  if (/\b(twin\s*fords?|fords?|shallows|two\s*crossings|river\s*crossings?|streams?)\b/.test(lower)) {
    return 'twin_fords';
  }

  if (biome === 'highlands') return ' canyon_pass';
  if (biome === 'autumn_steppe') return 'open_steppe';
  if (biome === 'black_forest') return 'central_bridge';
  return pick(rng, ALL_CHOKES);
}

function selectPersonaForEnemy(
  lower: string,
  enemyCiv: CivId,
  modifier: DailyModifierId,
  rng: () => number,
): AIPersonaId {
  if (
    modifier === 'wololo_sabbath' ||
    enemyCiv === 'byzantines' ||
    /\b(abbot|monk\s*boss|priest|wololo)\b/.test(lower)
  ) {
    return 'monk_abbot';
  }
  if (
    enemyCiv === 'franks' ||
    enemyCiv === 'mongols' ||
    /\b(knights?|cavalry|paladins?|chargers?|horses?|baron)\b/.test(lower)
  ) {
    return 'knight_baron';
  }
  if (
    modifier === 'fletchers_wind' ||
    enemyCiv === 'britons' ||
    /\b(archers?|longbows?|arrows?|earl)\b/.test(lower)
  ) {
    return 'longbow_earl';
  }
  if (enemyCiv === 'vikings' || enemyCiv === 'teutons' || /\b(jarl|raiders?|infantry)\b/.test(lower)) {
    return 'viking_jarl';
  }
  return pick(rng, ALL_PERSONAS);
}

/**
 * Verifies map walkability between `PLAYER_TC_POS` and `ENEMY_TC_POS`
 * using `buildMapTiles` + `buildBlockedGrid` + `findPath`, both on raw terrain
 * and with both 2x2 Town Centers placed on the battlefield.
 */
function verifySkirmishWalkability(spec: SkirmishSpec): boolean {
  const tiles = buildMapTiles(spec);

  // 1. Verify unbroken walkable path directly from PLAYER_TC_POS to ENEMY_TC_POS
  const terrainBlocked = buildBlockedGrid(tiles, [], MAP_SIZE);
  const directPath = findPath(
    terrainBlocked,
    MAP_SIZE,
    PLAYER_TC_POS.x,
    PLAYER_TC_POS.y,
    ENEMY_TC_POS.x,
    ENEMY_TC_POS.y,
  );
  if (directPath.length === 0) {
    return false;
  }

  // 2. Verify troops rallied at Player TC courtyard can reach Enemy TC footprint
  const tcBuildings: Building[] = [
    {
      id: 1,
      team: 'player',
      kind: 'town_center',
      tileX: PLAYER_TC_POS.x,
      tileY: PLAYER_TC_POS.y,
      size: BUILDINGS.town_center.size,
      hp: BUILDINGS.town_center.maxHp,
      maxHp: BUILDINGS.town_center.maxHp,
      built: true,
      buildProgress: 1,
      queue: [],
      rallyX: PLAYER_TC_POS.x + 1,
      rallyY: PLAYER_TC_POS.y - 0.8,
      attackTimer: 0,
    },
    {
      id: 2,
      team: 'enemy',
      kind: 'town_center',
      tileX: ENEMY_TC_POS.x,
      tileY: ENEMY_TC_POS.y,
      size: BUILDINGS.town_center.size,
      hp: BUILDINGS.town_center.maxHp,
      maxHp: BUILDINGS.town_center.maxHp,
      built: true,
      buildProgress: 1,
      queue: [],
      rallyX: ENEMY_TC_POS.x + 1,
      rallyY: ENEMY_TC_POS.y + 2.8,
      attackTimer: 0,
    },
  ];
  const siegeBlocked = buildBlockedGrid(tiles, tcBuildings, MAP_SIZE);
  const siegePath = findPath(
    siegeBlocked,
    MAP_SIZE,
    PLAYER_TC_POS.x + 1,
    PLAYER_TC_POS.y - 1,
    ENEMY_TC_POS.x,
    ENEMY_TC_POS.y,
    BUILDINGS.town_center.size,
  );
  return siegePath.length > 0;
}

function ensureWalkableSpec(spec: SkirmishSpec): { spec: SkirmishSpec; mutatedSeed: boolean } {
  if (verifySkirmishWalkability(spec)) {
    return { spec, mutatedSeed: false };
  }

  let candidate: SkirmishSpec = { ...spec };
  for (let attempt = 1; attempt <= 16; attempt++) {
    candidate = {
      ...candidate,
      seed: (spec.seed + Math.imul(attempt, 0x9e3779b9)) >>> 0,
    };
    if (verifySkirmishWalkability(candidate)) {
      return { spec: candidate, mutatedSeed: true };
    }
  }

  // Ultimate guarantee: twin_fords carves explicit shallow crossings on x+y=15
  candidate = {
    ...candidate,
    chokepointStyle: 'twin_fords',
    seed: (spec.seed ^ 0x5bd1e995) >>> 0,
  };
  return { spec: candidate, mutatedSeed: true };
}

function buildLocalFlavorSummary(spec: SkirmishSpec): string {
  const pCiv = CIVS[spec.playerCiv].name;
  const eCiv = CIVS[spec.enemyCiv].name;
  const biome = BIOMES[spec.biome].name;
  const mod = DAILY_MODIFIERS[spec.modifier].name;
  const choke = chokeDisplayName(spec.chokepointStyle);
  return clampText(
    `Royal Decree "${mod}" over ${biome}: lead ${pCiv} across the ${choke} to topple ${spec.aiLeaderName}'s ${eCiv} Keep!`,
    FLAVOR_MAX_CHARS,
  );
}

function parseDeterministicSkirmish(cleanPrompt: string): SkirmishSpec {
  const effectivePrompt = cleanPrompt || 'Royal Crown Standard Duel at Sherwood Ford';
  const lower = effectivePrompt.toLowerCase();
  const seed = hashString(`pocket-empires:craft:v1:${lower}`);
  const rng = createRng(seed || 0x1a2b3c4d);

  const biome = parseBiomeFromText(lower, rng);
  const explicitMod = parseModifierFromText(lower);
  const modifier: DailyModifierId =
    explicitMod ??
    (biome === 'gold_rush'
      ? 'gold_fever'
      : biome === 'black_forest'
        ? 'timber_boom'
        : 'standard');

  const civMentions = extractCivMentions(effectivePrompt);
  let playerCiv: CivId;
  let enemyCiv: CivId;

  if (civMentions.length >= 2) {
    // Check if user wrote "against X as Y"
    const againstAsMatch = /\b(?:against|vs\.?|versus|fighting)\s+\w+.*\bas\s+(\w+)/i.exec(
      effectivePrompt,
    );
    if (againstAsMatch) {
      const asCiv = extractCivMentions(againstAsMatch[1])[0];
      if (asCiv && asCiv === civMentions[1]) {
        playerCiv = civMentions[1];
        enemyCiv = civMentions[0];
      } else {
        playerCiv = civMentions[0];
        enemyCiv = civMentions[1];
      }
    } else {
      playerCiv = civMentions[0];
      enemyCiv = civMentions[1];
    }
  } else if (civMentions.length === 1) {
    const single = civMentions[0];
    const isEnemyTarget = /\b(?:vs\.?|versus|against|fight(?:ing)?|defeat|survive|enemy)\s+(?:the\s+)?(?:britons?|franks?|byzantines?|vikings?|teutons?|mongols?)/i.test(
      effectivePrompt,
    );
    if (isEnemyTarget) {
      enemyCiv = single;
      if (modifier === 'wololo_sabbath' && enemyCiv !== 'byzantines') {
        playerCiv = 'byzantines';
      } else if (modifier === 'fletchers_wind' && enemyCiv !== 'britons') {
        playerCiv = 'britons';
      } else if (modifier === 'iron_vanguard' && enemyCiv !== 'vikings') {
        playerCiv = 'vikings';
      } else {
        const others = ALL_CIVS.filter((c) => c !== enemyCiv);
        playerCiv = pick(rng, others);
      }
    } else {
      playerCiv = single;
      const others = ALL_CIVS.filter((c) => c !== playerCiv);
      enemyCiv = pick(rng, others);
    }
  } else {
    // Infer thematic civs when unit archetypes are named without explicit civ names
    if (modifier === 'wololo_sabbath') {
      playerCiv = 'byzantines';
    } else if (modifier === 'fletchers_wind') {
      playerCiv = 'britons';
    } else if (/\b(knights?|cavalry|horses?)\b/.test(lower)) {
      playerCiv = 'franks';
    } else if (modifier === 'iron_vanguard') {
      playerCiv = 'vikings';
    } else {
      playerCiv = pick(rng, ALL_CIVS);
    }
    const others = ALL_CIVS.filter((c) => c !== playerCiv);
    enemyCiv = pick(rng, others);
  }

  const chokepointStyle = parseChokepointFromText(lower, biome, rng);
  const aiPersona = selectPersonaForEnemy(lower, enemyCiv, modifier, rng);
  const aiLeaderName = pick(rng, PERSONA_LEADERS[aiPersona]);

  const isBlitz = /\b(blitz|rush|fast|speed|quick|aggro)\b/.test(lower);
  const isSiege = /\b(turtle|fortress|marathon|epic|wall|defend|siege)\b/.test(lower);
  const parSec = isBlitz ? 115 : isSiege ? 150 : chokepointStyle === 'open_steppe' ? 125 : 135;

  const richGold = /\b(rich|wealthy|gold\s*boom|mega\s*gold|high\s*gold|imperial|deathmatch)\b/.test(
    lower,
  );
  const startingGoldBonus = richGold ? 85 : modifier === 'gold_fever' ? 35 : undefined;

  const mapName = pick(rng, CUSTOM_MAP_TITLES[biome]);

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
    parSec,
    ...(startingGoldBonus !== undefined ? { startingGoldBonus } : {}),
    chokepointStyle,
    isCustom: true,
    customPrompt: cleanPrompt || 'Royal Custom Skirmish',
  };
}

const SKIRMISH_CRAFTER_SYSTEM_PROMPT = [
  'You are the Royal Cartographer & War-Room Chronicler for Pocket Empires (an Age of Empires II micro-RTS).',
  'Convert the user skirmish request into strict JSON only (no markdown fences) with keys:',
  '{"biome":"sherwood|black_forest|gold_rush|highlands|autumn_steppe|oasis",',
  '"playerCiv":"britons|franks|byzantines|vikings|teutons|mongols",',
  '"enemyCiv":"britons|franks|byzantines|vikings|teutons|mongols",',
  '"modifier":"standard|gold_fever|wololo_sabbath|timber_boom|iron_vanguard|fletchers_wind",',
  '"chokepointStyle":"twin_fords|central_bridge| canyon_pass|open_steppe",',
  '"aiPersona":"longbow_earl|knight_baron|viking_jarl|monk_abbot",',
  '"mapName":"2-4 word medieval battlefield title",',
  '"flavorSummary":"1 witty AoE2 Royal Chronicler sentence <= 145 chars"}.',
].join(' ');

interface LocalSkirmishJson {
  biome?: string;
  playerCiv?: string;
  enemyCiv?: string;
  modifier?: string;
  chokepointStyle?: string;
  aiPersona?: string;
  mapName?: string;
  flavorSummary?: string;
}

function tryParseSkirmishJson(raw: string): LocalSkirmishJson | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as LocalSkirmishJson;
    }
    return null;
  } catch {
    return null;
  }
}

function isOneOf<T extends string>(val: unknown, allowed: readonly T[]): val is T {
  return typeof val === 'string' && (allowed as readonly string[]).includes(val);
}

export async function craftSkirmishFromPrompt(prompt: string): Promise<CraftedSkirmishResult> {
  const cleanPrompt = prompt.trim().slice(0, 280);

  // 1. Check direct or embedded `PE-...` challenge share code first
  const directDecoded = decodeSkirmishCode(cleanPrompt);
  const embeddedMatch = !directDecoded
    ? /\b(PE-[0-5]{6}-[0-9A-Fa-f]{4,8})\b/.exec(cleanPrompt)
    : null;
  const codeToken = directDecoded
    ? cleanPrompt.toUpperCase()
    : embeddedMatch
      ? embeddedMatch[1].toUpperCase()
      : null;
  const decodedSpec = directDecoded ?? (codeToken ? decodeSkirmishCode(codeToken) : null);

  if (decodedSpec && codeToken) {
    const { spec: verifiedSpec, mutatedSeed } = ensureWalkableSpec(decodedSpec);
    const shareCode = mutatedSeed ? encodeSkirmishCode(verifiedSpec) : codeToken;
    return {
      spec: verifiedSpec,
      shareCode,
      flavorSummary: clampText(
        `Royal Seal verified (${shareCode}): ${CIVS[verifiedSpec.playerCiv].name} vs ${verifiedSpec.aiLeaderName}'s ${CIVS[verifiedSpec.enemyCiv].name} at ${verifiedSpec.mapName}!`,
        FLAVOR_MAX_CHARS,
      ),
      source: 'royal-tactician-local',
    };
  }

  // 2. Build deterministic Royal Cartographer spec from natural language
  let baseSpec = parseDeterministicSkirmish(cleanPrompt);
  let source: AIInferenceSource = 'royal-tactician-local';
  let customFlavor: string | null = null;

  // 3. Optionally enrich via local browser `window.LanguageModel` when available
  if (cleanPrompt.length > 0) {
    const localModel = await runLocalModelCascade(
      SKIRMISH_CRAFTER_SYSTEM_PROMPT,
      `Craft a Pocket Empires skirmish for: "${cleanPrompt}"`,
    );
    if (localModel) {
      const parsed = tryParseSkirmishJson(localModel.text);
      if (parsed) {
        const rng = createRng(baseSpec.seed ^ 0x27d4eb2d);
        const biome = isOneOf(parsed.biome, ALL_BIOMES) ? parsed.biome : baseSpec.biome;
        const playerCiv = isOneOf(parsed.playerCiv, ALL_CIVS)
          ? parsed.playerCiv
          : baseSpec.playerCiv;
        const enemyCiv = isOneOf(parsed.enemyCiv, ALL_CIVS)
          ? parsed.enemyCiv
          : baseSpec.enemyCiv;
        const modifier = isOneOf(parsed.modifier, ALL_MODIFIERS)
          ? parsed.modifier
          : baseSpec.modifier;
        const normalizedChoke =
          parsed.chokepointStyle === 'canyon_pass' ? ' canyon_pass' : parsed.chokepointStyle;
        const chokepointStyle = isOneOf(normalizedChoke, ALL_CHOKES)
          ? normalizedChoke
          : baseSpec.chokepointStyle;
        const aiPersona = isOneOf(parsed.aiPersona, ALL_PERSONAS)
          ? parsed.aiPersona
          : baseSpec.aiPersona;
        const mapName =
          typeof parsed.mapName === 'string' && parsed.mapName.trim().length >= 4
            ? clampText(parsed.mapName.trim(), 38)
            : baseSpec.mapName;

        baseSpec = {
          ...baseSpec,
          biome,
          playerCiv,
          enemyCiv,
          modifier,
          chokepointStyle,
          aiPersona,
          aiLeaderName: pick(rng, PERSONA_LEADERS[aiPersona]),
          mapName,
        };
        if (typeof parsed.flavorSummary === 'string') {
          customFlavor = sanitizeRoyalProse(parsed.flavorSummary, FLAVOR_MAX_CHARS);
        }
        source = localModel.source;
      }
    }
  }

  // 4. Verify map walkability between PLAYER_TC_POS and ENEMY_TC_POS & encode PE-... share code
  const { spec: walkableSpec } = ensureWalkableSpec(baseSpec);
  const shareCode = encodeSkirmishCode(walkableSpec);
  const flavorSummary = customFlavor ?? buildLocalFlavorSummary(walkableSpec);

  return {
    spec: walkableSpec,
    shareCode,
    flavorSummary,
    source,
  };
}

/* -------------------------------------------------------------------------- */
/*  Post-Battle Royal Chronicler Epigraph (`composeBattleEpigraph`)           */
/* -------------------------------------------------------------------------- */

const EPIGRAPH_SYSTEM_PROMPT = [
  'You are the Royal War-Room Chronicler of Pocket Empires, penning one unforgettable Age of Empires II post-battle epigraph.',
  'Write ONE vivid, witty historical-chronicle sentence (<= 155 chars) commemorating this battle.',
  'Zero generic AI filler, no hashtags, no markdown fences, no surrounding quotes.',
].join(' ');

function buildDeterministicEpigraph(state: GameState, streak: number): string {
  const summary = computeScoreSummary(state);
  const mins = Math.floor(summary.timeSec / 60);
  const secs = String(summary.timeSec % 60).padStart(2, '0');
  const clock = `${mins}:${secs}`;
  const pCiv = CIVS[state.spec.playerCiv].name;
  const leader = state.spec.aiLeaderName;
  const map = state.spec.mapName;
  const safeStreak = Math.max(1, streak);

  if (!summary.victory) {
    if (state.stats.enemyUnitsSlain >= 5) {
      return clampText(
        `Though ${leader} held ${map}, ${state.stats.enemyUnitsSlain} invaders fell before our Keep—the ${pCiv} banner rises again at dawn.`,
        EPIGRAPH_MAX_CHARS,
      );
    }
    return clampText(
      `Smoke curls above ${map} where ${leader} prevailed in ${clock}, yet ${pCiv} masons already sharpen fresh steel.`,
      EPIGRAPH_MAX_CHARS,
    );
  }

  if (state.stats.cheekyWololo || state.stats.wololoConversions >= 2) {
    return clampText(
      `Chanting Taunt 30 across ${map}, ${pCiv} Monks turned ${state.stats.wololoConversions} of ${leader}'s own soldiers against their Keep in ${clock}!`,
      EPIGRAPH_MAX_CHARS,
    );
  }

  if (summary.crowns === 3) {
    return clampText(
      `Before ${leader}'s mortar dried at ${map}, ${pCiv} vanguards shattered the Keep in ${clock}—Crown Streak ${safeStreak} marches on!`,
      EPIGRAPH_MAX_CHARS,
    );
  }

  if ((state.stats.countsByUnit.knight ?? 0) >= 3) {
    return clampText(
      `Thunder of ${pCiv} Knights shook ${map}, trampling ${leader}'s garrison in ${clock} (${state.stats.enemyUnitsSlain} foes slain).`,
      EPIGRAPH_MAX_CHARS,
    );
  }

  if ((state.stats.countsByUnit.archer ?? 0) >= 4) {
    return clampText(
      `A darkening sky of ${pCiv} arrows pinned ${leader} inside ${map}, sealing victory in ${clock} (Streak ${safeStreak}).`,
      EPIGRAPH_MAX_CHARS,
    );
  }

  return clampText(
    `Through blood and timber at ${map}, ${pCiv} toppled ${leader}'s Keep in ${clock} to claim ${summary.crowns} Crown${summary.crowns === 1 ? '' : 's'}!`,
    EPIGRAPH_MAX_CHARS,
  );
}

export async function composeBattleEpigraph(
  state: GameState,
  streak: number,
): Promise<{ epigraph: string; source: AIInferenceSource }> {
  const fallbackEpigraph = buildDeterministicEpigraph(state, streak);
  const summary = computeScoreSummary(state);
  const mins = Math.floor(summary.timeSec / 60);
  const secs = String(summary.timeSec % 60).padStart(2, '0');

  const userPrompt = [
    `Outcome: ${summary.victory ? `Victory (${summary.crowns}/3 Crowns)` : 'Defeat'} in ${mins}:${secs} (Par ${state.spec.parSec}s).`,
    `Map: ${state.spec.mapName} (${BIOMES[state.spec.biome].name}).`,
    `Player: ${CIVS[state.spec.playerCiv].name}. Rival: ${state.spec.aiLeaderName} (${CIVS[state.spec.enemyCiv].name}).`,
    `Strategy: ${summary.strategyLabel}. Slain: ${state.stats.enemyUnitsSlain}, Lost: ${state.stats.unitsLost}, Wololo Conversions: ${state.stats.wololoConversions}, Cheeky Taunt 30: ${state.stats.cheekyWololo}.`,
    `Daily Win Streak: ${Math.max(1, streak)}.`,
    'Pen one vivid Royal Chronicler sentence (<= 155 chars):',
  ].join('\n');

  const localModel = await runLocalModelCascade(EPIGRAPH_SYSTEM_PROMPT, userPrompt);
  if (localModel) {
    const cleaned = sanitizeRoyalProse(localModel.text, EPIGRAPH_MAX_CHARS);
    if (cleaned) {
      return {
        epigraph: cleaned,
        source: localModel.source,
      };
    }
  }

  return {
    epigraph: fallbackEpigraph,
    source: 'royal-tactician-local',
  };
}
