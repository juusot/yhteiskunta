// src/simulation/systems/steering.ts
import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";

const outVec = { x: 0, y: 0 };

/**
 * Decodes the Int8 angle byte from a shared flow field and sets outVec to the normalized 2D direction.
 * Returns true if a valid non-zero flow vector was found.
 */
function getFlowVector(
  flowField: Int8Array,
  offset: number,
  px: number,
  py: number,
  outVec: { x: number; y: number }
): boolean {
  const cx = Math.floor(px / 10);
  const cy = Math.floor(py / 10);
  if (cx < 0 || cx >= C.WORLD_MAP_COLS || cy < 0 || cy >= C.WORLD_MAP_ROWS) {
    return false;
  }
  const idx = offset + (cy * C.WORLD_MAP_COLS + cx);
  const angleByte = flowField[idx];
  if (angleByte === -128) {
    return false;
  }
  const angle = (angleByte / 127) * Math.PI;
  outVec.x = Math.cos(angle);
  outVec.y = Math.sin(angle);
  return true;
}

/**
 * Steering System
 * Calculates desired velocity vectors based on entity state, targets, and shared flow fields.
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

    const stateVal = S.state[i];
    const isActionState =
      stateVal === C.EntityState.Harvesting ||
      stateVal === C.EntityState.ReturningToDepot ||
      stateVal === C.EntityState.Construction ||
      stateVal === C.EntityState.Trading;

    if (isActionState && S.actionTimer[i] > 0) {
      S.velocityX[i] = 0;
      S.velocityY[i] = 0;
      continue;
    }

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
      stopDistSq = C.DIST_SQ_ARRIVAL;
    const speed = S.effectiveSpeed[i] || 1.0;

    if (S.state[i] === C.EntityState.Idle) {
      if (Math.random() > 0.98) {
        S.velocityX[i] = (Math.random() - 0.5) * 2;
        S.velocityY[i] = (Math.random() - 0.5) * 2;
      }
      continue;
    }

    // Determine target coordinate and lookup flow field vector based on entity state
    let gotFlow = false;

    if (targetId === -3) {
      targetX = S.playerTargetX[i];
      targetY = S.playerTargetY[i];
      stopDistSq = C.DIST_SQ_ARRIVAL;
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
      let tX = -1, tY = -1;
      if (bldId !== -1) {
        tX = S.bldPositionX[bldId];
        tY = S.bldPositionY[bldId];
      } else if (targetId !== -1) {
        tX = S.positionX[targetId];
        tY = S.positionY[targetId];
      }
      if (tX !== -1) {
        const angle = (i * C.GOLDEN_ANGLE_RAD) % (Math.PI * 2);
        targetX = tX + Math.cos(angle) * C.FORMATION_RING_RESOURCE;
        targetY = tY + Math.sin(angle) * C.FORMATION_RING_RESOURCE;
      }
      stopDistSq = C.DIST_SQ_ARRIVAL;

      if (targetId !== -1) {
        tX = S.positionX[targetId];
        tY = S.positionY[targetId];
        const tTraits = S.traitBitmask[targetId];
        if ((tTraits & C.TRAIT_TREE) !== 0) {
          gotFlow = getFlowVector(S.flowFieldWood, 0, S.positionX[i], S.positionY[i], outVec);
        } else if ((tTraits & C.TRAIT_GOLD) !== 0) {
          gotFlow = getFlowVector(S.flowFieldGold, 0, S.positionX[i], S.positionY[i], outVec);
        } else if ((tTraits & C.TRAIT_BUSH) !== 0) {
          gotFlow = getFlowVector(S.flowFieldFood, 0, S.positionX[i], S.positionY[i], outVec);
        }
      } else if (bldId !== -1 && S.bldType[bldId] === 5) {
        gotFlow = getFlowVector(S.flowFieldFood, 0, S.positionX[i], S.positionY[i], outVec);
      } else if (targetId === -1 && bldId === -1) {
        // No specific target yet, follow objective flow field based on chosen tool
        if (S.charTool[i] === 0) gotFlow = getFlowVector(S.flowFieldWood, 0, S.positionX[i], S.positionY[i], outVec);
        else if (S.charTool[i] === 1) gotFlow = getFlowVector(S.flowFieldGold, 0, S.positionX[i], S.positionY[i], outVec);
        else if (S.charTool[i] === 2) gotFlow = getFlowVector(S.flowFieldFood, 0, S.positionX[i], S.positionY[i], outVec);
      }
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
        bRad = S.bldType[bldId] === C.BuildingType.Warehouse ? C.FORMATION_RING_WAREHOUSE : C.FORMATION_RING_HOUSE;
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
          bRad = C.FORMATION_RING_WAREHOUSE;
        } else {
          bX = S.groupWarehouseX[gid];
          bY = S.groupWarehouseY[gid];
          bRad = C.FORMATION_RING_WAREHOUSE;
        }
      }

      if (bX !== -1) {
        const angle = (i * C.GOLDEN_ANGLE_RAD) % (Math.PI * 2);
        targetX = bX + Math.cos(angle) * bRad;
        targetY = bY + Math.sin(angle) * bRad;
        stopDistSq = C.DIST_SQ_ARRIVAL;
      }

      if (gid >= 0 && gid < C.MAX_GROUPS) {
        const slot = gid % 16;
        const pageSize = C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS;
        gotFlow = getFlowVector(S.flowFieldGroupHQ, slot * pageSize, S.positionX[i], S.positionY[i], outVec);
      }
    } else if (S.state[i] === C.EntityState.Combat) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      targetX = S.groupTargetX[gid];
      targetY = S.groupTargetY[gid];
      stopDistSq = 256.0;
    } else if (S.state[i] === C.EntityState.Trading) {
      const targetGid = -S.targetEntityId[i] - 1000;
      if (targetGid >= 0 && targetGid < C.MAX_GROUPS) {
        const tX = S.groupWarehouseX[targetGid];
        const tY = S.groupWarehouseY[targetGid];
        const angle = (i * C.GOLDEN_ANGLE_RAD) % (Math.PI * 2);
        targetX = tX + Math.cos(angle) * C.FORMATION_RING_WAREHOUSE;
        targetY = tY + Math.sin(angle) * C.FORMATION_RING_WAREHOUSE;
      }
      stopDistSq = C.DIST_SQ_ARRIVAL;
    } else if (S.state[i] === C.EntityState.ReportingIntel) {
      const gid = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
      targetX = S.groupWarehouseX[gid];
      targetY = S.groupWarehouseY[gid];
      stopDistSq = 1.0;

      if (gid >= 0 && gid < C.MAX_GROUPS) {
        const slot = gid % 16;
        const pageSize = C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS;
        gotFlow = getFlowVector(S.flowFieldGroupHQ, slot * pageSize, S.positionX[i], S.positionY[i], outVec);
      }
    } else if (S.state[i] === C.EntityState.Looting) {
      const targetItem = S.targetItemId[i];
      if (targetItem !== -1 && targetItem < C.MAX_ITEM_INSTANCES) {
        targetX = S.itemInstanceX[targetItem];
        targetY = S.itemInstanceY[targetItem];
      }
      stopDistSq = C.DIST_SQ_ARRIVAL;
    } else if (S.state[i] === C.EntityState.Sabotaging) {
      const bldId = S.targetBuildingId[i];
      if (bldId !== -1) {
        targetX = S.bldPositionX[bldId];
        targetY = S.bldPositionY[bldId];
      }
      stopDistSq = C.DIST_SQ_ARRIVAL;
    }

    let vx = 0;
    let vy = 0;
    let distSq = 0;

    if (targetX !== -1 && targetY !== -1) {
      const dx = targetX - S.positionX[i];
      const dy = targetY - S.positionY[i];
      distSq = dx * dx + dy * dy;

      if (distSq < stopDistSq) {
        vx = 0;
        vy = 0;
        if (targetId === -3) {
          S.targetEntityId[i] = -1;
        }
      } else {
        const dist = Math.sqrt(distSq);
        const currentSpeed = (targetId === -3) ? speed * 2.0 : speed * 1.5;

        // Use Flow Vector if valid and far enough away, otherwise fallback to direct heading
        if (gotFlow && dist >= C.FLOW_FIELD_FALLBACK_DIST) {
          vx = outVec.x * currentSpeed;
          vy = outVec.y * currentSpeed;
        } else {
          vx = (dx / dist) * currentSpeed;
          vy = (dy / dist) * currentSpeed;
        }
      }
    } else if (gotFlow) {
      // We have no specific target coordinate yet, but we have a valid flow field direction!
      const currentSpeed = speed * 1.5;
      vx = outVec.x * currentSpeed;
      vy = outVec.y * currentSpeed;
      distSq = 1000.0; // Artificial distance to ensure separation works
    }

    // Entity-to-Entity Separation local repulsion
    let sepX = 0;
    let sepY = 0;
    let sepCount = 0;

    const shouldSeparate = !(isActionState && distSq < C.DIST_SQ_GHOSTING);

    if (shouldSeparate) {
      const px = S.positionX[i];
      const py = S.positionY[i];

      const sepRad = Math.sqrt(C.SEPARATION_RADIUS_SQ);
      const minCellX = Math.max(0, Math.floor((px - sepRad) / C.GRID_SIZE));
      const maxCellX = Math.min(C.GRID_COLS - 1, Math.floor((px + sepRad) / C.GRID_SIZE));
      const minCellY = Math.max(0, Math.floor((py - sepRad) / C.GRID_SIZE));
      const maxCellY = Math.min(C.GRID_ROWS - 1, Math.floor((py + sepRad) / C.GRID_SIZE));

      for (let cy = minCellY; cy <= maxCellY; cy++) {
        for (let cx = minCellX; cx <= maxCellX; cx++) {
          const cellIndex = cy * C.GRID_COLS + cx;
          let otherId = S.spatialHead[cellIndex];
          while (otherId !== -1) {
            if (otherId !== i) {
              const otherTraits = S.traitBitmask[otherId];
              if ((otherTraits & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) === 0) {
                const opx = S.positionX[otherId];
                const opy = S.positionY[otherId];
                const sdx = px - opx;
                const sdy = py - opy;
                const sdistSq = sdx * sdx + sdy * sdy;
                if (sdistSq < C.SEPARATION_RADIUS_SQ && sdistSq > 0.0001) {
                  const sdist = Math.sqrt(sdistSq);
                  const force = (sepRad - sdist) / sepRad;
                  sepX += (sdx / sdist) * force;
                  sepY += (sdy / sdist) * force;
                  sepCount++;
                }
              }
            }
            otherId = S.spatialNext[otherId];
          }
        }
      }
    }

    let repX = 0;
    let repY = 0;
    if (sepCount > 0) {
      repX = (sepX / sepCount) * C.SEPARATION_FORCE_MAX;
      repY = (sepY / sepCount) * C.SEPARATION_FORCE_MAX;
    }

    // Mix in local obstacle repulsion (mountains/water and buildings)
    const obstVec = U.getObstacleRepulsion(S.positionX[i], S.positionY[i]);
    repX += obstVec.x * 4.0;
    repY += obstVec.y * 4.0;

    vx += repX;
    vy += repY;

    const len = Math.sqrt(vx * vx + vy * vy);
    if (len > 0) {
      const maxSpeed = (targetId === -3) ? speed * 2.0 : speed * 1.5;
      if (len > maxSpeed) {
        vx = (vx / len) * maxSpeed;
        vy = (vy / len) * maxSpeed;
      }
    }

    // Apply steering inertia (50% momentum) to prevent ridge oscillation
    S.velocityX[i] = S.velocityX[i] * 0.5 + vx * 0.5;
    S.velocityY[i] = S.velocityY[i] * 0.5 + vy * 0.5;
  }
}

