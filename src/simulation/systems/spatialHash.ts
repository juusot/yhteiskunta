import * as C from '../constants';
import * as S from '../state';

/**
 * Rebuilds the singly-linked list spatial hash grid for entities, buildings, vehicles, and items.
 * Uses atomic exchange for thread-safe insertion across workers.
 */
export function rebuildSpatialHash(state: SharedArrayBuffer, startIndex: number, endIndex: number): void {
  // Only the first worker clears the shared head pointers
  if (startIndex === 0) {
    S.spatialHead.fill(-1);
    S.bldSpatialHead.fill(-1);
    S.vehSpatialHead.fill(-1);
    S.itemSpatialHead.fill(-1);
  }

  // Entities - Main range processing
  for (let i = startIndex; i < endIndex; i++) {
    if (S.state[i] === C.EntityState.Dead) {
      S.spatialNext[i] = -1;
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

  // Parallelize Building spatial hash - proportional range
  const bldStart = Math.floor((startIndex / C.MAX_ENTITIES) * C.MAX_BUILDINGS);
  const bldEnd = Math.floor((endIndex / C.MAX_ENTITIES) * C.MAX_BUILDINGS);
  for (let i = bldStart; i < bldEnd; i++) {
    if (S.bldHealth[i] <= 0 || S.bldType[i] === 0) continue;

    const tx = Math.floor(S.bldPositionX[i] / C.GRID_SIZE);
    const ty = Math.floor(S.bldPositionY[i] / C.GRID_SIZE);
    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      const cellIdx = ty * C.GRID_COLS + tx;
      if (cellIdx >= 0 && cellIdx < S.bldSpatialHead.length) {
        S.bldSpatialNext[i] = Atomics.exchange(S.bldSpatialHead, cellIdx, i);
      }
    }
  }

  // Parallelize Vehicle spatial hash - proportional range
  const vehStart = Math.floor((startIndex / C.MAX_ENTITIES) * C.MAX_VEHICLES);
  const vehEnd = Math.floor((endIndex / C.MAX_ENTITIES) * C.MAX_VEHICLES);
  for (let i = vehStart; i < vehEnd; i++) {
    if (S.vehHealth[i] <= 0 || S.vehType[i] === 0) continue;

    const tx = Math.floor(S.vehPositionX[i] / C.GRID_SIZE);
    const ty = Math.floor(S.vehPositionY[i] / C.GRID_SIZE);
    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      const cellIdx = ty * C.GRID_COLS + tx;
      if (cellIdx >= 0 && cellIdx < S.vehSpatialHead.length) {
        S.vehSpatialNext[i] = Atomics.exchange(S.vehSpatialHead, cellIdx, i);
      }
    }
  }

  // Parallelize Item spatial hash - proportional range
  const itemStart = Math.floor((startIndex / C.MAX_ENTITIES) * C.MAX_ITEM_INSTANCES);
  const itemEnd = Math.floor((endIndex / C.MAX_ENTITIES) * C.MAX_ITEM_INSTANCES);
  for (let i = itemStart; i < itemEnd; i++) {
    if (S.itemInstanceOwnerType[i] !== C.OWNER_TYPE_GROUND) continue;

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
