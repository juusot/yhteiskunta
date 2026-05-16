// src/main.tsx
import { createRoot } from 'react-dom/client';
import React from 'react';
import { App } from './App';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';
import { MAX_ENTITIES, MAX_GROUPS, WORLD_MAP_COLS as MAP_COLS, WORLD_MAP_ROWS as MAP_ROWS } from './simulation/constants';

const workers: Worker[] = [];
for (let i = 0; i < 4; i++) {
  workers.push(new Worker(new URL('./simulationWorker.ts', import.meta.url), { type: 'module' }));
}

const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
const btnToggleLoop = document.getElementById('btn-toggle-loop') as HTMLButtonElement;
const btnSingleStep = document.getElementById('btn-single-step') as HTMLButtonElement;
const btnTerritoryToggle = document.getElementById('btn-territory-toggle') as HTMLButtonElement;
const canvas = document.getElementById('simCanvas') as HTMLCanvasElement;

const gl = canvas.getContext('webgl2', { alpha: false, antialias: true })!;

// --- Shaders ---
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
    if (v_type == 1.0) outColor = vec4(0.9, 0.9, 0.7, 1.0);
    else if (v_type == 2.0) outColor = vec4(0.5, 0.5, 0.5, 1.0);
    else outColor = vec4(1.0, 1.0, 0.9, 1.0);
}`;

const INF_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_owner;
layout(location = 2) in float a_strength;
uniform vec2 u_resolution;
uniform vec4 u_camera;
out float v_owner;
out float v_strength;
void main() {
    vec2 worldPos = vec2(float(gl_InstanceID % 160), float(gl_InstanceID / 160)) * 10.0;
    vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;
    gl_Position = vec4(clipPos + (a_pos * 10.0 * u_camera.z / u_resolution), 0.0, 1.0);
    v_owner = a_owner;
    v_strength = a_strength;
}`;

const INF_FS = `#version 300 es
precision highp float;
in float v_owner;
in float v_strength;
out vec4 outColor;
void main() {
    if (v_owner == -1.0 || v_strength < 0.01) discard;
    vec3 color = vec3(1.0, 1.0, 1.0);
    if (v_owner == 0.0) color = vec3(1.0, 1.0, 0.0);
    else if (v_owner == 1.0) color = vec3(1.0, 0.0, 0.0);
    else if (v_owner == 2.0) color = vec3(0.0, 0.0, 1.0);
    else if (v_owner == 3.0) color = vec3(1.0, 0.0, 1.0);
    outColor = vec4(color, v_strength * 0.3);
}`;

const ENTITY_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float i_posX;
layout(location = 2) in float i_posY;
layout(location = 3) in float i_trait;
layout(location = 4) in float i_group;
layout(location = 5) in float i_health;
uniform vec2 u_resolution;
uniform vec4 u_camera;
out float v_type;
out float v_group;
out float v_health;
void main() {
    vec2 worldPos = vec2(i_posX, i_posY);
    vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;
    
    // Trait bitmask bit 0 is tree
    bool isTree = (uint(i_trait) & 1u) != 0u;
    float size = isTree ? 4.0 : 2.0; 
    
    gl_Position = vec4(clipPos + (a_pos * size * u_camera.z / u_resolution), 0.0, 1.0);
    v_type = i_trait;
    v_group = i_group;
    v_health = i_health;
}`;

const ENTITY_FS = `#version 300 es
precision highp float;
in float v_type;
in float v_group;
in float v_health;
out vec4 outColor;
void main() {
    if (v_health <= 0.0) discard;
    vec3 color = vec3(0.0, 0.0, 0.0);
    if ((uint(v_type) & 1u) != 0u) color = vec3(0.2, 0.5, 0.2);
    else {
      if (v_group == 0.0) color = vec3(1.0, 1.0, 0.0);
      else if (v_group == 1.0) color = vec3(1.0, 0.0, 0.0);
      else if (v_group == 2.0) color = vec3(0.0, 0.0, 1.0);
      else if (v_group == 3.0) color = vec3(1.0, 0.0, 1.0);
      else color = vec3(0.5, 0.5, 0.5);
    }
    outColor = vec4(color, 1.0);
}`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!);
    return s;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
    const p = gl.createProgram()!;
    gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)!);
    return p;
}

const tileProg = createProgram(gl, TILE_VS, TILE_FS);
const infProg = createProgram(gl, INF_VS, INF_FS);
const entProg = createProgram(gl, ENTITY_VS, ENTITY_FS);

const quadData = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const quadVbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

const tileVao = gl.createVertexArray();
gl.bindVertexArray(tileVao);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

const infVao = gl.createVertexArray();
gl.bindVertexArray(infVao);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

const entVao = gl.createVertexArray();
gl.bindVertexArray(entVao);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// Shared Simulation State
let positionX: Float32Array, positionY: Float32Array, traitBitmask: Uint32Array, groupAffiliations: Int32Array;
let health: Int32Array, money: Int32Array, state: Uint8Array, entityInventory: Int16Array;
let worldMap: Uint8Array, territoryOwnerMap: Int32Array, influenceMap: Int16Array, workerSync: Int32Array;
let ruleRegistry: Int32Array, logicBytecode: Int32Array, groupPopulation: Int32Array, groupTotalWealth: Int32Array;

const instPosXVbo = gl.createBuffer();
const instPosYVbo = gl.createBuffer();
const instTypeVbo = gl.createBuffer();
const instGroupVbo = gl.createBuffer();
const instHealthVbo = gl.createBuffer();
const tileTypeVbo = gl.createBuffer();
const infOwnerVbo = gl.createBuffer();
const infStrengthVbo = gl.createBuffer();

let isLooping = false; // Start paused to prevent race on INIT
let targetTPS = 60; // Default to 1x (60 TPS)
let showPoliticalMap = true;
let cameraX = 0, cameraY = 0, zoom = 1.0;
let inspectEntityId = -1;
let followEntityId = -1;
let tickCount = 0;
let lastTickDuration = 0;
let avgTickDuration = 0;
let tickTimes: number[] = [];
let chronicle: string[] = [];
let isTickInProgress = false;
let completedWorkersThisTick = 0;
let lastTickStartTime = 0;

function addChronicle(msg: string) {
    chronicle.unshift(`[Tick ${tickCount}] ${msg}`);
    if (chronicle.length > 100) chronicle.pop();
}

const speedBtns = [
    document.getElementById('btn-speed-1') as HTMLButtonElement,
    document.getElementById('btn-speed-2') as HTMLButtonElement,
    document.getElementById('btn-speed-4') as HTMLButtonElement,
    document.getElementById('btn-speed-max') as HTMLButtonElement,
];

function setSpeed(tps: number, btnIdx: number) {
    targetTPS = tps;
    speedBtns.forEach((b, i) => {
        if (i === btnIdx) b.classList.add('active');
        else b.classList.remove('active');
    });
}

speedBtns[0].onclick = () => setSpeed(60, 0);
speedBtns[1].onclick = () => setSpeed(120, 1);
speedBtns[2].onclick = () => setSpeed(240, 2);
speedBtns[3].onclick = () => setSpeed(0, 3);

window.addEventListener('wheel', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const oldZoom = zoom;
    if (e.deltaY < 0) zoom *= 1.1; else zoom /= 1.1;
    zoom = Math.max(0.1, Math.min(20.0, zoom));

    cameraX += mx / oldZoom - mx / zoom;
    cameraY += my / oldZoom - my / zoom;
}, { passive: true });

let isDragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', (e) => {
    if (isDragging) { cameraX -= (e.clientX - lastX) / zoom; cameraY -= (e.clientY - lastY) / zoom; lastX = e.clientX; lastY = e.clientY; }
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const worldX = cameraX + ((e.clientX - rect.left) * scaleX) / zoom;
  const worldY = cameraY + ((e.clientY - rect.top) * scaleY) / zoom;
  
  if ((window as any).brushState?.active) {
    workers.forEach(w => w.postMessage({ type: "PAINT_ENTITIES", payload: { x: worldX, y: worldY, radius: 50, groupId: (window as any).brushState.groupId, traitBitmask: (window as any).brushState.trait } }));
  } else {
    workers[0].postMessage({ type: "FIND_ENTITY", payload: { x: worldX, y: worldY, radius: 20 } });
  }
});

btnToggleLoop.onclick = () => { 
  isLooping = !isLooping; 
  btnToggleLoop.textContent = isLooping ? "Pause" : "Resume"; 
  if (isLooping) startTick();
};

btnTerritoryToggle.onclick = () => { showPoliticalMap = !showPoliticalMap; };
btnSingleStep.onclick = () => { if (!isTickInProgress) startTick(); };

function startTick() {
    if (!workerSync || isTickInProgress) return;
    isTickInProgress = true;
    lastTickStartTime = performance.now();
    completedWorkersThisTick = 0;
    workerSync.fill(0);
    workers.forEach(w => w.postMessage({ type: "TICK" }));
}

const tileTypeBuffer = new Float32Array(MAP_COLS * MAP_ROWS);
const infOwnerBuffer = new Float32Array(MAP_COLS * MAP_ROWS);
const infStrengthBuffer = new Float32Array(MAP_COLS * MAP_ROWS);

let lastFrameTime = performance.now();

function render() {
    if (!positionX) return requestAnimationFrame(render);
    
    if (followEntityId !== -1 && positionX[followEntityId] > -1000) {
      cameraX = positionX[followEntityId] - (canvas.width / 2) / zoom;
      cameraY = positionY[followEntityId] - (canvas.height / 2) / zoom;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1, 1, 0.9, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const uCam = [cameraX, cameraY, zoom, 0];
    const uRes = [canvas.width, canvas.height];

    // Tiles
    gl.useProgram(tileProg);
    gl.uniform2fv(gl.getUniformLocation(tileProg, 'u_resolution'), uRes);
    gl.uniform4fv(gl.getUniformLocation(tileProg, 'u_camera'), uCam);
    for(let i=0; i<MAP_COLS*MAP_ROWS; i++) tileTypeBuffer[i] = worldMap[i];
    gl.bindBuffer(gl.ARRAY_BUFFER, tileTypeVbo); gl.bufferData(gl.ARRAY_BUFFER, tileTypeBuffer, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(tileVao); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAP_COLS * MAP_ROWS);

    if (showPoliticalMap) {
      gl.useProgram(infProg);
      gl.uniform2fv(gl.getUniformLocation(infProg, 'u_resolution'), uRes);
      gl.uniform4fv(gl.getUniformLocation(infProg, 'u_camera'), uCam);
      for(let i=0; i<MAP_COLS*MAP_ROWS; i++) { infOwnerBuffer[i] = territoryOwnerMap[i]; infStrengthBuffer[i] = influenceMap[i] / 1000.0; }
      gl.bindBuffer(gl.ARRAY_BUFFER, infOwnerVbo); gl.bufferData(gl.ARRAY_BUFFER, infOwnerBuffer, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(infVao); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, infStrengthVbo); gl.bufferData(gl.ARRAY_BUFFER, infStrengthBuffer, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAP_COLS * MAP_ROWS);
    }

    // Entities
    gl.useProgram(entProg);
    gl.uniform2fv(gl.getUniformLocation(entProg, 'u_resolution'), uRes);
    gl.uniform4fv(gl.getUniformLocation(entProg, 'u_camera'), uCam);
    
    const renderCount = MAX_ENTITIES; 
    
    gl.bindVertexArray(entVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instPosXVbo); gl.bufferData(gl.ARRAY_BUFFER, positionX, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, instPosYVbo); gl.bufferData(gl.ARRAY_BUFFER, positionY, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, instTypeVbo); gl.bufferData(gl.ARRAY_BUFFER, traitBitmask, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.UNSIGNED_INT, false, 0, 0); gl.vertexAttribDivisor(3, 1);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, instGroupVbo); gl.bufferData(gl.ARRAY_BUFFER, groupAffiliations, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.INT, false, 8 * 4, 0); gl.vertexAttribDivisor(4, 1);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, instHealthVbo); gl.bufferData(gl.ARRAY_BUFFER, health, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.INT, false, 0, 0); gl.vertexAttribDivisor(5, 1);
    
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, renderCount);

    requestAnimationFrame(render);
}

const root = createRoot(document.getElementById('root')!);
function syncReact() {
    const inspectEntity = inspectEntityId === -1 ? null : {
        id: inspectEntityId,
        health: health[inspectEntityId],
        money: money[inspectEntityId],
        state: state[inspectEntityId],
        inventory: entityInventory[inspectEntityId],
        groups: Array.from(groupAffiliations.slice(inspectEntityId * 8, inspectEntityId * 8 + 8)).filter(g => g !== -1)
    };

    root.render(
        <App 
            ruleRegistry={ruleRegistry}
            logicBytecode={logicBytecode}
            groupPopulation={groupPopulation}
            groupTotalWealth={groupTotalWealth}
            tickCount={tickCount}
            lastTickTime={lastTickDuration}
            avgTickTime={avgTickDuration}
            inspectEntity={inspectEntity}
            chronicle={chronicle}
            onFollow={() => { followEntityId = inspectEntityId; }}
            onClearInspect={() => { inspectEntityId = -1; followEntityId = -1; }}
        />
    );
}

workers.forEach((w, i) => {
  w.onmessage = (e) => {
    const { type, payload, buffers } = e.data;
    if (type === "INITIALIZED") {
      positionX = new Float32Array(buffers.positionX);
      positionY = new Float32Array(buffers.positionY);
      traitBitmask = new Uint32Array(buffers.traitBitmask);
      groupAffiliations = new Int32Array(buffers.groupAffiliations);
      health = new Int32Array(buffers.health);
      money = new Int32Array(buffers.money);
      state = new Uint8Array(buffers.state);
      entityInventory = new Int16Array(buffers.entityInventory);
      worldMap = new Uint8Array(buffers.worldMap);
      territoryOwnerMap = new Int32Array(buffers.territoryOwnerMap);
      influenceMap = new Int16Array(buffers.influenceMap);
      workerSync = new Int32Array(buffers.workerSync);
      ruleRegistry = new Int32Array(buffers.ruleRegistry);
      logicBytecode = new Int32Array(buffers.logicBytecode);
      groupPopulation = new Int32Array(buffers.groupPopulationCount);
      groupTotalWealth = new Int32Array(buffers.groupTotalWealth);
      
      workers.slice(1).forEach((sw, si) => sw.postMessage({ type: "INIT", payload: { quadrantIndex: si + 1, buffers } }));
      requestAnimationFrame(render);
      setInterval(syncReact, 200); // Update UI 5 times a second
    }
    if (type === "TICK_COMPLETE") {
      completedWorkersThisTick++;
      if (completedWorkersThisTick === 4) {
          tickCount++;
          const now = performance.now();
          const dt = now - lastTickStartTime;
          lastTickDuration = dt;
          tickTimes.push(dt);
          if (tickTimes.length > 60) tickTimes.shift();
          avgTickDuration = tickTimes.reduce((a, b) => a + b, 0) / tickTimes.length;
          
          isTickInProgress = false;
          if (isLooping) {
              if (targetTPS === 0) {
                  startTick();
              } else {
                  const targetInterval = 1000 / targetTPS;
                  const elapsed = now - lastTickStartTime;
                  const delay = Math.max(0, targetInterval - elapsed);
                  if (delay === 0) startTick();
                  else setTimeout(startTick, delay);
              }
          }
      }
    }
    if (type === "ENTITY_FOUND") { inspectEntityId = payload.id; }
    if (type === "MAGIC_BURST") { addChronicle(`Magic Burst from Group ${groupAffiliations[payload.entityId * 8] || '?'}`); }
    if (type === "SAVE_REQUEST") handleSave();
  };
});

workers[0].postMessage({ type: "INIT", payload: { quadrantIndex: 0 } });

async function handleSave() {
  const path = await save({ filters: [{ name: 'Sim', extensions: ['bin'] }] });
  if (!path) return;
  const header = new TextEncoder().encode("SIM1");
  const data = new Uint8Array(20 * 1024 * 1024);
  data.set(header, 0);
  await writeFile(path, data);
}

loadBtn.onclick = async () => {
  const file = await open({ filters: [{ name: 'Sim', extensions: ['bin'] }] });
  if (!file) return;
  const data = await readFile(file.path);
};
