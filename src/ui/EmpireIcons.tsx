import React from 'react';
import type { CivId } from '../types/rts.js';

export type EmpireIconName =
  | 'wood'
  | 'food'
  | 'gold'
  | 'keep'
  | 'pop'
  | 'crown'
  | 'skull'
  | 'flame'
  | 'horn'
  | 'speaker'
  | 'mute'
  | 'retreat'
  | 'villager'
  | 'swords'
  | 'militia'
  | 'pikeman'
  | 'archer'
  | 'knight'
  | 'monk'
  | 'camp'
  | 'homestead'
  | 'barracks'
  | 'range'
  | 'archery_range'
  | 'stable'
  | 'monastery'
  | 'tower'
  | 'watchtower'
  | 'town_center'
  | 'trophy'
  | 'forge'
  | 'hammer'
  | 'scroll'
  | 'quill'
  | 'scout'
  | 'wololo'
  | 'hourglass'
  | 'shield'
  | 'fleur'
  | 'map'
  | 'medal'
  | 'bolt'
  | 'alert'
  | 'check'
  | 'copy'
  | 'key'
  | 'target'
  | 'close'
  | 'fish'
  | 'horse'
  | 'farm'
  | 'wall'
  | 'stone_wall'
  | 'settings'
  | 'raid'
  | 'home_base'
  | 'publish';

export interface EmpireIconProps {
  name: EmpireIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export interface CivCrestProps {
  civ: CivId;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

const EMOJI_STRIP_RE =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u2600-\u27BF]|\uFE0F|\uFE0E|\u200D|\u20E3)+/gu;

/**
 * Strips raw Unicode emoji / dingbat glyphs so headless Linux browsers without
 * color emoji fonts never render `□` tofu boxes in dynamic text (e.g. Advisor whispers,
 * server flair labels, or LLM chronicle lines).
 */
export function stripEmoji(input: string): string {
  if (!input) return '';
  return input
    .replace(EMOJI_STRIP_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .trim();
}

const INK = '#140f0a';

function renderIconArtwork(name: EmpireIconName): React.ReactNode {
  switch (name) {
    case 'wood':
      // Illuminated Emerald Pine (#4ade80 sunlit boughs, #16a34a shade, oak trunk)
      return (
        <>
          <rect
            x="9.8"
            y="16.5"
            width="4.4"
            height="5.2"
            rx="0.8"
            fill="#92400e"
            stroke={INK}
            strokeWidth="1.2"
          />
          <polygon
            points="12,9.2 3.2,17.8 20.8,17.8"
            fill="#16a34a"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <polygon points="12,9.2 12,17.8 20.8,17.8" fill="#4ade80" />
          <polygon
            points="12,9.2 3.2,17.8 20.8,17.8"
            fill="none"
            stroke={INK}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon
            points="12,5.1 5,13.1 19,13.1"
            fill="#16a34a"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <polygon points="12,5.1 12,13.1 19,13.1" fill="#4ade80" />
          <polygon
            points="12,5.1 5,13.1 19,13.1"
            fill="none"
            stroke={INK}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon
            points="12,1.8 6.8,8.6 17.2,8.6"
            fill="#22c55e"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <polygon points="12,1.8 12,8.6 17.2,8.6" fill="#86efac" />
          <polygon
            points="12,1.8 6.8,8.6 17.2,8.6"
            fill="none"
            stroke={INK}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </>
      );

    case 'food':
      // Warm Amber Roasted Haunch & Bone (#fb923c glaze, #ea580c shade, ivory bone)
      return (
        <>
          <path
            d="M6.4 16.2L3.3 19.3C2.5 19.1 1.9 19.8 2.2 20.7C2.6 21.6 3.6 21.8 4.2 21.1C4.9 21.8 5.9 21.6 6.2 20.7C6.4 19.9 5.9 19.2 5.3 19L8.4 15.9Z"
            fill="#f8fafc"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M8.2 17.6C6.2 15.6 6.5 11.7 9.6 8.6L13.1 5.1C15.9 2.3 19.6 2.5 21.1 4.9C22.5 7.2 21.6 10.9 18.8 13.7L15.4 17.1C12.7 19.8 9.9 19.3 8.2 17.6Z"
            fill="#fb923c"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M11.2 18.2C12.8 18.5 14.3 17.9 15.8 16.4L19.1 13.1C21.1 11.1 21.8 8.4 21 6.3C19.6 9.4 15.5 14.3 11.2 18.2Z"
            fill="#ea580c"
          />
          <ellipse
            cx="14.2"
            cy="8.3"
            rx="3.4"
            ry="1.5"
            transform="rotate(-42 14.2 8.3)"
            fill="#fed7aa"
            opacity="0.85"
          />
        </>
      );

    case 'gold':
      // Gleaming Stamped Gold Sovereign (#facc15 face, #fef08a gleam, royal cross)
      return (
        <>
          <circle cx="12" cy="12" r="9.4" fill="#eab308" stroke={INK} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="7.4" fill="#facc15" stroke="#b45309" strokeWidth="1.1" />
          <path
            d="M6.8 9.2A6.2 6.2 0 0 1 15.4 6.6"
            fill="none"
            stroke="#fef9c3"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M12 7.5V16.5M7.5 12H16.5"
            stroke="#92400e"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="1.9" fill="#fef08a" stroke="#92400e" strokeWidth="0.9" />
        </>
      );

    case 'keep':
    case 'pop':
      // Ashlar Stone Keep (#cbd5e1 masonry, battlements, arched gatehouse)
      return (
        <>
          <path
            d="M4 21V8.5H7V10.5H9.5V8.5H14.5V10.5H17V8.5H20V21Z"
            fill="#94a3b8"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path d="M4.7 20.3V9.2H6.4V11.2H10.2V9.2H12V20.3Z" fill="#e2e8f0" />
          <path
            d="M7.5 8.5V4H10V5.8H14V4H16.5V8.5Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M9.6 21V15.6C9.6 14.2 10.7 13.2 12 13.2C13.3 13.2 14.4 14.2 14.4 15.6V21Z"
            fill="#1e1b18"
            stroke="#f5b942"
            strokeWidth="0.9"
          />
          <rect x="6.5" y="13" width="1.6" height="3" rx="0.6" fill="#1e293b" />
          <rect x="15.9" y="13" width="1.6" height="3" rx="0.6" fill="#1e293b" />
        </>
      );

    case 'crown':
      // Royal Jeweled Crown (#f5b942 burnished gold, ruby & sapphire cabochons)
      return (
        <>
          <path
            d="M3.2 18.2L2.2 8.4L7.6 12.2L12 5.2L16.4 12.2L21.8 8.4L20.8 18.2Z"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M3.8 17.5L3 9.7L7.6 12.9L12 6.2V17.5Z" fill="#fde68a" opacity="0.65" />
          <rect
            x="3.2"
            y="17.2"
            width="17.6"
            height="3.3"
            rx="1"
            fill="#d97706"
            stroke={INK}
            strokeWidth="1.3"
          />
          <circle cx="12" cy="14" r="1.5" fill="#dc2626" stroke={INK} strokeWidth="0.8" />
          <circle cx="6.8" cy="15" r="1.1" fill="#2563eb" stroke={INK} strokeWidth="0.7" />
          <circle cx="17.2" cy="15" r="1.1" fill="#2563eb" stroke={INK} strokeWidth="0.7" />
          <circle cx="12" cy="4.4" r="1.3" fill="#fef08a" stroke={INK} strokeWidth="0.9" />
        </>
      );

    case 'skull':
      // Fallen Keep Skull (#cbd5e1 bone cranium for 0-crown defeat rows)
      return (
        <>
          <path
            d="M12 3.2C7.4 3.2 4.4 6.3 4.4 10.6C4.4 13.3 5.7 15.4 7.5 16.5V19.8H16.5V16.5C18.3 15.4 19.6 13.3 19.6 10.6C19.6 6.3 16.6 3.2 12 3.2Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M12 3.9C8.2 3.9 5.3 6.6 5.3 10.5C5.3 12.7 6.3 14.5 7.8 15.5"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="9.1" cy="11.2" r="2" fill={INK} />
          <circle cx="14.9" cy="11.2" r="2" fill={INK} />
          <polygon points="12,13.2 10.9,15.3 13.1,15.3" fill={INK} />
          <line x1="10.2" y1="17.4" x2="10.2" y2="19.6" stroke={INK} strokeWidth="1.2" />
          <line x1="13.8" y1="17.4" x2="13.8" y2="19.6" stroke={INK} strokeWidth="1.2" />
        </>
      );

    case 'flame':
      // Conqueror Streak Flame (#f97316 outer blaze, #fde047 heart)
      return (
        <>
          <path
            d="M12.6 2.1C13.2 5.6 10.8 7.5 10.9 9.9C11 11.1 12 11.8 12.9 11.2C13.6 10.7 14 9.5 13.9 8.4C16.9 10.2 18.8 13 18.5 16.2C18.1 19.5 15.4 21.8 12 21.8C8.4 21.8 5.5 19.2 5.5 15.4C5.5 11.3 8.5 7.9 12.6 2.1Z"
            fill="#f97316"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M12.1 11.6C14.1 13.1 15.1 14.9 14.9 16.9C14.7 18.8 13.5 20.1 12 20.1C10.3 20.1 9 18.7 9 16.8C9 14.8 10.3 13.2 12.1 11.6Z"
            fill="#fde047"
          />
        </>
      );

    case 'horn':
      // Brass War Horn (#f59e0b curved bugle, #fde68a flared bell, crimson cord)
      return (
        <>
          <path
            d="M7.5 14.2C9.2 17.8 13.8 18.2 16 14.8"
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M3.2 8.2C3.2 6.8 4.2 5.5 5.6 5.2C10.5 10.2 15.2 11.8 18.9 9.1L21.2 7.2V16.8L18.8 14.9C13.8 16.8 7.5 14.5 4.2 9.8C3.5 9.4 3.2 8.8 3.2 8.2Z"
            fill="#f59e0b"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <ellipse
            cx="20.6"
            cy="12"
            rx="1.6"
            ry="4.8"
            fill="#fde68a"
            stroke={INK}
            strokeWidth="1.2"
          />
          <line x1="11.2" y1="9.8" x2="10.2" y2="14.1" stroke="#92400e" strokeWidth="1.4" />
          <line x1="15.2" y1="10.3" x2="14.8" y2="15.2" stroke="#92400e" strokeWidth="1.4" />
        </>
      );

    case 'speaker':
      // Brass Heraldic Audio Horn + Sound Waves
      return (
        <>
          <path
            d="M3.5 9.4H7.4L13.2 4.6V19.4L7.4 14.6H3.5Z"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path d="M4.2 10.1H7.5L12.4 6.1V12H4.2Z" fill="#fde68a" opacity="0.65" />
          <path
            d="M16.2 8.6C17.6 10.2 17.6 13.8 16.2 15.4"
            fill="none"
            stroke="#fde68a"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M18.9 6.2C21.2 9.2 21.2 14.8 18.9 17.8"
            fill="none"
            stroke="#f5b942"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      );

    case 'mute':
      // Muted Horn + Crimson Slash Cross
      return (
        <>
          <path
            d="M3.5 9.4H7.4L13.2 4.6V19.4L7.4 14.6H3.5Z"
            fill="#94a3b8"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M16.2 9.2L21 14.8M21 9.2L16.2 14.8"
            stroke="#f87171"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </>
      );

    case 'retreat':
      // White Retreat / Truce Banner on Brass-Tipped Oak Staff
      return (
        <>
          <line
            x1="5.5"
            y1="3.5"
            x2="5.5"
            y2="21"
            stroke="#b45309"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <circle cx="5.5" cy="3.2" r="1.5" fill="#f5b942" stroke={INK} strokeWidth="0.9" />
          <path
            d="M6.4 4.8C9.8 3.6 12.8 6.2 16.2 5.1C17.8 4.6 19.2 4.8 20.4 5.3L18.2 9.4L20.4 13.5C17 14.5 13.6 12.2 10.2 13.4C8.8 13.9 7.5 14 6.4 13.7Z"
            fill="#f8fafc"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M11.5 5.4C13.2 6 14.8 6.2 16.4 5.7V12.8C14.8 13 13.1 12.6 11.5 12Z"
            fill="#cbd5e1"
          />
        </>
      );

    case 'villager':
      // Yeoman Sun-Hat & Builder's Mallet
      return (
        <>
          <line
            x1="6.2"
            y1="20.2"
            x2="16.4"
            y2="10"
            stroke="#92400e"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <rect
            x="13.2"
            y="6.8"
            width="7.4"
            height="4.4"
            rx="1"
            transform="rotate(45 16.9 9)"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.3"
          />
          <path
            d="M3.2 11.2C5.2 9.8 7.5 9.2 10.2 9.2C12.9 9.2 15.2 9.8 17.2 11.2H3.2Z"
            fill="#d97706"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M6.1 9.4C6.6 6 8.2 4.2 10.2 4.2C12.2 4.2 13.8 6 14.3 9.4Z"
            fill="#fbbf24"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </>
      );

    case 'swords':
    case 'militia':
      // Crossed Broadswords (#e2e8f0 steel blades, #f5b942 brass crossguards)
      return (
        <>
          {/* Sword 1: bottom-left to top-right */}
          <polygon
            points="7.8,14.2 18.8,3.2 20.8,3.2 20.8,5.2 9.8,16.2"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <line x1="9.2" y1="14.8" x2="19.8" y2="4.2" stroke="#f8fafc" strokeWidth="1" />
          <line
            x1="5.8"
            y1="12.6"
            x2="11.4"
            y2="18.2"
            stroke="#f5b942"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line
            x1="4"
            y1="20"
            x2="7.6"
            y2="16.4"
            stroke="#78350f"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="3.6" cy="20.4" r="1.4" fill="#f5b942" stroke={INK} strokeWidth="0.9" />

          {/* Sword 2: bottom-right to top-left */}
          <polygon
            points="16.2,14.2 5.2,3.2 3.2,3.2 3.2,5.2 14.2,16.2"
            fill="#e2e8f0"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <line
            x1="18.2"
            y1="12.6"
            x2="12.6"
            y2="18.2"
            stroke="#f5b942"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line
            x1="20"
            y1="20"
            x2="16.4"
            y2="16.4"
            stroke="#78350f"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="20.4" cy="20.4" r="1.4" fill="#f5b942" stroke={INK} strokeWidth="0.9" />
        </>
      );

    case 'pikeman':
      // Steel Halberd Pike on Ash Polearm + Crimson Tassel
      return (
        <>
          <line
            x1="4.2"
            y1="20.8"
            x2="18.2"
            y2="5.4"
            stroke="#a16207"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <path
            d="M12.2 11.8C10.5 12.6 9.5 14 9.6 15.5"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Armor-piercing top spike */}
          <polygon
            points="16.5,6.9 21.2,2.2 18.2,8.5"
            fill="#f8fafc"
            stroke={INK}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Broad crescent axe head */}
          <path
            d="M14.8 7.5C11.2 4.8 7.8 5.2 6.8 7.8C9.2 8.2 10.6 9.6 11 12L15.4 9.2Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          {/* Back fluke hook */}
          <polygon
            points="15.8,9.2 19.6,11.8 16.5,12.2 14.2,10.6"
            fill="#94a3b8"
            stroke={INK}
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="9" r="1.3" fill="#f5b942" stroke={INK} strokeWidth="0.8" />
        </>
      );

    case 'archer':
      // Seasoned Yew Longbow & Fletched Arrow
      return (
        <>
          {/* Taut bowstring */}
          <line x1="6.4" y1="3.8" x2="18.8" y2="18.2" stroke="#cbd5e1" strokeWidth="1.15" />
          {/* Curved yew stave */}
          <path
            d="M6.2 3.5C15.5 3.2 20.5 9.2 19 18.5"
            fill="none"
            stroke={INK}
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path
            d="M6.2 3.5C15.5 3.2 20.5 9.2 19 18.5"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          {/* Fletching */}
          <polygon
            points="4.2,17.2 7.2,16.8 7.6,19.8 4.8,20.2"
            fill="#4ade80"
            stroke={INK}
            strokeWidth="0.9"
          />
          {/* Arrow shaft */}
          <line
            x1="5.5"
            y1="18.8"
            x2="18.6"
            y2="5.6"
            stroke="#f8fafc"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Broadhead steel tip */}
          <polygon
            points="20.6,3.6 15.6,5.2 19,8.6"
            fill="#e2e8f0"
            stroke={INK}
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
        </>
      );

    case 'knight':
      // Armored Warhorse Charger & Royal Plume
      return (
        <>
          {/* Royal crest plume */}
          <path
            d="M9.5 3.4C6.2 3.8 4.4 6.5 4.8 9.8C6.5 8.5 7.8 7.9 9.5 7.8Z"
            fill="#3b82f6"
            stroke={INK}
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          {/* Charger neck & barded head */}
          <path
            d="M6.2 20.5L7.4 12.2C7.8 8.2 10.2 4.8 13.6 4.2L15.2 2.6L16.2 5.2L20.4 8.6L19.2 11.8L15.4 11.2L13.8 14.4L16.8 20.5Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M8 19.8L8.9 12.5C9.2 9.1 11.1 6.2 13.8 5.4L18.9 9.1L18.2 10.7L14.6 10.2L12.5 14.3L14.8 19.8Z"
            fill="#f1f5f9"
          />
          {/* Golden chamfron & reins */}
          <line
            x1="14.2"
            y1="5.2"
            x2="19.5"
            y2="9.2"
            stroke="#f5b942"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="14.8" cy="7.5" r="1" fill={INK} />
          {/* Shoulder heater shield */}
          <path
            d="M7.2 13.5L12.2 13.5V16.8C12.2 18.8 10.6 20.1 9.7 20.6C8.8 20.1 7.2 18.8 7.2 16.8Z"
            fill="#2563eb"
            stroke="#f5b942"
            strokeWidth="1.2"
          />
        </>
      );

    case 'monk':
      // Sacred Relic Cross & Golden Chalice Aura (#f5b942 + #c084fc Wololo glow)
      return (
        <>
          <circle
            cx="12"
            cy="10.5"
            r="7.8"
            fill="#a855f7"
            fillOpacity="0.22"
            stroke="#c084fc"
            strokeWidth="1.1"
            strokeDasharray="2.2 1.8"
          />
          <path
            d="M10.2 3.2H13.8V7.6H18.2V11.2H13.8V20.8H10.2V11.2H5.8V7.6H10.2Z"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path d="M11 4H13V8.4H17.4V9.8H13V19.8H11V9.8H6.6V8.4H11Z" fill="#fef08a" opacity="0.7" />
          <circle cx="12" cy="9.4" r="1.8" fill="#a855f7" stroke={INK} strokeWidth="0.9" />
        </>
      );

    case 'camp':
    case 'homestead':
      // Timber Supply Homestead Camp (#f59e0b pitched gable, log walls, warm hearth)
      return (
        <>
          <rect
            x="4.8"
            y="11.5"
            width="14.4"
            height="9"
            rx="0.8"
            fill="#78350f"
            stroke={INK}
            strokeWidth="1.3"
          />
          <polygon
            points="12,3.4 2.4,12.2 21.6,12.2"
            fill="#d97706"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polygon points="12,4.3 4.2,11.5 12,11.5" fill="#fbbf24" />
          <path
            d="M9.8 20.5V14.8C9.8 13.7 10.8 13 12 13C13.2 13 14.2 13.7 14.2 14.8V20.5Z"
            fill="#fde68a"
            stroke={INK}
            strokeWidth="1.1"
          />
        </>
      );

    case 'barracks':
      // Garrison Barracks (stone walls, crimson roof, bossed golden shield)
      return (
        <>
          <rect
            x="3.8"
            y="10.2"
            width="16.4"
            height="10.4"
            rx="0.8"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.3"
          />
          <polygon
            points="12,3.2 2.4,10.8 21.6,10.8"
            fill="#dc2626"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polygon points="12,4.1 4.2,10.2 12,10.2" fill="#f87171" opacity="0.65" />
          <path
            d="M9 12.2H15V15.8C15 17.8 13.5 19.1 12 19.7C10.5 19.1 9 17.8 9 15.8Z"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.15"
          />
          <circle cx="12" cy="15.4" r="1.2" fill="#991b1b" />
        </>
      );

    case 'range':
    case 'archery_range':
      // Fletcher Archery Target on Tripod + Bullseye Arrow
      return (
        <>
          <line
            x1="8.2"
            y1="15.5"
            x2="5.6"
            y2="21.2"
            stroke="#92400e"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="15.8"
            y1="15.5"
            x2="18.4"
            y2="21.2"
            stroke="#92400e"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="10.8" r="7.8" fill="#f8fafc" stroke={INK} strokeWidth="1.35" />
          <circle cx="12" cy="10.8" r="5.3" fill="#dc2626" />
          <circle cx="12" cy="10.8" r="2.6" fill="#facc15" stroke={INK} strokeWidth="0.8" />
          <line
            x1="12"
            y1="10.8"
            x2="20.5"
            y2="3.2"
            stroke={INK}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <line
            x1="12"
            y1="10.8"
            x2="20.5"
            y2="3.2"
            stroke="#fde68a"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      );

    case 'stable':
      // Timber Cavalry Stable & Golden Horseshoe
      return (
        <>
          <path
            d="M3.6 10.5L12 3.5L20.4 10.5V20.5H3.6Z"
            fill="#78350f"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polyline
            points="2.4,11.2 12,3.2 21.6,11.2"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.8 18V13.4C8.8 11.4 10.2 10 12 10C13.8 10 15.2 11.4 15.2 13.4V18"
            fill="none"
            stroke="#fde047"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </>
      );

    case 'monastery':
      // Gothic Abbey Chapel with Rose Window & Golden Cross
      return (
        <>
          <line
            x1="12"
            y1="1.8"
            x2="12"
            y2="6.6"
            stroke="#f5b942"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="9.8"
            y1="3.8"
            x2="14.2"
            y2="3.8"
            stroke="#f5b942"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <polygon
            points="12,6.2 4.2,12.5 4.2,20.8 19.8,20.8 19.8,12.5"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polyline
            points="3.2,13.1 12,5.8 20.8,13.1"
            fill="none"
            stroke="#a855f7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11.6" r="2.1" fill="#a855f7" stroke={INK} strokeWidth="0.95" />
          <path
            d="M10 20.8V16.6C10 15.4 10.9 14.6 12 14.6C13.1 14.6 14 15.4 14 16.6V20.8Z"
            fill="#312e81"
            stroke={INK}
            strokeWidth="1"
          />
        </>
      );

    case 'tower':
    case 'watchtower':
      // Crenellated Stone Watchtower & Pennon
      return (
        <>
          <line x1="12" y1="1.8" x2="12" y2="5.5" stroke="#f5b942" strokeWidth="1.5" />
          <polygon points="12,2 18,3.6 12,5.1" fill="#ef4444" stroke={INK} strokeWidth="0.8" />
          <polygon
            points="7.2,9 16.8,9 18.2,21 5.8,21"
            fill="#94a3b8"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polygon points="7.8,9.6 12,9.6 12,20.3 6.6,20.3" fill="#e2e8f0" />
          <path
            d="M5.6 5.2H8.4V7H10.6V5.2H13.4V7H15.6V5.2H18.4V9.4H5.6Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <rect x="11" y="12.2" width="2" height="4.4" rx="0.8" fill={INK} />
        </>
      );

    case 'town_center':
      // Citadel Town Center
      return (
        <>
          <rect
            x="3.5"
            y="10.5"
            width="17"
            height="10"
            rx="0.8"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.3"
          />
          <polygon
            points="12,3.4 2.5,11 21.5,11"
            fill="#2563eb"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <rect x="10" y="14.5" width="4" height="6" rx="1.5" fill="#1e293b" />
        </>
      );

    case 'trophy':
      // Royal Gold Trophy Chalice
      return (
        <>
          <path
            d="M6.8 5.4H3.8C3.6 9.2 5.4 11.4 8.2 11.8M17.2 5.4H20.2C20.4 9.2 18.6 11.4 15.8 11.8"
            fill="none"
            stroke="#f5b942"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M6.5 3.6H17.5V9.2C17.5 12.6 15.1 14.8 12 14.8C8.9 14.8 6.5 12.6 6.5 9.2Z"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path d="M7.4 4.4H12V14C9.5 13.8 7.4 11.9 7.4 9.1Z" fill="#fef08a" opacity="0.65" />
          <rect x="10.5" y="14.6" width="3" height="3.6" fill="#d97706" stroke={INK} strokeWidth="1.1" />
          <rect
            x="7.2"
            y="18"
            width="9.6"
            height="2.8"
            rx="1"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.25"
          />
          <circle cx="12" cy="8.6" r="1.4" fill="#ef4444" stroke={INK} strokeWidth="0.75" />
        </>
      );

    case 'forge':
      // Blacksmith Horned Anvil & Forge Sparks
      return (
        <>
          {/* Forge sparks */}
          <polygon points="12,2.2 13,4.8 15.6,5.6 13,6.4 12,9 11,6.4 8.4,5.6 11,4.8" fill="#fde047" />
          {/* Horned iron anvil */}
          <path
            d="M2.6 11.4L7.8 9.8H19.8V13.2L16.4 14.6L17.8 19.8H6.8L8.4 14.6L2.6 11.4Z"
            fill="#94a3b8"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path d="M4.5 11.3L8.2 10.4H19V12H8.4Z" fill="#e2e8f0" />
          <rect
            x="5.4"
            y="19.2"
            width="13.8"
            height="2.4"
            rx="0.8"
            fill="#78350f"
            stroke={INK}
            strokeWidth="1.15"
          />
        </>
      );

    case 'hammer':
      // Forged Smith / Mason War-Hammer
      return (
        <>
          <line
            x1="5.2"
            y1="19.8"
            x2="15.2"
            y2="9.8"
            stroke="#92400e"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <polygon
            points="10.6,6.2 15.2,2.8 20.8,8.4 17.4,13 11.8,7.4"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polygon points="11.6,6.3 15.1,3.7 17.8,6.4 14.3,9" fill="#f8fafc" />
          <circle cx="15" cy="8.2" r="1.2" fill="#f5b942" />
        </>
      );

    case 'scroll':
      // Rolled Vellum Decree Scroll with Wax Seal
      return (
        <>
          <path
            d="M6.2 4.2H18.4C19.6 4.2 20.4 5.1 20.4 6.2C20.4 7.3 19.6 8.2 18.4 8.2H17.6V18.2C17.6 19.5 16.6 20.4 15.2 20.4H5.4C4.2 20.4 3.4 19.5 3.4 18.4C3.4 17.3 4.2 16.4 5.4 16.4H6.2Z"
            fill="#fef3c7"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <line x1="9" y1="9.2" x2="15" y2="9.2" stroke="#92400e" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9" y1="12.4" x2="14.6" y2="12.4" stroke="#92400e" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9" y1="15.4" x2="12.6" y2="15.4" stroke="#92400e" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="15.4" cy="17.2" r="2.3" fill="#dc2626" stroke={INK} strokeWidth="1" />
        </>
      );

    case 'quill':
      // Illuminated Feather Quill & Ink Nib
      return (
        <>
          <path
            d="M20.4 3.2C14.2 3.6 9.2 7.8 6.8 14.6L11.2 14.2L9.4 16.4C14.8 15.2 19.2 10.6 20.4 3.2Z"
            fill="#fef3c7"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M20 3.7C15.2 4.5 10.8 8 8.2 13.8"
            fill="none"
            stroke="#f5b942"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <line
            x1="15.8"
            y1="8.2"
            x2="4.2"
            y2="20.4"
            stroke="#f5b942"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      );

    case 'scout':
      // Brass Recon Spyglass & Lens Glint
      return (
        <>
          <polygon
            points="3.4,17.8 6.2,20.6 11.4,14.8 9.2,12.6"
            fill="#b45309"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <polygon
            points="8.8,13 11,15.2 19.8,7.6 16.4,4.2"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <ellipse
            cx="18.4"
            cy="5.8"
            rx="2"
            ry="3.2"
            transform="rotate(-45 18.4 5.8)"
            fill="#38bdf8"
            stroke={INK}
            strokeWidth="1.2"
          />
          <circle cx="18.9" cy="5.2" r="0.9" fill="#ffffff" />
          <polygon points="7,4.2 7.7,6 9.5,6.7 7.7,7.4 7,9.2 6.3,7.4 4.5,6.7 6.3,6" fill="#fde047" />
        </>
      );

    case 'wololo':
      // Illuminated Sacred Relic Starburst
      return (
        <>
          <polygon
            points="12,2 14.4,9.6 22,12 14.4,14.4 12,22 9.6,14.4 2,12 9.6,9.6"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <polygon
            points="12,4.8 13.5,10.5 19.2,12 13.5,13.5 12,19.2 10.5,13.5 4.8,12 10.5,10.5"
            fill="#fef08a"
          />
          <circle cx="18.2" cy="5.8" r="1.4" fill="#fb923c" />
          <circle cx="5.8" cy="18.2" r="1.2" fill="#fde047" />
        </>
      );

    case 'hourglass':
      // Brass Siege Hourglass
      return (
        <>
          <path
            d="M6.4 3.8H17.6C17.6 8.2 14.4 10.4 12 12C9.6 13.6 6.4 15.8 6.4 20.2H17.6C17.6 15.8 14.4 13.6 12 12C9.6 10.4 6.4 8.2 6.4 3.8Z"
            fill="#bae6fd"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <polygon points="8.2,19.4 15.8,19.4 12,15.2" fill="#fb923c" />
          <polygon points="9.2,6.6 14.8,6.6 12,9.8" fill="#fb923c" />
          <rect
            x="4.8"
            y="2.4"
            width="14.4"
            height="2.2"
            rx="0.9"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.15"
          />
          <rect
            x="4.8"
            y="19.4"
            width="14.4"
            height="2.2"
            rx="0.9"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.15"
          />
        </>
      );

    case 'shield':
      // Sapphire Heraldic Heater Shield
      return (
        <>
          <path
            d="M12 2.4L20.2 5.6V11.8C20.2 16.8 16.6 20.2 12 21.8C7.4 20.2 3.8 16.8 3.8 11.8V5.6L12 2.4Z"
            fill="#1d4ed8"
            stroke="#f5b942"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M12 3.8V20.2C8.3 18.8 5.2 15.9 5.2 11.8V6.6L12 3.8Z" fill="#3b82f6" />
          <circle cx="12" cy="11.6" r="2.2" fill="#fde047" stroke={INK} strokeWidth="0.9" />
        </>
      );

    case 'fleur':
      // Golden Fleur-de-Lis
      return (
        <>
          <path
            d="M12 2.2C14.2 5.4 14.6 8.8 13.2 12.2C15.2 9.4 18.4 8.6 20.4 10.6C21.2 12.6 19.4 14.8 16.4 14.6H13.6L14.8 19.6L12 21.8L9.2 19.6L10.4 14.6H7.6C4.6 14.8 2.8 12.6 3.6 10.6C5.6 8.6 8.8 9.4 10.8 12.2C9.4 8.8 9.8 5.4 12 2.2Z"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <rect x="7.8" y="13.8" width="8.4" height="2" rx="0.8" fill="#fef08a" stroke={INK} strokeWidth="0.9" />
        </>
      );

    case 'map':
      // Unfurled Cartographer Battle Map
      return (
        <>
          <polygon
            points="2.8,5.6 8.8,3.6 15.2,5.8 21.2,3.8 21.2,18.4 15.2,20.4 8.8,18.2 2.8,20.2"
            fill="#fde68a"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polygon points="8.8,3.6 15.2,5.8 15.2,20.4 8.8,18.2" fill="#f5b942" opacity="0.55" />
          <path
            d="M5.4 14.6C7.6 11.4 10.4 13.2 12.8 10.4"
            fill="none"
            stroke="#15803d"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="1.8 1.8"
          />
          <path
            d="M15.4 9.4L18.8 12.8M18.8 9.4L15.4 12.8"
            stroke="#dc2626"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      );

    case 'medal':
      // Royal Valor Medallion
      return (
        <>
          <polygon
            points="7.2,2.6 11.2,2.6 12.8,9.4 9.4,9.4"
            fill="#dc2626"
            stroke={INK}
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <polygon
            points="16.8,2.6 12.8,2.6 11.2,9.4 14.6,9.4"
            fill="#ef4444"
            stroke={INK}
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="14.6" r="6.4" fill="#f5b942" stroke={INK} strokeWidth="1.35" />
          <polygon
            points="12,10.4 13.2,13.1 16.1,13.4 13.9,15.3 14.5,18.1 12,16.6 9.5,18.1 10.1,15.3 7.9,13.4 10.8,13.1"
            fill="#fef08a"
          />
        </>
      );

    case 'bolt':
      // Golden Blitz Thunderbolt
      return (
        <polygon
          points="13.8,2.2 5.4,13.2 11.4,13.2 9.8,21.8 18.8,10.6 12.8,10.6"
          fill="#fde047"
          stroke={INK}
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
      );

    case 'alert':
      // Heraldic Warning Pennon Triangle
      return (
        <>
          <polygon
            points="12,2.8 21.6,19.8 2.4,19.8"
            fill="#f59e0b"
            stroke={INK}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <line x1="12" y1="8.8" x2="12" y2="14.2" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="17.1" r="1.25" fill={INK} />
        </>
      );

    case 'check':
      // Emerald Wax-Seal Check
      return (
        <>
          <circle cx="12" cy="12" r="9.2" fill="#22c55e" stroke={INK} strokeWidth="1.35" />
          <polyline
            points="7.4,12.3 10.6,15.6 16.8,8.8"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );

    case 'copy':
      // Twin Parchment Chronicle Sheets
      return (
        <>
          <rect
            x="4.2"
            y="3.2"
            width="11.6"
            height="14.4"
            rx="1.6"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.25"
          />
          <rect
            x="8.2"
            y="6.4"
            width="11.6"
            height="14.4"
            rx="1.6"
            fill="#fef3c7"
            stroke={INK}
            strokeWidth="1.3"
          />
          <line x1="10.8" y1="10.6" x2="17.2" y2="10.6" stroke="#92400e" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="10.8" y1="13.8" x2="17.2" y2="13.8" stroke="#92400e" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="10.8" y1="17" x2="14.8" y2="17" stroke="#92400e" strokeWidth="1.3" strokeLinecap="round" />
        </>
      );

    case 'key':
      // Ornate Brass Fortress Key
      return (
        <>
          <circle cx="8" cy="12" r="5" fill="#f5b942" stroke={INK} strokeWidth="1.35" />
          <circle cx="8" cy="12" r="1.9" fill={INK} />
          <path
            d="M12.6 12H21.2V15.8H19V13.8H17.2V16.6H15V12"
            fill="#fde68a"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </>
      );

    case 'target':
      // Siege Crosshair Reticle
      return (
        <>
          <circle cx="12" cy="12" r="7.6" fill="none" stroke="#fca5a5" strokeWidth="2" />
          <line x1="12" y1="2.2" x2="12" y2="6.8" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17.2" x2="12" y2="21.8" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
          <line x1="2.2" y1="12" x2="6.8" y2="12" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
          <line x1="17.2" y1="12" x2="21.8" y2="12" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2.6" fill="#fde047" stroke={INK} strokeWidth="0.9" />
        </>
      );

    case 'close':
      // Crisp Beveled Cross
      return (
        <path
          d="M6.2 6.2L17.8 17.8M17.8 6.2L6.2 17.8"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      );

    case 'fish':
      // Curved Silver-Blue Leaping Trout + Water Droplets & Ripple
      return (
        <>
          <path
            d="M3.4 19.6Q8 17.8 12.4 19.5T20.6 19.2"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <polygon
            points="10.2,6.5 12.5,3.4 14.5,6.3"
            fill="#0284c7"
            stroke={INK}
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <polygon
            points="5.8,15.2 2.2,13.4 3.7,16.4 2.4,19.2 6.6,17"
            fill="#38bdf8"
            stroke={INK}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 15.8C6.9 9 12.2 5 18.8 9.6C16.2 13.8 11.4 14.2 6.3 16.9Z"
            fill="#e2e8f0"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M6.2 14.3C7.9 9.3 12.5 6 18.2 9.6C14.8 10.7 10.4 11.5 6.2 14.3Z"
            fill="#38bdf8"
          />
          <path
            d="M8.6 12.5Q12.8 9.9 16.3 10.5"
            fill="none"
            stroke="#fda4af"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
          <circle cx="15.5" cy="9.6" r="1.05" fill={INK} />
          <path
            d="M20.2 3.2C21.5 5 21.8 6.2 20.2 6.9C18.6 6.2 18.9 5 20.2 3.2Z"
            fill="#7dd3fc"
            stroke={INK}
            strokeWidth="1.05"
            strokeLinejoin="round"
          />
          <circle cx="17.5" cy="4.3" r="1" fill="#bae6fd" />
        </>
      );

    case 'horse':
      // Classic AoE / Chess Steed Profile Head & Flowing Mane
      return (
        <>
          <path
            d="M9.4 4.4C5.6 5.8 3.8 10 4.4 15.8L8.2 14.8Z"
            fill="#451a03"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M5.8 20.8L7 13.2C7.4 8.8 9.6 5.6 12.8 4.6L14 2.2L15.6 4.8L20.4 8.8C21 9.6 20.6 11.2 19.4 11.8L15.6 11.6L14 14.8L16.6 20.8Z"
            fill="#b4692e"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M7.7 19.8L8.6 13C9 9.4 10.8 6.6 13.3 5.6L18.8 9.4L18 10.6L14.6 10.4L12.6 14.6L14.7 19.8Z"
            fill="#d97706"
          />
          <line
            x1="13.2"
            y1="5.8"
            x2="18.3"
            y2="10.8"
            stroke="#f5b942"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <circle cx="14.5" cy="7.6" r="1.05" fill={INK} />
          <circle cx="18.8" cy="10" r="0.7" fill={INK} />
        </>
      );

    case 'farm':
      // Golden Age-of-Empires Wheat Sheaf & Tilled Furrow
      return (
        <>
          <path
            d="M3.4 20.2Q12 18.4 20.6 20.2"
            fill="none"
            stroke="#92400e"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <path
            d="M10.4 19.2Q8.6 13.5 5.6 6.8M12 19.4V4.2M13.6 19.2Q15.4 13.5 18.4 6.8"
            fill="none"
            stroke="#d97706"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <ellipse
            cx="6.8"
            cy="8.6"
            rx="2.1"
            ry="4.3"
            transform="rotate(-26 6.8 8.6)"
            fill="#facc15"
            stroke={INK}
            strokeWidth="1.15"
          />
          <ellipse
            cx="17.2"
            cy="8.6"
            rx="2.1"
            ry="4.3"
            transform="rotate(26 17.2 8.6)"
            fill="#facc15"
            stroke={INK}
            strokeWidth="1.15"
          />
          <ellipse
            cx="12"
            cy="7.6"
            rx="2.3"
            ry="4.8"
            fill="#fde047"
            stroke={INK}
            strokeWidth="1.2"
          />
          <line x1="12" y1="9.2" x2="12" y2="4.4" stroke="#b45309" strokeWidth="1" />
          <rect
            x="8.6"
            y="14.2"
            width="6.8"
            height="2.4"
            rx="1"
            fill="#dc2626"
            stroke={INK}
            strokeWidth="1.15"
          />
        </>
      );

    case 'wall':
    case 'stone_wall':
      // Crenelated Ashlar Stone Fortification Wall Segment
      return (
        <>
          <path
            d="M2.6 20.2V6.2H7.2V9.2H9.6V6.2H14.4V9.2H16.8V6.2H21.4V20.2Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M3.4 7H6.4V9.9H10.4V7H13.6V9.9H17.6V7H20.6V13.2H3.4Z"
            fill="#e2e8f0"
          />
          <rect x="3.4" y="16.8" width="17.2" height="2.7" fill="#94a3b8" />
          <line x1="2.8" y1="13.2" x2="21.2" y2="13.2" stroke={INK} strokeWidth="1.2" />
          <line x1="2.8" y1="16.8" x2="21.2" y2="16.8" stroke={INK} strokeWidth="1.2" />
          <line x1="12" y1="9.2" x2="12" y2="13.2" stroke={INK} strokeWidth="1.2" />
          <line x1="8.2" y1="13.2" x2="8.2" y2="16.8" stroke={INK} strokeWidth="1.2" />
          <line x1="15.8" y1="13.2" x2="15.8" y2="16.8" stroke={INK} strokeWidth="1.2" />
          <line x1="12" y1="16.8" x2="12" y2="20.2" stroke={INK} strokeWidth="1.2" />
          <rect x="10.6" y="10.2" width="2.8" height="2.2" rx="0.4" fill="#2563eb" />
        </>
      );

    case 'settings':
      // Sleek Forged Steel & Brass Gear Cog
      return (
        <>
          <path
            d="M19.32 10.36L21.7 10.63L21.7 13.37L19.32 13.64L18.33 16.02L19.83 17.89L17.89 19.83L16.02 18.33L13.64 19.32L13.37 21.7L10.63 21.7L10.36 19.32L7.98 18.33L6.11 19.83L4.17 17.89L5.67 16.02L4.68 13.64L2.3 13.37L2.3 10.63L4.68 10.36L5.67 7.98L4.17 6.11L6.11 4.17L7.98 5.67L10.36 4.68L10.63 2.3L13.37 2.3L13.64 4.68L16.02 5.67L17.89 4.17L19.83 6.11L18.33 7.98Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="4.6" fill="#f5b942" stroke={INK} strokeWidth="1.2" />
          <circle cx="12" cy="12" r="2.1" fill={INK} />
        </>
      );

    case 'raid':
      // Crossed Bearded Battle Axes & Crimson Clash Shield
      return (
        <>
          <line
            x1="4.2"
            y1="20.4"
            x2="18.8"
            y2="4.8"
            stroke="#92400e"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <line
            x1="19.8"
            y1="20.4"
            x2="5.2"
            y2="4.8"
            stroke="#92400e"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M15.4 4.2C18.8 2.8 21.4 4.8 21.2 8.8C18.8 8.6 17.2 9.6 16.4 11.4L14 6.6Z"
            fill="#e2e8f0"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M8.6 4.2C5.2 2.8 2.6 4.8 2.8 8.8C5.2 8.6 6.8 9.6 7.6 11.4L10 6.6Z"
            fill="#f1f5f9"
            stroke={INK}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M12 8.6L16.8 10.6V14.5C16.8 17.5 14.6 19.6 12 20.6C9.4 19.6 7.2 17.5 7.2 14.5V10.6Z"
            fill="#dc2626"
            stroke="#f5b942"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="14.2" r="1.6" fill="#fde047" stroke={INK} strokeWidth="0.85" />
        </>
      );

    case 'home_base':
      // Royal Homestead Keep Cottage with Fluttering Banner
      return (
        <>
          <line
            x1="12"
            y1="1.6"
            x2="12"
            y2="5.6"
            stroke="#f5b942"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <polygon
            points="12,1.8 18.4,3.3 12,4.8"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="0.95"
            strokeLinejoin="round"
          />
          <rect
            x="4.4"
            y="11.2"
            width="15.2"
            height="9.4"
            rx="0.9"
            fill="#e2e8f0"
            stroke={INK}
            strokeWidth="1.35"
          />
          <polygon
            points="12,5 2.6,11.8 21.4,11.8"
            fill="#2563eb"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polygon points="12,5.9 4.4,11.2 12,11.2" fill="#60a5fa" opacity="0.75" />
          <path
            d="M9.8 20.6V15.4C9.8 14.1 10.8 13.3 12 13.3C13.2 13.3 14.2 14.1 14.2 15.4V20.6Z"
            fill="#fbbf24"
            stroke={INK}
            strokeWidth="1.15"
          />
        </>
      );

    case 'publish':
      // Cloud Banner Crest + Gleaming Golden Upload Arrow
      return (
        <>
          <path
            d="M6.4 19.6H17.6C19.8 19.6 21.2 18.2 21.2 16.2C21.2 14.4 19.9 13 18.2 12.8C17.6 9.8 15.1 7.8 12 7.8C8.9 7.8 6.4 9.8 5.8 12.8C4.1 13 2.8 14.4 2.8 16.2C2.8 18.2 4.2 19.6 6.4 19.6Z"
            fill="#cbd5e1"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M6.2 18.4H17.6C19.1 18.4 20.1 17.5 20.1 16.2C20.1 15 19.2 14 17.8 13.8"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
          <polygon
            points="12,2.4 17.4,8.2 14.1,8.2 14.1,15.8 9.9,15.8 9.9,8.2 6.6,8.2"
            fill="#f5b942"
            stroke={INK}
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <polygon points="12,3.7 15.6,7.6 13.3,7.6 13.3,15 12,15" fill="#fef08a" opacity="0.7" />
        </>
      );
  }
}

export function EmpireIcon({
  name,
  size = 16,
  className,
  style,
  title,
}: EmpireIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: 'inline-block',
        verticalAlign: '-0.16em',
        flexShrink: 0,
        ...style,
      }}
    >
      {title ? <title>{title}</title> : null}
      {renderIconArtwork(name)}
    </svg>
  );
}

function renderCivCrestArtwork(civ: CivId): React.ReactNode {
  const shieldPath =
    'M12 2L20.6 5.2V11.8C20.6 17.2 16.8 20.6 12 22.2C7.2 20.6 3.4 17.2 3.4 11.8V5.2L12 2Z';

  switch (civ) {
    case 'britons':
      // Britons: Quartered Crimson/Sapphire Shield with Golden Yew Longbow & Arrow
      return (
        <>
          <path d={shieldPath} fill="#991b1b" stroke="#f5b942" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 2.9V21.2C7.8 19.7 4.4 16.6 4.4 11.8V5.9L12 2.9Z" fill="#b91c1c" />
          <path
            d="M9.2 6.2C14.8 7.8 16.2 13.2 11.2 17.6"
            fill="none"
            stroke="#fde047"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line x1="9.2" y1="6.4" x2="11.2" y2="17.4" stroke="#e2e8f0" strokeWidth="1" />
          <line
            x1="7.4"
            y1="13.4"
            x2="16.8"
            y2="9.8"
            stroke="#ffffff"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <polygon points="17.8,9.4 14.8,9 15.8,11.6" fill="#fde047" />
        </>
      );

    case 'franks':
      // Franks: Capetian Royal Azure Shield with Sculpted Golden Fleur-de-Lis
      return (
        <>
          <path d={shieldPath} fill="#1e3a8a" stroke="#f5b942" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 2.9V21.2C7.8 19.7 4.4 16.6 4.4 11.8V5.9L12 2.9Z" fill="#2563eb" />
          <path
            d="M12 5.4C13.6 7.8 13.8 10.2 12.8 12.6C14.3 10.6 16.6 10.1 17.8 11.5C18.3 12.9 17 14.3 14.9 14.1H13.1L13.9 17.6L12 19.2L10.1 17.6L10.9 14.1H9.1C7 14.3 5.7 12.9 6.2 11.5C7.4 10.1 9.7 10.6 11.2 12.6C10.2 10.2 10.4 7.8 12 5.4Z"
            fill="#fde047"
            stroke={INK}
            strokeWidth="0.7"
            strokeLinejoin="round"
          />
        </>
      );

    case 'byzantines':
      // Byzantines: Imperial Tyrian Purple Shield with Golden Patriarchal Cross
      return (
        <>
          <path d={shieldPath} fill="#581c87" stroke="#f5b942" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 2.9V21.2C7.8 19.7 4.4 16.6 4.4 11.8V5.9L12 2.9Z" fill="#7c3aed" />
          <line x1="12" y1="5.4" x2="12" y2="18.6" stroke="#fde047" strokeWidth="2.1" strokeLinecap="round" />
          <line x1="9.2" y1="8.2" x2="14.8" y2="8.2" stroke="#fde047" strokeWidth="1.9" strokeLinecap="round" />
          <line x1="7.6" y1="11.8" x2="16.4" y2="11.8" stroke="#fde047" strokeWidth="2.1" strokeLinecap="round" />
          <line x1="9.6" y1="16" x2="14.4" y2="14.6" stroke="#fde047" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );

    case 'vikings':
      // Vikings: Norse Fjord Round/Heater Shield with Bearded Battle-Axe
      return (
        <>
          <path d={shieldPath} fill="#0c4a6e" stroke="#f5b942" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 2.9V21.2C7.8 19.7 4.4 16.6 4.4 11.8V5.9L12 2.9Z" fill="#0284c7" />
          <line x1="8.4" y1="17.8" x2="15.4" y2="6.6" stroke="#fde68a" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M14.2 6.8C10.8 5.2 8.2 6.8 7.8 10.4C10.2 10.2 11.6 11.2 12.2 13L15.4 8.2Z"
            fill="#f8fafc"
            stroke={INK}
            strokeWidth="0.95"
            strokeLinejoin="round"
          />
        </>
      );

    case 'teutons':
      // Teutons: Silver Crusader Shield with Bold Black & Gold Iron Cross
      return (
        <>
          <path d={shieldPath} fill="#cbd5e1" stroke="#eab308" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 2.9V21.2C7.8 19.7 4.4 16.6 4.4 11.8V5.9L12 2.9Z" fill="#f1f5f9" />
          <path
            d="M10.2 5.4H13.8L13.1 10.1L17.8 9.4V13L13.1 12.3L13.8 18.2H10.2L10.9 12.3L6.2 13V9.4L10.9 10.1Z"
            fill="#0f172a"
            stroke="#eab308"
            strokeWidth="0.7"
            strokeLinejoin="round"
          />
        </>
      );

    case 'mongols':
      // Mongols: Steppe Vermilion Shield with Golden Sun, Crescent & Horse-Bow
      return (
        <>
          <path d={shieldPath} fill="#9a3412" stroke="#f5b942" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 2.9V21.2C7.8 19.7 4.4 16.6 4.4 11.8V5.9L12 2.9Z" fill="#ea580c" />
          <circle cx="12" cy="9.2" r="2.2" fill="#fde047" />
          <path
            d="M7.6 12.4C8.8 15.6 15.2 15.6 16.4 12.4C15.4 16.8 8.6 16.8 7.6 12.4Z"
            fill="#fef08a"
          />
          <polygon points="12,4.8 13.1,6.8 10.9,6.8" fill="#fef08a" />
        </>
      );
  }
}

export function CivCrest({
  civ,
  size = 16,
  className,
  style,
  title,
}: CivCrestProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: 'inline-block',
        verticalAlign: '-0.18em',
        flexShrink: 0,
        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55))',
        ...style,
      }}
    >
      {title ? <title>{title}</title> : null}
      {renderCivCrestArtwork(civ)}
    </svg>
  );
}

export default EmpireIcon;
