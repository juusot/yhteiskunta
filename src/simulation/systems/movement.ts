import * as C from "../constants";
import * as S from "../state";

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

    const nextX = S.positionX[i] + moveX;
    const nextY = S.positionY[i] + moveY;

    // Terrain Speed Modifiers & Collision
    const tx = Math.max(
      0,
      Math.min(C.WORLD_MAP_COLS - 1, Math.floor(nextX / C.TILE_SIZE)),
    );
    const ty = Math.max(
      0,
      Math.min(C.WORLD_MAP_ROWS - 1, Math.floor(nextY / C.TILE_SIZE)),
    );
    const tileIdx = ty * C.WORLD_MAP_COLS + tx;
    let blocked = false;
    if (tileIdx >= 0 && tileIdx < S.worldMap.length) {
      const terrain = S.worldMap[tileIdx];
      if (terrain === C.TerrainType.Mountain || terrain === C.TerrainType.Ocean) {
        blocked = true;
      } else if (terrain === C.TerrainType.Forest) {
        moveX *= 0.6;
        moveY *= 0.6;
      } else if (terrain === C.TerrainType.Water) {
        moveX *= 0.3;
        moveY *= 0.3;
      }
    }

    if (!blocked) {
      S.positionX[i] += moveX;
      S.positionY[i] += moveY;
    } else {
      S.velocityX[i] *= -0.5; // Bounce slightly off mountains
      S.velocityY[i] *= -0.5;
    }

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
