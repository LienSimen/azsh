// Pure "when" string to Condition mapper for rotation suggestions. Suggestions are free text and
// runtime rules are numeric refs, so this maps to a symbolic shape that materializes to DB ids.

import type { CondMetric, CondOp, CondSubject, Condition } from '../rotation/rotation.ts';
import { SOUL_SHARD_ITEM } from '../core/ids.ts';
import { SHAPESHIFT_FORM, type TotemSlot } from '../../data/schema.ts';
import { totemSlotIndex } from '../spells/totem.ts';
import { SCHOOL_INDEX } from '../creature/creatureAi.ts';

// ---- Named debuff / item constants (Wave 1C) ------------------------------

// High-traffic named debuffs suggestions refer to by name rather than action spell id. Judgement of
// Light and Wisdom stay out: debuffPresent matches an EXACT id, so one key would gate a wrong rank.
export const NAMED_DEBUFF_SPELL_IDS = {
  /** Classic Power Word: Shield anti-stack debuff. */
  WEAKENED_SOUL: 6788,
} as const;

export type NamedDebuffKey = keyof typeof NAMED_DEBUFF_SPELL_IDS;

/** Classic Power Word: Shield anti-stack debuff (spell-data id). */
export const WEAKENED_SOUL_SPELL_ID = NAMED_DEBUFF_SPELL_IDS.WEAKENED_SOUL;

// Retired: `debuffStacks` now exists, so an authored low-stacks phrase maps to debuffStacks under the
// cap — reapply until the stack cap, as with Sunder at five.
export const DEBUFF_LOW_STACKS_SIMPLIFIED_TO_ABSENT = false;

// Sentinel `value` for stack conditions: replaced at materialize time by the action spell's own StackAmount
// (5 for Sunder). Falls back to {@link DEFAULT_STACK_CAP}.
export const ACTION_STACK_CAP = -1;
export const DEFAULT_STACK_CAP = 5;

/** Soul Shard item entry - same as domain/ids SOUL_SHARD_ITEM. */
export const SOUL_SHARD_ITEM_REF = SOUL_SHARD_ITEM;

// ---- Intermediate condition shape -----------------------------------------

// Placeholder refs until the suggestion rule's spell/item id is known. Numeric refs are already final (e.g.
// soul shard, Weakened Soul).
export type WhenRefPlaceholder = 'ACTION_SPELL' | 'ITEM' | 'TOTEM_SLOT' | NamedDebuffKey;

export type WhenRef = number | WhenRefPlaceholder;

/** One guard produced by mapWhen - same fields as Condition, with symbolic ref. */
export interface WhenCondition {
  subject: CondSubject;
  metric: CondMetric;
  op: CondOp;
  value: number;
  ref?: WhenRef;
}

export type WhenMapStatus = 'mapped' | 'partial' | 'unmapped' | 'always' | 'noop';

/** Engine / policy flags surfaced for audit and class agents. */
export type WhenMapFlag =
  | 'totem'
  | 'form-or-stance'
  | 'weapon-imbue'
  | 'multi-target'
  | 'talent-gated'
  | 'positional'
  | 'stacks'
  | 'combo-points'
  | 'or-condition'
  | 'needs-debuff-id';

export interface WhenMapResult {
  status: WhenMapStatus;
  conditions: WhenCondition[];
  reason?: string;
  flags: WhenMapFlag[];
}

// Flags that force partial or unmapped until engine metrics land. Multi-target, form, totem, weapon
// imbue and stacks are no longer gaps: they still flag for audit but do not block mapping.
export const ENGINE_GAP_FLAGS: readonly WhenMapFlag[] = [
  'combo-points',
  'positional',
] as const;

// ---- Form / stance label → formId (Wave 1A) --------------------------------

// Resolve a spell label or "in … Form/Stance" fragment to a shapeshift form id. Order matters: "dire bear"
// before "bear". Returns null when unknown.
export function formIdFromLabel(label: string): number | null {
  const s = String(label || '').toLowerCase().trim();
  if (!s) return null;
  // Dire before bare bear
  if (/\bdire\s*bear\b/.test(s)) return SHAPESHIFT_FORM.DIREBEAR;
  if (/\bbear(?:\s*form)?\b/.test(s)) return SHAPESHIFT_FORM.BEAR;
  if (/\bcat(?:\s*form)?\b/.test(s)) return SHAPESHIFT_FORM.CAT;
  if (/\btravel(?:\s*form)?\b/.test(s)) return SHAPESHIFT_FORM.TRAVEL;
  if (/\baquatic(?:\s*form)?\b/.test(s)) return SHAPESHIFT_FORM.AQUA;
  if (/\bmoonkin(?:\s*form)?\b/.test(s)) return SHAPESHIFT_FORM.MOONKIN;
  if (/\btree(?:\s*of\s*life)?\b/.test(s)) return SHAPESHIFT_FORM.TREE;
  // Single-word "Shadowform" (no space before form) - priest Wave 2.
  if (/\bshadowform\b/.test(s)) return SHAPESHIFT_FORM.SHADOWFORM;
  if (/\bbattle\s*stance\b/.test(s)) return SHAPESHIFT_FORM.BATTLESTANCE;
  if (/\bdefensive\s*stance\b/.test(s)) return SHAPESHIFT_FORM.DEFENSIVESTANCE;
  if (/\bberserker\s*stance\b/.test(s)) return SHAPESHIFT_FORM.BERSERKERSTANCE;
  if (/\b(?:stealth|prowl)\b/.test(s)) return SHAPESHIFT_FORM.STEALTH;
  return null;
}

// True when the spell label is a known form/stance enter ability. Any label that resolves via
// formIdFromLabel (including single-word Shadowform).
export function isFormOrStanceSpellLabel(spellLabel: string): boolean {
  return formIdFromLabel(spellLabel) != null;
}

/** Suggestion `(multi)` → living enemies >= 2. Subject ignored by evaluator. */
export const MULTI_ENEMY_COUNT_COND: WhenCondition = {
  subject: 'self',
  metric: 'enemyCount',
  op: '>=',
  value: 2,
};

/** Suggestion `(single)` → living enemies < 2 (bosses / hard ST). Subject ignored. */
export const SINGLE_ENEMY_COUNT_COND: WhenCondition = {
  subject: 'self',
  metric: 'enemyCount',
  op: '<',
  value: 2,
};

function pushMultiGate(conditions: WhenCondition[], flags: WhenMapFlag[]): void {
  pushUniqueFlag(flags, 'multi-target');
  if (!conditions.some((c) => c.metric === 'enemyCount')) {
    conditions.push({ ...MULTI_ENEMY_COUNT_COND });
  }
}

function pushSingleGate(conditions: WhenCondition[], flags: WhenMapFlag[]): void {
  // Trace-only: single is the inverse of multi, not a separate engine gap.
  if (!conditions.some((c) => c.metric === 'enemyCount')) {
    conditions.push({ ...SINGLE_ENEMY_COUNT_COND });
  }
  // Keep multi-target flag out so audits do not treat ST gates as pack tools.
  void flags;
}

// ---- Helpers --------------------------------------------------------------

function isCondOp(s: string): s is CondOp {
  return s === '<' || s === '<=' || s === '>' || s === '>=' || s === '==' || s === '!=';
}

function pushUniqueFlag(flags: WhenMapFlag[], f: WhenMapFlag): void {
  if (!flags.includes(f)) flags.push(f);
}

// Weapon imbue and poison apply spells, excluding totem names — a Flametongue Totem is not an imbue.
// Gates use weaponImbuePresent at ref 2, open eligible hands, not the apply spell's own buff.
export function isWeaponImbueSpellLabel(spellLabel: string): boolean {
  const s = String(spellLabel || '').toLowerCase();
  if (!s || /\btotem\b/.test(s)) return false;
  // Rogue poisons (items or apply spells)
  if (/\b(instant|deadly|crippling|mind-numbing|wound)\s+poison\b/.test(s)) return true;
  // Authored rank shorthand without the word "poison" (e.g. "Instant VI / Deadly V")
  if (/\binstant\b/.test(s) && /\bdeadly\b/.test(s)) return true;
  if (/^instant\s+(vi|v|iv|iii|ii|i)\b/.test(s)) return true;
  if (/^deadly\s+(vi|v|iv|iii|ii|i)\b/.test(s)) return true;
  // Shaman weapon imbues
  if (/\brockbiter\b/.test(s)) return true;
  if (/\bwindfury weapon\b/.test(s)) return true;
  if (/\bflametongue weapon\b/.test(s)) return true;
  if (/\bfrostbrand weapon\b/.test(s)) return true;
  // Slash alt: "Windfury Weapon or Flametongue" (second label omits "Weapon")
  if (/\b(or flametongue|flametongue or)\b/.test(s)) return true;
  return false;
}

/** True when the spell label is a totem summon (name contains "totem"). */
export function isTotemSpellLabel(spellLabel: string): boolean {
  return /\btotem\b/i.test(String(spellLabel || ''));
}

// Defense-react spenders (vanilla Revenge): only usable after the caster dodge/parry/blocks. Bare
// "usable"/"always" on these labels must not become unconditional filler.
export function isDefenseReactSpellLabel(spellLabel: string): boolean {
  return /\brevenge\b/i.test(String(spellLabel || ''));
}

/** Self.defenseReactRecently == 1 — Revenge / block-parry-dodge react gate. */
export const DEFENSE_REACT_COND: WhenCondition = {
  subject: 'self',
  metric: 'defenseReactRecently',
  op: '==',
  value: 1,
};

/** Self.inMelee == 1 — Raptor Strike / melee-only spenders while in melee range. */
export const IN_MELEE_COND: WhenCondition = {
  subject: 'self',
  metric: 'inMelee',
  op: '==',
  value: 1,
};

function spellGapFlags(spellLabel: string, flags: WhenMapFlag[]): void {
  const spellL = String(spellLabel || '').toLowerCase();
  if (/totem/.test(spellL)) pushUniqueFlag(flags, 'totem');
  if (
    /\b(cat form|bear form|dire bear|travel form|aquatic form|moonkin(?:\s*form)?|tree(?:\s*of\s*life)?|shadowform|battle stance|defensive stance|berserker stance|prowl|stealth)\b/.test(
      spellL,
    )
  ) {
    pushUniqueFlag(flags, 'form-or-stance');
  }
  if (isWeaponImbueSpellLabel(spellLabel)) {
    pushUniqueFlag(flags, 'weapon-imbue');
  }
}

/** "debuff absent/low stacks" - reapply until the stack cap (Sunder x5). */
function isLowStacksWhen(when: string): boolean {
  return /absent\s*\/\s*low\s+stacks|low\s+stacks/.test(when);
}

function whenGapFlags(when: string, flags: WhenMapFlag[]): void {
  if (/\bmulti\b/.test(when)) pushUniqueFlag(flags, 'multi-target');
  if (/if talented|if dipped|if available/.test(when)) pushUniqueFlag(flags, 'talent-gated');
  if (/from behind|positional|backstab from/.test(when)) pushUniqueFlag(flags, 'positional');
  // stacks: trace-only since the debuffStacks metric landed (no longer an engine gap)
  if (/stacks?/.test(when)) pushUniqueFlag(flags, 'stacks');
  if (/combo|finish|cp\b|points?/.test(when)) pushUniqueFlag(flags, 'combo-points');
  if (/form|shapeshift|cat form|bear form|stance/.test(when)) pushUniqueFlag(flags, 'form-or-stance');
  if (/totem/.test(when)) pushUniqueFlag(flags, 'totem');
  // "or" inside armor phrases (Demon Skin/Armor) is not an OR-condition
  if (/\bor\b/.test(when) && !/armor/.test(when)) pushUniqueFlag(flags, 'or-condition');
}

function gapReason(flags: WhenMapFlag[]): string {
  const bits = flags.filter((f) => (ENGINE_GAP_FLAGS as readonly string[]).includes(f) || f === 'or-condition');
  return bits.length ? `engine gap: ${bits.join(', ')}` : 'OR: took primary clause only (no full OR DSL)';
}

// Bare session-gate clauses meaning "always when usable". When any OR branch is one of these, keep
// empty conditions rather than a restrictive primary, which would drop the filler branch.
function isSessionAlwaysOrClause(clause: string): boolean {
  const c = clause.trim();
  if (!c) return true;
  if (
    c === 'always' ||
    c === 'usable' ||
    c === 'opener' ||
    c === 'filler' ||
    c === 'fallback' ||
    c === 'lower priority' ||
    c === 'off cd' ||
    c === 'off cooldown'
  ) {
    return true;
  }
  // "always (highest rank)" etc. — still session-only unless multi-gated
  if (/^always\b/.test(c) && !/\bmulti\b/.test(c)) return true;
  return false;
}

function alwaysOrPartial(
  flags: WhenMapFlag[],
  reason?: string,
): WhenMapResult {
  const blocked = flags.length > 0;
  return {
    status: blocked ? 'partial' : 'always',
    conditions: [],
    flags,
    reason: blocked ? reason ?? `spell/when needs engine: ${flags.join(', ')}` : reason,
  };
}

// Result after attaching multi (or other) conditions on an "always-style" when. Remaining ENGINE_GAP_FLAGS
// / OR / talent-gated keep status partial; multi alone is mapped.
function multiAwareResult(
  conditions: WhenCondition[],
  flags: WhenMapFlag[],
  reason?: string,
): WhenMapResult {
  const hasGap = flags.some((f) => (ENGINE_GAP_FLAGS as readonly string[]).includes(f));
  const softPartial = flags.includes('or-condition') || flags.includes('talent-gated') || flags.includes('needs-debuff-id');
  if (hasGap || softPartial) {
    return {
      status: conditions.length ? 'partial' : 'unmapped',
      conditions,
      flags,
      reason: reason ?? gapReason(flags),
    };
  }
  return {
    status: conditions.length ? 'mapped' : 'always',
    conditions,
    flags,
    reason,
  };
}

// ---- Core mapper ----------------------------------------------------------

// Map a free-text suggestion `when` clause to structured conditions plus an audit status. The spell
// label is used only for the engine-gap flags.
export function mapWhen(whenRaw: string | undefined | null, spellLabel = ''): WhenMapResult {
  const when = String(whenRaw || '')
    .trim()
    .toLowerCase();
  const flags: WhenMapFlag[] = [];
  spellGapFlags(spellLabel, flags);

  // Intentional no-op row
  if (when === 'n/a') return { status: 'noop', conditions: [], flags };

  // Tank taunt peel: target is on someone else (targetAttackingMe == 0).
  // Phrases used by Feral tank / Prot suggestion packs and the rotation editor preset.
  if (
    /target\s+not\s+attacking\s+me|not\s+attacking\s+me|target\s+attacking\s+someone\s+else|your\s+target\s+is\s+attacking\s+someone\s+else|off[\s-]?target|lost\s+aggro|target\s+not\s+on\s+me/.test(
      when,
    )
  ) {
    return {
      status: 'mapped',
      conditions: [{ subject: 'self', metric: 'targetAttackingMe', op: '==', value: 0 }],
      flags,
    };
  }

  // Threat DUMP: the target is on ME — Feint, Cower, Disengage. The inverse of the taunt peel above,
  // and it had no mapping, so the prose the materializer emits could not be read back.
  if (
    /your\s+target\s+is\s+attacking\s+you|target\s+is\s+attacking\s+me|target\s+attacking\s+me|target\s+is\s+on\s+me/.test(
      when,
    )
  ) {
    return {
      status: 'mapped',
      conditions: [{ subject: 'self', metric: 'targetAttackingMe', op: '==', value: 1 }],
      flags,
    };
  }

  // Dodge-reactive abilities: the engine remembers the target's last dodge for 5 s, so "after target
  // dodges" is a real gate. Without it Overpower spam torched the rage bar — 61 casts, 0 kills.
  if (/after\s+(?:target\s+)?dodges?|on\s+dodge/.test(when) && !/parry|block/.test(when)) {
    return {
      status: 'mapped',
      conditions: [{ subject: 'target', metric: 'dodgedRecently', op: '==', value: 1 }],
      flags,
    };
  }
  // Defense reacts (Revenge): self dodge/parry/block within 5s. Phrases like
  // "after a block or parry", "after dodge/parry/block", "on react".
  if (
    /after\s+(?:a\s+)?block|after\s+(?:a\s+)?parry|after\s+(?:a\s+)?dodge|on\s+react|block\s+or\s+parry|dodge.*parry|parry.*block/.test(
      when,
    )
  ) {
    return {
      status: 'mapped',
      conditions: [{ ...DEFENSE_REACT_COND }],
      flags,
    };
  }

  // "always on self" = keep buff up (buff absent)
  // Form/stance enter spells: modal formId, not buffPresent (recast toggles form off).
  if (when === 'always on self') {
    const formOfSpell = formIdFromLabel(spellLabel);
    if (formOfSpell != null && isFormOrStanceSpellLabel(spellLabel)) {
      return {
        status: 'mapped',
        conditions: [{ subject: 'self', metric: 'formId', op: '!=', value: formOfSpell }],
        flags,
      };
    }
    return {
      status: flags.length ? 'partial' : 'mapped',
      conditions: [{ subject: 'self', metric: 'buffPresent', op: '==', value: 0, ref: 'ACTION_SPELL' }],
      flags,
      reason: flags.length ? `spell needs engine: ${flags.join(', ')}` : undefined,
    };
  }

  // Soft always with prose tags
  if (when === 'opener/slow' || when === 'multi/burst') {
    if (/\bsingle\b/.test(when) && !/\bmulti\b/.test(when)) {
      const conditions: WhenCondition[] = [];
      pushSingleGate(conditions, flags);
      return multiAwareResult(conditions, flags, when);
    }
    if (/multi/.test(when)) {
      const conditions: WhenCondition[] = [];
      pushMultiGate(conditions, flags);
      return multiAwareResult(conditions, flags, when);
    }
    // Form enter still needs formId even on soft-always prose (toggle thrash).
    const formSoft = formIdFromLabel(spellLabel);
    if (formSoft != null && isFormOrStanceSpellLabel(spellLabel)) {
      return {
        status: 'mapped',
        conditions: [{ subject: 'self', metric: 'formId', op: '!=', value: formSoft }],
        flags,
      };
    }
    return alwaysOrPartial(flags, when);
  }

  // "usable or …" takes the primary usable, session gates only. Never promote the secondary clause
  // alone: Eviscerate's "usable or target under 40%" must not become execute-only.
  if (/^usable\s+or\b/.test(when)) {
    pushUniqueFlag(flags, 'or-condition');
    const formUsableOr = formIdFromLabel(spellLabel);
    if (formUsableOr != null && isFormOrStanceSpellLabel(spellLabel)) {
      const conditions: WhenCondition[] = [
        { subject: 'self', metric: 'formId', op: '!=', value: formUsableOr },
      ];
      if (/\bmulti\b/.test(when)) pushMultiGate(conditions, flags);
      return multiAwareResult(conditions, flags, 'OR: form enter + primary usable');
    }
    if (/\bmulti\b/.test(when)) {
      const conditions: WhenCondition[] = [];
      pushMultiGate(conditions, flags);
      return multiAwareResult(conditions, flags, 'OR: took primary usable');
    }
    return {
      status: 'partial',
      conditions: [],
      flags,
      reason: 'OR: took primary usable (session gate only)',
    };
  }

  // "always", "always (multi)", plain usable, opener and filler. NOTE: "usable in melee" and
  // "usable (…)" are NOT bare usable — they fall through so the intent is not dropped to ALWAYS.
  if (
    !when ||
    when === 'always' ||
    when === 'usable' ||
    when === 'opener' ||
    when === 'filler' ||
    when === 'fallback' ||
    when === 'lower priority' ||
    /^always\b/.test(when)
  ) {
    if (/if talented|if dipped|if available/.test(when)) pushUniqueFlag(flags, 'talent-gated');
    // `(single)` / "always (single)" — bosses only (Sunder-class ST keep-ups).
    if (/\bsingle\b/.test(when) && !/\bmulti\b/.test(when)) {
      const conditions: WhenCondition[] = [];
      pushSingleGate(conditions, flags);
      return multiAwareResult(conditions, flags);
    }
    if (/\bmulti\b/.test(when)) {
      const conditions: WhenCondition[] = [];
      pushMultiGate(conditions, flags);
      return multiAwareResult(conditions, flags);
    }
    // Wave 1D: totem summons with bare "always"/"usable" still gate on empty element slot
    // so role/suggestion lists never thrash a full slot.
    if (isTotemSpellLabel(spellLabel)) {
      const conditions: WhenCondition[] = [
        { subject: 'self', metric: 'totemPresent', op: '==', value: 0, ref: 'TOTEM_SLOT' },
      ];
      return multiAwareResult(conditions, flags);
    }
    // Weapon imbue: keep up while any eligible weapon hand is open (ref 2).
    if (isWeaponImbueSpellLabel(spellLabel)) {
      const conditions: WhenCondition[] = [
        { subject: 'self', metric: 'weaponImbuePresent', op: '==', value: 0, ref: 2 },
      ];
      return multiAwareResult(conditions, flags);
    }
    // Form/stance enter: gate on formId != form so "always" / empty when never toggle-thrashes
    // (recasting Cat Form while already in Cat leaves form — Classic toggle).
    const formOfAlways = formIdFromLabel(spellLabel);
    if (formOfAlways != null && isFormOrStanceSpellLabel(spellLabel)) {
      const conditions: WhenCondition[] = [
        { subject: 'self', metric: 'formId', op: '!=', value: formOfAlways },
      ];
      return multiAwareResult(conditions, flags);
    }
    // Revenge et al.: bare "usable"/"always" is still a react ability, not free filler.
    if (isDefenseReactSpellLabel(spellLabel)) {
      return {
        status: 'mapped',
        conditions: [{ ...DEFENSE_REACT_COND }],
        flags,
        reason: 'defense-react spell (Revenge) requires dodge/parry/block react',
      };
    }
    return alwaysOrPartial(flags);
  }

  const conditions: WhenCondition[] = [];
  whenGapFlags(when, flags);

  // OR policy, with no full OR DSL: never AND conditions from distinct OR sides, since the runtime
  // ANDs them. A filler branch empties the conditions; otherwise map the primary clause only.
  if (flags.includes('or-condition')) {
    // An "or" inside a parenthetical qualifier is not a top-level OR of clauses, so let it fall
    // through to normal handling rather than dropping the reapply gate to an empty ALWAYS.
    const orOutsideParens = /\bor\b/.test(when.replace(/\([^)]*\)/g, ''));
    const orParts = when.split(/\s+or\s+/).map((p) => p.trim()).filter(Boolean);
    if (orOutsideParens && orParts.length >= 2) {
      if (orParts.some(isSessionAlwaysOrClause)) {
        return {
          status: 'partial',
          conditions: [],
          flags,
          reason: 'OR: took always/filler/usable branch (session gate only)',
        };
      }
      const primary = orParts[0]!;
      const primaryResult = mapWhen(primary, spellLabel);
      const outFlags = [...primaryResult.flags];
      pushUniqueFlag(outFlags, 'or-condition');
      // Keep other audit flags from the full phrase, but do not import multi-target from a
      // secondary-only "… or multi" (that would re-AND the multi gate onto the primary).
      for (const f of flags) {
        if (f === 'or-condition') continue;
        if (f === 'multi-target' && !/\bmulti\b/.test(primary)) continue;
        pushUniqueFlag(outFlags, f);
      }
      if (primaryResult.status === 'noop') {
        return { status: 'noop', conditions: [], flags: outFlags, reason: primaryResult.reason };
      }
      const reason =
        primaryResult.reason && !/or-condition|OR:/.test(primaryResult.reason)
          ? `OR primary: ${primaryResult.reason}`
          : 'OR: took primary clause only (no full OR DSL)';
      return {
        // Authoring still had OR — always partial so audits see the gap, even when the
        // primary clause mapped cleanly on its own.
        status: 'partial',
        conditions: primaryResult.conditions,
        flags: outFlags,
        reason,
      };
    }
  }

  // Wave 1B: multi is a real gate, not only a gap flag.
  if (flags.includes('multi-target')) {
    if (!conditions.some((c) => c.metric === 'enemyCount')) {
      conditions.push({ ...MULTI_ENEMY_COUNT_COND });
    }
  }
  // `(single)` / "single target" — ST-only (Sunder on bosses, not trash packs).
  // Prefer multi when both appear (authored "(multi)" should win).
  if (
    !conditions.some((c) => c.metric === 'enemyCount')
    && /\bsingle\b/.test(when)
    && !/\bmulti\b/.test(when)
  ) {
    conditions.push({ ...SINGLE_ENEMY_COUNT_COND });
  }

  // pet happiness
  const petHappy =
    when.match(/pethappiness\s*([<>]=?)\s*(\d+)/) || when.match(/happiness\s*([<>]=?)\s*(\d+)/);
  if (petHappy && isCondOp(petHappy[1]!)) {
    conditions.push({
      subject: 'pet',
      metric: 'petHappiness',
      op: petHappy[1]!,
      value: +petHappy[2]!,
    });
  }

  // pet not alive / pet alive
  if (/pet\s+(not\s+)?alive|no\s+pet|pet\s+missing|pet\s+dead/.test(when)) {
    const alive = /not|no |missing|dead/.test(when) ? 0 : 1;
    conditions.push({ subject: 'pet', metric: 'alive', op: '==', value: alive });
  }

  // has aggro (any enemy on you) — Feign Death dump. Distinct from "lost aggro" (taunt).
  if (/\bhas\s+aggro\b|\ban\s+enemy\s+is\s+(on|attacking)\s+you\b/.test(when)) {
    if (!conditions.some((c) => c.metric === 'hasAggro')) {
      conditions.push({ subject: 'self', metric: 'hasAggro', op: '==', value: 1 });
    }
  }

  // Buff missing, absent or not active. Form and stance enter use formId rather than buffPresent,
  // since forms are modal and a recast toggles off; totem summons use the empty element slot.
  if (
    (/buff\s+(missing|absent)|buff absent|if not active|not active|missing on self|buff missing/.test(when) ||
      when === 'if not active') &&
    !/debuff/.test(when)
  ) {
    const formOfSpell = formIdFromLabel(spellLabel);
    if (formOfSpell != null && isFormOrStanceSpellLabel(spellLabel)) {
      conditions.push({ subject: 'self', metric: 'formId', op: '!=', value: formOfSpell });
    } else if (isTotemSpellLabel(spellLabel)) {
      conditions.push({
        subject: 'self',
        metric: 'totemPresent',
        op: '==',
        value: 0,
        ref: 'TOTEM_SLOT',
      });
    } else if (isWeaponImbueSpellLabel(spellLabel)) {
      // Open eligible hands (ref 2) — dual-wield fills MH then OH; both coated stops thrash.
      conditions.push({
        subject: 'self',
        metric: 'weaponImbuePresent',
        op: '==',
        value: 0,
        ref: 2,
      });
    } else {
      conditions.push({ subject: 'self', metric: 'buffPresent', op: '==', value: 0, ref: 'ACTION_SPELL' });
    }
  }

  // "in Bear Form" / "in Cat Form" / "in Battle Stance" (Wave 1A formId == id)
  // Prefer explicit "in …" phrases over bare form names in free prose.
  const inFormMatch = when.match(
    /\bin\s+((?:dire\s+)?bear(?:\s+form)?|cat(?:\s+form)?|travel(?:\s+form)?|aquatic(?:\s+form)?|moonkin(?:\s+form)?|tree(?:\s+of\s+life)?|shadowform|battle\s+stance|defensive\s+stance|berserker\s+stance|stealth|prowl)\b/,
  );
  if (inFormMatch) {
    const fid = formIdFromLabel(inFormMatch[1]!);
    if (fid != null && !conditions.some((c) => c.metric === 'formId' && c.op === '==')) {
      conditions.push({ subject: 'self', metric: 'formId', op: '==', value: fid });
    }
  }

  // Group composition — "2+ melee in party". Air-slot buff totems only pay off with melee
  // beneficiaries, and it is evaluated per snapshot so a composition change needs no rebuild.
  const meleeParty = when.match(/(\d+)\+?\s*melee(?:\s+allies)?\s+in\s+(?:the\s+)?party/)
    ?? (/\bmelee in party\b/.test(when) ? ([, '1'] as unknown as RegExpMatchArray) : null);
  if (meleeParty) {
    conditions.push({
      subject: 'self',
      metric: 'meleeAllyCount',
      op: '>=',
      value: Math.max(1, parseInt(meleeParty[1] ?? '1', 10) || 1),
    });
  }

  // Named self-debuffs first (Wave 1C) - must not also match generic target debuff-absent.
  // Weakened Soul: Power Word: Shield anti-stack on self; id is fixed in NAMED_DEBUFF_SPELL_IDS.
  const namedSelfDebuff = /weakened soul/.test(when);
  if (namedSelfDebuff) {
    conditions.push({
      subject: 'self',
      metric: 'debuffPresent',
      op: '==',
      value: 0,
      ref: 'WEAKENED_SOUL',
    });
    // Id is known - no needs-debuff-id flag (Wave 1C resolves Wave 0 placeholder).
  }

  // "debuff absent/low stacks" → reapply until the action spell's stack cap (Sunder x5).
  // ACTION_STACK_CAP is replaced by the spell's own StackAmount at materialize time.
  if (!namedSelfDebuff && isLowStacksWhen(when)) {
    conditions.push({
      subject: 'target',
      metric: 'debuffStacks',
      op: '<',
      value: ACTION_STACK_CAP,
      ref: 'ACTION_SPELL',
    });
  } else if (
    // debuff not present on target (action spell). Skip named self-debuff clauses.
    !namedSelfDebuff &&
    /debuff\s+(not\s+present|absent)|not on target|not present on target|debuff absent/.test(when)
  ) {
    conditions.push({
      subject: 'target',
      metric: 'debuffPresent',
      op: '==',
      value: 0,
      ref: 'ACTION_SPELL',
    });
  }

  // Explicit stack thresholds: "stacks < 5", "stacks >= 3", "at 5 stacks" (>=).
  // Refers to the action spell's own debuff on the target (Sunder, Expose Armor …).
  if (!conditions.some((c) => c.metric === 'debuffStacks')) {
    const stOp = when.match(/stacks?\s*(<=|>=|==|!=|<|>)\s*(\d+)/);
    const stAt = when.match(/(?:at\s+)?(\d+)\s+stacks?/);
    if (stOp && isCondOp(stOp[1]!)) {
      conditions.push({ subject: 'target', metric: 'debuffStacks', op: stOp[1]!, value: +stOp[2]!, ref: 'ACTION_SPELL' });
    } else if (stAt) {
      conditions.push({ subject: 'target', metric: 'debuffStacks', op: '>=', value: +stAt[1]!, ref: 'ACTION_SPELL' });
    }
  }

  // Interrupt gates: "enemy/target (is) casting", "to interrupt", "while casting".
  // Optional flavor: "casting a heal" and "casting <school>" narrow the gate.
  if (/(?:enemy|target)\s+(?:is\s+)?casting|\bto\s+interrupt\b|\binterrupt\b|\bwhile\s+casting\b/.test(when)) {
    conditions.push({ subject: 'target', metric: 'castingPresent', op: '==', value: 1 });
    if (/casting\s+(?:a\s+)?heal|\bheal\s+cast/.test(when)) {
      conditions.push({ subject: 'target', metric: 'castingIsHeal', op: '==', value: 1 });
    }
    const school = when.match(/casting\s+(physical|holy|fire|nature|frost|shadow|arcane)/);
    if (school) {
      conditions.push({
        subject: 'target',
        metric: 'castingSchool',
        op: '==',
        value: SCHOOL_INDEX[school[1] as keyof typeof SCHOOL_INDEX],
      });
    }
  }

  // Melee gate: "usable in melee", "in melee", "melee range" (Raptor Strike, etc.).
  // Snapshot: pairwise band vs the acting unit (self = pile, target = this enemy on you).
  if (/\bin\s+melee\b|\bmelee\s+range\b/.test(when)) {
    if (!conditions.some((c) => c.metric === 'inMelee')) {
      conditions.push({ ...IN_MELEE_COND });
    }
  }

  // "high value" / keep-up prose inside usable parentheticals (Devouring Plague, etc.):
  // re-apply only when the action debuff is absent — never free on-GCD spam.
  if (/\bhigh\s*value\b|\bkeep\s*up\b/.test(when)) {
    if (!conditions.some((c) => c.metric === 'debuffPresent' && c.ref === 'ACTION_SPELL')) {
      conditions.push({
        subject: 'target',
        metric: 'debuffPresent',
        op: '==',
        value: 0,
        ref: 'ACTION_SPELL',
      });
    }
  }

  // Defense-react spell label still needs the react gate when when-string is free prose.
  if (isDefenseReactSpellLabel(spellLabel) && !conditions.some((c) => c.metric === 'defenseReactRecently')) {
    conditions.push({ ...DEFENSE_REACT_COND });
  }

  // health / power thresholds (self)
  const selfHp =
    when.match(/self\s+health(?:pct)?\s*([<>]=?)\s*(\d+)/) || when.match(/health\s*([<>]=?)\s*(\d+)\s*%/);
  if (selfHp && isCondOp(selfHp[1]!)) {
    conditions.push({ subject: 'self', metric: 'healthPct', op: selfHp[1]!, value: +selfHp[2]! });
  }
  // pet power before bare "power" so Dark Pact "pet powerPct > 50% AND self powerPct < 40%" keeps both
  const petPow = when.match(/pet\s+power(?:pct)?\s*([<>]=?)\s*(\d+)/);
  if (petPow && isCondOp(petPow[1]!)) {
    conditions.push({ subject: 'pet', metric: 'powerPct', op: petPow[1]!, value: +petPow[2]! });
  }
  // Prefer `self power…`; bare mana/power only when no pet-power clause stole the word "power"
  const powAlt =
    when.match(/self\s+power(?:pct)?\s*([<>]=?)\s*(\d+)/) ||
    (!petPow ? when.match(/(?:mana|power)\s*([<>]=?)\s*(\d+)\s*%/) : null);
  if (powAlt && isCondOp(powAlt[1]!)) {
    conditions.push({ subject: 'self', metric: 'powerPct', op: powAlt[1]!, value: +powAlt[2]! });
  }

  // target health
  const tarHp = when.match(/target\s+health(?:pct)?\s*([<>]=?)\s*(\d+)/);
  if (tarHp && isCondOp(tarHp[1]!)) {
    conditions.push({ subject: 'target', metric: 'healthPct', op: tarHp[1]!, value: +tarHp[2]! });
  }

  // pet health
  const petHp = when.match(/pet\s+health(?:pct)?\s*([<>]=?)\s*(\d+)/);
  if (petHp && isCondOp(petHp[1]!)) {
    conditions.push({ subject: 'pet', metric: 'healthPct', op: petHp[1]!, value: +petHp[2]! });
  }

  // itemCount - named items (Soul Shard) resolve to fixed entry; others keep ITEM placeholder
  const ic =
    when.match(/itemcount\s*(?:\(\s*['"]?([^'")]+)['"]?\s*\))?\s*([<>]=?)\s*(\d+)/i) ||
    when.match(/itemcount\s*([<>]=?)\s*(\d+)/i);
  if (ic) {
    if (ic.length === 4 && ic[1] && Number.isNaN(+ic[1])) {
      // named item in parens - Soul Shard is a known entry; Healthstone stays ITEM (often missing in bake)
      if (isCondOp(ic[2]!)) {
        const name = String(ic[1]).toLowerCase().trim();
        const ref: WhenRef = /soul\s*shard/.test(name) ? SOUL_SHARD_ITEM_REF : 'ITEM';
        conditions.push({
          subject: 'self',
          metric: 'itemCount',
          op: ic[2]!,
          value: +ic[3]!,
          ref,
        });
      }
    } else if (ic.length === 3 && isCondOp(ic[1]!)) {
      conditions.push({
        subject: 'self',
        metric: 'itemCount',
        op: ic[1]!,
        value: +ic[2]!,
        ref: 'ITEM',
      });
    } else if (ic.length === 4 && isCondOp(ic[2]!)) {
      conditions.push({
        subject: 'self',
        metric: 'itemCount',
        op: ic[2]!,
        value: +ic[3]!,
        ref: 'ITEM',
      });
    }
  }
  const bareCount = when.match(/^itemcount\s*([<>]=?)\s*(\d+)$/);
  if (bareCount && isCondOp(bareCount[1]!) && !conditions.some((c) => c.metric === 'itemCount')) {
    conditions.push({
      subject: 'self',
      metric: 'itemCount',
      op: bareCount[1]!,
      value: +bareCount[2]!,
      ref: 'ITEM',
    });
  }

  // soul shard prose ("soul shards < 2") - match op/value next to the shard phrase only.
  // Do not re-scan the whole when (would steal target healthPct's "< 25" from Drain Soul AND clauses).
  if (/soul\s*shard/.test(when) && !conditions.some((c) => c.metric === 'itemCount' && c.ref === SOUL_SHARD_ITEM_REF)) {
    const m =
      when.match(/soul\s*shards?\s*([<>]=?)\s*(\d+)/) ||
      when.match(/itemcount\s*\(\s*['"]?soul\s*shard['"]?\s*\)\s*([<>]=?)\s*(\d+)/i);
    if (m && isCondOp(m[1]!)) {
      conditions.push({
        subject: 'self',
        metric: 'itemCount',
        op: m[1]!,
        value: +m[2]!,
        ref: SOUL_SHARD_ITEM_REF,
      });
    }
  }

  // off CD - session usability only (audit: after pattern scan; clears conditions)
  if (/^off cd$|off cooldown|on cooldown/.test(when) || when === 'off cd') {
    return alwaysOrPartial(
      flags,
      flags.length ? `spell needs engine: ${flags.join(', ')}` : 'cooldown fallthrough is free',
    );
  }

  const hasGap = flags.some((f) => (ENGINE_GAP_FLAGS as readonly string[]).includes(f));

  if (flags.includes('or-condition') || hasGap) {
    // gap + no extractable conditions → unmapped (cannot implement yet) gap/OR + some conditions → partial
    // (usable AND subset) OR only + no gap → partial
    const status: WhenMapStatus =
      conditions.length || !hasGap
        ? hasGap || flags.includes('or-condition')
          ? 'partial'
          : 'mapped'
        : 'unmapped';
    return {
      status,
      conditions,
      flags,
      reason: gapReason(flags),
    };
  }

  if (conditions.length) return { status: 'mapped', conditions, flags };

  // Bare "usable", with only noise left after stripping, is the session gate. Leftover intent must
  // NOT claim ALWAYS with empty conditions — that silently dropped authored gates.
  if (/usable/.test(when) && conditions.length === 0) {
    const leftover = when
      .replace(/\busable\b/g, ' ')
      .replace(/\b(always|opener|filler|fallback|off\s*cd|on\s*cooldown)\b/g, ' ')
      .replace(/[().,;:/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!leftover) {
      // Still defense-react by label (safety if early branch missed).
      if (isDefenseReactSpellLabel(spellLabel)) {
        return {
          status: 'mapped',
          conditions: [{ ...DEFENSE_REACT_COND }],
          flags,
          reason: 'defense-react spell (Revenge) requires dodge/parry/block react',
        };
      }
      return { status: 'always', conditions: [], flags, reason: 'usable = session gate only' };
    }
    return {
      status: flags.includes('or-condition') || flags.includes('talent-gated') ? 'partial' : 'unmapped',
      conditions: [],
      flags,
      reason: `usable phrase not fully mapped: "${whenRaw}"`,
    };
  }

  return { status: 'unmapped', conditions: [], flags, reason: `no pattern for: "${whenRaw}"` };
}

// ---- Materialize for runtime Rotation -------------------------------------

export interface MaterializeRefs {
  /** Spell id of the rule action (resolves ACTION_SPELL). */
  actionSpellId?: number;
  /** Item entry of the rule action (resolves ITEM). */
  itemEntry?: number;
  // Totem element slot for the action summon spell (resolves TOTEM_SLOT → index 0–3). Wave 1D - from
  // spell's summon_totem effect.
  totemSlot?: TotemSlot;
  // Named debuff overrides (defaults from {@link NAMED_DEBUFF_SPELL_IDS}). Keys match WhenRefPlaceholder
  // names used as debuff ids.
  namedDebuffs?: Partial<Record<NamedDebuffKey, number>>;
  // The action spell's SpellEntry.StackAmount - resolves {@link ACTION_STACK_CAP} sentinel values on stack
  // conditions (Sunder Armor → 5).
  actionStackAmount?: number;
}

// Convert WhenCondition rows to Conditions with numeric refs only, dropping any whose symbolic ref
// cannot be resolved. A condition needing an id that was not supplied is skipped.
export function materializeConditions(
  conditions: readonly WhenCondition[],
  refs: MaterializeRefs = {},
): Condition[] {
  const out: Condition[] = [];

  for (const c of conditions) {
    let refNum: number | undefined;
    if (c.ref == null) {
      refNum = undefined;
    } else if (typeof c.ref === 'number') {
      refNum = c.ref;
    } else if (c.ref === 'ACTION_SPELL') {
      if (refs.actionSpellId == null) continue;
      refNum = refs.actionSpellId;
    } else if (c.ref === 'ITEM') {
      if (refs.itemEntry == null) continue;
      refNum = refs.itemEntry;
    } else if (c.ref === 'TOTEM_SLOT') {
      if (refs.totemSlot == null) continue;
      refNum = totemSlotIndex(refs.totemSlot);
    } else if (c.ref in NAMED_DEBUFF_SPELL_IDS) {
      const key = c.ref as NamedDebuffKey;
      refNum = refs.namedDebuffs?.[key] ?? NAMED_DEBUFF_SPELL_IDS[key];
    } else {
      continue;
    }

    // Stack-cap sentinel → the action spell's own StackAmount (or the classic default of 5).
    let value = c.value;
    if ((c.metric === 'debuffStacks' || c.metric === 'buffStacks') && value === ACTION_STACK_CAP) {
      value = refs.actionStackAmount != null && refs.actionStackAmount > 1
        ? refs.actionStackAmount
        : DEFAULT_STACK_CAP;
    }
    const cond: Condition = {
      subject: c.subject,
      metric: c.metric,
      op: c.op,
      value,
      ...(refNum != null ? { ref: refNum } : {}),
    };
    out.push(cond);
  }
  return out;
}

// True when the mapped when is safe to use as session-only (no conditions needed). Includes always, noop,
// and off-CD style empties.
export function isWhenAlways(result: WhenMapResult): boolean {
  return result.status === 'always' || result.status === 'noop';
}

// Whether this when is multi-target gated (flag set; conditions include enemyCount when mapped). Wave 1B:
// multi rules ship with `enemyCount >= 2` and fire only in multi fights.
export function isMultiTargetWhen(result: WhenMapResult): boolean {
  return result.flags.includes('multi-target');
}

// Map when + immediately materialize for a known spell/item action. Convenience for buildSuggestionRotation
// / tests.
export function mapWhenToConditions(
  whenRaw: string | undefined | null,
  opts: MaterializeRefs & { spellLabel?: string } = {},
): { result: WhenMapResult; conditions: Condition[] } {
  const result = mapWhen(whenRaw, opts.spellLabel ?? '');
  return { result, conditions: materializeConditions(result.conditions, opts) };
}
