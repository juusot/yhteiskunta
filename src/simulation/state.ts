// src/simulation/state.ts
import * as C from './constants';

// Global Component Arrays
export let positionX: Float32Array;
export let positionY: Float32Array;
export let velocityX: Float32Array;
export let velocityY: Float32Array;
export let health: Int32Array;
export let money: Int32Array;
export let state: Uint8Array;
export let actionTimer: Int16Array;
export let traitBitmask: Uint32Array;
export let targetEntityId: Int32Array;
export let pendingEvents: Int32Array;

// Phase 17: Hybrid Intel
export let carriedIntelEntityId: Int32Array;
export let carriedIntelX: Float32Array;
export let carriedIntelY: Float32Array;
export let mana: Int16Array;

// Phase 12: Logistics
export let entityInventory: Int16Array;

// Spatial Partitioning Arrays (Local to each worker)
export let spatialHead: Int32Array;
export let spatialNext: Int32Array;

// Entity Group Affiliations
export let groupAffiliations: Int32Array;

// Group Knowledge Registry
export let groupTargetEntityId: Int32Array;
export let groupTargetX: Float32Array;
export let groupTargetY: Float32Array;
export let groupTargetAge: Int32Array;

// Phase 12: Group Logistics
export let groupWarehouseX: Float32Array;
export let groupWarehouseY: Float32Array;

// Phase 13: Diplomacy Matrix
export let groupRelationsMatrix: Int8Array;

// Phase 14: Visual Archetypes
export let groupVisualArchetypes: Int8Array;

// Phase 17: Group Magic
export let groupMagicFrequency: Int8Array;

// Priority tracking for conflict resolution
export let activeCommandPriority: Uint8Array;
export let activePrioritySlot: Int8Array;

// Phase 20: Parallel Synchronization
export let workerSync: Int32Array;

// Rule Engine Registry
export let ruleRegistry: Int32Array;
export let logicBytecode: Int32Array;

// Analytics Arrays
export let groupPopulationCount: Int32Array;
export let groupTotalWealth: Int32Array;

// Phase 11: Environmental Dynamics
export let worldMap: Uint8Array;
export let globalFlowField: Float32Array;
export let integrationField: Float32Array;

// Phase 18: Influence & Territory
export let influenceMap: Int16Array;
export let territoryOwnerMap: Int32Array;
export let settlementTimerMap: Int16Array;

export let quadrantIndex: number = -1;
export let minX = 0, maxX = 1600, minY = 0, maxY = 1200;
export let tickCount = 0;
export let isPaused = false;

export function setQuadrantIndex(idx: number) {
  quadrantIndex = idx;
  if (quadrantIndex === 0) { minX = 0; maxX = 800; minY = 0; maxY = 600; }
  else if (quadrantIndex === 1) { minX = 800; maxX = 1600; minY = 0; maxY = 600; }
  else if (quadrantIndex === 2) { minX = 0; maxX = 800; minY = 600; maxY = 1200; }
  else if (quadrantIndex === 3) { minX = 800; maxX = 1600; minY = 600; maxY = 1200; }
}

export function incrementTick() { tickCount++; }
export function setTick(t: number) { tickCount = t; }
export function setPaused(p: boolean) { isPaused = p; }

export function initializeState(): void {
  // Master only: Allocate SharedArrayBuffers
  positionX = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  positionY = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  velocityX = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  velocityY = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  health = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  money = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  state = new Uint8Array(new SharedArrayBuffer(C.MAX_ENTITIES * 1));
  actionTimer = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  traitBitmask = new Uint32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  targetEntityId = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  pendingEvents = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4 * 4));
  carriedIntelEntityId = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  carriedIntelX = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  carriedIntelY = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  mana = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  entityInventory = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  groupAffiliations = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 8 * 4));
  activeCommandPriority = new Uint8Array(new SharedArrayBuffer(C.MAX_ENTITIES * 1));
  activePrioritySlot = new Int8Array(new SharedArrayBuffer(C.MAX_ENTITIES * 1));
  groupTargetEntityId = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTargetX = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTargetY = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTargetAge = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupWarehouseX = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupWarehouseY = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupMagicFrequency = new Int8Array(new SharedArrayBuffer(C.MAX_GROUPS));
  groupRelationsMatrix = new Int8Array(new SharedArrayBuffer(C.MAX_GROUPS * C.MAX_GROUPS));
  groupVisualArchetypes = new Int8Array(new SharedArrayBuffer(C.MAX_GROUPS));
  ruleRegistry = new Int32Array(new SharedArrayBuffer(C.MAX_RULES * 8 * 4));
  workerSync = new Int32Array(new SharedArrayBuffer(4 * 4));
  logicBytecode = new Int32Array(new SharedArrayBuffer(C.MAX_RULES * C.MAX_BYTECODE_PER_RULE * 4));
  groupPopulationCount = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTotalWealth = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  worldMap = new Uint8Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS));
  globalFlowField = new Float32Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS * 2 * 4));
  influenceMap = new Int16Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS * 2));
  territoryOwnerMap = new Int32Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS * 4));

  initializeLocalState();
}

export function mapStateBuffers(buffers: any): void {
  positionX = new Float32Array(buffers.positionX);
  positionY = new Float32Array(buffers.positionY);
  velocityX = new Float32Array(buffers.velocityX);
  velocityY = new Float32Array(buffers.velocityY);
  health = new Int32Array(buffers.health);
  money = new Int32Array(buffers.money);
  state = new Uint8Array(buffers.state);
  actionTimer = new Int16Array(buffers.actionTimer);
  traitBitmask = new Uint32Array(buffers.traitBitmask);
  targetEntityId = new Int32Array(buffers.targetEntityId);
  pendingEvents = new Int32Array(buffers.pendingEvents);
  groupAffiliations = new Int32Array(buffers.groupAffiliations);
  activeCommandPriority = new Uint8Array(buffers.activeCommandPriority);
  activePrioritySlot = new Int8Array(buffers.activePrioritySlot);
  groupTargetEntityId = new Int32Array(buffers.groupTargetEntityId);
  groupTargetX = new Float32Array(buffers.groupTargetX);
  groupTargetY = new Float32Array(buffers.groupTargetY);
  groupTargetAge = new Int32Array(buffers.groupTargetAge);
  ruleRegistry = new Int32Array(buffers.ruleRegistry);
  groupPopulationCount = new Int32Array(buffers.groupPopulationCount);
  groupTotalWealth = new Int32Array(buffers.groupTotalWealth);
  worldMap = new Uint8Array(buffers.worldMap);
  globalFlowField = new Float32Array(buffers.globalFlowField);
  entityInventory = new Int16Array(buffers.entityInventory);
  groupWarehouseX = new Float32Array(buffers.groupWarehouseX);
  groupWarehouseY = new Float32Array(buffers.groupWarehouseY);
  groupRelationsMatrix = new Int8Array(buffers.groupRelationsMatrix);
  groupVisualArchetypes = new Int8Array(buffers.groupVisualArchetypes);
  carriedIntelEntityId = new Int32Array(buffers.carriedIntelEntityId);
  carriedIntelX = new Float32Array(buffers.carriedIntelX);
  carriedIntelY = new Float32Array(buffers.carriedIntelY);
  mana = new Int16Array(buffers.mana);
  groupMagicFrequency = new Int8Array(buffers.groupMagicFrequency);
  influenceMap = new Int16Array(buffers.influenceMap);
  territoryOwnerMap = new Int32Array(buffers.territoryOwnerMap);
  logicBytecode = new Int32Array(buffers.logicBytecode);
  workerSync = new Int32Array(buffers.workerSync);

  initializeLocalState();
}

function initializeLocalState(): void {
  spatialHead = new Int32Array(C.NUM_CELLS);
  spatialHead.fill(-1);
  spatialNext = new Int32Array(C.MAX_ENTITIES);
  spatialNext.fill(-1);
  integrationField = new Float32Array(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS);
  settlementTimerMap = new Int16Array(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS);
}
