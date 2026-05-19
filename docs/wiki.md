# **Yhteiskunta - Game Mechanics Wiki**

**Yhteiskunta** (Finnish for "society") is a highly optimized, real-time simulation game where up to 100,000 autonomous entities build, harvest, wage war, and form complex political networks. The simulation runs on a multi-threaded web worker architecture governed by user-defined compound rule bytecodes and custom script parameters.

## **Table of Contents**

1. [Core Systems Architecture](#core-systems-architecture)
2. [World & Biome Generation](#world--biome-generation)
3. [Resource Flow & Economics](#resource-flow--economics)
4. [Character Stats & Lifespan](#character-stats--lifespan)
5. [Item Definition & Instance Registries](#item-definition--instance-registries)
6. [Societal Hierarchy & Channels](#societal-hierarchy--channels)
7. [Polymorphic Building System](#polymorphic-building-system)
8. [Vehicles & Mount Subsystems](#vehicles--mount-subsystems)
9. [Projectiles & Radial Auras](#projectiles--radial-auras)
10. [Bytecode Rules & Virtual Machine](#bytecode-rules--virtual-machine)
11. [Player Selection & Command Injection](#player-selection--command-injection)
12. [WebGL2 Instanced Rendering Shader Pipeline](#webgl2-instanced-rendering-shader-pipeline)
13. [Architecture File Reference](#architecture-file-reference)

## **Core Systems Architecture**

### **Multi-Threaded Memory Model**

The entire simulation state is mapped to a unified `SharedArrayBuffer` block split into contiguous, index-matched typed arrays. This design allows four concurrent Web Workers to execute simulation logic in parallel across linear slices of the entity arrays, maximizing CPU cache efficiency and minimizing thread synchronization overhead.

- **Index-Based Partitioning**:
  Each worker processes a contiguous range of entity indices (e.g., Worker 0 handles indices 0-24,999). This replaces spatial partitioning to eliminate edge-case migration logic and simplify cross-worker atomic operations on global structures like the spatial hash.

- **Entity Component System (ECS) Execution**:
  Entity behavior is processed by isolated, sequential systems that iterate over flat arrays in the `SharedArrayBuffer`. Each system is responsible for a specific data transformation (e.g., `steering.ts` only modifies velocity vectors), allowing for clean logical separation and high performance.

- **Barriers & Synchronization**:  
  A thread-safe barrier primitive (`Atomics.wait()` / `Atomics.notify()`) forces all workers to sync at key logical boundaries during each simulation frame:
  - **Barrier 0**: Start of tick alignment.
  - **Barrier 1**: Clear global stats (Worker 0 only) before systems run.
  - **Barrier 2**: Ensure all workers finished parallel ECS tasks.
  - **Barrier 3**: Master worker finished global orchestration (Reproduction, VM rules).
  - **Barrier 4**: Final tick increment and release.

## **World & Biome Generation**

The map covers a coordinates envelope of $1600 \times 1200$ units, mapped onto a $160 \times 120$ tile terrain grid ($10 \times 10$ units per tile).

### **Terrain Enums & Shaders**

The map contains four base terrain textures:

- **Grass (0)**: Supports bush growth. Rendered as pale yellow-white.
- **Forest (1)**: High resource density. Limits entity movement speed by a factor of $0.6 \times$. Rendered as dark green.
- **Water (2)**: Deep water. Limits entity movement speed by a factor of $0.3 \times$. Spawns gold resource deposits. Rendered as blue.
- **Mountain (3)**: Impassable terrain. Blocks all pathfinding and construction checks. Rendered as grey.

### **Generated Features**

1. **The River**: A sinuous, continuous body of water cutting horizontally through the center of the world, calculated using a sine-wave function:  
   $$Y = 60 + \sin(X \times 0.1) \times 20$$
2. **Mountain Ranges**: Placed along the topmost 10 tiles and bottommost 10 tiles of the map coordinates.
3. **Forest Patches**: Spawns 40 distinct radial forest patches using randomized coordinates and radius bounds ($4$ to $11$ tiles) across grass-designated zones.

## **Resource Flow & Economics**

### **Resource Types**

| Resource | Index | Harvesting Tool | Natural Source           | Storage Depot        | Use cases                          |
| :------- | :---- | :-------------- | :----------------------- | :------------------- | :--------------------------------- |
| **Wood** | 0     | `charTool = 0`  | Tree (TRAIT_TREE)        | Warehouse `bldDataA` | Building construction & Upgrades   |
| **Gold** | 1     | `charTool = 1`  | Gold Node (TRAIT_GOLD)   | Warehouse `bldDataB` | Standard trade currency & Upgrades |
| **Food** | 2     | `charTool = 2`  | Bush (TRAIT_BUSH), Field | Warehouse `bldDataC` | Population survival & Reproduction |
| **Misc** | 3     | `charTool = 3`  | Loot Piles (TRAIT_LOOT)  | Warehouse `bldDataC` | Special items                      |

### **Logistics Pipeline**

```text
Natural Spawns (Trees/Bushes/Gold)
         │
         ▼
Harvesting State (gathering rates: Wood=50, Gold=100, Food=10, Field=20)
         │
         ▼
ReturningToDepot State (Movement guided by pathfinding flow fields)
         │
         ▼
Deposit Interaction (Atomic additions into warehouse generic data registers)
```

### **Survival & Consumption Metrics**

- **Base Consumption**: Groups consume food reserves based on active population:
  $$\text{Food Required} = \max(1, \lfloor\text{Group Population} \times 0.1\rfloor) \text{ per 60 ticks}$$
- **Starvation Penalty**: If a group's warehouse food reserves (`bldDataC`) hit 0, all group members take -10 damage points every 60 ticks.
- **Reproduction Thresholds**: If a group has a positive population below its structural capacity, and controls a total wealth value exceeding 1,000 gold, it spends 500 gold to spawn a new character at its primary warehouse coordinates.

## **Character Stats & Lifespan**

Characters are tracked via flat arrays mapping IDs to numeric values.

### **Base Stats vs. Effective Cached Stats**

To prevent expensive per-tick compound evaluations, characters store their raw innate biological parameters in base arrays, while calculating actual values into effective arrays when equipment or active buffs change:

- `lifespan` vs. `effectiveLifespan` (Base average 60 to 80 years)
- `damage` vs. `effectiveDamage` (Base average 8 to 12)
- `speed` vs. `effectiveSpeed` (Base average 0.8 to 1.2)

### **Dynamic Stats Recalculation**

Effective stats are determined by adding flat modifiers and multiplying speed:

$$\text{effectiveDamage} = \text{damage} + \sum \text{Damage Buffs} + \text{itemDefStatA}[\text{equippedWeaponDefId}]$$
$$\text{effectiveSpeed} = \text{speed} \times \prod \text{Speed Buffs}$$
$$\text{effectiveLifespan} = \text{lifespan} + \sum \text{Lifespan Buffs}$$

_Note: If a character is carrying a weapon containing the `ITEM_TRAIT_CURSED` bitmask, their `effectiveLifespan` is immediately cut by 50%._

## **Item Definition & Instance Registries**

The item system utilizes a relational data layout separating static item templates from active, coordinate-tracked item instances in the world.

### **The Item Definition Registry (MAX_ITEM_DEFINITIONS = 1000)**

Stores static item templates and parameter baselines:

- `itemDefBaseType`: Melee (1), Ranged (2), Shield (3), Consumable (4).
- `itemDefStatA`: Flat primary modification stat (Melee = Damage, Consumables = Healing amount).
- `itemDefStatB`: Auxiliary modification stat (Melee = Cooldown, Ranged = Attack range).
- `itemDefTraitMask`: Active trait bitmasks (None = 0, Cursed = 1, Vampire = 2, Blessed = 4).

### **The Item Instance Buffer (MAX_ITEM_INSTANCES = 50000)**

Tracks physical, individual items distributed across characters, buildings, or coordinates:

- `itemInstanceDefId`: Points directly to the index template in the Definition Registry.
- `itemInstanceOwnerType`: Inactive (0), Ground (1), Warehouse (2), Character (3).
- `itemInstanceOwnerId`: Entity ID or Building ID owning this specific instance.
- `itemInstanceX` / `itemInstanceY`: Precise world coordinates if lying on the ground.

### **AI Autonomy Looting State**

When a character is in the Idle state, they scan the spatial hash grid cells for ground items. If an item is discovered with a higher primary stat value than their current weapon, they transition to `C.EntityState.Looting`. Upon reaching the item coordinates:

1. If they have an existing item equipped, its `itemInstanceOwnerType` is reverted to `C.OWNER_TYPE_GROUND` at the character's exact coordinates.
2. The new item is equipped by writing its instance ID to the character's `charWeapon[]` index.
3. `ApplyEquipmentModifiers()` is triggered to update the character's effective attributes immediately.

## **Societal Hierarchy & Channels**

Characters utilize an advanced 10-slot group channel structure that dictates allegiances and commands.

```text
Public Slots:  [ Slot 0 | Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 | Slot 6 | Slot 7 ]
Secret Slots:  [ Slot 8 | Slot 9 ]
```

### **Channel Prioritization**

- **Public Slots (0-7)**: Governs standard public affiliations (e.g., Slot 0 = Sovereign Nation, Slot 1 = Regional Clan, Slot 2 = Profession Guild).
- **Secret Slots (8-9)**: Tracks covert networks (e.g., Spy Ring, Underworld Syndicate, Covert Cults).
- **Command Overrides**: When multiple groups issue conflicting instructions (e.g., Faction A orders an attack, Faction B orders trade), the character checks slot indices in ascending order (0 to 7). The lowest slot index wins the command priority.

### **National Cohesion & Anarchy Transitions**

Each group tracks a `groupCohesion` value (0-100).

- **Prosperity Growth**: Having group assets above 10,000 gold increases cohesion by +1 per day.
- **Decline Decay**: Dropping below 0 gold reduces cohesion by -5 per day.
- **Anarchy Trigger**: If a nation's cohesion drops below 30, an anarchy event triggers on the daily cycle. All citizens who have that nation assigned in public Slot 0 have their Slot 1 group (their regional family or guild) promoted to Slot 0, while the failing nation is demoted to Slot 5.

### **Spy Sabotage Mechanics**

Units belonging to a covert spy ring (assigned via secret Slot 8 or 9) can execute the `Sabotaging` (9) state. Every 60 frames, if a spy is within 5 units of an opposing faction's warehouse, they drain 500 gold from the group's treasury and decay relation matrices by -10.

## **Polymorphic Building System**

Buildings discard rigid, sparse, and dedicated data arrays in favor of a packed, polymorphic component design.

### **Generic Data Registers (bldDataA, bldDataB, bldDataC)**

The physical meaning of each building's 32-bit registers shifts dynamically based on its `bldType` enum:

| Building Type    | Enum ID | bldDataA Registry        | bldDataB Registry     | bldDataC Registry    |
| :--------------- | :------ | :----------------------- | :-------------------- | :------------------- |
| **Warehouse**    | 1       | Stored Wood Quantity     | Stored Gold Quantity  | Stored Food Quantity |
| **House**        | 2       | Current Inhabitants      | Max Resident Capacity | Comfort Rating       |
| **Tower**        | 3       | Attack Range             | Attack Cooldown Timer | Damage Multiplier    |
| **Wall**         | 4       | Hardness Rating          | Construction Stage    | Integrity State      |
| **Field**        | 5       | Crop Maturity Multiplier | Harvest Yield Limit   | Irrigation State     |
| **Mind Control** | 6       | Radial Influence Range   | Charge Reserve        | Subversion Rate      |

### **Structural Evolution Tiers**

Buildings can upgrade through three distinct architectural tiers:

- **Tier Upgrade Requirements**:
  - **Tier 1 → Tier 2**: Costs 500 Wood and 200 Gold.
  - **Tier 2 → Tier 3**: Costs 1,500 Wood and 800 Gold.
- **Upgraded Capabilities**:
  - **Houses**: Max Capacity increases from 5 (Tier 1) → 12 (Tier 2) → 30 (Tier 3).
  - **Warehouses**: Storage limit scales from 5,000 (Tier 1) → 25,000 (Tier 2) → 100,000 (Tier 3).

## **Vehicles & Mount Subsystems**

The vehicle system handles mass-agent logistics and transport across terrain types.

### **Vehicle Specifications**

- **Wagon (1)**: High-speed land-traversing wagon. Max passenger capacity = 6. Restricted entirely to non-water tiles.
- **Ship (2)**: Mass-capacity aquatic transport. Max passenger capacity = 30. Restricted entirely to water tiles.

### **Delegated Steering & Hashing**

When characters approach their group's assigned vehicle, they enter the vehicle as passengers:

1. **Pilot Assignment**: The first entity to board a vehicle claims the pilot seat. This write uses a thread-safe atomic comparison:
   $$\text{Pilot Claim} = \text{Atomics.compareExchange}(S.\text{vehPilotId}, vIdx, -1, i)$$
2. **Delegated Control**: If successful, the pilot entity takes steering control, setting the vehicle's velocity vectors. All other passengers skip autonomous steering and movement logic.
3. **Coordinates Sync**: During the physical movement integration, all passenger positions are overwritten to match the parent vehicle's coordinates:
   $$\text{passengerX} = S.\text{vehPositionX}[\text{vehicleId}]$$
   $$\text{passengerY} = S.\text{vehPositionY}[\text{vehicleId}]$$

## **Projectiles & Radial Auras**

### **Ranged Projectile System (MAX_PROJECTILES = 20000)**

Tracks physical projectiles (Arrows, Fireballs) flying along coordinates trajectories:

- **Arrow (1)**: High speed, low area-of-effect. Deals 25 damage to the first opposing target hit.
- **Fireball (2)**: High damage, visible area impact. Deals explosive area damage.
- **Collision Checking**: Projectiles traverse the spatial hash grid cell corresponding to their current coordinate index ($O(1)$ lookup time) to identify potential victims, checking distance squared:
  $$\text{Collision Target} = \text{dist}^2 < 16.0$$

### **Radial Mind Control Auras**

The Mind Control Tower projects a circular aura zone ($150$ units radius). Every tick, the tower queries all spatial hash cells within its radial envelope. For every character found, the tower forcefully rewrites their public Slot 0 group affiliation to match the tower's owning group, immediately converting their political allegiance.

## **Bytecode Rules & Virtual Machine**

Each group's intelligence rules are evaluated via a stack-based virtual machine, processing dynamic rules without compiling new JavaScript code.

### **OpCode & Logic Reference**

```text
                     [ Opcode Registry Block ]
 ┌───────────────────────┬───────────────────────┬───────────────────────┐
 │       OP_POP_GT       │     OP_WEALTH_LT      │    OP_RELATION_LT     │
 │    Group Pop > Val    │   Group Wealth < Val  │   Relations < Limit   │
 ├───────────────────────┼───────────────────────┼───────────────────────┤
 │      OP_DIST_GT       │    OP_TICK_MODULO     │   OP_RANDOM_CHANCE    │
 │   Distance > Limit    │   Timer Interval Trg  │   Percentage Roll     │
 ├───────────────────────┼───────────────────────┼───────────────────────┤
 │    OP_COHESION_LT     │       GATE_AND        │        GATE_OR        │
 │   Cohesion < Limit    │    Binary Logic AND   │    Binary Logic OR    │
 └───────────────────────┴───────────────────────┴───────────────────────┘
```

### **Action Opcodes**

When a compound ruleset evaluates to TRUE (producing a 1 on top of the logic stack), it can execute high-level game actions:

- `ACTION_SPAWN_DEFENSE_PROJECTILE` (101): Spawns a fireball projectile from the group's warehouse targeted towards the nearest hostile faction's assets.
- `ACTION_DECLARE_WAR` (102): Forces the group's relation matrix with a random neutral group to -100, triggering military mobilizations.

## **Player Selection & Command Injection**

Players interact directly with the simulation state through coordinate calculations and targeted input overrides.

### **Inverse Camera Transform (Raycasting)**

To click on map entities, screen coordinate pixels are translated into world space coordinates using the active camera position $(X, Y)$ and zoom scale:

$$\text{worldX} = \text{cameraX} + \frac{(\text{screenX} - \text{canvasRectLeft}) \times \text{scaleX}}{\text{zoom}}$$
$$\text{worldY} = \text{cameraY} + \frac{(\text{screenY} - \text{canvasRectTop}) \times \text{scaleY}}{\text{zoom}}$$

### **Selected Command Overrides (`targetEntityId = -3`)**

When a player left-clicks an entity, they select it. Right-clicking anywhere on the canvas transmits a command to the worker threads, injecting world coordinates directly into `playerTargetX` and `playerTargetY` and setting `targetEntityId = -3`.

- **Bypassing Autonomy**: Entities flagged with `-3` bypass all autonomous goal gathering, survival logic, and rules evaluations. They march at double speed directly towards the target coordinates. Once they arrive within 2 pixels of the destination, they are released back to the AI state machine.

## **WebGL2 Instanced Rendering Shader Pipeline**

The rendering system uses WebGL2 instanced draw calls (`gl.drawArraysInstanced`) to render up to 100,000 entities, 20,000 buildings, 50,000 items, and 20,000 projectiles at 60 FPS.

```text
       [ Client GPU VBO Memory ]
        ├── Quad VBO (Basic Geometry Quad)
        └── Dynamic Buffers (Sequence of Float32 coordinates)
                     │
                     ▼
       [ Vertex Shader Calculations ]
        ├── Invert camera translations
        └── GPU-side discard check (push off-screen if inactive)
                     │
                     ▼
       [ Fragment Shader Rasterizer ]
        ├── Geometry calculations (Circle / Star / Flag drawing)
        └── Color output formatting
```

### **GPU-Side Culling**

To prevent CPU bottlenecking, the main thread streams raw arrays directly to the GPU. Culling inactive objects is handled entirely in the Vertex Shaders by moving the vertex coordinate off-screen, bypassing fragment rasterization:

- **Projectiles (`PROJ_VS`)**:  
  `if (i_type == 0.0) { gl_Position = vec4(-10.0, -10.0, 0.0, 1.0); return; }`

- **Ground Items (`ITEM_VS`)**:  
  `if (i_ownerType != 1.0) { gl_Position = vec4(-10.0, -10.0, 0.0, 1.0); return; }`

## **Architecture File Reference**

### **File Reference Table**

| Path                                    | Primary Architectural Responsibility                                            |
| :-------------------------------------- | :------------------------------------------------------------------------------ |
| `src/simulation/constants.ts`           | Simulation limits, OpCode numbers, time constants, and enum states.             |
| `src/simulation/state.ts`               | Declares and maps all SharedArrayBuffer typed array buffers.                    |
| `src/simulation/initialization.ts`      | World generation, river curves, and default item definitions.                   |
| `src/simulation/utils.ts`               | Thread synchronization barriers, spatial queries, and group management.         |
| `src/simulation/buffs.ts`               | Sparse buff management, item traits, and effective stats recalculation.         |
| `src/simulation/systems/spatialHash.ts` | Rebuilds the linked-list grid for fast $O(1)$ spatial queries.                 |
| `src/simulation/systems/steering.ts`    | Calculates desired velocity based on AI targets and flocking vectors.           |
| `src/simulation/systems/movement.ts`    | Integrates velocity into position and enforces terrain/world boundaries.       |
| `src/simulation/systems/combat.ts`      | Processes projectiles, damage application, and radial aura conversions.         |
| `src/simulation/systems/gathering.ts`   | Handles resource harvesting, inventory delivery, and construction progress.     |
| `src/simulation/systems/lifecycle.ts`   | Manages biological decay, starvation, and death cleanup/loot spawning.          |
| `src/simulation/systems/master.ts`      | Coordinates group-level reproduction, VM bytecode rules, and diplomacy.         |
| `src/simulationWorker.ts`               | Orchestrates the sequential execution of ECS systems across workers.            |
| `src/main.tsx`                          | Obtains WebGL2 context, spawns workers, and compiles shaders.                   |
| `src/App.tsx`                           | Provides user interfaces for rules compilation and group creation.              |

_Last updated: 2026-05-18_
