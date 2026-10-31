// QI4 — SCRIPT_COMMAND_* handler bodies for the Classic-used paths, ported from ScriptMgr.cpp
// ExecuteDbscriptCommand with full branch coverage. Random pools use ctx.randIndex, so no clock.

import type { DbScriptRow } from '../../../../data/schema.ts';
import {
  FALL_MOTION_TYPE,
  GAMEOBJECT_TYPE_DOOR,
  GAMEOBJECT_TYPE_FISHINGNODE,
  GO_FLAG_LOCKED,
  GO_FLAG_NO_INTERACT,
  GO_LOCK_STATE_INTERACT,
  GO_LOCK_STATE_LOCK,
  GO_LOCK_STATE_NON_INTERACT,
  GO_LOCK_STATE_UNLOCK,
  IDLE_MOTION_TYPE,
  LINEAR_WP_MOTION_TYPE,
  MAX_TEXT_ID,
  NPC_FLAG_CHANGE_ADD,
  NPC_FLAG_CHANGE_REMOVE,
  NPC_FLAG_CHANGE_TOGGLE,
  PATH_MOTION_TYPE,
  RANDOM_MOTION_TYPE,
  SCRIPT_COMMAND_ACTIVATE_OBJECT,
  SCRIPT_COMMAND_ATTACK_START,
  SCRIPT_COMMAND_CAST_SPELL,
  SCRIPT_COMMAND_CREATE_ITEM,
  SCRIPT_COMMAND_DESPAWN_GO,
  SCRIPT_COMMAND_DESPAWN_SELF,
  SCRIPT_COMMAND_EMOTE,
  SCRIPT_COMMAND_FIELD_SET,
  SCRIPT_COMMAND_FLAG_REMOVE,
  SCRIPT_COMMAND_FLAG_SET,
  SCRIPT_COMMAND_GO_LOCK_STATE,
  SCRIPT_COMMAND_INTERRUPT_SPELL,
  SCRIPT_COMMAND_MODIFY_NPC_FLAGS,
  SCRIPT_COMMAND_MODIFY_UNIT_FLAGS,
  SCRIPT_COMMAND_MORPH_TO_ENTRY_OR_MODEL,
  SCRIPT_COMMAND_MOUNT_TO_ENTRY_OR_MODEL,
  SCRIPT_COMMAND_MOVE_DYNAMIC,
  SCRIPT_COMMAND_MOVE_TO,
  SCRIPT_COMMAND_MOVEMENT,
  SCRIPT_COMMAND_CLOSE_DOOR,
  SCRIPT_COMMAND_OPEN_DOOR,
  SCRIPT_COMMAND_PAUSE_WAYPOINTS,
  SCRIPT_COMMAND_PLAY_SOUND,
  SCRIPT_COMMAND_KILL_CREDIT,
  SCRIPT_COMMAND_QUEST_EXPLORED,
  SCRIPT_COMMAND_REMOVE_AURA,
  SCRIPT_COMMAND_RESET_GO,
  SCRIPT_COMMAND_RESPAWN_GAMEOBJECT,
  SCRIPT_COMMAND_SEND_AI_EVENT,
  SCRIPT_COMMAND_SEND_MAIL,
  SCRIPT_COMMAND_SET_ACTIVEOBJECT,
  SCRIPT_COMMAND_SET_EQUIPMENT_SLOTS,
  SCRIPT_COMMAND_SET_FACING,
  SCRIPT_COMMAND_SET_FACTION,
  SCRIPT_COMMAND_SET_GOSSIP_MENU,
  SCRIPT_COMMAND_SET_HOVER,
  SCRIPT_COMMAND_SET_RUN,
  SCRIPT_COMMAND_SET_SHEATHE,
  SCRIPT_COMMAND_SET_WORLDSTATE,
  SCRIPT_COMMAND_SPAWN_GROUP,
  SCRIPT_COMMAND_STAND_STATE,
  SCRIPT_COMMAND_START_RELAY_SCRIPT,
  SCRIPT_COMMAND_TALK,
  SCRIPT_COMMAND_TELEPORT_TO,
  SCRIPT_COMMAND_TEMP_SPAWN_CREATURE,
  SCRIPT_COMMAND_TERMINATE_COND,
  SCRIPT_COMMAND_TERMINATE_SCRIPT,
  SCRIPT_COMMAND_UPDATE_TEMPLATE,
  SCRIPT_COMMAND_MEETINGSTONE,
  SCRIPT_FLAG_BUDDY_BY_GO,
  SCRIPT_FLAG_BUDDY_BY_GUID,
  SCRIPT_FLAG_COMMAND_ADDITIONAL,
  TEMPSPAWN_DEAD_DESPAWN,
  TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN,
  WAYPOINT_MOTION_TYPE,
} from './opcodes.ts';
import type {
  DbScriptContext,
  DbScriptIntent,
  HandlerResult,
  OpcodeHandler,
  ScriptActor,
} from './types.ts';
import { defaultRandIndex } from './types.ts';
import { detAtan2 } from '../../../../engine/core/detMath.ts';
import {
  handleAttackStart,
  handleCreateItem,
  handleFieldSet,
  handleFlagRemove,
  handleFlagSet,
  handleInterruptSpell,
  handleModifyUnitFlags,
  handleMorphToEntryOrModel,
  handleCloseDoor,
  handleMountToEntryOrModel,
  handleMoveDynamic,
  handleOpenDoor,
  handlePauseWaypoints,
  handlePlaySound,
  handleRemoveAura,
  handleResetGo,
  handleSendAiEvent,
  handleSendMail,
  handleSetEquipmentSlots,
  handleSetGossipMenu,
  handleSetSheathe,
  handleSetHover,
  handleSetWorldstate,
  handleSpawnGroup,
  handleStartRelayScript,
  handleTeleportTo,
  handleUpdateTemplate,
  handleMeetingStone,
} from './handlersBatch.ts';

export {
  handleAttackStart,
  handleCreateItem,
  handleFieldSet,
  handleFlagRemove,
  handleFlagSet,
  handleInterruptSpell,
  handleModifyUnitFlags,
  handleMorphToEntryOrModel,
  handleCloseDoor,
  handleMountToEntryOrModel,
  handleMoveDynamic,
  handleOpenDoor,
  handlePauseWaypoints,
  handlePlaySound,
  handleRemoveAura,
  handleResetGo,
  handleSendAiEvent,
  handleSendMail,
  handleSetEquipmentSlots,
  handleSetGossipMenu,
  handleSetSheathe,
  handleSetHover,
  handleSetWorldstate,
  handleSpawnGroup,
  handleStartRelayScript,
  handleTeleportTo,
  handleUpdateTemplate,
  handleMeetingStone,
} from './handlersBatch.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

function textIds(row: DbScriptRow): number[] {
  // Cite: ScriptMgr.h:498 textId[MAX_TEXT_ID] ← dataint..dataint4
  return [row.dataint ?? 0, row.dataint2 ?? 0, row.dataint3 ?? 0, row.dataint4 ?? 0];
}

function dataFlags(row: DbScriptRow): number {
  return row.dataFlags ?? 0;
}

function rand(ctx: DbScriptContext, n: number): number {
  if (n <= 0) return 0;
  const fn = ctx.randIndex ?? defaultRandIndex;
  const i = fn(n) | 0;
  if (i < 0) return 0;
  if (i >= n) return n - 1;
  return i;
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

function isGameObject(
  a: ScriptActor | null | undefined,
): a is ScriptActor & { kind: 'gameobject' } {
  return !!a && a.kind === 'gameobject';
}

function isPlayer(
  a: ScriptActor | null | undefined,
): a is ScriptActor & { kind: 'player' } {
  return !!a && a.kind === 'player';
}

function dist3d(a: ScriptActor, x: number, y: number, z: number): number {
  const dx = (a.x ?? 0) - x;
  const dy = (a.y ?? 0) - y;
  const dz = (a.z ?? 0) - z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── SCRIPT_COMMAND_TALK (0) ──────────────────────────────────────────────────
// Cite: ScriptMgr.cpp:1760–1796

export const handleTalk: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1760–1796';
  if (!ctx.world.source || ctx.world.source.kind === 'none') {
    return skip('TALK requires worldobject source', cite);
  }

  const tids = textIds(row);
  let textId = tids[0] ?? 0;
  const stringTemplateId = row.datalong | 0;

  if (stringTemplateId) {
    // Cite: ScriptMgr.cpp:1771–1775
    const resolved = ctx.resolveStringTemplate?.(stringTemplateId) ?? 0;
    if (resolved === 0) return skip('TALK string template resolved to 0', cite);
    textId = resolved;
  } else if (tids[1]) {
    // Random among non-zero leading text ids. Cite: ScriptMgr.cpp:1780–1790
    let i = 2;
    for (; i < MAX_TEXT_ID; ++i) {
      if (!tids[i]) break;
    }
    textId = tids[rand(ctx, i)] ?? textId;
  }

  ctx.world.talks.push(textId);
  const intent: DbScriptIntent = {
    kind: 'talk',
    textId,
    stringTemplateId,
    cite,
  };
  return { intents: [intent] };
};

// ── SCRIPT_COMMAND_EMOTE (1) ─────────────────────────────────────────────────
// Cite: ScriptMgr.cpp:1798–1813

export const handleEmote: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1798–1813';
  if (!isUnit(ctx.world.source)) {
    return skip('EMOTE requires Unit source', cite);
  }

  const emotes: number[] = [row.datalong | 0];
  for (const t of textIds(row)) {
    if (!t) break;
    emotes.push(t | 0);
  }
  const emoteId = emotes[rand(ctx, emotes.length)] ?? 0;
  ctx.world.emotes.push(emoteId);
  return {
    intents: [{ kind: 'emote', emoteId, cite }],
  };
};

// ── SCRIPT_COMMAND_MOVE_TO (3) ───────────────────────────────────────────────
// Cite: ScriptMgr.cpp:1829–1874

export const handleMoveTo: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1829–1874';
  if (!isUnit(ctx.world.source)) {
    return skip('MOVE_TO requires Unit source', cite);
  }

  const source = ctx.world.source;
  const tids = textIds(row);
  const text0 = tids[0] ?? 0;
  const relayId = row.datalong | 0;
  const travelSpeed = row.datalong2 | 0;
  const forcedMovement = (row.datalong3 ?? 0) | 0;
  const x = row.x ?? 0;
  const y = row.y ?? 0;
  const z = row.z ?? 0;
  const o = row.o ?? 0;

  // textId[0] specials: 1 → MovePoint respawn; 2 → group MoveHome or solo home.
  // Cite: ScriptMgr.cpp:1836–1847 (operator precedence: ==1 || (==2 && !group))
  if (text0) {
    if (text0 === 1 || (text0 === 2 && !source.hasCreatureGroup)) {
      const intent: DbScriptIntent = {
        kind: 'move_to',
        mode: 'home',
        x: source.x ?? 0,
        y: source.y ?? 0,
        z: source.z ?? 0,
        o: source.o ?? 0,
        travelSpeed: 0,
        relayId,
        forcedMovement,
        cite,
      };
      return { intents: [intent] };
    }
    if (text0 === 2) {
      return {
        intents: [
          {
            kind: 'move_to',
            mode: 'group_home',
            x: 0,
            y: 0,
            z: 0,
            o: 0,
            travelSpeed: 0,
            relayId,
            forcedMovement,
            cite,
          },
        ],
      };
    }
    // CMaNGOS breaks after the textId block only when textId[0] is truthy and handled; any other
    // non-zero still hits break at 1847, so a non-1/2 non-zero terminates the step here too.
    return skip(`MOVE_TO textId[0]=${text0} unhandled special`, cite);
  }

  // Facing-only: zero coords OR already within 0.01 - boundingRadius.
  // Cite: ScriptMgr.cpp:1851–1856
  const br = source.boundingRadius ?? 0;
  const near =
    (x === 0 && y === 0 && z === 0) ||
    (source.x != null && dist3d(source, x, y, z) <= 0.01 - br);

  if (near) {
    source.o = o;
    return {
      intents: [
        {
          kind: 'move_to',
          mode: 'facing',
          x,
          y,
          z,
          o,
          travelSpeed: 0,
          relayId,
          forcedMovement,
          cite,
        },
      ],
    };
  }

  // COMMAND_ADDITIONAL → NearTeleportTo. Cite: ScriptMgr.cpp:1859–1863
  if (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) {
    const face = o !== 0 ? o : (source.o ?? 0);
    source.x = x;
    source.y = y;
    source.z = z;
    source.o = face;
    return {
      intents: [
        {
          kind: 'move_to',
          mode: 'teleport',
          x,
          y,
          z,
          o: face,
          travelSpeed: 0,
          relayId,
          forcedMovement,
          cite,
        },
      ],
    };
  }

  // travelSpeed → MoveCharge at speed*0.01; else MovePoint. Cite: ScriptMgr.cpp:1867–1872
  if (travelSpeed) {
    return {
      intents: [
        {
          kind: 'move_to',
          mode: 'charge',
          x,
          y,
          z,
          o,
          travelSpeed: travelSpeed * 0.01,
          relayId,
          forcedMovement,
          cite,
        },
      ],
    };
  }

  source.x = x;
  source.y = y;
  source.z = z;
  if (o) source.o = o;
  return {
    intents: [
      {
        kind: 'move_to',
        mode: 'point',
        x,
        y,
        z,
        o,
        travelSpeed: 0,
        relayId,
        forcedMovement,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_RESPAWN_GAMEOBJECT (9) ────────────────────────────────────
// Cite: ScriptMgr.cpp:1980–2025

export const handleRespawnGameObject: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1980–2025';
  const goGuid = row.datalong | 0;
  const despawnDelay = row.datalong2 | 0;

  let pGo: ScriptActor | null = null;
  if (goGuid) {
    pGo = ctx.lookupGameObjectByGuid?.(goGuid) ?? null;
    if (!pGo) {
      // Soft miss: emit rejected so tests can assert guid path; CMaNGOS breaks when null.
      return skip(`RESPAWN_GAMEOBJECT guid ${goGuid} not found`, cite);
    }
  } else {
    if (!isGameObject(ctx.world.source)) {
      return skip('RESPAWN_GAMEOBJECT without guid requires GO source', cite);
    }
    pGo = ctx.world.source;
  }

  const goType = pGo.goType ?? -1;
  if (goType === GAMEOBJECT_TYPE_FISHINGNODE || goType === GAMEOBJECT_TYPE_DOOR) {
    return {
      intents: [
        {
          kind: 'respawn_gameobject',
          goGuid,
          despawnDelay,
          mode: 'rejected_type',
          goType,
          cite,
        },
      ],
    };
  }

  if (pGo.spawned) {
    return {
      intents: [
        {
          kind: 'respawn_gameobject',
          goGuid,
          despawnDelay,
          mode: 'already_spawned',
          goType,
          cite,
        },
      ],
    };
  }

  // Static spawned-by-default → Respawn(); else READY + SetRespawnTime + Refresh.
  // Cite: ScriptMgr.cpp:2017–2023
  const mode = pGo.spawnedByDefault ? 'respawn' : 'refresh';
  pGo.spawned = true;
  ctx.world.goRespawns.push({ goGuid, despawnDelay, mode });
  return {
    intents: [
      {
        kind: 'respawn_gameobject',
        goGuid,
        despawnDelay,
        mode,
        goType,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_TEMP_SPAWN_CREATURE (10) ──────────────────────────────────
// Cite: ScriptMgr.cpp:2027–2051

export const handleTempSpawnCreature: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2027–2051';
  if (!ctx.world.source || ctx.world.source.kind === 'none') {
    return skip('TEMP_SPAWN_CREATURE requires worldobject source', cite);
  }

  const tids = textIds(row);
  const setRun = tids[0] === 1; // textId[0] / dataint
  const spawnDataEntry = tids[3] | 0; // textId[3] / dataint4
  const creatureEntry = row.datalong | 0;
  const despawnDelay = row.datalong2 | 0;
  const pathId = (row.datalong3 ?? 0) | 0;
  const x = row.x ?? 0;
  const y = row.y ?? 0;
  const z = row.z ?? 0;
  const o = row.o ?? 0;
  const summonActive = (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) !== 0;
  // Cite: ScriptMgr.cpp:2041
  const spawnType = despawnDelay
    ? TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN
    : TEMPSPAWN_DEAD_DESPAWN;

  const rec = {
    creatureEntry,
    x,
    y,
    z,
    o,
    despawnDelay,
    pathId,
    setRun,
    summonActive,
    spawnDataEntry,
    spawnType,
  };
  ctx.world.tempSpawns.push(rec);
  return {
    intents: [
      {
        kind: 'temp_spawn_creature',
        ...rec,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_ACTIVATE_OBJECT (13) ──────────────────────────────────────
// Cite: ScriptMgr.cpp:2094–2107

export const handleActivateObject: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2094–2107';
  if (!isUnit(ctx.world.source)) {
    return skip('ACTIVATE_OBJECT requires Unit source', cite);
  }
  if (!isGameObject(ctx.world.target)) {
    return skip('ACTIVATE_OBJECT requires GameObject target', cite);
  }

  const animId = row.datalong | 0;
  const customAnim = (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) !== 0;
  ctx.world.goActivations.push({ customAnim, animId });
  return {
    intents: [
      {
        kind: 'activate_object',
        customAnim,
        animId,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_CAST_SPELL (15) ───────────────────────────────────────────
// Cite: ScriptMgr.cpp:2134–2180

export const handleCastSpell: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2134–2180';
  const tids = textIds(row);
  let spellId = row.datalong | 0;
  const castFlags = row.datalong2 | 0;

  // Count filled textId fields; urand(0, filledCount) — 0 keeps datalong spell.
  // Cite: ScriptMgr.cpp:2138–2143
  let filledCount = 0;
  while (filledCount < MAX_TEXT_ID && tids[filledCount]) ++filledCount;
  if (filledCount > 0) {
    const randomField = rand(ctx, filledCount + 1); // inclusive upper like urand(0, filledCount)
    if (randomField > 0) spellId = tids[randomField - 1] | 0;
  }

  let targetCleared = false;
  // SPELL_ATTR_EX_EXCLUDE_CASTER and target==source not modeled without spell dbc —
  // COMMAND_ADDITIONAL clears target. Cite: ScriptMgr.cpp:2148–2149
  if (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) {
    targetCleared = true;
  }

  // GO source → target casts on self with GO as original caster.
  // Cite: ScriptMgr.cpp:2152–2158
  if (isGameObject(ctx.world.source)) {
    if (!isUnit(ctx.world.target)) {
      return skip('CAST_SPELL from GO requires Unit target', cite);
    }
    ctx.world.casts.push({ spellId, castFlags, sourceIsGo: true });
    return {
      intents: [
        {
          kind: 'cast_spell',
          spellId,
          castFlags,
          sourceIsGo: true,
          targetCleared,
          cite,
        },
      ],
    };
  }

  if (!isUnit(ctx.world.source)) {
    return skip('CAST_SPELL requires Unit source', cite);
  }

  ctx.world.casts.push({ spellId, castFlags, sourceIsGo: false });
  return {
    intents: [
      {
        kind: 'cast_spell',
        spellId,
        castFlags,
        sourceIsGo: false,
        targetCleared,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_SET_ACTIVEOBJECT (21) ─────────────────────────────────────
// Cite: ScriptMgr.cpp:2367–2376

export const handleSetActiveObject: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2367–2376';
  const source = ctx.world.source;
  if (!source || source.kind === 'none') {
    return skip('SET_ACTIVEOBJECT requires source', cite);
  }
  if (isPlayer(source)) {
    return skip('SET_ACTIVEOBJECT call for player', cite);
  }

  const active = (row.datalong | 0) !== 0;
  source.active = active;
  return {
    intents: [{ kind: 'set_active_object', active, cite }],
  };
};

// ── SCRIPT_COMMAND_MODIFY_NPC_FLAGS (29) ───────────────────────────────────── Cite:
// ScriptMgr.cpp:2514–2536 change_flag: 0=remove, 1=add, 2=toggle (cpp body; header comment is inverted)

export const handleModifyNpcFlags: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2514–2536';
  if (!isCreature(ctx.world.source)) {
    return skip('MODIFY_NPC_FLAGS requires Creature source', cite);
  }

  const flag = row.datalong | 0;
  const changeFlag = row.datalong2 | 0;
  let flags = ctx.world.source.npcFlags ?? 0;
  let mode: 'remove' | 'add' | 'toggle';

  if (changeFlag === NPC_FLAG_CHANGE_REMOVE) {
    // Cite: ScriptMgr.cpp:2519–2520 RemoveFlag
    mode = 'remove';
    flags = flags & ~flag;
  } else if (changeFlag === NPC_FLAG_CHANGE_ADD) {
    // Cite: ScriptMgr.cpp:2522–2524 SetFlag
    mode = 'add';
    flags = flags | flag;
  } else if (changeFlag === NPC_FLAG_CHANGE_TOGGLE) {
    // Cite: ScriptMgr.cpp:2526–2531 HasFlag → RemoveFlag else SetFlag
    // Object::HasFlag is (value & flag) != 0.
    mode = 'toggle';
    if ((flags & flag) !== 0) flags = flags & ~flag;
    else flags = flags | flag;
  } else {
    return skip(`MODIFY_NPC_FLAGS unexpected change_flag ${changeFlag}`, cite);
  }

  ctx.world.source.npcFlags = flags;
  return {
    intents: [
      {
        kind: 'modify_npc_flags',
        flag,
        changeFlag,
        mode,
        resultFlags: flags,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_DESPAWN_GO (40) ───────────────────────────────────────────
// Cite: ScriptMgr.cpp:2864–2871

export const handleDespawnGo: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2864–2871';
  if (!isGameObject(ctx.world.target)) {
    return skip('DESPAWN_GO requires GameObject target', cite);
  }

  const despawnDelay = row.datalong | 0;
  const t = ctx.world.target!;
  if (despawnDelay === 0) t.spawned = false;
  ctx.world.goDespawns.push({
    despawnDelay,
    dbGuid: t.dbGuid,
    entry: t.entry,
  });
  return {
    intents: [{ kind: 'despawn_go', despawnDelay, cite }],
  };
};

// ── SCRIPT_COMMAND_QUEST_EXPLORED (7) ────────────────────────────────────────
// Cite: ScriptMgr.cpp:1913–1945

function playerFromSourceOrTarget(ctx: DbScriptContext): ScriptActor | null {
  // Cite: GetPlayerTargetOrSourceAndLog — target player first, else source.
  if (isPlayer(ctx.world.target)) return ctx.world.target;
  if (isPlayer(ctx.world.source)) return ctx.world.source;
  return null;
}

function creatureOrGoFromSourceOrTarget(ctx: DbScriptContext): ScriptActor | null {
  const s = ctx.world.source;
  const t = ctx.world.target;
  if (s && (isCreature(s) || isGameObject(s))) return s;
  if (t && (isCreature(t) || isGameObject(t))) return t;
  return null;
}

function distActors(a: ScriptActor, b: ScriptActor): number {
  return dist3d(a, b.x ?? 0, b.y ?? 0, b.z ?? 0);
}

export const handleQuestExplored: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1913–1945';
  const pPlayer = playerFromSourceOrTarget(ctx);
  if (!pPlayer) {
    return skip('QUEST_EXPLORED requires Player source or target', cite);
  }

  const questId = row.datalong | 0;
  const distance = row.datalong2 | 0;
  const pWorldObject = creatureOrGoFromSourceOrTarget(ctx);

  // if we have a distance, we must have a worldobject. Cite: ScriptMgr.cpp:1926–1929
  if (distance !== 0 && !pWorldObject) {
    return skip('QUEST_EXPLORED distance set but no creature/GO worldobject', cite);
  }

  let failQuest = false;
  // Creature must be alive for giving credit. Cite: ScriptMgr.cpp:1933–1935
  if (pWorldObject && isCreature(pWorldObject) && pWorldObject.alive === false) {
    failQuest = true;
  } else if (
    distance !== 0 &&
    pWorldObject &&
    distActors(pWorldObject, pPlayer) > distance
  ) {
    // Cite: ScriptMgr.cpp:1936–1937 IsWithinDistInMap
    failQuest = true;
  }

  ctx.world.exploreCredits.push({ questId, failed: failQuest });
  if (failQuest) {
    ctx.world.failedQuests.push(questId);
  }
  return {
    intents: [
      {
        kind: 'quest_explored',
        questId,
        distance,
        failed: failQuest,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_KILL_CREDIT (8) ───────────────────────────────────────────
// Cite: ScriptMgr.cpp:1947–1978; ScriptMgr.h:49 datalong=entry (0=source/target), datalong2=group.

export const handleKillCredit: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:1947–1978';
  const pPlayer = playerFromSourceOrTarget(ctx);
  if (!pPlayer) {
    return skip('KILL_CREDIT requires Player source or target', cite);
  }

  let creatureEntry = row.datalong | 0;
  const isGroupCredit = (row.datalong2 | 0) !== 0;
  if (!creatureEntry) {
    const src = ctx.world.source;
    const tgt = ctx.world.target;
    const srcEntry = src.entry ?? 0;
    const tgtEntry = tgt?.entry ?? 0;
    if (isCreature(src) && srcEntry > 0) creatureEntry = srcEntry;
    else if (isCreature(tgt) && tgtEntry > 0) creatureEntry = tgtEntry;
    else {
      return skip('KILL_CREDIT dynamic credit without creature partner', cite);
    }
  }

  ctx.world.killCredits.push({ creatureEntry, isGroupCredit });
  return {
    intents: [{ kind: 'kill_credit', creatureEntry, isGroupCredit, cite }],
  };
};

// ── SCRIPT_COMMAND_DESPAWN_SELF (18) ─────────────────────────────────────────
// Cite: ScriptMgr.cpp:2237–2250. Despawn applies to the TARGET; the legacy swap uses source.

export const handleDespawnSelf: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2237–2250';
  let target = ctx.world.target;
  const source = ctx.world.source;

  // Cite: ScriptMgr.cpp:2239–2243 legacy swap
  if (target && !isCreature(target) && isCreature(source)) {
    target = source;
  }

  if (!isCreature(target)) {
    return skip('DESPAWN_SELF requires Creature target', cite);
  }

  const despawnDelay = row.datalong | 0;
  if (despawnDelay === 0) {
    target.spawned = false;
    target.alive = false;
  }
  ctx.world.selfDespawns.push({
    despawnDelay,
    entry: target.entry,
    dbGuid: target.dbGuid,
  });
  return {
    intents: [{ kind: 'despawn_self', despawnDelay, cite }],
  };
};

// ── SCRIPT_COMMAND_MOVEMENT (20) ─────────────────────────────────────────────
// Cite: ScriptMgr.cpp:2256–2365

export const handleMovement: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2256–2365';
  if (!isCreature(ctx.world.source)) {
    return skip('MOVEMENT requires Creature source', cite);
  }

  const source = ctx.world.source;
  if (source.inCombat) {
    // Cite: ScriptMgr.cpp:2266–2269 skip when in combat
    return {
      intents: [
        {
          kind: 'movement',
          movementType: row.datalong | 0,
          wanderORpathId: row.datalong2 | 0,
          timerOrPassTarget: (row.datalong3 ?? 0) | 0,
          forcedMovement: (row.dataint ?? 0) | 0,
          movementFlags: (row.dataint2 ?? 0) | 0,
          skippedCombat: true,
          cite,
        },
      ],
    };
  }

  if (source.inFormation && source.isFormationMaster === false) {
    // Cite: ScriptMgr.cpp:2284–2290 formation non-master skips
    return {
      intents: [
        {
          kind: 'movement',
          movementType: row.datalong | 0,
          wanderORpathId: row.datalong2 | 0,
          timerOrPassTarget: (row.datalong3 ?? 0) | 0,
          forcedMovement: (row.dataint ?? 0) | 0,
          movementFlags: (row.dataint2 ?? 0) | 0,
          skippedFormation: true,
          cite,
        },
      ],
    };
  }

  const movementType = row.datalong | 0;
  const wanderORpathId = row.datalong2 | 0;
  const timerOrPassTarget = (row.datalong3 ?? 0) | 0;
  const forcedMovement = (row.dataint ?? 0) | 0; // textId[0]
  const movementFlags = (row.dataint2 ?? 0) | 0; // textId[1]
  const pTarget = ctx.world.target;

  // WAYPOINT / PATH need target when pass-target bit set. Cite: ScriptMgr.cpp:2295–2306
  if (
    (movementType === WAYPOINT_MOTION_TYPE || movementType === PATH_MOTION_TYPE) &&
    !pTarget &&
    (timerOrPassTarget & 0x1) !== 0
  ) {
    return skip('MOVEMENT pass-target set but target null', cite);
  }

  // Apply motion-type side effects to actor snapshot.
  // Cite: ScriptMgr.cpp:2309–2363 switch
  switch (movementType) {
    case IDLE_MOTION_TYPE:
      source.movementType = IDLE_MOTION_TYPE;
      break;
    case RANDOM_MOTION_TYPE: {
      // COMMAND_ADDITIONAL → random around current pos; else respawn + wander.
      // Cite: ScriptMgr.cpp:2324–2334
      if (!(dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL)) {
        if (source.respawnX != null) source.x = source.respawnX;
        if (source.respawnY != null) source.y = source.respawnY;
        if (source.respawnZ != null) source.z = source.respawnZ;
      }
      source.movementType = RANDOM_MOTION_TYPE;
      break;
    }
    case WAYPOINT_MOTION_TYPE:
      source.movementType = WAYPOINT_MOTION_TYPE;
      break;
    case PATH_MOTION_TYPE:
      source.movementType = PATH_MOTION_TYPE;
      break;
    case LINEAR_WP_MOTION_TYPE:
      source.movementType = LINEAR_WP_MOTION_TYPE;
      break;
    case FALL_MOTION_TYPE:
      source.movementType = FALL_MOTION_TYPE;
      break;
    default:
      // Unknown / unlisted type still records intent (load-time may reject).
      source.movementType = movementType;
      break;
  }

  const rec = {
    movementType,
    wanderORpathId,
    timerOrPassTarget,
    forcedMovement,
    movementFlags,
  };
  ctx.world.movements.push(rec);
  return {
    intents: [{ kind: 'movement', ...rec, cite }],
  };
};

// ── SCRIPT_COMMAND_SET_FACTION (22) ──────────────────────────────────────────
// Cite: ScriptMgr.cpp:2378–2388

export const handleSetFaction: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2378–2388';
  if (!isCreature(ctx.world.source)) {
    return skip('SET_FACTION requires Creature source', cite);
  }

  const factionId = row.datalong | 0;
  const flags = row.datalong2 | 0;
  if (factionId) {
    // Cite: ScriptMgr.cpp:2383–2384 SetFactionTemporary
    ctx.world.source.factionId = factionId;
    ctx.world.source.factionFlags = flags;
    return {
      intents: [
        {
          kind: 'set_faction',
          factionId,
          flags,
          cleared: false,
          cite,
        },
      ],
    };
  }

  // Cite: ScriptMgr.cpp:2385–2386 ClearTemporaryFaction
  ctx.world.source.factionId = 0;
  ctx.world.source.factionFlags = 0;
  return {
    intents: [
      {
        kind: 'set_faction',
        factionId: 0,
        flags: 0,
        cleared: true,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_SET_RUN (25) ────────────────────────────────────────────── Cite:
// ScriptMgr.cpp:2439–2456 Only flips when current walk state differs from desired run flag.

export const handleSetRun: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2439–2456';
  if (!isCreature(ctx.world.source)) {
    return skip('SET_RUN requires Creature source', cite);
  }

  const run = (row.datalong | 0) !== 0;
  const creature = ctx.world.source;
  // Default walking=true when unset (spawn walk). IsWalking() path.
  const isWalking = creature.walking !== false;
  let changed = false;

  if (isWalking) {
    // Cite: ScriptMgr.cpp:2445–2448 if walking and run requested → SetWalk(false)
    if (run) {
      creature.walking = false;
      changed = true;
    }
  } else {
    // Cite: ScriptMgr.cpp:2450–2453 if running and !run → SetWalk(true)
    if (!run) {
      creature.walking = true;
      changed = true;
    }
  }

  return {
    intents: [
      {
        kind: 'set_run',
        run,
        walking: creature.walking !== false,
        changed,
        cite,
      },
    ],
  };
};

// ── SCRIPT_COMMAND_GO_LOCK_STATE (27) ────────────────────────────────────────
// Cite: ScriptMgr.cpp:2478–2503

export const handleGoLockState: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2478–2503';
  if (!isGameObject(ctx.world.source)) {
    return skip('GO_LOCK_STATE requires GameObject source', cite);
  }

  const lockState = row.datalong | 0;
  let goFlags = ctx.world.source.goFlags ?? 0;

  // Lock or Unlock. Cite: ScriptMgr.cpp:2493–2496
  if (lockState & GO_LOCK_STATE_LOCK) {
    goFlags = goFlags | GO_FLAG_LOCKED;
  } else if (lockState & GO_LOCK_STATE_UNLOCK) {
    goFlags = goFlags & ~GO_FLAG_LOCKED;
  }
  // Non-interact or interact. Cite: ScriptMgr.cpp:2498–2501
  if (lockState & GO_LOCK_STATE_NON_INTERACT) {
    goFlags = goFlags | GO_FLAG_NO_INTERACT;
  } else if (lockState & GO_LOCK_STATE_INTERACT) {
    goFlags = goFlags & ~GO_FLAG_NO_INTERACT;
  }

  ctx.world.source.goFlags = goFlags;
  return {
    intents: [{ kind: 'go_lock_state', lockState, goFlags, cite }],
  };
};

// ── SCRIPT_COMMAND_STAND_STATE (28) ──────────────────────────────────────────
// Cite: ScriptMgr.cpp:2505–2512

export const handleStandState: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2505–2512';
  if (!isCreature(ctx.world.source)) {
    return skip('STAND_STATE requires Creature source', cite);
  }

  const standState = row.datalong | 0;
  ctx.world.source.standState = standState;
  return {
    intents: [{ kind: 'stand_state', standState, cite }],
  };
};

// ── SCRIPT_COMMAND_TERMINATE_SCRIPT (31) ─────────────────────────────────────
// Cite: ScriptMgr.cpp:2548–2682. Terminate when the buddy is NOT found; COMMAND_ADDITIONAL inverts.

function isCreatureBuddyRow(row: DbScriptRow, ctx: DbScriptContext): boolean {
  if (ctx.isCreatureBuddy != null) return ctx.isCreatureBuddy;
  // Cite: ScriptMgr.h:549–571 — BUDDY_BY_GO forces GO; GO-only commands too.
  if ((dataFlags(row) & SCRIPT_FLAG_BUDDY_BY_GO) !== 0) return false;
  return true;
}

export const handleTerminateScript: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2548–2682';
  const source = ctx.world.source;
  const target = ctx.world.target;
  const flags = dataFlags(row);
  const npcOrGOEntry = row.datalong | 0;
  const searchDist = row.datalong2 | 0;
  const poolId = (row.datalong3 ?? 0) | 0;
  const waypointPauseMs = (row.dataint ?? 0) | 0; // textId[0]

  // Cite: ScriptMgr.cpp:2550–2554 null source/target (unless BUDDY_BY_GUID)
  if (
    (!source || source.kind === 'none') &&
    !target &&
    (flags & SCRIPT_FLAG_BUDDY_BY_GUID) === 0
  ) {
    return {
      intents: [
        {
          kind: 'terminate_script',
          terminated: true,
          terminationBuddyFound: false,
          npcOrGOEntry,
          poolId,
          searchDist,
          waypointPauseMs: 0,
          cite,
        },
      ],
      terminateScript: true,
    };
  }

  let terminationBuddyFound = false;

  if (npcOrGOEntry || poolId || (flags & SCRIPT_FLAG_BUDDY_BY_GUID) !== 0) {
    // Cite: ScriptMgr.cpp:2558–2648 search path
    let pSearcher: ScriptActor | null = source?.kind !== 'none' ? source : target;
    if (!pSearcher) {
      // Cite: ScriptMgr.cpp:2562–2566 no searcher → return false (do not terminate)
      return {
        intents: [
          {
            kind: 'terminate_script',
            terminated: false,
            terminationBuddyFound: false,
            npcOrGOEntry,
            poolId,
            searchDist,
            waypointPauseMs: 0,
            cite,
          },
        ],
      };
    }
    // Cite: ScriptMgr.cpp:2568–2569 player searcher prefers non-player target
    if (isPlayer(pSearcher) && target && !isPlayer(target)) {
      pSearcher = target;
    }

    let terminationBuddy: ScriptActor | null = null;

    if (flags & SCRIPT_FLAG_BUDDY_BY_GUID) {
      // Cite: ScriptMgr.cpp:2571–2582 guid match on target
      const guid = (row.searchRadius ?? 0) | 0; // search_radius holds guid under BUDDY_BY_GUID
      if (isCreatureBuddyRow(row, ctx)) {
        if (target && isUnit(target) && ((target.dbGuid ?? 0) | 0) === guid) {
          terminationBuddy = target;
        }
      } else if (target && isGameObject(target) && ((target.dbGuid ?? 0) | 0) === guid) {
        terminationBuddy = target;
      }
    } else if (npcOrGOEntry) {
      if (isCreatureBuddyRow(row, ctx)) {
        terminationBuddy =
          ctx.findNearestCreatureAlive?.(npcOrGOEntry, searchDist, pSearcher) ?? null;
      } else {
        terminationBuddy =
          ctx.findNearestGameObject?.(npcOrGOEntry, searchDist, pSearcher) ?? null;
      }
    } else if (poolId) {
      terminationBuddy =
        ctx.findPoolCreatureAlive?.(poolId, searchDist, pSearcher) ?? null;
    }

    terminationBuddyFound = terminationBuddy != null;
  } else {
    // Cite: ScriptMgr.cpp:2650–2651 use step buddyFound
    terminationBuddyFound = ctx.buddyFound === true;
  }

  let result = false;
  if ((flags & SCRIPT_FLAG_COMMAND_ADDITIONAL) === 0 && !terminationBuddyFound) {
    // Cite: ScriptMgr.cpp:2653–2659 terminate when NOT found
    result = true;
  } else if ((flags & SCRIPT_FLAG_COMMAND_ADDITIONAL) !== 0 && terminationBuddyFound) {
    // Cite: ScriptMgr.cpp:2661–2667 terminate when found
    result = true;
  }

  // Waypoint pause on terminate. Cite: ScriptMgr.cpp:2670–2677
  if (result && waypointPauseMs && isCreature(source)) {
    // Recorded via intent; host MotionMaster applies AddToWaypointPauseTime.
  }

  return {
    intents: [
      {
        kind: 'terminate_script',
        terminated: result,
        terminationBuddyFound,
        npcOrGOEntry,
        poolId,
        searchDist,
        waypointPauseMs: result ? waypointPauseMs : 0,
        cite,
      },
    ],
    terminateScript: result,
  };
};

// ── SCRIPT_COMMAND_TERMINATE_COND (34) ───────────────────────────────────────
// Cite: ScriptMgr.cpp:2699–2736. Terminate when satisfied; ADDITIONAL inverts. failQuest fails it.

export const handleTerminateCond: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2699–2736';
  const conditionId = row.datalong | 0;
  const failQuest = row.datalong2 | 0;
  const inverted = (dataFlags(row) & SCRIPT_FLAG_COMMAND_ADDITIONAL) !== 0;

  // Player from target first, else source. Cite: ScriptMgr.cpp:2703–2711
  let player: ScriptActor | null = null;
  let second: ScriptActor | null = ctx.world.source;
  if (isPlayer(ctx.world.target)) {
    player = ctx.world.target;
  } else if (isPlayer(ctx.world.source)) {
    player = ctx.world.source;
    second = ctx.world.target;
  }

  const conditionSatisfied =
    ctx.evaluateCondition?.(conditionId, player, second) ?? false;

  // Cite: ScriptMgr.cpp:2714–2717
  const terminateResult = inverted ? !conditionSatisfied : conditionSatisfied;

  if (terminateResult && failQuest && player) {
    // Cite: ScriptMgr.cpp:2719–2734 group fail → solo FailQuest for zone model
    ctx.world.failedQuests.push(failQuest);
  }

  return {
    intents: [
      {
        kind: 'terminate_cond',
        terminated: terminateResult,
        conditionId,
        failQuest,
        conditionSatisfied,
        inverted,
        cite,
      },
    ],
    terminateScript: terminateResult,
  };
};

// ── SCRIPT_COMMAND_SET_FACING (36) ───────────────────────────────────────────
// Cite: ScriptMgr.cpp:2757–2776

export const handleSetFacing: OpcodeHandler = (row, ctx) => {
  const cite = 'ScriptMgr.cpp:2757–2776';
  if (!isCreature(ctx.world.source)) {
    return skip('SET_FACING requires Creature source', cite);
  }
  if (!ctx.world.target) {
    return skip('SET_FACING requires target', cite);
  }

  const source = ctx.world.source;
  const target = ctx.world.target;
  const resetFacing = (row.datalong | 0) !== 0;
  let orientation: number;

  if (resetFacing) {
    // Cite: ScriptMgr.cpp:2767–2772 motion reset or respawn coord
    if (source.motionResetO != null) {
      orientation = source.motionResetO;
    } else if (source.respawnO != null) {
      orientation = source.respawnO;
    } else {
      orientation = source.o ?? 0;
    }
    source.o = orientation;
  } else {
    // SetFacingToObject — face target position. Cite: ScriptMgr.cpp:2775
    const sx = source.x ?? 0;
    const sy = source.y ?? 0;
    const tx = target.x ?? 0;
    const ty = target.y ?? 0;
    orientation = detAtan2(ty - sy, tx - sx);
    source.o = orientation;
  }

  return {
    intents: [{ kind: 'set_facing', resetFacing, orientation, cite }],
  };
};

// Dispatch table — next-batch.mjs parses keys as SCRIPT_COMMAND_* or numeric. Batch bodies live
// in handlersBatch.ts for the filesize gate.
export const OPCODE_HANDLERS: Readonly<Record<number, OpcodeHandler>> = {
  [SCRIPT_COMMAND_TALK]: handleTalk,
  [SCRIPT_COMMAND_EMOTE]: handleEmote,
  [SCRIPT_COMMAND_FIELD_SET]: handleFieldSet,
  [SCRIPT_COMMAND_MOVE_TO]: handleMoveTo,
  [SCRIPT_COMMAND_FLAG_SET]: handleFlagSet,
  [SCRIPT_COMMAND_FLAG_REMOVE]: handleFlagRemove,
  [SCRIPT_COMMAND_TELEPORT_TO]: handleTeleportTo,
  [SCRIPT_COMMAND_QUEST_EXPLORED]: handleQuestExplored,
  [SCRIPT_COMMAND_KILL_CREDIT]: handleKillCredit,
  [SCRIPT_COMMAND_RESPAWN_GAMEOBJECT]: handleRespawnGameObject,
  [SCRIPT_COMMAND_TEMP_SPAWN_CREATURE]: handleTempSpawnCreature,
  [SCRIPT_COMMAND_OPEN_DOOR]: handleOpenDoor,
  [SCRIPT_COMMAND_CLOSE_DOOR]: handleCloseDoor,
  [SCRIPT_COMMAND_ACTIVATE_OBJECT]: handleActivateObject,
  [SCRIPT_COMMAND_REMOVE_AURA]: handleRemoveAura,
  [SCRIPT_COMMAND_CAST_SPELL]: handleCastSpell,
  [SCRIPT_COMMAND_CREATE_ITEM]: handleCreateItem,
  [SCRIPT_COMMAND_PLAY_SOUND]: handlePlaySound,
  [SCRIPT_COMMAND_DESPAWN_SELF]: handleDespawnSelf,
  [SCRIPT_COMMAND_MOVEMENT]: handleMovement,
  [SCRIPT_COMMAND_SET_ACTIVEOBJECT]: handleSetActiveObject,
  [SCRIPT_COMMAND_SET_FACTION]: handleSetFaction,
  [SCRIPT_COMMAND_MORPH_TO_ENTRY_OR_MODEL]: handleMorphToEntryOrModel,
  [SCRIPT_COMMAND_MOUNT_TO_ENTRY_OR_MODEL]: handleMountToEntryOrModel,
  [SCRIPT_COMMAND_SET_RUN]: handleSetRun,
  [SCRIPT_COMMAND_ATTACK_START]: handleAttackStart,
  [SCRIPT_COMMAND_GO_LOCK_STATE]: handleGoLockState,
  [SCRIPT_COMMAND_STAND_STATE]: handleStandState,
  [SCRIPT_COMMAND_MODIFY_NPC_FLAGS]: handleModifyNpcFlags,
  [SCRIPT_COMMAND_TERMINATE_SCRIPT]: handleTerminateScript,
  [SCRIPT_COMMAND_PAUSE_WAYPOINTS]: handlePauseWaypoints,
  [SCRIPT_COMMAND_TERMINATE_COND]: handleTerminateCond,
  [SCRIPT_COMMAND_SEND_AI_EVENT]: handleSendAiEvent,
  [SCRIPT_COMMAND_SET_FACING]: handleSetFacing,
  [SCRIPT_COMMAND_MOVE_DYNAMIC]: handleMoveDynamic,
  [SCRIPT_COMMAND_SEND_MAIL]: handleSendMail,
  [SCRIPT_COMMAND_DESPAWN_GO]: handleDespawnGo,
  [SCRIPT_COMMAND_SET_EQUIPMENT_SLOTS]: handleSetEquipmentSlots,
  [SCRIPT_COMMAND_RESET_GO]: handleResetGo,
  [SCRIPT_COMMAND_UPDATE_TEMPLATE]: handleUpdateTemplate,
  [SCRIPT_COMMAND_START_RELAY_SCRIPT]: handleStartRelayScript,
  [SCRIPT_COMMAND_INTERRUPT_SPELL]: handleInterruptSpell,
  [SCRIPT_COMMAND_MODIFY_UNIT_FLAGS]: handleModifyUnitFlags,
  [SCRIPT_COMMAND_SET_GOSSIP_MENU]: handleSetGossipMenu,
  [SCRIPT_COMMAND_SET_WORLDSTATE]: handleSetWorldstate,
  [SCRIPT_COMMAND_MEETINGSTONE]: handleMeetingStone,
  [SCRIPT_COMMAND_SET_SHEATHE]: handleSetSheathe,
  [SCRIPT_COMMAND_SET_HOVER]: handleSetHover,
  [SCRIPT_COMMAND_SPAWN_GROUP]: handleSpawnGroup,
};

export function getOpcodeHandler(command: number): OpcodeHandler | undefined {
  return OPCODE_HANDLERS[command];
}
