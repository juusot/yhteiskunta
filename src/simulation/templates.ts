import * as C from './constants';
import * as S from './state';

export function applyGroupTemplate(groupId: number, archetype: number): void {
  // Find empty slot in ruleRegistry
  let ruleIdx = -1;
  for (let i = 0; i < C.MAX_RULES; i++) {
    if (S.ruleRegistry[i * 8 + 7] === 0) {
      ruleIdx = i;
      break;
    }
  }
  if (ruleIdx === -1) return;

  const baseOffset = ruleIdx * C.MAX_BYTECODE_PER_RULE;
  let ptr = 0;

  switch (archetype) {
    case C.ARCHETYPE_NATION:
      S.logicBytecode[baseOffset + ptr++] = C.OP_WEALTH_LT;
      S.logicBytecode[baseOffset + ptr++] = 5000;
      S.logicBytecode[baseOffset + ptr++] = C.OP_TICK_MODULO;
      S.logicBytecode[baseOffset + ptr++] = 3600;
      S.logicBytecode[baseOffset + ptr++] = C.GATE_AND;
      break;
    case C.ARCHETYPE_ARMY:
      S.logicBytecode[baseOffset + ptr++] = C.OP_COHESION_LT;
      S.logicBytecode[baseOffset + ptr++] = 50;
      S.logicBytecode[baseOffset + ptr++] = C.OP_TICK_MODULO;
      S.logicBytecode[baseOffset + ptr++] = 600;
      S.logicBytecode[baseOffset + ptr++] = C.GATE_AND;
      break;
    case C.ARCHETYPE_SPY:
      S.logicBytecode[baseOffset + ptr++] = C.OP_TICK_MODULO;
      S.logicBytecode[baseOffset + ptr++] = 3600;
      S.logicBytecode[baseOffset + ptr++] = C.OP_RANDOM_CHANCE;
      S.logicBytecode[baseOffset + ptr++] = 30;
      S.logicBytecode[baseOffset + ptr++] = C.GATE_AND;
      break;
    case C.ARCHETYPE_CULT:
      S.logicBytecode[baseOffset + ptr++] = C.OP_POP_GT;
      S.logicBytecode[baseOffset + ptr++] = 10;
      S.logicBytecode[baseOffset + ptr++] = C.OP_WEALTH_LT;
      S.logicBytecode[baseOffset + ptr++] = 1000;
      S.logicBytecode[baseOffset + ptr++] = C.GATE_AND;
      break;
    default:
      return;
  }

  while (ptr < C.MAX_BYTECODE_PER_RULE) {
    S.logicBytecode[baseOffset + ptr++] = C.OP_END;
  }

  const baseIdx = ruleIdx * 8;
  S.ruleRegistry[baseIdx + 0] = 0;
  S.ruleRegistry[baseIdx + 1] = groupId;
  S.ruleRegistry[baseIdx + 2] = 255;
  S.ruleRegistry[baseIdx + 3] = 0;
  
  if (archetype === C.ARCHETYPE_NATION) S.ruleRegistry[baseIdx + 4] = C.EntityState.Trading;
  else if (archetype === C.ARCHETYPE_ARMY) S.ruleRegistry[baseIdx + 4] = C.EntityState.Combat;
  else if (archetype === C.ARCHETYPE_SPY) S.ruleRegistry[baseIdx + 4] = C.EntityState.Sabotaging;
  else if (archetype === C.ARCHETYPE_CULT) S.ruleRegistry[baseIdx + 4] = C.EntityState.Fleeing;
  
  S.ruleRegistry[baseIdx + 5] = 0;
  S.ruleRegistry[baseIdx + 6] = 0;
  S.ruleRegistry[baseIdx + 7] = 1;
}
