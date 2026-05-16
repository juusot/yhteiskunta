// src/main.tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';

const workers: Worker[] = [];
for (let i = 0; i < 4; i++) {
  workers.push(new Worker(new URL('./simulationWorker.ts', import.meta.url), { type: 'module' }));
}

const statLastTick = document.getElementById('stat-last-tick') as HTMLElement;
const statAvgTick = document.getElementById('stat-avg-tick') as HTMLElement;
const statEntities = document.getElementById('stat-entities') as HTMLElement;
const statWorkerLoad = document.createElement('div');
statWorkerLoad.style.fontSize = '10px'; statWorkerLoad.style.color = '#888';
statLastTick.parentElement?.appendChild(statWorkerLoad);

const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
const btnNationCommand = document.getElementById('btn-nation-command') as HTMLButtonElement;
const btnArmyCommand = document.getElementById('btn-army-command') as HTMLButtonElement;
const btnToggleLoop = document.getElementById('btn-toggle-loop') as HTMLButtonElement;
const btnSingleStep = document.getElementById('btn-single-step') as HTMLButtonElement;
const canvas = document.getElementById('simCanvas') as HTMLCanvasElement;

const inspectorPanel = document.getElementById('inspector-panel') as HTMLElement;
const inspectId = document.getElementById('inspect-id') as HTMLElement;
const inspectHealth = document.getElementById('inspect-health') as HTMLElement;
const inspectMoney = document.getElementById('inspect-money') as HTMLElement;
const inspectState = document.getElementById('inspect-state') as HTMLElement;
const inspectInventory = document.getElementById('inspect-inventory') as HTMLElement;
const inspectGroups = document.getElementById('inspect-groups') as HTMLElement;
const inspectHostility = document.getElementById('inspect-hostility') as HTMLElement;
const btnFollow = document.getElementById('btn-follow-entity') as HTMLButtonElement;
const btnClearInspect = document.getElementById('btn-clear-inspector') as HTMLButtonElement;

const MAX_ENTITIES = 100_000;
const MAX_GROUPS = 1000;
const MAP_COLS = 160;
const MAP_ROWS = 120;

const gl = canvas.getContext('webgl2', { alpha: false, antialias: true })!;

// --- Background (Tile) Shader ---
const TILE_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_type;
uniform vec2 u_resolution;
uniform vec4 u_camera;
out float v_type;
void main() {
    vec2 worldPos = vec2(float(gl_InstanceID % 160), float(gl_InstanceID / 160)) * 10.0;
    vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;
    gl_Position = vec4(clipPos + (a_pos * 10.0 * u_camera.z / u_resolution), 0.0, 1.0);
    v_type = a_type;
}`;
const TILE_FS = `#version 300 es
precision highp float;
in float v_type;
out vec4 outColor;
void main() {
    if (v_type == 0.0) outColor = vec4(0.83, 0.83, 0.83, 1.0); // Grass
    else if (v_type == 1.0) outColor = vec4(0.75, 0.75, 0.75, 1.0); // Forest
    else outColor = vec4(0.7, 0.7, 0.7, 1.0); // Water
}`;

// --- Entity Shader ---
const VS_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_instancePos;
layout(location = 1) in float a_instanceGroup;
layout(location = 2) in float a_instanceState;
layout(location = 3) in float a_instanceArchetype;
layout(location = 4) in float a_instanceTrait;

uniform vec2 u_resolution;
uniform vec4 u_camera; // x, y, zoom, tick
uniform vec3 u_groupColors[8];
uniform vec2 u_shapes[180]; // 5 shapes * 36 vertices

out vec3 v_color;
out float v_state;
out float v_tick;

void main() {
    float cameraX = u_camera.x, cameraY = u_camera.y, zoom = u_camera.z, tick = u_camera.w;
    vec2 worldPos = a_instancePos;

    if (worldPos.x < cameraX - 50.0 || worldPos.x > cameraX + (u_resolution.x / zoom) + 50.0 ||
        worldPos.y < cameraY - 50.0 || worldPos.y > cameraY + (u_resolution.y / zoom) + 50.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
    }

    vec2 screenPos = (worldPos - vec2(cameraX, cameraY)) * zoom;
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;

    int arch = int(a_instanceArchetype);
    int traits = int(a_instanceTrait);
    bool isTree = (traits & 1) != 0;
    bool isMagic = (traits & 32) != 0;
    if (isTree) arch = 1; // Trees always Circles

    vec2 vertexOffset = u_shapes[arch * 36 + gl_VertexID];
    float size = isTree ? 8.0 : 4.0;
    size *= clamp(zoom * 0.5, 0.5, 5.0);
    gl_Position = vec4(clipPos + (vertexOffset * size / u_resolution), 0.0, 1.0);

    vec3 color = vec3(0.15, 0.15, 0.15);
    if (isTree) color = vec3(0.3, 0.5, 0.2);
    else {
        int gid = int(a_instanceGroup);
        if (gid >= 0 && gid < 8) color = u_groupColors[gid];
        if (abs(a_instanceState - 1.0) < 0.1) color = vec3(0.0, 0.8, 0.0);
        if (abs(a_instanceState - 2.0) < 0.1) color = vec3(0.0, 0.0, 0.8);
        if (abs(a_instanceState - 4.0) < 0.1) color = vec3(0.5, 0.3, 0.2);
        if (abs(a_instanceState - 6.0) < 0.1) color = vec3(0.73, 0.0, 0.73); // Bright Purple (Trading)
        if (abs(a_instanceState - 7.0) < 0.1) color = vec3(0.0, 1.0, 1.0); // Cyan (ReportingIntel)
        
        if (isMagic) color = mix(color, vec3(0.5, 0.0, 1.0), 0.5); // Purple tint for Seers
    }
    v_color = color; 
    v_state = isTree ? 0.0 : a_instanceState; 
    v_tick = tick;
}`;

const FS_SOURCE = `#version 300 es
precision highp float;
in vec3 v_color; in float v_state, v_tick;
out vec4 outColor;
void main() {
    vec3 color = v_color;
    if (abs(v_state - 3.0) < 0.1) {
        float f = sin(v_tick * 0.4) * 0.5 + 0.5;
        color = mix(vec3(0.5, 0.0, 0.0), vec3(1.0, 0.1, 0.1), f);
    }
    outColor = vec4(color, 1.0);
}`;

const LINE_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
uniform vec2 u_resolution;
uniform vec4 u_camera;
void main() {
    vec2 worldPos = a_pos;
    vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;
    gl_Position = vec4(clipPos, 0.0, 1.0);
}`;
const LINE_FS = `#version 300 es
precision highp float;
uniform vec3 u_color;
out vec4 outColor;
void main() { outColor = vec4(u_color, 1.0); }`;

const TERRITORY_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_owner;
uniform vec2 u_resolution;
uniform vec4 u_camera;
out float v_owner;
void main() {
    if (a_owner < -0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 worldPos = vec2(float(gl_InstanceID % 160), float(gl_InstanceID / 160)) * 10.0;
    vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;
    gl_Position = vec4(clipPos + (a_pos * 10.0 * u_camera.z / u_resolution), 0.0, 1.0);
    v_owner = a_owner;
}`;
const TERRITORY_FS = `#version 300 es
precision highp float;
uniform vec3 u_groupColors[8];
in float v_owner;
out vec4 outColor;
void main() {
    int oid = int(v_owner);
    vec3 color = vec3(0.5);
    if (oid >= 0 && oid < 8) color = u_groupColors[oid];
    outColor = vec4(color, 0.25); // Subtle overlay
}`;

function createProgram(vs: string, fs: string) {
    const p = gl.createProgram()!;
    const compile = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
}

const entityProg = createProgram(VS_SOURCE, FS_SOURCE);
const tileProg = createProgram(TILE_VS, TILE_FS);
const lineProg = createProgram(LINE_VS, LINE_FS);
const territoryProg = createProgram(TERRITORY_VS, TERRITORY_FS);

const uRes = gl.getUniformLocation(entityProg, 'u_resolution');
const uCam = gl.getUniformLocation(entityProg, 'u_camera');
const uCols = gl.getUniformLocation(entityProg, 'u_groupColors');
const uShapes = gl.getUniformLocation(entityProg, 'u_shapes');

const uResTile = gl.getUniformLocation(tileProg, 'u_resolution');
const uCamTile = gl.getUniformLocation(tileProg, 'u_camera');

const uResLine = gl.getUniformLocation(lineProg, 'u_resolution');
const uCamLine = gl.getUniformLocation(lineProg, 'u_camera');
const uColLine = gl.getUniformLocation(lineProg, 'u_color');
const lineVBO = gl.createBuffer();

const uResTerr = gl.getUniformLocation(territoryProg, 'u_resolution');
const uCamTerr = gl.getUniformLocation(territoryProg, 'u_camera');
const uColsTerr = gl.getUniformLocation(territoryProg, 'u_groupColors');
const territoryTypeVBO = gl.createBuffer();

let positionX: Float32Array, positionY: Float32Array, _velocityX: Float32Array, _velocityY: Float32Array, health: Int32Array, money: Int32Array, state: Uint8Array, groupAffiliations: Int32Array, traitBitmask: Uint32Array;
let groupWarehouseX: Float32Array, groupWarehouseY: Float32Array;
let groupPopulationCount: Int32Array, groupTotalWealth: Int32Array, entityInventory: Int16Array, groupRelationsMatrix: Int8Array, groupVisualArchetypes: Int8Array, worldMap: Uint8Array, ruleRegistry: Int32Array;
let mana: Int16Array, carriedIntelEntityId: Int32Array, carriedIntelX: Float32Array, carriedIntelY: Float32Array, groupMagicFrequency: Int8Array;
let influenceMap: Int16Array, territoryOwnerMap: Int32Array, logicBytecode: Int32Array;

let isLooping = false, isTickPending = false, lastTickStartTime = 0, totalTickTime = 0, tickCount = 0, workersFinished = 0;
let workerTimes = [0, 0, 0, 0];
let cameraX = 0, cameraY = 0, zoomLevel = 1.0, isFollowing = false, selectedEntityId = -1, showTerritory = false;

// Shape Data
const shapeData = new Float32Array(180 * 2);
function setShape(idx: number, pts: number[]) {
  for (let i = 0; i < 36; i++) {
    const p = i < pts.length / 2 ? i * 2 : (pts.length - 2);
    shapeData[(idx * 36 + i) * 2] = pts[p]; shapeData[(idx * 36 + i) * 2 + 1] = pts[p + 1];
  }
}
setShape(0, [0, 1, -0.86, -0.5, 0.86, -0.5]); 
setShape(1, (() => { const c=[]; for(let i=0;i<12;i++) { const a1=i/12*6.28, a2=(i+1)/12*6.28; c.push(0,0,Math.cos(a1),Math.sin(a1),Math.cos(a2),Math.sin(a2)); } return c; })());
setShape(2, [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
setShape(3, (() => { const s=[]; for(let i=0;i<5;i++) { const a1=i/5*6.28-1.57, a2=(i+0.5)/5*6.28-1.57, a3=(i+1)/5*6.28-1.57; s.push(0,0,Math.cos(a1),Math.sin(a1),Math.cos(a2)*0.4,Math.sin(a2)*0.4,0,0,Math.cos(a2)*0.4,Math.sin(a2)*0.4,Math.cos(a3),Math.sin(a3)); } return s; })());
setShape(4, [0, 1, -0.5, 0, 0.5, 0, 0, -1, -0.5, 0, 0.5, 0]); // Diamond for Warehouse

const tileVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, tileVBO);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 1,1, 0,0, 1,1, 0,1]), gl.STATIC_DRAW);

const tileTypeVBO = gl.createBuffer();
const vboPos = gl.createBuffer()!, vboGrp = gl.createBuffer()!, vboSta = gl.createBuffer()!, vboArc = gl.createBuffer()!, vboTra = gl.createBuffer()!;

interface MagicBurst { fromX: number; fromY: number; toX: number; toY: number; frames: number; }
let activeBursts: MagicBurst[] = [];

const root = createRoot(document.getElementById('react-root')!);
function renderUI() { root.render(<App ruleRegistry={ruleRegistry} logicBytecode={logicBytecode} groupPopulation={groupPopulationCount} groupTotalWealth={groupTotalWealth} tickCount={tickCount} />); }

workers.forEach((w, idx) => {
  w.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d.type === "INITIALIZED") {
      positionX = new Float32Array(d.buffers.positionX); positionY = new Float32Array(d.buffers.positionY);
      _velocityX = new Float32Array(d.buffers.velocityX); _velocityY = new Float32Array(d.buffers.velocityY);
      health = new Int32Array(d.buffers.health); money = new Int32Array(d.buffers.money);
      state = new Uint8Array(d.buffers.state); groupAffiliations = new Int32Array(d.buffers.groupAffiliations);
      traitBitmask = new Uint32Array(d.buffers.traitBitmask);
      groupPopulationCount = new Int32Array(d.buffers.groupPopulationCount); groupTotalWealth = new Int32Array(d.buffers.groupTotalWealth);
      entityInventory = new Int16Array(d.buffers.entityInventory); groupRelationsMatrix = new Int8Array(d.buffers.groupRelationsMatrix);
      groupVisualArchetypes = new Int8Array(d.buffers.groupVisualArchetypes);
      worldMap = new Uint8Array(d.buffers.worldMap);
      groupWarehouseX = new Float32Array(d.buffers.groupWarehouseX); groupWarehouseY = new Float32Array(d.buffers.groupWarehouseY);
      ruleRegistry = new Int32Array(d.buffers.ruleRegistry);
      mana = new Int16Array(d.buffers.mana);
      carriedIntelEntityId = new Int32Array(d.buffers.carriedIntelEntityId);
      carriedIntelX = new Float32Array(d.buffers.carriedIntelX);
      carriedIntelY = new Float32Array(d.buffers.carriedIntelY);
      groupMagicFrequency = new Int8Array(d.buffers.groupMagicFrequency);
      influenceMap = new Int16Array(d.buffers.influenceMap);
      territoryOwnerMap = new Int32Array(d.buffers.territoryOwnerMap);
      logicBytecode = new Int32Array(d.buffers.logicBytecode);

      // Initialize other workers with shared buffers
      for (let i = 1; i < 4; i++) {
        workers[i].postMessage({ type: "INIT", payload: { 
            quadrantIndex: i, 
            buffers: d.buffers
        }});
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, tileTypeVBO);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Array.from(worldMap)), gl.STATIC_DRAW);
      renderUI();
    }
    if (d.type === "STATS_UPDATE") {
      if (statEntities) statEntities.textContent = d.payload.totalActive.toLocaleString();
      renderUI();
    }
    if (d.type === "MAGIC_BURST") {
      activeBursts.push({ ...d.payload, frames: 10 });
    }
    if (d.type === "TICK_COMPLETE") {
      workerTimes[idx] = performance.now() - lastTickStartTime;
      workersFinished++;
      if (workersFinished === 4) {
        const dur = performance.now() - lastTickStartTime; totalTickTime += dur; tickCount++;
        statLastTick.textContent = `${dur.toFixed(2)} ms`; statAvgTick.textContent = `${(totalTickTime / tickCount).toFixed(2)} ms`;
        statWorkerLoad.textContent = `W0:${workerTimes[0].toFixed(1)} W1:${workerTimes[1].toFixed(1)} W2:${workerTimes[2].toFixed(1)} W3:${workerTimes[3].toFixed(1)}`;
        isTickPending = false;
        if (isFollowing && selectedEntityId !== -1) { cameraX = positionX[selectedEntityId] - (canvas.width/2)/zoomLevel; cameraY = positionY[selectedEntityId] - (canvas.height/2)/zoomLevel; }
        render(); if (isLooping) requestAnimationFrame(() => { if (isLooping && !isTickPending) { isTickPending = true; workersFinished = 0; lastTickStartTime = performance.now(); workers.forEach(w => w.postMessage({ type: "TICK" })); } });
      }
    }
    if (d.type === "ENTITY_FOUND") { selectedEntityId = d.payload.id; if (selectedEntityId !== -1) { inspectorPanel.style.display = 'block'; updateInspector(); } else { inspectorPanel.style.display = 'none'; isFollowing = false; } }
  };
});

const iPos = new Float32Array(MAX_ENTITIES * 2 + 1000 * 2); 
const iGrp = new Float32Array(MAX_ENTITIES + 1000); 
const iSta = new Float32Array(MAX_ENTITIES + 1000); 
const iArc = new Float32Array(MAX_ENTITIES + 1000); 
const iTra = new Float32Array(MAX_ENTITIES + 1000);

function render() {
  if (!positionX) return;
  gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0.85, 0.85, 0.85, 1.0); gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(tileProg);
  gl.uniform2f(uResTile, canvas.width, canvas.height);
  gl.uniform4f(uCamTile, cameraX, cameraY, zoomLevel, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, tileVBO); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, tileTypeVBO); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MAP_COLS * MAP_ROWS);
  gl.vertexAttribDivisor(1, 0);

  // Phase 18: Territory Overlay
  if (showTerritory && territoryOwnerMap) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(territoryProg);
    gl.uniform2f(uResTerr, canvas.width, canvas.height);
    gl.uniform4f(uCamTerr, cameraX, cameraY, zoomLevel, 0);
    gl.uniform3fv(uColsTerr, new Float32Array([0.1,0.1,0.1, 0.8,0.2,0.8, 0.1,0.7,0.7, 0.8,0.5,0, 0.7,0.3,0.7, 0.2,0.7,0.3, 0.3,0.3,0.7, 0.4,0.5,0.4]));
    
    gl.bindBuffer(gl.ARRAY_BUFFER, tileVBO); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, territoryTypeVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Array.from(territoryOwnerMap)), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MAP_COLS * MAP_ROWS);
    gl.vertexAttribDivisor(1, 0);
    gl.disable(gl.BLEND);
  }

  gl.useProgram(entityProg);
  gl.uniform2f(uRes, canvas.width, canvas.height); gl.uniform4f(uCam, cameraX, cameraY, zoomLevel, tickCount);
  gl.uniform3fv(uCols, new Float32Array([0.1,0.1,0.1, 0.8,0.2,0.8, 0.1,0.7,0.7, 0.8,0.5,0, 0.7,0.3,0.7, 0.2,0.7,0.3, 0.3,0.3,0.7, 0.4,0.5,0.4]));
  gl.uniform2fv(uShapes, shapeData);

  for (let i = 0; i < MAX_ENTITIES; i++) {
    const s = state[i];
    if (s === 5) { // Dead
      iPos[i*2] = -2000; iPos[i*2+1] = -2000;
      iSta[i] = 5;
      continue;
    }
    iPos[i*2] = positionX[i]; iPos[i*2+1] = positionY[i];
    const gid = groupAffiliations[i*8]; 
    iGrp[i] = gid; 
    iSta[i] = s; 
    iTra[i] = traitBitmask[i];
    iArc[i] = (gid >= 0 && gid < MAX_GROUPS) ? groupVisualArchetypes[gid] : 0;
  }
  for (let g = 0; g < 1000; g++) {
      const idx = MAX_ENTITIES + g;
      iPos[idx*2] = groupWarehouseX[g]; iPos[idx*2+1] = groupWarehouseY[g];
      iGrp[idx] = g; iSta[idx] = 0; iTra[idx] = 0; iArc[idx] = 4;
  }

  const setup = (b: WebGLBuffer, d: Float32Array, l: number, s: number) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(l, 1); };
  setup(vboPos, iPos, 0, 2); setup(vboGrp, iGrp, 1, 1); setup(vboSta, iSta, 2, 1); setup(vboArc, iArc, 3, 1); setup(vboTra, iTra, 4, 1);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, MAX_ENTITIES + 1000);
  gl.vertexAttribDivisor(0, 0); gl.vertexAttribDivisor(1, 0); gl.vertexAttribDivisor(2, 0); gl.vertexAttribDivisor(3, 0); gl.vertexAttribDivisor(4, 0);

  // Render magic bursts
  if (activeBursts.length > 0) {
    gl.useProgram(lineProg);
    gl.uniform2f(uResLine, canvas.width, canvas.height);
    gl.uniform4f(uCamLine, cameraX, cameraY, zoomLevel, 0);
    gl.uniform3f(uColLine, 1.0, 0.0, 1.0); // Magenta
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    
    const lineData = new Float32Array(activeBursts.length * 4);
    for (let i = 0; i < activeBursts.length; i++) {
      const b = activeBursts[i];
      lineData[i*4] = b.fromX; lineData[i*4+1] = b.fromY;
      lineData[i*4+2] = b.toX; lineData[i*4+3] = b.toY;
      b.frames--;
    }
    gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, activeBursts.length * 2);
    activeBursts = activeBursts.filter(b => b.frames > 0);
  }

  if (selectedEntityId !== -1) updateInspector();
}

function updateInspector() {
  if (selectedEntityId === -1) return;
  inspectId.textContent = selectedEntityId.toString(); inspectHealth.textContent = health[selectedEntityId].toString();
  inspectMoney.textContent = money[selectedEntityId].toString();
  const s = state[selectedEntityId], names = ["Idle", "Harvest", "Flee", "Combat", "Return", "Dead", "Trading", "Reporting"];
  inspectState.textContent = names[s] || "??"; inspectInventory.textContent = entityInventory[selectedEntityId].toString();
  const groups = []; for (let i = 0; i < 8; i++) { const g = groupAffiliations[selectedEntityId * 8 + i]; if (g !== -1) groups.push(g); }
  inspectGroups.textContent = groups.join(", ");
  const pg = groupAffiliations[selectedEntityId * 8];
  if (pg !== -1 && groupRelationsMatrix) {
    const hostiles = []; for (let g = 0; g < 50; g++) { if (g === pg) continue; const rel = groupRelationsMatrix[pg * MAX_GROUPS + g]; if (rel < 0) hostiles.push({ id: g, score: rel }); }
    hostiles.sort((a, b) => a.score - b.score); inspectHostility.textContent = hostiles.slice(0, 3).map(h => `G${h.id}:${h.score}`).join(", ") || "None";
  }
}

let isPanning = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', (e) => { if (e.button === 2 || e.button === 0) { isPanning = true; lastX = e.clientX; lastY = e.clientY; } });
window.addEventListener('mousemove', (e) => {
  if (isPanning) { cameraX -= (e.clientX - lastX) / zoomLevel; cameraY -= (e.clientY - lastY) / zoomLevel; lastX = e.clientX; lastY = e.clientY; isFollowing = false; render(); }
});
window.addEventListener('mouseup', () => isPanning = false);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); const r = canvas.getBoundingClientRect(), mx = (e.clientX - r.left) * (canvas.width / r.width), my = (e.clientY - r.top) * (canvas.height / r.height);
  const wmx = mx / zoomLevel + cameraX, wmy = my / zoomLevel + cameraY;
  zoomLevel *= (e.deltaY > 0 ? 0.9 : 1.1); zoomLevel = Math.max(0.1, Math.min(zoomLevel, 50));
  cameraX = wmx - mx / zoomLevel; cameraY = wmy - my / zoomLevel; render();
}, { passive: false });
canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect(), mx = (e.clientX - r.left) * (canvas.width / r.width), my = (e.clientY - r.top) * (canvas.height / r.height);
    const wx = mx / zoomLevel + cameraX, wy = my / zoomLevel + cameraY;
    workers[0].postMessage({ type: "FIND_ENTITY", payload: { x: wx, y: wy, radius: 10 / zoomLevel } });
});

btnToggleLoop.addEventListener('click', () => { isLooping = !isLooping; btnToggleLoop.textContent = isLooping ? "Pause Loop" : "Start Loop"; if (isLooping && !isTickPending) { isTickPending = true; workersFinished = 0; lastTickStartTime = performance.now(); workers.forEach(w => w.postMessage({ type: "TICK" })); } });
btnSingleStep.addEventListener('click', () => { if (!isLooping && !isTickPending) { isTickPending = true; workersFinished = 0; lastTickStartTime = performance.now(); workers.forEach(w => w.postMessage({ type: "TICK" })); } });

const btnTerritoryToggle = document.getElementById('btn-territory-toggle') as HTMLButtonElement;
btnTerritoryToggle?.addEventListener('click', () => { showTerritory = !showTerritory; btnTerritoryToggle.textContent = showTerritory ? "Hide Political Map" : "Show Political Map"; if (!isLooping) render(); });

saveBtn.addEventListener('click', async () => {
  workers.forEach(w => w.postMessage({ type: "PAUSE_SIM" }));
  const buffers = [
    positionX, positionY, _velocityX, _velocityY, health, money, state, groupAffiliations,
    groupPopulationCount, groupTotalWealth, entityInventory,
    groupRelationsMatrix, groupVisualArchetypes, traitBitmask,
    mana, carriedIntelEntityId, carriedIntelX, carriedIntelY,
    worldMap, groupWarehouseX, groupWarehouseY, ruleRegistry, groupMagicFrequency,
    influenceMap, territoryOwnerMap, logicBytecode
  ];
  let sz = 0; for (const b of buffers) sz += b.byteLength;
  const buf = new Uint8Array(16 + sz), v = new DataView(buf.buffer);
  new TextEncoder().encodeInto("SIM1", buf.subarray(0, 4)); v.setUint32(4, 1, true); v.setUint32(8, MAX_ENTITIES, true); v.setUint32(12, 16 + sz, true);
  let off = 16; for (const b of buffers) { buf.set(new Uint8Array(b.buffer), off); off += b.byteLength; }
  const path = await save({ filters: [{ name: 'Sim', extensions: ['bin'] }], defaultPath: `world.bin` });
  if (path) await writeFile(path, buf); workers.forEach(w => w.postMessage({ type: "RESUME_SIM" }));
});

loadBtn.addEventListener('click', async () => {
  const path = await open({ multiple: false }); if (!path || Array.isArray(path)) return;
  workers.forEach(w => w.postMessage({ type: "PAUSE_SIM" })); const data = await readFile(path);
  if (new TextDecoder().decode(data.subarray(0, 4)) !== "SIM1") return;
  const buffers = [
    positionX, positionY, _velocityX, _velocityY, health, money, state, groupAffiliations,
    groupPopulationCount, groupTotalWealth, entityInventory,
    groupRelationsMatrix, groupVisualArchetypes, traitBitmask,
    mana, carriedIntelEntityId, carriedIntelX, carriedIntelY,
    worldMap, groupWarehouseX, groupWarehouseY, ruleRegistry, groupMagicFrequency,
    influenceMap, territoryOwnerMap, logicBytecode
  ];
  let off = 16; for (const b of buffers) { new Uint8Array(b.buffer).set(data.subarray(off, off + b.byteLength)); off += b.byteLength; }
  workers.forEach(w => { w.postMessage({ type: "SYNC_TICK", tickCount: 0 }); w.postMessage({ type: "RESUME_SIM" }); });
});
btnNationCommand.addEventListener('click', () => { workers.forEach(w => w.postMessage({ type: "GROUP_COMMAND", payload: { groupId: 5, commandState: 3, targetX: 800, targetY: 600 } })); });
btnArmyCommand.addEventListener('click', () => { workers.forEach(w => w.postMessage({ type: "GROUP_COMMAND", payload: { groupId: 25, commandState: 2, targetX: 100, targetY: 100 } })); });
btnFollow.addEventListener('click', () => { isFollowing = !isFollowing; btnFollow.textContent = isFollowing ? "Unfollow" : "Follow"; });
btnClearInspect.addEventListener('click', () => { selectedEntityId = -1; isFollowing = false; inspectorPanel.style.display = 'none'; });

workers[0].postMessage({ type: "INIT", payload: { quadrantIndex: 0 } });
