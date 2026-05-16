# Task 3: Construction & Warehouses

## Description
Enable characters to build structures and upgrade Warehouses to functional buildings.

## Actions
- [ ] Add `EntityState.Construction`.
- [ ] Implement `ConstructionSystem` in `parallel.ts`:
  - Characters carry resources to a site.
  - "Building" progress increases until a Building entity is spawned.
- [ ] Upgrade Warehouses:
  - They are now specific Building entities.
  - They have `Inventory` arrays to store pooled resources and items.
- [ ] Update `SummarySystem` to account for warehouse storage in group wealth.
