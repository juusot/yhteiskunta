// src/simulation/systems/flowField.ts
import * as C from "../constants";
import * as S from "../state";

/**
 * Multi-source Dijkstra expansion to generate a flow field towards a set of targets.
 * Refinement 1: Integer-based costs are used to accumulate path distances in S.integrationField.
 * Refinement 2: Support offsets to store group-specific flow fields in S.flowFieldGroupHQ.
 */
export function generateFlowField(
  destArray: Int8Array,
  offset: number,
  getTargets: () => number[],
): void {
  // 1. Initialize integration field to a very high integer cost
  // S.integrationField is a Uint32Array, which is fast and cache-efficient
  S.integrationField.fill(999999);

  let head = 0;
  let tail = 0;

  // 2. Queue all starting target cells
  const targets = getTargets();
  for (let i = 0; i < targets.length; i++) {
    const tIdx = targets[i];
    if (tIdx >= 0 && tIdx < S.integrationField.length) {
      S.integrationField[tIdx] = 0;
      S.flowQueue[tail] = tIdx;
      tail = (tail + 1) % S.flowQueue.length;
    }
  }

  // 3. Multi-source Dijkstra expansion
  const qLen = S.flowQueue.length;
  while (head !== tail) {
    const currIdx = S.flowQueue[head];
    head = (head + 1) % qLen;
    const currX = currIdx % C.WORLD_MAP_COLS;
    const currY = Math.floor(currIdx / C.WORLD_MAP_COLS);
    const currCost = S.integrationField[currIdx];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = currX + dx;
        const ny = currY + dy;

        if (
          nx >= 0 &&
          nx < C.WORLD_MAP_COLS &&
          ny >= 0 &&
          ny < C.WORLD_MAP_ROWS
        ) {
          const nIdx = ny * C.WORLD_MAP_COLS + nx;
          const terrain = S.worldMap[nIdx];

          // Mountain & Ocean are completely impassable for normal flow navigation
          if (
            terrain === C.TerrainType.Mountain ||
            terrain === C.TerrainType.Ocean
          ) {
            continue;
          }

          // Refinement 1: Integer-based Dijkstra Costs
          let stepCost = dx !== 0 && dy !== 0 ? C.TERRAIN_COST_DIAGONAL : C.TERRAIN_COST_ORTHOGONAL;
          if (terrain === C.TerrainType.Forest) {
            stepCost = dx !== 0 && dy !== 0 ? C.TERRAIN_COST_FOREST_DIAG : C.TERRAIN_COST_FOREST_ORTHO;
          } else if (terrain === C.TerrainType.Water) {
            stepCost = dx !== 0 && dy !== 0 ? C.TERRAIN_COST_WATER_DIAG : C.TERRAIN_COST_WATER_ORTHO;
          }

          const totalCost = currCost + stepCost;
          if (totalCost < S.integrationField[nIdx]) {
            S.integrationField[nIdx] = totalCost;
            S.flowQueue[tail] = nIdx;
            tail = (tail + 1) % qLen;
          }
        }
      }
    }
  }

  // 4. Generate flow vectors pointing towards lower integration cost
  for (let y = 0; y < C.WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < C.WORLD_MAP_COLS; x++) {
      const idx = y * C.WORLD_MAP_COLS + x;
      const terrain = S.worldMap[idx];
      const destIdx = offset + idx;

      if (
        terrain === C.TerrainType.Mountain ||
        terrain === C.TerrainType.Ocean
      ) {
        destArray[destIdx] = -128; // Impassable
        continue;
      }

      let bestX = 0;
      let bestY = 0;
      let minCost = S.integrationField[idx];

      // Scan 8 neighbors for lowest accumulated Dijkstra cost
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;

          if (
            nx >= 0 &&
            nx < C.WORLD_MAP_COLS &&
            ny >= 0 &&
            ny < C.WORLD_MAP_ROWS
          ) {
            const nCost = S.integrationField[ny * C.WORLD_MAP_COLS + nx];
            if (nCost < minCost) {
              minCost = nCost;
              bestX = dx;
              bestY = dy;
            }
          }
        }
      }

      // Encode the normalized 2D direction as an angle byte in Int8 range [-127, 127]
      const len = Math.sqrt(bestX * bestX + bestY * bestY);
      if (len > 0) {
        const dxNorm = bestX / len;
        const dyNorm = bestY / len;
        const angle = Math.atan2(dyNorm, dxNorm);
        const val = Math.round((angle / Math.PI) * 127);
        destArray[destIdx] = val < -127 ? -127 : (val > 127 ? 127 : val);
      } else {
        destArray[destIdx] = -128; // No valid flow vector
      }
    }
  }
}

/**
 * Updates all flow fields asynchronously every 60 ticks on Worker 0 (Master).
 * Solves Wood, Gold, Food, and 16 Group HQ partitions.
 */
export function updateAllFlowFields(): void {
  // --- 1. WOOD TARGETS ---
  generateFlowField(S.flowFieldWood, 0, () => {
    const list: number[] = [];
    for (let i = 0; i < C.MAX_ENTITIES; i++) {
      if (
        S.state[i] !== C.EntityState.Dead &&
        (S.traitBitmask[i] & C.TRAIT_TREE) !== 0 &&
        S.health[i] > 0
      ) {
        const cx = Math.floor(S.positionX[i] / 10);
        const cy = Math.floor(S.positionY[i] / 10);
        if (cx >= 0 && cx < C.WORLD_MAP_COLS && cy >= 0 && cy < C.WORLD_MAP_ROWS) {
          list.push(cy * C.WORLD_MAP_COLS + cx);
        }
      }
    }
    return list;
  });

  // --- 2. GOLD TARGETS ---
  generateFlowField(S.flowFieldGold, 0, () => {
    const list: number[] = [];
    for (let i = 0; i < C.MAX_ENTITIES; i++) {
      if (
        S.state[i] !== C.EntityState.Dead &&
        (S.traitBitmask[i] & C.TRAIT_GOLD) !== 0 &&
        S.health[i] > 0
      ) {
        const cx = Math.floor(S.positionX[i] / 10);
        const cy = Math.floor(S.positionY[i] / 10);
        if (cx >= 0 && cx < C.WORLD_MAP_COLS && cy >= 0 && cy < C.WORLD_MAP_ROWS) {
          list.push(cy * C.WORLD_MAP_COLS + cx);
        }
      }
    }
    return list;
  });

  // --- 3. FOOD TARGETS ---
  generateFlowField(S.flowFieldFood, 0, () => {
    const list: number[] = [];
    // Bushes
    for (let i = 0; i < C.MAX_ENTITIES; i++) {
      if (
        S.state[i] !== C.EntityState.Dead &&
        (S.traitBitmask[i] & C.TRAIT_BUSH) !== 0 &&
        S.health[i] > 0
      ) {
        const cx = Math.floor(S.positionX[i] / 10);
        const cy = Math.floor(S.positionY[i] / 10);
        if (cx >= 0 && cx < C.WORLD_MAP_COLS && cy >= 0 && cy < C.WORLD_MAP_ROWS) {
          list.push(cy * C.WORLD_MAP_COLS + cx);
        }
      }
    }
    // Fields
    for (let b = 0; b < C.MAX_BUILDINGS; b++) {
      if (S.bldHealth[b] > 0 && S.bldType[b] === 5) {
        const cx = Math.floor(S.bldPositionX[b] / 10);
        const cy = Math.floor(S.bldPositionY[b] / 10);
        if (cx >= 0 && cx < C.WORLD_MAP_COLS && cy >= 0 && cy < C.WORLD_MAP_ROWS) {
          list.push(cy * C.WORLD_MAP_COLS + cx);
        }
      }
    }
    return list;
  });

  // --- 4. GROUP WAREHOUSES (Refinement 2: 16 Group HQ partitions) ---
  const activeSlots = new Uint8Array(16);
  const pageSize = C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS;

  for (let g = 0; g < C.MAX_GROUPS; g++) {
    if (S.groupPopulationCount[g] > 0) {
      const slot = g % 16;
      activeSlots[slot] = 1;

      generateFlowField(S.flowFieldGroupHQ, slot * pageSize, () => {
        const list: number[] = [];

        // Main Warehouse coordinates for group g
        const wx = S.groupWarehouseX[g];
        const wy = S.groupWarehouseY[g];
        const cx = Math.floor(wx / 10);
        const cy = Math.floor(wy / 10);
        if (cx >= 0 && cx < C.WORLD_MAP_COLS && cy >= 0 && cy < C.WORLD_MAP_ROWS) {
          list.push(cy * C.WORLD_MAP_COLS + cx);
        }

        // dynamic warehouses owned by group g
        for (let b = 0; b < C.MAX_BUILDINGS; b++) {
          if (
            S.bldHealth[b] > 0 &&
            S.bldType[b] === 1 && // 1 = Warehouse
            S.bldOwnerGroup[b] === g
          ) {
            const bcx = Math.floor(S.bldPositionX[b] / 10);
            const bcy = Math.floor(S.bldPositionY[b] / 10);
            if (bcx >= 0 && bcx < C.WORLD_MAP_COLS && bcy >= 0 && bcy < C.WORLD_MAP_ROWS) {
              list.push(bcy * C.WORLD_MAP_COLS + bcx);
            }
          }
        }
        return list;
      });
    }
  }

  // Fill empty HQ slots with -128 to avoid residual directional vectors
  for (let slot = 0; slot < 16; slot++) {
    if (activeSlots[slot] === 0) {
      S.flowFieldGroupHQ.fill(-128, slot * pageSize, (slot + 1) * pageSize);
    }
  }
}
