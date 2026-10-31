import type { CreatureAiAction, CreatureAiScript, CreatureDef } from '../../schema.ts';

export function act(type: number, param1 = 0, param2 = 0, param3 = 0): CreatureAiAction {
  return { type, param1, param2, param3 };
}

export function script(row: {
  id: number;
  eventType: number;
  chance?: number;
  flags?: number;
  inversePhaseMask?: number;
  p1?: number;
  p2?: number;
  p3?: number;
  p4?: number;
  actions: CreatureAiAction[];
}): CreatureAiScript {
  const out: CreatureAiScript = {
    id: row.id,
    eventType: row.eventType,
    eventChance: row.chance ?? 100,
    eventFlags: row.flags ?? 0,
    eventParam1: row.p1 ?? 0,
    eventParam2: row.p2 ?? 0,
    eventParam3: row.p3 ?? 0,
    eventParam4: row.p4 ?? 0,
    actions: row.actions,
  };
  if (row.inversePhaseMask != null && row.inversePhaseMask !== 0) {
    out.eventInversePhaseMask = row.inversePhaseMask;
  }
  return out;
}

/** Normalize inverted Min/Max pairs from some Classic template rows (e.g. 8138). */
function band(a: number, b: number): { lo: number; hi: number } {
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

export function templateStub(opts: {
  entry: number;
  name: string;
  level: number;
  hpMin: number;
  hpMax: number;
  dmgMin: number;
  dmgMax: number;
  armor: number;
  attackTimeMs: number;
  creatureType: number;
  factionId: number;
  lootId: number;
  minGold: number;
  maxGold: number;
  mana?: number;
}): CreatureDef {
  const hp = band(opts.hpMin, opts.hpMax);
  const dmg = band(opts.dmgMin, opts.dmgMax);
  const gold = band(opts.minGold, opts.maxGold);
  return {
    entry: opts.entry,
    name: opts.name,
    level: opts.level,
    hpMin: hp.lo,
    hpMax: hp.hi,
    dmgMin: dmg.lo,
    dmgMax: dmg.hi,
    attackTimeMs: opts.attackTimeMs,
    armor: opts.armor,
    lootId: opts.lootId,
    minGold: gold.lo,
    maxGold: gold.hi,
    xp: 0, // grant path uses Formulas.h Gain — not this field
    creatureType: opts.creatureType,
    factionId: opts.factionId,
    ...(opts.mana != null && opts.mana > 0 ? { mana: opts.mana } : {}),
  };
}
