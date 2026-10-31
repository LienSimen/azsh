// MATERIALIZE-ONLY invent path for the default rotation packs — product auto-combat never imports
// it. Regenerate with PH_ROTATION_INVENT=1 and src/dev/materialize-rotation-packs.mjs.

import type { DataStore } from '../../data/dataStore.ts';
import { ALLY_HEAL_THRESHOLD } from '../../engine/combat.ts';
import { formIdFromSpell } from '../character/forms.ts';
import {
  isMultiTargetCombatSpell,
  ROTATION_PHASES,
  type Condition,
  type Rotation,
  type RotationRule,
} from './rotation.ts';
import { AOE_MODE_CODE } from '../bots/squad.ts';

/** Healer-companion triage gate (%): the S0 engine heuristic threshold, now an editable condition. */
export const COMPANION_TRIAGE_PCT = Math.round(ALLY_HEAL_THRESHOLD * 100);

// Off-heal emergency threshold (%): same documented triage gate as ally healers (ALLY_HEAL_THRESHOLD = 0.75
// → 75%). Hybrid DPS only fire when most-hurt ally is below this.
export const COMPANION_OFF_HEAL_PCT = COMPANION_TRIAGE_PCT;

// Healer-seat mana % under which a hybrid DPS starts healing. A dead seat reads 0, so this one gate
// is "the healer is dead or dry" — the only state where giving up DPS for a heal is right.
export const HEALER_DRY_POWER_PCT = 5;

// Healer ladder bands for party triage: panic under 25%, an emergency flash below that, an AoE heal
// only with 2+ hurt, a main heal under triage, and a HoT as a top-up that never outranks a direct.
export const HEALER_PANIC_PCT = 25;
export const HEALER_EMERGENCY_PCT = 40;
export const HEALER_HOT_PCT = 90;
/** Minimum hurt friendlies before multi-target heals are allowed to fire. */
export const HEALER_AOE_MIN_TARGETS = 2;
/** Classic Chain Heal bounce proximity (~12.5 yd); used when radiusYd is absent. */
export const CHAIN_HEAL_BOUNCE_YD = 12;

/** Minimal spell shape for heal classification (DataStore row or session ability). */
export type HealSpellLike = {
  id: number;
  name?: string;
  castTimeMs?: number;
  aoe?: boolean;
  radiusYd?: number;
  effects?: ReadonlyArray<{ kind: string }>;
};

export type HealTier = 'panic' | 'emergency' | 'aoe' | 'main' | 'hot';

/** True when the spell is a party-healing cast (direct, HoT, LoH, Holy Shock). */
export function spellIsHeal(spell: HealSpellLike | null | undefined): boolean {
  return !!spell?.effects?.some(
    (e) =>
      e.kind === 'heal'
      || e.kind === 'restore_health'
      || e.kind === 'heal_max_health'
      || e.kind === 'holy_shock',
  );
}

// Multi-target / chain party heals — must not fire on a single bruised tank. Name + aoe/radius heuristics
// (Prayer of Healing often lacks a baked `aoe` flag).
export function isAoeHealSpell(spell: HealSpellLike | null | undefined): boolean {
  if (!spell || !spellIsHeal(spell)) return false;
  const name = (spell.name ?? '').toLowerCase();
  if (
    name.includes('chain heal')
    || name.includes('prayer of healing')
    || name === 'tranquility'
    || name.includes('circle of healing')
  ) {
    return true;
  }
  // Holy Nova is dual heal+damage with aoe:true — group heal when several are hurt.
  if (spell.aoe === true && /nova|tranquility|prayer|chain|circle/.test(name)) return true;
  if ((spell.radiusYd ?? 0) >= 15 && /prayer|nova|tranquility|circle|chain/.test(name)) return true;
  return false;
}

/** Yards gate for nearbyAlliesBelowHpCount (null = party-wide count only). */
export function aoeHealYards(spell: HealSpellLike): number | null {
  if (!isAoeHealSpell(spell)) return null;
  const name = (spell.name ?? '').toLowerCase();
  if (name.includes('chain heal')) return CHAIN_HEAL_BOUNCE_YD;
  if (typeof spell.radiusYd === 'number' && spell.radiusYd > 0) return Math.round(spell.radiusYd);
  if (name.includes('prayer of healing')) return 30;
  if (name === 'tranquility') return 20;
  if (name.includes('circle of healing')) return 18;
  return 30;
}

const isHealSpell = (spellId: number, ds: DataStore): boolean =>
  spellIsHeal(ds.spell(spellId) as HealSpellLike | undefined);

const isTauntSpell = (spellId: number, ds: DataStore): boolean =>
  !!ds.spell(spellId)?.effects.some((e) => e.kind === 'taunt' || e.kind === 'mod_taunt');

/** AoE taunts (Challenging Shout/Roar) — pack peel, not the primary single-target taunt. */
const isAoeTauntSpell = (spellId: number, ds: DataStore): boolean => {
  if (!isTauntSpell(spellId, ds)) return false;
  const n = (ds.spell(spellId)?.name ?? '').toLowerCase();
  return n.includes('challenging');
};

// Prefer single-target taunts (Taunt / Growl / Mocking Blow) over Challenging* AoE. knownSpellIds order
// alone would lock onto Challenging Roar before Growl.
function pickPrimaryTaunt(knownSpellIds: readonly number[], ds: DataStore): number | undefined {
  const taunts = knownSpellIds.filter((id) => isTauntSpell(id, ds));
  if (!taunts.length) return undefined;
  const score = (id: number): number => {
    const n = (ds.spell(id)?.name ?? '').toLowerCase();
    if (n.includes('challenging')) return 0;
    if (n.includes('mocking')) return 1;
    return 2; // Taunt, Growl, Hand of Reckoning-class
  };
  return [...taunts].sort((a, b) => score(b) - score(a) || a - b)[0];
}

/** Self threat buff that must stay in buffs with buffPresent — never combat always thrash. */
const isRighteousFurySpell = (spellId: number, ds: DataStore): boolean =>
  /^righteous fury$/i.test(ds.spell(spellId)?.name ?? '');

/** Salvation lowers the tank's own threat — never keep it on a tank default. */
const isSalvationBlessing = (spellId: number, ds: DataStore): boolean =>
  /blessing of salvation/i.test(ds.spell(spellId)?.name ?? '');

const isThreatSpell = (spellId: number, ds: DataStore): boolean => {
  const sp = ds.spell(spellId);
  if (!sp) return false;
  if (isTauntSpell(spellId, ds)) return false;
  if (isRighteousFurySpell(spellId, ds)) return false; // buff phase, not combat dump
  // Never promote blessings/auras as combat threat dumps (spell_threat rows on Salvation
  // etc. are not "spam this on GCD" tank tools — Salvation is anti-tank).
  const n = (sp.name ?? '').toLowerCase();
  if (n.includes('blessing') || n.includes('aura')) return false;

  if ((sp.threatMultiplier ?? 1) > 1) return true;
  if (sp.effects.some((e) => e.kind === 'threat' && (e as { amount?: number }).amount! > 0)) return true;
  // Classic tank threat names (bake often omits threatMultiplier on Sunder/Maul/HS).
  // Do NOT key solely on threatFlat — many non-tank spells carry small table rows.
  return n === 'sunder armor' || n === 'holy shield' || n === 'devastate'
    || n === 'revenge' || n === 'shield slam' || n === 'maul';
};

/** Multi-target threat tools tanks should prefer on packs (not ST rage dumps). */
const isMultiThreatSpell = (spellId: number, ds: DataStore): boolean => {
  const sp = ds.spell(spellId);
  if (!sp) return false;
  const n = (sp.name ?? '').toLowerCase();
  if (
    n === 'swipe'
    || n === 'thunder clap'
    || n === 'consecration'
    || n === 'cleave'
    || n === 'demoralizing roar'
    || n === 'demoralizing shout'
    || n.includes('challenging')
  ) {
    return true;
  }
  return isMultiTargetCombatSpell(sp) && (isThreatSpell(spellId, ds) || isAoeTauntSpell(spellId, ds));
};

/** Tank combat form enter: Defensive Stance / Bear / Dire Bear (not Cat / Battle / Berserker). */
const isTankFormEnter = (spellId: number, ds: DataStore): boolean => {
  const sp = ds.spell(spellId);
  if (!sp) return false;
  const n = (sp.name ?? '').toLowerCase();
  return n === 'defensive stance' || n === 'bear form' || n === 'dire bear form';
};

/** Cat Form must not gate a tank rotation — demote when reshaping for tank role. */
const isCatFormSpell = (spellId: number, ds: DataStore): boolean =>
  /^cat form$/i.test(ds.spell(spellId)?.name ?? '');

// Consecration is the Prot paladin's PRIMARY threat tool, single target included — it must never sit behind
// the pack (`enemyCount >= 2`) gate the other multi tools get.
const isConsecrationSpell = (spellId: number, ds: DataStore): boolean =>
  /^consecration$/i.test(ds.spell(spellId)?.name ?? '');

// Bucket a heal for the dungeon-healer priority ladder. Pure HoTs last; flash/instant first under pressure;
// AOE only multi-hurt; then main.
export function classifyHealTier(spell: HealSpellLike): HealTier | null {
  if (!spellIsHeal(spell)) return null;
  const effects = spell.effects ?? [];
  if (effects.some((e) => e.kind === 'heal_max_health')) return 'panic';
  // Multi-heals before single-target main so 2+ hurt party uses Chain/PoH first.
  if (isAoeHealSpell(spell)) return 'aoe';

  const hasDirect = effects.some((e) => e.kind === 'heal' || e.kind === 'holy_shock');
  const hasHot = effects.some((e) => e.kind === 'restore_health');
  // Renew / Rejuvenation — restore_health only (Regrowth also has a direct heal effect).
  if (hasHot && !hasDirect) return 'hot';

  const name = (spell.name ?? '').toLowerCase();
  if (/\bflash\b/.test(name) || name.includes('lesser healing wave')) return 'emergency';

  const cast = spell.castTimeMs ?? 0;
  // Instant direct (Holy Shock heal mode, Nature's Swiftness free casts, etc.).
  if (hasDirect && cast === 0) return 'emergency';

  return 'main';
}

function tierThreshold(tier: HealTier, hasMainDirect: boolean): number {
  switch (tier) {
    case 'panic': return HEALER_PANIC_PCT;
    case 'emergency':
      // Solo flash/Lesser-Healing-Wave kits must still heal through the full triage band.
      return hasMainDirect ? HEALER_EMERGENCY_PCT : COMPANION_TRIAGE_PCT;
    case 'aoe': return COMPANION_TRIAGE_PCT; // unused for allyLowest — multi-count gates apply
    case 'main': return COMPANION_TRIAGE_PCT;
    case 'hot': return HEALER_HOT_PCT;
  }
}

function stripSelfHealthGates(conditions: readonly Condition[]): Condition[] {
  return conditions.filter(
    (c) => !(c.subject === 'self' && (
      c.metric === 'healthPct'
      || c.metric === 'allyLowestHpPct'
      || c.metric === 'alliesBelowHpCount'
      || c.metric === 'nearbyAlliesBelowHpCount'
    )),
  );
}

function withTriageGate(rule: RotationRule, pct: number): RotationRule {
  const kept = stripSelfHealthGates(rule.conditions);
  kept.push({ subject: 'self', metric: 'allyLowestHpPct', op: '<', value: pct });
  return { ...rule, conditions: kept };
}

// Pure HoT keep-up: cast only when the triage heal TARGET lacks the buff. Strips the stale
// self.buffPresent that checked the caster, which had Renew thrashing every GCD into OOM.
function withHotMissingGate(rule: RotationRule, spellId: number): RotationRule {
  const kept = rule.conditions.filter(
    (c) => !(
      (c.metric === 'buffPresent' || c.metric === 'allyLowestBuffPresent')
      && (c.ref ?? -1) === spellId
    ),
  );
  kept.push({
    subject: 'self',
    metric: 'allyLowestBuffPresent',
    op: '==',
    value: 0,
    ref: spellId,
  });
  return { ...rule, conditions: kept };
}

/** AOE heal: require N hurt party members (and N nearby when a radius applies). */
function withAoeHealGates(rule: RotationRule, spell: HealSpellLike): RotationRule {
  const kept = stripSelfHealthGates(rule.conditions)
    .filter((c) => c.metric !== 'enemyCount'); // combat multi-damage gate is wrong for heals
  kept.push({
    subject: 'self',
    metric: 'alliesBelowHpCount',
    op: '>=',
    value: HEALER_AOE_MIN_TARGETS,
    ref: COMPANION_TRIAGE_PCT,
  });
  const yards = aoeHealYards(spell);
  if (yards != null) {
    kept.push({
      subject: 'self',
      metric: 'nearbyAlliesBelowHpCount',
      op: '>=',
      value: HEALER_AOE_MIN_TARGETS,
      ref: yards,
    });
  }
  return { ...rule, conditions: kept };
}

/** Family key so rank spam collapses to one rule (Healing Wave r1…r7 → best rank). */
function healFamilyKey(spell: HealSpellLike): string {
  const name = (spell.name ?? `id:${spell.id}`).toLowerCase().replace(/\s*\(rank\s*\d+\)\s*$/i, '').trim();
  return name || `id:${spell.id}`;
}

function rankScore(spell: HealSpellLike): number {
  const r = (spell as { rank?: number }).rank;
  if (typeof r === 'number' && r > 0) return r;
  const req = (spell as { reqLevel?: number }).reqLevel;
  if (typeof req === 'number') return req;
  return spell.id;
}

// Keep the highest-rank rule per heal family. First-firing would otherwise lock onto rank 1 forever when
// every trainer rank is injected into recovery.
function preferBestRankPerFamily(
  rules: readonly RotationRule[],
  lookup: (spellId: number) => HealSpellLike | null | undefined,
): RotationRule[] {
  const best = new Map<string, { rule: RotationRule; score: number }>();
  for (const r of rules) {
    if (r.action.kind !== 'spell') continue;
    const sp = lookup(r.action.spellId);
    if (!sp) continue;
    const key = healFamilyKey(sp);
    const score = rankScore(sp);
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { rule: r, score });
  }
  // Stable-ish: panic/emergency/main/hot callers concat in tier order; within a
  // tier preserve first-seen family order by walking rules again.
  const out: RotationRule[] = [];
  const used = new Set<string>();
  for (const r of rules) {
    if (r.action.kind !== 'spell') continue;
    const sp = lookup(r.action.spellId);
    if (!sp) continue;
    const key = healFamilyKey(sp);
    if (used.has(key)) continue;
    const pick = best.get(key);
    if (!pick) continue;
    used.add(key);
    out.push(pick.rule);
  }
  return out;
}

// Role-adapt a class rotation into a dungeon heal priority list: gate every heal on party triage,
// move heals into recovery, order panic to HoT, inject known heals and collapse trainer ranks.
export function adaptHealerRotation(
  rot: Rotation,
  lookup: (spellId: number) => HealSpellLike | null | undefined,
  extraHealIds?: readonly number[],
): Rotation {
  const buckets: Record<HealTier, RotationRule[]> = {
    panic: [],
    emergency: [],
    aoe: [],
    main: [],
    hot: [],
  };
  const seenIds = new Set<number>();

  const collectHeal = (r: RotationRule): boolean => {
    if (r.action.kind !== 'spell') return false;
    const sp = lookup(r.action.spellId);
    const tier = sp ? classifyHealTier(sp) : null;
    if (!tier || !sp) return false;
    if (seenIds.has(r.action.spellId)) return true; // drop duplicate rule, still "consumed"
    seenIds.add(r.action.spellId);
    // Threshold filled after we know whether a main direct exists.
    buckets[tier].push(r);
    return true;
  };

  const keepNonHeals = (rules: readonly RotationRule[]): RotationRule[] => {
    const out: RotationRule[] = [];
    for (const r of rules) {
      if (collectHeal(r)) continue;
      out.push(r);
    }
    return out;
  };

  const buffs = keepNonHeals(rot.phases.buffs);
  const pull = keepNonHeals(rot.phases.pull);
  const combat = keepNonHeals(rot.phases.combat);
  const recoveryNonHeal = keepNonHeals(rot.phases.recovery);

  if (extraHealIds) {
    // Push every known heal rank; preferBestRankPerFamily keeps the highest per family.
    for (const id of extraHealIds) {
      if (seenIds.has(id)) continue;
      const sp = lookup(id);
      const tier = sp ? classifyHealTier(sp) : null;
      if (!tier || !sp) continue;
      seenIds.add(id);
      buckets[tier].push({
        id: `g-healer-${tier}-${id}`,
        action: { kind: 'spell', spellId: id },
        conditions: [],
        enabled: true,
      });
    }
  }

  // Collapse any multi-rank leftovers (suggestion + role-bucket both listed a heal).
  for (const tier of ['panic', 'emergency', 'aoe', 'main', 'hot'] as const) {
    buckets[tier] = preferBestRankPerFamily(buckets[tier], lookup);
  }

  const hasMainDirect = buckets.main.length > 0;
  const recoveryHeals: RotationRule[] = [];
  for (const tier of ['panic', 'emergency', 'aoe', 'main', 'hot'] as const) {
    for (const r of buckets[tier]) {
      if (tier === 'aoe' && r.action.kind === 'spell') {
        const sp = lookup(r.action.spellId);
        recoveryHeals.push(sp ? withAoeHealGates(r, sp) : withTriageGate(r, COMPANION_TRIAGE_PCT));
      } else if (tier === 'hot' && r.action.kind === 'spell') {
        // Triage + "not already on the hurt ally" — pure HoTs must never GCD-spam.
        recoveryHeals.push(
          withHotMissingGate(withTriageGate(r, tierThreshold(tier, hasMainDirect)), r.action.spellId),
        );
      } else {
        recoveryHeals.push(withTriageGate(r, tierThreshold(tier, hasMainDirect)));
      }
    }
  }

  // Non-heal recovery first (PWS / potions / defensives), then the heal ladder.
  // Potions stay self-gated; shields keep their Weakened Soul / buff conditions.
  return {
    ...rot,
    phases: {
      ...rot.phases,
      buffs,
      pull,
      combat,
      recovery: [...recoveryNonHeal, ...recoveryHeals],
    },
  };
}

// Companion healer adaptation — same ladder as the player dungeon-healer path. See {@link
// adaptHealerRotation}.
export function healerize(rot: Rotation, ds: DataStore, knownSpellIds?: readonly number[]): Rotation {
  return adaptHealerRotation(
    rot,
    (id) => ds.spell(id) as HealSpellLike | undefined,
    knownSpellIds,
  );
}

/** Collapse trainer ranks of the same family so rank-1 Sunder/Maul never outranks the best known. */
function preferBestRankSpellIds(
  ids: readonly number[],
  ds: DataStore,
): number[] {
  const best = new Map<string, { id: number; score: number }>();
  const order: string[] = [];
  for (const id of ids) {
    const sp = ds.spell(id) as HealSpellLike | undefined;
    if (!sp) continue;
    const key = healFamilyKey(sp);
    const score = rankScore(sp);
    const prev = best.get(key);
    if (!prev) {
      order.push(key);
      best.set(key, { id, score });
    } else if (score > prev.score) {
      best.set(key, { id, score });
    }
  }
  return order.map((k) => best.get(k)!.id);
}

// Tank adaptation: put the combat form, the taunt and the threat tools at the front of combat so a
// DPS-shaped default still holds aggro. Idempotent for an already-authored single-target taunt.
export function tankize(rot: Rotation, knownSpellIds: readonly number[], ds: DataStore): Rotation {
  // --- Buffs: RF keep-up; drop Salvation (anti-tank) ---
  let buffs = rot.phases.buffs;
  let buffsDirty = false;
  if (buffs.some((r) => r.action.kind === 'spell' && isSalvationBlessing(r.action.spellId, ds))) {
    buffs = buffs.filter(
      (r) => !(r.action.kind === 'spell' && isSalvationBlessing(r.action.spellId, ds)),
    );
    buffsDirty = true;
  }
  const hasRfBuff = buffs.some(
    (r) => r.action.kind === 'spell' && isRighteousFurySpell(r.action.spellId, ds),
  );
  const rfId = knownSpellIds.find((id) => isRighteousFurySpell(id, ds));
  if (rfId != null && !hasRfBuff) {
    buffs = [
      {
        id: 'g-rf',
        action: { kind: 'spell', spellId: rfId },
        conditions: [{ subject: 'self', metric: 'buffPresent', op: '==', value: 0, ref: rfId }],
        enabled: true,
      },
      ...buffs,
    ];
    buffsDirty = true;
  } else if (hasRfBuff) {
    // Ensure RF is not unconditional thrash (empty-effect bake → "always" in combat fallout).
    const next: RotationRule[] = buffs.map((r) => {
      if (r.action.kind !== 'spell' || !isRighteousFurySpell(r.action.spellId, ds)) return r;
      if (r.conditions.some((c) => c.metric === 'buffPresent')) return r;
      buffsDirty = true;
      const cond: Condition = {
        subject: 'self',
        metric: 'buffPresent',
        op: '==',
        value: 0,
        ref: r.action.spellId,
      };
      return { ...r, conditions: [cond] };
    });
    if (buffsDirty) buffs = next;
  }

  // Strip RF / Salvation / Cat Form from combat body — handled above or demoted.
  const needsCombatStrip = rot.phases.combat.some((r) => {
    if (r.action.kind !== 'spell') return false;
    const id = r.action.spellId;
    return isRighteousFurySpell(id, ds) || isSalvationBlessing(id, ds) || isCatFormSpell(id, ds);
  });
  const combatIn = needsCombatStrip
    ? rot.phases.combat.filter((r) => {
      if (r.action.kind !== 'spell') return true;
      const id = r.action.spellId;
      if (isRighteousFurySpell(id, ds)) return false;
      if (isSalvationBlessing(id, ds)) return false;
      if (isCatFormSpell(id, ds)) return false;
      return true;
    })
    : rot.phases.combat;

  // Existing ST taunt rule (not Challenging*)?
  const hasStTauntRule = ROTATION_PHASES.some((p) =>
    (p === 'combat' ? combatIn : rot.phases[p]).some(
      (r) =>
        r.action.kind === 'spell'
        && isTauntSpell(r.action.spellId, ds)
        && !isAoeTauntSpell(r.action.spellId, ds),
    ),
  );

  const head: RotationRule[] = [];

  // 1) Combat form enter (Defensive / Bear / Dire Bear) — prefer Dire Bear over Bear.
  const formIds = preferBestRankSpellIds(
    knownSpellIds.filter((id) => isTankFormEnter(id, ds)),
    ds,
  ).sort((a, b) => {
    const na = (ds.spell(a)?.name ?? '').toLowerCase();
    const nb = (ds.spell(b)?.name ?? '').toLowerCase();
    // Dire Bear before Bear; Defensive Stance alone.
    if (na.includes('dire') && !nb.includes('dire')) return -1;
    if (nb.includes('dire') && !na.includes('dire')) return 1;
    return a - b;
  });
  // One form enter only: Dire Bear wins over Bear; Defensive if warrior.
  let formPick: number | undefined;
  for (const id of formIds) {
    const n = (ds.spell(id)?.name ?? '').toLowerCase();
    if (n === 'dire bear form') {
      formPick = id;
      break;
    }
  }
  if (formPick == null) {
    formPick = formIds.find((id) => /^bear form$/i.test(ds.spell(id)?.name ?? ''))
      ?? formIds.find((id) => /defensive stance/i.test(ds.spell(id)?.name ?? ''))
      ?? formIds[0];
  }
  const hasFormRule = combatIn.some(
    (r) => r.action.kind === 'spell' && isTankFormEnter(r.action.spellId, ds),
  );
  if (formPick != null && !hasFormRule) {
    const sp = ds.spell(formPick);
    const fid = sp ? formIdFromSpell(sp) : 0;
    // formId != fid: enter when not already in this form (Bear family treats Dire as match for == BEAR).
    const formConds: Condition[] = fid > 0
      ? [{ subject: 'self', metric: 'formId', op: '!=', value: fid }]
      : [];
    head.push({
      id: 'g-tank-form',
      action: { kind: 'spell', spellId: formPick },
      conditions: formConds,
      enabled: true,
    });
  }

  // 2) ST taunt when not tanking the focus.
  if (!hasStTauntRule) {
    const taunt = pickPrimaryTaunt(knownSpellIds, ds);
    if (taunt != null) {
      head.push({
        id: 'g-taunt',
        action: { kind: 'spell', spellId: taunt },
        conditions: [{ subject: 'self', metric: 'targetAttackingMe', op: '==', value: 0 }],
        enabled: true,
      });
    }
  }

  // 3) Promote ST threat tools + inject missing; collapse ranks.
  const threatIds = preferBestRankSpellIds(
    knownSpellIds.filter((id) => isThreatSpell(id, ds) && !isMultiThreatSpell(id, ds)),
    ds,
  );
  // 4) Multi threat tools for packs.
  const multiIds = preferBestRankSpellIds(
    knownSpellIds.filter(
      (id) => (isMultiThreatSpell(id, ds) && !isTauntSpell(id, ds)) || isAoeTauntSpell(id, ds),
    ),
    ds,
  );

  const promoted: RotationRule[] = [];
  const rest: RotationRule[] = [];
  const seenThreat = new Set<number>();
  const seenMulti = new Set<number>();
  const threatSet = new Set(threatIds);
  const multiSet = new Set(multiIds);

  // Keep form enter + ST taunt rules already in combat near the head (order: form → taunt → threat).
  const existingForm: RotationRule[] = [];
  const existingStTaunt: RotationRule[] = [];
  for (const r of combatIn) {
    if (r.action.kind === 'spell' && isTankFormEnter(r.action.spellId, ds)) {
      existingForm.push(r);
      continue;
    }
    if (
      r.action.kind === 'spell'
      && isTauntSpell(r.action.spellId, ds)
      && !isAoeTauntSpell(r.action.spellId, ds)
    ) {
      // Ensure targetAttackingMe gate on authored ST taunts.
      const hasTauntGate = r.conditions.some((c) => c.metric === 'targetAttackingMe');
      existingStTaunt.push(
        hasTauntGate
          ? r
          : {
            ...r,
            conditions: [
              ...r.conditions,
              { subject: 'self', metric: 'targetAttackingMe', op: '==', value: 0 },
            ],
          },
      );
      continue;
    }
    if (r.action.kind === 'spell' && multiSet.has(r.action.spellId)) {
      if (!seenMulti.has(r.action.spellId)) {
        seenMulti.add(r.action.spellId);
        if (isConsecrationSpell(r.action.spellId, ds)) {
          // Tank Consecration fires on single targets too — strip any authored pack gate.
          promoted.push({
            ...r,
            conditions: r.conditions.filter((c) => c.metric !== 'enemyCount'),
          });
        } else {
          // Ensure pack gate on multi tools.
          const hasEnemyGate = r.conditions.some((c) => c.metric === 'enemyCount');
          promoted.push(
            hasEnemyGate
              ? r
              : {
                ...r,
                conditions: [
                  ...r.conditions,
                  { subject: 'self', metric: 'enemyCount', op: '>=', value: 2 },
                ],
              },
          );
        }
      }
      continue;
    }
    if (r.action.kind === 'spell' && threatSet.has(r.action.spellId)) {
      if (!seenThreat.has(r.action.spellId)) {
        seenThreat.add(r.action.spellId);
        promoted.push(r);
      }
      continue;
    }
    rest.push(r);
  }

  // Multi tools BEFORE ST threat (Sunder): packs get Cleave/TC/Demo first.
  for (const id of multiIds) {
    if (seenMulti.has(id)) continue;
    // AoE taunt: only when not on me AND pack (or always pack peel).
    const conds: Condition[] = isAoeTauntSpell(id, ds)
      ? [
        { subject: 'self', metric: 'targetAttackingMe', op: '==', value: 0 },
        { subject: 'self', metric: 'enemyCount', op: '>=', value: 2 },
      ]
      : isConsecrationSpell(id, ds)
        ? [] // Prot ST threat tool — no pack gate
        : [{ subject: 'self', metric: 'enemyCount', op: '>=', value: 2 }];
    promoted.push({
      id: `g-multi-${id}`,
      action: { kind: 'spell', spellId: id },
      conditions: conds,
      enabled: true,
    });
    seenMulti.add(id);
  }
  for (const id of threatIds) {
    if (seenThreat.has(id)) continue;
    // No enemyCount gate on Sunder. The x5 stack cap already stops the spam and the pack tools sit
    // above it, so a gate only ever meant "the tank stops threat once a second mob exists".
    const conds: Condition[] = [];
    promoted.push({
      id: `g-threat-${id}`,
      action: { kind: 'spell', spellId: id },
      conditions: conds,
      enabled: true,
    });
    seenThreat.add(id);
  }

  // Order: form enter → ST taunt → threat/multi → rest
  const formHead = head.filter(
    (r) => r.id === 'g-tank-form'
      || (r.action.kind === 'spell' && isTankFormEnter(r.action.spellId, ds)),
  );
  const tauntHead = head.filter(
    (r) => r.id === 'g-taunt'
      || (r.action.kind === 'spell'
        && isTauntSpell(r.action.spellId, ds)
        && !isAoeTauntSpell(r.action.spellId, ds)),
  );
  const otherHead = head.filter((r) => !formHead.includes(r) && !tauntHead.includes(r));

  const newCombat = [
    ...formHead,
    ...existingForm,
    ...tauntHead,
    ...existingStTaunt,
    ...otherHead,
    ...promoted,
    ...rest,
  ];

  // Drop rules whose formId gate can never fire under the enforced tank stance — the Berserker and
  // Cat tails under a Defensive or Bear anchor. A rotation that itself enters that form keeps them.
  const enteredCombatForms = new Set<number>();
  for (const r of newCombat) {
    if (r.action.kind !== 'spell') continue;
    const sp = ds.spell(r.action.spellId);
    const fid = sp ? formIdFromSpell(sp) : 0;
    if (fid > 0) enteredCombatForms.add(fid);
  }
  const formGateSatisfiable = (expected: number): boolean => {
    for (const f of enteredCombatForms) {
      if (expected === 5 ? f === 5 || f === 8 : f === expected) return true;
    }
    return false;
  };
  const combatFinal = enteredCombatForms.size === 0
    ? newCombat
    : newCombat.filter((r) => {
      if (r.action.kind !== 'spell') return true;
      // Form ENTER rules gate with `!=` — only ability `==` requirements are strippable.
      const sp = ds.spell(r.action.spellId);
      if (sp && formIdFromSpell(sp) > 0) return true;
      const gate = r.conditions.find((c) => c.metric === 'formId' && c.op === '==');
      if (!gate) return true;
      return formGateSatisfiable(gate.value);
    });

  // Also strip RF thrash / Cat from pull; ensure Defensive/Bear on pull if missing.
  let pull = rot.phases.pull;
  let pullDirty = false;
  if (pull.some((r) => r.action.kind === 'spell' && (isCatFormSpell(r.action.spellId, ds) || isRighteousFurySpell(r.action.spellId, ds)))) {
    pull = pull.filter((r) => {
      if (r.action.kind !== 'spell') return true;
      if (isCatFormSpell(r.action.spellId, ds)) return false;
      if (isRighteousFurySpell(r.action.spellId, ds)) return false;
      return true;
    });
    pullDirty = true;
  }
  if (formPick != null && !pull.some((r) => r.action.kind === 'spell' && isTankFormEnter(r.action.spellId, ds))) {
    const sp = ds.spell(formPick);
    const fid = sp ? formIdFromSpell(sp) : 0;
    pull = [
      {
        id: 'g-tank-form-pull',
        action: { kind: 'spell', spellId: formPick },
        conditions: fid > 0
          ? [{ subject: 'self', metric: 'formId', op: '!=', value: fid }]
          : [],
        enabled: true,
      },
      ...pull,
    ];
    pullDirty = true;
  }

  // Recovery: in-form survival first, form-dropping heals last. A bear opening with Healing Touch
  // leaves form mid-tank, so push those to a 25% last resort and prepend the known survival CDs.
  let recovery = rot.phases.recovery;
  let recoveryDirty = false;
  const anchorSpell = formPick != null ? ds.spell(formPick) : undefined;
  const anchorFormId = anchorSpell ? formIdFromSpell(anchorSpell) : 0;
  if (anchorFormId === 5 || anchorFormId === 8) {
    // A rule that LEAVES the form: a caster-form-only heal (stances 0), or the authored
    // "shift out" ladder — a form spell recast while inside it (recast toggles off).
    const leavesForm = (r: RotationRule): boolean => {
      if (r.action.kind !== 'spell') return false;
      const sp = ds.spell(r.action.spellId);
      if (!sp) return false;
      if (spellIsHeal(sp as HealSpellLike) && (sp.stances ?? 0) === 0) return true;
      const fid = formIdFromSpell(sp);
      return fid > 0 && r.conditions.some(
        (c) => c.metric === 'formId' && c.op === '==' && c.value === fid,
      );
    };
    const next = recovery.map((r) => {
      if (!leavesForm(r)) return r;
      const kept = r.conditions.filter(
        (c) => !(c.metric === 'healthPct' && c.subject !== 'target'),
      );
      recoveryDirty = true;
      return {
        ...r,
        conditions: [
          ...kept,
          { subject: 'self', metric: 'healthPct', op: '<', value: 25 } as Condition,
        ],
      };
    });
    if (recoveryDirty) recovery = next;
  }
  const survivalWants: Array<{ match: RegExp; conds: Condition[] }> = [
    { match: /^last stand$/i, conds: [{ subject: 'self', metric: 'healthPct', op: '<', value: 30 }] },
    { match: /^shield wall$/i, conds: [{ subject: 'self', metric: 'healthPct', op: '<', value: 20 }] },
    // Frenzied Regeneration converts rage→health and is bear-only (spell 22842 stances).
    {
      match: /^frenzied regeneration$/i,
      conds: [
        { subject: 'self', metric: 'healthPct', op: '<', value: 50 },
        { subject: 'self', metric: 'formId', op: '==', value: 5 },
      ],
    },
    { match: /^barkskin$/i, conds: [{ subject: 'self', metric: 'healthPct', op: '<', value: 50 }] },
  ];
  const survivalRules: RotationRule[] = [];
  for (const w of survivalWants) {
    const id = preferBestRankSpellIds(
      knownSpellIds.filter((sid) => w.match.test(ds.spell(sid)?.name ?? '')),
      ds,
    )[0];
    if (id == null) continue;
    const present = ROTATION_PHASES.some((p) =>
      (p === 'recovery' ? recovery : rot.phases[p]).some(
        (r) => r.action.kind === 'spell' && r.action.spellId === id,
      ))
      || combatFinal.some((r) => r.action.kind === 'spell' && r.action.spellId === id);
    if (present) continue;
    survivalRules.push({
      id: `g-survival-${id}`,
      action: { kind: 'spell', spellId: id },
      conditions: w.conds,
      enabled: true,
    });
  }
  if (survivalRules.length) {
    recovery = [...survivalRules, ...recovery];
    recoveryDirty = true;
  }

  const combatDirty =
    head.length > 0
    || promoted.length > 0
    || existingForm.length > 0
    || existingStTaunt.length > 0
    || needsCombatStrip
    || combatFinal.length !== rot.phases.combat.length
    || combatFinal.some((r, i) => r !== rot.phases.combat[i]);

  if (!buffsDirty && !pullDirty && !combatDirty && !recoveryDirty) return rot;

  return {
    ...rot,
    phases: {
      ...rot.phases,
      buffs,
      pull,
      combat: combatDirty ? combatFinal : rot.phases.combat,
      recovery: recoveryDirty ? recovery : rot.phases.recovery,
    },
  };
}

// Gate multi-target spells on aoeMode != single so the companion knob and the editor can suppress
// cleave. Existing gates are left alone, nothing is reordered, and the same reference comes back.
export function aoeize(rot: Rotation, ds: DataStore): Rotation {
  const suppressSingle: Condition = {
    subject: 'self',
    metric: 'aoeMode',
    op: '!=',
    value: AOE_MODE_CODE.single,
  };
  let changed = false;
  const adapt = (rules: RotationRule[]): RotationRule[] =>
    rules.map((r) => {
      if (r.action.kind !== 'spell') return r;
      if (!isMultiTargetCombatSpell(ds.spell(r.action.spellId))) return r;
      if (r.conditions.some((c) => c.metric === 'aoeMode')) return r;
      changed = true;
      return { ...r, conditions: [...r.conditions, { ...suppressSingle }] };
    });
  const phases = {
    prebuff: adapt(rot.phases.prebuff ?? []),
    buffs: adapt(rot.phases.buffs),
    pull: adapt(rot.phases.pull),
    combat: adapt(rot.phases.combat),
    recovery: adapt(rot.phases.recovery),
  };
  return changed ? { ...rot, phases } : rot;
}

// For a non-healer companion that knows a heal, prepend an emergency off-heal gated on the knob,
// a dead-or-dry party healer and a low ally. A no-op when such a row already exists.
export function offHealize(rot: Rotation, knownSpellIds: readonly number[], ds: DataStore): Rotation {
  const hasOffHealGate = ROTATION_PHASES.some((p) =>
    rot.phases[p].some(
      (r) =>
        r.action.kind === 'spell'
        && isHealSpell(r.action.spellId, ds)
        && r.conditions.some((c) => c.metric === 'offHealAllowed'),
    ),
  );
  if (hasOffHealGate) return rot;
  // Prefer a direct heal over a pure HoT for the emergency off-heal button.
  const healId =
    knownSpellIds.find((id) => {
      const tier = classifyHealTier(ds.spell(id) as HealSpellLike);
      return tier === 'emergency' || tier === 'main' || tier === 'panic';
    })
    ?? knownSpellIds.find((id) => isHealSpell(id, ds));
  if (healId == null) return rot;
  const rule: RotationRule = {
    id: 'g-offheal',
    action: { kind: 'spell', spellId: healId },
    conditions: [
      { subject: 'self', metric: 'offHealAllowed', op: '==', value: 1 },
      { subject: 'self', metric: 'healerPowerPct', op: '<', value: HEALER_DRY_POWER_PCT },
      { subject: 'self', metric: 'allyLowestHpPct', op: '<', value: COMPANION_OFF_HEAL_PCT },
    ],
    enabled: true,
  };
  return { ...rot, phases: { ...rot.phases, combat: [rule, ...rot.phases.combat] } };
}

