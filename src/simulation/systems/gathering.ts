import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";

/**
 * Gathering System
 * Handles resource collection, delivery to warehouses, and building construction progress.
 */
export function runGatheringSystem(
  stateBuffer: SharedArrayBuffer,
  startIndex: number,
  endIndex: number,
) {
  for (let i = startIndex; i < endIndex; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;

    const groupId = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
    if (groupId === -1) continue;

    // 1. IDLE STATE: Look for resources
    if (S.state[i] === C.EntityState.Idle) {
      // Hardcode search for a tree (TRAIT_TREE) for Milestone 3
      const treeId = U.findNearestWithTrait(
        S.positionX[i],
        S.positionY[i],
        100,
        C.TRAIT_TREE,
      );
      if (treeId !== -1) {
        S.targetEntityId[i] = treeId;
        S.charTool[i] = 0; // Wood
        S.state[i] = C.EntityState.Harvesting;
      }
    }

    // 2. HARVESTING STATE: Extract resources
    if (S.state[i] === C.EntityState.Harvesting) {
      const targetId = S.targetEntityId[i];
      const targetBldId = S.targetBuildingId[i];

      let tx = -1,
        ty = -1;
      let targetHealthIdx = -1;
      let isBuilding = false;

      if (targetId !== -1) {
        if (S.state[targetId] === C.EntityState.Dead) {
          S.state[i] = C.EntityState.Idle;
          continue;
        }
        tx = S.positionX[targetId];
        ty = S.positionY[targetId];
        targetHealthIdx = targetId;
      } else if (targetBldId !== -1) {
        if (S.bldHealth[targetBldId] <= 0) {
          S.state[i] = C.EntityState.Idle;
          continue;
        }
        tx = S.bldPositionX[targetBldId];
        ty = S.bldPositionY[targetBldId];
        isBuilding = true;
      }

      if (tx === -1) {
        S.state[i] = C.EntityState.Idle;
        continue;
      }

      // Move towards resource
      const dx = tx - S.positionX[i];
      const dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;

      if (distSq < 25) {
        // Within 5 units (5*5 = 25)
        // Harvest rate: 1 unit per tick
        S.entityInventory[i] += 1;

        if (isBuilding) {
          // Fields don't "die" when harvested, they just provide food
        } else {
          S.health[targetId] -= 1; // Damage the tree/bush
          if (S.health[targetId] <= 0) S.state[targetId] = C.EntityState.Dead;
        }

        // Inventory full (Max 50)
        if (S.entityInventory[i] >= 50) {
          S.state[i] = C.EntityState.ReturningToDepot;
          S.targetEntityId[i] = -1;
          S.targetBuildingId[i] = -1;
        }
      } else {
        // Set velocity towards target (normalized)
        const dist = Math.sqrt(distSq);
        S.velocityX[i] = (dx / dist) * S.effectiveSpeed[i];
        S.velocityY[i] = (dy / dist) * S.effectiveSpeed[i];
      }
    }

    // 3. RETURNING STATE: Deliver to Warehouse
    if (S.state[i] === C.EntityState.ReturningToDepot) {
      // Find nearest warehouse belonging to their group
      const whId = U.findNearestBuilding(
        S.positionX[i],
        S.positionY[i],
        500,
        1,
        groupId,
      ); // 1 = Warehouse

      if (whId !== -1) {
        const dx = S.bldPositionX[whId] - S.positionX[i];
        const dy = S.bldPositionY[whId] - S.positionY[i];
        const distSq = dx * dx + dy * dy;

        if (distSq < 100) {
          // Within 10 units
          const resourceType = S.charTool[i];
          if (resourceType === 0) {
            Atomics.add(S.bldDataA, whId, S.entityInventory[i]); // Wood
          } else if (resourceType === 2) {
            Atomics.add(S.bldDataC, whId, S.entityInventory[i]); // Food
          } else {
            Atomics.add(S.money, i, S.entityInventory[i]); // Fallback
          }

          S.entityInventory[i] = 0;
          S.state[i] = C.EntityState.Idle; // Go back to work
        } else {
          const dist = Math.sqrt(distSq);
          S.velocityX[i] = (dx / dist) * S.effectiveSpeed[i];
          S.velocityY[i] = (dy / dist) * S.effectiveSpeed[i];
        }
      } else {
        // No warehouse found, drop inventory and idle
        S.entityInventory[i] = 0;
        S.state[i] = C.EntityState.Idle;
      }
    }
  }
}
