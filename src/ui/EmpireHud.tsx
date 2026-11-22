import React, { useState } from 'react';
import {
  BUILDINGS,
  TAUNTS,
  UNITS,
  type BuildingKind,
  type GameMode,
  type Resources,
  type SkirmishSpec,
  type TauntId,
  type UnitKind,
} from '../types/rts.js';
import {
  canAfford,
  getEffectiveBuildingCost,
  getEffectiveUnitCost,
} from '../engine/sim.js';
import {
  EmpireIcon,
  stripEmoji,
  type EmpireIconName,
} from './EmpireIcons.js';

export interface HudSnapshot {
  resources: Resources;
  popCurrent: number;
  popCap: number;
  timeSec: number;
  parSec: number;
  idleVillagerCount: number;
  villagerCount: number;
  armyCount: number;
  monkCount: number;
  ownedBuildings: Partial<Record<BuildingKind, number>>;
  unitQueues: Partial<Record<UnitKind, number>>;
}

export interface EmpireHudProps {
  spec: SkirmishSpec;
  mode?: GameMode;
  raidTargetName?: string;
  snapshot: HudSnapshot;
  selectedUnitIds: number[];
  selectedBuildingId: number | null;
  placementKind: BuildingKind | null;
  whisper: { text: string; source: string; urgency: 'tip' | 'warn' | 'opportunity' } | null;
  muted: boolean;
  onToggleMute: () => void;
  onAskScout: () => void;
  onSelectSquad: (kind: 'idle_villager' | 'all_villagers' | 'all_army' | 'monks') => void;
  onSiegeEnemyKeep: () => void;
  onTrainUnit: (kind: UnitKind) => void;
  onSelectPlacement: (kind: BuildingKind | null) => void;
  onTaunt: (id: TauntId) => void;
  onExitToWarRoom: () => void;
  gameSpeed?: 1 | 1.5;
  onToggleSpeed?: () => void;
  onOpenSettings?: () => void;
  onPublishBase?: () => void;
  onDoneBaseBuilder?: () => void;
  publishStatus?: 'idle' | 'publishing' | 'published' | 'saved';
  basePublished?: boolean;
}

const TRAINABLE_UNITS: ReadonlyArray<{ kind: UnitKind; icon: EmpireIconName }> = [
  { kind: 'villager', icon: 'villager' },
  { kind: 'militia', icon: 'swords' },
  { kind: 'pikeman', icon: 'pikeman' },
  { kind: 'archer', icon: 'archer' },
  { kind: 'knight', icon: 'knight' },
  { kind: 'monk', icon: 'monk' },
];

type BuildCardVisual =
  | { type: 'empire'; icon: EmpireIconName }
  | { type: 'custom'; custom: 'farm' | 'stone_wall' };

const BUILDABLE_STRUCTURES: ReadonlyArray<{
  kind: BuildingKind;
  visual: BuildCardVisual;
}> = [
  { kind: 'homestead', visual: { type: 'empire', icon: 'camp' } },
  { kind: 'farm', visual: { type: 'custom', custom: 'farm' } },
  { kind: 'stone_wall', visual: { type: 'custom', custom: 'stone_wall' } },
  { kind: 'barracks', visual: { type: 'empire', icon: 'barracks' } },
  { kind: 'archery_range', visual: { type: 'empire', icon: 'range' } },
  { kind: 'stable', visual: { type: 'empire', icon: 'stable' } },
  { kind: 'monastery', visual: { type: 'empire', icon: 'monastery' } },
  { kind: 'watchtower', visual: { type: 'empire', icon: 'tower' } },
];

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = String(s % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function BuildCustomSvg({
  kind,
  size = 18,
}: {
  kind: 'farm' | 'stone_wall';
  size?: number;
}) {
  if (kind === 'farm') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))' }}
      >
        {/* Sunlit tilled wheat plot & golden sheaf */}
        <polygon
          points="12,12.8 21,17.2 12,21.4 3,17.2"
          fill="#92400e"
          stroke="#140f0a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <line x1="7" y1="15.4" x2="15" y2="19.2" stroke="#d97706" strokeWidth="1.1" />
        <line x1="9.5" y1="14.2" x2="17.5" y2="18" stroke="#f59e0b" strokeWidth="1.1" />
        <path
          d="M12 16.5V4.2M9.2 15.8C9.2 11.5 7.4 8.2 6.2 6.4M14.8 15.8C14.8 11.5 16.6 8.2 17.8 6.4"
          stroke="#fbbf24"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <ellipse cx="12" cy="4.8" rx="1.7" ry="2.6" fill="#fde047" stroke="#140f0a" strokeWidth="0.9" />
        <ellipse
          cx="7.2"
          cy="7.2"
          rx="1.5"
          ry="2.3"
          transform="rotate(-24 7.2 7.2)"
          fill="#facc15"
          stroke="#140f0a"
          strokeWidth="0.9"
        />
        <ellipse
          cx="16.8"
          cy="7.2"
          rx="1.5"
          ry="2.3"
          transform="rotate(24 16.8 7.2)"
          fill="#facc15"
          stroke="#140f0a"
          strokeWidth="0.9"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))' }}
    >
      {/* Crenelated ashlar stone fortification wall */}
      <path
        d="M3 19.5V8H6.5V10.4H9.8V8H14.2V10.4H17.5V8H21V19.5H3Z"
        fill="#94a3b8"
        stroke="#140f0a"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M3.8 18.7V8.8H5.8V11.2H10.5V8.8H12V18.7H3.8Z" fill="#cbd5e1" />
      <line x1="3.6" y1="14" x2="20.4" y2="14" stroke="#334155" strokeWidth="1.15" />
      <line x1="9" y1="14" x2="9" y2="19" stroke="#334155" strokeWidth="1.15" />
      <line x1="15" y1="10.8" x2="15" y2="14" stroke="#334155" strokeWidth="1.15" />
    </svg>
  );
}

function GearSvg({ size = 15 }: { size?: number }) {
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
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="rgba(255,255,255,0.12)"
      />
    </svg>
  );
}

function PublishSvg({ size = 13 }: { size?: number }) {
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
        d="M12 16V4M12 4L7.5 8.5M12 4L16.5 8.5M4.5 16.5V19.5H19.5V16.5"
        stroke="#ecfdf5"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const HUD_CSS = `
@keyframes pe-idle-amber-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(245, 166, 35, 0.45);
    border-color: rgba(251, 191, 36, 0.72);
  }
  50% {
    box-shadow: 0 0 10px 1px rgba(245, 166, 35, 0.35);
    border-color: #fde047;
  }
}
.pe-hud-root {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #f8fafc;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}
.pe-hud-root *, .pe-hud-root *::before, .pe-hud-root *::after {
  box-sizing: border-box;
}
.pe-hud-tabular {
  font-variant-numeric: tabular-nums;
}
.pe-hud-top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 8px 0;
  width: 100%;
}
.pe-top-ledger {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(14, 18, 26, 0.46);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.pe-res-strip {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.pe-res-pill {
  display: inline-flex;
  align-items: center;
  gap: 2.5px;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  color: #f8fafc;
}
.pe-res-pill svg {
  width: 11.5px;
  height: 11.5px;
}
.pe-speed-btn {
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2.5px 5.5px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
}
.pe-speed-btn:hover {
  border-color: rgba(253, 224, 71, 0.6);
  background: rgba(255, 255, 255, 0.14);
}
.pe-speed-btn:active {
  transform: scale(0.96);
}
.pe-speed-btn-fast {
  border-color: rgba(253, 224, 71, 0.65);
  background: rgba(245, 166, 35, 0.28);
  color: #fde68a;
}
.pe-top-right-cluster {
  pointer-events: auto;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.pe-glass-ctrl-btn {
  cursor: pointer;
  height: 30px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(14, 18, 26, 0.46);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #f8fafc;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
}
.pe-glass-ctrl-btn:hover {
  background: rgba(24, 32, 46, 0.64);
  border-color: rgba(253, 224, 71, 0.5);
}
.pe-glass-ctrl-btn:active {
  transform: scale(0.96);
}
.pe-glass-icon-circle {
  width: 30px;
  padding: 0;
}
.pe-emerald-publish-btn {
  cursor: pointer;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(167, 243, 208, 0.72);
  color: #ecfdf5;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  box-shadow:
    0 6px 20px rgba(16, 185, 129, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.32);
  transition: filter 0.12s ease, transform 0.08s ease;
}
.pe-emerald-publish-btn:hover {
  filter: brightness(1.08);
}
.pe-emerald-publish-btn:active {
  transform: scale(0.97);
}
@media (max-width: 520px) {
  .pe-res-time-builder {
    display: none;
  }
  .pe-hud-top-row {
    padding: 6px 6px 0;
    gap: 4px;
  }
  .pe-top-ledger {
    padding: 4px 6px;
  }
  .pe-res-strip {
    gap: 4px;
  }
  .pe-emerald-publish-btn {
    padding: 0 8px;
    font-size: 10.5px;
  }
  .pe-glass-ctrl-btn {
    padding: 0 6.5px;
    font-size: 10.5px;
    height: 28px;
  }
  .pe-glass-icon-circle {
    width: 28px;
    padding: 0;
  }
}
@media (min-width: 680px) {
  .pe-hud-top-row {
    padding: 10px 12px 0;
  }
  .pe-top-ledger {
    padding: 5px 11px;
  }
  .pe-res-strip {
    gap: 9px;
  }
  .pe-res-pill {
    font-size: 12px;
    gap: 4px;
  }
  .pe-res-pill svg {
    width: 14px;
    height: 14px;
  }
  .pe-speed-btn {
    padding: 3px 7px;
    font-size: 11px;
  }
  .pe-glass-ctrl-btn {
    height: 32px;
    padding: 0 10px;
    font-size: 11.5px;
  }
  .pe-glass-icon-circle {
    width: 32px;
    padding: 0;
  }
  .pe-emerald-publish-btn {
    height: 32px;
    padding: 0 12px;
    font-size: 11.5px;
  }
}
.pe-whisper-pill {
  pointer-events: auto;
  margin: 5px 0 0 8px;
  max-width: min(330px, calc(100vw - 156px));
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(14, 18, 26, 0.44);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(248, 250, 252, 0.92);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.25;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
}
.pe-dock-floating {
  pointer-events: auto;
  width: min(96vw, 620px);
  max-width: min(96vw, 620px);
  margin: 0 auto calc(8px + env(safe-area-inset-bottom, 0px));
  padding: 6px 8px;
  border-radius: 18px;
  background: rgba(14, 18, 26, 0.46);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pe-dock-micro-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
}
.pe-squad-strip {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-width: 0;
}
.pe-squad-strip::-webkit-scrollbar {
  display: none;
}
.pe-micro-pill {
  cursor: pointer;
  flex-shrink: 0;
  height: 23px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.07);
  color: #f1f5f9;
  font-size: 10.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  white-space: nowrap;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
}
.pe-micro-pill:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(253, 224, 71, 0.45);
}
.pe-micro-pill:active {
  transform: scale(0.97);
}
.pe-micro-pill-idle {
  background: rgba(245, 166, 35, 0.24);
  color: #fef3c7;
  animation: pe-idle-amber-pulse 1.6s infinite ease-in-out;
}
.pe-micro-pill-siege {
  background: rgba(220, 38, 38, 0.55);
  border-color: rgba(252, 165, 165, 0.6);
  color: #fef2f2;
}
.pe-mode-switch {
  display: inline-flex;
  padding: 2px;
  border-radius: 999px;
  background: rgba(8, 12, 18, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.14);
  gap: 2px;
  flex-shrink: 0;
}
.pe-mode-btn {
  cursor: pointer;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(226, 232, 240, 0.72);
  font-size: 10.5px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  transition: all 0.12s ease;
}
.pe-mode-btn-active {
  background: rgba(245, 166, 35, 0.28);
  border-color: rgba(253, 224, 71, 0.55);
  color: #fef3c7;
}
.pe-cards-row {
  display: flex;
  align-items: stretch;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.pe-cards-row::-webkit-scrollbar {
  display: none;
}
.pe-command-card {
  position: relative;
  flex: 1 0 42px;
  cursor: pointer;
  min-height: 48px;
  padding: 4px 2px 3px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 1.5px;
  transition: transform 0.08s ease, border-color 0.12s ease, background 0.12s ease;
}
.pe-command-card:hover:not(:disabled) {
  border-color: rgba(253, 224, 71, 0.55);
  background: rgba(255, 255, 255, 0.12);
}
.pe-command-card:active:not(:disabled) {
  transform: translateY(1px);
}
.pe-command-card-active {
  border-color: #fde047;
  background: rgba(245, 166, 35, 0.28);
  box-shadow: 0 0 12px rgba(245, 166, 35, 0.28);
}
.pe-command-card-locked {
  opacity: 0.52;
  background: rgba(15, 20, 28, 0.32);
}
@media (max-width: 460px) {
  .pe-cards-row {
    gap: 3px;
  }
  .pe-command-card {
    flex: 1 0 40px;
    min-height: 46px;
    border-radius: 10px;
    padding: 3px 1.5px;
  }
}
`;

function CostInline({
  cost,
  have,
}: {
  cost: Resources;
  have: Resources;
}) {
  const parts: Array<{ key: string; icon: EmpireIconName; val: number; ok: boolean }> = [];
  if (cost.wood > 0) {
    parts.push({ key: 'w', icon: 'wood', val: cost.wood, ok: have.wood >= cost.wood });
  }
  if (cost.food > 0) {
    parts.push({ key: 'f', icon: 'food', val: cost.food, ok: have.food >= cost.food });
  }
  if (cost.gold > 0) {
    parts.push({ key: 'g', icon: 'gold', val: cost.gold, ok: have.gold >= cost.gold });
  }

  return (
    <span
      className="pe-hud-tabular"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2.5px',
        fontSize: '9px',
        fontWeight: 800,
        lineHeight: 1,
        flexWrap: 'nowrap',
      }}
    >
      {parts.map((p) => (
        <span
          key={p.key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '1px',
            color: p.ok ? 'rgba(241, 245, 249, 0.88)' : '#fca5a5',
            whiteSpace: 'nowrap',
          }}
        >
          <EmpireIcon name={p.icon} size={9} />
          <span>{p.val}</span>
        </span>
      ))}
    </span>
  );
}

export function EmpireHud({
  spec,
  mode = 'skirmish',
  raidTargetName,
  snapshot,
  selectedUnitIds: _selectedUnitIds,
  selectedBuildingId: _selectedBuildingId,
  placementKind,
  whisper,
  muted,
  onToggleMute,
  onAskScout,
  onSelectSquad,
  onSiegeEnemyKeep,
  onTrainUnit,
  onSelectPlacement,
  onTaunt,
  onExitToWarRoom,
  gameSpeed = 1,
  onToggleSpeed,
  onOpenSettings,
  onPublishBase,
  onDoneBaseBuilder,
  publishStatus = 'idle',
  basePublished = false,
}: EmpireHudProps) {
  const [preferredDockMode, setPreferredDockMode] = useState<'train' | 'build'>(
    mode === 'base_builder' ? 'build' : 'train',
  );
  const [lastMode, setLastMode] = useState<GameMode>(mode);
  const [tauntOpen, setTauntOpen] = useState(false);
  const [fallbackSettingsOpen, setFallbackSettingsOpen] = useState(false);

  if (mode !== lastMode) {
    setLastMode(mode);
    setPreferredDockMode(mode === 'base_builder' ? 'build' : 'train');
  }

  const dockMode: 'train' | 'build' = placementKind !== null ? 'build' : preferredDockMode;
  const isBaseBuilder = mode === 'base_builder';

  const done1 = snapshot.idleVillagerCount === 0;
  const done2 =
    (snapshot.ownedBuildings.barracks ?? 0) +
      (snapshot.ownedBuildings.archery_range ?? 0) +
      (snapshot.ownedBuildings.stable ?? 0) +
      (snapshot.ownedBuildings.monastery ?? 0) >
    0;
  const done3 = snapshot.armyCount >= 3;
  const showOnboarding = !isBaseBuilder && !(done1 && done2 && done3);

  const activeOnboardingText = !done1
    ? '1/3 Task Idle Villager'
    : !done2
      ? '2/3 Build Military Camp'
      : '3/3 Muster 3+ Troops';

  const onPar = Math.floor(snapshot.timeSec) <= snapshot.parSec;
  const popCapped = snapshot.popCurrent >= snapshot.popCap;

  const whisperIconName: EmpireIconName =
    whisper?.urgency === 'warn'
      ? 'alert'
      : whisper?.urgency === 'opportunity'
        ? 'wololo'
        : 'scroll';

  const isPublished =
    basePublished || publishStatus === 'published' || publishStatus === 'saved';

  const handleSettingsPress = () => {
    setTauntOpen(false);
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      setFallbackSettingsOpen((prev) => !prev);
    }
  };

  return (
    <div className="pe-hud-root">
      <style>{HUD_CSS}</style>

      {/* TOP ZONE: Floating Resource Pill (Left) + Floating Action Cluster (Right) */}
      <div>
        <div className="pe-hud-top-row">
          {/* Top-Left Floating Glass Pill */}
          <header
            data-testid="hud-resource-ledger"
            className="pe-top-ledger pe-hud-tabular"
          >
            <div className="pe-res-strip">
              <div className="pe-res-pill" title="Wood">
                <EmpireIcon name="wood" size={13} />
                <span>{Math.floor(snapshot.resources.wood)}</span>
              </div>

              <div className="pe-res-pill" title="Food">
                <EmpireIcon name="food" size={13} />
                <span>{Math.floor(snapshot.resources.food)}</span>
              </div>

              <div className="pe-res-pill" title="Gold">
                <EmpireIcon name="gold" size={13} />
                <span style={{ color: '#fde68a' }}>{Math.floor(snapshot.resources.gold)}</span>
              </div>

              <div
                className="pe-res-pill"
                title="Population"
                style={{ color: popCapped ? '#fca5a5' : '#f8fafc' }}
              >
                <EmpireIcon name="keep" size={13} />
                <span>
                  {snapshot.popCurrent}/{snapshot.popCap}
                </span>
              </div>

              <div
                className={`pe-res-pill ${isBaseBuilder ? 'pe-res-time-builder' : ''}`}
                title={`3-Crown Par: ${formatMmSs(snapshot.parSec)}`}
                style={{ color: onPar ? '#fde68a' : '#e2e8f0' }}
              >
                <EmpireIcon name="hourglass" size={12} />
                <span>{formatMmSs(snapshot.timeSec)}</span>
              </div>

              <button
                type="button"
                data-testid="hud-speed-toggle"
                className={`pe-speed-btn pe-hud-tabular ${
                  gameSpeed === 1.5 ? 'pe-speed-btn-fast' : ''
                }`}
                title="Toggle Battle Speed (1× / 1.5×)"
                aria-label={`Battle Speed ${gameSpeed}x`}
                aria-pressed={gameSpeed === 1.5}
                onClick={() => onToggleSpeed?.()}
              >
                <EmpireIcon name="bolt" size={11} />
                <span>{gameSpeed === 1.5 ? '1.5×' : '1×'}</span>
              </button>
            </div>
          </header>

          {/* Top-Right Floating Controls */}
          <div className="pe-top-right-cluster">
            {isBaseBuilder ? (
              <>
                <button
                  type="button"
                  data-testid="hud-publish-base-btn"
                  className="pe-emerald-publish-btn"
                  onClick={() => onPublishBase?.()}
                >
                  {isPublished ? (
                    <>
                      <EmpireIcon name="check" size={12} />
                      <span>Published!</span>
                    </>
                  ) : (
                    <>
                      <PublishSvg size={12} />
                      <span>Publish Base</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="hud-base-done-btn"
                  className="pe-glass-ctrl-btn"
                  onClick={() => (onDoneBaseBuilder ?? onExitToWarRoom)()}
                >
                  <span>Done</span>
                </button>

                <button
                  type="button"
                  data-testid="hud-settings-btn"
                  aria-label="Settings"
                  title="Settings"
                  className="pe-glass-ctrl-btn pe-glass-icon-circle"
                  onClick={handleSettingsPress}
                >
                  <GearSvg size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="hud-scout-btn"
                  aria-label="Scout"
                  title="Ask Royal Scout Advisor"
                  className="pe-glass-ctrl-btn"
                  onClick={onAskScout}
                >
                  <EmpireIcon name="scout" size={13} />
                  <span>Scout</span>
                </button>

                <button
                  type="button"
                  data-testid="hud-taunt-btn"
                  aria-label="Taunts"
                  title="Sound War Horn Taunt"
                  aria-expanded={tauntOpen}
                  className="pe-glass-ctrl-btn pe-glass-icon-circle"
                  style={
                    tauntOpen
                      ? {
                          borderColor: 'rgba(253, 224, 71, 0.65)',
                          background: 'rgba(245, 166, 35, 0.25)',
                        }
                      : undefined
                  }
                  onClick={() => {
                    setFallbackSettingsOpen(false);
                    setTauntOpen((prev) => !prev);
                  }}
                >
                  <EmpireIcon name="horn" size={14} />
                </button>

                <button
                  type="button"
                  data-testid="hud-settings-btn"
                  aria-label="Settings"
                  title="Settings"
                  className="pe-glass-ctrl-btn pe-glass-icon-circle"
                  onClick={handleSettingsPress}
                >
                  <GearSvg size={15} />
                </button>
              </>
            )}

            {/* Frosted Glass Taunt Popover */}
            {tauntOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  minWidth: '156px',
                  padding: '5px',
                  borderRadius: '14px',
                  background: 'rgba(14, 18, 26, 0.78)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.55)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  zIndex: 55,
                }}
              >
                {TAUNTS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onTaunt(t.id);
                      setTauntOpen(false);
                    }}
                    style={{
                      cursor: 'pointer',
                      padding: '6px 9px',
                      borderRadius: '9px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#f8fafc',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      textAlign: 'left',
                    }}
                  >
                    <span>
                      <strong style={{ color: '#fde68a' }}>{t.code}</strong> {t.label}
                    </span>
                    <EmpireIcon name="horn" size={12} style={{ opacity: 0.85 }} />
                  </button>
                ))}
              </div>
            )}

            {/* Standalone Quick-Settings Popover when caller has not wired onOpenSettings */}
            {!onOpenSettings && fallbackSettingsOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  minWidth: '168px',
                  padding: '6px',
                  borderRadius: '14px',
                  background: 'rgba(14, 18, 26, 0.8)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.55)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  zIndex: 55,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onToggleMute();
                    setFallbackSettingsOpen(false);
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '7px 9px',
                    borderRadius: '9px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#f8fafc',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                  }}
                >
                  <EmpireIcon name={muted ? 'mute' : 'speaker'} size={13} />
                  <span>{muted ? 'Unmute Sound' : 'Mute Sound'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFallbackSettingsOpen(false);
                    onExitToWarRoom();
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '7px 9px',
                    borderRadius: '9px',
                    border: '1px solid rgba(248, 113, 113, 0.38)',
                    background: 'rgba(185, 28, 28, 0.28)',
                    color: '#fee2e2',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                  }}
                >
                  <EmpireIcon name="retreat" size={13} />
                  <span>Exit to Main Menu</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Slim Top-Left Whisper / Mode / Onboarding Micro-Pills (strictly clear of right minimap) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          {whisper && (
            <div data-testid="hud-whisper-pill" className="pe-whisper-pill">
              <EmpireIcon name={whisperIconName} size={12} />
              <span
                style={{
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {stripEmoji(whisper.text)}
              </span>
            </div>
          )}

          {mode === 'raid' && raidTargetName && !whisper && (
            <div className="pe-whisper-pill">
              <EmpireIcon name="swords" size={12} />
              <span>Raiding u/{stripEmoji(raidTargetName)}</span>
            </div>
          )}

          {showOnboarding && (
            <div data-testid="hud-onboarding-steps" className="pe-whisper-pill">
              <EmpireIcon name={!done1 ? 'villager' : !done2 ? 'barracks' : 'swords'} size={11} />
              <span>{activeOnboardingText}</span>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM-CENTER FLOATING GLASS PILL DOCK */}
      <footer data-testid="hud-bottom-dock" className="pe-dock-floating">
        {/* Slim Top Row of Micro-Pills */}
        <div className="pe-dock-micro-row">
          <div className="pe-squad-strip">
            <button
              type="button"
              className={`pe-micro-pill pe-hud-tabular ${
                snapshot.idleVillagerCount > 0 ? 'pe-micro-pill-idle' : ''
              }`}
              onClick={() => onSelectSquad('idle_villager')}
            >
              <EmpireIcon name="villager" size={11} />
              <span>Idle ({snapshot.idleVillagerCount})</span>
            </button>

            <button
              type="button"
              className="pe-micro-pill pe-hud-tabular"
              onClick={() => onSelectSquad('all_army')}
            >
              <EmpireIcon name="swords" size={11} />
              <span>Army ({snapshot.armyCount})</span>
            </button>

            {snapshot.monkCount > 0 && (
              <button
                type="button"
                className="pe-micro-pill pe-hud-tabular"
                style={{ borderColor: 'rgba(192, 132, 252, 0.55)', color: '#f3e8ff' }}
                onClick={() => onSelectSquad('monks')}
              >
                <EmpireIcon name="monk" size={11} />
                <span>Monks ({snapshot.monkCount})</span>
              </button>
            )}

            {!isBaseBuilder && (
              <button
                type="button"
                className="pe-micro-pill pe-micro-pill-siege"
                onClick={onSiegeEnemyKeep}
              >
                <EmpireIcon name="target" size={11} />
                <span>Siege Keep!</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {placementKind !== null && (
              <button
                type="button"
                className="pe-micro-pill"
                style={{
                  background: 'rgba(185, 28, 28, 0.52)',
                  borderColor: 'rgba(252, 165, 165, 0.6)',
                  color: '#fee2e2',
                }}
                onClick={() => onSelectPlacement(null)}
              >
                <EmpireIcon name="close" size={10} />
                <span>Cancel</span>
              </button>
            )}

            <div className="pe-mode-switch" role="group" aria-label="Command Mode">
              <button
                type="button"
                aria-pressed={dockMode === 'train'}
                className={`pe-mode-btn ${dockMode === 'train' ? 'pe-mode-btn-active' : ''}`}
                onClick={() => {
                  if (placementKind !== null) onSelectPlacement(null);
                  setPreferredDockMode('train');
                }}
              >
                <EmpireIcon name="swords" size={11} />
                <span>Train</span>
              </button>
              <button
                type="button"
                aria-pressed={dockMode === 'build'}
                className={`pe-mode-btn ${dockMode === 'build' ? 'pe-mode-btn-active' : ''}`}
                onClick={() => setPreferredDockMode('build')}
              >
                <EmpireIcon name="hammer" size={11} />
                <span>Build</span>
              </button>
            </div>
          </div>
        </div>

        {/* Compact Icon-Forward Horizontal Row (Train OR Build) */}
        {dockMode === 'train' ? (
          <div className="pe-cards-row">
            {TRAINABLE_UNITS.map(({ kind, icon }) => {
              const unitSpec = UNITS[kind];
              const reqBuilding = unitSpec.trainedAt;
              const hasPrereq = (snapshot.ownedBuildings[reqBuilding] ?? 0) > 0;
              const cost = getEffectiveUnitCost(spec, 'player', kind);
              const affordable = canAfford(snapshot.resources, cost);
              const queued = snapshot.unitQueues[kind] ?? 0;
              const disabled = !hasPrereq || !affordable || popCapped;

              return (
                <button
                  key={kind}
                  type="button"
                  data-testid={`hud-train-${kind}`}
                  className={`pe-command-card ${!hasPrereq ? 'pe-command-card-locked' : ''}`}
                  title={`${unitSpec.name} — ${unitSpec.description}`}
                  disabled={disabled}
                  onClick={() => onTrainUnit(kind)}
                >
                  {queued > 0 && (
                    <span
                      className="pe-hud-tabular"
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '3px',
                        padding: '0.5px 3.5px',
                        borderRadius: '999px',
                        background: '#f5b942',
                        color: '#17120c',
                        fontSize: '8.5px',
                        fontWeight: 900,
                        lineHeight: 1.15,
                      }}
                    >
                      ×{queued}
                    </span>
                  )}

                  <EmpireIcon name={icon} size={18} />

                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 800,
                      color: hasPrereq ? '#f8fafc' : 'rgba(203, 213, 225, 0.65)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    {unitSpec.shortName}
                  </span>

                  {!hasPrereq ? (
                    <span
                      style={{
                        fontSize: '8px',
                        fontWeight: 700,
                        color: '#fde68a',
                        whiteSpace: 'nowrap',
                        lineHeight: 1,
                      }}
                    >
                      {BUILDINGS[reqBuilding].shortName}
                    </span>
                  ) : popCapped ? (
                    <span
                      style={{
                        fontSize: '8.5px',
                        fontWeight: 800,
                        color: '#fca5a5',
                        lineHeight: 1,
                      }}
                    >
                      Full
                    </span>
                  ) : (
                    <CostInline cost={cost} have={snapshot.resources} />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="pe-cards-row">
            {BUILDABLE_STRUCTURES.map(({ kind, visual }) => {
              const bSpec = BUILDINGS[kind];
              const cost = getEffectiveBuildingCost(spec, 'player', kind);
              const affordable = canAfford(snapshot.resources, cost);
              const isPlacing = placementKind === kind;
              const builtCount = snapshot.ownedBuildings[kind] ?? 0;

              return (
                <button
                  key={kind}
                  type="button"
                  data-testid={`hud-build-${kind}`}
                  className={`pe-command-card ${isPlacing ? 'pe-command-card-active' : ''} ${
                    !affordable && !isPlacing ? 'pe-command-card-locked' : ''
                  }`}
                  title={`${bSpec.name} [${bSpec.hotkey}] — ${bSpec.description}`}
                  onClick={() => onSelectPlacement(isPlacing ? null : kind)}
                >
                  {builtCount > 0 && (
                    <span
                      className="pe-hud-tabular"
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '3px',
                        fontSize: '8.5px',
                        fontWeight: 800,
                        color: 'rgba(226, 232, 240, 0.72)',
                      }}
                    >
                      {builtCount}
                    </span>
                  )}

                  {visual.type === 'empire' ? (
                    <EmpireIcon name={visual.icon} size={17} />
                  ) : (
                    <BuildCustomSvg kind={visual.custom} size={17} />
                  )}

                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      color: isPlacing ? '#fde68a' : '#f8fafc',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    {isPlacing ? 'Tap Tile…' : bSpec.shortName}
                  </span>

                  <CostInline cost={cost} have={snapshot.resources} />
                </button>
              );
            })}
          </div>
        )}
      </footer>
    </div>
  );
}

export default EmpireHud;
