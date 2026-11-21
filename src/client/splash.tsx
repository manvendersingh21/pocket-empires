import { context, requestExpandedMode } from '@devvit/web/client';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { generateDailySpec } from '../engine/dailyGenerator.js';
import { BIOMES, CIVS, DAILY_MODIFIERS, type BiomeDef } from '../types/rts.js';
import { CivCrest, EmpireIcon } from '../ui/EmpireIcons.js';
import { useMountTask } from './hooks.js';
import { journeys } from './telemetry.js';

const isLocalSplash = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if (!isLocalSplash) journeys.appReady();

interface DailyPulsePayload {
  totalPlays?: number;
  totalWololos?: number;
  community?: {
    totalPlays?: number;
    totalWololos?: number;
  };
}

function readRedditUsername(): string | null {
  try {
    const raw = context.username;
    if (typeof raw === 'string' && raw.trim().length > 0 && raw !== 'anonymous') {
      return raw.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function IsoPine({
  cx,
  cy,
  scale = 1,
  primary,
  secondary,
}: {
  cx: number;
  cy: number;
  scale?: number;
  primary: string;
  secondary: string;
}) {
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
      <ellipse cx="0" cy="2" rx="6.5" ry="3" fill="rgba(10, 8, 5, 0.36)" />
      <rect x="-1.2" y="-3" width="2.4" height="5" fill="#4a321f" />
      <polygon points="0,-17 -7.5,-5 0,-3.5" fill={secondary} />
      <polygon points="0,-17 7.5,-5 0,-3.5" fill={primary} />
      <polygon points="0,-22 -6,-10.5 0,-9" fill={secondary} />
      <polygon points="0,-22 6,-10.5 0,-9" fill={primary} />
      <polygon points="0,-26 -4.2,-16.5 0,-15.3" fill={secondary} />
      <polygon points="0,-26 4.2,-16.5 0,-15.3" fill={primary} />
    </g>
  );
}

function IsoKeep({
  cx,
  cy,
  team,
}: {
  cx: number;
  cy: number;
  team: 'blue' | 'red';
}) {
  const roofLight = team === 'blue' ? '#3b82f6' : '#ef4444';
  const roofDark = team === 'blue' ? '#1d4ed8' : '#991b1b';
  const bannerFill = team === 'blue' ? '#2563eb' : '#dc2626';
  const bannerGlow = team === 'blue' ? '#93c5fd' : '#fca5a5';
  const flagDir = team === 'blue' ? 1 : -1;

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      {/* Ground shadow */}
      <polygon points="0,-11 26,0 0,11 -26,0" fill="rgba(12, 9, 6, 0.42)" />
      {/* Isometric cobbled courtyard plinth */}
      <polygon points="0,-12 24,-1 0,10 -24,-1" fill="#8b8378" />
      <polygon points="-24,-1 0,10 0,13 -24,2" fill="#6b6359" />
      <polygon points="0,10 24,-1 24,2 0,13" fill="#4b453e" />

      {/* Main stone keep walls */}
      <polygon points="-15,-5 0,2 0,-18 -15,-25" fill="#d6d3d1" />
      <polygon points="0,2 15,-5 15,-25 0,-18" fill="#a8a29e" />
      <polygon points="0,-32 15,-25 0,-18 -15,-25" fill="#e7e5e4" />

      {/* Team-colored pitched citadel roof */}
      <polygon points="0,-42 -13,-26 0,-20" fill={roofLight} />
      <polygon points="0,-42 13,-26 0,-20" fill={roofDark} />
      <polyline
        points="-13,-26 0,-20 13,-26"
        fill="none"
        stroke="#fde68a"
        strokeWidth="0.9"
        strokeOpacity="0.75"
      />

      {/* Flanking front bastion turret */}
      <polygon points={team === 'blue' ? '4,3 12,-1 12,-15 4,-11' : '-12,-1 -4,3 -4,-11 -12,-15'} fill="#e7e5e4" />
      <polygon
        points={team === 'blue' ? '8,-22 2,-13 14,-13' : '-8,-22 -14,-13 -2,-13'}
        fill={roofLight}
      />

      {/* Arched gatehouse facing the river ford */}
      {team === 'blue' ? (
        <path d="M5,-1 L10,-3.3 L10,-9.5 Q7.5,-11.5 5,-9.5 Z" fill="#292018" />
      ) : (
        <path d="M-5,-1 L-10,-3.3 L-10,-9.5 Q-7.5,-11.5 -5,-9.5 Z" fill="#292018" />
      )}

      {/* Slit windows */}
      <rect x="-9" y="-17" width="2" height="5" rx="1" fill="#33291f" />
      <rect x="6" y="-17" width="2" height="5" rx="1" fill="#33291f" />

      {/* Brass flagpole & animated banner flag */}
      <line x1="0" y1="-41" x2="0" y2="-56" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="0" cy="-56.5" r="1.6" fill="#fef08a" />
      <path
        d={
          flagDir === 1
            ? 'M0,-55.5 Q6,-57.5 13,-54.2 L10.5,-51.2 L13,-48.2 Q6,-50.5 0,-48.8 Z'
            : 'M0,-55.5 Q-6,-57.5 -13,-54.2 L-10.5,-51.2 L-13,-48.2 Q-6,-50.5 0,-48.8 Z'
        }
        fill={bannerFill}
        stroke={bannerGlow}
        strokeWidth="0.8"
      >
        <animateTransform
          attributeName="transform"
          type="skewY"
          values="-2;2;-2"
          dur="2.8s"
          repeatCount="indefinite"
        />
      </path>
    </g>
  );
}

function MiniDioramaCrest({ biome }: { biome: BiomeDef }) {
  return (
    <svg
      viewBox="0 0 360 144"
      preserveAspectRatio="xMidYMid meet"
      aria-label="Isometric battlefield diorama: Blue Keep versus Red Keep across a sparkling river ford"
      role="img"
      style={{
        width: '100%',
        height: '100%',
        maxHeight: '164px',
        display: 'block',
        overflow: 'visible',
      }}
    >
      <defs>
        <radialGradient id="dioramaAura" cx="50%" cy="54%" r="48%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.24" />
          <stop offset="65%" stopColor="#b45309" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#14100b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="turfSurface" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={biome.grassTop} />
          <stop offset="55%" stopColor={biome.grassAlt} />
          <stop offset="100%" stopColor={biome.grassEdge} />
        </linearGradient>
        <linearGradient id="riverFlow" x1="25%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor={biome.waterDeep} />
          <stop offset="50%" stopColor={biome.waterTop} />
          <stop offset="100%" stopColor={biome.waterDeep} />
        </linearGradient>
      </defs>

      {/* Warm tabletop lantern aura */}
      <ellipse cx="180" cy="78" rx="164" ry="60" fill="url(#dioramaAura)" />

      {/* Drop shadow beneath floating isometric war-table slab */}
      <polygon points="180,30 330,84 180,140 30,84" fill="rgba(0, 0, 0, 0.55)" />

      {/* 3D bevelled earth & stone cliff sides */}
      <polygon points="34,74 180,129 180,139 34,84" fill="#4f3d2b" />
      <polygon points="180,129 326,74 326,84 180,139" fill="#32261a" />
      <polyline
        points="34,84 180,139 326,84"
        fill="none"
        stroke="#d97706"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />

      {/* Main isometric meadow/terrain diamond */}
      <polygon
        points="180,19 326,74 180,129 34,74"
        fill="url(#turfSurface)"
        stroke="#d6b25e"
        strokeOpacity="0.45"
        strokeWidth="1"
      />

      {/* Subtle tactical isometric tile grid lines */}
      <g stroke="rgba(255,255,255,0.08)" strokeWidth="0.7">
        <line x1="70.5" y1="60.2" x2="216.5" y2="115.2" />
        <line x1="107" y1="46.5" x2="253" y2="101.5" />
        <line x1="143.5" y1="32.7" x2="289.5" y2="87.7" />
        <line x1="289.5" y1="60.2" x2="143.5" y2="115.2" />
        <line x1="253" y1="46.5" x2="107" y2="101.5" />
        <line x1="216.5" y1="32.7" x2="70.5" y2="87.7" />
      </g>

      {/* Sparkling river cutting diagonally across the midline */}
      <polygon
        points="146,31.8 166,24.3 214,116.2 194,123.7"
        fill="url(#riverFlow)"
      />
      {/* Riverbank highlights */}
      <line x1="146" y1="31.8" x2="194" y2="123.7" stroke="#fde68a" strokeOpacity="0.32" strokeWidth="1.1" />
      <line x1="166" y1="24.3" x2="214" y2="116.2" stroke="#fde68a" strokeOpacity="0.28" strokeWidth="1.1" />

      {/* Siege dirt road from Blue Keep across the central ford to Red Keep */}
      <path
        d="M108,77 Q145,82 180,74 T252,69"
        fill="none"
        stroke={biome.roadColor}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeOpacity="0.88"
      />

      {/* Shallow river ford & stepping stones at (180, 74) */}
      <polygon
        points="167,72 187,65 194,77 174,84"
        fill={biome.shallows}
        fillOpacity="0.92"
      />
      <ellipse cx="174" cy="76.5" rx="3.2" ry="1.7" fill="#d6d3d1" />
      <ellipse cx="181" cy="74.2" rx="3.4" ry="1.8" fill="#e7e5e4" />
      <ellipse cx="187.5" cy="71.8" rx="3" ry="1.6" fill="#d6d3d1" />

      {/* Animated river sparkles */}
      <circle cx="163" cy="49" r="1.4" fill="#e0f2fe">
        <animate attributeName="opacity" values="0.25;1;0.25" dur="2.1s" repeatCount="indefinite" />
      </circle>
      <circle cx="182" cy="70" r="1.5" fill="#ffffff">
        <animate attributeName="opacity" values="0.95;0.25;0.95" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="196" cy="99" r="1.4" fill="#bae6fd">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="2.4s" repeatCount="indefinite" />
      </circle>

      {/* North pine groves */}
      <IsoPine cx={126} cy={47} scale={0.86} primary={biome.treePrimary} secondary={biome.treeSecondary} />
      <IsoPine cx={112} cy={53} scale={0.95} primary={biome.treePrimary} secondary={biome.treeSecondary} />
      <IsoPine cx={214} cy={44} scale={0.88} primary={biome.treePrimary} secondary={biome.treeSecondary} />
      <IsoPine cx={229} cy={50} scale={0.96} primary={biome.treePrimary} secondary={biome.treeSecondary} />

      {/* Contested northern Gold Vein */}
      <g transform="translate(194, 53)">
        <ellipse cx="0" cy="2" rx="7" ry="3.2" fill="rgba(15, 10, 4, 0.35)" />
        <polygon points="-5,1 -2,-5 2,0" fill="#facc15" />
        <polygon points="-1,2 3,-6 6,1" fill="#eab308" />
        <polygon points="-3,3 1,-2 4,3" fill="#fef08a" />
      </g>

      {/* Blue Keep (Player Stronghold — West Bank) & Red Keep (Rival Stronghold — East Bank) */}
      <IsoKeep cx={98} cy={76} team="blue" />
      <IsoKeep cx={262} cy={70} team="red" />

      {/* Tiny Vanguard Knights clashing toward the river ford */}
      {/* Blue Knight */}
      <g transform="translate(148, 76)">
        <ellipse cx="0" cy="2" rx="4.5" ry="2" fill="rgba(0,0,0,0.4)" />
        <circle cx="0" cy="-7.5" r="2.3" fill="#e2e8f0" />
        <path d="M-3,-5 L3,-5 L2.5,1 L-2.5,1 Z" fill="#2563eb" />
        <line x1="1" y1="-4" x2="11" y2="-7.5" stroke="#fef08a" strokeWidth="1.3" strokeLinecap="round" />
      </g>
      {/* Red Defender */}
      <g transform="translate(212, 72)">
        <ellipse cx="0" cy="2" rx="4.5" ry="2" fill="rgba(0,0,0,0.4)" />
        <circle cx="0" cy="-7.5" r="2.3" fill="#e2e8f0" />
        <path d="M-3,-5 L3,-5 L2.5,1 L-2.5,1 Z" fill="#dc2626" />
        <line x1="-1" y1="-4" x2="-11" y2="-7" stroke="#fde68a" strokeWidth="1.3" strokeLinecap="round" />
      </g>

      {/* Contested southern Gold Vein with sparkle */}
      <g transform="translate(163, 101)">
        <ellipse cx="0" cy="2.5" rx="8.5" ry="3.8" fill="rgba(15, 10, 4, 0.38)" />
        <polygon points="-7,2 -3,-6 1,1" fill="#eab308" />
        <polygon points="-2,3 2,-7 7,1" fill="#facc15" />
        <polygon points="-4,3.5 0,-3 5,3.5" fill="#fef08a" />
        <path d="M2,-10 L3,-7.5 L5.5,-6.5 L3,-5.5 L2,-3 L1,-5.5 L-1.5,-6.5 L1,-7.5 Z" fill="#fffbeb">
          <animate attributeName="opacity" values="0.35;1;0.35" dur="1.9s" repeatCount="indefinite" />
        </path>
      </g>

      {/* Foreground pine groves framing southern rim */}
      <IsoPine cx={74} cy={86} scale={0.85} primary={biome.treePrimary} secondary={biome.treeSecondary} />
      <IsoPine cx={128} cy={104} scale={0.94} primary={biome.treePrimary} secondary={biome.treeSecondary} />
      <IsoPine cx={242} cy={99} scale={0.92} primary={biome.treePrimary} secondary={biome.treeSecondary} />
      <IsoPine cx={286} cy={83} scale={0.84} primary={biome.treePrimary} secondary={biome.treeSecondary} />

      {/* Brass cartouche seal at southern point of the war-table */}
      <g transform="translate(180, 132)">
        <polygon points="0,-7 9,0 0,7 -9,0" fill="#291d12" stroke="#f59e0b" strokeWidth="1.2" />
        <circle cx="0" cy="0" r="2.2" fill="#fbbf24" />
      </g>
    </svg>
  );
}

function Splash() {
  const spec = useMemo(() => generateDailySpec(), []);
  const username = useMemo(() => readRedditUsername(), []);
  const [pulse, setPulse] = useState<{ totalPlays: number; totalWololos: number } | null>(null);

  const pCiv = CIVS[spec.playerCiv];
  const eCiv = CIVS[spec.enemyCiv];
  const biome = BIOMES[spec.biome];
  const mod = DAILY_MODIFIERS[spec.modifier];
  const mins = Math.floor(spec.parSec / 60);
  const secs = String(spec.parSec % 60).padStart(2, '0');

  useMountTask(() => {
    if (isLocalSplash) return;
    const ctrl = new AbortController();
    fetch('/api/empire/daily?date=' + encodeURIComponent(spec.dateKey), {
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<DailyPulsePayload>) : null))
      .then((data) => {
        if (!data) return;
        const totalPlays = data.community?.totalPlays ?? data.totalPlays ?? 0;
        const totalWololos = data.community?.totalWololos ?? data.totalWololos ?? 0;
        if (typeof totalPlays === 'number' && totalPlays > 0) {
          setPulse({
            totalPlays,
            totalWololos: typeof totalWololos === 'number' ? totalWololos : 0,
          });
        }
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  });

  return (
    <div className="pe-splash">
      <style>{`
        .pe-splash {
          position: relative;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: clamp(6px, 1.8vh, 12px);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          color: #f5ebd6;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background:
            radial-gradient(ellipse at 50% 34%, #2d2012 0%, #1b140c 54%, #100c08 100%);
        }
        .pe-watermark {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0.9;
        }
        .pe-frame {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
          max-width: 680px;
          max-height: 496px;
          box-sizing: border-box;
          padding: clamp(8px, 2.2vh, 16px) clamp(10px, 2.8vw, 20px);
          border-radius: 12px;
          border: 1.5px solid rgba(217, 164, 65, 0.68);
          box-shadow:
            inset 0 0 0 3px rgba(20, 16, 11, 0.92),
            inset 0 0 0 4px rgba(217, 164, 65, 0.3),
            0 12px 32px rgba(0, 0, 0, 0.72);
          background:
            radial-gradient(circle at 50% 42%, rgba(217, 119, 6, 0.08) 0%, rgba(16, 12, 8, 0.42) 72%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          gap: clamp(3px, 1.1vh, 8px);
          text-align: center;
        }
        .pe-corner {
          position: absolute;
          width: 9px;
          height: 9px;
          border-color: #f59e0b;
          border-style: solid;
          opacity: 0.78;
          pointer-events: none;
        }
        .pe-corner.tl { top: 5px; left: 5px; border-width: 2px 0 0 2px; }
        .pe-corner.tr { top: 5px; right: 5px; border-width: 2px 2px 0 0; }
        .pe-corner.bl { bottom: 5px; left: 5px; border-width: 0 0 2px 2px; }
        .pe-corner.br { bottom: 5px; right: 5px; border-width: 0 2px 2px 0; }

        .pe-top-row {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: nowrap;
          gap: 6px;
          max-width: 100%;
          flex-shrink: 0;
        }
        .pe-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2.5px 9px;
          border-radius: 999px;
          font-size: clamp(9.5px, 2vw, 11.5px);
          font-weight: 800;
          letter-spacing: 0.05em;
          white-space: nowrap;
          background: rgba(18, 13, 8, 0.85);
          border: 1px solid rgba(245, 158, 11, 0.52);
          color: #fcd34d;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
        }
        .pe-liege {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2.5px 9px;
          border-radius: 999px;
          font-size: clamp(9.5px, 2vw, 11.5px);
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 210px;
          background: rgba(59, 130, 246, 0.14);
          border: 1px solid rgba(147, 197, 253, 0.38);
          color: #dbeafe;
        }

        .pe-title-block {
          flex-shrink: 0;
          line-height: 1;
        }
        .pe-title {
          margin: 0;
          font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
          font-size: clamp(20px, 5.2vh, 32px);
          font-weight: 900;
          letter-spacing: 0.07em;
          line-height: 1.04;
          background: linear-gradient(180deg, #fffbeb 0%, #fde68a 42%, #d97706 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.85));
        }
        .pe-subtitle {
          margin-top: 2px;
          font-size: clamp(9px, 1.8vh, 11px);
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #cbb994;
        }

        .pe-diorama-slot {
          flex: 1 1 0%;
          min-height: 64px;
          max-height: 164px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pe-matchup-pill {
          flex-shrink: 0;
          max-width: 100%;
          box-sizing: border-box;
          padding: clamp(5px, 1.2vh, 8px) clamp(10px, 2.6vw, 16px);
          border-radius: 10px;
          background: linear-gradient(180deg, rgba(31, 23, 15, 0.92) 0%, rgba(19, 14, 9, 0.95) 100%);
          border: 1px solid rgba(217, 164, 65, 0.4);
          box-shadow: inset 0 1px 0 rgba(254, 243, 199, 0.1), 0 4px 12px rgba(0, 0, 0, 0.45);
          font-size: clamp(10.5px, 2.2vw, 12.5px);
          line-height: 1.32;
          color: #efe3c8;
        }
        .pe-matchup-top {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 5px;
          font-weight: 800;
          color: #fef3c7;
        }
        .pe-matchup-meta {
          color: #d6c7ad;
          font-size: clamp(10px, 2vw, 12px);
        }
        .pe-matchup-meta strong {
          color: #fde68a;
          font-weight: 800;
        }
        .pe-matchup-meta em {
          color: #fdba74;
          font-style: italic;
          font-weight: 700;
        }

        .pe-cta-btn {
          flex-shrink: 0;
          appearance: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 999px;
          border: 2px solid #f59e0b;
          padding: clamp(9px, 2vh, 13px) clamp(16px, 4.5vw, 30px);
          background: linear-gradient(180deg, #dc2626 0%, #991b1b 54%, #7f1d1d 100%);
          color: #fffbeb;
          font-family: inherit;
          font-size: clamp(12.5px, 3.5vw, 16px);
          font-weight: 900;
          letter-spacing: 0.05em;
          white-space: nowrap;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
          box-shadow:
            0 0 0 1px #451a03,
            inset 0 1px 0 rgba(254, 243, 199, 0.55),
            0 4px 0 #450a0a,
            0 8px 20px rgba(0, 0, 0, 0.65);
          transition: transform 0.1s ease, filter 0.15s ease, box-shadow 0.1s ease;
        }
        .pe-cta-btn:hover {
          filter: brightness(1.09);
        }
        .pe-cta-btn:active {
          transform: translateY(2px);
          box-shadow:
            0 0 0 1px #451a03,
            inset 0 1px 0 rgba(254, 243, 199, 0.4),
            0 2px 0 #450a0a,
            0 4px 10px rgba(0, 0, 0, 0.65);
        }

        .pe-pulse {
          flex-shrink: 0;
          margin: 0;
          padding: 0 10px;
          box-sizing: border-box;
          font-size: clamp(9.5px, 2.2vw, 11.5px);
          font-weight: 600;
          line-height: 1.22;
          color: #b8a688;
          max-width: 100%;
        }
        .pe-pulse-live {
          color: #fde68a;
        }

        @media (max-width: 380px) {
          .pe-liege {
            max-width: 128px;
          }
          .pe-cta-btn {
            padding: 8px 14px;
            font-size: 12px;
          }
        }
        @media (max-height: 360px) {
          .pe-subtitle {
            display: none;
          }
          .pe-matchup-pill {
            padding: 4px 9px;
          }
        }
      `}</style>

      {/* Subtle isometric diamond war-map watermark */}
      <svg className="pe-watermark" aria-hidden="true">
        <defs>
          <pattern id="isoDiamondGrid" width="48" height="24" patternUnits="userSpaceOnUse">
            <path
              d="M24 0 L48 12 L24 24 L0 12 Z"
              fill="none"
              stroke="#d4af37"
              strokeOpacity="0.065"
              strokeWidth="0.8"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#isoDiamondGrid)" />
      </svg>

      <div className="pe-frame">
        <span className="pe-corner tl" />
        <span className="pe-corner tr" />
        <span className="pe-corner bl" />
        <span className="pe-corner br" />

        {/* Header: Daily Siege badge + Personalized Reddit greeting */}
        <div className="pe-top-row">
          <span className="pe-badge">
            DAILY SIEGE #{spec.puzzleNumber} · {spec.dateKey}
          </span>
          {username && (
            <span className="pe-liege" title={`My Liege u/${username}`}>
              <EmpireIcon name="crown" size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                My Liege u/{username}
              </span>
            </span>
          )}
        </div>

        {/* Royal Crest Title */}
        <div className="pe-title-block">
          <h1 className="pe-title">POCKET EMPIRES</h1>
          <div className="pe-subtitle">Daily 3-Minute RTS Siege</div>
        </div>

        {/* Mini Isometric Diorama Crest SVG */}
        <div className="pe-diorama-slot">
          <MiniDioramaCrest biome={biome} />
        </div>

        {/* Matchup, Map, Royal Decree & Par Pill */}
        <div className="pe-matchup-pill">
          <div className="pe-matchup-top">
            <span style={{ color: '#93c5fd', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CivCrest civ={spec.playerCiv} size={15} />
              <span>{pCiv.name}</span>
            </span>
            <span style={{ color: '#a89984', fontWeight: 700 }}>vs</span>
            <span style={{ color: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CivCrest civ={spec.enemyCiv} size={15} />
              <span>{eCiv.name}</span>
            </span>
          </div>
          <div className="pe-matchup-meta">
            Map: <strong>{spec.mapName}</strong> · Decree: <em>{mod.name}</em> · Par {mins}:{secs}
          </div>
        </div>

        {/* Primary CTA Button */}
        <button
          type="button"
          className="pe-cta-btn"
          onClick={(e) => {
            if (!isLocalSplash) journeys.interaction('splash_play');
            requestExpandedMode(e.nativeEvent, 'game');
          }}
        >
          <EmpireIcon name="horn" size={16} />
          <span>SOUND THE HORN — PLAY DAILY</span>
        </button>

        {/* Live Subreddit Pulse or Gameplay Loop Tagline */}
        <p className={`pe-pulse ${pulse ? 'pe-pulse-live' : ''}`}>
          {pulse ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                flexWrap: 'wrap',
              }}
            >
              <EmpireIcon name="flame" size={12} />
              <span>{pulse.totalPlays.toLocaleString()} Commanders ·</span>
              <EmpireIcon name="wololo" size={12} />
              <span>{pulse.totalWololos.toLocaleString()} Wololo&apos;d today</span>
            </span>
          ) : (
            'Gather Wood & Gold · Train Knights & Monks · Raze the Rival Keep'
          )}
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Splash />
  </React.StrictMode>,
);
