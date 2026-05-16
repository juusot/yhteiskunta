// src/main.tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';

// 1. Worker Instantiation
const worker = new Worker(new URL('./simulationWorker.ts', import.meta.url), { type: 'module' });

// UI Elements
const statLastTick = document.getElementById('stat-last-tick') as HTMLElement;
const statAvgTick = document.getElementById('stat-avg-tick') as HTMLElement;
const minTickDisplay = document.getElementById('minTickDisplay') as HTMLElement;
const maxTickDisplay = document.getElementById('maxTickDisplay') as HTMLElement;
const btnToggleLoop = document.getElementById('btn-toggle-loop') as HTMLButtonElement;
const btnSingleStep = document.getElementById('btn-single-step') as HTMLButtonElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
const btnNationCommand = document.getElementById('btn-nation-command') as HTMLButtonElement;
const btnArmyCommand = document.getElementById('btn-army-command') as HTMLButtonElement;
const canvas = document.getElementById('simCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Inspector UI Elements
const inspectorPanel = document.getElementById('inspector-panel') as HTMLElement;
const inspectId = document.getElementById('inspect-id') as HTMLElement;
const inspectHealth = document.getElementById('inspect-health') as HTMLElement;
const inspectMoney = document.getElementById('inspect-money') as HTMLElement;
const inspectState = document.getElementById('inspect-state') as HTMLElement;
const inspectGroups = document.getElementById('inspect-groups') as HTMLElement;
const btnFollow = document.getElementById('btn-follow-entity') as HTMLButtonElement;
const btnClearInspect = document.getElementById('btn-clear-inspector') as HTMLButtonElement;

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
const COLOR_PRIORITY_HIGH = 0xFF00FFFF; // Yellow
const COLOR_PRIORITY_LOW = 0xFF0080FF; // Orange

// Biome Colors (ABGR)
const COLOR_TERRAIN_FOREST = 0xFF112211;
const COLOR_TERRAIN_WATER = 0xFF221111;

// Group Palette (ABGR)
const GROUP_COLORS = [
  0xFFFFFFFF, // Group 0: White (Default)
  0xFFFF00FF, // Group 1: Magenta
  0xFFFFFF00, // Group 2: Cyan
  0xFF00AAFF, // Group 3: Gold
  0xFFAA55FF, // Group 4: Pink
  0xFF55FFAA, // Group 5: Mint
  0xFF55AAFF, // Group 6: Peach
  0xFFAAFFFF, // Group 7: Cream
];

// Shared Array Buffers references
let positionX: Float32Array;
let positionY: Float32Array;
let velocityX: Float32Array;
let velocityY: Float32Array;
let health: Int32Array;
let money: Int32Array;
let state: Uint8Array;
let actionTimer: Int16Array;
let traitBitmask: Uint32Array;
let targetEntityId: Int32Array;
let pendingEvents: Int32Array;
let groupAffiliations: Int32Array;
let activeCommandPriority: Uint8Array;
let activePrioritySlot: Int8Array;
let groupTargetEntityId: Int32Array;
let groupTargetX: Float32Array;
let groupTargetY: Float32Array;
let groupTargetAge: Int16Array;
let ruleRegistry: Int32Array;
let groupPopulationCount: Int32Array;
let groupTotalWealth: Int32Array;

// Phase 11 Buffers
let worldMap: Uint8Array;

const MAX_ENTITIES = 100_000;
const TILE_SIZE = 10;
const WORLD_MAP_COLS = 160;
const WORLD_MAP_ROWS = 120;

const ROLLING_WINDOW = 60;
const tickHistory = new Float32Array(ROLLING_WINDOW);
let historyIndex = 0;
let historyFull = false;

// State Variables
let isLooping = false;
let isTickPending = false;
let lastTickStartTime = 0;
let totalTickTime = 0;
let tickCount = 0;
let animationFrameId: number;

// Camera State
let cameraX = 0;
let cameraY = 0;
let zoomLevel = 1.0;
let isFollowing = false;
let selectedEntityId = -1;

// React Root
const root = createRoot(document.getElementById('react-root')!);

function renderUI() {
  root.render(
    <App 
      ruleRegistry={ruleRegistry}
      groupPopulation={groupPopulationCount}
      groupTotalWealth={groupTotalWealth}
    />
  );
}

// 2. Initialization Sequence & Message Handling
worker.onmessage = (e: MessageEvent) => {
  const data = e.data;

  if (data.type === "INITIALIZED") {
    console.log("Worker successfully initialized. Buffers received.");
    // Map the views to the shared array buffers
    positionX = new Float32Array(data.buffers.positionX);
    positionY = new Float32Array(data.buffers.positionY);
    velocityX = new Float32Array(data.buffers.velocityX);
    velocityY = new Float32Array(data.buffers.velocityY);
    health = new Int32Array(data.buffers.health);
    money = new Int32Array(data.buffers.money);
    state = new Uint8Array(data.buffers.state);
    actionTimer = new Int16Array(data.buffers.actionTimer);
    traitBitmask = new Uint32Array(data.buffers.traitBitmask);
    targetEntityId = new Int32Array(data.buffers.targetEntityId);
    pendingEvents = new Int32Array(data.buffers.pendingEvents);
    groupAffiliations = new Int32Array(data.buffers.groupAffiliations);
    activeCommandPriority = new Uint8Array(data.buffers.activeCommandPriority);
    activePrioritySlot = new Int8Array(data.buffers.activePrioritySlot);
    groupTargetEntityId = new Int32Array(data.buffers.groupTargetEntityId);
    groupTargetX = new Float32Array(data.buffers.groupTargetX);
    groupTargetY = new Float32Array(data.buffers.groupTargetY);
    groupTargetAge = new Int16Array(data.buffers.groupTargetAge);
    ruleRegistry = new Int32Array(data.buffers.ruleRegistry);
    groupPopulationCount = new Int32Array(data.buffers.groupPopulationCount);
    groupTotalWealth = new Int32Array(data.buffers.groupTotalWealth);
    
    worldMap = new Uint8Array(data.buffers.worldMap);

    console.log("All component buffers attached. UI Engine active.");
    renderUI();
  }

  if (data.type === "SAVE_REQUEST") {
    console.log("Auto-save triggered by Rule Engine.");
    serializeState();
  }

  if (data.type === "ENTITY_FOUND") {
    selectedEntityId = data.payload.id;
    if (selectedEntityId !== -1) {
      inspectorPanel.style.display = 'block';
      updateInspector();
    } else {
      inspectorPanel.style.display = 'none';
      isFollowing = false;
    }
  }

  // 3. Capture performance data after frame completion and render
  if (data.type === "TICK_COMPLETE") {
    const tickEndTime = performance.now();
    const duration = tickEndTime - lastTickStartTime;
    
    totalTickTime += duration;
    tickCount++;
    
    // Update rolling history
    tickHistory[historyIndex] = duration;
    historyIndex = (historyIndex + 1) % ROLLING_WINDOW;
    if (historyIndex === 0) historyFull = true;

    // Metrics Rendering
    statLastTick.textContent = `${duration.toFixed(2)} ms`;
    statAvgTick.textContent = `${(totalTickTime / tickCount).toFixed(2)} ms`;

    // Calculate rolling Min/Max
    const windowSize = historyFull ? ROLLING_WINDOW : historyIndex;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < windowSize; i++) {
      const val = tickHistory[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    
    minTickDisplay.textContent = `${min.toFixed(1)} ms`;
    maxTickDisplay.textContent = `${max.toFixed(1)} ms`;
    
    isTickPending = false;

    // Update Follow Mode
    if (isFollowing && selectedEntityId !== -1) {
      cameraX = positionX[selectedEntityId] - (canvasWidth / 2) / zoomLevel;
      cameraY = positionY[selectedEntityId] - (canvasHeight / 2) / zoomLevel;
    }

    // Render Step
    if (positionX && positionY && state && activePrioritySlot && groupAffiliations && worldMap) {
      pixelView.fill(COLOR_BG);

      // Phase 11: Render Biome Grid
      const startTileX = Math.floor(Math.max(0, cameraX / TILE_SIZE));
      const endTileX = Math.ceil(Math.min(WORLD_MAP_COLS, (cameraX + canvasWidth / zoomLevel) / TILE_SIZE));
      const startTileY = Math.floor(Math.max(0, cameraY / TILE_SIZE));
      const endTileY = Math.ceil(Math.min(WORLD_MAP_ROWS, (cameraY + canvasHeight / zoomLevel) / TILE_SIZE));

      for (let ty = startTileY; ty < endTileY; ty++) {
        for (let tx = startTileX; tx < endTileX; tx++) {
          const terrain = worldMap[ty * WORLD_MAP_COLS + tx];
          if (terrain === 0) continue; // Skip grass (BG color)

          const color = terrain === 1 ? COLOR_TERRAIN_FOREST : COLOR_TERRAIN_WATER;
          
          const screenX = Math.floor((tx * TILE_SIZE - cameraX) * zoomLevel);
          const screenY = Math.floor((ty * TILE_SIZE - cameraY) * zoomLevel);
          const screenTileSize = Math.ceil(TILE_SIZE * zoomLevel);

          for (let py = 0; py < screenTileSize; py++) {
            const dy = screenY + py;
            if (dy < 0 || dy >= canvasHeight) continue;
            for (let px = 0; px < screenTileSize; px++) {
              const dx = screenX + px;
              if (dx < 0 || dx >= canvasWidth) continue;
              pixelView[dy * canvasWidth + dx] = color;
            }
          }
        }
      }

      // Loop through all 100,000 entities
      for (let i = 0; i < MAX_ENTITIES; i++) {
        const worldX = positionX[i];
        const worldY = positionY[i];

        // Transform to screen space
        const x = Math.floor((worldX - cameraX) * zoomLevel);
        const y = Math.floor((worldY - cameraY) * zoomLevel);

        if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
          let color = COLOR_IDLE;
          
          const p = activePrioritySlot[i];
          const primaryGroupId = groupAffiliations[i * 8];

          if (i === selectedEntityId) {
            color = 0xFF00FFFF; // Neon Cyan for selected
          } else if (p === 0) {
            color = COLOR_PRIORITY_HIGH;
          } else if (p > 0) {
            color = COLOR_PRIORITY_LOW;
          } else if (primaryGroupId > 0 && primaryGroupId < GROUP_COLORS.length) {
            color = GROUP_COLORS[primaryGroupId];
          } else {
            const s = state[i];
            if (s === 1) color = COLOR_HARVESTING;
            else if (s === 2) color = COLOR_FLEEING;
            else if (s === 3) color = COLOR_COMBAT;
          }

          const pixelIndex = y * canvasWidth + x;
          pixelView[pixelIndex] = color;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      
      if (selectedEntityId !== -1) updateInspector();
    }

    if (isLooping) {
      animationFrameId = requestAnimationFrame(loop);
    }
  }
};

function updateInspector() {
  if (selectedEntityId === -1) return;

  inspectId.textContent = selectedEntityId.toString();
  inspectHealth.textContent = health[selectedEntityId].toString();
  inspectMoney.textContent = money[selectedEntityId].toString();
  
  const s = state[selectedEntityId];
  const stateNames = ["Idle", "Harvesting", "Fleeing", "Combat"];
  inspectState.textContent = stateNames[s] || "Unknown";

  const groups = [];
  const base = selectedEntityId * 8;
  for (let i = 0; i < 8; i++) {
    const g = groupAffiliations[base + i];
    if (g !== -1) groups.push(g);
  }
  inspectGroups.textContent = groups.length > 0 ? groups.join(", ") : "None";
}

// Canvas Mouse Interactions
let isMouseDown = false;
let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (e.button === 2) { // Right Click
    isPanning = true;
    e.preventDefault();
  } else if (e.button === 0) { // Left Click
    const brush = (window as any).brushState;
    if (brush && brush.active) {
      handleBrush(e);
    } else {
      handleSelection(e);
    }
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    cameraX -= dx / zoomLevel;
    cameraY -= dy / zoomLevel;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    isFollowing = false; // Break follow on manual pan
  } else if (isMouseDown) {
    const brush = (window as any).brushState;
    if (brush && brush.active) handleBrush(e);
  }
});

canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
  isPanning = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

  const worldMouseX = mouseX / zoomLevel + cameraX;
  const worldMouseY = mouseY / zoomLevel + cameraY;

  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  zoomLevel *= zoomFactor;
  zoomLevel = Math.max(0.1, Math.min(zoomLevel, 50));

  // Recenter camera to keep mouse over the same world position
  cameraX = worldMouseX - mouseX / zoomLevel;
  cameraY = worldMouseY - mouseY / zoomLevel;
}, { passive: false });

function handleSelection(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  const worldX = x / zoomLevel + cameraX;
  const worldY = y / zoomLevel + cameraY;

  worker.postMessage({
    type: 'FIND_ENTITY',
    payload: { x: worldX, y: worldY, radius: 20 / zoomLevel }
  });
}

function handleBrush(e: MouseEvent) {
  const brush = (window as any).brushState;
  if (!brush || !brush.active) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  const worldX = x / zoomLevel + cameraX;
  const worldY = y / zoomLevel + cameraY;

  worker.postMessage({
    type: 'PAINT_ENTITIES',
    payload: { 
      x: worldX, 
      y: worldY, 
      radius: 50 / zoomLevel, 
      groupId: brush.groupId, 
      traitBitmask: brush.trait 
    }
  });
}

btnFollow.addEventListener('click', () => {
  isFollowing = !isFollowing;
  btnFollow.textContent = isFollowing ? "Unfollow" : "Follow Entity";
});

btnClearInspect.addEventListener('click', () => {
  selectedEntityId = -1;
  isFollowing = false;
  inspectorPanel.style.display = 'none';
});

// 3. The Animation Loop Core Function
function sendTick() {
  if (isTickPending) return;
  isTickPending = true;
  lastTickStartTime = performance.now();
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
  if (isLooping) animationFrameId = requestAnimationFrame(loop);
  else cancelAnimationFrame(animationFrameId);
});

btnSingleStep.addEventListener('click', () => {
  if (!isLooping) sendTick();
});

btnNationCommand.addEventListener('click', () => {
  worker.postMessage({
    type: "GROUP_COMMAND",
    payload: { groupId: 5, commandState: 3, targetX: 800, targetY: 600 }
  });
});

btnArmyCommand.addEventListener('click', () => {
  worker.postMessage({
    type: "GROUP_COMMAND",
    payload: { groupId: 25, commandState: 2, targetX: 100, targetY: 100 }
  });
});

/**
 * Utility to add a new rule from the main thread
 */
(window as any).addSimulationRule = (
  subjectId: number, 
  conditionType: number, 
  threshold: number, 
  actionState: number, 
  tx: number, 
  ty: number
) => {
  if (!ruleRegistry) return;
  for (let r = 0; r < 100; r++) {
    const base = r * 8;
    if (ruleRegistry[base + 7] === 0) {
      ruleRegistry[base + 0] = 0;
      ruleRegistry[base + 1] = subjectId;
      ruleRegistry[base + 2] = conditionType;
      ruleRegistry[base + 3] = threshold;
      ruleRegistry[base + 4] = actionState;
      ruleRegistry[base + 5] = tx;
      ruleRegistry[base + 6] = ty;
      ruleRegistry[base + 7] = 1;
      return;
    }
  }
};

// 5. Binary Serialization & Persistence
async function serializeState() {
  worker.postMessage({ type: "PAUSE_SIM" });
  const buffers = [
    positionX, positionY, velocityX, velocityY, health, money, 
    state, actionTimer, traitBitmask, targetEntityId, 
    pendingEvents, groupAffiliations, activeCommandPriority, activePrioritySlot,
    groupTargetEntityId, groupTargetX, groupTargetY, groupTargetAge,
    ruleRegistry, worldMap
  ];
  let totalBodySize = 0;
  for (const b of buffers) totalBodySize += b.byteLength;
  const totalFileSize = 16 + totalBodySize;
  const saveBuffer = new Uint8Array(totalFileSize);
  const view = new DataView(saveBuffer.buffer);
  new TextEncoder().encodeInto("SIM1", saveBuffer.subarray(0, 4));
  view.setUint32(4, 1, true);
  view.setUint32(8, MAX_ENTITIES, true);
  view.setUint32(12, totalFileSize, true);
  let offset = 16;
  for (const b of buffers) {
    saveBuffer.set(new Uint8Array(b.buffer), offset);
    offset += b.byteLength;
  }
  try {
    const path = await save({ filters: [{ name: 'Simulation', extensions: ['bin'] }], defaultPath: `world_${tickCount}.bin` });
    if (path) await writeFile(path, saveBuffer);
  } catch (err) { console.error("Failed to save world state:", err); }
  worker.postMessage({ type: "RESUME_SIM" });
}

async function deserializeState() {
  try {
    const path = await open({ filters: [{ name: 'Simulation', extensions: ['bin'] }], multiple: false });
    if (!path || Array.isArray(path)) return;
    worker.postMessage({ type: "PAUSE_SIM" });
    const fileData = await readFile(path);
    const view = new DataView(fileData.buffer);
    const magic = new TextDecoder().decode(fileData.subarray(0, 4));
    if (magic !== "SIM1") throw new Error("Invalid magic header");
    const savedEntities = view.getUint32(8, true);
    if (savedEntities !== MAX_ENTITIES) throw new Error("Entity count mismatch");
    const buffers = [
      positionX, positionY, velocityX, velocityY, health, money, 
      state, actionTimer, traitBitmask, targetEntityId, 
      pendingEvents, groupAffiliations, activeCommandPriority, activePrioritySlot,
      groupTargetEntityId, groupTargetX, groupTargetY, groupTargetAge,
      ruleRegistry, worldMap
    ];
    let offset = 16;
    for (const b of buffers) {
      new Uint8Array(b.buffer).set(fileData.subarray(offset, offset + b.byteLength));
      offset += b.byteLength;
    }
    worker.postMessage({ type: "SYNC_TICK", tickCount: 0 }); 
  } catch (err) { alert("Error loading save file: " + (err as Error).message); }
  worker.postMessage({ type: "RESUME_SIM" });
}

saveBtn.addEventListener('click', serializeState);
loadBtn.addEventListener('click', deserializeState);

// Trigger Initialization Sequence
worker.postMessage({ type: "INIT" });
