import React from 'react';
import { CIVS, type GameState } from '../types/rts.js';
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
  onPostComment: () => void;
  onCopyChronicle: () => void;
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
  if (lower.includes('blitz') || lower.includes('fast')) return 'bolt';
  return 'swords';
}

const CHRONICLE_CSS = `
@keyframes pe-modal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pe-card-rise {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes pe-crown-pop {
  0% { opacity: 0; transform: translateY(-16px) scale(0.45) rotate(-10deg); }
  68% { opacity: 1; transform: translateY(2px) scale(1.18) rotate(3deg); }
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
  background:
    radial-gradient(circle at 50% 35%, rgba(245, 185, 66, 0.14) 0%, rgba(12, 9, 6, 0.86) 65%),
    rgba(10, 7, 4, 0.82);
  backdrop-filter: blur(4px);
  animation: pe-modal-fade-in 0.2s ease-out;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #f5ecd8;
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
  max-width: 470px;
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  border-radius: 12px;
  background:
    linear-gradient(180deg, #2b241d 0%, #17120c 100%);
  border: 2px solid #b5862e;
  box-shadow:
    inset 0 1px 0 rgba(254, 240, 138, 0.32),
    inset 0 -3px 0 rgba(8, 6, 4, 0.85),
    0 20px 48px rgba(0, 0, 0, 0.82);
  padding: 16px 16px 15px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  animation: pe-card-rise 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.pe-crown-slot {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;
  background: radial-gradient(circle, #2a2117 0%, #15100b 100%);
  border: 1.5px solid #473929;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.7);
}
.pe-crown-slot-earned {
  background: radial-gradient(circle, rgba(245, 185, 66, 0.32) 0%, #241a0d 75%);
  border-color: #f5b942;
  box-shadow:
    inset 0 1px 0 rgba(254, 240, 138, 0.45),
    0 0 16px rgba(245, 185, 66, 0.38);
}
.pe-crown-glyph-earned {
  display: inline-block;
  filter: drop-shadow(0 2px 6px rgba(245, 185, 66, 0.65));
  animation: pe-crown-pop 0.44s cubic-bezier(0.2, 0.9, 0.25, 1.2) backwards;
}
.pe-stat-cell {
  padding: 8px 10px;
  border-radius: 8px;
  background: #1b150f;
  border: 1px solid #3d3124;
  box-shadow: inset 0 1px 0 rgba(255, 236, 190, 0.08);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pe-reddit-cta {
  width: 100%;
  cursor: pointer;
  padding: 12px 14px;
  border-radius: 9px;
  border: 1.5px solid #ff8759;
  background: linear-gradient(180deg, #ff5414 0%, #ff4500 55%, #cc3700 100%);
  color: #ffffff;
  font-weight: 800;
  font-size: 13.5px;
  letter-spacing: 0.02em;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -2px 0 rgba(92, 22, 0, 0.68),
    0 6px 16px rgba(255, 69, 0, 0.32);
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
.pe-stone-action-btn {
  flex: 1;
  cursor: pointer;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid #634f38;
  background: linear-gradient(180deg, #322920 0%, #201a14 100%);
  color: #f5ecd8;
  font-weight: 700;
  font-size: 12.5px;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.16),
    inset 0 -2px 0 rgba(0, 0, 0, 0.6);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: filter 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
}
.pe-stone-action-btn:hover {
  border-color: #f5b942;
  filter: brightness(1.1);
}
.pe-stone-action-btn:active {
  transform: translateY(1px);
}
.pe-brass-action-btn {
  border-color: #d49b35;
  background: linear-gradient(180deg, #4b391f 0%, #2e2212 100%);
  color: #fde68a;
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
  onPostComment,
  onCopyChronicle,
  onPlayAgain,
  onBackToWarRoom,
}: ChronicleModalProps) {
  if (!open) return null;

  const summary = computeScoreSummary(state);
  const beatPar = summary.victory && summary.timeSec <= state.spec.parSec;
  const playerCiv = CIVS[state.spec.playerCiv];

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
    <div className="pe-chronicle-backdrop" role="dialog" aria-modal="true" aria-label="Siege Chronicle">
      <style>{CHRONICLE_CSS}</style>

      <div
        data-testid="chronicle-modal"
        className="pe-chronicle-card"
        style={{
          borderColor: summary.victory ? '#d49b35' : '#991b1b',
        }}
      >
        {/* 1. ANIMATED 1-3 GOLDEN CROWNS + HEADLINE */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px' }}>
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
                      <EmpireIcon name="crown" size={26} />
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
                      <EmpireIcon name="crown" size={26} />
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
                letterSpacing: '0.1em',
                color: '#cbbba0',
              }}
            >
              {state.spec.isCustom
                ? `Custom Siege · ${state.spec.mapName}`
                : `Daily Siege #${state.spec.puzzleNumber} · ${state.spec.mapName}`}
            </div>

            <h2
              className="pe-chronicle-serif"
              style={{
                margin: '2px 0 0',
                fontSize: 'clamp(20px, 4.5vw, 25px)',
                fontWeight: 900,
                color: summary.victory ? '#f5b942' : '#f87171',
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
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
                color: '#bba98c',
                marginTop: '3px',
              }}
            >
              <CivCrest civ={state.spec.playerCiv} size={15} />
              <span>{playerCiv.name} vs</span>
              <CivCrest civ={state.spec.enemyCiv} size={15} />
              <span>{state.spec.aiLeaderName}</span>
            </div>
          </div>
        </div>

        {/* 2. ILLUMINATED EPIGRAPH QUOTE */}
        <blockquote
          style={{
            margin: 0,
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(18, 13, 9, 0.85)',
            borderLeft: `3px solid ${summary.victory ? '#f5b942' : '#dc2626'}`,
            borderTop: '1px solid #352b20',
            borderRight: '1px solid #352b20',
            borderBottom: '1px solid #352b20',
            fontSize: '12px',
            lineHeight: 1.4,
            fontStyle: 'italic',
            color: '#eadcc3',
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
          {/* Clear Time vs Par */}
          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#9c8b70', fontWeight: 800 }}>
              Clear Time vs Par
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '16px',
                  fontWeight: 900,
                  color: beatPar ? '#fde68a' : '#f5ecd8',
                }}
              >
                <EmpireIcon name="hourglass" size={15} />
                <span>{formatMmSs(summary.timeSec)}</span>
              </span>
              <span style={{ fontSize: '11px', color: '#bba98c' }}>
                / {formatMmSs(state.spec.parSec)}
              </span>
            </div>
          </div>

          {/* Score */}
          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#9c8b70', fontWeight: 800 }}>
              Royal Score
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '16px',
                fontWeight: 900,
                color: '#f5b942',
              }}
            >
              <EmpireIcon name="trophy" size={15} />
              <span>{summary.score.toLocaleString()} pts</span>
            </span>
          </div>

          {/* Strategy Earned */}
          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#9c8b70', fontWeight: 800 }}>
              Strategy Earned
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12.5px',
                fontWeight: 800,
                color: '#f5ecd8',
              }}
            >
              <EmpireIcon name={resolveStrategyIconName(summary.strategyLabel)} size={15} />
              <span>{stripEmoji(summary.strategyLabel)}</span>
            </span>
          </div>

          {/* Streak & Subreddit Rank */}
          <div className="pe-stat-cell">
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#9c8b70', fontWeight: 800 }}>
              Streak & Rank
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12.5px',
                fontWeight: 800,
                color: '#fde68a',
              }}
            >
              <EmpireIcon name="flame" size={14} />
              <span>
                {streak}-Day · {rank !== null ? `#${rank}` : 'Unranked'}
              </span>
            </span>
          </div>
        </div>

        {/* 4. WOLOLOS, CHEEKY BADGE, FLAIR & SHARE CODE PILLS */}
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
              padding: '4px 9px',
              borderRadius: '999px',
              background: '#1e1812',
              border: '1px solid #4e3f2d',
              fontSize: '11.5px',
              fontWeight: 700,
              color: '#eadcc3',
            }}
          >
            <EmpireIcon name="wololo" size={13} />
            <span>
              {state.stats.wololoConversions} Wololo
              {state.stats.wololoConversions === 1 ? '' : 's'} ·
            </span>
            <EmpireIcon name="swords" size={13} />
            <span>{state.stats.enemyUnitsSlain} Slain</span>
          </span>

          {state.stats.cheekyWololo && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'linear-gradient(180deg, #523912 0%, #332209 100%)',
                border: '1px solid #f5b942',
                fontSize: '11.5px',
                fontWeight: 800,
                color: '#fde68a',
                boxShadow: '0 0 10px rgba(245, 185, 66, 0.28)',
              }}
            >
              <EmpireIcon name="horn" size={13} />
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
                background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.28) 0%, rgba(30, 58, 138, 0.4) 100%)',
                border: '1px solid #60a5fa',
                fontSize: '11.5px',
                fontWeight: 800,
                color: '#dbeafe',
              }}
            >
              <EmpireIcon name="medal" size={13} />
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
                background: '#18130e',
                border: '1px solid #4a3b2a',
                fontSize: '11px',
                fontWeight: 700,
                color: '#cbbba0',
              }}
            >
              <EmpireIcon name="key" size={13} />
              <span>{shareCode}</span>
            </span>
          )}
        </div>

        {/* 5. 1-TAP REDDIT-ORANGE SHARE + COPY + NAVIGATION */}
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
            className="pe-stone-action-btn"
            style={{ width: '100%', flex: 'none' }}
            onClick={onCopyChronicle}
          >
            {commentStatus === 'copied' ? (
              <>
                <EmpireIcon name="check" size={14} />
                <span>Chronicle Copied!</span>
              </>
            ) : (
              <>
                <EmpireIcon name="copy" size={14} />
                <span>Copy Chronicle</span>
              </>
            )}
          </button>

          <div style={{ display: 'flex', gap: '7px' }}>
            <button
              type="button"
              className="pe-stone-action-btn pe-brass-action-btn"
              onClick={onPlayAgain}
            >
              <EmpireIcon name="swords" size={14} />
              <span>Siege Again</span>
            </button>
            <button
              type="button"
              className="pe-stone-action-btn"
              onClick={onBackToWarRoom}
            >
              <EmpireIcon name="keep" size={14} />
              <span>War Room</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChronicleModal;
