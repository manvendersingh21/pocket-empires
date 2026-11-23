import React, { useState } from 'react';
import {
  BIOMES,
  CIVS,
  DAILY_MODIFIERS,
  TAUNTS,
  type SkirmishSpec,
  type TauntId,
} from '../types/rts.js';
import {
  decodeSkirmishCode,
  encodeSkirmishCode,
  generateDailySpec,
} from '../engine/dailyGenerator.js';
import { CivCrest, EmpireIcon, stripEmoji } from './EmpireIcons.js';
import type { CommunityWarStats, LeaderboardRow } from './WarRoomScreen.js';

export type SettingsTabId = 'settings' | 'ranks' | 'forge';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;

  // Quick Toggles & In-Match Controls
  inMatch?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
  gameSpeed?: 1 | 1.5;
  onToggleSpeed?: () => void;
  showMinimap?: boolean;
  minimapVisible?: boolean;
  onToggleMinimap?: () => void;
  onTaunt?: (id: TauntId) => void;
  onExitToMainMenu?: () => void;
  onExitToWarRoom?: () => void;

  // Daily Siege, Ranks & Archive Data
  dailySpec: SkirmishSpec;
  streak?: number;
  bestScore?: number | null;
  rank?: number | null;
  leaderboard?: LeaderboardRow[];
  community?: CommunityWarStats;
  aiModeLabel?: string;

  // Archive & Custom Skirmish Forge Callbacks
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
    return <EmpireIcon name="skull" size={12} />;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {Array.from({ length: clamped }, (_, idx) => (
        <EmpireIcon key={idx} name="crown" size={12} />
      ))}
    </span>
  );
}

function GearGlyph({ size = 16 }: { size?: number }) {
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
        stroke="#e2e8f0"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="rgba(255,255,255,0.12)"
      />
    </svg>
  );
}

const SETTINGS_CSS = `
@keyframes pe-settings-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pe-settings-rise {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.pe-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(8, 14, 22, 0.34);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: pe-settings-fade 0.16s ease-out;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #f8fafc;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}
.pe-settings-backdrop *, .pe-settings-backdrop *::before, .pe-settings-backdrop *::after {
  box-sizing: border-box;
}
.pe-settings-serif {
  font-family: 'Cinzel', 'Palatino Linotype', 'Book Antiqua', 'Georgia', serif;
  letter-spacing: 0.04em;
}
.pe-settings-tabular {
  font-variant-numeric: tabular-nums;
}
.pe-settings-drawer {
  width: min(95vw, 540px);
  max-height: calc(100dvh - 24px);
  display: flex;
  flex-direction: column;
  background: rgba(14, 20, 30, 0.60);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 20px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.54),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  overflow: hidden;
  animation: pe-settings-rise 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.pe-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 16px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.pe-settings-close {
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.07);
  color: #e2e8f0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
}
.pe-settings-close:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.32);
}
.pe-settings-close:active {
  transform: scale(0.95);
}
.pe-settings-tabs {
  display: flex;
  gap: 4px;
  margin: 10px 14px 0;
  padding: 3px;
  border-radius: 12px;
  background: rgba(8, 12, 18, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.pe-settings-tab {
  flex: 1;
  cursor: pointer;
  padding: 7px 8px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(226, 232, 240, 0.72);
  font-size: 11.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
  transition: all 0.14s ease;
}
.pe-settings-tab:hover {
  color: #ffffff;
}
.pe-settings-tab-active {
  background: rgba(245, 166, 35, 0.22);
  border-color: rgba(253, 224, 71, 0.45);
  color: #fef3c7;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
}
.pe-settings-body {
  padding: 12px 14px 15px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pe-glass-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.pe-glass-toggle-btn {
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(15, 23, 42, 0.55);
  color: #f1f5f9;
  font-size: 11.5px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.14s ease;
}
.pe-glass-toggle-btn:hover {
  border-color: rgba(253, 224, 71, 0.55);
  background: rgba(30, 41, 59, 0.72);
}
.pe-glass-toggle-on {
  background: rgba(245, 166, 35, 0.24);
  border-color: rgba(253, 224, 71, 0.55);
  color: #fde68a;
}
.pe-taunt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.pe-taunt-btn {
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  text-align: left;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
}
.pe-taunt-btn:hover {
  background: rgba(245, 166, 35, 0.16);
  border-color: rgba(253, 224, 71, 0.45);
}
.pe-taunt-btn:active {
  transform: translateY(1px);
}
.pe-glass-input {
  width: 100%;
  background: rgba(8, 12, 18, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 8px 11px;
  color: #f8fafc;
  font-size: 12.5px;
  outline: none;
  user-select: text;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}
.pe-glass-input::placeholder {
  color: rgba(203, 213, 225, 0.48);
}
.pe-glass-input:focus {
  border-color: rgba(251, 191, 36, 0.7);
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.18);
}
.pe-glass-action-btn {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 10px;
  border: 1px solid rgba(253, 224, 71, 0.48);
  background: rgba(245, 166, 35, 0.24);
  color: #fef3c7;
  font-weight: 800;
  font-size: 12px;
  padding: 7px 12px;
  white-space: nowrap;
  transition: filter 0.12s ease, background 0.12s ease, transform 0.08s ease;
}
.pe-glass-action-btn:hover:not(:disabled) {
  background: rgba(245, 166, 35, 0.36);
}
.pe-glass-action-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.pe-glass-action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.pe-preset-chip {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.12s ease;
}
.pe-preset-chip:hover {
  border-color: rgba(253, 224, 71, 0.5);
  color: #fef3c7;
  background: rgba(245, 166, 35, 0.16);
}
@media (max-width: 460px) {
  .pe-settings-tab {
    font-size: 10.5px;
    padding: 6px 5px;
    gap: 3px;
  }
}
`;

export function SettingsModal({
  open,
  onClose,
  initialTab = 'settings',
  inMatch,
  muted = false,
  onToggleMute,
  gameSpeed = 1,
  onToggleSpeed,
  showMinimap,
  minimapVisible,
  onToggleMinimap,
  onTaunt,
  onExitToMainMenu,
  onExitToWarRoom,
  dailySpec,
  streak = 0,
  bestScore = null,
  rank = null,
  leaderboard = [],
  community,
  aiModeLabel,
  onPlayCustomSpec,
  onCraftPrompt,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [wasOpen, setWasOpen] = useState(open);
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

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setActiveTab(initialTab);
    }
  }

  if (!open) return null;

  const isMinimapShown = showMinimap ?? minimapVisible ?? true;
  const exitHandler = onExitToMainMenu ?? onExitToWarRoom;
  const isInMatch = inMatch ?? Boolean(exitHandler);
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
      setCraftError('Could not parse that scroll. Try another skirmish prompt!');
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
    <div
      className="pe-settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Settings and War Room"
      onClick={onClose}
    >
      <style>{SETTINGS_CSS}</style>

      <div
        data-testid="settings-modal"
        className="pe-settings-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pe-settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
            <GearGlyph size={18} />
            <div style={{ minWidth: 0 }}>
              <div
                className="pe-settings-serif"
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  color: '#fef3c7',
                  lineHeight: 1.15,
                }}
              >
                Settings & War Room
              </div>
              <div
                className="pe-settings-tabular"
                style={{
                  fontSize: '11px',
                  color: 'rgba(226, 232, 240, 0.72)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Daily #{dailySpec.puzzleNumber} · {dailySpec.mapName}
                {streak > 0 ? ` · ${streak}d Streak` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="settings-close-btn"
            aria-label="Close Settings"
            className="pe-settings-close"
            onClick={onClose}
          >
            <EmpireIcon name="close" size={14} />
          </button>
        </div>

        {/* Segmented Sub-Tabs */}
        <div className="pe-settings-tabs" role="group" aria-label="Settings Sections">
          <button
            type="button"
            data-testid="settings-tab-general"
            aria-pressed={activeTab === 'settings'}
            className={`pe-settings-tab ${activeTab === 'settings' ? 'pe-settings-tab-active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <GearGlyph size={13} />
            <span>Settings</span>
          </button>

          <button
            type="button"
            data-testid="settings-tab-ranks"
            aria-pressed={activeTab === 'ranks'}
            className={`pe-settings-tab ${activeTab === 'ranks' ? 'pe-settings-tab-active' : ''}`}
            onClick={() => setActiveTab('ranks')}
          >
            <EmpireIcon name="trophy" size={13} />
            <span>War Room Ranks & Archive</span>
          </button>

          <button
            type="button"
            data-testid="settings-tab-forge"
            aria-pressed={activeTab === 'forge'}
            className={`pe-settings-tab ${activeTab === 'forge' ? 'pe-settings-tab-active' : ''}`}
            onClick={() => setActiveTab('forge')}
          >
            <EmpireIcon name="forge" size={13} />
            <span>Skirmish Forge</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="pe-settings-body">
          {activeTab === 'settings' && (
            <>
              {/* Quick Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="pe-glass-row">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700 }}>
                    <EmpireIcon name={muted ? 'mute' : 'speaker'} size={15} />
                    <span>Sound Effects & Horns</span>
                  </span>
                  <button
                    type="button"
                    data-testid="settings-toggle-sound"
                    aria-pressed={!muted}
                    className={`pe-glass-toggle-btn ${!muted ? 'pe-glass-toggle-on' : ''}`}
                    onClick={() => onToggleMute?.()}
                  >
                    <span>{muted ? 'Muted' : 'On'}</span>
                  </button>
                </div>

                <div className="pe-glass-row">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700 }}>
                    <EmpireIcon name="bolt" size={15} />
                    <span>Battle Speed</span>
                  </span>
                  <button
                    type="button"
                    data-testid="settings-toggle-speed"
                    aria-pressed={gameSpeed === 1.5}
                    className={`pe-glass-toggle-btn pe-settings-tabular ${gameSpeed === 1.5 ? 'pe-glass-toggle-on' : ''}`}
                    onClick={() => onToggleSpeed?.()}
                  >
                    <span>{gameSpeed === 1.5 ? '1.5×' : '1×'}</span>
                  </button>
                </div>

                <div className="pe-glass-row">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700 }}>
                    <EmpireIcon name="map" size={15} />
                    <span>Diamond Minimap</span>
                  </span>
                  <button
                    type="button"
                    data-testid="settings-toggle-minimap"
                    aria-pressed={isMinimapShown}
                    className={`pe-glass-toggle-btn ${isMinimapShown ? 'pe-glass-toggle-on' : ''}`}
                    onClick={() => onToggleMinimap?.()}
                  >
                    <span>{isMinimapShown ? 'Shown' : 'Hidden'}</span>
                  </button>
                </div>
              </div>

              {/* Classic AoE Taunts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(226, 232, 240, 0.68)',
                    padding: '2px 2px 0',
                  }}
                >
                  Classic Age Taunts
                </div>
                <div className="pe-taunt-grid">
                  {TAUNTS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`settings-taunt-${t.id}`}
                      className="pe-taunt-btn"
                      onClick={() => onTaunt?.(t.id)}
                    >
                      <span>
                        <strong style={{ color: '#fde68a', marginRight: '5px' }}>{t.code}</strong>
                        {t.label}
                      </span>
                      <EmpireIcon name="horn" size={13} style={{ opacity: 0.85 }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Compact Today's Decree & Matchup Info */}
              <div
                className="pe-settings-tabular"
                style={{
                  padding: '9px 12px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  fontSize: '11.5px',
                  color: 'rgba(226, 232, 240, 0.82)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#f8fafc' }}>
                    <CivCrest civ={dailySpec.playerCiv} size={14} />
                    <span>{playerCiv.name} vs</span>
                    <CivCrest civ={dailySpec.enemyCiv} size={14} />
                    <span>{dailySpec.aiLeaderName} ({enemyCiv.name})</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#fde68a', fontWeight: 800 }}>
                    <EmpireIcon name="hourglass" size={12} />
                    <span>Par {formatMmSs(dailySpec.parSec)}</span>
                  </span>
                </div>
                <div style={{ color: 'rgba(203, 213, 225, 0.78)' }}>
                  <strong style={{ color: '#fef3c7' }}>{biome.name} · {decree.name}:</strong> {decree.decree}
                </div>
                {(bestScore !== null || rank !== null || aiModeLabel) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '10.5px', color: 'rgba(203, 213, 225, 0.68)' }}>
                    {(rank !== null || bestScore !== null) && (
                      <span>
                        Best: {rank !== null ? `#${rank} ` : ''}
                        {bestScore !== null ? `${bestScore.toLocaleString()} pts` : ''}
                      </span>
                    )}
                    {aiModeLabel && <span>AI: {stripEmoji(aiModeLabel)}</span>}
                  </div>
                )}
              </div>

              {/* Exit to Main Menu (when in a match) */}
              {isInMatch && (
                <button
                  type="button"
                  data-testid="settings-exit-match-btn"
                  onClick={() => {
                    exitHandler?.();
                    onClose();
                  }}
                  style={{
                    cursor: 'pointer',
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(248, 113, 113, 0.45)',
                    background: 'rgba(185, 28, 28, 0.28)',
                    color: '#fee2e2',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                  }}
                >
                  <EmpireIcon name="retreat" size={15} />
                  <span>Exit to Main Menu</span>
                </button>
              )}
            </>
          )}

          {activeTab === 'ranks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {community && (
                <div
                  className="pe-settings-tabular"
                  style={{
                    padding: '7px 11px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.045)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px 10px',
                    fontSize: '11px',
                    color: 'rgba(226, 232, 240, 0.8)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <EmpireIcon name="swords" size={12} />
                    <span>
                      <strong style={{ color: '#f8fafc' }}>{community.totalPlays.toLocaleString()}</strong> besieged ·
                    </span>
                    <EmpireIcon name="wololo" size={12} />
                    <span>
                      <strong style={{ color: '#fde68a' }}>{community.totalWololos.toLocaleString()}</strong> Wololo’d
                    </span>
                  </span>
                  {community.topStrategy && (
                    <span>
                      Meta: <strong style={{ color: '#f8fafc' }}>{stripEmoji(community.topStrategy)}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Leaderboard */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {leaderboard.length === 0 ? (
                  <div
                    style={{
                      padding: '14px 12px',
                      textAlign: 'center',
                      color: 'rgba(203, 213, 225, 0.72)',
                      fontSize: '12px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderRadius: '11px',
                      border: '1px dashed rgba(255, 255, 255, 0.16)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <EmpireIcon name="keep" size={14} />
                    <span>No commanders on today’s leaderboard yet — claim #1!</span>
                  </div>
                ) : (
                  leaderboard.slice(0, 8).map((row, idx) => {
                    const pos = idx + 1;
                    const medalColor =
                      pos === 1 ? '#fde047' : pos === 2 ? '#e2e8f0' : pos === 3 ? '#fb923c' : '#94a3b8';
                    return (
                      <div
                        key={`${row.username}-${idx}`}
                        className="pe-settings-tabular"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '10px',
                          background:
                            pos === 1
                              ? 'rgba(245, 166, 35, 0.14)'
                              : 'rgba(255, 255, 255, 0.045)',
                          border:
                            pos === 1
                              ? '1px solid rgba(253, 224, 71, 0.38)'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 900, color: medalColor, minWidth: '22px' }}>
                            #{pos}
                          </span>
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            u/{stripEmoji(row.username)}
                          </span>
                          <span style={{ color: 'rgba(203, 213, 225, 0.78)' }}>
                            · {formatMmSs(row.timeSec)}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            · {renderCrowns(row.crowns)}
                          </span>
                          <span
                            style={{
                              fontSize: '10.5px',
                              padding: '1px 6px',
                              borderRadius: '999px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              color: '#e2e8f0',
                            }}
                          >
                            {stripEmoji(row.strategy)}
                          </span>
                        </div>
                        <span style={{ fontWeight: 800, color: '#fde68a', flexShrink: 0 }}>
                          {row.score.toLocaleString()}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Past 4 Daily Chronicles Practice Archive */}
              <div
                style={{
                  marginTop: '4px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: '#fde68a',
                    }}
                  >
                    <EmpireIcon name="scroll" size={12} />
                    <span>Past Daily Chronicles · Practice</span>
                  </span>
                  <span style={{ fontSize: '10.5px', color: 'rgba(203, 213, 225, 0.6)' }}>
                    Unranked
                  </span>
                </div>

                {pastSieges.map((pastSpec, idx) => {
                  const pCiv = CIVS[pastSpec.playerCiv];
                  const eCiv = CIVS[pastSpec.enemyCiv];
                  return (
                    <div
                      key={pastSpec.dateKey}
                      className="pe-settings-tabular"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '6px 9px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '11.5px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: '#fde68a' }}>
                          #{pastSpec.puzzleNumber}
                        </span>
                        <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                          {pastSpec.mapName}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'rgba(203, 213, 225, 0.78)' }}>
                          · <CivCrest civ={pastSpec.playerCiv} size={12} />
                          <span>{pCiv.name} vs</span>
                          <CivCrest civ={pastSpec.enemyCiv} size={12} />
                          <span>{eCiv.name}</span>
                        </span>
                      </div>

                      <button
                        type="button"
                        data-testid={`archive-play-${idx}`}
                        className="pe-glass-action-btn"
                        style={{ padding: '5px 10px', fontSize: '11px', flexShrink: 0 }}
                        onClick={() => {
                          onPlayCustomSpec({ ...pastSpec, isCustom: true });
                          onClose();
                        }}
                      >
                        <EmpireIcon name="swords" size={11} />
                        <span>Practice</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'forge' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleForgeSubmit(promptInput);
                }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input
                  type="text"
                  className="pe-glass-input"
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
                  className="pe-glass-action-btn"
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

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                {PRESET_PROMPTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="pe-preset-chip"
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
                    className="pe-glass-input pe-settings-tabular"
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
                    className="pe-glass-action-btn"
                    onClick={() => {
                      const decoded = tryDecodeChallengeInput(codeInput);
                      if (decoded) {
                        setCraftError(null);
                        setCrafted(decoded);
                      } else {
                        setCraftError('Invalid Challenge Code — expected PE-XXXXXX-XXXXXX.');
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
                    borderRadius: '10px',
                    background: 'rgba(220, 38, 38, 0.2)',
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

              {crafted && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: 'rgba(245, 166, 35, 0.11)',
                    border: '1px solid rgba(253, 224, 71, 0.4)',
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
                        className="pe-settings-serif"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '14px',
                          fontWeight: 800,
                          color: '#fef3c7',
                        }}
                      >
                        <EmpireIcon name="map" size={14} />
                        <span>{crafted.spec.mapName}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: 'rgba(226, 232, 240, 0.8)',
                          marginTop: '2px',
                        }}
                      >
                        <span>{BIOMES[crafted.spec.biome].name} ·</span>
                        <CivCrest civ={crafted.spec.playerCiv} size={13} />
                        <span>{CIVS[crafted.spec.playerCiv].name} vs</span>
                        <CivCrest civ={crafted.spec.enemyCiv} size={13} />
                        <span>{crafted.spec.aiLeaderName}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="pe-preset-chip pe-settings-tabular"
                      onClick={() => void handleCopyShareCode(crafted.shareCode)}
                      title="Copy Share Code"
                    >
                      {copiedCode ? (
                        <>
                          <EmpireIcon name="check" size={11} />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <EmpireIcon name="copy" size={11} />
                          <span>{crafted.shareCode}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div style={{ fontSize: '11.5px', color: '#f1f5f9', fontStyle: 'italic' }}>
                    “{stripEmoji(crafted.flavorSummary)}”
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onPlayCustomSpec(crafted.spec);
                      onClose();
                    }}
                    style={{
                      cursor: 'pointer',
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '11px',
                      border: '1px solid rgba(254, 240, 138, 0.65)',
                      background:
                        'linear-gradient(135deg, rgba(245, 168, 36, 0.72) 0%, rgba(217, 119, 6, 0.62) 100%)',
                      color: '#fffbeb',
                      textShadow: '0 1px 2px rgba(20, 12, 4, 0.65)',
                      fontWeight: 900,
                      fontSize: '13px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                    }}
                  >
                    <EmpireIcon name="swords" size={15} />
                    <span>Launch Custom Siege</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
