# System Architecture Schema

## Core Constraints

- Platform: Tauri + Vite + TypeScript (running inside a background Web Worker).
- Data Pattern: Pure Data-Oriented Design (DOD) via Entity Component System (ECS).
- No object instances or classes for entities. All states live in flat primitive TypedArrays.
- Entity ID is a direct index integer matching across all component arrays.

## Component Arrays (Max Entities: 100,000)

- PositionXArray: Float32Array
- PositionYArray: Float32Array
- VelocityXArray: Float32Array
- VelocityYArray: Float32Array
- HealthArray: Int32Array
- MoneyArray: Int32Array
- StateArray: Uint8Array (0=Idle, 1=Harvesting, 2=Fleeing, 3=Combat)
- ActionTimerArray: Int16Array (Ticks remaining for current state)
- PrimaryGroupArray: Int32Array (Links entity to their main group ID)
- TraitBitmaskArray: Uint32Array (Bit 0 = Violent, Bit 1 = Immortal, etc.)

## Group & Knowledge Registries

- GroupKnowledgeTargetID: Int32Array (Indexed by Group ID)
- GroupKnowledgeX: Int16Array
- GroupKnowledgeY: Int16Array
