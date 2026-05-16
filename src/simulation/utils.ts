// src/simulation/utils.ts
import * as C from './constants';
import * as S from './state';

export function findNearest(x: number, y: number, radius: number, filterBitmask: number): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(C.GRID_COLS - 1, Math.floor((x + radius) / C.GRID_SIZE));
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(C.GRID_ROWS - 1, Math.floor((y + radius) / C.GRID_SIZE));
  let itemsChecked = 0;
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let entityId = S.spatialHead[cellIndex];
      while (entityId !== -1) {
        itemsChecked++;
        if (itemsChecked >= 64) break;
        if (filterBitmask === 0xFFFFFFFF || (S.traitBitmask[entityId] & filterBitmask) !== 0) {
          const dx = S.positionX[entityId] - x; const dy = S.positionY[entityId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) { minDistanceSq = distSq; closestId = entityId; }
        }
        entityId = S.spatialNext[entityId];
      }
      if (itemsChecked >= 64) break;
    }
    if (itemsChecked >= 64) break;
  }
  return closestId;
}

export function findNearestBuilding(x: number, y: number, radius: number, typeFilter: number): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(C.GRID_COLS - 1, Math.floor((x + radius) / C.GRID_SIZE));
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(C.GRID_ROWS - 1, Math.floor((y + radius) / C.GRID_SIZE));
  let itemsChecked = 0;
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let bldId = S.bldSpatialHead[cellIndex];
      while (bldId !== -1) {
        itemsChecked++;
        if (itemsChecked >= 64) break;
        if (typeFilter === -1 || S.bldType[bldId] === typeFilter) {
          const dx = S.bldPositionX[bldId] - x; const dy = S.bldPositionY[bldId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) { minDistanceSq = distSq; closestId = bldId; }
        }
        bldId = S.bldSpatialNext[bldId];
      }
      if (itemsChecked >= 64) break;
    }
    if (itemsChecked >= 64) break;
  }
  return closestId;
}

export function findNearestOwnedBuilding(x: number, y: number, radius: number, typeFilter: number, ownerGroup: number): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(C.GRID_COLS - 1, Math.floor((x + radius) / C.GRID_SIZE));
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(C.GRID_ROWS - 1, Math.floor((y + radius) / C.GRID_SIZE));
  
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let bldId = S.bldSpatialHead[cellIndex];
      while (bldId !== -1) {
        if (S.bldOwnerGroup[bldId] === ownerGroup && (typeFilter === -1 || S.bldType[bldId] === typeFilter)) {
          const dx = S.bldPositionX[bldId] - x; const dy = S.bldPositionY[bldId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) { minDistanceSq = distSq; closestId = bldId; }
        }
        bldId = S.bldSpatialNext[bldId];
      }
    }
  }
  return closestId;
}

export function findNearestVehicle(x: number, y: number, radius: number, typeFilter: number): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(C.GRID_COLS - 1, Math.floor((x + radius) / C.GRID_SIZE));
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(C.GRID_ROWS - 1, Math.floor((y + radius) / C.GRID_SIZE));
  
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let vehId = S.vehSpatialHead[cellIndex];
      while (vehId !== -1) {
        if (S.vehHealth[vehId] > 0 && (typeFilter === -1 || S.vehType[vehId] === typeFilter)) {
          const dx = S.vehPositionX[vehId] - x; const dy = S.vehPositionY[vehId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) { minDistanceSq = distSq; closestId = vehId; }
        }
        vehId = S.vehSpatialNext[vehId];
      }
    }
  }
  return closestId;
}

export function pushEvent(entityId: number, eventId: number): boolean {
  const baseIndex = entityId * 4;
  for (let slot = 0; slot < 4; slot++) {
    if (S.pendingEvents[baseIndex + slot] === -1) { S.pendingEvents[baseIndex + slot] = eventId; return true; }
  }
  return false;
}

export function popNextEvent(entityId: number): number {
  const baseIndex = entityId * 4;
  const nextEventId = S.pendingEvents[baseIndex];
  S.pendingEvents[baseIndex] = S.pendingEvents[baseIndex + 1];
  S.pendingEvents[baseIndex + 1] = S.pendingEvents[baseIndex + 2];
  S.pendingEvents[baseIndex + 2] = S.pendingEvents[baseIndex + 3];
  S.pendingEvents[baseIndex + 3] = -1;
  return nextEventId;
}

export function broadcastGroupCommand(groupId: number, commandState: number, targetX: number, targetY: number): void {
  if (groupId >= 0 && groupId < C.MAX_GROUPS) {
    S.groupTargetX[groupId] = targetX; S.groupTargetY[groupId] = targetY; S.groupTargetEntityId[groupId] = -2; S.groupTargetAge[groupId] = 0;
  }
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;
    if (S.positionX[i] < S.minX || S.positionX[i] >= S.maxX || S.positionY[i] < S.minY || S.positionY[i] >= S.maxY) continue;

    const isResource = (S.traitBitmask[i] & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0;
    if (isResource) continue; 
    let issuingPriority = 0; let slotIdx = -1; const baseIdx = i * 8;
    for (let s = 0; s < 8; s++) { if (S.groupAffiliations[baseIdx + s] === groupId) { slotIdx = s; issuingPriority = 8 - s; break; } }
    if (issuingPriority > 0) {
      if (S.activePrioritySlot[i] === -1 || slotIdx <= S.activePrioritySlot[i]) {
        S.state[i] = commandState; S.actionTimer[i] = 0; S.activeCommandPriority[i] = issuingPriority; S.activePrioritySlot[i] = slotIdx;
      }
    }
  }
}

export function waitForAll(phase: number): void {
  const target = 4;
  const count = Atomics.add(S.workerSync, phase, 1) + 1;
  if (count === target) {
    Atomics.notify(S.workerSync, phase, target);
  } else {
    while (Atomics.load(S.workerSync, phase) < target) {
      Atomics.wait(S.workerSync, phase, count);
    }
  }
}
