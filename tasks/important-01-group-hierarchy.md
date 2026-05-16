# Task: Multi-Stack Group Hierarchy & Trait System

**Priority:** IMPORTANT  
**Created:** 2026-05-16  
**Status:** Planning Complete, Ready to Implement  

---

## Overview

Implement a flexible group hierarchy system where characters can belong to up to 8 groups simultaneously, with priority-based conflict resolution. Add a trait/buff system that allows users to modify character stats through items, groups, and other sources.

**Key Design Principles:**
1. Groups are "hashtags" - no hardcoded types, user defines meaning through rules
2. 8 fixed slots per character (slot 0 = highest priority)
3. Performance target: 50k entities @ 30 FPS minimum
4. Open-ended buff system (can extend beyond items/groups)
5. Slow update cycle for group trait inheritance (not real-time)

---

## Sub-Tasks

### important-01-data-structures

**Goal:** Add new state arrays for stats, game time, and buffs

**Changes:**
- [ ] `src/simulation/state.ts`
  - Add `lifespan: Int16Array` (base years, default 80)
  - Add `damage: Int16Array` (base damage, default 10)
  - Add `speed: Float32Array` (base movement, default 1.0)
  - Add `groupCreatedAt: Int32Array` (game day when group created)
  - Add `groupNames: Map<number, string>` (sparse storage for group names)

- [ ] `src/simulation/constants.ts`
  - Add `MAX_GAME_DAYS = 365` (or configurable)
  - Add `TICKS_PER_DAY = 3600` (60 ticks/sec × 60 sec = 1 hour per day? adjust)

- [ ] New file: `src/simulation/buffs.ts`
  - Define `Buff` interface
  - Define `activeBuffs: Map<number, Buff[]>`
  - Export buff application functions

**Acceptance Criteria:**
- All new arrays allocated in `initializeState()`
- Buff system data structures exist (no logic yet)
- No breaking changes to existing systems

---

### important-02-game-time

**Goal:** Implement game clock (days/months/years)

**Changes:**
- [ ] `src/simulation/state.ts`
  - Add `gameDay: number`
  - Add `gameMonth: number`
  - Add `gameYear: number`
  - Add `tickInDay: number` (0 to TICKS_PER_DAY)

- [ ] `src/simulation/systems/master.ts` or new `TimeSystem.ts`
  - Increment `tickInDay` each tick
  - Roll over to next day when `tickInDay >= TICKS_PER_DAY`
  - Roll over months (30 days?) and years (12 months?)

- [ ] `src/main.tsx`
  - Display game time in UI (top bar or stats tab)

**Acceptance Criteria:**
- Game time advances correctly
- UI shows current date
- Systems can query "is new day?" for slow updates

---

### important-03-buff-system-core

**Goal:** Implement buff application logic

**Changes:**
- [ ] `src/simulation/buffs.ts`
  - `applyBuff(entityId: number, buff: Buff): void`
  - `removeBuff(entityId: number, buffId: number): void`
  - `getEffectiveStats(entityId: number): { lifespan, damage, speed, ... }`
  - `clearExpiredBuffs(entityId: number): void`

- [ ] `src/simulation/systems/master.ts`
  - Add `BuffSystem()` - runs once per game day
  - Clear expired buffs
  - Recalculate effective stats

- [ ] `src/simulation/state.ts`
  - Add effective stat arrays (computed, not base):
    - `effectiveLifespan: Int16Array`
    - `effectiveDamage: Int16Array`
    - `effectiveSpeed: Float32Array`

**Acceptance Criteria:**
- Buffs can be added/removed programmatically
- Effective stats = base + all active buffs
- Expired buffs auto-removed daily
- Performance: < 1ms for 50k entities

---

### important-04-group-creation

**Goal:** Allow users to create/destroy groups

**Changes:**
- [ ] `src/simulation/utils.ts`
  - `createGroup(name: string, ownerId?: number): number` → returns groupId
  - `destroyGroup(groupId: number): void`
  - `assignCharacterToGroup(entityId: number, groupId: number, slot: number): void`
  - `removeCharacterFromGroup(entityId: number, slot: number): void`

- [ ] `src/simulation/state.ts`
  - Initialize `groupNames` Map
  - Initialize `groupCreatedAt` array

- [ ] `src/main.tsx` or `src/App.tsx`
  - Add "Create Group" button (new tab or side panel)
  - Input: Group name
  - Display: List of existing groups

**Acceptance Criteria:**
- User can create named groups
- User can assign characters to groups (via console for now)
- Groups tracked with creation date

---

### important-05-event-system-expansion

**Goal:** Expand event queue from 4 to 8 slots, add event types

**Changes:**
- [ ] `src/simulation/constants.ts`
  - Add event type constants:
    - `EVENT_ATTACK = 99` (existing)
    - `EVENT_MOVE = 100`
    - `EVENT_RECRUIT = 101`
    - `EVENT_TRADE = 102`
    - `EVENT_REPORT = 103`
    - `EVENT_BUILD = 104`
    - `EVENT_DISBAND = 105`
    - `EVENT_CUSTOM = 106`

- [ ] `src/simulation/state.ts`
  - Change `pendingEvents` from 4 to 8 slots per entity
  - Update allocation: `MAX_ENTITIES * 8 * 4` (was `* 4 * 4`)

- [ ] `src/simulation/utils.ts`
  - Update `pushEvent()` to handle 8 slots
  - Add `sendEventToGroup(groupId: number, eventType: number, data?: any): void`
  - Add `sendEventToCharacter(entityId: number, eventType: number): void`

- [ ] `src/simulation/systems/master.ts`
  - Add `eventData: Map<number, EventData>` for active events with payload

**Acceptance Criteria:**
- 8 event slots per character (was 4)
- Can send events to groups (all members receive)
- Event types documented and usable

---

### important-06-ui-group-management

**Goal:** Add UI for viewing/managing group hierarchy

**Changes:**
- [ ] `src/App.tsx`
  - Add new tab: "Groups"
  - Display: List of all groups with stats
  - Display: Character's 8 group slots (when inspecting)
  - Add: Dropdown to reassign character to different group/slot

- [ ] `src/main.tsx`
  - Expose functions to window for console testing:
    - `window.createGroup(name)`
    - `window.assignToGroup(entityId, groupId, slot)`
    - `window.sendEvent(target, eventType)`

**Acceptance Criteria:**
- User can see all groups in UI
- User can see character's group hierarchy
- User can reassign groups (dropdown or console)
- Console commands work for testing

---

### important-07-slow-update-cycle

**Goal:** Implement lazy stat inheritance from groups

**Changes:**
- [ ] `src/simulation/buffs.ts`
  - `applyGroupBuffs(entityId: number): void`
  - Called when character:
    - Visits group building (warehouse, etc.)
    - Sleeps (idle at night?)
    - Game day changes

- [ ] `src/simulation/systems/parallel.ts`
  - In `LifeSystem()` or new system:
  - Check if character "visited" group (near warehouse?)
  - Apply group buffs on visit

- [ ] `src/simulation/constants.ts`
  - Add `GROUP_BUFF_UPDATE_INTERVAL = 7` (days between forced updates)

**Acceptance Criteria:**
- Group stat changes don't apply instantly
- Characters update when visiting group buildings
- Forced update every 7 days for all characters
- Documented behavior for users

---

### important-08-integration-testing

**Goal:** Test all systems work together

**Test Cases:**
- [ ] Create 3 groups, assign character to all 3 (different slots)
- [ ] Send conflicting orders (slot 0 should win)
- [ ] Apply buff via group, verify stat change
- [ ] Remove character from group, verify buff removed
- [ ] Create event, send to group, verify all members receive
- [ ] Run with 50k entities, verify 30+ FPS

**Performance Benchmarks:**
- Buff application: < 1ms for 50k entities
- Event sending: < 5ms for group-wide event (10k members)
- Group reassignment: instant

---

### important-09-documentation

**Goal:** Update wiki and docs

**Changes:**
- [ ] `docs/wiki.md`
  - Add "Group Hierarchy" section
  - Add "Buff System" section
  - Add "Game Time" section
  - Update "Character Stats" with new attributes

- [ ] `docs/task6-agriculture.md`
  - Mark as complete
  - Link to this task

- [ ] `README.md` (if exists)
  - Quick start guide for group management

**Acceptance Criteria:**
- User can read wiki and understand how to use groups
- All new features documented
- Examples provided (like the ramblings examples)

---

## Implementation Order

```
Week 1: important-01, important-02, important-03
        (Data structures, game time, buff core)

Week 2: important-04, important-05
        (Group creation, event expansion)

Week 3: important-06, important-07
        (UI, slow update cycle)

Week 4: important-08, important-09
        (Testing, documentation)
```

---

## Dependencies

- ✅ Task 6: Agriculture & Sustenance (complete)
- ⏳ This task depends on no other tasks
- ⏭️  Future tasks may depend on this (vehicles, trade, etc.)

---

## Notes

- **Groups are hashtags** - no hardcoded types
- **8 fixed slots** - priority by index (0 = highest)
- **Slow updates** - group buffs not applied in real-time
- **Open-ended buffs** - can extend to regions, events, etc.
- **Performance first** - 50k @ 30 FPS minimum

---

*Last updated: 2026-05-16*
