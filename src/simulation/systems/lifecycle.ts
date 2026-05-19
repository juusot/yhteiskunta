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
        S.health[i] -= 2; // Reduced from 10 to make it less harsh
      }
    }

    // 1.5 Natural Aging (RAPID SCALE)
    if (S.tickCount % C.TICKS_PER_YEAR === 0) {
      const age = Math.floor(S.tickCount / C.TICKS_PER_YEAR);
      if (age > 60) {
        S.health[i] -= Math.max(0, Math.floor((age - 60) / 2));
      }
    }

    // Mana Regeneration
    if ((traits & C.TRAIT_MAGIC) !== 0 && S.tickCount % 60 === 0) {
      S.mana[i] = Math.min(100, S.mana[i] + 5);
    }

    // ... (rest of territorial logic) ...

    // 2. Autonomy State Machine (Decision Making)
    if (
      S.targetEntityId[i] !== -3 &&
      S.state[i] !== C.EntityState.Combat &&
      S.state[i] !== C.EntityState.Trading &&
      S.state[i] !== C.EntityState.ReportingIntel
    ) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0];
      let survivalTask: number = -1;

      // Growth-Driven Hunger Check
      if (gid >= 0 && gid < C.MAX_GROUPS) {
        const groupFood = S.groupFood[gid];
        const pop = S.groupPopulationCount[gid];
        const capacity = Math.max(20, S.groupHouseCapacity[gid]);

        // Only seek food if group needs more (below capacity) AND food is low (< 1000 buffer)
        const needsGrowth = pop < capacity && groupFood < 1000;

        if (needsGrowth && Math.random() > 0.98) {
          // Check domestic fields first
          const fieldId = U.findNearestBuilding(
            S.positionX[i],
            S.positionY[i],
            300,
            C.BuildingType.Field,
            gid,
          );
          if (fieldId !== -1) {
            survivalTask = 1;
            S.targetBuildingId[i] = fieldId;
            S.charTool[i] = 2; // Food
          } else {
            // Then wild bushes
            const bushId = U.findNearestWithTrait(
              S.positionX[i],
              S.positionY[i],
              200,
              C.TRAIT_BUSH,
            );
            if (bushId !== -1) {
              survivalTask = 0;
              S.targetEntityId[i] = bushId;
              S.charTool[i] = 2; // Food
              S.targetBuildingId[i] = -1;
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
