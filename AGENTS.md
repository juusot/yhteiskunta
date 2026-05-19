# **Yhteiskunta - Agent Instructions**

This document provides foundational mandates and architectural guidance for coding agents working on the **Yhteiskunta** codebase.

## **Core Architectural Mandates**

### **1. Performance-First ECS Pattern**

The simulation is a highly optimized Entity Component System (ECS) designed for 100,000 entities.

- **NEVER** use class instances for simulation entities.
- **ALWAYS** use flat `SharedArrayBuffer` typed arrays.
- **ALWAYS** iterate over contiguous index ranges in systems.
- **STRICTLY** separate data (arrays in `state.ts`) from logic (systems in `src/simulation/systems/`).

### **2. Multi-Threaded Memory Model**

- All simulation state is in `SharedArrayBuffer`.
- **Worker Partitioning**: Workers handle fixed index ranges (e.g., 0-24,999). Do not implement spatial-based worker partitioning.
- **Barriers**: Respect the 5-barrier synchronization flow in `simulationWorker.ts`. If adding a new global orchestration step, ensure it is assigned to a specific worker (usually Worker 0) and protected by appropriate barriers.

### **3. Thread Safety**

- Use `Atomics` for cross-worker operations on shared structures (e.g., `spatialHead`, `vehPilotId`).
- Operations on entity-local data within a worker's assigned range are safe, but shared group/building stats require atomic operations.

---

## **Coding Standards & Patterns**

### **Data Representation**

- **Effective Stats**: Always use cached "effective" stats (e.g., `effectiveDamage`) for per-tick calculations. Raw "base" stats should only be used during recalculation (triggered by equipment or buff changes).
- **Polymorphic Buildings**: Building registers (`bldDataA`, `bldDataB`, `bldDataC`) change meaning based on `bldType`. Refer to the wiki or `src/simulation/constants.ts` for register mappings.
- **Group Channels**: Entities have a 10-slot channel structure (0-7 Public, 8-9 Secret). Command priority is determined by the lowest slot index.

### **World Coordinates**

- World Size: $3200 \times 2400$ units.
- Terrain Grid: $320 \times 240$ tiles ($10 \times 10$ units per tile).
- **Spatial Hash**: Use the linked-list spatial hash in `spatialHash.ts` for all proximity queries ($O(1)$ lookup).

---

## **Subsystem Guidelines**

### **1. Rules & VM**

- The group intelligence uses a stack-based VM.
- New behaviors should be implemented via new OpCodes in `constants.ts` and corresponding handlers in `master.ts`.

### **2. Movement & Steering**

- Steering logic resides in `steering.ts` (calculates desired velocity).
- Integration and boundary enforcement reside in `movement.ts`.
- Pathfinding uses flow fields derived from the `worldMap`.

### **3. Item System**

- Distinguish between **Item Definitions** (static templates) and **Item Instances** (physical entities).
- Looting transitions happen in the `Idle` state based on spatial hash proximity.

### **4. Rendering**

- Rendering is handled via WebGL2 instanced draw calls in `main.tsx`.
- **Culling**: Perform culling in Vertex Shaders by moving vertices off-screen (`vec4(-10.0, -10.0, 0.0, 1.0)`) for inactive or off-screen entities.

---

## **File Navigation Reference**

- `src/simulation/constants.ts`: Enums, OpCodes, limits.
- `src/simulation/state.ts`: SAB declarations and mapping.
- `src/simulation/systems/`: ECS system implementations.
- `src/simulation/utils.ts`: Synchronization and spatial queries.
- `src/uiWorker.ts`: Background data extraction for React UI.

## **Agent Workflow**

1. **Analyze `state.ts`** before adding new entity components to ensure SAB alignment.
2. **Check `constants.ts`** for existing enums/traits before creating new ones.
3. **Verify thread safety** when modifying structures shared across worker indices.
4. **Recalculate effective stats** immediately after modifying base stats or equipment.
