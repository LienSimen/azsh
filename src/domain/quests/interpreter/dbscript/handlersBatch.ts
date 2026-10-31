// QI4 — SCRIPT_COMMAND handlers split out of handlers.ts for the filesize gate. This batch is
// 23,45,4,6,11,12,37,43,44,47,48,51. Cite: ScriptMgr.cpp ExecuteDbscriptCommand.

import type { DbScriptRow } from '../../../../data/schema.ts';
import {
  CURRENT_MAX_SPELL,
  DOOR_MIN_RESET_DELAY,
  GAMEOBJECT_TYPE_BUTTON,
  GAMEOBJECT_TYPE_DOOR,
  GO_STATE_ACTIVE,
  GO_STATE_ACTIVE_ALTERNATIVE,
  GO_STATE_READY,
  OBJECT_FIELD_ENTRY,
  PLAY_SOUND_FLAG_AREA,
  PLAY_SOUND_FLAG_DISTANCE,
  PLAY_SOUND_FLAG_MAP,
  PLAY_SOUND_FLAG_TARGET_PLAYER,
  PLAY_SOUND_FLAG_ZONE,
  REMOVE_AURA_CHARGE,
  REMOVE_AURA_FULL,
  REMOVE_AURA_STACK,
  SCRIPT_FLAG_COMMAND_ADDITIONAL,
  SCRIPT_FLAG_SOURCE_TARGETS_SELF,
  SPAWN_GROUP_CMD_CREATE_FORMATION,
  SPAWN_GROUP_CMD_REMOVE_FORMATION,
  SPAWN_GROUP_CMD_SET_OPTIONS,
  SPAWN_GROUP_CMD_SET_SPREAD,
  SPAWN_GROUP_CMD_SWITCH_SHAPE,
  SPAWN_GROUP_FORMATION_SPREAD_MAX,
  SPAWN_GROUP_FORMATION_TYPE_COUNT,
  UNIT_FLAG_CHANGE_ADD,
  UNIT_FLAG_CHANGE_REMOVE,
  UNIT_FLAG_CHANGE_TOGGLE,
} from './opcodes.ts';
import type {
  DbScriptContext,
  HandlerResult,
  OpcodeHandler,
  ScriptActor,
} from './types.ts';
import { defaultRandIndex } from './types.ts';
import { detHypot, detCos, detSin } from '../../../../engine/core/detMath.ts';
import { applyMountToEntryOrModel } from '../../../creature/creatureEventAi.ts';

function dataFlags(row: DbScriptRow): number {
  return row.dataFlags ?? 0;
}

function skip(reason: string, cite: string): HandlerResult {
  return { intents: [{ kind: 'skip', reason, cite }] };
}

/** Kind-narrowing guards — must not use bare `a is ScriptActor` (false branch → never). */
function isUnit(
  a: ScriptActor | null | undefined,
): a is ScriptActor & { kind: 'unit' | 'creature' | 'player' } {
  return !!a && (a.kind === 'unit' || a.kind === 'creature' || a.kind === 'player');
}

function isCreature(
  a: ScriptActor | null | undefined,
): a is ScriptActor & { kind: 'creature' } {
  return !!a && a.kind === 'creature';
}

function isPlayer(
  a: ScriptActor | null | undefined,
): a is ScriptActor & { kind: 'player' } {
  return !!a && a.kind === 'player';
}

function isGameObject(
  a: ScriptActor | null | undefined,
): a is ScriptActor & { kind: 'gameobject' } {
  return !!a && a.kind === 'gameobject';
}

function playerFromSourceOrTarget(ctx: DbScriptContext): ScriptActor | null {
  // Cite: ScriptMgr.cpp:1671–1679 GetPlayerTargetOrSourceAndLog — target player first.
  if (isPlayer(ctx.world.target)) return ctx.world.target;
  if (isPlayer(ctx.world.source)) return ctx.world.source;
  return null;
}

function rand(ctx: DbScriptContext, n: number): number {
  if (n <= 0) return 0;
  const fn = ctx.randIndex ?? defaultRandIndex;
  const i = fn(n) | 0;
  if (i < 0) return 0;
  if (i >= n) return n - 1;
  return i;
}

// ── SCRIPT_COMMAND_FIELD_SET (2) ─────────────────────────────────────────────
// Cite: ScriptMgr.cpp:1815–1828. Source is any WorldObject or Item; fieldId and value from datalong.

export const handleFieldSet: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1815–1828';
  const source = ctx.world.source;
  if (!source || source.kind === 'none') {
    return skip('FIELD_SET requires source object', cite);
  }

  const fieldId = row.datalong | 0;
  const fieldValue = row.datalong2 | 0;
  // Cite: ScriptMgr.cpp:1821 fieldId <= OBJECT_FIELD_ENTRY || fieldId >= valuesCount
  const valuesCount = source.valuesCount ?? 200;
  if (fieldId <= OBJECT_FIELD_ENTRY || fieldId >= valuesCount) {
    return skip(`FIELD_SET wrong field ${fieldId} (max ${valuesCount})`, cite);
  }

  if (!source.fields) source.fields = {};
  source.fields[fieldId] = fieldValue >>> 0;
  ctx.world.fieldSets.push({ fieldId, fieldValue: fieldValue >>> 0 });
  return {
    intents: [{ kind: 'field_set', fieldId, fieldValue: fieldValue >>> 0, cite }],
  };
};

// ── SCRIPT_COMMAND_FLAG_REMOVE (5) ─────────────────────────────────────────── Cite:
// ScriptMgr.cpp:1890–1902 RemoveFlag(fieldId, bitmask) → values[fieldId] &= ~bitmask

export const handleFlagRemove: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1890–1902';
  const source = ctx.world.source;
  if (!source || source.kind === 'none') {
    return skip('FLAG_REMOVE requires source object', cite);
  }

  const fieldId = row.datalong | 0;
  const fieldValue = row.datalong2 | 0;
  const valuesCount = source.valuesCount ?? 200;
  // Cite: ScriptMgr.cpp:1896–1900
  if (fieldId <= OBJECT_FIELD_ENTRY || fieldId >= valuesCount) {
    return skip(`FLAG_REMOVE wrong field ${fieldId} (max ${valuesCount})`, cite);
  }

  if (!source.fields) source.fields = {};
  const prev = (source.fields[fieldId] ?? 0) >>> 0;
  const resultValue = (prev & ~(fieldValue >>> 0)) >>> 0;
  source.fields[fieldId] = resultValue;
  ctx.world.flagRemoves.push({ fieldId, fieldValue: fieldValue >>> 0, resultValue });
  return {
    intents: [
      {
        kind: 'flag_remove',
        fieldId,
        fieldValue: fieldValue >>> 0,
        resultValue,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_REMOVE_AURA (14) ──────────────────────────────────────────
// Cite: ScriptMgr.cpp:2109–2131. datalong is the spellId; datalong2 is 0 full / 1 charge / 2 stack.

export const handleRemoveAura: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2109–2131';
  if (!isUnit(ctx.world.source)) {
    return skip('REMOVE_AURA requires Unit source', cite);
  }

  const spellId = row.datalong | 0;
  const modeN = row.datalong2 | 0;
  const source = ctx.world.source;
  if (!source.auras) source.auras = [];

  let mode: 'full' | 'by_caster' | 'charge' | 'stack';

  if (modeN === REMOVE_AURA_FULL) {
    // Cite: ScriptMgr.cpp:2115–2125
    if (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) {
      if (!isUnit(ctx.world.target)) {
        return skip('REMOVE_AURA by-caster requires Unit target', cite);
      }
      mode = 'by_caster';
      // Zone model: drop auras matching spellId (caster filter host-side when guids known).
      source.auras = source.auras.filter((a) => a.spellId !== spellId);
    } else {
      mode = 'full';
      source.auras = source.auras.filter((a) => a.spellId !== spellId);
    }
  } else if (modeN === REMOVE_AURA_CHARGE) {
    // Cite: ScriptMgr.cpp:2127–2128 RemoveAuraCharge
    mode = 'charge';
    const aura = source.auras.find((a) => a.spellId === spellId);
    if (aura) {
      aura.charges = Math.max(0, (aura.charges | 0) - 1);
      if (aura.charges === 0) {
        source.auras = source.auras.filter((a) => a !== aura);
      }
    }
  } else if (modeN === REMOVE_AURA_STACK) {
    // Cite: ScriptMgr.cpp:2129–2130 RemoveAuraStack
    mode = 'stack';
    const aura = source.auras.find((a) => a.spellId === spellId);
    if (aura) {
      aura.stacks = Math.max(0, (aura.stacks | 0) - 1);
      if (aura.stacks === 0) {
        source.auras = source.auras.filter((a) => a !== aura);
      }
    }
  } else {
    return skip(`REMOVE_AURA unexpected mode ${modeN}`, cite);
  }

  ctx.world.auraRemoves.push({ spellId, mode });
  return {
    intents: [{ kind: 'remove_aura', spellId, mode, cite }],
  };
};

// ── SCRIPT_COMMAND_PLAY_SOUND (16) ───────────────────────────────────────────
// Cite: ScriptMgr.cpp:2182–2218. datalong soundId, datalong2 flags; ADDITIONAL plays music.

export const handlePlaySound: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2182–2218';
  if (!ctx.world.source || ctx.world.source.kind === 'none') {
    return skip('PLAY_SOUND requires source', cite);
  }

  const soundId = row.datalong | 0;
  const flags = row.datalong2 | 0;
  const playParameter = (row.datalong3 ?? 0) | 0;

  // Cite: ScriptMgr.cpp:2192–2197 target-player bit requires a player.
  if (flags & PLAY_SOUND_FLAG_TARGET_PLAYER) {
    const player = playerFromSourceOrTarget(ctx);
    if (!player) {
      return skip('PLAY_SOUND target-player flag but no player', cite);
    }
  }

  const isMusic = (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) !== 0;
  let mode: 'direct' | 'distance' | 'map' | 'music' | 'zone' | 'area';

  if (isMusic) {
    // Cite: ScriptMgr.cpp:2207–2208
    mode = 'music';
  } else if (flags & PLAY_SOUND_FLAG_ZONE) {
    // Cite: ScriptMgr.cpp:2202–2203 (params may use zone; sound still plays)
    mode = 'zone';
  } else if (flags & PLAY_SOUND_FLAG_AREA) {
    // Cite: ScriptMgr.cpp:2204–2205
    mode = 'area';
  } else if (flags & PLAY_SOUND_FLAG_DISTANCE) {
    // Cite: ScriptMgr.cpp:2211–2212
    mode = 'distance';
  } else if (flags & PLAY_SOUND_FLAG_MAP) {
    // Cite: ScriptMgr.cpp:2213–2214
    mode = 'map';
  } else {
    // Cite: ScriptMgr.cpp:2215–2216 PlayDirectSound
    mode = 'direct';
  }

  const rec = { soundId, flags, playParameter, isMusic, mode };
  ctx.world.sounds.push(rec);
  return {
    intents: [{ kind: 'play_sound', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_ATTACK_START (26) ───────────────────────────────────────── Cite:
// ScriptMgr.cpp:2458–2476 Creature source → AI()->AttackStart(Unit target) when CanAttackNow.

function canAttackNow(attacker: ScriptActor, target: ScriptActor): boolean {
  // Cite: Relations.cpp:428–446 CanAttackNow
  if (attacker.alive === false) return false;
  if (attacker.mounted) return false;
  if (target.alive === false) return false;
  // Zone model: canAttackTarget defaults true when unset.
  if (attacker.canAttackTarget === false) return false;
  return true;
}

export const handleAttackStart: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2458–2476';
  if (!isCreature(ctx.world.source)) {
    return skip('ATTACK_START requires Creature source', cite);
  }
  if (!isUnit(ctx.world.target)) {
    return skip('ATTACK_START requires Unit target', cite);
  }

  const attacker = ctx.world.source;
  const target = ctx.world.target!;
  if (!canAttackNow(attacker, target)) {
    // Cite: ScriptMgr.cpp:2468–2471 log + break (no attack)
    return {
      intents: [{ kind: 'attack_start', canAttack: false, cite }],
    };
  }

  attacker.inCombat = true;
  ctx.world.attackStarts.push({
    attackerEntry: attacker.entry,
    targetKind: target.kind,
  });
  return {
    intents: [{ kind: 'attack_start', canAttack: true, cite }],
  };
};

// ── SCRIPT_COMMAND_PAUSE_WAYPOINTS (32) ────────────────────────────────────── Cite:
// ScriptMgr.cpp:2684–2692 datalong doPause: PauseWaypoints(0) vs UnpauseWaypoints()

export const handlePauseWaypoints: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2684–2692';
  if (!isCreature(ctx.world.source)) {
    return skip('PAUSE_WAYPOINTS requires Creature source', cite);
  }

  const doPause = (row.datalong | 0) !== 0;
  ctx.world.source.waypointsPaused = doPause;
  ctx.world.waypointPauses.push({ doPause });
  return {
    intents: [{ kind: 'pause_waypoints', doPause, cite }],
  };
};

// ── SCRIPT_COMMAND_SEND_AI_EVENT (35) ────────────────────────────────────────
// Cite: ScriptMgr.cpp:2738–2755. A radius sends around; else a creature target, else Receive.

export const handleSendAiEvent: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2738–2755';
  if (!isCreature(ctx.world.source)) {
    return skip('SEND_AI_EVENT requires Creature source', cite);
  }
  if (!isUnit(ctx.world.target)) {
    return skip('SEND_AI_EVENT requires Unit target', cite);
  }

  const eventType = row.datalong | 0;
  const radius = row.datalong2 | 0;
  const value = (row.datalong3 ?? 0) | 0;
  const source = ctx.world.source;
  const target = ctx.world.target!;

  let mode: 'around' | 'to_target' | 'receive_on_source' | 'receive_on_target';

  if (radius) {
    // Cite: ScriptMgr.cpp:2746–2747
    mode = 'around';
  } else if (target.kind === 'creature' || target.kind === 'unit') {
    // Cite: ScriptMgr.cpp:2749–2750 TYPEID_UNIT
    mode = 'to_target';
  } else if (isCreature(source) && isPlayer(target)) {
    // Cite: ScriptMgr.cpp:2751–2752
    mode = 'receive_on_source';
  } else if (isPlayer(source) && isCreature(target)) {
    // Cite: ScriptMgr.cpp:2753–2754 (unreachable after creature-source guard, kept for body fidelity)
    mode = 'receive_on_target';
  } else {
    // No matching branch — CMaNGOS falls through with no event.
    return skip('SEND_AI_EVENT no matching delivery branch', cite);
  }

  const rec = { eventType, radius, value, mode };
  ctx.world.aiEvents.push(rec);
  return {
    intents: [{ kind: 'send_ai_event', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_SEND_MAIL (38) ────────────────────────────────────────────
// Cite: ScriptMgr.cpp:2828–2843. Target Player; altSender or creature source; delay is textId[0].

export const handleSendMail: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2828–2843';
  if (!isPlayer(ctx.world.target)) {
    return skip('SEND_MAIL requires Player target', cite);
  }

  const mailTemplateId = row.datalong | 0;
  const altSender = row.datalong2 | 0;
  const money = (row.datalong3 ?? 0) | 0;
  // Cite: ScriptMgr.cpp:2840 textId[0] > 0 ? textId[0] : 0
  const deliverDelayRaw = row.dataint ?? 0;
  const deliverDelay = deliverDelayRaw > 0 ? deliverDelayRaw | 0 : 0;

  if (!altSender && !isCreature(ctx.world.source)) {
    // Cite: ScriptMgr.cpp:2832–2833
    return skip('SEND_MAIL without altSender requires Creature source', cite);
  }

  const rec = { mailTemplateId, altSender, money, deliverDelay };
  ctx.world.mails.push(rec);
  return {
    intents: [{ kind: 'send_mail', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_SET_EQUIPMENT_SLOTS (42) ──────────────────────────────────
// Cite: ScriptMgr.cpp:2881–2905. resetDefault reloads the template; else textId[0..2] set slots.

export const handleSetEquipmentSlots: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2881–2905';
  if (!isCreature(ctx.world.source)) {
    return skip('SET_EQUIPMENT_SLOTS requires Creature source', cite);
  }

  const source = ctx.world.source;
  const resetDefault = (row.datalong | 0) !== 0;

  if (resetDefault) {
    // Cite: ScriptMgr.cpp:2888–2891 LoadEquipment(EquipmentTemplateId, true)
    const restored = source.defaultVirtualItems
      ? ([...source.defaultVirtualItems] as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
    source.virtualItems = restored;
    ctx.world.equipmentChanges.push({ resetDefault: true, slots: restored });
    return {
      intents: [
        {
          kind: 'set_equipment_slots',
          resetDefault: true,
          mainHand: restored[0],
          offHand: restored[1],
          ranged: restored[2],
          cite,
        },
      ],
    };
  }

  // Signed text ids — negative skips slot. Cite: ScriptMgr.cpp:2894–2904
  const main = row.dataint ?? 0;
  const off = row.dataint2 ?? 0;
  const ranged = row.dataint3 ?? 0;
  const slots: [number, number, number] = source.virtualItems
    ? [...source.virtualItems]
    : [0, 0, 0];

  if (main >= 0) slots[0] = main | 0;
  if (off >= 0) slots[1] = off | 0;
  if (ranged >= 0) slots[2] = ranged | 0;

  source.virtualItems = slots;
  ctx.world.equipmentChanges.push({
    resetDefault: false,
    slots: [...slots] as [number, number, number],
  });
  return {
    intents: [
      {
        kind: 'set_equipment_slots',
        resetDefault: false,
        mainHand: slots[0],
        offHand: slots[1],
        ranged: slots[2],
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_SET_WORLDSTATE (53) ─────────────────────────────────────── Cite:
// ScriptMgr.cpp:3264–3267 textId[0] = worldstate id; textId[1] = new value (dataint / dataint2).

export const handleSetWorldstate: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:3264–3267';
  const worldstateId = row.dataint ?? 0;
  const value = row.dataint2 ?? 0;
  ctx.world.worldStates[worldstateId | 0] = value | 0;
  return {
    intents: [
      {
        kind: 'set_worldstate',
        worldstateId: worldstateId | 0,
        value: value | 0,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_SET_GOSSIP_MENU (52) ──────────────────────────────────────
// Cite: ScriptMgr.cpp:3256–3262 LogIfNotCreature(pTarget) then SetDefaultGossipMenuId(datalong).

export const handleSetGossipMenu: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:3256–3262';
  const target = ctx.world.target;
  if (!isCreature(target)) {
    return skip('SET_GOSSIP_MENU requires Creature target', cite);
  }
  const menuId = row.datalong | 0;
  target.gossipMenuId = menuId;
  return {
    intents: [{ kind: 'set_gossip_menu', menuId, cite }],
  };
};

// ── SCRIPT_COMMAND_SET_SHEATHE (54) ──────────────────────────────────────────
// Cite: ScriptMgr.cpp:3271–3277 SetSheath(datalong); ScriptMgr.h:473–476 sheatheState

export const handleSetSheathe: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:3271–3277';
  if (!isUnit(ctx.world.source)) {
    return skip('SET_SHEATHE requires Unit source', cite);
  }

  const sheath = row.datalong | 0;
  ctx.world.source.sheath = sheath;
  return {
    intents: [{ kind: 'set_sheath', sheath, cite }],
  };
};

// ── SCRIPT_COMMAND_FLAG_SET (4) ────────────────────────────────────────────── Cite:
// ScriptMgr.cpp:1876–1889 SetFlag(fieldId, bitmask) → values[fieldId] |= bitmask

export const handleFlagSet: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1876–1889';
  const source = ctx.world.source;
  if (!source || source.kind === 'none') {
    return skip('FLAG_SET requires source object', cite);
  }

  const fieldId = row.datalong | 0;
  const fieldValue = row.datalong2 | 0;
  const valuesCount = source.valuesCount ?? 200;
  // Cite: ScriptMgr.cpp:1882–1887
  if (fieldId <= OBJECT_FIELD_ENTRY || fieldId >= valuesCount) {
    return skip(`FLAG_SET wrong field ${fieldId} (max ${valuesCount})`, cite);
  }

  if (!source.fields) source.fields = {};
  const prev = (source.fields[fieldId] ?? 0) >>> 0;
  const resultValue = (prev | (fieldValue >>> 0)) >>> 0;
  source.fields[fieldId] = resultValue;
  ctx.world.flagSets.push({ fieldId, fieldValue: fieldValue >>> 0, resultValue });
  return {
    intents: [
      {
        kind: 'flag_set',
        fieldId,
        fieldValue: fieldValue >>> 0,
        resultValue,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_TELEPORT_TO (6) ─────────────────────────────────────────── Cite:
// ScriptMgr.cpp:1904–1911 mapId = datalong (struct teleportTo.mapId); x/y/z/o from row.

export const handleTeleportTo: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1904–1911';
  const player = playerFromSourceOrTarget(ctx);
  if (!player) {
    return skip('TELEPORT_TO requires Player source or target', cite);
  }

  // Cite: ScriptMgr.h:211–215 teleportTo.mapId = datalong
  const mapId = row.datalong | 0;
  const x = row.x ?? 0;
  const y = row.y ?? 0;
  const z = row.z ?? 0;
  const o = row.o ?? 0;

  player.mapId = mapId;
  player.x = x;
  player.y = y;
  player.z = z;
  player.o = o;

  const rec = { mapId, x, y, z, o };
  ctx.world.teleports.push(rec);
  return {
    intents: [{ kind: 'teleport_to', ...rec, cite }],
  };
};

// OPEN_DOOR (11) / CLOSE_DOOR (12). Cite: ScriptMgr.cpp:2055–2094; GameObject.cpp:1349–1370.

function applyLinkedButton(ctx: { world: { target: ScriptActor | null } }, open: boolean, alternate: boolean): boolean {
  if (
    !isGameObject(ctx.world.target) ||
    (ctx.world.target.goType ?? -1) !== GAMEOBJECT_TYPE_BUTTON
  ) {
    return false;
  }
  const btn = ctx.world.target;
  const st = btn.goState ?? GO_STATE_READY;
  if (open) {
    if (st === GO_STATE_READY) {
      btn.goState = alternate ? GO_STATE_ACTIVE_ALTERNATIVE : GO_STATE_ACTIVE;
    }
  } else if (st === GO_STATE_ACTIVE) {
    // UseOpenableObject(false) only when ACTIVE. Cite: GameObject.cpp:1361–1369
    btn.goState = GO_STATE_READY;
  }
  return true;
}

function handleChangeDoor(row: { datalong: number; datalong2: number; datalong3?: number }, ctx: Parameters<OpcodeHandler>[1], open: boolean): HandlerResult {
  const cite = 'ScriptMgr.cpp:2055–2094';
  const label = open ? 'OPEN_DOOR' : 'CLOSE_DOOR';
  const goGuid = row.datalong | 0;
  const resetDelayRaw = row.datalong2 | 0;
  // Cite: ScriptMgr.cpp:2059
  const resetDelay = resetDelayRaw < DOOR_MIN_RESET_DELAY ? DOOR_MIN_RESET_DELAY : resetDelayRaw;
  const alternate = ((row.datalong3 ?? 0) | 0) !== 0;

  let door: ScriptActor | null = null;
  if (goGuid) {
    // Cite: ScriptMgr.cpp:2061–2063
    door = ctx.lookupGameObjectByGuid?.(goGuid) ?? null;
  } else if (!isGameObject(ctx.world.source)) {
    return skip(`${label} without goGuid requires GameObject source`, cite);
  } else {
    door = ctx.world.source;
  }

  if (!door) {
    return skip(`${label} failed for goGuid ${goGuid}`, cite);
  }

  const goType = door.goType ?? -1;
  // Cite: ScriptMgr.cpp:2079–2082
  if (goType !== GAMEOBJECT_TYPE_DOOR && goType !== GAMEOBJECT_TYPE_BUTTON) {
    return skip(`${label} non-door/button goType ${goType}`, cite);
  }

  const goState = door.goState ?? GO_STATE_READY;
  // Cite: ScriptMgr.cpp:2085–2087 already in desired state → break
  if (open ? goState !== GO_STATE_READY : goState === GO_STATE_READY) {
    const rec = { goGuid, resetDelay, alternate, opened: false, closed: false, alsoButton: false };
    ctx.world.doorOpens.push(rec);
    return { intents: [{ kind: 'open_door', ...rec, cite }] };
  }

  let closed = false;
  if (open) {
    // UseOpenableObject(true). Cite: ScriptMgr.cpp:2089
    door.goState = alternate ? GO_STATE_ACTIVE_ALTERNATIVE : GO_STATE_ACTIVE;
  } else if (goState === GO_STATE_ACTIVE) {
    // UseOpenableObject(false) only when ACTIVE. Cite: GameObject.cpp:1361–1369
    door.goState = GO_STATE_READY;
    closed = true;
  }

  const alsoButton = applyLinkedButton(ctx, open, alternate);
  const rec = { goGuid, resetDelay, alternate, opened: open, closed, alsoButton };
  ctx.world.doorOpens.push(rec);
  return { intents: [{ kind: 'open_door', ...rec, cite }] };
}

export const handleOpenDoor: OpcodeHandler = (row, ctx) => handleChangeDoor(row, ctx, true);

export const handleCloseDoor: OpcodeHandler = (row, ctx) => handleChangeDoor(row, ctx, false);

// ── SCRIPT_COMMAND_MORPH_TO_ENTRY_OR_MODEL (23) ──────────────────────────────
// Cite: ScriptMgr.cpp:2390–2407. 0 demorphs; ADDITIONAL sets the model; else ChooseDisplayId.

export const handleMorphToEntryOrModel: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2390–2407';
  if (!isCreature(ctx.world.source)) {
    return skip('MORPH_TO_ENTRY_OR_MODEL requires Creature source', cite);
  }

  const source = ctx.world.source;
  const creatureOrModelEntry = row.datalong | 0;

  if (!creatureOrModelEntry) {
    // Cite: ScriptMgr.cpp:2395–2396 DeMorph → restore native
    const displayId = source.nativeDisplayId ?? 0;
    source.displayId = displayId;
    const rec = { mode: 'demorph' as const, creatureOrModelEntry: 0, displayId };
    ctx.world.morphs.push(rec);
    return { intents: [{ kind: 'morph', ...rec, cite }] };
  }

  if (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) {
    // Cite: ScriptMgr.cpp:2397–2398 model id path
    source.displayId = creatureOrModelEntry;
    const rec = {
      mode: 'model' as const,
      creatureOrModelEntry,
      displayId: creatureOrModelEntry,
    };
    ctx.world.morphs.push(rec);
    return { intents: [{ kind: 'morph', ...rec, cite }] };
  }

  // Cite: ScriptMgr.cpp:2401–2404 ChooseDisplayId via host resolver (deterministic).
  const displayId = ctx.resolveCreatureDisplayId?.(creatureOrModelEntry) ?? 0;
  source.displayId = displayId;
  const rec = { mode: 'entry' as const, creatureOrModelEntry, displayId };
  ctx.world.morphs.push(rec);
  return { intents: [{ kind: 'morph', ...rec, cite }] };
};

// SCRIPT_COMMAND_MOUNT_TO_ENTRY_OR_MODEL (24) — ScriptMgr.cpp:2409–2437
export const handleMountToEntryOrModel: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2409–2437';
  if (!isCreature(ctx.world.source)) {
    return skip('MOUNT_TO_ENTRY_OR_MODEL requires Creature source', cite);
  }

  const source = ctx.world.source;
  const creatureOrModelEntry = row.datalong | 0;
  const speedChange = (row.datalong2 | 0) !== 0;
  let creatureId = 0;
  let modelId = 0;
  let mode: 'unmount' | 'model' | 'entry' = 'unmount';

  if (speedChange) {
    // Cite: ScriptMgr.cpp:2415–2420 MountEntry / UnmountEntry
    if (creatureOrModelEntry) {
      creatureId = creatureOrModelEntry;
      modelId = ctx.resolveCreatureDisplayId?.(creatureOrModelEntry) ?? 0;
      mode = 'entry';
    }
  } else if (!creatureOrModelEntry) {
    // Cite: ScriptMgr.cpp:2424–2425 Unmount
  } else if (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) {
    // Cite: ScriptMgr.cpp:2426–2427 Mount(model id)
    modelId = creatureOrModelEntry;
    mode = 'model';
  } else {
    // Cite: ScriptMgr.cpp:2429–2433 ChooseDisplayId + Mount
    creatureId = creatureOrModelEntry;
    modelId = ctx.resolveCreatureDisplayId?.(creatureOrModelEntry) ?? 0;
    mode = 'entry';
  }

  applyMountToEntryOrModel(source, creatureId, modelId);
  const rec = { mode, creatureOrModelEntry, creatureId, modelId, speedChange };
  ctx.world.mounts.push(rec);
  return { intents: [{ kind: 'mount', ...rec, cite }] };
};

// ── SCRIPT_COMMAND_MOVE_DYNAMIC (37) ─────────────────────────────────────────
// Cite: ScriptMgr.cpp:2778–2826. maxDist 0 is the near point; else a random point in the annulus.

export const handleMoveDynamic: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2778–2826';
  if (!isCreature(ctx.world.source)) {
    return skip('MOVE_DYNAMIC requires Creature source', cite);
  }
  if (!ctx.world.target) {
    return skip('MOVE_DYNAMIC requires target', cite);
  }

  const source = ctx.world.source;
  const target = ctx.world.target;

  // Cite: ScriptMgr.cpp:2789–2792 skip when in combat
  if (source.inCombat) {
    return skip('MOVE_DYNAMIC skipped: source in combat', cite);
  }

  const maxDist = row.datalong | 0;
  const minDist = row.datalong2 | 0;
  const fixedDist = (row.datalong3 ?? 0) | 0;
  // Cite: ScriptMgr.cpp:2825 textId[0]/[1]
  const forcedMovement = row.dataint ?? 0;
  const relayId = row.dataint2 ?? 0;
  const flags = dataFlags(row);

  let x: number;
  let y: number;
  let z: number;

  if (maxDist === 0) {
    // Cite: ScriptMgr.cpp:2796–2810 Move to pTarget
    if (target === source) {
      return skip('MOVE_DYNAMIC maxDist=0 with source==target', cite);
    }
    const tx = target.x ?? 0;
    const ty = target.y ?? 0;
    const tz = target.z ?? 0;
    const sx = source.x ?? 0;
    const sy = source.y ?? 0;
    // Angle from target toward source. Cite: GetAngle / GetNearPoint2dAt cos/sin of an atan2 is the unit
    // vector — kept algebraic so it stays exact (W1b). d = 0 reproduces atan2(0,0) = 0 → (1, 0).
    const d = detHypot(sx - tx, sy - ty);
    const ux = d > 0 ? (sx - tx) / d : 1;
    const uy = d > 0 ? (sy - ty) / d : 0;
    // Zone model: place at fixedDist from target along that angle (no bounding radius
    // when COMMAND_ADDITIONAL; contact path uses same fixedDist as datalong3).
    const dist = fixedDist;
    x = tx + ux * dist;
    y = ty + uy * dist;
    z = tz;
    // Cite: ScriptMgr.cpp:2806–2807 / 2810 UpdateAllowedPositionZ omitted zone-model
    void (flags & SCRIPT_FLAG_COMMAND_ADDITIONAL);
  } else {
    // Cite: ScriptMgr.cpp:2812–2823 Calculate position in annulus
    let orientation: number;
    if (flags & SCRIPT_FLAG_COMMAND_ADDITIONAL) {
      // Cite: ScriptMgr.cpp:2816 source O + script o + 2π
      orientation = (source.o ?? 0) + (row.o ?? 0) + 2 * Math.PI;
    } else {
      orientation = row.o ?? 0;
    }
    const tx = target.x ?? 0;
    const ty = target.y ?? 0;
    const tz = target.z ?? 0;
    // Deterministic radius in [minDist, maxDist] via randIndex. Cite: GetRandomPoint.
    const span = Math.max(0, maxDist - minDist);
    const dist = span === 0 ? maxDist : minDist + rand(ctx, span + 1);
    // When orientation == 0 CMaNGOS may randomize angle; zone model uses 0 → angle 0.
    const angle = orientation === 0 ? 0 : orientation;
    x = tx + detCos(angle) * dist;
    y = ty + detSin(angle) * dist;
    // Cite: ScriptMgr.cpp:2822 z = max(z, target.z)
    z = Math.max(tz, tz);
  }

  source.x = x;
  source.y = y;
  source.z = z;

  const rec = {
    x,
    y,
    z,
    maxDist,
    minDist,
    fixedDist,
    forcedMovement: forcedMovement | 0,
    relayId: relayId | 0,
  };
  ctx.world.dynamicMoves.push(rec);
  return {
    intents: [{ kind: 'move_dynamic', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_RESET_GO (43) ───────────────────────────────────────────── Cite:
// ScriptMgr.cpp:2907–2923 Target GO door/button → ResetDoorOrButton (back to READY).

export const handleResetGo: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2907–2923';
  void row;
  if (!isGameObject(ctx.world.target)) {
    return skip('RESET_GO requires GameObject target', cite);
  }

  const go = ctx.world.target!;
  const goType = go.goType ?? -1;
  if (goType !== GAMEOBJECT_TYPE_DOOR && goType !== GAMEOBJECT_TYPE_BUTTON) {
    // Cite: ScriptMgr.cpp:2919–2921 log + break (no reset)
    ctx.world.goResets.push({ goType, reset: false });
    return {
      intents: [{ kind: 'reset_go', goType, reset: false, cite }],
    };
  }

  // ResetDoorOrButton → closed/ready. Cite: ScriptMgr.cpp:2917
  go.goState = GO_STATE_READY;
  ctx.world.goResets.push({ goType, reset: true });
  return {
    intents: [{ kind: 'reset_go', goType, reset: true, cite }],
  };
};

// ── SCRIPT_COMMAND_UPDATE_TEMPLATE (44) ────────────────────────────────────── Cite:
// ScriptMgr.cpp:2925–2936 UpdateEntry(newTemplate) when entry differs; else log error no-op.

export const handleUpdateTemplate: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2925–2936';
  if (!isCreature(ctx.world.source)) {
    return skip('UPDATE_TEMPLATE requires Creature source', cite);
  }

  const source = ctx.world.source;
  const newTemplate = row.datalong | 0;
  const oldEntry = source.entry ?? 0;

  if (oldEntry !== newTemplate) {
    // Cite: ScriptMgr.cpp:2932–2933
    source.entry = newTemplate;
    ctx.world.templateUpdates.push({ oldEntry, newTemplate, changed: true });
    return {
      intents: [
        {
          kind: 'update_template',
          oldEntry,
          newTemplate,
          changed: true,
          cite,
        },
      ],
    };
  }

  // Cite: ScriptMgr.cpp:2934–2935 already has entry
  ctx.world.templateUpdates.push({ oldEntry, newTemplate, changed: false });
  return {
    intents: [
      {
        kind: 'update_template',
        oldEntry,
        newTemplate,
        changed: false,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_START_RELAY_SCRIPT (45) ───────────────────────────────────
// Cite: ScriptMgr.cpp:2938–2948. templateId picks a random relay, else relayId; 0 starts nothing.

export const handleStartRelayScript: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2938–2948';
  const relayId = row.datalong | 0;
  const templateId = row.datalong2 | 0;

  let chosenId = 0;
  if (templateId) {
    // Cite: ScriptMgr.cpp:2941–2942
    chosenId = ctx.resolveRelayFromTemplate?.(templateId) ?? 0;
  } else {
    // Cite: ScriptMgr.cpp:2943–2944
    chosenId = relayId;
  }

  if (!chosenId) {
    return skip('START_RELAY_SCRIPT chosenId is 0', cite);
  }

  const rec = { relayId, templateId, chosenId };
  ctx.world.relayScripts.push(rec);
  return {
    intents: [{ kind: 'start_relay_script', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_INTERRUPT_SPELL (47) ────────────────────────────────────── Cite:
// ScriptMgr.cpp:2960–2968 InterruptSpell(CurrentSpellTypes datalong).

export const handleInterruptSpell: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2960–2968';
  if (!isUnit(ctx.world.source)) {
    return skip('INTERRUPT_SPELL requires Unit source', cite);
  }

  const currentSpellType = row.datalong | 0;
  // Load validation: type < CURRENT_MAX_SPELL. Cite: ScriptMgr.cpp:815–818
  if (currentSpellType < 0 || currentSpellType >= CURRENT_MAX_SPELL) {
    return skip(`INTERRUPT_SPELL invalid spell type ${currentSpellType}`, cite);
  }

  const source = ctx.world.source;
  if (!source.currentSpells) source.currentSpells = [];
  const idx = source.currentSpells.findIndex((s) => s.spellType === currentSpellType);
  let interruptedSpellId = 0;
  if (idx >= 0) {
    interruptedSpellId = source.currentSpells[idx]!.spellId;
    source.currentSpells.splice(idx, 1);
  }

  const rec = { currentSpellType, interruptedSpellId };
  ctx.world.spellInterrupts.push(rec);
  return {
    intents: [{ kind: 'interrupt_spell', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_MODIFY_UNIT_FLAGS (48) ──────────────────────────────────── Cite:
// ScriptMgr.cpp:2970–2992 change_flag 0 remove / 1 add / 2 toggle on UNIT_FIELD_FLAGS.

export const handleModifyUnitFlags: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2970–2992';
  if (!isCreature(ctx.world.source)) {
    return skip('MODIFY_UNIT_FLAGS requires Creature source', cite);
  }

  const flag = row.datalong | 0;
  const changeFlag = row.datalong2 | 0;
  const source = ctx.world.source;
  let flags = (source.unitFlags ?? 0) >>> 0;
  let mode: 'remove' | 'add' | 'toggle';

  if (changeFlag === UNIT_FLAG_CHANGE_REMOVE) {
    // Cite: ScriptMgr.cpp:2976–2977
    mode = 'remove';
    flags = (flags & ~(flag >>> 0)) >>> 0;
  } else if (changeFlag === UNIT_FLAG_CHANGE_ADD) {
    // Cite: ScriptMgr.cpp:2979–2980
    mode = 'add';
    flags = (flags | (flag >>> 0)) >>> 0;
  } else if (changeFlag === UNIT_FLAG_CHANGE_TOGGLE) {
    // Cite: ScriptMgr.cpp:2982–2987
    mode = 'toggle';
    if ((flags & (flag >>> 0)) !== 0) {
      flags = (flags & ~(flag >>> 0)) >>> 0;
    } else {
      flags = (flags | (flag >>> 0)) >>> 0;
    }
  } else {
    // Cite: ScriptMgr.cpp:2989–2990 unexpected
    return skip(`MODIFY_UNIT_FLAGS unexpected change_flag ${changeFlag}`, cite);
  }

  source.unitFlags = flags;
  const rec = { flag: flag >>> 0, changeFlag, mode, resultFlags: flags };
  ctx.world.unitFlagChanges.push(rec);
  return {
    intents: [{ kind: 'modify_unit_flags', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_CREATE_ITEM (17) ──────────────────────────────────────────
// Cite: ScriptMgr.cpp:2220–2235 GetPlayerTargetOrSourceAndLog; COMMAND_ADDITIONAL → DestroyItemCount.

export const handleCreateItem: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2220–2235';
  const pPlayer = playerFromSourceOrTarget(ctx);
  if (!pPlayer) {
    return skip('CREATE_ITEM requires Player source or target', cite);
  }

  const itemEntry = row.datalong | 0;
  const amount = row.datalong2 | 0;
  if (!itemEntry || !amount) {
    return skip('CREATE_ITEM requires item entry and amount', cite);
  }

  const destroyed = (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) !== 0;
  const rec = { itemEntry, amount, destroyed };
  ctx.world.createdItems.push(rec);
  return {
    intents: [{ kind: 'create_item', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_MEETINGSTONE (200) ────────────────────────────────────────
// Cite: ScriptMgr.cpp:3287–3307. areaId = datalong; AddToQueue(player, areaId).

export const handleMeetingStone: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:3287–3307';
  // Cite: ScriptMgr.cpp:3289–3290 LogIfNotPlayer(pTarget) → return false
  if (!isPlayer(ctx.world.target)) {
    return skip('MEETINGSTONE requires Player target', cite);
  }

  const areaId = row.datalong | 0;
  ctx.world.target.lfgAreaId = areaId;
  ctx.world.meetingStoneQueues.push({ areaId });
  return {
    intents: [{ kind: 'meetingstone', areaId, cite }],
  };
};

// ── SCRIPT_COMMAND_SET_HOVER (39) ────────────────────────────────────────────
// Cite: ScriptMgr.cpp:2847–2864 — Creature pSource SetHover(fly); fly-anim additional is wotlk+ commented out.

export const handleSetHover: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2847–2864';
  if (!isCreature(ctx.world.source)) {
    return skip('SET_HOVER requires Creature source', cite);
  }

  const hover = (row.datalong | 0) !== 0;
  ctx.world.source.hovering = hover;
  ctx.world.hoverChanges.push({ hover });
  return {
    intents: [{ kind: 'set_hover', hover, cite }],
  };
};

// ── SCRIPT_COMMAND_SPAWN_GROUP (51) ──────────────────────────────────────────
// Cite: ScriptMgr.cpp:3011–3252; ScriptMgr.h:137 datalong = command.

function spawnGroupTarget(row: DbScriptRow, ctx: DbScriptContext): ScriptActor | null {
  // Cite: ScriptMgr.cpp:1626–1627 SOURCE_TARGETS_SELF → finalTargets = finalSources.
  if ((dataFlags(row) & SCRIPT_FLAG_SOURCE_TARGETS_SELF) !== 0) return ctx.world.source;
  return ctx.world.target;
}

function leaderGroupId(leader: ScriptActor, data1: number): number {
  if (data1) return data1 | 0;
  return (leader.formationGroupId ?? 0) | 0;
}

function stampLeaderFormation(
  leader: ScriptActor,
  groupId: number,
  formationType: number,
  spread: number,
  options: number,
  present: boolean,
): void {
  leader.hasCreatureGroup = present;
  leader.inFormation = present;
  leader.formationGroupId = present ? groupId : undefined;
  leader.formationType = present ? formationType : undefined;
  leader.formationSpread = present ? spread : undefined;
  leader.formationOptions = present ? options : undefined;
}

export const handleSpawnGroup: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:3011–3252';
  const subcommand = row.datalong | 0;
  const data1 = row.datalong2 | 0;
  const formationType = (row.dataint ?? 0) | 0;
  const options = (row.dataint2 ?? 0) | 0;
  const spread = row.x ?? 0;

  const existing = (groupId: number) => {
    for (let i = ctx.world.spawnGroupOps.length - 1; i >= 0; i--) {
      const op = ctx.world.spawnGroupOps[i]!;
      if (op.groupId === groupId && op.applied && op.mode !== 'remove') return op;
    }
    return undefined;
  };

  if (subcommand === SPAWN_GROUP_CMD_CREATE_FORMATION || subcommand === SPAWN_GROUP_CMD_REMOVE_FORMATION) {
    // Cite: ScriptMgr.cpp:3015–3130 target = pTarget ? pTarget : pSource.
    if (!ctx.world.source && !ctx.world.target) {
      return skip('SPAWN_GROUP create/remove requires source or target', cite);
    }
    const resolved = spawnGroupTarget(row, ctx);
    const leader = resolved ?? ctx.world.target ?? ctx.world.source;
    if (!isCreature(leader)) {
      return skip('SPAWN_GROUP create/remove requires Creature target', cite);
    }
    const groupId = leaderGroupId(leader, data1);
    if (!groupId) {
      return skip(`SPAWN_GROUP target group(${data1}) not found`, cite);
    }
    const prior = existing(groupId);
    if (subcommand === SPAWN_GROUP_CMD_CREATE_FORMATION) {
      if (formationType >= SPAWN_GROUP_FORMATION_TYPE_COUNT) {
        return skip(`SPAWN_GROUP create invalid shape ${formationType}`, cite);
      }
      if (prior) {
        return skip(`SPAWN_GROUP create failed — group(${groupId}) already has a formation`, cite);
      }
      const rec = {
        subcommand,
        groupId,
        formationType,
        spread,
        options,
        mode: 'create' as const,
        applied: true,
      };
      stampLeaderFormation(leader, groupId, formationType, spread, options, true);
      ctx.world.spawnGroupOps.push(rec);
      return { intents: [{ kind: 'spawn_group', ...rec, cite }] };
    }
    if (!prior) {
      return skip(`SPAWN_GROUP remove failed — group(${groupId}) has no formation`, cite);
    }
    const rec = {
      subcommand,
      groupId,
      formationType: prior.formationType,
      spread: prior.spread,
      options: prior.options,
      mode: 'remove' as const,
      applied: true,
    };
    stampLeaderFormation(leader, groupId, 0, 0, 0, false);
    ctx.world.spawnGroupOps.push(rec);
    return { intents: [{ kind: 'spawn_group', ...rec, cite }] };
  }

  if (
    subcommand === SPAWN_GROUP_CMD_SWITCH_SHAPE
    || subcommand === SPAWN_GROUP_CMD_SET_SPREAD
    || subcommand === SPAWN_GROUP_CMD_SET_OPTIONS
  ) {
    // Cite: ScriptMgr.cpp:3161–3245 LogIfNotCreature(pTarget).
    const target = spawnGroupTarget(row, ctx);
    if (!isCreature(target)) {
      return skip('SPAWN_GROUP shape/spread/options requires Creature target', cite);
    }
    const groupId = (target.formationGroupId ?? 0) | 0;
    const prior = groupId ? existing(groupId) : undefined;
    if (!target.inFormation && !prior) {
      return skip('SPAWN_GROUP failed — target is not in formation', cite);
    }
    const curType = target.formationType ?? prior?.formationType ?? 0;
    const curSpread = target.formationSpread ?? prior?.spread ?? 0;
    const curOpts = target.formationOptions ?? prior?.options ?? 0;

    if (subcommand === SPAWN_GROUP_CMD_SWITCH_SHAPE) {
      if (data1 >= SPAWN_GROUP_FORMATION_TYPE_COUNT) {
        return {
          intents: [{
            kind: 'skip',
            reason: `SPAWN_GROUP switchShape wrong shape id(${data1})`,
            cite,
          }],
          terminateScript: true,
        };
      }
      const rec = {
        subcommand,
        groupId,
        formationType: data1,
        spread: curSpread,
        options: curOpts,
        mode: 'switch_shape' as const,
        applied: data1 !== curType,
      };
      if (rec.applied) target.formationType = data1;
      ctx.world.spawnGroupOps.push(rec);
      return { intents: [{ kind: 'spawn_group', ...rec, cite }] };
    }
    if (subcommand === SPAWN_GROUP_CMD_SET_SPREAD) {
      if (spread > SPAWN_GROUP_FORMATION_SPREAD_MAX) {
        return {
          intents: [{
            kind: 'skip',
            reason: `SPAWN_GROUP changeSpread wrong spread(${spread})`,
            cite,
          }],
          terminateScript: true,
        };
      }
      const rec = {
        subcommand,
        groupId,
        formationType: curType,
        spread,
        options: curOpts,
        mode: 'set_spread' as const,
        applied: true,
      };
      target.formationSpread = spread;
      ctx.world.spawnGroupOps.push(rec);
      return { intents: [{ kind: 'spawn_group', ...rec, cite }] };
    }
    const rec = {
      subcommand,
      groupId,
      formationType: curType,
      spread: curSpread,
      options: data1,
      mode: 'set_options' as const,
      applied: true,
    };
    target.formationOptions = data1;
    ctx.world.spawnGroupOps.push(rec);
    return { intents: [{ kind: 'spawn_group', ...rec, cite }] };
  }

  return skip(`SPAWN_GROUP invalid formation command(${subcommand})`, cite);
};
