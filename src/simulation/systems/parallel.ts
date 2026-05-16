// src/simulation/systems/parallel.ts
import * as C from '../constants';
import * as S from '../state';
import * as U from '../utils';

export function SpatialUpdateSystem(): void {
  // Clear local domain in spatialHead + ghost cells (50px padding)
  const startX = Math.max(0, Math.floor((S.minX - 100) / C.GRID_SIZE));
  const endX = Math.min(C.GRID_COLS - 1, Math.floor((S.maxX + 100) / C.GRID_SIZE));
  const startY = Math.max(0, Math.floor((S.minY - 100) / C.GRID_SIZE));
  const endY = Math.min(C.GRID_ROWS - 1, Math.floor((S.maxY + 100) / C.GRID_SIZE));

  for (let cy = startY; cy <= endY; cy++) {
    for (let cx = startX; cx <= endX; cx++) {
      const idx = cy * C.GRID_COLS + cx;
      S.spatialHead[idx] = -1;
      S.bldSpatialHead[idx] = -1;
      S.vehSpatialHead[idx] = -1;
    }
  }

  // Hash Entities
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;
    let worldX = S.positionX[i], worldY = S.positionY[i];
    if (worldX < S.minX - 50 || worldX >= S.maxX + 50 || worldY < S.minY - 50 || worldY >= S.maxY + 50) continue;

    let cellX = Math.floor(worldX / C.GRID_SIZE);
    let cellY = Math.floor(worldY / C.GRID_SIZE);
    cellX = Math.max(0, Math.min(C.GRID_COLS - 1, cellX));
    cellY = Math.max(0, Math.min(C.GRID_ROWS - 1, cellY));
    const cellIndex = cellY * C.GRID_COLS + cellX;
    
    S.spatialNext[i] = S.spatialHead[cellIndex];
    S.spatialHead[cellIndex] = i;
  }

  // Hash Buildings
  for (let i = 0; i < C.MAX_BUILDINGS; i++) {
    if (S.bldHealth[i] <= 0 || S.bldType[i] === 0) continue;
    let worldX = S.bldPositionX[i], worldY = S.bldPositionY[i];
    if (worldX < S.minX - 50 || worldX >= S.maxX + 50 || worldY < S.minY - 50 || worldY >= S.maxY + 50) continue;

    let cellX = Math.floor(worldX / C.GRID_SIZE);
    let cellY = Math.floor(worldY / C.GRID_SIZE);
    cellX = Math.max(0, Math.min(C.GRID_COLS - 1, cellX));
    cellY = Math.max(0, Math.min(C.GRID_ROWS - 1, cellY));
    const cellIndex = cellY * C.GRID_COLS + cellX;
    
    S.bldSpatialNext[i] = S.bldSpatialHead[cellIndex];
    S.bldSpatialHead[cellIndex] = i;
  }

  // Hash Vehicles
  for (let i = 0; i < C.MAX_VEHICLES; i++) {
    if (S.vehHealth[i] <= 0 || S.vehType[i] === 0) continue;
    let worldX = S.vehPositionX[i], worldY = S.vehPositionY[i];
    if (worldX < S.minX - 50 || worldX >= S.maxX + 50 || worldY < S.minY - 50 || worldY >= S.maxY + 50) continue;

    let cellX = Math.floor(worldX / C.GRID_SIZE);
    let cellY = Math.floor(worldY / C.GRID_SIZE);
    cellX = Math.max(0, Math.min(C.GRID_COLS - 1, cellX));
    cellY = Math.max(0, Math.min(C.GRID_ROWS - 1, cellY));
    const cellIndex = cellY * C.GRID_COLS + cellX;
    
    S.vehSpatialNext[i] = S.vehSpatialHead[cellIndex];
    S.vehSpatialHead[cellIndex] = i;
  }
}

export function LifeSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX) continue;
    if (S.positionX[i] === S.maxX && S.maxX < C.WORLD_WIDTH) continue;
    if (S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;
    if (S.positionY[i] === S.maxY && S.maxY < C.WORLD_HEIGHT) continue;

    if ((S.traitBitmask[i] & C.TRAIT_TREE) !== 0) continue;
    
    if ((S.traitBitmask[i] & C.TRAIT_LOOT) !== 0) {
      S.health[i]--; // Decay loot timer
      continue;
    }

    let decayRate = 1;
    if (S.money[i] > 0) decayRate = 0;
    if (S.state[i] === C.EntityState.Harvesting || S.state[i] === C.EntityState.ReturningToDepot) decayRate = 0;
    if (S.tickCount % (240 + (i % 60)) === 0) S.health[i] -= decayRate;

    // Territorial Attrition
    if (S.tickCount % 60 === 0) {
      const tx = Math.floor(S.positionX[i] / C.TILE_SIZE), ty = Math.floor(S.positionY[i] / C.TILE_SIZE);
      if (tx >= 0 && tx < C.WORLD_MAP_COLS && ty >= 0 && ty < C.WORLD_MAP_ROWS) {
        const owner = S.territoryOwnerMap[ty * C.WORLD_MAP_COLS + tx];
        const gid = S.groupAffiliations[i * 8];
        if (owner !== -1 && owner !== gid) {
           const rel = S.groupRelationsMatrix[gid * C.MAX_GROUPS + owner];
           if (rel < -50) S.health[i] -= 2;
        }
      }
    }

    if (S.state[i] === C.EntityState.Harvesting && S.targetEntityId[i] !== -1) {
      if (S.tickCount % 4 === 0) { S.health[i]++; if (S.health[i] > 100) S.health[i] = 100; }
    }
    if (S.health[i] <= 0) {
      const isResource = (S.traitBitmask[i] & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0;
      const isCharacter = !isResource && (S.traitBitmask[i] & C.TRAIT_LOOT) === 0;

      if (isCharacter && (S.charWeapon[i] > 0 || S.charArmor[i] > 0 || S.charTool[i] > 0 || S.money[i] > 100)) {
        // Drop Loot Pile
        S.traitBitmask[i] = C.TRAIT_LOOT;
        S.health[i] = 1000; // Duration of loot pile
        S.state[i] = C.EntityState.Idle;
        S.velocityX[i] = 0; S.velocityY[i] = 0;
        // Keep money/items on the entity for others to harvest
        continue;
      }

      if ((S.traitBitmask[i] & C.TRAIT_COURIER) !== 0 && S.entityInventory[i] > 0) {
        const attackerId = S.targetEntityId[i];
        if (attackerId >= 0 && attackerId < C.MAX_ENTITIES) {
          const attackerGroup = S.groupAffiliations[attackerId * 8];
          if (attackerGroup >= 0 && attackerGroup < C.MAX_GROUPS) {
            S.groupTotalWealth[attackerGroup] += S.entityInventory[i];
          }
        }
      }
      S.state[i] = C.EntityState.Dead;
      S.positionX[i] = -1000.0; S.positionY[i] = -1000.0;
      S.targetEntityId[i] = -1; S.targetBuildingId[i] = -1; S.velocityX[i] = 0; S.velocityY[i] = 0;
      S.entityInventory[i] = 0; S.actionTimer[i] = 0;
      S.charWeapon[i] = 0; S.charArmor[i] = 0; S.charTool[i] = 0;
      
      if (!isResource) S.traitBitmask[i] = C.TRAIT_NONE;
    }
  }
}

export function MovementSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX) continue;
    if (S.positionX[i] === S.maxX && S.maxX < C.WORLD_WIDTH) continue;
    if (S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;
    if (S.positionY[i] === S.maxY && S.maxY < C.WORLD_HEIGHT) continue;

    // Mounted Sync
    if (S.isMounted[i] === 1) {
      const vId = S.targetVehicleId[i];
      if (vId !== -1 && S.vehHealth[vId] > 0) {
        S.positionX[i] = S.vehPositionX[vId];
        S.positionY[i] = S.vehPositionY[vId];
        continue;
      } else {
        S.isMounted[i] = 0;
        S.targetVehicleId[i] = -1;
      }
    }

    const nextX = S.positionX[i] + S.velocityX[i];
    const nextY = S.positionY[i] + S.velocityY[i];

    const tileX = Math.max(0, Math.min(C.WORLD_MAP_COLS - 1, Math.floor(nextX / C.TILE_SIZE)));
    const tileY = Math.max(0, Math.min(C.WORLD_MAP_ROWS - 1, Math.floor(nextY / C.TILE_SIZE)));
    const tileIndex = tileY * C.WORLD_MAP_COLS + tileX;
    
    let speedModifier = 1.0;
    const terrainType = S.worldMap[tileIndex];
    
    if (terrainType === C.TerrainType.Forest) speedModifier = 0.6;
    if (terrainType === C.TerrainType.Water) speedModifier = 0.3;
    if (terrainType === C.TerrainType.Mountain) {
      // Impassable: stop and bounce
      S.velocityX[i] *= -0.5;
      S.velocityY[i] *= -0.5;
      continue;
    }

    S.positionX[i] += S.velocityX[i] * speedModifier; 
    S.positionY[i] += S.velocityY[i] * speedModifier;
    
    if (S.positionX[i] < 0) { S.positionX[i] = 0; S.velocityX[i] *= -1; }
    else if (S.positionX[i] > C.WORLD_WIDTH) { S.positionX[i] = C.WORLD_WIDTH; S.velocityX[i] *= -1; }
    if (S.positionY[i] < 0) { S.positionY[i] = 0; S.velocityY[i] *= -1; }
    else if (S.positionY[i] > C.WORLD_HEIGHT) { S.positionY[i] = C.WORLD_HEIGHT; S.velocityY[i] *= -1; }
  }

  // Move Vehicles
  if (S.quadrantIndex === 0) {
    for (let v = 0; v < C.MAX_VEHICLES; v++) {
      if (S.vehType[v] === 0 || S.vehHealth[v] <= 0) continue;
      
      S.vehPositionX[v] += S.vehVelocityX[v];
      S.vehPositionY[v] += S.vehVelocityY[v];

      // Bounce at edges
      if (S.vehPositionX[v] < 0) { S.vehPositionX[v] = 0; S.vehVelocityX[v] *= -1; }
      else if (S.vehPositionX[v] > 1600) { S.vehPositionX[v] = 1600; S.vehVelocityX[v] *= -1; }
      if (S.vehPositionY[v] < 0) { S.vehPositionY[v] = 0; S.vehVelocityY[v] *= -1; }
      else if (S.vehPositionY[v] > 1200) { S.vehPositionY[v] = 1200; S.vehVelocityY[v] *= -1; }
    }
  }
}

export function AutonomySystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead || (S.traitBitmask[i] & C.TRAIT_TREE) !== 0) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX) continue;
    if (S.positionX[i] === S.maxX && S.maxX < C.WORLD_WIDTH) continue;
    if (S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;
    if (S.positionY[i] === S.maxY && S.maxY < C.WORLD_HEIGHT) continue;

    if (S.actionTimer[i] > 0) {
      S.actionTimer[i]--;
    } else {
      if (S.state[i] === C.EntityState.Harvesting && S.targetEntityId[i] !== -1) {
        S.entityInventory[i] += 10;
        S.state[i] = C.EntityState.ReturningToDepot;
        S.targetEntityId[i] = -1;
        const gid = S.groupAffiliations[i * 8];
        S.targetBuildingId[i] = U.findNearestOwnedBuilding(S.positionX[i], S.positionY[i], 2000, C.BuildingType.Warehouse, gid);
        S.actionTimer[i] = 0; 
        continue; 
      }
      if (S.state[i] === C.EntityState.ReturningToDepot) {
         const nextEvent = S.pendingEvents[i * 4];
         if (nextEvent === C.EVENT_HOSTILE_ATTACK) { U.popNextEvent(i); S.state[i] = C.EntityState.Fleeing; S.actionTimer[i] = 180; continue; }
         
         if (S.targetBuildingId[i] === -1 || S.bldHealth[S.targetBuildingId[i]] <= 0) {
            const gid = S.groupAffiliations[i * 8];
            S.targetBuildingId[i] = U.findNearestOwnedBuilding(S.positionX[i], S.positionY[i], 2000, C.BuildingType.Warehouse, gid);
            if (S.targetBuildingId[i] === -1) { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60; continue; }
         }
         continue; 
      }
      
      if (S.state[i] === C.EntityState.Construction) {
         const bldId = S.targetBuildingId[i];
         if (bldId !== -1 && S.bldHealth[bldId] < 1000) {
            Atomics.add(S.bldHealth, bldId, 50);
            if (S.bldHealth[bldId] >= 1000) {
               S.bldHealth[bldId] = 1000;
               S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60;
            } else { S.actionTimer[i] = 120; }
         } else { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 30; }
         continue;
      }

      S.activePrioritySlot[i] = -1;
      const nextEvent = S.pendingEvents[i * 4];
      if (nextEvent !== -1) {
        U.popNextEvent(i);
        if (nextEvent === C.EVENT_HOSTILE_ATTACK) {
          if ((S.traitBitmask[i] & C.TRAIT_AGGRESSIVE) !== 0) { S.state[i] = C.EntityState.Combat; S.actionTimer[i] = 120; }
          else { S.state[i] = C.EntityState.Fleeing; S.actionTimer[i] = 180; }
          S.activeCommandPriority[i] = 0; S.activePrioritySlot[i] = -1; continue;
        }
      }

      if (S.state[i] === C.EntityState.Idle || S.activePrioritySlot[i] !== -1) {
        const baseIdx = i * 8;
        let foundHigherPriority = false;
        
        // Strict Hierarchy: Check Slot 0 first (Nation/Cult)
        for (let s = 0; s < 8; s++) {
          const groupId = S.groupAffiliations[baseIdx + s];
          if (groupId !== -1) {
            const targetId = S.groupTargetEntityId[groupId];
            if (targetId !== -1) { 
              S.targetEntityId[i] = targetId; S.state[i] = C.EntityState.Combat; S.actionTimer[i] = 300;
              S.activeCommandPriority[i] = 8 - s; S.activePrioritySlot[i] = s; foundHigherPriority = true; break;
            }
          }
        }
        if (foundHigherPriority) continue;
        if (S.state[i] !== C.EntityState.Idle) continue;

        const rand = Math.random();
        let nextState: number = C.EntityState.Idle;
        const gid = S.groupAffiliations[i * 8];
        
        if (rand > 0.95) nextState = C.EntityState.Combat;
        else if (rand > 0.9) nextState = C.EntityState.Fleeing;
        else if (rand > 0.995 && gid >= 0 && gid < C.MAX_GROUPS) {
           const pop = S.groupPopulationCount[gid];
           const bldCount = S.groupBuildingCount[gid];
           const wealth = S.groupTotalWealth[gid];
           const houseCapacity = Math.max(20, (bldCount - 1) * 5);
           
           if (pop > 0 && pop >= houseCapacity - 5 && wealth > 1500) {
             let foundSlot = -1;
             for(let b=0; b<C.MAX_BUILDINGS; b++) { if (S.bldType[b] === 0) { foundSlot = b; break; } }
             if (foundSlot !== -1) {
               S.bldType[foundSlot] = C.BuildingType.House;
               S.bldPositionX[foundSlot] = S.positionX[i] + (Math.random() - 0.5) * 80;
               S.bldPositionY[foundSlot] = S.positionY[i] + (Math.random() - 0.5) * 80;
               S.bldHealth[foundSlot] = 50; S.bldOwnerGroup[foundSlot] = gid;
               S.targetBuildingId[i] = foundSlot; S.state[i] = C.EntityState.Construction; S.actionTimer[i] = 120;
               Atomics.add(S.groupBuildingCount, gid, 1);
               Atomics.sub(S.groupTotalWealth, gid, 1000); // Cost of building a house
               continue;
             }
           }
           nextState = C.EntityState.Idle;
        }
        else if (rand > 0.88 && S.isMounted[i] === 0) {
           const vehId = U.findNearestVehicle(S.positionX[i], S.positionY[i], 300);
           if (vehId !== -1 && S.vehHealth[vehId] > 0 && S.vehPilotId[vehId] === -1) {
             S.targetVehicleId[i] = vehId;
             nextState = C.EntityState.Idle; 
           }
        }
        else if (rand > 0.7) nextState = C.EntityState.Harvesting;

        if (nextState === C.EntityState.Idle) { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60; continue; }

        S.state[i] = nextState;
        const canSearch = (S.tickCount + i) % 30 === 0;
        if (nextState === C.EntityState.Harvesting) {
          if (canSearch && S.targetEntityId[i] === -1) {
            const resourceMask = C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH | C.TRAIT_LOOT;
            const resId = U.findNearest(S.positionX[i], S.positionY[i], 300, resourceMask);
            if (resId !== -1) { S.targetEntityId[i] = resId; S.actionTimer[i] = 200; }
            else { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60; }
          } else if (S.targetEntityId[i] === -1) { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 1; }
        } else if (nextState === C.EntityState.Combat) {
          if (canSearch && S.targetEntityId[i] === -1) {
            const charMask = ~(C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH);
            const targetId = U.findNearest(S.positionX[i], S.positionY[i], 250, charMask);
            if (targetId !== -1 && targetId !== i) {
               const myGid = S.groupAffiliations[i * 8];
               const targetGid = S.groupAffiliations[targetId * 8];
               if (myGid !== targetGid) { S.targetEntityId[i] = targetId; S.actionTimer[i] = 120; }
               else { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60; }
            }
            else { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60; }
          } else if (S.targetEntityId[i] === -1) { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 1; }
        } else { S.actionTimer[i] = 120; }
        S.activeCommandPriority[i] = 0;
      } else { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 30; S.activeCommandPriority[i] = 0; }
    }
  }
}

export function SteeringSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    const traits = S.traitBitmask[i];
    if ((traits & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0) {
      S.velocityX[i] = 0; S.velocityY[i] = 0; continue;
    }
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX) continue;
    if (S.positionX[i] === S.maxX && S.maxX < C.WORLD_WIDTH) continue;
    if (S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;
    if (S.positionY[i] === S.maxY && S.maxY < C.WORLD_HEIGHT) continue;

    const targetId = S.targetEntityId[i];

    // Vehicle Steering
    if (S.isMounted[i] === 1) {
      const vId = S.targetVehicleId[i];
      if (vId === -1 || S.vehHealth[vId] <= 0) { S.isMounted[i] = 0; S.targetVehicleId[i] = -1; continue; }
      
      // Control vehicle based on character's goals
      // For now, vehicles just wander or follow group targets
      const gid = S.groupAffiliations[i * 8];
      if (gid !== -1 && S.groupTargetEntityId[gid] !== -1) {
         const dx = S.groupTargetX[gid] - S.vehPositionX[vId];
         const dy = S.groupTargetY[gid] - S.vehPositionY[vId];
         const dist = Math.sqrt(dx*dx + dy*dy);
         if (dist > 1.0) { S.vehVelocityX[vId] = (dx/dist) * 2.5; S.vehVelocityY[vId] = (dy/dist) * 2.5; }
      } else {
         if (S.tickCount % 120 === 0) {
            S.vehVelocityX[vId] = (Math.random() - 0.5) * 2;
            S.vehVelocityY[vId] = (Math.random() - 0.5) * 2;
         }
      }
      continue;
    }

    // Move to vehicle
    if (S.targetVehicleId[i] !== -1 && S.isMounted[i] === 0) {
      const vId = S.targetVehicleId[i];
      const dx = S.vehPositionX[vId] - S.positionX[i];
      const dy = S.vehPositionY[vId] - S.positionY[i];
      const distSq = dx*dx + dy*dy;
      if (distSq < 16.0) {
        if (S.vehPilotId[vId] === -1) {
           S.isMounted[i] = 1; S.vehPilotId[vId] = i; S.velocityX[i] = 0; S.velocityY[i] = 0;
        } else { S.targetVehicleId[i] = -1; }
        continue;
      }
      const dist = Math.sqrt(distSq);
      S.velocityX[i] = (dx/dist) * 1.8; S.velocityY[i] = (dy/dist) * 1.8;
      continue;
    }

    if (S.state[i] === C.EntityState.ReportingIntel) {
      const gid = S.groupAffiliations[i * 8];
      if (gid === -1) { S.state[i] = C.EntityState.Idle; continue; }
      const wx = S.groupWarehouseX[gid]; const wy = S.groupWarehouseY[gid];
      const dx = wx - S.positionX[i]; const dy = wy - S.positionY[i];
      const distSq = dx * dx + dy * dy;

      if (distSq < 25.0) {
        const enemyId = S.carriedIntelEntityId[i];
        if (enemyId !== -1) {
          S.groupTargetEntityId[gid] = enemyId; S.groupTargetX[gid] = S.carriedIntelX[i]; S.groupTargetY[gid] = S.carriedIntelY[i]; S.groupTargetAge[gid] = 0;
          S.carriedIntelEntityId[i] = -1;
        }
        S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60; continue;
      }
      const dist = Math.sqrt(distSq);
      S.velocityX[i] = (dx / dist) * 1.8; S.velocityY[i] = (dy / dist) * 1.8;
      continue;
    }

    if (S.state[i] === C.EntityState.ReturningToDepot || S.state[i] === C.EntityState.Construction) {
      const bldId = S.targetBuildingId[i];
      if (bldId === -1 || S.bldHealth[bldId] <= 0) { S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 1; continue; }
      const bx = S.bldPositionX[bldId]; const by = S.bldPositionY[bldId];
      const dx = bx - S.positionX[i]; const dy = by - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      
      if (distSq < 16.0) { 
        if (S.state[i] === C.EntityState.ReturningToDepot) {
          const gid = S.groupAffiliations[i * 8];
          Atomics.add(S.groupTotalWealth, gid, S.entityInventory[i]);
          Atomics.add(S.bldInventory, bldId * 4 + 0, S.entityInventory[i]);
          S.entityInventory[i] = 0;
          if (S.money[i] > 500) {
            if (S.charWeapon[i] === 0) { S.charWeapon[i] = 1; Atomics.sub(S.money, i, 500); }
            else if (S.charArmor[i] === 0) { S.charArmor[i] = 1; Atomics.sub(S.money, i, 500); }
          }
          S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 60;
        } else { S.velocityX[i] = 0; S.velocityY[i] = 0; }
        continue;
      }
      const dist = Math.sqrt(distSq);
      S.velocityX[i] = (dx / dist) * 1.5; S.velocityY[i] = (dy / dist) * 1.5;
      continue;
    }
    if (targetId === -1) { 
      const gid = S.groupAffiliations[i * 8];
      if (gid >= 0 && gid < C.MAX_GROUPS) {
        const wx = S.groupWarehouseX[gid]; const wy = S.groupWarehouseY[gid];
        const dx = wx - S.positionX[i]; const dy = wy - S.positionY[i];
        const distSq = dx*dx + dy*dy;
        if (distSq > 400 * 400) {
           const dist = Math.sqrt(distSq);
           S.velocityX[i] = (dx/dist) * 1.0; S.velocityY[i] = (dy/dist) * 1.0;
        } else {
           S.velocityX[i] = (S.velocityX[i] + (Math.random() - 0.5) * 0.4) * 0.9;
           S.velocityY[i] = (S.velocityY[i] + (Math.random() - 0.5) * 0.4) * 0.9;
           S.velocityX[i] = Math.max(-0.6, Math.min(0.6, S.velocityX[i]));
           S.velocityY[i] = Math.max(-0.6, Math.min(0.6, S.velocityY[i]));
        }
      } else {
        S.velocityX[i] *= 0.8; S.velocityY[i] *= 0.8;
      }
      continue;
    }
    
    if (targetId >= 0 && (S.state[targetId] === C.EntityState.Dead || S.positionX[targetId] < -500)) {
      S.targetEntityId[i] = -1; S.state[i] = C.EntityState.Idle; S.actionTimer[i] = 30; continue;
    }

    let tx: number, ty: number;

    if (S.state[i] === C.EntityState.Trading && (S.traitBitmask[i] & C.TRAIT_COURIER) !== 0) {
      if (targetId <= -1000) {
        let gTarget: number;
        if (targetId <= -2000) gTarget = (-targetId) - 2000;
        else gTarget = (-targetId) - 1000;
        
        tx = S.groupWarehouseX[gTarget]; ty = S.groupWarehouseY[gTarget];
        const dx = tx - S.positionX[i]; const dy = ty - S.positionY[i]; const distSq = dx * dx + dy * dy;
        
        if (distSq < 25.0) {
          if (S.entityInventory[i] > 0) {
            S.groupTotalWealth[gTarget] += S.entityInventory[i]; S.entityInventory[i] = 0;
            const myGid = S.groupAffiliations[i * 8];
            if (myGid >= 0 && myGid < C.MAX_GROUPS) {
              const relIdx = (gTarget * C.MAX_GROUPS) + myGid;
              S.groupRelationsMatrix[relIdx] = Math.min(100, S.groupRelationsMatrix[relIdx] + 2);
              S.targetEntityId[i] = -2000 - myGid;
            }
          } else {
            S.state[i] = C.EntityState.Idle; S.traitBitmask[i] &= ~C.TRAIT_COURIER; S.targetEntityId[i] = -1; S.actionTimer[i] = 60;
          }
          continue;
        }
        const dist = Math.sqrt(distSq);
        S.velocityX[i] = (dx / dist) * 1.4; S.velocityY[i] = (dy / dist) * 1.4;
        continue;
      }
    }

    if (targetId === -2) {
      const tileX = Math.max(0, Math.min(C.WORLD_MAP_COLS - 1, Math.floor(S.positionX[i] / C.TILE_SIZE)));
      const tileY = Math.max(0, Math.min(C.WORLD_MAP_ROWS - 1, Math.floor(S.positionY[i] / C.TILE_SIZE)));
      const fieldIdx = (tileY * C.WORLD_MAP_COLS + tileX) * 2;
      const targetVectorX = S.globalFlowField[fieldIdx]; const targetVectorY = S.globalFlowField[fieldIdx + 1];
      if (targetVectorX !== 0 || targetVectorY !== 0) {
        S.velocityX[i] = targetVectorX * 1.5; S.velocityY[i] = targetVectorY * 1.5; continue;
      } else {
        const slot = S.activePrioritySlot[i]; const groupId = slot !== -1 ? S.groupAffiliations[i * 8 + slot] : -1;
        if (groupId !== -1) { tx = S.groupTargetX[groupId]; ty = S.groupTargetY[groupId]; } 
        else { S.targetEntityId[i] = -1; continue; }
      }
    } else { tx = S.positionX[targetId]; ty = S.positionY[targetId]; }

    const dx = tx - S.positionX[i]; const dy = ty - S.positionY[i]; const distSq = dx * dx + dy * dy;

    if (S.state[i] === C.EntityState.Fleeing) {
      const dist = Math.sqrt(distSq); if (dist > 0.1) { S.velocityX[i] = -(dx / dist) * 2.0; S.velocityY[i] = -(dy / dist) * 2.0; }
      if (distSq > 160000) S.targetEntityId[i] = -1;
    } else if (S.state[i] === C.EntityState.Combat || S.state[i] === C.EntityState.Harvesting) {
      const speed = S.state[i] === C.EntityState.Combat ? 1.5 : 1.2;
      if (distSq > 400.0) { 
        const dist = Math.sqrt(distSq); S.velocityX[i] = (dx / dist) * speed; S.velocityY[i] = (dy / dist) * speed; 
      } else if (distSq > 4.0) {
        const dist = Math.sqrt(distSq); const damp = dist / 20.0;
        S.velocityX[i] = (dx / dist) * speed * damp; S.velocityY[i] = (dy / dist) * speed * damp;
      } else { 
        S.velocityX[i] *= 0.5; S.velocityY[i] *= 0.5; 
        if (Math.random() > 0.8) {
          if (S.state[i] === C.EntityState.Combat) { CombatDamageSystem(i, targetId, 10); } 
          else {
            if ((S.traitBitmask[targetId] & C.TRAIT_LOOT) !== 0) {
               const moneyPart = Math.min(S.money[targetId], 50);
               if (moneyPart > 0) { Atomics.sub(S.money, targetId, moneyPart); Atomics.add(S.money, i, moneyPart); }
               if (S.charWeapon[targetId] > S.charWeapon[i]) S.charWeapon[i] = S.charWeapon[targetId];
               if (S.charArmor[targetId] > S.charArmor[i]) S.charArmor[i] = S.charArmor[targetId];
               S.health[targetId] -= 100;
               if (S.health[targetId] <= 0 || (S.money[targetId] <= 0 && S.charWeapon[targetId] === 0)) { S.state[i] = C.EntityState.Idle; S.targetEntityId[i] = -1; }
            } else {
               S.health[targetId] -= 20; S.entityInventory[i] += 10;
               if (S.entityInventory[i] >= 100) {
                 S.state[i] = C.EntityState.ReturningToDepot; S.targetEntityId[i] = -1;
                 const gid = S.groupAffiliations[i * 8];
                 S.targetBuildingId[i] = U.findNearestOwnedBuilding(S.positionX[i], S.positionY[i], 2000, C.BuildingType.Warehouse, gid);
               }
            }
          }
        }
      }
    } else {
      const dist = Math.sqrt(distSq); if (dist > 0.1) { S.velocityX[i] = (dx / dist) * 1.2; S.velocityY[i] = (dy / dist) * 1.2; }
    }
  }
}

export function CombatDamageSystem(attackerId: number, victimId: number, damageValue: number): void {
   const weaponLevel = S.charWeapon[attackerId];
   const armorLevel = S.charArmor[victimId];
   const finalDamage = Math.max(1, (damageValue + weaponLevel * 5) - (armorLevel * 3));
   S.health[victimId] -= finalDamage; 
   S.targetEntityId[victimId] = -1; S.actionTimer[victimId] = 0;
  const groupA = S.groupAffiliations[attackerId * 8]; const groupB = S.groupAffiliations[victimId * 8];
  if (groupA !== -1 && groupB !== -1 && groupA !== groupB) {
    let penalty = 5;
    const tx = Math.floor(S.positionX[victimId] / C.TILE_SIZE), ty = Math.floor(S.positionY[victimId] / C.TILE_SIZE);
    if (tx >= 0 && tx < C.WORLD_MAP_COLS && ty >= 0 && ty < C.WORLD_MAP_ROWS) {
      const owner = S.territoryOwnerMap[ty * C.WORLD_MAP_COLS + tx];
      if (owner === groupB) penalty = 15;
    }
    const idx = (groupB * C.MAX_GROUPS) + groupA;
    S.groupRelationsMatrix[idx] = Math.max(-100, S.groupRelationsMatrix[idx] - penalty);
  }
  const baseIndex = victimId * 4;
  S.pendingEvents[baseIndex] = C.EVENT_HOSTILE_ATTACK; S.targetEntityId[victimId] = attackerId;
}

export function IntelReportingSystem(): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] > S.maxX) continue;
    if (S.positionX[i] === S.maxX && S.maxX < C.WORLD_WIDTH) continue;
    if (S.positionY[i] < S.minY || S.positionY[i] > S.maxY) continue;
    if (S.positionY[i] === S.maxY && S.maxY < C.WORLD_HEIGHT) continue;
    if ((S.traitBitmask[i] & C.TRAIT_SCOUT) !== 0 && S.state[i] === C.EntityState.Idle) {
      const enemyId = U.findNearest(S.positionX[i], S.positionY[i], 150, C.TRAIT_AGGRESSIVE);
      if (enemyId !== -1) {
        const groupId = S.groupAffiliations[i * 8];
        if (groupId !== -1) {
          S.carriedIntelEntityId[i] = enemyId; S.carriedIntelX[i] = S.positionX[enemyId]; S.carriedIntelY[i] = S.positionY[enemyId];
          const wx = S.groupWarehouseX[groupId]; const wy = S.groupWarehouseY[groupId];
          const dx = wx - S.positionX[i]; const dy = wy - S.positionY[i];
          const inRange = (dx * dx + dy * dy < 400 * 400);
          const groupCanReceive = S.groupMagicFrequency[groupId] === 1;
          if ((S.traitBitmask[i] & C.TRAIT_MAGIC) !== 0 && S.mana[i] >= 50 && inRange && groupCanReceive) {
            S.groupTargetEntityId[groupId] = enemyId; S.groupTargetX[groupId] = S.positionX[enemyId]; S.groupTargetY[groupId] = S.positionY[enemyId]; S.groupTargetAge[groupId] = 0;
            S.mana[i] -= 50; S.carriedIntelEntityId[i] = -1;
            self.postMessage({ type: "MAGIC_BURST", payload: { entityId: i, fromX: S.positionX[i], fromY: S.positionY[i], toX: wx, toY: wy } });
          } else { S.state[i] = C.EntityState.ReportingIntel; }
        }
      }
    }
  }
}
