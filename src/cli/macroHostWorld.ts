// Copied from phonecraft src/ui/macros/macroHostWorld.ts (import paths only).
// Runs a macro out in the world (no live fight). Same planner, same conditions; the snapshot is
// built from the character instead of a session, and the steps land on the same
// castOutOfCombat / consumeItem / equip calls the HUD buttons use.
//
// Honest limits, surfaced rather than faked: out of combat there is no target, no mouseover and no
// focus, so a clause that needs a unit resolves against you (autoSelfCast) or fails; and there is
// nothing to auto-attack, so /startattack, /stopattack and /petattack report that instead of
// pretending. Everything else — buffs, forms, cooldowns, gear, `[mod:…]`, `{macro}` — is live.

import type { DataStore } from '../data/dataStore.ts';
import type { Game } from '../engine/game.ts';
import type { SpellDef } from '../data/schema.ts';
import { SHAPESHIFT_FORM } from '../data/schema.ts';
import { knownUsableSpells, maxHealth, maxPower } from '../domain/character/character.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { itemUseCooldownRemainingMs } from '../domain/items/itemUseCooldown.ts';
import { listStanceSlots } from '../domain/character/stanceBar.ts';
import { formIdFromSpell, isFormSpell } from '../domain/character/forms.ts';
import { petMaxHealth, petPower } from '../domain/pet/pet.ts';
import {
  MACRO_CREATURE_TYPE_LABEL,
  hasMacroWeaponType, itemMatchesMacroWeaponType, macroUnitKey, macroUnitToken, planMacro,
  resolveMacroItemArg,
  type MacroAura, type MacroDef, type MacroPlan, type MacroSnapshot,
  type MacroUnitRef, type MacroUnitSnap, type MacroWornItem,
} from '../domain/macro/index.ts';

export interface MacroWorldDeps {
  game: Game;
  ds: DataStore;
  now: () => number;
  mods: () => { shift: boolean; ctrl: boolean; alt: boolean };
  /** Cast through the HUD's own path (cooldown gate, needsTarget picker, cast sound). */
  castSpell: (spellId: number) => boolean;
  /** Use a bag item through the HUD's own path. */
  useItem: (entry: number) => boolean;
  /** Equip from bags (offhand = /equipoh). */
  equipItem: (entry: number, offhand: boolean) => boolean;
  notify: (message: string) => void;
}

export interface MacroWorldHost {
  snapshot(): MacroSnapshot;
  plan(def: MacroDef): MacroPlan;
  press(def: MacroDef, opts?: { mods?: { shift: boolean; ctrl: boolean; alt: boolean } }): boolean;
}

export function createWorldMacroHost(deps: MacroWorldDeps): MacroWorldHost {
  const { game, ds } = deps;
  let pressMods = { shift: false, ctrl: false, alt: false };

  const char = () => game.state.char;

  const auraRows = (): MacroAura[] => {
    const out: MacroAura[] = [];
    for (const a of char().activeAuras ?? []) {
      const sp = ds.spell(a.spellId);
      if (sp) out.push({ spellId: a.spellId, name: sp.name });
    }
    return out;
  };

  const playerSnap = (ref: MacroUnitRef): MacroUnitSnap => {
    const c = char();
    return {
      ref,
      token: macroUnitToken(ref),
      name: c.name,
      dead: c.health <= 0,
      isPlayer: true,
      canAssist: true,
      canAttack: false,
      hp: c.health,
      maxHp: maxHealth(c, ds),
      power: c.power,
      maxPower: maxPower(c, ds),
      buffs: auraRows(),
      // Out of combat the character carries no debuff list — an empty list is the honest answer.
      debuffs: [],
      inParty: (game.state.squad?.length ?? 0) > 0,
      inRaid: false,
    };
  };

  const petSnap = (ref: MacroUnitRef): MacroUnitSnap | null => {
    const pet = char().pet;
    if (!pet || pet.health <= 0) return null;
    const cdef = ds.creature(pet.creature);
    const ctype = cdef?.creatureType;
    return {
      ref,
      token: macroUnitToken(ref),
      name: cdef?.name ?? 'Pet',
      dead: false,
      isPlayer: false,
      canAssist: true,
      canAttack: false,
      creatureType: ctype,
      creatureTypeName: ctype != null ? MACRO_CREATURE_TYPE_LABEL[ctype] : undefined,
      hp: pet.health,
      maxHp: petMaxHealth(char(), ds),
      power: petPower(char(), ds)?.power ?? 0,
      maxPower: petPower(char(), ds)?.maxPower ?? 0,
      buffs: [],
      debuffs: [],
      inParty: true,
      inRaid: false,
    };
  };

  /**
   * Out here only you and your pet exist as units: there is no world target, no mouseover, no
   * focus and no party bodies to point at. A reference to anything else resolves to nothing, so
   * conditions naming it fail instead of quietly falling through to the wrong unit. `hops` can
   * never resolve either — nothing out here has a target.
   */
  const unitOf = (ref: MacroUnitRef): MacroUnitSnap | null => {
    if (ref.hops > 0) return null;
    if (ref.base === 'player') return playerSnap(ref);
    if (ref.base === 'pet') return petSnap(ref);
    return null;
  };

  const wornItems = (): MacroWornItem[] => {
    const c = char();
    const out: MacroWornItem[] = [];
    for (const slot of ['mainhand', 'offhand', 'ranged'] as const) {
      const entry = equippedEntry(c.equipped?.[slot]);
      if (entry == null) continue;
      const def = ds.item(entry);
      if (!def) continue;
      out.push({
        slot,
        typeName: def.typeName,
        weaponSubclass: def.weaponSubclass,
        armorSubclass: def.armorSubclass,
      });
    }
    return out;
  };

  /** Every known, non-passive rank — /cast may name a down-rank the same way the addon does. */
  const knownRanks = (): SpellDef[] => {
    const c = char();
    const out: SpellDef[] = [];
    for (const id of game.state.spellbook.known) {
      const sp = ds.spell(id);
      if (sp && !sp.passive) out.push(sp);
    }
    // knownUsableSpells is the top-rank list the bars/HUD use; keep it first so a bare name
    // resolves to the best rank, exactly like clicking the spellbook row.
    const top = knownUsableSpells(c, game.state.spellbook, ds);
    const seen = new Set(top.map((s) => s.id));
    return [...top, ...out.filter((s) => !seen.has(s.id))];
  };

  const resolveSpell = (
    name: string,
    rank?: number,
    subtext?: string,
  ): { id: number; name: string; icon?: string } | null => {
    const want = String(name ?? '').trim().toLowerCase();
    if (!want) return null;
    // SpellDef.rank is numeric here, so a word subtext matches nothing — refuse, do not guess.
    if (subtext) return null;
    for (const sp of knownRanks()) {
      if (sp.name.toLowerCase() !== want) continue;
      if (rank != null && (sp.rank ?? 0) !== rank) continue;
      return { id: sp.id, name: sp.name, icon: sp.icon };
    }
    return null;
  };

  const resolveItem = (
    name: string,
  ): { entry: number; name: string; icon?: string; equipped: boolean } | null => {
    const c = char();
    return resolveMacroItemArg(name, {
      equipped: (slot) => {
        const entry = equippedEntry(c.equipped?.[slot]);
        if (entry == null) return null;
        const def = ds.item(entry);
        return def ? { entry: def.entry, name: def.name, icon: def.icon, equipped: true } : null;
      },
      named: (want) => {
        const low = want.trim().toLowerCase();
        if (!low) return null;
        for (const stack of game.state.inventory.stacks) {
          const def = ds.item(stack.item);
          if (def && def.name.toLowerCase() === low && stack.count > 0) {
            return { entry: def.entry, name: def.name, icon: def.icon, equipped: false };
          }
        }
        for (const raw of Object.values(c.equipped ?? {})) {
          const entry = equippedEntry(raw);
          if (entry == null) continue;
          const def = ds.item(entry);
          if (def && def.name.toLowerCase() === low) {
            return { entry: def.entry, name: def.name, icon: def.icon, equipped: true };
          }
        }
        return null;
      },
      typed: (type) => {
        for (const stack of game.state.inventory.stacks) {
          if (stack.count <= 0) continue;
          const def = ds.item(stack.item);
          if (def && itemMatchesMacroWeaponType(type, def)) {
            return { entry: def.entry, name: def.name, icon: def.icon, equipped: false };
          }
        }
        return null;
      },
    });
  };

  const cooldownRemainingMs = (name: string): number | null => {
    const spell = resolveSpell(name);
    if (spell) {
      return typeof game.spellCooldownRemaining === 'function'
        ? game.spellCooldownRemaining(spell.id)
        : 0;
    }
    const item = resolveItem(name);
    if (!item) return null;
    return itemUseCooldownRemainingMs(
      ds.item(item.entry),
      game.state.spellCooldowns,
      game.state.categoryCooldowns,
      deps.now(),
    );
  };

  /** The known form spell that put the character in `form` (so /unshift can toggle it off). */
  const activeFormSpellId = (form: number): number | null => {
    for (const id of game.state.spellbook.known) {
      const sp = ds.spell(id);
      if (sp && isFormSpell(sp) && formIdFromSpell(sp) === form) return sp.id;
    }
    return null;
  };

  const stanceIndex = (): number => {
    const c = char();
    const form = (c.form ?? 0) | 0;
    if (!form) return 0;
    const slots = listStanceSlots(c.cls, game.state.spellbook.known, (id) => ds.spell(id), form);
    const at = slots.findIndex((sl) => sl.active);
    return at < 0 ? 0 : at + 1;
  };

  const snapshot = (): MacroSnapshot => ({
    unit: unitOf,
    unitIs: (a, b) => macroUnitKey(a) === macroUnitKey(b),
    autoSelfCast: true,
    combat: false,
    stealthed: ((char().form ?? 0) | 0) === SHAPESHIFT_FORM.STEALTH,
    stanceIndex: stanceIndex(),
    mods: pressMods,
    group: { party: game.state.squad?.length ?? 0, raid: 0 },
    hasWeaponType: (name) => hasMacroWeaponType(name, wornItems()),
    cooldownRemainingMs,
    // Nothing is casting or swinging out here.
    channel: { spellName: '', channeled: false, autoAttack: false, autoShot: false, wand: false },
    resolveSpell,
    resolveItem,
  });

  const lookupMacro = (name: string): MacroDef | null => game.macroByName(name);

  const plan = (def: MacroDef): MacroPlan => planMacro(def, { snapshot: snapshot(), lookupMacro });

  const press = (
    def: MacroDef,
    opts?: { mods?: { shift: boolean; ctrl: boolean; alt: boolean } },
  ): boolean => {
    pressMods = opts?.mods ?? deps.mods();
    const resolved = plan(def);
    let acted = false;
    for (const step of resolved.steps) {
      switch (step.kind) {
        case 'cast':
          acted = deps.castSpell(step.spellId) || acted;
          break;
        case 'use':
          acted = deps.useItem(step.entry) || acted;
          break;
        case 'equip':
          acted = deps.equipItem(step.entry, step.offhand) || acted;
          break;
        case 'outfitter': {
          const res = step.action === 'unwear'
            ? deps.game.runOutfitterCommand(`unwear ${step.name}`)
            : deps.game.wearOutfitByName(step.name, { party: true });
          if (!res.ok) deps.notify(res.reason ?? 'Cannot change outfit');
          else acted = true;
          break;
        }
        case 'unshift': {
          // Out of combat, leaving a form is casting its own form spell again — exactly what
          // clicking the lit stance button does (stanceBarRender OOC emits data-action="cast").
          const form = (char().form ?? 0) | 0;
          if (!form) break;
          const spellId = activeFormSpellId(form);
          if (spellId) acted = deps.castSpell(spellId) || acted;
          break;
        }
        case 'target':
        case 'focus':
        case 'clearfocus':
        case 'petattack':
        case 'petfollow':
        case 'petstay':
        case 'startattack':
        case 'stopattack':
        case 'stopcasting':
          // These need a live fight. Say so once rather than silently skipping.
          deps.notify(`/${step.kind} only works in a fight.`);
          break;
        default:
          break;
      }
    }
    if (!acted && resolved.refusals.length) deps.notify(resolved.refusals[0]!);
    return acted;
  };

  return { snapshot, plan, press };
}
