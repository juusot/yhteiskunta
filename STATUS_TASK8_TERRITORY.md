# Task 8: Territory & Influence System - Status Note

**Date:** 2026-05-16  
**Status:** ⚠️ INCOMPLETE - Visual Issues Unresolved  

---

## What Was Implemented ✅

### Core Mechanics (Working)
- [x] Influence radius constants per building type (Warehouse=200, House=80, Tower=150)
- [x] Building-based influence projection (circular areas)
- [x] Border overlap detection with diplomatic tension (-5 relations/day)
- [x] Building restrictions (can only build within group influence)
- [x] Field construction logic with wood cost (200 wood)
- [x] `isInGroupInfluence()` utility function

### Files Modified
- `src/simulation/constants.ts` - Added influence radius constants
- `src/simulation/systems/master.ts` - Rewrote InfluenceSystem()
- `src/simulation/systems/parallel.ts` - Added Field building logic
- `src/simulation/utils.ts` - Added isInGroupInfluence() function
- `src/main.tsx` - Updated influence shader (alpha), reduced warehouse size
- `tasks/important-02-territory.md` - Task documentation

---

## Unresolved Issues ❌

### 1. Territory Borders Still Too Vivid
**Problem:** Even with alpha set to 0.08, borders appear too strong/visible.

**Attempts Made:**
- Changed shader alpha from 0.3 → 0.15 → 0.08
- Changed influence calculation from additive to distance-based falloff
- Used `Math.max()` instead of accumulation

**Possible Causes (Not Yet Investigated):**
- Browser/Tauri caching old shader code
- Multiple render passes stacking on top of each other
- WebGL blending mode not configured correctly
- Influence strength values still too high (1000 max)

**Next Steps:**
```javascript
// Debug: Check actual influence values in console
console.log('Max influence:', Math.max(...S.influenceMap));
console.log('Influence buffer sample:', infStrengthBuffer.slice(0, 10));

// Try: Disable WebGL blending
gl.disable(gl.BLEND); // Before rendering influence

// Try: Even lower alpha (0.02-0.04)
outColor = vec4(color, v_strength * 0.02);

// Try: Clear buffer before rendering influence
gl.clear(gl.COLOR_BUFFER_BIT);
```

### 2. Warehouse "Giant Square" Problem
**Problem:** Warehouses render as large squares, sometimes appearing for wrong nations (Red/Blue).

**Attempts Made:**
- Reduced warehouse size from 24.0 → 16.0 in shader
- Checked initialization code (spawns at correct positions)

**Possible Causes:**
- Building buffer not properly initialized (rendering garbage data)
- MAX_BUILDINGS loop rendering uninitialized buildings
- Building type/group assignments wrong for indices 0-3
- Buffer data not matching simulation state

**Debug Steps:**
```javascript
// Check building buffer in main.tsx render loop
console.log('Building 0:', bldType[0], bldOwnerGroup[0], bldHealth[0]);
console.log('Building 1:', bldType[1], bldOwnerGroup[1], bldHealth[1]);

// Check how many buildings are actually rendered
let renderCount = 0;
for (let i = 0; i < MAX_BUILDINGS; i++) {
  if (bldType[i] !== 0 && bldHealth[i] > 0) renderCount++;
}
console.log('Buildings rendered:', renderCount);

// Verify warehouse positions
console.log('Warehouse 0 pos:', bldPositionX[0], bldPositionY[0]);
console.log('Group 0 warehouse:', groupWarehouseX[0], groupWarehouseY[0]);
```

### 3. SharedArrayBuffer Error in Tauri
**Problem:** Tauri shows "SharedArrayBuffer is not supported" error.

**Status:** vite.config.ts has correct headers, but Tauri may need additional configuration.

**Workaround:** Use browser at `http://localhost:1420` instead of Tauri window.

---

## Test Plan for Next Session

### 1. Debug Influence Values
```javascript
// In browser console, after game starts:
// Check influence map values
const maxInf = Math.max(...window.S.influenceMap);
const avgInf = window.S.influenceMap.reduce((a,b) => a+b, 0) / window.S.influenceMap.length;
console.log(`Influence - Max: ${maxInf}, Avg: ${avgInf}`);

// Check influence buffer sent to shader
// (Need to expose infStrengthBuffer globally or add debug logging)
```

### 2. Debug Building Rendering
```javascript
// Check which buildings exist
for (let i = 0; i < 100; i++) {
  if (S.bldType[i] !== 0) {
    console.log(`Bld ${i}: Type=${S.bldType[i]}, Group=${S.bldOwnerGroup[i]}, Pos=(${S.bldPositionX[i]}, ${S.bldPositionY[i]})`);
  }
}
```

### 3. Test WebGL Blending
Add to main.tsx before influence rendering:
```typescript
gl.disable(gl.BLEND);
// ... render influence ...
gl.enable(gl.BLEND);
```

### 4. Verify Shader Compilation
Add console logging after shader compilation:
```typescript
console.log('Influence shader compiled:', infProg);
// Check if shader errors exist
```

---

## Priority Order

1. **Fix warehouse rendering** - Easiest, likely a buffer initialization issue
2. **Fix influence opacity** - May require WebGL blending changes
3. **Test border tension mechanic** - Verify relations decrease on overlap
4. **Performance test** - Ensure influence calculation is < 5ms

---

## Key Code Locations

### Influence Shader (src/main.tsx line ~200)
```glsl
const INF_FS = `... outColor = vec4(color, v_strength * 0.08); }`;
```

### Influence System (src/simulation/systems/master.ts line ~360)
```typescript
export function InfluenceSystem(): void {
  // Runs every 60 ticks
  // Projects circular influence with distance falloff
}
```

### Building Render Size (src/main.tsx line ~180)
```glsl
float size = (i_type == 1.0) ? 16.0 : 10.0;
```

---

## Notes for Continuation

- Browser hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`
- Kill dev server: `pkill -f vite` then `npm run tauri dev`
- Test in browser first (avoid Tauri SharedArrayBuffer issue)
- Influence values should be 0-1000, shader divides by 1000 for 0.0-1.0 range
- Warehouse type = 1, House type = 2, Field type = 3, Tower type = 4, Wall type = 5

---

**Last Updated:** 2026-05-16  
**Next Session:** Debug WebGL rendering, fix opacity and warehouse size issues
