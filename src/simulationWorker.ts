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

export const EVENT_HOSTILE_ATTACK = 99;

let tickCount = 0;
let isPaused = false;

// Component Enums
export enum EntityState {
  Idle = 0,
  Harvesting = 1,
  Fleeing = 2,
  Combat = 3,
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

// Spatial Partitioning Arrays
export let spatialHead: Int32Array;
export let spatialNext: Int32Array;

// Entity Group Affiliations (8 slots per entity)
export let groupAffiliations: Int32Array;

// Group Knowledge Registry
export let groupTargetEntityId: Int32Array;
export let groupTargetX: Float32Array;
export let groupTargetY: Float32Array;
export let groupTargetAge: Int16Array;

// Priority tracking for conflict resolution
export let activeCommandPriority: Uint8Array;
export let activePrioritySlot: Int8Array;

// Rule Engine Registry
export let ruleRegistry: Int32Array;

// Analytics Arrays (Summary System)
export let groupPopulationCount: Int32Array;
export let groupTotalWealth: Int32Array;

// Phase 11: Environmental Dynamics
export let worldMap: Uint8Array;
export let globalFlowField: Float32Array;
let integrationField: Float32Array;

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

  spatialHead = new Int32Array(new SharedArrayBuffer(NUM_CELLS * 4));
  spatialNext = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));

  groupAffiliations = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 8 * 4));

  activeCommandPriority = new Uint8Array(new SharedArrayBuffer(MAX_ENTITIES * 1));
  activePrioritySlot = new Int8Array(new SharedArrayBuffer(MAX_ENTITIES * 1));

  groupTargetEntityId = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetX = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetY = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetAge = new Int16Array(new SharedArrayBuffer(MAX_GROUPS * 2));

  for (let g = 0; g < MAX_GROUPS; g++) {
    groupTargetEntityId[g] = -1;
    groupTargetX[g] = 0;
    groupTargetY[g] = 0;
    groupTargetAge[g] = 0;
  }

  ruleRegistry = new Int32Array(new SharedArrayBuffer(MAX_RULES * 8 * 4));
  for (let r = 0; r < MAX_RULES * 8; r++) ruleRegistry[r] = 0;

  groupPopulationCount = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTotalWealth = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));

  // Phase 11 Allocation
  worldMap = new Uint8Array(new SharedArrayBuffer(WORLD_MAP_COLS * WORLD_MAP_ROWS));
  globalFlowField = new Float32Array(new SharedArrayBuffer(WORLD_MAP_COLS * WORLD_MAP_ROWS * 2 * 4));
  integrationField = new Float32Array(WORLD_MAP_COLS * WORLD_MAP_ROWS);

  generateBiomes();

  for (let i = 0; i < MAX_ENTITIES; i++) {
    positionX[i] = Math.random() * WORLD_WIDTH;
    positionY[i] = Math.random() * WORLD_HEIGHT;
    velocityX[i] = (Math.random() - 0.5) * 2;
    velocityY[i] = (Math.random() - 0.5) * 2;
    health[i] = 100;
    money[i] = 0;
    state[i] = EntityState.Idle;
    actionTimer[i] = 0;
    traitBitmask[i] = TRAIT_NONE;
    targetEntityId[i] = -1;
    activeCommandPriority[i] = 0;
    activePrioritySlot[i] = -1;
    
    const baseEventIdx = i * 4;
    pendingEvents[baseEventIdx] = -1;
    pendingEvents[baseEventIdx + 1] = -1;
    pendingEvents[baseEventIdx + 2] = -1;
    pendingEvents[baseEventIdx + 3] = -1;
    
    const baseAffIdx = i * 8;
    for (let s = 0; s < 8; s++) {
      groupAffiliations[baseAffIdx + s] = -1;
    }

    groupAffiliations[baseAffIdx] = Math.floor(Math.random() * 10);
    groupAffiliations[baseAffIdx + 1] = Math.floor(Math.random() * 50);
    groupAffiliations[baseAffIdx + 2] = Math.floor(Math.random() * 200);
    groupAffiliations[baseAffIdx + 3] = Math.floor(Math.random() * 800);
  }

  for (let i = 0; i < 5000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    traitBitmask[idx] |= TRAIT_TREE;
    velocityX[idx] = 0;
    velocityY[idx] = 0;
  }

  for (let i = 0; i < 2000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    if ((traitBitmask[idx] & TRAIT_TREE) === 0) traitBitmask[idx] |= TRAIT_AGGRESSIVE;
  }

  for (let i = 0; i < 5000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    if ((traitBitmask[idx] & TRAIT_TREE) === 0) traitBitmask[idx] |= TRAIT_SCOUT;
  }

  for (let i = 0; i < 5000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    if ((traitBitmask[idx] & TRAIT_TREE) === 0) traitBitmask[idx] |= TRAIT_FANATIC;
  }

  ruleRegistry[0] = 0; ruleRegistry[1] = 5; ruleRegistry[2] = 0; ruleRegistry[3] = 2000; 
  ruleRegistry[4] = EntityState.Combat; ruleRegistry[5] = 800; ruleRegistry[6] = 600; ruleRegistry[7] = 1;

  ruleRegistry[8] = 0; ruleRegistry[9] = 2; ruleRegistry[10] = 1; ruleRegistry[11] = 50000; 
  ruleRegistry[12] = EntityState.Harvesting; ruleRegistry[13] = 400; ruleRegistry[14] = 300; ruleRegistry[15] = 1;

  ruleRegistry[16] = 1; ruleRegistry[17] = 0; ruleRegistry[18] = 3; ruleRegistry[19] = 10000; 
  ruleRegistry[20] = 99; ruleRegistry[21] = 0; ruleRegistry[22] = 0; ruleRegistry[23] = 1;
}

function generateBiomes(): void {
  worldMap.fill(0); // Grass

  // Spawn a central lake
  const centerX = WORLD_MAP_COLS / 2;
  const centerY = WORLD_MAP_ROWS / 2;
  const radius = 25;
  for (let y = 0; y < WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < WORLD_MAP_COLS; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy < radius * radius) {
        worldMap[y * WORLD_MAP_COLS + x] = 2; // Water
      }
    }
  }

  // Scatter forest clusters
  for (let i = 0; i < 30; i++) {
    const fx = Math.floor(Math.random() * WORLD_MAP_COLS);
    const fy = Math.floor(Math.random() * WORLD_MAP_ROWS);
    const fr = Math.floor(Math.random() * 10) + 5;
    for (let y = Math.max(0, fy - fr); y < Math.min(WORLD_MAP_ROWS, fy + fr); y++) {
      for (let x = Math.max(0, fx - fr); x < Math.min(WORLD_MAP_COLS, fx + fr); x++) {
        const dx = x - fx;
        const dy = y - fy;
        if (dx * dx + dy * dy < fr * fr) {
          if (worldMap[y * WORLD_MAP_COLS + x] === 0) {
            worldMap[y * WORLD_MAP_COLS + x] = 1; // Forest
          }
        }
      }
    }
  }
}

function updateFlowField(targetX: number, targetY: number): void {
  const targetTileX = Math.floor(targetX / TILE_SIZE);
  const targetTileY = Math.floor(targetY / TILE_SIZE);

  if (targetTileX < 0 || targetTileX >= WORLD_MAP_COLS || targetTileY < 0 || targetTileY >= WORLD_MAP_ROWS) return;

  // 1. Integration Field (Dijkstra)
  integrationField.fill(65535); // Large value
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
        const nx = currX + dx;
        const ny = currY + dy;
        if (nx >= 0 && nx < WORLD_MAP_COLS && ny >= 0 && ny < WORLD_MAP_ROWS) {
          const nIdx = ny * WORLD_MAP_COLS + nx;
          const terrain = worldMap[nIdx];
          let stepCost = (dx !== 0 && dy !== 0) ? 1.4 : 1.0;
          if (terrain === 1) stepCost *= 3; // Forest
          if (terrain === 2) stepCost = 255; // Water (Obstacle)

          const totalCost = currCost + stepCost;
          if (totalCost < integrationField[nIdx]) {
            integrationField[nIdx] = totalCost;
            queue.push(nIdx);
          }
        }
      }
    }
  }

  // 2. Vector Field Generation
  for (let y = 0; y < WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < WORLD_MAP_COLS; x++) {
      const idx = y * WORLD_MAP_COLS + x;
      const fIdx = idx * 2;
      
      let bestX = 0;
      let bestY = 0;
      let minCost = integrationField[idx];

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < WORLD_MAP_COLS && ny >= 0 && ny < WORLD_MAP_ROWS) {
            const nCost = integrationField[ny * WORLD_MAP_COLS + nx];
            if (nCost < minCost) {
              minCost = nCost;
              bestX = dx;
              bestY = dy;
            }
          }
        }
      }

      // Normalize
      const len = Math.sqrt(bestX * bestX + bestY * bestY);
      if (len > 0) {
        globalFlowField[fIdx] = bestX / len;
        globalFlowField[fIdx + 1] = bestY / len;
      } else {
        globalFlowField[fIdx] = 0;
        globalFlowField[fIdx + 1] = 0;
      }
    }
  }
}

function SummarySystem(): void {
  groupPopulationCount.fill(0);
  groupTotalWealth.fill(0);
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const primaryGroupId = groupAffiliations[i * 8];
    if (primaryGroupId !== -1) {
      groupPopulationCount[primaryGroupId]++;
      groupTotalWealth[primaryGroupId] += money[i];
    }
  }
}

function RuleEvaluationSystem(): void {
  let firstActiveLocationTargetX = -1;
  let firstActiveLocationTargetY = -1;

  for (let r = 0; r < MAX_RULES; r++) {
    const baseIdx = r * 8;
    if (ruleRegistry[baseIdx + 7] === 0) continue;

    const subjectType = ruleRegistry[baseIdx + 0];
    const subjectId = ruleRegistry[baseIdx + 1];
    const conditionType = ruleRegistry[baseIdx + 2];
    const threshold = ruleRegistry[baseIdx + 3];
    const actionState = ruleRegistry[baseIdx + 4];
    const targetX = ruleRegistry[baseIdx + 5];
    const targetY = ruleRegistry[baseIdx + 6];

    let conditionMet = false;
    if (subjectType === 0) {
      if (conditionType === 0) { if (groupPopulationCount[subjectId] > threshold) conditionMet = true; }
      else if (conditionType === 1) { if (groupTotalWealth[subjectId] > threshold) conditionMet = true; }
    } else if (subjectType === 1) {
      if (conditionType === 3) { if (tickCount % threshold === 0 && tickCount > 0) conditionMet = true; }
    }

    if (conditionMet) {
      if (actionState === 99) self.postMessage({ type: "SAVE_REQUEST" });
      else {
        broadcastGroupCommand(subjectId, actionState, targetX, targetY);
        if (firstActiveLocationTargetX === -1) {
          firstActiveLocationTargetX = targetX;
          firstActiveLocationTargetY = targetY;
        }
      }
    }
  }

  // Update Global Flow Field toward the most relevant active target
  if (firstActiveLocationTargetX !== -1) {
    updateFlowField(firstActiveLocationTargetX, firstActiveLocationTargetY);
  }
}

function LifeSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue;
    const decayRate = money[i] <= 0 ? 2 : 1;
    if (tickCount % 30 === 0) health[i] -= decayRate;
    if (state[i] === EntityState.Harvesting && targetEntityId[i] !== -1) {
      health[i] += 1;
      if (health[i] > 100) health[i] = 100;
    }
    if (health[i] <= 0) {
      health[i] = 100; money[i] = 0; state[i] = EntityState.Idle; actionTimer[i] = 60;
      targetEntityId[i] = -1; activePrioritySlot[i] = -1;
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { positionX[i] = Math.random() * WORLD_WIDTH; positionY[i] = 0; }
      else if (side === 1) { positionX[i] = Math.random() * WORLD_WIDTH; positionY[i] = WORLD_HEIGHT; }
      else if (side === 2) { positionX[i] = 0; positionY[i] = Math.random() * WORLD_HEIGHT; }
      else { positionX[i] = WORLD_WIDTH; positionY[i] = Math.random() * WORLD_HEIGHT; }
      velocityX[i] = (Math.random() - 0.5) * 2;
      velocityY[i] = (Math.random() - 0.5) * 2;
    }
  }
}

function SpatialUpdateSystem(): void {
  spatialHead.fill(-1);
  for (let i = 0; i < MAX_ENTITIES; i++) {
    let cellX = Math.floor(positionX[i] / GRID_SIZE);
    let cellY = Math.floor(positionY[i] / GRID_SIZE);
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
          const dx = positionX[entityId] - x;
          const dy = positionY[entityId] - y;
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
    const worldX = positionX[i];
    const worldY = positionY[i];

    // Terrain Friction lookup
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    const tileIndex = Math.min(WORLD_MAP_COLS * WORLD_MAP_ROWS - 1, Math.max(0, tileY * WORLD_MAP_COLS + tileX));

    let speedModifier = 1.0;
    const terrainType = worldMap[tileIndex];
    if (terrainType === 1) speedModifier = 0.6; // Forest
    if (terrainType === 2) speedModifier = 0.2; // Water

    positionX[i] += velocityX[i] * speedModifier;
    positionY[i] += velocityY[i] * speedModifier;

    if (positionX[i] < 0) { positionX[i] = 0; velocityX[i] *= -1; }
    else if (positionX[i] > 1600) { positionX[i] = 1600; velocityX[i] *= -1; }
    if (positionY[i] < 0) { positionY[i] = 0; velocityY[i] *= -1; }
    else if (positionY[i] > 1200) { positionY[i] = 1200; velocityY[i] *= -1; }
  }
}

function AutonomySystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue;
    if (actionTimer[i] > 0) { actionTimer[i]--; }
    else {
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
            if (targetId !== -1) { targetEntityId[i] = targetId; state[i] = EntityState.Combat; actionTimer[i] = 300;
              activeCommandPriority[i] = 8 - s; activePrioritySlot[i] = s; foundHigherPriority = true; break;
            }
          }
        }
        if (foundHigherPriority) continue;
        if (state[i] !== EntityState.Idle) continue;
        const rand = Math.random();
        let nextState: number;
        if (rand > 0.3) nextState = EntityState.Harvesting;
        else if (rand > 0.1) nextState = EntityState.Fleeing;
        else nextState = EntityState.Combat;
        state[i] = nextState;
        const canSearch = (tickCount + i) % 15 === 0;
        if (nextState === EntityState.Harvesting) {
          if (canSearch && targetEntityId[i] === -1) {
            const treeId = findNearest(positionX[i], positionY[i], 80, TRAIT_TREE);
            if (treeId !== -1) { targetEntityId[i] = treeId; actionTimer[i] = 200; }
            else { state[i] = EntityState.Idle; actionTimer[i] = Math.floor(Math.random() * 60) + 10; }
          } else if (targetEntityId[i] === -1) { state[i] = EntityState.Idle; actionTimer[i] = 1; }
        } else if (nextState === EntityState.Combat) {
          if (canSearch && targetEntityId[i] === -1) {
            const targetId = findNearest(positionX[i], positionY[i], 80, ~TRAIT_TREE);
            if (targetId !== -1 && targetId !== i) { targetEntityId[i] = targetId; actionTimer[i] = 120; }
            else { state[i] = EntityState.Idle; actionTimer[i] = Math.floor(Math.random() * 60) + 10; }
          } else if (targetEntityId[i] === -1) { state[i] = EntityState.Idle; actionTimer[i] = 1; }
        } else { actionTimer[i] = Math.floor(Math.random() * 241) + 60; }
        activeCommandPriority[i] = 0;
      } else {
        if (state[i] === EntityState.Harvesting && targetEntityId[i] !== -1) { money[i] += 15; targetEntityId[i] = -1; }
        state[i] = EntityState.Idle; actionTimer[i] = Math.floor(Math.random() * 60) + 10; activeCommandPriority[i] = 0;
      }
    }
  }
}

function IntelReportingSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((traitBitmask[i] & TRAIT_SCOUT) !== 0 && state[i] === EntityState.Idle) {
      const enemyId = findNearest(positionX[i], positionY[i], 100, TRAIT_AGGRESSIVE);
      if (enemyId !== -1) {
        const groupId = groupAffiliations[i * 8];
        if (groupId !== -1) {
          groupTargetEntityId[groupId] = enemyId; groupTargetX[groupId] = positionX[enemyId]; groupTargetY[groupId] = positionY[enemyId]; groupTargetAge[groupId] = 0;
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
  const baseIndex = victimId * 4;
  pendingEvents[baseIndex] = EVENT_HOSTILE_ATTACK; pendingEvents[baseIndex + 1] = -1; pendingEvents[baseIndex + 2] = -1; pendingEvents[baseIndex + 3] = -1;
  targetEntityId[victimId] = attackerId;
}

function SteeringSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue;
    const targetId = targetEntityId[i];
    if (targetId === -1) continue;
    
    let tx: number, ty: number;
    if (targetId === -2) {
      // Flow Field Lookup (O(1))
      const tileX = Math.floor(positionX[i] / TILE_SIZE);
      const tileY = Math.floor(positionY[i] / TILE_SIZE);
      const fieldIdx = Math.min(WORLD_MAP_COLS * WORLD_MAP_ROWS - 1, Math.max(0, tileY * WORLD_MAP_COLS + tileX)) * 2;
      
      const targetVectorX = globalFlowField[fieldIdx];
      const targetVectorY = globalFlowField[fieldIdx + 1];

      if (targetVectorX !== 0 || targetVectorY !== 0) {
        velocityX[i] = targetVectorX * 1.5;
        velocityY[i] = targetVectorY * 1.5;
        continue;
      } else {
        // Fallback to coordinates if field is empty
        const slot = activePrioritySlot[i]; 
        const groupId = slot !== -1 ? groupAffiliations[i * 8 + slot] : -1;
        if (groupId !== -1) { tx = groupTargetX[groupId]; ty = groupTargetY[groupId]; } 
        else { targetEntityId[i] = -1; continue; }
      }
    } else { tx = positionX[targetId]; ty = positionY[targetId]; }
    
    const dx = tx - positionX[i]; const dy = ty - positionY[i]; const distSq = dx * dx + dy * dy;
    if (state[i] === EntityState.Fleeing) {
      const dist = Math.sqrt(distSq); if (dist > 0.1) { velocityX[i] = -(dx / dist) * 2.0; velocityY[i] = -(dy / dist) * 2.0; }
      if (distSq > 160000) targetEntityId[i] = -1;
    } else if (state[i] === EntityState.Combat) {
      if (distSq > 4.0) { const dist = Math.sqrt(distSq); velocityX[i] = (dx / dist) * 1.5; velocityY[i] = (dy / dist) * 1.5; }
      else { velocityX[i] = 0; velocityY[i] = 0; if (Math.random() > 0.9) CombatDamageSystem(i, targetId, 10); }
    } else {
      if (distSq > 4.0) { const dist = Math.sqrt(distSq); velocityX[i] = (dx / dist) * 1.2; velocityY[i] = (dy / dist) * 1.2; }
      else { velocityX[i] = 0; velocityY[i] = 0; }
    }
  }
}

export function tick(): void {
  if (isPaused) return;
  SpatialUpdateSystem(); GroupKnowledgeDecaySystem(); IntelReportingSystem();
  if (tickCount % 60 === 0) { SummarySystem(); RuleEvaluationSystem(); }
  LifeSystem(); AutonomySystem(); SteeringSystem(); MovementSystem(); tickCount++;
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data; const type = data.type;
  if (type === "INIT") {
    initializeSimulation();
    self.postMessage({ type: "INITIALIZED", buffers: { 
      positionX: positionX.buffer, positionY: positionY.buffer, velocityX: velocityX.buffer, velocityY: velocityY.buffer,
      health: health.buffer, money: money.buffer, state: state.buffer, actionTimer: actionTimer.buffer, traitBitmask: traitBitmask.buffer,
      targetEntityId: targetEntityId.buffer, pendingEvents: pendingEvents.buffer, groupAffiliations: groupAffiliations.buffer,
      activeCommandPriority: activeCommandPriority.buffer, activePrioritySlot: activePrioritySlot.buffer,
      groupTargetEntityId: groupTargetEntityId.buffer, groupTargetX: groupTargetX.buffer, groupTargetY: groupTargetY.buffer, groupTargetAge: groupTargetAge.buffer,
      ruleRegistry: ruleRegistry.buffer, groupPopulationCount: groupPopulationCount.buffer, groupTotalWealth: groupTotalWealth.buffer,
      worldMap: worldMap.buffer, globalFlowField: globalFlowField.buffer
    }});
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
