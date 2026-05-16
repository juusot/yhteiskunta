# Task 4: Slot-Based Items & Loot Piles

## Description
Implement a lightweight item system and loot drops on death.

## Actions
- [ ] Update `state.ts`:
  - Add `characterWeapon`, `characterArmor`, `characterTool` slots (Int32).
- [ ] Implement `ItemStatsSystem`:
  - Weapons increase damage.
  - Armor decreases incoming damage.
- [ ] Implement "Loot Pile" spawning in `LifeSystem`:
  - On death, if a character has items, a temporary entity is spawned at their location.
  - Other characters can "Harvest" the loot pile to get items.
- [ ] Update `Warehouse` logic to allow equipping items from the pool.
