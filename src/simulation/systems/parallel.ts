// src/simulation/systems/parallel.ts
import * as C from '../constants';
import * as S from '../state';
import * as U from '../utils';
import * as B from '../buffs';

/**
 * Spatial Update System - Phase 2
 * Rebuilds the singly-linked list spatial hash grid for characters.
 * Each cell in spatialHead points to the first character index in that cell.
 * Each character in spatialNext points to the next character in the same cell.
 */
export function SpatialUpdateSystem(): void {
  // Only quadrant 0 clears the heads
  if (S.quadrantIndex === 0) {
    S.spatialHead.fill(-1);
    S.bldSpatialHead.fill(-1);
    S.vehSpatialHead.fill(-1);
    S.itemSpatialHead.fill(-1);
  }
  
  // Wait for clear
  U.waitForAll(0);

  // Entities
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) {
      S.spatialNext[i] = -1;
      continue;
    }
    
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX || S.positionY[i] < S.minY || S.positionY[i] > S.maxY) {
      continue;
    }

    const tx = Math.floor(S.positionX[i] / C.GRID_SIZE);
    const ty = Math.floor(S.positionY[i] / C.GRID_SIZE);
    
    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      const cellIdx = ty * C.GRID_COLS + tx;
      if (cellIdx >= 0 && cellIdx < S.spatialHead.length) {
        S.spatialNext[i] = Atomics.exchange(S.spatialHead, cellIdx, i);
      }
    }
  }

  // Buildings
  for (let i = 0; i < C.MAX_BUILDINGS; i++) {
    if (S.bldHealth[i] <= 0 || S.bldType[i] === 0) continue;
    if (S.bldPositionX[i] < S.minX || S.bldPositionX[i] > S.maxX || S.bldPositionY[i] < S.minY || S.bldPositionY[i] > S.maxY) continue;

    const tx = Math.floor(S.bldPositionX[i] / C.GRID_SIZE);
    const ty = Math.floor(S.bldPositionY[i] / C.GRID_SIZE);
    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      const cellIdx = ty * C.GRID_COLS + tx;
      if (cellIdx >= 0 && cellIdx < S.bldSpatialHead.length) {
        S.bldSpatialNext[i] = Atomics.exchange(S.bldSpatialHead, cellIdx, i);
      }
    }
  }

  // Vehicles
  for (let i = 0; i < C.MAX_VEHICLES; i++) {
    if (S.vehHealth[i] <= 0 || S.vehType[i] === 0) continue;
    if (S.vehPositionX[i] < S.minX || S.vehPositionX[i] > S.maxX || S.vehPositionY[i] < S.minY || S.vehPositionY[i] > S.maxY) continue;

    const tx = Math.floor(S.vehPositionX[i] / C.GRID_SIZE);
    const ty = Math.floor(S.vehPositionY[i] / C.GRID_SIZE);
    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      const cellIdx = ty * C.GRID_COLS + tx;
      if (cellIdx >= 0 && cellIdx < S.vehSpatialHead.length) {
        S.vehSpatialNext[i] = Atomics.exchange(S.vehSpatialHead, cellIdx, i);
      }
    }
  }

  // Ground Items
  for (let i = 0; i < C.MAX_ITEM_INSTANCES; i++) {
    if (S.itemInstanceOwnerType[i] !== C.OWNER_TYPE_GROUND) continue;
    if (S.itemInstanceX[i] < S.minX || S.itemInstanceX[i] > S.maxX || S.itemInstanceY[i] < S.minY || S.itemInstanceY[i] > S.maxY) continue;

    const tx = Math.floor(S.itemInstanceX[i] / C.GRID_SIZE);
    const ty = Math.floor(S.itemInstanceY[i] / C.GRID_SIZE);
    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      const cellIdx = ty * C.GRID_COLS + tx;
      if (cellIdx >= 0 && cellIdx < S.itemSpatialHead.length) {
        S.itemSpatialNext[i] = Atomics.exchange(S.itemSpatialHead, cellIdx, i);
      }
    }
  }
}

export function LifeSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead || (S.traitBitmask[i] & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0) {
      continue;
    }

    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX) continue;
    if (S.positionX[i] === S.maxX && S.maxX < C.WORLD_WIDTH) continue;
    if (S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;
    if (S.positionY[i] === S.maxY && S.maxY < C.WORLD_HEIGHT) continue;

    let decayRate = 1;
    if (S.money[i] > 0) decayRate = 0;
    if (S.state[i] === C.EntityState.Harvesting || S.state[i] === C.EntityState.ReturningToDepot) decayRate = 0;
    if (S.tickCount % (240 + (i % 60)) === 0) S.health[i] -= decayRate;

    // Territorial Attrition
    if (S.tickCount % 60 === 0) {
      const tx = Math.floor(S.positionX[i] / C.TILE_SIZE), ty = Math.floor(S.positionY[i] / C.TILE_SIZE);
      const tileIdx = ty * C.WORLD_MAP_COLS + tx;
      const owner = S.territoryOwnerMap[tileIdx];
      if (owner !== -1) {
        const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
        if (gid !== -1 && owner !== gid) {
          const rel = S.groupRelationsMatrix[gid * C.MAX_GROUPS + owner];
          if (rel < -20) S.health[i] -= 2;
        }
      }
    }

    if (S.health[i] <= 0) {
      const deadX = S.positionX[i];
      const deadY = S.positionY[i];
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0];
      
      // DROP LOOT
      // 1. Drop money
      if (S.money[i] > 0) {
        const moneyPerItem = 100;
        const count = Math.min(10, Math.floor(S.money[i] / moneyPerItem));
        for (let l = 0; l < count; l++) {
          U.createItemInstance(1, 1, deadX + (Math.random() - 0.5) * 10, deadY + (Math.random() - 0.5) * 10);
        }
      }
      // 2. Drop equipment
      if (S.charWeapon[i] !== -1) { U.setItemInstanceGround(S.charWeapon[i], deadX, deadY); S.charWeapon[i] = -1; }
      if (S.charArmor[i] !== -1) { U.setItemInstanceGround(S.charArmor[i], deadX, deadY); S.charArmor[i] = -1; }
      if (S.charTool[i] !== -1) { U.setItemInstanceGround(S.charTool[i], deadX, deadY); S.charTool[i] = -1; }

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

export function IntelReportingSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead || (S.traitBitmask[i] & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX || S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;

    if (S.state[i] === C.EntityState.ReportingIntel) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const wx = S.groupWarehouseX[gid]; const wy = S.groupWarehouseY[gid];
      const dx = wx - S.positionX[i]; const dy = wy - S.positionY[i];
      if (dx * dx + dy * dy < 256.0) {
        const enemyId = S.carriedIntelEntityId[i];
        if (enemyId !== -1) {
          S.groupTargetEntityId[gid] = enemyId;
          S.groupTargetX[gid] = S.carriedIntelX[i];
          S.groupTargetY[gid] = S.carriedIntelY[i];
          S.groupTargetAge[gid] = 0;
          S.carriedIntelEntityId[i] = -1;
        }
        S.state[i] = C.EntityState.Idle;
      }
    }
  }
}

function HandleLocalizedConstruction(i: number, gid: number): boolean {
  // Only attempt construction periodically to save cycles
  if (S.tickCount % (180 + (i % 60)) !== 0) return false;
  if (S.groupBuildingCount[gid] >= 100) return false;

  const wood = S.groupWood[gid];
  const gold = S.groupGold[gid];
  const pop = S.groupPopulationCount[gid];
  const cap = S.groupHouseCapacity[gid];

  let buildType = C.BuildingType.None;
  let costWood = 0;
  let costGold = 0;

  // Determine what to build based on group needs
  if (S.groupFood[gid] < pop * 10 && wood >= 200) {
    buildType = C.BuildingType.Field; costWood = 200;
  } else if (pop >= cap - 10 && wood >= 300) {
    buildType = C.BuildingType.House; costWood = 300;
  } else if (wood >= 1000 && gold >= 500 && S.groupBuildingCount[gid] < 50) {
    buildType = C.BuildingType.Tower; costWood = 1000; costGold = 500;
  }

  if (buildType === C.BuildingType.None) return false;

  // Find nearest warehouse to check real-time stock
  const whId = U.findNearestOwnedBuilding(S.positionX[i], S.positionY[i], 2000, C.BuildingType.Warehouse, gid);
  if (whId === -1) return false;

  // Atomic check for resources
  const currentWood = Atomics.load(S.bldDataA, whId);
  const currentGold = Atomics.load(S.bldDataB, whId);
  if (currentWood < costWood || currentGold < costGold) return false;

  // Try to find a valid expansion spot
  for (let attempt = 0; attempt < 5; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 150;
    const buildX = S.positionX[i] + Math.cos(angle) * dist;
    const buildY = S.positionY[i] + Math.sin(angle) * dist;

    // Localized expansion: check if within influence
    if (U.isInGroupInfluence(buildX, buildY, gid)) {
      // Density check: don't crowd buildings
      if (U.findNearestBuilding(buildX, buildY, 40, -1) === -1) {
        // Find empty building slot
        for (let b = 0; b < C.MAX_BUILDINGS; b++) {
          if (Atomics.compareExchange(S.bldType, b, 0, buildType) === 0) {
            // Deduct resources atomically
            Atomics.sub(S.bldDataA, whId, costWood);
            Atomics.sub(S.bldDataB, whId, costGold);

            // Initialize building
            S.bldPositionX[b] = buildX;
            S.bldPositionY[b] = buildY;
            S.bldHealth[b] = 10; // Starts with low health, character builds it up
            S.bldOwnerGroup[b] = gid;
            S.bldTier[b] = C.BLD_TIER_1;
            S.bldDataA[b] = 0;
            S.bldDataB[b] = (buildType === C.BuildingType.House ? 20 : 0);
            S.bldDataC[b] = 0;

            S.targetBuildingId[i] = b;
            S.state[i] = C.EntityState.Construction;
            S.actionTimer[i] = 200; // Time to build
            return true;
          }
        }
      }
    }
  }

  return false;
}

export function AutonomySystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead || (S.traitBitmask[i] & C.TRAIT_TREE) !== 0) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX) continue;
    if (S.positionX[i] === S.maxX && S.maxX < C.WORLD_WIDTH) continue;
    if (S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;
    if (S.positionY[i] === S.maxY && S.maxY < C.WORLD_HEIGHT) continue;

    if (S.targetEntityId[i] === -3) continue; // Manual command override

    // === PRIORITY 1: SURVIVAL ===
    const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0];
    let survivalTask: number = -1;
    if (gid >= 0 && gid < C.MAX_GROUPS) {
      const groupFood = S.groupFood[gid];
      const pop = S.groupPopulationCount[gid];
      const foodNeeded = Math.max(1, Math.floor(pop * 0.1));
      if (groupFood > 0 && groupFood < foodNeeded * 5) {
        const bushId = U.findNearest(S.positionX[i], S.positionY[i], 500, C.TRAIT_BUSH);
        if (bushId !== -1) { survivalTask = 0; S.targetEntityId[i] = bushId; S.targetBuildingId[i] = -1; }
        else {
          const fieldId = U.findNearestBuilding(S.positionX[i], S.positionY[i], 500, C.BuildingType.Field);
          if (fieldId !== -1 && S.bldOwnerGroup[fieldId] === gid) { survivalTask = 1; S.targetBuildingId[i] = fieldId; S.targetEntityId[i] = -1; }
        }
      }
    }
    if (survivalTask !== -1) { S.state[i] = C.EntityState.Harvesting; S.actionTimer[i] = 0; continue; }

    // === PRIORITY 2: THREATS ===
    const enemyId = U.findNearest(S.positionX[i], S.positionY[i], 120, C.TRAIT_AGGRESSIVE);
    if (enemyId !== -1) { S.state[i] = C.EntityState.Fleeing; S.targetEntityId[i] = enemyId; S.actionTimer[i] = 120; continue; }

    // === PRIORITY 3: GROUP COMMANDS ===
    if (S.state[i] === C.EntityState.Combat || S.state[i] === C.EntityState.Trading || S.state[i] === C.EntityState.ReportingIntel) continue;

    // === PRIORITY 4: CONSTRUCTION & LOCALIZED EXPANSION ===
    if (gid >= 0 && gid < C.MAX_GROUPS) {
      if (HandleLocalizedConstruction(i, gid)) continue;
    }

    // === PRIORITY 5: IDLE & LOOTING DISCOVERY ===
    if (S.tickCount % (60 + (i % 30)) === 0) {
      const tx = Math.floor(S.positionX[i] / C.GRID_SIZE);
      const ty = Math.floor(S.positionY[i] / C.GRID_SIZE);
      if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
        const cellIdx = ty * C.GRID_COLS + tx;
        let itemId = S.itemSpatialHead[cellIdx];
        let safety = 0;
        while (itemId !== -1 && safety++ < 64) {
          if (itemId >= 0 && itemId < C.MAX_ITEM_INSTANCES) {
            const defId = S.itemInstanceDefId[itemId];
            if (defId >= 0 && defId < C.MAX_ITEM_DEFINITIONS) {
              const baseType = S.itemDefBaseType[defId];
              if (baseType === C.ITEM_BASE_MELEE) {
                if (S.charWeapon[i] === -1 || S.itemDefStatA[defId] > S.effectiveDamage[i]) {
                  S.targetItemId[i] = itemId;
                  S.state[i] = C.EntityState.Looting;
                  break;
                }
              }
            }
          }
          itemId = S.itemSpatialNext[itemId];
        }
      }
    }
    if (S.state[i] === C.EntityState.Looting) continue;

    S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60 + (i % 60); S.targetEntityId[i] = -1; S.targetBuildingId[i] = -1;
  }
}

export function SteeringSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    const traits = S.traitBitmask[i];
    if ((traits & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0) { S.velocityX[i] = 0; S.velocityY[i] = 0; continue; }
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX || S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;

    const targetId = S.targetEntityId[i];

    // Boarding Logic
    const vId = S.targetVehicleId[i];
    if (vId !== -1 && S.isMounted[i] === 0) {
      const dx = S.vehPositionX[vId] - S.positionX[i];
      const dy = S.vehPositionY[vId] - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < 25.0) {
        if (Atomics.compareExchange(S.vehPilotId, vId, -1, i) === -1) {
          S.isMounted[i] = 1;
        } else {
          let passengers = 0;
          for (let p = 0; p < C.MAX_ENTITIES; p++) {
            if (S.isMounted[p] === 1 && S.targetVehicleId[p] === vId) passengers++;
          }
          const maxP = S.vehType[vId] === C.VEHICLE_SHIP ? C.MAX_PASSENGERS_SHIP : C.MAX_PASSENGERS_WAGON;
          if (passengers < maxP) S.isMounted[i] = 1;
        }
      }
    }

    if (targetId === -3) {
      const tx = S.playerTargetX[i], ty = S.playerTargetY[i];
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq > 4.0) {
        const dist = Math.sqrt(distSq);
        const speed = S.effectiveSpeed[i] || 1.0;
        S.velocityX[i] = (dx / dist) * speed * 2.0;
        S.velocityY[i] = (dy / dist) * speed * 2.0;
      } else { S.velocityX[i] = 0; S.velocityY[i] = 0; S.targetEntityId[i] = -1; }
      continue;
    }

    if (S.isMounted[i] === 1) {
      const vId = S.targetVehicleId[i];
      if (vId === -1 || S.vehHealth[vId] <= 0) { S.isMounted[i] = 0; S.targetVehicleId[i] = -1; continue; }
      if (S.vehPilotId[vId] !== i) { S.velocityX[i] = 0; S.velocityY[i] = 0; }
      else {
        const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
        let tx = S.positionX[i], ty = S.positionY[i];
        if (S.state[i] === C.EntityState.Combat && S.targetEntityId[i] !== -1) { tx = S.groupTargetX[gid]; ty = S.groupTargetY[gid]; }
        else { tx += (Math.random() - 0.5) * 100; ty += (Math.random() - 0.5) * 100; }
        const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1.0) { S.vehVelocityX[vId] = (dx / dist) * 1.5; S.vehVelocityY[vId] = (dy / dist) * 1.5; }
      }
      continue;
    }

    if (S.state[i] === C.EntityState.Idle) {
      if (Math.random() > 0.98) { S.velocityX[i] = (Math.random() - 0.5) * 2; S.velocityY[i] = (Math.random() - 0.5) * 2; }
    } else if (S.state[i] === C.EntityState.Fleeing) {
      const enemyX = S.positionX[targetId], enemyY = S.positionY[targetId];
      const dx = S.positionX[i] - enemyX, dy = S.positionY[i] - enemyY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) { S.velocityX[i] = (dx / dist) * 2.5; S.velocityY[i] = (dy / dist) * 2.5; }
    } else if (S.state[i] === C.EntityState.Harvesting) {
      const bldId = S.targetBuildingId[i];
      let tx = 0, ty = 0;
      if (bldId !== -1) { tx = S.bldPositionX[bldId]; ty = S.bldPositionY[bldId]; }
      else if (targetId !== -1) { tx = S.positionX[targetId]; ty = S.positionY[targetId]; }
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < 4.0) {
        S.velocityX[i] = 0; S.velocityY[i] = 0; S.actionTimer[i]--;
        if (S.actionTimer[i] <= 0) {
          if (bldId !== -1 && S.bldType[bldId] === C.BuildingType.Field) { S.entityInventory[i] = 20; S.charTool[i] = 2; }
          else if (targetId !== -1) {
            const traits = S.traitBitmask[targetId];
            if ((traits & C.TRAIT_BUSH) !== 0) { S.entityInventory[i] = 10; S.charTool[i] = 2; }
            else if ((traits & C.TRAIT_TREE) !== 0) { S.entityInventory[i] = 50; S.charTool[i] = 0; }
            else if ((traits & C.TRAIT_GOLD) !== 0) { S.entityInventory[i] = 100; S.charTool[i] = 1; }
          }
          S.state[i] = C.EntityState.ReturningToDepot;
        }
      } else { const dist = Math.sqrt(distSq); S.velocityX[i] = (dx / dist) * 1.8; S.velocityY[i] = (dy / dist) * 1.8; }
    } else if (S.state[i] === C.EntityState.ReturningToDepot || S.state[i] === C.EntityState.Construction) {
      const bldId = S.targetBuildingId[i];
      if (bldId === -1 || S.bldHealth[bldId] <= 0) { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 1; continue; }
      const dx = S.bldPositionX[bldId] - S.positionX[i], dy = S.bldPositionY[bldId] - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < 16.0) {
        if (S.state[i] === C.EntityState.ReturningToDepot) {
          const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
          const invSlot = S.charTool[i];
          if (S.bldType[bldId] === C.BuildingType.Warehouse) {
            const tier = S.bldTier[bldId];
            let limit = 5000;
            if (tier === 2) limit = 25000; else if (tier === 3) limit = 100000;
            const currentAmount = invSlot === 0 ? S.bldDataA[bldId] : (invSlot === 1 ? S.bldDataB[bldId] : S.bldDataC[bldId]);
            const amountToDeposit = Math.min(S.entityInventory[i], Math.max(0, limit - currentAmount));
            if (amountToDeposit > 0) {
              if (invSlot === 0) Atomics.add(S.bldDataA, bldId, amountToDeposit);
              else if (invSlot === 1) Atomics.add(S.bldDataB, bldId, amountToDeposit);
              else if (invSlot === 2) Atomics.add(S.bldDataC, bldId, amountToDeposit);
              Atomics.add(S.groupTotalWealth, gid, amountToDeposit);
            }
          } else { Atomics.add(S.groupTotalWealth, gid, S.entityInventory[i]); }
          S.entityInventory[i] = 0; S.charTool[i] = -1;
        } else { Atomics.add(S.bldHealth, bldId, 10); S.actionTimer[i]--; if (S.actionTimer[i] <= 0) S.state[i] = C.EntityState.Idle; }
      } else { const dist = Math.sqrt(distSq); S.velocityX[i] = (dx / dist) * 1.8; S.velocityY[i] = (dy / dist) * 1.8; }
    } else if (S.state[i] === C.EntityState.Combat) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const tx = S.groupTargetX[gid], ty = S.groupTargetY[gid];
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < 256.0) { S.velocityX[i] = 0; S.velocityY[i] = 0; }
      else { const dist = Math.sqrt(distSq); S.velocityX[i] = (dx / dist) * 2.0; S.velocityY[i] = (dy / dist) * 2.0; }
    } else if (S.state[i] === C.EntityState.Trading) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const targetGid = -S.targetEntityId[i] - 1000;
      const tx = S.groupWarehouseX[targetGid], ty = S.groupWarehouseY[targetGid];
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < 16.0) { Atomics.add(S.groupTotalWealth, targetGid, S.entityInventory[i]); S.entityInventory[i] = 0; S.state[i] = C.EntityState.Idle; }
      else { const dist = Math.sqrt(distSq); S.velocityX[i] = (dx / dist) * 1.8; S.velocityY[i] = (dy / dist) * 1.8; }
    } else if (S.state[i] === C.EntityState.ReportingIntel) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const tx = S.groupWarehouseX[gid], ty = S.groupWarehouseY[gid];
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq > 1.0) { const dist = Math.sqrt(distSq); S.velocityX[i] = (dx / dist) * 1.8; S.velocityY[i] = (dy / dist) * 1.8; }
    } else if (S.state[i] === C.EntityState.Looting) {
      const targetItem = S.targetItemId[i];
      if (targetItem === -1 || targetItem >= C.MAX_ITEM_INSTANCES || S.itemInstanceOwnerType[targetItem] !== C.OWNER_TYPE_GROUND) { 
        S.state[i] = C.EntityState.Idle; S.targetItemId[i] = -1; continue; 
      }
      const dx = S.itemInstanceX[targetItem] - S.positionX[i], dy = S.itemInstanceY[targetItem] - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq > 4.0) {
        const dist = Math.sqrt(distSq);
        const speed = S.effectiveSpeed[i] || 1.8;
        S.velocityX[i] = (dx / dist) * speed;
        S.velocityY[i] = (dy / dist) * speed;
      } else {
        // ATOMIC CHECK: Ensure item is still on ground
        if (Atomics.compareExchange(S.itemInstanceOwnerType, targetItem, C.OWNER_TYPE_GROUND, C.OWNER_TYPE_CHARACTER) === C.OWNER_TYPE_GROUND) {
          if (S.charWeapon[i] !== -1) { U.setItemInstanceGround(S.charWeapon[i], S.positionX[i], S.positionY[i]); }
          S.itemInstanceOwnerId[targetItem] = i;
          S.charWeapon[i] = targetItem; S.targetItemId[i] = -1; S.state[i] = C.EntityState.Idle;
          B.ApplyEquipmentModifiers(i);
        } else {
          // Lost the race to another entity
          S.state[i] = C.EntityState.Idle; S.targetItemId[i] = -1;
        }
      }
    }

    if ((S.traitBitmask[i] & C.TRAIT_SCOUT) !== 0 && S.state[i] === C.EntityState.Idle) {
      const enemyId = U.findNearest(S.positionX[i], S.positionY[i], 150, C.TRAIT_AGGRESSIVE);
      if (enemyId !== -1) {
        const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
        if (gid !== -1) {
          S.carriedIntelEntityId[i] = enemyId; S.carriedIntelX[i] = S.positionX[enemyId]; S.carriedIntelY[i] = S.positionY[enemyId];
          const dx = S.groupWarehouseX[gid] - S.positionX[i], dy = S.groupWarehouseY[gid] - S.positionY[i];
          if ((S.traitBitmask[i] & C.TRAIT_MAGIC) !== 0 && S.mana[i] >= 50 && (dx * dx + dy * dy < 160000) && S.groupMagicFrequency[gid] === 1) {
            S.groupTargetEntityId[gid] = enemyId; S.groupTargetX[gid] = S.positionX[enemyId]; S.groupTargetY[gid] = S.positionY[enemyId]; S.groupTargetAge[gid] = 0;
            S.mana[i] -= 50; S.carriedIntelEntityId[i] = -1;
            self.postMessage({ type: "MAGIC_BURST", payload: { entityId: i, fromX: S.positionX[i], fromY: S.positionY[i], toX: S.groupWarehouseX[gid], toY: S.groupWarehouseY[gid] } });
          } else S.state[i] = C.EntityState.ReportingIntel;
        }
      }
    }
  }
}

export function ProjectileSystem(): void {
  for (let i = 0; i < C.MAX_PROJECTILES; i++) {
    if (S.projType[i] === 0 || S.projLifeTime[i] <= 0) continue;
    const x = S.projPositionX[i], y = S.projPositionY[i];
    if (x < S.minX || x > S.maxX || y < S.minY || y > S.maxY) continue;
    S.projLifeTime[i]--;
    if (S.projLifeTime[i] <= 0) { S.projType[i] = 0; continue; }
    S.projPositionX[i] += S.projVelocityX[i]; S.projPositionY[i] += S.projVelocityY[i];
    const tx = Math.floor(S.projPositionX[i] / C.GRID_SIZE), ty = Math.floor(S.projPositionY[i] / C.GRID_SIZE);
    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      let victimId = S.spatialHead[ty * C.GRID_COLS + tx];
      const ownerGroup = S.projOwnerGroup[i];
      while (victimId !== -1) {
        if (S.health[victimId] > 0 && S.state[victimId] !== C.EntityState.Dead) {
          const victimGroup = S.groupAffiliations[victimId * C.MAX_GROUP_CHANNELS + 0];
          let isEnemy = false;
          if (ownerGroup !== -1 && victimGroup !== -1 && ownerGroup !== victimGroup) {
            if (S.groupRelationsMatrix[ownerGroup * C.MAX_GROUPS + victimGroup] < -50) isEnemy = true;
          }
          if (isEnemy) {
            const dx = S.positionX[victimId] - S.projPositionX[i], dy = S.positionY[victimId] - S.projPositionY[i];
            if (dx * dx + dy * dy < 16.0) { Atomics.sub(S.health, victimId, 25); S.targetEntityId[victimId] = ownerGroup >= 0 ? S.groupWarehouseX[ownerGroup] : -1; S.projType[i] = 0; S.projLifeTime[i] = 0; break; }
          }
        }
        victimId = S.spatialNext[victimId];
      }
    }
  }
}

export function AuraSystem(): void {
  for (let b = 0; b < C.MAX_BUILDINGS; b++) {
    if (S.bldHealth[b] <= 0 || S.bldType[b] === 0) continue;
    const bx = S.bldPositionX[b], by = S.bldPositionY[b];
    if (bx < S.minX || bx > S.maxX || by < S.minY || by > S.maxY) continue;
    if (S.bldType[b] === C.BuildingType.MindControl) {
      const ownerGroup = S.bldOwnerGroup[b], range = 150.0, rangeSq = range * range;
      const cellRadius = Math.ceil(range / C.GRID_SIZE), btx = Math.floor(bx / C.GRID_SIZE), bty = Math.floor(by / C.GRID_SIZE);
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
          const tx = btx + dx, ty = bty + dy;
          if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
            let entityId = S.spatialHead[ty * C.GRID_COLS + tx];
            while (entityId !== -1) {
              if (S.health[entityId] > 0 && S.state[entityId] !== C.EntityState.Dead) {
                const dx = S.positionX[entityId] - bx, dy = S.positionY[entityId] - by;
                if (dx * dx + dy * dy < rangeSq) S.groupAffiliations[entityId * C.MAX_GROUP_CHANNELS + 0] = ownerGroup;
              }
              entityId = S.spatialNext[entityId];
            }
          }
        }
      }
    }
  }
}

/**
 * Movement System - Phase 3
 * Physical integration of velocity into position
 */
export function MovementSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead || (S.traitBitmask[i] & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0) continue;
    if (S.isMounted[i] === 1) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX || S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;

    let moveX = S.velocityX[i];
    let moveY = S.velocityY[i];

    // Terrain Speed Modifiers
    const tx = Math.floor(S.positionX[i] / C.TILE_SIZE);
    const ty = Math.floor(S.positionY[i] / C.TILE_SIZE);
    const tileIdx = ty * C.WORLD_MAP_COLS + tx;
    const terrain = S.worldMap[tileIdx];

    if (terrain === C.TerrainType.Forest) { moveX *= 0.6; moveY *= 0.6; }
    else if (terrain === C.TerrainType.Water) { moveX *= 0.3; moveY *= 0.3; }

    S.positionX[i] += moveX;
    S.positionY[i] += moveY;

    // Bounds checking
    if (S.positionX[i] < 0) S.positionX[i] = 0;
    if (S.positionX[i] > C.WORLD_WIDTH) S.positionX[i] = C.WORLD_WIDTH;
    if (S.positionY[i] < 0) S.positionY[i] = 0;
    if (S.positionY[i] > C.WORLD_HEIGHT) S.positionY[i] = C.WORLD_HEIGHT;
  }

  // Vehicles
  for (let i = 0; i < C.MAX_VEHICLES; i++) {
    if (S.vehHealth[i] <= 0 || S.vehType[i] === 0) continue;
    if (S.vehPositionX[i] < S.minX || S.vehPositionX[i] > S.maxX || S.vehPositionY[i] < S.minY || S.vehPositionY[i] > S.maxY) continue;

    const nextX = S.vehPositionX[i] + S.vehVelocityX[i];
    const nextY = S.vehPositionY[i] + S.vehVelocityY[i];
    const tx = Math.floor(nextX / C.TILE_SIZE);
    const ty = Math.floor(nextY / C.TILE_SIZE);
    const tileIdx = ty * C.WORLD_MAP_COLS + tx;

    if (tx >= 0 && tx < C.WORLD_MAP_COLS && ty >= 0 && ty < C.WORLD_MAP_ROWS) {
      const terrain = S.worldMap[tileIdx];
      let blocked = false;
      if (S.vehType[i] === C.VEHICLE_SHIP && terrain !== C.TerrainType.Water) blocked = true;
      if (S.vehType[i] === C.VEHICLE_WAGON && (terrain === C.TerrainType.Water || terrain === C.TerrainType.Mountain)) blocked = true;
      
      if (blocked) {
        S.vehVelocityX[i] = 0; S.vehVelocityY[i] = 0;
        continue;
      }
    }

    S.vehPositionX[i] += S.vehVelocityX[i];
    S.vehPositionY[i] += S.vehVelocityY[i];

    // Bounds checking
    if (S.vehPositionX[i] < 0) S.vehPositionX[i] = 0;
    if (S.vehPositionX[i] > C.WORLD_WIDTH) S.vehPositionX[i] = C.WORLD_WIDTH;
    if (S.vehPositionY[i] < 0) S.vehPositionY[i] = 0;
    if (S.vehPositionY[i] > C.WORLD_HEIGHT) S.vehPositionY[i] = C.WORLD_HEIGHT;
  }

  // Passenger Position Sync
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.isMounted[i] === 1) {
      const vId = S.targetVehicleId[i];
      if (vId !== -1) {
        if (S.vehPositionX[vId] >= S.minX && S.vehPositionX[vId] <= S.maxX && 
            S.vehPositionY[vId] >= S.minY && S.vehPositionY[vId] <= S.maxY) {
          S.positionX[i] = S.vehPositionX[vId];
          S.positionY[i] = S.vehPositionY[vId];
        }
      }
    }
  }
}
