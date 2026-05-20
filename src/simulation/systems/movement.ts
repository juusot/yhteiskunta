import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";

/**
 * Movement System
 * Integrates velocity into position and handles collision/bounds.
 */
export function runMovementSystem(
  state: SharedArrayBuffer,
  startIndex: number,
  endIndex: number,
): void {
  // 1. Entities
  for (let i = startIndex; i < endIndex; i++) {
    if (
      S.state[i] === C.EntityState.Dead ||
      (S.traitBitmask[i] & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0
    )
      continue;
    if (S.isMounted[i] === 1) continue;

    let moveX = S.velocityX[i];
    let moveY = S.velocityY[i];

    const curX = S.positionX[i];
    const curY = S.positionY[i];

    // Apply terrain speed modifiers based on current position
    const curTx = Math.max(0, Math.min(C.WORLD_MAP_COLS - 1, Math.floor(curX / C.TILE_SIZE)));
    const curTy = Math.max(0, Math.min(C.WORLD_MAP_ROWS - 1, Math.floor(curY / C.TILE_SIZE)));
    const curTileIdx = curTy * C.WORLD_MAP_COLS + curTx;
    if (curTileIdx >= 0 && curTileIdx < S.worldMap.length) {
      const terrain = S.worldMap[curTileIdx];
      if (terrain === C.TerrainType.Forest) {
        moveX *= 0.6;
        moveY *= 0.6;
      } else if (terrain === C.TerrainType.Water) {
        moveX *= 0.3;
        moveY *= 0.3;
      }
    }

    let tempX = curX + moveX;
    let tempY = curY;

    // X-Axis Check
    const txX = Math.max(0, Math.min(C.WORLD_MAP_COLS - 1, Math.floor(tempX / C.TILE_SIZE)));
    const tyX = Math.max(0, Math.min(C.WORLD_MAP_ROWS - 1, Math.floor(tempY / C.TILE_SIZE)));
    const tileIdxX = tyX * C.WORLD_MAP_COLS + txX;
    let blockedX = false;
    if (tileIdxX >= 0 && tileIdxX < S.worldMap.length) {
      const terrain = S.worldMap[tileIdxX];
      if (terrain === C.TerrainType.Mountain || terrain === C.TerrainType.Ocean) {
        blockedX = true;
      }
    }

    // Dynamic building collision check for X-axis
    if (!blockedX) {
      const nearbyBldId = U.findNearestBuilding(tempX, tempY, 15, -1, -1);
      if (nearbyBldId !== -1) {
        const bType = S.bldType[nearbyBldId];
        if (bType === 1 || bType === 2 || bType === 3 || bType === 4) {
          const bRadius = bType === C.BuildingType.Warehouse ? C.COLLISION_RADIUS_WAREHOUSE : C.COLLISION_RADIUS_HOUSE;
          const bX = S.bldPositionX[nearbyBldId];
          const bY = S.bldPositionY[nearbyBldId];
          const bdx = bX - tempX;
          const bdy = bY - tempY;
          const nextDistSq = bdx * bdx + bdy * bdy;
          if (nextDistSq < bRadius * bRadius) {
            const curDx = bX - curX;
            const curDy = bY - curY;
            if (nextDistSq < curDx * curDx + curDy * curDy) {
              blockedX = true;
            }
          }
        }
      }
    }

    if (blockedX) {
      tempX = curX;
      S.velocityX[i] = 0;
    }

    // Y-Axis Check
    tempY = curY + moveY;
    const txY = Math.max(0, Math.min(C.WORLD_MAP_COLS - 1, Math.floor(tempX / C.TILE_SIZE)));
    const tyY = Math.max(0, Math.min(C.WORLD_MAP_ROWS - 1, Math.floor(tempY / C.TILE_SIZE)));
    const tileIdxY = tyY * C.WORLD_MAP_COLS + txY;
    let blockedY = false;
    if (tileIdxY >= 0 && tileIdxY < S.worldMap.length) {
      const terrain = S.worldMap[tileIdxY];
      if (terrain === C.TerrainType.Mountain || terrain === C.TerrainType.Ocean) {
        blockedY = true;
      }
    }

    // Dynamic building collision check for Y-axis
    if (!blockedY) {
      const nearbyBldId = U.findNearestBuilding(tempX, tempY, 15, -1, -1);
      if (nearbyBldId !== -1) {
        const bType = S.bldType[nearbyBldId];
        if (bType === 1 || bType === 2 || bType === 3 || bType === 4) {
          const bRadius = bType === C.BuildingType.Warehouse ? C.COLLISION_RADIUS_WAREHOUSE : C.COLLISION_RADIUS_HOUSE;
          const bX = S.bldPositionX[nearbyBldId];
          const bY = S.bldPositionY[nearbyBldId];
          const bdx = bX - tempX;
          const bdy = bY - tempY;
          const nextDistSq = bdx * bdx + bdy * bdy;
          if (nextDistSq < bRadius * bRadius) {
            const curDx = bX - tempX;
            const curDy = bY - curY;
            if (nextDistSq < curDx * curDx + curDy * curDy) {
              blockedY = true;
            }
          }
        }
      }
    }

    if (blockedY) {
      tempY = curY;
      S.velocityY[i] = 0;
    }

    S.positionX[i] = tempX;
    S.positionY[i] = tempY;

    // Bounds checking (Strict Clamping)
    if (S.positionX[i] < 0) S.positionX[i] = 0;
    if (S.positionX[i] > C.WORLD_WIDTH) S.positionX[i] = C.WORLD_WIDTH;
    if (S.positionY[i] < 0) S.positionY[i] = 0;
    if (S.positionY[i] > C.WORLD_HEIGHT) S.positionY[i] = C.WORLD_HEIGHT;
  }

  // 2. Vehicles
  const vehStart = Math.floor((startIndex / C.MAX_ENTITIES) * C.MAX_VEHICLES);
  const vehEnd = Math.floor((endIndex / C.MAX_ENTITIES) * C.MAX_VEHICLES);
  for (let i = vehStart; i < vehEnd; i++) {
    if (S.vehHealth[i] <= 0 || S.vehType[i] === 0) continue;

    const nextX = S.vehPositionX[i] + S.vehVelocityX[i];
    const nextY = S.vehPositionY[i] + S.vehVelocityY[i];
    const tx = Math.floor(nextX / C.TILE_SIZE);
    const ty = Math.floor(nextY / C.TILE_SIZE);
    const tileIdx = ty * C.WORLD_MAP_COLS + tx;

    if (tx >= 0 && tx < C.WORLD_MAP_COLS && ty >= 0 && ty < C.WORLD_MAP_ROWS) {
      const terrain = S.worldMap[tileIdx];
      let blocked = false;
      if (
        S.vehType[i] === C.VEHICLE_SHIP &&
        terrain !== C.TerrainType.Water &&
        terrain !== C.TerrainType.Ocean
      )
        blocked = true;
      if (
        S.vehType[i] === C.VEHICLE_WAGON &&
        (terrain === C.TerrainType.Water ||
          terrain === C.TerrainType.Mountain ||
          terrain === C.TerrainType.Ocean)
      )
        blocked = true;

      if (blocked) {
        S.vehVelocityX[i] = 0;
        S.vehVelocityY[i] = 0;
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

  // 3. Passenger Position Sync
  for (let i = startIndex; i < endIndex; i++) {
    if (S.isMounted[i] === 1) {
      const vId = S.targetVehicleId[i];
      if (vId !== -1) {
        S.positionX[i] = S.vehPositionX[vId];
        S.positionY[i] = S.vehPositionY[vId];
      }
    }
  }
}
