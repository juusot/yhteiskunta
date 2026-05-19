import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";

/**
 * Combat System
 * Handles projectiles, aura effects, and damage application.
 */
export function runCombatSystem(
  state: SharedArrayBuffer,
  startIndex: number,
  endIndex: number,
): void {
  // 1. Projectile Processing
  const projStart = Math.floor(
    (startIndex / C.MAX_ENTITIES) * C.MAX_PROJECTILES,
  );
  const projEnd = Math.floor((endIndex / C.MAX_ENTITIES) * C.MAX_PROJECTILES);

  for (let i = projStart; i < projEnd; i++) {
    if (S.projType[i] === 0 || S.projLifeTime[i] <= 0) continue;

    S.projLifeTime[i]--;
    if (S.projLifeTime[i] <= 0) {
      S.projType[i] = 0;
      continue;
    }

    S.projPositionX[i] += S.projVelocityX[i];
    S.projPositionY[i] += S.projVelocityY[i];

    const tx = Math.floor(S.projPositionX[i] / C.GRID_SIZE);
    const ty = Math.floor(S.projPositionY[i] / C.GRID_SIZE);

    if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
      const cellIdx = ty * C.GRID_COLS + tx;
      let victimId = S.spatialHead[cellIdx];
      const ownerGroup = S.projOwnerGroup[i];

      while (victimId !== -1) {
        if (
          S.health[victimId] > 0 &&
          S.state[victimId] !== C.EntityState.Dead
        ) {
          const victimGroup =
            S.groupAffiliations[victimId * C.MAX_GROUP_CHANNELS + 0];
          let isEnemy = false;
          if (
            ownerGroup !== -1 &&
            victimGroup !== -1 &&
            ownerGroup !== victimGroup
          ) {
            if (
              S.groupRelationsMatrix[ownerGroup * C.MAX_GROUPS + victimGroup] <
              -50
            )
              isEnemy = true;
          }

          if (isEnemy) {
            const dx = S.positionX[victimId] - S.projPositionX[i];
            const dy = S.positionY[victimId] - S.projPositionY[i];
            if (dx * dx + dy * dy < 16.0) {
              Atomics.sub(S.health, victimId, 25);
              // Set target for retaliation if applicable
              if (ownerGroup !== -1) {
                S.targetEntityId[victimId] =
                  ownerGroup >= 0 ? S.groupWarehouseX[ownerGroup] : -1;
              }
              S.projType[i] = 0;
              S.projLifeTime[i] = 0;
              break;
            }
          }
        }
        victimId = S.spatialNext[victimId];
      }
    }
  }

  // 2. Aura Effects (Mind Control, etc.)
  const bldStart = Math.floor((startIndex / C.MAX_ENTITIES) * C.MAX_BUILDINGS);
  const bldEnd = Math.floor((endIndex / C.MAX_ENTITIES) * C.MAX_BUILDINGS);
  for (let b = bldStart; b < bldEnd; b++) {
    if (S.bldHealth[b] <= 0 || S.bldType[b] === 0) continue;

    if (S.bldType[b] === C.BuildingType.MindControl) {
      const bx = S.bldPositionX[b],
        by = S.bldPositionY[b];
      const ownerGroup = S.bldOwnerGroup[b],
        range = 150.0,
        rangeSq = range * range;
      const cellRadius = Math.ceil(range / C.GRID_SIZE);
      const btx = Math.floor(bx / C.GRID_SIZE);
      const bty = Math.floor(by / C.GRID_SIZE);

      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
          const tx = btx + dx,
            ty = bty + dy;
          if (tx >= 0 && tx < C.GRID_COLS && ty >= 0 && ty < C.GRID_ROWS) {
            let entityId = S.spatialHead[ty * C.GRID_COLS + tx];
            while (entityId !== -1) {
              if (
                S.health[entityId] > 0 &&
                S.state[entityId] !== C.EntityState.Dead
              ) {
                const ex = S.positionX[entityId],
                  ey = S.positionY[entityId];
                const ddx = ex - bx,
                  ddy = ey - by;
                if (ddx * ddx + ddy * ddy < rangeSq) {
                  S.groupAffiliations[entityId * C.MAX_GROUP_CHANNELS + 0] =
                    ownerGroup;
                }
              }
              entityId = S.spatialNext[entityId];
            }
          }
        }
      }
    }
  }

  // 3. Entity Combat Execution
  for (let i = startIndex; i < endIndex; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;

    const myGroup = S.groupAffiliations[i * C.MAX_GROUP_CHANNELS];
    if (myGroup === -1) continue;

    // 1. Target Acquisition for Idle units
    if (S.state[i] === C.EntityState.Idle) {
      // Scan spatial hash for enemy characters within an aggro radius of 50 units
      const enemyId = U.findNearestEnemy(
        S.positionX[i],
        S.positionY[i],
        50,
        myGroup,
      );

      if (enemyId !== -1) {
        S.targetEntityId[i] = enemyId;
        S.state[i] = C.EntityState.Combat;
      }
    }

    // 2. Combat Execution
    if (S.state[i] === C.EntityState.Combat) {
      const targetId = S.targetEntityId[i];

      // Validate target
      if (targetId === -1 || S.state[targetId] === C.EntityState.Dead) {
        S.state[i] = C.EntityState.Idle;
        S.targetEntityId[i] = -1;
        continue;
      }

      const dx = S.positionX[targetId] - S.positionX[i];
      const dy = S.positionY[targetId] - S.positionY[i];
      const distSq = dx * dx + dy * dy;

      // Melee attack range check (e.g., 5 units squared = 25)
      if (distSq <= 25) {
        // Halt movement
        S.velocityX[i] = 0;
        S.velocityY[i] = 0;

        // Apply damage based on a timer to prevent instant kills (1 hit per 60 ticks)
        if (S.tickCount % 60 === 0) {
          Atomics.sub(S.health, targetId, S.effectiveDamage[i]);
        }
      } else {
        // Move towards target
        const dist = Math.sqrt(distSq);
        S.velocityX[i] = (dx / dist) * S.effectiveSpeed[i];
        S.velocityY[i] = (dy / dist) * S.effectiveSpeed[i];
      }
    }
  }
}
