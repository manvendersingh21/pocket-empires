import React from 'react';
import { CIVS, type GameState } from '../types/rts.js';
import type { CareerRankInfo } from '../engine/career.js';
import type { EvaluatedDailyBounty } from '../engine/dailyBounties.js';
import type { RivalChallenge } from '../engine/leaderboardModel.js';
import { computeScoreSummary } from '../engine/sim.js';
import {
  CivCrest,
  EmpireIcon,
  stripEmoji,
  type EmpireIconName,
} from './EmpireIcons.js';

export interface ChronicleModalProps {
  open: boolean;
  state: GameState;
  streak: number;
  rank: number | null;
  flairText: string | null;
  epigraph: string;
  shareCode: string | null;
  commentStatus: 'idle' | 'posting' | 'posted' | 'copied' | 'error';
  bounties?: EvaluatedDailyBounty[];
  bountyBonusScore?: number;
  rivalBanner?: RivalChallenge;
  careerRank?: CareerRankInfo;
  xpGained?: number;
  onPostComment: () => void;
  onCopyChronicle: () => void;
  onOpenLeaderboard?: () => void;
  onPlayAgain: () => void;
  onBackToWarRoom: () => void;
}

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = String(s % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function resolveStrategyIconName(strategyLabel: string): EmpireIconName {
  const lower = strategyLabel.toLowerCase();
  if (lower.includes('wololo') || lower.includes('monk')) return 'monk';
  if (lower.includes('cavalry') || lower.includes('knight')) return 'knight';
  if (lower.includes('longbow') || lower.includes('archer') || lower.includes('volley')) {
    return 'archer';
  }
  if (lower.includes('trebuchet') || lower.includes('boulder')) return 'target';
  if (lower.includes('castle')) return 'crown';
  if (lower.includes('blitz') || lower.includes('fast')) return 'bolt';
  return 'swords';
}

const CHRONICLE_CSS = `
@keyframes pe-modal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pe-card-rise {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes pe-crown-pop {
  0% { opacity: 0; transform: translateY(-14px) scale(0.45) rotate(-10deg); }
  68% { opacity: 1; transform: translateY(2px) scale(1.16) rotate(3deg); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
}
.pe-chronicle-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: radial-gradient(
    circle at 50% 38%,
    rgba(16, 24, 36, 0.24) 0%,
    rgba(8, 12, 18, 0.52) 100%
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: pe-modal-fade-in 0.18s ease-out;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #f8fafc;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}
.pe-chronicle-backdrop *, .pe-chronicle-backdrop *::before, .pe-chronicle-backdrop *::after {
  box-sizing: border-box;
}
.pe-chronicle-serif {
  font-family: 'Cinzel', 'Palatino Linotype', 'Book Antiqua', 'Georgia', serif;
  letter-spacing: 0.04em;
}
.pe-chronicle-tabular {
  font-variant-numeric: tabular-nums;
}
.pe-chronicle-card {
  width: 100%;
  max-width: 450px;
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  border-radius: 20px;
  background: rgba(14, 20, 30, 0.62);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.24);
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.54),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  padding: 16px 16px 15px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  animation: pe-card-rise 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.pe-crown-slot {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.pe-crown-slot-earned {
  background: radial-gradient(circle, rgba(245, 166, 35, 0.34) 0%, rgba(24, 30, 42, 0.6) 76%);
  border-color: rgba(253, 224, 71, 0.65);
  box-shadow:
    inset 0 1px 0 rgba(254, 240, 138, 0.4),
    0 0 18px rgba(245, 166, 35, 0.32);
}
.pe-crown-glyph-earned {
  display: inline-block;
  filter: drop-shadow(0 2px 6px rgba(245, 166, 35, 0.65));
  animation: pe-crown-pop 0.42s cubic-bezier(0.2, 0.9, 0.25, 1.2) backwards;
}
.pe-stat-cell {
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pe-reddit-cta {
  width: 100%;
  cursor: pointer;
  padding: 11px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 168, 128, 0.65);
  background: rgba(255, 69, 0, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #ffffff;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.02em;
  box-shadow:
    0 8px 22px rgba(255, 69, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: filter 0.14s ease, transform 0.08s ease;
}
.pe-reddit-cta:hover:not(:disabled) {
  filter: brightness(1.08);
}
.pe-reddit-cta:active:not(:disabled) {
  transform: translateY(1px);
}
.pe-reddit-cta:disabled {
  opacity: 0.72;
  cursor: default;
}
.pe-glass-modal-btn {
  flex: 1;
  cursor: pointer;
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.07);
  color: #f8fafc;
  font-weight: 700;
  font-size: 12.5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
}
.pe-glass-modal-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(253, 224, 71, 0.5);
}
.pe-glass-modal-btn:active {
  transform: translateY(1px);
}
.pe-glass-modal-btn-gold {
  border-color: rgba(255, 240, 190, 0.58);
  background: rgba(245, 166, 35, 0.8);
  color: #160f04;
  font-weight: 800;
}
.pe-glass-modal-btn-gold:hover {
  background: rgba(245, 166, 35, 0.92);
}
`;

export function ChronicleModal({
  open,
  state,
  streak,
  rank,
  flairText,
  epigraph,
  shareCode,
  commentStatus,
  bounties = [],
  bountyBonusScore = 0,
  rivalBanner,
  careerRank,
  xpGained = 0,
  onPostComment,
  onCopyChronicle,
  onOpenLeaderboard,
  onPlayAgain,
  onBackToWarRoom,
}: ChronicleModalProps) {
  if (!open) return null;

  const summary = computeScoreSummary(state);
  const totalScore = summary.score + bountyBonusScore;
  const beatPar = summary.victory && summary.timeSec <= state.spec.parSec;
  const playerCiv = CIVS[state.spec.playerCiv];
  const isRaid = state.mode === 'raid';
  const diff = state.spec.difficulty ?? 'standard';
  const initialEnemyBlds = state.initialEnemyBuildingCount ?? 0;
  const remainingEnemyBlds = state.buildings.filter((b) => b.team === 'enemy' && b.hp > 0).length;
  const raidDestructionPct = summary.victory
    ? 100
    : initialEnemyBlds > 0
      ? Math.min(
          99,
          Math.max(0, Math.round(((initialEnemyBlds - remainingEnemyBlds) / initialEnemyBlds) * 100)),
        )
      : 0;

  const rawTimeline = state.timeline && state.timeline.length >= 2
    ? state.timeline
    : [
        { t: 0, playerPower: 180, enemyPower: 180 },
        { t: Math.max(10, Math.round(summary.timeSec)), playerPower: summary.victory ? 320 : 90, enemyPower: summary.victory ? 70 : 310 },
      ];
  const maxPower = Math.max(
    100,
    ...rawTimeline.map((pt) => Math.max(pt.playerPower, pt.enemyPower)),
  );
  const chartW = 360;
  const chartH = 54;
  const toChartPoints = (pickVal: (p: (typeof rawTimeline)[number]) => number) =>
    rawTimeline
      .map((pt, idx) => {
        const x = (idx / Math.max(1, rawTimeline.length - 1)) * chartW;
        const y = chartH - 4 - (pickVal(pt) / maxPower) * (chartH - 10);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const playerLinePts = toChartPoints((p) => p.playerPower);
  const enemyLinePts = toChartPoints((p) => p.enemyPower);
  const playerAreaPts = `0,${chartH} ${playerLinePts} ${chartW},${chartH}`;

  const completedBountyCount = bounties.filter((b) => b.completed).length;

  const subtitleLabel =
    isRaid && state.raidTargetOwner
      ? `Player Raid vs u/${stripEmoji(state.raidTargetOwner)} · ${raidDestructionPct}% Destroyed`
      : state.spec.isCustom
        ? `Custom Siege · ${stripEmoji(state.spec.mapName)}`
        : `Daily Siege #${state.spec.puzzleNumber} · ${stripEmoji(state.spec.mapName)}`;

  const postButtonContent =
    commentStatus === 'posting' ? (
      <>
        <EmpireIcon name="scroll" size={15} />
        <span>Posting War Chronicle…</span>
      </>
    ) : commentStatus === 'posted' ? (
      <>
        <EmpireIcon name="check" size={15} />
        <span>Posted War Chronicle to Comments!</span>
      </>
    ) : commentStatus === 'copied' ? (
      <>
        <EmpireIcon name="check" size={15} />
        <span>Chronicle Copied — Paste in Comments!</span>
      </>
    ) : commentStatus === 'error' ? (
      <>
        <EmpireIcon name="alert" size={15} />
        <span>Retry — Post War Chronicle to Comments</span>
      </>
    ) : (
      <>
        <EmpireIcon name="quill" size={15} />
        <span>Post War Chronicle to Comments</span>
      </>
    );

  return (
    <div
      className="pe-chronicle-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Siege Chronicle"
    >
      <style>{CHRONICLE_CSS}</style>

      <div
        data-testid="chronicle-modal"
        className="pe-chronicle-card"
        style={{
          borderColor: summary.victory
            ? 'rgba(253, 224, 71, 0.42)'
            : 'rgba(248, 113, 113, 0.42)',
        }}
      >
        {/* 1. ANIMATED 1-3 GOLDEN CROWNS + HEADLINE */}
        <div
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '7px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            {[1, 2, 3].map((idx) => {
              const earned = summary.crowns >= idx;
              return (
                <div
                  key={idx}
                  className={`pe-crown-slot ${earned ? 'pe-crown-slot-earned' : ''}`}
                  style={{
                    transform: idx === 2 ? 'translateY(-4px) scale(1.07)' : undefined,
                  }}
                >
                  {earned ? (
                    <span
                      className="pe-crown-glyph-earned"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animationDelay: `${(idx - 1) * 140}ms`,
                      }}
                    >
                      <EmpireIcon name="crown" size={25} />
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.22,
                        filter: 'grayscale(1)',
                      }}
                    >
                      <EmpireIcon name="crown" size={25} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <div
              style={{
                fontSize: '10.5px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                color: 'rgba(226, 232, 240, 0.72)',
              }}
            >
              {subtitleLabel}
            </div>

            <h2
              className="pe-chronicle-serif"
              style={{
                margin: '2px 0 0',
                fontSize: 'clamp(19px, 4.4vw, 24px)',
                fontWeight: 900,
                color: summary.victory ? '#fde68a' : '#fca5a5',
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.65)',
              }}
            >
              {summary.victory ? 'VICTORY — KEEP CONQUERED!' : 'DEFEAT — KEEP FALLEN'}
            </h2>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: '5px',
                fontSize: '11.5px',
                color: 'rgba(226, 232, 240, 0.8)',
                marginTop: '3px',
              }}
            >
              <CivCrest civ={state.spec.playerCiv} size={14} />
              <span>{playerCiv.name} vs</span>
              <CivCrest civ={state.spec.enemyCiv} size={14} />
              <span>{stripEmoji(state.spec.aiLeaderName)}</span>
            </div>
          </div>
        </div>

        {/* 2. TRANSLUCENT EPIGRAPH QUOTE */}
        <blockquote
          style={{
            margin: 0,
            padding: '8px 12px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.045)',
            borderLeft: `3px solid ${summary.victory ? '#f5b942' : '#ef4444'}`,
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '12px',
            lineHeight: 1.4,
            fontStyle: 'italic',
            color: '#f1f5f9',
          }}
        >
          “{stripEmoji(epigraph)}”
        </blockquote>

        {/* 3. STATS LEDGER GRID */}
        <div
          className="pe-chronicle-tabular"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '7px',
          }}
        >
          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(203, 213, 225, 0.68)', fontWeight: 800 }}>
              Clear Time vs Par
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '15.5px',
                  fontWeight: 900,
                  color: beatPar ? '#fde68a' : '#f8fafc',
                }}
              >
                <EmpireIcon name="hourglass" size={14} />
                <span>{formatMmSs(summary.timeSec)}</span>
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(203, 213, 225, 0.72)' }}>
                / {formatMmSs(state.spec.parSec)}
              </span>
            </div>
          </div>

          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(203, 213, 225, 0.68)', fontWeight: 800 }}>
              Royal Score
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '15.5px',
                fontWeight: 900,
                color: '#fde68a',
              }}
            >
              <EmpireIcon name="trophy" size={14} />
              <span>{totalScore.toLocaleString()} pts</span>
              {bountyBonusScore > 0 && (
                <span style={{ fontSize: '10px', color: '#86efac', fontWeight: 800 }}>
                  (+{bountyBonusScore})
                </span>
              )}
            </span>
          </div>

          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(203, 213, 225, 0.68)', fontWeight: 800 }}>
              Strategy Earned
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 800,
                color: '#f8fafc',
              }}
            >
              <EmpireIcon name={resolveStrategyIconName(summary.strategyLabel)} size={14} />
              <span>{stripEmoji(summary.strategyLabel)}</span>
            </span>
          </div>

          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(203, 213, 225, 0.68)', fontWeight: 800 }}>
              Streak & Rank
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 800,
                color: '#fde68a',
              }}
            >
              <EmpireIcon name="flame" size={13} />
              <span>
                {streak}-Day · {rank !== null ? `#${rank}` : 'Unranked'}
              </span>
            </span>
          </div>
        </div>

        {/* 3b. PSYCHOLOGICAL RIVAL GAP CALLOUT + BATTLE MOMENTUM CHART + BOUNTIES + CAREER XP */}
        {rivalBanner && (
          <div
            data-testid="chronicle-rival-banner"
            className="pe-chronicle-tabular"
            style={{
              padding: '8px 11px',
              borderRadius: '12px',
              background:
                rivalBanner.playerRank === 1
                  ? 'rgba(245, 166, 35, 0.16)'
                  : 'rgba(37, 99, 235, 0.16)',
              border:
                rivalBanner.playerRank === 1
                  ? '1px solid rgba(253, 224, 71, 0.45)'
                  : '1px solid rgba(147, 197, 253, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 900, color: '#fef3c7' }}>
              <EmpireIcon name="target" size={13} />
              <span>{stripEmoji(rivalBanner.headline)}</span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(226, 232, 240, 0.85)', fontWeight: 600 }}>
              {stripEmoji(rivalBanner.subline)}
            </div>
          </div>
        )}

        <div
          data-testid="chronicle-momentum-chart"
          style={{
            padding: '7px 10px 6px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.045)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'rgba(203, 213, 225, 0.72)' }}>
            <span>Battle Momentum</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textTransform: 'none' }}>
              <span style={{ color: '#93c5fd' }}>Blue Empire</span>
              <span style={{ color: '#fca5a5' }}>Rival Keep</span>
            </span>
          </div>
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '48px', display: 'block' }}
            aria-label="Battle Momentum Power Timeline"
          >
            <polygon points={playerAreaPts} fill="rgba(59, 130, 246, 0.22)" />
            <polyline fill="none" stroke="#f87171" strokeWidth="1.8" strokeDasharray="4 3" points={enemyLinePts} />
            <polyline fill="none" stroke="#60a5fa" strokeWidth="2.2" points={playerLinePts} />
          </svg>
        </div>

        {(bounties.length > 0 || careerRank) && (
          <div
            className="pe-chronicle-tabular"
            style={{
              padding: '8px 10px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.045)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {bounties.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', fontWeight: 800, color: '#fde68a', textTransform: 'uppercase' }}>
                  <span>Daily Royal Bounties</span>
                  <span>{completedBountyCount}/{bounties.length} Cleared</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px' }}>
                  {bounties.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        padding: '4px 6px',
                        borderRadius: '8px',
                        background: b.completed ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                        border: b.completed ? '1px solid rgba(52, 211, 153, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', fontWeight: 800, color: b.completed ? '#d1fae5' : '#cbd5e1' }}>
                        <EmpireIcon name={b.icon} size={11} />
                        <span>{b.completed ? `+${b.bonusScore}` : `${b.current}/${b.target}`}</span>
                      </div>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                        {b.title}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {careerRank && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 800 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#fef3c7' }}>
                    <EmpireIcon name="medal" size={12} />
                    <span>Lv.{careerRank.level} {careerRank.title}</span>
                  </span>
                  <span style={{ color: '#86efac' }}>
                    +{xpGained} XP · {careerRank.progressPct}%
                  </span>
                </div>
                <div style={{ height: '4px', width: '100%', borderRadius: '999px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
                  <div style={{ width: `${careerRank.progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #fde047)' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. WOLOLOS, DIFFICULTY, RELICS, CHEEKY BADGE, FLAIR & SHARE CODE PILLS */}
        <div
          className="pe-chronicle-tabular"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              fontSize: '11px',
              fontWeight: 700,
              color: '#e2e8f0',
            }}
          >
            <EmpireIcon name="wololo" size={12} />
            <span>
              {state.stats.wololoConversions} Wololo
              {state.stats.wololoConversions === 1 ? '' : 's'} ·
            </span>
            <EmpireIcon name="swords" size={12} />
            <span>{state.stats.enemyUnitsSlain} Slain</span>
          </span>

          {diff !== 'standard' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(245, 168, 36, 0.2)',
                border: '1px solid rgba(254, 240, 138, 0.55)',
                fontSize: '11px',
                fontWeight: 800,
                color: '#fef3c7',
              }}
            >
              <EmpireIcon name="star" size={12} />
              <span>{diff === 'imperial' ? 'Imperial 1.35×' : 'Veteran 1.2×'}</span>
            </span>
          )}

          {(state.stats.relicsCaptured ?? 0) > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(250, 204, 21, 0.16)',
                border: '1px solid rgba(253, 224, 71, 0.45)',
                fontSize: '11px',
                fontWeight: 800,
                color: '#fde68a',
              }}
            >
              <EmpireIcon name="relic" size={12} />
              <span>{state.stats.relicsCaptured} Relic{(state.stats.relicsCaptured ?? 0) === 1 ? '' : 's'}</span>
            </span>
          )}

          {state.ages?.player === 2 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(245, 168, 36, 0.2)',
                border: '1px solid rgba(254, 240, 138, 0.55)',
                fontSize: '11px',
                fontWeight: 800,
                color: '#fef3c7',
              }}
            >
              <EmpireIcon name="crown" size={12} />
              <span>Castle Age II</span>
            </span>
          )}

          {state.stats.cheekyWololo && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(245, 166, 35, 0.22)',
                border: '1px solid rgba(253, 224, 71, 0.55)',
                fontSize: '11px',
                fontWeight: 800,
                color: '#fde68a',
              }}
            >
              <EmpireIcon name="horn" size={12} />
              <span>Cheeky Wololo!</span>
            </span>
          )}

          {flairText && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(37, 99, 235, 0.28)',
                border: '1px solid rgba(96, 165, 250, 0.55)',
                fontSize: '11px',
                fontWeight: 800,
                color: '#dbeafe',
              }}
            >
              <EmpireIcon name="medal" size={12} />
              <span>Flair Unlocked: {stripEmoji(flairText)}</span>
            </span>
          )}

          {shareCode && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 9px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#cbd5e1',
              }}
            >
              <EmpireIcon name="key" size={12} />
              <span>{shareCode}</span>
            </span>
          )}
        </div>

        {/* 5. 1-TAP SHARE + COPY + NAVIGATION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '2px' }}>
          <button
            type="button"
            data-testid="chronicle-post-btn"
            className="pe-reddit-cta"
            disabled={commentStatus === 'posting' || commentStatus === 'posted'}
            onClick={onPostComment}
          >
            {postButtonContent}
          </button>

          <button
            type="button"
            className="pe-glass-modal-btn"
            style={{ width: '100%', flex: 'none' }}
            onClick={onCopyChronicle}
          >
            {commentStatus === 'copied' ? (
              <>
                <EmpireIcon name="check" size={13} />
                <span>Chronicle Copied!</span>
              </>
            ) : (
              <>
                <EmpireIcon name="copy" size={13} />
                <span>Copy Chronicle</span>
              </>
            )}
          </button>

          <div style={{ display: 'flex', gap: '7px' }}>
            <button
              type="button"
              className="pe-glass-modal-btn pe-glass-modal-btn-gold"
              onClick={onPlayAgain}
            >
              <EmpireIcon name="swords" size={14} />
              <span>Siege Again</span>
            </button>
            {onOpenLeaderboard && (
              <button
                type="button"
                data-testid="chronicle-leaderboard-btn"
                className="pe-glass-modal-btn"
                onClick={onOpenLeaderboard}
              >
                <EmpireIcon name="trophy" size={14} />
                <span>Ranks</span>
              </button>
            )}
            <button
              type="button"
              className="pe-glass-modal-btn"
              onClick={onBackToWarRoom}
            >
              <EmpireIcon name="keep" size={14} />
              <span>Home</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChronicleModal;
