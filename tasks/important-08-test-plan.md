# Integration Test Plan - Group Hierarchy System

**Date:** 2026-05-16  
**Status:** Ready to Execute  

---

## Test 1: Group Creation & Persistence

**Steps:**
1. Start game
2. Go to GROUPS tab
3. Create group "Testers"
4. Wait 5 seconds
5. Refresh page

**Expected:**
- ✅ Console shows: `Group created: Testers (ID: X)`
- ✅ Group appears in list immediately
- ✅ Group stays in list (doesn't disappear)
- ✅ After refresh, group still exists (has warehouse building)

**Console Commands:**
```javascript
// Check group exists
S.groupTotalWealth[4]  // Should be 1000
S.groupBuildingCount[4]  // Should be 1
```

---

## Test 2: Character Assignment

**Steps:**
1. Create group "Warriors"
2. Click ASSIGN MEMBER
3. Enter Entity ID: `0`, Slot: `0`
4. Check console
5. Check character's group affiliation

**Expected:**
- ✅ Console: `Entity 0 assigned to Group X (slot 0)`
- ✅ Group shows: `1 pop`
- ✅ Character now belongs to group

**Console Commands:**
```javascript
// Check character's groups
S.groupAffiliations[0 * 8]  // Should be group ID
S.groupAffiliations[0 * 8 + 1]  // Should be -1 (empty)
```

---

## Test 3: Event System

**Steps:**
1. Create group "Attackers"
2. Assign entity 0 to group (slot 0)
3. Click SEND EVENT on group
4. Enter event type: `100` (MOVE)
5. Check entity's pending events

**Expected:**
- ✅ Console: `Event 100 sent to 1 members of Group X`
- ✅ Entity receives event in queue
- ✅ Entity should start moving (if MOVE event is implemented)

**Console Commands:**
```javascript
// Check pending events
S.pendingEvents[0 * 8]  // Should be 100
S.pendingEvents[0 * 8 + 1]  // Should be -1
```

---

## Test 4: Buff System

**Steps:**
1. Find entity 0's base stats
2. Apply buff via console
3. Check effective stats
4. Remove buff
5. Check stats return to normal

**Console Commands:**
```javascript
// Check base stats
S.damage[0]  // Should be ~10 (8-12 with variance)
S.effectiveDamage[0]  // Should match base

// Apply buff
Buffs.applyBuff(0, {
  id: 999,
  name: "Test Buff",
  source: "custom",
  sourceId: 1,
  stats: { damage: 100 }
});

// Check effective stats
S.effectiveDamage[0]  // Should be base + 100

// Remove buff
Buffs.removeBuff(0, 999);

// Check stats reverted
S.effectiveDamage[0]  // Should be back to base
```

**Expected:**
- ✅ Base stats have variance (8-12 damage)
- ✅ Buff applies immediately
- ✅ Effective stats update
- ✅ Stats revert on buff removal

---

## Test 5: Game Time

**Steps:**
1. Start simulation
2. Note start time
3. Wait 1 minute real-time
4. Check game time display

**Expected:**
- ✅ Top bar shows: `Day X, Month Y, Year Z`
- ✅ After 1 minute: Day increases by 1
- ✅ After 30 days: Month increases
- ✅ After 12 months: Year increases

**Console Commands:**
```javascript
// Check game time
S.gameDay    // Current day
S.gameMonth  // Current month
S.gameYear   // Current year
S.tickCount  // Total ticks
```

---

## Test 6: Slow Update Cycle (Group Visits)

**Steps:**
1. Create group "Homebase"
2. Assign entity 0 to group
3. Note entity position
4. Apply group buff (when implemented)
5. Move entity far from warehouse
6. Move entity near warehouse
7. Check if buffs applied

**Console Commands:**
```javascript
// Get warehouse position
const groupId = S.groupAffiliations[0 * 8];
// Find warehouse building for this group
// Check if entity is within 50 units
```

**Expected:**
- ✅ System checks every 60 ticks (1 second)
- ✅ Buffs apply when near warehouse
- ✅ No performance degradation

---

## Test 7: Performance (50k Entities)

**Steps:**
1. Open performance profiler (F12 → Performance tab)
2. Start simulation
3. Record for 10 seconds
4. Check FPS and frame times

**Expected:**
- ✅ 30+ FPS average
- ✅ Frame time < 33ms
- ✅ No memory leaks
- ✅ Buff system < 1ms per day

**Console Commands:**
```javascript
// Check entity count
let alive = 0;
for (let i = 0; i < C.MAX_ENTITIES; i++) {
  if (S.state[i] !== C.EntityState.Dead) alive++;
}
console.log('Alive entities:', alive);
```

---

## Test 8: Multiple Groups & Slots

**Steps:**
1. Create 3 groups: "Nation", "Clan", "Guild"
2. Assign entity 0 to all 3 (different slots)
3. Check affiliations
4. Send conflicting events
5. Verify priority (slot 0 wins)

**Console Commands:**
```javascript
// Assign to multiple groups
Utils.assignCharacterToGroup(0, 4, 0);  // Nation (priority 0)
Utils.assignCharacterToGroup(0, 5, 1);  // Clan (priority 1)
Utils.assignCharacterToGroup(0, 6, 2);  // Guild (priority 2)

// Check affiliations
S.groupAffiliations[0 * 8 + 0]  // Should be 4
S.groupAffiliations[0 * 8 + 1]  // Should be 5
S.groupAffiliations[0 * 8 + 2]  // Should be 6
```

**Expected:**
- ✅ Entity can belong to 8 groups max
- ✅ Slot 0 = highest priority
- ✅ All groups visible in UI

---

## Known Issues to Verify

- [ ] Group names show as "Group X" (not custom names)
- [ ] No way to see character's full group hierarchy in UI
- [ ] No way to delete groups
- [ ] Buff system has no user-defined traits yet

---

## Test Results Template

```markdown
## Test Run: YYYY-MM-DD

| Test | Status | Notes |
|------|--------|-------|
| 1: Group Creation | ✅ / ❌ | |
| 2: Character Assignment | ✅ / ❌ | |
| 3: Event System | ✅ / ❌ | |
| 4: Buff System | ✅ / ❌ | |
| 5: Game Time | ✅ / ❌ | |
| 6: Slow Update | ✅ / ❌ | |
| 7: Performance | ✅ / ❌ | FPS: __ |
| 8: Multiple Groups | ✅ / ❌ | |

**Issues Found:**
- 

**Pass Rate:** X/8
```

---

*Ready for testing!*
