// The shipped default fight plan for every raid boss, from the hand-editable packs under
// src/data/raid-plans. Validated on load: a silently dropped field reads as a working tactic.

import { ALL_COND_METRICS } from '../rotation/condMetricPicker.ts';
import type { Condition, CondMetric, CondOp, CondSubject, RotationRule, RuleAction } from '../rotation/types.ts';

import ubrsPack from '../../data/raid-plans/ubrs.json' with { type: 'json' };
import onyxiaPack from '../../data/raid-plans/onyxias-lair.json' with { type: 'json' };
import moltenCorePack from '../../data/raid-plans/molten-core.json' with { type: 'json' };
import zulGurubPack from '../../data/raid-plans/zul-gurub.json' with { type: 'json' };
import blackwingLairPack from '../../data/raid-plans/blackwing-lair.json' with { type: 'json' };
import ruinsPack from '../../data/raid-plans/ruins-of-ahnqiraj.json' with { type: 'json' };
import templePack from '../../data/raid-plans/temple-of-ahnqiraj.json' with { type: 'json' };
import naxxramasPack from '../../data/raid-plans/naxxramas.json' with { type: 'json' };
// First FIVE-MAN pack (E5.4). The packs were always instance plans, not 40-man plans — ubrs has
// been one since it shipped — so a five-man needs a file and this line, nothing else.
import smArmoryPack from '../../data/raid-plans/sm-armory.json' with { type: 'json' };
import stockadePack from '../../data/raid-plans/the-stockade.json' with { type: 'json' };
import deadminesPack from '../../data/raid-plans/deadmines.json' with { type: 'json' };
import ragefirePack from '../../data/raid-plans/ragefire-chasm.json' with { type: 'json' };
import wailingCavernsPack from '../../data/raid-plans/wailing-caverns.json' with { type: 'json' };
import shadowfangPack from '../../data/raid-plans/shadowfang-keep.json' with { type: 'json' };
import blackfathomPack from '../../data/raid-plans/blackfathom-deeps.json' with { type: 'json' };
import gnomereganPack from '../../data/raid-plans/gnomeregan.json' with { type: 'json' };
import razorfenKraulPack from '../../data/raid-plans/razorfen-kraul.json' with { type: 'json' };
import smGraveyardPack from '../../data/raid-plans/sm-graveyard.json' with { type: 'json' };
import smLibraryPack from '../../data/raid-plans/sm-library.json' with { type: 'json' };
import smCathedralPack from '../../data/raid-plans/sm-cathedral.json' with { type: 'json' };
import razorfenDownsPack from '../../data/raid-plans/razorfen-downs.json' with { type: 'json' };
import uldamanPack from '../../data/raid-plans/uldaman.json' with { type: 'json' };
import zulFarrakPack from '../../data/raid-plans/zul-farrak.json' with { type: 'json' };
import maraudonPack from '../../data/raid-plans/maraudon.json' with { type: 'json' };
import sunkenTemplePack from '../../data/raid-plans/sunken-temple.json' with { type: 'json' };
import blackrockDepthsPack from '../../data/raid-plans/blackrock-depths.json' with { type: 'json' };
import lbrsPack from '../../data/raid-plans/lbrs.json' with { type: 'json' };
import direMaulEastPack from '../../data/raid-plans/dire-maul-east.json' with { type: 'json' };
import direMaulWestPack from '../../data/raid-plans/dire-maul-west.json' with { type: 'json' };
import direMaulNorthPack from '../../data/raid-plans/dire-maul-north.json' with { type: 'json' };
import scholomancePack from '../../data/raid-plans/scholomance.json' with { type: 'json' };
import stratholmeLivePack from '../../data/raid-plans/stratholme-live.json' with { type: 'json' };
import stratholmeUndeadPack from '../../data/raid-plans/stratholme-undead.json' with { type: 'json' };

export type RaidTacticKind =
  | 'cloak'
  | 'resist'
  | 'tank-swap'
  | 'camp-split'
  | 'flee'
  | 'spread'
  | 'halt-dps'
  | 'mc'
  | 'kill-order'
  | 'use-object'
  /** Stand somewhere the boss's own shape cannot reach (out of a frontal cone / pbaoe disc). */
  | 'position'
  /** Strip this aura. Composed per-body off that unit's own cure spell. */
  | 'dispel';

/** Every kind, in the order the Raid tab lists them. */
export const RAID_TACTIC_KINDS: readonly RaidTacticKind[] = [
  'resist', 'cloak', 'flee', 'spread', 'position', 'camp-split',
  'tank-swap', 'halt-dps', 'kill-order', 'mc', 'use-object', 'dispel',
];

export type ResistSchool = 'fire' | 'nature' | 'frost' | 'shadow';
const RESIST_SCHOOLS: readonly ResistSchool[] = ['fire', 'nature', 'frost', 'shadow'];

/** Who must wear a named item at pull. */
export type GearWho = 'tanks' | 'raid';

/** A bomb the holder walks out with. `radiusYd` is the BAKED payload radius. */
export interface RaidFleeAura {
  /** The aura on the raider. */
  aura: number;
  /** radiusYd of the payload the aura fires on removal. */
  radiusYd: number;
  cite: string;
}

/** An add the raid mind-controls mid-fight (priest 605 on this creature_template.entry). */
export interface RaidMcTarget {
  entry: number;
  cite: string;
  /** Boss aura that must be up. Faerlina Enrage 28798 — MC on pull burns the Worshippers. */
  requireTargetBuff?: number;
}

/** Who the aura-trigger of a shipped cure row reads. Same four as a player-written row. */
export type RaidCureOn = 'self' | 'boss' | 'tank' | 'anyone';
const CURE_ONS: readonly RaidCureOn[] = ['self', 'boss', 'tank', 'anyone'];

/** An aura this fight's default plan tells whoever can to strip. */
export interface RaidCureAura {
  aura: number;
  on: RaidCureOn;
  cite: string;
  /** Player-facing one-liner for the Raid tab. */
  label?: string;
}

/** A row this ONE fight adds on top of the class rotation, prepended at its own entry. */
export interface RaidEncounterTacticRow {
  /** Which kind on `kinds` this row discharges - the census scores authored off this. */
  kind: RaidTacticKind;
  rule: RotationRule;
  /** Player-facing one-liner for the rotation editor. */
  label: string;
  cite: string;
}

export interface RaidBossTactics {
  /** creature_template.entry of the encounter primary. */
  entry: number;
  slug: string;
  name: string;
  special: boolean;
  kinds: readonly RaidTacticKind[];
  /** SpellEffects.cpp:3756 GetDummyAura(22683) — item 15138. */
  cloak?: { item: number; dummySpell: number; who: GearWho };
  resist?: ResistSchool;
  /** Debuff on the current tank that forces an OT taunt. */
  tankSwapAura?: number;
  /** Bombs the default rotation authors a run-out row for. */
  fleeAuras?: readonly RaidFleeAura[];
  /** Adds the default rotation authors a priest MC row for. */
  mcEntries?: readonly RaidMcTarget[];
  /** Auras the default rotation authors a cure row for, composed per-body. */
  cureAuras?: readonly RaidCureAura[];
  /** Rows only this fight gets, prepended when the target is this entry. */
  encounterRows?: readonly RaidEncounterTacticRow[];
  /** Plain-English "why this plan", shown under the boss on the Raid tab. */
  note?: string;
  // Kinds this fight asks for that no raid row can reach yet, and the gap blocking each. Dev-facing: the
  // census reads it, the Raid tab never shows it.
  blockedBy?: Readonly<Partial<Record<RaidTacticKind, string>>>;
  cite: string;
}

/** One `src/data/raid-plans/<raid>.json` file. */
export interface RaidPlanPack {
  raid: string;
  note?: string;
  bosses: readonly RaidBossTactics[];
}

// ---- load + validate ------------------------------------------------------

const KIND_SET = new Set<string>(RAID_TACTIC_KINDS);
const METRIC_SET = new Set<string>(ALL_COND_METRICS);
const SUBJECTS: readonly CondSubject[] = ['self', 'target', 'pet'];
const OPS: readonly CondOp[] = ['<', '<=', '>', '>=', '==', '!='];

/** Every complaint the packs raised on load, so a bad hand-edit is visible and not silent. */
const LOAD_ERRORS: string[] = [];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim().length > 0 ? v : null);

const int = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);

function bad(where: string, why: string): null {
  LOAD_ERRORS.push(`${where}: ${why}`);
  return null;
}

function parseCondition(raw: unknown, where: string): Condition | null {
  if (!isObj(raw)) return bad(where, 'condition is not an object');
  const subject = SUBJECTS.find((s) => s === raw.subject);
  const op = OPS.find((o) => o === raw.op);
  const metric = str(raw.metric);
  const value = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;
  if (!subject) return bad(where, `condition subject "${String(raw.subject)}" is not self/target/pet`);
  if (!op) return bad(where, `condition op "${String(raw.op)}" is not a comparison`);
  if (!metric || !METRIC_SET.has(metric)) {
    return bad(where, `condition metric "${String(raw.metric)}" is not a CondMetric - it would never fire`);
  }
  if (value == null) return bad(where, 'condition value is not a number');
  const ref = int(raw.ref);
  return { subject, metric: metric as CondMetric, op, value, ...(ref != null ? { ref } : {}) };
}

/** Every `RuleAction.kind`, with the payload field a row of that kind must carry. */
const ACTION_PAYLOAD: Readonly<Record<string, 'number' | 'string' | 'array' | 'object' | 'none'>> = {
  spell: 'number', // spellId
  item: 'number', // itemEntry
  macro: 'string', // macroId
  move: 'object', // move
  halt_dps: 'none',
  kill_order: 'array', // entries
  use_object: 'number', // goEntry
};
const ACTION_FIELD: Readonly<Record<string, string>> = {
  spell: 'spellId',
  item: 'itemEntry',
  macro: 'macroId',
  move: 'move',
  kill_order: 'entries',
  use_object: 'goEntry',
};
/** Every `RuleMove.kind` the motion executor answers. */
const MOVE_KINDS: ReadonlySet<string> = new Set([
  'spread', 'flee_raid', 'stack_on', 'behind_target', 'flank_target',
  'move_to', 'avoid_zone', 'keep_range', 'split_by_aura',
]);

/** Checked as far as the executor acts on: a known kind and the payload it needs. */
function parseAction(raw: unknown, where: string): RuleAction | null {
  if (!isObj(raw)) return bad(where, 'action is not an object');
  const kind = str(raw.kind);
  if (!kind) return bad(where, 'action has no kind');
  const want = ACTION_PAYLOAD[kind];
  if (!want) return bad(where, `action kind "${kind}" is not one the rotation performs`);
  const field = ACTION_FIELD[kind];
  const got = field ? raw[field] : undefined;
  if (want === 'number' && int(got) == null) return bad(where, `action ${kind} needs a numeric ${field}`);
  if (want === 'string' && !str(got)) return bad(where, `action ${kind} needs a ${field}`);
  if (want === 'array' && (!Array.isArray(got) || !got.length)) {
    return bad(where, `action ${kind} needs a non-empty ${field}`);
  }
  if (want === 'object') {
    if (!isObj(got)) return bad(where, `action ${kind} needs a ${field} object`);
    const moveKind = str(got.kind);
    if (!moveKind || !MOVE_KINDS.has(moveKind)) {
      return bad(where, `move kind "${String(got.kind)}" is not one sessionMotion executes`);
    }
  }
  // A click may also name the SET it presses; every member has to be a real entry, because a
  // typo there is a button the party walks to and cannot use. Cite: rotation/types.ts goEntries.
  if (kind === 'use_object' && raw.goEntries !== undefined) {
    const list = raw.goEntries;
    if (!Array.isArray(list) || !list.length) {
      return bad(where, 'action use_object goEntries is not a non-empty array');
    }
    if (list.some((e) => int(e) == null || (int(e) as number) <= 0)) {
      return bad(where, 'action use_object goEntries holds a non-numeric entry');
    }
    if (!list.map((e) => int(e)).includes(int(got))) {
      return bad(where, 'action use_object goEntry is not one of its own goEntries');
    }
  }
  // Validated above: the kind is one of the seven and its required payload is present.
  return raw as unknown as RuleAction;
}

function parseRule(raw: unknown, where: string): RotationRule | null {
  if (!isObj(raw)) return bad(where, 'rule is not an object');
  const id = str(raw.id);
  if (!id) return bad(where, 'rule has no id');
  const action = parseAction(raw.action, `${where} ${id}`);
  if (!action) return null;
  if (!Array.isArray(raw.conditions)) return bad(where, `rule ${id} has no conditions array`);
  const conditions: Condition[] = [];
  for (const c of raw.conditions) {
    const cond = parseCondition(c, `${where} ${id}`);
    if (!cond) return null;
    conditions.push(cond);
  }
  return { id, action, conditions, enabled: raw.enabled !== false };
}

function parseEncounterRow(raw: unknown, where: string): RaidEncounterTacticRow | null {
  if (!isObj(raw)) return bad(where, 'row is not an object');
  const kind = str(raw.kind);
  if (!kind || !KIND_SET.has(kind)) return bad(where, `row kind "${String(raw.kind)}" is not a tactic kind`);
  const label = str(raw.label);
  if (!label) return bad(where, `row ${kind} has no label - the Raid tab cannot name it`);
  const cite = str(raw.cite);
  if (!cite) return bad(where, `row "${label}" has no cite`);
  const rule = parseRule(raw.rule, `${where} "${label}"`);
  if (!rule) return null;
  return { kind: kind as RaidTacticKind, label, cite, rule };
}

function parseFleeAura(raw: unknown, where: string): RaidFleeAura | null {
  if (!isObj(raw)) return bad(where, 'fleeAura is not an object');
  const aura = int(raw.aura);
  const radiusYd = typeof raw.radiusYd === 'number' && Number.isFinite(raw.radiusYd) ? raw.radiusYd : null;
  const cite = str(raw.cite);
  if (aura == null || aura <= 0) return bad(where, 'fleeAura has no aura id');
  if (radiusYd == null || radiusYd <= 0) return bad(where, `fleeAura ${aura} has no baked radiusYd`);
  if (!cite) return bad(where, `fleeAura ${aura} has no cite`);
  return { aura, radiusYd, cite };
}

function parseMcTarget(raw: unknown, where: string): RaidMcTarget | null {
  if (!isObj(raw)) return bad(where, 'mcEntry is not an object');
  const entry = int(raw.entry);
  const cite = str(raw.cite);
  if (entry == null || entry <= 0) return bad(where, 'mcEntry has no creature entry');
  if (!cite) return bad(where, `mcEntry ${entry} has no cite`);
  const requireTargetBuff = int(raw.requireTargetBuff);
  return {
    entry,
    cite,
    ...(requireTargetBuff != null && requireTargetBuff > 0 ? { requireTargetBuff } : {}),
  };
}

function parseCureAura(raw: unknown, where: string): RaidCureAura | null {
  if (!isObj(raw)) return bad(where, 'cureAura is not an object');
  const aura = int(raw.aura);
  const cite = str(raw.cite);
  if (aura == null || aura <= 0) return bad(where, 'cureAura has no aura id');
  if (!cite) return bad(where, `cureAura ${aura} has no cite`);
  const on = CURE_ONS.find((o) => o === raw.on) ?? 'anyone';
  const label = str(raw.label);
  return { aura, on, cite, ...(label ? { label } : {}) };
}

function parseBlockedBy(raw: unknown, where: string): RaidBossTactics['blockedBy'] {
  if (!isObj(raw)) return undefined;
  const out: Partial<Record<RaidTacticKind, string>> = {};
  for (const [kind, why] of Object.entries(raw)) {
    const reason = str(why);
    if (!KIND_SET.has(kind)) {
      bad(where, `blockedBy names "${kind}", which is not a tactic kind`);
      continue;
    }
    if (!reason) {
      bad(where, `blockedBy.${kind} has no reason`);
      continue;
    }
    out[kind as RaidTacticKind] = reason;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseBoss(raw: unknown, slug: string): RaidBossTactics | null {
  if (!isObj(raw)) return bad(slug, 'boss is not an object');
  const entry = int(raw.entry);
  const name = str(raw.name);
  if (entry == null || entry <= 0) return bad(slug, `boss "${String(raw.name)}" has no creature entry`);
  const where = `${slug} ${name ?? entry}`;
  if (!name) return bad(where, 'boss has no name');
  const cite = str(raw.cite);
  if (!cite) return bad(where, 'boss has no cite - AI.md forbids an unsourced row');

  const kindsRaw = Array.isArray(raw.kinds) ? raw.kinds : [];
  const kinds: RaidTacticKind[] = [];
  for (const k of kindsRaw) {
    if (typeof k === 'string' && KIND_SET.has(k)) kinds.push(k as RaidTacticKind);
    else bad(where, `kind "${String(k)}" is not a tactic kind`);
  }

  const rowsRaw = Array.isArray(raw.encounterRows) ? raw.encounterRows : [];
  const encounterRows: RaidEncounterTacticRow[] = [];
  for (const r of rowsRaw) {
    const row = parseEncounterRow(r, where);
    if (row) encounterRows.push(row);
  }

  const fleeRaw = Array.isArray(raw.fleeAuras) ? raw.fleeAuras : [];
  const fleeAuras: RaidFleeAura[] = [];
  for (const f of fleeRaw) {
    const aura = parseFleeAura(f, where);
    if (aura) fleeAuras.push(aura);
  }

  const mcRaw = Array.isArray(raw.mcEntries) ? raw.mcEntries : [];
  const mcEntries: RaidMcTarget[] = [];
  for (const m of mcRaw) {
    const mc = parseMcTarget(m, where);
    if (mc) mcEntries.push(mc);
  }

  const cureRaw = Array.isArray(raw.cureAuras) ? raw.cureAuras : [];
  const cureAuras: RaidCureAura[] = [];
  for (const c of cureRaw) {
    const cure = parseCureAura(c, where);
    if (cure) cureAuras.push(cure);
  }

  let cloak: RaidBossTactics['cloak'];
  if (isObj(raw.cloak)) {
    const item = int(raw.cloak.item);
    const dummySpell = int(raw.cloak.dummySpell);
    const who = raw.cloak.who === 'raid' ? 'raid' : 'tanks';
    if (item == null || dummySpell == null) bad(where, 'cloak needs both an item and a dummySpell');
    else cloak = { item, dummySpell, who };
  }

  const resist = RESIST_SCHOOLS.find((s) => s === raw.resist);
  if (raw.resist != null && !resist) bad(where, `resist "${String(raw.resist)}" is not a school`);
  const tankSwapAura = int(raw.tankSwapAura);
  const note = str(raw.note);
  const blockedBy = parseBlockedBy(raw.blockedBy, where);

  return {
    entry,
    slug,
    name,
    // A fight is "special" when it asks the raid for something beyond tank-and-spank.
    special: kinds.length > 0,
    kinds,
    cite,
    ...(note ? { note } : {}),
    ...(resist ? { resist } : {}),
    ...(cloak ? { cloak } : {}),
    ...(tankSwapAura != null && tankSwapAura > 0 ? { tankSwapAura } : {}),
    ...(fleeAuras.length ? { fleeAuras } : {}),
    ...(mcEntries.length ? { mcEntries } : {}),
    ...(cureAuras.length ? { cureAuras } : {}),
    ...(encounterRows.length ? { encounterRows } : {}),
    ...(blockedBy ? { blockedBy } : {}),
  };
}

/** Parse one pack file. Exported so the materializer's `--check` and smoke read the same path. */
export function parseRaidPlanPack(raw: unknown): RaidPlanPack | null {
  if (!isObj(raw)) return bad('pack', 'file is not an object');
  const slug = str(raw.raid);
  if (!slug) return bad('pack', 'file has no "raid" slug');
  if (!Array.isArray(raw.bosses)) return bad(slug, 'file has no "bosses" array');
  const bosses: RaidBossTactics[] = [];
  for (const b of raw.bosses) {
    const boss = parseBoss(b, slug);
    if (boss) bosses.push(boss);
  }
  const note = str(raw.note);
  return { raid: slug, ...(note ? { note } : {}), bosses };
}

// Every pack, raids in progression order then the five-mans in level order — the order `RAID_BOSS_TACTICS`
// concatenates them.
const PACK_SOURCES: readonly unknown[] = [
  ubrsPack,
  onyxiaPack,
  moltenCorePack,
  zulGurubPack,
  blackwingLairPack,
  ruinsPack,
  templePack,
  naxxramasPack,
  ragefirePack,
  deadminesPack,
  wailingCavernsPack,
  stockadePack,
  shadowfangPack,
  blackfathomPack,
  gnomereganPack,
  razorfenKraulPack,
  smGraveyardPack,
  smLibraryPack,
  smArmoryPack,
  smCathedralPack,
  razorfenDownsPack,
  uldamanPack,
  zulFarrakPack,
  maraudonPack,
  sunkenTemplePack,
  blackrockDepthsPack,
  lbrsPack,
  direMaulEastPack,
  direMaulWestPack,
  direMaulNorthPack,
  scholomancePack,
  stratholmeLivePack,
  stratholmeUndeadPack,
];

export const RAID_PLAN_PACKS: readonly RaidPlanPack[] =
  PACK_SOURCES.map((p) => parseRaidPlanPack(p)).filter((p): p is RaidPlanPack => p != null);

/** Every boss plan the game ships, flattened in progression order. */
export const RAID_BOSS_TACTICS: readonly RaidBossTactics[] =
  RAID_PLAN_PACKS.flatMap((p) => p.bosses);

/** The per-raid note, for the Raid tab's header. */
export function raidPlanPackNote(slug: string): string | undefined {
  return RAID_PLAN_PACKS.find((p) => p.raid === slug)?.note;
}

/** Everything the packs refused on load. Smoke fails on any entry. */
export function raidPlanPackErrors(): readonly string[] {
  return LOAD_ERRORS;
}
