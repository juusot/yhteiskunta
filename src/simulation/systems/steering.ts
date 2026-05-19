import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";

/**
 * Steering System
 * Calculates desired velocity vectors based on entity state, targets, and environment.
 */
export function runSteeringSystem(
  state: SharedArrayBuffer,
  startIndex: number,
  endIndex: number,
): void {
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
            if (S.isMounted[p] === 1 && S.targetVehicleId[p] === vId)
              passengers++;
          }
          const maxP =
            S.vehType[vId] === C.VEHICLE_SHIP
              ? C.MAX_PASSENGERS_SHIP
              : C.MAX_PASSENGERS_WAGON;
          if (passengers < maxP) S.isMounted[i] = 1;
        }
      }
    }

    // Player Override Logic
    if (targetId === -3) {
      const tx = S.playerTargetX[i],
        ty = S.playerTargetY[i];
      const dx = tx - S.positionX[i],
        dy = ty - S.positionY[i];
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
        let tx = S.positionX[i],
          ty = S.positionY[i];
        if (S.state[i] === C.EntityState.Combat && S.targetEntityId[i] !== -1) {
          tx = S.groupTargetX[gid];
          ty = S.groupTargetY[gid];
        } else {
          tx += (Math.random() - 0.5) * 100;
          ty += (Math.random() - 0.5) * 100;
        }
        const dx = tx - S.positionX[i],
          dy = ty - S.positionY[i];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1.0) {
          S.vehVelocityX[vId] = (dx / dist) * 1.5;
          S.vehVelocityY[vId] = (dy / dist) * 1.5;
        }
      }
      continue;
    }

    // Standard State-based Steering
    let targetX = -1,
      targetY = -1,
      stopDistSq = 4.0;
    const speed = S.effectiveSpeed[i] || 1.0;

    if (S.state[i] === C.EntityState.Idle) {
      if (Math.random() > 0.98) {
        S.velocityX[i] = (Math.random() - 0.5) * 2;
        S.velocityY[i] = (Math.random() - 0.5) * 2;
      }
      continue;
    } else if (S.state[i] === C.EntityState.Fleeing && targetId !== -1) {
      const dx = S.positionX[i] - S.positionX[targetId],
        dy = S.positionY[i] - S.positionY[targetId];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) {
        S.velocityX[i] = (dx / dist) * speed * 2.0;
        S.velocityY[i] = (dy / dist) * speed * 2.0;
      }
      continue;
    } else if (S.state[i] === C.EntityState.Harvesting) {
      const bldId = S.targetBuildingId[i];
      if (bldId !== -1) {
        targetX = S.bldPositionX[bldId];
        targetY = S.bldPositionY[bldId];
      } else if (targetId !== -1) {
        targetX = S.positionX[targetId];
        targetY = S.positionY[targetId];
      }
      stopDistSq = 4.0;
    } else if (
      S.state[i] === C.EntityState.ReturningToDepot ||
      S.state[i] === C.EntityState.Construction
    ) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      const bldId = S.targetBuildingId[i];
      let bX = -1,
        bY = -1,
        bRad = 8.0;

      if (bldId !== -1) {
        bX = S.bldPositionX[bldId];
        bY = S.bldPositionY[bldId];
        bRad = S.bldType[bldId] === 1 ? 12.0 : 8.0;
      } else {
        const whId = U.findNearestBuilding(
          S.positionX[i],
          S.positionY[i],
          1500,
          1,
          gid,
        );
        if (whId !== -1) {
          bX = S.bldPositionX[whId];
          bY = S.bldPositionY[whId];
          bRad = 12.0;
        } else {
          bX = S.groupWarehouseX[gid];
          bY = S.groupWarehouseY[gid];
          bRad = 12.0;
        }
      }

      if (bX !== -1) {
        // Target a unique point on a ring around the building
        const angle = (i * 0.618033) % (Math.PI * 2); // Golden ratio spread
        targetX = bX + Math.cos(angle) * bRad;
        targetY = bY + Math.sin(angle) * bRad;
        stopDistSq = 9.0; // Stop within 3 units of the ring point
      }
    } else if (S.state[i] === C.EntityState.Combat) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      targetX = S.groupTargetX[gid];
      targetY = S.groupTargetY[gid];
      stopDistSq = 256.0;
    } else if (S.state[i] === C.EntityState.Trading) {
      const targetGid = -S.targetEntityId[i] - 1000;
      if (targetGid >= 0 && targetGid < C.MAX_GROUPS) {
        targetX = S.groupWarehouseX[targetGid];
        targetY = S.groupWarehouseY[targetGid];
      }
      stopDistSq = 16.0;
    } else if (S.state[i] === C.EntityState.ReportingIntel) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      targetX = S.groupWarehouseX[gid];
      targetY = S.groupWarehouseY[gid];
      stopDistSq = 1.0;
    } else if (S.state[i] === C.EntityState.Looting) {
      const targetItem = S.targetItemId[i];
      if (targetItem !== -1 && targetItem < C.MAX_ITEM_INSTANCES) {
        targetX = S.itemInstanceX[targetItem];
        targetY = S.itemInstanceY[targetItem];
      }
      stopDistSq = 4.0;
    }

    if (targetX !== -1) {
      const dx = targetX - S.positionX[i],
        dy = targetY - S.positionY[i];
      const distSq = dx * dx + dy * dy;

      if (distSq < stopDistSq) {
        S.velocityX[i] = 0;
        S.velocityY[i] = 0;
      } else {
        const dist = Math.sqrt(distSq);
        let vx = (dx / dist) * speed * 1.5;
        let vy = (dy / dist) * speed * 1.5;

        // --- INTELLIGENT OBSTACLE AVOIDANCE ---
        // Look ahead 1 tile
        const lookAhead = 12.0;
        const lax = S.positionX[i] + vx * lookAhead;
        const lay = S.positionY[i] + vy * lookAhead;

        let blockedByBuilding = false;
        const nearbyBldId = U.findNearestBuilding(lax, lay, 15, -1, -1);
        if (nearbyBldId !== -1) {
          const bType = S.bldType[nearbyBldId];
          if (bType === 1 || bType === 2 || bType === 3 || bType === 4) {
            const bRadius = bType === 1 ? 8.0 : 5.0;
            const bdx = S.bldPositionX[nearbyBldId] - lax;
            const bdy = S.bldPositionY[nearbyBldId] - lay;
            if (bdx * bdx + bdy * bdy < bRadius * bRadius) {
              blockedByBuilding = true;
            }
          }
        }

        const tx = Math.floor(lax / 10),
          ty = Math.floor(lay / 10);

        if (
          blockedByBuilding ||
          (tx >= 0 && tx < C.WORLD_MAP_COLS && ty >= 0 && ty < C.WORLD_MAP_ROWS)
        ) {
          let terrainBlock = false;
          if (!blockedByBuilding) {
            const terrain = S.worldMap[ty * C.WORLD_MAP_COLS + tx];
            if (
              terrain === C.TerrainType.Mountain ||
              terrain === C.TerrainType.Ocean
            )
              terrainBlock = true;
          }

          if (blockedByBuilding || terrainBlock) {
            // Path is blocked! Find nearest navigable neighbor and deflect
            let bestAx = 0,
              bestAy = 0,
              found = false;
            for (let ay = -2; ay <= 2; ay++) {
              // Wider search for building avoidance
              for (let ax = -2; ax <= 2; ax++) {
                if (ax === 0 && ay === 0) continue;
                const nx = Math.floor(S.positionX[i] / 10) + ax;
                const ny = Math.floor(S.positionY[i] / 10) + ay;
                if (
                  nx >= 0 &&
                  nx < C.WORLD_MAP_COLS &&
                  ny >= 0 &&
                  ny < C.WORLD_MAP_ROWS
                ) {
                  const nt = S.worldMap[ny * C.WORLD_MAP_COLS + nx];
                  if (
                    nt !== C.TerrainType.Mountain &&
                    nt !== C.TerrainType.Ocean
                  ) {
                    // Also ensure neighbor isn't blocked by building
                    const npx = nx * 10 + 5,
                      npy = ny * 10 + 5;
                    const nbId = U.findNearestBuilding(npx, npy, 10, -1, -1);
                    if (nbId === -1 || S.bldHealth[nbId] === 0) {
                      bestAx = ax;
                      bestAy = ay;
                      found = true;
                      break;
                    }
                  }
                }
              }
              if (found) break;
            }
            if (found) {
              vx = (vx + bestAx * speed * 2.5) / 2;
              vy = (vy + bestAy * speed * 2.5) / 2;
            }
          }
        }

        S.velocityX[i] = vx;
        S.velocityY[i] = vy;
      }
    } else {
      S.velocityX[i] = 0;
      S.velocityY[i] = 0;
    }
  }
}
