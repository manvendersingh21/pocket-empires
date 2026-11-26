import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_SEEDED_BASES,
  EmpireValidationError,
  getDailyWarRoom,
  getLeaderboardHub,
  isValidDateKey,
  listPlayerBases,
  recordMatchCompletion,
  recordRaidResult,
  savePlayerBase,
  submitWarChronicleComment,
  tryAwardUserFlair,
  yesterdayDateKey,
  type RedditLike,
  type RedisLike,
} from '../src/server/empire.ts';

function createFakeRedis(): RedisLike & { dump: () => Record<string, string> } {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}

function createFakeReddit(opts?: {
  throwOnFlair?: boolean;
  throwOnComment?: boolean;
}): {
  reddit: RedditLike;
  flairs: Array<{ subredditName: string; username: string; text: string }>;
  comments: Array<{ id: string; text: string }>;
} {
  const flairs: Array<{ subredditName: string; username: string; text: string }> = [];
  const comments: Array<{ id: string; text: string }> = [];
  return {
    flairs,
    comments,
    reddit: {
      setUserFlair: async (f) => {
        if (opts?.throwOnFlair) {
          throw new Error('Subreddit flair disabled by moderators');
        }
        flairs.push({
          subredditName: f.subredditName,
          username: f.username,
          text: f.text,
        });
      },
      submitComment: async (c) => {
        if (opts?.throwOnComment) {
          throw new Error('Thread is locked');
        }
        comments.push({ id: c.id, text: c.text });
        return { id: 't1_comment123' };
      },
    },
  };
}

test('date helpers validate YYYY-MM-DD and compute UTC yesterday across month/year boundaries', () => {
  assert.equal(isValidDateKey('2026-11-21'), true);
  assert.equal(isValidDateKey('2024-02-29'), true);
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(isValidDateKey('11-21-2026'), false);
  assert.equal(isValidDateKey(''), false);

  assert.equal(yesterdayDateKey('2026-11-21'), '2026-11-20');
  assert.equal(yesterdayDateKey('2026-01-01'), '2025-12-31');
  assert.equal(yesterdayDateKey('2024-03-01'), '2024-02-29');
});

test('getDailyWarRoom returns clean empty defaults when no games have been played', async () => {
  const redis = createFakeRedis();
  const res = await getDailyWarRoom(redis, '2026-11-21', 'JoanOfArc');
  assert.equal(res.dateKey, '2026-11-21');
  assert.deepEqual(res.leaderboard, []);
  assert.deepEqual(res.community, {
    totalPlays: 0,
    totalWins: 0,
    totalWololos: 0,
    topStrategy: '',
    fastestCommander: null,
  });
  assert.deepEqual(res.player, {
    streak: 0,
    bestScore: null,
    rank: null,
  });
});

test('daily leaderboard sorts by highest score, tie-breaks by lowest timeSec, keeps best score, and caps at top 15', async () => {
  const redis = createFakeRedis();
  const { reddit } = createFakeReddit();
  const dateKey = '2026-11-21';

  // Alice wins with 1400 in 130s
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'alice',
    dateKey,
    victory: true,
    score: 1400,
    timeSec: 130,
    crowns: 2,
    strategy: 'Longbow Volley',
    wololos: 0,
  });

  // Alice replays and wins with LOWER score (1100) -> keeps 1400 on leaderboard, but updates fastestCommander to 98s
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'alice',
    dateKey,
    victory: true,
    score: 1100,
    timeSec: 98,
    crowns: 2,
    strategy: 'Longbow Volley',
    wololos: 1,
  });

  // Bob ties Alice's 1400 score in a faster 115s -> Bob ranks ahead of Alice!
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'bob',
    dateKey,
    victory: true,
    score: 1400,
    timeSec: 115,
    crowns: 3,
    strategy: 'Heavy Knight Rush',
    wololos: 0,
  });

  let room = await getDailyWarRoom(redis, dateKey, 'alice');
  assert.equal(room.leaderboard.length, 2);
  assert.equal(room.leaderboard[0].username, 'bob');
  assert.equal(room.leaderboard[1].username, 'alice');
  assert.equal(room.leaderboard[1].score, 1400);
  assert.equal(room.leaderboard[1].timeSec, 130);
  assert.equal(room.player.rank, 2);
  assert.equal(room.player.bestScore, 1400);
  assert.deepEqual(room.community.fastestCommander, { username: 'alice', timeSec: 98 });

  // Alice ties her own 1400 score in 105s -> upgrades her entry timeSec to 105s, overtaking Bob!
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'alice',
    dateKey,
    victory: true,
    score: 1400,
    timeSec: 105,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 3,
  });

  room = await getDailyWarRoom(redis, dateKey, 'alice');
  assert.equal(room.leaderboard[0].username, 'alice');
  assert.equal(room.leaderboard[0].timeSec, 105);
  assert.equal(room.player.rank, 1);

  // Add 16 more commanders with higher scores so total commanders = 18; leaderboard caps at 15
  for (let i = 1; i <= 16; i++) {
    await recordMatchCompletion(redis, reddit, {
      subredditName: 'PocketEmpires',
      username: `warlord_${i}`,
      dateKey,
      victory: true,
      score: 1500 + i * 10,
      timeSec: 120,
      crowns: 3,
      strategy: 'Wololo Cult',
      wololos: 2,
    });
  }

  const bobRoom = await getDailyWarRoom(redis, dateKey, 'bob');
  assert.equal(bobRoom.leaderboard.length, 15);
  assert.equal(bobRoom.leaderboard[0].username, 'warlord_16');
  assert.equal(bobRoom.player.rank, 18);
  assert.equal(bobRoom.player.bestScore, 1400);
});

test('consecutive daily streak increments on consecutive days, holds on same day or defeat, and resets after gap', async () => {
  const redis = createFakeRedis();
  const { reddit } = createFakeReddit();

  // Day 1 victory -> streak 1
  const d1 = await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'saladin',
    dateKey: '2026-11-10',
    victory: true,
    score: 1250,
    timeSec: 142,
    crowns: 2,
    strategy: 'Camel Flank',
    wololos: 1,
  });
  assert.equal(d1.streak, 1);

  // Day 1 repeat victory -> still streak 1
  const d1Repeat = await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'saladin',
    dateKey: '2026-11-10',
    victory: true,
    score: 1320,
    timeSec: 135,
    crowns: 3,
    strategy: 'Camel Flank',
    wololos: 0,
  });
  assert.equal(d1Repeat.streak, 1);

  // Day 2 morning check before playing -> active streak still 1
  const d2Morning = await getDailyWarRoom(redis, '2026-11-11', 'saladin');
  assert.equal(d2Morning.player.streak, 1);

  // Day 2 defeat -> active streak preserved at 1, not added to leaderboard
  const d2Defeat = await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'saladin',
    dateKey: '2026-11-11',
    victory: false,
    score: 320,
    timeSec: 180,
    crowns: 0,
    strategy: 'Hold the Keep',
    wololos: 2,
  });
  assert.equal(d2Defeat.streak, 1);
  assert.equal(d2Defeat.rank, null);
  assert.equal(d2Defeat.flairAwarded, null);
  assert.equal(d2Defeat.community.totalPlays, 1);
  assert.equal(d2Defeat.community.totalWins, 0);
  assert.equal(d2Defeat.community.totalWololos, 2);

  // Day 2 victory -> streak increments to 2
  const d2Win = await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'saladin',
    dateKey: '2026-11-11',
    victory: true,
    score: 1510,
    timeSec: 118,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 3,
  });
  assert.equal(d2Win.streak, 2);

  // Day 3 victory -> streak increments to 3
  const d3Win = await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'saladin',
    dateKey: '2026-11-12',
    victory: true,
    score: 1600,
    timeSec: 112,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 2,
  });
  assert.equal(d3Win.streak, 3);

  // Skip Nov 13 & Nov 14 -> check on Nov 15 before playing shows expired streak 0
  const d6Check = await getDailyWarRoom(redis, '2026-11-15', 'saladin');
  assert.equal(d6Check.player.streak, 0);

  // Win on Nov 15 -> streak resets to 1
  const d6Win = await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'saladin',
    dateKey: '2026-11-15',
    victory: true,
    score: 1490,
    timeSec: 125,
    crowns: 2,
    strategy: 'Wololo Cult',
    wololos: 1,
  });
  assert.equal(d6Win.streak, 1);
});

test('community telemetry tracks Wololos, topStrategy, and fastestCommander accurately', async () => {
  const redis = createFakeRedis();
  const { reddit } = createFakeReddit();
  const dateKey = '2026-11-22';

  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'erik',
    dateKey,
    victory: true,
    score: 1300,
    timeSec: 140,
    crowns: 2,
    strategy: 'Pike & Archer Wall',
    wololos: 1,
  });
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'boudica',
    dateKey,
    victory: true,
    score: 1550,
    timeSec: 102.5,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 4,
  });
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'barbarossa',
    dateKey,
    victory: true,
    score: 1420,
    timeSec: 119,
    crowns: 2,
    strategy: 'Wololo Cult',
    wololos: 2,
  });
  // Fast defeat does NOT claim fastestCommander or increment strategy wins
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'rushed_peasant',
    dateKey,
    victory: false,
    score: 90,
    timeSec: 45,
    crowns: 0,
    strategy: 'Pike & Archer Wall',
    wololos: 1,
  });

  const room = await getDailyWarRoom(redis, dateKey);
  assert.deepEqual(room.community, {
    totalPlays: 4,
    totalWins: 3,
    totalWololos: 8,
    topStrategy: 'Wololo Cult',
    fastestCommander: { username: 'boudica', timeSec: 102.5 },
  });
});

test('user flair awards Siege Victor vs Wololo Lord and falls back gracefully when Reddit throws', async () => {
  const redis = createFakeRedis();
  const okReddit = createFakeReddit();

  // 1 Wololo (< 2) -> Siege Victor
  const r1 = await recordMatchCompletion(redis, okReddit.reddit, {
    subredditName: 'PocketEmpires',
    username: 'charles_martel',
    dateKey: '2026-11-20',
    victory: true,
    score: 1400,
    timeSec: 128,
    crowns: 2,
    strategy: 'Frankish Knights',
    wololos: 1,
  });
  assert.equal(r1.flairAwarded, '👑 Siege Victor · 🔥 1d');

  // Next day with 2 Wololos (>= 2) -> Wololo Lord with 2d streak!
  const r2 = await recordMatchCompletion(redis, okReddit.reddit, {
    subredditName: 'PocketEmpires',
    username: 'charles_martel',
    dateKey: '2026-11-21',
    victory: true,
    score: 1720,
    timeSec: 109,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 2,
  });
  assert.equal(r2.flairAwarded, '🧙 Wololo Lord · 🔥 2d');
  assert.equal(okReddit.flairs.length, 2);
  assert.deepEqual(okReddit.flairs[1], {
    subredditName: 'PocketEmpires',
    username: 'charles_martel',
    text: '🧙 Wololo Lord · 🔥 2d',
  });

  // Subreddit with restricted flair permissions -> throws inside setUserFlair, caught cleanly!
  const restrictedReddit = createFakeReddit({ throwOnFlair: true });
  const r3 = await recordMatchCompletion(redis, restrictedReddit.reddit, {
    subredditName: 'RestrictedSub',
    username: 'charles_martel',
    dateKey: '2026-11-22',
    victory: true,
    score: 1800,
    timeSec: 104,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 4,
  });
  assert.equal(r3.saved, true);
  assert.equal(r3.streak, 3);
  assert.equal(r3.flairAwarded, null);

  // Anonymous or missing subreddit also returns null without throwing
  assert.equal(
    await tryAwardUserFlair(okReddit.reddit, undefined, 'charles_martel', 3, 2),
    null,
  );
  assert.equal(
    await tryAwardUserFlair(okReddit.reddit, 'PocketEmpires', 'anonymous', 3, 2),
    null,
  );
});

test('submitWarChronicleComment validates inputs, posts comment, guards duplicates, and allows retries on transient errors', async () => {
  const redis = createFakeRedis();
  const { reddit, comments } = createFakeReddit();

  const chronicleText =
    '⚔️ Pocket Empires · Daily Siege 2026-11-21\n👑👑👑 Victory in 1:48 · 3 Wololos! 🔥 4d';

  // Rejects empty postId or out-of-bounds text length
  assert.equal(
    (
      await submitWarChronicleComment(redis, reddit, {
        postId: '',
        username: 'genghis',
        dateKey: '2026-11-21',
        text: chronicleText,
      })
    ).posted,
    false,
  );
  assert.equal(
    (
      await submitWarChronicleComment(redis, reddit, {
        postId: 't3_siege42',
        username: 'genghis',
        dateKey: '2026-11-21',
        text: 'too short',
      })
    ).posted,
    false,
  );
  assert.equal(
    (
      await submitWarChronicleComment(redis, reddit, {
        postId: 't3_siege42',
        username: 'genghis',
        dateKey: '2026-11-21',
        text: 'x'.repeat(601),
      })
    ).posted,
    false,
  );

  // Transient Reddit failure does NOT burn the duplicate guard
  const failingReddit = createFakeReddit({ throwOnComment: true });
  const failedAttempt = await submitWarChronicleComment(redis, failingReddit.reddit, {
    postId: 't3_siege42',
    username: 'genghis',
    dateKey: '2026-11-21',
    text: chronicleText,
  });
  assert.equal(failedAttempt.posted, false);

  // Subsequent retry with healthy Reddit succeeds!
  const firstPost = await submitWarChronicleComment(redis, reddit, {
    postId: 't3_siege42',
    username: 'genghis',
    dateKey: '2026-11-21',
    text: chronicleText,
  });
  assert.equal(firstPost.posted, true);
  assert.deepEqual(comments, [{ id: 't3_siege42', text: chronicleText }]);

  // Duplicate submission by same user + postId + dateKey is blocked
  const duplicatePost = await submitWarChronicleComment(redis, reddit, {
    postId: 'siege42', // even without t3_ prefix, normalizes to t3_siege42!
    username: 'genghis',
    dateKey: '2026-11-21',
    text: chronicleText,
  });
  assert.equal(duplicatePost.posted, false);
  assert.equal(comments.length, 1);

  // Different user on same post/day CAN post
  const otherUserPost = await submitWarChronicleComment(redis, reddit, {
    postId: 't3_siege42',
    username: 'subutai',
    dateKey: '2026-11-21',
    text: chronicleText,
  });
  assert.equal(otherUserPost.posted, true);
  assert.equal(comments.length, 2);

  // Same user on NEXT day's siege CAN post
  const nextDayPost = await submitWarChronicleComment(redis, reddit, {
    postId: 't3_siege42',
    username: 'genghis',
    dateKey: '2026-11-22',
    text: chronicleText,
  });
  assert.equal(nextDayPost.posted, true);
  assert.equal(comments.length, 3);
});

test('recordMatchCompletion rejects invalid inputs and devvit.json has valid Pocket Empires config', async () => {
  const redis = createFakeRedis();
  const { reddit } = createFakeReddit();

  await assert.rejects(
    () =>
      recordMatchCompletion(redis, reddit, {
        username: 'attila',
        dateKey: '2026-99-99',
        victory: true,
        score: 1000,
        timeSec: 100,
        crowns: 2,
        strategy: 'Huns',
        wololos: 0,
      }),
    EmpireValidationError,
  );

  await assert.rejects(
    () =>
      recordMatchCompletion(redis, reddit, {
        username: 'attila',
        dateKey: '2026-11-21',
        victory: true,
        score: -5,
        timeSec: 100,
        crowns: 2,
        strategy: 'Huns',
        wololos: 0,
      }),
    EmpireValidationError,
  );

  await assert.rejects(
    () =>
      recordMatchCompletion(redis, reddit, {
        username: 'attila',
        dateKey: '2026-11-21',
        victory: true,
        score: 1000,
        timeSec: 0,
        crowns: 2,
        strategy: 'Huns',
        wololos: 0,
      }),
    EmpireValidationError,
  );

  const devvitJsonPath = path.resolve(process.cwd(), 'devvit.json');
  const devvitConfig = JSON.parse(fs.readFileSync(devvitJsonPath, 'utf8'));
  assert.equal(devvitConfig.name, 'pocket-empires');
  assert.equal(devvitConfig.permissions.redis, true);
  assert.equal(devvitConfig.permissions.reddit, true);
  assert.match(devvitConfig.menu.items[0].label, /Pocket Empires/);
  assert.match(devvitConfig.menu.items[0].description, /Pocket Empires — Daily 3-Minute RTS Siege/);
});

test('Clash-of-Clans player base storage merges seeded bases, validates footprints, and updates raid trophies', async () => {
  const redis = createFakeRedis();
  const initialBases = await listPlayerBases(redis);
  assert.equal(initialBases.length, DEFAULT_SEEDED_BASES.length);

  // Saving a base without a town_center returns null
  const invalid = await savePlayerBase(redis, {
    owner: 'joan_of_arc',
    empireName: 'No Keep',
    civ: 'franks',
    biome: 'sherwood',
    buildings: [{ kind: 'stone_wall', tileX: 8, tileY: 10 }],
    garrison: ['knight'],
  });
  assert.equal(invalid, null);

  // Valid player base saves cleanly and appears in listPlayerBases
  const saved = await savePlayerBase(redis, {
    owner: 'joan_of_arc',
    empireName: 'Orleans Citadel',
    civ: 'franks',
    biome: 'sherwood',
    buildings: [
      { kind: 'town_center', tileX: 9, tileY: 12 },
      { kind: 'stone_wall', tileX: 8, tileY: 10 },
      { kind: 'farm', tileX: 11, tileY: 12 },
    ],
    garrison: ['knight', 'pikeman'],
  });
  assert.ok(saved);
  assert.equal(saved.trophies, 1000);

  const afterSave = await listPlayerBases(redis);
  assert.ok(afterSave.some((b) => b.owner === 'joan_of_arc'));

  // Successful raid vs TheViper_AoE grants +25 trophies to attacker and -10 to defender
  const viperInitialRaids = DEFAULT_SEEDED_BASES.find((b) => b.owner === 'TheViper_AoE')!.raidsPlayed;
  const raidWin = await recordRaidResult(redis, {
    attacker: 'joan_of_arc',
    defender: 'TheViper_AoE',
    victory: true,
  });
  assert.equal(raidWin.trophiesDelta, 25);
  assert.equal(raidWin.defenderBase?.raidsPlayed, viperInitialRaids + 1);

  // Failed raid vs joan_of_arc awards +15 defense trophies & increments defenseWins
  const raidLoss = await recordRaidResult(redis, {
    attacker: 'LordDaut',
    defender: 'joan_of_arc',
    victory: false,
  });
  assert.equal(raidLoss.defenderBase?.defenseWins, 1);
  assert.equal(raidLoss.defenderBase?.trophies, 1040);
});

test('Hall of Fame persists cumulative crowns across days, blocks same-day crown farming, and powers getLeaderboardHub', async () => {
  const redis = createFakeRedis();
  const { reddit } = createFakeReddit();

  // Day 1: Arthur wins 2 crowns -> Hall of Fame: totalCrowns=2, wins=1, bestStreak=1
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'arthur',
    dateKey: '2026-11-20',
    victory: true,
    score: 1850,
    timeSec: 155,
    crowns: 2,
    strategy: 'Heavy Cavalry Charge',
    wololos: 0,
  });

  // Day 1 replay with 3 crowns -> increments totalCrowns by +1 only (2 -> 3), wins stays 1!
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'arthur',
    dateKey: '2026-11-20',
    victory: true,
    score: 2450,
    timeSec: 112,
    crowns: 3,
    strategy: 'Heavy Cavalry Charge',
    wololos: 1,
  });

  // Day 1 replay with lower 2 crowns -> no crown loss or gain, wins stays 1!
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'arthur',
    dateKey: '2026-11-20',
    victory: true,
    score: 1900,
    timeSec: 148,
    crowns: 2,
    strategy: 'Wololo Cult',
    wololos: 2,
  });

  // Day 2: Arthur wins 3 crowns -> totalCrowns=6, wins=2, bestStreak=2
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'arthur',
    dateKey: '2026-11-21',
    victory: true,
    score: 2600,
    timeSec: 108,
    crowns: 3,
    strategy: 'Wololo Cult',
    wololos: 3,
  });

  // Day 2: Lancelot wins 3 crowns -> totalCrowns=3, wins=1, bestStreak=1
  await recordMatchCompletion(redis, reddit, {
    subredditName: 'PocketEmpires',
    username: 'lancelot',
    dateKey: '2026-11-21',
    victory: true,
    score: 2900,
    timeSec: 99,
    crowns: 3,
    strategy: 'Heavy Cavalry Charge',
    wololos: 0,
  });

  const hub = await getLeaderboardHub(redis, '2026-11-21', 'arthur');
  assert.equal(hub.daily[0].username, 'lancelot');
  assert.equal(hub.daily[1].username, 'arthur');
  assert.equal(hub.hallOfFame.length, 2);
  assert.equal(hub.hallOfFame[0].username, 'arthur');
  assert.equal(hub.hallOfFame[0].totalCrowns, 6);
  assert.equal(hub.hallOfFame[0].wins, 2);
  assert.equal(hub.hallOfFame[0].bestStreak, 2);
  assert.equal(hub.hallOfFame[1].username, 'lancelot');
  assert.equal(hub.hallOfFame[1].totalCrowns, 3);
  assert.equal(hub.raidCitadels.length, DEFAULT_SEEDED_BASES.length);
});
