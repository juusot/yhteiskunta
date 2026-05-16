// src/simulationWorker.ts

export const MAX_ENTITIES = 100_000;
export const MAX_GROUPS = 1000;

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1200;
export const GRID_SIZE = 50;
export const GRID_COLS = Math.ceil(WORLD_WIDTH / GRID_SIZE);
export const GRID_ROWS = Math.ceil(WORLD_HEIGHT / GRID_SIZE);
export const NUM_CELLS = GRID_COLS * GRID_ROWS;

export const TRAIT_NONE = 0;
export const TRAIT_TREE = 1 << 0;
export const TRAIT_AGGRESSIVE = 1 << 1;

export const EVENT_HOSTILE_ATTACK = 99;

let simulationTickCount = 0;

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

// Group Hierarchy Arrays
export let nationGroup: Int32Array;
export let armyGroup: Int32Array;
export let clanGroup: Int32Array;
export let familyGroup: Int32Array;

// Group Knowledge Registry
export let groupTargetEntityID: Int32Array;
export let groupTargetX: Float32Array;
export let groupTargetY: Float32Array;

// Priority tracking for conflict resolution
export let activeCommandPriority: Uint8Array;

/**
 * Initializes the global component arrays using SharedArrayBuffers.
 * Populates them with 100,000 dummy entities.
 */
export function initializeSimulation(): void {
  // Allocate memory using SharedArrayBuffer for each component array
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

  nationGroup = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  armyGroup = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  clanGroup = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  familyGroup = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  activeCommandPriority = new Uint8Array(new SharedArrayBuffer(MAX_ENTITIES * 1));

  // Group Knowledge Registry Initialization
  groupTargetEntityID = new Int32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetX = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));
  groupTargetY = new Float32Array(new SharedArrayBuffer(MAX_GROUPS * 4));

  for (let g = 0; g < MAX_GROUPS; g++) {
    groupTargetEntityID[g] = -1;
    groupTargetX[g] = 0;
    groupTargetY[g] = 0;
  }

  // Populate arrays with dummy entity data
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
    
    // Initialize pending events slots
    const baseEventIdx = i * 4;
    pendingEvents[baseEventIdx] = -1;
    pendingEvents[baseEventIdx + 1] = -1;
    pendingEvents[baseEventIdx + 2] = -1;
    pendingEvents[baseEventIdx + 3] = -1;
    
    // Assign to groups (mock assignments)
    nationGroup[i] = Math.floor(Math.random() * 10);
    armyGroup[i] = Math.floor(Math.random() * 50);
    clanGroup[i] = Math.floor(Math.random() * 200);
    familyGroup[i] = Math.floor(Math.random() * 800);
  }

  // Turn 5,000 entities into static trees
  for (let i = 0; i < 5000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    traitBitmask[idx] |= TRAIT_TREE;
    velocityX[idx] = 0;
    velocityY[idx] = 0;
  }

  // Designate 2,000 aggressive entities
  for (let i = 0; i < 2000; i++) {
    const idx = Math.floor(Math.random() * MAX_ENTITIES);
    // Don't make trees aggressive
    if ((traitBitmask[idx] & TRAIT_TREE) === 0) {
      traitBitmask[idx] |= TRAIT_AGGRESSIVE;
    }
  }
  
  console.log(`Simulation initialized with ${MAX_ENTITIES} entities using SharedArrayBuffers.`);
}

/**
 * SpatialUpdateSystem
 * Rebuilds the spatial hash linked lists every frame.
 */
function SpatialUpdateSystem(): void {
  spatialHead.fill(-1);
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const x = positionX[i];
    const y = positionY[i];
    
    // Calculate cell coordinates
    let cellX = Math.floor(x / GRID_SIZE);
    let cellY = Math.floor(y / GRID_SIZE);
    
    // Clamp to grid boundaries
    if (cellX < 0) cellX = 0;
    if (cellX >= GRID_COLS) cellX = GRID_COLS - 1;
    if (cellY < 0) cellY = 0;
    if (cellY >= GRID_ROWS) cellY = GRID_ROWS - 1;
    
    const cellIndex = cellY * GRID_COLS + cellX;
    
    // Link to head
    spatialNext[i] = spatialHead[cellIndex];
    spatialHead[cellIndex] = i;
  }
}

/**
 * Neighborhood Query Logic
 * Returns the closest entity ID matching the bitmask within the specified radius.
 */
function findNearest(x: number, y: number, radius: number, filterBitmask: number): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;

  const minCellX = Math.max(0, Math.floor((x - radius) / GRID_SIZE));
  const maxCellX = Math.min(GRID_COLS - 1, Math.floor((x + radius) / GRID_SIZE));
  const minCellY = Math.max(0, Math.floor((y - radius) / GRID_SIZE));
  const maxCellY = Math.min(GRID_ROWS - 1, Math.floor((y + radius) / GRID_SIZE));

  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * GRID_COLS + cx;
      let entityId = spatialHead[cellIndex];

      while (entityId !== -1) {
        if ((traitBitmask[entityId] & filterBitmask) !== 0) {
          const dx = positionX[entityId] - x;
          const dy = positionY[entityId] - y;
          const distSq = dx * dx + dy * dy;

          if (distSq < minDistanceSq && distSq <= radiusSq) {
            minDistanceSq = distSq;
            closestId = entityId;
          }
        }
        entityId = spatialNext[entityId];
      }
    }
  }

  return closestId;
}

/**
 * Queue Management Utilities (FIFO Shift Architecture)
 */
export function pushEvent(entityId: number, eventId: number): boolean {
  const baseIndex = entityId * 4;
  // Iterate through the 4 pre-allocated slots to find the first empty slot
  for (let slot = 0; slot < 4; slot++) {
    if (pendingEvents[baseIndex + slot] === -1) {
      pendingEvents[baseIndex + slot] = eventId;
      return true; // Successfully queued
    }
  }
  return false; // Queue full
}

export function popNextEvent(entityId: number): number {
  const baseIndex = entityId * 4;
  const nextEventId = pendingEvents[baseIndex]; // Slot 0 is the immediate next item

  // Shift slots down: Slot 1 -> 0, Slot 2 -> 1, Slot 3 -> 2
  pendingEvents[baseIndex] = pendingEvents[baseIndex + 1];
  pendingEvents[baseIndex + 1] = pendingEvents[baseIndex + 2];
  pendingEvents[baseIndex + 2] = pendingEvents[baseIndex + 3];
  pendingEvents[baseIndex + 3] = -1; // Clear the tail slot back to sentinel default

  return nextEventId;
}

/**
 * Decoupled MovementSystem
 * Loops through entity arrays and updates positions based on velocity components.
 * Enforces 1600x1200 world boundaries.
 */
function MovementSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    positionX[i] += velocityX[i];
    positionY[i] += velocityY[i];

    // Boundary constraints for X
    if (positionX[i] < 0) {
      positionX[i] = 0;
      velocityX[i] *= -1;
    } else if (positionX[i] > 1600) {
      positionX[i] = 1600;
      velocityX[i] *= -1;
    }

    // Boundary constraints for Y
    if (positionY[i] < 0) {
      positionY[i] = 0;
      velocityY[i] *= -1;
    } else if (positionY[i] > 1200) {
      positionY[i] = 1200;
      velocityY[i] *= -1;
    }
  }
}

/**
 * Baseline AutonomySystem
 * Evaluates actions for entities whose ActionTimer is 0. 
 */
function AutonomySystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    // Skip static entities like trees
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue;

    if (actionTimer[i] > 0) {
      actionTimer[i]--;
    } else {
      // actionTimer[i] === 0
      
      // Check Event Queue First
      const nextEvent = pendingEvents[i * 4];
      if (nextEvent !== -1) {
        popNextEvent(i);
        if (nextEvent === EVENT_HOSTILE_ATTACK) {
          if ((traitBitmask[i] & TRAIT_AGGRESSIVE) !== 0) {
            state[i] = EntityState.Combat;
            actionTimer[i] = 120;
          } else {
            state[i] = EntityState.Fleeing;
            actionTimer[i] = 180;
          }
          activeCommandPriority[i] = 0; // Reset priority
          continue; // Move to next entity
        }
      }

      if (state[i] === EntityState.Idle) {
        // Randomly pick a new state
        const rand = Math.random();
        let nextState: number;
        
        if (rand > 0.3) {
           nextState = EntityState.Harvesting;
        } else if (rand > 0.1) {
           nextState = EntityState.Fleeing;
        } else {
           nextState = EntityState.Combat;
        }

        state[i] = nextState;
        
        // Perception Time-Slicing: only search if (simulationTickCount + i) % 15 === 0
        const canSearch = (simulationTickCount + i) % 15 === 0;

        // If Harvesting, try to find a tree
        if (nextState === EntityState.Harvesting) {
          if (canSearch) {
            const treeId = findNearest(positionX[i], positionY[i], 80, TRAIT_TREE);
            if (treeId !== -1) {
              targetEntityId[i] = treeId;
              actionTimer[i] = 200; // Time allocated to harvest
            } else {
              // No tree nearby, stay idle for now
              state[i] = EntityState.Idle;
              actionTimer[i] = Math.floor(Math.random() * 60) + 10;
            }
          } else {
            // Cannot search this frame, revert to idle to wait
            state[i] = EntityState.Idle;
            actionTimer[i] = 1;
          }
        } else if (nextState === EntityState.Combat) {
          if (canSearch) {
            // Find a nearby entity to attack
            const targetId = findNearest(positionX[i], positionY[i], 80, ~TRAIT_TREE); // Not a tree
            if (targetId !== -1 && targetId !== i) {
              targetEntityId[i] = targetId;
              actionTimer[i] = 120;
            } else {
              state[i] = EntityState.Idle;
              actionTimer[i] = Math.floor(Math.random() * 60) + 10;
            }
          } else {
            // Cannot search this frame, revert to idle to wait
            state[i] = EntityState.Idle;
            actionTimer[i] = 1;
          }
        } else {
          actionTimer[i] = Math.floor(Math.random() * (300 - 60 + 1)) + 60;
        }
        activeCommandPriority[i] = 0; // Reset priority
      } else {
        // Task completed
        if (state[i] === EntityState.Harvesting && targetEntityId[i] !== -1) {
          money[i] += 15;
          targetEntityId[i] = -1;
        }
        
        state[i] = EntityState.Idle;
        actionTimer[i] = Math.floor(Math.random() * 60) + 10;
        activeCommandPriority[i] = 0; // Reset priority
      }
    }
  }
}

/**
 * Simulates a high-level command from a group leader.
 */
export function broadcastGroupCommand(groupId: number, commandState: number, targetX: number, targetY: number): void {
  if (groupId >= 0 && groupId < MAX_GROUPS) {
    groupTargetX[groupId] = targetX;
    groupTargetY[groupId] = targetY;
    groupTargetEntityID[groupId] = -1; // Default to -1
  }

  for (let i = 0; i < MAX_ENTITIES; i++) {
    let issuingPriority = 0;
    
    // Check mock priority table: Nation (4) > Army (3) > Clan (2) > Family (1)
    if (nationGroup[i] === groupId) issuingPriority = 4;
    else if (armyGroup[i] === groupId) issuingPriority = 3;
    else if (clanGroup[i] === groupId) issuingPriority = 2;
    else if (familyGroup[i] === groupId) issuingPriority = 1;

    if (issuingPriority > 0) {
      // Conflict Resolution Logic
      if (issuingPriority >= activeCommandPriority[i]) {
        state[i] = commandState;
        actionTimer[i] = 0; // Force immediate response on next tick
        activeCommandPriority[i] = issuingPriority; // Update active priority
      }
    }
  }
}

/**
 * CombatDamageSystem
 * Resolves damage and triggers interruptions.
 */
function CombatDamageSystem(attackerId: number, victimId: number, damageValue: number): void {
  // Inflict Attribute Change
  health[victimId] -= damageValue;

  // Clear Target Focus
  targetEntityId[victimId] = -1;

  // Zero Out Timer to force instant behavioral shift
  actionTimer[victimId] = 0;

  // Flush Low-Priority Tasks and push interruption event
  const baseIndex = victimId * 4;
  pendingEvents[baseIndex] = EVENT_HOSTILE_ATTACK;
  pendingEvents[baseIndex + 1] = -1;
  pendingEvents[baseIndex + 2] = -1;
  pendingEvents[baseIndex + 3] = -1;

  // Assign Threat Target
  targetEntityId[victimId] = attackerId;
}

/**
 * SteeringSystem
 * Resolves velocity for entities actively pursuing a target or fleeing.
 */
function SteeringSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    // Skip trees
    if ((traitBitmask[i] & TRAIT_TREE) !== 0) continue;

    const targetId = targetEntityId[i];
    if (targetId === -1) {
       // If no target but in a moving state, ensure we have a default velocity or clear it
       if (state[i] === EntityState.Idle) {
         // Keep random walk from init or let it be
       }
       continue;
    }

    const tx = positionX[targetId];
    const ty = positionY[targetId];
    const dx = tx - positionX[i];
    const dy = ty - positionY[i];
    const distSq = dx * dx + dy * dy;

    if (state[i] === EntityState.Fleeing) {
      // Scale away at max speed (2.0)
      const dist = Math.sqrt(distSq);
      if (dist > 0.1) {
        velocityX[i] = -(dx / dist) * 2.0;
        velocityY[i] = -(dy / dist) * 2.0;
      }

      // If far enough, clear target
      if (distSq > 400 * 400) {
        targetEntityId[i] = -1;
      }
    } else if (state[i] === EntityState.Combat) {
      // Run toward attacker at speed 1.5
      if (distSq > 4.0) { // Contact range 2.0
        const dist = Math.sqrt(distSq);
        velocityX[i] = (dx / dist) * 1.5;
        velocityY[i] = (dy / dist) * 1.5;
      } else {
        // Arrived at combat range
        velocityX[i] = 0;
        velocityY[i] = 0;

        // Apply CombatDamageSystem (retaliate)
        // Only apply every few ticks? For now, simplified.
        if (Math.random() > 0.9) {
          CombatDamageSystem(i, targetId, 10);
        }
      }
    } else {
      // Default steering (Harvesting, etc.)
      if (distSq > 4.0) {
        const dist = Math.sqrt(distSq);
        velocityX[i] = (dx / dist) * 1.2;
        velocityY[i] = (dy / dist) * 1.2;
      } else {
        velocityX[i] = 0;
        velocityY[i] = 0;
      }
    }
  }
}

/**
 * Centralized tick function representing one frame of execution.
 */
export function tick(): void {
  SpatialUpdateSystem();
  AutonomySystem();
  SteeringSystem();
  MovementSystem();
  simulationTickCount++;
}

// Web Worker message broker interface
self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  const type = data.type;
  
  if (type === "INIT") {
    initializeSimulation();
    // Send back the raw array buffers so the main thread canvas can read them
    self.postMessage({
      type: "INITIALIZED",
      buffers: { 
        positionX: positionX.buffer, 
        positionY: positionY.buffer,
        state: state.buffer
      }
    });
  }
  
  if (type === "TICK") {
    tick();
    self.postMessage({ type: "TICK_COMPLETE" });
  }

  if (type === "GROUP_COMMAND") {
    const payload = data.payload || data;
    const { groupId, commandState, targetX, targetY } = payload;
    broadcastGroupCommand(groupId, commandState, targetX, targetY);
  }
};
