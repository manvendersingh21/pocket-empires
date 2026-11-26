import type { SkirmishSpec } from '../types/rts.js';

export interface DailyBoardInputRow {
  username: string;
  score: number;
  timeSec: number;
  crowns: number;
  strategy: string;
  wololos: number;
}

export interface StandingEntry extends DailyBoardInputRow {
  isPlayer: boolean;
  isPacesetter: boolean;
}

export interface RivalChallenge {
  playerRank: number | null;
  totalCount: number;
  headline: string;
  subline: string;
}

function formatSec(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const rem = String(s % 60).padStart(2, '0');
  return `${m}:${rem}`;
}

function compareStandings(a: StandingEntry, b: StandingEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
  if (a.isPacesetter !== b.isPacesetter) return a.isPacesetter ? 1 : -1;
  return a.username.localeCompare(b.username);
}

export function buildLiveDailyStandings(
  spec: SkirmishSpec,
  serverRows: readonly DailyBoardInputRow[],
  localBest?: DailyBoardInputRow | null,
  playerServerRank?: number | null,
): StandingEntry[] {
  const byUser = new Map<string, StandingEntry>();

  for (const row of serverRows) {
    const uname = row.username.trim();
    if (!uname) continue;
    const candidate: StandingEntry = {
      username: uname,
      score: Math.max(0, Math.round(row.score)),
      timeSec: Math.max(1, Math.round(row.timeSec)),
      crowns: Math.max(0, Math.min(3, Math.round(row.crowns))),
      strategy: row.strategy || 'Combined Arms Siege',
      wololos: Math.max(0, Math.floor(row.wololos)),
      isPlayer: Boolean(localBest && uname === localBest.username),
      isPacesetter: false,
    };
    const existing = byUser.get(uname);
    if (
      !existing ||
      candidate.score > existing.score ||
      (candidate.score === existing.score && candidate.timeSec < existing.timeSec)
    ) {
      byUser.set(uname, candidate);
    }
  }

  let matchedServerPlayer: StandingEntry | null = null;
  if (typeof playerServerRank === 'number' && playerServerRank >= 1) {
    const sortedServer = Array.from(byUser.values()).sort(compareStandings);
    const hit = sortedServer[playerServerRank - 1];
    if (hit) {
      hit.isPlayer = true;
      matchedServerPlayer = hit;
    }
  }

  if (localBest && localBest.username.trim()) {
    const uname = localBest.username.trim();
    const localScore = Math.max(0, Math.round(localBest.score));
    const localTime = Math.max(1, Math.round(localBest.timeSec));
    if (matchedServerPlayer) {
      if (
        localScore > matchedServerPlayer.score ||
        (localScore === matchedServerPlayer.score && localTime < matchedServerPlayer.timeSec)
      ) {
        matchedServerPlayer.score = localScore;
        matchedServerPlayer.timeSec = localTime;
        matchedServerPlayer.crowns = Math.max(
          matchedServerPlayer.crowns,
          Math.max(0, Math.min(3, Math.round(localBest.crowns))),
        );
      }
    } else {
      const localEntry: StandingEntry = {
        username: uname,
        score: localScore,
        timeSec: localTime,
        crowns: Math.max(0, Math.min(3, Math.round(localBest.crowns))),
        strategy: localBest.strategy || 'Combined Arms Siege',
        wololos: Math.max(0, Math.floor(localBest.wololos)),
        isPlayer: true,
        isPacesetter: false,
      };
      const existing = byUser.get(uname);
      if (
        !existing ||
        localEntry.score > existing.score ||
        (localEntry.score === existing.score && localEntry.timeSec < existing.timeSec)
      ) {
        byUser.set(uname, localEntry);
      } else if (existing) {
        existing.isPlayer = true;
      }
    }
  }

  const humanCount = byUser.size;
  if (humanCount < 4) {
    const pacesetters: StandingEntry[] = [
      {
        username: 'Gold Sovereign',
        score: 2880,
        timeSec: Math.max(92, spec.parSec - 18),
        crowns: 3,
        strategy: 'Heavy Cavalry Charge',
        wololos: 2,
        isPlayer: false,
        isPacesetter: true,
      },
      {
        username: 'Silver Warden',
        score: 2290,
        timeSec: spec.parSec + 12,
        crowns: 2,
        strategy: 'Wololo Cult',
        wololos: 1,
        isPlayer: false,
        isPacesetter: true,
      },
      {
        username: 'Bronze Yeoman',
        score: 1760,
        timeSec: spec.parSec + 48,
        crowns: 1,
        strategy: 'Combined Arms Siege',
        wololos: 0,
        isPlayer: false,
        isPacesetter: true,
      },
    ];
    for (const p of pacesetters) {
      if (!byUser.has(p.username)) {
        byUser.set(p.username, p);
      }
    }
  }

  return Array.from(byUser.values()).sort(compareStandings).slice(0, 15);
}

export function computeRivalChallenge(
  standings: readonly StandingEntry[],
  playerScore: number | null,
  playerTimeSec: number | null,
  parSec: number,
): RivalChallenge {
  const totalCount = standings.length;
  if (totalCount === 0) {
    return {
      playerRank: null,
      totalCount: 0,
      headline: `Claim #1 on Today's Siege`,
      subline: `Beat Par ${formatSec(parSec)} for 3 Crowns & first-blood leaderboard glory.`,
    };
  }

  let playerIdx = standings.findIndex((s) => s.isPlayer);
  if (playerIdx < 0 && playerScore !== null && playerScore > 0) {
    playerIdx = standings.findIndex((s) => s.score <= playerScore);
    if (playerIdx < 0) playerIdx = standings.length - 1;
  }

  if (playerScore === null || playerScore <= 0 || playerIdx < 0) {
    const targetIdx = Math.max(0, Math.min(standings.length - 1, 2));
    const target = standings[targetIdx];
    return {
      playerRank: null,
      totalCount,
      headline: `Target: ${target.score.toLocaleString()} pts to pass #${targetIdx + 1} ${target.username}`,
      subline: `Beat Par ${formatSec(parSec)}, grab Sacred Relics & clear Royal Bounties!`,
    };
  }

  const playerRank = playerIdx + 1;
  if (playerIdx === 0) {
    const runnerUp = standings[1];
    if (!runnerUp) {
      return {
        playerRank: 1,
        totalCount,
        headline: 'Reigning #1 Sovereign Today!',
        subline: `Post your Chronicle to comments or push Imperial 1.35x for an untouchable lead.`,
      };
    }
    const leadPts = Math.max(0, playerScore - runnerUp.score);
    return {
      playerRank: 1,
      totalCount,
      headline: 'Reigning #1 Sovereign Today!',
      subline:
        leadPts > 0
          ? `Leading #2 ${runnerUp.username} by +${leadPts.toLocaleString()} pts.`
          : `Ahead of #2 ${runnerUp.username} on clear-time tiebreaker!`,
    };
  }

  const ahead = standings[playerIdx - 1];
  const ptGap = Math.max(0, ahead.score - playerScore);
  if (ptGap > 0) {
    return {
      playerRank,
      totalCount,
      headline: `Rank #${playerRank} · Only ${ptGap.toLocaleString()} pts behind #${playerRank - 1} ${ahead.username}!`,
      subline: `Complete a Royal Bounty (+200) or try Veteran 1.2x / Imperial 1.35x to overtake.`,
    };
  }

  const secGap =
    playerTimeSec !== null ? Math.max(1, Math.round(playerTimeSec - ahead.timeSec)) : 1;
  return {
    playerRank,
    totalCount,
    headline: `Rank #${playerRank} · Tied on score — ${secGap}s faster overtakes #${playerRank - 1} ${ahead.username}!`,
    subline: `Shave seconds off the river breach or queue Knights faster to claim #${playerRank - 1}.`,
  };
}

export function formatUtcResetCountdown(nowMs: number = Date.now()): string {
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const d = new Date(safeNow);
  const nextMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
  const remainingMin = Math.max(1, Math.floor((nextMidnight - safeNow) / 60_000));
  const hours = Math.floor(remainingMin / 60);
  const mins = remainingMin % 60;
  return `Next Siege in ${hours}h ${String(mins).padStart(2, '0')}m`;
}
