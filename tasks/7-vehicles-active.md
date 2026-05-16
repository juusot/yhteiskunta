# Task 7: Deep Terrain & Active Vehicles

## Description
Make vehicles a functional and necessary part of the game loop for traversing difficult terrain.

## Actions
- [ ] **Deep Water Generation:** Update map generation to include `TerrainType.DeepWater` (oceans/lakes) alongside shallow rivers.
- [ ] **Vehicle Construction:** Allow characters to build Carts, Boats, and Helicopters using Wood and Gold.
- [ ] **Terrain Restrictions:** 
  - Characters cannot enter Deep Water without a Boat.
  - Characters cannot cross Mountains without a Helicopter.
- [ ] **Vehicle Pathing AI:** Update `SteeringSystem` and `AutonomySystem` so characters actively seek and mount the correct vehicle when trying to reach a target across restricted terrain.