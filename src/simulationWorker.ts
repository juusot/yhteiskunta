// src/simulationWorker.ts
console.log("Simulation Worker starting...");
import * as C from './simulation/constants';
import * as S from './simulation/state';
import * as U from './simulation/utils';
import * as P from './simulation/systems/parallel';
import * as M from './simulation/systems/master';
import { initializeWorld } from './simulation/initialization';

function tick(): void {
  if (S.isPaused) return;

  // Sync point 0: Start of tick alignment
  U.waitForAll(0);

  // Phase 1: Spatial & Intelligence peeking
  P.SpatialUpdateSystem();
  P.IntelReportingSystem();

  // Phase 1.5: Throttled Global Systems (Only quadrant 0)
  if (S.quadrantIndex === 0) {
    M.SummarySystem();
    if (S.tickCount % 60 === 0) {
      M.RuleEvaluationSystem();
      M.TradeSystem();
      M.InfluenceSystem();
    }
    M.GroupKnowledgeDecaySystem();
    M.BuffSystem();  // Run once per day (3600 ticks)
  }

  // Phase 2: Autonomy & Steering
  P.LifeSystem();
  P.AutonomySystem();
  P.SteeringSystem();

  // Barrier 1: Sync before movement
  U.waitForAll(1);

  // Phase 3: Physical Movement
  P.MovementSystem();

  // Barrier 2: Sync before finishing
  U.waitForAll(2);

  S.incrementTick();
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  const type = data.type;

  if (type === "INIT") {
    S.setQuadrantIndex(data.payload.quadrantIndex);
    if (S.quadrantIndex === 0) {
      S.initializeState();
      initializeWorld();
      
      // Post initialized with buffers
      self.postMessage({
        type: "INITIALIZED",
        buffers: {
          positionX: S.positionX.buffer,
          positionY: S.positionY.buffer,
          velocityX: S.velocityX.buffer,
          velocityY: S.velocityY.buffer,
          health: S.health.buffer,
          money: S.money.buffer,
          state: S.state.buffer,
          actionTimer: S.actionTimer.buffer,
          traitBitmask: S.traitBitmask.buffer,
          targetEntityId: S.targetEntityId.buffer,
          targetBuildingId: S.targetBuildingId.buffer,
          targetVehicleId: S.targetVehicleId.buffer,
          isMounted: S.isMounted.buffer,
          pendingEvents: S.pendingEvents.buffer,
          carriedIntelEntityId: S.carriedIntelEntityId.buffer,
          carriedIntelX: S.carriedIntelX.buffer,
          carriedIntelY: S.carriedIntelY.buffer,
          mana: S.mana.buffer,
          entityInventory: S.entityInventory.buffer,
          charWeapon: S.charWeapon.buffer,
          charArmor: S.charArmor.buffer,
          charTool: S.charTool.buffer,
          groupAffiliations: S.groupAffiliations.buffer,
          activeCommandPriority: S.activeCommandPriority.buffer,
          activePrioritySlot: S.activePrioritySlot.buffer,
          groupTargetEntityId: S.groupTargetEntityId.buffer,
          groupTargetX: S.groupTargetX.buffer,
          groupTargetY: S.groupTargetY.buffer,
          groupTargetAge: S.groupTargetAge.buffer,
          groupWarehouseX: S.groupWarehouseX.buffer,
          groupWarehouseY: S.groupWarehouseY.buffer,
          groupMagicFrequency: S.groupMagicFrequency.buffer,
          groupRelationsMatrix: S.groupRelationsMatrix.buffer,
          groupVisualArchetypes: S.groupVisualArchetypes.buffer,
          ruleRegistry: S.ruleRegistry.buffer,
          logicBytecode: S.logicBytecode.buffer,
          workerSync: S.workerSync.buffer,
          groupPopulationCount: S.groupPopulationCount.buffer,
          groupBuildingCount: S.groupBuildingCount.buffer,
          groupTotalWealth: S.groupTotalWealth.buffer,
          groupWood: S.groupWood.buffer,
          groupGold: S.groupGold.buffer,
          groupFood: S.groupFood.buffer,
          groupMisc: S.groupMisc.buffer,
          worldMap: S.worldMap.buffer,
          globalFlowField: S.globalFlowField.buffer,
          influenceMap: S.influenceMap.buffer,
          territoryOwnerMap: S.territoryOwnerMap.buffer,
          bldPositionX: S.bldPositionX.buffer,
          bldPositionY: S.bldPositionY.buffer,
          bldType: S.bldType.buffer,
          bldHealth: S.bldHealth.buffer,
          bldOwnerGroup: S.bldOwnerGroup.buffer,
          bldInventory: S.bldInventory.buffer,
          vehPositionX: S.vehPositionX.buffer,
          vehPositionY: S.vehPositionY.buffer,
          vehVelocityX: S.vehVelocityX.buffer,
          vehVelocityY: S.vehVelocityY.buffer,
          vehType: S.vehType.buffer,
          vehHealth: S.vehHealth.buffer,
          vehPilotId: S.vehPilotId.buffer,
          vehOwnerGroup: S.vehOwnerGroup.buffer
        }
      });
    } else {
      S.mapStateBuffers(data.payload.buffers);
    }
  }
  
  if (type === "TICK") {
    try {
      tick();
      self.postMessage({ type: "TICK_COMPLETE" });
    } catch (e) {
      console.error("Worker Tick Error:", e);
      self.postMessage({ type: "TICK_ERROR", payload: e instanceof Error ? e.message : String(e) });
    }
  }
  
  if (type === "PAUSE_SIM") S.setPaused(true);
  if (type === "RESUME_SIM") S.setPaused(false);
  
  if (type === "GROUP_COMMAND") {
    const payload = data.payload || data;
    U.broadcastGroupCommand(payload.groupId, payload.commandState, payload.targetX, payload.targetY);
  }
  
  if (type === "CREATE_GROUP") {
    const { name } = data.payload;
    U.createGroup(name);
  }
  
  if (type === "ASSIGN_TO_GROUP") {
    const { entityId, groupId, slot } = data.payload;
    U.assignCharacterToGroup(entityId, groupId, slot);
  }
  
  if (type === "SEND_EVENT") {
    const { groupId, eventType } = data.payload;
    U.sendEventToGroup(groupId, eventType);
  }
  
  if (type === "KILL_ENTITY") {
    const { entityId } = data.payload;
    S.state[entityId] = C.EntityState.Dead;
    S.health[entityId] = 0;
  }
  
  if (type === "SYNC_TICK") S.setTick(data.tickCount);
  
  if (type === "FIND_ENTITY") {
    const { x, y, radius } = data.payload;
    const id = U.findNearest(x, y, radius, 0xFFFFFFFF);
    self.postMessage({ type: "ENTITY_FOUND", payload: { id } });
  }
  
  if (type === "PAINT_ENTITIES") {
    const { x, y, radius, groupId, traitBitmask: newTrait } = data.payload;
    const radiusSq = radius * radius;
    const minCellX = Math.max(0, Math.floor((x - radius) / C.GRID_SIZE));
    const maxCellX = Math.min(C.GRID_COLS - 1, Math.floor((x + radius) / C.GRID_SIZE));
    const minCellY = Math.max(0, Math.floor((y - radius) / C.GRID_SIZE));
    const maxCellY = Math.min(C.GRID_ROWS - 1, Math.floor((y + radius) / C.GRID_SIZE));
    
    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const cellIndex = cy * C.GRID_COLS + cx;
        let entityId = S.spatialHead[cellIndex];
        while (entityId !== -1) {
          if (S.positionX[entityId] < S.minX || S.positionX[entityId] >= S.maxX || S.positionY[entityId] < S.minY || S.positionY[entityId] >= S.maxY) {
            entityId = S.spatialNext[entityId];
            continue;
          }
          const dx = S.positionX[entityId] - x;
          const dy = S.positionY[entityId] - y;
          if (dx * dx + dy * dy <= radiusSq) {
            if (groupId !== -1) S.groupAffiliations[entityId * 8] = groupId;
            if (newTrait !== 0) {
              S.traitBitmask[entityId] |= newTrait;
              if ((newTrait & C.TRAIT_TREE) !== 0) {
                S.velocityX[entityId] = 0; S.velocityY[entityId] = 0;
              }
            }
          }
          entityId = S.spatialNext[entityId];
        }
      }
    }
  }
};
