# Task 2: Distinct Subsystems (Memory & Rendering)

## Description
Establish dedicated memory pools and rendering paths for Buildings and Vehicles to preserve the 100k Character cap.

## Actions
- [ ] Update `constants.ts`:
  - Define `MAX_BUILDINGS = 20000`.
  - Define `MAX_VEHICLES = 5000`.
- [ ] Update `state.ts`:
  - Allocate dedicated `SharedArrayBuffers` for Building state (Position, HP, Type, Owner).
  - Allocate dedicated `SharedArrayBuffers` for Vehicle state (Position, Type, PilotID, Passengers).
- [ ] Update `main.tsx`:
  - Add WebGL shaders for Buildings and Vehicles.
  - Implement separate VAOs and draw calls in the `render` loop.
- [ ] Update `SpatialUpdateSystem` to include static buildings.
