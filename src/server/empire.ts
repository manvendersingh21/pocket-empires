import type {
  CommunityWarStatsDto,
  CompleteMatchResponse,
  DailyLeaderboardEntry,
  DailyWarRoomResponse,
  ListPlayerBasesResponse,
  PlayerWarRoomStatsDto,
  RecordRaidRequest,
  RecordRaidResponse,
  SavePlayerBaseRequest,
  SavePlayerBaseResponse,
  SubmitChronicleCommentResponse,
} from '../shared/messages.js';
import type {
  BiomeId,
  BuildingKind,
  CivId,
  PlayerBaseBlueprint,
  SavedBuildingPlacement,
  UnitKind,
} from '../types/rts.js';

export type {
  CommunityWarStatsDto,
  CompleteMatchResponse,
  DailyLeaderboardEntry,
  DailyWarRoomResponse,
  ListPlayerBasesResponse,
  PlayerBaseBlueprint,
  PlayerWarRoomStatsDto,
  RecordRaidRequest,
  RecordRaidResponse,
  SavedBuildingPlacement,
  SavePlayerBaseRequest,
  SavePlayerBaseResponse,
  SubmitChronicleCommentResponse,
};

/**
 * Minimal Redis interface satisfied identically by Devvit's live `redis` client
 * and lightweight in-memory test doubles.
 */
export interface RedisLike {
  get: (key: string) => Promise<string | null | undefined>;
  set: (key: string, value: string) => Promise<unknown>;
}

/**
 * Minimal Reddit API interface satisfied by Devvit's `reddit` client
 * and unit-test mocks.
 */
export interface RedditLike {
  setUserFlair?: (opts: {
    subredditName: string;
    username: string;
    text: string;
    textColor?: 'light' | 'dark';
    backgroundColor?: string;
  }) => Promise<unknown>;
  submitComment?: (opts: {
    id: `t3_${string}`;
    text: string;
  }) => Promise<unknown>;
}

export interface RecordMatchCompletionOptions {
  subredditName?: string;
  username: string;
  dateKey: string;
  victory: boolean;
  score: number;
  timeSec: number;
  crowns: number;
  strategy: string;
  wololos: number;
}

export interface SubmitWarChronicleOptions {
  postId: string;
  username: string;
  dateKey: string;
  text: string;
}

interface StoredCommunityStats {
  totalPlays: number;
  totalWins: number;
  totalWololos: number;
  strategyCounts: Record<string, number>;
  fastestCommander: { username: string; timeSec: number } | null;
}

interface StoredPlayerProfile {
  streak: number;
  lastWinDate: string;
}

export class EmpireValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmpireValidationError';
  }
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LEADERBOARD_ROWS = 15;
const MIN_COMMENT_CHARS = 10;
const MAX_COMMENT_CHARS = 600;

/** Returns today's UTC date key formatted as `YYYY-MM-DD`. */
export function todayUtcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Validates that `dateKey` is a real calendar date in `YYYY-MM-DD` format. */
export function isValidDateKey(dateKey: unknown): dateKey is string {
  if (typeof dateKey !== 'string' || !DATE_KEY_RE.test(dateKey)) {
    return false;
  }
  const ms = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(ms)) {
    return false;
  }
  return new Date(ms).toISOString().slice(0, 10) === dateKey;
}

/** Returns the previous UTC calendar day (`YYYY-MM-DD`) for a valid `dateKey`. */
export function yesterdayDateKey(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    throw new EmpireValidationError('Invalid dateKey: expected YYYY-MM-DD');
  }
  const ms = Date.parse(`${dateKey}T00:00:00Z`);
  return new Date(ms - 86_400_000).toISOString().slice(0, 10);
}

function boardRedisKey(dateKey: string): string {
  return `empire:daily:${dateKey}:board`;
}

function statsRedisKey(dateKey: string): string {
  return `empire:daily:${dateKey}:stats`;
}

function playerRedisKey(username: string): string {
  return `empire:player:${username}`;
}

function commentGuardRedisKey(postId: string, dateKey: string, username: string): string {
  return `empire:comment:${postId}:${dateKey}:${username}`;
}

async function readJson<T>(redis: RedisLike, key: string, fallback: T): Promise<T> {
  const raw = await redis.get(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function defaultStoredStats(): StoredCommunityStats {
  return {
    totalPlays: 0,
    totalWins: 0,
    totalWololos: 0,
    strategyCounts: {},
    fastestCommander: null,
  };
}

function defaultPlayerProfile(): StoredPlayerProfile {
  return {
    streak: 0,
    lastWinDate: '',
  };
}

function compareLeaderboardEntries(a: DailyLeaderboardEntry, b: DailyLeaderboardEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
  return a.username.localeCompare(b.username);
}

function computeTopStrategy(strategyCounts: Record<string, number>): string {
  let topName = '';
  let topCount = 0;
  for (const [strategy, count] of Object.entries(strategyCounts)) {
    if (count > topCount || (count === topCount && (topName === '' || strategy < topName))) {
      topName = strategy;
      topCount = count;
    }
  }
  return topName;
}

function toCommunityDto(stored: StoredCommunityStats): CommunityWarStatsDto {
  return {
    totalPlays: stored.totalPlays,
    totalWins: stored.totalWins,
    totalWololos: stored.totalWololos,
    topStrategy: computeTopStrategy(stored.strategyCounts ?? {}),
    fastestCommander: stored.fastestCommander ?? null,
  };
}

function computeActiveStreak(profile: StoredPlayerProfile, dateKey: string): number {
  if (profile.streak <= 0 || !profile.lastWinDate) return 0;
  if (profile.lastWinDate === dateKey || profile.lastWinDate === yesterdayDateKey(dateKey)) {
    return profile.streak;
  }
  return 0;
}

/**
 * Awards dynamic Subreddit User Flair based on daily streak and Wololo mastery.
 * Wrapped in `try / catch` so restricted subreddit permissions never fail match completion.
 */
export async function tryAwardUserFlair(
  reddit: RedditLike | null | undefined,
  subredditName: string | undefined,
  username: string,
  streak: number,
  wololos: number,
): Promise<string | null> {
  const cleanSub = subredditName?.trim();
  const cleanUser = username.trim();
  if (!cleanSub || !cleanUser || cleanUser === 'anonymous' || streak < 1) {
    return null;
  }
  if (!reddit || typeof reddit.setUserFlair !== 'function') {
    return null;
  }
  const flairText =
    wololos >= 2
      ? `🧙 Wololo Lord · 🔥 ${streak}d`
      : `👑 Siege Victor · 🔥 ${streak}d`;
  try {
    await reddit.setUserFlair({
      subredditName: cleanSub,
      username: cleanUser,
      text: flairText,
    });
    return flairText;
  } catch {
    return null;
  }
}

/**
 * Loads the Daily War Room snapshot (`leaderboard` top 15, `community` stats, and `player` standing).
 */
export async function getDailyWarRoom(
  redis: RedisLike,
  dateKey: string,
  username?: string,
): Promise<DailyWarRoomResponse> {
  if (!isValidDateKey(dateKey)) {
    throw new EmpireValidationError('Invalid dateKey: expected YYYY-MM-DD');
  }

  const [boardMap, storedStats] = await Promise.all([
    readJson<Record<string, DailyLeaderboardEntry>>(redis, boardRedisKey(dateKey), {}),
    readJson<StoredCommunityStats>(redis, statsRedisKey(dateKey), defaultStoredStats()),
  ]);

  const sortedEntries = Object.values(boardMap).sort(compareLeaderboardEntries);
  const leaderboard = sortedEntries.slice(0, MAX_LEADERBOARD_ROWS);
  const community = toCommunityDto({
    ...defaultStoredStats(),
    ...storedStats,
    strategyCounts: storedStats.strategyCounts ?? {},
  });

  const cleanUser = username?.trim();
  let player: PlayerWarRoomStatsDto = {
    streak: 0,
    bestScore: null,
    rank: null,
  };

  if (cleanUser && cleanUser !== 'anonymous') {
    const profile = await readJson<StoredPlayerProfile>(
      redis,
      playerRedisKey(cleanUser),
      defaultPlayerProfile(),
    );
    const rankIndex = sortedEntries.findIndex((row) => row.username === cleanUser);
    const userRow = boardMap[cleanUser];
    player = {
      streak: computeActiveStreak(profile, dateKey),
      bestScore: userRow ? userRow.score : null,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
    };
  }

  return {
    dateKey,
    leaderboard,
    community,
    player,
  };
}

/**
 * Records a Daily Siege completion, updating community telemetry, leaderboard bests,
 * consecutive daily streaks, and attempting to award Subreddit User Flair on victory.
 */
export async function recordMatchCompletion(
  redis: RedisLike,
  reddit: RedditLike | null | undefined,
  opts: RecordMatchCompletionOptions,
): Promise<CompleteMatchResponse> {
  if (!isValidDateKey(opts.dateKey)) {
    throw new EmpireValidationError('Invalid dateKey: expected YYYY-MM-DD');
  }
  const cleanUser = typeof opts.username === 'string' ? opts.username.trim() : '';
  if (!cleanUser) {
    throw new EmpireValidationError('Invalid username: expected non-empty string');
  }
  if (typeof opts.victory !== 'boolean') {
    throw new EmpireValidationError('Invalid victory flag: expected boolean');
  }
  if (typeof opts.score !== 'number' || !Number.isFinite(opts.score) || opts.score < 0) {
    throw new EmpireValidationError('Invalid score: expected finite number >= 0');
  }
  if (typeof opts.timeSec !== 'number' || !Number.isFinite(opts.timeSec) || opts.timeSec <= 0) {
    throw new EmpireValidationError('Invalid timeSec: expected finite number > 0');
  }

  const crowns =
    typeof opts.crowns === 'number' && Number.isFinite(opts.crowns)
      ? Math.max(0, Math.min(3, Math.round(opts.crowns)))
      : 0;
  const wololos =
    typeof opts.wololos === 'number' && Number.isFinite(opts.wololos)
      ? Math.max(0, Math.floor(opts.wololos))
      : 0;
  const strategy =
    typeof opts.strategy === 'string' && opts.strategy.trim().length > 0
      ? opts.strategy.trim().slice(0, 60)
      : 'Balanced Siege';

  const [boardMap, rawStats, profile] = await Promise.all([
    readJson<Record<string, DailyLeaderboardEntry>>(redis, boardRedisKey(opts.dateKey), {}),
    readJson<StoredCommunityStats>(redis, statsRedisKey(opts.dateKey), defaultStoredStats()),
    cleanUser !== 'anonymous'
      ? readJson<StoredPlayerProfile>(redis, playerRedisKey(cleanUser), defaultPlayerProfile())
      : Promise.resolve(defaultPlayerProfile()),
  ]);

  const stats: StoredCommunityStats = {
    totalPlays: (rawStats.totalPlays ?? 0) + 1,
    totalWins: rawStats.totalWins ?? 0,
    totalWololos: (rawStats.totalWololos ?? 0) + wololos,
    strategyCounts: { ...(rawStats.strategyCounts ?? {}) },
    fastestCommander: rawStats.fastestCommander ?? null,
  };

  let nextProfile: StoredPlayerProfile = { ...profile };
  let flairAwarded: string | null = null;

  if (opts.victory) {
    stats.totalWins += 1;
    stats.strategyCounts[strategy] = (stats.strategyCounts[strategy] ?? 0) + 1;

    if (
      cleanUser !== 'anonymous' &&
      (stats.fastestCommander === null || opts.timeSec < stats.fastestCommander.timeSec)
    ) {
      stats.fastestCommander = { username: cleanUser, timeSec: opts.timeSec };
    } else if (
      stats.fastestCommander === null &&
      cleanUser === 'anonymous'
    ) {
      stats.fastestCommander = { username: cleanUser, timeSec: opts.timeSec };
    }

    if (cleanUser !== 'anonymous') {
      const candidate: DailyLeaderboardEntry = {
        username: cleanUser,
        score: opts.score,
        timeSec: opts.timeSec,
        crowns,
        strategy,
        wololos,
      };
      const existing = boardMap[cleanUser];
      const isBetter =
        !existing ||
        candidate.score > existing.score ||
        (candidate.score === existing.score && candidate.timeSec < existing.timeSec);
      if (isBetter) {
        boardMap[cleanUser] = candidate;
      }

      if (profile.lastWinDate === opts.dateKey) {
        nextProfile = {
          streak: Math.max(1, profile.streak),
          lastWinDate: opts.dateKey,
        };
      } else if (profile.lastWinDate === yesterdayDateKey(opts.dateKey)) {
        nextProfile = {
          streak: Math.max(0, profile.streak) + 1,
          lastWinDate: opts.dateKey,
        };
      } else {
        nextProfile = {
          streak: 1,
          lastWinDate: opts.dateKey,
        };
      }
    }
  }

  const writes: Promise<unknown>[] = [
    redis.set(statsRedisKey(opts.dateKey), JSON.stringify(stats)),
  ];
  if (opts.victory && cleanUser !== 'anonymous') {
    writes.push(redis.set(boardRedisKey(opts.dateKey), JSON.stringify(boardMap)));
    writes.push(redis.set(playerRedisKey(cleanUser), JSON.stringify(nextProfile)));
  }
  await Promise.all(writes);

  if (opts.victory && cleanUser !== 'anonymous') {
    flairAwarded = await tryAwardUserFlair(
      reddit,
      opts.subredditName,
      cleanUser,
      nextProfile.streak,
      wololos,
    );
  }

  const sortedEntries = Object.values(boardMap).sort(compareLeaderboardEntries);
  const leaderboard = sortedEntries.slice(0, MAX_LEADERBOARD_ROWS);
  const community = toCommunityDto(stats);

  const activeStreak =
    cleanUser !== 'anonymous' ? computeActiveStreak(nextProfile, opts.dateKey) : 0;
  const rankIndex =
    cleanUser !== 'anonymous'
      ? sortedEntries.findIndex((row) => row.username === cleanUser)
      : -1;
  const userRow = cleanUser !== 'anonymous' ? boardMap[cleanUser] : undefined;
  const bestScore = userRow ? userRow.score : null;
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;

  return {
    saved: true,
    dateKey: opts.dateKey,
    leaderboard,
    community,
    player: {
      streak: activeStreak,
      bestScore,
      rank,
    },
    streak: activeStreak,
    bestScore,
    rank,
    flairAwarded,
  };
}

/**
 * Submits a spoiler-free War Chronicle comment to the Reddit post thread,
 * guarded against duplicate spam per `username + postId + dateKey`.
 */
export async function submitWarChronicleComment(
  redis: RedisLike,
  reddit: RedditLike | null | undefined,
  opts: SubmitWarChronicleOptions,
): Promise<SubmitChronicleCommentResponse> {
  const rawPostId = typeof opts.postId === 'string' ? opts.postId.trim() : '';
  if (!rawPostId || rawPostId === 'unknown-post') {
    return { posted: false, message: 'Invalid postId' };
  }
  const canonicalPostId: `t3_${string}` = rawPostId.startsWith('t3_')
    ? (rawPostId as `t3_${string}`)
    : `t3_${rawPostId}`;
  if (canonicalPostId.length <= 3) {
    return { posted: false, message: 'Invalid postId' };
  }

  const cleanUser = typeof opts.username === 'string' ? opts.username.trim() : '';
  if (!cleanUser || cleanUser === 'anonymous') {
    return { posted: false, message: 'Sign in to Reddit to post your War Chronicle' };
  }

  if (!isValidDateKey(opts.dateKey)) {
    return { posted: false, message: 'Invalid dateKey: expected YYYY-MM-DD' };
  }

  const rawText = typeof opts.text === 'string' ? opts.text : '';
  const trimmedText = rawText.trim();
  if (trimmedText.length < MIN_COMMENT_CHARS || rawText.length > MAX_COMMENT_CHARS) {
    return {
      posted: false,
      message: `Comment text must be between ${MIN_COMMENT_CHARS} and ${MAX_COMMENT_CHARS} characters`,
    };
  }

  const guardKey = commentGuardRedisKey(canonicalPostId, opts.dateKey, cleanUser);
  const alreadyPosted = await redis.get(guardKey);
  if (alreadyPosted) {
    return {
      posted: false,
      message: 'War Chronicle already posted for this daily siege',
    };
  }

  if (!reddit || typeof reddit.submitComment !== 'function') {
    return { posted: false, message: 'Reddit comment API unavailable' };
  }

  try {
    await reddit.submitComment({
      id: canonicalPostId,
      text: trimmedText,
    });
    await redis.set(guardKey, '1');
    return { posted: true, message: 'War Chronicle posted to thread!' };
  } catch {
    return { posted: false, message: 'Failed to submit War Chronicle comment' };
  }
}

// ---------------------------------------------------------------------------
// Clash-of-Clans Style Asynchronous Player Base Publishing & Raiding
// ---------------------------------------------------------------------------

const BASES_INDEX_REDIS_KEY = 'empire:bases:index';
const MAX_STORED_BASES = 30;
const MAX_RAIDABLE_BASES = 15;
const MAX_BASE_BUILDINGS = 45;
const MAX_GARRISON_UNITS = 14;
const DEFAULT_BASE_TROPHIES = 1000;
const MIN_BASE_TROPHIES = 800;

const VALID_CIVS: Record<CivId, true> = {
  britons: true,
  franks: true,
  byzantines: true,
  vikings: true,
  teutons: true,
  mongols: true,
};

const VALID_BIOMES: Record<BiomeId, true> = {
  sherwood: true,
  black_forest: true,
  gold_rush: true,
  highlands: true,
  autumn_steppe: true,
  oasis: true,
};

const BUILDING_SIZES: Record<BuildingKind, 1 | 2> = {
  town_center: 2,
  homestead: 1,
  farm: 1,
  stone_wall: 1,
  barracks: 1,
  archery_range: 1,
  stable: 1,
  monastery: 1,
  watchtower: 1,
};

const VALID_MILITARY_UNITS: Partial<Record<UnitKind, true>> = {
  scout: true,
  militia: true,
  pikeman: true,
  archer: true,
  knight: true,
  monk: true,
};

/**
 * Three authentic, balanced Age-of-Empires medieval citadels seeded so every
 * brand-new subreddit post immediately has rich forts to raid alongside community bases.
 */
export const DEFAULT_SEEDED_BASES: PlayerBaseBlueprint[] = [
  {
    owner: 'TheViper_AoE',
    empireName: 'Twin-Pond Bastion',
    civ: 'franks',
    biome: 'sherwood',
    buildings: [
      { kind: 'town_center', tileX: 9, tileY: 12 },
      { kind: 'watchtower', tileX: 8, tileY: 10 },
      { kind: 'watchtower', tileX: 10, tileY: 10 },
      { kind: 'watchtower', tileX: 7, tileY: 13 },
      { kind: 'stone_wall', tileX: 7, tileY: 10 },
      { kind: 'stone_wall', tileX: 11, tileY: 10 },
      { kind: 'stone_wall', tileX: 12, tileY: 10 },
      { kind: 'stone_wall', tileX: 7, tileY: 12 },
      { kind: 'stable', tileX: 8, tileY: 11 },
      { kind: 'stable', tileX: 11, tileY: 11 },
      { kind: 'barracks', tileX: 10, tileY: 11 },
      { kind: 'archery_range', tileX: 10, tileY: 15 },
      { kind: 'homestead', tileX: 11, tileY: 12 },
      { kind: 'homestead', tileX: 9, tileY: 15 },
      { kind: 'farm', tileX: 11, tileY: 13 },
      { kind: 'farm', tileX: 9, tileY: 14 },
      { kind: 'farm', tileX: 10, tileY: 14 },
      { kind: 'farm', tileX: 11, tileY: 14 },
    ],
    garrison: ['knight', 'knight', 'knight', 'pikeman', 'archer', 'archer', 'monk'],
    defenseWins: 9,
    raidsPlayed: 14,
    trophies: 1180,
    updatedAt: '2026-11-21T08:00:00.000Z',
  },
  {
    owner: 'LordDaut',
    empireName: "Daut's Keep",
    civ: 'britons',
    biome: 'highlands',
    buildings: [
      { kind: 'town_center', tileX: 9, tileY: 12 },
      { kind: 'watchtower', tileX: 8, tileY: 10 },
      { kind: 'watchtower', tileX: 11, tileY: 10 },
      { kind: 'stone_wall', tileX: 7, tileY: 10 },
      { kind: 'stone_wall', tileX: 10, tileY: 10 },
      { kind: 'stone_wall', tileX: 12, tileY: 10 },
      { kind: 'stone_wall', tileX: 7, tileY: 12 },
      { kind: 'stone_wall', tileX: 7, tileY: 13 },
      { kind: 'barracks', tileX: 8, tileY: 11 },
      { kind: 'barracks', tileX: 8, tileY: 12 },
      { kind: 'archery_range', tileX: 10, tileY: 11 },
      { kind: 'archery_range', tileX: 11, tileY: 11 },
      { kind: 'homestead', tileX: 11, tileY: 12 },
      { kind: 'homestead', tileX: 11, tileY: 13 },
      { kind: 'farm', tileX: 9, tileY: 14 },
      { kind: 'farm', tileX: 10, tileY: 14 },
      { kind: 'farm', tileX: 11, tileY: 14 },
    ],
    garrison: ['archer', 'archer', 'archer', 'archer', 'pikeman', 'pikeman', 'militia'],
    defenseWins: 6,
    raidsPlayed: 11,
    trophies: 1095,
    updatedAt: '2026-11-21T07:30:00.000Z',
  },
  {
    owner: 'SpiritOfTheLaw',
    empireName: 'Monastery Sanctum',
    civ: 'byzantines',
    biome: 'gold_rush',
    buildings: [
      { kind: 'town_center', tileX: 9, tileY: 12 },
      { kind: 'monastery', tileX: 8, tileY: 11 },
      { kind: 'monastery', tileX: 10, tileY: 11 },
      { kind: 'watchtower', tileX: 8, tileY: 10 },
      { kind: 'watchtower', tileX: 10, tileY: 10 },
      { kind: 'watchtower', tileX: 11, tileY: 12 },
      { kind: 'stone_wall', tileX: 7, tileY: 10 },
      { kind: 'stone_wall', tileX: 11, tileY: 10 },
      { kind: 'stone_wall', tileX: 7, tileY: 12 },
      { kind: 'barracks', tileX: 11, tileY: 11 },
      { kind: 'homestead', tileX: 8, tileY: 12 },
      { kind: 'homestead', tileX: 11, tileY: 13 },
      { kind: 'farm', tileX: 9, tileY: 14 },
      { kind: 'farm', tileX: 10, tileY: 14 },
      { kind: 'farm', tileX: 11, tileY: 14 },
      { kind: 'farm', tileX: 9, tileY: 15 },
    ],
    garrison: ['monk', 'monk', 'monk', 'pikeman', 'pikeman', 'knight'],
    defenseWins: 5,
    raidsPlayed: 9,
    trophies: 1040,
    updatedAt: '2026-11-21T07:00:00.000Z',
  },
];

function normalizeOwner(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/^u\//i, '')
    .trim()
    .slice(0, 40);
}

function isValidCivId(value: unknown): value is CivId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VALID_CIVS, value);
}

function isValidBiomeId(value: unknown): value is BiomeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VALID_BIOMES, value);
}

function isValidBuildingKind(value: unknown): value is BuildingKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BUILDING_SIZES, value);
}

function isValidMilitaryUnit(value: unknown): value is UnitKind {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(VALID_MILITARY_UNITS, value)
  );
}

function cloneBase(base: PlayerBaseBlueprint): PlayerBaseBlueprint {
  return {
    owner: base.owner,
    empireName: base.empireName,
    civ: base.civ,
    biome: base.biome,
    buildings: base.buildings.map((b) => ({
      kind: b.kind,
      tileX: b.tileX,
      tileY: b.tileY,
    })),
    garrison: [...base.garrison],
    defenseWins: base.defenseWins,
    raidsPlayed: base.raidsPlayed,
    trophies: base.trophies,
    updatedAt: base.updatedAt,
  };
}

function compareBases(a: PlayerBaseBlueprint, b: PlayerBaseBlueprint): number {
  if (b.trophies !== a.trophies) return b.trophies - a.trophies;
  const timeA = Date.parse(a.updatedAt) || 0;
  const timeB = Date.parse(b.updatedAt) || 0;
  if (timeB !== timeA) return timeB - timeA;
  return a.owner.localeCompare(b.owner);
}

function sanitizeBuildings(raw: unknown): SavedBuildingPlacement[] | null {
  if (!Array.isArray(raw)) return null;

  const validCandidates: SavedBuildingPlacement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (!isValidBuildingKind(candidate.kind)) continue;
    if (typeof candidate.tileX !== 'number' || !Number.isFinite(candidate.tileX)) continue;
    if (typeof candidate.tileY !== 'number' || !Number.isFinite(candidate.tileY)) continue;

    const rawX = Math.floor(candidate.tileX);
    const rawY = Math.floor(candidate.tileY);
    if (rawX < 0 || rawX > 15 || rawY < 0 || rawY > 15) continue;

    const size = BUILDING_SIZES[candidate.kind];
    const tileX = size === 2 ? Math.min(14, rawX) : rawX;
    const tileY = size === 2 ? Math.min(14, rawY) : rawY;
    validCandidates.push({ kind: candidate.kind, tileX, tileY });
  }

  const tcIndex = validCandidates.findIndex((b) => b.kind === 'town_center');
  if (tcIndex < 0) return null;

  // Ensure the primary Town Center claims its 2x2 footprint first and is never truncated
  const ordered: SavedBuildingPlacement[] = [
    validCandidates[tcIndex],
    ...validCandidates.slice(0, tcIndex),
    ...validCandidates.slice(tcIndex + 1),
  ];

  const occupied = new Set<string>();
  const sanitized: SavedBuildingPlacement[] = [];

  for (const b of ordered) {
    if (sanitized.length >= MAX_BASE_BUILDINGS) break;
    const size = BUILDING_SIZES[b.kind];
    let overlaps = false;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (occupied.has(`${b.tileX + dx},${b.tileY + dy}`)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) break;
    }
    if (overlaps) continue;

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        occupied.add(`${b.tileX + dx},${b.tileY + dy}`);
      }
    }
    sanitized.push(b);
  }

  return sanitized.some((b) => b.kind === 'town_center') ? sanitized : null;
}

function sanitizeGarrison(raw: unknown): UnitKind[] {
  if (!Array.isArray(raw)) return [];
  const garrison: UnitKind[] = [];
  for (const unit of raw) {
    if (garrison.length >= MAX_GARRISON_UNITS) break;
    if (isValidMilitaryUnit(unit)) {
      garrison.push(unit);
    }
  }
  return garrison;
}

async function readStoredBases(redis: RedisLike): Promise<PlayerBaseBlueprint[]> {
  const raw = await redis.get(BASES_INDEX_REDIS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const bases: PlayerBaseBlueprint[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const b = item as Record<string, unknown>;
      const owner = normalizeOwner(b.owner);
      if (!owner || !isValidCivId(b.civ) || !isValidBiomeId(b.biome)) continue;
      const buildings = sanitizeBuildings(b.buildings);
      if (!buildings) continue;
      bases.push({
        owner,
        empireName:
          typeof b.empireName === 'string' && b.empireName.trim().length > 0
            ? b.empireName.trim().slice(0, 48)
            : `${owner}'s Citadel`,
        civ: b.civ,
        biome: b.biome,
        buildings,
        garrison: sanitizeGarrison(b.garrison),
        defenseWins:
          typeof b.defenseWins === 'number' && Number.isFinite(b.defenseWins)
            ? Math.max(0, Math.floor(b.defenseWins))
            : 0,
        raidsPlayed:
          typeof b.raidsPlayed === 'number' && Number.isFinite(b.raidsPlayed)
            ? Math.max(0, Math.floor(b.raidsPlayed))
            : 0,
        trophies:
          typeof b.trophies === 'number' && Number.isFinite(b.trophies)
            ? Math.max(MIN_BASE_TROPHIES, Math.floor(b.trophies))
            : DEFAULT_BASE_TROPHIES,
        updatedAt:
          typeof b.updatedAt === 'string' && b.updatedAt.trim().length > 0
            ? b.updatedAt
            : new Date(0).toISOString(),
      });
    }
    return bases;
  } catch {
    return [];
  }
}

/**
 * Looks up a specific commander's published base in Redis (if saved).
 */
export async function getPlayerBase(
  redis: RedisLike,
  owner: string,
): Promise<PlayerBaseBlueprint | null> {
  const cleanOwner = normalizeOwner(owner);
  if (!cleanOwner || cleanOwner.toLowerCase() === 'anonymous') return null;
  const stored = await readStoredBases(redis);
  const found = stored.find((b) => b.owner.toLowerCase() === cleanOwner.toLowerCase());
  return found ? cloneBase(found) : null;
}

/**
 * Lists up to 15 raidable player bases, merging Redis-saved community citadels
 * (up to 30 stored, sorted by trophies desc / recency) with `DEFAULT_SEEDED_BASES`
 * (deduped by owner).
 */
export async function listPlayerBases(
  redis: RedisLike,
  excludeOwner?: string,
): Promise<PlayerBaseBlueprint[]> {
  const stored = await readStoredBases(redis);
  const cleanExclude = normalizeOwner(excludeOwner).toLowerCase();

  const seenOwners = new Set<string>();
  const merged: PlayerBaseBlueprint[] = [];

  for (const base of stored) {
    const key = base.owner.toLowerCase();
    if (seenOwners.has(key)) continue;
    seenOwners.add(key);
    merged.push(cloneBase(base));
  }

  for (const seeded of DEFAULT_SEEDED_BASES) {
    const key = seeded.owner.toLowerCase();
    if (seenOwners.has(key)) continue;
    seenOwners.add(key);
    merged.push(cloneBase(seeded));
  }

  const filtered = cleanExclude
    ? merged.filter((b) => b.owner.toLowerCase() !== cleanExclude)
    : merged;

  filtered.sort(compareBases);
  return filtered.slice(0, MAX_RAIDABLE_BASES);
}

/**
 * Validates, sanitizes, and persists a player's published citadel blueprint to Redis.
 * Preserves existing `defenseWins`, `raidsPlayed`, and `trophies` (default `1000`) when updating.
 */
export async function savePlayerBase(
  redis: RedisLike,
  input: {
    owner: string;
    empireName?: string;
    civ: CivId;
    biome: BiomeId;
    buildings: SavedBuildingPlacement[];
    garrison: UnitKind[];
  },
): Promise<PlayerBaseBlueprint | null> {
  if (!input || typeof input !== 'object') return null;

  const owner = normalizeOwner(input.owner);
  if (!owner || owner.toLowerCase() === 'anonymous') return null;
  if (!isValidCivId(input.civ)) return null;
  if (!isValidBiomeId(input.biome)) return null;

  const buildings = sanitizeBuildings(input.buildings);
  if (!buildings) return null;

  const garrison = sanitizeGarrison(input.garrison);

  const stored = await readStoredBases(redis);
  const ownerKey = owner.toLowerCase();
  const existingIdx = stored.findIndex((b) => b.owner.toLowerCase() === ownerKey);
  const existing =
    existingIdx >= 0
      ? stored[existingIdx]
      : DEFAULT_SEEDED_BASES.find((b) => b.owner.toLowerCase() === ownerKey);

  const rawEmpireName =
    typeof input.empireName === 'string'
      ? input.empireName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 48)
      : '';
  const empireName =
    rawEmpireName || existing?.empireName || `${owner}'s Citadel`;

  const saved: PlayerBaseBlueprint = {
    owner: existing?.owner ?? owner,
    empireName,
    civ: input.civ,
    biome: input.biome,
    buildings,
    garrison,
    defenseWins: existing ? existing.defenseWins : 0,
    raidsPlayed: existing ? existing.raidsPlayed : 0,
    trophies: existing ? existing.trophies : DEFAULT_BASE_TROPHIES,
    updatedAt: new Date().toISOString(),
  };

  const withoutCurrent = stored.filter((b) => b.owner.toLowerCase() !== ownerKey);
  const nextStored = [saved, ...withoutCurrent].sort(compareBases);
  let capped = nextStored.slice(0, MAX_STORED_BASES);
  if (!capped.some((b) => b.owner.toLowerCase() === ownerKey)) {
    capped = [...capped.slice(0, MAX_STORED_BASES - 1), saved].sort(compareBases);
  }

  await redis.set(BASES_INDEX_REDIS_KEY, JSON.stringify(capped));
  return cloneBase(saved);
}

/**
 * Records the outcome of an asynchronous Clash-of-Clans raid:
 * - Updates defender's `raidsPlayed` (and `defenseWins++`, `trophies += 15` if `!victory`,
 *   or `trophies = Math.max(800, trophies - 10)` if `victory`).
 * - Awards `+25` trophies to attacker's saved base on `victory`.
 */
export async function recordRaidResult(
  redis: RedisLike,
  input: { attacker: string; defender: string; victory: boolean },
): Promise<{ trophiesDelta: number; defenderBase: PlayerBaseBlueprint | null }> {
  if (!input || typeof input !== 'object') {
    return { trophiesDelta: 0, defenderBase: null };
  }

  const attacker = normalizeOwner(input.attacker);
  const defender = normalizeOwner(input.defender);
  const victory = Boolean(input.victory);

  if (!defender || (attacker && attacker.toLowerCase() === defender.toLowerCase())) {
    return { trophiesDelta: 0, defenderBase: null };
  }

  const stored = await readStoredBases(redis);
  const defenderKey = defender.toLowerCase();
  let defenderIdx = stored.findIndex((b) => b.owner.toLowerCase() === defenderKey);

  if (defenderIdx < 0) {
    const seeded = DEFAULT_SEEDED_BASES.find((b) => b.owner.toLowerCase() === defenderKey);
    if (seeded) {
      stored.push(cloneBase(seeded));
      defenderIdx = stored.length - 1;
    }
  }

  let updatedDefender: PlayerBaseBlueprint | null = null;
  let dirty = false;

  if (defenderIdx >= 0) {
    const defBase = stored[defenderIdx];
    defBase.raidsPlayed += 1;
    if (victory) {
      defBase.trophies = Math.max(MIN_BASE_TROPHIES, defBase.trophies - 10);
    } else {
      defBase.defenseWins += 1;
      defBase.trophies += 15;
    }
    updatedDefender = cloneBase(defBase);
    dirty = true;
  }

  if (victory && attacker && attacker.toLowerCase() !== 'anonymous') {
    const attackerKey = attacker.toLowerCase();
    const attackerIdx = stored.findIndex((b) => b.owner.toLowerCase() === attackerKey);
    if (attackerIdx >= 0) {
      stored[attackerIdx].trophies += 25;
      dirty = true;
    }
  }

  if (dirty) {
    const nextStored = stored.sort(compareBases).slice(0, MAX_STORED_BASES);
    await redis.set(BASES_INDEX_REDIS_KEY, JSON.stringify(nextStored));
  }

  return {
    trophiesDelta: victory ? 25 : 0,
    defenderBase: updatedDefender,
  };
}
