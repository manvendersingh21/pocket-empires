import React, { useState } from 'react';
import {
  BIOMES,
  CIVS,
  type PlayerBaseBlueprint,
  type SkirmishSpec,
} from '../types/rts.js';
import { CivCrest, EmpireIcon, stripEmoji } from './EmpireIcons.js';
import { SettingsModal } from './SettingsModal.js';

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
  playerBases?: PlayerBaseBlueprint[];
  hasSavedBase?: boolean;
  onPlayDaily: () => void;
  onOpenMyBase?: () => void;
  onRaidPlayerBase?: (base: PlayerBaseBlueprint) => void;
  onOpenSettings?: () => void;
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
    rgba(10, 16, 22, 0.18) 0%,
    rgba(8, 12, 18, 0.52) 100%
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
  background: rgba(15, 20, 28, 0.45);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.pe-home-settings-btn:hover {
  background: rgba(24, 32, 44, 0.62);
  border-color: rgba(255, 240, 190, 0.5);
}
.pe-home-settings-btn:active {
  transform: scale(0.95);
}
.pe-home-center-stack {
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.pe-home-primary-cta {
  width: 100%;
  cursor: pointer;
  padding: 14px 18px;
  border-radius: 999px;
  background: rgba(245, 166, 35, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 240, 190, 0.65);
  color: #160f04;
  font-weight: 900;
  font-size: 13.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-shadow:
    0 10px 28px rgba(245, 166, 35, 0.28),
    0 4px 14px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 252, 232, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.1s ease, filter 0.15s ease, box-shadow 0.15s ease;
}
.pe-home-primary-cta:hover {
  filter: brightness(1.06);
  box-shadow:
    0 12px 32px rgba(245, 166, 35, 0.4),
    0 6px 18px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 252, 232, 0.8);
}
.pe-home-primary-cta:active {
  transform: translateY(1.5px) scale(0.99);
}
.pe-home-glass-pill-btn {
  width: 100%;
  cursor: pointer;
  padding: 12px 16px;
  border-radius: 999px;
  background: rgba(16, 22, 30, 0.50);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #f8fafc;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.01em;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.pe-home-glass-pill-btn:hover {
  background: rgba(24, 33, 46, 0.64);
  border-color: rgba(255, 240, 190, 0.45);
}
.pe-home-glass-pill-btn:active {
  transform: translateY(1px) scale(0.99);
}
.pe-raid-sheet {
  width: min(92vw, 370px);
  max-height: min(44dvh, 300px);
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  background: rgba(14, 18, 26, 0.68);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 18px;
  box-shadow:
    0 18px 44px rgba(0, 0, 0, 0.52),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  overflow: hidden;
  animation: pe-sheet-rise 0.18s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.pe-raid-attack-btn {
  cursor: pointer;
  flex-shrink: 0;
  padding: 6px 11px;
  border-radius: 999px;
  border: 1px solid rgba(253, 224, 71, 0.55);
  background: rgba(245, 166, 35, 0.82);
  color: #160f04;
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

export function WarRoomScreen({
  dailySpec,
  streak,
  bestScore,
  rank,
  leaderboard,
  community,
  aiModeLabel,
  playerBases = [],
  hasSavedBase = false,
  onPlayDaily,
  onOpenMyBase,
  onRaidPlayerBase,
  onOpenSettings,
  onPlayCustomSpec,
  onCraftPrompt,
}: WarRoomScreenProps) {
  const [raidSheetOpen, setRaidSheetOpen] = useState(false);
  const [fallbackSettingsOpen, setFallbackSettingsOpen] = useState(false);

  const handleSettingsClick = () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
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

      {/* Center Airy Stack: Wordmark + 1-line Pill + 3 Translucent Pill Buttons */}
      <div className="pe-home-center-stack">
        {/* Floating Wordmark + Tiny 1-line Daily Pill */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '7px',
            marginBottom: '6px',
            textAlign: 'center',
          }}
        >
          <h1
            className="pe-home-serif"
            style={{
              margin: 0,
              fontSize: 'clamp(25px, 5.5vw, 32px)',
              fontWeight: 900,
              color: '#fef3c7',
              lineHeight: 1.08,
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
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'rgba(14, 20, 28, 0.44)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              fontSize: '11.5px',
              fontWeight: 600,
              color: 'rgba(248, 250, 252, 0.92)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <CivCrest civ={dailySpec.playerCiv} size={13} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {`Daily #${dailySpec.puzzleNumber} · ${dailySpec.mapName}${
                streak > 0 ? ` · ${streak}d Streak` : ''
              }`}
            </span>
          </div>
        </div>

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

        {/* Button 2: My Base — Build & Defend */}
        <button
          type="button"
          data-testid="home-my-base-btn"
          className="pe-home-glass-pill-btn"
          onClick={() => onOpenMyBase?.()}
        >
          <HomeFortSvg size={17} />
          <span>My Base — Build & Defend</span>
          {hasSavedBase && (
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#34d399',
                boxShadow: '0 0 8px rgba(52, 211, 153, 0.8)',
                flexShrink: 0,
              }}
              title="Stronghold Saved"
            />
          )}
        </button>

        {/* Button 3: Raid Players */}
        <button
          type="button"
          data-testid="home-raid-players-btn"
          aria-expanded={raidSheetOpen}
          className="pe-home-glass-pill-btn"
          style={
            raidSheetOpen
              ? {
                  background: 'rgba(24, 33, 46, 0.68)',
                  borderColor: 'rgba(253, 224, 71, 0.5)',
                }
              : undefined
          }
          onClick={() => setRaidSheetOpen((prev) => !prev)}
        >
          <EmpireIcon name="swords" size={16} />
          <span>Raid Players</span>
          {playerBases.length > 0 && (
            <span
              className="pe-home-tabular"
              style={{
                padding: '1px 7px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#fde68a',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              {playerBases.length}
            </span>
          )}
        </button>
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
          onClose={() => setFallbackSettingsOpen(false)}
          inMatch={false}
          dailySpec={dailySpec}
          streak={streak}
          bestScore={bestScore}
          rank={rank}
          leaderboard={leaderboard}
          community={community}
          aiModeLabel={aiModeLabel}
          onPlayCustomSpec={onPlayCustomSpec}
          onCraftPrompt={onCraftPrompt}
        />
      )}
    </div>
  );
}

export default WarRoomScreen;
