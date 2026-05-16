// src/simulationWorker.ts

export const MAX_ENTITIES = 100_000;

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
export let primaryGroup: Int32Array;
export let traitBitmask: Uint32Array;

/**
 * Initializes the global component arrays using SharedArrayBuffers.
 * Populates them with 100,000 dummy entities.
 */
export function initializeSimulation(): void {
  // Allocate memory using SharedArrayBuffer for each component array based on their type
  // Float32Array, Int32Array, Uint32Array = 4 bytes per element
  // Int16Array = 2 bytes per element
  // Uint8Array = 1 byte per element
  
  positionX = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  positionY = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  velocityX = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  velocityY = new Float32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  health = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  money = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  state = new Uint8Array(new SharedArrayBuffer(MAX_ENTITIES * 1));
  actionTimer = new Int16Array(new SharedArrayBuffer(MAX_ENTITIES * 2));
  primaryGroup = new Int32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));
  traitBitmask = new Uint32Array(new SharedArrayBuffer(MAX_ENTITIES * 4));

  // Populate arrays with dummy entity data
  for (let i = 0; i < MAX_ENTITIES; i++) {
    positionX[i] = Math.random() * 10000; // Random X position 0 to 10000
    positionY[i] = Math.random() * 10000; // Random Y position 0 to 10000
    
    // Initial velocity
    velocityX[i] = (Math.random() - 0.5) * 2;
    velocityY[i] = (Math.random() - 0.5) * 2;
    
    health[i] = 100;
    money[i] = 0;
    
    state[i] = EntityState.Idle;
    actionTimer[i] = 0;
    
    primaryGroup[i] = Math.floor(Math.random() * 100); // Dummy group ID
    traitBitmask[i] = 0; // No traits initially
  }
  
  console.log(`Simulation initialized with ${MAX_ENTITIES} entities using SharedArrayBuffers.`);
}

/**
 * Decoupled MovementSystem
 * Loops through entity arrays and updates positions based on velocity components.
 */
function MovementSystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    positionX[i] += velocityX[i];
    positionY[i] += velocityY[i];
  }
}

/**
 * Baseline AutonomySystem
 * Evaluates actions for entities whose ActionTimer is 0. 
 * If an entity is Idle, randomly assign it a new action state (e.g., Harvesting) 
 * and set its ActionTimer to a random value between 60 and 300 ticks.
 * For entities with an ActionTimer greater than 0, simply decrement the value by 1.
 */
function AutonomySystem(): void {
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (actionTimer[i] > 0) {
      actionTimer[i]--;
    } else {
      // actionTimer[i] === 0
      if (state[i] === EntityState.Idle) {
        // Randomly pick a new state between Harvesting (1), Fleeing (2), Combat (3)
        // For simplicity of this baseline, let's heavily bias towards Harvesting if Idle
        const nextState = Math.random() > 0.1 ? EntityState.Harvesting : (Math.random() > 0.5 ? EntityState.Fleeing : EntityState.Combat);
        state[i] = nextState;
        
        // Random timer between 60 and 300 ticks
        actionTimer[i] = Math.floor(Math.random() * (300 - 60 + 1)) + 60;
      } else {
        // If they finished their task (timer reached 0), return to Idle
        state[i] = EntityState.Idle;
        actionTimer[i] = Math.floor(Math.random() * 60) + 10; // Idle for a short duration
      }
    }
  }
}

/**
 * Centralized tick function representing one frame of execution.
 */
export function tick(): void {
  AutonomySystem();
  MovementSystem();
}

// Web Worker message broker interface
self.onmessage = (e: MessageEvent) => {
  const { type } = e.data;
  
  if (type === "INIT") {
    initializeSimulation();
    // Send back the raw array buffers so the main thread canvas can read them
    self.postMessage({
      type: "INITIALIZED",
      buffers: { positionX: positionX.buffer, positionY: positionY.buffer }
    });
  }
  
  if (type === "TICK") {
    tick();
  }
};
