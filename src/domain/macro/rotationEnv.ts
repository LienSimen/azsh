// The resolver a macro rule is compiled against. Pure. The anti-tamper half of a macro rule:
// /cast resolves only among known spells and /use only among carried items, as the press path does.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { knownUsableSpells } from '../character/character.ts';
import { formIdFromSpell } from '../character/forms.ts';
import type { Inventory } from '../items/inventory.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import { knownSpellsForSuggestionResolve } from '../rotation/build.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { listStanceSlots } from '../character/stanceBar.ts';
import type { MacroExpandEnv } from './rotation.ts';
import { splitSpellRank } from './snapshot.ts';
import type { MacroDef } from './types.ts';
import { itemMatchesMacroWeaponType } from './weaponTypes.ts';
import { resolveMacroItemArg } from './slots.ts';

export interface MacroExpandEnvInput {
  ds: DataStore;
  char: Character;
  spellbook: SpellBook;
  inventory: Inventory | undefined;
  /** Character macros first, then account: the order the editor and `{Name}` lookups use. */
  macros: readonly MacroDef[];
}

/** FNV-1a over the referenced macro bodies. Cheap, stable, and it changes when a body changes. */
function hashBodies(macros: readonly MacroDef[], ids: readonly string[]): string {
  let h = 0x811c9dc5;
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const id of ids) {
    const def = macros.find((m) => m.id === id);
    mix(id);
    mix('\u0000');
    mix(def?.body ?? '');
    mix('\u0000');
  }
  return (h >>> 0).toString(36);
}

// Build the compiler's view of one character. Called once per rotation assembly (fight start) and once per
// `rotationForCombat()`; the compile itself is memoized behind `signature()`.
export function buildMacroExpandEnv(input: MacroExpandEnvInput): MacroExpandEnv {
  const { ds, char, spellbook, inventory, macros } = input;

  // Every known non-passive rank, best rank first: `/cast Frostbolt` takes the top rank exactly like
  // clicking the spellbook row, and `/cast Frostbolt(Rank 3)` can still name a down-rank.
  let ranks: SpellDef[] | null = null;
  const knownRanks = (): SpellDef[] => {
    if (ranks) return ranks;
    const top = knownUsableSpells(char, spellbook, ds);
    const seen = new Set(top.map((s) => s.id));
    const rest: SpellDef[] = [];
    for (const id of spellbook.known) {
      if (seen.has(id)) continue;
      const sp = ds.spell(id);
      if (sp && !sp.passive) rest.push(sp);
    }
    ranks = [...top, ...rest];
    return ranks;
  };

  /** Top rank per name — the same list the editor's buff/debuff ref dropdown offers. */
  let auraBook: SpellDef[] | null = null;
  const auras = (): SpellDef[] => {
    if (!auraBook) auraBook = knownSpellsForSuggestionResolve(char, spellbook, ds);
    return auraBook;
  };

  /** The form id of the stealth spell THIS character knows, or null. */
  let stealthForm: number | null | undefined;
  const stealthFormId = (): number | null => {
    if (stealthForm !== undefined) return stealthForm;
    stealthForm = null;
    for (const id of spellbook.known) {
      const sp = ds.spell(id);
      if (!sp || sp.role !== 'stealth') continue;
      // Rogue Stealth (1784) bakes to SHAPESHIFT_FORM.STEALTH = 30, so `[stealth]` is readable off
      // RotationSnapshot.self.formId. Druid Prowl (5215) bakes to 0 — no form, so it refuses.
      const form = formIdFromSpell(sp);
      if (form > 0) { stealthForm = form; break; }
    }
    return stealthForm;
  };

  const env: MacroExpandEnv = {
    macroById: (id) => macros.find((m) => m.id === id) ?? null,
    macroByName: (name) => {
      const want = String(name ?? '').trim().toLowerCase();
      if (!want) return null;
      return macros.find((m) => m.name.toLowerCase() === want) ?? null;
    },
    resolveSpell: (name, rank, subtext) => {
      const want = String(name ?? '').trim().toLowerCase();
      if (!want) return null;
      // SpellDef.rank is numeric, so a word subtext matches nothing: refuse, do not guess.
      if (subtext) return null;
      for (const sp of knownRanks()) {
        if (sp.name.toLowerCase() !== want) continue;
        if (rank != null && (sp.rank ?? 0) !== rank) continue;
        return { id: sp.id, name: sp.name };
      }
      return null;
    },
    resolveItem: (name) => {
      const hit = resolveMacroItemArg(name, {
        equipped: (slot) => {
          const entry = equippedEntry(char.equipped?.[slot]);
          if (entry == null) return null;
          const def = ds.item(entry);
          return def ? { entry: def.entry, name: def.name, icon: def.icon, equipped: true } : null;
        },
        named: (want) => {
          const low = want.trim().toLowerCase();
          if (!low) return null;
          for (const stack of inventory?.stacks ?? []) {
            if (stack.count <= 0) continue;
            const def = ds.item(stack.item);
            if (def && def.name.toLowerCase() === low) {
              return { entry: def.entry, name: def.name, icon: def.icon, equipped: false };
            }
          }
          for (const raw of Object.values(char.equipped ?? {})) {
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
          for (const stack of inventory?.stacks ?? []) {
            if (stack.count <= 0) continue;
            const def = ds.item(stack.item);
            if (def && itemMatchesMacroWeaponType(type, def)) {
              return { entry: def.entry, name: def.name, icon: def.icon, equipped: false };
            }
          }
          return null;
        },
      });
      return hit ? { entry: hit.entry, name: hit.name } : null;
    },
    resolveAura: (name) => {
      // `(Rank N)` on an aura name is how players write it; the gate is per spell id, so strip it.
      const want = splitSpellRank(String(name ?? '')).name.trim().toLowerCase();
      if (!want) return null;
      for (const sp of auras()) {
        if (sp.name.toLowerCase() === want) return { id: sp.id, name: sp.name };
      }
      return null;
    },
    formIdForStanceSlot: (slot) => {
      if (!Number.isInteger(slot) || slot < 1) return null;
      const slots = listStanceSlots(char.cls, spellbook.known, (id) => ds.spell(id), (char.form ?? 0) | 0);
      return slots[slot - 1]?.formId ?? null;
    },
    get stealthFormId() { return stealthFormId(); },
    signature: (ids) =>
      `${hashBodies(macros, ids)}:${macros.length}:${spellbook.known.length}`
      + `:${char.level}:${inventory?.stacks.length ?? 0}`,
  };
  return env;
}
