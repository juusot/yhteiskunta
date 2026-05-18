// src/simulation/initialization.ts
import * as C from './constants';
import * as S from './state';
import * as U from './utils';

export function generateBiomes(): void {
  S.worldMap.fill(C.TerrainType.Grass);
  
  // Winding River
  for (let x = 0; x < C.WORLD_MAP_COLS; x++) {
    const y = Math.floor(60 + Math.sin(x * 0.1) * 20);
    for (let dy = -2; dy <= 2; dy++) {
      const ty = Math.min(C.WORLD_MAP_ROWS - 1, Math.max(0, y + dy));
      S.worldMap[ty * C.WORLD_MAP_COLS + x] = C.TerrainType.Water;
    }
  }

  // Mountains (Top and Bottom edges)
  for (let x = 0; x < C.WORLD_MAP_COLS; x++) {
    for (let y = 0; y < 10; y++) S.worldMap[y * C.WORLD_MAP_COLS + x] = C.TerrainType.Mountain;
    for (let y = C.WORLD_MAP_ROWS - 10; y < C.WORLD_MAP_ROWS; y++) S.worldMap[y * C.WORLD_MAP_COLS + x] = C.TerrainType.Mountain;
  }

  // Forest Patches
  for (let i = 0; i < 40; i++) {
    const fx = Math.floor(Math.random() * C.WORLD_MAP_COLS);
    const fy = Math.floor(Math.random() * C.WORLD_MAP_ROWS);
    const fr = Math.floor(Math.random() * 8) + 4;
    for (let y = Math.max(0, fy - fr); y < Math.min(C.WORLD_MAP_ROWS, fy + fr); y++) {
      for (let x = Math.max(0, fx - fr); x < Math.min(C.WORLD_MAP_COLS, fx + fr); x++) {
        const dx = x - fx; const dy = y - fy;
        if (dx * dx + dy * dy < fr * fr) {
          if (S.worldMap[y * C.WORLD_MAP_COLS + x] === C.TerrainType.Grass) 
            S.worldMap[y * C.WORLD_MAP_COLS + x] = C.TerrainType.Forest;
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

  // Reset Buildings
  for (let i = 0; i < C.MAX_BUILDINGS; i++) {
    S.bldType[i] = 0; S.bldHealth[i] = 0; S.bldOwnerGroup[i] = -1;
    for (let j = 0; j < 4; j++) S.bldInventory[i * 4 + j] = 0;
  }
  // Reset Vehicles
  for (let i = 0; i < C.MAX_VEHICLES; i++) {
    S.vehType[i] = 0; S.vehHealth[i] = 0; S.vehPilotId[i] = -1; S.vehOwnerGroup[i] = -1;
  }
  // Reset Groups
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    S.groupTargetEntityId[g] = -1;
    S.groupTargetX[g] = 0;
    S.groupTargetY[g] = 0;
    S.groupTargetAge[g] = 0;
    S.groupMagicFrequency[g] = 0;
    S.groupTotalWealth[g] = 5000;
    S.groupCreatedAt[g] = 0; 

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
  S.groupWarehouseX[0] = 150; S.groupWarehouseY[0] = 150; S.groupVisualArchetypes[0] = 3;
  // 1: Red Circle (Top-Right)
  S.groupWarehouseX[1] = 1450; S.groupWarehouseY[1] = 150; S.groupVisualArchetypes[1] = 1;
  // 2: Blue Triangle (Bottom-Left)
  S.groupWarehouseX[2] = 150; S.groupWarehouseY[2] = 1050; S.groupVisualArchetypes[2] = 0;
  // 3: Pink Square (Bottom-Right)
  S.groupWarehouseX[3] = 1450; S.groupWarehouseY[3] = 1050; S.groupVisualArchetypes[3] = 2;

  // Spawn initial warehouses as buildings
  for (let g = 0; g < 4; g++) {
    S.bldPositionX[g] = S.groupWarehouseX[g];
    S.bldPositionY[g] = S.groupWarehouseY[g];
    S.bldType[g] = C.BuildingType.Warehouse;
    S.bldHealth[g] = 1000;
    S.bldOwnerGroup[g] = g;
    // Add starting food (slot 2) and some wood/gold
    S.bldInventory[g * 4 + 0] = 500;  // Wood
    S.bldInventory[g * 4 + 1] = 500;  // Gold
    S.bldInventory[g * 4 + 2] = 1000; // Food
    S.bldInventory[g * 4 + 3] = 0;    // Misc
  }

  generateBiomes();

  // Reset all entities to Dead
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    S.state[i] = C.EntityState.Dead;
    S.positionX[i] = -2000; S.positionY[i] = -2000;
    S.velocityX[i] = 0; S.velocityY[i] = 0;
    S.health[i] = 0; S.money[i] = 0;
    S.traitBitmask[i] = C.TRAIT_NONE;
    const baseAffIdx = i * C.GROUP_SLOTS_PER_CHARACTER;
    for (let s = 0; s < C.GROUP_SLOTS_PER_CHARACTER; s++) S.groupAffiliations[baseAffIdx + s] = -1;
    const baseEventIdx = i * C.EVENT_SLOTS_PER_CHARACTER;
    for (let s = 0; s < C.EVENT_SLOTS_PER_CHARACTER; s++) S.pendingEvents[baseEventIdx + s] = -1;
    S.targetEntityId[i] = -1; S.targetBuildingId[i] = -1; S.targetVehicleId[i] = -1; S.isMounted[i] = 0; S.activeCommandPriority[i] = 0; S.activePrioritySlot[i] = -1;
    S.entityInventory[i] = 0; S.mana[i] = 100; S.carriedIntelEntityId[i] = -1;
    S.charWeapon[i] = 0; S.charArmor[i] = 0; S.charTool[i] = 0;
    // Default stats with variance
    S.lifespan[i] = 60 + Math.floor(Math.random() * 21);  // 60-80 years
    S.damage[i] = 10 + Math.floor((Math.random() - 0.5) * 4);  // 8-12 (±20%)
    S.speed[i] = 1.0 + (Math.random() - 0.5) * 0.4;  // 0.8-1.2 (±20%)
    // Initialize effective stats = base stats (no buffs yet)
    S.effectiveLifespan[i] = S.lifespan[i];
    S.effectiveDamage[i] = S.damage[i];
    S.effectiveSpeed[i] = S.speed[i];
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
      S.actionTimer[i] = 60;
      S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0] = g;

      const name = U.generateName();
      S.entityNames.set(i, name);
      if (S.quadrantIndex === 0) {
        self.postMessage({ type: "ENTITY_NAMED", payload: { entityId: i, name } });
      }
      // Default stats with variance for spawned characters
      S.lifespan[i] = 60 + Math.floor(Math.random() * 21);  // 60-80 years
      S.damage[i] = 10 + Math.floor((Math.random() - 0.5) * 4);  // 8-12 (±20%)
      S.speed[i] = 1.0 + (Math.random() - 0.5) * 0.4;  // 0.8-1.2 (±20%)
      // Initialize effective stats = base stats (no buffs yet)
      S.effectiveLifespan[i] = S.lifespan[i];
      S.effectiveDamage[i] = S.damage[i];
      S.effectiveSpeed[i] = S.speed[i];
    }
  }

  // Spawn Resources (Trees, Gold, Bushes)
  for (let i = 0; i < 5000; i++) {
    if (entityPtr >= C.MAX_ENTITIES) break;
    const id = entityPtr++;
    
    let x = Math.random() * C.WORLD_WIDTH;
    let y = Math.random() * C.WORLD_HEIGHT;
    const tx = Math.floor(x / C.TILE_SIZE);
    const ty = Math.floor(y / C.TILE_SIZE);
    const tileIdx = Math.min(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS - 1, Math.max(0, ty * C.WORLD_MAP_COLS + tx));
    const terrain = S.worldMap[tileIdx];

    if (terrain === C.TerrainType.Mountain) { entityPtr--; continue; } // Skip mountains

    S.state[id] = C.EntityState.Idle;
    S.positionX[id] = x;
    S.positionY[id] = y;
    S.health[id] = 100;

    if (terrain === C.TerrainType.Water) {
      S.traitBitmask[id] = C.TRAIT_GOLD;
    } else if (terrain === C.TerrainType.Forest) {
      S.traitBitmask[id] = C.TRAIT_TREE;
    } else {
      // Grass: Only Bushes
      S.traitBitmask[id] = C.TRAIT_BUSH;
    }
  }
}
