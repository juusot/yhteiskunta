# Task 5: Vehicles & Strict Group Hierarchy

## Description
Enable vehicle usage and enforce strict group priorities.

## Actions
- [ ] Implement "Mount" logic:
  - Character enters vehicle -> Coordinate syncing.
  - Vehicles allow moving over terrain (Boats for water, Helis for mountains).
- [ ] Refactor `AutonomySystem`:
  - Implement Slot-based priority checking.
  - Slot 0 (Highest Hierarchy) commands override all others.
- [ ] Update `SteeringSystem` to handle vehicle velocities.
