import type {
  CommunityWarStatsDto,
  CompleteMatchResponse,
  DailyLeaderboardEntry,
  DailyWarRoomResponse,
  PlayerWarRoomStatsDto,
  SubmitChronicleCommentResponse,
} from '../shared/messages.js';

export type {
  CommunityWarStatsDto,
  CompleteMatchResponse,
  DailyLeaderboardEntry,
  DailyWarRoomResponse,
  PlayerWarRoomStatsDto,
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
