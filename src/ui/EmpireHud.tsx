import React, { useEffect, useState } from 'react';
import {
  BUILDINGS,
  CIVS,
  TAUNTS,
  UNITS,
  type BuildingKind,
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
  CivCrest,
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
}

const TRAINABLE_UNITS: ReadonlyArray<{ kind: UnitKind; icon: EmpireIconName }> = [
  { kind: 'villager', icon: 'villager' },
  { kind: 'militia', icon: 'swords' },
  { kind: 'pikeman', icon: 'pikeman' },
  { kind: 'archer', icon: 'archer' },
  { kind: 'knight', icon: 'knight' },
  { kind: 'monk', icon: 'monk' },
];

const BUILDABLE_STRUCTURES: ReadonlyArray<{ kind: BuildingKind; icon: EmpireIconName }> = [
  { kind: 'homestead', icon: 'camp' },
  { kind: 'barracks', icon: 'barracks' },
  { kind: 'archery_range', icon: 'range' },
  { kind: 'stable', icon: 'stable' },
  { kind: 'monastery', icon: 'monastery' },
  { kind: 'watchtower', icon: 'tower' },
];

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = String(s % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

const HUD_CSS = `
@keyframes pe-idle-amber-pulse {
  0%, 100% {
    box-shadow: inset 0 1px 0 rgba(253, 230, 138, 0.35), 0 0 0 0 rgba(245, 158, 11, 0.55);
    border-color: #f59e0b;
  }
  50% {
    box-shadow: inset 0 1px 0 rgba(253, 230, 138, 0.55), 0 0 10px 2px rgba(245, 158, 11, 0.45);
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
  color: #f5ecd8;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}
.pe-hud-root *, .pe-hud-root *::before, .pe-hud-root *::after {
  box-sizing: border-box;
}
.pe-hud-tabular {
  font-variant-numeric: tabular-nums;
}
.pe-top-ledger {
  pointer-events: auto;
  height: 44px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background:
    linear-gradient(180deg, #27211b 0%, #17120c 100%);
  border-bottom: 1.5px solid #8c6622;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.16),
    0 4px 14px rgba(0, 0, 0, 0.65);
}
.pe-res-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(15, 11, 7, 0.65);
  border: 1px solid #3c3125;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
.pe-res-label {
  display: none;
  font-size: 10.5px;
  font-weight: 600;
  color: #bba98c;
  margin-left: 1px;
}
@media (min-width: 760px) {
  .pe-top-ledger {
    padding: 0 14px;
  }
  .pe-res-pill {
    padding: 4px 9px;
    font-size: 13px;
    gap: 5px;
  }
  .pe-res-label {
    display: inline;
  }
}
.pe-icon-btn {
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid #5c4934;
  background: linear-gradient(180deg, #332a21 0%, #201a14 100%);
  color: #f5ecd8;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.16),
    inset 0 -2px 0 rgba(0, 0, 0, 0.55);
  transition: filter 0.12s ease, transform 0.08s ease, border-color 0.12s ease;
}
.pe-icon-btn:hover {
  filter: brightness(1.12);
  border-color: #f5b942;
}
.pe-icon-btn:active {
  transform: translateY(1px);
}
.pe-squad-strip {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.pe-squad-strip::-webkit-scrollbar {
  display: none;
}
.pe-squad-pill {
  cursor: pointer;
  flex-shrink: 0;
  height: 27px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #524230;
  background: linear-gradient(180deg, #2e261e 0%, #1d1712 100%);
  color: #efe3cc;
  font-size: 11.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  transition: filter 0.12s ease, transform 0.08s ease, border-color 0.12s ease;
}
.pe-squad-pill:hover {
  border-color: #c89636;
  filter: brightness(1.1);
}
.pe-squad-pill:active {
  transform: translateY(1px);
}
.pe-squad-pill-idle {
  background: linear-gradient(180deg, #4b3210 0%, #2f1d08 100%);
  color: #fde68a;
  animation: pe-idle-amber-pulse 1.6s infinite ease-in-out;
}
.pe-squad-pill-siege {
  background: linear-gradient(180deg, #991b1b 0%, #651111 100%);
  border-color: #f87171;
  color: #fef2f2;
}
.pe-mode-switch {
  display: inline-flex;
  padding: 2px;
  border-radius: 7px;
  background: #120e09;
  border: 1px solid #473828;
  gap: 2px;
  flex-shrink: 0;
}
.pe-mode-btn {
  cursor: pointer;
  height: 24px;
  padding: 0 9px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: transparent;
  color: #b5a388;
  font-size: 11.5px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.pe-mode-btn-active {
  background: linear-gradient(180deg, #473722 0%, #2c2114 100%);
  border-color: #d49b35;
  color: #fde68a;
}
.pe-cards-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(56px, 1fr));
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
}
.pe-cards-row::-webkit-scrollbar {
  display: none;
}
.pe-command-card {
  position: relative;
  cursor: pointer;
  min-height: 58px;
  padding: 5px 4px 4px;
  border-radius: 7px;
  border: 1px solid #534332;
  background: linear-gradient(180deg, #2e261f 0%, #1e1813 100%);
  color: #f5ecd8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.15),
    inset 0 -2px 0 rgba(0, 0, 0, 0.65);
  transition: transform 0.08s ease, border-color 0.12s ease, filter 0.12s ease;
}
.pe-command-card:hover:not(:disabled) {
  border-color: #f5b942;
  filter: brightness(1.09);
}
.pe-command-card:active:not(:disabled) {
  transform: translateY(1px);
}
.pe-command-card-active {
  border: 1.5px solid #fde047;
  background: linear-gradient(180deg, #4a391e 0%, #2b2011 100%);
  box-shadow:
    inset 0 1px 0 rgba(254, 240, 138, 0.45),
    0 0 12px rgba(245, 185, 66, 0.35);
}
.pe-command-card-locked {
  opacity: 0.64;
  background: linear-gradient(180deg, #211c17 0%, #16120e 100%);
  border-color: #382e23;
}
.pe-dock-bar {
  pointer-events: auto;
  background:
    linear-gradient(180deg, rgba(39, 33, 27, 0.96) 0%, rgba(23, 18, 12, 0.99) 100%);
  border-top: 1.5px solid #8c6622;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.18),
    0 -6px 20px rgba(0, 0, 0, 0.68);
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
}
.pe-dock-inner {
  max-width: 820px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pe-dock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
@media (max-width: 520px) {
  .pe-dock-header {
    flex-wrap: wrap;
    gap: 4px;
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
        gap: '4px',
        fontSize: '10px',
        fontWeight: 800,
        lineHeight: 1,
        flexWrap: 'wrap',
      }}
    >
      {parts.map((p) => (
        <span
          key={p.key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            color: p.ok ? '#dfd1b8' : '#fca5a5',
            whiteSpace: 'nowrap',
          }}
        >
          <EmpireIcon name={p.icon} size={11} />
          <span>{p.val}</span>
        </span>
      ))}
    </span>
  );
}

export function EmpireHud({
  spec,
  snapshot,
  selectedUnitIds,
  selectedBuildingId,
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
}: EmpireHudProps) {
  const [dockMode, setDockMode] = useState<'train' | 'build'>('train');
  const [tauntOpen, setTauntOpen] = useState(false);

  // Automatically reveal Build row when placement starts (e.g. via keyboard hotkey)
  useEffect(() => {
    if (placementKind !== null) {
      setDockMode('build');
    }
  }, [placementKind]);

  // Switch to Train row when selecting an owned building while not placing
  useEffect(() => {
    if (selectedBuildingId !== null && placementKind === null) {
      setDockMode('train');
    }
  }, [selectedBuildingId, placementKind]);

  const onPar = Math.floor(snapshot.timeSec) <= snapshot.parSec;
  const popCapped = snapshot.popCurrent >= snapshot.popCap;
  const playerCiv = CIVS[spec.playerCiv];

  const whisperBorder =
    whisper?.urgency === 'warn'
      ? '#dc2626'
      : whisper?.urgency === 'opportunity'
        ? '#f5b942'
        : '#3b82f6';

  const whisperIconName: EmpireIconName =
    whisper?.urgency === 'warn'
      ? 'alert'
      : whisper?.urgency === 'opportunity'
        ? 'wololo'
        : 'scroll';

  return (
    <div className="pe-hud-root">
      <style>{HUD_CSS}</style>

      {/* TOP ZONE: Ledger Bar + Slim Top-Left Royal Advisor Pill */}
      <div>
        <header className="pe-top-ledger pe-hud-tabular">
          {/* Resource Counters */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            <div className="pe-res-pill" title="Wood">
              <EmpireIcon name="wood" size={15} />
              <span>{Math.floor(snapshot.resources.wood)}</span>
              <span className="pe-res-label">Wood</span>
            </div>

            <div className="pe-res-pill" title="Food">
              <EmpireIcon name="food" size={15} />
              <span>{Math.floor(snapshot.resources.food)}</span>
              <span className="pe-res-label">Food</span>
            </div>

            <div className="pe-res-pill" title="Gold">
              <EmpireIcon name="gold" size={15} />
              <span style={{ color: '#fde68a' }}>{Math.floor(snapshot.resources.gold)}</span>
              <span className="pe-res-label">Gold</span>
            </div>

            <div
              className="pe-res-pill"
              title="Population"
              style={{
                borderColor: popCapped ? '#dc2626' : '#3c3125',
                color: popCapped ? '#fca5a5' : '#f5ecd8',
              }}
            >
              <EmpireIcon name="keep" size={15} />
              <span>
                {snapshot.popCurrent}/{snapshot.popCap}
              </span>
              <span className="pe-res-label">Pop</span>
            </div>

            <div
              className="pe-res-pill"
              title={`3-Crown Par: ${formatMmSs(snapshot.parSec)}`}
              style={{
                borderColor: onPar ? '#b5862e' : '#3c3125',
                color: onPar ? '#f5b942' : '#e5d7be',
              }}
            >
              <EmpireIcon name="hourglass" size={14} />
              <span>{formatMmSs(snapshot.timeSec)}</span>
              <span className="pe-res-label">/ {formatMmSs(snapshot.parSec)}</span>
            </div>
          </div>

          {/* Right Controls: Taunt Popover + Mute + Exit */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              className="pe-icon-btn"
              title="Sound War Horn Taunt"
              aria-label="Taunts"
              aria-expanded={tauntOpen}
              onClick={() => setTauntOpen((prev) => !prev)}
              style={
                tauntOpen
                  ? { borderColor: '#f5b942', background: '#3b2e1d' }
                  : undefined
              }
            >
              <EmpireIcon name="horn" size={16} />
            </button>

            <button
              type="button"
              className="pe-icon-btn"
              title={muted ? 'Unmute Sound' : 'Mute Sound'}
              aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
              onClick={onToggleMute}
            >
              <EmpireIcon name={muted ? 'mute' : 'speaker'} size={16} />
            </button>

            <button
              type="button"
              className="pe-icon-btn"
              title="Retire to War Room"
              aria-label="Back to War Room"
              onClick={onExitToWarRoom}
            >
              <EmpireIcon name="retreat" size={16} />
            </button>

            {/* Taunt Popover Menu */}
            {tauntOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  minWidth: '158px',
                  padding: '5px',
                  borderRadius: '8px',
                  background: 'linear-gradient(180deg, #2b231b 0%, #18130e 100%)',
                  border: '1.5px solid #b5862e',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.78)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  zIndex: 50,
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
                      borderRadius: '5px',
                      border: '1px solid #413426',
                      background: '#211a13',
                      color: '#f5ecd8',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      textAlign: 'left',
                    }}
                  >
                    <span>
                      <strong style={{ color: '#f5b942' }}>{t.code}</strong> {t.label}
                    </span>
                    <EmpireIcon name="horn" size={13} style={{ opacity: 0.85 }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* SLIM ROYAL ADVISOR PILL (strictly max-width: calc(100vw - 140px) so top-right minimap stays clear) */}
        <div
          style={{
            pointerEvents: 'auto',
            margin: '6px 0 0 8px',
            maxWidth: 'calc(100vw - 140px)',
            width: 'fit-content',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '5px 7px 5px 9px',
            borderRadius: '999px',
            background: 'rgba(23, 18, 12, 0.9)',
            border: `1px solid ${whisper ? whisperBorder : '#594733'}`,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.58)',
          }}
        >
          <span
            style={{
              fontSize: '11.5px',
              lineHeight: 1.25,
              color: '#efe3cc',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {whisper ? (
              <>
                <EmpireIcon
                  name={whisperIconName}
                  size={13}
                  style={{ marginRight: '5px' }}
                />
                {stripEmoji(whisper.text)}
              </>
            ) : (
              <>
                <CivCrest
                  civ={spec.playerCiv}
                  size={14}
                  style={{ marginRight: '5px' }}
                />
                {selectedUnitIds.length > 0
                  ? `${selectedUnitIds.length} unit${selectedUnitIds.length > 1 ? 's' : ''} ready`
                  : `${playerCiv.name} Command`}
              </>
            )}
          </span>

          <button
            type="button"
            onClick={onAskScout}
            style={{
              cursor: 'pointer',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '999px',
              border: '1px solid #b5862e',
              background: 'linear-gradient(180deg, #433420 0%, #2a2013 100%)',
              color: '#fde68a',
              fontSize: '11px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            <EmpireIcon name="scout" size={13} />
            <span>Scout</span>
          </button>
        </div>
      </div>

      {/* BOTTOM COMMAND DOCK */}
      <footer className="pe-dock-bar">
        <div className="pe-dock-inner">
          {/* Row 1: Squad Quick-Bar + Mode Toggle */}
          <div className="pe-dock-header">
            <div className="pe-squad-strip">
              <button
                type="button"
                className={`pe-squad-pill pe-hud-tabular ${
                  snapshot.idleVillagerCount > 0 ? 'pe-squad-pill-idle' : ''
                }`}
                onClick={() => onSelectSquad('idle_villager')}
              >
                <EmpireIcon name="villager" size={13} />
                <span>Idle ({snapshot.idleVillagerCount})</span>
              </button>

              <button
                type="button"
                className="pe-squad-pill pe-hud-tabular"
                onClick={() => onSelectSquad('all_villagers')}
              >
                <EmpireIcon name="villager" size={13} />
                <span>
                  Villagers{snapshot.villagerCount > 0 ? ` (${snapshot.villagerCount})` : ''}
                </span>
              </button>

              <button
                type="button"
                className="pe-squad-pill pe-hud-tabular"
                onClick={() => onSelectSquad('all_army')}
              >
                <EmpireIcon name="swords" size={13} />
                <span>Army ({snapshot.armyCount})</span>
              </button>

              {snapshot.monkCount > 0 && (
                <button
                  type="button"
                  className="pe-squad-pill pe-hud-tabular"
                  style={{ borderColor: '#a855f7', color: '#f3e8ff' }}
                  onClick={() => onSelectSquad('monks')}
                >
                  <EmpireIcon name="monk" size={13} />
                  <span>Monks ({snapshot.monkCount})</span>
                </button>
              )}

              {snapshot.armyCount > 0 && (
                <button
                  type="button"
                  className="pe-squad-pill pe-squad-pill-siege"
                  onClick={onSiegeEnemyKeep}
                >
                  <EmpireIcon name="target" size={13} />
                  <span>Siege Keep!</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}>
              {placementKind !== null && (
                <button
                  type="button"
                  className="pe-squad-pill"
                  style={{
                    height: '26px',
                    background: 'linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%)',
                    borderColor: '#f87171',
                    color: '#fee2e2',
                  }}
                  onClick={() => onSelectPlacement(null)}
                >
                  <EmpireIcon name="close" size={11} />
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
                    setDockMode('train');
                  }}
                >
                  <EmpireIcon name="swords" size={12} />
                  <span>Train</span>
                </button>
                <button
                  type="button"
                  aria-pressed={dockMode === 'build'}
                  className={`pe-mode-btn ${dockMode === 'build' ? 'pe-mode-btn-active' : ''}`}
                  onClick={() => setDockMode('build')}
                >
                  <EmpireIcon name="hammer" size={12} />
                  <span>Build</span>
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: 6-Card Bevel Deck (Train OR Build) */}
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
                    className={`pe-command-card ${!hasPrereq ? 'pe-command-card-locked' : ''}`}
                    title={`${unitSpec.name} — ${unitSpec.description}`}
                    disabled={disabled}
                    onClick={() => onTrainUnit(kind)}
                  >
                    {/* Queue Badge ×N */}
                    {queued > 0 && (
                      <span
                        className="pe-hud-tabular"
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '3px',
                          padding: '1px 4px',
                          borderRadius: '999px',
                          background: '#f5b942',
                          color: '#17120c',
                          fontSize: '9.5px',
                          fontWeight: 900,
                          lineHeight: 1.1,
                        }}
                      >
                        ×{queued}
                      </span>
                    )}

                    <EmpireIcon name={icon} size={20} />

                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        color: hasPrereq ? '#f5ecd8' : '#a89880',
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
                          fontSize: '9px',
                          fontWeight: 700,
                          color: '#fbbf24',
                          whiteSpace: 'nowrap',
                          lineHeight: 1,
                        }}
                      >
                        Need {BUILDINGS[reqBuilding].shortName}
                      </span>
                    ) : popCapped ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '9.5px',
                          fontWeight: 800,
                          color: '#fca5a5',
                          lineHeight: 1,
                        }}
                      >
                        <EmpireIcon name="keep" size={11} />
                        <span>Pop Full</span>
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
              {BUILDABLE_STRUCTURES.map(({ kind, icon }) => {
                const bSpec = BUILDINGS[kind];
                const cost = getEffectiveBuildingCost(spec, 'player', kind);
                const affordable = canAfford(snapshot.resources, cost);
                const isPlacing = placementKind === kind;
                const builtCount = snapshot.ownedBuildings[kind] ?? 0;

                return (
                  <button
                    key={kind}
                    type="button"
                    className={`pe-command-card ${isPlacing ? 'pe-command-card-active' : ''} ${
                      !affordable && !isPlacing ? 'pe-command-card-locked' : ''
                    }`}
                    title={`${bSpec.name} [${bSpec.hotkey}] — ${bSpec.description}`}
                    onClick={() => onSelectPlacement(isPlacing ? null : kind)}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: '4px',
                        fontSize: '8.5px',
                        fontWeight: 800,
                        color: '#8f7d63',
                      }}
                    >
                      {bSpec.hotkey}
                    </span>

                    {builtCount > 0 && (
                      <span
                        className="pe-hud-tabular"
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '4px',
                          fontSize: '9px',
                          fontWeight: 800,
                          color: '#cbbba0',
                        }}
                      >
                        {builtCount}
                      </span>
                    )}

                    <EmpireIcon name={icon} size={20} />

                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        color: isPlacing ? '#fde68a' : '#f5ecd8',
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
        </div>
      </footer>
    </div>
  );
}

export default EmpireHud;
