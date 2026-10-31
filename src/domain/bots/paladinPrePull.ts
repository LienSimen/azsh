// PURE: turn a party roster into the Blessing and Aura chips each body carries into a pull.
// The decision lives in rotation/paladinBuffs.ts (ported from PlayerbotPaladinAI); this file is
// only the seating — who is in whose subgroup, and which pet rides which owner.

import type { DataStore } from '../../data/dataStore.ts';
import type { ActiveAura } from '../character/character.ts';
import { CLASS } from '../../data/schema/constants.ts';
import type { Rotation } from '../rotation/rotation.ts';
import type { RotationRule } from '../rotation/types.ts';
import {
  blessingFamilyOf,
  paladinAuraOf,
  type PaladinAssignments,
  planPaladinAuras,
  planPaladinBlessings,
  type BlessingTarget,
  type PaladinAura,
  type PaladinProvider,
  type PlannedBlessing,
  type PlannedReagent,
} from '../rotation/paladinBuffs.ts';

/** One seated body: the player or a companion, with its pet. */
export interface PaladinPartyMember {
  /** 'player' or the companion id — the caster identity for per-caster stacking. */
  key: string;
  name: string;
  cls: number;
  level: number;
  known: readonly number[];
  role?: 'tank' | 'healer' | 'dps';
  /** Playerbot spec name, when resolved. Decides a paladin's own aura (CheckAuras). */
  spec?: string | null;
  /** Talent id → spent rank. Auto sort gives an improved Blessing to the paladin that took it. */
  talents?: Readonly<Record<number, number>>;
  /** Raid subgroup index. Auras radiate to the holder's subgroup only. */
  subgroup?: number;
  pet?: { key: string; usesMana: boolean };
  /** How many of `item` this body carries — the Greater Blessing reagent. Absent ⇒ unlimited. */
  reagentCount?: (item: number) => number;
}

export interface PaladinPartyBuffs {
  /** Body key → the aura chips that body carries. Empty when the party has no paladin. */
  byKey: Map<string, ActiveAura[]>;
  blessings: PlannedBlessing[];
  auras: { from: string; spellId: number; aura: PaladinAura }[];
  /** Symbols of Kings the Greater Blessings in this plan cost, per paladin. */
  reagents: PlannedReagent[];
}

const EMPTY: PaladinPartyBuffs = { byKey: new Map(), blessings: [], auras: [], reagents: [] };

/** The roster split into who can bless and what gets blessed. The plan and the board's Auto sort
 *  read the same one, so they cannot disagree about levels, spellbooks, talents or reagents. */
export function paladinPartySeating(members: readonly PaladinPartyMember[]): {
  providers: PaladinProvider[];
  targets: BlessingTarget[];
} {
  const providers: PaladinProvider[] = members
    .filter((m) => m.cls === CLASS.PALADIN)
    .map((m) => ({
      key: m.key,
      name: m.name,
      level: m.level,
      known: m.known,
      ...(m.spec != null ? { spec: m.spec } : {}),
      ...(m.role ? { role: m.role } : {}),
      ...(m.talents ? { talents: m.talents } : {}),
      ...(m.reagentCount ? { reagentCount: m.reagentCount } : {}),
    }));
  const targets: BlessingTarget[] = [];
  for (const m of members) {
    targets.push({ key: m.key, cls: m.cls, ...(m.role ? { role: m.role } : {}) });
    if (m.pet) targets.push({ key: m.pet.key, cls: 0, isPet: true, usesMana: m.pet.usesMana });
  }
  return { providers, targets };
}

/**
 * Every Blessing and Aura the party's paladins hand out, as ready-to-carry aura chips.
 *
 * Blessings reach anyone (single-target, and a Greater fans by class raid-wide), so subgroup does
 * not gate them. An Aura is SPELL_EFFECT_APPLY_AREA_AURA_PARTY and reaches the holder's subgroup
 * only. Cite: applySpell.ts:1824; healTargets.ts:100 TARGET_UNIT_RAID_AND_CLASS.
 */
export function planPartyPaladinBuffs(
  members: readonly PaladinPartyMember[],
  ds: DataStore,
  now: number,
  /** The operator's PallyPower board. An absent cell is auto. */
  assignments?: PaladinAssignments,
): PaladinPartyBuffs {
  const { providers, targets } = paladinPartySeating(members);
  if (!providers.length) return EMPTY;

  const board = assignments ? { assignments } : {};
  const { blessings, reagents } = planPaladinBlessings(providers, targets, ds, board);
  const auras = planPaladinAuras(providers, ds, {
    tankInGroup: members.some((m) => m.role === 'tank'),
    ...board,
  });

  const byKey = new Map<string, ActiveAura[]>();
  // A body's OWN cast carries no caster key: that is what every other self keep-up on the sheet
  // records, and stamping one here would let a paladin hold two of its own Blessings.
  const push = (key: string, from: string, row: Omit<ActiveAura, 'fromCaster'>): void => {
    const full: ActiveAura = from === key ? { ...row } : { ...row, fromCaster: from };
    const list = byKey.get(key);
    if (list) list.push(full);
    else byKey.set(key, [full]);
  };
  for (const b of blessings) {
    push(b.on, b.from, {
      spellId: b.spellId,
      ...(b.durationMs > 0 ? { expiresAt: now + b.durationMs } : {}),
    });
  }
  const subgroupOf = new Map(members.map((m) => [m.key, m.subgroup ?? 0]));
  for (const a of auras) {
    const holderGroup = subgroupOf.get(a.from) ?? 0;
    for (const m of members) {
      if ((m.subgroup ?? 0) !== holderGroup) continue;
      push(m.key, a.from, { spellId: a.spellId });
      if (m.pet) push(m.pet.key, a.from, { spellId: a.spellId });
    }
  }
  return { byKey, blessings, auras, reagents };
}

/**
 * Merge planned chips into a body's carried list: a chip from the SAME paladin in the same
 * exclusive group replaces its own, a chip from a different one is added beside it.
 */
export function mergePaladinChips(
  carried: readonly ActiveAura[] | undefined,
  add: readonly ActiveAura[] | undefined,
  ds: DataStore,
): ActiveAura[] {
  if (!add?.length) return carried ? [...carried] : [];
  const groupOf = (id: number): number | null => {
    const sp = ds.spell(id);
    const g = sp?.exclusionGroup ?? sp?.spellGroupId ?? 0;
    return g > 0 ? g : null;
  };
  const out = (carried ?? []).filter((a) => {
    const g = groupOf(a.spellId);
    if (g == null) return true;
    return !add.some((n) => groupOf(n.spellId) === g && (n.fromCaster ?? null) === (a.fromCaster ?? null));
  });
  return [...out, ...add.map((a) => ({ ...a }))];
}

/**
 * Author one paladin's buffs phase from the PARTY plan: its assigned aura, a self rule for the
 * family it keeps on itself, and one `{ allyMissingAura }` rule per (family, board COLUMN).
 *
 * The board WINS over a hand-edited list (operator ruling): only blessing and aura rows are
 * rewritten. A class-BLIND ally rule was the spam — the Might row took the mage the board had put
 * on Wisdom, and the two traded that body every GCD (group 7 is unique-per-caster).
 */
export function restampPaladinRotation(
  rot: Rotation,
  plan: PaladinPartyBuffs,
  providerKey: string,
  ds: DataStore,
): Rotation {
  const aura = plan.auras.find((a) => a.from === providerKey);
  const mine = plan.blessings.filter((b) => b.from === providerKey);
  if (!aura && !mine.length) return rot;

  // One entry per family: the spell, whether it lands on this paladin, and the board columns it
  // is handed to. A column is a target class id, or 'pet'.
  const fams = new Map<string, { spellId: number; onSelf: boolean; cols: Set<string> }>();
  for (const b of mine) {
    const cur = fams.get(b.family) ?? { spellId: b.spellId, onSelf: false, cols: new Set<string>() };
    cur.spellId = b.spellId;
    if (b.on === providerKey) cur.onSelf = true;
    else cur.cols.add(b.col);
    fams.set(b.family, cur);
  }

  const selfRule = (id: string, spellId: number): RotationRule => ({
    id,
    action: { kind: 'spell', spellId },
    conditions: [{ subject: 'self', metric: 'buffPresent', op: '==', value: 0, ref: spellId }],
    enabled: true,
  });
  // No condition: the row is unusable while nobody in `among` is missing it, and it aims at the
  // body that gate read. A pet has no player class, so the 'pet' column is `classId: 0`.
  const allyRule = (id: string, spellId: number, col: string): RotationRule => ({
    id,
    action: {
      kind: 'spell',
      spellId,
      target: { allyMissingAura: spellId, among: { classId: col === 'pet' ? 0 : Number(col) | 0 } },
    },
    conditions: [],
    enabled: true,
  });

  // Every blessing and aura row goes; what the plan says replaces it. Anything else the band
  // authored (Righteous Fury, a seal, a scroll) is kept exactly where it was.
  const kept = rot.phases.buffs.filter((r) => {
    if (r.action.kind !== 'spell') return true;
    const sp = ds.spell(r.action.spellId);
    return blessingFamilyOf(sp) == null && paladinAuraOf(sp) == null;
  });
  const authored: RotationRule[] = [];
  if (aura) authored.push(selfRule('pally-aura', aura.spellId));
  for (const [family, e] of fams) {
    if (e.onSelf) authored.push(selfRule(`pally-${family}`, e.spellId));
    for (const col of [...e.cols].sort()) {
      authored.push(allyRule(`pally-ally-${family}-${col}`, e.spellId, col));
    }
  }
  const buffs = [...kept, ...authored];
  const same = buffs.length === rot.phases.buffs.length
    && buffs.every((r, i) => {
      const was = rot.phases.buffs[i];
      if (!was || was.action.kind !== 'spell' || r.action.kind !== 'spell') return was === r;
      const wt = was.action.target;
      const rt = r.action.target;
      const aimOf = (t: typeof wt): string => (t && typeof t === 'object' && 'allyMissingAura' in t
        ? `${t.allyMissingAura}|${t.among?.classId ?? ''}` : '');
      return was.action.spellId === r.action.spellId
        && aimOf(wt) === aimOf(rt)
        && (was.conditions[0]?.ref ?? null) === (r.conditions[0]?.ref ?? null);
    });
  return same ? rot : { ...rot, phases: { ...rot.phases, buffs } };
}
