import * as C from '../constants';
import * as S from '../state';

/**
 * Steering System
 * Calculates desired velocity vectors based on entity state, targets, and environment.
 */
export function runSteeringSystem(state: SharedArrayBuffer, startIndex: number, endIndex: number): void {
  for (let i = startIndex; i < endIndex; i++) {
    const traits = S.traitBitmask[i];
    // Static objects don't move
    if ((traits & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0) { 
      S.velocityX[i] = 0; 
      S.velocityY[i] = 0; 
      continue; 
    }
    
    if (S.state[i] === C.EntityState.Dead) continue;

    const targetId = S.targetEntityId[i];

    // Intel Reporting Sub-logic
    if (S.state[i] === C.EntityState.ReportingIntel) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const wx = S.groupWarehouseX[gid]; 
      const wy = S.groupWarehouseY[gid];
      const dx = wx - S.positionX[i]; 
      const dy = wy - S.positionY[i];
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

    // Player Override Logic
    if (targetId === -3) {
      const tx = S.playerTargetX[i], ty = S.playerTargetY[i];
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq > 4.0) {
        const dist = Math.sqrt(distSq);
        const speed = S.effectiveSpeed[i] || 1.0;
        S.velocityX[i] = (dx / dist) * speed * 2.0;
        S.velocityY[i] = (dy / dist) * speed * 2.0;
      } else { 
        S.velocityX[i] = 0; 
        S.velocityY[i] = 0; 
        S.targetEntityId[i] = -1; 
      }
      continue;
    }

    // Mounted Steering (Vehicle Control)
    if (S.isMounted[i] === 1) {
      const vId = S.targetVehicleId[i];
      if (vId === -1 || S.vehHealth[vId] <= 0) { 
        S.isMounted[i] = 0; 
        S.targetVehicleId[i] = -1; 
        continue; 
      }
      if (S.vehPilotId[vId] !== i) { 
        S.velocityX[i] = 0; 
        S.velocityY[i] = 0; 
      } else {
        const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
        let tx = S.positionX[i], ty = S.positionY[i];
        if (S.state[i] === C.EntityState.Combat && S.targetEntityId[i] !== -1) { 
          tx = S.groupTargetX[gid]; 
          ty = S.groupTargetY[gid]; 
        } else { 
          tx += (Math.random() - 0.5) * 100; 
          ty += (Math.random() - 0.5) * 100; 
        }
        const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1.0) { 
          S.vehVelocityX[vId] = (dx / dist) * 1.5; 
          S.vehVelocityY[vId] = (dy / dist) * 1.5; 
        }
      }
      continue;
    }

    // Standard State-based Steering
    if (S.state[i] === C.EntityState.Idle) {
      if (Math.random() > 0.98) { 
        S.velocityX[i] = (Math.random() - 0.5) * 2; 
        S.velocityY[i] = (Math.random() - 0.5) * 2; 
      }
    } else if (S.state[i] === C.EntityState.Fleeing && targetId !== -1) {
      const enemyX = S.positionX[targetId], enemyY = S.positionY[targetId];
      const dx = S.positionX[i] - enemyX, dy = S.positionY[i] - enemyY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) { 
        S.velocityX[i] = (dx / dist) * 2.5; 
        S.velocityY[i] = (dy / dist) * 2.5; 
      }
    } else if (S.state[i] === C.EntityState.Harvesting) {
      const bldId = S.targetBuildingId[i];
      let tx = 0, ty = 0;
      if (bldId !== -1) { tx = S.bldPositionX[bldId]; ty = S.bldPositionY[bldId]; }
      else if (targetId !== -1) { tx = S.positionX[targetId]; ty = S.positionY[targetId]; }
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < 4.0) {
        S.velocityX[i] = 0; S.velocityY[i] = 0;
      } else { 
        const dist = Math.sqrt(distSq); 
        S.velocityX[i] = (dx / dist) * 1.8; 
        S.velocityY[i] = (dy / dist) * 1.8; 
      }
    } else if (S.state[i] === C.EntityState.ReturningToDepot || S.state[i] === C.EntityState.Construction) {
      const bldId = S.targetBuildingId[i];
      if (bldId !== -1) {
        const dx = S.bldPositionX[bldId] - S.positionX[i], dy = S.bldPositionY[bldId] - S.positionY[i];
        const distSq = dx * dx + dy * dy;
        if (distSq < 16.0) {
          S.velocityX[i] = 0; S.velocityY[i] = 0;
        } else { 
          const dist = Math.sqrt(distSq); 
          S.velocityX[i] = (dx / dist) * 1.8; 
          S.velocityY[i] = (dy / dist) * 1.8; 
        }
      }
    } else if (S.state[i] === C.EntityState.Combat) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const tx = S.groupTargetX[gid], ty = S.groupTargetY[gid];
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < 256.0) { S.velocityX[i] = 0; S.velocityY[i] = 0; }
      else { 
        const dist = Math.sqrt(distSq); 
        S.velocityX[i] = (dx / dist) * 2.0; 
        S.velocityY[i] = (dy / dist) * 2.0; 
      }
    } else if (S.state[i] === C.EntityState.Trading) {
      const targetGid = -S.targetEntityId[i] - 1000;
      if (targetGid >= 0 && targetGid < C.MAX_GROUPS) {
        const tx = S.groupWarehouseX[targetGid], ty = S.groupWarehouseY[targetGid];
        const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
        const distSq = dx * dx + dy * dy;
        if (distSq < 16.0) { S.velocityX[i] = 0; S.velocityY[i] = 0; }
        else { 
          const dist = Math.sqrt(distSq); 
          S.velocityX[i] = (dx / dist) * 1.8; 
          S.velocityY[i] = (dy / dist) * 1.8; 
        }
      }
    } else if (S.state[i] === C.EntityState.ReportingIntel) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const tx = S.groupWarehouseX[gid], ty = S.groupWarehouseY[gid];
      const dx = tx - S.positionX[i], dy = ty - S.positionY[i];
      const distSq = dx * dx + dy * dy;
      if (distSq > 1.0) { 
        const dist = Math.sqrt(distSq); 
        S.velocityX[i] = (dx / dist) * 1.8; 
        S.velocityY[i] = (dy / dist) * 1.8; 
      } else { S.velocityX[i] = 0; S.velocityY[i] = 0; }
    } else if (S.state[i] === C.EntityState.Looting) {
      const targetItem = S.targetItemId[i];
      if (targetItem !== -1 && targetItem < C.MAX_ITEM_INSTANCES) {
        const dx = S.itemInstanceX[targetItem] - S.positionX[i], dy = S.itemInstanceY[targetItem] - S.positionY[i];
        const distSq = dx * dx + dy * dy;
        if (distSq > 4.0) {
          const dist = Math.sqrt(distSq);
          const speed = S.effectiveSpeed[i] || 1.8;
          S.velocityX[i] = (dx / dist) * speed;
          S.velocityY[i] = (dy / dist) * speed;
        } else { S.velocityX[i] = 0; S.velocityY[i] = 0; }
      }
    }
  }
}
