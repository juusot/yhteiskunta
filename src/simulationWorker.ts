// src/simulationWorker.ts
console.log("Simulation Worker starting...");
import * as C from "./simulation/constants";
import * as S from "./simulation/state";
import * as U from "./simulation/utils";
import * as P from "./simulation/systems/parallel";
import * as M from "./simulation/systems/master";
import { rebuildSpatialHash } from "./simulation/systems/spatialHash";
import { runSteeringSystem } from "./simulation/systems/steering";
import { runMovementSystem } from "./simulation/systems/movement";
import { runCombatSystem } from "./simulation/systems/combat";
import { runGatheringSystem } from "./simulation/systems/gathering";
import { runLifecycleSystem } from "./simulation/systems/lifecycle";
import { initializeWorld } from "./simulation/initialization";
import { applyGroupTemplate } from "./simulation/templates";

function tick(): void {
  if (S.isPaused) return;

  const entitiesPerWorker = Math.ceil(C.MAX_ENTITIES / 4);
  const startIndex = S.quadrantIndex * entitiesPerWorker;
  const endIndex = Math.min(C.MAX_ENTITIES, startIndex + entitiesPerWorker);
  const stateBuffer = S.positionX.buffer as SharedArrayBuffer;

  // Sync point 0: Start of tick
  U.waitForAll(0);

  // Throttled stat clearing (every 60 ticks)
  if (S.quadrantIndex === 0 && S.tickCount % 60 === 0) {
    S.groupPopulationCount.fill(0);
    S.groupBuildingCount.fill(0);
    S.groupTotalWealth.fill(0);
    S.groupWood.fill(0);
    S.groupGold.fill(0);
    S.groupFood.fill(0);
    S.groupMisc.fill(0);
    S.groupHouseCapacity.fill(0);
    S.groupWarehouseX.fill(0);
    S.groupWarehouseY.fill(0);
  }

  // Barrier 1: Ensure stats are cleared before parallel systems start adding to them
  U.waitForAll(1);

  // --- PARALLEL ECS SYSTEMS ---
  rebuildSpatialHash(stateBuffer, startIndex, endIndex);
  runSteeringSystem(stateBuffer, startIndex, endIndex);
  runMovementSystem(stateBuffer, startIndex, endIndex);
  runCombatSystem(stateBuffer, startIndex, endIndex);
  runGatheringSystem(stateBuffer, startIndex, endIndex);
  runLifecycleSystem(stateBuffer, startIndex, endIndex);

  // Barrier 2: Ensure all workers finished their parallel tasks
  U.waitForAll(2);

  // Phase 3: Master Orchestration (Only worker 0)
  if (S.quadrantIndex === 0) {
    M.SummarySystem(); // Uses the aggregated stats from parallel systems

    if (S.tickCount % 60 === 0) {
      M.RuleEvaluationSystem();
      M.TradeSystem();
      M.InfluenceSystem();
    }
    if (S.tickCount % 120 === 0) {
      M.StructureEvolutionSystem();
    }
    M.GroupKnowledgeDecaySystem();
    M.BuffSystem();
  }

  // Barrier 3: Ensure worker 0 finished master logic before anyone increments tick
  U.waitForAll(3);

  if (S.quadrantIndex === 0) S.incrementTick();

  // Final barrier to keep workers in lock-step
  U.waitForAll(4);
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
          groupCohesion: S.groupCohesion.buffer,
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
          groupCreatedAt: S.groupCreatedAt.buffer,
          lifespan: S.lifespan.buffer,
          damage: S.damage.buffer,
          speed: S.speed.buffer,
          effectiveLifespan: S.effectiveLifespan.buffer,
          effectiveDamage: S.effectiveDamage.buffer,
          effectiveSpeed: S.effectiveSpeed.buffer,
          worldMap: S.worldMap.buffer,
          globalFlowField: S.globalFlowField.buffer,
          influenceMap: S.influenceMap.buffer,
          territoryOwnerMap: S.territoryOwnerMap.buffer,
          spatialHead: S.spatialHead.buffer,
          spatialNext: S.spatialNext.buffer,
          bldSpatialHead: S.bldSpatialHead.buffer,
          bldSpatialNext: S.bldSpatialNext.buffer,
          vehSpatialHead: S.vehSpatialHead.buffer,
          vehSpatialNext: S.vehSpatialNext.buffer,
          groupHouseCapacity: S.groupHouseCapacity.buffer,
          starvingGroups: S.starvingGroups.buffer,
          flowQueue: S.flowQueue.buffer,
          bldPositionX: S.bldPositionX.buffer,
          bldPositionY: S.bldPositionY.buffer,
          bldType: S.bldType.buffer,
          bldHealth: S.bldHealth.buffer,
          bldOwnerGroup: S.bldOwnerGroup.buffer,
          bldTier: S.bldTier.buffer,
          bldDataA: S.bldDataA.buffer,
          bldDataB: S.bldDataB.buffer,
          bldDataC: S.bldDataC.buffer,
          vehPositionX: S.vehPositionX.buffer,
          vehPositionY: S.vehPositionY.buffer,
          vehVelocityX: S.vehVelocityX.buffer,
          vehVelocityY: S.vehVelocityY.buffer,
          vehType: S.vehType.buffer,
          vehHealth: S.vehHealth.buffer,
          vehPilotId: S.vehPilotId.buffer,
          vehOwnerGroup: S.vehOwnerGroup.buffer,
          itemDefBaseType: S.itemDefBaseType.buffer,
          itemDefStatA: S.itemDefStatA.buffer,
          itemDefStatB: S.itemDefStatB.buffer,
          itemDefTraitMask: S.itemDefTraitMask.buffer,
          itemInstanceDefId: S.itemInstanceDefId.buffer,
          itemInstanceOwnerType: S.itemInstanceOwnerType.buffer,
          itemInstanceOwnerId: S.itemInstanceOwnerId.buffer,
          itemInstanceX: S.itemInstanceX.buffer,
          itemInstanceY: S.itemInstanceY.buffer,
          itemSpatialHead: S.itemSpatialHead.buffer,
          itemSpatialNext: S.itemSpatialNext.buffer,
          targetItemId: S.targetItemId.buffer,
          playerTargetX: S.playerTargetX.buffer,
          playerTargetY: S.playerTargetY.buffer,
          scenarioState: S.scenarioState.buffer,
          projPositionX: S.projPositionX.buffer,
          projPositionY: S.projPositionY.buffer,
          projVelocityX: S.projVelocityX.buffer,
          projVelocityY: S.projVelocityY.buffer,
          projType: S.projType.buffer,
          projOwnerGroup: S.projOwnerGroup.buffer,
          projLifeTime: S.projLifeTime.buffer,
        },
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
      self.postMessage({
        type: "TICK_ERROR",
        payload: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (type === "PAUSE_SIM") S.setPaused(true);
  if (type === "RESUME_SIM") S.setPaused(false);

  if (type === "GROUP_COMMAND") {
    const payload = data.payload || data;
    U.broadcastGroupCommand(
      payload.groupId,
      payload.commandState,
      payload.targetX,
      payload.targetY,
    );
  }

  if (type === "PLAYER_COMMAND_MOVE") {
    const { entityId, tx, ty } = data.payload;
    // PERMISSION GUARD: If scenarioState[0] !== -1, verify group match
    if (S.scenarioState[0] !== -1) {
      const gid = S.groupAffiliations[entityId * C.MAX_GROUP_CHANNELS + 0];
      if (gid !== S.scenarioState[0]) return;
    }

    S.playerTargetX[entityId] = tx;
    S.playerTargetY[entityId] = ty;
    S.targetEntityId[entityId] = -3; // Token code indicating player override state
    S.state[entityId] = C.EntityState.Idle; // Interrupt current automated state machine
  }

  if (type === "CREATE_GROUP") {
    const { name, archetype } = data.payload;
    const groupId = U.createGroup(name);
    if (groupId !== -1 && archetype !== undefined && archetype > 0) {
      applyGroupTemplate(groupId, archetype);
    }
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
    const id = U.findNearest(x, y, radius, 0xffffffff);
    self.postMessage({ type: "ENTITY_FOUND", payload: { id } });
  }

  if (type === "PAINT_ENTITIES") {
    const { x, y, radius, groupId, traitBitmask: newTrait } = data.payload;
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

    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const cellIndex = cy * C.GRID_COLS + cx;
        let entityId = S.spatialHead[cellIndex];
        while (entityId !== -1) {
          const dx = S.positionX[entityId] - x;
          const dy = S.positionY[entityId] - y;
          if (dx * dx + dy * dy <= radiusSq) {
            if (groupId !== -1)
              S.groupAffiliations[entityId * C.MAX_GROUP_CHANNELS] = groupId;
            if (newTrait !== 0) {
              S.traitBitmask[entityId] |= newTrait;
              if ((newTrait & C.TRAIT_TREE) !== 0) {
                S.velocityX[entityId] = 0;
                S.velocityY[entityId] = 0;
              }
            }
          }
          entityId = S.spatialNext[entityId];
        }
      }
    }
  }

  if (type === "SPAWN_REQ") {
    const { spawnType, x, y, groupId } = data.payload;

    // TYPE 1: SPAWN CHARACTER
    if (spawnType === 1) {
      for (let i = 0; i < C.MAX_ENTITIES; i++) {
        if (S.state[i] === C.EntityState.Dead) {
          S.positionX[i] = x;
          S.positionY[i] = y;
          S.health[i] = 100;
          S.state[i] = C.EntityState.Idle; // Awaken the entity

          // Clear previous targets and metadata
          S.targetEntityId[i] = -1;
          S.targetBuildingId[i] = -1;
          S.entityInventory[i] = 0;

          // Assign to the requested group slot 0
          S.groupAffiliations[i * C.MAX_GROUP_CHANNELS] = groupId;
          break; // Stop searching once placed
        }
      }
    }

    // TYPE 2: SPAWN WAREHOUSE BUILDING
    if (spawnType === 2) {
      for (let i = 0; i < C.MAX_BUILDINGS; i++) {
        if (S.bldType[i] === 0) {
          // 0 indicates empty slot
          S.bldType[i] = 1; // 1 = Warehouse
          S.bldPositionX[i] = x;
          S.bldPositionY[i] = y;
          S.bldHealth[i] = 1000;
          S.bldTier[i] = 1;
          S.bldOwnerGroup[i] = groupId;

          // Clear internal storage registers
          S.bldDataA[i] = 0; // Wood
          S.bldDataB[i] = 0; // Gold
          S.bldDataC[i] = 0; // Food
          break;
        }
      }
    }

    // TYPE 3: SPAWN WAGON VEHICLE
    if (spawnType === 3) {
      for (let i = 0; i < C.MAX_VEHICLES; i++) {
        if (S.vehType[i] === 0) {
          S.vehType[i] = 1; // 1 = Wagon
          S.vehPositionX[i] = x;
          S.vehPositionY[i] = y;
          S.vehVelocityX[i] = 0;
          S.vehVelocityY[i] = 0;
          S.vehHealth[i] = 500;
          S.vehPilotId[i] = -1; // Empty vehicle
          S.vehOwnerGroup[i] = groupId;
          break;
        }
      }
    }
  }
};
