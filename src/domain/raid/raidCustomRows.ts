// Raid tactics the PLAYER wrote, for one fight. Composed per raid like the shipped rows, never
// written into a save's rotation.

// Only the id prefix and two types: `AutopilotConfig` normalizes these rows, and it must not
// pull the rotation classifier (and through it engine/combat) into the config module.
import { RAID_OWN_ROW_PREFIX } from './raidEncounterTactics.ts';
import { killOrderAnyAddOf } from '../rotation/killOrder.ts';
import type { Condition, CondMetric, CondSubject, RotationRule } from '../rotation/types.ts';

const on1 = (subject: CondSubject, metric: CondMetric, ref?: number): Condition =>
  ({ subject, metric, op: '==', value: 1, ...(ref != null ? { ref } : {}) });

/** What makes the row fire. Every ability a boss casts matches at least one of these. */
export type RaidTriggerKind = 'aura' | 'cast' | 'pool' | 'cone' | 'always' | 'raidhurt';

export const RAID_TRIGGERS: readonly RaidTriggerKind[] = ['aura', 'cast', 'pool', 'cone', 'always', 'raidhurt'];

/** Who carries the aura an `aura` trigger reads. */
export type RaidTriggerOn = 'self' | 'boss' | 'tank' | 'anyone';

export const RAID_TRIGGER_LABEL: Readonly<Record<RaidTriggerKind, string>> = Object.freeze({
  aura: 'it is on someone',
  cast: 'the boss starts casting it',
  pool: 'it is on the ground under me',
  cone: 'I am in the cone',
  always: 'always in this fight',
  raidhurt: 'the raid is taking damage',
});

export const RAID_TRIGGER_ON_LABEL: Readonly<Record<RaidTriggerOn, string>> = Object.freeze({
  self: 'on me',
  boss: 'on the boss',
  tank: 'on the tank',
  anyone: 'on anyone',
});

/** Every answer the engine can actually execute. One verb each, no compound tactics. */
export type RaidResponseKind =
  | 'flee' | 'spread' | 'stack' | 'range' | 'behind' | 'flank'
  | 'avoid' | 'split' | 'halt' | 'interrupt' | 'taunt' | 'focus' | 'click' | 'pickup' | 'cc'
  | 'dispel' | 'keep';

export const RAID_RESPONSES: readonly RaidResponseKind[] = [
  'flee', 'spread', 'stack', 'range', 'behind', 'flank',
  'avoid', 'split', 'halt', 'interrupt', 'taunt', 'focus', 'click', 'pickup', 'cc', 'dispel', 'keep',
];

export const RAID_RESPONSE_LABEL: Readonly<Record<RaidResponseKind, string>> = Object.freeze({
  flee: 'Run out',
  spread: 'Spread out',
  stack: 'Stack on the tank',
  range: 'Back off the boss',
  behind: 'Get behind the boss',
  flank: 'Take the flank',
  avoid: 'Step off the ground',
  split: 'Split by who has it',
  halt: 'Stop attacking',
  interrupt: 'Kick it',
  taunt: 'Off-tank taunts',
  focus: 'Kill the adds first',
  click: 'Click the thing',
  pickup: 'Off-tank grabs the adds',
  cc: 'Crowd-control one',
  dispel: 'Cure it',
  keep: "Don't cure it",
});

/** One line for the chip's title. */
export const RAID_RESPONSE_NOTE: Readonly<Record<RaidResponseKind, string>> = Object.freeze({
  flee: 'You carry it away from the raid before it pops',
  spread: 'Hold this much space from the nearest ally',
  stack: 'Pile onto whoever is tanking',
  range: 'Hold this much distance from the boss',
  behind: 'Behind the boss. Right for a frontal breath or cleave, wrong for a tail swipe',
  flank: 'The side. The only ground clear of BOTH a frontal and a tail cone (dragons)',
  avoid: 'Walk off the pool the boss leaves. Only fires on a real ground effect',
  split: 'Everyone with it goes one way, everyone without the other',
  halt: 'Stop attacking while it is up',
  interrupt: 'Kick the cast. Needs a unit that knows one',
  taunt: 'Off-tanks pull the boss off whoever holds it',
  focus: "Everyone switches off the boss onto whatever else is up - this fight's named adds first",
  click: 'Use the object this fight is about - the orb, the crystal. Only fires where there is one',
  pickup: 'Off-tanks taunt whatever is up beside the boss, highest in the kill order first',
  cc: 'Sheep / Shackle / Banish a second enemy. Needs a unit that knows one',
  dispel: "Remove THIS ability, not whatever the class pack cures next. Needs a unit that can",
  keep: 'Never auto-remove THIS ability. Cleanse, decurse, Purge and Tranq skip it',
});

/** Who in the raid performs it. Shown on the row so "yours" is not read as an assignment. */
export const RAID_RESPONSE_WHO: Readonly<Record<RaidResponseKind, string>> = Object.freeze({
  flee: 'whoever gets it',
  spread: 'the whole raid',
  stack: 'everyone not holding aggro',
  range: 'everyone not holding aggro',
  behind: 'everyone not holding aggro',
  flank: 'everyone not holding aggro',
  avoid: 'whoever is standing in it',
  split: 'the whole raid',
  halt: 'everyone attacking',
  interrupt: 'whoever can',
  taunt: 'off-tanks',
  focus: 'the whole raid',
  click: 'whoever is closest',
  pickup: 'off-tanks',
  cc: 'whoever can',
  dispel: 'whoever can',
  keep: 'everyone',
});

/** Verbs that carry a distance. */
export const RAID_RESPONSE_TAKES_YD: ReadonlySet<RaidResponseKind> =
  new Set<RaidResponseKind>(['flee', 'spread', 'range', 'split']);

/** Default yards when the trigger ability bakes no radius of its own. */
export const RAID_RESPONSE_DEFAULT_YD: Readonly<Partial<Record<RaidResponseKind, number>>> =
  Object.freeze({ flee: 10, spread: 10, range: 20, split: 13 });

/** src/data/rotations/pve/druid/restoration.json Tranquility: `>= 2 allies below 75%`. */
export const RAID_HURT_ALLIES = 2;
export const RAID_HURT_HP_PCT = 75;

export const RAID_ROW_YD_MIN = 3;
export const RAID_ROW_YD_MAX = 40;

/** A raid tactic the player authored. Stored on `AutopilotConfig.raidRows`. */
export interface RaidCustomRow {
  /** Stable within the save; the composed rule id is `raid_own_<id>`. */
  id: string;
  /** Dungeon def id of the raid it runs in — the same `slug` the shipped plans carry. */
  slug: string;
  /** creature_template.entry of the fight it was written for (0 = the whole raid). */
  entry: number;
  /** What makes it fire. Absent on rows written before the other four existed. */
  trigger?: RaidTriggerKind;
  /** The ability it answers. 0 only when the trigger is `always`. */
  aura: number;
  /** Who carries the aura, for the `aura` trigger. */
  on: RaidTriggerOn;
  /** Fire at this many stacks instead of the first application (`aura` trigger). */
  stacks?: number;
  response: RaidResponseKind;
  /** Yards for the verbs in `RAID_RESPONSE_TAKES_YD`. Ignored by the rest. */
  yd?: number;
  /** Also require the boss under this health percent, so a row can be phase-scoped. */
  bossHpBelow?: number;
  enabled: boolean;
}

/** The rotation rule id a custom row composes under. */
export function raidCustomRowRuleId(id: string): string {
  return `${RAID_OWN_ROW_PREFIX}${id}`;
}

/** The row id back out of a composed rule id, or null when it is not one of ours. */
export function raidCustomRowIdOf(ruleId: string): string | null {
  return ruleId.startsWith(RAID_OWN_ROW_PREFIX)
    ? ruleId.slice(RAID_OWN_ROW_PREFIX.length)
    : null;
}

/** Next free `own<N>` id for a save that already holds some. */
export function nextRaidCustomRowId(rows: readonly RaidCustomRow[]): string {
  let n = 1;
  const taken = new Set(rows.map((r) => r.id));
  while (taken.has(`own${n}`)) n++;
  return `own${n}`;
}

export const RAID_TRIGGER_ONS: readonly RaidTriggerOn[] = ['self', 'boss', 'tank', 'anyone'];

/** Coerce stored JSON. A row with nothing to fire on is dropped, not defaulted. */
export function normalizeRaidCustomRows(raw: unknown): RaidCustomRow[] {
  if (!Array.isArray(raw)) return [];
  const out: RaidCustomRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<RaidCustomRow>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const slug = typeof r.slug === 'string' ? r.slug.trim() : '';
    const aura = typeof r.aura === 'number' && Number.isFinite(r.aura) ? Math.floor(r.aura) : 0;
    const response = RAID_RESPONSES.find((k) => k === r.response);
    // Rows written before the other four triggers existed are all `aura` rows.
    const trigger = RAID_TRIGGERS.find((k) => k === r.trigger) ?? 'aura';
    const hp = typeof r.bossHpBelow === 'number' && Number.isFinite(r.bossHpBelow)
      ? Math.min(Math.max(Math.round(r.bossHpBelow), 1), 99)
      : undefined;
    if (!id || seen.has(id) || !slug || !response) continue;
    // Every trigger but `always` names the ability it answers.
    if (aura <= 0 && trigger !== 'always') continue;
    if (trigger === 'always' && hp == null && aura <= 0) continue;
    seen.add(id);
    const yd = typeof r.yd === 'number' && Number.isFinite(r.yd)
      ? Math.min(Math.max(Math.round(r.yd), RAID_ROW_YD_MIN), RAID_ROW_YD_MAX)
      : undefined;
    const stacks = typeof r.stacks === 'number' && Number.isFinite(r.stacks) && r.stacks > 1
      ? Math.min(Math.round(r.stacks), 99)
      : undefined;
    out.push({
      id,
      slug,
      entry: typeof r.entry === 'number' && Number.isFinite(r.entry) ? Math.max(0, Math.floor(r.entry)) : 0,
      trigger,
      aura,
      on: RAID_TRIGGER_ONS.find((o) => o === r.on)
        ?? (response === 'taunt' ? 'tank' : response === 'keep' ? 'anyone' : 'self'),
      response,
      ...(stacks != null ? { stacks } : {}),
      ...(yd != null ? { yd } : {}),
      ...(hp != null ? { bossHpBelow: hp } : {}),
      enabled: r.enabled !== false,
    });
  }
  return out;
}

/** What each unit brings to a row: the kit spells only that body knows. */
export interface RaidRowKit {
  tauntSpellId?: number | null;
  interruptSpellId?: number | null;
  // The adds this fight's shipped kill-order names, for `focus`. Per-fight plan data, not a player-typed
  // list. Empty or absent ⇒ the row cannot compose, same as a kick with no kick.
  focusEntries?: readonly number[] | null;
  // Every gameobject this fight's shipped rows click, as plan data rather than a typed id. The row
  // presses whichever is live; absent means the row cannot compose.
  clickGoEntries?: readonly number[];
  // This unit's crowd-control spell for `cc` — the longest incapacitate that breaks on damage, or
  // a banish. Resolved off the spellbook, since sheep, shackle and sap are different ids.
  ccSpellId?: number | null;
  // This unit's cure for the CATEGORY the row's own aura belongs to, so a dispel row removes the
  // ability it names. Absent means the aura is not dispellable, or this unit has no cure.
  dispelSpellId?: number | null;
  /** The aura's dispel category, for the `dispellablePresent` ref. */
  dispelCategory?: number | null;
}

/** The gate the trigger becomes. Empty for `always`. */
function triggerConditions(row: RaidCustomRow): Condition[] {
  const trigger = row.trigger ?? 'aura';
  if (trigger === 'cast') {
    // The row already names the ability, so gate on THAT spell rather than on any cast at all.
    return row.aura > 0
      ? [{ subject: 'target', metric: 'castingSpellId', op: '==', value: row.aura }]
      : [on1('target', 'castingPresent')];
  }
  if (trigger === 'pool') return [{ subject: 'self', metric: 'hazardProximityYd', op: '<=', value: 0 }];
  if (trigger === 'cone') return [on1('self', 'inTargetCone')];
  // Count and threshold are the shipped druid Tranquility row, not numbers invented here.
  if (trigger === 'raidhurt') {
    return [{
      subject: 'self',
      metric: 'alliesBelowHpCount',
      op: '>=',
      value: RAID_HURT_ALLIES,
      ref: RAID_HURT_HP_PCT,
    }];
  }
  if (trigger === 'always' || row.aura <= 0) return [];
  const n = row.stacks;
  if (row.on === 'anyone') {
    // Same shape as the tank pair: present is 1 regardless of stacks, stacks is the max
    // any living friendly holds. Cite: CondMetric allyAuraPresent / allyAuraStacks.
    return n != null && n > 1
      ? [{ subject: 'self', metric: 'allyAuraStacks', op: '>=', value: n, ref: row.aura }]
      : [on1('self', 'allyAuraPresent', row.aura)];
  }
  if (row.on === 'tank') {
    return n != null && n > 1
      ? [{ subject: 'target', metric: 'aggroHolderDebuffStacks', op: '>=', value: n, ref: row.aura }]
      : [on1('target', 'aggroHolderDebuffPresent', row.aura)];
  }
  // The boss's own Enrage / shield is a BUFF on it; what it put on you is a debuff.
  const subject: CondSubject = row.on === 'boss' ? 'target' : 'self';
  const present: CondMetric = row.on === 'boss' ? 'buffPresent' : 'debuffPresent';
  const stacked: CondMetric = row.on === 'boss' ? 'buffStacks' : 'debuffStacks';
  return n != null && n > 1
    ? [{ subject, metric: stacked, op: '>=', value: n, ref: row.aura }]
    : [on1(subject, present, row.aura)];
}

// What "the adds" means for this row: the fight's own kill order first, then every other body in the fight.
// A whole-raid row (entry 0) has no boss to except, so it only gets the named list.
function addOrder(row: RaidCustomRow, kit: RaidRowKit): number[] {
  const named = (kit.focusEntries ?? []).map((e) => e | 0).filter((e) => e > 0);
  const boss = row.entry | 0;
  return boss > 0 ? [...named, killOrderAnyAddOf(boss)] : named;
}

// The rotation rule a custom row runs as, or null when this unit cannot perform it — a taunt on a body with
// no taunt, a kick on one with no interrupt.
export function raidCustomRowRule(row: RaidCustomRow, kit: RaidRowKit): RotationRule | null {
  const id = raidCustomRowRuleId(row.id);
  const yd = row.yd ?? RAID_RESPONSE_DEFAULT_YD[row.response] ?? 10;
  const conditions: Condition[] = triggerConditions(row);
  if (row.bossHpBelow != null) {
    conditions.push({ subject: 'target', metric: 'healthPct', op: '<', value: row.bossHpBelow });
  }
  // Whoever the boss is hitting is the reference point, so the tank sits out every walk.
  const notTanking: Condition = { subject: 'self', metric: 'targetAttackingMe', op: '==', value: 0 };

  switch (row.response) {
    case 'taunt': {
      if (kit.tauntSpellId == null) return null;
      return {
        id,
        action: { kind: 'spell', spellId: kit.tauntSpellId },
        conditions: [on1('self', 'isOffTank'), notTanking, ...conditions],
        enabled: true,
      };
    }
    case 'interrupt': {
      if (kit.interruptSpellId == null) return null;
      return {
        id,
        action: { kind: 'spell', spellId: kit.interruptSpellId },
        // A kick always needs a cast in flight, whatever else the row gates on.
        conditions: [on1('target', 'castingPresent'), ...conditions],
        enabled: true,
      };
    }
    case 'keep': {
      // A filter like halt_dps: never wins the GCD. pickAction skips this spell id in
      // dispellableAurasOn, so Cleanse / Remove Curse / Purge / Tranq never peel it.
      if (row.aura <= 0) return null;
      return { id, action: { kind: 'keep_aura', spellId: row.aura }, conditions, enabled: true };
    }
    case 'dispel': {
      const cat = kit.dispelCategory ?? 0;
      if (kit.dispelSpellId == null || !(cat > 0)) return null;
      // `on` is the side the named aura sits: raid magic/curse is a friendly read, a boss
      // shield is the enemy. Class-pack rows use the spell's target type instead.
      const onRaid = row.on === 'anyone' || row.on === 'self' || row.on === 'tank';
      const subject = onRaid ? 'self' : 'target';
      return {
        id,
        action: { kind: 'spell', spellId: kit.dispelSpellId },
        conditions: [
          { subject, metric: 'dispellablePresent', op: '==', value: 1, ref: cat },
          ...conditions,
        ],
        enabled: true,
      };
    }
    case 'cc': {
      // `other` is the engine's "an enemy that is NOT your current target", which is what
      // crowd-controlling a second body means. Cite: RuleSpellTarget 'other'.
      if (kit.ccSpellId == null) return null;
      return {
        id,
        action: { kind: 'spell', spellId: kit.ccSpellId, target: 'other' },
        conditions: [{ subject: 'self', metric: 'enemyCount', op: '>=', value: 2 }, ...conditions],
        enabled: true,
      };
    }
    case 'pickup': {
      // A taunt pointed at the adds rather than the boss. `priority` is a creature-entry kill
      // order, so the off-tank grabs whichever is up. Needs a taunt and something to point it at.
      const marks = addOrder(row, kit);
      if (kit.tauntSpellId == null || !marks.length) return null;
      return {
        id,
        action: { kind: 'spell', spellId: kit.tauntSpellId, target: { priority: marks } },
        conditions: [on1('self', 'isOffTank'), ...conditions],
        enabled: true,
      };
    }
    case 'focus': {
      // Wraps the kill_order the plan already carries, so the player picks a verb rather than a
      // list of creature ids — falling through to "anything but the boss" on 58 of 65 fights.
      const entries = addOrder(row, kit);
      if (!entries.length) return null;
      return { id, action: { kind: 'kill_order', entries }, conditions, enabled: true };
    }
    case 'click': {
      // Wraps use_object on the gameobjects the plan names: six for Thermaplugg, one for
      // Razorgore. The row carries the SET and the evaluator resolves whichever is usable.
      const gos = (kit.clickGoEntries ?? []).filter((e) => (e | 0) > 0);
      if (!gos.length) return null;
      return {
        id,
        action: gos.length > 1
          ? { kind: 'use_object', goEntry: gos[0]!, goEntries: gos }
          : { kind: 'use_object', goEntry: gos[0]! },
        conditions,
        enabled: true,
      };
    }
    case 'halt':
      return { id, action: { kind: 'halt_dps' }, conditions, enabled: true };
    case 'flee':
      return { id, action: { kind: 'move', move: { kind: 'flee_raid', yd } }, conditions, enabled: true };
    case 'spread':
      return { id, action: { kind: 'move', move: { kind: 'spread', minYd: yd } }, conditions, enabled: true };
    case 'stack':
      return {
        id,
        action: { kind: 'move', move: { kind: 'stack_on', role: 'tank' } },
        conditions: [...conditions, notTanking],
        enabled: true,
      };
    case 'range':
      return {
        id,
        action: {
          kind: 'move',
          move: { kind: 'keep_range', minYd: yd, ...(row.entry ? { entry: row.entry } : {}) },
        },
        conditions: [...conditions, notTanking],
        enabled: true,
      };
    case 'behind':
      return {
        id,
        action: { kind: 'move', move: { kind: 'behind_target' } },
        conditions: [...conditions, notTanking],
        enabled: true,
      };
    case 'flank':
      return {
        id,
        action: { kind: 'move', move: { kind: 'flank_target' } },
        conditions: [...conditions, notTanking],
        enabled: true,
      };
    case 'avoid': {
      // Pools are keyed by the spell id that laid them (dynamicObject.ts), so this needs one.
      if (row.aura <= 0) return null;
      return {
        id,
        action: { kind: 'move', move: { kind: 'avoid_zone', id: String(row.aura) } },
        conditions: [
          { subject: 'self', metric: 'hazardProximityYd', op: '<=', value: 0 },
          ...conditions.filter((c) => c.metric !== 'hazardProximityYd'),
        ],
        enabled: true,
      };
    }
    default: {
      // split: the aura IS the camp marker, so it has to be the one on you.
      if (row.aura <= 0) return null;
      return {
        id,
        action: { kind: 'move', move: { kind: 'split_by_aura', aura: row.aura, awayYd: yd } },
        conditions: [
          on1('self', 'buffPresent', row.aura),
          { subject: 'self', metric: 'allyWithoutAuraNearYd', op: '<=', value: yd, ref: row.aura },
          notTanking,
        ],
        enabled: true,
      };
    }
  }
}
