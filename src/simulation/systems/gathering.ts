import * as C from '../constants';
import * as S from '../state';

/**
 * Gathering System
 * Handles resource collection, delivery to warehouses, and building construction progress.
 */
export function runGatheringSystem(state: SharedArrayBuffer, startIndex: number, endIndex: number): void {
  for (let i = startIndex; i < endIndex; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;

    // 1. Harvesting Logic
    if (S.state[i] === C.EntityState.Harvesting) {
      const bldId = S.targetBuildingId[i];
      const targetId = S.targetEntityId[i];
      let tx = 0, ty = 0;
      if (bldId !== -1) { tx = S.bldPositionX[bldId]; ty = S.bldPositionY[bldId]; }
      else if (targetId !== -1) { tx = S.positionX[targetId]; ty = S.positionY[targetId]; }
      
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      if (dx * dx + dy * dy < 4.0) {
        S.actionTimer[i]--;
        if (S.actionTimer[i] <= 0) {
          if (bldId !== -1 && S.bldType[bldId] === C.BuildingType.Field) { 
            S.entityInventory[i] = 20; 
            S.charTool[i] = 2; // Food
          } else if (targetId !== -1) {
            const traits = S.traitBitmask[targetId];
            if ((traits & C.TRAIT_BUSH) !== 0) { S.entityInventory[i] = 10; S.charTool[i] = 2; }
            else if ((traits & C.TRAIT_TREE) !== 0) { S.entityInventory[i] = 50; S.charTool[i] = 0; }
            else if ((traits & C.TRAIT_GOLD) !== 0) { S.entityInventory[i] = 100; S.charTool[i] = 1; }
          }
          S.state[i] = C.EntityState.ReturningToDepot;
        }
      }
    } 
    
    // 2. Returning to Depot / Construction Logic
    else if (S.state[i] === C.EntityState.ReturningToDepot || S.state[i] === C.EntityState.Construction) {
      const bldId = S.targetBuildingId[i];
      if (bldId === -1 || S.bldHealth[bldId] <= 0) { 
        S.state[i] = C.EntityState.Idle; 
        continue; 
      }
      
      const dx = S.bldPositionX[bldId] - S.positionX[i], dy = S.bldPositionY[bldId] - S.positionY[i];
      if (dx * dx + dy * dy < 16.0) {
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
          } else { 
            Atomics.add(S.groupTotalWealth, gid, S.entityInventory[i]); 
          }
          S.entityInventory[i] = 0; 
          S.charTool[i] = -1;
          S.state[i] = C.EntityState.Idle;
        } else { 
          // Construction phase: Build up health
          Atomics.add(S.bldHealth, bldId, 10); 
          S.actionTimer[i]--; 
          if (S.actionTimer[i] <= 0) S.state[i] = C.EntityState.Idle; 
        }
      }
    }
  }

  // 3. Building Demographics & Inventories (Summary logic)
  if (S.tickCount % 60 === 0) {
    const bldStart = Math.floor((startIndex / C.MAX_ENTITIES) * C.MAX_BUILDINGS);
    const bldEnd = Math.floor((endIndex / C.MAX_ENTITIES) * C.MAX_BUILDINGS);
    for (let b = bldStart; b < bldEnd; b++) {
      if (S.bldHealth[b] > 0 && S.bldType[b] !== 0) {
        const gid = S.bldOwnerGroup[b];
        if (gid >= 0 && gid < C.MAX_GROUPS) {
          Atomics.add(S.groupBuildingCount, gid, 1);
          if (S.bldType[b] === C.BuildingType.Warehouse) {
            // Update group warehouse location (Any warehouse is valid as a hub)
            if (S.groupWarehouseX[gid] === 0) {
              S.groupWarehouseX[gid] = S.bldPositionX[b];
              S.groupWarehouseY[gid] = S.bldPositionY[b];
            }
            
            const wealth = S.bldDataA[b] + S.bldDataB[b] + S.bldDataC[b];
            Atomics.add(S.groupTotalWealth, gid, wealth);
            Atomics.add(S.groupWood, gid, S.bldDataA[b]);
            Atomics.add(S.groupGold, gid, S.bldDataB[b]);
            Atomics.add(S.groupFood, gid, S.bldDataC[b]);
            Atomics.add(S.groupHouseCapacity, gid, 20); // Base warehouse capacity
          } else if (S.bldType[b] === C.BuildingType.House) {
            Atomics.add(S.groupHouseCapacity, gid, S.bldDataB[b]);
          }
        }
      }
    }
  }
}
