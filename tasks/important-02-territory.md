# Task: Territory & Influence System

**Priority:** IMPORTANT  
**Created:** 2026-05-16  
**Status:** In Progress  

---

## Overview

Replace abstract influence system with building-radius mechanics. Territorial expansion driven by structure placement, creating natural borders and friction between nations.

---

## Design Decisions

### 1. Building Influence Radii

| Building Type | Radius (units) | Purpose |
|--------------|----------------|---------|
| Warehouse | 200 | Nation starter, large initial area |
| House | 80 | Residential expansion |
| Tower | 150 | Military/cultural projection |
| Field | 0 | Utility (no expansion) |
| Wall | 0 | Border marker (no expansion) |

**Rationale:**
- Warehouse = big starting zone for new nations
- Houses = gradual organic growth
- Towers = long-range power projection (mages, military, etc.)
- Fields/Walls = functional, no territorial claim

### 2. Building Restrictions

- Characters can ONLY build within their group's influence radius
- Check performed BEFORE construction starts
- If no valid spot found → silent fail (character returns to idle)
- Exception: First Warehouse (spawns anywhere at game start)

### 3. Border Tension

**Storage:** `groupRelationsMatrix[]`
- When building radii overlap: -5 relations/day for both groups
- Stored in existing diplomacy matrix (no new arrays needed)
- Creates diplomatic pressure without automatic war

**Future Extensions:**
- Culture trait: affects how borders are handled (aggressive vs peaceful)
- Laws: some groups may allow shared territory
- Wars: tension > threshold → automatic conflict

### 4. Visualization

**Phase 1 (Current Implementation):**
- Toggle button: "Territory View" (already exists as "PolMap")
- Colored circles around Warehouses/Towers
- Color from `groupVisualArchetypes[]`
- Overlapping areas show blended colors

**Phase 2 (Future):**
- Multiple view modes dropdown:
  - Territory (Warehouses, Towers)
  - Magic (Wizard Towers → mana radius)
  - Military (Barracks, Castles → control)
  - Economic (Markets, Ports → trade)
- Tied to group types/building types
- "Mages Guild" towers project magic influence
- "Warrior Clan" barracks project military control

### 5. Viewing Modes (Future)

**Concept:** Different overlays for different group functions

```
View Mode: TERRITORY
- Shows: Warehouse radius (200), Tower radius (150)
- Color: Group archetype color
- Use: See national borders

View Mode: MAGIC
- Shows: Wizard Tower radius (100)
- Color: Blue/purple
- Use: Mages far from tower → reduced mana

View Mode: MILITARY
- Shows: Barracks/Castle radius (120)
- Color: Red
- Use: Military control zones

View Mode: ECONOMIC
- Shows: Market/Port radius (80)
- Color: Green/Gold
- Use: Trade influence
```

**Implementation Notes:**
- Requires group types (Nation, Guild, Cult, etc.)
- Each group type has different building priorities
- Different "influence layers" in shader

---

## Implementation Plan

### Phase 1: Core Mechanics ✅ COMPLETE
- [x] Add influence radius constants per building type
- [x] Add influence map calculation (run every 60 ticks)
- [x] Add building restriction check (before construction)
- [x] Add border overlap detection (daily tension)
- [x] Add Field building logic with wood cost (200 wood)

### Phase 2: Visualization ⏳ PENDING
- [ ] Update InfluenceSystem to use radius-based logic
- [ ] Update WebGL shader to render influence circles
- [ ] Toggle button for territory view

### Phase 3: Integration ⏳ PENDING
- [ ] Test with multiple groups
- [ ] Verify border clashes create tension
- [ ] Performance test (influence calculation)

---

## Data Structures

**Existing (reuse):**
- `influenceMap: Int16Array` - Influence strength per tile
- `territoryOwnerMap: Int32Array` - Which group owns each tile
- `groupRelationsMatrix: Int8Array` - Diplomatic relations (-100 to +100)
- `groupVisualArchetypes: Int8Array` - Group colors (0-3)

**New (if needed):**
- `buildingInfluenceRadius: Uint8Array` - Radius per building (or constant by type)
- `borderTensionTimer: Int16Array` - Track overlap duration (optional)

---

## Acceptance Criteria

- [ ] Buildings project circular influence
- [ ] Can only build within influence (except first Warehouse)
- [ ] Overlapping influence creates relation penalty
- [ ] Territory view shows colored borders
- [ ] Performance: < 5ms for influence calculation (60 ticks)

---

## Known Issues / Future Work

- No group types yet (Nation vs Guild vs Cult)
- No viewing modes dropdown (single toggle for now)
- No culture/law system for border handling
- Influence visualization may be performance-heavy at scale

---

*Last updated: 2026-05-16*
