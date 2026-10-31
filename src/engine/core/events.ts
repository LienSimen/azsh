// The combat event log. simulate() produces an ordered list; the UI replays them on a timer or reads
// the final result. The log is the single source of truth, so replay and auto-resolve cannot disagree.

import type { School, PowerType, ControlKind, TotemSlot } from '../../data/schema.ts';

/** Totem combatant sides. Bare slot = the player's; `_N` = ally N's, because the slot array is a
 * member of each UNIT (Unit.h:2625 `ObjectGuid m_TotemSlot[MAX_TOTEM_SLOT]`), not of the party. */
export type TotemSide = `totem_${TotemSlot}` | `totem_${TotemSlot}_${number}`;

// Hostile NPC side id. Index 0 keeps the historical literal `'enemy'` (1v1 back-compat). Additional pack
// members are `'enemy_1'`, `'enemy_2'`, … (Wave 4A multi-enemy).
export type EnemySide = 'enemy' | `enemy_${number}`;

// Friendly companion side id (dungeon squad members fighting in the session). `ally_0` … — GROUPING-PLAN S0
// companions first, then companion pets (playerbot InitPet). Cap is MAX_ALLIES.
export type AllySide = `ally_${number}`;

export type Side = 'player' | EnemySide | 'pet' | TotemSide | AllySide;

// Party-size ceiling for ally seats in one session, and only the createSession validation: a 40-man
// raid is 39 companions plus a pet each, and at 40 it THREW on entry before a tick ran.
export const MAX_ALLIES = 78;

// True for any companion side. A char loop, not a regex — this is called per unit per predicate per
// tick and the regex form was 1.1% of tick self time at 40 allies.
export function isAllySide(s: Side | string): s is AllySide {
  if (typeof s !== 'string' || s.length < 6 || !s.startsWith('ally_')) return false;
  for (let i = 5; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

// A real Player character, as opposed to a pet, totem or creature. Not cosmetic: Player::AddGCD is
// the override with the cast-speed haste branch, and every creature takes the one without.
export function isPlayerCharacterSide(s: Side | string): boolean {
  return s === 'player' || isAllySide(s);
}

// Stable side id for the Nth ally in a group session (0-based). Mirrors enemySideAt; no index-0 legacy
// literal (allies are new in S0).
export function allySideAt(index: number): AllySide {
  if (index < 0) throw new Error(`allySideAt: index ${index} < 0`);
  return `ally_${index}` as AllySide;
}

// The ordinal in `ally_N`, or -1. Nine callers spelled this by hand to index a GAME-LAYER array that
// really is keyed by ordinal while the session is keyed by seat. This is the one place.
export function allyIndexOfSide(s: Side | string): number {
  if (!isAllySide(s)) return -1;
  const n = Number(s.slice('ally_'.length));
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

// The two seats a duel fills. Cite: Unit.cpp:970 — the duel pointer hangs off a Player, so a pet,
// totem or summon is never a duelist.
export function isDuelistSide(s: Side | string): boolean {
  return s === 'player' || s === 'enemy';
}

// Bare player seats first — the common case, and the four-equality form this used to be. A companion's
// seat carries its ally ordinal, so the tail parses `totem_<slot>_<N>`.
export function isTotemSide(s: Side | string): s is TotemSide {
  if (s === 'totem_fire' || s === 'totem_earth' || s === 'totem_water' || s === 'totem_air') return true;
  if (typeof s !== 'string' || s.length < 11 || !s.startsWith('totem_')) return false;
  const cut = s.indexOf('_', 6);
  if (cut < 0) return false;
  const slot = s.slice(6, cut);
  if (slot !== 'fire' && slot !== 'earth' && slot !== 'water' && slot !== 'air') return false;
  if (cut + 1 >= s.length) return false;
  for (let i = cut + 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

// True for the primary enemy or any pack member. A character scan, not a regex: ~100 sites reach this
// from per-tick loops and the regex form was 7.3 ms/s of a throttled pull.
export function isEnemySide(s: Side | string): s is EnemySide {
  if (s === 'enemy') return true;
  if (typeof s !== 'string' || s.length < 7 || !s.startsWith('enemy_')) return false;
  for (let i = 6; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

// Stable side id for the Nth enemy in a multi-enemy session (0-based). Cite: Wave 4A — one ThreatManager
// per owner id.
export function enemySideAt(index: number): EnemySide {
  if (index < 0) throw new Error(`enemySideAt: index ${index} < 0`);
  return index === 0 ? 'enemy' : (`enemy_${index}` as EnemySide);
}

// The ordinal in `enemy_N`, or -1, and the twin of `allyIndexOfSide`. ONE caller by design — the
// single writer for roster membership — so it never becomes nine hand-written parses again.
export function enemyIndexOfSide(s: Side | string): number {
  if (s === 'enemy') return 0;
  if (!isEnemySide(s)) return -1;
  const n = Number(s.slice('enemy_'.length));
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

export function totemSlotOf(s: Side): TotemSlot | null {
  if (!isTotemSide(s)) return null;
  const cut = s.indexOf('_', 6);
  return (cut < 0 ? s.slice(6) : s.slice(6, cut)) as TotemSlot;
}

/** The owner's seat, or null when the side is not a totem. Twin of `sideForTotemSlot`. */
export function totemOwnerOfSide(s: Side | string): Side | null {
  if (!isTotemSide(s)) return null;
  const cut = s.indexOf('_', 6);
  return cut < 0 ? 'player' : (`ally_${s.slice(cut + 1)}` as AllySide);
}

// One seat per OWNER per slot. Cite: SpellEffects.cpp:4528 `m_caster->_AddTotem(TotemSlot(slot), pTotem)`.
export function sideForTotemSlot(slot: TotemSlot, owner: Side = 'player'): TotemSide {
  const idx = allyIndexOfSide(owner);
  return idx >= 0 ? (`totem_${slot}_${idx}` as TotemSide) : `totem_${slot}`;
}

// Physical swings resolve on the full attack table; spells use only hit, crit, miss and immune.
// 'crushing' is the NPC crush blow and 'immune' is school or template immunity.
export type HitResult = 'hit' | 'crit' | 'miss' | 'dodge' | 'parry' | 'glancing' | 'block' | 'crushing' | 'immune' | 'deflect';

export type CombatEvent =
  // enemyName/enemyHp absent on a floor session, which opens with no primary. playerHp is
  // always here: watchController.ts:43 seeds the playback bar off it. E1.3.
  | { t: number; kind: 'start'; playerName: string; enemyName?: string; playerHp: number; enemyHp?: number }
  | { t: number; kind: 'cast_start'; actor: Side; spellId: number; name: string; castMs: number }
  | { t: number; kind: 'cast_finish'; actor: Side; spellId: number; name: string }
  // `target` is who took it, present ONLY when the victim is not the actor's opposite number, so
  // pre-pack goldens stay byte-identical. Without it a multi-mob pull could not be metered at all.
  | { t: number; kind: 'melee'; actor: Side; result: HitResult; amount: number; target?: Side; spellId?: number; name?: string; blocked?: number }
  | { t: number; kind: 'spell_hit'; actor: Side; spellId: number; name: string; result: HitResult; amount: number; school: School; target?: Side; blocked?: number }
  | { t: number; kind: 'dot_tick'; actor: Side; spellId: number; name: string; amount: number; school: School; target?: Side }
  // `actor` = the healed unit. `source` = the caster, present ONLY when someone else healed
  // them (ally healer → player). Self-heals omit it so pre-ally solo logs stay byte-identical.
  | { t: number; kind: 'heal'; actor: Side; amount: number; source?: Side; crit?: boolean; name?: string; spellId?: number; periodic?: boolean; overheal?: number }
  // `target` is the recipient when not the player, omitted on self-use. `hostile_cast` is a thrown
  // offensive item, whose damage the cast path logs, so `amount` is 0 — this is the throw beat.
  | { t: number; kind: 'item_use'; actor: Side; entry: number; name: string; effect: 'restore_health' | 'restore_power' | 'apply_buff' | 'hostile_cast'; amount: number; target?: Side }
  // spellId optional — periodic restore_power / restore_health (Enrage, Bloodrage, Mana Spring).
  | { t: number; kind: 'resource'; actor: Side; power: PowerType; value: number; delta: number; spellId?: number }
  // spellId optional — present when the applying spell is known (pull-spent tracking / log filters).
  | { t: number; kind: 'aura'; actor: Side; name: string; applied: boolean; spellId?: number }
  | { t: number; kind: 'root'; target: Side; applied: boolean }
  // Crowd control applied or faded; root keeps its own event above for back-compat. `cc_resist` is a
  // full resist of the land and `cc_immune` is immunity or diminishing down to nothing.
  | { t: number; kind: 'control'; target: Side; control: ControlKind; applied: boolean; name?: string }
  // `result` is the melee land side a melee-class control lost on (Bash dodged); absent is a magic resist.
  | { t: number; kind: 'cc_resist'; target: Side; control: ControlKind; name: string; result?: HitResult }
  | { t: number; kind: 'cc_immune'; target: Side; control: ControlKind; name: string }
  // Interrupt success: the cast is cancelled and the school locked out for the ability's duration.
  // Cite: SpellEffects.cpp EffectInterruptCast; Object.cpp LockOutSpells.
  | {
      t: number;
      kind: 'interrupt';
      target: Side;
      school: School;
      lockoutMs: number;
      name: string;
      interruptedSpellId?: number;
      interruptedName?: string;
      /** Who landed the kick. Optional so older log rings still format dest-only. */
      actor?: Side;
    }
  | { t: number; kind: 'death'; actor: Side }
  /** Shapeshift enter (form > 0) or leave (form = 0). `name` is the form label or "Caster Form". */
  | { t: number; kind: 'form'; actor: Side; form: number; name: string }
  // A mid-fight EventAI inject. `actor` is the summoner and `side` the new combatant, an ally seat
  // when we summoned it. Cite: CreatureEventAI.cpp ACTION_T_SPAWN ~810-826.
  | { t: number; kind: 'summon'; actor: Side; side: Side; creatureId: number; name: string }
  // EventAI ACTION_T_FLEE_FOR_ASSIST / DoFlee — creature panics (ORDER_FLEEING). Cite: CreatureEventAI.cpp
  // ~948–950; UnitAI.cpp DoFlee ~829–841.
  | { t: number; kind: 'flee'; actor: Side }
  // Knock back success: the speeds are the misc value and damage over 10, and `distanceYd` is the
  // planar displacement under gravity, 0 without geometry. Cite: SpellEffects.cpp:5113-5121.
  | {
      t: number;
      kind: 'knock_back';
      actor: Side;
      target: Side;
      spellId: number;
      name: string;
      horizontal: number;
      vertical: number;
      distanceYd: number;
    }
  // EventAI ACTION_T_SET_PHASE — m_Phase changed (observability for phase-gated scripts). Cite:
  // CreatureEventAI.cpp ~919–922.
  | { t: number; kind: 'phase'; actor: Side; phase: number }
  // EventAI ACTION_T_TEXT / TEXT_NEW — creature say/yell/emote into combat feed. Cite: CreatureEventAI.cpp
  // ACTION_T_TEXT ~674–728; ACTION_T_TEXT_NEW ~1246–1268; docs/aifid/eventai-texts.json.
  | {
      t: number;
      kind: 'creature_text';
      actor: Side;
      textId: number;
      chatType: number;
      text: string;
    }
  /** EventAI ACTION_T_EMOTE — HandleEmote. Cite: CreatureEventAI.cpp ~763–764. */
  | { t: number; kind: 'emote'; actor: Side; emoteId: number }
  // EventAI ACTION_T_SOUND — PlayDirectSound. UI plays SFX when a mapped asset exists. Cite:
  // CreatureEventAI.cpp ~760–761.
  | { t: number; kind: 'sound'; actor: Side; soundId: number }
  // EventAI ACTION_T_SET_RANGED_MODE. Cite: CreatureEventAI.cpp ~1298–1307; UnitAI.cpp SetRangedMode
  // ~979–995.
  | {
      t: number;
      kind: 'ranged_mode';
      actor: Side;
      enabled: boolean;
      chaseDistance: number;
    }
  /** EventAI ACTION_T_AUTO_ATTACK → SetMeleeEnabled. Cite: ~900–901. */
  | { t: number; kind: 'auto_attack'; actor: Side; enabled: boolean }
  /** EventAI ACTION_T_SET_STAND_STATE. Cite: ~1157–1159. */
  | { t: number; kind: 'stand_state'; actor: Side; standState: number }
  // EventAI ACTION_T_SET_INST_DATA — per-dungeon-run key/value store. Cite: CreatureEventAI.cpp ~1044–1054.
  | { t: number; kind: 'instance_data'; field: number; value: number }
  /** EventAI ACTION_T_SET_DEATH_PREVENTION. Cite: ~1117–1119. */
  | { t: number; kind: 'death_prevention'; actor: Side; enabled: boolean }
  /** EventAI ACTION_T_UPDATE_TEMPLATE. Cite: ~1076–1083. */
  | { t: number; kind: 'update_template'; actor: Side; creatureId: number }
  /** EventAI ACTION_T_SET_FOLLOW_MOVEMENT. Cite: ~1366–1367. */
  | { t: number; kind: 'follow_movement'; actor: Side; enabled: boolean }
  /** EventAI ACTION_T_SET_REACT_STATE. Cite: ~1206–1209. */
  | { t: number; kind: 'react_state'; actor: Side; reactState: number }
  /** EventAI ACTION_T_CALL_FOR_HELP. Cite: ~1102–1105. */
  | { t: number; kind: 'call_for_help'; actor: Side; radius: number }
  /** EventAI ACTION_T_THROW_AI_EVENT. Cite: ~1140–1149. */
  | {
      t: number;
      kind: 'throw_ai_event';
      actor: Side;
      eventType: number;
      radius: number;
    }
  /** ScriptDev UnitAI::SendAIEvent. Cite: UnitAI.cpp:664-668. */
  | {
      t: number;
      kind: 'ai_event';
      actor: Side;
      eventType: number;
      receiver: Side;
    }
  /** EventAI ACTION_T_FORCE_DESPAWN. Cite: ~1112–1114. */
  | { t: number; kind: 'despawn'; actor: Side }
  /** EventAI ACTION_T_DESPAWN_GUARDIANS. Cite: ~1283–1295. */
  | { t: number; kind: 'despawn_guardians'; actor: Side; entryId: number }
  /** EventAI ACTION_T_REMOVEAURASFROMSPELL. Cite: ~971–973. */
  | { t: number; kind: 'remove_auras'; actor: Side; target: Side; spellId: number }
  /** EventAI ACTION_T_ATTACK_START. Cite: ~1271–1280. */
  | { t: number; kind: 'attack_start'; actor: Side; target: Side }
  // S4 EventAI tail actions
  | { t: number; kind: 'set_faction'; actor: Side; factionId: number; factionFlags: number }
  | { t: number; kind: 'morph'; actor: Side; creatureId: number; modelId: number }
  | {
      t: number;
      kind: 'threat_single';
      actor: Side;
      target: Side;
      value: number;
      isDirect: boolean;
    }
  | { t: number; kind: 'threat_all_pct'; actor: Side; percent: number }
  /** ACTION_T_START_RELAY_SCRIPT — ScriptsStart(SCRIPT_TYPE_RELAY). Cite: CreatureEventAI.cpp:1225-1244. */
  | { t: number; kind: 'relay_script'; actor: Side; relayId: number }
  /** ACTION_T_KILLED_MONSTER credits a creature ENTRY, not a quest id. Cite: CreatureEventAI.cpp case 33. */
  | { t: number; kind: 'kill_credit'; actor: Side; creatureEntry: number }
  /** ACTION_T_QUEST_EVENT — AreaExploredOrEventHappens credit signal (GOOBER-equivalent). */
  | {
      t: number;
      kind: 'quest_event';
      actor: Side;
      questId: number;
      rewardGroup: boolean;
    }
  | {
      t: number;
      kind: 'set_unit_field';
      actor: Side;
      field: number;
      value: number;
      target: Side;
    }
  | { t: number; kind: 'set_unit_flag'; actor: Side; flag: number; target: Side }
  | { t: number; kind: 'remove_unit_flag'; actor: Side; flag: number; target: Side }
  | { t: number; kind: 'combat_movement'; actor: Side; enabled: boolean; melee: boolean }
  | { t: number; kind: 'evade'; actor: Side; combatOnly: boolean }
  | { t: number; kind: 'zone_combat_pulse'; actor: Side }
  | { t: number; kind: 'set_sheath'; actor: Side; sheath: number }
  | { t: number; kind: 'mount'; actor: Side; creatureId: number; modelId: number }
  | {
      t: number;
      kind: 'change_movement';
      actor: Side;
      movementType: number;
      wanderOrPathId: number;
      flags: number;
    }
  | { t: number; kind: 'set_walk'; actor: Side; walkType: number }
  | {
      t: number;
      kind: 'set_immobilized_state';
      actor: Side;
      apply: boolean;
      combatOnly: boolean;
    }
  | { t: number; kind: 'use_object'; actor: Side; goEntry: number }
  // A move row TOOK motion, and separately RESOLVED with its goal satisfied — a fired count alone
  // reads as answered for a row that gives up. A halt row is pushed on the ACTIVATION edge only.
  | { t: number; kind: 'halt_dps'; actor: Side; school: string }
  // One step of a friendly seat's ordered cast list changed state: `queued`, then exactly one of
  // `cast`, `already_up` or `dropped` with the gate that refused it. This is how a Pre-buff reports.
  | {
      t: number;
      kind: 'cast_order';
      actor: Side;
      /** Spell this step casts, or the buff an item step grants. */
      spellId: number;
      /** The body the step named. Absent for a self-cast. */
      target?: Side;
      state: 'queued' | 'cast' | 'already_up' | 'dropped';
      /** Which gate refused a `dropped` step. */
      reason?: string;
    }
  | { t: number; kind: 'mechanic_move'; actor: Side; move: string }
  | { t: number; kind: 'mechanic_move_done'; actor: Side; move: string }
  | { t: number; kind: 'flavor'; text: string };

// Event kinds that prove a SCRIPTED mechanic fired. Counted as the event is pushed, because the 8192
// row ring trimmed both of Onyxia's phase transitions out of a 110 s fight's log.
export const MECHANIC_EVENT_KINDS: ReadonlySet<CombatEvent['kind']> = new Set([
  'phase',
  'summon',
  'instance_data',
  'creature_text',
  'evade',
  'flee',
  // The two ANSWER-side rows: an interrupt IS the answer, and a knock back is a boss mechanic that
  // fires with no phase or summon beside it. `control` stays out — the party's own stuns would swamp.
  'interrupt',
  'knock_back',
  'use_object',
  // The MOVE-side rows: every raid-side row this program authors against a hazard is a move row, so
  // without this a Rain of Fire row could not be told from one that never fired.
  'mechanic_move',
  'mechanic_move_done',
  'halt_dps',
]);
