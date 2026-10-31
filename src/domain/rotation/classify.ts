// PURE: no DOM/RNG/Date. Pure spell classifiers and keep-up / gate helpers for rotations.

import { CREATURE_TYPE, SHAPESHIFT_FORM, type SpellDef } from '../../data/schema.ts';
import {
  isHunterAspectSpell,
  spellExclusionGroup,
} from '../character/character.ts';
import { inferRole } from '../../engine/combat.ts';
import { auraHolderIsCastTarget, auraRadiatesToParty } from '../../engine/combat/healTargets.ts';
import { normalizeSpellName } from './rotationSuggestions.ts';
import {
  formIdFromLabel,
  isWeaponImbueSpellLabel,
} from '../run/whenMap.ts';
import { formIdFromSpell, isFormSpell } from '../character/forms.ts';
import { IN_MELEE_YD } from './stand.ts';
import {
  auraStackIdentity,
  stackIdentitiesExclude,
  type AuraStackIdentity,
} from '../../engine/spells/auraStacking.ts';
import type {
  CondMetric,
  CondOp,
  CondSubject,
  Condition,
  Rotation,
  RotationRule,
} from './types.ts';
import { DEFAULT_THRESHOLDS, allyFilterIsAny } from './types.ts';

/** Prefer effect-sourced form id; fall back to spell name (Wave 1A labels). */
export function formIdForRotationSpell(spell: SpellDef): number {
  return (formIdFromSpell(spell) | 0) || (formIdFromLabel(spell.name) ?? 0);
}

export const cond = (subject: CondSubject, metric: CondMetric, op: CondOp, value: number, ref?: number): Condition =>
  ({ subject, metric, op, value, ...(ref != null ? { ref } : {}) });

// Pure HoT (Renew, Rejuvenation): restore_health only, with no direct heal rider. It must always
// gate on the buff missing or defaults thrash every GCD into OOM. Regrowth is a main heal.
export function isPureHotSpell(spell: {
  effects?: ReadonlyArray<{ kind: string }> | null;
}): boolean {
  const effects = spell.effects ?? [];
  const hasHot = effects.some((e) => e.kind === 'restore_health');
  if (!hasHot) return false;
  const hasDirect = effects.some(
    (e) => e.kind === 'heal' || e.kind === 'holy_shock' || e.kind === 'heal_max_health',
  );
  return !hasDirect;
}

/** Default conditions for a pure HoT: low health + not already ticking on self (solo / self-heal). */
export function pureHotSelfConditions(spellId: number): Condition[] {
  return [
    cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.healLowPct),
    cond('self', 'buffPresent', '==', 0, spellId),
  ];
}

// Seal kind priority for the active tree. Retribution: Command (talent seal) > Righteousness > Light >
// Wisdom. Holy / Protection: never prefer Ret's Seal of Command as the default — SoR/Light/Wisdom first.
export function sealKindPriority(spec: string | null | undefined): Record<string, number> {
  if (spec === 'Holy' || spec === 'Protection') {
    return { righteousness: 3, light: 2, wisdom: 1, command: 0 };
  }
  // Retribution (and unknown/default): talent seal first.
  return { command: 3, righteousness: 2, light: 1, wisdom: 0 };
}

/** CMaNGOS spell_group Id 5 — all paladin seals (UNIQUE_PER_CASTER). */
export const PALADIN_SEAL_EXCLUSION_GROUP = 5;

export function sealKindOf(sp: SpellDef): string {
  const e = sp.effects.find((x) => x.kind === 'seal');
  return e && e.kind === 'seal' ? e.seal : '';
}

export function isSealSpell(sp: SpellDef): boolean {
  if ((sp.role ?? inferRole(sp)) === 'seal' || sp.effects.some((e) => e.kind === 'seal')) return true;
  // Bake residual: many seals ship as empty/proc_trigger without role:'seal' (KI-001).
  if (spellExclusionGroup(sp) === PALADIN_SEAL_EXCLUSION_GROUP) return true;
  return /^Seal of /i.test(sp.name ?? '');
}

export function isJudgementSpell(sp: SpellDef): boolean {
  return (sp.role ?? inferRole(sp)) === 'judgement' || sp.effects.some((e) => e.kind === 'judgement');
}

// True weapon-imbue APPLY spells. A rogue poison CONJURE makes a bag item and must not use
// weaponImbuePresent — a conjure never fills the temp slot (KI-369 / KI-388).
export function isTrueWeaponImbueSpell(sp: SpellDef): boolean {
  if (sp.effects.some((e) => e.kind === 'conjure')) return false;
  if (sp.effects.some((e) => e.kind === 'weapon_imbue')) return true;
  return isWeaponImbueSpellLabel(sp.name);
}

/** Rogue create-poison spells (Instant/Deadly/… vials) — exclusive preferred-family keep-up. */
export function isPoisonConjureSpell(sp: SpellDef): boolean {
  if (!sp.effects.some((e) => e.kind === 'conjure')) return false;
  return /\b(instant|deadly|crippling|mind-numbing|wound)\s+poison\b/i.test(sp.name ?? '');
}

// Classic mage armors are mutually exclusive (spell_group Id 13). Prefer baked exclusionGroup /
// spellGroupId; name set is last-resort for fixtures without flags. Wave 2-MAGE / Wave J.
const MAGE_ARMOR_NAMES = new Set(['frost armor', 'ice armor', 'mage armor']);
const MAGE_ARMOR_EXCLUSION_GROUP = 13;

export function isMageArmorSpell(spell: {
  name?: string;
  exclusionGroup?: number;
  spellGroupId?: number;
} | null | undefined): boolean {
  if (!spell) return false;
  if (spell.exclusionGroup === MAGE_ARMOR_EXCLUSION_GROUP || spell.spellGroupId === MAGE_ARMOR_EXCLUSION_GROUP) {
    return true;
  }
  return MAGE_ARMOR_NAMES.has(normalizeSpellName(spell.name ?? ''));
}

export function isCreateHealthstoneSpell(sp: { name?: string } | null | undefined): boolean {
  return /^Create Healthstone\b/i.test(sp?.name ?? '');
}

// Mutual-exclusion family for keep-up thrash collapse, keyed semantically so ranks missing
// exclusionGroup still collapse with siblings that have it. First rule in list order wins.
/** The Blessings a paladin keeps up, as opposed to the group-7 panic cooldowns. */
const UPKEEP_BLESSING_NAME =
  /^(Greater )?Blessing of (Might|Wisdom|Kings|Sanctuary|Salvation|Light)$/i;

export function exclusiveKeepupFamily(sp: SpellDef): string | null {
  const g = spellExclusionGroup(sp);
  // Classic exclusive families — name + group so residual bake gaps share one key.
  if (isHunterAspectSpell(sp) || g === 10) return 'hunter-aspect';
  if (isMageArmorSpell(sp) || g === 13) return 'mage-armor';
  if (isSealSpell(sp) || g === PALADIN_SEAL_EXCLUSION_GROUP) return 'paladin-seal';
  // Paladin UPKEEP blessings — spell_group 7, one on a body per paladin, so a second self row only
  // replaces the first. Protection / Freedom / Sacrifice share the group but are panic cooldowns,
  // not keep-ups, and collapsing them would delete the tool. Cite: Unit.cpp:4973 personal;
  // PlayerbotPaladinAI.cpp:643-716 the four families it picks between.
  if (UPKEEP_BLESSING_NAME.test(sp.name ?? '')) return 'paladin-blessing';
  // Paladin auras (Devotion / Retribution / Concentration / …) — spell_group 8.
  if (g === 8 || (/\bAura\b/.test(sp.name ?? '') && !/Prayer of/i.test(sp.name ?? ''))) {
    // Narrow aura name match to paladin-style "* Aura" only when group missing.
    if (g === 8 || /^(Devotion|Retribution|Concentration|Shadow Resistance|Frost Resistance|Fire Resistance|Sanctity)\s+Aura$/i.test(sp.name ?? '')) {
      return 'paladin-aura';
    }
  }
  // Hunter stings (spell_group 9); Wyvern is a CC, not the one-sting family.
  if ((g === 9 || (/\bSting\b/i.test(sp.name ?? '') && !/Wyvern/i.test(sp.name ?? '')))) {
    return 'hunter-sting';
  }
  // Warlock curses (spell_group 12) — only one curse per target.
  if (g === 12 || /^Curse of /i.test(sp.name ?? '')) return 'warlock-curse';
  // Hunter traps: Freezing/Immolation/Frost/Explosive — one laid trap at a time.
  if (/\bTrap\b/i.test(sp.name ?? '') && !/Detector|Disarm/i.test(sp.name ?? '')) {
    return 'hunter-trap';
  }
  // One demon pet — packs list Imp+VW+Felhunter+Succubus all alive==0 otherwise thrash.
  if ((sp.role ?? '') === 'pet_summon' || /^Summon (Imp|Voidwalker|Succubus|Felhunter|Felguard)\b/i.test(sp.name ?? '')) {
    return 'warlock-pet';
  }
  // One Create *stone rank — packs used to list Minor+Lesser+… all itemCount thrash.
  if (isCreateHealthstoneSpell(sp)) return 'warlock-healthstone';
  if (/^Create Soulstone\b/i.test(sp.name ?? '')) return 'warlock-soulstone';
  if (/^Create Firestone\b/i.test(sp.name ?? '')) return 'warlock-firestone';
  if (/^Create Spellstone\b/i.test(sp.name ?? '')) return 'warlock-spellstone';
  // One Conjure Food / Water rank — leftover ranks each gate a different item.
  if (/^Conjure Food\b/i.test(sp.name ?? '')) return 'mage-conjure-food';
  if (/^Conjure Water\b/i.test(sp.name ?? '')) return 'mage-conjure-water';
  if (isTrueWeaponImbueSpell(sp)) return 'weapon-imbue';
  if (isPoisonConjureSpell(sp)) return 'poison-conjure';
  // Any other baked exclusion group still collapses among itself.
  if (g != null) return `excl:${g}`;
  return null;
}

// The set of numbers one condition admits, as an interval or a single excluded point.
type CondSet =
  | { kind: 'range'; lo: number; loOpen: boolean; hi: number; hiOpen: boolean }
  | { kind: 'not'; value: number };

function condSet(c: Condition): CondSet {
  switch (c.op) {
    case '<': return { kind: 'range', lo: -Infinity, loOpen: true, hi: c.value, hiOpen: true };
    case '<=': return { kind: 'range', lo: -Infinity, loOpen: true, hi: c.value, hiOpen: false };
    case '>': return { kind: 'range', lo: c.value, loOpen: true, hi: Infinity, hiOpen: true };
    case '>=': return { kind: 'range', lo: c.value, loOpen: false, hi: Infinity, hiOpen: true };
    case '==': return { kind: 'range', lo: c.value, loOpen: false, hi: c.value, hiOpen: false };
    default: return { kind: 'not', value: c.value };
  }
}

// `target.inMelee` and `targetDistanceYd` are the same reading — the melee band IS a distance
// (evaluate.ts:344 "Melee band vs the acting unit"; stand.ts IN_MELEE_YD). Without this the hunter
// packs' authored aspect swap (Monkey in melee, Hawk beyond 8 yd) collapsed to one row.
function meleeBandAsDistance(c: Condition): Condition | null {
  if (c.metric !== 'inMelee' || c.subject !== 'target' || c.op !== '==') return null;
  if (c.value === 1) return { subject: 'target', metric: 'targetDistanceYd', op: '<=', value: IN_MELEE_YD };
  if (c.value === 0) return { subject: 'target', metric: 'targetDistanceYd', op: '>', value: IN_MELEE_YD };
  return null;
}

/** Two conditions on the SAME reading that no value satisfies at once. Sound, not complete. */
function conditionsExclude(rawA: Condition, rawB: Condition): boolean {
  const a = meleeBandAsDistance(rawA) ?? rawA;
  const b = meleeBandAsDistance(rawB) ?? rawB;
  if (a.subject !== b.subject || a.metric !== b.metric) return false;
  if ((a.ref ?? null) !== (b.ref ?? null)) return false;
  const x = condSet(a);
  const y = condSet(b);
  // `!=` only excludes the one point, so it can only conflict with `== that point`.
  if (x.kind === 'not' || y.kind === 'not') {
    const not = x.kind === 'not' ? x : (y as { kind: 'not'; value: number });
    const other = x.kind === 'not' ? y : x;
    if (other.kind !== 'range') return false;
    return other.lo === other.hi && !other.loOpen && !other.hiOpen && other.lo === not.value;
  }
  const lo = Math.max(x.lo, y.lo);
  const hi = Math.min(x.hi, y.hi);
  if (lo > hi) return true;
  if (lo < hi) return false;
  const loOpen = (x.lo === lo && x.loOpen) || (y.lo === lo && y.loOpen);
  const hiOpen = (x.hi === hi && x.hiOpen) || (y.hi === hi && y.hiOpen);
  return loOpen || hiOpen;
}

// Two rules that can never both be live. Without this an exclusive family collapses to ONE row, so
// every "which one against whom" answer a band writes is deleted at build time: warlock Affliction
// built 1 curse of 4 and hunter Marksmanship 1 sting of 3, each gated on a metric the other's gate
// contradicts. Gates that partition (isCaster 1/0, classId ==/!=) keep their rows; two rows that
// could both want the slot still collapse, which is the thrash the family rule exists to stop.
export function rulesAreMutuallyExclusive(a: RotationRule, b: RotationRule): boolean {
  for (const ca of a.conditions ?? []) {
    for (const cb of b.conditions ?? []) if (conditionsExclude(ca, cb)) return true;
  }
  return false;
}

// Keep at most one LIVE rule per exclusive family — Aspects, Auras, Seals, Stings, Curses, imbues,
// poisons, mage armors, warlock pets, hunter traps. First match wins, so suggestion order beats it.
export function collapseExclusiveFamilyRules(
  rules: RotationRule[],
  resolve: (spellId: number) => SpellDef | undefined | null,
): RotationRule[] {
  const keptByFamily = new Map<string, RotationRule[]>();
  // A row aimed at an ALLY by filter is its own slot: the same aura on two DIFFERENT bodies is not
  // the keep-up thrash this collapse exists for. Keying them together deleted the paladin's 2nd BoP band.
  const aimKey = (r: RotationRule): string => {
    for (const c of r.conditions ?? []) {
      if (c.subject === 'ally' && !allyFilterIsAny(c.ally)) {
        const f = c.ally!;
        return `${f.role ?? ''}|${f.notRole ?? ''}|${f.classId ?? ''}|${f.unit ?? ''}#`;
      }
    }
    return '';
  };
  // A multirank pair is a relation, not one key: Mark of the Wild carries aura 22 alone and Gift
  // of the Wild 22/29/143, so the overlap is tested against every rule already kept.
  const keptIdents: Array<{ ident: AuraStackIdentity; rule: RotationRule; aim: string }> = [];
  const out: RotationRule[] = [];
  for (const r of rules) {
    if (r.action.kind !== 'spell') {
      out.push(r);
      continue;
    }
    const def = resolve(r.action.spellId);
    if (!def) {
      out.push(r);
      continue;
    }
    const ident = auraStackIdentity(def);
    const aim = aimKey(r);
    if (ident && keptIdents.some(
      (k) => k.aim === aim && stackIdentitiesExclude(ident, k.ident)
        && !rulesAreMutuallyExclusive(r, k.rule),
    )) continue;
    const fam = exclusiveKeepupFamily(def);
    if (fam != null) {
      const key = `${aim}${fam}`;
      const kept = keptByFamily.get(key);
      if (kept?.some((k) => !rulesAreMutuallyExclusive(r, k))) continue;
      if (kept) kept.push(r);
      else keptByFamily.set(key, [r]);
    }
    if (ident) keptIdents.push({ ident, rule: r, aim });
    out.push(r);
  }
  return out;
}

// Short-duration damage shields belong in combat (Holy Shield charges); long ones stay OOC keep-ups.
// The 30 s threshold matches Holy Shield's 10 s duration with headroom for rank variance.
export function isCombatDamageShield(sp: SpellDef): boolean {
  if (/^holy shield$/i.test(sp.name)) return true;
  return sp.effects.some(
    (e) => e.kind === 'damage_shield' && (e.durationMs ?? 0) > 0 && (e.durationMs ?? 0) <= 30_000,
  );
}

/** Overpower is a post-dodge react (not a CP finisher). */
export function isOverpowerSpell(s: SpellDef): boolean {
  return /^overpower$/i.test(s.name);
}

// Classic combo-point spenders — rogue and cat finishers. Bake noise flags requiresComboPoints on
// rage abilities like Overpower, so rage and focus are hard exclusions.
export function isComboPointConsumer(s: SpellDef): boolean {
  if (!s.requiresComboPoints) return false;
  // Overpower and any warrior rage "finisher" flags are bake noise — warriors never spend CP.
  if (isOverpowerSpell(s) || s.powerType === 'rage' || s.powerType === 'focus') return false;
  return true;
}

// Stack cap for hostile keep-up auras. Bake often omits `stackAmount` on Sunder Armor even though Classic
// applies up to 5 stacks (description: "Can be applied up to 5 times").
export function hostileStackCap(s: SpellDef): number {
  if ((s.stackAmount ?? 0) > 1) return s.stackAmount!;
  if (/^sunder armor$/i.test(s.name)) return 5;
  const m = s.description?.match(/up to\s+(\d+)\s+times/i);
  if (m) {
    const n = +m[1]!;
    if (n > 1) return n;
  }
  return 0;
}

// True when the spell can leave a lasting aura, DoT or CC the target can "have". Any buff effect
// counts, since fixtures often omit hostile flags. A pure direct-damage spell does not.
export function spellAppliesTargetAura(s: SpellDef): boolean {
  // 'cc' covers stun/slow/fear (control field); 'root' is a distinct legacy kind
  // (Frost Nova); buff/dot cover the rest. A pure direct_damage spell (Scorch) has none.
  return s.effects.some((e) =>
    e.kind === 'buff' || e.kind === 'dot' || e.kind === 'cc' || e.kind === 'root',
  );
}

// itemCount gate for a conjure spell's buff-phase rule. Mage food and water are session provisions;
// everything else is single-use, and stockpiling five Soulstones is OOC thrash.
export function conjureItemCountThreshold(spell: SpellDef): number {
  if (/^conjure (food|water)\b/i.test(spell.name)) return DEFAULT_THRESHOLDS.conjureBelow;
  return DEFAULT_THRESHOLDS.conjureUtilityBelow;
}

// Bind a conjure rule's stock gate to the spell's actual output item. Pack bands bake one rank's
// item id, so a level-40 band checking the higher id never stops while the mage casts the lower.
export function bindConjureStockGate(spell: SpellDef, conditions: Condition[]): Condition[] {
  const conjured = spell.effects.find((e) => e.kind === 'conjure');
  if (!conjured || conjured.kind !== 'conjure' || !(conjured.item > 0)) return conditions;
  const item = conjured.item;
  let changed = false;
  const next = conditions.map((c) => {
    if (c.metric !== 'itemCount' || c.op !== '<') return c;
    if (c.ref === item) return c;
    changed = true;
    return { ...c, ref: item };
  });
  if (!next.some((c) => c.metric === 'itemCount' && c.op === '<')) {
    return [cond('self', 'itemCount', '<', conjureItemCountThreshold(spell), item), ...next];
  }
  return changed ? next : conditions;
}

/** Rewrite conjure stock gates on an already-built rotation (live saves + companions). */
export function repairConjureStockGates(
  rot: Rotation,
  resolve: (spellId: number) => SpellDef | undefined | null,
): Rotation {
  let changed = false;
  const map = (rules: RotationRule[]): RotationRule[] => {
    let any = false;
    const next = rules.map((r) => {
      if (r.action.kind !== 'spell') return r;
      const sp = resolve(r.action.spellId);
      if (!sp) return r;
      const conds = bindConjureStockGate(sp, r.conditions);
      if (conds === r.conditions) return r;
      any = true;
      return { ...r, conditions: conds };
    });
    if (any) changed = true;
    return any ? next : rules;
  };
  const phases = {
    prebuff: map(rot.phases.prebuff ?? []),
    buffs: map(rot.phases.buffs),
    pull: map(rot.phases.pull),
    combat: map(rot.phases.combat),
    recovery: map(rot.phases.recovery),
  };
  return changed ? { ...rot, phases } : rot;
}

/** SpellEntry.TargetCreatureType mask: Undead (6) | Demon (3) → bit5 | bit2 = 32 | 4. */
export const UNDEAD_DEMON_CREATURE_MASK =
  (1 << (CREATURE_TYPE.UNDEAD - 1)) | (1 << (CREATURE_TYPE.DEMON - 1));

/** Long-duration armor keep-ups (Demon Skin/Armor) are buffs, not emergency heals (KI-398/412). */
export function isLongArmorKeepUp(s: SpellDef): boolean {
  return s.effects.some(
    (e) => e.kind === 'buff' && e.mod === 'armor' && (e.durationMs ?? 0) >= 5 * 60_000,
  );
}

// A friendly buff placed on ONE body at a time — Arcane Intellect, Fortitude, Mark of the Wild, the
// blessings. `applyTo: 'party'` fans itself and needs no second row. Cite: applySpell friendBuffTarget.
// A paladin Blessing is deliberately NOT one of these: `pb-ally-<id>` blankets one spell on
// everyone, and which Blessing a body wants is per-class (Wisdom on a rage warrior never even
// applies — SpellAuras.cpp:4838). bots/paladinPrePull.ts plans those per target instead.
export function isSingleTargetPartyBuff(s: SpellDef): boolean {
  let single = false;
  for (const e of s.effects ?? []) {
    if (e.kind !== 'buff' || e.hostile === true) continue;
    const applyTo = (e as { applyTo?: string }).applyTo;
    if (applyTo === 'party') return false;
    if (applyTo === 'friendly' && (e.durationMs ?? 0) > 0) single = true;
  }
  // A damage shield carries no applyTo, so Thorns read as a self keep-up and the tank never got it.
  // The DBC target is the source: TARGET_UNIT_FRIEND / TARGET_UNIT_PARTY name a body, not the caster.
  if (
    !single
    && !auraRadiatesToParty(s)
    && auraHolderIsCastTarget(s)
    && (s.effects ?? []).some((e) => e.kind === 'damage_shield' && (e.durationMs ?? 0) > 0)
  ) {
    single = true;
  }
  return single;
}

/** Bloodrage rage-generator cast (not the periodic aura child). */
export function isBloodrageSpell(s: SpellDef): boolean {
  return normalizeSpellName(s.name) === 'bloodrage';
}

// Labels that mean "consume a Healthstone item", never "Create Healthstone" conjure. Authored recovery rows
// say "Use Healthstone"; fuzzy spell resolve otherwise hits Create*.
export function isUseHealthstoneLabel(label: string, labels: readonly string[]): boolean {
  const all = [label, ...labels].map((l) => normalizeSpellName(l));
  if (all.some((l) => /^create\b/.test(l))) return false;
  return all.some(
    (l) =>
      l === 'use healthstone'
      || l === 'healthstone'
      || /^(minor|lesser|greater|major) healthstone$/.test(l)
      || /healthstone/.test(l) && /use|consume|eat/.test(l),
  );
}

/** Party utility that increases *incoming* spell damage — never solo self keep-up (KI-289). */
export function isHostileSelfUtilityBuff(s: SpellDef): boolean {
  const n = normalizeSpellName(s.name);
  return n === 'amplify magic' || n.startsWith('amplify magic ');
}

// Party or battle resurrection. Never a self buffPresent keep-up: no aura lands and costPct is
// 75–90% of base mana, so the role-bucket "buff absent" path OOMs every prep cycle.
export function isResurrectSpell(s: {
  name?: string;
  effects?: ReadonlyArray<{ kind: string }> | null;
}): boolean {
  if (s.effects?.some((e) => e.kind === 'resurrect' || e.kind === 'resurrect_pct')) return true;
  const n = normalizeSpellName(s.name ?? '');
  // Exact classic player rez names only — not "Spirit of Redemption" (priest talent) or
  // "Soulstone Resurrection" (warlock self-rez item spell).
  return n === 'redemption'
    || n === 'resurrection'
    || n === 'ancestral spirit'
    || n === 'rebirth';
}

// Battle rez — the resurrection cast DURING a fight. Read off the row, not the name: a resurrect
// with a real cooldown and a short cast. In 1.12 that is exactly druid Rebirth.
export function isBattleRezSpell(s: {
  name?: string;
  castTimeMs?: number;
  cooldownMs?: number;
  effects?: ReadonlyArray<{ kind: string }> | null;
}): boolean {
  if (!isResurrectSpell(s)) return false;
  return (s.cooldownMs ?? 0) > 0 && (s.castTimeMs ?? 0) <= BATTLE_REZ_MAX_CAST_MS;
}

/** Rebirth is 2 s; the out-of-combat rezzes are all 10 s. 5 s splits them with room to spare. */
export const BATTLE_REZ_MAX_CAST_MS = 5_000;

/** Gate for party rez: only when a dead friendly exists (snapshot fills deadAllyCount). */
export function resurrectGateConditions(): Condition[] {
  return [cond('self', 'deadAllyCount', '>=', 1)];
}

// One-shot mobility / CD utilities that must not sit as buffPresent keep-ups (gate never clears when
// effects are empty). Blink, Cold Snap, Presence of Mind, Amplify Curse, empty aspects.
export function isNonKeepUpUtility(s: SpellDef): boolean {
  const n = normalizeSpellName(s.name);
  if (
    n === 'blink'
    || n === 'cold snap'
    || n === 'presence of mind'
    || n === 'amplify curse'
    || n === 'will of the forsaken'
    || n === 'perception'
    || n === 'escape artist'
    || n === 'stoneform'
    || n === 'every man for himself'
  ) {
    return true;
  }
  // Empty-effect short/long CDs are not maintainable buffs.
  if ((s.effects?.length ?? 0) === 0 && (s.cooldownMs ?? 0) >= 10_000) return true;
  return false;
}

// ---- Empty-effect / long-CD thrash guards (KI-364 / KI-375 / KI-373–377) ----

// Spells that still do work with empty bake `effects[]` (strikes, forms, seals, resource stubs). Used so we
// do not drop Life Tap / Heroic Strike / Seal labels while filtering inert ALWAYS / keep-up thrash.
export function spellWorksWithoutBakeEffects(s: SpellDef): boolean {
  if (s.onNextSwing || (s.strikeBonus ?? 0) > 0) return true;
  const role = s.role;
  if (role === 'strike' || role === 'shoot' || role === 'form' || role === 'seal' || role === 'judgement'
    || role === 'pet_summon' || role === 'charge' || role === 'stealth') {
    return true;
  }
  if (s.comboPointsGenerated || s.requiresComboPoints) return true;
  if (isFormSpell(s) || formIdFromLabel(s.name) != null) return true;
  if (isSealSpell(s) || isJudgementSpell(s)) return true;
  // Classic seals often bake empty; still valid keep-ups once the interpreter resolves them.
  if (/^seal of\b/i.test(s.name) || /^judgement\b/i.test(s.name)) return true;
  // Wave 2-LOCK utility stubs: empty bake, resource-gated in packs (not keep-up thrash).
  if (/^life tap$/i.test(s.name) || /^dark pact$/i.test(s.name)) return true;
  // Feign Death 5384 — bake effects[] empty; interpreter emits modify_threat_pct −100.
  if (isFeignDeathSpell(s)) return true;
  return false;
}

// Player Feign Death (5384). 5385 is LEARN_SPELL of 5384 — never the combat action. Cite: trainers.json
// Hunter Trainer 1003 teaches 5384 @30; spell_template 5385 Effect1=36.
export function isFeignDeathSpell(s: { name?: string; rawEffects?: ReadonlyArray<{ effect?: number }> | null }): boolean {
  if (!/^feign death$/i.test(s.name ?? '')) return false;
  return (s.rawEffects?.[0]?.effect ?? 0) !== 36;
}

/** Pure buffPresent/debuffPresent==0 keep-up (no other gates). */
export function isPresenceKeepUpOnly(conditions: readonly Condition[]): boolean {
  return conditions.length > 0 && conditions.every(
    (c) => (c.metric === 'buffPresent' || c.metric === 'debuffPresent')
      && c.op === '=='
      && c.value === 0,
  );
}

// Drop empty-bake rules that would thrash as ALWAYS combat fillers or presence keep-ups. Resource,
// health and form gates are kept even when the baked effects are empty (Life Tap, Execute).
export function shouldDropEmptyEffectRule(s: SpellDef, conditions: readonly Condition[]): boolean {
  if ((s.effects?.length ?? 0) > 0) return false;
  if (spellWorksWithoutBakeEffects(s)) return false;
  if (conditions.length === 0) return true; // ALWAYS
  if (isPresenceKeepUpOnly(conditions)) return true;
  return false;
}

/** max_health_pct emergency (Last Stand) — recovery health gate, not pull thrash. */
export function isMaxHealthPctEmergency(s: SpellDef): boolean {
  return s.effects.some((e) => e.kind === 'buff' && e.mod === 'max_health_pct');
}

// Self CDs that must not enter pull/buffs as buffPresent keep-ups: long cooldown combat CDs, next-cast arms
// (Fel Domination / PoM), pure mechanic-immunity bursts (Berserker Rage).
export function shouldSkipBuffKeepUp(s: SpellDef): boolean {
  if (s.effects.some((e) => e.kind === 'next_cast_mod' || e.kind === 'reset_cooldowns')) return true;
  if (s.effects.length > 0 && s.effects.every((e) => e.kind === 'mechanic_immunity')) return true;
  if ((s.cooldownMs ?? 0) >= DEFAULT_THRESHOLDS.combatCdKeepUpMinMs) return true;
  return false;
}

// ---- Smart defaults for manually-added rules --------------------------------
// Prefill the same guard the default generator would have chosen, so a fresh rule behaves sensibly.

/** True when the spell carries an interrupt effect (Kick/Pummel/Counterspell/Earth Shock…). */
const interruptSpellMemo = new WeakMap<SpellDef, boolean>();
export function isInterruptSpell(s: SpellDef): boolean {
  const hit = interruptSpellMemo.get(s);
  if (hit !== undefined) return hit;
  const v = s.effects.some((e) => e.kind === 'interrupt_cast');
  interruptSpellMemo.set(s, v);
  return v;
}

// Kick, Pummel, Counterspell and Shield Bash — the interrupt is the whole spell. Earth Shock also
// does damage, so a cast gate on its authored always-copy would delete the instant filler.
export function isPureInterruptSpell(s: {
  effects?: ReadonlyArray<{ kind?: string }>;
}): boolean {
  const effects = s.effects;
  if (!Array.isArray(effects) || !effects.some((e) => e.kind === 'interrupt_cast')) return false;
  return !effects.some(
    (e) =>
      e.kind === 'direct_damage'
      || e.kind === 'dot'
      || e.kind === 'weapon_percent_damage'
      || e.kind === 'weapon_damage'
      || e.kind === 'weapon_strike',
  );
}

// Damageless fear CC (Fear, Psychic Scream, Howl of Terror, Intimidating Shout, Scare Beast, Turn Undead).
// Death Coil is a nuke that happens to fear — not this.
export function isFearSpell(s: {
  effects?: ReadonlyArray<{ kind?: string; control?: string }>;
} | null | undefined): boolean {
  const effects = s?.effects;
  if (!Array.isArray(effects) || effects.length === 0) return false;
  if (!effects.some((e) => e.kind === 'cc' && e.control === 'fear')) return false;
  return !effects.some(
    (e) =>
      e.kind === 'direct_damage'
      || e.kind === 'dot'
      || e.kind === 'weapon_percent_damage'
      || e.kind === 'weapon_damage'
      || e.kind === 'weapon_strike',
  );
}

// True when the spell is a PRIMARY dispel or purge. A spell carrying only a secondary dispel chance
// on top of damage, like Shield Slam, is a damage nuke for auto-battler classification.
const dispelSpellMemo = new WeakMap<SpellDef, boolean>();
export function isDispelSpell(s: SpellDef): boolean {
  const hit = dispelSpellMemo.get(s);
  if (hit !== undefined) return hit;
  const v = s.effects.some((e) => e.kind === 'dispel')
    && !s.effects.some((e) => e.kind === 'direct_damage' || e.kind === 'dot');
  dispelSpellMemo.set(s, v);
  return v;
}

// One entry per rule. Categories on the SAME subject ride one rule OR-joined (Purify strips disease
// OR poison); magic stays two rules, an enemy purge and a friendly cleanse. Cite: conditionsPass.
export function dispelGateConditions(s: SpellDef): Condition[][] {
  const cats = new Set<number>();
  for (const e of s.effects) if (e.kind === 'dispel') cats.add(e.dispelType);
  // Who the cast may be aimed at, so MAGIC's dual gate never offers Purge a friendly.
  // Cite: SpellTargetDefines.h TARGET_UNIT_CASTER=1 / _ENEMY=6 / _FRIEND=21 / TARGET_UNIT=25.
  const raws = s.rawEffects ?? [];
  const hitsEnemy = raws.length === 0 || raws.some((r) => (r.targetA | 0) === 6 || (r.targetA | 0) === 25);
  const hitsFriend = raws.length === 0 || raws.some((r) => {
    const t = r.targetA | 0;
    return t === 1 || t === 21 || t === 25;
  });
  const bySubject = new Map<CondSubject, number[]>();
  const put = (subject: CondSubject, cat: number): void => {
    const list = bySubject.get(subject);
    if (list) list.push(cat);
    else bySubject.set(subject, [cat]);
  };
  for (const cat of cats) {
    const isCure = cat === 2 || cat === 3 || cat === 4; // CURSE / DISEASE / POISON
    if (isCure) put('self', cat);
    else if (cat === 1) { // MAGIC — dual (offensive purge + defensive cleanse)
      if (hitsEnemy) put('target', cat);
      if (hitsFriend) put('self', cat);
    } else put('target', cat); // enrage / stealth / invisibility
  }
  const out: Condition[][] = [];
  for (const [subject, list] of bySubject) {
    out.push([...list].sort((a, b) => a - b).map((cat, i) => ({
      ...cond(subject, 'dispellablePresent', '==', 1, cat),
      ...(i > 0 ? { join: 'or' as const } : {}),
    })));
  }
  return out;
}

// Whether a buff effect is a hostile aura on the enemy. Prefer explicit `hostile`, and never treat
// hostile:false as hostile even when the amount is negative. Cite: combat.ts isHostileBuffEffect.
export function isHostileBuffAura(e: {
  kind?: string;
  hostile?: boolean;
  amount?: number;
}): boolean {
  if (e.kind !== 'buff') return false;
  if (e.hostile === true) return true;
  if (e.hostile === false) return false;
  return (e.amount ?? 0) < 0;
}

/** The hostile aura ('buff' with hostile flag / negative amount) this spell puts on the target. */
export function hostileAuraEffect(s: SpellDef): SpellDef['effects'][number] | undefined {
  return s.effects.find((e) => isHostileBuffAura(e));
}

// ---- Offensive burst cooldowns and CC breaks ------------------------------------------
// A burst granting fear immunity read as a panic defensive, so five sites gated it on low health.

/** SPELL_EFFECT_DUMMY — scripted racials (Blood Fury / Berserking) carry no aura of their own. */
const SPELL_EFFECT_DUMMY = 3;
/** SPELL_EFFECT_APPLY_AURA. */
const SPELL_EFFECT_APPLY_AURA_RAW = 6;
/** SPELL_AURA_MOD_CRIT_PERCENT — Recklessness's +100% crit lives only in rawEffects. */
const AURA_MOD_CRIT_PERCENT = 52;
/** SPELL_AURA_ADD_FLAT_MODIFIER / ADD_PCT_MODIFIER — the SpellModOp carriers. */
const AURA_ADD_FLAT_MODIFIER = 107;
const AURA_ADD_PCT_MODIFIER = 108;
/** SPELL_AURA_MOD_POWER_REGEN_PERCENT — Adrenaline Rush (energy), Evocation (mana). */
const AURA_MOD_POWER_REGEN_PERCENT = 110;
/** SPELL_AURA_MOD_RANGED_HASTE — Rapid Fire. */
const AURA_MOD_RANGED_HASTE = 140;
/** SPELL_AURA_MECHANIC_IMMUNITY. */
const AURA_MECHANIC_IMMUNITY = 77;

// SpellModOps that raise the caster's own OUTPUT. Cost and casting time are deliberately absent:
// they are cast-enablers whose value depends on what you cast next, which a priority list cannot promise.
const OFFENSIVE_SPELLMOD_OPS: ReadonlySet<number> = new Set([
  0,  // DAMAGE           — Arcane Power
  7,  // CRITICAL_CHANCE  — Inner Focus, Elemental Mastery, Cold Blood, Divine Favor, Combustion
  8,  // ALL_EFFECTS      — Amplify Curse
  22, // DOT              — Arcane Power
  24, // SPELL_BONUS_DAMAGE
]);

/** BuffMods that raise the caster's own output (positive amount only). */
const OUTPUT_BUFF_MODS: ReadonlySet<string> = new Set([
  'damage_done_pct', 'crit', 'haste', 'attack_power', 'ranged_attack_power', 'spell_damage',
]);

/** BuffMods whose NEGATIVE amount means mitigation — never an offensive burst. */
const MITIGATION_BUFF_MODS: ReadonlySet<string> = new Set([
  'damage_taken_pct', 'physical_taken', 'physical_taken_pct', 'spell_taken', 'max_health_pct',
]);

// Racial dummies whose payload the interpreter casts for us — SPELL_EFFECT_DUMMY, so nothing in the
// row itself says "this raises damage". Cite: SpellEffects.cpp:760 case 20572; :1267–1285 icon 1661.
const BLOOD_FURY_SPELL_ID = 20572;
const BERSERKING_ICON_ID = 1661;

function rawApplyAuras(s: SpellDef): NonNullable<SpellDef['rawEffects']> {
  return (s.rawEffects ?? []).filter((r) => (r.effect | 0) === SPELL_EFFECT_APPLY_AURA_RAW);
}

/** A self buff that raises output, read off the baked effects. */
function hasOutputBuffEffect(s: SpellDef): boolean {
  return s.effects.some(
    (e) =>
      e.kind === 'buff'
      && OUTPUT_BUFF_MODS.has((e as { mod?: string }).mod ?? '')
      && ((e as { amount?: number }).amount ?? 0) > 0
      && (e as { hostile?: boolean }).hostile !== true,
  );
}

// A cost the CASTER pays for more output: more damage taken, or less armor. A spell that makes you
// squishier is definitionally not the button you press at 20% health.
function hasOffensiveSelfDownside(s: SpellDef): boolean {
  return s.effects.some((e) => {
    if (e.kind !== 'buff') return false;
    const mod = (e as { mod?: string }).mod ?? '';
    const amount = (e as { amount?: number }).amount ?? 0;
    if (mod === 'damage_taken_pct' && amount > 0) return true;
    return mod === 'armor_pct' && amount < 0;
  });
}

/** Mitigation / immunity payloads that make a spell defensive whatever else it carries. */
function hasMitigationPayload(s: SpellDef): boolean {
  return s.effects.some((e) => {
    if (e.kind === 'school_immunity' || e.kind === 'damage_immunity') return true;
    if (e.kind !== 'buff') return false;
    const mod = (e as { mod?: string }).mod ?? '';
    const amount = (e as { amount?: number }).amount ?? 0;
    if (MITIGATION_BUFF_MODS.has(mod) && amount < 0) return true;
    return mod === 'armor_pct' && amount > 0;
  });
}

/** Output-raising aura in a raw APPLY_AURA slot (crit%, ranged haste, offensive SpellMod). */
function rawSlotRaisesOutput(r: NonNullable<SpellDef['rawEffects']>[number]): boolean {
  const aura = r.auraName | 0;
  if (aura === AURA_MOD_CRIT_PERCENT || aura === AURA_MOD_RANGED_HASTE) return true;
  return (aura === AURA_ADD_FLAT_MODIFIER || aura === AURA_ADD_PCT_MODIFIER)
    && OFFENSIVE_SPELLMOD_OPS.has(r.miscValue | 0);
}

// True when the spell is a burst spent for more output — a damage cooldown or racial. Most bake
// empty, so the read goes to rawEffects too. Mitigation, heals and cast-enablers are NOT here.
export function isOffensiveBurstCooldown(
  s: SpellDef,
  resolve?: (id: number) => SpellDef | null | undefined,
): boolean {
  // Self-cast, on a real cooldown. The floor is the same one that decides a CD is not a
  // maintainable keep-up, so nothing can be both a burst and a keep-up.
  if ((s.rangeMax ?? 0) !== 0) return false;
  if ((s.cooldownMs ?? 0) < DEFAULT_THRESHOLDS.combatCdKeepUpMinMs) return false;
  if (isFormSpell(s) || formIdForRotationSpell(s) > 0) return false;
  if (isSealSpell(s) || isJudgementSpell(s) || isResurrectSpell(s)) return false;
  if (s.requiresComboPoints || s.comboPointsGenerated) return false;
  // A heal is a recovery action and mitigation is a panic CD. Neither is a burst.
  if (s.effects.some(
    (e) => e.kind === 'heal' || e.kind === 'restore_health' || e.kind === 'heal_max_health',
  )) {
    return false;
  }
  if (hasMitigationPayload(s)) return false;
  // A hostile aura belongs on the enemy (Demo Shout, curses) — that is a debuff keep-up.
  if (hostileAuraEffect(s)) return false;

  if (hasOutputBuffEffect(s) || hasOffensiveSelfDownside(s)) return true;

  for (const r of rawApplyAuras(s)) {
    if (rawSlotRaisesOutput(r)) return true;
    // Power regen: energy/rage only. miscValue 0 is mana, i.e. Evocation — a mana recovery
    // channel, not a damage burst.
    if (
      (r.auraName | 0) === AURA_MOD_POWER_REGEN_PERCENT
      && (r.basePoints | 0) > 0
      && (r.miscValue | 0) !== 0
    ) {
      return true;
    }
  }

  // Scripted racial dummies (Blood Fury, Berserking) — no aura of their own to read.
  if (
    (s.rawEffects ?? []).some((r) => (r.effect | 0) === SPELL_EFFECT_DUMMY)
    && (s.id === BLOOD_FURY_SPELL_ID || (s.spellIconId ?? 0) === BERSERKING_ICON_ID)
  ) {
    return true;
  }

  // One trigger hop: Combustion 11129's whole payload is trigger_spell 28682 (a crit SpellMod).
  if (resolve) {
    for (const e of s.effects) {
      if (e.kind !== 'trigger_spell') continue;
      const inner = resolve((e as { spellId?: number }).spellId ?? 0);
      if (!inner || inner.id === s.id) continue;
      if (hasMitigationPayload(inner)) continue;
      if (hasOutputBuffEffect(inner)) return true;
      if (rawApplyAuras(inner).some(rawSlotRaisesOutput)) return true;
    }
  }
  return false;
}

// Gate for a damage cooldown or racial, two conditions at most so the row still reads as a
// sentence: spend it once the fight is real, and — when it costs you defence — not while low.
export function burstCooldownConditions(s: SpellDef): Condition[] {
  const long = (s.cooldownMs ?? 0) >= DEFAULT_THRESHOLDS.burstLongCdMs;
  const out: Condition[] = [
    cond('self', 'combatTimeMs', '>=', long
      ? DEFAULT_THRESHOLDS.burstLongFightMs
      : DEFAULT_THRESHOLDS.burstOpenMs),
  ];
  if (hasOffensiveSelfDownside(s)) {
    out.push(cond('self', 'healthPct', '>', DEFAULT_THRESHOLDS.emergencyDefensivePct));
  }
  return out;
}

// The control state each immunity mechanic describes, for the mechanics the rotation vocabulary can
// see. Cite: SharedDefines.h MECHANIC_FEAR 5 / ROOT 7 / SNARE 11 / STUN 12.
const CC_BREAK_METRIC_BY_MECHANIC: Readonly<Record<number, CondMetric>> = {
  5: 'feared',
  7: 'rooted',
  11: 'snared',
  12: 'stunned',
};

// Order the break rows are emitted in — worst control first, so a caller that can take only one
// takes the one worth breaking. Without a fixed order this followed effect slot order.
const CC_BREAK_MECHANIC_PRIORITY: readonly number[] = [12, 5, 7, 11];

// Gate conditions for a self-cast whose WHOLE payload is mechanic immunity. The honest trigger is
// "I am feared", never "I am low". One rule per mechanic, since a rule's conditions AND.
export function ccBreakGateConditions(s: SpellDef): Condition[][] {
  if ((s.rangeMax ?? 0) !== 0) return [];
  if (isFormSpell(s) || formIdForRotationSpell(s) > 0) return [];
  const baked = s.effects;
  const raws = rawApplyAuras(s);
  const pureBaked = baked.length > 0 && baked.every((e) => e.kind === 'mechanic_immunity');
  const pureRaw = baked.length === 0
    && raws.length > 0
    && raws.every((r) => (r.auraName | 0) === AURA_MECHANIC_IMMUNITY);
  if (!pureBaked && !pureRaw) return [];

  const mechanics = new Set<number>();
  for (const e of baked) {
    if (e.kind === 'mechanic_immunity') mechanics.add((e as { mechanic?: number }).mechanic ?? 0);
  }
  for (const r of raws) {
    if ((r.auraName | 0) === AURA_MECHANIC_IMMUNITY) mechanics.add(r.miscValue | 0);
  }
  const out: Condition[][] = [];
  for (const m of CC_BREAK_MECHANIC_PRIORITY) {
    if (!mechanics.has(m)) continue;
    const metric = CC_BREAK_METRIC_BY_MECHANIC[m];
    if (metric) out.push([cond('self', metric, '==', 1)]);
  }
  return out;
}

// Self immunities and long-cooldown mitigation, gated on self health and never as enemy debuff
// keep-ups. Shapeshift forms carry mechanic_immunity too — treating those as panic CDs killed them.
export function isSelfDefensiveSpell(s: SpellDef): boolean {
  // Forms/stances: enter rules use formId gates, never emergency HP panic inject.
  if (isFormSpell(s) || formIdForRotationSpell(s) > 0) return false;
  // A burst you spend for more output is not a panic button, even though Death Wish and
  // Recklessness both carry fear immunity and so matched the immunity branch below.
  if (isOffensiveBurstCooldown(s)) return false;
  const selfRange = (s.rangeMax ?? 0) === 0;
  if (
    selfRange
    && s.effects.some(
      (e) =>
        e.kind === 'school_immunity'
        || e.kind === 'damage_immunity'
        || e.kind === 'mechanic_immunity',
    )
  ) {
    return true;
  }
  // Mitigation self buffs with long CD (Shield Wall physical_taken −75 hostile:false).
  if (
    (s.cooldownMs ?? 0) >= DEFAULT_THRESHOLDS.combatCdKeepUpMinMs
    && s.effects.some(
      (e) =>
        e.kind === 'buff'
        && e.hostile === false
        && (e.mod === 'physical_taken'
          || e.mod === 'physical_taken_pct'
          || e.mod === 'damage_taken_pct'
          || e.mod === 'spell_taken'
          || e.mod === 'haste')
        && (e.amount ?? 0) < 0,
    )
  ) {
    return true;
  }
  return false;
}

// A threat DUMP: the spell's only threat term is negative. isThreatOrTauntUtility is the superset,
// also matching taunts and positive pulses, whose default gate is the exact inverse.
export function isThreatDumpUtility(s: SpellDef): boolean {
  let negative = false;
  for (const e of s.effects) {
    if (e.kind === 'threat') {
      if ((e.amount ?? 0) >= 0) return false;
      negative = true;
    } else if (e.kind === 'modify_threat_pct') {
      if (e.pct >= 0) return false;
      negative = true;
    } else if (e.kind === 'taunt' || e.kind === 'mod_taunt') {
      return false;
    }
  }
  return negative;
}

// Spells that must not be scheduled as permanent target-debuff keep-ups in solo defaults: threat
// dumps and gens, taunts, self cooldowns, pure mana drains. Situational CC is omitted entirely.
const threatTauntMemo = new WeakMap<SpellDef, boolean>();
export function isThreatOrTauntUtility(s: SpellDef): boolean {
  const cached = threatTauntMemo.get(s);
  if (cached !== undefined) return cached;
  const v = computeThreatOrTauntUtility(s);
  threatTauntMemo.set(s, v);
  return v;
}
function computeThreatOrTauntUtility(s: SpellDef): boolean {
  // Negative threat pulses (Feint, Disengage, Cower).
  if (s.effects.some((e) => e.kind === 'threat' && (e.amount ?? 0) < 0)) return true;
  // modify_threat_pct uses `pct` (signed), not `amount`. Cite: SpellEffects.cpp:5262–5268.
  if (s.effects.some((e) => e.kind === 'modify_threat_pct' && e.pct < 0)) return true;
  // Pure positive threat (Distracting Shot) — not a reapply-debuff.
  if (
    s.effects.some((e) => e.kind === 'threat' || e.kind === 'modify_threat_pct')
    && !s.effects.some(
      (e) =>
        e.kind === 'direct_damage'
        || e.kind === 'dot'
        || e.kind === 'weapon_percent_damage'
        || isHostileBuffAura(e),
    )
  ) {
    return true;
  }
  // AoE/ST taunts (Challenging Shout/Roar, Mocking Blow).
  if (s.effects.some((e) => e.kind === 'taunt')) return true;
  return false;
}

// Pure mana-leech channels (Drain Mana) — situational vs casters, not trash DoT keep-ups. Viper Sting has
// the same shape; solo defaults omit both (authored packs may re-add).
export function isManaDrainKeepUp(s: SpellDef): boolean {
  const hasManaLeech = s.effects.some(
    (e) => e.kind === 'restore_power' && (e as { amountPerTick?: number }).amountPerTick! < 0,
  );
  if (!hasManaLeech) return false;
  // Real damage DoTs (Corruption) stay; pure leech-only does not.
  return !s.effects.some((e) => e.kind === 'dot' || e.kind === 'direct_damage');
}

// Whether defaults should schedule a target-debuff keep-up. Hostile auras yes; self, friendly,
// threat, taunt, CC and reacts no — a self-stun or a disarm must never become missing-debuff thrash.
export function shouldScheduleTargetDebuffKeepUp(s: SpellDef): boolean {
  if (isSelfDefensiveSpell(s)) return false;
  if (isDefenseReactSpell(s)) return false;
  if (isThreatOrTauntUtility(s)) return false;
  if (isManaDrainKeepUp(s)) return false;
  // Real hostile aura on the enemy (explicit hostile or legacy negative amount).
  if (hostileAuraEffect(s)) return true;
  return false;
}

// Multi-target tools that must not steal GCDs on a pure 1v1 pull. Prefer the baked `aoe`, with name
// fallbacks for Multi-Shot, Cleave, Swipe, Blade Flurry and Hellfire when the bake omits it.
const MULTI_TARGET_NAME_FALLBACKS = new Set([
  'blade flurry',
  'multi-shot',
  'multishot',
  'cleave',
  'swipe',
  'whirlwind',
  'arcane explosion',
  'blast wave',
  'flamestrike',
  'cone of cold',
  'blizzard',
  'rain of fire',
  'holy nova',
  'hellfire',
]);

const multiTargetMemo = new WeakMap<object, boolean>();
export function isMultiTargetCombatSpell(
  spell: {
    name?: string;
    aoe?: boolean;
    effects?: ReadonlyArray<{ kind?: string; control?: string }>;
  } | null | undefined,
): boolean {
  if (!spell) return false;
  const cached = multiTargetMemo.get(spell);
  if (cached !== undefined) return cached;
  // AoE MODE reorders damage dumps to the front, and every hard fear is aoe:true, so flipping to
  // AoE opened every pack with a scatter. A damageless AoE CC keeps the player's own place.
  const v = !isDamagelessHardCc(spell)
    && (spell.aoe === true || MULTI_TARGET_NAME_FALLBACKS.has(normalizeSpellName(spell.name ?? '')));
  multiTargetMemo.set(spell, v);
  return v;
}

// Hard CC carrying NO damage rider (War Stomp, Psychic Scream, Sap): full value on one target, so
// the pack-density gate must not withhold it. Mixed tools keep pack density via their damage.

/** Frost Nova ranks (1.12). Auto-kite: root the pile, then step back. */
export const FROST_NOVA_RANK_IDS: readonly number[] = [122, 865, 6131, 10230];

/** spells.json 12323 — Fury talent, dest-at-caster 10 yd snare. */
export const PIERCING_HOWL_SPELL_ID = 12323;

export function isPiercingHowlSpell(s: { id?: number; name?: string } | null | undefined): boolean {
  if (!s) return false;
  if (((s.id ?? 0) | 0) === PIERCING_HOWL_SPELL_ID) return true;
  return /^piercing howl$/i.test(s.name ?? '');
}

/** Out of melee, inside the howl disc, target not already snared (Howl or Hamstring). */
export function piercingHowlGapConditions(spell?: { radiusYd?: number }): Condition[] {
  const yards = spell?.radiusYd != null && spell.radiusYd > 0 ? Math.round(spell.radiusYd) : 10;
  return [
    cond('target', 'inMelee', '==', 0),
    cond('target', 'targetDistanceYd', '<=', yards),
    cond('target', 'snared', '==', 0),
  ];
}

/** True when Howl must not win the GCD — melee, already snared, snare-immune, or past the disc. */
export function piercingHowlRefused(opts: {
  inMelee: boolean;
  snared: boolean;
  snareImmune?: boolean;
  distanceYd: number | null;
  radiusYd?: number;
}): boolean {
  if (opts.inMelee || opts.snared || opts.snareImmune) return true;
  const cap = opts.radiusYd != null && opts.radiusYd > 0 ? opts.radiusYd : 10;
  return opts.distanceYd != null && opts.distanceYd > cap;
}

/** Yards to walk after a self-root AoE. Gets a melee caster out of white reach. */
export const NOVA_KITE_STEP_BACK_YD = 10;

// Furthest nearest-hostile the post-Nova walk will retreat from. Past the disc the "nearest" body is the
// Frostbolt focus — walking away from that is leaving the fight.
export const NOVA_KITE_NEAR_YD = 12;

/** Self-centered root AoE (Frost Nova). Not Polymorph / Fear / stun stomps. */
export function isNovaKiteSpell(s: {
  id?: number;
  name?: string;
  aoe?: boolean;
  rangeMax?: number | null;
  effects?: ReadonlyArray<{ kind?: string }>;
}): boolean {
  if (s.id != null && FROST_NOVA_RANK_IDS.includes(s.id | 0)) return true;
  if (/^frost nova$/i.test(s.name ?? '')) return true;
  if (!s.effects?.some((e) => e.kind === 'root')) return false;
  if (s.aoe !== true) return false;
  return !((s.rangeMax ?? 0) > 0);
}

export function novaKiteConditions(spell?: { radiusYd?: number }): Condition[] {
  return [cond('self', 'enemiesWithinYd', '>=', 1, multiTargetGateYards(spell ?? {}))];
}

/** True when any listed hostile sits inside this spell's disc. Missing list → unknown. */
export function novaDiscOccupied(
  dists: readonly number[] | undefined,
  spell?: { radiusYd?: number; rangeMax?: number },
): boolean {
  if (!dists) return false;
  const yards = multiTargetGateYards(spell ?? {});
  for (const d of dists) if (d <= yards) return true;
  return false;
}

// `ensureNovaKiteRotation` lived here and is deliberately gone: it rewrote a rotation the player
// owns, invisibly. build.ts and classes/mage.ts author the same rule INTO the pack instead.

export function isDamagelessHardCc(
  spell: {
    effects?: ReadonlyArray<{ kind?: string; control?: string }>;
  } | null | undefined,
): boolean {
  const effects = spell?.effects;
  if (!Array.isArray(effects) || effects.length === 0) return false;
  const hasHardCc = effects.some(
    (e) => e.kind === 'cc' || e.kind === 'root' || (e.control != null && e.control !== ''),
  );
  if (!hasHardCc) return false;
  return !effects.some(
    (e) =>
      e.kind === 'direct_damage'
      || e.kind === 'dot'
      || e.kind === 'weapon_percent_damage'
      || e.kind === 'weapon_damage'
      || e.kind === 'weapon_strike',
  );
}

// Whether a multi-target spell must wait for pack density. Damage dumps yes; hostile-aura PBAoEs,
// damageless hard CC and Whirlwind no. A thin row with no effects falls through to "needs pack".
export function multiTargetNeedsPackDensity(
  spell: {
    name?: string;
    aoe?: boolean;
    effects?: ReadonlyArray<{ kind?: string; hostile?: boolean; amount?: number; control?: string }>;
    role?: string;
  } | null | undefined,
): boolean {
  if (!isMultiTargetCombatSpell(spell)) return false;
  if (/^whirlwind$/i.test(spell!.name ?? '')) return false;
  // Prot paladin 1v1 threat tool — playerbot casts it on the focus with no pack check.
  // Cite: PlayerbotPaladinAI.cpp:256.
  if (/^consecration$/i.test(spell!.name ?? '')) return false;
  const effects = spell!.effects;
  if (Array.isArray(effects) && effects.length > 0) {
    // Full shape: hostile-aura AoEs that are not channeled multi damage stay 1v1-ok.
    const asDef = spell as SpellDef;
    if (hostileAuraEffect(asDef) && !isChanneledAoeDamageSpell(asDef)) return false;
    // Damageless hard CC — 1v1-ok (War Stomp 2m stun; Psychic Scream; Polymorph).
    if (isDamagelessHardCc(asDef)) return false;
    // Control-primary mixed tools (Frost Nova DD+root) are kiting CC, not pack dumps.
    if ((asDef.role ?? inferRole(asDef)) === 'control') return false;
    // Also heals friendlies (Holy Nova): the heal fires whatever the damage half hit, so the press
    // does not scale with enemy count. Cite: PlayerbotPriestAI.cpp:291 gates it on meleeReach only.
    if (effects.some((e) => e.kind === 'heal')) return false;
  }
  return true;
}

// Single-target fillers that must not dump resource on packs when a multi-target counterpart is
// known — Heroic Strike against Cleave, Maul against Swipe. Skipped when aoeMode is single-target.
export function isPackSuppressedStFiller(
  spell: { name?: string } | null | undefined,
  opts: {
    enemyCount: number;
    hasCleave: boolean;
    hasSwipe: boolean;
    /** When true (aoeMode single), do not suppress — player asked for ST dumps. */
    singleTargetMode?: boolean;
  },
): boolean {
  if (!spell || opts.singleTargetMode || opts.enemyCount < 2) return false;
  const name = normalizeSpellName(spell.name ?? '');
  if (name === 'heroic strike' && opts.hasCleave) return true;
  if (name === 'maul' && opts.hasSwipe) return true;
  if (name === 'slam' && opts.hasCleave) return true;
  return false;
}

// Resolve a single formId for `spell.stances` when the mask is one form or the Bear family. A
// multi-stance warrior mask returns null — session usability already enforces those.
export function requiredFormIdFromStances(stances: number): number | null {
  if (!stances) return null;
  const forms: number[] = [];
  for (let formId = 1; formId <= 31; formId++) {
    if (stances & (1 << (formId - 1))) forms.push(formId);
  }
  if (!forms.length) return null;
  // Bear family only → formId == BEAR (rotation formIdEquals treats DIREBEAR as match).
  if (forms.every((f) => f === SHAPESHIFT_FORM.BEAR || f === SHAPESHIFT_FORM.DIREBEAR)) {
    return SHAPESHIFT_FORM.BEAR;
  }
  if (forms.length === 1) return forms[0]!;
  return null;
}

// Channeled or persistent multi-target damage (Blizzard, Rain of Fire, Hurricane, Consecration):
// never a single-target DoT keep-up, gated on enemyCount alone. A secondary rider must not reclassify.
export function isChanneledAoeDamageSpell(spell: SpellDef): boolean {
  if (!isMultiTargetCombatSpell(spell)) return false;
  const role = spell.role ?? inferRole(spell);
  // Multi + scheduled as DoT (periodic damage primary) — never ST keep-up.
  if (role === 'dot') return true;
  // Ground ticks with no direct_damage and not a buff/control primary role
  // (covers pure aoe dots even if role is stamped oddly).
  if (role === 'buff' || role === 'control') return false;
  const hasDot = spell.effects.some((e) => e.kind === 'dot');
  if (!hasDot) return false;
  return !spell.effects.some((e) => e.kind === 'direct_damage');
}

/** Classic small PBAoE / default `enemiesWithinYd` ref when SpellRadius is missing. */
export const DEFAULT_MULTI_RADIUS_YD = 10;

/** Yards for radius-aware multi gates: baked radius, else short melee rangeMax, else 10. */
export function multiTargetGateYards(spell: {
  radiusYd?: number;
  rangeMax?: number;
}): number {
  if (spell.radiusYd != null && spell.radiusYd > 0) return Math.round(spell.radiusYd);
  if (spell.rangeMax != null && spell.rangeMax > 0 && spell.rangeMax <= 8) {
    return Math.round(spell.rangeMax);
  }
  return DEFAULT_MULTI_RADIUS_YD;
}

// Ground-targeted multi, measuring density at the cast point. Prefer the baked aoeShape, with a name
// fallback for thin rows. A self-range dest-at-caster spell is treated as a PBAoE for density.
export function isGroundTargetedMulti(spell: {
  name?: string;
  aoeShape?: string;
  rangeMax?: number;
} | null | undefined): boolean {
  if (!spell) return false;
  if (spell.aoeShape === 'ground') {
    if ((spell.rangeMax ?? 0) === 0) return false;
    return true;
  }
  const n = normalizeSpellName(spell.name ?? '');
  return n === 'blizzard' || n === 'rain of fire' || n === 'flamestrike'
    || n === 'hurricane' || n === 'volley';
}

/** Conditions for channeled multi-target damage: multi only, never ST debuff keep-up. */
export function channeledAoeDamageConditions(spell?: {
  radiusYd?: number;
  rangeMax?: number;
  aoeShape?: string;
}): Condition[] {
  // Ground rain: density at the focus (cast point), not at the caster's feet.
  if (spell && isGroundTargetedMulti(spell)) {
    return [cond('target', 'enemiesWithinYd', '>=', 2, multiTargetGateYards(spell))];
  }
  // PBAoE / cone / self-centered channel: density at the caster.
  return [cond('self', 'enemiesWithinYd', '>=', 2, multiTargetGateYards(spell ?? {}))];
}

/** Append a condition if an equivalent metric/op/value/ref is not already present. */
export function ensureCondition(conditions: Condition[], extra: Condition): Condition[] {
  if (
    conditions.some(
      (c) =>
        c.subject === extra.subject &&
        c.metric === extra.metric &&
        c.op === extra.op &&
        c.value === extra.value &&
        (c.ref ?? null) === (extra.ref ?? null),
    )
  ) {
    return conditions;
  }
  return [...conditions, extra];
}

// Gate multi-target combat spells on pack density the blast can actually hit: a PBAoE measures
// around the caster, a ground rain around the focus, both at the spell's own radius.
export function applyMultiTargetCombatGates(spell: SpellDef, conditions: Condition[]): Condition[] {
  if (!multiTargetNeedsPackDensity(spell)) return conditions;
  let c = conditions;
  if (isChanneledAoeDamageSpell(spell)) {
    c = c.filter(
      (x) =>
        !(
          x.subject === 'target' &&
          (x.metric === 'debuffPresent' || x.metric === 'debuffStacks')
        ),
    );
  }
  // Drop fight-wide pack gates so rebuilds upgrade to radius-aware (saved rotations).
  c = c.filter(
    (x) =>
      !(
        x.subject === 'self' &&
        x.metric === 'enemyCount' &&
        x.op === '>=' &&
        x.value === 2
      ),
  );
  if (c.some((x) => x.metric === 'enemiesWithinYd' || (x.metric === 'enemyCount' && x.op === '>='))) {
    return c;
  }
  const yards = multiTargetGateYards(spell);
  // Ground: density at focus. PBAoE: density at caster.
  if (isGroundTargetedMulti(spell)) {
    return ensureCondition(c, cond('target', 'enemiesWithinYd', '>=', 2, yards));
  }
  return ensureCondition(c, cond('self', 'enemiesWithinYd', '>=', 2, yards));
}

// A form or stance enter must never fire while already in that form, since a recast toggles off.
// The leave-to-heal recovery rules are the exception and intentionally require formId == form.
export function applyFormEnterGate(spell: SpellDef, conditions: Condition[]): Condition[] {
  const formId = formIdForRotationSpell(spell);
  if (!formId && !isFormSpell(spell)) return conditions;
  if (!formId) return conditions;
  // Leave-form toggle (health emergency): formId == this form already present.
  if (conditions.some((c) => c.metric === 'formId' && c.op === '==' && c.value === formId)) {
    return conditions;
  }
  // Drop wrong buffPresent-of-form-spell gates (form is modal state, not a buff id).
  const cleaned = conditions.filter(
    (c) => !(c.metric === 'buffPresent' && c.ref === spell.id),
  );
  return ensureCondition(cleaned, cond('self', 'formId', '!=', formId));
}

// Post-defense-react strikes (Revenge, Riposte) are only usable after a dodge, parry or block.
// Overpower is a separate target-dodge gate and is not included here.
export function isDefenseReactSpell(spell: SpellDef): boolean {
  if (isOverpowerSpell(spell)) return false;
  // CasterAuraState is the gate itself, so the baked value decides both ways: DEFENSE on 17 rows,
  // HUNTER_PARRY on 7. The spell text cannot separate them — both say "after parrying".
  const state = (spell.casterAuraState ?? 0) | 0;
  if (state) return state === 1;
  // A def built without the baked column (fixtures, hand-authored kits) still needs the gate,
  // or Revenge ships as bare ALWAYS filler again (KI-251).
  const text = `${spell.name ?? ''} ${spell.description ?? ''}`;
  return (
    /\brevenge\b/i.test(spell.name ?? '')
    || /must follow a |becomes active after parry|after parrying|only usable after|only useable after/i.test(text)
  );
}

// Counterattack: CasterAuraState 7 HUNTER_PARRY. Only a hunter's own parry arms it, since a dodge
// sets DEFENSE instead, so the two windows never overlap. Cite: UnitAuraProcHandler.cpp:310-316.
export function isHunterParryReactSpell(spell: SpellDef): boolean {
  return (((spell.casterAuraState ?? 0) | 0) === 7);
}

// Revenge and the other defense-react strikes must never ship as bare ALWAYS filler: in 1.12
// Revenge is usable only for 5 s after the warrior dodges, parries or blocks.
export function applyDefenseReactGate(spell: SpellDef, conditions: Condition[]): Condition[] {
  // defenseReactRecently is AURA_STATE_DEFENSE, which skips a rogue's dodge — so for Riposte
  // this window is already parry-only. Cite: UnitAuraProcHandler.cpp:302 "skip Rogue Riposte".
  if (!isDefenseReactSpell(spell)) return conditions;
  if (conditions.some((c) => /Recently$/.test(c.metric))) return conditions;
  return ensureCondition(conditions, cond('self', 'defenseReactRecently', '==', 1));
}
