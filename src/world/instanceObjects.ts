/**
 * Interactive instance objects — the brazier, the gong, the keystone, the kegs.
 *
 * `objectGate` was modelled, authored on 26 encounters with real `goEntry`/`requiredItem`,
 * and 2,873 gameobjects were baked with DB positions and names — but nothing ever imported
 * `dungeonGameObjectsForMap`, so no surface could show one and `useInstanceObject` had no
 * caller. That is why 14 bosses (Kirtonos, Gahz'rilla, Atal'alarion, Ironaya, Urok,
 * Solakar, Hurley, Magmus, the Ring of Law, Fras Siabi, Timmy…) could never appear: their
 * flag comes from using an object, and the object was not on the map.
 *
 * This resolves gate → baked object → what the player may do about it right now. Pure:
 * the caller supplies inventory lookup, and the UI owns pins and clicks.
 */
import type { EncounterDef, InstanceDef } from '../data/schema/encounter.ts';
import {
  dungeonGameObjectsForMap,
  type DungeonGameObject,
} from '../data/dungeonGameObjects.ts';
import areatriggerTeleportsJson from '../data/tables/areatriggerTeleports.json' with { type: 'json' };
import {
  GAMEOBJECT_TYPE_BUTTON,
  GAMEOBJECT_TYPE_CHEST,
  GAMEOBJECT_TYPE_DOOR,
  GAMEOBJECT_TYPE_GOOBER,
  GAMEOBJECT_TYPE_MAILBOX,
  GAMEOBJECT_TYPE_TEXT,
} from '../domain/world/gameObjects.ts';
import {
  canOpenLock,
  hardestSkillLockCase,
  LOCKTYPE_PICKLOCK,
  requiredKeyItemEntry,
  type LockDef,
} from '../domain/world/openLock.ts';
import { scriptDevByGo } from '../domain/scriptdev/registry.ts';
import { goPassesPoolGate } from './goPoolRoll.ts';
import locksJson from '../data/tables/locks.json' with { type: 'json' };

import {
  hasFlag,
  isCleared,
  objectGateAcceptedEntries,
  type InstanceRun,
} from './instances.ts';

type AtTeleportRow = {
  id: number;
  targetX: number;
  targetY: number;
  targetZ?: number;
  targetO?: number;
  name?: string;
};

function atTeleportRow(id: number): AtTeleportRow | undefined {
  return (areatriggerTeleportsJson as AtTeleportRow[]).find((r) => r.id === id);
}

/** `used` = flag already set; `needsItem` = gate wants an item the player lacks. */
export type InstanceObjectState = 'ready' | 'needsItem' | 'used';

export type InstanceObjectPin = {
  guid: number;
  goEntry: number;
  /** `gameobject_template.name` from the bake — never invented. */
  name: string;
  x: number;
  y: number;
  z?: number;
  /** `gameobject_template.displayId`; 0 / absent = no model (trigger). */
  displayId?: number;
  state: InstanceObjectState;
  requiredItem?: number;
  setsFlag: string;
  /** Encounter that owns the gate, so the UI can say what it unlocks. */
  encounterId: string;
  encounterName: string;
};

// How close you must stand to use it — `INTERACTION_DISTANCE = 5.0f` (cmangos-classic
// `src/game/Entities/ObjectDefines.h:25`).
export const GO_INTERACT_YD = 5;

export type ObjectGateRow = {
  enc: EncounterDef;
  goEntry: number;
  /** All entries this gate accepts (primary + goEntries). */
  goEntries: number[];
  needUses: number;
  requiredItem?: number;
  setsFlag: string;
};

/** Every `objectGate` on the def, flattened with its owning encounter. */
export function objectGatesFor(def: InstanceDef): ObjectGateRow[] {
  const out: ObjectGateRow[] = [];
  for (const enc of def.encounters) {
    for (const ev of enc.events ?? []) {
      if (ev.kind !== 'objectGate') continue;
      const row: ObjectGateRow = {
        enc,
        goEntry: ev.goEntry,
        goEntries: objectGateAcceptedEntries(ev),
        needUses: ev.needUses ?? 1,
        setsFlag: ev.setsFlag,
      };
      if (ev.requiredItem != null) row.requiredItem = ev.requiredItem;
      out.push(row);
    }
  }
  return out;
}

/**
 * Gate objects for this run, at their DB positions, with the state the player sees.
 *
 * One gate can own several objects (BRD vault 12 doors, ST 6 statues, multi kegs) —
 * each accepted entry gets its own pin(s). Multi-entry: an entry already counted
 * paints as used while siblings stay ready.
 */
/**
 * GOs that never earn a pin, however many the bake holds and whichever producer would draw
 * them. Checked by the gate, button and goober producers, so removing a gate cannot hand the
 * same rows back as goobers.
 *
 * Black Dragon Egg (177807) is 30 spawns in one room of BWL, and each drew a full-size sprite
 * on the stage AND on the minimap, which is a whole-map frame sized for a bounded set (the
 * comment on its own supplier in liveAutopilot says "gates are 28 across all 26 defs" — the
 * eggs alone were 30). Clicking one is not the mechanic either: in the C++ the raid possesses
 * Razorgore through the Orb of Domination and HE casts DestroyEgg, and our orb (177808) is not
 * interactive, so it has no pin and the possess is a named residual. Nothing on the floor
 * blocks on the eggs — smoke asserts Razorgore's Reset does NOT arm `set_death_prevention`
 * exactly because eggs + CUSTOM_A are not a reachable clear surface. The whole egg chain
 * (gate, waves, heal) came out with the pins (operator, 2026-08-29).
 * Cite: blackwing_lair.h:57-58; boss_razorgore.cpp:228-252 DestroyEgg; smoke.mjs razorgore
 * deathPreventionOnReset; raidEncounterTactics.ts blockedBy.mc.
 */
const UNPINNED_GO_ENTRIES: ReadonlySet<number> = new Set([177807]);

export function instanceObjectPins(
  def: InstanceDef,
  run: InstanceRun,
  opts: { hasItem: (itemEntry: number) => boolean },
): InstanceObjectPin[] {
  const byEntry = new Map<number, DungeonGameObject[]>();
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    const list = byEntry.get(go.entry);
    if (list) list.push(go);
    else byEntry.set(go.entry, [go]);
  }
  const pins: InstanceObjectPin[] = [];
  for (const gate of objectGatesFor(def)) {
    const flagDone = hasFlag(run, gate.setsFlag);
    const usedEntries = new Set(run.objectGateUsedEntries?.[gate.setsFlag] ?? []);
    const multiEntry = gate.goEntries.length > 1;
    for (const entry of gate.goEntries) {
      if (UNPINNED_GO_ENTRIES.has(entry)) continue;
      const rows = byEntry.get(entry);
      if (!rows?.length) continue;
      const entryUsed = flagDone || (multiEntry && usedEntries.has(entry));
      const state: InstanceObjectState = entryUsed
        ? 'used'
        : gate.requiredItem != null && !opts.hasItem(gate.requiredItem)
          ? 'needsItem'
          : 'ready';
      for (const go of rows) {
        const pin: InstanceObjectPin = {
          guid: go.guid,
          goEntry: go.entry,
          name: go.name,
          x: go.x,
          y: go.y,
          state,
          setsFlag: gate.setsFlag,
          encounterId: gate.enc.id,
          encounterName: gate.enc.name,
        };
        if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
        if (go.displayId > 0) pin.displayId = go.displayId;
        if (gate.requiredItem != null) pin.requiredItem = gate.requiredItem;
        pins.push(pin);
      }
    }
  }
  return pins;
}

export type LootObjectPin = {
  guid: number;
  goEntry: number;
  name: string;
  x: number;
  y: number;
  z?: number;
  /** `gameobject_template.displayId`; 0 / absent = no model (trigger). */
  displayId?: number;
  state: 'ready' | 'needsItem' | 'looted';
  requiredItem?: number;
};

const locksById = new Map<number, LockDef>(
  (locksJson as LockDef[]).map((l) => [l.id, l]),
);

/** The part of a dbscripts_on_event row a GO summon reads. */
export type GoEventScriptRow = {
  command: number;
  datalong?: number;
  x?: number;
  y?: number;
  z?: number;
  o?: number;
  conditionId?: number;
};

/** The three dbscript lookups this module needs. Cite: dataStore.ts:262-268. */
export type GoScriptSource = {
  eventScripts(eventId: number): readonly { command: number }[];
  goUseScripts(goEntry: number): readonly unknown[];
  goGuidUseScripts(goGuid: number): readonly unknown[];
};

// The scripted event a GO fires when used: a goober carries it in data2, a chest in lootedEvent. Cite:
// GameObject.cpp Use goober StartEvents_Event; type-system.md.
export function goUseEventId(
  tpl: { goober?: { eventId?: number }; chest?: { eventId?: number } } | undefined,
): number {
  return (tpl?.goober?.eventId ?? tpl?.chest?.eventId ?? 0) | 0;
}

/**
 * SUMMON_CREATURE rows on that event. Seven instance GOs reach their summon only this way and
 * are invisible to dbscripts_on_go_template_use: the Gong of Bethekk (9066 -> Arlokk 14515),
 * the Gong of Zul'Farrak, Defias Gunpowder, two Stratholme plans and the Dire Maul tannin
 * basket. Cite: ScriptMgr SCRIPT_COMMAND_TEMP_SUMMON_CREATURE = 10.
 */
export function goEventSummonRows(
  ds: GoScriptSource,
  eventId: number,
): readonly GoEventScriptRow[] {
  if (eventId <= 0) return [];
  return (ds.eventScripts(eventId) as readonly GoEventScriptRow[])
    .filter((r) => (r.command | 0) === 10);
}

/** LOCK_KEY_ITEM entry for a baked lockId, or undefined when skill/free-open only. */
function keyItemForLockId(lockId: number | undefined): number | undefined {
  if (lockId == null || lockId <= 0) return undefined;
  return requiredKeyItemEntry(locksById.get(lockId));
}

/**
 * Button/goober is interactive when a real use path exists: lock, dbscript (guid or
 * template), or a ported ScriptDev goUse binding. objectGate entries stay on gate pins.
 * Cite: GameObject.cpp Use BUTTON/GOOBER; dbscripts_on_go(_template)_use; scriptDevByGo.
 */
export function isInteractiveButtonOrGoober(
  ds: GoScriptSource,
  go: DungeonGameObject,
): boolean {
  if ((go.lockId ?? 0) > 0) return true;
  if (ds.goUseScripts(go.entry).length > 0) return true;
  if (ds.goGuidUseScripts(go.guid).length > 0) return true;
  if (scriptDevByGo(go.entry) != null) return true;
  return false;
}

function objectGateEntrySet(def: InstanceDef): Set<number> {
  const gateEntries = new Set<number>();
  for (const g of objectGatesFor(def)) {
    for (const e of g.goEntries) gateEntries.add(e);
  }
  return gateEntries;
}

/**
 * Guids that won this run's gameobject pool roll, or null when the run predates it.
 *
 * A pooled row is a candidate POSITION, so a loser is not a thing standing on the floor: 1,094 of
 * the baked rows are pool members and roughly a third of them stand at once. `null` fails open —
 * a legacy save keeps every candidate until the next mount stamps the roll.
 */
function goPoolWinners(run: InstanceRun): ReadonlySet<number> | null {
  const won = run.floorPoolSpawnedGoGuids;
  return won == null ? null : new Set(won);
}

export type LootObjectPinOpts = {
  hasItem: (itemEntry: number) => boolean;
  /** Hide pins whose Use would refuse (quest / fishing). Omitted = show all. */
  playerCanSee?: (goEntry: number) => boolean;
};

function pinVisibleToPlayer(opts: { playerCanSee?: (goEntry: number) => boolean }, entry: number): boolean {
  return !opts.playerCanSee || opts.playerCanSee(entry);
}

/**
 * Lootable chests for this run: every baked GO of type CHEST with `lootId > 0` on the
 * map, plus authored `InstanceDef.lootObjects` as override/extension (revealedByFlag,
 * requiredItem). Looted-once = run flag `go-looted:<guid>`.
 *
 * `lootId` is template data1 (GameObject.h GetLootId), not the GO entry —
 * `dungeonGameObjects.ts:6-9`. Rows with data1 = 0 are not lootable and are not pinned.
 */
export function lootObjectPins(
  def: InstanceDef,
  run: InstanceRun,
  opts: LootObjectPinOpts,
): LootObjectPin[] {
  const authoredByEntry = new Map(
    (def.lootObjects ?? []).map((l) => [l.goEntry, l] as const),
  );
  const winners = goPoolWinners(run);
  const pins: LootObjectPin[] = [];
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    const auth = authoredByEntry.get(go.entry);
    if (auth) {
      if (auth.revealedByFlag && !hasFlag(run, auth.revealedByFlag)) continue;
    } else {
      if (go.type !== GAMEOBJECT_TYPE_CHEST) continue;
      if ((go.lootId ?? 0) <= 0) continue;
      if (!goPassesPoolGate(go, winners)) continue;
    }
    if (!pinVisibleToPlayer(opts, go.entry)) continue;
    const looted = hasFlag(run, `go-looted:${go.guid}`);
    let requiredItem = auth?.requiredItem;
    if (requiredItem == null) {
      const fromLock = keyItemForLockId(go.lockId);
      if (fromLock != null) requiredItem = fromLock;
    }
    const pin: LootObjectPin = {
      guid: go.guid,
      goEntry: go.entry,
      name: go.name,
      x: go.x,
      y: go.y,
      state: looted
        ? 'looted'
        : requiredItem != null && !opts.hasItem(requiredItem)
          ? 'needsItem'
          : 'ready',
    };
    if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
    if (go.displayId > 0) pin.displayId = go.displayId;
    if (requiredItem != null) pin.requiredItem = requiredItem;
    pins.push(pin);
  }
  return pins;
}

export type DoorObjectPin = {
  guid: number;
  goEntry: number;
  name: string;
  x: number;
  y: number;
  z?: number;
  displayId?: number;
  state: InstanceObjectState;
  /** LOCK_KEY_ITEM entry when the lock wants a key. */
  requiredItem?: number;
  /** Human skill line + req (e.g. "Lockpicking 175") when the lock is skill-gated. */
  skillLabel?: string;
};

/**
 * Locked doors on this map (GO type DOOR, `lockId > 0`). Unlocked doors are decorative
 * interior frames — not pinned (279 doors → 113 locked; pinning all floods the layer).
 *
 * Entries already owned by an `objectGate` stay on that path (probe-object-gates + BRD vault).
 * Open-once state is run flag `go-opened:<guid>` (same shape as `go-looted:`).
 * Lock join: `canOpenLock` (key and/or picklock skill) — same path as `checkGoLock` / `useDoor`.
 */
export function doorObjectPins(
  def: InstanceDef,
  run: InstanceRun,
  opts: {
    hasItem: (itemEntry: number) => boolean;
    /** Combat skill 633 current. Cite: locks.json picklock cases; openLock.ts. */
    lockpickingSkill?: number;
  },
): DoorObjectPin[] {
  const gateEntries = objectGateEntrySet(def);
  const winners = goPoolWinners(run);
  const pins: DoorObjectPin[] = [];
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (go.type !== GAMEOBJECT_TYPE_DOOR) continue;
    if ((go.lockId ?? 0) <= 0) continue;
    if (gateEntries.has(go.entry)) continue;
    if (!goPassesPoolGate(go, winners)) continue;
    const lock = locksById.get(go.lockId!);
    const opened = hasFlag(run, `go-opened:${go.guid}`);
    const requiredItem = keyItemForLockId(go.lockId);
    const hard = hardestSkillLockCase(lock);
    const keyItemEntry =
      requiredItem != null && opts.hasItem(requiredItem) ? requiredItem : undefined;
    const canOpen = canOpenLock({
      lock: lock ?? { id: go.lockId!, cases: [] },
      keyItemEntry,
      skillValueFor: (lockType) =>
        lockType === LOCKTYPE_PICKLOCK ? opts.lockpickingSkill : undefined,
    }).ok;
    const state: InstanceObjectState = opened
      ? 'used'
      : canOpen
        ? 'ready'
        : 'needsItem';
    const pin: DoorObjectPin = {
      guid: go.guid,
      goEntry: go.entry,
      name: go.name,
      x: go.x,
      y: go.y,
      state,
    };
    if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
    if (go.displayId > 0) pin.displayId = go.displayId;
    if (requiredItem != null) pin.requiredItem = requiredItem;
    if (hard) pin.skillLabel = `${hard.skillName} ${hard.skillReq}`;
    pins.push(pin);
  }
  return pins;
}

/** Shared shape for map pins of type BUTTON / GOOBER / TEXT (lock + open-once). */
export type UseObjectPin = {
  guid: number;
  goEntry: number;
  name: string;
  x: number;
  y: number;
  z?: number;
  displayId?: number;
  state: InstanceObjectState;
  requiredItem?: number;
  skillLabel?: string;
  /** Map click kind — mirrors ObjectMarker.objKind. */
  kind: 'button' | 'goober' | 'text' | 'mailbox';
};

function useObjectPinFromGo(
  go: DungeonGameObject,
  run: InstanceRun,
  opts: { hasItem: (itemEntry: number) => boolean },
  kind: UseObjectPin['kind'],
): UseObjectPin {
  const used = hasFlag(run, `go-used:${go.guid}`);
  const requiredItem = keyItemForLockId(go.lockId);
  const hard = hardestSkillLockCase(
    (go.lockId ?? 0) > 0 ? locksById.get(go.lockId!) : undefined,
  );
  const state: InstanceObjectState = used
    ? 'used'
    : requiredItem != null && !opts.hasItem(requiredItem)
      ? 'needsItem'
      : 'ready';
  const pin: UseObjectPin = {
    guid: go.guid,
    goEntry: go.entry,
    name: go.name,
    x: go.x,
    y: go.y,
    state,
    kind,
  };
  if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
  if (go.displayId > 0) pin.displayId = go.displayId;
  if (requiredItem != null) pin.requiredItem = requiredItem;
  if (hard) pin.skillLabel = `${hard.skillName} ${hard.skillReq}`;
  return pin;
}

/**
 * Interactive buttons (type BUTTON) with a real use signal — lock, dbscript, or
 * ScriptDev goUse. Unlocked levers with no script stay unpinned (scenery).
 * objectGate entries stay on the gate path. Open-once: `go-used:<guid>`.
 */
export function buttonObjectPins(
  ds: GoScriptSource,
  def: InstanceDef,
  run: InstanceRun,
  opts: { hasItem: (itemEntry: number) => boolean; playerCanSee?: (goEntry: number) => boolean },
): UseObjectPin[] {
  const gateEntries = objectGateEntrySet(def);
  const winners = goPoolWinners(run);
  const pins: UseObjectPin[] = [];
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (go.type !== GAMEOBJECT_TYPE_BUTTON) continue;
    if (gateEntries.has(go.entry) || UNPINNED_GO_ENTRIES.has(go.entry)) continue;
    if (!isInteractiveButtonOrGoober(ds, go)) continue;
    if (!goPassesPoolGate(go, winners)) continue;
    if (!pinVisibleToPlayer(opts, go.entry)) continue;
    pins.push(useObjectPinFromGo(go, run, opts, 'button'));
  }
  return pins;
}

// Interactive goobers (type GOOBER) with lock / dbscript / ScriptDev. Same signals as buttons. Cannon,
// gong, eternal flame, scarlet cannons, etc.
export function gooberObjectPins(
  ds: GoScriptSource,
  def: InstanceDef,
  run: InstanceRun,
  opts: { hasItem: (itemEntry: number) => boolean; playerCanSee?: (goEntry: number) => boolean },
): UseObjectPin[] {
  const gateEntries = objectGateEntrySet(def);
  const winners = goPoolWinners(run);
  const pins: UseObjectPin[] = [];
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (go.type !== GAMEOBJECT_TYPE_GOOBER) continue;
    if (gateEntries.has(go.entry) || UNPINNED_GO_ENTRIES.has(go.entry)) continue;
    if (!isInteractiveButtonOrGoober(ds, go)) continue;
    if (!goPassesPoolGate(go, winners)) continue;
    if (!pinVisibleToPlayer(opts, go.entry)) continue;
    pins.push(useObjectPinFromGo(go, run, opts, 'goober'));
  }
  return pins;
}

// Readable TEXT GOs (type TEXT) — Use returns pageId (GameObject.h:159). Every baked TEXT is a plaque/book;
// none are triggers. No lock join.
export function textObjectPins(
  def: InstanceDef,
  run: InstanceRun,
  _opts?: { hasItem?: (itemEntry: number) => boolean },
): UseObjectPin[] {
  const gateEntries = objectGateEntrySet(def);
  const winners = goPoolWinners(run);
  const pins: UseObjectPin[] = [];
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (go.type !== GAMEOBJECT_TYPE_TEXT) continue;
    if (gateEntries.has(go.entry)) continue;
    if (!goPassesPoolGate(go, winners)) continue;
    const used = hasFlag(run, `go-used:${go.guid}`);
    const pin: UseObjectPin = {
      guid: go.guid,
      goEntry: go.entry,
      name: go.name,
      x: go.x,
      y: go.y,
      state: used ? 'used' : 'ready',
      kind: 'text',
    };
    if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
    if (go.displayId > 0) pin.displayId = go.displayId;
    pins.push(pin);
  }
  return pins;
}

/** MAILBOX GOs — empty union; Use opens the inbox. Cite: GameObject.h:244; MailHandler.cpp:44–52. */
export function mailboxObjectPins(
  def: InstanceDef,
  run: InstanceRun,
  _opts?: { hasItem?: (itemEntry: number) => boolean },
): UseObjectPin[] {
  const gateEntries = objectGateEntrySet(def);
  const winners = goPoolWinners(run);
  const pins: UseObjectPin[] = [];
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (go.type !== GAMEOBJECT_TYPE_MAILBOX) continue;
    if (gateEntries.has(go.entry)) continue;
    if (!goPassesPoolGate(go, winners)) continue;
    const pin: UseObjectPin = {
      guid: go.guid,
      goEntry: go.entry,
      name: go.name,
      x: go.x,
      y: go.y,
      state: 'ready',
      kind: 'mailbox',
    };
    if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
    if (go.displayId > 0) pin.displayId = go.displayId;
    pins.push(pin);
  }
  return pins;
}

/** In-instance teleporter pin — dest from areatrigger_teleport, never invented. */
export type TeleportObjectPin = {
  /** GO guid, or `-areatriggerId` for areatrigger-only pads. */
  guid: number;
  goEntry: number;
  name: string;
  x: number;
  y: number;
  z?: number;
  displayId?: number;
  state: InstanceObjectState;
  areatriggerId: number;
  dest: { x: number; y: number; z?: number };
  /** Encounter ids still blocking this portal. */
  missingClears: readonly string[];
};

/**
 * Authored `InstanceDef.teleporters` at their GO / AreaTrigger stands.
 * Dest is `tel.dest` when authored (spell_target_position), else areatrigger_teleport
 * `areatriggerId`. Locked when `requiresCleared` encounters are still up
 * (C++ GO_FLAG_NO_INTERACT / Frostwyrm AT gate). Cite: naxxramas.cpp:325-340, :1123-1128.
 */
type TeleporterRow = NonNullable<InstanceDef['teleporters']>[number] & {
  /** Arrival override — e.g. spell_target_position 28444 for Naxx wing GOs. */
  dest?: { x: number; y: number; z?: number };
};

export function teleportObjectPins(
  def: InstanceDef,
  run: InstanceRun,
): TeleportObjectPin[] {
  const rows = (def.teleporters ?? []) as readonly TeleporterRow[];
  if (!rows.length) return [];
  const winners = goPoolWinners(run);
  const byEntry = new Map<number, DungeonGameObject[]>();
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (!goPassesPoolGate(go, winners)) continue;
    const list = byEntry.get(go.entry);
    if (list) list.push(go);
    else byEntry.set(go.entry, [go]);
  }
  const pins: TeleportObjectPin[] = [];
  for (const tel of rows) {
    const at = atTeleportRow(tel.areatriggerId);
    if (!tel.dest && !at) continue;
    const dest: TeleportObjectPin['dest'] = tel.dest
      ? {
        x: tel.dest.x,
        y: tel.dest.y,
        ...(tel.dest.z != null && Number.isFinite(tel.dest.z) ? { z: tel.dest.z } : {}),
      }
      : { x: Number(at!.targetX), y: Number(at!.targetY) };
    if (!tel.dest && at!.targetZ != null && Number.isFinite(Number(at!.targetZ))) {
      dest.z = Number(at!.targetZ);
    }
    const missing = (tel.requiresCleared ?? []).filter((id) => !isCleared(run, id));
    const state: InstanceObjectState = missing.length ? 'needsItem' : 'ready';
    if (tel.goEntry != null && tel.goEntry > 0) {
      const gos = byEntry.get(tel.goEntry) ?? [];
      for (const go of gos) {
        const pin: TeleportObjectPin = {
          guid: go.guid,
          goEntry: go.entry,
          name: tel.name ?? go.name,
          x: go.x,
          y: go.y,
          state,
          areatriggerId: tel.areatriggerId,
          dest,
          missingClears: missing,
        };
        if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
        if (go.displayId > 0) pin.displayId = go.displayId;
        pins.push(pin);
      }
      continue;
    }
    if (!tel.src) continue;
    const pin: TeleportObjectPin = {
      guid: -tel.areatriggerId,
      goEntry: 0,
      name: tel.name ?? at?.name ?? `Teleport ${tel.areatriggerId}`,
      x: tel.src.x,
      y: tel.src.y,
      state,
      areatriggerId: tel.areatriggerId,
      dest,
      missingClears: missing,
    };
    if (tel.src.z != null && Number.isFinite(tel.src.z)) pin.z = tel.src.z;
    pins.push(pin);
  }
  return pins;
}

export type QuestgiverObjectPin = {
  guid: number;
  /** 0 = the pin is a floor NPC quest giver, not a gameobject. */
  goEntry: number;
  name: string;
  x: number;
  y: number;
  z?: number;
  /** `gameobject_template.displayId`; 0 / absent = no model (trigger). */
  displayId?: number;
  state: 'ready';
  /** Hover text override — GO enders default to "<name> — turn in". */
  title?: string;
  /** Full sprite URL override (NPC quest givers use their creature portrait). */
  sprUrl?: string;
  /** UNIT_FIELD_MOUNTDISPLAYID is live on this NPC pin. */
  mounted?: boolean;
};

/**
 * Baked GOs on this map that end a quest the player currently has.
 * Membership is data-driven from goEnder / goEnderEntries (and reverse
 * questsEnded when the caller folds those into `enderEntries`) — never a
 * hand-written entry list. Cite: recordGoEnderInteract; QuestDef.goEnder.
 */
export function questgiverObjectPins(
  def: InstanceDef,
  opts: { enderEntries: ReadonlySet<number>; run?: InstanceRun },
): QuestgiverObjectPin[] {
  if (!opts.enderEntries.size) return [];
  const winners = opts.run ? goPoolWinners(opts.run) : null;
  const pins: QuestgiverObjectPin[] = [];
  for (const go of dungeonGameObjectsForMap(def.mapId)) {
    if (!opts.enderEntries.has(go.entry)) continue;
    if (!goPassesPoolGate(go, winners)) continue;
    const pin: QuestgiverObjectPin = {
      guid: go.guid,
      goEntry: go.entry,
      name: go.name,
      x: go.x,
      y: go.y,
      state: 'ready',
    };
    if (go.z != null && Number.isFinite(go.z)) pin.z = go.z;
    if (go.displayId > 0) pin.displayId = go.displayId;
    pins.push(pin);
  }
  return pins;
}

/** Planar yards from the party to a pin — the interact-range test. */
export function pinDistanceYd(
  pin: { x: number; y: number },
  from: { x: number; y: number },
): number {
  return Math.hypot(pin.x - from.x, pin.y - from.y);
}

/**
 * Storey-band draw rule for map markers. Missing z is always in band (never filter it
 * out — many encounters/GOs ship without origin z). When both sides have a storey id
 * from `storeyIdForZ`, differ ⇒ off-band (dim, do not delete).
 */
export function isOffStoreyZ(
  z: number | undefined | null,
  pinStoreyId: number | null,
  partyStoreyId: number | null,
): boolean {
  if (partyStoreyId == null) return false;
  if (z == null || !Number.isFinite(z)) return false;
  if (pinStoreyId == null) return false;
  return pinStoreyId !== partyStoreyId;
}

/**
 * A GO entry stamped more than this many times on one map is a scenery FIELD, not a landmark.
 *
 * The whole-map minimap answers "there is one thing you must walk to, and here is the click
 * target". Chests are already left off it for this reason (liveAutopilot objects()). Egg fields
 * arrive through two other layers: ZG stamps GO 179985 Spider Egg 100 times across 138x135 yd
 * of the Mar'li terrace (goober + goUse-script), and instanceObjectPins emits one pin per baked
 * INSTANCE, so BWL's single Razorgore gate on GO 177807 is 30 Black Dragon Eggs.
 *
 * 12 is measured, not picked: the largest AUTHORED gate cluster in the tree is Sunken Temple's
 * 8 Evil God Summoning Circles (GO 148998), and the floods start at 30. Cap is per ENTRY, so
 * BRD's 6 one-off Dark Keeper Portraits (six distinct entries) are never in scope.
 *
 * A capped entry is dropped from the minimap and drawn quiet on the stage
 * (ObjectMarker.quiet -> .tw-dmap-obj-egg). It stays clickable on both.
 * Measured by src/dev/probe-minimap-pin-flood.mjs.
 */
export const PIN_FLOOD_ENTRY_CAP = 12;

/** mapId -> entries over PIN_FLOOD_ENTRY_CAP. Built once per map (bake is immutable). */
const floodEntryCache = new Map<number, Set<number>>();

/** GO entries too numerous on `mapId` to draw on a whole-map frame. */
export function floodedGoEntries(mapId: number): Set<number> {
  const hit = floodEntryCache.get(mapId);
  if (hit) return hit;
  const counts = new Map<number, number>();
  for (const go of dungeonGameObjectsForMap(mapId)) {
    counts.set(go.entry, (counts.get(go.entry) ?? 0) + 1);
  }
  const flood = new Set<number>();
  for (const [entry, n] of counts) if (n > PIN_FLOOD_ENTRY_CAP) flood.add(entry);
  floodEntryCache.set(mapId, flood);
  return flood;
}
