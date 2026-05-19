// src/simulation/systems/parallel.ts
// This file is being deprecated in favor of the modular ECS system files:
// - spatialHash.ts
// - steering.ts
// - movement.ts
// - combat.ts
// - gathering.ts
// - lifecycle.ts

/**
 * @deprecated Use rebuildSpatialHash from spatialHash.ts
 */
export function SpatialUpdateSystem(): void {}

/**
 * @deprecated Use runLifecycleSystem from lifecycle.ts
 */
export function LifeSystem(): void {}

/**
 * @deprecated Logic moved to runSteeringSystem
 */
export function IntelReportingSystem(): void {}

/**
 * @deprecated Logic moved to runLifecycleSystem
 */
export function AutonomySystem(): void {}

/**
 * @deprecated Use runSteeringSystem from steering.ts
 */
export function SteeringSystem(): void {}

/**
 * @deprecated Use runCombatSystem from combat.ts
 */
export function ProjectileSystem(): void {}

/**
 * @deprecated Use runCombatSystem from combat.ts
 */
export function AuraSystem(): void {}

/**
 * @deprecated Use runMovementSystem from movement.ts
 */
export function MovementSystem(): void {}
