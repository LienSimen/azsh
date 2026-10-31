// Runs a macro inside a live fight. Two jobs: fill in a MacroSnapshot from the session, and turn
// the planner's steps into the SAME calls a click or a keybind makes (queueAbility / queueItem /
// setPlayerTarget / pet commands). There is deliberately no shortcut into the engine here — a
// macro cannot cast something the ability list refuses, cannot skip the GCD, and cannot use an
// item the bags do not hold.

import type { CombatSession } from '../engine/combat/types.ts';
import type { CombatantView } from '../engine/combat/types.ts';
import type { CombatantId } from '../engine/combat/threat.ts';
import { isAllySide, isEnemySide } from '../engine/core/events.ts';
import type { SpellDef } from '../data/schema.ts';
import { listStanceSlots } from '../domain/character/stanceBar.ts';
import { getGcdMs } from '../engine/spells/recovery.ts';
import { equippedEntry, type EquippedValue } from '../domain/items/itemInstance.ts';
import {
  MACRO_CREATURE_TYPE_LABEL,
  hasMacroWeaponType, itemMatchesMacroWeaponType, macroDisplayIcon, macroUnitKey,
  macroUnitToken, planMacro, resolveMacroItemArg,
  type MacroAura, type MacroDef, type MacroPlan, type MacroSnapshot,
  type MacroUnitRef, type MacroUnitSnap, type MacroWornItem,
} from '../domain/macro/index.ts';
// Copied from phonecraft src/ui/macros/macroHostCombat.ts; only this type came from its action bar model.
export interface ActionBarMacroInfo {
  name: string;
  icon?: string;
  showSpellId?: number;
  showItemEntry?: number;
  /** Cooldown of the thing the macro would fire, so the button swipes like a normal one. */
  cooldownRemainingMs?: number;
  usable?: boolean;
  reason?: string;
}

export interface MacroCombatDeps {
  session: () => CombatSession;
  ds: {
    spell?(id: number): { id: number; name: string; icon?: string } | undefined;
    item(entry: number): { name: string; icon?: string; typeName?: string; weaponSubclass?: number; armorSubclass?: number } | undefined;
  };
  /** Macros this character can see (character then account). */
  macros: () => readonly MacroDef[];
  /** Stance-bar membership for `[stance:N]` (same list the strip draws). Omit → stance 0. */
  stance?: () => { classId: number; known: number[] } | undefined;
  /** Equipped entries by slot, for `[equipped:…]`. */
  equipped?: () => Record<string, EquippedValue | undefined> | undefined;
  /** Modifier keys held by the event that fired this press. */
  mods: () => { shift: boolean; ctrl: boolean; alt: boolean };
  /** Side under the pointer, for `@mouseover`. */
  mouseoverSide: () => string | null;
  /** The NPC side the world screen has open, for `@npc`. A fight has none. */
  npcSide?: () => string | null;
  /** Latched focus side, for `@focus`. */
  focusSide: () => string | null;
  setFocusSide: (side: string | null) => void;
  // The player's own queue calls — identical to a bar click. `opts.ally` aims a FRIENDLY cast at that side
  // (`/cast [@party2] Heal`); the engine drops it if the unit is dead or not in the pool.
  queueAbility: (spellId: number, opts?: { ally?: CombatantId | null }) => void;
  /** `opts.target` aims the item at a side (`/use [@party1] Bandage`). */
  queueItem: (entry: number, opts?: { target?: CombatantId | null }) => void;
  // Steps 2..n of one press, in order. The host drains them into the same click queue, one per
  // tick, and REPLACES whatever a previous press left: a new press is the player's latest word.
  queueFollowUp?: (steps: readonly MacroFollowStep[]) => void;
  /** Player-visible feedback for a refusal (combat log line / toast). */
  notify?: (message: string) => void;
}

/** One cast/use a press queued behind its first step. */
export type MacroFollowStep =
  | { kind: 'cast'; spellId: number; ally: CombatantId | null }
  | { kind: 'use'; entry: number; target: CombatantId | null };

export interface MacroCombatHost {
  snapshot(): MacroSnapshot;
  plan(def: MacroDef): MacroPlan;
  /** Run a macro press. True when anything was queued or applied. */
  press(def: MacroDef, opts?: { mods?: { shift: boolean; ctrl: boolean; alt: boolean } }): boolean;
  /** Bar-cell meta: name, icon, and what `#showtooltip` resolves to right now. */
  info(id: string): ActionBarMacroInfo | undefined;
}

/** Aura rows with names attached (the planner matches on name, like the addon). */
function auraRows(
  list: readonly { spellId: number; stacks?: number }[] | undefined,
  spellOf: (id: number) => { name: string } | undefined,
): MacroAura[] {
  const out: MacroAura[] = [];
  for (const a of list ?? []) {
    const name = spellOf(a.spellId)?.name;
    if (!name) continue;
    out.push({ spellId: a.spellId, name, stacks: a.stacks });
  }
  return out;
}

export function createCombatMacroHost(deps: MacroCombatDeps): MacroCombatHost {
  const spellOf = (id: number): { id: number; name: string; icon?: string } | undefined =>
    (typeof deps.ds.spell === 'function' ? deps.ds.spell(id) : undefined);

  /** Live modifier state for the press being resolved (set by `press`). */
  let pressMods = { shift: false, ctrl: false, alt: false };

  const session = (): CombatSession => deps.session();

  /** Party sides in party1..4 order: human companions only, pets excluded (WoW numbering). */
  const partySides = (): string[] => {
    const s = session();
    const allies = typeof s.alliesView === 'function' ? s.alliesView() : [];
    const pets = new Set<string>();
    if (typeof s.companionPets === 'function') for (const cp of s.companionPets()) pets.add(cp.side);
    const out: string[] = [];
    for (const a of allies) if (!pets.has(a.side)) out.push(a.side);
    return out;
  };

  const viewOfSide = (side: string): CombatantView | null => {
    const s = session();
    if (!side) return null;
    if (side === 'player') return s.playerView();
    if (side === 'pet') return (typeof s.petView === 'function' ? s.petView() : null) ?? null;
    if (isAllySide(side) || isEnemySide(side)) return s.viewOfSide?.(side) ?? null;
    return null;
  };

  /** Pet side of the Nth party member (partypetN / raidpetN) — the session names the edge. */
  const partyPetSide = (memberIdx: number): string | null => {
    const s = session();
    if (memberIdx < 0) return null;
    const owner = partySides()[memberIdx];
    if (!owner) return null;
    if (typeof s.companionPets !== 'function') return null;
    return s.companionPets().find((cp) => cp.ownerSide === owner)?.side ?? null;
  };

  /**
   * One `@…` reference -> live side id, or null when that unit does not exist right now.
   * Bases first, then the `target` hops walk the session (`@party1target`, `@playertargettarget`).
   * Cite: docs/conditions/target.md.
   */
  const sideOfUnit = (ref: MacroUnitRef): string | null => {
    const s = session();
    let side: string | null = null;
    switch (ref.base) {
      case 'player': side = 'player'; break;
      case 'target': {
        const id = s.playerTargetId();
        side = id ? String(id) : null;
        break;
      }
      case 'pet': {
        const pv = typeof s.petView === 'function' ? s.petView() : null;
        side = pv && pv.hp > 0 ? 'pet' : null;
        break;
      }
      case 'focus': side = deps.focusSide(); break;
      case 'mouseover': side = deps.mouseoverSide(); break;
      case 'npc': side = deps.npcSide?.() ?? null; break;
      // A raid in this game is the same ally list, just longer — party1-4 are its first four.
      case 'party':
      case 'raid': side = partySides()[(ref.index ?? 1) - 1] ?? null; break;
      case 'partypet':
      case 'raidpet': side = partyPetSide((ref.index ?? 1) - 1); break;
      default: side = null;
    }
    for (let hop = 0; hop < ref.hops && side; hop++) {
      if (typeof s.targetOf !== 'function') return null;
      const next = s.targetOf(side);
      side = next ? String(next) : null;
    }
    return side;
  };

  const wornItems = (): MacroWornItem[] => {
    const eq = deps.equipped?.();
    if (!eq) return [];
    const out: MacroWornItem[] = [];
    for (const slot of ['mainhand', 'offhand', 'ranged']) {
      const raw = eq[slot];
      // EquippedValue is either an entry number or an ItemInstance carrying one.
      const entry = typeof raw === 'number'
        ? raw
        : (raw && typeof raw === 'object' ? Number((raw as { entry?: number }).entry) : NaN);
      if (!Number.isFinite(entry)) continue;
      const def = deps.ds.item(entry);
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

  /** 1-based index of the active stance/shapeshift slot, 0 when in none. */
  const stanceIndex = (): number => {
    const st = deps.stance?.();
    if (!st) return 0;
    const form = (session().playerView().form ?? 0) | 0;
    if (!form) return 0;
    const slots = listStanceSlots(st.classId, st.known, (id) => spellOf(id) as SpellDef | undefined, form);
    const at = slots.findIndex((sl) => sl.active);
    return at < 0 ? 0 : at + 1;
  };

  const unitSnapOf = (ref: MacroUnitRef): MacroUnitSnap | null => {
    const side = sideOfUnit(ref);
    if (!side) return null;
    const view = viewOfSide(side);
    if (!view) return null;
    const hostile = isEnemySide(side);
    const ctype = view.creatureType ?? undefined;
    const party = partySides();
    const friendlyCount = party.length + 1;
    return {
      ref,
      token: macroUnitToken(ref),
      name: view.name,
      dead: view.hp <= 0,
      // The player and human companions are players; anything with a creature template is not.
      isPlayer: !hostile && side !== 'pet' && view.creatureEntry == null,
      canAssist: !hostile,
      canAttack: hostile && view.hp > 0 && !view.unattackable,
      creatureType: ctype,
      creatureTypeName: ctype != null ? MACRO_CREATURE_TYPE_LABEL[ctype] : undefined,
      hp: view.hp,
      maxHp: view.maxHp,
      power: view.power,
      maxPower: view.maxPower,
      buffs: auraRows(view.buffs, spellOf),
      debuffs: auraRows(view.debuffs, spellOf),
      inParty: (side === 'player' || isAllySide(side) || side === 'pet') && friendlyCount <= 5,
      inRaid: (side === 'player' || isAllySide(side) || side === 'pet') && friendlyCount > 5,
    };
  };

  /** Spells the player can actually cast in this fight — the /cast gate. */
  const resolveSpell = (
    name: string,
    rank?: number,
    subtext?: string,
  ): { id: number; name: string; icon?: string } | null => {
    const want = String(name ?? '').trim().toLowerCase();
    if (!want) return null;
    // A word subtext cannot match: SpellDef.rank is numeric in this bake, so refuse rather than
    // silently casting a rank the player did not ask for.
    if (subtext) return null;
    const abilities = session().abilities();
    const hits = abilities.filter((a) => a.spell.name.toLowerCase() === want);
    if (!hits.length) {
      // Stance/form spells live on the strip, not in the combat ability list.
      const st = deps.stance?.();
      for (const id of st?.known ?? []) {
        const sp = spellOf(id);
        if (sp && sp.name.toLowerCase() === want) {
          return { id: sp.id, name: sp.name, icon: sp.icon, gcdMs: getGcdMs(sp) };
        }
      }
      return null;
    }
    const ranked = rank != null
      ? hits.find((a) => (a.spell.rank ?? 0) === rank)
      : hits[0];
    if (!ranked) return null;
    return {
      id: ranked.spell.id,
      name: ranked.spell.name,
      icon: ranked.spell.icon,
      // The engine's own predicate, so the planner and stepSession agree on what costs a GCD.
      gcdMs: getGcdMs(ranked.spell),
    };
  };

  /** Items the player is carrying in this fight — the /use gate. */
  const resolveItem = (
    name: string,
  ): { entry: number; name: string; icon?: string; equipped: boolean } | null => {
    const s = session();
    const items = typeof s.items === 'function' ? s.items() : [];
    const eq = deps.equipped?.() ?? {};
    const byEntry = (entry: number, equipped: boolean) => {
      const hit = items.find((it) => it.item.entry === entry);
      if (hit) {
        return {
          entry: hit.item.entry,
          name: hit.item.name,
          icon: hit.item.icon,
          equipped,
        };
      }
      const def = deps.ds.item(entry);
      return def ? { entry, name: def.name, icon: def.icon, equipped } : null;
    };
    return resolveMacroItemArg(name, {
      equipped: (slot) => {
        const entry = equippedEntry(eq[slot]);
        return entry == null ? null : byEntry(entry, true);
      },
      named: (want) => {
        const low = want.trim().toLowerCase();
        if (!low) return null;
        const hit = items.find((it) => it.item.name.toLowerCase() === low);
        if (hit) {
          return {
            entry: hit.item.entry,
            name: hit.item.name,
            icon: hit.item.icon,
            equipped: !!(hit.item as { reusable?: boolean }).reusable,
          };
        }
        return null;
      },
      typed: (type) => {
        for (const row of items) {
          const def = deps.ds.item(row.item.entry);
          if (def && itemMatchesMacroWeaponType(type, def)) {
            return { entry: row.item.entry, name: row.item.name, icon: row.item.icon, equipped: false };
          }
        }
        return null;
      },
    });
  };

  const cooldownRemainingMs = (name: string): number | null => {
    const spell = resolveSpell(name);
    if (spell) {
      const s = session();
      return typeof s.cooldownRemainingMs === 'function' ? s.cooldownRemainingMs(spell.id) : 0;
    }
    const item = resolveItem(name);
    if (!item) return null;
    const s = session();
    const rows = typeof s.items === 'function' ? s.items() : [];
    return rows.find((r) => r.item.entry === item.entry)?.cooldownRemainingMs ?? 0;
  };

  const snapshot = (): MacroSnapshot => {
    const s = session();
    const pv = s.playerView();
    const party = partySides();
    return {
      unit: unitSnapOf,
      unitIs: (a, b) => {
        if (macroUnitKey(a) === macroUnitKey(b)) return true;
        const sa = sideOfUnit(a);
        const sb = sideOfUnit(b);
        return !!sa && sa === sb;
      },
      // Vanilla's autoSelfCast default: with no target, a friendly cast lands on you.
      autoSelfCast: true,
      combat: !s.ended,
      stealthed: !!pv.stealthed,
      stanceIndex: stanceIndex(),
      mods: pressMods,
      // Party up to 4 others; beyond that the same ally list IS the raid.
      group: { party: Math.min(party.length, 4), raid: party.length > 4 ? party.length : 0 },
      hasWeaponType: (name) => hasMacroWeaponType(name, wornItems()),
      cooldownRemainingMs,
      channel: {
        spellName: pv.casting?.name ?? '',
        channeled: !!pv.casting?.channeled,
        // `mode` says which auto-attack is armed; `autoAttack` says whether it is running.
        autoAttack: pv.mode === 'melee' && !!pv.autoAttack,
        autoShot: pv.mode === 'ranged' && !!pv.autoAttack,
        // Wand shoot is the ranged mode for a caster: same switch, different weapon.
        wand: pv.mode === 'ranged' && !!pv.autoAttack,
      },
      resolveSpell,
      resolveItem,
    };
  };

  const lookupMacro = (name: string): MacroDef | null => {
    const want = String(name ?? '').trim().toLowerCase();
    if (!want) return null;
    return deps.macros().find((m) => m.name.toLowerCase() === want) ?? null;
  };

  const plan = (def: MacroDef): MacroPlan => planMacro(def, { snapshot: snapshot(), lookupMacro });

  /** Point the player at a hostile side (what `/target` and `@unit` on a hostile cast do). */
  const retarget = (side: string): boolean => {
    const s = session();
    if (!isEnemySide(side)) return false;
    if (String(s.playerTargetId()) === side) return true;
    return s.setPlayerTarget(side as CombatantId, { skipMove: true });
  };

  /** `/target <name>`: the first living enemy whose name matches (no world name lookup in a fight). */
  const findSideByName = (name: string): string | null => {
    const want = String(name ?? '').trim().toLowerCase();
    if (!want) return null;
    const s = session();
    return s.enemiesView().find((v) => v.hp > 0 && v.name.toLowerCase().includes(want))?.side ?? null;
  };

  const press = (def: MacroDef, opts?: { mods?: { shift: boolean; ctrl: boolean; alt: boolean } }): boolean => {
    pressMods = opts?.mods ?? deps.mods();
    const s = session();
    if (s.ended) return false;
    const resolved = plan(def);
    let acted = false;
    // A press may carry more than one cast/use (off-GCD ones do not spend the press, plan.ts). The
    // first takes the click queue as a bar click does; the rest go to the host's own follow-up
    // queue, which drains into that SAME slot one per tick. Never the engine cast list: an armed
    // one makes the rotation return null (resolveAutoTickAction.ts:84) and a step it cannot cast
    // is held for good, so one press froze the player outright.
    let primaryQueued = false;
    const follow: MacroFollowStep[] = [];
    for (const step of resolved.steps) {
      switch (step.kind) {
        case 'target': {
          const side = step.unit ? sideOfUnit(step.unit) : findSideByName(step.name ?? '');
          if (side && retarget(side)) acted = true;
          break;
        }
        case 'focus': {
          const side = sideOfUnit(step.unit);
          deps.setFocusSide(side);
          acted = acted || !!side;
          break;
        }
        case 'clearfocus':
          deps.setFocusSide(null);
          acted = true;
          break;
        case 'cast': {
          // A named unit is either a foe (retarget, exactly like the addon's TargetUnit-then-act,
          // Core.lua:255-267) or a friendly (pin the heal/buff on it instead of letting triage
          // pick). Unnamed casts behave exactly as a bar click always has.
          let ally: CombatantId | null = null;
          if (step.unit) {
            const side = sideOfUnit(step.unit);
            if (side && isEnemySide(side)) retarget(side);
            else if (side) ally = side as CombatantId;
          }
          if (primaryQueued) {
            follow.push({ kind: 'cast', spellId: step.spellId, ally: ally ?? null });
            acted = true;
            break;
          }
          deps.queueAbility(step.spellId, ally ? { ally } : undefined);
          primaryQueued = true;
          acted = true;
          break;
        }
        case 'use': {
          // `/use [@player] Bandage` — CombatAction carries `{item, target}`, so a named unit
          // aims the item instead of falling back to the engine's per-item default.
          // Cite: docs/commands/use.md; combat/types.ts CombatAction.
          const side = step.unit ? sideOfUnit(step.unit) : null;
          if (primaryQueued) {
            follow.push({ kind: 'use', entry: step.entry, target: (side as CombatantId | null) ?? null });
            acted = true;
            break;
          }
          deps.queueItem(step.entry, side ? { target: side as CombatantId } : undefined);
          primaryQueued = true;
          acted = true;
          break;
        }
        case 'equip':
          // The client refuses to swap gear mid-fight; say so instead of silently dropping it.
          deps.notify?.('You cannot change equipment in combat.');
          break;
        case 'outfitter':
          deps.notify?.('You cannot change outfits in combat.');
          break;
        case 'petattack': {
          if (typeof s.setPetCommand !== 'function') break;
          const side = step.unit ? sideOfUnit(step.unit) : String(s.playerTargetId() || '');
          acted = s.setPetCommand('attack', side && isEnemySide(side) ? side : null) || acted;
          break;
        }
        case 'petfollow':
          acted = (typeof s.setPetCommand === 'function' && s.setPetCommand('follow')) || acted;
          break;
        case 'petstay':
          acted = (typeof s.setPetCommand === 'function' && s.setPetCommand('stay')) || acted;
          break;
        case 'startattack':
          acted = (typeof s.setAutoAttack === 'function' && s.setAutoAttack('player', true)) || acted;
          break;
        case 'stopattack':
          acted = (typeof s.setAutoAttack === 'function' && s.setAutoAttack('player', false)) || acted;
          break;
        case 'stopcasting':
          acted = (typeof s.stopCasting === 'function' && s.stopCasting('player')) || acted;
          break;
        case 'unshift':
          if (typeof s.leaveForm === 'function') {
            s.leaveForm('player');
            acted = true;
          }
          break;
        default:
          break;
      }
    }
    deps.queueFollowUp?.(follow);
    if (!acted && resolved.refusals.length) deps.notify?.(resolved.refusals[0]!);
    return acted;
  };

  const info = (id: string): ActionBarMacroInfo | undefined => {
    const def = deps.macros().find((m) => m.id === id);
    if (!def) return undefined;
    const resolved = plan(def);
    const tip = resolved.tooltip;
    const snap = snapshot();
    // The swirl follows what the button DRAWS. A press can now carry several steps, so reading the
    // first one greyed a POM-Pyro button for Arcane Power's 3 min while the Pyroblast it shows was
    // ready. `#showtooltip <name>` pins the subject; without one the tooltip is the first step.
    const cdSpellId = tip?.kind === 'spell'
      ? tip.id
      : resolved.steps.find((st) => st.kind === 'cast')?.spellId;
    const cdItemEntry = tip?.kind === 'item'
      ? tip.entry
      : resolved.steps.find((st) => st.kind === 'use')?.entry;
    const s = session();
    let cooldownRemainingMs = 0;
    if (cdSpellId != null) {
      cooldownRemainingMs = typeof s.cooldownRemainingMs === 'function'
        ? s.cooldownRemainingMs(cdSpellId)
        : 0;
    } else if (cdItemEntry != null) {
      const rows = typeof s.items === 'function' ? s.items() : [];
      cooldownRemainingMs = rows.find((r) => r.item.entry === cdItemEntry)?.cooldownRemainingMs ?? 0;
    }
    // Nothing resolvable right now is not "broken" — it is a macro whose conditions are unmet.
    const usable = resolved.steps.length > 0;
    return {
      name: def.name,
      icon: macroDisplayIcon(def, snap.resolveSpell, snap.resolveItem, tip?.icon),
      showSpellId: tip?.kind === 'spell' ? tip.id : undefined,
      showItemEntry: tip?.kind === 'item' ? tip.entry : undefined,
      cooldownRemainingMs,
      usable,
      reason: usable ? undefined : (resolved.refusals[0] ?? 'No line matches right now'),
    };
  };

  return { snapshot, plan, press, info };
}
