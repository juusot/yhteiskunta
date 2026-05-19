// src/simulation/constants.ts

export const MAX_ENTITIES = 100_000;
export const MAX_GROUPS = 1000;
export const MAX_RULES = 100;
export const MAX_BUILDINGS = 20_000;
export const MAX_VEHICLES = 5_000;
export const MAX_ITEM_DEFINITIONS = 1000;
export const MAX_ITEM_INSTANCES = 50000;

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1200;
export const GRID_SIZE = 50;
export const GRID_COLS = Math.ceil(WORLD_WIDTH / GRID_SIZE);
export const GRID_ROWS = Math.ceil(WORLD_HEIGHT / GRID_SIZE);
export const NUM_CELLS = GRID_COLS * GRID_ROWS;

export const TILE_SIZE = 10;
export const WORLD_MAP_COLS = 160;
export const WORLD_MAP_ROWS = 120;

export const TRAIT_NONE = 0;
export const TRAIT_TREE = 1 << 0;
export const TRAIT_GOLD = 1 << 1;
export const TRAIT_BUSH = 1 << 2;
export const TRAIT_AGGRESSIVE = 1 << 3;
export const TRAIT_SCOUT = 1 << 4;
export const TRAIT_FANATIC = 1 << 5;
export const TRAIT_COURIER = 1 << 6;
export const TRAIT_MAGIC = 1 << 7;
export const TRAIT_LOOT = 1 << 8;

export enum TerrainType {
  Grass = 0,
  Forest = 1,
  Water = 2,
  Mountain = 3,
}

export const EVENT_HOSTILE_ATTACK = 99;

// Phase 21: Event Types (expanded)
export const EVENT_MOVE = 100;
export const EVENT_RECRUIT = 101;
export const EVENT_TRADE = 102;
export const EVENT_REPORT = 103;
export const EVENT_BUILD = 104;
export const EVENT_DISBAND = 105;
export const EVENT_CUSTOM = 106;

export const ACTION_SPAWN_DEFENSE_PROJECTILE = 101;
export const ACTION_DECLARE_WAR = 102;

// Phase 21: Game Time
export const TICKS_PER_DAY = 3600; // 60 ticks/sec × 60 sec = 1 minute real-time = 1 game day
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR;

export enum EntityState {
  Idle = 0,
  Harvesting = 1,
  Fleeing = 2,
  Combat = 3,
  ReturningToDepot = 4,
  Dead = 5,
  Trading = 6,
  ReportingIntel = 7,
  Construction = 8,
  Sabotaging = 9, // Phase 23: Spy sabotage state
  Looting = 10,
}

export enum BuildingType {
  None = 0,
  Warehouse = 1,
  House = 2,
  Tower = 3,
  Wall = 4,
  Field = 5,
  MindControl = 6,
}

// Projectile Constants
export const MAX_PROJECTILES = 20000;
export const PROJ_TYPE_ARROW = 1;
export const PROJ_TYPE_FIREBALL = 2;

// Architectural Tiers
export const BLD_TIER_1 = 1;
export const BLD_TIER_2 = 2;
export const BLD_TIER_3 = 3;

// Tier Upgrade Costs
export const UPGRADE_TIER2_WOOD = 500;
export const UPGRADE_TIER2_GOLD = 200;
export const UPGRADE_TIER3_WOOD = 1500;
export const UPGRADE_TIER3_GOLD = 800;

export enum VehicleType {
  None = 0,
  Cart = 1,
  Boat = 2,
  Helicopter = 3,
}

export const VEHICLE_WAGON = 1;
export const VEHICLE_SHIP = 2;
export const MAX_PASSENGERS_WAGON = 6;
export const MAX_PASSENGERS_SHIP = 30;

// Item Owner Types
export const OWNER_TYPE_INACTIVE = 0;
export const OWNER_TYPE_GROUND = 1;
export const OWNER_TYPE_WAREHOUSE = 2;
export const OWNER_TYPE_CHARACTER = 3;

// Item Base Types
export const ITEM_BASE_MELEE = 1;
export const ITEM_BASE_RANGED = 2;
export const ITEM_BASE_SHIELD = 3;
export const ITEM_BASE_CONSUMABLE = 4;

// Item Traits
export const ITEM_TRAIT_NONE = 0;
export const ITEM_TRAIT_CURSED = 1 << 0; // Modifies lifespan or health parameters negatively
export const ITEM_TRAIT_VAMPIRE = 1 << 1; // Transfers health variables during combat ticks
export const ITEM_TRAIT_BLESSED = 1 << 2; // Increases statutory recovery velocity

// Phase 19: OpCodes & Gates
export const OP_POP_GT = 0;
export const OP_WEALTH_LT = 1;
export const OP_RELATION_LT = 2;
export const OP_DIST_GT = 3;
export const GATE_AND = 100;
export const GATE_OR = 101;
export const GATE_NOT = 102;
export const OP_END = 255;

export const OP_TICK_MODULO = 10; // Interval timer
export const OP_RANDOM_CHANCE = 11; // Probability dice roll
export const OP_COHESION_LT = 12; // Stability check

export const ARCHETYPE_NONE = 0;
export const ARCHETYPE_NATION = 1;
export const ARCHETYPE_ARMY = 2;
export const ARCHETYPE_SPY = 3;
export const ARCHETYPE_CULT = 4;

export const MAX_BYTECODE_PER_RULE = 32;

// Phase 21: Group & Character Limits
export const GROUP_SLOTS_PER_CHARACTER = 8;
export const EVENT_SLOTS_PER_CHARACTER = 8;

// Phase 23: Extended Group Channels (10 slots: 0-7 Public, 8-9 Secret)
export const MAX_GROUP_CHANNELS = 10;
export const PUBLIC_GROUP_SLOTS = 8;
export const SECRET_GROUP_SLOTS = 2;

// Phase 23: National Cohesion Thresholds
export const COHESION_MAX = 100;
export const COHESION_ANARCHY_THRESHOLD = 30;
export const COHESION_WEALTHY_THRESHOLD = 10000;
export const COHESION_DECAY_RATE = 5;
export const COHESION_GROWTH_RATE = 1;

// Phase 23: Spy Sabotage Constants
export const SPY_SABOTAGE_RANGE = 5; // 5-unit radius (squared = 25)
export const SPY_WEALTH_DRAIN = 500;
export const SPY_TRUST_DECAY = 10;
export const SPY_SABOTAGE_INTERVAL = 60; // Every 60 frames

// Phase 22: Building Influence Radii (units)
export const INFLUENCE_RADIUS_WAREHOUSE = 200;
export const INFLUENCE_RADIUS_HOUSE = 80;
export const INFLUENCE_RADIUS_TOWER = 150;
export const INFLUENCE_RADIUS_FIELD = 0;
export const INFLUENCE_RADIUS_WALL = 0;

// Influence decay at border (per day)
export const INFLUENCE_OVERLAP_PENALTY = 5;
