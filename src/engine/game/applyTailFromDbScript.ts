// Tail host: worldstate, mail, sound, teleport, field, flag, equipment, interrupt and unit flags, plus
// the relay-script recurse. Cite: ScriptMgr.cpp:3264-3267, :2828-2843, :2182-2218, :1815-1828.

import type { DbScriptRow } from '../../data/schema.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import {
  createEmptyWorld,
  type DbScriptContext,
  type ScriptActor,
  type ScriptWorldState,
} from '../../domain/quests/interpreter/dbscript/types.ts';
import { executeDbScripts } from '../../domain/quests/interpreter/dbscript/vm.ts';
import { applyWorldStateWrites } from './worldState.ts';
import {
  applyFailedQuests,
  collectFailedQuestIds,
} from './applyTerminateFromDbScript.ts';
import { applyActiveObjectFromDbScript } from './applyActiveObjectFromDbScript.ts';
import { applyEscortFromDbScript } from './applyEscortFromDbScript.ts';
import { applyHoverFromDbScript } from './applyHoverFromDbScript.ts';
import { applyDoorAndGoBags } from './applyDoorFromDbScript.ts';

/** Ratchet kinds — product host must name these outside interpreter/dbscript/. */
const SET_WORLDSTATE = 'set_worldstate';
const SEND_MAIL = 'send_mail';
const PLAY_SOUND = 'play_sound';
const FIELD_SET = 'field_set';
const FLAG_SET = 'flag_set';
const FLAG_REMOVE = 'flag_remove';
const TELEPORT_TO = 'teleport_to';
const SET_EQUIPMENT_SLOTS = 'set_equipment_slots';
const INTERRUPT_SPELL = 'interrupt_spell';
const MODIFY_UNIT_FLAGS = 'modify_unit_flags';
const START_RELAY_SCRIPT = 'start_relay_script';

const MAX_RELAY_DEPTH = 4;

export type TailIntent = {
  kind: string;
  worldstateId?: number;
  value?: number;
  mailTemplateId?: number;
  deliverDelay?: number;
  soundId?: number;
  fieldId?: number;
  fieldValue?: number;
  resultValue?: number;
  mapId?: number;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  resetDefault?: boolean;
  mainHand?: number;
  offHand?: number;
  ranged?: number;
  currentSpellType?: number;
  interruptedSpellId?: number;
  flag?: number;
  changeFlag?: number;
  mode?: string;
  resultFlags?: number;
  chosenId?: number;
  relayId?: number;
  templateId?: number;
};

export type TailSource = {
  kind?: string;
  entry?: number;
  dbGuid?: number;
  fields?: Record<number, number>;
  unitFlags?: number;
  virtualItems?: [number, number, number];
  currentSpells?: Array<{ spellType: number; spellId: number }>;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  mapId?: number;
  hovering?: boolean;
};

export type TailBody = {
  entry?: number;
  dbGuid?: number;
  guid?: number;
  fields?: Record<number, number>;
  unitFlags?: number;
  virtualItems?: [number, number, number];
  currentSpells?: Array<{ spellType: number; spellId: number }>;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  mapId?: number;
  kind?: string;
};

export type TailWorldBag = {
  source?: TailSource | null;
  target?: TailSource | null;
  worldStates?: Record<number, number>;
  mails?: Array<{ mailTemplateId: number; deliverDelay: number; altSender?: number; money?: number }>;
  sounds?: Array<{ soundId: number }>;
  teleports?: Array<{ mapId: number; x: number; y: number; z: number; o: number }>;
  fieldSets?: Array<{ fieldId: number; fieldValue: number }>;
  flagSets?: Array<{ fieldId: number; fieldValue: number; resultValue: number }>;
  flagRemoves?: Array<{ fieldId: number; fieldValue: number; resultValue: number }>;
  equipmentChanges?: Array<{ resetDefault: boolean; slots: [number, number, number] }>;
  spellInterrupts?: Array<{ currentSpellType: number; interruptedSpellId: number }>;
  unitFlagChanges?: Array<{
    flag: number;
    changeFlag: number;
    mode: 'remove' | 'add' | 'toggle';
    resultFlags: number;
  }>;
  relayScripts?: Array<{ relayId: number; templateId: number; chosenId: number }>;
};

export type TailApplyOpts = {
  source?: TailSource | null;
  bodies?: Array<TailBody | null | undefined> | null;
  /** Player actor for TELEPORT_TO coords only — no zone/map invent. */
  player?: TailBody | null;
  worldStates?: Record<number, number>;
  log?: (msg: string) => void;
  relayScripts?: (id: number) => readonly DbScriptRow[];
  questlog?: QuestLog;
  goRuntime?: Record<string, GoRuntimeState>;
  goRuntimeKey?: (entry: number) => string;
  evaluateCondition?: DbScriptContext['evaluateCondition'];
  lookupGameObjectByGuid?: DbScriptContext['lookupGameObjectByGuid'];
  depth?: number;
  /** SEND_MAIL — host appends a real MailMessage (loot from mail:${id}). */
  onMail?: (rec: { mailTemplateId: number; deliverDelay: number; altSender?: number; money?: number }) => void;
};

export type TailApplyResult = {
  questlog?: QuestLog;
  goRuntime?: Record<string, GoRuntimeState>;
};

function matchesBody(
  body: TailBody,
  entry?: number,
  dbGuid?: number,
): boolean {
  const byEntry = entry != null && body.entry === entry;
  const byGuid =
    dbGuid != null && (body.dbGuid === dbGuid || body.guid === dbGuid);
  return byEntry || byGuid;
}

function stampFields(
  target: TailSource | TailBody,
  fieldId: number,
  value: number,
): void {
  if (!target.fields) target.fields = {};
  target.fields[fieldId] = value >>> 0;
}

function isPlayerLike(a: TailSource | TailBody | null | undefined): boolean {
  return a?.kind === 'player';
}

// Apply tail bags + run START_RELAY_SCRIPT streams (depth-capped). Cite: ScriptMgr.cpp:2938–2948
// ScriptsStart(SCRIPT_TYPE_RELAY, chosenId).
export function applyTailFromDbScript(
  world: TailWorldBag | ScriptWorldState | undefined,
  intents?: readonly TailIntent[],
  opts?: TailApplyOpts,
): TailApplyResult {
  const source = opts?.source ?? world?.source ?? null;
  const entry = source?.entry;
  const dbGuid = source?.dbGuid;
  const log = opts?.log;
  let questlog = opts?.questlog;
  let goRuntime = opts?.goRuntime;
  const depth = opts?.depth ?? 0;

  // SET_WORLDSTATE — Cite: ScriptMgr.cpp:3264–3267.
  if (opts?.worldStates && world && 'worldStates' in world && world.worldStates) {
    applyWorldStateWrites(opts.worldStates, world.worldStates);
  }
  for (const i of (intents ?? []).filter((x) => x.kind === SET_WORLDSTATE)) {
    if (opts?.worldStates && i.worldstateId != null && i.value != null) {
      applyWorldStateWrites(opts.worldStates, { [i.worldstateId]: i.value });
    }
  }

  // SEND_MAIL — Cite: ScriptMgr.cpp:2828–2843 (template only; no invented items).
  const mailBag = world && 'mails' in world ? world.mails ?? [] : [];
  const mailRecs = mailBag.length
    ? mailBag
    : (intents ?? [])
      .filter((x) => x.kind === SEND_MAIL)
      .map((i) => ({
        mailTemplateId: i.mailTemplateId ?? 0,
        deliverDelay: i.deliverDelay ?? 0,
        altSender: undefined as number | undefined,
        money: undefined as number | undefined,
      }));
  for (const m of mailRecs) {
    if (m.mailTemplateId <= 0) continue;
    opts?.onMail?.(m);
    log?.(
      m.deliverDelay > 0
        ? `Mail reward scheduled (template ${m.mailTemplateId}, delay ${m.deliverDelay}s).`
        : `Mail reward sent (template ${m.mailTemplateId}).`,
    );
  }

  // PLAY_SOUND — Cite: ScriptMgr.cpp:2182–2218 (sound id only; no invented filename).
  const soundBag = world && 'sounds' in world ? world.sounds ?? [] : [];
  if (soundBag.length) {
    for (const s of soundBag) {
      if (s.soundId > 0) log?.(`Sound ${s.soundId} plays.`);
    }
  } else {
    for (const i of (intents ?? []).filter((x) => x.kind === PLAY_SOUND)) {
      const id = i.soundId ?? 0;
      if (id > 0) log?.(`Sound ${id} plays.`);
    }
  }

  // TELEPORT_TO — stamp player coords only; do not invent a zone change.
  // Cite: ScriptMgr.cpp:1904–1911.
  const teleportBag = world && 'teleports' in world ? world.teleports ?? [] : [];
  const teleports = teleportBag.length
    ? teleportBag
    : (intents ?? [])
      .filter((x) => x.kind === TELEPORT_TO)
      .map((i) => ({
        mapId: i.mapId ?? 0,
        x: i.x ?? 0,
        y: i.y ?? 0,
        z: i.z ?? 0,
        o: i.o ?? 0,
      }));
  for (const tp of teleports) {
    const players: Array<TailSource | TailBody> = [];
    if (isPlayerLike(opts?.player)) players.push(opts!.player!);
    if (isPlayerLike(source)) players.push(source!);
    if (world && 'target' in world && isPlayerLike(world.target)) players.push(world.target!);
    for (const p of players) {
      if (!('x' in p) && !('y' in p) && !('z' in p)) continue;
      p.x = tp.x;
      p.y = tp.y;
      p.z = tp.z;
      if (tp.o) p.o = tp.o;
    }
  }

  // FIELD_SET — Cite: ScriptMgr.cpp:1815–1828 SetUInt32Value.
  const fieldBag = world && 'fieldSets' in world ? world.fieldSets ?? [] : [];
  const fields = fieldBag.length
    ? fieldBag
    : (intents ?? [])
      .filter((x) => x.kind === FIELD_SET)
      .map((i) => ({ fieldId: i.fieldId ?? 0, fieldValue: i.fieldValue ?? 0 }));
  for (const f of fields) {
    if (source && source.kind !== 'player') stampFields(source, f.fieldId, f.fieldValue);
    for (const body of opts?.bodies ?? []) {
      if (!body || !matchesBody(body, entry, dbGuid)) continue;
      stampFields(body, f.fieldId, f.fieldValue);
    }
  }

  // FLAG_SET / FLAG_REMOVE — Cite: ScriptMgr.cpp:1876–1889 / :1890–1902.
  const flagSetBag = world && 'flagSets' in world ? world.flagSets ?? [] : [];
  const flagSets = flagSetBag.length
    ? flagSetBag
    : (intents ?? [])
      .filter((x) => x.kind === FLAG_SET)
      .map((i) => ({
        fieldId: i.fieldId ?? 0,
        fieldValue: i.fieldValue ?? 0,
        resultValue: i.resultValue ?? 0,
      }));
  for (const f of flagSets) {
    if (source && source.kind !== 'player') stampFields(source, f.fieldId, f.resultValue);
    for (const body of opts?.bodies ?? []) {
      if (!body || !matchesBody(body, entry, dbGuid)) continue;
      stampFields(body, f.fieldId, f.resultValue);
    }
  }
  const flagRmBag = world && 'flagRemoves' in world ? world.flagRemoves ?? [] : [];
  const flagRemoves = flagRmBag.length
    ? flagRmBag
    : (intents ?? [])
      .filter((x) => x.kind === FLAG_REMOVE)
      .map((i) => ({
        fieldId: i.fieldId ?? 0,
        fieldValue: i.fieldValue ?? 0,
        resultValue: i.resultValue ?? 0,
      }));
  for (const f of flagRemoves) {
    if (source && source.kind !== 'player') stampFields(source, f.fieldId, f.resultValue);
    for (const body of opts?.bodies ?? []) {
      if (!body || !matchesBody(body, entry, dbGuid)) continue;
      stampFields(body, f.fieldId, f.resultValue);
    }
  }

  // SET_EQUIPMENT_SLOTS — Cite: ScriptMgr.cpp:2881–2905.
  const equipBag = world && 'equipmentChanges' in world ? world.equipmentChanges ?? [] : [];
  const equips = equipBag.length
    ? equipBag.map((e) => e.slots)
    : (intents ?? [])
      .filter((x) => x.kind === SET_EQUIPMENT_SLOTS)
      .map((i) =>
        [i.mainHand ?? 0, i.offHand ?? 0, i.ranged ?? 0] as [number, number, number],
      );
  for (const slots of equips) {
    if (source && source.kind !== 'player') source.virtualItems = [...slots] as [number, number, number];
    for (const body of opts?.bodies ?? []) {
      if (!body || !matchesBody(body, entry, dbGuid)) continue;
      body.virtualItems = [...slots] as [number, number, number];
    }
  }

  // INTERRUPT_SPELL — Cite: ScriptMgr.cpp:2960–2968.
  const interruptBag = world && 'spellInterrupts' in world ? world.spellInterrupts ?? [] : [];
  const interrupts = interruptBag.length
    ? interruptBag
    : (intents ?? [])
      .filter((x) => x.kind === INTERRUPT_SPELL)
      .map((i) => ({
        currentSpellType: i.currentSpellType ?? 0,
        interruptedSpellId: i.interruptedSpellId ?? 0,
      }));
  for (const ir of interrupts) {
    const drop = (spells: Array<{ spellType: number; spellId: number }> | undefined) => {
      if (!spells) return spells;
      return spells.filter((s) => s.spellType !== ir.currentSpellType);
    };
    if (source) source.currentSpells = drop(source.currentSpells);
    for (const body of opts?.bodies ?? []) {
      if (!body || !matchesBody(body, entry, dbGuid)) continue;
      body.currentSpells = drop(body.currentSpells);
    }
  }

  // MODIFY_UNIT_FLAGS — Cite: ScriptMgr.cpp:2970–2992.
  const unitBag = world && 'unitFlagChanges' in world ? world.unitFlagChanges ?? [] : [];
  const unitFlags = unitBag.length
    ? unitBag.map((u) => u.resultFlags)
    : (intents ?? [])
      .filter((x) => x.kind === MODIFY_UNIT_FLAGS)
      .map((i) => i.resultFlags ?? 0);
  for (const flags of unitFlags) {
    if (source && source.kind !== 'player') source.unitFlags = flags >>> 0;
    for (const body of opts?.bodies ?? []) {
      if (!body || !matchesBody(body, entry, dbGuid)) continue;
      body.unitFlags = flags >>> 0;
    }
  }

  // START_RELAY_SCRIPT — run relay stream, apply hosts, recurse. Cite: ScriptMgr.cpp:2938–2948.
  const relayBag = world && 'relayScripts' in world ? world.relayScripts ?? [] : [];
  const relays = relayBag.length
    ? relayBag
    : (intents ?? [])
      .filter((x) => x.kind === START_RELAY_SCRIPT)
      .map((i) => ({
        relayId: i.relayId ?? 0,
        templateId: i.templateId ?? 0,
        chosenId: i.chosenId ?? 0,
      }));
  if (depth < MAX_RELAY_DEPTH && opts?.relayScripts) {
    for (const rel of relays) {
      const chosenId = rel.chosenId | 0;
      if (!chosenId) continue;
      const rows = opts.relayScripts(chosenId);
      if (!rows.length) continue;

      const relaySource: ScriptActor = {
        kind: (source?.kind as ScriptActor['kind']) ?? 'creature',
        entry: source?.entry,
        dbGuid: source?.dbGuid,
        fields: source?.fields ? { ...source.fields } : undefined,
        unitFlags: source?.unitFlags,
        virtualItems: source?.virtualItems
          ? ([...source.virtualItems] as [number, number, number])
          : undefined,
        currentSpells: source?.currentSpells ? [...source.currentSpells] : undefined,
        x: source?.x,
        y: source?.y,
        z: source?.z,
        o: source?.o,
        alive: true,
      };
      const relayTarget: ScriptActor = opts.player && isPlayerLike(opts.player)
        ? {
          kind: 'player',
          x: opts.player.x,
          y: opts.player.y,
          z: opts.player.z,
          o: opts.player.o,
          alive: true,
        }
        : { kind: 'player', alive: true };

      const nested = executeDbScripts(rows, {
        world: createEmptyWorld(relaySource, relayTarget),
        table: 'dbscripts_on_relay',
        phase: 'relay',
        evaluateCondition: opts.evaluateCondition,
        lookupGameObjectByGuid: opts.lookupGameObjectByGuid,
      });

      if (opts.worldStates && nested.world.worldStates) {
        applyWorldStateWrites(opts.worldStates, nested.world.worldStates);
      }
      if (questlog) {
        questlog = applyFailedQuests(
          questlog,
          collectFailedQuestIds(nested.world, nested.intents),
        );
      }
      applyActiveObjectFromDbScript(nested.world, nested.intents, {
        source: nested.world.source,
        bodies: opts.bodies,
      });
      applyEscortFromDbScript(nested.world, nested.intents, {
        source: nested.world.source,
        bodies: opts.bodies,
      });
      applyHoverFromDbScript(nested.world, nested.intents, {
        source: nested.world.source,
        bodies: opts.bodies,
      });
      if (opts.goRuntimeKey) {
        goRuntime = applyDoorAndGoBags(
          nested.world,
          nested.intents,
          goRuntime,
          opts.goRuntimeKey,
          log,
        );
      }

      const nestedTail = applyTailFromDbScript(nested.world, nested.intents, {
        ...opts,
        source: nested.world.source,
        questlog,
        goRuntime,
        depth: depth + 1,
      });
      if (nestedTail.questlog) questlog = nestedTail.questlog;
      if (nestedTail.goRuntime) goRuntime = nestedTail.goRuntime;

      // Stamp nested source mutations back onto the outer source / bodies.
      if (source && nested.world.source) {
        if (nested.world.source.fields) {
          source.fields = { ...(source.fields ?? {}), ...nested.world.source.fields };
        }
        if (nested.world.source.unitFlags != null) source.unitFlags = nested.world.source.unitFlags;
        if (nested.world.source.virtualItems) {
          source.virtualItems = [...nested.world.source.virtualItems] as [number, number, number];
        }
        if (nested.world.source.currentSpells) {
          source.currentSpells = [...nested.world.source.currentSpells];
        }
        if (nested.world.source.x != null) source.x = nested.world.source.x;
        if (nested.world.source.y != null) source.y = nested.world.source.y;
        if (nested.world.source.z != null) source.z = nested.world.source.z;
        if (nested.world.source.o != null) source.o = nested.world.source.o;
        if (nested.world.source.hovering != null) source.hovering = nested.world.source.hovering;
      }
    }
  }

  return { questlog, goRuntime };
}
