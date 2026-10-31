// Known combat / usable spell kit selectors.
// Extracted from character.ts (Wave 1 S3 barrel split). Pure move — no behavior change.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { Character } from './character.ts';
import { SPELL_EFFECT_LEARN_PET_SPELL, SPELL_EFFECT_LEARN_SPELL, type SpellBook } from './spellbook.ts';
import { inferRole } from '../../engine/combat.ts';
import { resolveChainPair } from '../../engine/spells/auraStacking.ts';
import { SPELL_EFFECT_CHARGE } from '../../engine/spells/interpreter/opcodes.ts';
import {
  resolveCombatSpell,
} from '../../engine/spells/interpreter/item-triggers.ts';
import { attachTotemKits } from '../spells/totem.ts';
import { activeTalentEffects, withTalentMods } from './characterTalents.ts';
import { isPoisonConjureName, isPoisonCraftRecipe, POISONS_SKILL_SPELL } from '../professions/poisons.ts';

// In-combat abilities the character knows. A starting character knows dozens of passive and
// proficiency spells, so only the ones that DO something active are kept, inferred from effects.
const ACTIVE_ROLES = new Set(['nuke', 'instant_nuke', 'control', 'dot', 'buff', 'strike', 'charge', 'pet_heal', 'shoot', 'attack', 'seal', 'judgement', 'totem_summon', 'form', 'stealth']);

/** Gap-closing opener (Charge / Intercept). Cite: SpellEffectDefines.h SPELL_EFFECT_CHARGE = 96. */
const isChargeOpener = (s: SpellDef): boolean =>
  s.rawEffects?.some((r) => (r.effect | 0) === SPELL_EFFECT_CHARGE) ?? false;

/** Effect kinds that make a spell combat-usable even when role is utility/empty. */
const ACTIVE_EFFECT_KINDS = new Set([
  'dispel', 'dispel_mechanic', 'cleanse', 'holy_shock', 'weapon_percent_damage', 'damage_shield',
  'school_absorb', 'mana_shield', 'proc_trigger_spell', 'next_cast_mod',
  'owned_spell_mods',
  'vampiric_embrace', 'mod_taunt', 'taunt', 'seal', 'cc', 'root',
]);

// CMaNGOS teaches generic internal spells the real client hides (Opening, Grovel, Duel, Stuck).
// The discriminator is the baked SPELL_ATTR_HIDDEN_CLIENTSIDE flag — never an icon fallback.
export function isHiddenInternalSpell(s: SpellDef): boolean {
  return !s.passive && !!s.hiddenClientside;
}

/** Per-DataStore cache: spell ids that appear as trigger_spell / proc_trigger_spell targets. */
const triggerPayloadIdsByStore = new WeakMap<object, Set<number>>();

function triggerPayloadIdSet(ds: DataStore): Set<number> {
  let set = triggerPayloadIdsByStore.get(ds);
  if (!set) {
    set = new Set<number>();
    // Fixture / partial stores may omit allSpells — treat as empty catalog (no false drops).
    const all = typeof ds.allSpells === 'function' ? ds.allSpells() : [];
    for (const sp of all ?? []) {
      for (const e of sp.effects ?? []) {
        if (e.kind === 'trigger_spell' && e.spellId) set.add(e.spellId);
        else if (e.kind === 'proc_trigger_spell' && e.triggerSpellId) set.add(e.triggerSpellId);
      }
      // Passive talent shells often bake effects=[] with only rawEffects.triggerSpell
      // (Relentless Strikes 14179 → 14181). Cite: KI-692; SpellAuras PROC_TRIGGER_SPELL.
      for (const re of sp.rawEffects ?? []) {
        const tid = (re.triggerSpell ?? 0) | 0;
        if (tid <= 0) continue;
        // A LEARN_SPELL stub's target is the ability the player LEARNS, not a payload the parent
        // fires — 77 spells read as secondaries because of it, Pick Pocket 921 (learned by 5167)
        // among them. Cite: spellbook.ts isLearnStubEffect; SpellEffects.cpp EffectLearnSpell.
        const eff = (re.effect ?? 0) | 0;
        if (eff === SPELL_EFFECT_LEARN_SPELL || eff === SPELL_EFFECT_LEARN_PET_SPELL) continue;
        set.add(tid);
      }
    }
    triggerPayloadIdsByStore.set(ds, set);
  }
  return set;
}

// Trigger and proc secondary payloads are applied by the parent cast, never scheduled alone. The
// discriminator: it is a trigger target AND the row has no cast economy.
export function isTriggeredSecondarySpell(s: SpellDef, ds: DataStore): boolean {
  if (!triggerPayloadIdSet(ds).has(s.id)) return false;
  // Free Auto Shot/Shoot/Throw toggles stay castable despite twin shells (1583→75). Cite: KI-870.
  const role = s.role ?? inferRole(s);
  if (
    role === 'shoot'
    && (s.cost ?? 0) === 0
    && (s.castTimeMs ?? 0) === 0
    && (s.gcdMs ?? 0) === 0
  ) {
    return false;
  }
  const inert =
    (s.cost ?? 0) === 0
    && (s.gcdMs ?? 0) === 0
    && (s.cooldownMs ?? 0) === 0
    && (s.castTimeMs ?? 0) === 0
    && !(s.costPct && s.costPct > 0)
    && !(s.rageGenerated && s.rageGenerated > 0);
  return inert;
}

// A spell above the caster's level is not castable, so it must not enter the combat kit. This was
// previously enforced only by accident, through the old no-icon rule. Cite: Spell.cpp CheckCast.
function isAboveCasterLevel(s: SpellDef, level: number): boolean {
  const req = (s.spellLevel ?? s.reqLevel ?? 0) | 0;
  return req > 0 && level > 0 && req > level;
}

/** SI5: materialize interpreter effects for kit filters (empty bake effects[] is expected). */
function resolveKitSpell(s: SpellDef, ds: DataStore | undefined, casterLevel?: number): SpellDef {
  // Pass casterLevel so level-scaled scripted amounts (Life Tap perLevel, etc.) match combat.
  // Cite: amount.ts CalculateSpellEffectValue; Warlock.cpp LifeTap m_currentBasePoints; SESSION 5.
  const resolved = resolveCombatSpell(
    s,
    casterLevel != null && casterLevel > 0 ? { casterLevel } : {},
  );
  // SESSION 6: attach creature_template_spells kits onto summon_totem when bake lacks abilities.
  // Cite: domain/spells/totem.ts attachTotemKits; Totem.cpp Summon TOTEM_PASSIVE.
  if (ds && (resolved.effects ?? []).some((e) => e.kind === 'summon_totem')) {
    return attachTotemKits(resolved, {
      creature: (entry) => ds.creature(entry),
      spell: (id) => ds.spell(id),
      weaponEnchantProc: (enchantId) => ds.weaponEnchantProc(enchantId),
    });
  }
  return resolved;
}

/**
 * Memo for the resolver above: `buildSquadBattleParty` rebuilds every companion's combatant at
 * every engage, so both builders below ran the interpreter over 47 spellbooks per pull (13.7% of
 * live JS, paid as a freeze on the pull). Keyed on the raw def OBJECT, so a row that arrives later
 * (`attachSpells`) misses by construction; `srcEffects` catches the in-place hydrates, which every
 * one performs by REPLACING the array (materialize-speed.ts:107, item-triggers.ts:330,
 * runtimeDataPatches.ts:174) — and the resolver's own stamps are idempotent, so identity settles.
 * Safe to hand the cached def back because `withTalentMods` is the only writer on this path and it
 * clones first (characterTalents.ts:344); `kitSpellCache.cachedVsUncachedMismatches` holds that.
 */
type KitCacheEntry = { srcEffects: unknown; out: SpellDef };
const NO_DS: object = {};
const kitCache = new WeakMap<object, WeakMap<SpellDef, Map<number, KitCacheEntry>>>();

function combatSpellForKit(s: SpellDef, ds?: DataStore, casterLevel?: number): SpellDef {
  // Levels at or below 0 resolve identically to no level at all — one key for both.
  const lvl = casterLevel != null && casterLevel > 0 ? casterLevel : 0;
  const dsKey = (ds ?? NO_DS) as object;
  let byDef = kitCache.get(dsKey);
  if (!byDef) { byDef = new WeakMap(); kitCache.set(dsKey, byDef); }
  let byLevel = byDef.get(s);
  if (!byLevel) { byLevel = new Map(); byDef.set(s, byLevel); }
  const hit = byLevel.get(lvl);
  if (hit && hit.srcEffects === s.effects) return hit.out;
  const out = resolveKitSpell(s, ds, casterLevel);
  // A summon_totem answer is built from CREATURE rows (attachTotemKits), which this entry does not
  // watch — a totem resolved before `attachCreatures` would cache an empty kit forever. ~20 spells.
  if (!(out.effects ?? []).some((e) => e.kind === 'summon_totem')) {
    // AFTER the call: the resolver's own stamps may have replaced `s.effects` on this first pass.
    byLevel.set(lvl, { srcEffects: s.effects, out });
  }
  return out;
}

export function knownCombatSpells(char: Character, sb: SpellBook, ds: DataStore): SpellDef[] {
  // Vanilla keeps every learned rank castable, so highest ranks are listed first for `.find(role)`
  // while lower ranks stay in the kit. Bar autofill uses knownUsableSpells, which is highest-only.
  const eligible: SpellDef[] = [];
  const highestByName = new Map<string, SpellDef>();
  for (const id of sb.known) {
    const raw = ds.spell(id);
    if (!raw || raw.passive) continue; // passives (Block/Dodge/weapon skills) are never abilities
    // ATTR_NOT_IN_COMBAT_ONLY stays in kit (Charge, Stealth/Prowl, traps). pickAction refuses in combat.
    // Cite: Spell.cpp:4598 IsNonCombatSpell; Stealth used to be dropped here and the stance button no-op'd.
    if (raw.outOfCombatOnly && !raw.notInCombatOnly && !isChargeOpener(raw)) continue;
    // Keep over-level known ranks in the kit — abilities greys them with 'level' — so a
    // force-learned higher rank is visible rather than a silent no-op. The cast path still refuses.
    const s = combatSpellForKit(raw, ds, char.level);
    if (isHiddenInternalSpell(s)) continue; // generic Opening/Closing/Grovel/Attacking internal spells
    if (isTriggeredSecondarySpell(s, ds)) continue; // Charge Stun / Pounce Bleed / etc. — parent only
    const role = s.role ?? inferRole(s);
    const isCleanse = s.effects.some((e) => e.kind === 'cleanse'); // control-breakers (Will of the Forsaken) count as combat abilities
    // Pick Pocket 921: ACTIVE kit so session.tick / abilities() are not silent no-ops (KI-112).
    // Cite: SpellEffects.cpp EffectPickPocket; schema kind pickpocket.
    const isPickPocket = s.effects.some((e) => e.kind === 'pickpocket');
    // Hollow-bake materialization leaves role empty for many actives (Shield Block, Cleanse,
    // Holy Shock). Effect kinds gate kit inclusion. Cite: KI-505/566/570; combatSpellForKit.
    const hasActiveEffect = s.effects.some((e) => ACTIVE_EFFECT_KINDS.has(e.kind));
    if (!s.onNextSwing && !isCleanse && !isPickPocket && !hasActiveEffect && !ACTIVE_ROLES.has(role)) continue;
    eligible.push(s);
    const prev = highestByName.get(s.name);
    if (!prev || preferUsableSpellRank(s, prev)) highestByName.set(s.name, s);
  }
  const highestIds = new Set([...highestByName.values()].map((s) => s.id));
  // Highest ranks first (AI/rotation preference), then remaining lower ranks (spellbook cast).
  const kit = [
    ...highestByName.values(),
    ...eligible.filter((s) => !highestIds.has(s.id)),
  ];
  const tEffs = activeTalentEffects(char, ds);
  if (!tEffs.length) return kit;
  // Clone + transform only the ones that have applicable spell_mods. Never mutate ds-backed defs.
  return kit.map((s) => withTalentMods(s, tEffs));
}

// Spells the player can put on an action bar: active combat abilities plus out-of-combat
// castables, highest rank each. Passives and proficiencies are excluded. Autofill draws on this.
export function knownUsableSpells(char: Character, sb: SpellBook, ds: DataStore): SpellDef[] {
  const byName = new Map<string, SpellDef>();
  for (const id of sb.known) {
    const base = ds.spell(id);
    if (!base || base.passive) continue;
    if (isAboveCasterLevel(base, char.level)) continue; // not castable yet → not bar-eligible
    const s = combatSpellForKit(base, ds, char.level);
    if (isHiddenInternalSpell(s)) continue; // generic Opening/Closing/Grovel/Attacking internal spells
    if (isTriggeredSecondarySpell(s, ds)) continue; // Charge Stun / Intercept Stun / Feral Charge Effect…
    if (
      s.id === POISONS_SKILL_SPELL
      || isPoisonCraftRecipe(ds.recipe(s.id))
      || (s.effects.some((e) => e.kind === 'conjure') && isPoisonConjureName(s.name))
    ) {
      continue;
    }
    const role = s.role ?? inferRole(s);
    const usable = s.onNextSwing || ACTIVE_ROLES.has(role)
      || s.effects.some((e) => e.kind === 'cleanse') // control-breakers (Will of the Forsaken, Escape Artist)
      || s.effects.some((e) => e.kind === 'dispel')  // FS4 dispels (Cleanse/Cure/Remove Curse/Purge/Abolish)
      || s.effects.some((e) => ACTIVE_EFFECT_KINDS.has(e.kind))
      || role === 'pet_summon' || role === 'pet_tame'  // inherently out-of-combat actions
      // Dismiss Pet 2641 is a real castable with no ACTIVE role, and belongs on the bar next to
      // Call Pet. Match on the effect rather than inventing a role the rotation would then use.
      || s.effects.some((e) => e.kind === 'dismiss_pet')
      // Pick Pocket 921 — bar + spellbook (utility role would drop it). Cite: KI-112.
      || s.effects.some((e) => e.kind === 'pickpocket')
      || role === 'stealth' // Stealth / Prowl / Shadowmeld (OOC enter)
      || (s.outOfCombatOnly && (role === 'buff' || role === 'conjure' || role === 'form'));
    if (!usable) continue;
    const prev = byName.get(s.name);
    if (!prev || preferUsableSpellRank(s, prev)) byName.set(s.name, s);
  }
  const kit = [...byName.values()];
  const tEffs = activeTalentEffects(char, ds);
  if (!tEffs.length) return kit;
  return kit.map((s) => withTalentMods(s, tEffs));
}

// Prefer higher rank; when ranks tie, prefer the castable parent that carries trigger_spell (Charge /
// Bloodrage) over the aura/stun companion of the same name.
function preferUsableSpellRank(candidate: SpellDef, prev: SpellDef): boolean {
  const cr = candidate.rank ?? 0;
  const pr = prev.rank ?? 0;
  if (cr !== pr) return cr > pr;
  const cTrig = candidate.effects?.some((e) => e.kind === 'trigger_spell') ? 1 : 0;
  const pTrig = prev.effects?.some((e) => e.kind === 'trigger_spell') ? 1 : 0;
  if (cTrig !== pTrig) return cTrig > pTrig;
  return candidate.id > prev.id;
}

const RANK_PAREN_RE = /\((rank\s*\d+|minor|lesser|greater|major|superior)\)/gi;

function rankBaseName(name: string): string {
  return name.toLowerCase().replace(RANK_PAREN_RE, '').replace(/\s+/g, ' ').trim();
}

// Known lower ranks of a newly learned spell, for migrating bars + rotation to the new id.
// Same-name rank field (Shadow Bolt) OR spell_chain + parenthetical ranks (Create Healthstone).
export function lowerRanksFor(sb: SpellBook, newId: number, ds: DataStore): number[] {
  const nw = ds.spell(newId);
  if (!nw) return [];
  const chainOf = (id: number) => {
    const c = ds.spellChain?.(id);
    return c ? { first: c.first, rank: c.rank } : undefined;
  };
  const nwBase = rankBaseName(nw.name);
  const lowers = new Set<number>();
  const nwRank = nw.rank ?? 0;
  for (const id of sb.known) {
    if (id === newId) continue;
    const s = ds.spell(id);
    if (!s) continue;
    if (s.name === nw.name && (s.rank ?? 0) > 0 && nwRank > 0 && (s.rank ?? 0) < nwRank) {
      lowers.add(id);
      continue;
    }
    if (rankBaseName(s.name) !== nwBase) continue;
    const pair = resolveChainPair(id, newId, chainOf);
    if (pair && pair.a.rank < pair.b.rank) lowers.add(id);
  }
  return [...lowers];
}
