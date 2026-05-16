// src/main.ts

// 1. Worker Instantiation
const worker = new Worker(new URL('./simulationWorker.ts', import.meta.url), { type: 'module' });

// UI Elements
const statLastTick = document.getElementById('stat-last-tick') as HTMLElement;
const statAvgTick = document.getElementById('stat-avg-tick') as HTMLElement;
const btnToggleLoop = document.getElementById('btn-toggle-loop') as HTMLButtonElement;
const btnSingleStep = document.getElementById('btn-single-step') as HTMLButtonElement;
const btnNationCommand = document.getElementById('btn-nation-command') as HTMLButtonElement;
const btnArmyCommand = document.getElementById('btn-army-command') as HTMLButtonElement;
const canvas = document.getElementById('simCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// 2. Create a persistent ImageData buffer matching canvas dimensions
const canvasWidth = 1600;
const canvasHeight = 1200;
const imageData = ctx.createImageData(canvasWidth, canvasHeight);
const pixelView = new Uint32Array(imageData.data.buffer);

// Colors (Little-endian ABGR representation for Uint32Array over Uint8ClampedArray)
const COLOR_BG = 0xFF222222; // Dark Grey
const COLOR_IDLE = 0xFFFFFFFF; // White
const COLOR_HARVESTING = 0xFF00FF00; // Green
const COLOR_FLEEING = 0xFFFF0000; // Blue
const COLOR_COMBAT = 0xFF0000FF; // Red

// Shared Array Buffers references
let positionX: Float32Array;
let positionY: Float32Array;
let state: Uint8Array;
const MAX_ENTITIES = 100_000;

// State Variables
let isLooping = false;
let isTickPending = false;
let lastTickStartTime = 0;
let totalTickTime = 0;
let tickCount = 0;
let animationFrameId: number;

// 2. Initialization Sequence & Message Handling
worker.onmessage = (e: MessageEvent) => {
  const data = e.data;

  if (data.type === "INITIALIZED") {
    console.log("Worker successfully initialized. Buffers received.");
    // Map the views to the shared array buffers
    positionX = new Float32Array(data.buffers.positionX);
    positionY = new Float32Array(data.buffers.positionY);
    state = new Uint8Array(data.buffers.state);
  }

  // 3. Capture performance data after frame completion and render
  if (data.type === "TICK_COMPLETE") {
    const tickEndTime = performance.now();
    const duration = tickEndTime - lastTickStartTime;
    
    totalTickTime += duration;
    tickCount++;
    
    // Metrics Rendering
    statLastTick.textContent = `${duration.toFixed(2)} ms`;
    statAvgTick.textContent = `${(totalTickTime / tickCount).toFixed(2)} ms`;
    
    isTickPending = false;

    // Render Step (Execute natively via single Uint32Array)
    if (positionX && positionY && state) {
      // Clear the pixelView array buffer
      pixelView.fill(COLOR_BG);

      // Loop through all 100,000 entities
      for (let i = 0; i < MAX_ENTITIES; i++) {
        const x = Math.floor(positionX[i]);
        const y = Math.floor(positionY[i]);

        // Guard to ensure we don't index outside the 1600x1200 array mapping
        if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
          const s = state[i];
          let color = COLOR_IDLE; // Default
          
          if (s === 1) color = COLOR_HARVESTING;
          else if (s === 2) color = COLOR_FLEEING;
          else if (s === 3) color = COLOR_COMBAT;

          // Calculate 1D index
          const pixelIndex = y * canvasWidth + x;
          
          // Write color
          pixelView[pixelIndex] = color;
        }
      }

      // Upload the finalized pixel buffer to the monitor screen
      ctx.putImageData(imageData, 0, 0);
    }

    // Continue loop if active
    if (isLooping) {
      animationFrameId = requestAnimationFrame(loop);
    }
  }
};

// 3. The Animation Loop Core Function
function sendTick() {
  if (isTickPending) return;
  isTickPending = true;
  lastTickStartTime = performance.now(); // Record start time right before sending
  worker.postMessage({ type: "TICK" });
}

function loop() {
  if (isLooping) {
    sendTick();
  }
}

// 4. UI Event Listeners
btnToggleLoop.addEventListener('click', () => {
  isLooping = !isLooping;
  btnToggleLoop.textContent = isLooping ? "Pause Loop" : "Start Loop";
  
  if (isLooping) {
    // Start loop
    animationFrameId = requestAnimationFrame(loop);
  } else {
    // Pause loop
    cancelAnimationFrame(animationFrameId);
  }
});

btnSingleStep.addEventListener('click', () => {
  if (!isLooping) {
    sendTick();
  } else {
    console.warn("Cannot single step while the loop is running.");
  }
});

btnNationCommand.addEventListener('click', () => {
  // Command State 3 = Combat
  worker.postMessage({
    type: "GROUP_COMMAND",
    payload: {
      groupId: 5, // Mock Nation Group ID
      commandState: 3, 
      targetX: 800, // Roughly center of 1600x1200
      targetY: 600
    }
  });
  console.log("Issued Nation Command to Group 5: Attack (800, 600)");
});

btnArmyCommand.addEventListener('click', () => {
  // Command State 2 = Fleeing
  worker.postMessage({
    type: "GROUP_COMMAND",
    payload: {
      groupId: 25, // Mock Army Group ID
      commandState: 2,
      targetX: 100, // Top-left corner general area
      targetY: 100
    }
  });
  console.log("Issued Army Command to Group 25: Flee (100, 100)");
});

// Trigger Initialization Sequence
worker.postMessage({ type: "INIT" });