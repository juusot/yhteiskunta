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
export let targetBuildingId: Int32Array; // -1 if none
export let targetVehicleId: Int32Array; // -1 if none
export let isMounted: Uint8Array; // 1 if mounted, 0 otherwise
export let pendingEvents: Int32Array;

// Phase 17: Hybrid Intel
export let carriedIntelEntityId: Int32Array;
export let carriedIntelX: Float32Array;
export let carriedIntelY: Float32Array;
export let mana: Int16Array;

// Phase 12: Logistics
export let entityInventory: Int16Array;
export let charWeapon: Int8Array;
export let charArmor: Int8Array;
export let charTool: Int8Array;

// Phase 21: Character Base Stats
export let lifespan: Int16Array;        // Base years (default: 80)
export let damage: Int16Array;          // Base damage (default: 10)
export let speed: Float32Array;         // Base movement multiplier (default: 1.0)

// Phase 21: Effective Stats (cached, updated on buff change)
export let effectiveLifespan: Int16Array;   // Base + buffs
export let effectiveDamage: Int16Array;     // Base + buffs
export let effectiveSpeed: Float32Array;    // Base × buffs

// Spatial Partitioning Arrays (Local to each worker)
export let spatialHead: Int32Array;
export let spatialNext: Int32Array;
export let bldSpatialHead: Int32Array;
export let bldSpatialNext: Int32Array;
export let vehSpatialHead: Int32Array;
export let vehSpatialNext: Int32Array;

// Entity Group Affiliations
export let groupAffiliations: Int32Array;

// Group Knowledge Registry
export let groupTargetEntityId: Int32Array;
export let groupTargetX: Float32Array;
export let groupTargetY: Float32Array;
export let groupTargetAge: Int32Array;

// Phase 21: Group Metadata
export let groupCreatedAt: Int32Array;  // Game day when group was created

// Phase 12: Group Logistics
export let groupWarehouseX: Float32Array;
export let groupWarehouseY: Float32Array;

// Phase 13: Diplomacy Matrix
export let groupRelationsMatrix: Int8Array;

// Phase 14: Visual Archetypes
export let groupVisualArchetypes: Int8Array;

// Phase 23: National Cohesion (0-100, <30 = Anarchy)
export let groupCohesion: Int32Array;

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
export let groupBuildingCount: Int32Array;
export let groupTotalWealth: Int32Array;
export let groupWood: Int32Array;
export let groupGold: Int32Array;
export let groupFood: Int32Array;
export let groupMisc: Int32Array;

// Phase 11: Environmental Dynamics
export let worldMap: Uint8Array;
export let globalFlowField: Float32Array;
export let integrationField: Float32Array;

// Phase 18: Influence & Territory
export let influenceMap: Int16Array;
export let territoryOwnerMap: Int32Array;
export let settlementTimerMap: Int16Array;

// Phase 22: Buildings & Vehicles Subsystems
export let bldPositionX: Float32Array;
export let bldPositionY: Float32Array;
export let bldType: Uint8Array;
export let bldHealth: Int32Array;
export let bldOwnerGroup: Int32Array;
export let bldInventory: Int32Array; // [buildingIdx * 4] -> Wood, Gold, Food, Misc

export let vehPositionX: Float32Array;
export let vehPositionY: Float32Array;
export let vehVelocityX: Float32Array;
export let vehVelocityY: Float32Array;
export let vehType: Uint8Array;
export let vehHealth: Int32Array;
export let vehPilotId: Int32Array; // Character currently driving
export let vehOwnerGroup: Int32Array;

export let quadrantIndex: number = -1;
export let minX = 0, maxX = 1600, minY = 0, maxY = 1200;
export let tickCount = 0;
export let isPaused = false;

// Phase 21: Game Time
export let gameDay = 0;
export let gameMonth = 0;
export let gameYear = 0;
export let tickInDay = 0;

// Phase 21: Group Names (sparse storage, not SharedArrayBuffer)
export let groupNames: Map<number, string>;

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
  targetBuildingId = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  targetBuildingId.fill(-1);
  targetVehicleId = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  targetVehicleId.fill(-1);
  isMounted = new Uint8Array(new SharedArrayBuffer(C.MAX_ENTITIES));
  isMounted.fill(0);
  pendingEvents = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * C.EVENT_SLOTS_PER_CHARACTER * 4));
  carriedIntelEntityId = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  carriedIntelX = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  carriedIntelY = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  mana = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  entityInventory = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  charWeapon = new Int8Array(new SharedArrayBuffer(C.MAX_ENTITIES));
  charArmor = new Int8Array(new SharedArrayBuffer(C.MAX_ENTITIES));
  charTool = new Int8Array(new SharedArrayBuffer(C.MAX_ENTITIES));
  lifespan = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  damage = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  speed = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  effectiveLifespan = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  effectiveDamage = new Int16Array(new SharedArrayBuffer(C.MAX_ENTITIES * 2));
  effectiveSpeed = new Float32Array(new SharedArrayBuffer(C.MAX_ENTITIES * 4));
  groupAffiliations = new Int32Array(new SharedArrayBuffer(C.MAX_ENTITIES * C.MAX_GROUP_CHANNELS * 4));
  groupCohesion = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  activeCommandPriority = new Uint8Array(new SharedArrayBuffer(C.MAX_ENTITIES * 1));
  activePrioritySlot = new Int8Array(new SharedArrayBuffer(C.MAX_ENTITIES * 1));
  groupTargetEntityId = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTargetX = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTargetY = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTargetAge = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupCreatedAt = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupWarehouseX = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupWarehouseY = new Float32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupMagicFrequency = new Int8Array(new SharedArrayBuffer(C.MAX_GROUPS));
  groupRelationsMatrix = new Int8Array(new SharedArrayBuffer(C.MAX_GROUPS * C.MAX_GROUPS));
  groupVisualArchetypes = new Int8Array(new SharedArrayBuffer(C.MAX_GROUPS));
  groupNames = new Map<number, string>();
  ruleRegistry = new Int32Array(new SharedArrayBuffer(C.MAX_RULES * 8 * 4));
  workerSync = new Int32Array(new SharedArrayBuffer(4 * 4));
  logicBytecode = new Int32Array(new SharedArrayBuffer(C.MAX_RULES * C.MAX_BYTECODE_PER_RULE * 4));
  groupPopulationCount = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupBuildingCount = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupTotalWealth = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupWood = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupGold = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupFood = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  groupMisc = new Int32Array(new SharedArrayBuffer(C.MAX_GROUPS * 4));
  worldMap = new Uint8Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS));
  globalFlowField = new Float32Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS * 2 * 4));
  influenceMap = new Int16Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS * 2));
  territoryOwnerMap = new Int32Array(new SharedArrayBuffer(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS * 4));

  // Buildings
  bldPositionX = new Float32Array(new SharedArrayBuffer(C.MAX_BUILDINGS * 4));
  bldPositionY = new Float32Array(new SharedArrayBuffer(C.MAX_BUILDINGS * 4));
  bldType = new Uint8Array(new SharedArrayBuffer(C.MAX_BUILDINGS));
  bldHealth = new Int32Array(new SharedArrayBuffer(C.MAX_BUILDINGS * 4));
  bldOwnerGroup = new Int32Array(new SharedArrayBuffer(C.MAX_BUILDINGS * 4));
  bldInventory = new Int32Array(new SharedArrayBuffer(C.MAX_BUILDINGS * 4 * 4));

  // Vehicles
  vehPositionX = new Float32Array(new SharedArrayBuffer(C.MAX_VEHICLES * 4));
  vehPositionY = new Float32Array(new SharedArrayBuffer(C.MAX_VEHICLES * 4));
  vehVelocityX = new Float32Array(new SharedArrayBuffer(C.MAX_VEHICLES * 4));
  vehVelocityY = new Float32Array(new SharedArrayBuffer(C.MAX_VEHICLES * 4));
  vehType = new Uint8Array(new SharedArrayBuffer(C.MAX_VEHICLES));
  vehHealth = new Int32Array(new SharedArrayBuffer(C.MAX_VEHICLES * 4));
  vehPilotId = new Int32Array(new SharedArrayBuffer(C.MAX_VEHICLES * 4));
  vehOwnerGroup = new Int32Array(new SharedArrayBuffer(C.MAX_VEHICLES * 4));

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
  targetBuildingId = new Int32Array(buffers.targetBuildingId);
  targetVehicleId = new Int32Array(buffers.targetVehicleId);
  isMounted = new Uint8Array(buffers.isMounted);
  pendingEvents = new Int32Array(buffers.pendingEvents);
  groupAffiliations = new Int32Array(buffers.groupAffiliations);
  activeCommandPriority = new Uint8Array(buffers.activeCommandPriority);
  activePrioritySlot = new Int8Array(buffers.activePrioritySlot);
  groupTargetEntityId = new Int32Array(buffers.groupTargetEntityId);
  groupTargetX = new Float32Array(buffers.groupTargetX);
  groupTargetY = new Float32Array(buffers.groupTargetY);
  groupTargetAge = new Int32Array(buffers.groupTargetAge);
  groupCreatedAt = new Int32Array(buffers.groupCreatedAt);
  ruleRegistry = new Int32Array(buffers.ruleRegistry);
  groupPopulationCount = new Int32Array(buffers.groupPopulationCount);
  groupBuildingCount = new Int32Array(buffers.groupBuildingCount);
  groupTotalWealth = new Int32Array(buffers.groupTotalWealth);
  groupWood = new Int32Array(buffers.groupWood);
  groupGold = new Int32Array(buffers.groupGold);
  groupFood = new Int32Array(buffers.groupFood);
  groupMisc = new Int32Array(buffers.groupMisc);
  worldMap = new Uint8Array(buffers.worldMap);
  globalFlowField = new Float32Array(buffers.globalFlowField);
  entityInventory = new Int16Array(buffers.entityInventory);
  charWeapon = new Int8Array(buffers.charWeapon);
  charArmor = new Int8Array(buffers.charArmor);
  charTool = new Int8Array(buffers.charTool);
  lifespan = new Int16Array(buffers.lifespan);
  damage = new Int16Array(buffers.damage);
  speed = new Float32Array(buffers.speed);
  effectiveLifespan = new Int16Array(buffers.effectiveLifespan);
  effectiveDamage = new Int16Array(buffers.effectiveDamage);
  effectiveSpeed = new Float32Array(buffers.effectiveSpeed);
  groupWarehouseX = new Float32Array(buffers.groupWarehouseX);
  groupWarehouseY = new Float32Array(buffers.groupWarehouseY);
  groupRelationsMatrix = new Int8Array(buffers.groupRelationsMatrix);
  groupVisualArchetypes = new Int8Array(buffers.groupVisualArchetypes);
  groupCohesion = new Int32Array(buffers.groupCohesion);
  groupNames = new Map<number, string>();
  carriedIntelEntityId = new Int32Array(buffers.carriedIntelEntityId);
  carriedIntelX = new Float32Array(buffers.carriedIntelX);
  carriedIntelY = new Float32Array(buffers.carriedIntelY);
  mana = new Int16Array(buffers.mana);
  groupMagicFrequency = new Int8Array(buffers.groupMagicFrequency);
  influenceMap = new Int16Array(buffers.influenceMap);
  territoryOwnerMap = new Int32Array(buffers.territoryOwnerMap);
  logicBytecode = new Int32Array(buffers.logicBytecode);
  workerSync = new Int32Array(buffers.workerSync);

  // Buildings
  bldPositionX = new Float32Array(buffers.bldPositionX);
  bldPositionY = new Float32Array(buffers.bldPositionY);
  bldType = new Uint8Array(buffers.bldType);
  bldHealth = new Int32Array(buffers.bldHealth);
  bldOwnerGroup = new Int32Array(buffers.bldOwnerGroup);
  bldInventory = new Int32Array(buffers.bldInventory);

  // Vehicles
  vehPositionX = new Float32Array(buffers.vehPositionX);
  vehPositionY = new Float32Array(buffers.vehPositionY);
  vehVelocityX = new Float32Array(buffers.vehVelocityX);
  vehVelocityY = new Float32Array(buffers.vehVelocityY);
  vehType = new Uint8Array(buffers.vehType);
  vehHealth = new Int32Array(buffers.vehHealth);
  vehPilotId = new Int32Array(buffers.vehPilotId);
  vehOwnerGroup = new Int32Array(buffers.vehOwnerGroup);

  initializeLocalState();
}

function initializeLocalState(): void {
  spatialHead = new Int32Array(C.NUM_CELLS);
  spatialHead.fill(-1);
  spatialNext = new Int32Array(C.MAX_ENTITIES);
  spatialNext.fill(-1);

  bldSpatialHead = new Int32Array(C.NUM_CELLS);
  bldSpatialHead.fill(-1);
  bldSpatialNext = new Int32Array(C.MAX_BUILDINGS);
  bldSpatialNext.fill(-1);

  vehSpatialHead = new Int32Array(C.NUM_CELLS);
  vehSpatialHead.fill(-1);
  vehSpatialNext = new Int32Array(C.MAX_VEHICLES);
  vehSpatialNext.fill(-1);

  integrationField = new Float32Array(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS);
  settlementTimerMap = new Int16Array(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS);
}
