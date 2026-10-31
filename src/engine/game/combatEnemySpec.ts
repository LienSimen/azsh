// Enemy CombatantSpec builders for session pulls and mid-fight summons, peeled from combatSession.ts
// so the hub stays under the filesize max. Pure helpers take DataStore explicitly.

import type { CombatantSpec } from '../combat.ts';
import type { Rng } from '../core/rng.ts';
import {
  bossEventAiOverlay,
  resolveCreatureDefForCombat,
} from '../../data/dungeons/boss-eventai.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { CreatureDef, SpellDef } from '../../data/schema.ts';
import { castEntriesFromAiScripts } from '../../domain/creature/creatureAi.ts';
import { meleeDamageSchoolOf } from '../../domain/creature/creatureAiConstants.ts';
import { scriptDevScheduleForEntry } from '../../domain/scriptdev/index.ts';
import {
  hasCreatureScaling, selectCreatureLevel,
} from '../../domain/creature/creatureScaling.ts';
import { TUNING } from '../combat/formulas.ts';

// Fixture multiplier on every spawned enemy's health, 1 = off and off is what the game ships. A 40-man
// melts an 8-unit pack in under 10 s, so every sustained-load capture measured a finished fight.
let enemyHpHold = 1;

/** Set the fixture multiplier. Values <= 1 turn it off. Dev/measurement only. */
export function setEnemyHpHold(mult: number): void {
  enemyHpHold = Number.isFinite(mult) && mult > 1 ? mult : 1;
}

/** The live multiplier, so a profiler report can say whether a capture was held. */
export function enemyHpHoldMult(): number {
  return enemyHpHold;
}

// Build a CombatantSpec for a creature template, primary or pack assistant. Consumes fight rng for the
// level and hp roll, so call it in stable pack order. Attaches EventAI from the boss overlay or bake.
export function buildEnemySpecFromCreature(
  ds: DataStore,
  def: CreatureDef,
  rng: Rng,
  bossSpellIds?: number[],
): { spec: CombatantSpec; level: number } {
  let level = def.level;
  let rolledHp: number;
  let armor = def.armor;
  let dmgMin = def.dmgMin;
  let dmgMax = def.dmgMax;
  let atkMs = def.attackTimeMs;
  // A mana pool only when the template or the class path has one — not every mob is a mana user, and
  // a melee with no max-level mana stays at 0 rather than getting an invented pool.
  let power = (def.mana && def.mana > 0) ? def.mana : 0;
  if (hasCreatureScaling(def)) {
    const scaled = selectCreatureLevel(
      def.scaling,
      (lvl, unitClass) => ds.creatureClassLvlStats(lvl, unitClass),
      { rng },
    );
    level = scaled.level;
    rolledHp = scaled.maxHealth;
    armor = scaled.armor;
    dmgMin = scaled.dmgMin;
    dmgMax = Math.max(scaled.dmgMax, scaled.dmgMin);
    atkMs = scaled.attackTimeMs;
    // Prefer the class-level mana when present, but do not wipe a baked pool when it returns 0: a
    // warrior unit class has no base mana while the template still stores one for a hybrid kit.
    if (scaled.mana > 0) power = scaled.mana;
    else if (!(def.mana && def.mana > 0)) power = 0;
  } else {
    rolledHp = rng.int(def.hpMin, def.hpMax);
  }
  const mobSpells = (def.spells ?? []).map((id) => ds.spell(id)).filter((s): s is SpellDef => !!s);
  const bossSpells = (bossSpellIds ?? []).map((id) => ds.spell(id)).filter((s): s is SpellDef => !!s);
  // The charm or pet action bar resolves into the spell map so a mind-controlled mob has real spells
  // to press, but it never becomes a cast row: a disabled spell list does not self-cast.
  const charmSpells = (def.charmSpells ?? []).map((id) => ds.spell(id)).filter((s): s is SpellDef => !!s);
  const enemySpells: SpellDef[] = [...mobSpells];
  for (const cs of charmSpells) if (!enemySpells.some((s) => s.id === cs.id)) enemySpells.push(cs);
  for (const bs of bossSpells) if (!enemySpells.some((s) => s.id === bs.id)) enemySpells.push(bs);
  // Wave V LOCK-8: pure-code EventAI overlay (DB-sourced) preferred over empty bake ai.
  const ai = bossEventAiOverlay(def.entry) ?? def.ai;
  // Overlay CAST scripts carry phase masks (e.g. Ravenian 17963). When the overlay has
  // only SPAWN/SET_PHASE/FLEE rows, keep bake creatureCasts so timer CASTs still schedule.
  const fromAiCasts = ai?.scripts?.length ? castEntriesFromAiScripts(ai.scripts) : [];
  // aifid S9: ScriptDev IR schedule supersedes bare kit / unscheduled specials for
  // ported bosses (Stratholme wing first). Cite: GAPS C.2/C.4; registry.ts.
  const sdSchedule = scriptDevScheduleForEntry(def.entry);
  let castRows = sdSchedule
    ? [...sdSchedule.castEntries]
    : fromAiCasts.length > 0
      ? [...fromAiCasts]
      : [...(def.creatureCasts ?? [])];
  const castSpellIds = new Set(castRows.map((c) => c.spellId));
  // S7: top-level spellList (fallback FE1 nest) — ensure spell defs resolve for list ids.
  const spellList = def.spellList ?? ai?.spellLists;
  if (spellList) {
    for (const row of spellList) {
      const sid = row.spellId | 0;
      if (sid <= 0) continue;
      if (enemySpells.some((s) => s.id === sid)) continue;
      const sp = ds.spell(sid);
      if (sp) enemySpells.push(sp);
    }
  }
  // ScriptDev helper spells (possess chain 17246/17250, transform, …) must resolve.
  if (sdSchedule) {
    for (const sid of sdSchedule.spellIds) {
      if (enemySpells.some((s) => s.id === sid)) continue;
      const sp = ds.spell(sid);
      if (sp) enemySpells.push(sp);
    }
  }
  // When ScriptDev owns the schedule, do NOT append bare {spellId} fillers (D4).
  if (!sdSchedule) {
    for (const s of enemySpells) {
      if (!castSpellIds.has(s.id)) {
        // Do not invent bare filler slots for spells that only exist on spellList —
        // the combat arm path merges spellList as TIMER slots (castEntriesFromSpellList).
        if (spellList?.some((r) => (r.spellId | 0) === s.id)) continue;
        // A charm-bar slot is not a schedule. Before the split these arrived inside `spells`
        // and got a bare {spellId} row here, which sessionInject then dropped with a warning.
        if (charmSpells.some((c) => c.id === s.id) && !mobSpells.some((m) => m.id === s.id)) continue;
        castRows.push({ spellId: s.id });
        castSpellIds.add(s.id);
      }
    }
  }
  // Ensure CAST-list spells are on the combatant spell map.
  for (const row of castRows) {
    if (enemySpells.some((s) => s.id === row.spellId)) continue;
    const sp = ds.spell(row.spellId);
    if (sp) enemySpells.push(sp);
  }
  // `spells` is what this creature CAN CAST, so a triggered payload no longer rides here — the five
  // resolution sites read the session store. Below: ScriptDev morph targets, resolved off the bake.
  const scriptDevMorphs = (sdSchedule?.morphEntries ?? [])
    .map((entry) => {
      const md = resolveCreatureDefForCombat(entry, (id) => ds.creature(id));
      if (!md) return null;
      return {
        creatureEntry: md.entry,
        name: md.name,
        maxHealth: md.hpMax,
        armor: md.armor,
        weapon: {
          dmgMin: md.dmgMin,
          dmgMax: md.dmgMax,
          speedMs: md.attackTimeMs,
          school: 'physical' as const,
        },
      };
    })
    .filter((m): m is NonNullable<typeof m> => m != null);
  const spec: CombatantSpec = {
    name: def.name,
    level,
    maxHealth: rolledHp,
    // Creatures without a mana pool still use powerType mana with max 0 (C++ POWER_MANA).
    // Do not invent a positive pool for melee; casters/healers carry def.mana / CLS BaseMana.
    powerType: 'mana',
    maxPower: power,
    startPower: power,
    armor,
    // creature_template.DamageSchool: a non-zero school makes the white hit magical, so it runs through
    // resistance instead of armor and can never be blocked. Cite: Creature.cpp:458.
    weapon: { dmgMin, dmgMax, speedMs: atkMs, school: meleeDamageSchoolOf(def.damageSchool) },
    attackPower: 0,
    critChance: TUNING.baseCritChance,
    hitChance: TUNING.meleeHitChance,
    haste: 0,
    canParry: true,
    canBlock: false,
    creatureType: def.creatureType,
    // creature_template.UnitClass, for SCALES_WITH_CREATURE_LEVEL's classlevelstats lookup.
    // Defaults to 1 (warrior) the same way mapCreatureTemplateScaling does.
    unitClass: def.scaling?.unitClass ?? 1,
    creatureEntry: def.entry,
    // A boss is a bigger body, so melee reach it from further out. Cite: creature.ts combatReachYd.
    ...(def.combatReachYd != null && def.combatReachYd > 0
      ? { combatReachYd: def.combatReachYd }
      : {}),
    // creature_template.ResistanceHoly..Arcane, so a mob's magic school wall reaches the damage
    // roll. Fighter copies this object. Cite: Creature.cpp:585-590 SetCreateResistance.
    ...(def.resistances ? { resistances: { ...def.resistances } } : {}),
    // Only the rows that differ from 14 are baked, so absent means the default. Cite: Creature.h:425-428.
    ...(def.regenerateStats != null ? { regenerateStats: def.regenerateStats | 0 } : {}),
    ...(def.extraFlags ? { extraFlags: def.extraFlags } : {}),
    ...(def.staticFlags ? { staticFlags: def.staticFlags } : {}),
    ...(def.staticFlags2 ? { staticFlags2: def.staticFlags2 } : {}),
    spells: enemySpells,
    creatureCasts: castRows.length ? castRows : undefined,
    ...(scriptDevMorphs.length ? { scriptDevMorphs } : {}),
    ...(spellList && spellList.length ? { spellList } : {}),
    ...(ai ? { ai } : {}),
    schoolImmuneMask: def.schoolImmuneMask,
    mechanicImmuneMask: def.mechanicImmuneMask,
    ...(def.unitFlags ? { spawnUnitFlags: def.unitFlags | 0 } : {}),
    ...(def.immunities ? { immunities: def.immunities } : {}),
  };
  // Fixture only (enemyHpHold === 1 in the shipped game, so this is dead weight at runtime).
  if (enemyHpHold > 1) {
    spec.maxHealth = Math.max(1, Math.round(spec.maxHealth * enemyHpHold));
    if (spec.startHealth != null) spec.startHealth = spec.maxHealth;
  }
  return { spec, level };
}

// Mid-fight inject: resolve a summoned creature id to a CombatantSpec, bake first then the summon-only
// overlays. Uses the fight rng stream, and returns null with no template so combat never stalls.
export function resolveSummonForFight(
  ds: DataStore,
  creatureId: number,
  rng: Rng,
): CombatantSpec | null {
  const d = resolveCreatureDefForCombat(creatureId, (id) => ds.creature(id));
  if (!d) return null;
  return buildEnemySpecFromCreature(ds, d, rng).spec;
}
