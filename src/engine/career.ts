import type { DifficultyId, GameState, SkirmishSpec } from '../types/rts.js';
import { generateDailySpec } from './dailyGenerator.js';
import { computeScoreSummary } from './sim.js';

export interface DayCompletionRecord {
  dateKey: string;
  puzzleNumber: number;
  crowns: 0 | 1 | 2 | 3;
  bestScore: number;
  bestTimeSec: number | null;
  bountyIds: string[];
  bestDifficulty: DifficultyId;
}

export interface CareerProfile {
  xp: number;
  totalWins: number;
  totalCrowns: number;
  totalWololos: number;
  totalRelics: number;
  days: Record<string, DayCompletionRecord>;
}

export interface CareerRankDef {
  level: number;
  title: string;
  minXp: number;
}

export interface CareerRankInfo {
  level: number;
  title: string;
  currentXp: number;
  rankFloorXp: number;
  nextRankXp: number | null;
  nextTitle: string | null;
  progressPct: number;
}

export interface WeekLedgerEntry {
  dateKey: string;
  spec: SkirmishSpec;
  crowns: 0 | 1 | 2 | 3;
  bountiesDone: number;
  isToday: boolean;
}

export const IMPERIAL_RANKS: readonly CareerRankDef[] = [
  { level: 1, title: 'Yeoman', minXp: 0 },
  { level: 2, title: 'Man-at-Arms', minXp: 300 },
  { level: 3, title: 'Banneret', minXp: 800 },
  { level: 4, title: 'Castellan', minXp: 1600 },
  { level: 5, title: 'High Earl', minXp: 2800 },
  { level: 6, title: 'Grand Marshal', minXp: 4500 },
  { level: 7, title: 'Imperial Strategos', minXp: 7000 },
];

const DIFFICULTY_ORDER: Record<DifficultyId, number> = {
  standard: 0,
  veteran: 1,
  imperial: 2,
};

export function createEmptyCareerProfile(): CareerProfile {
  return {
    xp: 0,
    totalWins: 0,
    totalCrowns: 0,
    totalWololos: 0,
    totalRelics: 0,
    days: {},
  };
}

export function sanitizeCareerProfile(raw: unknown): CareerProfile {
  if (!raw || typeof raw !== 'object') return createEmptyCareerProfile();
  const obj = raw as Record<string, unknown>;
  const daysRaw =
    obj.days && typeof obj.days === 'object' && !Array.isArray(obj.days)
      ? (obj.days as Record<string, unknown>)
      : {};

  const days: Record<string, DayCompletionRecord> = {};
  for (const [key, val] of Object.entries(daysRaw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !val || typeof val !== 'object') continue;
    const rec = val as Record<string, unknown>;
    const crownsRaw = typeof rec.crowns === 'number' ? Math.round(rec.crowns) : 0;
    const crowns = Math.max(0, Math.min(3, crownsRaw)) as 0 | 1 | 2 | 3;
    const diff: DifficultyId =
      rec.bestDifficulty === 'imperial' || rec.bestDifficulty === 'veteran'
        ? rec.bestDifficulty
        : 'standard';
    const bountyIds = Array.isArray(rec.bountyIds)
      ? rec.bountyIds.filter((id): id is string => typeof id === 'string').slice(0, 6)
      : [];
    days[key] = {
      dateKey: key,
      puzzleNumber: typeof rec.puzzleNumber === 'number' ? rec.puzzleNumber : 0,
      crowns,
      bestScore: typeof rec.bestScore === 'number' && Number.isFinite(rec.bestScore) ? rec.bestScore : 0,
      bestTimeSec:
        typeof rec.bestTimeSec === 'number' && Number.isFinite(rec.bestTimeSec) ? rec.bestTimeSec : null,
      bountyIds,
      bestDifficulty: diff,
    };
  }

  return {
    xp: typeof obj.xp === 'number' && Number.isFinite(obj.xp) ? Math.max(0, Math.round(obj.xp)) : 0,
    totalWins:
      typeof obj.totalWins === 'number' && Number.isFinite(obj.totalWins)
        ? Math.max(0, Math.round(obj.totalWins))
        : 0,
    totalCrowns:
      typeof obj.totalCrowns === 'number' && Number.isFinite(obj.totalCrowns)
        ? Math.max(0, Math.round(obj.totalCrowns))
        : 0,
    totalWololos:
      typeof obj.totalWololos === 'number' && Number.isFinite(obj.totalWololos)
        ? Math.max(0, Math.round(obj.totalWololos))
        : 0,
    totalRelics:
      typeof obj.totalRelics === 'number' && Number.isFinite(obj.totalRelics)
        ? Math.max(0, Math.round(obj.totalRelics))
        : 0,
    days,
  };
}

export function getCareerRankInfo(xp: number): CareerRankInfo {
  const safeXp = Math.max(0, Math.round(xp));
  let idx = 0;
  for (let i = 0; i < IMPERIAL_RANKS.length; i++) {
    if (safeXp >= IMPERIAL_RANKS[i].minXp) {
      idx = i;
    }
  }
  const current = IMPERIAL_RANKS[idx];
  const next = idx + 1 < IMPERIAL_RANKS.length ? IMPERIAL_RANKS[idx + 1] : null;
  const span = next ? Math.max(1, next.minXp - current.minXp) : 1;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((safeXp - current.minXp) / span) * 100)))
    : 100;

  return {
    level: current.level,
    title: current.title,
    currentXp: safeXp,
    rankFloorXp: current.minXp,
    nextRankXp: next ? next.minXp : null,
    nextTitle: next ? next.title : null,
    progressPct,
  };
}

export function recordCareerMatch(
  profile: CareerProfile,
  state: GameState,
  completedBountyIds: readonly string[],
  totalScoreWithBounties: number,
): { nextProfile: CareerProfile; xpGained: number; newlyCompletedBounties: string[] } {
  if (state.outcome === 'playing' || state.mode === 'base_builder') {
    return { nextProfile: profile, xpGained: 0, newlyCompletedBounties: [] };
  }

  const summary = computeScoreSummary(state);
  const isDaily = !state.spec.isCustom && state.mode !== 'raid';
  const diff: DifficultyId = state.spec.difficulty ?? 'standard';
  const diffBonus = summary.victory ? (diff === 'imperial' ? 120 : diff === 'veteran' ? 60 : 0) : 0;

  const wololoXp = Math.min(60, state.stats.wololoConversions * 20);
  const relicXp = Math.min(50, (state.stats.relicsCaptured ?? 0) * 25);

  const days = { ...profile.days };
  let newlyCompletedBounties: string[] = [];

  if (isDaily) {
    const prev = days[state.spec.dateKey];
    const prevBounties = prev?.bountyIds ?? [];
    newlyCompletedBounties = completedBountyIds.filter((id) => !prevBounties.includes(id));
    const mergedBounties = Array.from(new Set([...prevBounties, ...completedBountyIds])).slice(0, 6);

    const prevDiff = prev?.bestDifficulty ?? 'standard';
    const bestDifficulty =
      summary.victory && DIFFICULTY_ORDER[diff] > DIFFICULTY_ORDER[prevDiff] ? diff : prevDiff;

    const nextCrowns = Math.max(prev?.crowns ?? 0, summary.crowns) as 0 | 1 | 2 | 3;
    const nextScore = Math.max(prev?.bestScore ?? 0, totalScoreWithBounties);
    const nextTime =
      summary.victory && (prev?.bestTimeSec === null || prev?.bestTimeSec === undefined || summary.timeSec < prev.bestTimeSec)
        ? summary.timeSec
        : (prev?.bestTimeSec ?? null);

    days[state.spec.dateKey] = {
      dateKey: state.spec.dateKey,
      puzzleNumber: state.spec.puzzleNumber,
      crowns: nextCrowns,
      bestScore: nextScore,
      bestTimeSec: nextTime,
      bountyIds: mergedBounties,
      bestDifficulty,
    };
  }

  const baseXp = summary.victory ? (isDaily ? 140 + summary.crowns * 45 : 95) : 35;
  const bountyXp = newlyCompletedBounties.length * 75;
  const xpGained = baseXp + diffBonus + bountyXp + wololoXp + relicXp;

  let totalCrowns = 0;
  for (const rec of Object.values(days)) {
    totalCrowns += rec.crowns;
  }

  const nextProfile: CareerProfile = {
    xp: profile.xp + xpGained,
    totalWins: profile.totalWins + (summary.victory ? 1 : 0),
    totalCrowns,
    totalWololos: profile.totalWololos + state.stats.wololoConversions,
    totalRelics: profile.totalRelics + (state.stats.relicsCaptured ?? 0),
    days,
  };

  return {
    nextProfile,
    xpGained,
    newlyCompletedBounties,
  };
}

export function shiftUtcDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number);
  const baseUtc =
    parts.length === 3 && parts.every((n) => Number.isFinite(n))
      ? Date.UTC(parts[0], parts[1] - 1, parts[2])
      : Date.now();
  return new Date(baseUtc + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

export function buildRecentWeekLedger(
  dailyDateKey: string,
  profile: CareerProfile,
): WeekLedgerEntry[] {
  const entries: WeekLedgerEntry[] = [];
  for (let delta = -6; delta <= 0; delta++) {
    const dateKey = delta === 0 ? dailyDateKey : shiftUtcDateKey(dailyDateKey, delta);
    const spec = generateDailySpec(dateKey);
    const rec = profile.days[dateKey];
    entries.push({
      dateKey,
      spec,
      crowns: rec?.crowns ?? 0,
      bountiesDone: rec?.bountyIds.length ?? 0,
      isToday: delta === 0,
    });
  }
  return entries;
}
