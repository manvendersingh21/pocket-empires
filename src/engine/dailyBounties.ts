import type { GameState, SkirmishSpec } from '../types/rts.js';
import { createRng, hashString, pick } from './rng.js';

export type DailyBountyIcon =
  | 'villager'
  | 'food'
  | 'gold'
  | 'hammer'
  | 'wololo'
  | 'relic'
  | 'crown'
  | 'swords'
  | 'hourglass'
  | 'shield';

export interface DailyBounty {
  id: string;
  title: string;
  description: string;
  icon: DailyBountyIcon;
  category: 'economy' | 'tactical' | 'mastery';
  target: number;
  bonusScore: number;
}

export interface EvaluatedDailyBounty extends DailyBounty {
  current: number;
  completed: boolean;
}

const ECONOMY_BOUNTIES: ReadonlyArray<DailyBounty> = [
  {
    id: 'herd_fauna',
    title: 'Pastoral Scout',
    description: 'Herd 2 Sheep or Wild Horses',
    icon: 'food',
    category: 'economy',
    target: 2,
    bonusScore: 200,
  },
  {
    id: 'gather_gold',
    title: 'Royal Coffers',
    description: 'Gather 180 Gold in battle',
    icon: 'gold',
    category: 'economy',
    target: 180,
    bonusScore: 200,
  },
  {
    id: 'gather_food',
    title: 'Granary Harvest',
    description: 'Gather 220 Food in battle',
    icon: 'food',
    category: 'economy',
    target: 220,
    bonusScore: 200,
  },
  {
    id: 'build_structures',
    title: 'Master Architect',
    description: 'Construct 4 Buildings',
    icon: 'hammer',
    category: 'economy',
    target: 4,
    bonusScore: 200,
  },
];

const TACTICAL_BOUNTIES: ReadonlyArray<DailyBounty> = [
  {
    id: 'wololo_convert',
    title: 'Faith Triumphs',
    description: 'Convert 1+ foe with Wololo!',
    icon: 'wololo',
    category: 'tactical',
    target: 1,
    bonusScore: 200,
  },
  {
    id: 'enshrine_relic',
    title: 'Relic Keeper',
    description: 'Enshrine 1+ Sacred Relic',
    icon: 'relic',
    category: 'tactical',
    target: 1,
    bonusScore: 200,
  },
  {
    id: 'castle_victory',
    title: 'Crown Ascendant',
    description: 'Reach Castle Age II & Win',
    icon: 'crown',
    category: 'tactical',
    target: 1,
    bonusScore: 200,
  },
  {
    id: 'raze_buildings',
    title: 'Siege Breaker',
    description: 'Raze 2+ Enemy Buildings & Win',
    icon: 'swords',
    category: 'tactical',
    target: 2,
    bonusScore: 200,
  },
];

const MASTERY_BOUNTIES: ReadonlyArray<DailyBounty> = [
  {
    id: 'par_victory',
    title: 'Swift Conquest',
    description: 'Conquer Keep within Par Time',
    icon: 'hourglass',
    category: 'mastery',
    target: 1,
    bonusScore: 200,
  },
  {
    id: 'low_casualty',
    title: 'Iron Vanguard',
    description: 'Win losing <= 3 friendly units',
    icon: 'shield',
    category: 'mastery',
    target: 1,
    bonusScore: 200,
  },
  {
    id: 'slay_foes',
    title: 'Battlefield Legend',
    description: 'Slay 8+ Enemy Troops & Win',
    icon: 'swords',
    category: 'mastery',
    target: 8,
    bonusScore: 200,
  },
];

export function generateDailyBounties(spec: SkirmishSpec): DailyBounty[] {
  const seed = hashString(`pocket-empires:bounties:v1:${spec.dateKey}`);
  const rng = createRng(seed);

  const econ = pick(rng, ECONOMY_BOUNTIES);
  const tactical =
    spec.modifier === 'wololo_sabbath'
      ? TACTICAL_BOUNTIES[0]
      : pick(rng, TACTICAL_BOUNTIES);
  const mastery = pick(rng, MASTERY_BOUNTIES);

  return [econ, tactical, mastery];
}

export function evaluateDailyBounties(
  state: GameState,
  bounties: readonly DailyBounty[] = generateDailyBounties(state.spec),
): EvaluatedDailyBounty[] {
  const won = state.outcome === 'victory';
  const faunaCount = (state.stats.sheepHerded ?? 0) + (state.stats.horsesTamed ?? 0);
  const relics = state.stats.relicsCaptured ?? 0;

  return bounties.map((b) => {
    let rawCurrent = 0;
    let completed = false;

    switch (b.id) {
      case 'herd_fauna':
        rawCurrent = faunaCount;
        completed = rawCurrent >= b.target;
        break;
      case 'gather_gold':
        rawCurrent = Math.floor(state.stats.goldGathered);
        completed = rawCurrent >= b.target;
        break;
      case 'gather_food':
        rawCurrent = Math.floor(state.stats.foodGathered);
        completed = rawCurrent >= b.target;
        break;
      case 'build_structures':
        rawCurrent = state.stats.buildingsBuilt;
        completed = rawCurrent >= b.target;
        break;
      case 'wololo_convert':
        rawCurrent = state.stats.wololoConversions;
        completed = rawCurrent >= b.target;
        break;
      case 'enshrine_relic':
        rawCurrent = relics;
        completed = rawCurrent >= b.target;
        break;
      case 'castle_victory':
        rawCurrent = (state.ages?.player ?? 1) >= 2 && won ? 1 : 0;
        completed = rawCurrent >= 1;
        break;
      case 'raze_buildings':
        rawCurrent = won ? state.stats.enemyBuildingsRazed : 0;
        completed = won && state.stats.enemyBuildingsRazed >= b.target;
        break;
      case 'par_victory':
        rawCurrent = won && Math.round(state.timeSec) <= state.spec.parSec ? 1 : 0;
        completed = rawCurrent >= 1;
        break;
      case 'low_casualty':
        rawCurrent = won && state.stats.unitsLost <= 3 ? 1 : 0;
        completed = rawCurrent >= 1;
        break;
      case 'slay_foes':
        rawCurrent = won ? state.stats.enemyUnitsSlain : Math.min(b.target - 1, state.stats.enemyUnitsSlain);
        completed = won && state.stats.enemyUnitsSlain >= b.target;
        break;
      default:
        rawCurrent = 0;
        completed = false;
    }

    return {
      ...b,
      current: Math.max(0, Math.min(b.target, rawCurrent)),
      completed,
    };
  });
}
