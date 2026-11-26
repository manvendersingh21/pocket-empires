import { useCallback, useMemo, useRef, useState } from 'react';
import {
  askHybridScoutAdvisor,
  composeBattleEpigraph,
  craftSkirmishFromPrompt,
  detectHybridAICapability,
  getInstantAdvisorWhisper,
  type AdvisorWhisper,
} from '../ai/hybridAdvisor.js';
import {
  createEmptyCareerProfile,
  getCareerRankInfo,
  recordCareerMatch,
  sanitizeCareerProfile,
  type CareerProfile,
} from '../engine/career.js';
import {
  evaluateDailyBounties,
  generateDailyBounties,
} from '../engine/dailyBounties.js';
import {
  decodeSkirmishCode,
  encodeSkirmishCode,
  generateDailySpec,
} from '../engine/dailyGenerator.js';
import {
  buildLiveDailyStandings,
  computeRivalChallenge,
} from '../engine/leaderboardModel.js';
import {
  cmdAdvanceAge,
  cmdAttackEnemyKeep,
  cmdCancelQueueItem,
  cmdDemolishBuilding,
  cmdIssueOrder,
  cmdPlaceBuilding,
  cmdRingTownBell,
  cmdSetRallyPoint,
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
  getTeamPop,
  stepGame,
} from '../engine/sim.js';
import IsoCanvas from '../rendering/IsoCanvas.js';
import type { ClientMessage, HallOfFameEntry } from '../shared/messages.js';
import type {
  BuildingKind,
  DifficultyId,
  GameState,
  PlayerBaseBlueprint,
  SkirmishSpec,
  TauntId,
  UnitKind,
} from '../types/rts.js';
import ChronicleModal from '../ui/ChronicleModal.js';
import EmpireHud, {
  type HudSnapshot,
  type SelectedBuildingInspector,
  type SelectedUnitGroupInspector,
} from '../ui/EmpireHud.js';
import SettingsModal, { type SettingsTabId } from '../ui/SettingsModal.js';
import {
  flushStateSounds,
  playTauntSound,
  setMuted as setAudioMuted,
  unlockAudio,
} from '../ui/sound.js';
import WarRoomScreen, {
  type CommunityWarStats,
  type LeaderboardRow,
} from '../ui/WarRoomScreen.js';
import {
  useFixedSimulationLoop,
  useMountTask,
  useWindowKeydown,
} from './hooks.js';
import { journeys } from './telemetry.js';

const READY: ClientMessage = { type: 'READY', app: 'momentum', version: 1 };
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

async function fetchApiJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  if (!window.location.protocol.startsWith('http')) return null;
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const LOCAL_FALLBACK_BASES: PlayerBaseBlueprint[] = [
  {
    owner: 'TheViper_AoE',
    empireName: 'Twin-Pond Bastion',
    civ: 'franks',
    biome: 'sherwood',
    buildings: [
      { kind: 'town_center', tileX: 9, tileY: 12 },
      { kind: 'homestead', tileX: 8, tileY: 13 },
      { kind: 'farm', tileX: 11, tileY: 12 },
      { kind: 'farm', tileX: 11, tileY: 13 },
      { kind: 'stable', tileX: 8, tileY: 11 },
      { kind: 'watchtower', tileX: 8, tileY: 10 },
      { kind: 'watchtower', tileX: 11, tileY: 10 },
      { kind: 'stone_wall', tileX: 9, tileY: 10 },
      { kind: 'stone_wall', tileX: 10, tileY: 10 },
    ],
    garrison: ['knight', 'knight', 'pikeman', 'archer'],
    defenseWins: 7,
    raidsPlayed: 11,
    trophies: 1180,
    updatedAt: '2026-11-21T00:00:00Z',
  },
  {
    owner: 'LordDaut',
    empireName: "Daut's Keep",
    civ: 'britons',
    biome: 'highlands',
    buildings: [
      { kind: 'town_center', tileX: 9, tileY: 12 },
      { kind: 'homestead', tileX: 11, tileY: 12 },
      { kind: 'farm', tileX: 8, tileY: 13 },
      { kind: 'barracks', tileX: 8, tileY: 11 },
      { kind: 'archery_range', tileX: 11, tileY: 11 },
      { kind: 'watchtower', tileX: 9, tileY: 10 },
      { kind: 'stone_wall', tileX: 8, tileY: 10 },
      { kind: 'stone_wall', tileX: 10, tileY: 10 },
    ],
    garrison: ['archer', 'archer', 'archer', 'militia', 'pikeman'],
    defenseWins: 5,
    raidsPlayed: 9,
    trophies: 1095,
    updatedAt: '2026-11-21T00:00:00Z',
  },
  {
    owner: 'SpiritOfTheLaw',
    empireName: 'Monastery Sanctum',
    civ: 'byzantines',
    biome: 'gold_rush',
    buildings: [
      { kind: 'town_center', tileX: 9, tileY: 12 },
      { kind: 'farm', tileX: 11, tileY: 12 },
      { kind: 'monastery', tileX: 8, tileY: 11 },
      { kind: 'watchtower', tileX: 10, tileY: 10 },
      { kind: 'stone_wall', tileX: 8, tileY: 10 },
      { kind: 'stone_wall', tileX: 9, tileY: 10 },
    ],
    garrison: ['monk', 'monk', 'knight', 'pikeman'],
    defenseWins: 4,
    raidsPlayed: 7,
    trophies: 1040,
    updatedAt: '2026-11-21T00:00:00Z',
  },
];

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function makeSnapshot(
  state: GameState,
  selectedBuildingId: number | null = null,
  selectedUnitIds: readonly number[] = [],
): HudSnapshot {
  const pop = getTeamPop(state, 'player');
  let idleVillagerCount = 0;
  let villagerCount = 0;
  let armyCount = 0;
  let monkCount = 0;
  for (const u of state.units) {
    if (u.team !== 'player' || u.hp <= 0) continue;
    if (u.kind === 'villager') {
      villagerCount++;
      if (u.order.type === 'idle') idleVillagerCount++;
    } else {
      armyCount++;
      if (u.kind === 'monk') monkCount++;
    }
  }
  const ownedBuildings: Partial<Record<BuildingKind, number>> = {};
  const unitQueues: Partial<Record<UnitKind, number>> = {};
  for (const b of state.buildings) {
    if (b.team !== 'player' || b.hp <= 0) continue;
    if (b.built) {
      ownedBuildings[b.kind] = (ownedBuildings[b.kind] ?? 0) + 1;
    }
    for (const q of b.queue) {
      unitQueues[q.unit] = (unitQueues[q.unit] ?? 0) + 1;
    }
  }

  const relicsTotal = state.relics?.length ?? 0;
  const relicsPlayer =
    state.relics?.filter((r) => r.owner === 'player').length ?? 0;
  const townBellSec = state.townBellSec ?? 0;

  let selectedBuilding: SelectedBuildingInspector | null = null;
  if (selectedBuildingId !== null) {
    const sb = state.buildings.find(
      (b) => b.id === selectedBuildingId && b.team === 'player' && b.hp > 0,
    );
    if (sb) {
      const head = sb.queue[0];
      const trainProgressPct =
        head && head.totalSec > 0
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round(((head.totalSec - head.remainingSec) / head.totalSec) * 100),
              ),
            )
          : 0;
      selectedBuilding = {
        id: sb.id,
        kind: sb.kind,
        hp: sb.hp,
        maxHp: sb.maxHp,
        built: sb.built,
        queue: sb.queue.map((q) => q.unit),
        trainProgressPct,
      };
    }
  }

  let selectedUnitGroups: SelectedUnitGroupInspector[] = [];
  if (selectedUnitIds.length > 0 && selectedBuilding === null) {
    const selSet = new Set(selectedUnitIds);
    const byKind = new Map<UnitKind, SelectedUnitGroupInspector>();
    for (const u of state.units) {
      if (!selSet.has(u.id) || u.team !== 'player' || u.hp <= 0) continue;
      const prev = byKind.get(u.kind);
      if (prev) {
        prev.count += 1;
        prev.totalHp += u.hp;
        prev.maxHp += u.maxHp;
      } else {
        byKind.set(u.kind, {
          kind: u.kind,
          count: 1,
          totalHp: u.hp,
          maxHp: u.maxHp,
        });
      }
    }
    selectedUnitGroups = Array.from(byKind.values());
  }

  return {
    resources: { ...state.resources.player },
    popCurrent: pop.current,
    popCap: pop.cap,
    timeSec: state.timeSec,
    parSec: state.spec.parSec,
    idleVillagerCount,
    villagerCount,
    armyCount,
    monkCount,
    ownedBuildings,
    unitQueues,
    playerAge: state.ages?.player ?? 1,
    tamedHorses: countTamedHorses(state, 'player'),
    raidDestructionPct: computeRaidDestruction(state).destructionPct,
    relicsPlayer,
    relicsTotal,
    townBellActive: townBellSec > 0,
    townBellSec,
    ghostBreach: state.ghostBreach ?? null,
    selectedBuilding,
    selectedUnitGroups,
  };
}

export default function App() {
  const dailySpec = useMemo(() => generateDailySpec(), []);
  const [activeSpec, setActiveSpec] = useState<SkirmishSpec>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    return (code && decodeSkirmishCode(code)) || dailySpec;
  });

  const [myBase, setMyBase] = useState<PlayerBaseBlueprint | null>(() =>
    loadLocal<PlayerBaseBlueprint | null>('empire:myBase', null),
  );
  const [playerBases, setPlayerBases] = useState<PlayerBaseBlueprint[]>(() => {
    const saved = loadLocal<PlayerBaseBlueprint | null>('empire:myBase', null);
    return saved ? [saved, ...LOCAL_FALLBACK_BASES] : LOCAL_FALLBACK_BASES;
  });

  const [screen, setScreen] = useState<'war_room' | 'game'>('war_room');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('settings');
  const [showMinimap, setShowMinimap] = useState(true);
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'published' | 'saved'>('idle');
  const [demolishMode, setDemolishMode] = useState(false);
  const [rallyMode, setRallyMode] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyId>('standard');
  const [career, setCareer] = useState<CareerProfile>(() =>
    sanitizeCareerProfile(loadLocal('empire:career:v1', createEmptyCareerProfile())),
  );
  const [lastXpGained, setLastXpGained] = useState(0);
  const [focusTarget, setFocusTarget] = useState<{ tileX: number; tileY: number; seq: number } | null>(
    null,
  );
  const [empireName, setEmpireName] = useState<string>(
    () => myBase?.empireName ?? 'Royal Homestead',
  );

  const stateRef = useRef<GameState>(createBaseBuilderState(myBase));
  const accRef = useRef(0);
  const [snapshot, setSnapshot] = useState<HudSnapshot>(() => makeSnapshot(stateRef.current));
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const selectedUnitIdsRef = useRef<number[]>([]);
  selectedUnitIdsRef.current = selectedUnitIds;
  const selectedBuildingIdRef = useRef<number | null>(null);
  selectedBuildingIdRef.current = selectedBuildingId;
  const focusSeqRef = useRef(1);
  const idleCycleRef = useRef(0);
  const lastGroupKeyRef = useRef<{ key: string; atMs: number } | null>(null);
  const controlGroupsRef = useRef<Record<string, number[]>>({});

  const [placementKind, setPlacementKind] = useState<BuildingKind | null>(null);
  const [gameSpeed, setGameSpeed] = useState<1 | 1.5 | 2>(1);
  const [muted, setMutedState] = useState(false);
  const [whisper, setWhisper] = useState<AdvisorWhisper | null>(null);
  const [aiModeLabel, setAiModeLabel] = useState('Royal War-Council Tactician');

  const [streak, setStreak] = useState<number>(() => loadLocal('empire:streak', 0));
  const [lastWinDate, setLastWinDate] = useState<string>(() => loadLocal('empire:lastWinDate', ''));
  const [bestScore, setBestScore] = useState<number | null>(() =>
    loadLocal<number | null>(`empire:best:${dailySpec.dateKey}`, null),
  );
  const [rank, setRank] = useState<number | null>(null);
  const [flairText, setFlairText] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);
  const [community, setCommunity] = useState<CommunityWarStats>({
    totalPlays: 0,
    totalWins: 0,
    totalWololos: 0,
    topStrategy: 'Wololo Cult',
    fastestCommander: null,
  });

  const dailyBounties = useMemo(() => generateDailyBounties(dailySpec), [dailySpec]);
  const activeBounties = useMemo(() => generateDailyBounties(activeSpec), [activeSpec]);

  const [epigraph, setEpigraph] = useState('Sound the horn and march across the ford!');
  const [commentStatus, setCommentStatus] = useState<
    'idle' | 'posting' | 'posted' | 'copied' | 'error'
  >('idle');
  const completionHandledRef = useRef<string>('');
  const matchIdRef = useRef(0);

  const fetchWarRoomAndBases = useCallback(async () => {
    const [dailyData, basesData] = await Promise.all([
      fetchApiJson<{
        leaderboard?: LeaderboardRow[];
        hallOfFame?: HallOfFameEntry[];
        community?: CommunityWarStats;
        player?: { streak?: number; bestScore?: number | null; rank?: number | null };
      }>(`/api/empire/daily?date=${encodeURIComponent(dailySpec.dateKey)}`),
      fetchApiJson<{
        bases?: PlayerBaseBlueprint[];
        myBase?: PlayerBaseBlueprint | null;
      }>('/api/empire/bases'),
    ]);

    if (dailyData) {
      if (dailyData.leaderboard) setLeaderboard(dailyData.leaderboard);
      if (dailyData.hallOfFame) setHallOfFame(dailyData.hallOfFame);
      if (dailyData.community) setCommunity(dailyData.community);
      if (dailyData.player) {
        if (typeof dailyData.player.streak === 'number') setStreak(dailyData.player.streak);
        if (typeof dailyData.player.bestScore === 'number') setBestScore(dailyData.player.bestScore);
        setRank(dailyData.player.rank ?? null);
      }
    }
    if (basesData) {
      if (basesData.bases && basesData.bases.length > 0) {
        setPlayerBases(basesData.bases);
      }
      if (basesData.myBase) {
        setMyBase(basesData.myBase);
        setEmpireName(basesData.myBase.empireName);
        saveLocal('empire:myBase', basesData.myBase);
      }
    }
  }, [dailySpec.dateKey]);

  useMountTask(() => {
    void detectHybridAICapability().then((cap) => {
      setAiModeLabel(cap.modeLabel);
    });
    void fetchApiJson('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(READY),
    });
    void fetchWarRoomAndBases();
  });

  const panToTile = useCallback((tileX: number, tileY: number) => {
    focusSeqRef.current += 1;
    setFocusTarget({ tileX, tileY, seq: focusSeqRef.current });
  }, []);

  const mountInteractiveState = useCallback((next: GameState) => {
    unlockAudio();
    matchIdRef.current += 1;
    completionHandledRef.current = '';
    accRef.current = 0;
    controlGroupsRef.current = {};
    stateRef.current = next;
    setActiveSpec(next.spec);
    const idleV = next.units.find(
      (u) => u.team === 'player' && u.kind === 'villager' && u.order.type === 'idle',
    );
    const initUnitIds = idleV ? [idleV.id] : [];
    selectedUnitIdsRef.current = initUnitIds;
    selectedBuildingIdRef.current = null;
    setSelectedUnitIds(initUnitIds);
    setSelectedBuildingId(null);
    setSnapshot(makeSnapshot(next, null, initUnitIds));
    setPlacementKind(null);
    setDemolishMode(false);
    setRallyMode(false);
    setLastXpGained(0);
    setCommentStatus('idle');
    setPublishStatus('idle');
    setFlairText(null);
    setSettingsOpen(false);
    setWhisper(getInstantAdvisorWhisper(next));
    setScreen('game');
  }, []);

  const startSkirmish = useCallback(
    (spec: SkirmishSpec) => {
      const next = createInitialState({
        ...spec,
        difficulty: spec.difficulty ?? difficulty,
      });
      if (community.fastestCommander) {
        next.ghostBreach = {
          username: community.fastestCommander.username,
          timeSec: community.fastestCommander.timeSec,
          tileX: 7.5,
          tileY: 7.5,
        };
      }
      mountInteractiveState(next);
      if (!isLocalHost) journeys.start();
    },
    [community.fastestCommander, difficulty, mountInteractiveState],
  );

  const openMyBaseBuilder = useCallback(() => {
    const next = createBaseBuilderState(myBase);
    mountInteractiveState(next);
  }, [myBase, mountInteractiveState]);

  const startPlayerRaid = useCallback(
    (target: PlayerBaseBlueprint) => {
      const next = createPlayerRaidState(target, dailySpec.playerCiv);
      mountInteractiveState(next);
    },
    [dailySpec.playerCiv, mountInteractiveState],
  );

  const returnToHomeOverlay = useCallback(() => {
    setSettingsOpen(false);
    setPlacementKind(null);
    setDemolishMode(false);
    setRallyMode(false);
    selectedUnitIdsRef.current = [];
    selectedBuildingIdRef.current = null;
    setSelectedUnitIds([]);
    setSelectedBuildingId(null);
    const ambient = createBaseBuilderState(myBase);
    stateRef.current = ambient;
    setSnapshot(makeSnapshot(ambient));
    setScreen('war_room');
  }, [myBase]);

  const handlePublishBase = useCallback(async () => {
    unlockAudio();
    const st = stateRef.current;
    const chosenName = empireName.trim() || myBase?.empireName || 'Royal Homestead';
    const blueprint = exportBaseBlueprint(st, myBase?.owner ?? 'YourKeep', chosenName);
    setMyBase(blueprint);
    setEmpireName(blueprint.empireName);
    saveLocal('empire:myBase', blueprint);
    setPlayerBases((prev) => [blueprint, ...prev.filter((b) => b.owner !== blueprint.owner)]);

    setPublishStatus('publishing');
    const data = await fetchApiJson<{
      saved?: boolean;
      base?: PlayerBaseBlueprint;
      bases?: PlayerBaseBlueprint[];
    }>('/api/empire/bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empireName: blueprint.empireName,
        civ: blueprint.civ,
        biome: blueprint.biome,
        buildings: blueprint.buildings,
        garrison: blueprint.garrison,
      }),
    });
    if (data) {
      if (data.base) {
        setMyBase(data.base);
        setEmpireName(data.base.empireName);
        saveLocal('empire:myBase', data.base);
      }
      if (data.bases) setPlayerBases(data.bases);
      setPublishStatus('published');
    } else {
      setPublishStatus('saved');
    }
  }, [empireName, myBase]);

  const handleMatchCompletion = useCallback(
    (st: GameState) => {
      if (st.outcome === 'playing' || st.mode === 'base_builder') return;
      const key = `${matchIdRef.current}:${st.outcome}`;
      if (completionHandledRef.current === key) return;
      completionHandledRef.current = key;

      const summary = computeScoreSummary(st);
      const evaluated = evaluateDailyBounties(st, generateDailyBounties(st.spec));
      const bountyBonus = summary.victory
        ? evaluated.filter((b) => b.completed).reduce((acc, b) => acc + b.bonusScore, 0)
        : 0;
      const totalScore = summary.score + bountyBonus;
      const completedIds = evaluated.filter((b) => b.completed).map((b) => b.id);

      const { nextProfile, xpGained } = recordCareerMatch(
        career,
        st,
        completedIds,
        totalScore,
      );
      setCareer(nextProfile);
      setLastXpGained(xpGained);
      saveLocal('empire:career:v1', nextProfile);

      let nextStreak = streak;
      if (summary.victory && !st.spec.isCustom && st.mode !== 'raid') {
        if (lastWinDate !== st.spec.dateKey) {
          const yesterday = new Date(Date.parse(`${st.spec.dateKey}T00:00:00Z`) - 86_400_000)
            .toISOString()
            .slice(0, 10);
          nextStreak = lastWinDate === yesterday ? streak + 1 : 1;
          setStreak(nextStreak);
          setLastWinDate(st.spec.dateKey);
          saveLocal('empire:streak', nextStreak);
          saveLocal('empire:lastWinDate', st.spec.dateKey);
        }
        const updatedBest = Math.max(bestScore ?? 0, totalScore);
        setBestScore(updatedBest);
        saveLocal(`empire:best:${st.spec.dateKey}`, updatedBest);
      }

      void composeBattleEpigraph(st, Math.max(1, nextStreak)).then((res) => {
        setEpigraph(res.epigraph);
      });

      if (!isLocalHost) journeys.end(summary.victory, summary.timeSec);
      if (st.mode === 'raid' && st.raidTargetOwner) {
        void fetchApiJson<{ bases?: PlayerBaseBlueprint[] }>('/api/empire/raid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defender: st.raidTargetOwner,
            victory: summary.victory,
          }),
        }).then((data) => {
          if (data?.bases) setPlayerBases(data.bases);
        });
      } else if (!st.spec.isCustom) {
        void fetchApiJson<{
          leaderboard?: LeaderboardRow[];
          hallOfFame?: HallOfFameEntry[];
          community?: CommunityWarStats;
          rank?: number | null;
          streak?: number;
          flairAwarded?: string | null;
        }>('/api/empire/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateKey: st.spec.dateKey,
            victory: summary.victory,
            score: totalScore,
            timeSec: summary.timeSec,
            crowns: summary.crowns,
            strategy: summary.strategyLabel,
            wololos: st.stats.wololoConversions,
          }),
        }).then((data) => {
          if (!data) return;
          if (data.leaderboard) setLeaderboard(data.leaderboard);
          if (data.hallOfFame) setHallOfFame(data.hallOfFame);
          if (data.community) setCommunity(data.community);
          if (data.rank !== undefined) setRank(data.rank);
          if (typeof data.streak === 'number') setStreak(data.streak);
          if (data.flairAwarded) setFlairText(data.flairAwarded);
        });
      }
    },
    [bestScore, career, lastWinDate, streak],
  );

  useFixedSimulationLoop(true, screen === 'war_room' ? 0.5 : gameSpeed, (elapsedSec) => {
    const st = stateRef.current;
    if (st.outcome !== 'playing') {
      accRef.current = 0;
    } else {
      accRef.current += elapsedSec;
    }

    const STEP = 0.05;
    let stepped = false;
    while (accRef.current >= STEP && st.outcome === 'playing') {
      stepGame(st, STEP);
      accRef.current -= STEP;
      stepped = true;
    }

    if (screen === 'war_room') {
      st.soundEvents.length = 0;
      return;
    }

    if (st.soundEvents.length > 0) {
      flushStateSounds(st.soundEvents);
    }

    if (stepped && (st.tick % 3 === 0 || st.outcome !== 'playing')) {
      const aliveSel = selectedUnitIdsRef.current.filter((id) =>
        st.units.some((u) => u.id === id && u.team === 'player' && u.hp > 0),
      );
      if (aliveSel.length !== selectedUnitIdsRef.current.length) {
        selectedUnitIdsRef.current = aliveSel;
        setSelectedUnitIds(aliveSel);
      }
      if (
        selectedBuildingIdRef.current !== null &&
        !st.buildings.some((b) => b.id === selectedBuildingIdRef.current && b.team === 'player' && b.hp > 0)
      ) {
        selectedBuildingIdRef.current = null;
        setSelectedBuildingId(null);
      }
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, aliveSel));
    }

    if (stepped && st.tick % 90 === 0 && st.outcome === 'playing') {
      setWhisper(getInstantAdvisorWhisper(st));
    }

    if (st.outcome !== 'playing') {
      handleMatchCompletion(st);
    }
  });

  const handleFocusKeep = useCallback(() => {
    unlockAudio();
    const st = stateRef.current;
    const tc = st.buildings.find((b) => b.team === 'player' && b.kind === 'town_center' && b.hp > 0);
    if (!tc) return;
    setPlacementKind(null);
    setDemolishMode(false);
    setRallyMode(false);
    selectedUnitIdsRef.current = [];
    selectedBuildingIdRef.current = tc.id;
    setSelectedUnitIds([]);
    setSelectedBuildingId(tc.id);
    setSnapshot(makeSnapshot(st, tc.id, []));
    panToTile(tc.tileX + tc.size * 0.5, tc.tileY + tc.size * 0.5);
  }, [panToTile]);

  useWindowKeydown(screen === 'game', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const st = stateRef.current;

    if (isLocalHost && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      if (st.outcome !== 'playing' || st.mode === 'base_builder') return;
      const enemyTc = st.buildings.find(
        (b) => b.team === 'enemy' && b.kind === 'town_center' && b.hp > 0,
      );
      if (enemyTc) {
        enemyTc.hp = 1;
        st.units.push({
          id: st.nextId++,
          team: 'player',
          kind: 'knight',
          x: enemyTc.tileX + 1,
          y: enemyTc.tileY + enemyTc.size + 0.35,
          hp: 138,
          maxHp: 138,
          order: { type: 'attack_building', buildingId: enemyTc.id },
          path: [],
          pathCooldown: 0,
          attackTimer: 0,
          harvestTimer: 0,
          carryKind: null,
          carryAmount: 0,
          convertTargetId: null,
          convertProgress: 0,
          monkCooldown: 0,
          facing: 1,
          animPhase: 0,
        });
        st.timeSec = 111.95;
        st.stats.wololoConversions = 2;
        st.stats.cheekyWololo = true;
        st.stats.enemyUnitsSlain = 9;
        st.stats.enemyBuildingsRazed = 1;
        stepGame(st, 0.05);
      }
      st.outcome = 'victory';
      st.timeSec = 112;
      st.stats.wololoConversions = 2;
      st.stats.cheekyWololo = true;
      st.stats.enemyUnitsSlain = 9;
      st.stats.enemyBuildingsRazed = 2;
      if (!st.timeline) st.timeline = [];
      if (st.timeline.length < 2) {
        st.timeline.push({ t: 56, playerPower: 290, enemyPower: 240 });
      }
      st.timeline.push({ t: 112, playerPower: 520, enemyPower: 65 });
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIdsRef.current));
      handleMatchCompletion(st);
      return;
    }

    if (e.ctrlKey && !e.shiftKey && !e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      if (selectedUnitIdsRef.current.length > 0) {
        controlGroupsRef.current[e.key] = [...selectedUnitIdsRef.current];
      }
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape') {
      if (settingsOpen) setSettingsOpen(false);
      else if (rallyMode) setRallyMode(false);
      else if (demolishMode) setDemolishMode(false);
      else setPlacementKind(null);
      return;
    }

    if (['1', '2', '3', '4'].includes(e.key)) {
      const savedIds = (controlGroupsRef.current[e.key] ?? []).filter((id) =>
        st.units.some((u) => u.id === id && u.team === 'player' && u.hp > 0),
      );
      let chosenIds = savedIds;
      if (chosenIds.length === 0) {
        if (e.key === '1') {
          chosenIds = st.units
            .filter((u) => u.team === 'player' && u.hp > 0 && u.kind !== 'villager')
            .map((u) => u.id);
        } else if (e.key === '2') {
          const idle = st.units.filter(
            (u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager' && u.order.type === 'idle',
          );
          const pool =
            idle.length > 0
              ? idle
              : st.units.filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager');
          chosenIds = pool.map((u) => u.id);
        } else if (e.key === '3') {
          chosenIds = st.units
            .filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'monk')
            .map((u) => u.id);
        } else if (e.key === '4') {
          chosenIds = st.units
            .filter(
              (u) => u.team === 'player' && u.hp > 0 && (u.kind === 'knight' || u.kind === 'scout'),
            )
            .map((u) => u.id);
        }
      }
      if (chosenIds.length > 0 || savedIds.length > 0 || e.key === '1' || e.key === '2') {
        selectedUnitIdsRef.current = chosenIds;
        selectedBuildingIdRef.current = null;
        setSelectedUnitIds(chosenIds);
        setSelectedBuildingId(null);
        setRallyMode(false);
        setSnapshot(makeSnapshot(st, null, chosenIds));
        const now = performance.now();
        const prev = lastGroupKeyRef.current;
        if (prev && prev.key === e.key && now - prev.atMs < 400 && chosenIds.length > 0) {
          const u = st.units.find((x) => x.id === chosenIds[0]);
          if (u) panToTile(u.x, u.y);
          lastGroupKeyRef.current = null;
        } else {
          lastGroupKeyRef.current = { key: e.key, atMs: now };
        }
      }
    } else if (e.key === '.') {
      const idle = st.units.filter(
        (u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager' && u.order.type === 'idle',
      );
      if (idle.length > 0) {
        const pickU = idle[idleCycleRef.current % idle.length];
        idleCycleRef.current += 1;
        selectedUnitIdsRef.current = [pickU.id];
        selectedBuildingIdRef.current = null;
        setSelectedUnitIds([pickU.id]);
        setSelectedBuildingId(null);
        setRallyMode(false);
        setSnapshot(makeSnapshot(st, null, [pickU.id]));
        panToTile(pickU.x, pickU.y);
      }
    } else if (e.key.toLowerCase() === 'h') {
      handleFocusKeep();
    } else if (e.key.toLowerCase() === 'b') {
      unlockAudio();
      if (cmdRingTownBell(st, 'player')) {
        flushStateSounds(st.soundEvents);
        setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIdsRef.current));
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      if (selectedUnitIdsRef.current.length > 0) {
        const u = st.units.find((x) => x.id === selectedUnitIdsRef.current[0] && x.hp > 0);
        if (u) panToTile(u.x, u.y);
      } else if (selectedBuildingIdRef.current !== null) {
        const b = st.buildings.find((x) => x.id === selectedBuildingIdRef.current && x.hp > 0);
        if (b) panToTile(b.tileX + b.size * 0.5, b.tileY + b.size * 0.5);
      } else {
        handleFocusKeep();
      }
    } else if (e.key.toLowerCase() === 'g') {
      unlockAudio();
      if (cmdAdvanceAge(st, 'player')) {
        flushStateSounds(st.soundEvents);
        setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIdsRef.current));
      }
    } else if (e.key.toLowerCase() === 'x' && st.mode === 'base_builder') {
      unlockAudio();
      setDemolishMode((prev) => {
        const next = !prev;
        if (next) setPlacementKind(null);
        return next;
      });
    } else {
      const buildMap: Record<string, BuildingKind> = {
        q: 'homestead',
        f: 'farm',
        z: 'stone_wall',
        w: 'barracks',
        e: 'archery_range',
        r: 'stable',
        t: 'monastery',
        y: 'watchtower',
      };
      const bk = buildMap[e.key.toLowerCase()];
      if (bk) {
        setDemolishMode(false);
        setRallyMode(false);
        setPlacementKind((prev) => (prev === bk ? null : bk));
      }
    }
  });

  const handleSelectSquad = (kind: 'idle_villager' | 'all_villagers' | 'all_army' | 'monks') => {
    unlockAudio();
    const st = stateRef.current;
    setPlacementKind(null);
    setDemolishMode(false);
    setRallyMode(false);
    selectedBuildingIdRef.current = null;
    setSelectedBuildingId(null);
    let nextIds: number[] = [];
    if (kind === 'idle_villager') {
      const idle = st.units.filter(
        (u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager' && u.order.type === 'idle',
      );
      if (idle.length > 0) {
        const pickU = idle[idleCycleRef.current % idle.length];
        idleCycleRef.current += 1;
        nextIds = [pickU.id];
        panToTile(pickU.x, pickU.y);
      } else {
        nextIds = st.units
          .filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager')
          .map((u) => u.id);
      }
    } else if (kind === 'all_villagers') {
      nextIds = st.units
        .filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager')
        .map((u) => u.id);
    } else if (kind === 'all_army') {
      nextIds = st.units
        .filter((u) => u.team === 'player' && u.hp > 0 && u.kind !== 'villager')
        .map((u) => u.id);
    } else if (kind === 'monks') {
      nextIds = st.units
        .filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'monk')
        .map((u) => u.id);
    }
    selectedUnitIdsRef.current = nextIds;
    setSelectedUnitIds(nextIds);
    setSnapshot(makeSnapshot(st, null, nextIds));
  };

  const handleIssueTileOrder = (tileX: number, tileY: number) => {
    unlockAudio();
    const st = stateRef.current;
    cmdIssueOrder(st, 'player', selectedUnitIds, tileX, tileY);
    flushStateSounds(st.soundEvents);
    setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
  };

  const handlePlaceBuildingAt = (tileX: number, tileY: number) => {
    if (!placementKind) return;
    unlockAudio();
    const st = stateRef.current;
    const placed = cmdPlaceBuilding(st, 'player', placementKind, tileX, tileY, selectedUnitIds);
    if (placed) {
      if (placementKind !== 'stone_wall') {
        setPlacementKind(null);
      }
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
    }
  };

  const handleDemolishAt = (tileX: number, tileY: number) => {
    unlockAudio();
    const st = stateRef.current;
    if (cmdDemolishBuilding(st, 'player', tileX, tileY)) {
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
    }
  };

  const handleSetRallyPoint = (buildingId: number, tileX: number, tileY: number) => {
    unlockAudio();
    const st = stateRef.current;
    if (cmdSetRallyPoint(st, 'player', buildingId, tileX, tileY)) {
      setRallyMode(false);
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
    }
  };

  const handleCancelQueueItem = (buildingId: number, queueIndex: number) => {
    unlockAudio();
    const st = stateRef.current;
    if (cmdCancelQueueItem(st, 'player', buildingId, queueIndex)) {
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
    }
  };

  const handleRingTownBell = () => {
    unlockAudio();
    const st = stateRef.current;
    if (cmdRingTownBell(st, 'player')) {
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
    }
  };

  const handleFilterSelectedKind = (kind: UnitKind) => {
    unlockAudio();
    const st = stateRef.current;
    const filtered = selectedUnitIds.filter((id) =>
      st.units.some((u) => u.id === id && u.team === 'player' && u.hp > 0 && u.kind === kind),
    );
    if (filtered.length > 0) {
      selectedUnitIdsRef.current = filtered;
      setSelectedUnitIds(filtered);
      setSnapshot(makeSnapshot(st, null, filtered));
    }
  };

  const handleAdvanceAge = () => {
    unlockAudio();
    const st = stateRef.current;
    if (cmdAdvanceAge(st, 'player')) {
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
    }
  };

  const handleTrainUnit = (kind: UnitKind) => {
    unlockAudio();
    const st = stateRef.current;
    const ok = cmdTrainUnit(st, 'player', kind, selectedBuildingId ?? undefined);
    if (ok) {
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st, selectedBuildingIdRef.current, selectedUnitIds));
    }
  };

  const handleTaunt = (id: TauntId) => {
    unlockAudio();
    playTauntSound(id);
    cmdTriggerTaunt(stateRef.current, id);
  };

  const handlePostComment = async () => {
    const st = stateRef.current;
    const code = st.spec.isCustom && st.mode !== 'raid' ? encodeSkirmishCode(st.spec) : null;
    const text =
      formatChronicleComment(st, Math.max(1, streak)) +
      (code ? `\nChallenge Code: \`${code}\`` : '');

    setCommentStatus('posting');
    const data = await fetchApiJson<{ posted?: boolean }>('/api/empire/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateKey: st.spec.dateKey, text }),
    });
    if (data?.posted) {
      setCommentStatus('posted');
      return;
    }
    try {
      await navigator.clipboard?.writeText(text);
      setCommentStatus('copied');
    } catch {
      setCommentStatus('error');
    }
  };

  const handleCopyChronicle = async () => {
    const st = stateRef.current;
    const code = st.spec.isCustom && st.mode !== 'raid' ? encodeSkirmishCode(st.spec) : null;
    const text =
      formatChronicleComment(st, Math.max(1, streak)) +
      (code ? `\nChallenge Code: \`${code}\`` : '');
    try {
      await navigator.clipboard?.writeText(text);
      setCommentStatus('copied');
    } catch {
      setCommentStatus('error');
    }
  };

  const handleCraftPrompt = useCallback(async (prompt: string) => {
    const res = await craftSkirmishFromPrompt(prompt);
    return {
      spec: res.spec,
      shareCode: res.shareCode,
      flavorSummary: res.flavorSummary,
    };
  }, []);

  const st = stateRef.current;
  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  };

  const cycleSpeed = () => {
    setGameSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
  };

  const isTerminalOutcome =
    st.mode !== 'base_builder' && (st.outcome === 'victory' || st.outcome === 'defeat');
  const chronicleBounties = isTerminalOutcome ? evaluateDailyBounties(st, activeBounties) : [];
  const chronicleBountyBonus =
    isTerminalOutcome && st.outcome === 'victory'
      ? chronicleBounties.filter((b) => b.completed).reduce((acc, b) => acc + b.bonusScore, 0)
      : 0;
  const chronicleSummary = isTerminalOutcome ? computeScoreSummary(st) : null;
  const chronicleTotalScore = chronicleSummary ? chronicleSummary.score + chronicleBountyBonus : 0;
  const chronicleStandings = isTerminalOutcome
    ? buildLiveDailyStandings(
        st.spec,
        leaderboard,
        chronicleSummary?.victory
          ? {
              username: 'You',
              score: chronicleTotalScore,
              timeSec: chronicleSummary.timeSec,
              crowns: chronicleSummary.crowns,
              strategy: chronicleSummary.strategyLabel,
              wololos: st.stats.wololoConversions,
            }
          : null,
        rank,
      )
    : [];
  const chronicleRivalBanner = isTerminalOutcome
    ? computeRivalChallenge(
        chronicleStandings,
        chronicleSummary?.victory ? chronicleTotalScore : null,
        chronicleSummary?.timeSec ?? null,
        st.spec.parSec,
      )
    : undefined;
  const careerRank = getCareerRankInfo(career.xp);

  return (
    <main
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        background: '#141814',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <IsoCanvas
        stateRef={stateRef}
        interactive={screen === 'game'}
        showMinimap={screen === 'game' && showMinimap}
        selectedUnitIds={selectedUnitIds}
        selectedBuildingId={selectedBuildingId}
        placementKind={placementKind}
        demolishMode={demolishMode}
        rallyMode={rallyMode}
        focusTarget={focusTarget}
        onSelectUnits={(ids) => {
          unlockAudio();
          selectedUnitIdsRef.current = ids;
          setSelectedUnitIds(ids);
          if (ids.length > 0) {
            selectedBuildingIdRef.current = null;
            setSelectedBuildingId(null);
            setRallyMode(false);
          }
          setSnapshot(makeSnapshot(stateRef.current, selectedBuildingIdRef.current, ids));
        }}
        onSelectBuilding={(id) => {
          unlockAudio();
          selectedBuildingIdRef.current = id;
          setSelectedBuildingId(id);
          setRallyMode(false);
          if (id !== null) {
            selectedUnitIdsRef.current = [];
            setSelectedUnitIds([]);
          }
          setSnapshot(makeSnapshot(stateRef.current, id, selectedUnitIdsRef.current));
        }}
        onIssueTileOrder={handleIssueTileOrder}
        onPlaceBuildingAt={handlePlaceBuildingAt}
        onSetRallyPoint={handleSetRallyPoint}
        onDemolishAt={handleDemolishAt}
        onCancelPlacement={() => {
          setPlacementKind(null);
          setDemolishMode(false);
          setRallyMode(false);
        }}
      />

      {screen === 'war_room' ? (
        <WarRoomScreen
          dailySpec={dailySpec}
          streak={streak}
          bestScore={bestScore}
          rank={rank}
          leaderboard={leaderboard}
          hallOfFame={hallOfFame}
          community={community}
          aiModeLabel={aiModeLabel}
          playerBases={playerBases}
          hasSavedBase={myBase !== null}
          difficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          career={career}
          dailyBounties={dailyBounties}
          onPlayDaily={() => startSkirmish({ ...dailySpec, difficulty })}
          onOpenMyBase={openMyBaseBuilder}
          onRaidPlayerBase={startPlayerRaid}
          onOpenSettings={() => {
            setSettingsInitialTab('settings');
            setSettingsOpen(true);
          }}
          onOpenLeaderboard={() => {
            setSettingsInitialTab('ranks');
            setSettingsOpen(true);
          }}
          onPlayCustomSpec={(spec) => startSkirmish({ ...spec, difficulty: spec.difficulty ?? difficulty })}
          onCraftPrompt={handleCraftPrompt}
        />
      ) : (
        <>
          <EmpireHud
            spec={activeSpec}
            mode={st.mode}
            raidTargetName={st.raidTargetOwner}
            snapshot={snapshot}
            selectedUnitIds={selectedUnitIds}
            selectedBuildingId={selectedBuildingId}
            placementKind={placementKind}
            whisper={whisper}
            muted={muted}
            gameSpeed={gameSpeed}
            publishStatus={publishStatus}
            basePublished={publishStatus === 'published' || publishStatus === 'saved'}
            demolishMode={demolishMode}
            rallyMode={rallyMode}
            empireName={empireName}
            onChangeEmpireName={setEmpireName}
            onToggleDemolish={() => {
              unlockAudio();
              setRallyMode(false);
              setDemolishMode((prev) => {
                const next = !prev;
                if (next) setPlacementKind(null);
                return next;
              });
            }}
            onToggleRally={() => {
              unlockAudio();
              setPlacementKind(null);
              setDemolishMode(false);
              setRallyMode((prev) => !prev);
            }}
            onCancelQueueItem={handleCancelQueueItem}
            onRingTownBell={handleRingTownBell}
            onFocusKeep={handleFocusKeep}
            onFocusGhostBreach={() => {
              const gb = stateRef.current.ghostBreach;
              if (gb) panToTile(gb.tileX + 0.5, gb.tileY + 0.5);
            }}
            onFilterSelectedKind={handleFilterSelectedKind}
            onAdvanceAge={handleAdvanceAge}
            onToggleSpeed={cycleSpeed}
            onToggleMute={toggleMute}
            onOpenSettings={() => {
              setSettingsInitialTab('settings');
              setSettingsOpen(true);
            }}
            onPublishBase={() => void handlePublishBase()}
            onDoneBaseBuilder={returnToHomeOverlay}
            onAskScout={() => {
              unlockAudio();
              void askHybridScoutAdvisor(stateRef.current).then((w) => setWhisper(w));
            }}
            onSelectSquad={handleSelectSquad}
            onSiegeEnemyKeep={() => {
              unlockAudio();
              cmdAttackEnemyKeep(stateRef.current, 'player');
              flushStateSounds(stateRef.current.soundEvents);
            }}
            onTrainUnit={handleTrainUnit}
            onSelectPlacement={(kind) => {
              unlockAudio();
              if (kind !== null) {
                setDemolishMode(false);
                setRallyMode(false);
              }
              setPlacementKind(kind);
            }}
            onTaunt={handleTaunt}
            onExitToWarRoom={returnToHomeOverlay}
          />
          <ChronicleModal
            open={isTerminalOutcome}
            state={st}
            streak={Math.max(1, streak)}
            rank={rank}
            flairText={flairText}
            epigraph={epigraph}
            shareCode={st.spec.isCustom && st.mode !== 'raid' ? encodeSkirmishCode(st.spec) : null}
            commentStatus={commentStatus}
            bounties={chronicleBounties}
            bountyBonusScore={chronicleBountyBonus}
            rivalBanner={chronicleRivalBanner}
            careerRank={careerRank}
            xpGained={lastXpGained}
            onOpenLeaderboard={() => {
              setSettingsInitialTab('ranks');
              setSettingsOpen(true);
            }}
            onPostComment={() => void handlePostComment()}
            onCopyChronicle={() => void handleCopyChronicle()}
            onPlayAgain={() => {
              if (st.mode === 'raid' && st.raidTargetOwner) {
                const target = playerBases.find((b) => b.owner === st.raidTargetOwner);
                if (target) {
                  startPlayerRaid(target);
                  return;
                }
              }
              startSkirmish(activeSpec);
            }}
            onBackToWarRoom={returnToHomeOverlay}
          />
        </>
      )}

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsOpen(false)}
        inMatch={screen === 'game'}
        muted={muted}
        onToggleMute={toggleMute}
        gameSpeed={gameSpeed}
        onToggleSpeed={cycleSpeed}
        showMinimap={showMinimap}
        onToggleMinimap={() => setShowMinimap((v) => !v)}
        onTaunt={handleTaunt}
        onExitToMainMenu={returnToHomeOverlay}
        dailySpec={dailySpec}
        streak={streak}
        bestScore={bestScore}
        rank={rank}
        leaderboard={leaderboard}
        hallOfFame={hallOfFame}
        playerBases={playerBases}
        career={career}
        community={community}
        aiModeLabel={aiModeLabel}
        onRaidPlayerBase={startPlayerRaid}
        onPlayCustomSpec={(spec) => startSkirmish({ ...spec, difficulty: spec.difficulty ?? difficulty })}
        onCraftPrompt={handleCraftPrompt}
      />
    </main>
  );
}
