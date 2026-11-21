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
  decodeSkirmishCode,
  encodeSkirmishCode,
  generateDailySpec,
} from '../engine/dailyGenerator.js';
import {
  cmdAttackEnemyKeep,
  cmdIssueOrder,
  cmdPlaceBuilding,
  cmdTrainUnit,
  cmdTriggerTaunt,
  computeScoreSummary,
  createInitialState,
  formatChronicleComment,
  getTeamPop,
  stepGame,
} from '../engine/sim.js';
import IsoCanvas from '../rendering/IsoCanvas.js';
import type { ClientMessage } from '../shared/messages.js';
import type {
  BuildingKind,
  GameState,
  SkirmishSpec,
  TauntId,
  UnitKind,
} from '../types/rts.js';
import ChronicleModal from '../ui/ChronicleModal.js';
import EmpireHud, { type HudSnapshot } from '../ui/EmpireHud.js';
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
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

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

function makeSnapshot(state: GameState): HudSnapshot {
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
  };
}

export default function App() {
  const dailySpec = useMemo(() => generateDailySpec(), []);
  const [activeSpec, setActiveSpec] = useState<SkirmishSpec>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    return (code && decodeSkirmishCode(code)) || dailySpec;
  });

  const [screen, setScreen] = useState<'war_room' | 'game'>('war_room');
  const stateRef = useRef<GameState>(createInitialState(activeSpec));
  const accRef = useRef(0);
  const [snapshot, setSnapshot] = useState<HudSnapshot>(() => makeSnapshot(stateRef.current));
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [placementKind, setPlacementKind] = useState<BuildingKind | null>(null);
  const [gameSpeed, setGameSpeed] = useState<1 | 1.5>(1);
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
  const [community, setCommunity] = useState<CommunityWarStats>({
    totalPlays: 0,
    totalWins: 0,
    totalWololos: 0,
    topStrategy: 'Wololo Cult',
    fastestCommander: null,
  });

  const [epigraph, setEpigraph] = useState('Sound the horn and march across the ford!');
  const [commentStatus, setCommentStatus] = useState<
    'idle' | 'posting' | 'posted' | 'copied' | 'error'
  >('idle');
  const completionHandledRef = useRef<string>('');
  const matchIdRef = useRef(0);

  const fetchWarRoom = useCallback(async () => {
    if (isLocal) return;
    try {
      const res = await fetch(`/api/empire/daily?date=${encodeURIComponent(dailySpec.dateKey)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        leaderboard?: LeaderboardRow[];
        community?: CommunityWarStats;
        player?: { streak?: number; bestScore?: number | null; rank?: number | null };
      };
      if (data.leaderboard) setLeaderboard(data.leaderboard);
      if (data.community) setCommunity(data.community);
      if (data.player) {
        if (typeof data.player.streak === 'number') setStreak(data.player.streak);
        if (typeof data.player.bestScore === 'number') setBestScore(data.player.bestScore);
        setRank(data.player.rank ?? null);
      }
    } catch {
      return;
    }
  }, [dailySpec.dateKey]);

  useMountTask(() => {
    void detectHybridAICapability().then((cap) => {
      setAiModeLabel(cap.modeLabel);
    });
    if (!isLocal) {
      void fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(READY),
      }).catch(() => undefined);
      void fetchWarRoom();
    }
  });

  const startSkirmish = useCallback(
    (spec: SkirmishSpec) => {
      unlockAudio();
      matchIdRef.current += 1;
      completionHandledRef.current = '';
      accRef.current = 0;
      setActiveSpec(spec);
      const next = createInitialState(spec);
      if (community.fastestCommander) {
        next.ghostBreach = {
          username: community.fastestCommander.username,
          timeSec: community.fastestCommander.timeSec,
          tileX: 7.5,
          tileY: 7.5,
        };
      }
      stateRef.current = next;
      setSnapshot(makeSnapshot(next));
      const idleV = next.units.find(
        (u) => u.team === 'player' && u.kind === 'villager' && u.order.type === 'idle',
      );
      setSelectedUnitIds(idleV ? [idleV.id] : []);
      setSelectedBuildingId(null);
      setPlacementKind(null);
      setCommentStatus('idle');
      setFlairText(null);
      setWhisper(getInstantAdvisorWhisper(next));
      setScreen('game');
      if (!isLocal) journeys.start();
    },
    [community.fastestCommander],
  );

  const handleMatchCompletion = useCallback(
    (st: GameState) => {
      if (st.outcome === 'playing') return;
      const key = `${matchIdRef.current}:${st.outcome}`;
      if (completionHandledRef.current === key) return;
      completionHandledRef.current = key;

      const summary = computeScoreSummary(st);
      let nextStreak = streak;
      if (summary.victory && !st.spec.isCustom) {
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
        const updatedBest = Math.max(bestScore ?? 0, summary.score);
        setBestScore(updatedBest);
        saveLocal(`empire:best:${st.spec.dateKey}`, updatedBest);
      }

      void composeBattleEpigraph(st, Math.max(1, nextStreak)).then((res) => {
        setEpigraph(res.epigraph);
      });

      if (!isLocal) {
        journeys.end(summary.victory, summary.timeSec);
        if (!st.spec.isCustom) {
          void fetch('/api/empire/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dateKey: st.spec.dateKey,
              victory: summary.victory,
              score: summary.score,
              timeSec: summary.timeSec,
              crowns: summary.crowns,
              strategy: summary.strategyLabel,
              wololos: st.stats.wololoConversions,
            }),
          })
            .then((r) => r.json())
            .then(
              (data: {
                leaderboard?: LeaderboardRow[];
                community?: CommunityWarStats;
                rank?: number | null;
                streak?: number;
                flairAwarded?: string | null;
              }) => {
                if (data.leaderboard) setLeaderboard(data.leaderboard);
                if (data.community) setCommunity(data.community);
                if (data.rank !== undefined) setRank(data.rank);
                if (typeof data.streak === 'number') setStreak(data.streak);
                if (data.flairAwarded) setFlairText(data.flairAwarded);
              },
            )
            .catch(() => undefined);
        }
      }
    },
    [streak, lastWinDate, bestScore],
  );

  useFixedSimulationLoop(screen === 'game', gameSpeed, (elapsedSec) => {
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
    if (st.soundEvents.length > 0) {
      flushStateSounds(st.soundEvents);
    }

    if (stepped && (st.tick % 3 === 0 || st.outcome !== 'playing')) {
      setSnapshot(makeSnapshot(st));
      setSelectedUnitIds((prev) => {
        if (prev.length === 0) return prev;
        const alive = prev.filter((id) =>
          st.units.some((u) => u.id === id && u.team === 'player' && u.hp > 0),
        );
        return alive.length === prev.length ? prev : alive;
      });
    }

    if (stepped && st.tick % 90 === 0 && st.outcome === 'playing') {
      setWhisper(getInstantAdvisorWhisper(st));
    }

    if (st.outcome !== 'playing') {
      handleMatchCompletion(st);
    }
  });

  useWindowKeydown(screen === 'game', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const st = stateRef.current;

    if (isLocal && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      if (st.outcome !== 'playing') return;
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
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st));
      handleMatchCompletion(st);
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape') {
      setPlacementKind(null);
      return;
    }
    if (e.key === '1') {
      const ids = st.units
        .filter((u) => u.team === 'player' && u.hp > 0 && u.kind !== 'villager')
        .map((u) => u.id);
      setSelectedUnitIds(ids);
      setSelectedBuildingId(null);
    } else if (e.key === '2') {
      const idle = st.units.filter(
        (u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager' && u.order.type === 'idle',
      );
      const pool =
        idle.length > 0
          ? idle
          : st.units.filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager');
      setSelectedUnitIds(pool.map((u) => u.id));
      setSelectedBuildingId(null);
    } else if (e.key === '3') {
      const monks = st.units
        .filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'monk')
        .map((u) => u.id);
      if (monks.length > 0) setSelectedUnitIds(monks);
    } else {
      const buildMap: Record<string, BuildingKind> = {
        q: 'homestead',
        w: 'barracks',
        e: 'archery_range',
        r: 'stable',
        t: 'monastery',
        y: 'watchtower',
      };
      const bk = buildMap[e.key.toLowerCase()];
      if (bk) setPlacementKind((prev) => (prev === bk ? null : bk));
    }
  });

  const handleSelectSquad = (kind: 'idle_villager' | 'all_villagers' | 'all_army' | 'monks') => {
    unlockAudio();
    const st = stateRef.current;
    setPlacementKind(null);
    setSelectedBuildingId(null);
    if (kind === 'idle_villager') {
      const idle = st.units.filter(
        (u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager' && u.order.type === 'idle',
      );
      if (idle.length > 0) setSelectedUnitIds([idle[0].id]);
      else {
        const allV = st.units.filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager');
        setSelectedUnitIds(allV.map((u) => u.id));
      }
    } else if (kind === 'all_villagers') {
      setSelectedUnitIds(
        st.units.filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'villager').map((u) => u.id),
      );
    } else if (kind === 'all_army') {
      setSelectedUnitIds(
        st.units.filter((u) => u.team === 'player' && u.hp > 0 && u.kind !== 'villager').map((u) => u.id),
      );
    } else if (kind === 'monks') {
      setSelectedUnitIds(
        st.units.filter((u) => u.team === 'player' && u.hp > 0 && u.kind === 'monk').map((u) => u.id),
      );
    }
  };

  const handleIssueTileOrder = (tileX: number, tileY: number) => {
    unlockAudio();
    const st = stateRef.current;
    cmdIssueOrder(st, 'player', selectedUnitIds, tileX, tileY);
    flushStateSounds(st.soundEvents);
    setSnapshot(makeSnapshot(st));
  };

  const handlePlaceBuildingAt = (tileX: number, tileY: number) => {
    if (!placementKind) return;
    unlockAudio();
    const st = stateRef.current;
    const placed = cmdPlaceBuilding(st, 'player', placementKind, tileX, tileY, selectedUnitIds);
    if (placed) {
      setPlacementKind(null);
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st));
    }
  };

  const handleTrainUnit = (kind: UnitKind) => {
    unlockAudio();
    const st = stateRef.current;
    const ok = cmdTrainUnit(st, 'player', kind, selectedBuildingId ?? undefined);
    if (ok) {
      flushStateSounds(st.soundEvents);
      setSnapshot(makeSnapshot(st));
    }
  };

  const handleTaunt = (id: TauntId) => {
    unlockAudio();
    playTauntSound(id);
    cmdTriggerTaunt(stateRef.current, id);
  };

  const handlePostComment = async () => {
    const st = stateRef.current;
    const code = st.spec.isCustom ? encodeSkirmishCode(st.spec) : null;
    const text =
      formatChronicleComment(st, Math.max(1, streak)) +
      (code ? `\n🛠️ Challenge Code: \`${code}\`` : '');

    if (isLocal) {
      try {
        await navigator.clipboard?.writeText(text);
        setCommentStatus('copied');
      } catch {
        setCommentStatus('error');
      }
      return;
    }

    setCommentStatus('posting');
    try {
      const res = await fetch('/api/empire/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateKey: st.spec.dateKey, text }),
      });
      const data = (await res.json()) as { posted?: boolean };
      if (data.posted) {
        setCommentStatus('posted');
      } else {
        await navigator.clipboard?.writeText(text);
        setCommentStatus('copied');
      }
    } catch {
      try {
        await navigator.clipboard?.writeText(text);
        setCommentStatus('copied');
      } catch {
        setCommentStatus('error');
      }
    }
  };

  const handleCopyChronicle = async () => {
    const st = stateRef.current;
    const code = st.spec.isCustom ? encodeSkirmishCode(st.spec) : null;
    const text =
      formatChronicleComment(st, Math.max(1, streak)) +
      (code ? `\n🛠️ Challenge Code: \`${code}\`` : '');
    try {
      await navigator.clipboard?.writeText(text);
      setCommentStatus('copied');
    } catch {
      setCommentStatus('error');
    }
  };

  if (screen === 'war_room') {
    return (
      <WarRoomScreen
        dailySpec={dailySpec}
        streak={streak}
        bestScore={bestScore}
        rank={rank}
        leaderboard={leaderboard}
        community={community}
        aiModeLabel={aiModeLabel}
        onPlayDaily={() => startSkirmish(dailySpec)}
        onPlayCustomSpec={(spec) => startSkirmish(spec)}
        onCraftPrompt={async (prompt) => {
          const res = await craftSkirmishFromPrompt(prompt);
          return {
            spec: res.spec,
            shareCode: res.shareCode,
            flavorSummary: res.flavorSummary,
          };
        }}
      />
    );
  }

  const st = stateRef.current;
  return (
    <main
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        background: '#14100b',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <IsoCanvas
        stateRef={stateRef}
        selectedUnitIds={selectedUnitIds}
        selectedBuildingId={selectedBuildingId}
        placementKind={placementKind}
        onSelectUnits={(ids) => {
          unlockAudio();
          setSelectedUnitIds(ids);
          if (ids.length > 0) setSelectedBuildingId(null);
        }}
        onSelectBuilding={(id) => {
          unlockAudio();
          setSelectedBuildingId(id);
          if (id !== null) setSelectedUnitIds([]);
        }}
        onIssueTileOrder={handleIssueTileOrder}
        onPlaceBuildingAt={handlePlaceBuildingAt}
        onCancelPlacement={() => setPlacementKind(null)}
      />
      <EmpireHud
        spec={activeSpec}
        snapshot={snapshot}
        selectedUnitIds={selectedUnitIds}
        selectedBuildingId={selectedBuildingId}
        placementKind={placementKind}
        whisper={whisper}
        muted={muted}
        gameSpeed={gameSpeed}
        onToggleSpeed={() => setGameSpeed((s) => (s === 1 ? 1.5 : 1))}
        onToggleMute={() => {
          const next = !muted;
          setMutedState(next);
          setAudioMuted(next);
        }}
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
          setPlacementKind(kind);
        }}
        onTaunt={handleTaunt}
        onExitToWarRoom={() => setScreen('war_room')}
      />
      <ChronicleModal
        open={st.outcome === 'victory' || st.outcome === 'defeat'}
        state={st}
        streak={Math.max(1, streak)}
        rank={rank}
        flairText={flairText}
        epigraph={epigraph}
        shareCode={st.spec.isCustom ? encodeSkirmishCode(st.spec) : null}
        commentStatus={commentStatus}
        onPostComment={() => void handlePostComment()}
        onCopyChronicle={() => void handleCopyChronicle()}
        onPlayAgain={() => startSkirmish(activeSpec)}
        onBackToWarRoom={() => setScreen('war_room')}
      />
    </main>
  );
}
