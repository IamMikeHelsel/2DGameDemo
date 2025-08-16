export const TILE_SIZE = 32;
export const TICK_RATE = 20; // server ticks per second
export const MAX_PLAYERS_PER_ROOM = 80;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface InputMessage {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack?: boolean;
  rangedAttack?: boolean;
  timestamp?: number; // for prediction timing
}

export interface PositionSnapshot {
  x: number;
  y: number;
  seq: number;
  timestamp: number;
}

export const MAP = {
  width: 96,
  height: 96
};

export enum Tile {
  Water = 0,
  Land = 1,
  Rock = 2,
  // Dungeon tiles
  CaveWall = 3,
  CaveFloor = 4,
  Crystal = 5,
  Torch = 6,
  // Town tiles  
  TownFloor = 7,
  TownWall = 8
}

// Tiled Map Support
export interface TiledLayer {
  name: string;
  type: 'tilelayer' | 'objectgroup';
  data?: number[];
  objects?: TiledObject[];
  width?: number;
  height?: number;
  opacity: number;
  visible: boolean;
  properties?: { [key: string]: any };
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: { [key: string]: any };
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  tiles?: {
    [id: string]: {
      properties?: { [key: string]: any };
    };
  };
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: { [key: string]: any };
}

// Chat
export interface ChatMessage {
  from: string;
  text: string;
  ts: number; // epoch ms
}

// Shop / NPCs
export interface ShopItem {
  id: string;
  name: string;
  price: number; // gold
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "pot_small", name: "Small Potion", price: 5 }
];

// Merchant position (tile coords) near spawn
export const NPC_MERCHANT = {
  x: Math.floor(MAP.width * 0.45) + 2,
  y: Math.floor(MAP.height * 0.55)
};

// Founder Rewards System
export enum FounderTier {
  None = "none",
  EarlyBird = "early_bird", 
  BetaTester = "beta_tester",
  BugHunter = "bug_hunter"
}

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  type: "cosmetic" | "title" | "emote" | "pet" | "discount" | "access";
  icon?: string;
}

export const FOUNDER_REWARDS: Record<FounderTier, RewardItem[]> = {
  [FounderTier.None]: [],
  [FounderTier.EarlyBird]: [
    { id: "golden_torch", name: "Golden Torch", description: "A shimmering torch for early supporters", type: "cosmetic", icon: "🔥" },
    { id: "founder_badge", name: "Founder Badge", description: "Founding member recognition", type: "title", icon: "👑" },
    { id: "monument_name", name: "Monument Inscription", description: "Your name on the town monument", type: "title", icon: "🏛️" }
  ],
  [FounderTier.BetaTester]: [
    { id: "pet_companion", name: "Beta Pet", description: "Exclusive companion for beta testers", type: "pet", icon: "🐱" },
    { id: "special_chat_color", name: "Beta Chat Color", description: "Special chat text color", type: "cosmetic", icon: "💬" },
    { id: "early_access", name: "Early Access", description: "First access to new features", type: "access", icon: "🚀" }
  ],
  [FounderTier.BugHunter]: [
    { id: "bug_hunter_title", name: "Bug Hunter", description: "Recognized for finding and reporting bugs", type: "title", icon: "🐛" },
    { id: "bug_hunter_emote", name: "Bug Hunter Emote", description: "Special emote for bug hunters", type: "emote", icon: "🕵️" },
    { id: "premium_month", name: "Premium Month", description: "Free premium month at launch", type: "access", icon: "⭐" }
  ]
};

export interface PlayerRewards {
  founderTier: FounderTier;
  joinTimestamp: number;
  bugReportsSubmitted: number;
  referralsCount: number;
  unlockedRewards: string[]; // reward ids
  anniversaryParticipated: boolean;
}

export const REFERRAL_REWARDS = [
  { referrals: 1, reward: { id: "vendor_discount", name: "Friend Discount", description: "10% discount at merchants", type: "discount" as const, icon: "💰" }},
  { referrals: 3, reward: { id: "referral_emote", name: "Social Emote", description: "Exclusive referral emote", type: "emote" as const, icon: "🤝" }},
  { referrals: 5, reward: { id: "referral_skin", name: "Social Skin", description: "Cosmetic skin for top recruiters", type: "cosmetic" as const, icon: "✨" }}
];

export const ANNIVERSARY_REWARDS: RewardItem[] = [
  { id: "birthday_badge", name: "Anniversary Badge", description: "Commemorative anniversary badge", type: "title", icon: "🎂" },
  { id: "birthday_quest_reward", name: "Birthday Quest Reward", description: "Special quest completion reward", type: "cosmetic", icon: "🎁" },
  { id: "boss_slayer", name: "Anniversary Boss Slayer", description: "Defeated the anniversary boss", type: "title", icon: "⚔️" }
];

// Reward tracking constants
export const EARLY_BIRD_LIMIT = 50;
export const BETA_TEST_PERIOD_DAYS = 14;
export const BUG_HUNTER_REPORTS_REQUIRED = 5;

// XP/Level System
export interface LevelInfo {
  level: number;
  currentXp: number;
  xpToNext: number;
  totalXp: number;
}

export function calculateXpForLevel(level: number): number {
  // Simple exponential curve: level * 100 + (level - 1)^1.5 * 50
  if (level <= 1) return 0;
  return Math.floor(level * 100 + Math.pow(level - 1, 1.5) * 50);
}

export function calculateLevelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let xpForCurrentLevel = 0;
  
  while (level < MAX_LEVEL) {
    const xpForNextLevel = calculateXpForLevel(level + 1);
    if (totalXp < xpForNextLevel) {
      return {
        level,
        currentXp: totalXp - xpForCurrentLevel,
        xpToNext: xpForNextLevel - totalXp,
        totalXp
      };
    }
    level++;
    xpForCurrentLevel = xpForNextLevel;
  }
}

// Combat System
export enum DamageType {
  Physical = "physical",
  Magical = "magical"
}

export interface CombatStats {
  attack: number;
  defense: number;
  magicAttack: number;
  magicDefense: number;
  accuracy: number;
  evasion: number;
}

export function getBaseStatsForLevel(level: number): CombatStats {
  return {
    attack: 10 + Math.floor(level * 2.5),
    defense: 8 + Math.floor(level * 2),
    magicAttack: 8 + Math.floor(level * 2),
    magicDefense: 6 + Math.floor(level * 1.5),
    accuracy: 85 + Math.floor(level * 0.5),
    evasion: 5 + Math.floor(level * 0.3)
  };
}

// Equipment System
export enum ItemType {
  Consumable = "consumable",
  Weapon = "weapon",
  Armor = "armor",
  Accessory = "accessory",
  Material = "material"
}

export enum EquipmentSlot {
  Weapon = "weapon",
  Armor = "armor",
  Accessory = "accessory"
}

export interface BaseItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  stackSize: number;
  value: number; // gold value
}

export interface Equipment extends BaseItem {
  type: ItemType.Weapon | ItemType.Armor | ItemType.Accessory;
  slot: EquipmentSlot;
  stats: Partial<CombatStats>;
  levelRequirement: number;
}

export interface Consumable extends BaseItem {
  type: ItemType.Consumable;
  effect: {
    type: "heal" | "mana" | "buff";
    value: number;
    duration?: number; // ms for buffs
  };
}

export interface Material extends BaseItem {
  type: ItemType.Material;
}

export type Item = Equipment | Consumable | Material;

// Loot System
export interface LootEntry {
  itemId: string;
  quantity: number;
  dropChance: number; // 0-1
}

export interface LootTable {
  id: string;
  entries: LootEntry[];
  guaranteedXp: number;
  bonusXpChance?: number; // 0-1
  bonusXpAmount?: number;
}

// Default Items
export const DEFAULT_ITEMS: Record<string, Item> = {
  wooden_sword: {
    id: "wooden_sword",
    name: "Wooden Sword",
    description: "A simple wooden training sword",
    type: ItemType.Weapon,
    slot: EquipmentSlot.Weapon,
    rarity: "common",
    stackSize: 1,
    value: 25,
    stats: { attack: 5 },
    levelRequirement: 1
  },
  iron_sword: {
    id: "iron_sword",
    name: "Iron Sword",
    description: "A sturdy iron blade",
    type: ItemType.Weapon,
    slot: EquipmentSlot.Weapon,
    rarity: "common",
    stackSize: 1,
    value: 100,
    stats: { attack: 12 },
    levelRequirement: 3
  },
  leather_armor: {
    id: "leather_armor",
    name: "Leather Armor",
    description: "Basic protective leather gear",
    type: ItemType.Armor,
    slot: EquipmentSlot.Armor,
    rarity: "common",
    stackSize: 1,
    value: 50,
    stats: { defense: 8 },
    levelRequirement: 1
  },
  health_potion: {
    id: "health_potion",
    name: "Health Potion",
    description: "Restores 50 HP",
    type: ItemType.Consumable,
    rarity: "common",
    stackSize: 10,
    value: 15,
    effect: { type: "heal", value: 50 }
  },
  iron_ore: {
    id: "iron_ore",
    name: "Iron Ore",
    description: "Raw iron ore for crafting",
    type: ItemType.Material,
    rarity: "common",
    stackSize: 50,
    value: 5
  }
};

// Mob Types and AI
export enum MobType {
  Slime = "slime",
  Goblin = "goblin",
  Wolf = "wolf",
  Boss = "boss"
}

export enum AIState {
  Idle = "idle",
  Patrol = "patrol",
  Chasing = "chasing",
  Attacking = "attacking",
  Fleeing = "fleeing",
  Dead = "dead"
}

export interface MobTemplate {
  type: MobType;
  name: string;
  baseHp: number;
  baseStats: CombatStats;
  xpReward: number;
  lootTableId: string;
  aggroRange: number;
  attackRange: number;
  fleeThreshold: number; // HP percentage
  moveSpeed: number;
}

export const MOB_TEMPLATES: Record<MobType, MobTemplate> = {
  [MobType.Slime]: {
    type: MobType.Slime,
    name: "Slime",
    baseHp: 30,
    baseStats: { attack: 8, defense: 2, magicAttack: 0, magicDefense: 1, accuracy: 80, evasion: 10 },
    xpReward: 25,
    lootTableId: "slime_loot",
    aggroRange: 4,
    attackRange: 1,
    fleeThreshold: 0,
    moveSpeed: 2
  },
  [MobType.Goblin]: {
    type: MobType.Goblin,
    name: "Goblin",
    baseHp: 50,
    baseStats: { attack: 12, defense: 6, magicAttack: 0, magicDefense: 3, accuracy: 85, evasion: 15 },
    xpReward: 40,
    lootTableId: "goblin_loot",
    aggroRange: 6,
    attackRange: 1,
    fleeThreshold: 0.2,
    moveSpeed: 3
  },
  [MobType.Wolf]: {
    type: MobType.Wolf,
    name: "Wolf",
    baseHp: 80,
    baseStats: { attack: 18, defense: 8, magicAttack: 0, magicDefense: 4, accuracy: 90, evasion: 25 },
    xpReward: 65,
    lootTableId: "wolf_loot",
    aggroRange: 8,
    attackRange: 1,
    fleeThreshold: 0.1,
    moveSpeed: 4
  },
  [MobType.Boss]: {
    type: MobType.Boss,
    name: "Dungeon Guardian",
    baseHp: 500,
    baseStats: { attack: 35, defense: 20, magicAttack: 25, magicDefense: 15, accuracy: 95, evasion: 5 },
    xpReward: 300,
    lootTableId: "boss_loot",
    aggroRange: 12,
    attackRange: 2,
    fleeThreshold: 0,
    moveSpeed: 2
  }
};

// Zone System
export enum ZoneType {
  Town = "town",
  Dungeon = "dungeon"
}

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  width: number;
  height: number;
  spawnPoint: { x: number; y: number };
  exits: ZoneExit[];
  mobSpawns: MobSpawn[];
  maxPlayers: number;
}

export interface ZoneExit {
  x: number;
  y: number;
  targetZone: string;
  targetX: number;
  targetY: number;
  requiresLevel?: number;
}

export interface MobSpawn {
  x: number;
  y: number;
  mobType: MobType;
  level: number;
  respawnTime: number; // seconds
}

// Loot Tables
export const LOOT_TABLES: Record<string, LootTable> = {
  slime_loot: {
    id: "slime_loot",
    entries: [
      { itemId: "health_potion", quantity: 1, dropChance: 0.3 },
      { itemId: "iron_ore", quantity: 1, dropChance: 0.1 }
    ],
    guaranteedXp: 25
  },
  goblin_loot: {
    id: "goblin_loot",
    entries: [
      { itemId: "wooden_sword", quantity: 1, dropChance: 0.1 },
      { itemId: "health_potion", quantity: 1, dropChance: 0.4 },
      { itemId: "iron_ore", quantity: 2, dropChance: 0.2 }
    ],
    guaranteedXp: 40
  },
  wolf_loot: {
    id: "wolf_loot",
    entries: [
      { itemId: "leather_armor", quantity: 1, dropChance: 0.15 },
      { itemId: "health_potion", quantity: 2, dropChance: 0.5 },
      { itemId: "iron_ore", quantity: 3, dropChance: 0.3 }
    ],
    guaranteedXp: 65
  },
  boss_loot: {
    id: "boss_loot",
    entries: [
      { itemId: "iron_sword", quantity: 1, dropChance: 0.8 },
      { itemId: "leather_armor", quantity: 1, dropChance: 0.6 },
      { itemId: "health_potion", quantity: 5, dropChance: 1.0 },
      { itemId: "iron_ore", quantity: 10, dropChance: 1.0 }
    ],
    guaranteedXp: 300,
    bonusXpChance: 0.5,
    bonusXpAmount: 150
  }
};

// Zone Definitions
export const ZONES: Record<string, Zone> = {
  town: {
    id: "town",
    name: "Peaceful Town",
    type: ZoneType.Town,
    width: MAP.width,
    height: MAP.height,
    spawnPoint: { x: Math.floor(MAP.width * 0.45), y: Math.floor(MAP.height * 0.55) },
    exits: [
      {
        x: Math.floor(MAP.width * 0.8),
        y: Math.floor(MAP.height * 0.5),
        targetZone: "dungeon_1",
        targetX: 2,
        targetY: 2,
        requiresLevel: 2
      }
    ],
    mobSpawns: [
      { x: MAP.width * 0.3, y: MAP.height * 0.3, mobType: MobType.Slime, level: 1, respawnTime: 30 },
      { x: MAP.width * 0.7, y: MAP.height * 0.3, mobType: MobType.Slime, level: 1, respawnTime: 30 }
    ],
    maxPlayers: 40
  },
  
  dungeon_1: {
    id: "dungeon_1",
    name: "Crystal Cavern",
    type: ZoneType.Dungeon,
    width: 32,
    height: 32,
    spawnPoint: { x: 2, y: 2 },
    exits: [
      {
        x: 2,
        y: 2,
        targetZone: "town",
        targetX: Math.floor(MAP.width * 0.8),
        targetY: Math.floor(MAP.height * 0.5)
      }
    ],
    mobSpawns: [
      { x: 8, y: 8, mobType: MobType.Goblin, level: 2, respawnTime: 45 },
      { x: 24, y: 8, mobType: MobType.Goblin, level: 2, respawnTime: 45 },
      { x: 8, y: 24, mobType: MobType.Wolf, level: 3, respawnTime: 60 },
      { x: 24, y: 24, mobType: MobType.Wolf, level: 3, respawnTime: 60 },
      { x: 16, y: 16, mobType: MobType.Boss, level: 5, respawnTime: 300 } // 5 minute boss respawn
    ],
    maxPlayers: 8 // Smaller dungeon instance
  }
};

// Simple Crafting System
export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  materials: { itemId: string; quantity: number }[];
  result: { itemId: string; quantity: number };
  levelRequirement: number;
}

export const CRAFTING_RECIPES: Record<string, CraftingRecipe> = {
  iron_sword_craft: {
    id: "iron_sword_craft",
    name: "Craft Iron Sword",
    description: "Forge a basic iron sword",
    materials: [
      { itemId: "iron_ore", quantity: 5 },
      { itemId: "wooden_sword", quantity: 1 }
    ],
    result: { itemId: "iron_sword", quantity: 1 },
    levelRequirement: 3
  },
  
  health_potion_craft: {
    id: "health_potion_craft", 
    name: "Brew Health Potion",
    description: "Create a healing potion",
    materials: [
      { itemId: "iron_ore", quantity: 2 } // Using ore as generic material for demo
    ],
    result: { itemId: "health_potion", quantity: 3 },
    levelRequirement: 1
  }
};