// src/main.tsx
import { createRoot } from 'react-dom/client';
import React from 'react';
import { App } from './App';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';
import { MAX_ENTITIES, MAX_GROUPS, WORLD_MAP_COLS as MAP_COLS, WORLD_MAP_ROWS as MAP_ROWS, MAX_BUILDINGS, MAX_VEHICLES } from './simulation/constants';

console.log("Main script loading...");

function createShader(ctx: WebGL2RenderingContext, type: number, source: string) {
    const s = ctx.createShader(type)!;
    ctx.shaderSource(s, source);
    ctx.compileShader(s);
    if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
        const info = ctx.getShaderInfoLog(s);
        console.error("Shader compilation failed:", info);
        throw new Error(info!);
    }
    return s;
}

function createProgram(ctx: WebGL2RenderingContext, vs: string, fs: string) {
    const p = ctx.createProgram()!;
    ctx.attachShader(p, createShader(ctx, ctx.VERTEX_SHADER, vs));
    ctx.attachShader(p, createShader(ctx, ctx.FRAGMENT_SHADER, fs));
    ctx.linkProgram(p);
    if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) {
        const info = ctx.getProgramInfoLog(p);
        console.error("Program linking failed:", info);
        throw new Error(info!);
    }
    return p;
}

window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, checking capabilities...");
    
    if (typeof SharedArrayBuffer === 'undefined') {
        const msg = "SharedArrayBuffer is not supported. This game requires a cross-origin isolated environment.";
        console.error(msg);
        alert(msg);
        return;
    }

    const canvas = document.getElementById('simCanvas') as HTMLCanvasElement;
    if (!canvas) { console.error("Canvas #simCanvas not found!"); return; }
    
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true }) as any;
    if (!gl) {
        console.error("WebGL 2 not supported!");
        alert("WebGL 2 not supported. On Linux, try --ignore-gpu-blocklist in your browser, or check your GPU drivers.");
        return;
    }
    console.log("WebGL 2 context obtained.");

    const workers: Worker[] = [];
    try {
        console.log("Spawning workers...");
        for (let i = 0; i < 4; i++) {
            workers.push(new Worker(new URL('./simulationWorker.ts', import.meta.url), { type: 'module' }));
        }
    } catch (e) {
        console.error("Failed to spawn workers:", e);
        alert("Failed to spawn workers. Your browser might not support ES module workers.");
        return;
    }

    const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
    const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
    const btnToggleLoop = document.getElementById('btn-toggle-loop') as HTMLButtonElement;
    btnToggleLoop.textContent = "⏸";
    const btnTerritoryToggle = document.getElementById('btn-territory-toggle') as HTMLButtonElement;
    const gameTimeDisplay = document.getElementById('gameTimeDisplay') as HTMLDivElement;
    const btnUiToggle = document.getElementById('btn-ui-toggle') as HTMLButtonElement;
    const btnUiClose = document.getElementById('btn-ui-close') as HTMLButtonElement;
    const uiPopup = document.getElementById('ui-popup') as HTMLDivElement;

    // UI Popup toggle
    btnUiToggle.onclick = () => { uiPopup.classList.add('visible'); };
    btnUiClose.onclick = () => { uiPopup.classList.remove('visible'); };
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') uiPopup.classList.remove('visible');
    });

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
        if (v_type == 1.0) outColor = vec4(0.8, 0.9, 0.7, 1.0); // Forest
        else if (v_type == 2.0) outColor = vec4(0.5, 0.7, 1.0, 1.0); // Water
        else if (v_type == 3.0) outColor = vec4(0.4, 0.4, 0.4, 1.0); // Mountain
        else outColor = vec4(1.0, 1.0, 0.9, 1.0); // Grass
    }`;

    const INF_VS = `#version 300 es
    layout(location = 0) in vec2 a_pos;
    layout(location = 1) in float a_owner;
    layout(location = 2) in float a_strength;
    layout(location = 3) in float a_border;
    uniform vec2 u_resolution;
    uniform vec4 u_camera;
    uniform float u_zoom;
    out float v_owner;
    out float v_strength;
    out float v_border;
    out float v_zoom;
    out vec2 v_localPos;
    void main() {
        vec2 worldPos = vec2(float(gl_InstanceID % 160), float(gl_InstanceID / 160)) * 10.0;
        vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
        vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
        clipPos.y = -clipPos.y;
        gl_Position = vec4(clipPos + (a_pos * 10.0 * u_camera.z / u_resolution), 0.0, 1.0);
        v_owner = a_owner;
        v_strength = a_strength;
        v_border = a_border;
        v_zoom = u_zoom;
        v_localPos = a_pos + vec2(0.5);
    }`;

    const INF_FS = `#version 300 es
    precision highp float;
    in float v_owner;
    in float v_strength;
    in float v_border;
    in float v_zoom;
    in vec2 v_localPos;
    out vec4 outColor;
    void main() {
        if (v_owner == -1.0 || v_strength < 0.05) discard;
        
        // Distinct colors for each nation
        vec3 color;
        if (v_owner == 0.0) color = vec3(0.9, 0.2, 0.2);      // Red
        else if (v_owner == 1.0) color = vec3(0.2, 0.4, 0.9); // Blue  
        else if (v_owner == 2.0) color = vec3(0.2, 0.7, 0.2); // Green
        else if (v_owner == 3.0) color = vec3(0.9, 0.7, 0.1); // Yellow
        else color = vec3(0.5, 0.5, 0.5);
        
        // Fade fill when zoomed in
        float alpha = 0.35;
        if (v_zoom > 2.0) {
            alpha *= (2.0 / v_zoom);
            if (alpha < 0.05) discard;
        }
        
        // Hide border at high zoom (close-up view)
        bool showBorder = v_zoom < 4.0;
        
        // Draw darker border where different nations meet
        if (showBorder && v_border > 0.5) {
            color *= 0.4;
            alpha = 0.9;
        }
        
        outColor = vec4(color, alpha);
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
    out float v_type; out float v_group; out float v_health; out vec2 v_uv;
    void main() {
        vec2 worldPos = vec2(i_posX, i_posY);
        vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
        vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
        clipPos.y = -clipPos.y;
        
        uint traits = uint(i_trait);
        float size = 3.0; // Units
        if ((traits & 1u) != 0u) size = 6.0; // Trees are bigger
        else if ((traits & 2u) != 0u || (traits & 4u) != 0u) size = 3.5; // Gold/Bush
        else if ((traits & 256u) != 0u) size = 4.0; // Loot
        
        gl_Position = vec4(clipPos + (a_pos * size * u_camera.z / u_resolution), 0.0, 1.0);
        v_type = i_trait; v_group = i_group; v_health = i_health; v_uv = a_pos;
    }`;

    const ENTITY_FS = `#version 300 es
    precision highp float;
    in float v_type; in float v_group; in float v_health; in vec2 v_uv;
    out vec4 outColor;
    void main() {
        if (v_health <= 0.0) discard;
        uint traits = uint(v_type);
        bool isTree = (traits & 1u) != 0u;
        bool isGold = (traits & 2u) != 0u;
        bool isBush = (traits & 4u) != 0u;
        bool isLoot = (traits & 256u) != 0u;
        bool isUnit = !isTree && !isGold && !isBush && !isLoot;

        vec3 color = vec3(0.0);
        if (isTree) {
            bool trunk = abs(v_uv.x) < 0.2 && v_uv.y < -0.3;
            float leafWidth = 1.0 - (v_uv.y + 0.3) / 1.3;
            bool leaves = v_uv.y >= -0.3 && abs(v_uv.x) < leafWidth;
            if (!trunk && !leaves) discard;
            color = trunk ? vec3(0.4, 0.2, 0.1) : vec3(0.1, 0.4, 0.1);
        } else if (isGold) {
            if (abs(v_uv.x) + abs(v_uv.y) > 1.0) discard;
            color = vec3(1.0, 0.8, 0.0);
        } else if (isBush) {
            if (length(v_uv) > 0.9) discard;
            color = vec3(0.2, 0.5, 0.2);
            if (sin(v_uv.x * 8.0) * cos(v_uv.y * 8.0) > 0.1) color *= 0.8;
        } else if (isLoot) {
            if (abs(v_uv.x) > 0.7 || abs(v_uv.y) > 0.7) discard;
            color = vec3(0.7, 0.3, 0.0);
        } else {
            // Units (Characters/Couriers/Scouts) - ALL CIRCLES
            float dist = length(v_uv);
            if (dist > 1.0) discard;
            if (v_group == 0.0) color = vec3(1.0, 1.0, 0.0);
            else if (v_group == 1.0) color = vec3(1.0, 0.0, 0.0);
            else if (v_group == 2.0) color = vec3(0.0, 0.0, 1.0);
            else if (v_group == 3.0) color = vec3(1.0, 0.0, 1.0);
            else color = vec3(0.5, 0.5, 0.5);
            if (dist < 0.3) color *= 0.5; // Inner dot for "unit" feel
        }
        outColor = vec4(color, 1.0);
    }`;

    const BLD_VS = `#version 300 es
    layout(location = 0) in vec2 a_pos;
    layout(location = 1) in float i_posX;
    layout(location = 2) in float i_posY;
    layout(location = 3) in float i_type;
    layout(location = 4) in float i_group;
    layout(location = 5) in float i_health;
    uniform vec2 u_resolution;
    uniform vec4 u_camera;
    out float v_type; out float v_group; out float v_health; out vec2 v_pos;
    void main() {
        vec2 worldPos = vec2(i_posX, i_posY);
        vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
        vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
        clipPos.y = -clipPos.y;
        float size = (i_type == 1.0) ? 16.0 : 10.0; // Warehouse is slightly larger
        gl_Position = vec4(clipPos + (a_pos * size * u_camera.z / u_resolution), 0.0, 1.0);
        v_type = i_type; v_group = i_group; v_health = i_health; v_pos = a_pos;
    }`;

    const BLD_FS = `#version 300 es
    precision highp float;
    in float v_type; in float v_group; in float v_health; in vec2 v_pos;
    out vec4 outColor;
    void main() {
        if (v_health <= 0.0 || v_type == 0.0) discard;
        vec3 color = vec3(0.0);
        
        vec3 groupColor = vec3(0.4);
        if (v_group == 0.0) groupColor = vec3(0.8, 0.8, 0.0);
        else if (v_group == 1.0) groupColor = vec3(0.8, 0.0, 0.0);
        else if (v_group == 2.0) groupColor = vec3(0.0, 0.0, 0.8);
        else if (v_group == 3.0) groupColor = vec3(0.8, 0.0, 0.8);

        if (v_type == 2.0) { // House
            bool isRoof = v_pos.y > 0.2;
            if (isRoof) {
                float roofWidth = 1.0 - (v_pos.y - 0.2) / 0.8;
                if (abs(v_pos.x) > roofWidth) discard;
                color = groupColor;
            } else {
                color = vec3(0.6, 0.5, 0.4);
                bool isDoor = abs(v_pos.x) < 0.2 && v_pos.y < -0.4;
                bool isWindow = v_pos.x > 0.4 && v_pos.y > -0.4 && v_pos.y < 0.0;
                if (isDoor || isWindow) color *= 0.3;
            }
        } else if (v_type == 1.0) { // Castle / Warehouse
            bool isTop = v_pos.y > 0.5;
            if (isTop) {
                // Crenellations (teeth)
                float teeth = fract((v_pos.x + 1.0) * 3.5); 
                if (teeth > 0.5 && v_pos.y > 0.75) discard;
                color = groupColor;
            } else {
                color = vec3(0.55, 0.55, 0.55); // Grey stone
                bool isGate = abs(v_pos.x) < 0.25 && v_pos.y < -0.2;
                if (isGate) color *= 0.2; // Dark gate
                
                // Add two side banners in group colors
                bool isBanner = abs(abs(v_pos.x) - 0.6) < 0.15 && v_pos.y > -0.1 && v_pos.y < 0.4;
                if (isBanner) color = groupColor * 0.8;
            }
        } else if (v_type == 5.0) { // Field
            color = vec3(0.8, 0.7, 0.2); // Wheat color
            bool isRow = fract((v_pos.x + v_pos.y) * 4.0) > 0.5;
            if (isRow) color *= 0.8;
        } else if (v_type == 3.0 || v_type == 4.0) { // Tower or Wall
            color = vec3(0.5, 0.5, 0.5);
            if (v_type == 3.0 && abs(v_pos.x) > 0.6) discard; // Tower is tall and thin
            if (v_pos.y > 0.6 && fract((v_pos.x + 1.0) * 4.0) > 0.5) discard; // Crenellations
            if (v_type == 3.0 && v_pos.y > 0.4 && v_pos.y < 0.6) color = groupColor; // Tower band
        } else {
            color = vec3(0.3);
        }

        if (v_health < 1000.0) color *= 0.7; // Darken if damaged/constructing
        outColor = vec4(color, 1.0);
    }`;

    const VEH_VS = `#version 300 es
    layout(location = 0) in vec2 a_pos;
    layout(location = 1) in float i_posX;
    layout(location = 2) in float i_posY;
    layout(location = 3) in float i_type;
    layout(location = 4) in float i_group;
    uniform vec2 u_resolution;
    uniform vec4 u_camera;
    out float v_group;
    void main() {
        vec2 worldPos = vec2(i_posX, i_posY);
        vec2 screenPos = (worldPos - u_camera.xy) * u_camera.z;
        vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
        clipPos.y = -clipPos.y;
        gl_Position = vec4(clipPos + (a_pos * 4.0 * u_camera.z / u_resolution), 0.0, 1.0);
        v_group = i_group;
    }`;

    const VEH_FS = `#version 300 es
    precision highp float;
    in float v_group;
    out vec4 outColor;
    void main() { outColor = vec4(1.0, 1.0, 1.0, 1.0); }`;

    const tileProg = createProgram(gl, TILE_VS, TILE_FS);
    const infProg = createProgram(gl, INF_VS, INF_FS);
    const entProg = createProgram(gl, ENTITY_VS, ENTITY_FS);
    const bldProg = createProgram(gl, BLD_VS, BLD_FS);
    const vehProg = createProgram(gl, VEH_VS, VEH_FS);

    const quadData = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

    // Shared Simulation State
    let positionX: Float32Array, positionY: Float32Array, traitBitmask: Uint32Array, groupAffiliations: Int32Array;
    let health: Int32Array, money: Int32Array, state: Uint8Array, entityInventory: Int16Array;
    let worldMap: Uint8Array, territoryOwnerMap: Int32Array, influenceMap: Int16Array, workerSync: Int32Array;
    let ruleRegistry: Int32Array, logicBytecode: Int32Array, groupPopulation: Int32Array, groupTotalWealth: Int32Array, groupBuildingCount: Int32Array;
    let groupWood: Int32Array, groupGold: Int32Array, groupFood: Int32Array, groupMisc: Int32Array;
    let bldPositionX: Float32Array, bldPositionY: Float32Array, bldType: Uint8Array, bldHealth: Int32Array, bldOwnerGroup: Int32Array;
    let vehPositionX: Float32Array, vehPositionY: Float32Array, vehType: Uint8Array, vehOwnerGroup: Int32Array;

    // VAOs
    const tileVao = gl.createVertexArray(); gl.bindVertexArray(tileVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const infVao = gl.createVertexArray(); gl.bindVertexArray(infVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const entVao = gl.createVertexArray(); gl.bindVertexArray(entVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const bldVao = gl.createVertexArray(); gl.bindVertexArray(bldVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const vehVao = gl.createVertexArray(); gl.bindVertexArray(vehVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const instPosXVbo = gl.createBuffer(), instPosYVbo = gl.createBuffer(), instTypeVbo = gl.createBuffer(), instGroupVbo = gl.createBuffer(), instHealthVbo = gl.createBuffer();
    const bldPosXVbo = gl.createBuffer(), bldPosYVbo = gl.createBuffer(), bldTypeVbo = gl.createBuffer(), bldGroupVbo = gl.createBuffer(), bldHealthVbo = gl.createBuffer();
    const vehPosXVbo = gl.createBuffer(), vehPosYVbo = gl.createBuffer(), vehTypeVbo = gl.createBuffer(), vehGroupVbo = gl.createBuffer();
    const tileTypeVbo = gl.createBuffer(), infOwnerVbo = gl.createBuffer(), infStrengthVbo = gl.createBuffer(), infBorderVbo = gl.createBuffer();

    const tileTypeBuffer = new Float32Array(MAP_COLS * MAP_ROWS), infOwnerBuffer = new Float32Array(MAP_COLS * MAP_ROWS), infStrengthBuffer = new Float32Array(MAP_COLS * MAP_ROWS), infBorderBuffer = new Float32Array(MAP_COLS * MAP_ROWS);

    let isLooping = true, targetTPS = 60, showPoliticalMap = true;
    let cameraX = 0, cameraY = 0, zoom = 1.0;
    let inspectEntityId = -1, followEntityId = -1, tickCount = 0;
    let lastTickDuration = 0, avgTickDuration = 0, tickTimes: number[] = [], chronicle: string[] = [];
    let isTickInProgress = false, completedWorkersThisTick = 0, lastTickStartTime = 0;

    function addChronicle(msg: string) {
        chronicle.unshift(`[Tick ${tickCount}] ${msg}`);
        if (chronicle.length > 100) chronicle.pop();
    }

    const speedBtns = [
        document.getElementById('btn-speed-1') as HTMLButtonElement,
        document.getElementById('btn-speed-2') as HTMLButtonElement,
        document.getElementById('btn-speed-4') as HTMLButtonElement,
        document.getElementById('btn-speed-8') as HTMLButtonElement,
        document.getElementById('btn-speed-max') as HTMLButtonElement,
    ];

    function setSpeed(tps: number, btnIdx: number) {
        targetTPS = tps;
        speedBtns.forEach((b, i) => { if (i === btnIdx) b.classList.add('active'); else b.classList.remove('active'); });
    }

    speedBtns[0].onclick = () => setSpeed(60, 0);
    speedBtns[1].onclick = () => setSpeed(120, 1);
    speedBtns[2].onclick = () => setSpeed(240, 2);
    speedBtns[3].onclick = () => setSpeed(480, 3);  // 8x speed
    speedBtns[4].onclick = () => setSpeed(0, 4);

    window.addEventListener('wheel', (e) => {
        if (uiPopup.classList.contains('visible')) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;
        const oldZoom = zoom;
        if (e.deltaY < 0) zoom *= 1.1; else zoom /= 1.1;
        zoom = Math.max(0.1, Math.min(20.0, zoom));
        cameraX += mx / oldZoom - mx / zoom; cameraY += my / oldZoom - my / zoom;
    }, { passive: true });

    let isDragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('mousedown', (e) => { 
        if (uiPopup.classList.contains('visible')) return;
        isDragging = true; lastX = e.clientX; lastY = e.clientY; 
    });
    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('mousemove', (e) => {
        if (isDragging && !uiPopup.classList.contains('visible')) { cameraX -= (e.clientX - lastX) / zoom; cameraY -= (e.clientY - lastY) / zoom; lastX = e.clientX; lastY = e.clientY; }
    });

    canvas.addEventListener('click', (e) => {
      if (uiPopup.classList.contains('visible')) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      const worldX = cameraX + ((e.clientX - rect.left) * scaleX) / zoom;
      const worldY = cameraY + ((e.clientY - rect.top) * scaleY) / zoom;
      if ((window as any).brushState?.active) {
        workers.forEach(w => w.postMessage({ type: "PAINT_ENTITIES", payload: { x: worldX, y: worldY, radius: 50, groupId: (window as any).brushState.groupId, traitBitmask: (window as any).brushState.trait } }));
      } else {
        workers[0].postMessage({ type: "FIND_ENTITY", payload: { x: worldX, y: worldY, radius: 20 } });
      }
    });

    btnToggleLoop.onclick = () => { isLooping = !isLooping; btnToggleLoop.textContent = isLooping ? "⏸" : "▶"; if (isLooping) startTick(); };
    btnTerritoryToggle.onclick = () => { showPoliticalMap = !showPoliticalMap; };

    const startTick = () => {
        if (!workerSync || isTickInProgress) return;
        isTickInProgress = true;
        lastTickStartTime = performance.now();
        completedWorkersThisTick = 0;
        // Reset only the phase counts, leave other data
        Atomics.store(workerSync, 0, 0);
        Atomics.store(workerSync, 1, 0);
        Atomics.store(workerSync, 2, 0);
        workers.forEach(w => w.postMessage({ type: "TICK" }));
    };


    function render() {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.1, 0.1, 0.1, 1.0); // Dark Grey background
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (!positionX) return requestAnimationFrame(render);

        if (followEntityId !== -1 && positionX[followEntityId] > -1000) {
          cameraX = positionX[followEntityId] - (canvas.width / 2) / zoom;
          cameraY = positionY[followEntityId] - (canvas.height / 2) / zoom;
        }
        
        const uCam = [cameraX, cameraY, zoom, 0], uRes = [canvas.width, canvas.height];

        // ============================================================
        // RENDER LAYER 1: Background Terrain Tiles (worldMap)
        // Draw base terrain: grass, forest, water, mountains
        // ============================================================
        gl.useProgram(tileProg);
        gl.uniform2fv(gl.getUniformLocation(tileProg, 'u_resolution'), uRes); gl.uniform4fv(gl.getUniformLocation(tileProg, 'u_camera'), uCam);
        for(let i=0; i<MAP_COLS*MAP_ROWS; i++) tileTypeBuffer[i] = worldMap[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, tileTypeVbo); gl.bufferData(gl.ARRAY_BUFFER, tileTypeBuffer, gl.DYNAMIC_DRAW);
        gl.bindVertexArray(tileVao); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAP_COLS * MAP_ROWS);

        // ============================================================
        // RENDER LAYER 2: Influence Map Overlay (semi-transparent)
        // Political territory boundaries with alpha blending
        // ============================================================
        if (showPoliticalMap) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(infProg);
          gl.uniform2fv(gl.getUniformLocation(infProg, 'u_resolution'), uRes); gl.uniform4fv(gl.getUniformLocation(infProg, 'u_camera'), uCam);
          gl.uniform1f(gl.getUniformLocation(infProg, 'u_zoom'), zoom);
          
          // Compute borders: detect where ownership changes between neighbors
          const showBorders = false; // Temporarily disabled for testing
          for(let y=0; y<MAP_ROWS; y++) {
            for(let x=0; x<MAP_COLS; x++) {
              const i = y * MAP_COLS + x;
              const owner = territoryOwnerMap[i];
              let isBorder = 0;
              if (showBorders && owner !== -1) {
                // Check 4 neighbors
                if (x > 0 && territoryOwnerMap[i-1] !== owner) isBorder = 1;
                else if (x < MAP_COLS-1 && territoryOwnerMap[i+1] !== owner) isBorder = 1;
                else if (y > 0 && territoryOwnerMap[i-MAP_COLS] !== owner) isBorder = 1;
                else if (y < MAP_ROWS-1 && territoryOwnerMap[i+MAP_COLS] !== owner) isBorder = 1;
              }
              infBorderBuffer[i] = isBorder;
              infOwnerBuffer[i] = owner;
              infStrengthBuffer[i] = influenceMap[i] / 1000.0;
            }
          }
          
          gl.bindBuffer(gl.ARRAY_BUFFER, infOwnerVbo); gl.bufferData(gl.ARRAY_BUFFER, infOwnerBuffer, gl.DYNAMIC_DRAW);
          gl.bindVertexArray(infVao); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, infStrengthVbo); gl.bufferData(gl.ARRAY_BUFFER, infStrengthBuffer, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
          
          // Add border buffer
          gl.bindBuffer(gl.ARRAY_BUFFER, infBorderVbo); gl.bufferData(gl.ARRAY_BUFFER, infBorderBuffer, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(3, 1);
          
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAP_COLS * MAP_ROWS);
          gl.disable(gl.BLEND);
        }

        // ============================================================
        // RENDER LAYER 3: Static Structures (buildings, fields)
        // Warehouses, houses, towers, walls, fields - drawn before entities
        // ============================================================
        if (bldPositionX) {
          gl.useProgram(bldProg);
          gl.uniform2fv(gl.getUniformLocation(bldProg, 'u_resolution'), uRes); gl.uniform4fv(gl.getUniformLocation(bldProg, 'u_camera'), uCam);
          gl.bindVertexArray(bldVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, bldPosXVbo); gl.bufferData(gl.ARRAY_BUFFER, bldPositionX, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, bldPosYVbo); gl.bufferData(gl.ARRAY_BUFFER, bldPositionY, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, bldTypeVbo); gl.bufferData(gl.ARRAY_BUFFER, bldType, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, 0, 0); gl.vertexAttribDivisor(3, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, bldGroupVbo); gl.bufferData(gl.ARRAY_BUFFER, bldOwnerGroup, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.INT, false, 0, 0); gl.vertexAttribDivisor(4, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, bldHealthVbo); gl.bufferData(gl.ARRAY_BUFFER, bldHealth, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.INT, false, 0, 0); gl.vertexAttribDivisor(5, 1);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAX_BUILDINGS);
        }

        // ============================================================
        // RENDER LAYER 4: Mobile Entities (characters, units, resources)
        // Trees, bushes, gold, loot, characters - drawn on top of buildings
        // ============================================================
        gl.useProgram(entProg);
        gl.uniform2fv(gl.getUniformLocation(entProg, 'u_resolution'), uRes); gl.uniform4fv(gl.getUniformLocation(entProg, 'u_camera'), uCam);
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
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAX_ENTITIES);

        // ============================================================
        // RENDER LAYER 5: Vehicles (carts, boats, helicopters)
        // Drawn on top of entities
        // ============================================================
        if (vehPositionX) {
          gl.useProgram(vehProg);
          gl.uniform2fv(gl.getUniformLocation(vehProg, 'u_resolution'), uRes); gl.uniform4fv(gl.getUniformLocation(vehProg, 'u_camera'), uCam);
          gl.bindVertexArray(vehVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, vehPosXVbo); gl.bufferData(gl.ARRAY_BUFFER, vehPositionX, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, vehPosYVbo); gl.bufferData(gl.ARRAY_BUFFER, vehPositionY, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, vehTypeVbo); gl.bufferData(gl.ARRAY_BUFFER, vehType, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, 0, 0); gl.vertexAttribDivisor(3, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, vehGroupVbo); gl.bufferData(gl.ARRAY_BUFFER, vehOwnerGroup, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.INT, false, 0, 0); gl.vertexAttribDivisor(4, 1);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAX_VEHICLES);
        }

        // ============================================================
        // RENDER LAYER 6: UI Panels, Text, Selection Indicators
        // (Handled by React/App.tsx overlay - rendered via DOM)
        // ============================================================
        
        requestAnimationFrame(render);
    }

    const rootElement = document.getElementById('root');
    if (!rootElement) { console.error("Root element not found!"); return; }
    const root = createRoot(rootElement);
    
    function syncReact() {
        if (!health) return;
        const inspectEntity = inspectEntityId === -1 ? null : {
            id: inspectEntityId,
            name: (window as any).entityNames?.[inspectEntityId] || `Entity ${inspectEntityId}`,
            health: health[inspectEntityId],
            maxHealth: 100,
            money: money[inspectEntityId],
            state: state[inspectEntityId],
            stateName: ['Idle', 'Harvesting', 'Fleeing', 'Combat', 'Returning', 'Dead', 'Trading', 'Reporting', 'Construction'][state[inspectEntityId]] || 'Unknown',
            inventory: [],
            tool: 0,
            weapon: 0,
            armor: 0,
            positionX: positionX[inspectEntityId],
            positionY: positionY[inspectEntityId],
            groups: Array.from(groupAffiliations.slice(inspectEntityId * 8, inspectEntityId * 8 + 8) as unknown as number[]).filter(g => g !== -1),
            effectiveDamage: 10,
            effectiveSpeed: 1,
            effectiveLifespan: 80
        };
        root.render(<App ruleRegistry={ruleRegistry} logicBytecode={logicBytecode} groupPopulation={groupPopulation} groupTotalWealth={groupTotalWealth} groupBuildingCount={groupBuildingCount} groupWood={groupWood} groupGold={groupGold} groupFood={groupFood} groupMisc={groupMisc} tickCount={tickCount} lastTickTime={lastTickDuration} avgTickTime={avgTickDuration} inspectEntity={inspectEntity} chronicle={chronicle} onFollow={() => { followEntityId = inspectEntityId; }} onClearInspect={() => { inspectEntityId = -1; followEntityId = -1; }} />);
    }

    workers.forEach((w, i) => {
      w.onmessage = (e) => {
        const { type, payload, buffers } = e.data;
        if (type === "INITIALIZED") {
          console.log("Worker 0 initialized, mapping buffers...");
          positionX = new Float32Array(buffers.positionX); positionY = new Float32Array(buffers.positionY); traitBitmask = new Uint32Array(buffers.traitBitmask); groupAffiliations = new Int32Array(buffers.groupAffiliations); health = new Int32Array(buffers.health); money = new Int32Array(buffers.money); state = new Uint8Array(buffers.state); entityInventory = new Int16Array(buffers.entityInventory); worldMap = new Uint8Array(buffers.worldMap); territoryOwnerMap = new Int32Array(buffers.territoryOwnerMap); influenceMap = new Int16Array(buffers.influenceMap); workerSync = new Int32Array(buffers.workerSync); ruleRegistry = new Int32Array(buffers.ruleRegistry); logicBytecode = new Int32Array(buffers.logicBytecode); groupPopulation = new Int32Array(buffers.groupPopulationCount); groupTotalWealth = new Int32Array(buffers.groupTotalWealth); groupBuildingCount = new Int32Array(buffers.groupBuildingCount); groupWood = new Int32Array(buffers.groupWood); groupGold = new Int32Array(buffers.groupGold); groupFood = new Int32Array(buffers.groupFood); groupMisc = new Int32Array(buffers.groupMisc);
          bldPositionX = new Float32Array(buffers.bldPositionX); bldPositionY = new Float32Array(buffers.bldPositionY); bldType = new Uint8Array(buffers.bldType); bldHealth = new Int32Array(buffers.bldHealth); bldOwnerGroup = new Int32Array(buffers.bldOwnerGroup);
          vehPositionX = new Float32Array(buffers.vehPositionX); vehPositionY = new Float32Array(buffers.vehPositionY); vehType = new Uint8Array(buffers.vehType); vehOwnerGroup = new Int32Array(buffers.vehOwnerGroup);
          workers.slice(1).forEach((sw, si) => sw.postMessage({ type: "INIT", payload: { quadrantIndex: si + 1, buffers } }));
          requestAnimationFrame(render); setInterval(syncReact, 200);
          startTick();
        }
        if (type === "TICK_COMPLETE") {
          completedWorkersThisTick++;
          if (completedWorkersThisTick === 4) {
              tickCount++; const now = performance.now(); const dt = now - lastTickStartTime; lastTickDuration = dt; tickTimes.push(dt);
              if (tickTimes.length > 60) tickTimes.shift(); avgTickDuration = tickTimes.reduce((a, b) => a + b, 0) / tickTimes.length;
              
              // Update game time display
              const gameDay = Math.floor(tickCount / 3600) % 30 + 1;
              const gameMonth = Math.floor(tickCount / (3600 * 30)) % 12 + 1;
              const gameYear = Math.floor(tickCount / (3600 * 30 * 12)) + 1;
              gameTimeDisplay.textContent = `Day ${gameDay}, Month ${gameMonth}, Year ${gameYear}`;
              
              isTickInProgress = false;
              if (isLooping) {
                  if (targetTPS === 0) startTick();
                  else { const targetInterval = 1000 / targetTPS; const elapsed = now - lastTickStartTime; const delay = Math.max(0, targetInterval - elapsed); if (delay === 0) startTick(); else setTimeout(startTick, delay); }
              }
          }
        }
        if (type === "TICK_ERROR") {
          console.error("Simulation Tick Error from worker:", payload);
          isTickInProgress = false;
          isLooping = false;
          btnToggleLoop.textContent = "▶";
        }

        if (type === "ENTITY_FOUND") { inspectEntityId = payload.id; }
        if (type === "MAGIC_BURST") { addChronicle(`Magic Burst from Group ${groupAffiliations[payload.entityId * 10] || '?'}`); }
        if (type === "SAVE_REQUEST") handleSave();
        if (type === "GROUP_CREATED") {
          (window as any).groupNames = (window as any).groupNames || {};
          (window as any).groupNames[payload.groupId] = payload.name;
          tickCount++;
        }
        if (type === "ENTITY_NAMED") {
          (window as any).entityNames = (window as any).entityNames || {};
          (window as any).entityNames[payload.entityId] = payload.name;
        }
      };
    });

    workers[0].postMessage({ type: "INIT", payload: { quadrantIndex: 0 } });

    // Expose for console testing
    import('./simulation/state').then(S => { 
      (window as any).S = S; 
      if (S.groupNames) {
        (window as any).groupNames = Object.fromEntries(S.groupNames.entries());
      }
    });
    import('./simulation/buffs').then(B => { (window as any).Buffs = B; });
    
    // Sync group names periodically
    setInterval(() => {
      import('./simulation/state').then(S => {
        if (S.groupNames) {
          (window as any).groupNames = Object.fromEntries(S.groupNames.entries());
        }
      });
    }, 2000);
    
    // Group management via worker messages
    (window as any).createGroup = (name: string, archetype: number) => {
      workers[0].postMessage({ type: 'CREATE_GROUP', payload: { name, archetype } });
    };
    (window as any).assignToGroup = (entityId: number, groupId: number, slot: number) => {
      workers[0].postMessage({ type: 'ASSIGN_TO_GROUP', payload: { entityId, groupId, slot } });
    };
    (window as any).sendEvent = (groupId: number, eventType: number) => {
      workers[0].postMessage({ type: 'SEND_EVENT', payload: { groupId, eventType } });
    };
    (window as any).killEntity = (entityId: number) => {
      workers[0].postMessage({ type: 'KILL_ENTITY', payload: { entityId } });
    };
    (window as any).selectEntity = (entityId: number) => {
      inspectEntityId = entityId;
    };

    async function handleSave() {
      const path = await save({ filters: [{ name: 'Sim', extensions: ['bin'] }] }); if (!path) return;
      const header = new TextEncoder().encode("SIM1"); const data = new Uint8Array(20 * 1024 * 1024); data.set(header, 0); await writeFile(path, data);
    }

    loadBtn.onclick = async () => {
      const file: any = await open({ filters: [{ name: 'Sim', extensions: ['bin'] }] }); if (!file) return;
      const data = await readFile(file.path);
    };
});
