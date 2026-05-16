// src/simulationWorker.ts

export const MAX_ENTITIES = 100_000;
export const MAX_GROUPS = 1000;
export const MAX_RULES = 100;

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
export const TRAIT_AGGRESSIVE = 1 << 1;
export const TRAIT_SCOUT = 1 << 2;
export const TRAIT_FANATIC = 1 << 3;
export const TRAIT_COURIER = 1 << 4;
export const TRAIT_MAGIC = 1 << 5;

export const EVENT_HOSTILE_ATTACK = 99;

let tickCount = 0;
let isPaused = false;

// Component Enums
export enum EntityState {
  Idle = 0,
  Harvesting = 1,
  Fleeing = 2,
  Combat = 3,
  ReturningToDepot = 4,
  Dead = 5,
  Trading = 6,
  ReportingIntel = 7,
}

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

// Spatial Partitioning Arrays (Local to each worker in Phase 20)
export let spatialHead: Int32Array;
export let spatialNext: Int32Array;

// Entity Group Affiliations (8 slots per entity)
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
let quadrantIndex = -1;
let minX = 0, maxX = 1600, minY = 0, maxY = 1200;

// Rule Engine Registry
export let ruleRegistry: Int32Array;
export let logicBytecode: Int32Array;

// Phase 19: OpCodes & Gates
const OP_POP_GT = 0;
const OP_WEALTH_LT = 1;
const OP_RELATION_LT = 2;
const OP_DIST_GT = 3;
const GATE_AND = 100;
const GATE_OR = 101;
const GATE_NOT = 102;
const OP_END = 255;

const MAX_BYTECODE_PER_RULE = 32;

// Analytics Arrays (Summary System)
export let groupPopulationCount: Int32Array;
export let groupTotalWealth: Int32Array;

// Phase 11: Environmental Dynamics
export let worldMap: Uint8Array;
export let globalFlowField: Float32Array;
let integrationField: Float32Array;

// Phase 18: Influence & Territory
export let influenceMap: Int16Array;
export let territoryOwnerMap: Int32Array;
let settlementTimerMap: Int16Array;

/**
 * Initializes the global component arrays using SharedArrayBuffers.
 */
export function initializeSimulation(): void {
  positionX = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  positionY = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  velocityX = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  velocityY = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  health = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  money = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  state = new Uint8Array(new SharedArrayBuffer(MAX_ENTITIES * 1));
  actionTimer = new Int16Array(new SharedArrayBuffer(MAX_ENTITIES * 2));
  traitBitmask = new Uint32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  targetEntityId = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  pendingEvents = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4 * 4));
  
  carriedIntelEntityId = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  carriedIntelX = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  carriedIntelY = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  mana = new Int16Array(new SharedArrayBuffer(MAX_ENTITIES * 2));

  entityInventory = new Int16Array(new SharedArrayBuffer(MAX_ENTITIES * 2));

  spatialHead = new Int32Array(NUM_CELLS);
  spatialHead.fill(-1);
  spatialNext = new Int32Array(MAX_ENTITIES);
  spatialNext.fill(-1);

  groupAffiliations = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 8 * 4));

  activeCommandPriority = new Uint8Array(new SharedArrayBuffer(MAX_ENTITIES * 1));
  activePrioritySlot = new Int8Array(new SharedArrayBuffer(MAX_ENTITIES * 1));

  groupTargetEntityId = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetEntityId.fill(-1);
  groupTargetX = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetY = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetAge = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupWarehouseX = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupWarehouseY = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));

  groupMagicFrequency = new Int8Array(new SharedArrayBuffer(MAX_GROUPS));

  // Phase 13 & 14 Allocation
  groupRelationsMatrix = new Int8Array(new SharedArrayBuffer(MAX_GROUPS * MAX_GROUPS));
  groupVisualArchetypes = new Int8Array(new SharedArrayBuffer(MAX_GROUPS));
  
  groupRelationsMatrix.fill(0);

  for (let g = 0; g < MAX_GROUPS; g++) {
    groupTargetEntityId[g] = -1;
    groupTargetX[g] = 0;
    groupTargetY[g] = 0;
    groupTargetAge[g] = 0;
    
    // Assign visual archetype (0: Tri, 1: Circle, 2: Sq, 3: Star)
    groupVisualArchetypes[g] = Math.floor(Math.random() * 4);

    // Randomize magic frequency (Phase 17)
    groupMagicFrequency[g] = Math.random() > 0.7 ? 1 : 0;

    // Distribute warehouses around the world
    const angle = (g / 20) * Math.PI * 2;
    const dist = 400 + (g % 5) * 50;
    groupWarehouseX[g] = (WORLD_WIDTH / 2) + Math.cos(angle) * dist;
    groupWarehouseY[g] = (WORLD_HEIGHT / 2) + Math.sin(angle) * dist;
  }

  ruleRegistry = new Int32Array(new SharedArrayBuffer(MAX_RULES * 8 * 4));
  for (let r = 0; r < MAX_RULES * 8; r++) ruleRegistry[r] = 0;

  workerSync = new Int32Array(new SharedArrayBuffer(4 * 4)); // 4 slots for sync phases
  
  logicBytecode = new Int32Array(new SharedArrayBuffer(MAX_RULES * MAX_BYTECODE_PER_RULE * 4));
  logicBytecode.fill(OP_END);

  groupPopulationCount = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTotalWealth = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));

  worldMap = new Uint8Array(new SharedArrayBuffer(WORLD_MAP_COLS * WORLD_MAP_ROWS));
  globalFlowField = new Float32Array(new SharedArrayBuffer(WORLD_MAP_COLS * WORLD_MAP_ROWS * 2 * 4));
  integrationField = new Float32Array(WORLD_MAP_COLS * WORLD_MAP_ROWS);

  influenceMap = new Int16Array(new SharedArrayBuffer(WORLD_MAP_COLS * WORLD_MAP_ROWS * 2));
  territoryOwnerMap = new Int32Array(new SharedArrayBuffer(WORLD_MAP_COLS * WORLD_MAP_ROWS * 4));
  territoryOwnerMap.fill(-1);
  settlementTimerMap = new Int16Array(WORLD_MAP_COLS * WORLD_MAP_ROWS);

  generateBiomes();

  for (let i = 0; i < MAX_ENTITIES; i++) {
    positionX[i] = Math.random() * WORLD_WIDTH;
    positionY[i] = Math.random() * WORLD_HEIGHT;
    velocityX[i] = (Math.random() - 0.5) * 2;
    velocityY[i] = (Math.random() - 0.5) * 2;
    health[i] = 40 + Math.floor(Math.random() * 61);
    money[i] = 0;
    state[i] = EntityState.Idle;
    actionTimer[i] = 0;
    traitBitmask[i] = TRAIT_NONE;
    targetEntityId[i] = -1;
    activeCommandPriority[i] = 0;
    activePrioritySlot[i] = -1;
    entityInventory[i] = 0;
    mana[i] = 100;
    carriedIntelEntityId[i] = -1;
    
    const baseEventIdx = i * 4;
    pendingEvents[baseEventIdx] = -1;
    pendingEvents[baseEventIdx + 1] = -1;
    pendingEvents[baseEventIdx + 2] = -1;
    pendingEvents[baseEventIdx + 3] = -1;
    
    const baseAffIdx = i * 8;
    for (let s = 0; s < 8; s++) groupAffiliations[baseAffIdx + s] = -1;

    groupAffiliations[baseAffIdx] = Math.floor(Math.random() * 10);
    groupAffiliations[baseAffIdx + 1] = Math.floor(Math.random() * 50);
  }

  for (let i = 0; i < 5000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    traitBitmask[idx] |= TRAIT_TREE;
    velocityX[idx] = 0;
    velocityY[idx] = 0;
  }

  for (let i = 0; i < 2000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    if ((traitBitmask[idx] & TRAIT_TREE) === 0) {
      traitBitmask[idx] |= TRAIT_AGGRESSIVE;
      if (Math.random() > 0.5) traitBitmask[idx] |= TRAIT_SCOUT;
      if (Math.random() > 0.8) traitBitmask[idx] |= TRAIT_MAGIC;
    }
  }

  // DEFAULT RULES (Disabled)
  ruleRegistry[0] = 0; ruleRegistry[1] = 5; ruleRegistry[2] = 0; ruleRegistry[3] = 2000; 
  ruleRegistry[4] = EntityState.Combat; ruleRegistry[5] = 800; ruleRegistry[6] = 600; ruleRegistry[7] = 0;

  ruleRegistry[8] = 0; ruleRegistry[9] = 2; ruleRegistry[10] = 1; ruleRegistry[11] = 1000; 
  ruleRegistry[12] = EntityState.Harvesting; ruleRegistry[13] = 400; ruleRegistry[14] = 300; ruleRegistry[15] = 0;
}

function generateBiomes(): void {
  worldMap.fill(0);
  const centerX = WORLD_MAP_COLS / 2;
  const centerY = WORLD_MAP_ROWS / 2;
  const radius = 25;
  for (let y = 0; y < WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < WORLD_MAP_COLS; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy < radius * radius) worldMap[y * WORLD_MAP_COLS + x] = 2;
    }
  }

  for (let i = 0; i < 30; i++) {
    const fx = Math.floor(Math.random() * WORLD_MAP_COLS);
    const fy = Math.floor(Math.random() * WORLD_MAP_ROWS);
    const fr = Math.floor(Math.random() * 10) + 5;
    for (let y = Math.max(0, fy - fr); y < Math.min(WORLD_MAP_ROWS, fy + fr); y++) {
      for (let x = Math.max(0, fx - fr); x < Math.min(WORLD_MAP_COLS, fx + fr); x++) {
        const dx = x - fx; const dy = y - fy;
        if (dx * dx + dy * dy < fr * fr) {
          if (worldMap[y * WORLD_MAP_COLS + x] === 0) worldMap[y * WORLD_MAP_COLS + x] = 1;
        }
      }
    }
  }
}

function updateFlowField(targetX: number, targetY: number): void {
  const targetTileX = Math.floor(targetX / TILE_SIZE);
  const targetTileY = Math.floor(targetY / TILE_SIZE);
  if (targetTileX < 0 || targetTileX >= WORLD_MAP_COLS || targetTileY < 0 || targetTileY >= WORLD_MAP_ROWS) return;

  integrationField.fill(65535);
  const targetIdx = targetTileY * WORLD_MAP_COLS + targetTileX;
  integrationField[targetIdx] = 0;
  const queue: number[] = [targetIdx];
  let head = 0;

  while (head < queue.length) {
    const currIdx = queue[head++];
    const currX = currIdx % WORLD_MAP_COLS;
    const currY = Math.floor(currIdx / WORLD_MAP_COLS);
    const currCost = integrationField[currIdx];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = currX + dx; const ny = currY + dy;
        if (nx >= 0 && nx < WORLD_MAP_COLS && ny >= 0 && ny < WORLD_MAP_ROWS) {
          const nIdx = ny * WORLD_MAP_COLS + nx;
          const terrain = worldMap[nIdx];
          let stepCost = (dx !== 0 && dy !== 0) ? 1.4 : 1.0;
          if (terrain === 1) stepCost *= 3;
          if (terrain === 2) stepCost = 255;
          const totalCost = currCost + stepCost;
          if (totalCost < integrationField[nIdx]) { integrationField[nIdx] = totalCost; queue.push(nIdx); }
        }
      }
    }
  }

  for (let y = 0; y < WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < WORLD_MAP_COLS; x++) {
      const idx = y * WORLD_MAP_COLS + x;
      const fIdx = idx * 2;
      let bestX = 0; let bestY = 0; let minCost = integrationField[idx];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && nx < WORLD_MAP_COLS && ny >= 0 && ny < WORLD_MAP_ROWS) {
            const nCost = integrationField[ny * WORLD_MAP_COLS + nx];
            if (nCost < minCost) { minCost = nCost; bestX = dx; bestY = dy; }
          }
        }
      }
      const len = Math.sqrt(bestX * bestX + bestY * bestY);
      if (len > 0) { globalFlowField[fIdx] = bestX / len; globalFlowField[fIdx + 1] = bestY / len; }
      else { globalFlowField[fIdx] = 0; globalFlowField[fIdx + 1] = 0; }
    }
  }
}

function SummarySystem(): void {
  groupPopulationCount.fill(0);
  let totalActive = 0;
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] !== EntityState.Dead) {
      const primaryGroupId = groupAffiliations[i * 8];
      if (primaryGroupId >= 0 && primaryGroupId < MAX_GROUPS) {
        groupPopulationCount[primaryGroupId]++;
        totalActive++;
      }
    }
  }

  const starvingGroups = new Uint8Array(MAX_GROUPS);
  for (let g = 0; g < MAX_GROUPS; g++) {
    const pop = groupPopulationCount[g];
    if (pop === 0) continue;
    const foodRequired = Math.floor(pop * 0.1);
    groupTotalWealth[g] -= foodRequired;
    if (groupTotalWealth[g] <= 0) {
      groupTotalWealth[g] = 0;
      starvingGroups[g] = 1;
    }
  }

  // Reproduction & Safety Net
  let deadPtr = 0;
  for (let g = 0; g < MAX_GROUPS; g++) {
    const pop = groupPopulationCount[g];
    const wealth = groupTotalWealth[g];
    
    // SAFETY NET: If group is near extinction, provide 1 free respawn per cycle
    const needsSafetySpawn = pop < 20 && tickCount % 60 === 0;
    // REPRODUCTION: If wealthy, allow up to 5 births
    const canAffordReproduction = wealth > 1000 && pop < 15000;
    
    if (needsSafetySpawn || canAffordReproduction) {
      let births = 0;
      const maxBirths = needsSafetySpawn ? 1 : 5;
      const costPerBirth = needsSafetySpawn ? 0 : 100; // One harvest trip value

      while (births < maxBirths && (needsSafetySpawn || (wealth > 1000))) {
        while (deadPtr < MAX_ENTITIES && state[deadPtr] !== EntityState.Dead) deadPtr++;
        if (deadPtr >= MAX_ENTITIES) break;
        
        const i = deadPtr;
        state[i] = EntityState.Idle;
        health[i] = 100;
        positionX[i] = groupWarehouseX[g];
        positionY[i] = groupWarehouseY[g];
        velocityX[i] = (Math.random() - 0.5);
        velocityY[i] = (Math.random() - 0.5);
        groupAffiliations[i * 8] = g;
        targetEntityId[i] = -1;
        entityInventory[i] = 0;
        actionTimer[i] = 60;
        
        groupTotalWealth[g] -= costPerBirth;
        births++;
        deadPtr++;
        if (needsSafetySpawn) break; // Only 1 safety spawn per group per cycle
      }
    }
  }

  // Starvation damage pass (Reduced from 10 to 2)
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] === EntityState.Dead) continue;
    const gid = groupAffiliations[i * 8];
    if (gid >= 0 && gid < MAX_GROUPS && starvingGroups[gid] === 1) {
      health[i] -= 2;
    }
  }

  // Mana Regeneration (Phase 17)
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((traitBitmask[i] & TRAIT_MAGIC) !== 0) {
      mana[i] = Math.min(100, mana[i] + 5);
    }
  }

  self.postMessage({ type: "STATS_UPDATE", payload: { totalActive } });
}

const logicStack = new Int8Array(16); // Fixed stack for VM

function evaluateCompoundRule(ruleIdx: number): boolean {
  let sp = 0;
  const baseOffset = ruleIdx * MAX_BYTECODE_PER_RULE;
  const gid = ruleRegistry[ruleIdx * 8 + 1];

  for (let i = 0; i < MAX_BYTECODE_PER_RULE; i++) {
    const op = logicBytecode[baseOffset + i];
    if (op === OP_END) break;

    switch (op) {
      case OP_POP_GT:
        logicStack[sp++] = groupPopulationCount[gid] > logicBytecode[baseOffset + ++i] ? 1 : 0;
        break;
      case OP_WEALTH_LT:
        logicStack[sp++] = groupTotalWealth[gid] < logicBytecode[baseOffset + ++i] ? 1 : 0;
        break;
      case OP_RELATION_LT: {
        const otherGid = logicBytecode[baseOffset + ++i];
        const threshold = logicBytecode[baseOffset + ++i];
        logicStack[sp++] = groupRelationsMatrix[gid * MAX_GROUPS + otherGid] < threshold ? 1 : 0;
        break;
      }
      case OP_DIST_GT: {
        const targetX = logicBytecode[baseOffset + ++i];
        const targetY = logicBytecode[baseOffset + ++i];
        const threshold = logicBytecode[baseOffset + ++i];
        const dx = groupWarehouseX[gid] - targetX, dy = groupWarehouseY[gid] - targetY;
        logicStack[sp++] = (dx * dx + dy * dy > threshold * threshold) ? 1 : 0;
        break;
      }
      case GATE_AND: {
        const b = logicStack[--sp], a = logicStack[--sp];
        logicStack[sp++] = (a && b) ? 1 : 0;
        break;
      }
      case GATE_OR: {
        const b = logicStack[--sp], a = logicStack[--sp];
        logicStack[sp++] = (a || b) ? 1 : 0;
        break;
      }
      case GATE_NOT: {
        logicStack[sp-1] = logicStack[sp-1] ? 0 : 1;
        break;
      }
    }
  }
  return sp > 0 ? logicStack[0] === 1 : false;
}

function RuleEvaluationSystem(): void {
  for (let gA = 0; gA < 50; gA++) {
    if (groupPopulationCount[gA] === 0) continue;
    for (let gB = 0; gB < 50; gB++) {
      if (gA === gB || groupPopulationCount[gB] === 0) continue;
      const relation = groupRelationsMatrix[gA * MAX_GROUPS + gB];
      if (relation <= -50) {
        broadcastGroupCommand(gA, EntityState.Combat, groupWarehouseX[gB], groupWarehouseY[gB]);
      }
    }
  }

  let firstActiveLocationTargetX = -1;
  let firstActiveLocationTargetY = -1;
  for (let r = 0; r < MAX_RULES; r++) {
    const baseIdx = r * 8;
    if (ruleRegistry[baseIdx + 7] === 0) continue;
    const subjectId = ruleRegistry[baseIdx + 1];
    const conditionType = ruleRegistry[baseIdx + 2];
    const threshold = ruleRegistry[baseIdx + 3];
    const actionState = ruleRegistry[baseIdx + 4];
    const targetX = ruleRegistry[baseIdx + 5];
    const targetY = ruleRegistry[baseIdx + 6];

    let conditionMet = false;
    if (conditionType === 255) {
      conditionMet = evaluateCompoundRule(r);
    } else {
      if (conditionType === 0) { if (groupPopulationCount[subjectId] > threshold) conditionMet = true; }
      else if (conditionType === 1) { if (groupTotalWealth[subjectId] > threshold) conditionMet = true; }
      else if (conditionType === 3) { if (groupTotalWealth[subjectId] < threshold) conditionMet = true; }
    }

    if (conditionMet) {      if (actionState === 99) self.postMessage({ type: "SAVE_REQUEST" });
      else {
        broadcastGroupCommand(subjectId, actionState, targetX, targetY);
        if (firstActiveLocationTargetX === -1) { firstActiveLocationTargetX = targetX; firstActiveLocationTargetY = targetY; }
      }
    }
  }
  if (firstActiveLocationTargetX !== -1) updateFlowField(firstActiveLocationTargetX, firstActiveLocationTargetY);
}

function LifeSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] === EntityState.Dead) continue;
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue;
    let decayRate = 1;
    if (money[i] > 0) decayRate = 0;
    if (state[i] === EntityState.Harvesting || state[i] === EntityState.ReturningToDepot) decayRate = 0;
    if (tickCount % (60 + (i % 30)) === 0) health[i] -= decayRate;

    // Territorial Attrition (Phase 18)
    if (tickCount % 60 === 0) {
      const tx = Math.floor(positionX[i] / TILE_SIZE), ty = Math.floor(positionY[i] / TILE_SIZE);
      if (tx >= 0 && tx < WORLD_MAP_COLS && ty >= 0 && ty < WORLD_MAP_ROWS) {
        const owner = territoryOwnerMap[ty * WORLD_MAP_COLS + tx];
        const gid = groupAffiliations[i * 8];
        if (owner !== -1 && owner !== gid) {
           const rel = groupRelationsMatrix[gid * MAX_GROUPS + owner];
           if (rel < -50) health[i] -= 2; // Attrition in enemy territory
        }
      }
    }

    if (state[i] === EntityState.Harvesting && targetEntityId[i] !== -1) {
      if (tickCount % 4 === 0) { health[i]++; if (health[i] > 100) health[i] = 100; }
    }
    if (health[i] <= 0) {
      // Phase 16: Raiding
      if ((traitBitmask[i] & TRAIT_COURIER) !== 0 && entityInventory[i] > 0) {
        const attackerId = targetEntityId[i];
        if (attackerId >= 0 && attackerId < MAX_ENTITIES) {
          const attackerGroup = groupAffiliations[attackerId * 8];
          if (attackerGroup >= 0 && attackerGroup < MAX_GROUPS) {
            groupTotalWealth[attackerGroup] += entityInventory[i];
          }
        }
      }
      state[i] = EntityState.Dead;
      positionX[i] = -1000.0;
      positionY[i] = -1000.0;
      targetEntityId[i] = -1;
      velocityX[i] = 0;
      velocityY[i] = 0;
      entityInventory[i] = 0;
      actionTimer[i] = 0;
      traitBitmask[i] = TRAIT_NONE;
    }
  }
}

function waitForAll(phase: number): void {
  const target = 4;
  Atomics.add(workerSync, phase, 1);
  while (Atomics.load(workerSync, phase) < target) { /* busy wait */ }
}

function SpatialUpdateSystem(): void {
  // Clear local domain in spatialHead + ghost cells (50px padding)
  const startX = Math.max(0, Math.floor((minX - 100) / GRID_SIZE));
  const endX = Math.min(GRID_COLS - 1, Math.floor((maxX + 100) / GRID_SIZE));
  const startY = Math.max(0, Math.floor((minY - 100) / GRID_SIZE));
  const endY = Math.min(GRID_ROWS - 1, Math.floor((maxY + 100) / GRID_SIZE));

  for (let cy = startY; cy <= endY; cy++) {
    for (let cx = startX; cx <= endX; cx++) {
      spatialHead[cy * GRID_COLS + cx] = -1;
    }
  }

  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] === EntityState.Dead) continue;
    let worldX = positionX[i], worldY = positionY[i];
    // Ghost Cell Padding (50px)
    if (worldX < minX - 50 || worldX >= maxX + 50 || worldY < minY - 50 || worldY >= maxY + 50) continue;

    let cellX = Math.floor(worldX / GRID_SIZE);
    let cellY = Math.floor(worldY / GRID_SIZE);
    cellX = Math.max(0, Math.min(GRID_COLS - 1, cellX));
    cellY = Math.max(0, Math.min(GRID_ROWS - 1, cellY));
    const cellIndex = cellY * GRID_COLS + cellX;
    
    spatialNext[i] = spatialHead[cellIndex];
    spatialHead[cellIndex] = i;
  }
}

function findNearest(x: number, y: number, radius: number, filterBitmask: number): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / GRID_SIZE));
  const maxCellX = Math.min(GRID_COLS - 1, Math.floor((x + radius) / GRID_SIZE));
  const minCellY = Math.max(0, Math.floor((y - radius) / GRID_SIZE));
  const maxCellY = Math.min(GRID_ROWS - 1, Math.floor((y + radius) / GRID_SIZE));
  let itemsChecked = 0;
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * GRID_COLS + cx;
      let entityId = spatialHead[cellIndex];
      while (entityId !== -1) {
        itemsChecked++;
        if (itemsChecked >= 64) break;
        if (filterBitmask === 0xFFFFFFFF || (traitBitmask[entityId] & filterBitmask) !== 0) {
          const dx = positionX[entityId] - x; const dy = positionY[entityId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) { minDistanceSq = distSq; closestId = entityId; }
        }
        entityId = spatialNext[entityId];
      }
      if (itemsChecked >= 64) break;
    }
    if (itemsChecked >= 64) break;
  }
  return closestId;
}

export function pushEvent(entityId: number, eventId: number): boolean {
  const baseIndex = entityId * 4;
  for (let slot = 0; slot < 4; slot++) {
    if (pendingEvents[baseIndex + slot] === -1) { pendingEvents[baseIndex + slot] = eventId; return true; }
  }
  return false;
}

export function popNextEvent(entityId: number): number {
  const baseIndex = entityId * 4;
  const nextEventId = pendingEvents[baseIndex];
  pendingEvents[baseIndex] = pendingEvents[baseIndex + 1];
  pendingEvents[baseIndex + 1] = pendingEvents[baseIndex + 2];
  pendingEvents[baseIndex + 2] = pendingEvents[baseIndex + 3];
  pendingEvents[baseIndex + 3] = -1;
  return nextEventId;
}

function MovementSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] === EntityState.Dead) continue;
    const worldX = positionX[i]; const worldY = positionY[i];
    // Domain Check
    if (worldX < minX || worldX >= maxX || worldY < minY || worldY >= maxY) continue;

    const tileX = Math.floor(worldX / TILE_SIZE); const tileY = Math.floor(worldY / TILE_SIZE);
    const tileIndex = Math.min(WORLD_MAP_COLS * WORLD_MAP_ROWS - 1, Math.max(0, tileY * WORLD_MAP_COLS + tileX));
    let speedModifier = 1.0;
    const terrainType = worldMap[tileIndex];
    if (terrainType === 1) speedModifier = 0.6;
    if (terrainType === 2) speedModifier = 0.2;
    positionX[i] += velocityX[i] * speedModifier; positionY[i] += velocityY[i] * speedModifier;
    if (positionX[i] < 0) { positionX[i] = 0; velocityX[i] *= -1; }
    else if (positionX[i] > 1600) { positionX[i] = 1600; velocityX[i] *= -1; }
    if (positionY[i] < 0) { positionY[i] = 0; velocityY[i] *= -1; }
    else if (positionY[i] > 1200) { positionY[i] = 1200; velocityY[i] *= -1; }
  }
}

function AutonomySystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] === EntityState.Dead || (traitBitmask[i] & TRAIT_TREE) !== 0) continue;
    // Domain Check
    if (positionX[i] < minX || positionX[i] >= maxX || positionY[i] < minY || positionY[i] >= maxY) continue;

    if (actionTimer[i] > 0) {
      actionTimer[i]--;
    } else {
      if (state[i] === EntityState.Harvesting && targetEntityId[i] !== -1) {
        entityInventory[i] += 10;
        state[i] = EntityState.ReturningToDepot;
        targetEntityId[i] = -1;
        actionTimer[i] = 0; 
        continue; 
      }
      if (state[i] === EntityState.ReturningToDepot) {
         const nextEvent = pendingEvents[i * 4];
         if (nextEvent === EVENT_HOSTILE_ATTACK) { popNextEvent(i); state[i] = EntityState.Fleeing; actionTimer[i] = 180; continue; }
         continue; 
      }

      activePrioritySlot[i] = -1;
      const nextEvent = pendingEvents[i * 4];
      if (nextEvent !== -1) {
        popNextEvent(i);
        if (nextEvent === EVENT_HOSTILE_ATTACK) {
          if ((traitBitmask[i] & TRAIT_AGGRESSIVE) !== 0) { state[i] = EntityState.Combat; actionTimer[i] = 120; }
          else { state[i] = EntityState.Fleeing; actionTimer[i] = 180; }
          activeCommandPriority[i] = 0; activePrioritySlot[i] = -1; continue;
        }
      }

      if (state[i] === EntityState.Idle || activePrioritySlot[i] !== -1) {
        const baseIdx = i * 8;
        let foundHigherPriority = false;
        const currentActiveSlot = activePrioritySlot[i];
        const maxSlotToSearch = (traitBitmask[i] & TRAIT_FANATIC) !== 0 ? 1 : (currentActiveSlot === -1 ? 8 : currentActiveSlot);
        for (let s = 0; s < maxSlotToSearch; s++) {
          const groupId = groupAffiliations[baseIdx + s];
          if (groupId !== -1) {
            const targetId = groupTargetEntityId[groupId];
            if (targetId !== -1) { 
              targetEntityId[i] = targetId; state[i] = EntityState.Combat; actionTimer[i] = 300;
              activeCommandPriority[i] = 8 - s; activePrioritySlot[i] = s; foundHigherPriority = true; break;
            }
          }
        }
        if (foundHigherPriority) continue;
        if (state[i] !== EntityState.Idle) continue;
        
        const rand = Math.random();
        let nextState: number;
        if (rand > 0.4) nextState = EntityState.Harvesting;
        else if (rand > 0.2) nextState = EntityState.Fleeing;
        else nextState = EntityState.Combat;
        state[i] = nextState;
        const canSearch = (tickCount + i) % 15 === 0;
        if (nextState === EntityState.Harvesting) {
          if (canSearch && targetEntityId[i] === -1) {
            const treeId = findNearest(positionX[i], positionY[i], 80, TRAIT_TREE);
            if (treeId !== -1) { targetEntityId[i] = treeId; actionTimer[i] = 200; }
            else { state[i] = EntityState.Idle; actionTimer[i] = 30; }
          } else if (targetEntityId[i] === -1) { state[i] = EntityState.Idle; actionTimer[i] = 1; }
        } else if (nextState === EntityState.Combat) {
          if (canSearch && targetEntityId[i] === -1) {
            const targetId = findNearest(positionX[i], positionY[i], 80, ~TRAIT_TREE);
            if (targetId !== -1 && targetId !== i) { targetEntityId[i] = targetId; actionTimer[i] = 120; }
            else { state[i] = EntityState.Idle; actionTimer[i] = 30; }
          } else if (targetEntityId[i] === -1) { state[i] = EntityState.Idle; actionTimer[i] = 1; }
        } else { actionTimer[i] = 120; }
        activeCommandPriority[i] = 0;
      } else {
        state[i] = EntityState.Idle; actionTimer[i] = 30; activeCommandPriority[i] = 0;
      }
    }
  }
}

function IntelReportingSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] === EntityState.Dead) continue;
    if ((traitBitmask[i] & TRAIT_SCOUT) !== 0 && state[i] === EntityState.Idle) {
      const enemyId = findNearest(positionX[i], positionY[i], 150, TRAIT_AGGRESSIVE);
      if (enemyId !== -1) {
        const groupId = groupAffiliations[i * 8];
        if (groupId !== -1) {
          // Store Intel
          carriedIntelEntityId[i] = enemyId;
          carriedIntelX[i] = positionX[enemyId];
          carriedIntelY[i] = positionY[enemyId];

          // Check for Telepathic Burst
          const wx = groupWarehouseX[groupId]; const wy = groupWarehouseY[groupId];
          const dx = wx - positionX[i]; const dy = wy - positionY[i];
          const inRange = (dx * dx + dy * dy < 400 * 400);
          const groupCanReceive = groupMagicFrequency[groupId] === 1;

          if ((traitBitmask[i] & TRAIT_MAGIC) !== 0 && mana[i] >= 50 && inRange && groupCanReceive) {
            // Instant Commit
            groupTargetEntityId[groupId] = enemyId;
            groupTargetX[groupId] = positionX[enemyId];
            groupTargetY[groupId] = positionY[enemyId];
            groupTargetAge[groupId] = 0;
            mana[i] -= 50;
            carriedIntelEntityId[i] = -1;
            // Visual Burst Signal
            self.postMessage({ type: "MAGIC_BURST", payload: { fromX: positionX[i], fromY: positionY[i], toX: wx, toY: wy } });
          } else {
            // Physical Reporting
            state[i] = EntityState.ReportingIntel;
          }
        }
      }
    }
  }
}

function GroupKnowledgeDecaySystem(): void {
  for (let g = 0; g < MAX_GROUPS; g++) {
    if (groupTargetEntityId[g] !== -1) {
      groupTargetAge[g]++;
      if (groupTargetAge[g] > 500) { groupTargetEntityId[g] = -1; groupTargetAge[g] = 0; }
    }
  }
}

export function broadcastGroupCommand(groupId: number, commandState: number, targetX: number, targetY: number): void {
  if (groupId >= 0 && groupId < MAX_GROUPS) {
    groupTargetX[groupId] = targetX; groupTargetY[groupId] = targetY; groupTargetEntityId[groupId] = -2; groupTargetAge[groupId] = 0;
  }
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue; // Trees ignore commands
    let issuingPriority = 0; let slotIdx = -1; const baseIdx = i * 8;
    for (let s = 0; s < 8; s++) { if (groupAffiliations[baseIdx + s] === groupId) { slotIdx = s; issuingPriority = 8 - s; break; } }
    if (issuingPriority > 0) {
      if (activePrioritySlot[i] === -1 || slotIdx <= activePrioritySlot[i]) {
        state[i] = commandState; actionTimer[i] = 0; activeCommandPriority[i] = issuingPriority; activePrioritySlot[i] = slotIdx;
      }
    }
  }
}

function CombatDamageSystem(attackerId: number, victimId: number, damageValue: number): void {
  health[victimId] -= damageValue; targetEntityId[victimId] = -1; actionTimer[victimId] = 0;
  const groupA = groupAffiliations[attackerId * 8]; const groupB = groupAffiliations[victimId * 8];
  if (groupA !== -1 && groupB !== -1 && groupA !== groupB) {
    let penalty = 5;
    
    // Border Friction (Phase 18)
    const tx = Math.floor(positionX[victimId] / TILE_SIZE), ty = Math.floor(positionY[victimId] / TILE_SIZE);
    if (tx >= 0 && tx < WORLD_MAP_COLS && ty >= 0 && ty < WORLD_MAP_ROWS) {
      const owner = territoryOwnerMap[ty * WORLD_MAP_COLS + tx];
      if (owner === groupB) penalty = 15; // Hitting someone in their home territory is a major escalation
    }

    const idx = (groupB * MAX_GROUPS) + groupA;
    groupRelationsMatrix[idx] = Math.max(-100, groupRelationsMatrix[idx] - penalty);
  }
  const baseIndex = victimId * 4;
  pendingEvents[baseIndex] = EVENT_HOSTILE_ATTACK; targetEntityId[victimId] = attackerId;
}

function TradeSystem(): void {
  for (let gA = 0; gA < 50; gA++) { // Throttle to first 50 for performance
    if (groupTotalWealth[gA] > 15000) {
      for (let gB = 0; gB < 50; gB++) {
        if (gA === gB) continue;
        if (groupTotalWealth[gB] < 1000) {
          const relation = groupRelationsMatrix[gA * MAX_GROUPS + gB];
          if (relation >= 0) {
            // Trigger Trade Contract
            groupTotalWealth[gA] -= 2000;
            let couriersDispatched = 0;
            for (let i = 0; i < MAX_ENTITIES && couriersDispatched < 5; i++) {
              if (state[i] === EntityState.Idle && groupAffiliations[i * 8] === gA) {
                const dx = positionX[i] - groupWarehouseX[gA];
                const dy = positionY[i] - groupWarehouseY[gA];
                if (dx * dx + dy * dy < 10000) { // Near warehouse (100px)
                  traitBitmask[i] |= TRAIT_COURIER;
                  state[i] = EntityState.Trading;
                  entityInventory[i] = 400;
                  targetEntityId[i] = -1000 - gB; // Destination Leg
                  couriersDispatched++;
                }
              }
            }
            break; // One contract per gA per check
          }
        }
      }
    }
  }
}

function SteeringSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue;
    // Domain Check
    if (positionX[i] < minX || positionX[i] >= maxX || positionY[i] < minY || positionY[i] >= maxY) continue;

    if (state[i] === EntityState.ReportingIntel) {      const gid = groupAffiliations[i * 8];
      if (gid === -1) { state[i] = EntityState.Idle; continue; }
      const wx = groupWarehouseX[gid]; const wy = groupWarehouseY[gid];
      const dx = wx - positionX[i]; const dy = wy - positionY[i];
      const distSq = dx * dx + dy * dy;

      if (distSq < 25.0) { // Arrival (5px)
        // Commit Intel
        const enemyId = carriedIntelEntityId[i];
        if (enemyId !== -1) {
          groupTargetEntityId[gid] = enemyId;
          groupTargetX[gid] = carriedIntelX[i];
          groupTargetY[gid] = carriedIntelY[i];
          groupTargetAge[gid] = 0;
          carriedIntelEntityId[i] = -1;
        }
        state[i] = EntityState.Idle; actionTimer[i] = 60;
        continue;
      }
      const dist = Math.sqrt(distSq);
      velocityX[i] = (dx / dist) * 1.8; velocityY[i] = (dy / dist) * 1.8;
      continue;
    }

    if (state[i] === EntityState.ReturningToDepot) {
      const gid = groupAffiliations[i * 8];
      const validGid = (gid >= 0 && gid < MAX_GROUPS) ? gid : 0;
      const wx = groupWarehouseX[validGid]; const wy = groupWarehouseY[validGid];
      const dx = wx - positionX[i]; const dy = wy - positionY[i];
      const distSq = dx * dx + dy * dy;
      
      if (distSq < 400.0) {
        if (distSq < 1.0) {
          groupTotalWealth[validGid] += entityInventory[i];
          money[i] += 100;
          entityInventory[i] = 0;
          state[i] = EntityState.Idle; actionTimer[i] = 60;
          velocityX[i] = (Math.random() - 0.5); velocityY[i] = (Math.random() - 0.5);
          continue;
        }
        // Braking/Arrival Damping
        const dist = Math.sqrt(distSq);
        const damp = dist / 20.0;
        velocityX[i] = (dx / dist) * 1.5 * damp;
        velocityY[i] = (dy / dist) * 1.5 * damp;
        continue;
      } else {
        const dist = Math.sqrt(distSq);
        velocityX[i] = (dx / dist) * 1.5; velocityY[i] = (dy / dist) * 1.5;
        continue;
      }
    }
    const targetId = targetEntityId[i];
    if (targetId === -1) continue;
    let tx: number, ty: number;

    // Phase 16: Courier Logic
    if (state[i] === EntityState.Trading && (traitBitmask[i] & TRAIT_COURIER) !== 0) {
      if (targetId <= -1000) {
        let gTarget: number;
        if (targetId <= -2000) gTarget = (-targetId) - 2000;
        else gTarget = (-targetId) - 1000;
        
        tx = groupWarehouseX[gTarget]; ty = groupWarehouseY[gTarget];
        const dx = tx - positionX[i]; const dy = ty - positionY[i]; const distSq = dx * dx + dy * dy;
        
        if (distSq < 25.0) {
          if (entityInventory[i] > 0) {
            groupTotalWealth[gTarget] += entityInventory[i];
            entityInventory[i] = 0;
            const myGid = groupAffiliations[i * 8];
            if (myGid >= 0 && myGid < MAX_GROUPS) {
              const relIdx = (gTarget * MAX_GROUPS) + myGid;
              groupRelationsMatrix[relIdx] = Math.min(100, groupRelationsMatrix[relIdx] + 2);
              targetEntityId[i] = -2000 - myGid;
            }
          } else {
            state[i] = EntityState.Idle;
            traitBitmask[i] &= ~TRAIT_COURIER;
            targetEntityId[i] = -1;
            actionTimer[i] = 60;
          }
          continue;
        }
        const dist = Math.sqrt(distSq);
        velocityX[i] = (dx / dist) * 1.4; velocityY[i] = (dy / dist) * 1.4;
        continue;
      }
    }

    if (targetId === -2) {
      const tileX = Math.floor(positionX[i] / TILE_SIZE); const tileY = Math.floor(positionY[i] / TILE_SIZE);
      const fieldIdx = Math.min(WORLD_MAP_COLS * WORLD_MAP_ROWS - 1, Math.max(0, tileY * WORLD_MAP_COLS + tileX)) * 2;
      const targetVectorX = globalFlowField[fieldIdx]; const targetVectorY = globalFlowField[fieldIdx + 1];
      if (targetVectorX !== 0 || targetVectorY !== 0) {
        velocityX[i] = targetVectorX * 1.5; velocityY[i] = targetVectorY * 1.5; continue;
      } else {
        const slot = activePrioritySlot[i]; const groupId = slot !== -1 ? groupAffiliations[i * 8 + slot] : -1;
        if (groupId !== -1) { tx = groupTargetX[groupId]; ty = groupTargetY[groupId]; } 
        else { targetEntityId[i] = -1; continue; }
      }
    } else { tx = positionX[targetId]; ty = positionY[targetId]; }
    const dx = tx - positionX[i]; const dy = ty - positionY[i]; const distSq = dx * dx + dy * dy;
    
    if (state[i] === EntityState.Fleeing) {
      const dist = Math.sqrt(distSq); if (dist > 0.1) { velocityX[i] = -(dx / dist) * 2.0; velocityY[i] = -(dy / dist) * 2.0; }
      if (distSq > 160000) targetEntityId[i] = -1;
    } else if (state[i] === EntityState.Combat) {
      if (distSq > 400.0) { 
        const dist = Math.sqrt(distSq); 
        velocityX[i] = (dx / dist) * 1.5; 
        velocityY[i] = (dy / dist) * 1.5; 
      } else if (distSq > 4.0) {
        const dist = Math.sqrt(distSq);
        const damp = dist / 20.0;
        velocityX[i] = (dx / dist) * 1.5 * damp;
        velocityY[i] = (dy / dist) * 1.5 * damp;
      } else { 
        velocityX[i] = 0; velocityY[i] = 0; 
        if (Math.random() > 0.9) CombatDamageSystem(i, targetId, 10); 
      }
    } else {
      if (distSq > 400.0) { 
        const dist = Math.sqrt(distSq); 
        velocityX[i] = (dx / dist) * 1.2; 
        velocityY[i] = (dy / dist) * 1.2; 
      } else if (distSq > 4.0) {
        const dist = Math.sqrt(distSq);
        const damp = dist / 20.0;
        velocityX[i] = (dx / dist) * 1.2 * damp;
        velocityY[i] = (dy / dist) * 1.2 * damp;
      } else { 
        velocityX[i] = 0; velocityY[i] = 0; 
      }
    }
  }
}

function InfluenceSystem(): void {
  // 1. Decay
  for (let i = 0; i < WORLD_MAP_COLS * WORLD_MAP_ROWS; i++) {
    influenceMap[i] = Math.floor(influenceMap[i] * 0.9);
  }

  // 2. Accumulate (Tug-of-War)
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (state[i] === EntityState.Dead) continue;
    const tileX = Math.floor(positionX[i] / TILE_SIZE);
    const tileY = Math.floor(positionY[i] / TILE_SIZE);
    if (tileX >= 0 && tileX < WORLD_MAP_COLS && tileY >= 0 && tileY < WORLD_MAP_ROWS) {
      const idx = tileY * WORLD_MAP_COLS + tileX;
      const gid = groupAffiliations[i * 8];
      if (gid === -1) continue;

      if (territoryOwnerMap[idx] === -1) {
        territoryOwnerMap[idx] = gid;
        influenceMap[idx] = 1;
        settlementTimerMap[idx] = 0;
      } else if (territoryOwnerMap[idx] === gid) {
        influenceMap[idx] = Math.min(1000, influenceMap[idx] + 1);
      } else {
        influenceMap[idx]--;
        if (influenceMap[idx] <= 0) {
          territoryOwnerMap[idx] = gid;
          influenceMap[idx] = 1;
          settlementTimerMap[idx] = 0;
        }
      }
    }
  }

  // 3. Ownership Threshold & Settlement (Step B)
  for (let i = 0; i < WORLD_MAP_COLS * WORLD_MAP_ROWS; i++) {
    const gid = territoryOwnerMap[i];
    if (gid === -1) { settlementTimerMap[i] = 0; continue; }
    
    if (influenceMap[i] < 10) { 
      territoryOwnerMap[i] = -1; 
      settlementTimerMap[i] = 0; 
      continue; 
    }

    // Settlement Logic: If influence > 100 for 5 cycles (300 ticks), and far from warehouse
    if (influenceMap[i] > 100) {
      settlementTimerMap[i]++;
      if (settlementTimerMap[i] >= 5) { // 5 cycles of SummarySystem = 300 ticks
        const tx = (i % WORLD_MAP_COLS) * TILE_SIZE + TILE_SIZE / 2;
        const ty = Math.floor(i / WORLD_MAP_COLS) * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - groupWarehouseX[gid], dy = ty - groupWarehouseY[gid];
        if (dx * dx + dy * dy > 300 * 300) {
           if (worldMap[i] === 0) worldMap[i] = 2; // Place Structure (Depot) if it's Grass
           settlementTimerMap[i] = 0; // Reset timer
        }
      }
    } else {
      settlementTimerMap[i] = 0;
    }
  }
}

export function tick(): void {
  if (isPaused) return;

  // Barrier 0: Ensure all workers start at the same time
  if (quadrantIndex === 0) {
    Atomics.store(workerSync, 0, 0); Atomics.store(workerSync, 1, 0); Atomics.store(workerSync, 2, 0);
  }
  waitForAll(0);

  // Phase 1: Spatial & Intelligence peeking
  SpatialUpdateSystem(); 
  IntelReportingSystem();
  
  // Phase 1.5: Throttled Global Systems (Only quadrant 0 for consistency)
  if (quadrantIndex === 0) {
    SummarySystem(); 
    if (tickCount % 60 === 0) { RuleEvaluationSystem(); TradeSystem(); InfluenceSystem(); }
    GroupKnowledgeDecaySystem();
  }

  // Phase 2: Autonomy & Steering (Local entities)
  LifeSystem(); 
  AutonomySystem(); 
  SteeringSystem();

  // Barrier 1: Sync before movement to ensure all forces are calculated
  waitForAll(1);

  // Phase 3: Physical Movement
  MovementSystem();

  // Barrier 2: Sync before finishing to ensure positions are final
  waitForAll(2);

  tickCount++;
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data; const type = data.type;
  if (type === "INIT") {
    quadrantIndex = data.payload.quadrantIndex;
    if (quadrantIndex === 0) {
        initializeSimulation();
    } else {
        // Slave workers map buffers from main
        positionX = new Float32Array(data.payload.buffers.positionX);
        positionY = new Float32Array(data.payload.buffers.positionY);
        velocityX = new Float32Array(data.payload.buffers.velocityX);
        velocityY = new Float32Array(data.payload.buffers.velocityY);
        health = new Int32Array(data.payload.buffers.health);
        money = new Int32Array(data.payload.buffers.money);
        state = new Uint8Array(data.payload.buffers.state);
        actionTimer = new Int16Array(data.payload.buffers.actionTimer);
        traitBitmask = new Uint32Array(data.payload.buffers.traitBitmask);
        targetEntityId = new Int32Array(data.payload.buffers.targetEntityId);
        pendingEvents = new Int32Array(data.payload.buffers.pendingEvents);
        groupAffiliations = new Int32Array(data.payload.buffers.groupAffiliations);
        activeCommandPriority = new Uint8Array(data.payload.buffers.activeCommandPriority);
        activePrioritySlot = new Int8Array(data.payload.buffers.activePrioritySlot);
        groupTargetEntityId = new Int32Array(data.payload.buffers.groupTargetEntityId);
        groupTargetX = new Float32Array(data.payload.buffers.groupTargetX);
        groupTargetY = new Float32Array(data.payload.buffers.groupTargetY);
        groupTargetAge = new Int32Array(data.payload.buffers.groupTargetAge);
        ruleRegistry = new Int32Array(data.payload.buffers.ruleRegistry);
        groupPopulationCount = new Int32Array(data.payload.buffers.groupPopulationCount);
        groupTotalWealth = new Int32Array(data.payload.buffers.groupTotalWealth);
        worldMap = new Uint8Array(data.payload.buffers.worldMap);
        globalFlowField = new Float32Array(data.payload.buffers.globalFlowField);
        entityInventory = new Int16Array(data.payload.buffers.entityInventory);
        groupWarehouseX = new Float32Array(data.payload.buffers.groupWarehouseX);
        groupWarehouseY = new Float32Array(data.payload.buffers.groupWarehouseY);
        groupRelationsMatrix = new Int8Array(data.payload.buffers.groupRelationsMatrix);
        groupVisualArchetypes = new Int8Array(data.payload.buffers.groupVisualArchetypes);
        carriedIntelEntityId = new Int32Array(data.payload.buffers.carriedIntelEntityId);
        carriedIntelX = new Float32Array(data.payload.buffers.carriedIntelX);
        carriedIntelY = new Float32Array(data.payload.buffers.carriedIntelY);
        mana = new Int16Array(data.payload.buffers.mana);
        groupMagicFrequency = new Int8Array(data.payload.buffers.groupMagicFrequency);
        influenceMap = new Int16Array(data.payload.buffers.influenceMap);
        territoryOwnerMap = new Int32Array(data.payload.buffers.territoryOwnerMap);
        logicBytecode = new Int32Array(data.payload.buffers.logicBytecode);
        workerSync = new Int32Array(data.payload.buffers.workerSync);

        // Phase 20: Local Spatial Hash (not shared)
        spatialHead = new Int32Array(NUM_CELLS);
        spatialHead.fill(-1);
        spatialNext = new Int32Array(MAX_ENTITIES);
        spatialNext.fill(-1);
    }

    // Set bounds based on quadrant
    if (quadrantIndex === 0) { minX = 0; maxX = 800; minY = 0; maxY = 600; }
    else if (quadrantIndex === 1) { minX = 800; maxX = 1600; minY = 0; maxY = 600; }
    else if (quadrantIndex === 2) { minX = 0; maxX = 800; minY = 600; maxY = 1200; }
    else if (quadrantIndex === 3) { minX = 800; maxX = 1600; minY = 600; maxY = 1200; }

    if (quadrantIndex === 0) {
        self.postMessage({ type: "INITIALIZED", buffers: { 
          positionX: positionX.buffer, positionY: positionY.buffer, velocityX: velocityX.buffer, velocityY: velocityY.buffer,
          health: health.buffer, money: money.buffer, state: state.buffer, actionTimer: actionTimer.buffer, traitBitmask: traitBitmask.buffer,
          targetEntityId: targetEntityId.buffer, pendingEvents: pendingEvents.buffer, groupAffiliations: groupAffiliations.buffer,
          activeCommandPriority: activeCommandPriority.buffer, activePrioritySlot: activePrioritySlot.buffer,
          groupTargetEntityId: groupTargetEntityId.buffer, groupTargetX: groupTargetX.buffer, groupTargetY: groupTargetY.buffer, groupTargetAge: groupTargetAge.buffer,
          ruleRegistry: ruleRegistry.buffer, groupPopulationCount: groupPopulationCount.buffer, groupTotalWealth: groupTotalWealth.buffer,
          worldMap: worldMap.buffer, globalFlowField: globalFlowField.buffer,
          entityInventory: entityInventory.buffer, groupWarehouseX: groupWarehouseX.buffer, groupWarehouseY: groupWarehouseY.buffer,
          groupRelationsMatrix: groupRelationsMatrix.buffer, groupVisualArchetypes: groupVisualArchetypes.buffer,
          carriedIntelEntityId: carriedIntelEntityId.buffer, carriedIntelX: carriedIntelX.buffer, carriedIntelY: carriedIntelY.buffer,
          mana: mana.buffer, groupMagicFrequency: groupMagicFrequency.buffer,
          influenceMap: influenceMap.buffer, territoryOwnerMap: territoryOwnerMap.buffer,
          logicBytecode: logicBytecode.buffer,
          workerSync: workerSync.buffer
        }});
    }
  }
  if (type === "TICK") { tick(); self.postMessage({ type: "TICK_COMPLETE" }); }
  if (type === "PAUSE_SIM") isPaused = true;
  if (type === "RESUME_SIM") isPaused = false;
  if (type === "GROUP_COMMAND") {
    const payload = data.payload || data; broadcastGroupCommand(payload.groupId, payload.commandState, payload.targetX, payload.targetY);
  }
  if (type === "SYNC_TICK") tickCount = data.tickCount;
  if (type === "FIND_ENTITY") {
    const { x, y, radius } = data.payload;
    const id = findNearest(x, y, radius, 0xFFFFFFFF);
    self.postMessage({ type: "ENTITY_FOUND", payload: { id } });
  }
  if (type === "PAINT_ENTITIES") {
    const { x, y, radius, groupId, traitBitmask: newTrait } = data.payload;
    const radiusSq = radius * radius;
    const minCellX = Math.max(0, Math.floor((x - radius) / GRID_SIZE));
    const maxCellX = Math.min(GRID_COLS - 1, Math.floor((x + radius) / GRID_SIZE));
    const minCellY = Math.max(0, Math.floor((y - radius) / GRID_SIZE));
    const maxCellY = Math.min(GRID_ROWS - 1, Math.floor((y + radius) / GRID_SIZE));
    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const cellIndex = cy * GRID_COLS + cx;
        let entityId = spatialHead[cellIndex];
        while (entityId !== -1) {
          const dx = positionX[entityId] - x; const dy = positionY[entityId] - y;
          if (dx * dx + dy * dy <= radiusSq) {
            if (groupId !== -1) groupAffiliations[entityId * 8] = groupId;
            if (newTrait !== 0) { traitBitmask[entityId] |= newTrait; if ((newTrait & TRAIT_TREE) !== 0) { velocityX[entityId] = 0; velocityY[entityId] = 0; } }
          }
          entityId = spatialNext[entityId];
        }
      }
    }
  }
};
