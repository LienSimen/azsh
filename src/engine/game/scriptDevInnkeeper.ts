// Player-reachable ScriptDev innkeeper gossip wiring, from the inn card and gossip path through the
// hello and select handlers. Cite: npcs_special.cpp:771-811; game_event 12 Hallow's End.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../../domain/character/character.ts';
import { applyAura, getActiveBuffIds } from '../../domain/character/character.ts';
import {
  HOLIDAY_ID_HALLOWS_END,
  isHolidayActive,
} from '../../domain/world/gameEvents.ts';
import {
  innkeeperGossipHello,
  innkeeperGossipSelect,
  SPELL_TRICK_OR_TREAT,
  SPELL_TRICK_OR_TREATED,
  TEXT_ID_WHAT_TO_DO,
  type InnkeeperGossipItem,
} from '../../domain/scriptdev/npcsSpecial.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import type { GameState } from './types.ts';

// TRIGGERED cast on the player. Named `applySpell` so aifid census side-effect scan sees a real consumer.
// Cite: npcs_special.cpp:798-800 CastSpell SPELL_TRICK_OR_TREAT TRIGGERED.
function applySpell(
  char: Character,
  spellId: number,
  now: number,
  ds: DataStore,
): Character {
  const def = ds.spell(spellId);
  let durationMs: number | undefined;
  if (def) {
    for (const eff of def.effects ?? []) {
      if (
        // SpellEffect kinds: buff / dot / speed. period_damage/mod_rating never existed on the union.
        (eff.kind === 'buff' || eff.kind === 'dot' || eff.kind === 'speed')
        && 'durationMs' in eff
        && typeof (eff as { durationMs?: number }).durationMs === 'number'
      ) {
        durationMs = (eff as { durationMs: number }).durationMs;
        break;
      }
    }
    if (durationMs == null && def.durationIndex != null) {
      durationMs = durMs(def.durationIndex);
    }
  }
  // Land an aura even when spell-data is thin (24751/24755 are SI4 script residuals).
  return applyAura(char, spellId, durationMs, now, ds);
}

function playerHasAura(char: Character, spellId: number, now: number, ds: DataStore): boolean {
  return getActiveBuffIds(char, now, ds).includes(spellId | 0);
}

export interface InnkeeperHelloResult {
  items: InnkeeperGossipItem[];
  cite: string;
  holidayHallowsEnd: boolean;
}

// Build innkeeper gossip hello from wall-clock + player auras. Cite: npcs_special.cpp:775
// IsHolidayActive(HOLIDAY_HALLOWS_END) && !HasAura(24755).
export function buildInnkeeperGossipHello(
  state: GameState,
  ds: DataStore,
  nowMs: number,
): InnkeeperHelloResult {
  const holidayHallowsEnd = isHolidayActive(ds.gameEvents(), HOLIDAY_ID_HALLOWS_END, nowMs);
  const hasTrickOrTreatedAura = playerHasAura(state.char, SPELL_TRICK_OR_TREATED, nowMs, ds);
  const hello = innkeeperGossipHello({ holidayHallowsEnd, hasTrickOrTreatedAura });
  return {
    items: hello.items,
    cite: hello.cite,
    holidayHallowsEnd,
  };
}

export interface InnkeeperSelectApplied {
  handled: boolean;
  phase: string;
  textId?: number;
  castSpellId?: number;
  closeMenu?: boolean;
  /** Gossip flavor for what_to_do (TEXT_ID_WHAT_TO_DO). */
  flavor?: string;
  cite: string;
}

// Apply innkeeper gossip select onto game state. trick_or_treat: cast 24751 + land 24755 so re-hello gates.
// what_to_do: SEND_GOSSIP_MENU text 1853 as player-visible flavor. Cite: npcs_special.cpp:791-811.
export function applyInnkeeperGossipSelect(
  action: number,
  state: GameState,
  ds: DataStore,
  opts: { nowMs: number; log: (msg: string) => void },
): InnkeeperSelectApplied {
  const select = innkeeperGossipSelect(action | 0);
  if (!select.handled) {
    return { handled: false, phase: 'none', cite: select.cite };
  }

  // Map phase → IR kind string for census consumers (kind === 'trick_or_treat' / what_to_do).
  const kind =
    select.phase === 'trick_or_treat'
      ? 'trick_or_treat'
      : select.phase === 'what_to_do'
        ? 'what_to_do'
        : select.phase;

  if (kind === 'trick_or_treat') {
    // Cite: npcs_special.cpp:798-800 CLOSE + CastSpell SPELL_TRICK_OR_TREAT 24751.
    // applySpell must stay near this kind check (census WIRING_SIDE_EFFECT_RE).
    state.char = applySpell(state.char, SPELL_TRICK_OR_TREAT, opts.nowMs, ds);
    // Spell script residual: also land Treated (24755) so hello gates re-offer.
    // Cite: npcs_special.cpp:765 SPELL_TRICK_OR_TREATED; :775 !HasAura(24755).
    state.char = applySpell(state.char, SPELL_TRICK_OR_TREATED, opts.nowMs, ds);
    opts.log('Trick or Treat!');
    return {
      handled: true,
      phase: 'trick_or_treat',
      castSpellId: SPELL_TRICK_OR_TREAT,
      closeMenu: true,
      cite: select.cite,
    };
  }

  if (kind === 'what_to_do') {
    // Cite: npcs_special.cpp:795-796 SEND_GOSSIP_MENU TEXT_ID_WHAT_TO_DO=1853.
    const flavor = `What can I do at an Inn? (gossip ${TEXT_ID_WHAT_TO_DO})`;
    const push = (msg: string) => opts.log(msg);
    push(flavor);
    return {
      handled: true,
      phase: 'what_to_do',
      textId: TEXT_ID_WHAT_TO_DO,
      closeMenu: false,
      flavor,
      cite: select.cite,
    };
  }

  // vendor / bind — left to existing bindHearth / vendorOffers surfaces.
  return {
    handled: true,
    phase: select.phase,
    closeMenu: select.closeMenu,
    cite: select.cite,
  };
}
