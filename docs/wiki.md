# Yhteiskunta - Game Mechanics Wiki

> **Yhteiskunta** (Finnish for "society") - A simulation game where autonomous characters build, survive, and form societies driven by group rules and player-defined logic.

---

## Table of Contents

1. [Core Systems](#core-systems)
2. [Resources](#resources)
3. [Characters](#characters)
4. [Groups & Nations](#groups--nations)
5. [Buildings](#buildings)
6. [AI & Behavior](#ai--behavior)
7. [Combat](#combat)
8. [Territory & Influence](#territory--influence)

---

## Core Systems

### Simulation Architecture

- **Platform**: Tauri + Vite + TypeScript (background Web Worker)
- **Data Pattern**: Pure Data-Oriented Design (DOD) via Entity Component System (ECS)
- **Entity Limit**: 100,000 entities
- **Building Limit**: 20,000 buildings
- **Group Limit**: 1,000 groups
- **World Size**: 1600×1200 units (160×120 tiles)

### Tick System

- Simulation runs at 60 ticks/second
- Systems execute in parallel across 4 quadrants
- SummarySystem runs every 60 ticks (1 second) for population/food calculations

---

## Resources

### Resource Types

| Type | Inventory Slot | Source | Use |
|------|---------------|--------|-----|
| **Wood** | 0 | Trees (Forest tiles) | Buildings, items |
| **Gold** | 1 | Gold nodes (Water tiles) | Currency, trade, buildings |
| **Food** | 2 | Bushes (Grass), Fields | **Survival only** |
| **Misc** | 3 | Loot piles | Future use |

### Resource Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Harvest    │────▶│   Return     │────▶│   Deposit    │
│  (bush/tree) │     │  to depot    │     │  (warehouse) │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
  entityInventory      Navigate to         bldInventory[slot]
  += 10 per tick       warehouse           groupFood += value
  charTool = type      (flow field)        (summed by SummarySystem)
```

### Food Mechanics

**Consumption Rate:**
```
foodRequired = max(1, population × 0.1)  // per tick cycle
```

**Starvation:**
- Only groups **with food storage** can starve
- Groups without warehouses/fields don't consume food (safe start)
- Starving characters: -10 health/cycle
- Partial food = partial starvation (need < 50% of required)

**Starting Resources:**
All 4 primary nations spawn with:
- 1,000 food
- 500 wood
- 500 gold

---

## Characters

### Entity States

| State | ID | Description |
|-------|----|-------------|
| `Idle` | 0 | Default state, wandering |
| `Harvesting` | 1 | Gathering from resources |
| `Fleeing` | 2 | Escaping threats |
| `Combat` | 3 | Attacking enemies |
| `ReturningToDepot` | 4 | Bringing resources home |
| `Dead` | 5 | Removed from simulation |
| `Trading` | 6 | Courier between groups |
| `ReportingIntel` | 7 | Scout reporting enemies |
| `Construction` | 8 | Building structures |

### Character Traits (Bitmask)

| Bit | Trait | Effect |
|-----|-------|--------|
| 0 | `TREE` | Entity is a tree (non-mobile) |
| 1 | `GOLD` | Entity is gold node (non-mobile) |
| 2 | `BUSH` | Entity is bush (non-mobile) |
| 3 | `AGGRESSIVE` | Fights when attacked |
| 4 | `SCOUT` | Reports enemy positions |
| 5 | `FANATIC` | [Reserved] |
| 6 | `COURIER` | Trades between groups |
| 7 | `MAGIC` | Uses mana for intel reporting |
| 8 | `LOOT` | Entity is a loot pile |

### Equipment

| Slot | Array | Effect |
|------|-------|--------|
| Weapon | `charWeapon[]` | +5 damage per level in combat |
| Armor | `charArmor[]` | -3 damage taken per level |
| Tool | `charTool[]` | **Also stores resource type** (0=wood, 1=gold, 2=food, 3=misc) |

### Health & Death

- Starting health: 100
- Natural decay: -1/tick (unless harvesting/has money)
- Starvation: -10/cycle
- Combat damage: 10 + (weapon×5) - (armor×3)
- Death drops loot pile if character had items/money

---

## Groups & Nations

### Group Structure

- **Maximum**: 1,000 groups
- **Primary Nations**: 4 (groups 0-3) with safety net spawning
- **Warehouse**: Each group has a central warehouse building

### Group Resources

| Array | Description |
|-------|-------------|
| `groupPopulationCount[]` | Active character count |
| `groupBuildingCount[]` | Total buildings owned |
| `groupTotalWealth[]` | Sum of all resources |
| `groupWood[]` | Wood in buildings |
| `groupGold[]` | Gold in buildings |
| `groupFood[]` | **Food reserves** (consumed for survival) |
| `groupMisc[]` | Misc resources |

### Group Commands

Groups can issue orders via `groupTargetEntityId[]`:
- `-1`: No order
- `-2`: Flow field navigation target
- `>= 0`: Attack specific entity ID

Characters check group orders every tick and obey based on affiliation priority (slot 0 = highest).

### Diplomacy

- `groupRelationsMatrix[]`: 1000×1000 matrix (-100 to +100)
- Relations decrease when groups fight
- Relations increase via trade
- Relations < -50: Automatic combat declaration
- Relations >= 0: Trade possible

---

## Buildings

### Building Types

| ID | Type | Description |
|----|------|-------------|
| 0 | `None` | Empty slot |
| 1 | `Warehouse` | Resource depot, group anchor |
| 2 | `House` | +5 population capacity, costs 1000 wealth |
| 3 | `Tower` | [Reserved for defense] |
| 4 | `Wall` | [Reserved for defense] |
| 5 | `Field` | **Permanent food source**, costs 600 wealth |

### Building Properties

| Array | Description |
|-------|-------------|
| `bldPositionX/Y[]` | World position |
| `bldType[]` | Building type enum |
| `bldHealth[]` | 0-1000 (construction: 0-1000, damage reduces) |
| `bldOwnerGroup[]` | Owning group ID |
| `bldInventory[]` | 4 slots: wood, gold, food, misc |

### Construction

1. Character enters `Construction` state
2. Each tick: `bldHealth += 50`
3. At 1000: Building complete
4. Construction cost deducted from group wealth immediately

### Field Mechanics

**When to build:**
- Group food < 100
- Population > 0
- No existing field owned
- Group wealth > 800

**Harvesting from Fields:**
- Characters target field building (not entity)
- Continuous harvest (field never depletes)
- Same deposit mechanics as bushes

---

## AI & Behavior

### Priority Hierarchy

Characters evaluate actions in strict order:

```
┌─────────────────────────────────────────┐
│  1. SURVIVAL (Automatic)                │
│  IF groupFood < population × 0.5:       │
│    → Find nearest bush/field            │
│    → Harvest immediately                │
└─────────────────────────────────────────┘
                  ↓ (if no survival need)
┌─────────────────────────────────────────┐
│  2. FINISH CURRENT TASK                 │
│  - Return harvested resources           │
│  - Complete construction                │
│  - Deposit at warehouse                 │
└─────────────────────────────────────────┘
                  ↓ (if task complete)
┌─────────────────────────────────────────┐
│  3. GROUP COMMANDS                      │
│  - Check pending events (attacks)       │
│  - Check group target orders            │
│  - Obey highest priority affiliation    │
└─────────────────────────────────────────┘
                  ↓ (if no orders)
┌─────────────────────────────────────────┐
│  4. IDLE / WANDER                       │
│  - Default state                        │
│  - Stay near warehouse                  │
│  - Let groups drive progress            │
└─────────────────────────────────────────┘
```

### Design Philosophy

1. **Survival is automatic** - No random chance, characters ALWAYS seek food when critical
2. **Task persistence** - Finish what you started before new actions
3. **Group-driven progress** - Complex behaviors require explicit group rules
4. **Idle by default** - Prevents chaotic random behavior

### State Machine

```
                    ┌─────────────┐
                    │    Idle     │
                    └──────┬──────┘
                           │ Survival need / Group order
                           ▼
                    ┌─────────────┐
          ┌────────│  Harvesting   │────────┐
          │        └──────┬──────┘        │
          │               │ Full          │
          │               ▼               │
          │        ┌─────────────┐        │
          │        │ Returning   │        │
          │        │  To Depot   │        │
          │        └──────┬──────┘        │
          │               │ Arrived       │
          │               ▼               │
          │        ┌─────────────┐        │
          │        │   Deposit   │        │
          │        └──────┬──────┘        │
          │               │               │
          └───────────────┴───────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │    Idle     │ (loop)
                    └─────────────┘
```

---

## Combat

### Combat Initiation

1. **Group orders**: `groupTargetEntityId[]` set by rules
2. **Relations < -50**: Automatic hostility
3. **Attack events**: `EVENT_HOSTILE_ATTACK` pushed to entity queue
4. **Territorial attrition**: Enemies in hostile territory take damage

### Damage Calculation

```
finalDamage = max(1, (10 + weaponLevel × 5) - (armorLevel × 3))
```

### Combat Behavior

- Aggressive characters: Fight back
- Non-aggressive: Flee
- Combat continues until target dies or out of range
- Killing character drops loot pile (if had items)

---

## Territory & Influence

### Influence Map

- Each tile tracks `influenceMap[]` (0-1000)
- Characters increase their group's influence by standing on tiles
- Influence decays over time (×0.9 per check)
- Competing influences cancel out

### Territory Ownership

- `territoryOwnerMap[]` tracks which group owns each tile
- Influence > 100 for 5 cycles → territory claimed
- Influence < 10 → territory lost
- Territory claim requires distance > 300 from main warehouse

### Territorial Attrition

- Characters in hostile territory (relations < -50): -2 health/cycle
- Encourages groups to expand defensively

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `src/simulation/constants.ts` | Game constants, enums, limits |
| `src/simulation/state.ts` | Component array declarations |
| `src/simulation/initialization.ts` | World generation, spawn logic |
| `src/simulation/utils.ts` | Spatial queries, group commands |
| `src/simulation/systems/master.ts` | SummarySystem, RuleEvaluation, Trade, Influence |
| `src/simulation/systems/parallel.ts` | Autonomy, Steering, Movement, Life, Combat |
| `src/App.tsx` | UI: Stats, Monitor, Rules tabs |
| `src/main.tsx` | Rendering, input, simulation worker coordination |

---

## Changelog

### Task 6: Agriculture & Sustenance (Current)

- ✅ Added `BuildingType.Field` (permanent food source)
- ✅ Fixed food AI priority (survival = automatic priority 1)
- ✅ Fixed food consumption (deducts from groupFood, not wealth)
- ✅ Fixed resource deposit (correct inventory slots)
- ✅ Added starting food (1000) to all nations
- ✅ Rewrote AutonomySystem with clean priority hierarchy
- ✅ Added field harvesting to SteeringSystem

### Future Tasks

- [ ] Task 7: Reproduction rules (population growth mechanics)
- [ ] Task 8: Advanced building types (towers, walls)
- [ ] Task 9: Trade system improvements
- [ ] Task 10: Magic system expansion

---

*Last updated: 2026-05-16*
