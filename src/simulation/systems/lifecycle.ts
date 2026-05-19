import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";

/**
 * Lifecycle System
 * Handles aging, hunger, survival autonomy, and death cleanup.
 */
export function runLifecycleSystem(
  state: SharedArrayBuffer,
  startIndex: number,
  endIndex: number,
): void {
  for (let i = startIndex; i < endIndex; i++) {
    const traits = S.traitBitmask[i];

    // Resource Regeneration (Special case for dead resource entities)
    if (
      S.state[i] === C.EntityState.Dead &&
      (traits & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0
    ) {
      if (Math.random() > 0.9995) {
        // Slow regen
        let x = Math.random() * C.WORLD_WIDTH;
        let y = Math.random() * C.WORLD_HEIGHT;
        const tx = Math.floor(x / C.TILE_SIZE),
          ty = Math.floor(y / C.TILE_SIZE);
        const tileIdx = Math.min(
          C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS - 1,
          Math.max(0, ty * C.WORLD_MAP_COLS + tx),
        );
        const terrain = S.worldMap[tileIdx];
        let valid = false;
        if ((traits & C.TRAIT_GOLD) !== 0 && terrain === C.TerrainType.Water)
          valid = true;
        else if (
          (traits & C.TRAIT_TREE) !== 0 &&
          terrain === C.TerrainType.Forest
        )
          valid = true;
        else if (
          (traits & C.TRAIT_BUSH) !== 0 &&
          terrain === C.TerrainType.Grass
        )
          valid = true;
        if (valid) {
          S.positionX[i] = x;
          S.positionY[i] = y;
          S.health[i] = 100;
          S.state[i] = C.EntityState.Idle;
        }
      }
      continue;
    }

    if (S.state[i] === C.EntityState.Dead) continue;

    // 0. Demographics & Stats (Summary logic)
    if (S.tickCount % 60 === 0) {
      const baseIdx = i * C.MAX_GROUP_CHANNELS;
      let primaryGid = -1;
      for (let s = 0; s < C.PUBLIC_GROUP_SLOTS; s++) {
        const gid = S.groupAffiliations[baseIdx + s];
        if (gid >= 0 && gid < C.MAX_GROUPS) {
          Atomics.add(S.groupPopulationCount, gid, 1);
          if (primaryGid === -1) primaryGid = gid;
        }
      }
      if (primaryGid !== -1) {
        Atomics.add(S.groupTotalWealth, primaryGid, S.money[i]);
        Atomics.add(S.groupGold, primaryGid, S.money[i]);
      }
    }

    // 1. Survival Logic (Decay & Attrition)
    let decayRate = 1;
    if (S.money[i] > 0) decayRate = 0;
    if (
      S.state[i] === C.EntityState.Harvesting ||
      S.state[i] === C.EntityState.ReturningToDepot
    )
      decayRate = 0;
    if (S.tickCount % (240 + (i % 60)) === 0) S.health[i] -= decayRate;

    // Starvation damage
    if (S.tickCount % 60 === 0) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0];
      if (gid >= 0 && gid < C.MAX_GROUPS && S.starvingGroups[gid] === 1) {
        S.health[i] -= 10;
      }
    }

    // Mana Regeneration
    if ((traits & C.TRAIT_MAGIC) !== 0 && S.tickCount % 60 === 0) {
      S.mana[i] = Math.min(100, S.mana[i] + 5);
    }

    // Territorial Attrition
    if (S.tickCount % 60 === 0) {
      const tx = Math.floor(S.positionX[i] / C.TILE_SIZE),
        ty = Math.floor(S.positionY[i] / C.TILE_SIZE);
      const tileIdx = ty * C.WORLD_MAP_COLS + tx;
      if (tileIdx >= 0 && tileIdx < S.territoryOwnerMap.length) {
        const owner = S.territoryOwnerMap[tileIdx];
        if (owner !== -1) {
          const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
          if (gid !== -1 && owner !== gid) {
            const rel = S.groupRelationsMatrix[gid * C.MAX_GROUPS + owner];
            if (rel < -20) S.health[i] -= 2;
          }
        }
      }
    }

    // 2. Autonomy State Machine (Decision Making)
    if (
      S.targetEntityId[i] !== -3 &&
      S.state[i] !== C.EntityState.Combat &&
      S.state[i] !== C.EntityState.Trading &&
      S.state[i] !== C.EntityState.ReportingIntel
    ) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0];
      let survivalTask: number = -1;

      // Hunger/Survival Check
      if (gid >= 0 && gid < C.MAX_GROUPS) {
        const groupFood = S.groupFood[gid];
        const pop = S.groupPopulationCount[gid];
        const foodNeeded = Math.max(1, Math.floor(pop * 0.1));
        if (groupFood > 0 && groupFood < foodNeeded * 5) {
          const bushId = U.findNearest(
            S.positionX[i],
            S.positionY[i],
            500,
            C.TRAIT_BUSH,
          );
          if (bushId !== -1) {
            survivalTask = 0;
            S.targetEntityId[i] = bushId;
            S.targetBuildingId[i] = -1;
          } else {
            const fieldId = U.findNearestBuilding(
              S.positionX[i],
              S.positionY[i],
              500,
              C.BuildingType.Field,
            );
            if (fieldId !== -1 && S.bldOwnerGroup[fieldId] === gid) {
              survivalTask = 1;
              S.targetBuildingId[i] = fieldId;
              S.targetEntityId[i] = -1;
            }
          }
        }
      }

      if (survivalTask !== -1) {
        S.state[i] = C.EntityState.Harvesting;
        S.actionTimer[i] = 0;
      } else {
        // Threat Check
        const enemyId = U.findNearest(
          S.positionX[i],
          S.positionY[i],
          120,
          C.TRAIT_AGGRESSIVE,
        );
        if (enemyId !== -1) {
          S.state[i] = C.EntityState.Fleeing;
          S.targetEntityId[i] = enemyId;
          S.actionTimer[i] = 120;
        } else if (
          S.state[i] === C.EntityState.Idle &&
          S.tickCount % (60 + (i % 30)) === 0
        ) {
          // Looting discovery
          const tx = Math.floor(S.positionX[i] / C.GRID_SIZE);
          const ty = Math.floor(S.positionY[i] / C.GRID_SIZE);
          if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
            const cellIdx = ty * C.GRID_COLS + tx;
            let itemId = S.itemSpatialHead[cellIdx];
            while (itemId !== -1) {
              const defId = S.itemInstanceDefId[itemId];
              const baseType = S.itemDefBaseType[defId];
              if (baseType === C.ITEM_BASE_MELEE) {
                if (
                  S.charWeapon[i] === -1 ||
                  S.itemDefStatA[defId] > S.effectiveDamage[i]
                ) {
                  S.targetItemId[i] = itemId;
                  S.state[i] = C.EntityState.Looting;
                  break;
                }
              }
              itemId = S.itemSpatialNext[itemId];
            }
          }
        }
      }
    }

    // 3. Death Handling
    if (S.health[i] <= 0) {
      const deadX = S.positionX[i];
      const deadY = S.positionY[i];
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0];

      // Drop loot on death
      if (S.money[i] > 0) {
        const moneyPerItem = 100;
        const count = Math.min(10, Math.floor(S.money[i] / moneyPerItem));
        for (let l = 0; l < count; l++) {
          U.createItemInstance(
            1,
            1,
            deadX + (Math.random() - 0.5) * 10,
            deadY + (Math.random() - 0.5) * 10,
          );
        }
      }

      if (S.charWeapon[i] !== -1) {
        U.setItemInstanceGround(S.charWeapon[i], deadX, deadY);
        S.charWeapon[i] = -1;
      }
      if (S.charArmor[i] !== -1) {
        U.setItemInstanceGround(S.charArmor[i], deadX, deadY);
        S.charArmor[i] = -1;
      }
      if (S.charTool[i] !== -1) {
        U.setItemInstanceGround(S.charTool[i], deadX, deadY);
        S.charTool[i] = -1;
      }

      S.state[i] = C.EntityState.Dead;
      S.positionX[i] = -10000;
      S.positionY[i] = -10000;
      S.health[i] = 0;
      S.isMounted[i] = 0;
      S.targetVehicleId[i] = -1;
      if (gid !== -1) Atomics.sub(S.groupPopulationCount, gid, 1);
    }
  }
}
