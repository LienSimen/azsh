// The vanilla pet action bar as data: 10 slots, the client's own icons, Ctrl-N binds. No DOM, so
// both bars build from this list. Layout is the server's: Unit.cpp:9508-9521 InitPetActionBar.

import type { Character, PetState } from '../character/character.ts';
import type { CreatureDef, SpellDef } from '../../data/schema.ts';
import type { DataStore } from '../../data/dataStore.ts';
import { getSpellRecoveryTime } from '../../engine/spells/recovery.ts';
import { petKnownSpells, petAutocastOn } from './pet.ts';

export type PetCommand = 'attack' | 'follow' | 'stay';
export type PetReact = 'aggressive' | 'defensive' | 'passive';

/** PetActionBarFrame.lua:6-12 — PET_*_TEXTURE, lowercased to our icon basenames. */
export const PET_COMMAND_ICON: Record<PetCommand, string> = {
  attack: 'ability_ghoulfrenzy',
  follow: 'ability_tracking',
  stay: 'spell_nature_timestop',
};
export const PET_REACT_ICON: Record<PetReact, string> = {
  aggressive: 'ability_racial_bloodrage',
  defensive: 'ability_defend',
  passive: 'ability_seal',
};

/** GlobalStrings PET_MODE_* / the client's own button names. */
export const PET_COMMAND_NAME: Record<PetCommand, string> = {
  attack: 'Attack',
  follow: 'Follow',
  stay: 'Stay',
};
export const PET_REACT_NAME: Record<PetReact, string> = {
  aggressive: 'Aggressive',
  defensive: 'Defensive',
  passive: 'Passive',
};

export const PET_COMMAND_TIP: Record<PetCommand, string> = {
  attack: 'Send your pet at your current target.',
  follow: 'Your pet follows you and stops attacking.',
  stay: 'Your pet holds this spot until you move it.',
};
export const PET_REACT_TIP: Record<PetReact, string> = {
  aggressive: 'Attacks anything hostile that comes into range.',
  defensive: 'Attacks what attacks you or your pet.',
  passive: 'Never attacks until you send it in.',
};

/** Slot 1..10 → its default bind. BONUSACTIONBUTTON10 is Ctrl-0. */
export function petSlotHotkey(slot: number): string {
  return `ctrl+${slot === 10 ? 0 : slot}`;
}

/** 'ctrl+1' → 'Ctrl-1', the label the client prints on the button. */
export function petSlotKeyLabel(slot: number): string {
  return `Ctrl-${slot === 10 ? 0 : slot}`;
}

// Ms left on a pet ability from the SAVED world clock — what the bar shows between pulls, since
// Dash and Sacrifice outlive the fight that spent them. Same max(own, category) as the player's.
export function petWorldCooldownMs(pet: PetState, spell: SpellDef, now: number): number {
  const own = Math.max(0, (pet.spellCooldowns?.[spell.id] ?? 0) - now);
  const cat = spell.category != null
    ? Math.max(0, (pet.categoryCooldowns?.[spell.category] ?? 0) - now)
    : 0;
  return Math.max(own, cat);
}

/** Where a bar reads the pet's live state and cooldowns from. Every field optional. */
export type PetBarLive = {
  command?: PetCommand;
  react?: PetReact;
  /** ms left per ability id, from the LIVE session's pet. Wins over `now`. */
  cooldownRemainingMs?: (spellId: number) => number;
  /** Epoch ms, to read the saved world clock instead. Neither given = no cooldown drawn. */
  now?: number;
};

export type PetBarSlot =
  | {
    slot: number; hotkey: string; keyLabel: string;
    kind: 'command'; command: PetCommand;
    icon: string; name: string; tip: string; active: boolean;
  }
  | {
    slot: number; hotkey: string; keyLabel: string;
    kind: 'react'; react: PetReact;
    icon: string; name: string; tip: string; active: boolean;
  }
  | {
    slot: number; hotkey: string | null; keyLabel: string | null;
    kind: 'spell'; spellId: number;
    icon: string; name: string; tip: string; autocast: boolean;
    /** ms until the pet can cast it (0 = ready) - the swipe and countdown the bar draws. */
    cooldownRemainingMs: number;
    /** Full recovery (RecoveryTime), so the swipe knows how much of the arc to cover. */
    cooldownMs: number;
  };

/** ACTION_BAR_INDEX_PET_SPELL_END - _START = 4 keyed spell slots (Unit.h:866-869). */
export const PET_SPELL_SLOTS = 4;

const slotOf = (index: number): { slot: number; hotkey: string; keyLabel: string } => {
  const slot = index + 1;
  return { slot, hotkey: petSlotHotkey(slot), keyLabel: petSlotKeyLabel(slot) };
};

// The bar for a pet, in slot order, with the LIVE command and react states. Every known ability is
// listed: the first four take the keyed slots and the rest ride after slot 10 without a bind.
export function petBarSlots(
  char: Character,
  cdef: CreatureDef,
  ds: DataStore,
  live?: PetBarLive,
): PetBarSlot[] {
  const pet = char.pet;
  if (!pet) return [];
  const command = live?.command ?? pet.command ?? 'follow';
  const react = live?.react ?? pet.react ?? 'defensive';
  const out: PetBarSlot[] = [];
  const commands: PetCommand[] = ['attack', 'follow', 'stay'];
  commands.forEach((c, i) => {
    out.push({
      ...slotOf(i),
      kind: 'command',
      command: c,
      icon: PET_COMMAND_ICON[c],
      name: PET_COMMAND_NAME[c],
      tip: PET_COMMAND_TIP[c],
      // Attack is a momentary order, never a lit state — the client only checks the
      // standing commands. Cite: PetAI.cpp:376-377 staying/following.
      active: c !== 'attack' && command === c,
    });
  });
  const spells = petKnownSpells(char, cdef, ds);
  spells.forEach((s, i) => {
    const keyed = i < PET_SPELL_SLOTS;
    out.push({
      // Overflow abilities keep a clickable slot id past the bar's last button (10) so they
      // stay toggleable; only the first four get a bind.
      slot: keyed ? i + 4 : 11 + (i - PET_SPELL_SLOTS),
      hotkey: keyed ? petSlotHotkey(i + 4) : null,
      keyLabel: keyed ? petSlotKeyLabel(i + 4) : null,
      kind: 'spell',
      spellId: s.id,
      icon: s.icon ?? '',
      name: s.name,
      tip: petAutocastOn(pet, s, ds)
        ? `${s.name} - autocast on (click to turn off)`
        : `${s.name} - autocast off (click to turn on)`,
      autocast: petAutocastOn(pet, s, ds),
      cooldownRemainingMs: live?.cooldownRemainingMs
        ? Math.max(0, live.cooldownRemainingMs(s.id))
        : (live?.now != null ? petWorldCooldownMs(pet, s, live.now) : 0),
      cooldownMs: getSpellRecoveryTime(s) || 0,
    });
  });
  const reacts: PetReact[] = ['aggressive', 'defensive', 'passive'];
  reacts.forEach((r, i) => {
    out.push({
      ...slotOf(7 + i),
      kind: 'react',
      react: r,
      icon: PET_REACT_ICON[r],
      name: PET_REACT_NAME[r],
      tip: PET_REACT_TIP[r],
      active: react === r,
    });
  });
  return out;
}

/** The slot a Ctrl-N press means, or null. Accepts 'ctrl+1'..'ctrl+9', 'ctrl+0'. */
export function petSlotForHotkey(hotkey: string): number | null {
  const m = /^ctrl\+([0-9])$/.exec(hotkey);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 0 ? 10 : n;
}


