import React, { useState } from 'react';
import {
  BIOMES,
  CIVS,
  DAILY_MODIFIERS,
  type DifficultyId,
  type PlayerBaseBlueprint,
  type SkirmishSpec,
} from '../types/rts.js';
import {
  buildRecentWeekLedger,
  createEmptyCareerProfile,
  getCareerRankInfo,
  type CareerProfile,
} from '../engine/career.js';
import {
  generateDailyBounties,
  type DailyBounty,
} from '../engine/dailyBounties.js';
import {
  buildLiveDailyStandings,
  formatUtcResetCountdown,
} from '../engine/leaderboardModel.js';
import type { HallOfFameEntry } from '../shared/messages.js';
import { CivCrest, EmpireIcon, stripEmoji } from './EmpireIcons.js';
import { SettingsModal, type SettingsTabId } from './SettingsModal.js';

export interface LeaderboardRow {
  username: string;
  score: number;
  timeSec: number;
  crowns: number;
  strategy: string;
  wololos: number;
}

export interface CommunityWarStats {
  totalPlays: number;
  totalWins: number;
  totalWololos: number;
  topStrategy: string;
  fastestCommander?: { username: string; timeSec: number } | null;
}

export interface WarRoomScreenProps {
  dailySpec: SkirmishSpec;
  streak: number;
  bestScore: number | null;
  rank: number | null;
  leaderboard: LeaderboardRow[];
  hallOfFame?: HallOfFameEntry[];
  community: CommunityWarStats;
  aiModeLabel: string;
  playerBases?: PlayerBaseBlueprint[];
  hasSavedBase?: boolean;
  difficulty?: DifficultyId;
  onSelectDifficulty?: (difficulty: DifficultyId) => void;
  career?: CareerProfile;
  dailyBounties?: DailyBounty[];
  onPlayDaily: () => void;
  onOpenMyBase?: () => void;
  onRaidPlayerBase?: (base: PlayerBaseBlueprint) => void;
  onOpenSettings?: () => void;
  onOpenLeaderboard?: () => void;
  onPlayCustomSpec: (spec: SkirmishSpec) => void;
  onCraftPrompt: (
    prompt: string,
  ) => Promise<{ spec: SkirmishSpec; shareCode: string; flavorSummary: string }>;
}

function SettingsGearSvg({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.4 3.4c0-.46-.04-.9-.12-1.34l2.02-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.38.96a8.3 8.3 0 0 0-2.32-1.34l-.36-2.54a.49.49 0 0 0-.49-.42h-3.84a.49.49 0 0 0-.49.42l-.36 2.54a8.3 8.3 0 0 0-2.32 1.34l-2.38-.96a.5.5 0 0 0-.6.22L2.46 8.44a.49.49 0 0 0 .12.64L4.6 10.66a8.6 8.6 0 0 0 0 2.68l-2.02 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.6.22l2.38-.96c.7.56 1.48 1.02 2.32 1.34l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.49-.42l.36-2.54a8.3 8.3 0 0 0 2.32-1.34l2.38.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.02-1.58c.08-.44.12-.88.12-1.34Z"
        stroke="#f1f5f9"
        strokeWidth="1.55"
        strokeLinejoin="round"
        fill="rgba(255,255,255,0.12)"
      />
    </svg>
  );
}

function HomeFortSvg({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M3.5 20.5V9.5H6.5V11.2H9.2V9.5H14.8V11.2H17.5V9.5H20.5V20.5H3.5Z"
        fill="rgba(226,232,240,0.22)"
        stroke="#fde68a"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 9.5V4.8L12 2.5L16.5 4.8V9.5"
        stroke="#f8fafc"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 20.5V15.4C9.8 14.1 10.8 13.2 12 13.2C13.2 13.2 14.2 14.1 14.2 15.4V20.5"
        fill="rgba(245,166,35,0.35)"
        stroke="#fde68a"
        strokeWidth="1.3"
      />
    </svg>
  );
}

const HOME_OVERLAY_CSS = `
@keyframes pe-sheet-rise {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.pe-home-overlay {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: hidden;
  background: radial-gradient(
    circle at 50% 44%,
    rgba(12, 20, 26, 0.08) 0%,
    rgba(8, 14, 20, 0.36) 100%
  );
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #f8fafc;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}
.pe-home-overlay *, .pe-home-overlay *::before, .pe-home-overlay *::after {
  box-sizing: border-box;
}
.pe-home-serif {
  font-family: 'Cinzel', 'Palatino Linotype', 'Book Antiqua', 'Georgia', serif;
  letter-spacing: 0.06em;
}
.pe-home-tabular {
  font-variant-numeric: tabular-nums;
}
.pe-home-settings-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 30;
  cursor: pointer;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgba(15, 22, 32, 0.36);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.26);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.pe-home-settings-btn:hover {
  background: rgba(24, 34, 48, 0.50);
  border-color: rgba(254, 240, 138, 0.58);
}
.pe-home-settings-btn:active {
  transform: scale(0.95);
}
.pe-home-center-stack {
  width: 100%;
  max-width: 372px;
  max-height: calc(100dvh - 24px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.pe-habit-card {
  width: 100%;
  padding: 9px 11px;
  border-radius: 16px;
  background: rgba(14, 20, 30, 0.56);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.20);
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.pe-diff-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 2.5px;
  border-radius: 10px;
  background: rgba(8, 12, 18, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.pe-diff-pill {
  cursor: pointer;
  padding: 5px 4px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(226, 232, 240, 0.78);
  font-size: 10.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  white-space: nowrap;
  transition: all 0.13s ease;
}
.pe-diff-pill:hover {
  color: #ffffff;
}
.pe-diff-pill-active {
  background: rgba(245, 166, 35, 0.24);
  border-color: rgba(253, 224, 71, 0.52);
  color: #fef3c7;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.26);
}
.pe-bounties-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}
.pe-bounty-chip {
  padding: 5px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pe-bounty-chip-done {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(52, 211, 153, 0.52);
}
.pe-week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.pe-week-day {
  cursor: pointer;
  padding: 4px 2px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.11);
  color: rgba(226, 232, 240, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.5px;
  font-size: 9.5px;
  font-weight: 700;
  transition: border-color 0.12s ease, background 0.12s ease, transform 0.08s ease;
}
.pe-week-day:hover {
  border-color: rgba(253, 224, 71, 0.5);
  background: rgba(255, 255, 255, 0.1);
}
.pe-week-day:active {
  transform: scale(0.96);
}
.pe-week-day-today {
  border-color: rgba(251, 191, 36, 0.62);
  background: rgba(245, 166, 35, 0.16);
  color: #fef3c7;
}
.pe-home-secondary-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.pe-home-primary-cta {
  width: 100%;
  cursor: pointer;
  padding: 12px 16px;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    rgba(245, 168, 36, 0.68) 0%,
    rgba(217, 119, 6, 0.58) 100%
  );
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(254, 240, 138, 0.65);
  color: #fffbeb;
  text-shadow:
    0 1px 3px rgba(20, 12, 4, 0.68),
    0 0 12px rgba(254, 240, 138, 0.22);
  font-weight: 900;
  font-size: 13.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-shadow:
    0 10px 28px rgba(245, 168, 36, 0.26),
    0 4px 14px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 252, 232, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.1s ease, filter 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.pe-home-primary-cta:hover {
  filter: brightness(1.07);
  border-color: rgba(254, 249, 195, 0.85);
  box-shadow:
    0 12px 32px rgba(245, 168, 36, 0.38),
    0 6px 18px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 253, 240, 0.72);
}
.pe-home-primary-cta:active {
  transform: translateY(1.5px) scale(0.99);
}
.pe-home-glass-pill-btn {
  width: 100%;
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    rgba(18, 26, 36, 0.38) 0%,
    rgba(12, 18, 28, 0.32) 100%
  );
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: #f8fafc;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.52);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.01em;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.20);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.pe-home-glass-pill-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(26, 36, 50, 0.50) 0%,
    rgba(18, 26, 38, 0.44) 100%
  );
  border-color: rgba(254, 240, 138, 0.52);
}
.pe-home-glass-pill-btn:active {
  transform: translateY(1px) scale(0.99);
}
.pe-raid-sheet {
  width: min(92vw, 372px);
  max-height: min(34dvh, 235px);
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  background: rgba(14, 20, 30, 0.58);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 18px;
  box-shadow:
    0 18px 44px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  overflow: hidden;
  animation: pe-sheet-rise 0.18s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.pe-raid-attack-btn {
  cursor: pointer;
  flex-shrink: 0;
  padding: 6px 11px;
  border-radius: 999px;
  border: 1px solid rgba(254, 240, 138, 0.65);
  background: linear-gradient(
    135deg,
    rgba(245, 168, 36, 0.72) 0%,
    rgba(217, 119, 6, 0.62) 100%
  );
  color: #fffbeb;
  text-shadow: 0 1px 2px rgba(20, 12, 4, 0.65);
  font-size: 11.5px;
  font-weight: 900;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: filter 0.12s ease, transform 0.08s ease;
}
.pe-raid-attack-btn:hover {
  filter: brightness(1.08);
}
.pe-raid-attack-btn:active {
  transform: scale(0.96);
}
`;

const DIFFICULTY_OPTIONS: ReadonlyArray<{ id: DifficultyId; label: string; mult: string }> = [
  { id: 'standard', label: 'Standard', mult: '1×' },
  { id: 'veteran', label: 'Veteran', mult: '1.2×' },
  { id: 'imperial', label: 'Imperial', mult: '1.35×' },
];

export function WarRoomScreen({
  dailySpec,
  streak,
  bestScore,
  rank,
  leaderboard,
  hallOfFame = [],
  community,
  aiModeLabel,
  playerBases = [],
  hasSavedBase = false,
  difficulty = 'standard',
  onSelectDifficulty,
  career,
  dailyBounties,
  onPlayDaily,
  onOpenMyBase,
  onRaidPlayerBase,
  onOpenSettings,
  onOpenLeaderboard,
  onPlayCustomSpec,
  onCraftPrompt,
}: WarRoomScreenProps) {
  const [raidSheetOpen, setRaidSheetOpen] = useState(false);
  const [fallbackSettingsOpen, setFallbackSettingsOpen] = useState(false);
  const [fallbackSettingsTab, setFallbackSettingsTab] = useState<SettingsTabId>('settings');

  const careerProfile = career ?? createEmptyCareerProfile();
  const careerRank = getCareerRankInfo(careerProfile.xp);
  const bounties = dailyBounties ?? generateDailyBounties(dailySpec);
  const completedTodayBounties = new Set(careerProfile.days[dailySpec.dateKey]?.bountyIds ?? []);
  const weekLedger = buildRecentWeekLedger(dailySpec.dateKey, careerProfile);
  const resetCountdown = formatUtcResetCountdown();

  const localBestRow =
    bestScore !== null
      ? {
          username: 'You',
          score: bestScore,
          timeSec: careerProfile.days[dailySpec.dateKey]?.bestTimeSec ?? dailySpec.parSec,
          crowns: careerProfile.days[dailySpec.dateKey]?.crowns ?? 1,
          strategy: 'Your Best',
          wololos: 0,
        }
      : null;
  const liveStandings = buildLiveDailyStandings(dailySpec, leaderboard, localBestRow, rank);
  const topStanding = liveStandings[0] ?? null;

  const decree = DAILY_MODIFIERS[dailySpec.modifier];

  const handleSettingsClick = () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      setFallbackSettingsTab('settings');
      setFallbackSettingsOpen(true);
    }
  };

  const handleLeaderboardClick = () => {
    if (onOpenLeaderboard) {
      onOpenLeaderboard();
    } else {
      setFallbackSettingsTab('ranks');
      setFallbackSettingsOpen(true);
    }
  };

  return (
    <div className="pe-home-overlay">
      <style>{HOME_OVERLAY_CSS}</style>

      {/* Top-Right: Single sleek frosted-glass Settings button */}
      <button
        type="button"
        aria-label="Settings"
        data-testid="home-settings-btn"
        className="pe-home-settings-btn"
        title="Settings, Leaderboard & Skirmish Forge"
        onClick={handleSettingsClick}
      >
        <SettingsGearSvg size={19} />
      </button>

      {/* Center Airy Stack: Wordmark + Campaign & Bounties Card + Play/Leaderboard/Base Controls */}
      <div className="pe-home-center-stack">
        {/* Floating Wordmark + Matchup Pill */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '5px',
            textAlign: 'center',
            maxWidth: '100%',
          }}
        >
          <h1
            className="pe-home-serif"
            style={{
              margin: 0,
              fontSize: 'clamp(23px, 5vw, 30px)',
              fontWeight: 900,
              color: '#fef3c7',
              lineHeight: 1.06,
              textShadow:
                '0 2px 14px rgba(0, 0, 0, 0.78), 0 1px 3px rgba(0, 0, 0, 0.9)',
            }}
          >
            POCKET EMPIRES
          </h1>

          <div
            className="pe-home-tabular"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3.5px 11px',
              borderRadius: '999px',
              background: 'rgba(14, 22, 32, 0.42)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.24)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'rgba(248, 250, 252, 0.96)',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.22)',
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <CivCrest civ={dailySpec.playerCiv} size={13} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {`Daily #${dailySpec.puzzleNumber} · ${dailySpec.mapName} vs `}
            </span>
            <CivCrest civ={dailySpec.enemyCiv} size={13} />
            <span>{decree.name}</span>
          </div>
        </div>

        {/* Daily Campaign, Career XP, Difficulty, 3 Bounties & 7-Day Crown Calendar Card */}
        <section className="pe-habit-card pe-home-tabular" aria-label="Daily Campaign and Bounties">
          {/* Career Rank & Reset Countdown */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
              <EmpireIcon name="medal" size={13} />
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#fde68a', whiteSpace: 'nowrap' }}>
                Lv.{careerRank.level} {careerRank.title}
              </span>
              {streak > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    background: 'rgba(245, 166, 35, 0.2)',
                    border: '1px solid rgba(253, 224, 71, 0.4)',
                    fontSize: '9.5px',
                    fontWeight: 800,
                    color: '#fef3c7',
                  }}
                >
                  <EmpireIcon name="flame" size={10} />
                  <span>{streak}d</span>
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'rgba(203, 213, 225, 0.82)', fontWeight: 700, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#fde68a' }}>
                <EmpireIcon name="crown" size={10} />
                <span>{careerProfile.totalCrowns}</span>
              </span>
              <span>· {resetCountdown}</span>
            </div>
          </div>

          <div
            style={{
              height: '4px',
              width: '100%',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
            }}
            title={`${careerRank.currentXp} XP`}
          >
            <div
              style={{
                width: `${careerRank.progressPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #f59e0b 0%, #fef08a 100%)',
                borderRadius: '999px',
              }}
            />
          </div>

          {/* 3-Tier Tactical Difficulty Selector */}
          <div
            data-testid="war-room-difficulty-bar"
            className="pe-diff-bar"
            role="group"
            aria-label="Siege Difficulty"
          >
            {DIFFICULTY_OPTIONS.map((opt) => {
              const active = difficulty === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`war-room-diff-${opt.id}`}
                  aria-pressed={active}
                  className={`pe-diff-pill ${active ? 'pe-diff-pill-active' : ''}`}
                  onClick={() => onSelectDifficulty?.(opt.id)}
                >
                  <span>{opt.label}</span>
                  <span style={{ fontSize: '9.5px', opacity: 0.85, color: active ? '#fde047' : '#cbd5e1' }}>
                    {opt.mult}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Today's 3 Royal Bounties */}
          <div data-testid="war-room-bounties" className="pe-bounties-row">
            {bounties.map((b) => {
              const done = completedTodayBounties.has(b.id);
              return (
                <div
                  key={b.id}
                  className={`pe-bounty-chip ${done ? 'pe-bounty-chip-done' : ''}`}
                  title={`${b.title}: ${b.description} (+${b.bonusScore} pts)`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px' }}>
                    <EmpireIcon name={b.icon} size={12} />
                    {done ? (
                      <EmpireIcon name="check" size={11} />
                    ) : (
                      <span style={{ fontSize: '9px', fontWeight: 800, color: '#fde68a' }}>
                        +{b.bonusScore}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 800,
                      color: done ? '#d1fae5' : '#f8fafc',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {b.title}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 7-Day Crown Streak Calendar Strip */}
          <div data-testid="war-room-week-strip" className="pe-week-strip" role="group" aria-label="7-Day Siege Calendar">
            {weekLedger.map((day) => (
              <button
                key={day.dateKey}
                type="button"
                className={`pe-week-day ${day.isToday ? 'pe-week-day-today' : ''}`}
                title={`Daily #${day.spec.puzzleNumber} (${day.spec.mapName}) — ${day.crowns}/3 Crowns`}
                onClick={() => {
                  if (day.isToday) {
                    onPlayDaily();
                  } else {
                    onPlayCustomSpec({ ...day.spec, difficulty, isCustom: true });
                  }
                }}
              >
                <span>#{day.spec.puzzleNumber}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                  {[1, 2, 3].map((dot) => (
                    <span
                      key={dot}
                      style={{
                        width: '4.5px',
                        height: '4.5px',
                        borderRadius: '50%',
                        background:
                          day.crowns >= dot
                            ? '#fbbf24'
                            : 'rgba(255, 255, 255, 0.16)',
                      }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Button 1: Primary 1-Tap Play */}
        <button
          type="button"
          data-testid="war-room-play-daily"
          className="pe-home-primary-cta pe-home-serif"
          onClick={onPlayDaily}
        >
          <EmpireIcon name="horn" size={18} />
          <span>SOUND THE HORN — TAP TO PLAY</span>
        </button>

        {/* Button 2: Live 3-League Leaderboard Hub */}
        <button
          type="button"
          data-testid="home-leaderboard-btn"
          className="pe-home-glass-pill-btn pe-home-tabular"
          style={{ justifyContent: 'space-between', padding: '9px 14px' }}
          onClick={handleLeaderboardClick}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
            <EmpireIcon name="trophy" size={15} />
            <span>Leaderboard · Hall of Fame</span>
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(245, 166, 35, 0.2)',
              border: '1px solid rgba(253, 224, 71, 0.45)',
              color: '#fde68a',
              fontSize: '10.5px',
              fontWeight: 800,
              maxWidth: '148px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {rank !== null
              ? `Rank #${rank}`
              : topStanding
                ? `#1 ${stripEmoji(topStanding.username)}`
                : 'Top 15'}
          </span>
        </button>

        {/* Secondary Row: My Base + Raid Players */}
        <div className="pe-home-secondary-grid">
          <button
            type="button"
            data-testid="home-my-base-btn"
            className="pe-home-glass-pill-btn"
            onClick={() => onOpenMyBase?.()}
          >
            <HomeFortSvg size={15} />
            <span>My Base</span>
            {hasSavedBase && (
              <span
                style={{
                  width: '6.5px',
                  height: '6.5px',
                  borderRadius: '50%',
                  background: '#34d399',
                  boxShadow: '0 0 8px rgba(52, 211, 153, 0.8)',
                  flexShrink: 0,
                }}
                title="Stronghold Saved"
              />
            )}
          </button>

          <button
            type="button"
            data-testid="home-raid-players-btn"
            aria-expanded={raidSheetOpen}
            className="pe-home-glass-pill-btn"
            style={
              raidSheetOpen
                ? {
                    background: 'rgba(24, 34, 48, 0.52)',
                    borderColor: 'rgba(254, 240, 138, 0.6)',
                  }
                : undefined
            }
            onClick={() => setRaidSheetOpen((prev) => !prev)}
          >
            <EmpireIcon name="swords" size={15} />
            <span>Raid Players</span>
            {playerBases.length > 0 && (
              <span
                className="pe-home-tabular"
                style={{
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#fde68a',
                  fontSize: '10.5px',
                  fontWeight: 800,
                }}
              >
                {playerBases.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Compact Frosted-Glass Raid Target Sheet */}
      {raidSheetOpen && (
        <section
          data-testid="raid-target-sheet"
          aria-label="Raid Target Forts"
          className="pe-raid-sheet"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '9px 13px 8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#fef3c7',
              }}
            >
              <EmpireIcon name="target" size={13} />
              <span>Published Redditor Strongholds</span>
            </span>

            <button
              type="button"
              aria-label="Close Raid Sheet"
              onClick={() => setRaidSheetOpen(false)}
              style={{
                cursor: 'pointer',
                width: '24px',
                height: '24px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                background: 'rgba(255, 255, 255, 0.07)',
                color: '#e2e8f0',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <EmpireIcon name="close" size={11} />
            </button>
          </div>

          <div
            style={{
              padding: '8px 10px 10px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {playerBases.length === 0 ? (
              <div
                style={{
                  padding: '14px 10px',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: 'rgba(226, 232, 240, 0.78)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>No player strongholds published yet — build & publish yours first!</span>
                {onOpenMyBase && (
                  <button
                    type="button"
                    className="pe-raid-attack-btn"
                    onClick={() => {
                      setRaidSheetOpen(false);
                      onOpenMyBase();
                    }}
                  >
                    <HomeFortSvg size={13} />
                    <span>Open My Base</span>
                  </button>
                )}
              </div>
            ) : (
              playerBases.map((b, idx) => {
                const wallCount = b.buildings.filter((x) => x.kind === 'stone_wall').length;
                const bldgCount = b.buildings.length - wallCount;
                const civDef = CIVS[b.civ];
                const biomeDef = BIOMES[b.biome];
                return (
                  <div
                    key={`${b.owner}-${idx}`}
                    className="pe-home-tabular"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.055)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <CivCrest civ={b.civ} size={20} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            flexWrap: 'wrap',
                            fontSize: '12.5px',
                            fontWeight: 800,
                            color: '#f8fafc',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {stripEmoji(b.empireName)}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(203, 213, 225, 0.8)' }}>
                            u/{stripEmoji(b.owner)}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                            fontSize: '10.5px',
                            color: 'rgba(203, 213, 225, 0.74)',
                            marginTop: '2px',
                          }}
                        >
                          <span>{civDef.name} · {biomeDef.name}</span>
                          <span>
                            · {bldgCount} bldgs{wallCount > 0 ? ` · ${wallCount} walls` : ''}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              color: '#fde68a',
                              fontWeight: 800,
                            }}
                          >
                            <EmpireIcon name="trophy" size={11} />
                            <span>{b.trophies}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`raid-attack-${idx}`}
                      className="pe-raid-attack-btn"
                      onClick={() => {
                        setRaidSheetOpen(false);
                        onRaidPlayerBase?.(b);
                      }}
                    >
                      <EmpireIcon name="swords" size={12} />
                      <span>Attack</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Standalone fallback Settings drawer if caller has not wired onOpenSettings */}
      {!onOpenSettings && fallbackSettingsOpen && (
        <SettingsModal
          open={fallbackSettingsOpen}
          initialTab={fallbackSettingsTab}
          onClose={() => setFallbackSettingsOpen(false)}
          inMatch={false}
          dailySpec={dailySpec}
          streak={streak}
          bestScore={bestScore}
          rank={rank}
          leaderboard={leaderboard}
          hallOfFame={hallOfFame}
          playerBases={playerBases}
          career={careerProfile}
          community={community}
          aiModeLabel={aiModeLabel}
          onRaidPlayerBase={onRaidPlayerBase}
          onPlayCustomSpec={onPlayCustomSpec}
          onCraftPrompt={onCraftPrompt}
        />
      )}
    </div>
  );
}

export default WarRoomScreen;
