// src/simulation/systems/master.ts
import * as C from '../constants';
import * as S from '../state';
import * as U from '../utils';

export function SummarySystem(): void {
  if (S.tickCount % 60 !== 0) return;

  S.groupPopulationCount.fill(0);
  S.groupBuildingCount.fill(0);
  S.groupTotalWealth.fill(0);
  S.groupWood.fill(0);
  S.groupGold.fill(0);
  S.groupFood.fill(0);
  S.groupMisc.fill(0);
  let totalActive = 0;

  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] !== C.EntityState.Dead) {
      const gid = S.groupAffiliations[i * 8];
      if (gid >= 0 && gid < C.MAX_GROUPS) {
        S.groupPopulationCount[gid]++;
        S.groupTotalWealth[gid] += S.money[i];
        S.groupGold[gid] += S.money[i]; // Money is counted as Gold
        totalActive++;
      }
    }
  }

  // Add building inventories to wealth and update building counts
  for (let b = 0; b < C.MAX_BUILDINGS; b++) {
    if (S.bldHealth[b] > 0 && S.bldType[b] !== 0) {
      const gid = S.bldOwnerGroup[b];
      if (gid >= 0 && gid < C.MAX_GROUPS) {
        S.groupBuildingCount[gid]++;
        const inv = S.bldInventory.slice(b * 4, b * 4 + 4);
        S.groupTotalWealth[gid] += inv[0] + inv[1] + inv[2] + inv[3];
        S.groupWood[gid] += inv[0];
        S.groupGold[gid] += inv[1];
        S.groupFood[gid] += inv[2];
        S.groupMisc[gid] += inv[3];
      }
    }
  }

  const starvingGroups = new Uint8Array(C.MAX_GROUPS);
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    const pop = S.groupPopulationCount[g];
    if (pop === 0) continue;
    // Maintenance cost
    const foodRequired = Math.max(1, Math.floor(pop * 0.2));
    S.groupTotalWealth[g] -= foodRequired;
    if (S.groupTotalWealth[g] <= 0) {
      S.groupTotalWealth[g] = 0;
      starvingGroups[g] = 1;
    }
  }

  // Reproduction & Safety Net
  let deadPtr = 0;
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    const pop = S.groupPopulationCount[g];
    const wealth = S.groupTotalWealth[g];
    const bldCount = S.groupBuildingCount[g];
    
    // Safety net for the 4 primary nations
    const needsSafetySpawn = g < 4 && pop < 20;
    
    // House capacity: Warehouse provides 20, Houses provide 5 each
    const houseCapacity = Math.max(20, (bldCount - 1) * 5);
    
    // Only allow reproduction if the group has capacity and wealth
    const canAffordReproduction = pop > 0 && pop < houseCapacity && wealth > 1000;
    
    if (needsSafetySpawn || canAffordReproduction) {
      let births = 0;
      const maxBirths = needsSafetySpawn ? 5 : 2;
      const costPerBirth = 500;

      while (births < maxBirths && (needsSafetySpawn || (S.groupTotalWealth[g] > costPerBirth))) {
        while (deadPtr < C.MAX_ENTITIES && S.state[deadPtr] !== C.EntityState.Dead) deadPtr++;
        if (deadPtr >= C.MAX_ENTITIES) break;
        
        const i = deadPtr;
        S.state[i] = C.EntityState.Idle;
        S.health[i] = 100;
        S.positionX[i] = S.groupWarehouseX[g] + (Math.random() - 0.5) * 50;
        S.positionY[i] = S.groupWarehouseY[g] + (Math.random() - 0.5) * 50;
        S.velocityX[i] = (Math.random() - 0.5);
        S.velocityY[i] = (Math.random() - 0.5);
        S.groupAffiliations[i * 8] = g;
        S.targetEntityId[i] = -1;
        S.entityInventory[i] = 0;
        S.actionTimer[i] = 60;
        
        if (!needsSafetySpawn) S.groupTotalWealth[g] -= costPerBirth;
        births++;
        deadPtr++;
      }
    }
  }

  // Starvation damage pass
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;
    const gid = S.groupAffiliations[i * 8];
    if (gid >= 0 && gid < C.MAX_GROUPS && starvingGroups[gid] === 1) {
      S.health[i] -= 10; // Fast death if group is broke
    }
  }

  // Mana Regeneration
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if ((S.traitBitmask[i] & C.TRAIT_MAGIC) !== 0) {
      S.mana[i] = Math.min(100, S.mana[i] + 5);
    }
  }

  // Resource Regeneration
  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) {
      const traits = S.traitBitmask[i];
      if ((traits & (C.TRAIT_TREE | C.TRAIT_GOLD | C.TRAIT_BUSH)) !== 0) {
        // Regeneration chance
        if (Math.random() > 0.95) {
          let x = Math.random() * C.WORLD_WIDTH;
          let y = Math.random() * C.WORLD_HEIGHT;
          const tx = Math.floor(x / C.TILE_SIZE);
          const ty = Math.floor(y / C.TILE_SIZE);
          const tileIdx = Math.min(C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS - 1, Math.max(0, ty * C.WORLD_MAP_COLS + tx));
          const terrain = S.worldMap[tileIdx];

          let valid = false;
          if ((traits & C.TRAIT_GOLD) !== 0 && terrain === C.TerrainType.Water) valid = true;
          else if ((traits & C.TRAIT_TREE) !== 0 && terrain === C.TerrainType.Forest) valid = true;
          else if ((traits & C.TRAIT_BUSH) !== 0 && terrain === C.TerrainType.Grass) valid = true;

          if (valid) {
            S.positionX[i] = x; S.positionY[i] = y;
            S.velocityX[i] = 0; S.velocityY[i] = 0;
            S.targetEntityId[i] = -1;
            S.targetBuildingId[i] = -1;
            S.health[i] = 100;
            S.state[i] = C.EntityState.Idle;
          }
        }
      }
    }
  }

  self.postMessage({ type: "STATS_UPDATE", payload: { totalActive } });
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
        logicStack[sp++] = S.groupPopulationCount[gid] > S.logicBytecode[baseOffset + ++i] ? 1 : 0;
        break;
      case C.OP_WEALTH_LT:
        logicStack[sp++] = S.groupTotalWealth[gid] < S.logicBytecode[baseOffset + ++i] ? 1 : 0;
        break;
      case C.OP_RELATION_LT: {
        const otherGid = S.logicBytecode[baseOffset + ++i];
        const threshold = S.logicBytecode[baseOffset + ++i];
        logicStack[sp++] = S.groupRelationsMatrix[gid * C.MAX_GROUPS + otherGid] < threshold ? 1 : 0;
        break;
      }
      case C.OP_DIST_GT: {
        const targetX = S.logicBytecode[baseOffset + ++i];
        const targetY = S.logicBytecode[baseOffset + ++i];
        const threshold = S.logicBytecode[baseOffset + ++i];
        const dx = S.groupWarehouseX[gid] - targetX, dy = S.groupWarehouseY[gid] - targetY;
        logicStack[sp++] = (dx * dx + dy * dy > threshold * threshold) ? 1 : 0;
        break;
      }
      case C.GATE_AND: {
        const b = logicStack[--sp], a = logicStack[--sp];
        logicStack[sp++] = (a && b) ? 1 : 0;
        break;
      }
      case C.GATE_OR: {
        const b = logicStack[--sp], a = logicStack[--sp];
        logicStack[sp++] = (a || b) ? 1 : 0;
        break;
      }
      case C.GATE_NOT: {
        logicStack[sp-1] = logicStack[sp-1] ? 0 : 1;
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
        U.broadcastGroupCommand(gA, C.EntityState.Combat, S.groupWarehouseX[gB], S.groupWarehouseY[gB]);
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
      if (conditionType === 0) { if (S.groupPopulationCount[subjectId] > threshold) conditionMet = true; }
      else if (conditionType === 1) { if (S.groupTotalWealth[subjectId] > threshold) conditionMet = true; }
      else if (conditionType === 3) { if (S.groupTotalWealth[subjectId] < threshold) conditionMet = true; }
    }

    if (conditionMet) {
      if (actionState === 99) self.postMessage({ type: "SAVE_REQUEST" });
      else {
        U.broadcastGroupCommand(subjectId, actionState, targetX, targetY);
        if (firstActiveLocationTargetX === -1) { firstActiveLocationTargetX = targetX; firstActiveLocationTargetY = targetY; }
      }
    }
  }
  if (firstActiveLocationTargetX !== -1) updateFlowField(firstActiveLocationTargetX, firstActiveLocationTargetY);
}

export function GroupKnowledgeDecaySystem(): void {
  for (let g = 0; g < C.MAX_GROUPS; g++) {
    if (S.groupTargetEntityId[g] !== -1) {
      S.groupTargetAge[g]++;
      if (S.groupTargetAge[g] > 500) { S.groupTargetEntityId[g] = -1; S.groupTargetAge[g] = 0; }
    }
  }
}

export function updateFlowField(targetX: number, targetY: number): void {
  const targetTileX = Math.floor(targetX / C.TILE_SIZE);
  const targetTileY = Math.floor(targetY / C.TILE_SIZE);
  if (targetTileX < 0 || targetTileX >= C.WORLD_MAP_COLS || targetTileY < 0 || targetTileY >= C.WORLD_MAP_ROWS) return;

  S.integrationField.fill(65535);
  const targetIdx = targetTileY * C.WORLD_MAP_COLS + targetTileX;
  S.integrationField[targetIdx] = 0;
  const queue: number[] = [targetIdx];
  let head = 0;

  while (head < queue.length) {
    const currIdx = queue[head++];
    const currX = currIdx % C.WORLD_MAP_COLS;
    const currY = Math.floor(currIdx / C.WORLD_MAP_COLS);
    const currCost = S.integrationField[currIdx];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = currX + dx; const ny = currY + dy;
        if (nx >= 0 && nx < C.WORLD_MAP_COLS && ny >= 0 && ny < C.WORLD_MAP_ROWS) {
          const nIdx = ny * C.WORLD_MAP_COLS + nx;
          const terrain = S.worldMap[nIdx];
          let stepCost = (dx !== 0 && dy !== 0) ? 1.4 : 1.0;
          if (terrain === 1) stepCost *= 3;
          if (terrain === 2) stepCost = 255;
          const totalCost = currCost + stepCost;
          if (totalCost < S.integrationField[nIdx]) { S.integrationField[nIdx] = totalCost; queue.push(nIdx); }
        }
      }
    }
  }

  for (let y = 0; y < C.WORLD_MAP_ROWS; y++) {
    for (let x = 0; x < C.WORLD_MAP_COLS; x++) {
      const idx = y * C.WORLD_MAP_COLS + x;
      const fIdx = idx * 2;
      let bestX = 0; let bestY = 0; let minCost = S.integrationField[idx];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && nx < C.WORLD_MAP_COLS && ny >= 0 && ny < C.WORLD_MAP_ROWS) {
            const nCost = S.integrationField[ny * C.WORLD_MAP_COLS + nx];
            if (nCost < minCost) { minCost = nCost; bestX = dx; bestY = dy; }
          }
        }
      }
      const len = Math.sqrt(bestX * bestX + bestY * bestY);
      if (len > 0) { S.globalFlowField[fIdx] = bestX / len; S.globalFlowField[fIdx + 1] = bestY / len; }
      else { S.globalFlowField[fIdx] = 0; S.globalFlowField[fIdx + 1] = 0; }
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
              if (S.state[i] === C.EntityState.Idle && S.groupAffiliations[i * 8] === gA) {
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

export function InfluenceSystem(): void {
  for (let i = 0; i < C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS; i++) {
    S.influenceMap[i] = Math.floor(S.influenceMap[i] * 0.9);
  }

  for (let i = 0; i < C.MAX_ENTITIES; i++) {
    if (S.state[i] === C.EntityState.Dead) continue;
    const tileX = Math.floor(S.positionX[i] / C.TILE_SIZE);
    const tileY = Math.floor(S.positionY[i] / C.TILE_SIZE);
    if (tileX >= 0 && tileX < C.WORLD_MAP_COLS && tileY >= 0 && tileY < C.WORLD_MAP_ROWS) {
      const idx = tileY * C.WORLD_MAP_COLS + tileX;
      const gid = S.groupAffiliations[i * 8];
      if (gid === -1) continue;

      if (S.territoryOwnerMap[idx] === -1) {
        S.territoryOwnerMap[idx] = gid;
        S.influenceMap[idx] = 1;
        S.settlementTimerMap[idx] = 0;
      } else if (S.territoryOwnerMap[idx] === gid) {
        S.influenceMap[idx] = Math.min(1000, S.influenceMap[idx] + 1);
      } else {
        S.influenceMap[idx]--;
        if (S.influenceMap[idx] <= 0) {
          S.territoryOwnerMap[idx] = gid;
          S.influenceMap[idx] = 1;
          S.settlementTimerMap[idx] = 0;
        }
      }
    }
  }

  for (let i = 0; i < C.WORLD_MAP_COLS * C.WORLD_MAP_ROWS; i++) {
    const gid = S.territoryOwnerMap[i];
    if (gid === -1) { S.settlementTimerMap[i] = 0; continue; }
    
    if (S.influenceMap[i] < 10) { 
      S.territoryOwnerMap[i] = -1; 
      S.settlementTimerMap[i] = 0; 
      continue; 
    }

    if (S.influenceMap[i] > 100) {
      S.settlementTimerMap[i]++;
      if (S.settlementTimerMap[i] >= 5) {
        const tx = (i % C.WORLD_MAP_COLS) * C.TILE_SIZE + C.TILE_SIZE / 2;
        const ty = Math.floor(i / C.WORLD_MAP_COLS) * C.TILE_SIZE + C.TILE_SIZE / 2;
        const dx = tx - S.groupWarehouseX[gid], dy = ty - S.groupWarehouseY[gid];
        if (dx * dx + dy * dy > 300 * 300) {
           if (S.worldMap[i] === 0) S.worldMap[i] = 2;
           S.settlementTimerMap[i] = 0;
        }
      }
    } else {
      S.settlementTimerMap[i] = 0;
    }
  }
}
