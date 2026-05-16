// src/simulation/constants.ts

export const MAX_ENTITIES = 100_000;
export const MAX_GROUPS = 1000;
export const MAX_RULES = 100;
export const MAX_BUILDINGS = 20_000;
export const MAX_VEHICLES = 5_000;

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
}

export enum BuildingType {
  None = 0,
  Warehouse = 1,
  House = 2,
  Tower = 3,
  Wall = 4,
}

export enum VehicleType {
  None = 0,
  Cart = 1,
  Boat = 2,
  Helicopter = 3,
}

// Phase 19: OpCodes & Gates
export const OP_POP_GT = 0;
export const OP_WEALTH_LT = 1;
export const OP_RELATION_LT = 2;
export const OP_DIST_GT = 3;
export const GATE_AND = 100;
export const GATE_OR = 101;
export const GATE_NOT = 102;
export const OP_END = 255;

export const MAX_BYTECODE_PER_RULE = 32;
