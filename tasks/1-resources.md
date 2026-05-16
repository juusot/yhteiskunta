# Task 1: Biomes, Resources, & Regeneration

## Description
Update the initialization and master systems to handle biome-specific resource spawning and slow regeneration.

## Actions
- [x] Modify `initializeWorld` and `generateBiomes` to spawn:
  - Trees/Wood on Grass tiles.
  - Gold on River tiles.
- [x] Implement a `ResourceRegenerationSystem` in `master.ts`:
  - Periodically scan for dead tree entities.
  - Respawn them on valid tiles matching their biome requirements.
- [x] Ensure `AutonomySystem` can handle different resource types when searching for targets.
