// src/simulation/utils.ts
import * as C from "./constants";
import * as S from "./state";

export function findNearest(
  x: number,
  y: number,
  radius: number,
  filterBitmask: number,
): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(
    C.GRID_COLS - 1,
    Math.floor((x + radius) / C.GRID_SIZE),
  );
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(
    C.GRID_ROWS - 1,
    Math.floor((y + radius) / C.GRID_SIZE),
  );
  let itemsChecked = 0;
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let entityId = S.spatialHead[cellIndex];
      while (entityId !== -1) {
        itemsChecked++;
        if (itemsChecked >= 64) break;
        if (
          S.state[entityId] !== C.EntityState.Dead &&
          (filterBitmask === 0xffffffff ||
            (S.traitBitmask[entityId] & filterBitmask) !== 0)
        ) {
          const dx = S.positionX[entityId] - x;
          const dy = S.positionY[entityId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) {
            minDistanceSq = distSq;
            closestId = entityId;
          }
        }
        entityId = S.spatialNext[entityId];
      }
      if (itemsChecked >= 64) break;
    }
    if (itemsChecked >= 64) break;
  }
  return closestId;
}

export function findNearestWithTrait(
  x: number,
  y: number,
  radius: number,
  traitMask: number,
): number {
  const radiusSq = radius * radius;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(
    C.GRID_COLS - 1,
    Math.floor((x + radius) / C.GRID_SIZE),
  );
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(
    C.GRID_ROWS - 1,
    Math.floor((y + radius) / C.GRID_SIZE),
  );

  let closestId = -1;
  let minDist = radiusSq;

  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let id = S.spatialHead[cellIndex];

      while (id !== -1) {
        if (
          S.state[id] !== C.EntityState.Dead &&
          (S.traitBitmask[id] & traitMask) !== 0
        ) {
          const dx = S.positionX[id] - x;
          const dy = S.positionY[id] - y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            closestId = id;
          }
        }
        id = S.spatialNext[id];
      }
    }
  }
  return closestId;
}

export function findNearestEnemy(
  x: number,
  y: number,
  radius: number,
  myGroupId: number,
): number {
  const radiusSq = radius * radius;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(
    C.GRID_COLS - 1,
    Math.floor((x + radius) / C.GRID_SIZE),
  );
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(
    C.GRID_ROWS - 1,
    Math.floor((y + radius) / C.GRID_SIZE),
  );

  let closestId = -1;
  let minDist = radiusSq;

  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let id = S.spatialHead[cellIndex];

      while (id !== -1) {
        // Ignore dead entities
        if (S.state[id] !== C.EntityState.Dead) {
          const theirGroup = S.groupAffiliations[id * C.MAX_GROUP_CHANNELS];
          // Only target characters with a different, valid group ID
          if (theirGroup !== -1 && theirGroup !== myGroupId) {
            const dx = S.positionX[id] - x;
            const dy = S.positionY[id] - y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
              minDist = dist;
              closestId = id;
            }
          }
        }
        id = S.spatialNext[id];
      }
    }
  }
  return closestId;
}

export function findNearestBuilding(
  x: number,
  y: number,
  radius: number,
  type: number,
  groupId: number,
): number {
  const radiusSq = radius * radius;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(
    C.GRID_COLS - 1,
    Math.floor((x + radius) / C.GRID_SIZE),
  );
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(
    C.GRID_ROWS - 1,
    Math.floor((y + radius) / C.GRID_SIZE),
  );

  let closestId = -1;
  let minDist = radiusSq;

  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let id = S.bldSpatialHead[cellIndex];

      while (id !== -1) {
        if (
          S.bldHealth[id] > 0 &&
          (type === -1 || S.bldType[id] === type) &&
          (groupId === -1 || S.bldOwnerGroup[id] === groupId)
        ) {
          const dx = S.bldPositionX[id] - x;
          const dy = S.bldPositionY[id] - y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            closestId = id;
          }
        }
        id = S.bldSpatialNext[id];
      }
    }
  }
  return closestId;
}

export function findNearestOwnedBuilding(
  x: number,
  y: number,
  radius: number,
  typeFilter: number,
  ownerGroup: number,
): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(
    C.GRID_COLS - 1,
    Math.floor((x + radius) / C.GRID_SIZE),
  );
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(
    C.GRID_ROWS - 1,
    Math.floor((y + radius) / C.GRID_SIZE),
  );

  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let bldId = S.bldSpatialHead[cellIndex];
      while (bldId !== -1) {
        if (
          S.bldOwnerGroup[bldId] === ownerGroup &&
          (typeFilter === -1 || S.bldType[bldId] === typeFilter)
        ) {
          const dx = S.bldPositionX[bldId] - x;
          const dy = S.bldPositionY[bldId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) {
            minDistanceSq = distSq;
            closestId = bldId;
          }
        }
        bldId = S.bldSpatialNext[bldId];
      }
    }
  }
  return closestId;
}

export function findNearestVehicle(
  x: number,
  y: number,
  radius: number,
  typeFilter: number,
): number {
  const radiusSq = radius * radius;
  let minDistanceSq = radiusSq + 1;
  let closestId = -1;
  const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
  const maxCellX = Math.min(
    C.GRID_COLS - 1,
    Math.floor((x + radius) / C.GRID_SIZE),
  );
  const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
  const maxCellY = Math.min(
    C.GRID_ROWS - 1,
    Math.floor((y + radius) / C.GRID_SIZE),
  );

  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIndex = cy * C.GRID_COLS + cx;
      let vehId = S.vehSpatialHead[cellIndex];
      while (vehId !== -1) {
        if (
          S.vehHealth[vehId] > 0 &&
          (typeFilter === -1 || S.vehType[vehId] === typeFilter)
        ) {
          const dx = S.vehPositionX[vehId] - x;
          const dy = S.vehPositionY[vehId] - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistanceSq && distSq <= radiusSq) {
            minDistanceSq = distSq;
            closestId = vehId;
          }
        }
        vehId = S.vehSpatialNext[vehId];
      }
    }
  }
  return closestId;
}

export function pushEvent(entityId: number, eventId: number): boolean {
  const baseIndex = entityId * C.EVENT_SLOTS_PER_CHARACTER;
  for (let slot = 0; slot < C.EVENT_SLOTS_PER_CHARACTER; slot++) {
    if (S.pendingEvents[baseIndex + slot] === -1) {
      S.pendingEvents[baseIndex + slot] = eventId;
      return true;
    }
  }
  return false;
}

export function popNextEvent(entityId: number): number {
  const baseIndex = entityId * C.EVENT_SLOTS_PER_CHARACTER;
  const nextEventId = S.pendingEvents[baseIndex];
  for (let s = 0; s < C.EVENT_SLOTS_PER_CHARACTER - 1; s++) {
    S.pendingEvents[baseIndex + s] = S.pendingEvents[baseIndex + s + 1];
  }
  S.pendingEvents[baseIndex + C.EVENT_SLOTS_PER_CHARACTER - 1] = -1;
  return nextEventId;
}

export function broadcastGroupCommand(
  groupId: number,
  commandState: number,
  tx: number,
  ty: number,
): void {
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;

    if (S.groupAffiliations[i * C.MAX_GROUP_CHANNELS] === groupId) {
      // ACTION: COMBAT (3) -> Force idle units into a high-radius aggro scan
      if (
        commandState === C.EntityState.Combat &&
        S.state[i] === C.EntityState.Idle
      ) {
        const enemyId = findNearestEnemy(
          S.positionX[i],
          S.positionY[i],
          300,
          groupId,
        ); // Massive 300 unit radius
        if (enemyId !== -1) {
          S.targetEntityId[i] = enemyId;
          S.state[i] = C.EntityState.Combat;
        }
      }
      // ACTION: FLEE (2) -> Force units to run to specific coordinates
      else if (commandState === C.EntityState.Fleeing) {
        S.state[i] = C.EntityState.Fleeing;
        S.playerTargetX[i] = tx;
        S.playerTargetY[i] = ty;
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

export function generateName(): string {
  const first = [
    "Ael",
    "Bry",
    "Cen",
    "Dax",
    "Ery",
    "Fae",
    "Gai",
    "Hale",
    "Iro",
    "Jax",
  ];
  const last = [
    "son",
    "ton",
    "rik",
    "wyn",
    "dor",
    "lan",
    "us",
    "ia",
    "en",
    "th",
  ];
  return (
    first[Math.floor(Math.random() * first.length)] +
    last[Math.floor(Math.random() * last.length)]
  );
}

/**
 * Create a new group
 * @param name - User-friendly name for the group
 * @param ownerId - Optional owning group (for hierarchies)
 * @returns Group ID (0 to MAX_GROUPS-1)
 */
export function createGroup(name: string, _ownerId: number = -1): number {
  // Find empty slot
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    if (S.groupPopulationCount[g] === 0 && S.groupBuildingCount[g] === 0) {
      // Initialize group
      S.groupTotalWealth[g] = 1000; // Starting wealth
      S.groupCreatedAt[g] =
        S.gameDay +
        S.gameMonth * C.DAYS_PER_MONTH +
        S.gameYear * C.DAYS_PER_MONTH * C.MONTHS_PER_YEAR;
      S.groupNames.set(g, name);

      console.log(`Group created: ${name} (ID: ${g})`);

      // Notify main thread to update UI
      if (S.quadrantIndex === 0) {
        self.postMessage({
          type: "GROUP_CREATED",
          payload: { groupId: g, name },
        });
      }

      return g;
    }
  }
  console.error("No empty group slots available!");
  return -1;
}

/**
 * Assign a character to a group in a specific slot
 * @param entityId - Character ID
 * @param groupId - Group ID to assign to
 * @param slot - Slot index (0 = highest priority, 7 = lowest)
 */
export function assignCharacterToGroup(
  entityId: number,
  groupId: number,
  slot: number,
): boolean {
  if (entityId < 0 || entityId >= C.MAX_ENTITIES) return false;
  if (groupId < 0 || groupId >= C.MAX_GROUPS) return false;
  if (slot < 0 || slot >= C.MAX_GROUP_CHANNELS) return false;

  const baseIdx = entityId * C.MAX_GROUP_CHANNELS;
  S.groupAffiliations[baseIdx + slot] = groupId;

  console.log(`Entity ${entityId} assigned to Group ${groupId} (slot ${slot})`);
  return true;
}

/**
 * Remove a character from a group slot
 * @param entityId - Character ID
 * @param slot - Slot index to clear
 */
export function removeCharacterFromGroup(
  entityId: number,
  slot: number,
): boolean {
  if (entityId < 0 || entityId >= C.MAX_ENTITIES) return false;
  if (slot < 0 || slot >= C.MAX_GROUP_CHANNELS) return false;

  const baseIdx = entityId * C.MAX_GROUP_CHANNELS;
  S.groupAffiliations[baseIdx + slot] = -1;

  console.log(`Entity ${entityId} removed from group slot ${slot}`);
  return true;
}

/**
 * Get all characters in a group
 * @param groupId - Group ID
 * @returns Array of entity IDs
 */
export function getGroupMembers(groupId: number): number[] {
  const members: number[] = [];
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;

    const baseIdx = i * C.MAX_GROUP_CHANNELS;
    for (let slot = 0; slot < C.MAX_GROUP_CHANNELS; slot++) {
      if (S.groupAffiliations[baseIdx + slot] === groupId) {
        members.push(i);
        break;
      }
    }
  }
  return members;
}

/**
 * Check if a position is within a group's influence radius
 * @param x - World X coordinate
 * @param y - World Y coordinate
 * @param groupId - Group ID to check
 * @returns true if position is within group's influence
 */
export function isInGroupInfluence(
  x: number,
  y: number,
  groupId: number,
): boolean {
  const tileX = Math.floor(x / C.TILE_SIZE);
  const tileY = Math.floor(y / C.TILE_SIZE);

  if (
    tileX < 0 ||
    tileX >= C.WORLD_MAP_COLS ||
    tileY < 0 ||
    tileY >= C.WORLD_MAP_ROWS
  ) {
    return false;
  }

  const idx = tileY * C.WORLD_MAP_COLS + tileX;

  // Check if tile is owned by this group
  if (S.territoryOwnerMap[idx] === groupId && S.influenceMap[idx] > 0) {
    return true;
  }

  // Also check nearby buildings directly (for more precise check)
  for (let b = 0; b < C.MAX_BUILDINGS; b++) {
    if (
      S.bldType[b] === 0 ||
      S.bldHealth[b] <= 0 ||
      S.bldOwnerGroup[b] !== groupId
    )
      continue;

    let radius = 0;
    switch (S.bldType[b]) {
      case C.BuildingType.Warehouse:
        radius = C.INFLUENCE_RADIUS_WAREHOUSE;
        break;
      case C.BuildingType.House:
        radius = C.INFLUENCE_RADIUS_HOUSE;
        break;
      case C.BuildingType.Tower:
        radius = C.INFLUENCE_RADIUS_TOWER;
        break;
      default:
        continue;
    }

    const dx = x - S.bldPositionX[b];
    const dy = y - S.bldPositionY[b];
    if (dx * dx + dy * dy <= radius * radius) {
      return true;
    }
  }

  return false;
}

/**
 * Send an event to all members of a group
 * @param groupId - Group ID
 * @param eventType - Event type code (EVENT_ATTACK, EVENT_MOVE, etc.)
 */
export function sendEventToGroup(groupId: number, eventType: number): number {
  let sent = 0;
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;

    const baseIdx = i * C.MAX_GROUP_CHANNELS;
    for (let slot = 0; slot < C.MAX_GROUP_CHANNELS; slot++) {
      if (S.groupAffiliations[baseIdx + slot] === groupId) {
        // Add event to first empty slot
        const eventBase = i * C.EVENT_SLOTS_PER_CHARACTER;
        for (
          let eventSlot = 0;
          eventSlot < C.EVENT_SLOTS_PER_CHARACTER;
          eventSlot++
        ) {
          if (S.pendingEvents[eventBase + eventSlot] === -1) {
            S.pendingEvents[eventBase + eventSlot] = eventType;
            sent++;
            break;
          }
        }
        break; // Only send once per entity
      }
    }
  }
  console.log(`Event ${eventType} sent to ${sent} members of Group ${groupId}`);
  return sent;
}

/**
 * Phase 4: Create a new physical item instance in the world
 */
export function createItemInstance(
  defId: number,
  ownerType: number,
  x: number,
  y: number,
  ownerId: number = -1,
): number {
  for (let i = 0; i < C.MAX_ITEM_INSTANCES; i++) {
    // ATOMIC CHECK: Ensure slot is inactive
    if (
      Atomics.compareExchange(
        S.itemInstanceOwnerType,
        i,
        C.OWNER_TYPE_INACTIVE,
        ownerType,
      ) === C.OWNER_TYPE_INACTIVE
    ) {
      S.itemInstanceDefId[i] = defId;
      S.itemInstanceOwnerId[i] = ownerId;
      S.itemInstanceX[i] = x;
      S.itemInstanceY[i] = y;
      return i;
    }
  }
  return -1;
}

/**
 * Phase 21: High-level character initialization and spawn
 * Standardizes character creation across initial setup, reproduction, and manual spawning.
 */
export function spawnCharacter(
  id: number,
  x: number,
  y: number,
  groupId: number,
): void {
  S.state[id] = C.EntityState.Idle;
  S.positionX[id] = x;
  S.positionY[id] = y;
  S.velocityX[id] = (Math.random() - 0.5) * 0.5;
  S.velocityY[id] = (Math.random() - 0.5) * 0.5;
  S.health[id] = 100;
  S.money[id] = 0;
  S.charBirthTick[id] = S.tickCount;
  S.traitBitmask[id] = C.TRAIT_NONE; // Reset traits for new citizen

  // Lifetime between 60-100 years as requested
  S.lifespan[id] = 60 + Math.floor(Math.random() * 41);

  // Clear all group affiliations
  const baseAffIdx = id * C.MAX_GROUP_CHANNELS;
  for (let s = 0; s < C.MAX_GROUP_CHANNELS; s++) {
    S.groupAffiliations[baseAffIdx + s] = -1;
  }

  // Assign primary group if provided
  if (groupId !== -1) {
    S.groupAffiliations[baseAffIdx] = groupId;
  }

  // Clear targets and status flags
  S.targetEntityId[id] = -1;
  S.targetBuildingId[id] = -1;
  S.targetVehicleId[id] = -1;
  S.targetItemId[id] = -1;
  S.isMounted[id] = 0;
  S.entityInventory[id] = 0;
  S.mana[id] = 100;
  S.carriedIntelEntityId[id] = -1;
  S.charWeapon[id] = -1;
  S.charArmor[id] = -1;
  S.charTool[id] = -1;

  // Initialize effective stats
  S.effectiveLifespan[id] = S.lifespan[id];
  S.effectiveDamage[id] = S.damage[id] || 10;
  S.effectiveSpeed[id] = S.speed[id] || 1.0;

  // Generate and notify name
  const name = generateName();
  S.entityNames.set(id, name);

  try {
    if (typeof self !== "undefined" && "postMessage" in self) {
      self.postMessage({
        type: "ENTITY_NAMED",
        payload: { entityId: id, name },
      });
    }
  } catch (e) {
    // Silent fail if postMessage is unavailable or restricted
  }
}

/**
 * Phase 4: Place an item instance on the ground
 */
export function setItemInstanceGround(
  instanceId: number,
  x: number,
  y: number,
): void {
  if (instanceId < 0 || instanceId >= C.MAX_ITEM_INSTANCES) return;
  S.itemInstanceOwnerType[instanceId] = 1; // 1 = Ground
  S.itemInstanceX[instanceId] = x;
  S.itemInstanceY[instanceId] = y;
  S.itemInstanceOwnerId[instanceId] = -1;
}
