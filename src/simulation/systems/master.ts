// src/simulation/systems/master.ts
import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";
import * as B from "../buffs";

export function SummarySystem(): void {
  if (S.tickCount % 60 !== 0) return;

  let totalActive = 0;
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    totalActive += S.groupPopulationCount[g];
  }

  // Phase 23: National Cohesion System
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    const pop = S.groupPopulationCount[g];
    if (pop === 0) continue;

    const wealth = S.groupTotalWealth[g];

    if (wealth > C.COHESION_WEALTHY_THRESHOLD) {
      S.groupCohesion[g] = Math.min(
        C.COHESION_MAX,
        S.groupCohesion[g] + C.COHESION_GROWTH_RATE,
      );
    } else if (wealth <= 0) {
      S.groupCohesion[g] = Math.max(
        0,
        S.groupCohesion[g] - C.COHESION_DECAY_RATE,
      );
    }

    if (
      S.groupCohesion[g] < C.COHESION_ANARCHY_THRESHOLD &&
      S.tickCount % C.TICKS_PER_DAY === 0
    ) {
      triggerAnarchy(g);
    }
  }

  // Food consumption - only food matters for survival, not wealth
  S.starvingGroups.fill(0);
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    const pop = S.groupPopulationCount[g];
    if (pop === 0) continue;

    if (S.groupFood[g] <= 0) {
      S.starvingGroups[g] = 1;
      continue;
    }

    const foodRequired = Math.max(1, Math.floor(pop * 0.1));
    if (S.groupFood[g] >= foodRequired) {
      S.groupFood[g] -= foodRequired;
    } else {
      S.groupFood[g] = 0;
      S.starvingGroups[g] = 1;
    }
  }

  // Reproduction & Safety Net
  let deadPtr = 0;
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    const pop = S.groupPopulationCount[g];
    const wealth = S.groupTotalWealth[g];

    const needsSafetySpawn = g < 4 && pop < 20;
    const houseCapacity = Math.max(20, S.groupHouseCapacity[g]);
    const canAffordReproduction =
      pop > 0 && pop < houseCapacity && wealth > 1000;

    if (needsSafetySpawn || canAffordReproduction) {
      let births = 0;
      const maxBirths = needsSafetySpawn ? 5 : 2;
      const costPerBirth = 500;

      while (
        births < maxBirths &&
        (needsSafetySpawn || S.groupTotalWealth[g] > costPerBirth)
      ) {
        while (
          deadPtr < C.MAX_ENTITIES &&
          S.state[deadPtr] !== C.EntityState.Dead
        )
          deadPtr++;
        if (deadPtr >= C.MAX_ENTITIES) break;

        const i = deadPtr;
        S.state[i] = C.EntityState.Idle;
        S.health[i] = 100;
        S.positionX[i] = S.groupWarehouseX[g] + (Math.random() - 0.5) * 50;
        S.positionY[i] = S.groupWarehouseY[g] + (Math.random() - 0.5) * 50;
        S.velocityX[i] = Math.random() - 0.5;
        S.velocityY[i] = Math.random() - 0.5;
        S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0] = g;
        for (let s = 1; s < C.MAX_GROUP_CHANNELS; s++) {
          S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + s] = -1;
        }
        S.targetEntityId[i] = -1;
        S.entityInventory[i] = 0;
        S.actionTimer[i] = 60;

        const name = U.generateName();
        S.entityNames.set(i, name);
        if (S.quadrantIndex === 0) {
          self.postMessage({
            type: "ENTITY_NAMED",
            payload: { entityId: i, name },
          });
        }

        if (!needsSafetySpawn) S.groupTotalWealth[g] -= costPerBirth;
        births++;
        deadPtr++;
      }
    }
  }

  self.postMessage({ type: "STATS_UPDATE", payload: { totalActive } });

  EvaluateScenarioMilestones();
}

/**
 * Phase 25: Scenario Milestone Monitor
 * Evaluates success conditions and notifies UI
 */
export function EvaluateScenarioMilestones(): void {
  const metric = S.scenarioState[1];
  if (metric === 0) return;

  const gid = S.scenarioState[3];
  if (gid === -1 || gid >= C.MAX_GROUPS) return;

  const targetValue = S.scenarioState[2];
  let complete = false;

  if (metric === 1) {
    // Population Goal
    if (S.groupPopulationCount[gid] >= targetValue) complete = true;
  } else if (metric === 2) {
    // Wealth Goal
    if (S.groupTotalWealth[gid] >= targetValue) complete = true;
  }

  if (complete) {
    self.postMessage({ type: "SCENARIO_COMPLETE" });
    // Reset target to prevent duplicate messages
    S.scenarioState[1] = 0;
  }
}

/**
 * Phase 26: Rule Action Execution Handler
 * Triggers physical or diplomatic effects from the Rule Engine
 */
function ExecuteRuleAction(groupId: number, actionType: number): void {
  switch (actionType) {
    case C.ACTION_SPAWN_DEFENSE_PROJECTILE: {
      // 1. Locate an inactive projectile slot
      let pIdx = -1;
      for (let p = 0; p < C.MAX_PROJECTILES; p++) {
        if (S.projType[p] === 0) {
          pIdx = p;
          break;
        }
      }
      if (pIdx === -1) break;

      // 2. Find a hostile target group
      let enemyGroupId = -1;
      for (let otherG = 0; otherG < C.MAX_GROUPS; otherG++) {
        if (otherG === groupId || S.groupPopulationCount[otherG] === 0)
          continue;
        if (S.groupRelationsMatrix[groupId * C.MAX_GROUPS + otherG] <= -50) {
          enemyGroupId = otherG;
          break;
        }
      }
      if (enemyGroupId === -1) break;

      // 3. Calculate vector from warehouse origin to enemy warehouse
      const originX = S.groupWarehouseX[groupId];
      const originY = S.groupWarehouseY[groupId];
      const targetX = S.groupWarehouseX[enemyGroupId];
      const targetY = S.groupWarehouseY[enemyGroupId];

      let dx = targetX - originX;
      let dy = targetY - originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        dx /= dist;
        dy /= dist;
      }

      const speed = 5.0;
      const vecX = dx * speed;
      const vecY = dy * speed;

      // 4. Assign projectile data
      S.projType[pIdx] = C.PROJ_TYPE_FIREBALL;
      S.projPositionX[pIdx] = originX;
      S.projPositionY[pIdx] = originY;
      S.projVelocityX[pIdx] = vecX;
      S.projVelocityY[pIdx] = vecY;
      S.projLifeTime[pIdx] = 300;
      S.projOwnerGroup[pIdx] = groupId;
      break;
    }

    case C.ACTION_DECLARE_WAR: {
      // 1. Find a random neutral or allied group
      const potentialTargets: number[] = [];
      for (let otherG = 0; otherG < C.MAX_GROUPS; otherG++) {
        if (otherG === groupId || S.groupPopulationCount[otherG] === 0)
          continue;
        if (S.groupRelationsMatrix[groupId * C.MAX_GROUPS + otherG] > -50) {
          potentialTargets.push(otherG);
        }
      }

      if (potentialTargets.length === 0) break;
      const targetGid =
        potentialTargets[Math.floor(Math.random() * potentialTargets.length)];

      // 2. Set bilateral relation matrix to -100 (Instant hostility)
      S.groupRelationsMatrix[groupId * C.MAX_GROUPS + targetGid] = -100;
      S.groupRelationsMatrix[targetGid * C.MAX_GROUPS + groupId] = -100;

      // 3. Trigger immediate military invasion
      let warehouseBldIdx = -1;
      for (let b = 0; b < C.MAX_BUILDINGS; b++) {
        if (
          S.bldType[b] === C.BuildingType.Warehouse &&
          S.bldOwnerGroup[b] === targetGid
        ) {
          warehouseBldIdx = b;
          break;
        }
      }

      S.groupTargetEntityId[groupId] = warehouseBldIdx;
      const tx = S.groupWarehouseX[targetGid];
      const ty = S.groupWarehouseY[targetGid];
      S.groupTargetX[groupId] = tx;
      S.groupTargetY[groupId] = ty;
      S.groupTargetAge[groupId] = 0;

      // Force all idle citizens to move to combat state
      U.broadcastGroupCommand(groupId, C.EntityState.Combat, tx, ty);
      break;
    }
  }
}

const logicStack = new Int8Array(16);

export function evaluateCompoundRule(ruleIdx: number): boolean {
  let sp = 0;
  const baseOffset = ruleIdx * C.MAX_BYTECODE_PER_RULE;
  const gid = S.ruleRegistry[ruleIdx * 8 + 1];

  for (let i = 0; i < C.MAX_BYTECODE_PER_RULE; i++) {
    const op = S.logicBytecode[baseOffset + i];
    if (op === C.OP_END) break;

    switch (op) {
      case C.OP_POP_GT:
        logicStack[sp++] =
          S.groupPopulationCount[gid] > S.logicBytecode[baseOffset + ++i]
            ? 1
            : 0;
        break;
      case C.OP_WEALTH_LT:
        logicStack[sp++] =
          S.groupTotalWealth[gid] < S.logicBytecode[baseOffset + ++i] ? 1 : 0;
        break;
      case C.OP_RELATION_LT: {
        const otherGid = S.logicBytecode[baseOffset + ++i];
        const threshold = S.logicBytecode[baseOffset + ++i];
        logicStack[sp++] =
          S.groupRelationsMatrix[gid * C.MAX_GROUPS + otherGid] < threshold
            ? 1
            : 0;
        break;
      }
      case C.OP_DIST_GT: {
        const targetX = S.logicBytecode[baseOffset + ++i];
        const targetY = S.logicBytecode[baseOffset + ++i];
        const threshold = S.logicBytecode[baseOffset + ++i];
        const dx = S.groupWarehouseX[gid] - targetX,
          dy = S.groupWarehouseY[gid] - targetY;
        logicStack[sp++] = dx * dx + dy * dy > threshold * threshold ? 1 : 0;
        break;
      }
      case C.OP_TICK_MODULO: {
        const interval = S.logicBytecode[baseOffset + ++i];
        logicStack[sp++] = S.tickCount % interval === 0 ? 1 : 0;
        break;
      }
      case C.OP_RANDOM_CHANCE: {
        const threshold = S.logicBytecode[baseOffset + ++i];
        const roll = Math.random() * 100;
        logicStack[sp++] = roll < threshold ? 1 : 0;
        break;
      }
      case C.OP_COHESION_LT: {
        const threshold = S.logicBytecode[baseOffset + ++i];
        logicStack[sp++] = S.groupCohesion[gid] < threshold ? 1 : 0;
        break;
      }
      case C.GATE_AND: {
        const b = logicStack[--sp],
          a = logicStack[--sp];
        logicStack[sp++] = a && b ? 1 : 0;
        break;
      }
      case C.GATE_OR: {
        const b = logicStack[--sp],
          a = logicStack[--sp];
        logicStack[sp++] = a || b ? 1 : 0;
        break;
      }
      case C.GATE_NOT: {
        logicStack[sp - 1] = logicStack[sp - 1] ? 0 : 1;
        break;
      }
    }
  }
  return sp > 0 ? logicStack[0] === 1 : false;
}

export function RuleEvaluationSystem(): void {
  for (let gA = 0; gA < 50; gA++) {
    if (S.groupPopulationCount[gA] === 0) continue;
    for (let gB = 0; gB < 50; gB++) {
      if (gA === gB || S.groupPopulationCount[gB] === 0) continue;
      const relation = S.groupRelationsMatrix[gA * C.MAX_GROUPS + gB];
      if (relation <= -50) {
        U.broadcastGroupCommand(
          gA,
          C.EntityState.Combat,
          S.groupWarehouseX[gB],
          S.groupWarehouseY[gB],
        );
      }
    }
  }

  let firstActiveLocationTargetX = -1;
  let firstActiveLocationTargetY = -1;
  for (let r = 0; r < C.MAX_RULES; r++) {
    const baseIdx = r * 8;
    if (S.ruleRegistry[baseIdx + 7] === 0) continue;
    const subjectId = S.ruleRegistry[baseIdx + 1];
    const conditionType = S.ruleRegistry[baseIdx + 2];
    const threshold = S.ruleRegistry[baseIdx + 3];
    const actionState = S.ruleRegistry[baseIdx + 4];
    const targetX = S.ruleRegistry[baseIdx + 5];
    const targetY = S.ruleRegistry[baseIdx + 6];

    let conditionMet = false;
    if (conditionType === 255) {
      conditionMet = evaluateCompoundRule(r);
    } else {
      if (conditionType === 0) {
        if (S.groupPopulationCount[subjectId] > threshold) conditionMet = true;
      } else if (conditionType === 1) {
        if (S.groupTotalWealth[subjectId] > threshold) conditionMet = true;
      } else if (conditionType === 3) {
        if (S.groupTotalWealth[subjectId] < threshold) conditionMet = true;
      }
    }

    if (conditionMet) {
      if (actionState === 99) self.postMessage({ type: "SAVE_REQUEST" });
      else if (
        actionState === C.ACTION_SPAWN_DEFENSE_PROJECTILE ||
        actionState === C.ACTION_DECLARE_WAR
      ) {
        ExecuteRuleAction(subjectId, actionState);
      } else {
        U.broadcastGroupCommand(subjectId, actionState, targetX, targetY);
        if (firstActiveLocationTargetX === -1) {
          firstActiveLocationTargetX = targetX;
          firstActiveLocationTargetY = targetY;
        }
      }
    }
  }
  if (firstActiveLocationTargetX !== -1)
    updateFlowField(firstActiveLocationTargetX, firstActiveLocationTargetY);
}

export function GroupKnowledgeDecaySystem(): void {
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    if (S.groupTargetEntityId[g] !== -1) {
      S.groupTargetAge[g]++;
      if (S.groupTargetAge[g] > 500) {
        S.groupTargetEntityId[g] = -1;
        S.groupTargetAge[g] = 0;
      }
    }
  }
}

export function updateFlowField(targetX: number, targetY: number): void {
  const targetTileX = Math.floor(targetX / C.TILE_SIZE);
  const targetTileY = Math.floor(targetY / C.TILE_SIZE);
  if (
    targetTileX < 0 ||
    targetTileX >= C.WORLD_MAP_COLS ||
    targetTileY < 0 ||
    targetTileY >= C.WORLD_MAP_ROWS
  )
    return;

  S.integrationField.fill(65535);
  const targetIdx = targetTileY * C.WORLD_MAP_COLS + targetTileX;
  S.integrationField[targetIdx] = 0;

  // Use pre-allocated flowQueue and head/tail pointers to avoid GC
  let head = 0;
  let tail = 0;
  S.flowQueue[tail++] = targetIdx;

  while (head < tail) {
    const currIdx = S.flowQueue[head++];
    const currX = currIdx % C.WORLD_MAP_COLS;
    const currY = Math.floor(currIdx / C.WORLD_MAP_COLS);
    const currCost = S.integrationField[currIdx];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = currX + dx;
        const ny = currY + dy;
        if (
          nx >= 0 &&
          nx < C.WORLD_MAP_COLS &&
          ny >= 0 &&
          ny < C.WORLD_MAP_ROWS
        ) {
          const nIdx = ny * C.WORLD_MAP_COLS + nx;
          const terrain = S.worldMap[nIdx];
          let stepCost = dx !== 0 && dy !== 0 ? 1.4 : 1.0;
          if (terrain === 1) stepCost *= 3;
          if (terrain === 2) stepCost = 255;
          const totalCost = currCost + stepCost;
          if (totalCost < S.integrationField[nIdx]) {
            S.integrationField[nIdx] = totalCost;
            if (tail < S.flowQueue.length) S.flowQueue[tail++] = nIdx;
          }
        }
      }
    }
  }

  for (let y = 0; y < C.WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < C.WORLD_MAP_COLS; x++) {
      const idx = y * C.WORLD_MAP_COLS + x;
      const fIdx = idx * 2;
      let bestX = 0;
      let bestY = 0;
      let minCost = S.integrationField[idx];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx >= 0 &&
            nx < C.WORLD_MAP_COLS &&
            ny >= 0 &&
            ny < C.WORLD_MAP_ROWS
          ) {
            const nCost = S.integrationField[ny * C.WORLD_MAP_COLS + nx];
            if (nCost < minCost) {
              minCost = nCost;
              bestX = dx;
              bestY = dy;
            }
          }
        }
      }
      const len = Math.sqrt(bestX * bestX + bestY * bestY);
      if (len > 0) {
        S.globalFlowField[fIdx] = bestX / len;
        S.globalFlowField[fIdx + 1] = bestY / len;
      } else {
        S.globalFlowField[fIdx] = 0;
        S.globalFlowField[fIdx + 1] = 0;
      }
    }
  }
}

export function TradeSystem(): void {
  for (let gA = 0; gA < 50; gA++) {
    if (S.groupTotalWealth[gA] > 15000) {
      for (let gB = 0; gB < 50; gB++) {
        if (gA === gB || S.groupPopulationCount[gB] === 0) continue;
        if (S.groupTotalWealth[gB] < 1000) {
          const relation = S.groupRelationsMatrix[gA * C.MAX_GROUPS + gB];
          if (relation >= 0) {
            S.groupTotalWealth[gA] -= 2000;
            let couriersDispatched = 0;
            for (let i = 0; i < C.MAX_ENTITIES && couriersDispatched < 5; i++) {
              if (
                S.state[i] === C.EntityState.Idle &&
                S.groupAffiliations[i * C.MAX_GROUP_CHANNELS + 0] === gA
              ) {
                const dx = S.positionX[i] - S.groupWarehouseX[gA];
                const dy = S.positionY[i] - S.groupWarehouseY[gA];
                if (dx * dx + dy * dy < 10000) {
                  S.traitBitmask[i] |= C.TRAIT_COURIER;
                  S.state[i] = C.EntityState.Trading;
                  S.entityInventory[i] = 400;
                  S.targetEntityId[i] = -1000 - gB;
                  couriersDispatched++;
                }
              }
            }
            break;
          }
        }
      }
    }
  }
}

/**
 * InfluenceSystem - Building-based territorial influence
 *
 * Buildings project circular influence radii:
 * - Warehouse: 200 units (large starting area)
 * - House: 80 units (residential expansion)
 * - Tower: 150 units (military/cultural projection)
 * - Field/Wall: 0 units (no expansion)
 *
 * Overlapping influence creates diplomatic tension
 */
export function InfluenceSystem(): void {
  // Only run every 60 ticks (1 second) for performance
  if (S.tickCount % 60 !== 0) return;

  // Clear influence map
  S.influenceMap.fill(0);
  S.territoryOwnerMap.fill(-1);

  // Project influence from all buildings
  for (let b = 0; b < C.MAX_BUILDINGS; b++) {
    if (S.bldType[b] === 0 || S.bldHealth[b] <= 0) continue;

    const gid = S.bldOwnerGroup[b];
    if (gid === -1 || gid >= C.MAX_GROUPS) continue;

    // Get influence radius by building type
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
        radius = 0; // Fields, Walls don't project influence
    }

    if (radius === 0) continue;

    // Project circular influence with distance falloff
    const bldTileX = Math.floor(S.bldPositionX[b] / C.TILE_SIZE);
    const bldTileY = Math.floor(S.bldPositionY[b] / C.TILE_SIZE);
    const radiusTiles = Math.floor(radius / C.TILE_SIZE);

    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        const tileX = bldTileX + dx;
        const tileY = bldTileY + dy;

        if (
          tileX < 0 ||
          tileX >= C.WORLD_MAP_COLS ||
          tileY < 0 ||
          tileY >= C.WORLD_MAP_ROWS
        )
          continue;

        // Check if within circular radius
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusTiles * radiusTiles) continue;

        const idx = tileY * C.WORLD_MAP_COLS + tileX;
        const dist = Math.sqrt(distSq);

        // Calculate influence strength with linear falloff (1.0 at center, 0.0 at edge)
        const falloff = 1.0 - dist / radiusTiles;
        const influenceStrength = Math.floor(falloff * 1000);

        // Add influence for this group (allow multiple groups to influence same tile)
        // This creates the border overlap/tension mechanic
        S.influenceMap[idx] = Math.max(S.influenceMap[idx], influenceStrength);

        // Only claim territory if unclaimed
        if (S.territoryOwnerMap[idx] === -1) {
          S.territoryOwnerMap[idx] = gid;
        }
      }
    }
  }

  // Check for border overlaps and apply diplomatic tension
  checkBorderOverlaps();
}

/**
 * Check for overlapping influence between groups
 * Applies -5 relations/day for each overlapping tile
 */
function checkBorderOverlaps(): void {
  // Track which groups overlap (to avoid double-counting)
  const overlaps = new Set<number>();

  for (let i = 0; i < C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS; i++) {
    if (S.influenceMap[i] <= 0) continue;

    // Check neighboring tiles for different group influence
    const x = i % C.WORLD_MAP_COLS;
    const y = Math.floor(i / C.WORLD_MAP_COLS);
    const gid = S.territoryOwnerMap[i];

    // Check 4 adjacent tiles
    const neighbors = [
      { x: x - 1, y: y },
      { x: x + 1, y: y },
      { x: x, y: y - 1 },
      { x: x, y: y + 1 },
    ];

    for (const n of neighbors) {
      if (
        n.x < 0 ||
        n.x >= C.WORLD_MAP_COLS ||
        n.y < 0 ||
        n.y >= C.WORLD_MAP_ROWS
      )
        continue;

      const nIdx = n.y * C.WORLD_MAP_COLS + n.x;
      const nGid = S.territoryOwnerMap[nIdx];

      if (nGid !== -1 && nGid !== gid && S.influenceMap[nIdx] > 0) {
        // Border overlap detected!
        const overlapKey = gid < nGid ? gid * 1000 + nGid : nGid * 1000 + gid;
        if (!overlaps.has(overlapKey)) {
          overlaps.add(overlapKey);

          // Apply relation penalty (once per day per border pair)
          if (S.tickCount % C.TICKS_PER_DAY === 0) {
            const idxA = gid * C.MAX_GROUPS + nGid;
            const idxB = nGid * C.MAX_GROUPS + gid;
            S.groupRelationsMatrix[idxA] = Math.max(
              -100,
              S.groupRelationsMatrix[idxA] - C.INFLUENCE_OVERLAP_PENALTY,
            );
            S.groupRelationsMatrix[idxB] = Math.max(
              -100,
              S.groupRelationsMatrix[idxB] - C.INFLUENCE_OVERLAP_PENALTY,
            );
          }
        }
      }
    }
  }
}

/**
 * Buff System - runs once per game day
 * Clears expired buffs and recalculates effective stats
 */
export function BuffSystem(): void {
  // Only run once per day (3600 ticks)
  if (S.tickCount % C.TICKS_PER_DAY !== 0) return;

  // Clear expired buffs for all entities with active buffs
  B.clearAllExpiredBuffs();

  // Recalculate effective stats for all entities with buffs
  // This is the "slow update cycle" - not every tick, just daily
  for (const entityId of B.activeBuffs.keys()) {
    B.recalculateEffectiveStats(entityId);
  }
}

/**
 * Phase 23: ANARCHY TRIGGER
 * When a group's cohesion falls below threshold, demote the nation in priority
 * and promote family/clan to slot 0, effectively breaking centralized control
 */
function triggerAnarchy(governingGroupId: number): void {
  // Scan all entities that have this group in their PUBLIC slot 0
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;

    const baseIdx = i * C.MAX_GROUP_CHANNELS;
    const slot0Group = S.groupAffiliations[baseIdx + 0];

    // If this entity's top slot is the collapsing nation
    if (slot0Group === governingGroupId) {
      // Check if they have a family/clan in slot 1 to promote
      const slot1Group = S.groupAffiliations[baseIdx + 1];

      if (slot1Group !== -1 && slot1Group !== governingGroupId) {
        // Demote nation to slot 5, promote family to slot 0
        S.groupAffiliations[baseIdx + 0] = slot1Group; // Promote
        S.groupAffiliations[baseIdx + 1] = governingGroupId; // Demote
        S.groupAffiliations[baseIdx + 5] = governingGroupId; // Ensure at bottom
      }
    }
  }
}

/**
 * Phase 23: Structure Evolution System
 * Evaluates building upgrades based on group resources.
 */
export function StructureEvolutionSystem(): void {
  for (let i = 0; i < C.MAX_BUILDINGS; i++) {
    if (S.bldHealth[i] <= 0 || S.bldType[i] === 0) continue;

    const gid = S.bldOwnerGroup[i];
    if (gid === -1 || gid >= C.MAX_GROUPS) continue;

    const currentTier = S.bldTier[i];
    if (currentTier >= 3) continue; // Max tier reached

    let canUpgrade = false;
    let costWood = 0;
    let costGold = 0;

    if (currentTier === 1) {
      costWood = C.UPGRADE_TIER2_WOOD;
      costGold = C.UPGRADE_TIER2_GOLD;
    } else if (currentTier === 2) {
      costWood = C.UPGRADE_TIER3_WOOD;
      costGold = C.UPGRADE_TIER3_GOLD;
    }

    if (S.groupWood[gid] >= costWood && S.groupGold[gid] >= costGold) {
      canUpgrade = true;
    }

    if (canUpgrade) {
      // Deduct resources
      Atomics.sub(S.groupWood, gid, costWood);
      Atomics.sub(S.groupGold, gid, costGold);
      Atomics.sub(S.groupTotalWealth, gid, costWood + costGold);

      // Increment tier
      S.bldTier[i] = currentTier + 1;

      // Re-calculate generic registers based on new tier
      if (S.bldType[i] === C.BuildingType.Warehouse) {
        // Warehouse Storage Limit
        let newCapacity = 5000;
        if (S.bldTier[i] === 2) newCapacity = 25000;
        else if (S.bldTier[i] === 3) newCapacity = 100000;
        // DataA/B/C are the current items stored, we don't overwrite them here.
        // We will enforce the new capacities in parallel.ts when depositing.
      } else if (S.bldType[i] === C.BuildingType.House) {
        // Residential Capacity (DataB is Max Capacity)
        if (S.bldTier[i] === 2) S.bldDataB[i] = 12;
        else if (S.bldTier[i] === 3) S.bldDataB[i] = 30;
      }
    }
  }
}
