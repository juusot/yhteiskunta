// src/simulation/initialization.ts
import * as C from "./constants";
import * as S from "./state";
import * as U from "./utils";

export function generateBiomes(): void {
  S.worldMap.fill(C.TerrainType.Grass);

  const centerX = C.WORLD_MAP_COLS / 2;
  const centerY = C.WORLD_MAP_ROWS / 2;

  // 1. Central Ocean
  const oceanRadius = Math.min(C.WORLD_MAP_COLS, C.WORLD_MAP_ROWS) * 0.15;
  for (let y = 0; y < C.WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < C.WORLD_MAP_COLS; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy < oceanRadius * oceanRadius) {
        S.worldMap[y * C.WORLD_MAP_COLS + x] = C.TerrainType.Ocean;
      }
    }
  }

  // 2. Rivers flowing out of the ocean
  const numRivers = 4;
  for (let r = 0; r < numRivers; r++) {
    const angle = (r / numRivers) * Math.PI * 2 + Math.PI / 4;
    const length = Math.max(C.WORLD_MAP_COLS, C.WORLD_MAP_ROWS);
    for (let d = 0; d < length; d++) {
      // Add some wiggle to the river
      const wiggle = Math.sin(d * 0.2) * 2;
      const rx = Math.floor(
        centerX + Math.cos(angle) * d + Math.cos(angle + Math.PI / 2) * wiggle,
      );
      const ry = Math.floor(
        centerY + Math.sin(angle) * d + Math.sin(angle + Math.PI / 2) * wiggle,
      );

      if (
        rx >= 0 &&
        rx < C.WORLD_MAP_COLS &&
        ry >= 0 &&
        ry < C.WORLD_MAP_ROWS
      ) {
        // 3-tile wide river
        for (let wy = -1; wy <= 1; wy++) {
          for (let wx = -1; wx <= 1; wx++) {
            const tx = Math.min(C.WORLD_MAP_COLS - 1, Math.max(0, rx + wx));
            const ty = Math.min(C.WORLD_MAP_ROWS - 1, Math.max(0, ry + wy));
            S.worldMap[ty * C.WORLD_MAP_COLS + tx] = C.TerrainType.Water;
          }
        }
      }
    }
  }

  // 3. Scattered Small Mountains
  for (let i = 0; i < 30; i++) {
    const mx = Math.floor(Math.random() * C.WORLD_MAP_COLS);
    const my = Math.floor(Math.random() * C.WORLD_MAP_ROWS);
    const mr = Math.floor(Math.random() * 3) + 2; // Small radius 2-4

    // Don't place mountains too close to the center ocean
    const dx = mx - centerX;
    const dy = my - centerY;
    if (dx * dx + dy * dy < (oceanRadius + 10) * (oceanRadius + 10)) continue;

    for (
      let y = Math.max(0, my - mr);
      y < Math.min(C.WORLD_MAP_ROWS, my + mr);
      y++
    ) {
      for (
        let x = Math.max(0, mx - mr);
        x < Math.min(C.WORLD_MAP_COLS, mx + mr);
        x++
      ) {
        const ddx = x - mx;
        const ddy = y - my;
        if (ddx * ddx + ddy * ddy < mr * mr) {
          S.worldMap[y * C.WORLD_MAP_COLS + x] = C.TerrainType.Mountain;
        }
      }
    }
  }

  // 4. Forest Patches
  for (let i = 0; i < 40; i++) {
    const fx = Math.floor(Math.random() * C.WORLD_MAP_COLS);
    const fy = Math.floor(Math.random() * C.WORLD_MAP_ROWS);
    const fr = Math.floor(Math.random() * 8) + 4;
    for (
      let y = Math.max(0, fy - fr);
      y < Math.min(C.WORLD_MAP_ROWS, fy + fr);
      y++
    ) {
      for (
        let x = Math.max(0, fx - fr);
        x < Math.min(C.WORLD_MAP_COLS, fx + fr);
        x++
      ) {
        const dx = x - fx;
        const dy = y - fy;
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
    S.bldType[i] = 0;
    S.bldHealth[i] = 0;
    S.bldOwnerGroup[i] = -1;
    S.bldTier[i] = 0;
    S.bldDataA[i] = 0;
    S.bldDataB[i] = 0;
    S.bldDataC[i] = 0;
  }
  // Reset Projectiles
  for (let i = 0; i < C.MAX_PROJECTILES; i++) {
    S.projType[i] = 0;
    S.projLifeTime[i] = 0;
  }
  // Reset Vehicles
  for (let i = 0; i < C.MAX_VEHICLES; i++) {
    S.vehType[i] = 0;
    S.vehHealth[i] = 0;
    S.vehPilotId[i] = -1;
    S.vehOwnerGroup[i] = -1;
  }

  // Reset Items
  for (let i = 0; i < C.MAX_ITEM_INSTANCES; i++) {
    S.itemInstanceOwnerType[i] = C.OWNER_TYPE_INACTIVE;
  }

  // Pre-populate Item Definitions
  // Index 0: Standard Sword
  S.itemDefBaseType[0] = C.ITEM_BASE_MELEE;
  S.itemDefStatA[0] = 15;
  S.itemDefStatB[0] = 30;
  S.itemDefTraitMask[0] = C.ITEM_TRAIT_NONE;

  // Index 1: Health Potion
  S.itemDefBaseType[1] = C.ITEM_BASE_CONSUMABLE;
  S.itemDefStatA[1] = 50;
  S.itemDefStatB[1] = 0;
  S.itemDefTraitMask[1] = C.ITEM_TRAIT_NONE;

  // Index 2: Cursed Blade
  S.itemDefBaseType[2] = C.ITEM_BASE_MELEE;
  S.itemDefStatA[2] = 40;
  S.itemDefStatB[2] = 25;
  S.itemDefTraitMask[2] = C.ITEM_TRAIT_CURSED;

  // Reset Groups
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    S.groupTargetEntityId[g] = -1;
    S.groupTargetX[g] = 0;
    S.groupTargetY[g] = 0;
    S.groupTargetAge[g] = 0;
    S.groupMagicFrequency[g] = 0;
    S.groupTotalWealth[g] = 5000;
    S.groupCreatedAt[g] = 0;
    S.groupWarehouseX[g] = -1;
    S.groupWarehouseY[g] = -1;

    // Assign visual archetype
    S.groupVisualArchetypes[g] = Math.floor(Math.random() * 4);
  }

  generateBiomes();

  // Reset all entities to Dead
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    S.state[i] = C.EntityState.Dead;
    S.positionX[i] = -2000;
    S.positionY[i] = -2000;
    // ... rest of reset if needed, but spawnCharacter will overwrite most
    // Actually, we should still clear them to be safe
    const baseAffIdx = i * C.MAX_GROUP_CHANNELS;
    for (let s = 0; s < C.MAX_GROUP_CHANNELS; s++)
      S.groupAffiliations[baseAffIdx + s] = -1;
  }

  let entityPtr = 0;
  // Spawn Resources (Trees, Gold, Bushes)
  for (let i = 0; i < 5000; i++) {
    if (entityPtr >= C.MAX_ENTITIES) break;
    const id = entityPtr++;

    let x = Math.random() * C.WORLD_WIDTH;
    let y = Math.random() * C.WORLD_HEIGHT;
    const tx = Math.floor(x / C.TILE_SIZE);
    const ty = Math.floor(y / C.TILE_SIZE);
    const tileIdx = Math.min(
      C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS - 1,
      Math.max(0, ty * C.WORLD_MAP_COLS + tx),
    );
    const terrain = S.worldMap[tileIdx];

    if (terrain === C.TerrainType.Mountain || terrain === C.TerrainType.Ocean) {
      entityPtr--;
      continue;
    } // Skip mountains and ocean

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
