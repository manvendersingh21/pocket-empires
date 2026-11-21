import React, { useState } from 'react';
import {
  BIOMES,
  CIVS,
  DAILY_MODIFIERS,
  type SkirmishSpec,
} from '../types/rts.js';
import {
  decodeSkirmishCode,
  encodeSkirmishCode,
  generateDailySpec,
} from '../engine/dailyGenerator.js';
import { CivCrest, EmpireIcon, stripEmoji } from './EmpireIcons.js';

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
  community: CommunityWarStats;
  aiModeLabel: string;
  onPlayDaily: () => void;
  onPlayCustomSpec: (spec: SkirmishSpec) => void;
  onCraftPrompt: (
    prompt: string,
  ) => Promise<{ spec: SkirmishSpec; shareCode: string; flavorSummary: string }>;
}

const PRESET_PROMPTS = [
  'Black Forest Wololo Cult',
  'Golden Basin Knight Rush',
  'Highland Longbow Pass',
] as const;

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = String(s % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number);
  const baseUtc =
    parts.length === 3 && parts.every((n) => Number.isFinite(n))
      ? Date.UTC(parts[0], parts[1] - 1, parts[2])
      : Date.now();
  return new Date(baseUtc + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

function tryDecodeChallengeInput(
  raw: string,
): { spec: SkirmishSpec; shareCode: string; flavorSummary: string } | null {
  const match = /PE-[0-5]{4}[0-3]{2}-[0-9A-F]{4,8}/i.exec(raw.trim());
  if (!match) return null;
  const spec = decodeSkirmishCode(match[0]);
  if (!spec) return null;
  const shareCode = encodeSkirmishCode(spec);
  const biome = BIOMES[spec.biome];
  const pCiv = CIVS[spec.playerCiv];
  const eCiv = CIVS[spec.enemyCiv];
  const decree = DAILY_MODIFIERS[spec.modifier];
  return {
    spec,
    shareCode,
    flavorSummary: `${biome.name} skirmish · ${pCiv.name} vs ${spec.aiLeaderName} (${eCiv.name}) under ${decree.name}.`,
  };
}

function renderCrowns(crowns: number): React.ReactNode {
  const clamped = Math.max(0, Math.min(3, Math.round(crowns)));
  if (clamped === 0) {
    return <EmpireIcon name="skull" size={13} />;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {Array.from({ length: clamped }, (_, idx) => (
        <EmpireIcon key={idx} name="crown" size={13} />
      ))}
    </span>
  );
}

const WAR_ROOM_CSS = `
.pe-warroom-root {
  box-sizing: border-box;
  width: 100%;
  height: 100dvh;
  max-height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  background-color: #17120c;
  background-image:
    radial-gradient(ellipse at 50% 0%, rgba(245, 185, 66, 0.12) 0%, rgba(23, 18, 12, 0) 62%),
    repeating-linear-gradient(
      90deg,
      rgba(255, 232, 185, 0.014) 0px,
      rgba(255, 232, 185, 0.014) 2px,
      rgba(0, 0, 0, 0.08) 2px,
      rgba(0, 0, 0, 0.08) 7px
    ),
    linear-gradient(180deg, #1b150e 0%, #120e09 100%);
  color: #f5ecd8;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 12px 12px 22px;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}
.pe-warroom-root *, .pe-warroom-root *::before, .pe-warroom-root *::after {
  box-sizing: border-box;
}
.pe-serif {
  font-family: 'Cinzel', 'Palatino Linotype', 'Book Antiqua', 'Georgia', serif;
  letter-spacing: 0.04em;
}
.pe-tabular {
  font-variant-numeric: tabular-nums;
}
.pe-warroom-shell {
  max-width: 780px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pe-stone-card {
  position: relative;
  background: linear-gradient(180deg, #2d261f 0%, #231d17 100%);
  border: 1px solid #4d3f2e;
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.16),
    inset 0 -2px 0 rgba(10, 7, 4, 0.7),
    0 8px 22px rgba(0, 0, 0, 0.55);
}
.pe-brass-frame {
  border: 1.5px solid #9b7226;
  box-shadow:
    inset 0 1px 0 rgba(253, 230, 138, 0.28),
    inset 0 -2px 0 rgba(12, 8, 5, 0.78),
    0 10px 26px rgba(0, 0, 0, 0.62);
}
.pe-matchup-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: stretch;
}
@media (max-width: 560px) {
  .pe-matchup-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .pe-vs-divider {
    display: none !important;
  }
}
.pe-horn-cta {
  width: 100%;
  cursor: pointer;
  border: 2px solid #fde68a;
  border-radius: 10px;
  padding: 13px 16px;
  background: linear-gradient(180deg, #f8cc58 0%, #e5a325 52%, #b97812 100%);
  color: #1a1106;
  font-weight: 900;
  font-size: clamp(14px, 2.4vw, 17px);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(255, 248, 214, 0.55);
  box-shadow:
    inset 0 2px 0 rgba(255, 251, 224, 0.65),
    inset 0 -3px 0 rgba(102, 58, 5, 0.75),
    0 6px 18px rgba(245, 185, 66, 0.28),
    0 10px 24px rgba(0, 0, 0, 0.65);
  transition: transform 0.1s ease, filter 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.pe-horn-cta:hover {
  filter: brightness(1.06);
  box-shadow:
    inset 0 2px 0 rgba(255, 251, 224, 0.8),
    inset 0 -3px 0 rgba(102, 58, 5, 0.75),
    0 8px 24px rgba(245, 185, 66, 0.42),
    0 12px 26px rgba(0, 0, 0, 0.7);
}
.pe-horn-cta:active {
  transform: translateY(2px);
}
.pe-tab-btn {
  flex: 1;
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: #bba98c;
  font-weight: 700;
  font-size: 13px;
  transition: all 0.14s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.pe-tab-btn:hover {
  color: #f5ecd8;
}
.pe-tab-btn-active {
  background: linear-gradient(180deg, #382e24 0%, #272019 100%);
  border-color: #b5862e;
  color: #fde68a;
  box-shadow:
    inset 0 1px 0 rgba(253, 230, 138, 0.22),
    0 2px 8px rgba(0, 0, 0, 0.45);
}
.pe-chip-btn {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 999px;
  border: 1px solid #594834;
  background: linear-gradient(180deg, #2d251d 0%, #201a14 100%);
  color: #e8dac0;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 236, 190, 0.1);
  transition: border-color 0.14s ease, color 0.14s ease, transform 0.1s ease;
}
.pe-chip-btn:hover {
  border-color: #f5b942;
  color: #fde68a;
}
.pe-chip-btn:active {
  transform: translateY(1px);
}
.pe-oak-input {
  width: 100%;
  background: #140f0a;
  border: 1px solid #574633;
  border-radius: 7px;
  padding: 9px 11px;
  color: #f5ecd8;
  font-size: 13px;
  outline: none;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.65);
  user-select: text;
}
.pe-oak-input::placeholder {
  color: #84735b;
}
.pe-oak-input:focus {
  border-color: #f5b942;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.65), 0 0 0 2px rgba(245, 185, 66, 0.18);
}
.pe-bevel-btn {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 7px;
  border: 1px solid #b5862e;
  background: linear-gradient(180deg, #433524 0%, #2c2217 100%);
  color: #fde68a;
  font-weight: 700;
  font-size: 12.5px;
  padding: 8px 13px;
  box-shadow:
    inset 0 1px 0 rgba(253, 230, 138, 0.24),
    inset 0 -2px 0 rgba(0, 0, 0, 0.55);
  transition: filter 0.12s ease, transform 0.1s ease;
  white-space: nowrap;
}
.pe-bevel-btn:hover:not(:disabled) {
  filter: brightness(1.12);
}
.pe-bevel-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.pe-bevel-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
`;

export function WarRoomScreen({
  dailySpec,
  streak,
  bestScore,
  rank,
  leaderboard,
  community,
  aiModeLabel,
  onPlayDaily,
  onPlayCustomSpec,
  onCraftPrompt,
}: WarRoomScreenProps) {
  const [activeTab, setActiveTab] = useState<'ranks' | 'forge'>('ranks');
  const [promptInput, setPromptInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [crafting, setCrafting] = useState(false);
  const [craftError, setCraftError] = useState<string | null>(null);
  const [copiedCodeValue, setCopiedCodeValue] = useState<string | null>(null);
  const [crafted, setCrafted] = useState<{
    spec: SkirmishSpec;
    shareCode: string;
    flavorSummary: string;
  } | null>(null);

  const copiedCode = crafted !== null && copiedCodeValue === crafted.shareCode;
  const pastSieges = [1, 2, 3, 4].map((daysAgo) =>
    generateDailySpec(shiftDateKey(dailySpec.dateKey, -daysAgo)),
  );

  const biome = BIOMES[dailySpec.biome];
  const playerCiv = CIVS[dailySpec.playerCiv];
  const enemyCiv = CIVS[dailySpec.enemyCiv];
  const decree = DAILY_MODIFIERS[dailySpec.modifier];

  const handleForgeSubmit = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    setCraftError(null);
    setCopiedCodeValue(null);

    const directDecoded = tryDecodeChallengeInput(trimmed);
    if (directDecoded) {
      setCrafted(directDecoded);
      return;
    }

    setCrafting(true);
    try {
      const result = await onCraftPrompt(trimmed);
      setCrafted(result);
    } catch {
      setCraftError('The Royal Blacksmith could not parse that scroll. Try another decree!');
    } finally {
      setCrafting(false);
    }
  };

  const handleCodeChange = (val: string) => {
    setCodeInput(val);
    setCraftError(null);
    setCopiedCodeValue(null);
    const decoded = tryDecodeChallengeInput(val);
    if (decoded) {
      setCrafted(decoded);
    }
  };

  const handleCopyShareCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeValue(code);
    } catch {
      setCopiedCodeValue(null);
    }
  };

  return (
    <div className="pe-warroom-root">
      <style>{WAR_ROOM_CSS}</style>

      <div className="pe-warroom-shell">
        {/* 1. HERALDIC HEADER */}
        <header
          className="pe-stone-card"
          style={{
            padding: '10px 14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            background: 'linear-gradient(180deg, #241d16 0%, #19130e 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {/* Heraldic Shield SVG */}
            <svg
              width="34"
              height="38"
              viewBox="0 0 34 38"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
            >
              <path
                d="M17 2L31 7V18.5C31 27.4 24.9 33.4 17 36C9.1 33.4 3 27.4 3 18.5V7L17 2Z"
                fill="#1e3a8a"
                stroke="#f5b942"
                strokeWidth="2.2"
              />
              <path
                d="M17 4.2V33.6C23.5 31.2 28.8 25.9 28.8 18.5V8.5L17 4.2Z"
                fill="#991b1b"
              />
              <path
                d="M11 15L14 11L17 15L20 11L23 15L21.8 22H12.2L11 15Z"
                fill="#f5b942"
                stroke="#17120c"
                strokeWidth="1"
              />
            </svg>

            <div style={{ minWidth: 0 }}>
              <div
                className="pe-serif"
                style={{
                  fontSize: 'clamp(17px, 3vw, 22px)',
                  fontWeight: 900,
                  color: '#f5b942',
                  lineHeight: 1.08,
                  textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                }}
              >
                POCKET EMPIRES
              </div>
              <div
                className="pe-tabular"
                style={{
                  fontSize: '12px',
                  color: '#cbbba0',
                  fontWeight: 600,
                  marginTop: '2px',
                }}
              >
                Daily Siege #{dailySpec.puzzleNumber} · {dailySpec.dateKey}
              </div>
            </div>
          </div>

          {/* Streak + Best Rank + AI Engine Pills */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              className="pe-tabular"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 9px',
                borderRadius: '999px',
                background: 'linear-gradient(180deg, #3f2811 0%, #291809 100%)',
                border: '1px solid #d97706',
                color: '#fde68a',
                fontSize: '11.5px',
                fontWeight: 800,
              }}
            >
              <EmpireIcon name="flame" size={13} />
              <span>{streak}-Day Conqueror</span>
            </span>

            {(rank !== null || bestScore !== null) && (
              <span
                className="pe-tabular"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '999px',
                  background: '#1e1914',
                  border: '1px solid #6b563b',
                  color: '#e7d8be',
                  fontSize: '11.5px',
                  fontWeight: 700,
                }}
              >
                <EmpireIcon name="medal" size={13} />
                <span>
                  {rank !== null ? `#${rank}` : ''}
                  {rank !== null && bestScore !== null ? ' ' : ''}
                  {bestScore !== null ? `${bestScore.toLocaleString()} pts` : ''}
                </span>
              </span>
            )}

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '999px',
                background: 'rgba(37, 99, 235, 0.16)',
                border: '1px solid rgba(96, 165, 250, 0.45)',
                color: '#bfdbfe',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              <EmpireIcon name="fleur" size={13} />
              <span>{stripEmoji(aiModeLabel)}</span>
            </span>
          </div>
        </header>

        {/* 2. TODAY'S SIEGE DOSSIER CARD */}
        <section className="pe-stone-card pe-brass-frame" style={{ overflow: 'hidden' }}>
          {/* Biome Banner Top Accent */}
          <div
            style={{
              padding: '11px 14px 10px',
              borderBottom: '1px solid #3f3326',
              background: `linear-gradient(90deg, ${biome.grassEdge}55 0%, rgba(39,33,27,0.92) 58%, ${biome.waterDeep}55 100%)`,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '10.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#f5b942',
                  fontWeight: 800,
                }}
              >
                <EmpireIcon name="map" size={13} />
                <span>Today’s Siege Dossier · {biome.name}</span>
              </div>
              <h1
                className="pe-serif"
                style={{
                  margin: '2px 0 1px',
                  fontSize: 'clamp(17px, 2.8vw, 21px)',
                  color: '#fdf6e7',
                  fontWeight: 800,
                }}
              >
                {dailySpec.mapName}
              </h1>
              <div style={{ fontSize: '12px', color: '#cbbba0' }}>{biome.subtitle}</div>
            </div>

            <div
              className="pe-tabular"
              style={{
                padding: '6px 11px',
                borderRadius: '8px',
                background: 'rgba(20, 15, 10, 0.78)',
                border: '1px solid #a17628',
                textAlign: 'right',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#cbbba0',
                  fontWeight: 700,
                }}
              >
                3-Crown Par
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '15px',
                  fontWeight: 900,
                  color: '#fde68a',
                }}
              >
                <EmpireIcon name="hourglass" size={14} />
                <span>{formatMmSs(dailySpec.parSec)}</span>
              </div>
            </div>
          </div>

          {/* Matchup + Royal Decree + Subreddit War-Room Ticker */}
          <div style={{ padding: '11px 14px 12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {/* Matchup Grid */}
            <div className="pe-matchup-grid">
              {/* Player Crest (Royal Sapphire #2563eb) */}
              <div
                style={{
                  padding: '9px 11px',
                  borderRadius: '8px',
                  background:
                    'linear-gradient(135deg, rgba(37, 99, 235, 0.24) 0%, rgba(23, 18, 12, 0.75) 100%)',
                  border: '1px solid rgba(59, 130, 246, 0.55)',
                  boxShadow: 'inset 3px 0 0 #2563eb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#93c5fd',
                    }}
                  >
                    <EmpireIcon name="shield" size={12} />
                    <span>Your Banner</span>
                  </span>
                  <span style={{ fontSize: '11px', color: '#bfdbfe', fontWeight: 600 }}>
                    {playerCiv.title}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    color: '#f8fafc',
                    marginTop: '3px',
                  }}
                >
                  <CivCrest civ={dailySpec.playerCiv} size={18} />
                  <span>{playerCiv.name}</span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#d6cbb8', marginTop: '2px' }}>
                  {playerCiv.perkSummary}
                </div>
              </div>

              {/* Center VS Medallion */}
              <div
                className="pe-vs-divider pe-serif"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 2px',
                  color: '#f5b942',
                  fontWeight: 900,
                  fontSize: '13px',
                }}
              >
                <span
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#17120c',
                    border: '1.5px solid #9b7226',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  }}
                >
                  <EmpireIcon name="swords" size={17} />
                </span>
              </div>

              {/* Rival Crest (Royal Crimson #dc2626) */}
              <div
                style={{
                  padding: '9px 11px',
                  borderRadius: '8px',
                  background:
                    'linear-gradient(225deg, rgba(220, 38, 38, 0.24) 0%, rgba(23, 18, 12, 0.75) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.55)',
                  boxShadow: 'inset -3px 0 0 #dc2626',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#fca5a5',
                    }}
                  >
                    <EmpireIcon name="crown" size={12} />
                    <span>Rival Keep</span>
                  </span>
                  <span style={{ fontSize: '11px', color: '#fecaca', fontWeight: 600 }}>
                    {enemyCiv.name}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    color: '#fef2f2',
                    marginTop: '3px',
                  }}
                >
                  <CivCrest civ={dailySpec.enemyCiv} size={18} />
                  <span>{dailySpec.aiLeaderName}</span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#d6cbb8', marginTop: '2px' }}>
                  {enemyCiv.perkSummary}
                </div>
              </div>
            </div>

            {/* Royal Decree Strip */}
            <div
              style={{
                padding: '7px 11px',
                borderRadius: '7px',
                background: 'rgba(23, 18, 12, 0.72)',
                border: '1px solid #59452a',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#f5b942',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '11px',
                }}
              >
                <EmpireIcon name="scroll" size={13} />
                <span>Royal Decree · {decree.name}:</span>
              </span>
              <span style={{ color: '#efe3cc' }}>{decree.decree}</span>
            </div>

            {/* Live Subreddit War-Room Ticker */}
            <div
              className="pe-tabular"
              style={{
                padding: '6px 10px',
                borderRadius: '7px',
                background: '#17120c',
                border: '1px solid #382e23',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px 12px',
                fontSize: '11.5px',
                color: '#cbbba0',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                <EmpireIcon name="swords" size={13} />
                <span>
                  <strong style={{ color: '#f5ecd8' }}>{community.totalPlays.toLocaleString()}</strong>{' '}
                  commanders besieged ·
                </span>
                <EmpireIcon name="wololo" size={13} />
                <span>
                  <strong style={{ color: '#fde68a' }}>
                    {community.totalWololos.toLocaleString()}
                  </strong>{' '}
                  units Wololo’d today!
                </span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {community.topStrategy && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <EmpireIcon name="flame" size={12} />
                    <span>
                      Meta: <strong style={{ color: '#f5ecd8' }}>{stripEmoji(community.topStrategy)}</strong>
                    </span>
                  </span>
                )}
                {community.fastestCommander && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <EmpireIcon name="bolt" size={12} />
                    <span>
                      u/{community.fastestCommander.username} (
                      {formatMmSs(community.fastestCommander.timeSec)})
                    </span>
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>

        {/* 3. PRIMARY HAMMERED BRASS CTA */}
        <button type="button" className="pe-horn-cta pe-serif" onClick={onPlayDaily}>
          <EmpireIcon name="horn" size={18} />
          <span>SOUND THE HORN — PLAY DAILY SIEGE</span>
        </button>

        {/* 4. COMPACT SEGMENTED SWITCH: WAR ROOM RANKS | SKIRMISH FORGE */}
        <section className="pe-stone-card" style={{ padding: '8px 10px 11px' }}>
          <div
            role="group"
            aria-label="War Room Sections"
            style={{
              display: 'flex',
              gap: '6px',
              padding: '3px',
              borderRadius: '9px',
              background: '#17120c',
              border: '1px solid #3a2f23',
              marginBottom: '9px',
            }}
          >
            <button
              type="button"
              aria-pressed={activeTab === 'ranks'}
              className={`pe-tab-btn ${activeTab === 'ranks' ? 'pe-tab-btn-active' : ''}`}
              onClick={() => setActiveTab('ranks')}
            >
              <EmpireIcon name="trophy" size={15} />
              <span>War Room Ranks</span>
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'forge'}
              className={`pe-tab-btn ${activeTab === 'forge' ? 'pe-tab-btn-active' : ''}`}
              onClick={() => setActiveTab('forge')}
            >
              <EmpireIcon name="forge" size={15} />
              <span>Skirmish Forge</span>
            </button>
          </div>

          {activeTab === 'ranks' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {leaderboard.length === 0 ? (
                <div
                  style={{
                    padding: '16px 12px',
                    textAlign: 'center',
                    color: '#9c8b70',
                    fontSize: '12.5px',
                    background: '#1a140e',
                    borderRadius: '7px',
                    border: '1px dashed #433628',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <EmpireIcon name="keep" size={15} />
                  <span>No commanders have inscribed today’s chronicle yet — claim the #1 throne!</span>
                </div>
              ) : (
                leaderboard.slice(0, 8).map((row, idx) => {
                  const pos = idx + 1;
                  const medalColor =
                    pos === 1 ? '#f5b942' : pos === 2 ? '#cbd5e1' : pos === 3 ? '#d97706' : '#9c8b70';
                  return (
                    <div
                      key={`${row.username}-${idx}`}
                      className="pe-tabular"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '7px 10px',
                        borderRadius: '7px',
                        background:
                          pos === 1
                            ? 'linear-gradient(90deg, rgba(245, 185, 66, 0.14) 0%, rgba(23, 18, 12, 0.85) 100%)'
                            : '#1a140e',
                        border: pos === 1 ? '1px solid rgba(245, 185, 66, 0.45)' : '1px solid #33291e',
                        fontSize: '12.5px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                          minWidth: 0,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 900,
                            color: medalColor,
                            minWidth: '24px',
                          }}
                        >
                          #{pos}
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            color: '#f5ecd8',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          u/{row.username}
                        </span>
                        <span style={{ color: '#cbbba0' }}>· {formatMmSs(row.timeSec)}</span>
                        <span
                          title={`${row.crowns} Crowns`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          · {renderCrowns(row.crowns)}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: '#27211b',
                            border: '1px solid #46392b',
                            color: '#dfd1b8',
                          }}
                        >
                          {stripEmoji(row.strategy)}
                        </span>
                        {row.wololos > 0 && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              fontSize: '11px',
                              color: '#fde68a',
                              fontWeight: 700,
                            }}
                          >
                            <EmpireIcon name="wololo" size={11} />
                            <span>{row.wololos}</span>
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontWeight: 800,
                          color: '#fde68a',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {row.score.toLocaleString()}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Past Daily Chronicles (Practice Archive) */}
              <div
                style={{
                  marginTop: '6px',
                  paddingTop: '8px',
                  borderTop: '1px solid #352b20',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    flexWrap: 'wrap',
                    padding: '0 2px 2px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: '#f5b942',
                    }}
                  >
                    <EmpireIcon name="scroll" size={13} />
                    <span>Past Daily Chronicles · Practice Archive</span>
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#9c8b70', fontWeight: 600 }}>
                    Unranked Skirmishes
                  </span>
                </div>

                {pastSieges.map((pastSpec, idx) => {
                  const pCiv = CIVS[pastSpec.playerCiv];
                  const eCiv = CIVS[pastSpec.enemyCiv];
                  const pastBiome = BIOMES[pastSpec.biome];
                  const pastDecree = DAILY_MODIFIERS[pastSpec.modifier];
                  return (
                    <div
                      key={pastSpec.dateKey}
                      className="pe-tabular"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '6px 9px',
                        borderRadius: '7px',
                        background: '#19140e',
                        border: '1px solid #362c20',
                        fontSize: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          minWidth: 0,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontWeight: 800, color: '#f5b942' }}>
                          Siege #{pastSpec.puzzleNumber}
                        </span>
                        <span style={{ color: '#f5ecd8', fontWeight: 700 }}>
                          · {pastSpec.mapName}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#cbbba0',
                          }}
                        >
                          · <CivCrest civ={pastSpec.playerCiv} size={13} />
                          <span>{pCiv.name} vs</span>
                          <CivCrest civ={pastSpec.enemyCiv} size={13} />
                          <span>{eCiv.name}</span>
                        </span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: '#241d16',
                            border: '1px solid #443729',
                            color: '#d9cbb3',
                          }}
                        >
                          {pastBiome.name} · {pastDecree.name}
                        </span>
                      </div>

                      <button
                        type="button"
                        data-testid={`archive-play-${idx}`}
                        className="pe-bevel-btn"
                        style={{ padding: '5px 10px', fontSize: '11.5px', flexShrink: 0 }}
                        onClick={() => onPlayCustomSpec({ ...pastSpec, isCustom: true })}
                      >
                        <EmpireIcon name="swords" size={12} />
                        <span>Practice</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Natural-language Siege Crafter Row */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleForgeSubmit(promptInput);
                }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input
                  type="text"
                  className="pe-oak-input"
                  value={promptInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPromptInput(val);
                    setCopiedCodeValue(null);
                    const instant = tryDecodeChallengeInput(val);
                    if (instant) {
                      setCraftError(null);
                      setCrafted(instant);
                    }
                  }}
                  placeholder="Describe a custom siege or paste PE-... code…"
                  aria-label="Custom Siege Prompt or Challenge Code"
                />
                <button
                  type="submit"
                  className="pe-bevel-btn"
                  disabled={crafting || !promptInput.trim()}
                >
                  {crafting ? (
                    <>
                      <EmpireIcon name="forge" size={13} />
                      <span>Forging…</span>
                    </>
                  ) : (
                    <>
                      <EmpireIcon name="hammer" size={13} />
                      <span>Forge</span>
                    </>
                  )}
                </button>
              </form>

              {/* Preset Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: '#9c8b70',
                    fontWeight: 700,
                  }}
                >
                  <EmpireIcon name="scroll" size={12} />
                  <span>Scrolls:</span>
                </span>
                {PRESET_PROMPTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="pe-chip-btn"
                    onClick={() => {
                      setPromptInput(preset);
                      void handleForgeSubmit(preset);
                    }}
                  >
                    <EmpireIcon name="wololo" size={11} />
                    <span>{preset}</span>
                  </button>
                ))}
              </div>

              {/* Dedicated Challenge Code Paste Bar */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <EmpireIcon
                    name="key"
                    size={13}
                    style={{
                      position: 'absolute',
                      left: '9px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    type="text"
                    className="pe-oak-input pe-tabular"
                    style={{ padding: '7px 10px 7px 27px', fontSize: '12px' }}
                    value={codeInput}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="Paste Challenge Code (e.g. PE-120203-A1B2C3)"
                    aria-label="Paste Challenge Code"
                  />
                </div>
                {codeInput.trim() && (
                  <button
                    type="button"
                    className="pe-bevel-btn"
                    style={{ padding: '7px 11px', fontSize: '12px' }}
                    onClick={() => {
                      const decoded = tryDecodeChallengeInput(codeInput);
                      if (decoded) {
                        setCraftError(null);
                        setCrafted(decoded);
                      } else {
                        setCraftError('Invalid Challenge Code — expected format PE-XXXXXX-XXXXXX.');
                      }
                    }}
                  >
                    Decode
                  </button>
                )}
              </div>

              {craftError && (
                <div
                  style={{
                    padding: '7px 10px',
                    borderRadius: '7px',
                    background: 'rgba(220, 38, 38, 0.16)',
                    border: '1px solid rgba(248, 113, 113, 0.45)',
                    color: '#fecaca',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <EmpireIcon name="alert" size={14} />
                  <span>{stripEmoji(craftError)}</span>
                </div>
              )}

              {/* Crafted Preview Card */}
              {crafted && (
                <div
                  style={{
                    marginTop: '2px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'linear-gradient(180deg, #221b14 0%, #17120c 100%)',
                    border: '1.5px solid #b5862e',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                    }}
                  >
                    <div>
                      <div
                        className="pe-serif"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '15px',
                          fontWeight: 800,
                          color: '#fde68a',
                        }}
                      >
                        <EmpireIcon name="map" size={15} />
                        <span>{crafted.spec.mapName}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11.5px',
                          color: '#cbbba0',
                          marginTop: '2px',
                        }}
                      >
                        <span>{BIOMES[crafted.spec.biome].name} ·</span>
                        <CivCrest civ={crafted.spec.playerCiv} size={14} />
                        <span>{CIVS[crafted.spec.playerCiv].name} vs</span>
                        <CivCrest civ={crafted.spec.enemyCiv} size={14} />
                        <span>
                          {crafted.spec.aiLeaderName} · {DAILY_MODIFIERS[crafted.spec.modifier].name}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="pe-chip-btn pe-tabular"
                      onClick={() => void handleCopyShareCode(crafted.shareCode)}
                      title="Copy Share Code"
                    >
                      {copiedCode ? (
                        <>
                          <EmpireIcon name="check" size={12} />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <EmpireIcon name="copy" size={12} />
                          <span>{crafted.shareCode}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div style={{ fontSize: '12px', color: '#e9dcc3', fontStyle: 'italic' }}>
                    “{stripEmoji(crafted.flavorSummary)}”
                  </div>

                  <button
                    type="button"
                    className="pe-horn-cta pe-serif"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                    onClick={() => onPlayCustomSpec(crafted.spec)}
                  >
                    <EmpireIcon name="swords" size={16} />
                    <span>Launch Custom Siege</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default WarRoomScreen;
