// src/simulation/buffs.ts
import * as C from "./constants";
import * as S from "./state";

/**
 * Buff interface - open-ended system for stat modifications
 * Can come from: items, groups, regions, events, custom sources
 */
export interface Buff {
  id: number;
  name: string;
  source: "item" | "group" | "region" | "event" | "custom";
  sourceId: number; // itemId, groupId, etc.
  stats: {
    lifespan?: number; // Years (+ or -)
    damage?: number; // Damage (+ or -)
    speed?: number; // Movement multiplier (0.5 = half speed, 2.0 = double)
    health?: number; // HP (+ or -)
    wealth?: number; // Money (+ or -)
  };
  expiresAt?: number; // Optional game day when buff expires
}

/**
 * Active buffs per entity
 * Stored as Map because most entities have no buffs (sparse)
 */
export const activeBuffs: Map<number, Buff[]> = new Map<number, Buff[]>();

/**
 * Buff ID counter for generating unique IDs
 */
let nextBuffId = 1;

/**
 * Generate a unique buff ID
 */
export function generateBuffId(): number {
  return nextBuffId++;
}

/**
 * Recalculate effective stats for an entity
 * Updates the effective stat arrays
 */
export function recalculateEffectiveStats(entityId: number): void {
  const baseLifespan = S.lifespan[entityId] || 80;
  const baseDamage = S.damage[entityId] || 10;
  const baseSpeed = S.speed[entityId] || 1.0;

  const buffs = activeBuffs.get(entityId);
  if (!buffs || buffs.length === 0) {
    // No buffs, effective = base
    S.effectiveLifespan[entityId] = baseLifespan;
    S.effectiveDamage[entityId] = baseDamage;
    S.effectiveSpeed[entityId] = baseSpeed;
    return;
  }

  let lifespanMod = 0;
  let damageMod = 0;
  let speedMod = 1.0;

  for (const buff of buffs) {
    if (buff.stats.lifespan !== undefined) lifespanMod += buff.stats.lifespan;
    if (buff.stats.damage !== undefined) damageMod += buff.stats.damage;
    if (buff.stats.speed !== undefined) speedMod *= buff.stats.speed;
  }

  S.effectiveLifespan[entityId] = baseLifespan + lifespanMod;
  S.effectiveDamage[entityId] = baseDamage + damageMod;
  S.effectiveSpeed[entityId] = baseSpeed * speedMod;

  ApplyEquipmentModifiers(entityId);
}

export function ApplyEquipmentModifiers(i: number): void {
  // Check if we should override effective stats from equipment
  // We apply on top of buffs, or reset to base if we want equipment to be the only thing?
  // The prompt says "Reset effective stats to base stats" but let's just do it directly.

  // Base stats (could include buffs if we wanted, but let's follow the prompt exactly)
  S.effectiveDamage[i] = S.damage[i];
  S.effectiveSpeed[i] = S.speed[i];
  S.effectiveLifespan[i] = S.lifespan[i];

  if (S.charWeapon[i] !== -1) {
    const defId = S.itemInstanceDefId[S.charWeapon[i]];
    S.effectiveDamage[i] += S.itemDefStatA[defId];
    if ((S.itemDefTraitMask[defId] & C.ITEM_TRAIT_CURSED) !== 0) {
      S.effectiveLifespan[i] = Math.floor(S.effectiveLifespan[i] * 0.5);
    }
  }
}

/**
 * Apply a buff to an entity
 */
export function applyBuff(entityId: number, buff: Buff): void {
  if (!activeBuffs.has(entityId)) {
    activeBuffs.set(entityId, []);
  }
  const buffs = activeBuffs.get(entityId)!;

  // Check if buff with same source already exists (replace it)
  const existingIdx = buffs.findIndex(
    (b) => b.source === buff.source && b.sourceId === buff.sourceId,
  );

  if (existingIdx !== -1) {
    buffs[existingIdx] = buff;
  } else {
    buffs.push(buff);
  }

  // Recalculate effective stats
  recalculateEffectiveStats(entityId);
}

/**
 * Remove a buff from an entity by ID
 */
export function removeBuff(entityId: number, buffId: number): boolean {
  const buffs = activeBuffs.get(entityId);
  if (!buffs) return false;

  const idx = buffs.findIndex((b) => b.id === buffId);
  if (idx === -1) return false;

  buffs.splice(idx, 1);

  // Clean up empty array
  if (buffs.length === 0) {
    activeBuffs.delete(entityId);
  }

  // Recalculate effective stats
  recalculateEffectiveStats(entityId);

  return true;
}

/**
 * Remove all buffs from a source (e.g., when leaving a group)
 */
export function removeBuffsBySource(
  entityId: number,
  source: string,
  sourceId: number,
): boolean {
  const buffs = activeBuffs.get(entityId);
  if (!buffs) return false;

  const beforeLength = buffs.length;
  const filtered = buffs.filter(
    (b) => !(b.source === source && b.sourceId === sourceId),
  );

  if (filtered.length === 0) {
    activeBuffs.delete(entityId);
  } else {
    activeBuffs.set(entityId, filtered);
  }

  // Recalculate effective stats
  recalculateEffectiveStats(entityId);

  return filtered.length < beforeLength;
}

/**
 * Clear expired buffs for an entity
 */
export function clearExpiredBuffs(entityId: number): number {
  const buffs = activeBuffs.get(entityId);
  if (!buffs) return 0;

  const currentDay =
    S.gameYear * C.DAYS_PER_MONTH + S.gameMonth * C.DAYS_PER_MONTH + S.gameDay;
  const beforeLength = buffs.length;

  const filtered = buffs.filter((b) => {
    if (b.expiresAt === undefined) return true;
    return currentDay < b.expiresAt;
  });

  if (filtered.length === 0) {
    activeBuffs.delete(entityId);
  } else {
    activeBuffs.set(entityId, filtered);
  }

  // Recalculate effective stats if buffs were cleared
  if (beforeLength !== filtered.length) {
    recalculateEffectiveStats(entityId);
  }

  return beforeLength - filtered.length;
}

/**
 * Get effective stats for an entity (base + all buffs)
 *
 * PERFORMANCE NOTE: This is the "slow path" - uses Map lookups and iteration.
 * Call only when needed (on stat check, item equip, group visit, etc.), NOT every tick.
 *
 * If profiling shows this is a bottleneck, optimize by:
 * - Caching effective stats in arrays (effectiveLifespan[], effectiveDamage[], etc.)
 * - Updating cache only when buffs change (dirty flag pattern)
 * - Trade-off: +4 arrays × 100k entities = ~1.2 MB extra memory
 */
export function getEffectiveStats(entityId: number): {
  lifespan: number;
  damage: number;
  speed: number;
  health: number;
  wealth: number;
} {
  const baseLifespan = S.lifespan[entityId] || 80;
  const baseDamage = S.damage[entityId] || 10;
  const baseSpeed = S.speed[entityId] || 1.0;
  const baseHealth = S.health[entityId] || 100;
  const baseWealth = S.money[entityId] || 0;

  const buffs = activeBuffs.get(entityId);
  if (!buffs || buffs.length === 0) {
    return {
      lifespan: baseLifespan,
      damage: baseDamage,
      speed: baseSpeed,
      health: baseHealth,
      wealth: baseWealth,
    };
  }

  let lifespanMod = 0;
  let damageMod = 0;
  let speedMod = 1.0; // Multiplier starts at 1.0
  let healthMod = 0;
  let wealthMod = 0;

  for (const buff of buffs) {
    if (buff.stats.lifespan !== undefined) lifespanMod += buff.stats.lifespan;
    if (buff.stats.damage !== undefined) damageMod += buff.stats.damage;
    if (buff.stats.speed !== undefined) speedMod *= buff.stats.speed;
    if (buff.stats.health !== undefined) healthMod += buff.stats.health;
    if (buff.stats.wealth !== undefined) wealthMod += buff.stats.wealth;
  }

  return {
    lifespan: baseLifespan + lifespanMod,
    damage: baseDamage + damageMod,
    speed: baseSpeed * speedMod,
    health: baseHealth + healthMod,
    wealth: baseWealth + wealthMod,
  };
}

/**
 * Clear all expired buffs across all entities
 * Call once per game day
 */
export function clearAllExpiredBuffs(): number {
  let totalCleared = 0;
  const toDelete: number[] = [];

  for (const [entityId, buffs] of activeBuffs.entries()) {
    const cleared = clearExpiredBuffs(entityId);
    totalCleared += cleared;
    if (buffs.length === 0) {
      toDelete.push(entityId);
    }
  }

  return totalCleared;
}

/**
 * Apply group buffs to a character
 * Called when character visits group building or on slow update cycle
 *
 * Currently groups don't have predefined buffs, but this sets up the system
 * for when users can define group traits (e.g., "Warrior Clan: +10 damage")
 */
export function applyGroupBuffs(entityId: number): void {
  // Remove all existing group buffs first
  const buffs = activeBuffs.get(entityId);
  if (buffs) {
    const filtered = buffs.filter((b) => b.source !== "group");
    if (filtered.length === 0) {
      activeBuffs.delete(entityId);
    } else {
      activeBuffs.set(entityId, filtered);
    }
  }

  // Apply buffs from all groups character belongs to
  const baseIdx = entityId * C.GROUP_SLOTS_PER_CHARACTER;
  for (let slot = 0; slot < C.GROUP_SLOTS_PER_CHARACTER; slot++) {
    const groupId = S.groupAffiliations[baseIdx + slot];
    if (groupId === -1 || groupId >= C.MAX_GROUPS) continue;

    // TODO: Get group-defined buffs from group configuration
    // Example future implementation:
    // const groupBuffs = getGroupBuffs(groupId);
    // groupBuffs.forEach(buff => applyBuff(entityId, buff));

    // For now, just mark that group buffs were applied
    // This is a placeholder for when users can define group traits
  }

  // Recalculate effective stats
  recalculateEffectiveStats(entityId);
}

/**
 * Check if character is near their group's building
 * Called periodically to trigger group buff application
 * @returns true if character visited a group building
 */
export function checkGroupVisit(entityId: number): boolean {
  const baseIdx = entityId * C.GROUP_SLOTS_PER_CHARACTER;
  const charX = S.positionX[entityId];
  const charY = S.positionY[entityId];

  for (let slot = 0; slot < C.GROUP_SLOTS_PER_CHARACTER; slot++) {
    const groupId = S.groupAffiliations[baseIdx + slot];
    if (groupId === -1 || groupId >= C.MAX_GROUPS) continue;

    // Check if near any building owned by this group
    for (let b = 0; b < C.MAX_BUILDINGS; b++) {
      if (S.bldType[b] === 0 || S.bldOwnerGroup[b] !== groupId) continue;

      const dx = charX - S.bldPositionX[b];
      const dy = charY - S.bldPositionY[b];
      const distSq = dx * dx + dy * dy;

      // Within 50 units = "visited" the building
      if (distSq < 2500) {
        applyGroupBuffs(entityId);
        return true;
      }
    }
  }

  return false;
}
