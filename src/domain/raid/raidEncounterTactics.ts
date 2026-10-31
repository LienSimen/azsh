// Per-boss raid tactics the rotation, gear and assignments must perform. The PLANS are data under
// src/data/raid-plans; this is the derived half. Every pack row is a default the player may edit.

import type { RotationRule } from '../rotation/types.ts';
import { dungeonGameObjectsForMap } from '../../data/dungeonGameObjects.ts';
import { GAMEOBJECT_TYPE_BUTTON } from '../world/gameObjects.ts';
import { dungeonSpawnsForMap } from '../../data/dungeonSpawns.ts';
import { FLEE_CLEAR_MARGIN_YD, raidRuleYdOf } from '../rotation/raidRowTuning.ts';
import { RAID_BOSS_TACTICS } from './raidPlanPacks.ts';
import type {
  RaidBossTactics,
  RaidFleeAura,
  RaidMcTarget,
  RaidTacticKind,
} from './raidPlanPacks.ts';

export { RAID_BOSS_TACTICS, RAID_PLAN_PACKS, RAID_TACTIC_KINDS, raidPlanPackErrors, raidPlanPackNote } from './raidPlanPacks.ts';
export type {
  GearWho,
  RaidBossTactics,
  RaidCureAura,
  RaidCureOn,
  RaidEncounterTacticRow,
  RaidFleeAura,
  RaidMcTarget,
  RaidPlanPack,
  RaidTacticKind,
  ResistSchool,
} from './raidPlanPacks.ts';

/** Onyxia Scale Cloak. Cite: item_template 15138; SpellEffects.cpp:3756–3760 dummy 22683. */
export const ONYXIA_SCALE_CLOAK_ITEM = 15138;
export const ONYXIA_SCALE_CLOAK_DUMMY = 22683;

// Burning Adrenaline, tank copy: cast on the current victim, and its removal fires an instakill,
// so the holder is dead in 20 s. That makes it a tank rotation, not a run-out.
export const SPELL_BURNING_ADRENALINE_TANK = 18173;
/** The random mana-user copy — this one IS the run-out. Cite: boss_vaelastrasz.cpp:48,295-301. */
export const SPELL_BURNING_ADRENALINE = 23620;

/** Shadow of Ebonroc on the victim. Cite: boss_ebonroc.cpp:34,87-90 SPELL_SHADOW_OF_EBONROC 23340. */
export const SPELL_SHADOW_OF_EBONROC = 23340;
/** Mortal Wound on the victim. Cite: boss_kurinnaxx.cpp:35,99-102 SPELL_MORTAL_WOUND 25646. */
export const SPELL_MORTAL_WOUND = 25646;

export const ENTRY_FIREMAW = 11983;
export const ENTRY_EBONROC = 14601;
export const ENTRY_FLAMEGOR = 11981;
export const ENTRY_NEFARIAN = 11583;
export const ENTRY_VEKNILASH = 15275;
export const ENTRY_VEKLOR = 15276;
export const ENTRY_KURINNAXX = 15348;
/** naxxramas.h:79 NPC_ZOMBIE_CHOW. Cite: boss_gluth.cpp:162-182 DEVOUR finds one. */
export const ENTRY_ZOMBIE_CHOW = 16360;
/** boss_mandokir.cpp:49 SPELL_THREATENING_GAZE - resolves to an aura_dummy_holder on the raider. */
export const SPELL_THREATENING_GAZE = 24314;

/** Polarity Shift assigns one of these two. Cite: boss_thaddius.cpp:380-395. */
export const SPELL_POSITIVE_CHARGE = 28059;
export const SPELL_NEGATIVE_CHARGE = 28084;
// Payload radius of the charge damage AND of the same-charge stack count - one number, both halves. Cite:
// spell 28062 / 28085 bake radiusYd 13; boss_thaddius.cpp:453 `float range = 13.f`.
export const POLARITY_PAYLOAD_YD = 13;

/** zulgurub.h:29-30 NPC_LORKHAN / NPC_ZATH. Both baked on map 309, one spawn each. */
export const ENTRY_ZEALOT_LORKHAN = 11347;
export const ENTRY_ZEALOT_ZATH = 11348;

/** temple_of_ahnqiraj.h:24-26 NPC_KRI / NPC_VEM / NPC_YAUJ. All three baked on map 531. */
export const ENTRY_LORD_KRI = 15511;
export const ENTRY_PRINCESS_YAUJ = 15543;
export const ENTRY_VEM = 15544;

// Every own-debuff bomb the raid rows author a run-out row for. One source of truth: the response
// rows and the tactic census read this same flat view, so a boss cannot be authored unmeasured.
export const RAID_FLEE_AURAS: readonly RaidFleeAura[] =
  RAID_BOSS_TACTICS.flatMap((t) => t.fleeAuras ?? []);

/** Every add the default rotation authors a priest MC row for. Same contract as above. */
export const RAID_MC_TARGETS: readonly RaidMcTarget[] =
  RAID_BOSS_TACTICS.flatMap((t) => t.mcEntries ?? []);

// Every tank debuff the default rotation authors an off-tank taunt row for. build.ts used to
// hardcode two ids, which is the drift this file warns about — Fankriss got the row unreviewed.
export const RAID_TANK_SWAP_AURAS: readonly number[] =
  [...new Set(RAID_BOSS_TACTICS.map((t) => t.tankSwapAura).filter((a): a is number => a != null))];

// Rows to prepend onto the combat list when the focus is this creature. Empty for every generic boss, so
// the hot path pays one Map lookup.
export function encounterTacticRows(entry: number): readonly RotationRule[] {
  const t = BY_ENTRY_ROWS.get(entry | 0);
  return t ?? EMPTY_ROWS;
}

/** Every per-fight tactic rule, for rotationNeeds so add-focus still fills snapshot fields. */
export function allEncounterTacticRules(): readonly RotationRule[] {
  const out: RotationRule[] = [];
  const seen = new Set<string>();
  for (const t of RAID_BOSS_TACTICS) {
    for (const e of t.encounterRows ?? []) {
      if (seen.has(e.rule.id)) continue;
      seen.add(e.rule.id);
      out.push(e.rule);
    }
  }
  return out;
}

// Baked GO spawns for this fight's use_object rows, one bag slot per spawn. A targetEntry of 0 is
// the endless floor shell, which asks for the whole map — a per-entry walk left it empty.
export function combatObjectsFromBake(mapId: number, targetEntry: number): number[] {
  const wanted = new Set<number>();
  const rows = (targetEntry | 0) > 0
    ? encounterTacticRows(targetEntry)
    : allEncounterTacticRules();
  for (const r of rows) {
    if (r.action.kind === 'use_object') wanted.add(r.action.goEntry | 0);
  }
  if (wanted.size === 0) return [];
  const out: number[] = [];
  for (const o of dungeonGameObjectsForMap(mapId)) {
    if (wanted.has(o.entry | 0)) out.push(o.entry | 0);
  }
  if (wanted.has(180619) && (mapId | 0) === 509) {
    for (const s of dungeonSpawnsForMap(509)) {
      if ((s.entry | 0) === 15590) out.push(180619);
    }
  }
  return out;
}

// Where each bag entry STANDS in combat yards, so a clicker walks to it instead of pressing from
// across the room. First spawn per entry, and no anchor leaves world coordinates.
export function combatObjectSitesFromBake(
  mapId: number,
  goEntries: readonly number[],
  anchorOrigin: { x: number; y: number } | undefined,
): { goEntry: number; origin: { x: number; y: number; z?: number } }[] {
  const wanted = new Set(goEntries.map((e) => e | 0));
  if (wanted.size === 0) return [];
  const seen = new Set<number>();
  const out: { goEntry: number; origin: { x: number; y: number; z?: number } }[] = [];
  for (const o of dungeonGameObjectsForMap(mapId)) {
    const entry = o.entry | 0;
    if (!wanted.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    out.push({
      goEntry: entry,
      origin: anchorOrigin
        ? { x: o.x - anchorOrigin.x, y: o.y - anchorOrigin.y, z: o.z }
        : { x: o.x, y: o.y, z: o.z },
    });
  }
  return out;
}

// The bag entries a click does NOT spend. A BUTTON re-arms after Use, so a consuming bag gave the
// party six presses for a fight that re-lights a face every 6-17 s. Type comes from the bake row.
export function combatObjectsReusableFromBake(mapId: number, targetEntry: number): number[] {
  const bag = new Set(combatObjectsFromBake(mapId, targetEntry));
  if (bag.size === 0) return [];
  const out = new Set<number>();
  for (const o of dungeonGameObjectsForMap(mapId)) {
    if (bag.has(o.entry | 0) && (o.type | 0) === GAMEOBJECT_TYPE_BUTTON) out.add(o.entry | 0);
  }
  return [...out];
}

const EMPTY_ROWS: readonly RotationRule[] = [];

const BY_ENTRY = new Map(RAID_BOSS_TACTICS.map((r) => [r.entry, r]));

function buildEncounterRowIndex(): Map<number, readonly RotationRule[]> {
  const map = new Map<number, RotationRule[]>();
  const add = (entry: number, rules: readonly RotationRule[]): void => {
    const cur = map.get(entry);
    if (!cur) {
      map.set(entry, [...rules]);
      return;
    }
    for (const r of rules) {
      if (!cur.includes(r)) cur.push(r);
    }
  };
  for (const t of RAID_BOSS_TACTICS) {
    const extra = t.encounterRows ?? [];
    if (!extra.length) continue;
    const rules = extra.map((e) => e.rule);
    add(t.entry, rules);
    // Kill-order retargets the raid onto these adds. Keep-range / spread must still
    // run while the focus is a bat, or casters walk back into Sonic Burst.
    for (const e of extra) {
      if (e.kind !== 'kill-order') continue;
      const a = e.rule.action;
      if (a.kind !== 'kill_order') continue;
      for (const id of a.entries) add(id, rules);
    }
    // A ROW FILES UNDER THE BODY IT NAMES. keep_range carries the creature its distance is measured
    // from, and Ring of Law's 9027 is a placeholder for a pool of six rolled one per run.
    for (const e of extra) {
      const a = e.rule.action;
      if (a.kind !== 'move') continue;
      const named = a.move.kind === 'keep_range' ? a.move.entry : undefined;
      if (named != null && (named | 0) > 0 && (named | 0) !== (t.entry | 0)) add(named | 0, rules);
    }
  }
  return map;
}

// The adds a boss's shipped kill-order names, for the player-authored focus verb. Per-fight plan
// data, so the row wraps it rather than asking for creature ids. Empty means the row refuses.
export function killOrderEntriesForBoss(entry: number): readonly number[] {
  const t = BY_ENTRY.get(entry | 0);
  if (!t) return [];
  const out: number[] = [];
  for (const e of t.encounterRows ?? []) {
    if (e.kind !== 'kill-order') continue;
    const a = e.rule.action;
    if (a.kind !== 'kill_order') continue;
    for (const id of a.entries) if (!out.includes(id | 0)) out.push(id | 0);
  }
  return out;
}

// Every GameObject this fight's shipped rows click, as a LIST rather than the first: Thermaplugg
// names six gnomeface buttons and only the lit one closes a vent. Empty means the row refuses.
export function useObjectEntriesForBoss(entry: number): readonly number[] {
  const t = BY_ENTRY.get(entry | 0);
  if (!t) return [];
  const out: number[] = [];
  for (const e of t.encounterRows ?? []) {
    const a = e.rule.action;
    if (a.kind !== 'use_object') continue;
    for (const id of a.goEntries?.length ? a.goEntries : [a.goEntry]) {
      if ((id | 0) > 0 && !out.includes(id | 0)) out.push(id | 0);
    }
  }
  return out;
}

const BY_ENTRY_ROWS = buildEncounterRowIndex();

/** One fight a raid row exists for. A shared aura has several. */
export interface RaidRowSource {
  slug: string;
  bossName: string;
  entry: number;
}

// What a raid rotation row IS, recovered from its rule id. The ids the builders emit were
// write-only, so the editor showed the verb and lost which fight the row answers.
export interface RaidRowIdentity {
  kind: RaidTacticKind;
  /** Every fight this one row covers - Mortal Wound 25646 is Kurinnaxx, Fankriss and Gluth. */
  sources: readonly RaidRowSource[];
  /** Authored one-liner. Only `encounterRows` carry one; the generated kinds do not. */
  label?: string;
  cite?: string;
  /** The aura the row gates on, so a caller with a DataStore can name it. */
  auraSpellId?: number;
  /** The add the row targets (mind control). */
  creatureEntry?: number;
}

function buildRaidRowIdentityIndex(): Map<string, RaidRowIdentity> {
  const map = new Map<string, RaidRowIdentity>();
  const add = (id: string, t: RaidBossTactics, seed: Omit<RaidRowIdentity, 'sources'>): void => {
    const src: RaidRowSource = { slug: t.slug, bossName: t.name, entry: t.entry };
    const cur = map.get(id);
    if (!cur) {
      map.set(id, { ...seed, sources: [src] });
      return;
    }
    if (!cur.sources.some((s) => s.entry === src.entry)) {
      (cur.sources as RaidRowSource[]).push(src);
    }
  };
  for (const t of RAID_BOSS_TACTICS) {
    for (const f of t.fleeAuras ?? []) {
      add(`raid_resp_flee_${f.aura}`, t, { kind: 'flee', auraSpellId: f.aura, cite: f.cite });
    }
    if (t.tankSwapAura != null) {
      add(`raid_resp_swap_${t.tankSwapAura}`, t, { kind: 'tank-swap', auraSpellId: t.tankSwapAura, cite: t.cite });
    }
    for (const m of t.mcEntries ?? []) {
      add(`raid_resp_mc_${m.entry}`, t, { kind: 'mc', creatureEntry: m.entry, cite: m.cite });
    }
    for (const c of t.cureAuras ?? []) {
      add(`raid_resp_cure_${c.aura}`, t, {
        kind: 'dispel',
        auraSpellId: c.aura,
        cite: c.cite,
        ...(c.label ? { label: c.label } : {}),
      });
    }
    // encounterRows already authored a label and a cite for exactly this screen; the row index
    // dropped them on the floor (`extra.map((e) => e.rule)`).
    for (const e of t.encounterRows ?? []) {
      add(e.rule.id, t, { kind: e.kind, label: e.label, cite: e.cite });
    }
  }
  return map;
}

const RAID_ROW_IDENTITY = buildRaidRowIdentityIndex();

/** What fight this rotation row answers, or undefined when it is not a raid row. */
export function raidRowIdentity(ruleId: string): RaidRowIdentity | undefined {
  return RAID_ROW_IDENTITY.get(ruleId);
}

// Rule-id prefix for a tactic the PLAYER authored on the Raid tab (`raidCustomRows.ts`). Declared here so
// `isRaidRuleId` can claim those ids without importing that module.
export const RAID_OWN_ROW_PREFIX = 'raid_own_';

// True for any row a raid tactic authored, baked or player-written. The editor and the save pruner
// must answer to one predicate, or a player row nobody knows about follows the character out.
export function isRaidRuleId(ruleId: string): boolean {
  return RAID_ROW_IDENTITY.has(ruleId) || ruleId.startsWith(RAID_OWN_ROW_PREFIX);
}

/** Every raid row, for the editor's Raid tab and the smoke ratchet. */
export function allRaidRowIdentities(): ReadonlyMap<string, RaidRowIdentity> {
  return RAID_ROW_IDENTITY;
}

/** Every tactics row for one raid, keyed by the dungeon def `id` (= `InstanceRun.dungeonId`). */
export function raidTacticsForSlug(slug: string): readonly RaidBossTactics[] {
  return RAID_BOSS_TACTICS.filter((t) => t.slug === slug);
}

export function tacticsForEntry(entry: number): RaidBossTactics | undefined {
  return BY_ENTRY.get(entry | 0);
}

/** An aura this fight really applies, and the unit it lands on. */
export interface RaidFightAura {
  aura: number;
  /** `self` = on a raider; `boss` = on the boss / its aggro holder. */
  on: 'self' | 'boss';
  /** Baked payload radius, when the aura carries one (a run-out bomb). */
  radiusYd?: number;
}

/** Condition metrics whose `ref` is a spell id rather than a creature or a zone. */
const AURA_REF_METRICS: ReadonlySet<string> = new Set([
  'debuffPresent', 'buffPresent', 'debuffStacks', 'aggroHolderDebuffPresent',
]);

// Every aura the player may hang a tactic of their own on, for one fight. A row gated on an aura
// nothing in the game applies would read as a working tactic and never fire once.
export function raidFightAuras(entry: number): readonly RaidFightAura[] {
  const t = BY_ENTRY.get(entry | 0);
  if (!t) return [];
  const out: RaidFightAura[] = [];
  const add = (a: RaidFightAura): void => {
    if (out.some((x) => x.aura === a.aura && x.on === a.on)) return;
    out.push(a);
  };
  for (const f of t.fleeAuras ?? []) add({ aura: f.aura, on: 'self', radiusYd: f.radiusYd });
  if (t.tankSwapAura != null) add({ aura: t.tankSwapAura, on: 'boss' });
  for (const c of t.cureAuras ?? []) add({ aura: c.aura, on: 'self' });
  for (const e of t.encounterRows ?? []) {
    for (const c of e.rule.conditions) {
      if (c.ref == null || !AURA_REF_METRICS.has(c.metric)) continue;
      add({ aura: c.ref, on: c.subject === 'target' ? 'boss' : 'self' });
    }
  }
  return out;
}

/** True when this seat wears the cloak at this pull. */
export function cloakRequiredForSeat(
  tactics: RaidBossTactics | undefined,
  role: 'tank' | 'healer' | 'dps' | 'damage' | undefined,
): boolean {
  if (!tactics?.cloak) return false;
  if (tactics.cloak.who === 'raid') return true;
  return role === 'tank';
}

export const TWIN_EMPEROR_ENTRIES: ReadonlySet<number> = new Set([
  ENTRY_VEKNILASH,
  ENTRY_VEKLOR,
]);

// The Four Horsemen are ONE encounter over four bodies: the def points at Mograine and creature
// linking brings the other three. Cite: naxxramas.cpp:527-541, one SetData(DONE) for all four.
export const ENTRY_MOGRAINE = 16062;
export const ENTRY_ZELIEK = 16063;
export const ENTRY_KORTHAZZ = 16064;
export const ENTRY_BLAUMEUX = 16065;

export const FOUR_HORSEMEN_ENTRIES: ReadonlySet<number> = new Set([
  ENTRY_MOGRAINE,
  ENTRY_ZELIEK,
  ENTRY_KORTHAZZ,
  ENTRY_BLAUMEUX,
]);

// The distance a SHIPPED row walks before the player retunes it — the default the Raid tab shows
// and compares an edit against. Null for a row with no distance, so the tab offers no yard chips.
export function raidRowDefaultYd(ruleId: string): number | null {
  const flee = ruleId.startsWith('raid_resp_flee_')
    ? RAID_FLEE_AURAS.find((f) => `raid_resp_flee_${f.aura}` === ruleId)
    : undefined;
  if (flee) return flee.radiusYd + FLEE_CLEAR_MARGIN_YD;
  for (const rule of allEncounterTacticRules()) {
    if (rule.id === ruleId) return raidRuleYdOf(rule);
  }
  return null;
}
