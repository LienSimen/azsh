// Companion auto-combat is the SAME system as the player: shared packs, shared Rotation shape and
// shared chooseCombatAction. This module is role→band picks, the default seed and thin glue.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { AllyActionProvider, AllyCombatAction, ProviderNeeds } from '../../engine/combat.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/item-triggers.ts';
import { combatItems, type Character } from '../character/character.ts';
import { equippedEntries } from '../items/itemInstance.ts';
import type { Inventory } from '../items/inventory.ts';
import { imbueItemsIn } from './companionPrep.ts';
import { consumableFamilyKey } from '../items/consumableFamily.ts';
import { allEncounterTacticRules, encounterTacticRows } from '../raid/raidEncounterTactics.ts';
import {
  CLASS_DEFAULT_SPEC,
  getClassSuggestions,
  selectBand,
  suggestionClassKeyFromClassId,
} from '../rotation/rotationSuggestions.ts';
import type { SpellBook } from '../character/spellbook.ts';
import {
  buildDefaultRotation,
  ensureKnownDispelRows,
  chooseCombatAction,
  chooseOocAction,
  defaultItemRuleConditions,
  isRotationValid,
  peekHaltDpsSchool,
  primarySpec,
  peekKillOrderEntries,
  keepAuraIdsOf,
  killOrderEntriesFromAction,
  ROTATION_PHASES,
  rotationSigDiffers,
  type Rotation,
  type RotationPhase,
  type RotationRule,
  type RotationSnapshot,
  type RotationProfileId,
  type RotationBandOptions,
  type RuleAfter,
  type RuleSpellTarget,
} from '../rotation/rotation.ts';
import { friendlyCastItemGate } from '../rotation/consumables.ts';
import {
  companionCharacter,
  companionLevel,
  companionSpellbook,
  decodeAoeMode,
  encodeAoeMode,
  resolveAoeMode,
  resolveOffHeal,
  type Companion,
  type CompanionAoeMode,
  type SquadRole,
} from './squad.ts';

// Suggestion-band override for a squad role so tank/healer do not seed Arms/Ret defaults. Matches
// CLASS_DEFAULT_SPEC role counterparts used by botSpecs + packs.
export function roleSpecOverride(cls: number, role: SquadRole): string | null {
  if (role === 'dps') return null;
  // CLASS ids: 1 warrior, 2 paladin, 3 hunter, 4 rogue, 5 priest, 7 shaman, 8 mage, 9 warlock, 11 druid
  if (role === 'tank') {
    if (cls === 1) return 'Protection';
    if (cls === 2) return 'Protection';
    if (cls === 11) return 'Feral tank';
    return null;
  }
  // healer
  if (cls === 2) return 'Holy';
  if (cls === 5) return 'Holy';
  if (cls === 7) return 'Restoration';
  if (cls === 11) return 'Restoration';
  return null;
}

// Tank / healer bands — the only characters offered a second DPS profile, since a DPS band's
// primary already is one. The same table partyRole.ts:51-55 reads, kept here for both sides.
export function isSupportRotationBand(cls: number, band: string | null | undefined): boolean {
  if (!band) return false;
  if (band === roleSpecOverride(cls, 'tank') || band === roleSpecOverride(cls, 'healer')) return true;
  return cls === 5 && band === 'Discipline'; // Disc heals; the band table only names Holy
}

// Band the second profile builds on: the class's damage tree. Cite: domain/rotation/rotationSuggestions.ts
// CLASS_DEFAULT_SPEC.
export function dpsRotationBand(cls: number, supportBand?: string | null): string | undefined {
  // Feral tank's damage half is the other side of the same tree, not the class default.
  if (supportBand === 'Feral tank') return 'Feral';
  const key = suggestionClassKeyFromClassId(cls);
  return key ? CLASS_DEFAULT_SPEC[key] : undefined;
}

/** First botSpecs index whose dungeon role matches (for hire / lazy talent stamp). */
export function botSpecIdxForRole(cls: number, role: SquadRole, ds: DataStore): number | undefined {
  const specs = ds.botSpecs(cls);
  const i = specs.findIndex((s) => s.role === role);
  return i >= 0 ? i : undefined;
}

/** Premade for a hire/resign role. Keeps `current` when that spec already plays `role`. */
export function specIdxForRole(
  cls: number,
  role: SquadRole,
  current: number | undefined,
  ds: DataStore,
): number | undefined {
  if (current != null && ds.botSpecs(cls)[current]?.role === role) return current;
  return botSpecIdxForRole(cls, role, ds) ?? current;
}

/** Assign role + matching premade. Drops a non-custom rotation so the next ensure rebuilds. */
export function applyCompanionRole(comp: Companion, role: SquadRole, ds: DataStore): void {
  const idx = specIdxForRole(comp.cls, role, comp.specIdx, ds);
  comp.role = role;
  if (idx != null && comp.specIdx !== idx) {
    comp.specIdx = idx;
    if (comp.talentLink) delete comp.talentLink;
  }
  if (comp.rotation && !comp.rotation.custom) delete comp.rotation;
}

/** Whether this companion's band is a tank/healer tree, i.e. it gets a second DPS profile. */
export function companionHasDpsProfile(comp: Companion): boolean {
  return isSupportRotationBand(comp.cls, roleSpecOverride(comp.cls, comp.role));
}

/** The profile in force. 'dps' collapses to primary the moment the role stops being support. */
export function companionActiveProfile(comp: Companion): RotationProfileId {
  return comp.rotationProfile === 'dps' && companionHasDpsProfile(comp) ? 'dps' : 'primary';
}

/** The stored rotation in one profile slot. */
export function companionRotationSlot(comp: Companion, profile: RotationProfileId): Rotation | undefined {
  return profile === 'dps' ? comp.rotationDps : comp.rotation;
}

/** Write one profile slot (mutates — callers already own the squad member). */
export function setCompanionRotationSlot(
  comp: Companion,
  profile: RotationProfileId,
  rot: Rotation,
): void {
  if (profile === 'dps') comp.rotationDps = rot;
  else comp.rotation = rot;
}

// The exact (char, spellbook, band) triple a companion default is generated from. Shared so the
// sig test reads the same inputs the build stamps — drift between them would rebuild every read.
function companionRotationInputs(
  comp: Companion,
  level: number,
  ds: DataStore,
  profile: RotationProfileId,
): { char: Character; sb: SpellBook; bags: Inventory | undefined; specOver: string | null | undefined } {
  const roleSpec = comp.specIdx == null ? botSpecIdxForRole(comp.cls, comp.role, ds) : undefined;
  const stamped: Companion = roleSpec != null ? { ...comp, specIdx: roleSpec } : comp;
  const roleBand = roleSpecOverride(comp.cls, comp.role);
  return {
    char: companionCharacter(stamped, level, ds),
    sb: companionSpellbook(stamped, level, ds),
    bags: comp.bags,
    specOver: profile === 'dps' ? (dpsRotationBand(comp.cls, roleBand) ?? null) : roleBand,
  };
}

// True when a stored companion default was built for a different level, spec or known-spell count
// than it has now. Ignores `custom`: the caller decides, exactly as on the player side.
export function companionRotationSigDiffers(
  comp: Companion,
  level: number,
  ds: DataStore,
  rot: Rotation,
  profile: RotationProfileId = 'primary',
  opts?: RotationBandOptions,
): boolean {
  const { char, sb, specOver } = companionRotationInputs(comp, level, ds, profile);
  return rotationSigDiffers(rot, char, sb, ds, specOver, opts);
}

// True when a pvp band really covers this body's level AND tree. `selectBand` falls back to the PvE
// ladder when it does not, so a list asked for as pvp would silently be the PvE one.
export function companionHasPvpBand(comp: Companion, level: number, ds: DataStore): boolean {
  const key = suggestionClassKeyFromClassId(comp.cls);
  if (!key) return false;
  const { char, specOver } = companionRotationInputs(comp, level, ds, 'primary');
  const spec = primarySpec(char, ds, specOver);
  return selectBand(getClassSuggestions(key), level, spec, { mode: 'pvp' })?.mode === 'pvp';
}

// Role-adapted default: the same buildDefaultRotation the player gets, with the Protection / Holy
// / Resto band when the role asks. `profile: 'dps'` swaps that for the class damage band.
export function buildCompanionRotation(
  comp: Companion,
  level: number,
  ds: DataStore,
  profile: RotationProfileId = 'primary',
  opts?: RotationBandOptions,
): Rotation {
  const { char, sb, bags, specOver } = companionRotationInputs(comp, level, ds, profile);
  // A known dispel no band authored. Memoized with the build, so BG and arena readers pay it once.
  let base = ensureKnownDispelRows(buildDefaultRotation(char, sb, ds, bags, specOver, opts), sb, ds);
  base = { ...base, profile };
  if (base.autoSig) {
    base = { ...base, autoSig: { ...base.autoSig, role: profile === 'dps' ? 'dps' : comp.role } };
  }
  return base;
}

// One built default per (companion, inputs) — a 40v40 gate asks per seat three times over. The
// key carries every input the build reads, so a drunk elixir or a respec honestly rebuilds.
const builtRotationMemo = new WeakMap<Companion, Map<string, Rotation>>();

function rotationBuildKey(
  comp: Companion,
  level: number,
  profile: RotationProfileId,
  opts?: RotationBandOptions,
): string {
  const bags = comp.bags?.stacks.map((s) => `${s.item}:${s.count}`).join(',') ?? '';
  const gear = Object.values(equippedEntries(comp.equipped)).join(',');
  const auras = comp.prePullAuras?.map((a) => a.spellId).join(',') ?? '';
  return `${profile}|${opts?.mode ?? ''}|${opts?.variant ?? ''}|${level}|${comp.specIdx ?? -1}`
    + `|${comp.talentLink ?? ''}|${comp.role}|${bags}|${gear}|${auras}`;
}

// Stored rotation for a profile when valid for the class, else a fresh band default. `mode: 'pvp'`
// is the duel / BG request: a hand-edited list is never swapped, an untouched default rebuilds.
export function companionRotationOf(
  comp: Companion,
  playerLevel: number,
  ds: DataStore,
  profile: RotationProfileId = companionActiveProfile(comp),
  opts?: RotationBandOptions,
): Rotation {
  const stored = companionRotationSlot(comp, profile);
  if (isRotationValid(stored, comp.cls)) {
    const sameFight = (stored.autoSig?.mode ?? undefined) === (opts?.mode ?? undefined)
      && (stored.autoSig?.variant ?? undefined) === (opts?.variant ?? undefined);
    if (stored.custom === true || sameFight) return stored;
  }
  const level = companionLevel(comp, playerLevel);
  const key = rotationBuildKey(comp, level, profile, opts);
  let perComp = builtRotationMemo.get(comp);
  const hit = perComp?.get(key);
  if (hit) return hit;
  const built = buildCompanionRotation(comp, level, ds, profile, opts);
  if (!perComp) { perComp = new Map(); builtRotationMemo.set(comp, perComp); }
  perComp.set(key, built);
  return built;
}

// `preferAoeRules` allocates two arrays and a rotation object, and ran per unit per tick in AoE
// mode. It is pure in (rotation, classifier), so one memo per rotation object is enough.
const aoeRotCache = new WeakMap<Rotation, Rotation>();
function aoeRotationOf(rot: Rotation, isMultiSpell: (spellId: number) => boolean): Rotation {
  let hit = aoeRotCache.get(rot);
  if (hit === undefined) {
    hit = preferAoeRules(rot, isMultiSpell);
    aoeRotCache.set(rot, hit);
  }
  return hit;
}

/** Reorder combat so multi-target spells are considered first (S4C aoe prefer). */
export function preferAoeRules(
  rot: Rotation,
  isMultiSpell: (spellId: number) => boolean,
): Rotation {
  const multi: RotationRule[] = [];
  const rest: RotationRule[] = [];
  for (const r of rot.phases.combat) {
    if (r.action.kind === 'spell' && isMultiSpell(r.action.spellId)) multi.push(r);
    else rest.push(r);
  }
  if (multi.length === 0) return rot;
  return { ...rot, phases: { ...rot.phases, combat: [...multi, ...rest] } };
}

// Inject item rules for combat consumables currently in the companion's bags. Hire seeds once; gifts arrive
// later — idempotent on existing item-entry rules.
export function syncCompanionBagItemRules(
  rot: Rotation,
  char: Character,
  bags: Inventory | undefined,
  ds: DataStore,
): Rotation {
  if (!bags?.stacks.length) return rot;
  const items = combatItems(char, bags, ds);
  // Weapon imbues are never CombatItems (out-of-combat only), so they need their own scan.
  const imbues = imbueItemsIn(bags, ds);
  if (!items.length && !imbues.length) return rot;

  // Entries a seed may add but must never switch ON — see the `enabled` line below. A character
  // seeded before that rule still carries the enabled row, so an existing one is flipped too.
  const neverAutoOn = new Set<number>();
  for (const it of items) {
    if (it.reusable === true) continue;
    if (it.effect.kind === 'hostile_cast') { neverAutoOn.add(it.entry); continue; }
    if (it.effect.kind !== 'friendly_cast') continue;
    const g = friendlyCastItemGate(it.effect.spell, it.effect.spellId, ds);
    if (g.autoOff || g.neverAuto) neverAutoOn.add(it.entry);
  }
  const autoSeeded = (r: RotationRule): boolean =>
    r.action.kind === 'item' && r.id === `g-item-${r.action.itemEntry}`
    && neverAutoOn.has(r.action.itemEntry);

  const have = new Set<number>();
  const haveFamilies = new Set<string>();
  let flip = false;
  for (const p of ROTATION_PHASES) {
    for (const r of rot.phases[p] ?? []) {
      if (r.action.kind !== 'item') continue;
      have.add(r.action.itemEntry);
      if (r.action.family) haveFamilies.add(r.action.family);
      if (r.enabled && autoSeeded(r)) flip = true;
    }
  }

  // Every CombatItem kind gets seeded. Before this only restore and apply_buff were handled, so
  // all 28 grenades and the whole immunity kit sat in a companion's bags unusable.
  const add: Record<RotationPhase, RotationRule[]> = {
    prebuff: [], buffs: [], pull: [], combat: [], recovery: [],
  };
  for (const it of items) {
    if (have.has(it.entry) || (it.family != null && haveFamilies.has(it.family))) continue;
    const kind = it.effect.kind;
    const buffSpellId = it.effect.kind === 'apply_buff' ? it.effect.spellId : undefined;
    // A friendly_cast rides its whole SpellDef, and the gate is read off that payload — a Target
    // Dummy and a Free Action Potion are not the same row (consumables.ts friendlyCastItemGate).
    const payload = it.effect.kind === 'friendly_cast'
      ? { spell: it.effect.spell, spellId: it.effect.spellId, ds }
      : {};
    const { conditions, phase, autoOff, neverAuto } = defaultItemRuleConditions(kind, {
      itemEntry: it.entry,
      ...(buffSpellId != null ? { buffSpellId } : {}),
      ...payload,
    });
    // A seeded hostile_cast carries `target.healthPct > 30` (build.ts:401), which is every mob on
    // every pull — so a use that DESTROYS the item spends it with nobody asking. Seed it off.
    // `neverAuto` is the worn self-harm case: reusable, and still never fired unasked.
    const spendsTheItem = (kind === 'hostile_cast' || autoOff === true) && it.reusable !== true;
    add[phase].push({
      id: `g-item-${it.entry}`,
      action: { kind: 'item', itemEntry: it.entry, ...(it.family ? { family: it.family } : {}) },
      conditions,
      enabled: !(spendsTheItem || neverAuto === true),
    });
  }
  for (const im of imbues) {
    const family = consumableFamilyKey(ds.item(im.entry), ds);
    if (have.has(im.entry) || (family != null && haveFamilies.has(family))) continue;
    const { conditions, phase } = defaultItemRuleConditions('weapon_imbue', { itemEntry: im.entry });
    add[phase].push({
      id: `g-item-${im.entry}`,
      action: { kind: 'item', itemEntry: im.entry, ...(family ? { family } : {}) },
      conditions,
      enabled: true,
    });
    have.add(im.entry);
    if (family) haveFamilies.add(family);
  }
  if (!flip && !ROTATION_PHASES.some((p) => add[p].length)) return rot;
  const phases = { ...rot.phases };
  for (const p of ROTATION_PHASES) {
    const cur = rot.phases[p];
    if (!cur?.length && !add[p].length) continue;
    let list = cur ?? [];
    if (flip) list = list.map((r) => (r.enabled && autoSeeded(r) ? { ...r, enabled: false } : r));
    if (add[p].length) list = [...list, ...add[p]];
    phases[p] = list;
  }
  return { ...rot, phases };
}

export interface CompanionActionKnobs {
  companion?: Pick<Companion, 'aoeMode' | 'offHeal' | 'cls'>;
  aoeMode?: CompanionAoeMode;
  offHealAllowed?: boolean;
  /** Combatant id of this unit's pet, so an item rule targeting 'pet' can resolve. */
  petCombatantId?: string;
  isMultiSpell?: (spellId: number) => boolean;
  // Spell id → pure keep-up buff safe from buffs phase mid-session. Callers with DataStore: `(id) =>
  // isCompanionKeepUpSpell(ds.spell(id))`.
  isOocKeepUp?: (spellId: number) => boolean;
}

/** Combat ms one keep-up may block the combat phase before the provider stops offering it. */
const OOC_KEEPUP_YIELD_AFTER_MS = 10_000;

// Memoized because the resolve is 15% of live JS, and keyed on the def OBJECT so a talent-modded
// clone is asked separately from the bake row.
const keepUpMemo = new WeakMap<SpellDef, boolean>();
const keepUpDurMemo = new WeakMap<SpellDef, number>();

// What a keep-up LEAVES BEHIND. Every mage armor, aspect, Lightning Shield, Thorns and Retribution
// Aura carries a proc rider, so "every effect is buff or resist" refused 41 of the 51 packed rows.
const KEEP_UP_AURA_KINDS: ReadonlySet<string> = new Set([
  'buff', 'resist', 'damage_shield', 'school_absorb', 'mana_shield', 'proc_trigger_spell',
  'restore_power', 'restore_health', 'split_damage', 'split_damage_flat', 'blessing_of_light',
  'threat_temporary', 'mod_unattackable', 'immunity',
]);

// The heavy business a buffs-phase row can also be — a rez, a conjure, a pet, a trap, a coat. None
// is an aura on a bar, none may be a free pre-pull stamp, none takes a mid-fight GCD (9d41d22d5).
const NOT_A_KEEP_UP_KINDS: ReadonlySet<string> = new Set([
  'resurrect', 'conjure', 'summon_pet', 'summon_demon', 'revive_pet', 'summon_totem',
  'summon_object_slot', 'shapeshift', 'weapon_imbue', 'learn_spell', 'teleport', 'teleport_hearth',
  'stealth', 'next_cast_mod', 'reset_cooldowns',
]);

export function isCompanionKeepUpSpell(s: SpellDef | undefined): boolean {
  if (!s) return false;
  const hit = keepUpMemo.get(s);
  if (hit !== undefined) return hit;
  const resolved = resolveCombatSpell(s);
  const effects = resolved.effects ?? [];
  const yes = effects.length > 0
    && !resolved.outOfCombatOnly
    && (resolved.channelMs ?? 0) <= 0
    && effects.some((e) => KEEP_UP_AURA_KINDS.has(e.kind))
    && effects.every(
      (e) => !NOT_A_KEEP_UP_KINDS.has(e.kind) && !(e.kind === 'buff' && e.hostile === true),
    );
  keepUpMemo.set(s, yes);
  return yes;
}

/** Longest resolved aura duration of a keep-up buff (0 = permanent-until-cancelled). */
export function keepUpAuraDurationMs(s: SpellDef): number {
  const hit = keepUpDurMemo.get(s);
  if (hit !== undefined) return hit;
  let max = 0;
  for (const e of resolveCombatSpell(s).effects ?? []) {
    if (e.kind !== 'buff' && e.kind !== 'resist') continue;
    const d = (e as { durationMs?: number }).durationMs ?? 0;
    if (d > max) max = d;
  }
  keepUpDurMemo.set(s, max);
  return max;
}

// Engine-facing brain: a pure closure over one unit's Rotation, running the same evaluator as the
// player autopilot. Named for its first caller — the PLAYER uses it too for engine-driven ticks.
export function companionActionProvider(
  rot: Rotation,
  targetEntry?: number,
  knobs?: CompanionActionKnobs,
): AllyActionProvider {
  // An OOC keep-up whose aura never registers under the id the check below reads was returned every
  // decision forever, so chooseCombatAction never ran and the unit buffed instead of fighting
  // (KI-1078). Same yield an unachieved move order takes: pickAction.ts:695 RUNOUT_YIELD_AFTER_MS.
  const oocSince = new Map<number, number>();
  const oocGaveUp = new Set<number>();
  const provider: AllyActionProvider = (snap) => {
    // The ENGINE stamps these when the session supplies `SimTickInputs.companionKnobs`, which is what
    // lets this provider be rebuilt from plain data instead of a live companion ref (S6b). Nothing
    // supplying them keeps the old reads, so a session without the channel is unchanged.
    const stamped = snap.aoeMode != null;
    const mode: CompanionAoeMode = stamped
      ? decodeAoeMode(snap.aoeMode)
      : (knobs?.companion ? resolveAoeMode(knobs.companion) : (knobs?.aoeMode ?? 'auto'));
    const offHealOn = stamped
      ? snap.offHealAllowed === 1
      : (knobs?.companion ? resolveOffHeal(knobs.companion) : (knobs?.offHealAllowed ?? false));
    const aoeCode = encodeAoeMode(mode);
    const baseUsable = snap.usableSpell;
    const isMulti = knobs?.isMultiSpell;
    // Stamped in place, not spread. The engine builds a fresh snapshot per call and drops it, and
    // `{...snap}` copied ~25 fields per unit per tick — 40 clones a tick at 40 units.
    const enriched = snap as RotationSnapshot;
    enriched.aoeMode = aoeCode;
    enriched.offHealAllowed = offHealOn ? 1 : 0;
    // Checkbox off: drop healerPowerPcts so those rows cannot fire (evaluate.ts returns null).
    const offHealSupplied = stamped || knobs?.companion != null || knobs?.offHealAllowed != null;
    if (offHealSupplied && !offHealOn) enriched.healerPowerPcts = undefined;
    enriched.usableSpell = (id) => {
      if (!baseUsable(id)) return false;
      if (mode === 'single' && isMulti?.(id)) return false;
      return true;
    };
    const useRot =
      mode === 'aoe' && enriched.enemyCount >= 2 && isMulti
        ? aoeRotationOf(rot, isMulti)
        : rot;
    // A keep-up that HAS registered is working: clear its clock so the next expiry gets a fresh
    // window, and only a buff that never lands at all can reach the give-up below.
    for (const id of oocSince.keys()) {
      if (enriched.self.buffs.has(id) || enriched.auraCovered?.(enriched.self.buffs, id)) {
        oocSince.delete(id); oocGaveUp.delete(id);
      }
    }
    // Both guards below protect a MID-FIGHT GCD, so both are in-combat rules: the shape gate blocked
    // 41 of 51 packed rows, and the give-up is a yield inside one fight, not a session-long ban.
    const outOfFight = enriched.inCombat === false;
    if (outOfFight && oocGaveUp.size > 0) { oocGaveUp.clear(); oocSince.clear(); }
    // One spell action -> one provider pick. The OOC branch returned a bare id and dropped the
    // row's target with it, so a `{ allyMissingAura }` party keep-up cast on the caster instead.
    const spellPick = (a: { spellId: number; target?: RuleSpellTarget; after?: RuleAfter }): AllyCombatAction => {
      const t = a.target;
      const offTarget = t === 'other';
      const obj = t && typeof t === 'object' ? t : undefined;
      const creatureEntry = obj && 'creatureEntry' in obj ? obj.creatureEntry : undefined;
      const role = obj && 'role' in obj ? obj.role : undefined;
      const priority = obj && 'priority' in obj ? obj.priority : undefined;
      const allyMissingAura = obj && 'allyMissingAura' in obj ? obj.allyMissingAura : undefined;
      const lowestHp = obj && 'lowestHp' in obj && obj.lowestHp === true;
      // Both aimed forms carry the same narrowing field, and dropping it on the party keep-up let a
      // paladin bless a class its PallyPower column never named.
      const among = (lowestHp || allyMissingAura != null) && obj && 'among' in obj
        ? obj.among : undefined;
      if (a.after || offTarget || creatureEntry != null || role != null || priority != null
        || allyMissingAura != null || lowestHp) {
        return {
          spell: a.spellId,
          ...(a.after ? { after: a.after } : {}),
          ...(offTarget ? { offTarget: true } : {}),
          ...(creatureEntry != null ? { creatureEntry } : {}),
          ...(role != null ? { role } : {}),
          ...(priority != null ? { priority } : {}),
          ...(allyMissingAura != null ? { allyMissingAura } : {}),
          ...(lowestHp ? { lowestAlly: true } : {}),
          ...(among ? { among } : {}),
        };
      }
      return a.spellId;
    };
    const ooc = chooseOocAction(useRot, enriched);
    // "I already have it" answers a SELF keep-up only. A party row is about somebody else's bar, and
    // this guard killed it the moment the caster buffed itself — the first body a party row reaches.
    const aimsAtAlly = ooc?.kind === 'spell' && ooc.target != null
      && typeof ooc.target === 'object' && 'allyMissingAura' in ooc.target;
    const selfHas = (id: number): boolean =>
      enriched.self.buffs.has(id) || enriched.auraCovered?.(enriched.self.buffs, id) === true;
    if (ooc && ooc.kind === 'spell'
      && (aimsAtAlly || !selfHas(ooc.spellId))
      && !oocGaveUp.has(ooc.spellId)
      && (outOfFight || (knobs?.isOocKeepUp?.(ooc.spellId) ?? true))) {
      // The give-up clock reads "never registers", on a bar it cannot see. `actionUsable` owns this row.
      if (aimsAtAlly) return spellPick(ooc);
      const since = oocSince.get(ooc.spellId);
      if (since == null || enriched.combatTimeMs < since) oocSince.set(ooc.spellId, enriched.combatTimeMs);
      else if (enriched.combatTimeMs - since > OOC_KEEPUP_YIELD_AFTER_MS) oocGaveUp.add(ooc.spellId);
      if (!oocGaveUp.has(ooc.spellId)) return spellPick(ooc);
    }
    const action = chooseCombatAction(useRot, enriched, targetEntry);
    if (!action) return null;
    if (action.kind === 'move') {
      // A run-out does not silence an instant: only a cast with time left is cancelled by movement,
      // and Burning Adrenaline is a nuke window the holder spends walking. 4 of 5 windows cast 0.
      const alt = chooseCombatAction(useRot, enriched, targetEntry, { skipMove: true });
      return alt?.kind === 'spell'
        ? { move: action.move, altSpell: alt.spellId }
        : { move: action.move };
    }
    if (action.kind === 'halt_dps') {
      return { haltDps: true, school: action.school ?? 'all', entries: action.entries };
    }
    if (action.kind === 'kill_order' || action.kind === 'keep_aura') return null;
    if (action.kind === 'use_object') return { useObject: action.goEntry };
    if (action.kind === 'spell') {
      return spellPick(action);
    }
    // Compiled away before the evaluator runs (macro/rotation.ts) and refused by actionUsable if
    // not, so chooseCombatAction never hands back a macro action.
    if (action.kind !== 'item') return null;
    const sel = action.target ?? 'self';
    if (sel === 'lowest_ally') {
      return { item: action.itemEntry, lowestAlly: true };
    }
    // 'pet' used to drop the rule entirely even though the editor offers the option.
    if (sel === 'pet') {
      const petId = knobs?.petCombatantId;
      if (!petId) return null;
      return { item: action.itemEntry, target: petId };
    }
    return { item: action.itemEntry };
  };
  provider.needs = rotationNeeds(rot, targetEntry);
  // Arm school halt before evaluate (pickAction sets f.haltDpsSchool from this).
  provider.peekHalt = (snap) => peekHaltDpsSchool(rot, snap, targetEntry);
  provider.peekKillOrder = (snap) => peekKillOrderEntries(rot, snap, targetEntry);
  provider.keepAuraIds = keepAuraIdsOf(rot);
  return provider;
}

// Which O(roster) snapshot fields this rotation's rules can observe, scanned over every phase and
// override. Exported only for the capability row that proves an opt-in metric stays opt-in.
export function rotationNeedsForCapability(rot: Rotation): ProviderNeeds {
  return rotationNeeds(rot);
}

function rotationNeeds(rot: Rotation, targetEntry?: number): ProviderNeeds {
  const needs: ProviderNeeds = {
    allyDistHp: false,
    allyTriageBuffs: false,
    allySubject: false,
    charmedHostileCount: false,
    enemyDistsFromTarget: false,
    enemyDists: false,
    enemyHealerDists: false,
    hasAggro: false,
    enemyCastingOnAlly: false,
    enemyCastingOnSelf: false,
    items: false,
    groundPools: false,
    targetCone: false,
    hostileCreatureEntries: false,
    spellCosts: false,
    dispellablePresent: false,
    kickableCastPresent: false,
    aggroHolder: false,
  };
  const scan = (rules: readonly RotationRule[] | undefined): void => {
    for (const r of rules ?? []) {
      if (r.action.kind === 'item') needs.items = true;
      if (r.action.kind === 'kill_order' || killOrderEntriesFromAction(r.action)) {
        needs.hostileCreatureEntries = true;
      }
      if (r.action.kind === 'spell' && r.action.target
        && typeof r.action.target === 'object' && 'creatureEntry' in r.action.target) {
        needs.hostileCreatureEntries = true;
      }
      // A follow-up step's own gate reads the same snapshot fields as the row's, so it advertises
      // the same needs; scanning the row alone left an ally-gated step reading null.
      const conds = [...r.conditions];
      const after = 'after' in r.action ? r.action.after : undefined;
      for (const s of after?.steps ?? []) if (s.conditions) conds.push(...s.conditions);
      for (const c of conds) {
        // A subject, not a metric: every SUBJECT metric can name an ally, so this is checked first
        // and does not join the metric chain below.
        if (c.subject === 'ally') needs.allySubject = true;
        if (c.metric === 'nearbyAlliesBelowHpCount'
          || c.metric === 'alliesWithinYd'
          || c.metric === 'healersWithinYd') {
          needs.allyDistHp = true;
        }
        else if (c.metric === 'allyLowestBuffPresent') needs.allyTriageBuffs = true;
        else if (c.metric === 'charmedHostileCount') needs.charmedHostileCount = true;
        else if (c.metric === 'hasAggro' || c.metric === 'allyHasAggro') needs.hasAggro = true;
        else if (c.metric === 'enemyCastingOnAlly') needs.enemyCastingOnAlly = true;
        else if (c.metric === 'enemyCastingOnSelf') needs.enemyCastingOnSelf = true;
        else if (c.metric === 'enemiesWithinYd' && c.subject === 'target') needs.enemyDistsFromTarget = true;
        else if (c.metric === 'enemiesWithinYd') needs.enemyDists = true;
        else if (c.metric === 'enemyHealersWithinYd') needs.enemyHealerDists = true;
        else if (c.metric === 'hazardProximityYd') needs.groundPools = true;
        else if (c.metric === 'inTargetCone') needs.targetCone = true;
        else if (c.metric === 'canAfford') needs.spellCosts = true;
        else if (c.metric === 'dispellablePresent') needs.dispellablePresent = true;
        else if (c.metric === 'castingPresent' && c.subject === 'target') needs.kickableCastPresent = true;
        else if (c.metric === 'aggroHolderDebuffPresent' || c.metric === 'aggroHolderDebuffStacks') needs.aggroHolder = true;
        else if (c.metric === 'itemCount') needs.items = true;
      }
    }
  };
  for (const phase of ROTATION_PHASES) scan(rot.phases[phase] ?? []);
  for (const list of Object.values(rot.overrides ?? {})) scan(list);
  // Per-fight tactic rows are prepended by the evaluator, not stored on the rotation, so a scan
  // that skipped them left their metric unfilled and the row could never fire.
  if (targetEntry != null) scan(encounterTacticRows(targetEntry));
  scan(allEncounterTacticRules());
  return needs;
}

/** Same brain, said out loud for non-companion callers (the player's engine-driven ticks). */
export const rotationActionProvider = companionActionProvider;

export type CompanionRotationFlag = 'NO-HEALS' | 'no-taunt' | 'EMPTY-COMBAT';

/** Audit a companion rotation for role/kit gaps (editor banner + CLI). */
export function auditCompanionRotation(
  rot: Rotation,
  role: SquadRole,
  ds: DataStore,
): CompanionRotationFlag[] {
  const all = ROTATION_PHASES.flatMap((p) => rot.phases[p] ?? []);
  const spellOf = (r: RotationRule) => (r.action.kind === 'spell' ? ds.spell(r.action.spellId) : null);
  const triageHeals = all.filter((r) =>
    spellOf(r)?.effects.some((e) => e.kind === 'heal')
    && r.conditions.some((c) => c.metric === 'allyLowestHpPct')).length;
  const hasTaunt = all.some((r) => spellOf(r)?.effects.some((e) => e.kind === 'taunt'));
  const flags: CompanionRotationFlag[] = [];
  if (role === 'healer' && triageHeals === 0) flags.push('NO-HEALS');
  if (role === 'tank' && !hasTaunt) flags.push('no-taunt');
  if (rot.phases.combat.length === 0) flags.push('EMPTY-COMBAT');
  return flags;
}

export function companionRotationWarning(flag: CompanionRotationFlag): string {
  switch (flag) {
    case 'NO-HEALS': return 'This healer knows no heals - visit a trainer';
    case 'no-taunt': return 'This tank has no taunt in its rotation';
    case 'EMPTY-COMBAT': return 'Combat phase is empty - this companion will only auto-attack';
  }
}

/** True when the spell is a party-healing cast (direct, HoT, LoH, Holy Shock). */
export function spellIsHeal(spell: {
  effects?: ReadonlyArray<{ kind: string }> | null;
} | null | undefined): boolean {
  return !!spell?.effects?.some(
    (e) =>
      e.kind === 'heal'
      || e.kind === 'restore_health'
      || e.kind === 'heal_max_health'
      || e.kind === 'holy_shock',
  );
}
