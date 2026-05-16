// src/simulation/initialization.ts
import * as C from './constants';
import * as S from './state';

export function generateBiomes(): void {
  S.worldMap.fill(0);
  const centerX = C.WORLD_MAP_COLS / 2;
  const centerY = C.WORLD_MAP_ROWS / 2;
  const radius = 25;
  for (let y = 0; y < C.WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < C.WORLD_MAP_COLS; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy < radius * radius) S.worldMap[y * C.WORLD_MAP_COLS + x] = 2;
    }
  }

  for (let i = 0; i < 30; i++) {
    const fx = Math.floor(Math.random() * C.WORLD_MAP_COLS);
    const fy = Math.floor(Math.random() * C.WORLD_MAP_ROWS);
    const fr = Math.floor(Math.random() * 10) + 5;
    for (let y = Math.max(0, fy - fr); y < Math.min(C.WORLD_MAP_ROWS, fy + fr); y++) {
      for (let x = Math.max(0, fx - fr); x < Math.min(C.WORLD_MAP_COLS, fx + fr); x++) {
        const dx = x - fx; const dy = y - fy;
        if (dx * dx + dy * dy < fr * fr) {
          if (S.worldMap[y * C.WORLD_MAP_COLS + x] === 0) S.worldMap[y * C.WORLD_MAP_COLS + x] = 1;
        }
      }
    }
  }
}

export function initializeWorld(): void {
  S.groupRelationsMatrix.fill(0);
  S.logicBytecode.fill(C.OP_END);
  S.territoryOwnerMap.fill(-1);
  for (let r = 0; r < C.MAX_RULES * 8; r++) S.ruleRegistry[r] = 0;

  for (let g = 0; g < C.MAX_GROUPS; g++) {
    S.groupTargetEntityId[g] = -1;
    S.groupTargetX[g] = 0;
    S.groupTargetY[g] = 0;
    S.groupTargetAge[g] = 0;
    S.groupMagicFrequency[g] = 0;
    S.groupTotalWealth[g] = 5000; 

    // Assign visual archetype
    S.groupVisualArchetypes[g] = Math.floor(Math.random() * 4);

    // Distribute warehouses
    const angle = (g / 20) * Math.PI * 2;
    const dist = 400 + (g % 5) * 50;
    S.groupWarehouseX[g] = (C.WORLD_WIDTH / 2) + Math.cos(angle) * dist;
    S.groupWarehouseY[g] = (C.WORLD_HEIGHT / 2) + Math.sin(angle) * dist;
  }

  // Define 4 Primary Nations
  // 0: Yellow Star (Top-Left)
  S.groupWarehouseX[0] = 100; S.groupWarehouseY[0] = 100; S.groupVisualArchetypes[0] = 3;
  // 1: Red Circle (Top-Right)
  S.groupWarehouseX[1] = 1500; S.groupWarehouseY[1] = 100; S.groupVisualArchetypes[1] = 1;
  // 2: Blue Triangle (Bottom-Left)
  S.groupWarehouseX[2] = 100; S.groupWarehouseY[2] = 1100; S.groupVisualArchetypes[2] = 0;
  // 3: Pink Square (Bottom-Right)
  S.groupWarehouseX[3] = 1500; S.groupWarehouseY[3] = 1100; S.groupVisualArchetypes[3] = 2;

  generateBiomes();

  // Reset all entities to Dead
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    S.state[i] = C.EntityState.Dead;
    S.positionX[i] = -2000; S.positionY[i] = -2000;
    S.velocityX[i] = 0; S.velocityY[i] = 0;
    S.health[i] = 0; S.money[i] = 0;
    S.traitBitmask[i] = C.TRAIT_NONE;
    const baseAffIdx = i * 8;
    for (let s = 0; s < 8; s++) S.groupAffiliations[baseAffIdx + s] = -1;
    const baseEventIdx = i * 4;
    for (let s = 0; s < 4; s++) S.pendingEvents[baseEventIdx + s] = -1;
    S.targetEntityId[i] = -1; S.activeCommandPriority[i] = 0; S.activePrioritySlot[i] = -1;
    S.entityInventory[i] = 0; S.mana[i] = 100; S.carriedIntelEntityId[i] = -1;
  }

  // Spawn 20 members for each nation
  let entityPtr = 0;
  for (let g = 0; g < 4; g++) {
    for (let m = 0; m < 20; m++) {
      if (entityPtr >= C.MAX_ENTITIES) break;
      const i = entityPtr++;
      S.state[i] = C.EntityState.Idle;
      S.positionX[i] = S.groupWarehouseX[g] + (Math.random() - 0.5) * 50;
      S.positionY[i] = S.groupWarehouseY[g] + (Math.random() - 0.5) * 50;
      S.velocityX[i] = (Math.random() - 0.5);
      S.velocityY[i] = (Math.random() - 0.5);
      S.health[i] = 100;
      S.money[i] = 1000;
      S.groupAffiliations[i * 8] = g;
    }
  }

  // Spawn 5000 trees
  for (let i = 0; i < 5000; i++) {
    if (entityPtr >= C.MAX_ENTITIES) break;
    const id = entityPtr++;
    S.state[id] = C.EntityState.Idle;
    S.positionX[id] = Math.random() * C.WORLD_WIDTH;
    S.positionY[id] = Math.random() * C.WORLD_HEIGHT;
    S.health[id] = 100;
    S.traitBitmask[id] = C.TRAIT_TREE;
  }
}
