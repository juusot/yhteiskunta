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

    // 1. IDLE STATE: Look for work
    if (S.state[i] === C.EntityState.Idle && S.targetEntityId[i] !== -3) {
      // Prioritization:
      // A. Check for any UNFINISHED buildings in our group (blueprints)
      const unfinishedBldId = U.findNearestBuilding(
        S.positionX[i],
        S.positionY[i],
        500,
        -1,
        groupId,
      ); // -1 = any type
      if (unfinishedBldId !== -1 && S.bldHealth[unfinishedBldId] < 1000) {
        S.targetBuildingId[i] = unfinishedBldId;
        S.state[i] = C.EntityState.Construction;
        continue;
      }

      // B. Check if group needs Wood (Building houses or Warehouse)
      // C. Check if group needs Food (Low stock)

      const groupWood = S.groupWood[groupId];
      const buildingCount = S.groupBuildingCount[groupId];
      let needsWood = buildingCount === 0 || groupWood < 2000;
      let needsFood = true;

      // Restrict gathering to a safe radius around the group warehouse
      const whX = S.groupWarehouseX[groupId] !== -1 ? S.groupWarehouseX[groupId] : S.positionX[i];
      const whY = S.groupWarehouseY[groupId] !== -1 ? S.groupWarehouseY[groupId] : S.positionY[i];
      const MAX_GATHER_RADIUS = 500;

      if (needsWood) {
        const treeId = U.findNearestWithTrait(whX, whY, MAX_GATHER_RADIUS, C.TRAIT_TREE);
        if (treeId === -1) needsWood = false; // Too dangerous/far, skip wood
      }

      if (needsWood) {
        S.targetEntityId[i] = -1;
        S.charTool[i] = 0; // Wood
        S.state[i] = C.EntityState.Harvesting;
        continue;
      }

      if (needsFood) {
        const bushId = U.findNearestWithTrait(whX, whY, MAX_GATHER_RADIUS, C.TRAIT_BUSH);
        if (bushId === -1) needsFood = false;
      }

      if (needsFood) {
        S.targetEntityId[i] = -1;
        S.charTool[i] = 2; // Food
        S.state[i] = C.EntityState.Harvesting;
        continue;
      }
    }

    // 2. HARVESTING STATE: Committed execution
    if (S.state[i] === C.EntityState.Harvesting) {
      if (S.targetEntityId[i] === -1 && S.targetBuildingId[i] === -1) {
        if (S.tickCount % 5 === (i % 5)) {
          const tool = S.charTool[i];
          let trait = C.TRAIT_TREE;
          if (tool === 1) trait = C.TRAIT_GOLD;
          if (tool === 2) trait = C.TRAIT_BUSH;

          const nearbyId = U.findNearestWithTrait(S.positionX[i], S.positionY[i], 25, trait);
          if (nearbyId !== -1) {
            S.targetEntityId[i] = nearbyId;
          }
        }
      }

      const targetId = S.targetEntityId[i];
      const targetBldId = S.targetBuildingId[i];

      let tx = -1,
        ty = -1;
      let isBuilding = false;

      if (targetId !== -1) {
        if (S.state[targetId] === C.EntityState.Dead) {
          // Task interrupted (target gone), return to idle to re-evaluate
          S.state[i] = C.EntityState.Idle;
          S.velocityX[i] = 0;
          S.velocityY[i] = 0;
          continue;
        }
        tx = S.positionX[targetId];
        ty = S.positionY[targetId];
      } else if (targetBldId !== -1) {
        if (S.bldHealth[targetBldId] <= 0) {
          S.state[i] = C.EntityState.Idle;
          S.velocityX[i] = 0;
          S.velocityY[i] = 0;
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

      if (distSq < C.DIST_SQ_HARVEST) {
        // Within 10 units (10*10 = 100)
        // Harvest rate: 1 unit per tick
        S.entityInventory[i] += 1;

        if (isBuilding) {
          // Fields don't "die" when harvested
        } else {
          S.health[targetId] -= 1; // Damage the tree/bush
          if (S.health[targetId] <= 0) S.state[targetId] = C.EntityState.Dead;
        }

        // Inventory full
        if (S.entityInventory[i] >= C.INVENTORY_MAX_RESOURCE) {
          S.state[i] = C.EntityState.ReturningToDepot;
          S.targetEntityId[i] = -1;
          S.targetBuildingId[i] = -1;
        }
      }
    }

    // 3. RETURNING STATE: Deliver to Warehouse
    if (S.state[i] === C.EntityState.ReturningToDepot) {
      // Find nearest warehouse belonging to their group
      const whId = U.findNearestBuilding(
        S.positionX[i],
        S.positionY[i],
        1500,
        1,
        groupId,
      ); // 1 = Warehouse

      if (whId !== -1) {
        const dx = S.bldPositionX[whId] - S.positionX[i];
        const dy = S.bldPositionY[whId] - S.positionY[i];
        const distSq = dx * dx + dy * dy;

        if (distSq < C.DIST_SQ_DEPOT_RETURN) {
          // Within 10 units
          const resourceType = S.charTool[i];
          if (resourceType === 0) {
            Atomics.add(S.bldDataA, whId, S.entityInventory[i]); // Wood
          } else if (resourceType === 2) {
            Atomics.add(S.bldDataC, whId, S.entityInventory[i]); // Food
          }

          S.entityInventory[i] = 0;
          S.state[i] = C.EntityState.Idle; // Cycle complete
        }
      } else {
        // No warehouse found: Pioneer Founding logic
        const anchorX = S.groupWarehouseX[groupId];
        const anchorY = S.groupWarehouseY[groupId];

        const dx = anchorX - S.positionX[i];
        const dy = anchorY - S.positionY[i];
        const distSq = dx * dx + dy * dy;

        if (distSq < C.DIST_SQ_DEPOT_RETURN) {
          const resourceType = S.charTool[i];
          if (resourceType === 0) {
            Atomics.add(S.money, i, S.entityInventory[i]);
            if (Atomics.load(S.money, i) >= 200) {
              // FOUND SETTLEMENT (Place Blueprint)
              for (let b = 0; b < C.MAX_BUILDINGS; b++) {
                if (S.bldType[b] === 0) {
                  S.bldType[b] = 1; // Warehouse
                  S.bldPositionX[b] = anchorX;
                  S.bldPositionY[b] = anchorY;
                  S.bldHealth[b] = 1; // Start as foundation
                  S.bldTier[b] = 1;
                  S.bldOwnerGroup[b] = groupId;
                  S.bldDataA[b] = 200;
                  S.targetBuildingId[i] = b; // Lock target for construction
                  break;
                }
              }
              Atomics.store(S.money, i, 0);
              S.state[i] = C.EntityState.Construction;
            }
          }
          S.entityInventory[i] = 0;
          if (S.state[i] !== C.EntityState.Construction) {
            S.state[i] = C.EntityState.Idle;
          }
        }
      }
    }

    // 4. CONSTRUCTION STATE: Ramping building health
    if (S.state[i] === C.EntityState.Construction) {
      const bId = S.targetBuildingId[i];
      if (bId === -1 || S.bldType[bId] === 0) {
        S.state[i] = C.EntityState.Idle;
        continue;
      }

      const dx = S.bldPositionX[bId] - S.positionX[i];
      const dy = S.bldPositionY[bId] - S.positionY[i];
      const distSq = dx * dx + dy * dy;

      if (distSq < C.DIST_SQ_CONSTRUCT) {
        // "Work" on building
        const oldHealth = Atomics.add(S.bldHealth, bId, C.BUILD_HEALTH_PER_TICK);
        if (oldHealth >= C.BUILD_HEALTH_MAX - C.BUILD_HEALTH_PER_TICK) {
          Atomics.store(S.bldHealth, bId, C.BUILD_HEALTH_MAX); // Snap to max
          // Construction complete! Give starter food (100)
          Atomics.add(S.bldDataC, bId, 100);
          S.state[i] = C.EntityState.Idle;
          S.targetBuildingId[i] = -1;
        }
      }
    }
  }
}
