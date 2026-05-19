// src/simulation/systems/master.ts
import * as C from "../constants";
import * as S from "../state";
import * as U from "../utils";
import * as B from "../buffs";

export function SummarySystem(): void {
  if (S.tickCount % 60 !== 0) return;

  // Aggregate values needed for VM conditional nodes
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    // Wealth is the sum of raw materials and processed goods
    S.groupTotalWealth[g] =
      S.groupWood[g] + S.groupGold[g] + S.groupFood[g] * 2 + S.groupMisc[g] * 5;
  }

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

  // Demographic & Resource Aggregation (Restored and moved from gathering system)
  S.groupWood.fill(0);
  S.groupGold.fill(0);
  S.groupFood.fill(0);
  S.groupBuildingCount.fill(0);
  S.groupHouseCapacity.fill(0);

  for (let b = 0; b < C.MAX_BUILDINGS; b++) {
    if (S.bldHealth[b] > 0 && S.bldType[b] !== 0) {
      const gid = S.bldOwnerGroup[b];
      if (gid >= 0 && gid < C.MAX_GROUPS) {
        S.groupBuildingCount[gid]++;
        if (S.bldType[b] === C.BuildingType.Warehouse) {
          // Update group warehouse location
          if (S.groupWarehouseX[gid] === 0) {
            S.groupWarehouseX[gid] = S.bldPositionX[b];
            S.groupWarehouseY[gid] = S.bldPositionY[b];
          }
          S.groupWood[gid] += S.bldDataA[b];
          S.groupGold[gid] += S.bldDataB[b];
          S.groupFood[gid] += S.bldDataC[b];
          S.groupHouseCapacity[gid] += 20; // Base warehouse capacity
        } else if (S.bldType[b] === C.BuildingType.House) {
          S.groupHouseCapacity[gid] += S.bldDataB[b] || 5; // Default 5 if not set
        }
      }
    }
  }

  for (let g = 0; g < C.MAX_GROUPS; g++) {
    const pop = S.groupPopulationCount[g];
    if (pop === 0) continue;

    if (S.groupFood[g] <= 0) {
      S.starvingGroups[g] = 1;
      continue;
    }

    if (S.tickCount % C.TICKS_PER_DAY === 0) {
      const foodRequired = Math.max(1, Math.floor(pop * 1.0)); // 1 unit per person per day
      if (S.groupFood[g] >= foodRequired) {
        // Deduct food from warehouses
        let remainingToDeduct = foodRequired;
        for (let b = 0; b < C.MAX_BUILDINGS; b++) {
          if (
            S.bldType[b] === C.BuildingType.Warehouse &&
            S.bldOwnerGroup[b] === g
          ) {
            const val = Atomics.load(S.bldDataC, b);
            const toTake = Math.min(remainingToDeduct, val);
            Atomics.sub(S.bldDataC, b, toTake);
            remainingToDeduct -= toTake;
            if (remainingToDeduct <= 0) break;
          }
        }
        S.groupFood[g] -= foodRequired;
      } else {
        S.groupFood[g] = 0;
        S.starvingGroups[g] = 1;
      }
    }
  }

  // Reproduction & Safety Net
  let deadPtr = 0;
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    const pop = S.groupPopulationCount[g];
    const wealth = S.groupTotalWealth[g];

    const houseCapacity = Math.max(20, S.groupHouseCapacity[g]);
    const canAffordReproduction =
      pop > 0 && pop < houseCapacity && wealth > 1000;

    if (canAffordReproduction) {
      let births = 0;
      const maxBirths = 2;
      const costPerBirth = 500;

      while (births < maxBirths && S.groupTotalWealth[g] > costPerBirth) {
        while (
          deadPtr < C.MAX_ENTITIES &&
          S.state[deadPtr] !== C.EntityState.Dead
        )
          deadPtr++;
        if (deadPtr >= C.MAX_ENTITIES) break;

        const i = deadPtr;
        const px = S.groupWarehouseX[g] + (Math.random() - 0.5) * 50;
        const py = S.groupWarehouseY[g] + (Math.random() - 0.5) * 50;
        U.spawnCharacter(i, px, py, g);

        S.groupTotalWealth[g] -= costPerBirth;
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
  // Process up to 20 rules defined in the UI
  for (let i = 0; i < 20; i++) {
    const rBase = i * 8;
    // Check if rule is enabled (index 7)
    if (S.ruleRegistry[rBase + 7] !== 1) continue;

    const subjectId = S.ruleRegistry[rBase + 1];
    if (subjectId < 0 || subjectId >= C.MAX_GROUPS) continue;

    const lBase = i * 32;
    let isTrue = true; // Nodes evaluate as an AND gate stack

    for (let j = 0; j < 32; j++) {
      const op = S.logicBytecode[lBase + j];
      if (op === 255) break; // 255 marks the end of active nodes

      let nodeResult = false;

      if (op === 0) {
        // OP 0: POPULATION > value
        const val = S.logicBytecode[lBase + ++j];
        nodeResult = S.groupPopulationCount[subjectId] > val;
      } else if (op === 1) {
        // OP 1: WEALTH < value
        const val = S.logicBytecode[lBase + ++j];
        nodeResult = S.groupTotalWealth[subjectId] < val;
      } else {
        // Fast-forward unsupported opcodes to prevent desync
        if (op === 2) j += 2;
        if (op === 3) j += 3;
        continue;
      }

      if (!nodeResult) {
        isTrue = false;
        break; // Short-circuit evaluation
      }
    }

    // If all nodes resolve to true, trigger the compound action
    if (isTrue) {
      const actionState = S.ruleRegistry[rBase + 4]; // e.g., 3 = Combat
      const tx = S.ruleRegistry[rBase + 5];
      const ty = S.ruleRegistry[rBase + 6];

      U.broadcastGroupCommand(subjectId, actionState, tx, ty);
    }
  }
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

    // --- NATIONAL POWER CALCULATION ---
    // Stronger nations push their borders further
    const pop = S.groupPopulationCount[gid];
    const wealth = S.groupTotalWealth[gid];
    const powerMultiplier = 1.0 + pop / 100.0 + wealth / 20000.0;

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

        // Calculate influence strength with linear falloff and power multiplier
        const falloff = 1.0 - dist / radiusTiles;
        const influenceStrength = Math.floor(falloff * 1000 * powerMultiplier);

        // --- STRENGTH-BASED CLAIMING (PUSHING) ---
        // If our projection here is stronger than the current owner's, we take it.
        if (influenceStrength > S.influenceMap[idx]) {
          S.influenceMap[idx] = influenceStrength;
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
 * Evaluates building construction and character reproduction based on group resources.
 */
export function StructureEvolutionSystem() {
  // Iterate through all possible groups (up to C.MAX_GROUPS)
  for (let g = 0; g < 100; g++) {
    if (S.groupPopulationCount[g] === 0 && S.groupBuildingCount[g] === 0)
      continue;

    // 1. Build a House if wood is > 500
    if (S.groupWood[g] >= 500) {
      // Find group's warehouse to spawn house near it
      const whX = S.groupWarehouseX[g];
      const whY = S.groupWarehouseY[g];

      if (whX !== 0 || whY !== 0) {
        // Valid warehouse coords
        // Deduct wood across all warehouses for this group
        let deducted = 0;
        for (let b = 0; b < C.MAX_BUILDINGS; b++) {
          if (S.bldType[b] === 1 && S.bldOwnerGroup[b] === g) {
            if (Atomics.load(S.bldDataA, b) >= 500) {
              Atomics.sub(S.bldDataA, b, 500);
              deducted = 500;
              break;
            }
          }
        }
        if (deducted >= 500) {
          // Spawn new house (bldType = 2) nearby
          for (let i = 0; i < C.MAX_BUILDINGS; i++) {
            if (S.bldType[i] === 0) {
              S.bldType[i] = 2; // House
              S.bldPositionX[i] = whX + (Math.random() * 40 - 20);
              S.bldPositionY[i] = whY + (Math.random() * 40 - 20);
              S.bldHealth[i] = 1000;
              S.bldOwnerGroup[i] = g;
              break;
            }
          }
        }
      }
    }

    // 2. Spawn new character if population is below capacity (simplified for Milestone 3)
    // If they have excess food or just enough infrastructure, reproduce
    const foodCost = 500;
    const woodCost = 200;

    if (
      S.groupFood[g] >= foodCost &&
      S.groupWood[g] >= woodCost &&
      S.groupPopulationCount[g] < Math.max(20, S.groupHouseCapacity[g])
    ) {
      const whX = S.groupWarehouseX[g];
      const whY = S.groupWarehouseY[g];

      if (whX !== 0 || whY !== 0) {
        for (let i = 0; i < C.MAX_ENTITIES; i++) {
          if (S.state[i] === C.EntityState.Dead) {
            U.spawnCharacter(i, whX + 10, whY + 10, g);

            // Deduct resources from warehouses
            let foodDeducted = 0;
            let woodDeducted = 0;

            for (let b = 0; b < C.MAX_BUILDINGS; b++) {
              if (S.bldOwnerGroup[b] === g && S.bldType[b] === 1) {
                if (foodDeducted < foodCost) {
                  const toTake = Math.min(
                    foodCost - foodDeducted,
                    Atomics.load(S.bldDataC, b),
                  );
                  Atomics.sub(S.bldDataC, b, toTake);
                  foodDeducted += toTake;
                }
                if (woodDeducted < woodCost) {
                  const toTake = Math.min(
                    woodCost - woodDeducted,
                    Atomics.load(S.bldDataA, b),
                  );
                  Atomics.sub(S.bldDataA, b, toTake);
                  woodDeducted += toTake;
                }
                if (foodDeducted >= foodCost && woodDeducted >= woodCost) break;
              }
            }
            break;
          }
        }
      }
    }
  }
}
