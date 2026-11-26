import React, { useState } from 'react';
import {
  BUILDINGS,
  CASTLE_AGE_COST,
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

export interface SelectedBuildingInspector {
  id: number;
  kind: BuildingKind;
  hp: number;
  maxHp: number;
  built: boolean;
  queue: UnitKind[];
  trainProgressPct: number;
}

export interface SelectedUnitGroupInspector {
  kind: UnitKind;
  count: number;
  totalHp: number;
  maxHp: number;
}

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
  playerAge?: 1 | 2;
  raidDestructionPct?: number;
  tamedHorses?: number;
  relicsPlayer?: number;
  relicsTotal?: number;
  townBellActive?: boolean;
  townBellSec?: number;
  ghostBreach?: { username: string; timeSec: number; tileX: number; tileY: number } | null;
  selectedBuilding?: SelectedBuildingInspector | null;
  selectedUnitGroups?: ReadonlyArray<SelectedUnitGroupInspector>;
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
  gameSpeed?: 1 | 1.5 | 2;
  onToggleSpeed?: () => void;
  onOpenSettings?: () => void;
  onPublishBase?: () => void;
  onDoneBaseBuilder?: () => void;
  publishStatus?: 'idle' | 'publishing' | 'published' | 'saved';
  basePublished?: boolean;
  onAdvanceAge?: () => void;
  demolishMode?: boolean;
  onToggleDemolish?: () => void;
  empireName?: string;
  onChangeEmpireName?: (name: string) => void;
  rallyMode?: boolean;
  onToggleRally?: () => void;
  onCancelQueueItem?: (buildingId: number, queueIndex: number) => void;
  onRingTownBell?: () => void;
  onFocusKeep?: () => void;
  onFocusGhostBreach?: () => void;
  onFilterSelectedKind?: (kind: UnitKind) => void;
}

type TrainCardVisual =
  | { type: 'empire'; icon: EmpireIconName }
  | { type: 'trebuchet' };

const TRAINABLE_UNITS: ReadonlyArray<{ kind: UnitKind; visual: TrainCardVisual }> = [
  { kind: 'villager', visual: { type: 'empire', icon: 'villager' } },
  { kind: 'militia', visual: { type: 'empire', icon: 'swords' } },
  { kind: 'pikeman', visual: { type: 'empire', icon: 'pikeman' } },
  { kind: 'archer', visual: { type: 'empire', icon: 'archer' } },
  { kind: 'knight', visual: { type: 'empire', icon: 'knight' } },
  { kind: 'monk', visual: { type: 'empire', icon: 'monk' } },
  { kind: 'trebuchet', visual: { type: 'trebuchet' } },
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

function TrebuchetSvg({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))' }}
    >
      {/* Heavy oak base sill */}
      <rect
        x="2.6"
        y="18.6"
        width="18.8"
        height="2.4"
        rx="0.8"
        fill="#78350f"
        stroke="#140f0a"
        strokeWidth="1.2"
      />
      {/* Diagonal throwing arm */}
      <line
        x1="4.5"
        y1="6.4"
        x2="19.6"
        y2="14.2"
        stroke="#140f0a"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <line
        x1="4.5"
        y1="6.4"
        x2="19.6"
        y2="14.2"
        stroke="#fbbf24"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Sling & boulder */}
      <path d="M4.5 6.4L2.8 11.4" stroke="#e2e8f0" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="2.9" cy="12.6" r="2.1" fill="#cbd5e1" stroke="#140f0a" strokeWidth="1.1" />
      {/* Counterweight chest */}
      <path
        d="M17.2 13.8H21.2L20.6 18H17.8L17.2 13.8Z"
        fill="#d97706"
        stroke="#140f0a"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      {/* A-frame timber trestle & brass axle */}
      <path
        d="M7.2 18.8L12.2 8.8L16.4 18.8"
        stroke="#b45309"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12.2" cy="9.9" r="1.6" fill="#fde047" stroke="#140f0a" strokeWidth="1" />
    </svg>
  );
}

function CastleAgeSvg({ size = 13, unlocked = false }: { size?: number; unlocked?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))' }}
    >
      {/* Imperial Castle Keep */}
      <path
        d="M4.2 20.5V10.5H6.8V12.2H9.4V10.5H14.6V12.2H17.2V10.5H19.8V20.5H4.2Z"
        fill={unlocked ? '#f5b942' : '#cbd5e1'}
        stroke="#140f0a"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      {/* Royal Crown Spire */}
      <path
        d="M6.6 8.8L5.8 3.8L9.6 6.4L12 2.6L14.4 6.4L18.2 3.8L17.4 8.8H6.6Z"
        fill="#fde047"
        stroke="#140f0a"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M10 20.5V15.8C10 14.6 10.9 13.8 12 13.8C13.1 13.8 14 14.6 14 15.8V20.5"
        fill="#1e293b"
        stroke="#fde68a"
        strokeWidth="0.9"
      />
    </svg>
  );
}

function DemolishSvg({ size = 12, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Oak handle */}
      <line
        x1="5"
        y1="19.5"
        x2="15.2"
        y2="9.3"
        stroke="#fbbf24"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Heavy iron maul head */}
      <rect
        x="11.8"
        y="4.2"
        width="8.2"
        height="5"
        rx="1.1"
        transform="rotate(45 15.9 6.7)"
        fill={active ? '#fca5a5' : '#e2e8f0'}
        stroke="#140f0a"
        strokeWidth="1.3"
      />
      {/* Impact sparks */}
      <path
        d="M18.5 14.5L21 15.5M16.5 17.5L18.2 20"
        stroke={active ? '#fde047' : '#f87171'}
        strokeWidth="1.6"
        strokeLinecap="round"
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
@keyframes pe-castle-age-glow {
  0%, 100% {
    box-shadow: 0 4px 14px rgba(245, 168, 36, 0.32), inset 0 1px 0 rgba(255, 252, 232, 0.45);
    border-color: rgba(254, 240, 138, 0.75);
  }
  50% {
    box-shadow: 0 0 18px 2px rgba(245, 168, 36, 0.52), inset 0 1px 0 rgba(255, 252, 232, 0.7);
    border-color: #fef08a;
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
  max-width: min(330px, calc(100vw - 162px));
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(14, 18, 26, 0.42);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(248, 250, 252, 0.94);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.25;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
}
.pe-top-left-subrow {
  pointer-events: none;
  margin: 5px 0 0 8px;
  max-width: min(330px, calc(100vw - 162px));
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.pe-age-up-pill {
  pointer-events: auto;
  cursor: pointer;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(20, 22, 28, 0.46);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(251, 191, 36, 0.42);
  color: #fef3c7;
  font-size: 10.5px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  transition: transform 0.08s ease, filter 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}
.pe-age-up-pill:hover {
  border-color: rgba(254, 240, 138, 0.72);
  background: rgba(34, 30, 24, 0.58);
}
.pe-age-up-pill:active {
  transform: scale(0.97);
}
.pe-age-up-pill-ready {
  background: linear-gradient(
    135deg,
    rgba(245, 168, 36, 0.62) 0%,
    rgba(217, 119, 6, 0.52) 100%
  );
  border-color: rgba(254, 240, 138, 0.78);
  color: #fffbeb;
  text-shadow: 0 1px 2px rgba(20, 12, 4, 0.65);
  animation: pe-castle-age-glow 1.8s infinite ease-in-out;
}
.pe-age-crest-badge {
  pointer-events: auto;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    rgba(245, 168, 36, 0.36) 0%,
    rgba(30, 58, 138, 0.48) 100%
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(254, 240, 138, 0.7);
  color: #fef3c7;
  font-size: 10.5px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(254, 240, 138, 0.28);
}
.pe-horse-buff-badge {
  pointer-events: auto;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(24, 28, 36, 0.44);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(251, 191, 36, 0.38);
  color: #fde68a;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  white-space: nowrap;
}
.pe-empire-name-pill {
  pointer-events: auto;
  margin: 5px 0 0 8px;
  max-width: min(240px, calc(100vw - 162px));
  height: 27px;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(14, 20, 30, 0.46);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(254, 240, 138, 0.38);
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: border-color 0.14s ease, background 0.14s ease;
}
.pe-empire-name-pill:focus-within {
  background: rgba(16, 24, 36, 0.62);
  border-color: rgba(254, 240, 138, 0.78);
}
.pe-empire-name-input {
  width: 148px;
  max-width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #fef3c7;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  user-select: text;
}
.pe-empire-name-input::placeholder {
  color: rgba(226, 232, 240, 0.62);
  font-weight: 600;
}
.pe-raid-destruction-pill {
  pointer-events: auto;
  margin: 5px 0 0 8px;
  max-width: min(330px, calc(100vw - 162px));
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    rgba(153, 27, 27, 0.56) 0%,
    rgba(120, 53, 15, 0.50) 100%
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(254, 240, 138, 0.55);
  color: #fef3c7;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.2;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(254, 240, 138, 0.24);
}
.pe-dock-floating {
  pointer-events: auto;
  width: min(96vw, 620px);
  max-width: min(96vw, 620px);
  margin: 0 auto calc(8px + env(safe-area-inset-bottom, 0px));
  padding: 6px 8px;
  border-radius: 18px;
  background: rgba(14, 18, 26, 0.44);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pe-dock-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.pe-dock-mode-cluster {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}
@media (max-width: 420px) {
  .pe-dock-top-row {
    flex-wrap: wrap;
    row-gap: 5px;
    column-gap: 6px;
  }
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
.pe-micro-pill-demolish-active {
  background: linear-gradient(
    135deg,
    rgba(220, 38, 38, 0.58) 0%,
    rgba(180, 83, 9, 0.52) 100%
  );
  border-color: rgba(254, 240, 138, 0.72);
  color: #fffbeb;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.35);
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
.pe-inspector-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 11px;
  background: rgba(9, 13, 20, 0.62);
  border: 1px solid rgba(253, 224, 71, 0.32);
  font-size: 10.5px;
  flex-wrap: wrap;
}
.pe-inspector-chip {
  cursor: pointer;
  padding: 2px 6.5px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.pe-inspector-chip:hover {
  border-color: rgba(253, 224, 71, 0.58);
  background: rgba(255, 255, 255, 0.16);
}
.pe-inspector-chip-active {
  background: rgba(245, 166, 35, 0.28);
  border-color: rgba(253, 224, 71, 0.72);
  color: #fef3c7;
}
.pe-bell-badge {
  pointer-events: auto;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(185, 28, 28, 0.58);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(254, 202, 202, 0.68);
  color: #fef2f2;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  white-space: nowrap;
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

const UNIT_ROLE_HINTS: Record<UnitKind, string> = {
  villager: 'Gather & Build',
  scout: 'Fast Recon',
  militia: '2× vs Buildings',
  pikeman: '3× vs Cavalry',
  archer: 'Ranged Volley',
  knight: 'Crushes Archers',
  monk: 'Wololo Faith + Heal',
  trebuchet: '90 Siege Range',
};

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
  onAdvanceAge,
  demolishMode = false,
  onToggleDemolish,
  empireName,
  onChangeEmpireName,
  rallyMode = false,
  onToggleRally,
  onCancelQueueItem,
  onRingTownBell,
  onFocusKeep,
  onFocusGhostBreach,
  onFilterSelectedKind,
}: EmpireHudProps) {
  const [preferredDockMode, setPreferredDockMode] = useState<'train' | 'build'>(
    mode === 'base_builder' ? 'build' : 'train',
  );
  const [lastMode, setLastMode] = useState<GameMode>(mode);
  const [tauntOpen, setTauntOpen] = useState(false);
  const [fallbackSettingsOpen, setFallbackSettingsOpen] = useState(false);
  const [localEmpireName, setLocalEmpireName] = useState(spec.mapName || '');
  const [lastBuilderMapName, setLastBuilderMapName] = useState(spec.mapName || '');

  if (mode !== lastMode) {
    setLastMode(mode);
    setPreferredDockMode(mode === 'base_builder' ? 'build' : 'train');
  }

  if (spec.mapName !== lastBuilderMapName) {
    setLastBuilderMapName(spec.mapName || '');
    setLocalEmpireName(spec.mapName || '');
  }

  const resolvedEmpireName = empireName !== undefined ? empireName : localEmpireName;
  const dockMode: 'train' | 'build' = placementKind !== null ? 'build' : preferredDockMode;
  const isBaseBuilder = mode === 'base_builder';
  const playerAge: 1 | 2 = snapshot.playerAge ?? 1;
  const canAffordCastleAge = canAfford(snapshot.resources, CASTLE_AGE_COST);
  const tamedHorsesCount = snapshot.tamedHorses ?? 0;

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
                  gameSpeed > 1 ? 'pe-speed-btn-fast' : ''
                }`}
                title="Toggle Battle Speed (1× / 1.5× / 2×)"
                aria-label={`Battle Speed ${gameSpeed}x`}
                aria-pressed={gameSpeed > 1}
                onClick={() => onToggleSpeed?.()}
              >
                <EmpireIcon name="bolt" size={11} />
                <span>{gameSpeed === 2 ? '2×' : gameSpeed === 1.5 ? '1.5×' : '1×'}</span>
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

        {/* Slim Top-Left Citadel Name / Raid % / Castle Age / Whisper / Onboarding Micro-Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          {isBaseBuilder && (
            <label
              className="pe-empire-name-pill"
              title="Name Your Citadel before publishing to the community"
            >
              <EmpireIcon name="quill" size={12} />
              <input
                type="text"
                data-testid="hud-empire-name-input"
                aria-label="Empire Name"
                className="pe-empire-name-input"
                maxLength={24}
                placeholder="Name Your Citadel…"
                value={resolvedEmpireName}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                onChange={(e) => {
                  const nextVal = e.target.value.slice(0, 24);
                  setLocalEmpireName(nextVal);
                  onChangeEmpireName?.(nextVal);
                }}
              />
            </label>
          )}

          {mode === 'raid' && (
            <div
              data-testid="hud-raid-destruction-pill"
              className="pe-raid-destruction-pill pe-hud-tabular"
            >
              <EmpireIcon name="flame" size={12} />
              <span>
                {`Raid vs u/${stripEmoji(raidTargetName || 'Defender')} · ${Math.round(
                  snapshot.raidDestructionPct ?? 0,
                )}% Destroyed`}
              </span>
            </div>
          )}

          <div className="pe-top-left-subrow">
            {playerAge === 1 ? (
              <button
                type="button"
                data-testid="hud-age-up-btn"
                aria-disabled={!canAffordCastleAge}
                className={`pe-age-up-pill pe-hud-tabular ${
                  canAffordCastleAge ? 'pe-age-up-pill-ready' : ''
                }`}
                title="Advance to Castle Age (+15% unit HP & attack, unlocks Counterweight Trebuchets)"
                onClick={() => onAdvanceAge?.()}
              >
                <CastleAgeSvg size={13} unlocked={false} />
                <span>Castle Age · </span>
                <span
                  style={{
                    color:
                      snapshot.resources.food >= CASTLE_AGE_COST.food ? '#fde68a' : '#fca5a5',
                  }}
                >
                  {CASTLE_AGE_COST.food}F
                </span>
                <span> </span>
                <span
                  style={{
                    color:
                      snapshot.resources.gold >= CASTLE_AGE_COST.gold ? '#fde68a' : '#fca5a5',
                  }}
                >
                  {CASTLE_AGE_COST.gold}G
                </span>
              </button>
            ) : (
              <div
                data-testid="hud-age-up-btn"
                className="pe-age-crest-badge pe-hud-tabular"
                title="Castle Age II — +15% Unit Might & Counterweight Trebuchets Unlocked"
              >
                <CastleAgeSvg size={13} unlocked />
                <span>Castle Age II</span>
              </div>
            )}

            {tamedHorsesCount > 0 && (
              <div
                className="pe-horse-buff-badge pe-hud-tabular"
                title={`Tamed ${tamedHorsesCount} wild horse${tamedHorsesCount === 1 ? '' : 's'} — Cavalry speed boosted`}
              >
                <EmpireIcon name="horse" size={11} />
                <span>+{Math.min(15, tamedHorsesCount * 5)}% Cav</span>
              </div>
            )}

            {(snapshot.relicsTotal ?? 0) > 0 && (
              <div
                className="pe-horse-buff-badge pe-hud-tabular"
                title="Sacred Relics enshrined — steady +Gold income"
              >
                <EmpireIcon name="relic" size={11} />
                <span>
                  Relics {snapshot.relicsPlayer ?? 0}/{snapshot.relicsTotal}
                </span>
              </div>
            )}

            {snapshot.townBellActive && (
              <div
                className="pe-bell-badge pe-hud-tabular"
                title="Town Bell active — Villagers garrisoned & Keep firing faster"
              >
                <EmpireIcon name="bell" size={11} />
                <span>Bell {Math.max(1, Math.ceil(snapshot.townBellSec ?? 0))}s</span>
              </div>
            )}
          </div>

          {!isBaseBuilder && snapshot.ghostBreach && (
            <button
              type="button"
              onClick={() => onFocusGhostBreach?.()}
              className="pe-whisper-pill pe-hud-tabular"
              style={{
                cursor: 'pointer',
                borderColor: 'rgba(192, 132, 252, 0.58)',
                background: 'rgba(30, 18, 48, 0.62)',
                color: '#f3e8ff',
              }}
              title="Tap to inspect fastest rival river breach"
            >
              <EmpireIcon name="bolt" size={11} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                u/{stripEmoji(snapshot.ghostBreach.username)} breached ({formatMmSs(snapshot.ghostBreach.timeSec)})
              </span>
            </button>
          )}

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
        {/* Contextual Selection & Building Inspector Strip */}
        {!isBaseBuilder &&
          (snapshot.selectedBuilding ||
            (snapshot.selectedUnitGroups && snapshot.selectedUnitGroups.length > 0)) && (
            <div data-testid="hud-selection-inspector" className="pe-inspector-strip pe-hud-tabular">
              {snapshot.selectedBuilding ? (
                (() => {
                  const sb = snapshot.selectedBuilding;
                  const bSpec = BUILDINGS[sb.kind];
                  const canRally =
                    sb.kind !== 'homestead' && sb.kind !== 'farm' && sb.kind !== 'stone_wall';
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
                        <EmpireIcon name={sb.kind} size={13} />
                        <span style={{ fontWeight: 800, color: '#fef3c7' }}>{bSpec.shortName}</span>
                        <span style={{ color: 'rgba(203, 213, 225, 0.85)', fontSize: '10px' }}>
                          {Math.ceil(sb.hp)}/{sb.maxHp} HP
                        </span>
                        {sb.queue.length > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#93c5fd', fontSize: '10px', fontWeight: 800 }}>
                              {sb.trainProgressPct}%
                            </span>
                            {sb.queue.map((qk, idx) => (
                              <button
                                key={`${qk}-${idx}`}
                                type="button"
                                className="pe-inspector-chip"
                                title={`Cancel ${UNITS[qk].shortName} (100% refund)`}
                                onClick={() => onCancelQueueItem?.(sb.id, idx)}
                              >
                                <EmpireIcon name="close" size={9} />
                                <span>{UNITS[qk].shortName}</span>
                              </button>
                            ))}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                        {canRally && (
                          <button
                            type="button"
                            data-testid="hud-rally-btn"
                            aria-pressed={Boolean(rallyMode)}
                            className={`pe-inspector-chip ${rallyMode ? 'pe-inspector-chip-active' : ''}`}
                            title="Tap any tile on the map (or right-click) to set spawn rally point"
                            onClick={() => onToggleRally?.()}
                          >
                            <EmpireIcon name="rally" size={11} />
                            <span>{rallyMode ? 'Tap Map…' : 'Rally'}</span>
                          </button>
                        )}
                        {sb.kind === 'town_center' && (
                          <button
                            type="button"
                            data-testid="hud-town-bell-btn"
                            aria-pressed={Boolean(snapshot.townBellActive)}
                            className={`pe-inspector-chip ${
                              snapshot.townBellActive ? 'pe-inspector-chip-active' : ''
                            }`}
                            title="Ring Town Bell [B] — Shelter villagers & fire Keep arrows faster"
                            onClick={() => onRingTownBell?.()}
                          >
                            <EmpireIcon name="bell" size={11} />
                            <span>{snapshot.townBellActive ? 'All Clear' : 'Town Bell'}</span>
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()
              ) : (
                (() => {
                  const groups = snapshot.selectedUnitGroups ?? [];
                  const totalHp = groups.reduce((acc, g) => acc + Math.ceil(g.totalHp), 0);
                  const totalMax = groups.reduce((acc, g) => acc + Math.ceil(g.maxHp), 0);
                  const primaryHint =
                    groups.length === 1
                      ? UNIT_ROLE_HINTS[groups[0].kind]
                      : 'Mixed Formation · Click chip to filter';
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        {groups.map((g) => (
                          <button
                            key={g.kind}
                            type="button"
                            className="pe-inspector-chip"
                            title={`Filter to ${UNITS[g.kind].name}`}
                            onClick={() => onFilterSelectedKind?.(g.kind)}
                          >
                            <span>
                              {UNITS[g.kind].shortName} ×{g.count}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '10px', color: '#fde68a', fontWeight: 700 }}>
                        <span>{primaryHint}</span>
                        <span style={{ color: 'rgba(203, 213, 225, 0.85)' }}>
                          {totalHp}/{totalMax} HP
                        </span>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          )}

        {/* Slim Top Row of Micro-Pills */}
        <div className="pe-dock-top-row">
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
                data-testid="hud-keep-btn"
                className="pe-micro-pill"
                title="Select & focus your Town Center [H]"
                onClick={() => onFocusKeep?.()}
              >
                <EmpireIcon name="keep" size={11} />
                <span>Keep</span>
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

          <div className="pe-dock-mode-cluster">
            {isBaseBuilder && (
              <button
                type="button"
                data-testid="hud-demolish-btn"
                aria-pressed={Boolean(demolishMode)}
                className={`pe-micro-pill ${
                  demolishMode ? 'pe-micro-pill-demolish-active' : ''
                }`}
                title="Tap any placed wall, farm, or building to clear & refund 75% resources"
                onClick={() => {
                  if (!demolishMode && placementKind !== null) {
                    onSelectPlacement(null);
                  }
                  onToggleDemolish?.();
                }}
              >
                <DemolishSvg size={12} active={Boolean(demolishMode)} />
                <span>{demolishMode ? 'Demolish · 75%' : 'Demolish'}</span>
              </button>
            )}

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
                  if (demolishMode) onToggleDemolish?.();
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
            {TRAINABLE_UNITS.map(({ kind, visual }) => {
              const unitSpec = UNITS[kind];
              const reqBuilding = unitSpec.trainedAt;
              const hasBuilding = (snapshot.ownedBuildings[reqBuilding] ?? 0) > 0;
              const requiresAge2 = Boolean(unitSpec.requiresCastleAge);
              const hasPrereq = (!requiresAge2 || playerAge >= 2) && hasBuilding;
              const cost = getEffectiveUnitCost(spec, 'player', kind);
              const affordable = canAfford(snapshot.resources, cost);
              const queued = snapshot.unitQueues[kind] ?? 0;
              const disabled = !hasPrereq || !affordable || popCapped;
              const lockLabel =
                kind === 'trebuchet'
                  ? 'Castle Age + Tower'
                  : BUILDINGS[reqBuilding].shortName;

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

                  {visual.type === 'empire' ? (
                    <EmpireIcon name={visual.icon} size={18} />
                  ) : (
                    <TrebuchetSvg size={18} />
                  )}

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
                        fontSize: kind === 'trebuchet' ? '7.5px' : '8px',
                        fontWeight: 700,
                        color: '#fde68a',
                        whiteSpace: kind === 'trebuchet' ? 'normal' : 'nowrap',
                        textAlign: 'center',
                        lineHeight: 1.05,
                      }}
                    >
                      {lockLabel}
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
                  onClick={() => {
                    if (demolishMode) onToggleDemolish?.();
                    onSelectPlacement(isPlacing ? null : kind);
                  }}
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
