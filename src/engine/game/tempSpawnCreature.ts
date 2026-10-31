// SCRIPT_COMMAND_TEMP_SPAWN_CREATURE from the event dbscripts, applied to the session surface. Until
// this path the intents were only dispositioned, so a binding rune spawned no ritual target.

import type { QuestDef } from '../../data/schema.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import type { TempSpawnRecord } from '../../domain/quests/interpreter/dbscript/types.ts';
import type { FireGoEventResult } from '../../domain/world/goEventFire.ts';

/** One creature temp-summoned from an executed event script row. */
export interface TempSpawnedCreature {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  /** Despawn delay ms from datalong2 (0 = dead-despawn only). */
  despawnDelayMs: number;
  /** Wall-clock expiry when delay > 0; else 0. */
  expiresAtMs: number;
  eventId: number;
}

function fromRecord(
  rec: TempSpawnRecord,
  eventId: number,
  nowMs: number,
): TempSpawnedCreature | null {
  const creatureEntry = rec.creatureEntry | 0;
  if (creatureEntry <= 0) return null;
  const despawnDelayMs = rec.despawnDelay | 0;
  return {
    creatureEntry,
    x: rec.x ?? 0,
    y: rec.y ?? 0,
    z: rec.z ?? 0,
    o: rec.o ?? 0,
    despawnDelayMs,
    expiresAtMs: despawnDelayMs > 0 ? nowMs + despawnDelayMs : 0,
    eventId: eventId | 0,
  };
}

/** Collect TEMP_SPAWN_CREATURE results from fireGoEventScripts outputs. */
export function collectTempSpawnsFromEventFire(
  fired: readonly FireGoEventResult[],
  nowMs: number,
): TempSpawnedCreature[] {
  const out: TempSpawnedCreature[] = [];
  const seen = new Set<string>();
  for (const f of fired) {
    const bag = f.vm?.world?.tempSpawns ?? [];
    for (const rec of bag) {
      const sp = fromRecord(rec, f.eventId, nowMs);
      if (!sp) continue;
      // Same entry from the same event once per fire batch (duplicate rows rare).
      const key = `${f.eventId}:${sp.creatureEntry}:${sp.x}:${sp.y}:${sp.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sp);
    }
    // Belt: intents if world bag was cleared by a host transform.
    for (const intent of f.vm?.intents ?? []) {
      if (intent.kind !== 'temp_spawn_creature') continue;
      const sp = fromRecord(intent, f.eventId, nowMs);
      if (!sp) continue;
      const key = `${f.eventId}:${sp.creatureEntry}:${sp.x}:${sp.y}:${sp.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sp);
    }
  }
  return out;
}

// Temp-spawned entries that are still unmet kill objectives on active quests: a ritual summon engages
// the player when it appears, the stand-in for "the demon spawns and attacks at the circle".
export function unmetQuestKillTempSpawns(
  questlog: QuestLog,
  questOf: (entry: number) => QuestDef | undefined,
  spawns: readonly TempSpawnedCreature[],
): number[] {
  const needed = new Set<number>();
  for (const qs of questlog.quests) {
    if (qs.status !== 'active') continue;
    const def = questOf(qs.entry);
    if (!def) continue;
    for (const kt of def.killTargets ?? []) {
      const cur = qs.kills?.[String(kt.creatureEntry)] ?? 0;
      if (cur < kt.count) needed.add(kt.creatureEntry);
    }
  }
  const out: number[] = [];
  const seen = new Set<number>();
  for (const sp of spawns) {
    const e = sp.creatureEntry;
    if (!needed.has(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export interface ApplyTempSpawnsFromEventOpts {
  fired: readonly FireGoEventResult[];
  nowMs: number;
  questlog: QuestLog;
  questOf: (entry: number) => QuestDef | undefined;
  creatureName: (entry: number) => string;
  /** Instant resolve fight — ritual summons engage (Binding, etc.). */
  fight: (creatureEntry: number) => { ok: boolean; reason?: string };
  log: (msg: string) => void;
}

// Materialize TEMP_SPAWN_CREATURE from event fire results. Logs each spawn; auto-fights entries that are
// unmet active-quest kill targets (ritual path).
export function applyTempSpawnsFromEventFire(opts: ApplyTempSpawnsFromEventOpts): {
  spawns: TempSpawnedCreature[];
  engaged: number[];
} {
  const spawns = collectTempSpawnsFromEventFire(opts.fired, opts.nowMs);
  if (!spawns.length) return { spawns, engaged: [] };

  for (const sp of spawns) {
    const name = opts.creatureName(sp.creatureEntry);
    opts.log(`${name} appears!`);
  }

  const toFight = unmetQuestKillTempSpawns(opts.questlog, opts.questOf, spawns);
  const engaged: number[] = [];
  for (const entry of toFight) {
    const fr = opts.fight(entry);
    if (fr.ok) engaged.push(entry);
    else if (fr.reason) opts.log(fr.reason);
  }
  return { spawns, engaged };
}
