export type Team = 'player' | 'enemy';

export type ResourceKind = 'wood' | 'food' | 'gold';

export interface Resources {
  wood: number;
  food: number;
  gold: number;
}

export type CivId = 'britons' | 'franks' | 'byzantines' | 'vikings' | 'teutons' | 'mongols';

export interface CivDef {
  id: CivId;
  name: string;
  title: string;
  perkSummary: string;
  accent: string;
  emblem: string;
}

export type BiomeId =
  | 'sherwood'
  | 'black_forest'
  | 'gold_rush'
  | 'highlands'
  | 'autumn_steppe'
  | 'oasis';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  subtitle: string;
  grassTop: string;
  grassAlt: string;
  grassEdge: string;
  waterTop: string;
  waterDeep: string;
  shallows: string;
  cliffTop: string;
  cliffSide: string;
  treePrimary: string;
  treeSecondary: string;
  roadColor: string;
  skyBg: string;
}

export type DailyModifierId =
  | 'standard'
  | 'gold_fever'
  | 'wololo_sabbath'
  | 'timber_boom'
  | 'iron_vanguard'
  | 'fletchers_wind';

export interface DailyModifierDef {
  id: DailyModifierId;
  name: string;
  decree: string;
}

export type TileKind =
  | 'grass'
  | 'forest'
  | 'berry'
  | 'gold'
  | 'water'
  | 'shallows'
  | 'cliff'
  | 'road';

export interface MapTile {
  x: number;
  y: number;
  kind: TileKind;
  amount: number;
  maxAmount: number;
  variant: number; // 0..3 deterministic visual variation
}

export type BuildingKind =
  | 'town_center'
  | 'homestead'
  | 'barracks'
  | 'archery_range'
  | 'stable'
  | 'monastery'
  | 'watchtower';

export type UnitKind =
  | 'villager'
  | 'scout'
  | 'militia'
  | 'pikeman'
  | 'archer'
  | 'knight'
  | 'monk';

export interface BuildingCostSpec {
  kind: BuildingKind;
  name: string;
  shortName: string;
  hotkey: string;
  size: number; // 2 for town_center, 1 for others
  cost: Partial<Resources>;
  maxHp: number;
  buildTimeSec: number;
  popProvided: number;
  vision: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownSec: number;
  description: string;
}

export interface UnitSpec {
  kind: UnitKind;
  name: string;
  shortName: string;
  trainedAt: BuildingKind;
  cost: Partial<Resources>;
  trainTimeSec: number;
  maxHp: number;
  speed: number; // tiles per second
  damage: number;
  range: number; // <= 1.25 is melee
  attackCooldownSec: number;
  vision: number;
  bonusVs?: 'cavalry' | 'building' | 'infantry';
  bonusMultiplier?: number;
  description: string;
}

export interface QueueItem {
  unit: UnitKind;
  remainingSec: number;
  totalSec: number;
}

export interface Building {
  id: number;
  team: Team;
  kind: BuildingKind;
  tileX: number;
  tileY: number;
  size: number;
  hp: number;
  maxHp: number;
  built: boolean;
  buildProgress: number; // 0..1
  queue: QueueItem[];
  rallyX: number;
  rallyY: number;
  attackTimer: number;
}

export type UnitOrder =
  | { type: 'idle' }
  | { type: 'move'; tx: number; ty: number; attackMove: boolean }
  | { type: 'gather'; tileX: number; tileY: number; resource: ResourceKind }
  | { type: 'build'; buildingId: number }
  | { type: 'attack_unit'; targetId: number }
  | { type: 'attack_building'; buildingId: number }
  | { type: 'convert'; targetId: number };

export interface Unit {
  id: number;
  team: Team;
  kind: UnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  order: UnitOrder;
  path: Array<{ x: number; y: number }>;
  pathCooldown: number;
  attackTimer: number;
  harvestTimer: number;
  carryKind: ResourceKind | null;
  carryAmount: number;
  convertTargetId: number | null;
  convertProgress: number; // 0..1
  monkCooldown: number;
  facing: number; // -1 left, +1 right
  animPhase: number;
}

export interface Projectile {
  id: number;
  team: Team;
  kind: 'arrow' | 'bolt' | 'heal';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number; // 0..1
  speed: number;
  damage: number;
  targetUnitId?: number;
  targetBuildingId?: number;
}

export interface FloatingCallout {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
  maxTtl: number;
}

export type TauntId = '1' | '11' | '14' | '30';

export interface TauntDef {
  id: TauntId;
  code: string;
  label: string;
  quote: string;
}

export type AIPersonaId = 'longbow_earl' | 'knight_baron' | 'viking_jarl' | 'monk_abbot';

export interface SkirmishSpec {
  seed: number;
  dateKey: string;
  puzzleNumber: number;
  mapName: string;
  biome: BiomeId;
  playerCiv: CivId;
  enemyCiv: CivId;
  aiPersona: AIPersonaId;
  aiLeaderName: string;
  modifier: DailyModifierId;
  parSec: number;
  startingGoldBonus?: number;
  chokepointStyle: 'twin_fords' | 'central_bridge' | ' canyon_pass' | 'open_steppe';
  isCustom?: boolean;
  customPrompt?: string;
}

export type FogState = 0 | 1 | 2; // 0 unexplored, 1 explored shroud, 2 currently visible

export type GameOutcome = 'playing' | 'victory' | 'defeat';

export type SoundEventKind =
  | 'villager_spawn'
  | 'military_spawn'
  | 'wood_chop'
  | 'gold_clink'
  | 'build_place'
  | 'build_done'
  | 'order_move'
  | 'order_attack'
  | 'sword_hit'
  | 'bow_shoot'
  | 'wololo'
  | 'war_horn'
  | 'victory'
  | 'defeat';

export interface MatchStats {
  villagersTrained: number;
  militaryTrained: number;
  unitsLost: number;
  enemyUnitsSlain: number;
  buildingsBuilt: number;
  enemyBuildingsRazed: number;
  wololoConversions: number;
  woodGathered: number;
  foodGathered: number;
  goldGathered: number;
  tauntsUsed: number;
  cheekyWololo: boolean;
  countsByUnit: Partial<Record<UnitKind, number>>;
}

export interface GameState {
  spec: SkirmishSpec;
  mapSize: number;
  tiles: MapTile[]; // length mapSize * mapSize
  fog: FogState[]; // player fog of war
  timeSec: number;
  tick: number;
  outcome: GameOutcome;
  nextId: number;
  resources: Record<Team, Resources>;
  buildings: Building[];
  units: Unit[];
  projectiles: Projectile[];
  callouts: FloatingCallout[];
  soundEvents: SoundEventKind[];
  stats: MatchStats;
  enemyWaveTimer: number;
  enemyBuildStage: number;
  lastUnderAttackHornSec: number;
  recentTauntSec: number;
  ghostBreach?: {
    username: string;
    timeSec: number;
    tileX: number;
    tileY: number;
  } | null;
}

export const MAP_SIZE = 16;

export const CIVS: Record<CivId, CivDef> = {
  britons: {
    id: 'britons',
    name: 'Britons',
    title: 'Yeoman Longbows',
    perkSummary: 'Archers +1.4 range & +15% fire rate',
    accent: '#3b82f6',
    emblem: '🏹',
  },
  franks: {
    id: 'franks',
    name: 'Franks',
    title: 'Royal Chivalry',
    perkSummary: 'Knights +28% HP & +2 melee attack',
    accent: '#2563eb',
    emblem: '⚜️',
  },
  byzantines: {
    id: 'byzantines',
    name: 'Byzantines',
    title: 'Imperial Sanctity',
    perkSummary: 'Monks convert 35% faster & +25 HP',
    accent: '#8b5cf6',
    emblem: '☦️',
  },
  vikings: {
    id: 'vikings',
    name: 'Vikings',
    title: 'Norse Shieldwall',
    perkSummary: 'Infantry +22% HP & +18% march speed',
    accent: '#0ea5e9',
    emblem: '🪓',
  },
  teutons: {
    id: 'teutons',
    name: 'Teutons',
    title: 'Iron Crenellations',
    perkSummary: 'TC & Watchtowers +1.5 range & +35% damage',
    accent: '#eab308',
    emblem: '🛡️',
  },
  mongols: {
    id: 'mongols',
    name: 'Mongols',
    title: 'Steppe Vanguard',
    perkSummary: 'Cavalry +24% speed & Scouts +2 vision',
    accent: '#f97316',
    emblem: '🐎',
  },
};

export const BIOMES: Record<BiomeId, BiomeDef> = {
  sherwood: {
    id: 'sherwood',
    name: 'Sherwood Ford',
    subtitle: 'Lush meadow & twin river crossings',
    grassTop: '#5c8d3e',
    grassAlt: '#538237',
    grassEdge: '#3e6627',
    waterTop: '#2c7da0',
    waterDeep: '#1d5b79',
    shallows: '#5fa8c7',
    cliffTop: '#7a7468',
    cliffSide: '#524d44',
    treePrimary: '#245527',
    treeSecondary: '#316b34',
    roadColor: '#a68b5b',
    skyBg: '#121812',
  },
  black_forest: {
    id: 'black_forest',
    name: 'Black Forest',
    subtitle: 'Dense timber walls & narrow siege lanes',
    grassTop: '#466d35',
    grassAlt: '#3f6330',
    grassEdge: '#2d4921',
    waterTop: '#25647c',
    waterDeep: '#184659',
    shallows: '#4d8da3',
    cliffTop: '#66635b',
    cliffSide: '#45423c',
    treePrimary: '#183d22',
    treeSecondary: '#22522e',
    roadColor: '#8d754d',
    skyBg: '#0e1410',
  },
  gold_rush: {
    id: 'gold_rush',
    name: 'Golden Basin',
    subtitle: 'Sunlit valley surrounding a rich gold hill',
    grassTop: '#6e943a',
    grassAlt: '#648834',
    grassEdge: '#4d6a26',
    waterTop: '#2e86ab',
    waterDeep: '#1f617d',
    shallows: '#66b3cf',
    cliffTop: '#8c7a5b',
    cliffSide: '#63543d',
    treePrimary: '#2e6128',
    treeSecondary: '#3f7a35',
    roadColor: '#b89962',
    skyBg: '#17140d',
  },
  highlands: {
    id: 'highlands',
    name: 'Highland Pass',
    subtitle: 'Slate crags & contested stone bridges',
    grassTop: '#557d4c',
    grassAlt: '#4c7144',
    grassEdge: '#375431',
    waterTop: '#2b6785',
    waterDeep: '#1b475e',
    shallows: '#5b94b0',
    cliffTop: '#747c82',
    cliffSide: '#4b5257',
    treePrimary: '#264d3b',
    treeSecondary: '#33634d',
    roadColor: '#918879',
    skyBg: '#10151a',
  },
  autumn_steppe: {
    id: 'autumn_steppe',
    name: 'Autumn Steppe',
    subtitle: 'Amber plains & crimson groves built for Knights',
    grassTop: '#8a8238',
    grassAlt: '#7e7631',
    grassEdge: '#5e5722',
    waterTop: '#2e7594',
    waterDeep: '#1e5269',
    shallows: '#62a4bf',
    cliffTop: '#82705e',
    cliffSide: '#594c3f',
    treePrimary: '#9e471f',
    treeSecondary: '#c26b27',
    roadColor: '#ab8c59',
    skyBg: '#18120d',
  },
  oasis: {
    id: 'oasis',
    name: 'Mirage Oasis',
    subtitle: 'Warm dunes around turquoise springs & palms',
    grassTop: '#c2a361',
    grassAlt: '#b89856',
    grassEdge: '#94783e',
    waterTop: '#1ca3a8',
    waterDeep: '#13767a',
    shallows: '#57c7cb',
    cliffTop: '#a68256',
    cliffSide: '#785b39',
    treePrimary: '#2f7336',
    treeSecondary: '#438f49',
    roadColor: '#d4b87b',
    skyBg: '#1a140d',
  },
};

export const DAILY_MODIFIERS: Record<DailyModifierId, DailyModifierDef> = {
  standard: {
    id: 'standard',
    name: 'Crown Standard',
    decree: 'Classic Age rules — balanced harvest, steel, and faith.',
  },
  gold_fever: {
    id: 'gold_fever',
    name: 'Gold Fever',
    decree: 'Miners strike rich veins: Gold harvests +45% faster.',
  },
  wololo_sabbath: {
    id: 'wololo_sabbath',
    name: 'Age of Wololo',
    decree: 'Monasteries & Monks cost 30% less; each conversion grants +50 Gold!',
  },
  timber_boom: {
    id: 'timber_boom',
    name: 'Royal Timber',
    decree: 'Lumberjacks chop +45% faster & buildings rise +35% quicker.',
  },
  iron_vanguard: {
    id: 'iron_vanguard',
    name: 'Call to Arms',
    decree: 'Infantry train 35% faster and deal +15% siege damage.',
  },
  fletchers_wind: {
    id: 'fletchers_wind',
    name: 'Tailwind Volley',
    decree: 'Favorable gusts grant all Archers & Towers +1.0 range.',
  },
};

export const BUILDINGS: Record<BuildingKind, BuildingCostSpec> = {
  town_center: {
    kind: 'town_center',
    name: 'Town Center',
    shortName: 'Town Ctr',
    hotkey: 'H',
    size: 2,
    cost: { wood: 250 },
    maxHp: 750,
    buildTimeSec: 20,
    popProvided: 10,
    vision: 6.2,
    attackDamage: 7,
    attackRange: 4.8,
    attackCooldownSec: 1.15,
    description: 'Heart of your empire. Trains Villagers, stores all resources, and fires defensive arrows.',
  },
  homestead: {
    kind: 'homestead',
    name: 'Homestead Camp',
    shortName: 'Camp',
    hotkey: 'Q',
    size: 1,
    cost: { wood: 40 },
    maxHp: 210,
    buildTimeSec: 5,
    popProvided: 5,
    vision: 3.8,
    attackDamage: 0,
    attackRange: 0,
    attackCooldownSec: 0,
    description: '+5 Population AND acts as a forward drop-off camp for Wood, Food & Gold.',
  },
  barracks: {
    kind: 'barracks',
    name: 'Barracks',
    shortName: 'Barracks',
    hotkey: 'W',
    size: 1,
    cost: { wood: 75 },
    maxHp: 320,
    buildTimeSec: 6.5,
    popProvided: 0,
    vision: 4.0,
    attackDamage: 0,
    attackRange: 0,
    attackCooldownSec: 0,
    description: 'Trains Men-at-Arms (siege infantry) and Pikemen (3× vs Knights).',
  },
  archery_range: {
    kind: 'archery_range',
    name: 'Archery Range',
    shortName: 'Range',
    hotkey: 'E',
    size: 1,
    cost: { wood: 75, gold: 15 },
    maxHp: 290,
    buildTimeSec: 6.5,
    popProvided: 0,
    vision: 4.2,
    attackDamage: 0,
    attackRange: 0,
    attackCooldownSec: 0,
    description: 'Trains ranged Archers that shred Infantry and snipe Monks.',
  },
  stable: {
    kind: 'stable',
    name: 'Stable',
    shortName: 'Stable',
    hotkey: 'R',
    size: 1,
    cost: { wood: 90, gold: 25 },
    maxHp: 340,
    buildTimeSec: 7.5,
    popProvided: 0,
    vision: 4.2,
    attackDamage: 0,
    attackRange: 0,
    attackCooldownSec: 0,
    description: 'Trains fast, heavy armored Knights that crush Archers & Town Centers.',
  },
  monastery: {
    kind: 'monastery',
    name: 'Monastery',
    shortName: 'Monastery',
    hotkey: 'T',
    size: 1,
    cost: { wood: 85, gold: 35 },
    maxHp: 280,
    buildTimeSec: 7.0,
    popProvided: 0,
    vision: 4.5,
    attackDamage: 0,
    attackRange: 0,
    attackCooldownSec: 0,
    description: 'Trains Monks that heal allies and chant WOLOLO to convert enemy units!',
  },
  watchtower: {
    kind: 'watchtower',
    name: 'Watchtower',
    shortName: 'Tower',
    hotkey: 'Y',
    size: 1,
    cost: { wood: 65, gold: 25 },
    maxHp: 300,
    buildTimeSec: 6.5,
    popProvided: 0,
    vision: 6.8,
    attackDamage: 8,
    attackRange: 5.5,
    attackCooldownSec: 1.1,
    description: 'High-vision stone keep that rains arrows on nearby enemies.',
  },
};

export const UNITS: Record<UnitKind, UnitSpec> = {
  villager: {
    kind: 'villager',
    name: 'Villager',
    shortName: 'Villager',
    trainedAt: 'town_center',
    cost: { food: 50 },
    trainTimeSec: 5.0,
    maxHp: 45,
    speed: 2.15,
    damage: 4,
    range: 1.05,
    attackCooldownSec: 1.2,
    vision: 4.2,
    description: 'Gathers Wood, Food, Gold & erects buildings.',
  },
  scout: {
    kind: 'scout',
    name: 'Scout Cavalry',
    shortName: 'Scout',
    trainedAt: 'stable',
    cost: { food: 55 },
    trainTimeSec: 5.5,
    maxHp: 68,
    speed: 3.35,
    damage: 6,
    range: 1.08,
    attackCooldownSec: 1.1,
    vision: 5.8,
    description: 'Swift light rider with wide line-of-sight.',
  },
  militia: {
    kind: 'militia',
    name: 'Man-at-Arms',
    shortName: 'Swordsman',
    trainedAt: 'barracks',
    cost: { food: 50, gold: 15 },
    trainTimeSec: 5.5,
    maxHp: 85,
    speed: 2.25,
    damage: 11,
    range: 1.1,
    attackCooldownSec: 1.05,
    vision: 4.0,
    bonusVs: 'building',
    bonusMultiplier: 2.0,
    description: 'Sturdy swordsman with 2× siege damage vs buildings.',
  },
  pikeman: {
    kind: 'pikeman',
    name: 'Pikeman',
    shortName: 'Pikeman',
    trainedAt: 'barracks',
    cost: { food: 35, wood: 25 },
    trainTimeSec: 5.0,
    maxHp: 75,
    speed: 2.25,
    damage: 8,
    range: 1.2,
    attackCooldownSec: 1.1,
    vision: 4.0,
    bonusVs: 'cavalry',
    bonusMultiplier: 3.0,
    description: 'Anti-cavalry halberdier (3× damage vs Knights & Scouts).',
  },
  archer: {
    kind: 'archer',
    name: 'Longbowman',
    shortName: 'Archer',
    trainedAt: 'archery_range',
    cost: { wood: 35, gold: 35 },
    trainTimeSec: 5.5,
    maxHp: 55,
    speed: 2.3,
    damage: 9,
    range: 4.4,
    attackCooldownSec: 1.15,
    vision: 5.2,
    bonusVs: 'infantry',
    bonusMultiplier: 1.35,
    description: 'Ranged volley unit; counters Infantry & Monks from afar.',
  },
  knight: {
    kind: 'knight',
    name: 'Knight',
    shortName: 'Knight',
    trainedAt: 'stable',
    cost: { food: 60, gold: 60 },
    trainTimeSec: 7.0,
    maxHp: 138,
    speed: 3.05,
    damage: 15,
    range: 1.15,
    attackCooldownSec: 1.1,
    vision: 4.6,
    description: 'Heavy armored charger; crushes Archers and batters Town Centers.',
  },
  monk: {
    kind: 'monk',
    name: 'Monk',
    shortName: 'Monk',
    trainedAt: 'monastery',
    cost: { gold: 75 },
    trainTimeSec: 7.0,
    maxHp: 48,
    speed: 1.85,
    damage: 0,
    range: 5.0,
    attackCooldownSec: 1.5,
    vision: 5.2,
    description: 'Heals nearby allies & chants WOLOLO to convert enemy soldiers!',
  },
};

export const TAUNTS: TauntDef[] = [
  { id: '30', code: '30', label: 'Wololo!', quote: '30 — Wololo!' },
  { id: '11', code: '11', label: 'Laugh', quote: '11 — Hahaha!' },
  { id: '14', code: '14', label: 'Start!', quote: '14 — Start the game already!' },
  { id: '1', code: '1', label: 'Yes!', quote: '1 — Yes, my liege!' },
];
