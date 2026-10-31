// Companion professions, send-out zone missions and the shared energy that pays for them: ONE
// 100-point pool for the roster, refilled at local 06:00, at 10 energy per hour. Pure, seeded.

import type { DataStore } from '../../data/dataStore.ts';
import type { GatherNodeDef, SkillLine, ZoneDef } from '../../data/schema.ts';
import { isPrimaryProfession, MAX_PRIMARY_PROFESSIONS, rollGather } from '../professions/professions.ts';
import { companionSkillCap, professionSkillCap } from './botProfessions.ts';
import { hashSeed, mulberry32 } from '../../engine/core/rng.ts';
import type { Companion } from './squad.ts';
import type { LootDrop } from '../items/loot.ts';

// ---- energy (shared party pool) ---------------------------------------------

/** Full shared energy pool. 10 energy/hour → one full day of one 10h trip. */
export const MAX_COMPANION_ENERGY = 100;
/** Energy cost per mission hour. */
export const ENERGY_PER_HOUR = 10;
/** Max mission duration (hours). 10h × 10 energy = full pool. */
export const MAX_MISSION_HOURS = 10;
/** Local wall-clock hour when the pool refills (06:00). */
export const ENERGY_RESET_HOUR = 6;

/** Persisted energy stamp on GameState. Absent ⇒ full pool for the current day. */
export interface CompanionEnergyState {
  remaining: number;
  /** Local calendar day key of the last spend/reset, e.g. "2026-08-10". */
  dayKey: string;
}

/** Local calendar day key for the energy reset boundary at `now`. */
export function energyDayKey(now: number): string {
  const d = new Date(now);
  // Before 06:00 local still belongs to the previous reset day.
  if (d.getHours() < ENERGY_RESET_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Next local 06:00 after `now` (ms). */
export function energyResetsAtMs(now: number): number {
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ENERGY_RESET_HOUR, 0, 0, 0);
  if (d.getTime() >= next.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

// Current remaining energy. If the stored dayKey is stale (past a 06:00 boundary), returns full without
// mutating — callers that spend should re-stamp via spendPartyEnergy.
export function partyEnergy(state: CompanionEnergyState | undefined | null, now: number): number {
  if (!state) return MAX_COMPANION_ENERGY;
  if (state.dayKey !== energyDayKey(now)) return MAX_COMPANION_ENERGY;
  return Math.max(0, Math.min(MAX_COMPANION_ENERGY, state.remaining | 0));
}

/** Spend energy; re-anchors dayKey so a mid-day spend does not look like a reset. */
export function spendPartyEnergy(
  state: CompanionEnergyState | undefined | null,
  cost: number,
  now: number,
): CompanionEnergyState {
  const have = partyEnergy(state, now);
  return {
    remaining: Math.max(0, have - Math.max(0, cost)),
    dayKey: energyDayKey(now),
  };
}

export function energyCostForHours(hours: number): number {
  const h = Math.max(1, Math.min(MAX_MISSION_HOURS, Math.floor(hours)));
  return h * ENERGY_PER_HOUR;
}

// ---- professions ------------------------------------------------------------

// The companion's professions: the player-assigned set when present, else undefined so callers fall back to
// the seed-derived set (domain/botProfessions).
export type CompanionProfessionMap = Partial<Record<SkillLine, number>>;

export function companionProfessionCount(profs: CompanionProfessionMap, ds: DataStore): {
  primaries: number;
  secondaries: number;
} {
  let primaries = 0;
  let secondaries = 0;
  for (const line of Object.keys(profs) as SkillLine[]) {
    const def = ds.profession(line);
    if (!def) continue;
    if (isPrimaryProfession(def)) primaries++;
    else secondaries++;
  }
  return { primaries, secondaries };
}

/** Can this companion take up `line`? Same 2-primary rule the player lives under. */
export function canCompanionLearnProfession(
  comp: Companion,
  line: SkillLine,
  ds: DataStore,
): { ok: true } | { ok: false; reason: string } {
  const def = ds.profession(line);
  if (!def) return { ok: false, reason: 'Unknown profession' };
  const profs = comp.professions ?? {};
  if (profs[line] != null) return { ok: false, reason: `${comp.name} already knows that` };
  if (isPrimaryProfession(def)) {
    const { primaries } = companionProfessionCount(profs, ds);
    if (primaries >= MAX_PRIMARY_PROFESSIONS) {
      return {
        ok: false,
        reason: `${comp.name} already has ${MAX_PRIMARY_PROFESSIONS} primary professions - drop one first`,
      };
    }
  }
  return { ok: true };
}

/** Gathering lines that support send-out missions. */
export type MissionSkill = 'mining' | 'herbalism' | 'skinning';

// Takes a bare string: normalizeCompanionMission validates raw save data, which is not a SkillLine yet.
export function isMissionSkill(line: string): line is MissionSkill {
  return line === 'mining' || line === 'herbalism' || line === 'skinning';
}

/** Node gate: trained value, or the level cap for untrained Skinning (leather without the profession). */
export function missionWorkSkill(
  skill: MissionSkill,
  trained: number | undefined,
  level: number,
): number | undefined {
  if (trained != null && trained > 0) return trained;
  if (skill === 'skinning') return professionSkillCap(level);
  return undefined;
}

/** True for the three gathering lines. */
export function isGatheringLine(line: SkillLine, ds: DataStore): boolean {
  return ds.profession(line)?.kind === 'gathering';
}

// ---- missions ---------------------------------------------------------------

export interface CompanionMission {
  skill: MissionSkill;
  zoneId: string;
  /** 1..10 hours away. */
  hours: number;
  /** Energy spent at dispatch (hours * ENERGY_PER_HOUR). */
  energyCost: number;
  /** Wall clock at dispatch. Arrival = departed + hours*3600e3 — derived, never stored. */
  departedAtEpochMs: number;
  /** Frozen at dispatch so a level-up mid-mission cannot retroactively change the payout. */
  atLevel: number;
  /** Frozen at dispatch: the skill value the mission started from. */
  atSkill: number;
}

export interface MissionProgress {
  totalMs: number;
  elapsedMs: number;
  remainingMs: number;
  done: boolean;
}

export function missionProgress(m: CompanionMission, now: number): MissionProgress {
  const hours = Math.max(1, Math.min(MAX_MISSION_HOURS, m.hours | 0));
  const totalMs = hours * 3_600_000;
  const elapsedMs = Math.max(0, now - m.departedAtEpochMs);
  return {
    totalMs,
    elapsedMs,
    remainingMs: Math.max(0, totalMs - elapsedMs),
    done: elapsedMs >= totalMs,
  };
}

export interface MissionYieldRow {
  item: number;
  count: number;
}

/** Mine/herb: one node visit every 10 minutes. */
export const GATHER_MINUTES_PER_VISIT = 10;
/** Skinning: one kill every 3 minutes. */
export const SKIN_MINUTES_PER_KILL = 3;

function tallyDrops(rows: LootDrop[]): MissionYieldRow[] {
  const tally = new Map<number, number>();
  for (const r of rows) {
    if (r.count <= 0) continue;
    tally.set(r.item, (tally.get(r.item) ?? 0) + r.count);
  }
  return [...tally.entries()]
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count);
}

/** Workable mine/herb node types in a zone for skill ≥ orange. */
export function workableZoneNodes(
  zone: ZoneDef | undefined,
  skill: MissionSkill,
  atSkill: number,
  ds: DataStore,
): GatherNodeDef[] {
  if (!zone?.nodes?.length) return [];
  if (skill === 'skinning') return [];
  const out: GatherNodeDef[] = [];
  for (const id of zone.nodes) {
    const n = ds.gatherNode(id);
    if (!n || n.skill !== skill) continue;
    if (n.orange > atSkill) continue;
    out.push(n);
  }
  return out;
}

// Skinnable creature entries that spawn in the zone and whose skin node the skill can work. Returns
// gather-node defs (one per creature skin table), de-duped by node id for yield.
export function workableZoneSkinNodes(
  zoneId: string,
  atSkill: number,
  ds: DataStore,
  creatureEntries: readonly number[],
): GatherNodeDef[] {
  const byNode = new Map<number, GatherNodeDef>();
  for (const entry of creatureEntries) {
    const nodeId = ds.skinNode(entry);
    if (nodeId == null) continue;
    const n = ds.gatherNode(nodeId);
    if (!n || n.skill !== 'skinning') continue;
    if (n.orange > atSkill) continue;
    byNode.set(n.id, n);
  }
  void zoneId;
  return [...byNode.values()];
}

export interface ZoneMissionRec {
  zoneId: string;
  zoneName: string;
  /** How many distinct workable node/skin types. */
  targetCount: number;
  /** Best (highest orange) still workable — progression signal. */
  bestOrange: number;
  /** Count of targets still in yellow/green band (skill-ups likely). */
  skillUpTargets: number;
  /** Short preview of node names. */
  preview: string[];
}

/** Recommend zones for a gathering mission. Rank: skill-up targets first, then best orange. */
export function recommendGatherZones(
  skill: MissionSkill,
  atSkill: number,
  ds: DataStore,
  opts?: {
    /** creature entry lists per zone for skinning (caller supplies from zoneSpawns). */
    skinCreaturesByZone?: ReadonlyMap<string, readonly number[]>;
    limit?: number;
  },
): ZoneMissionRec[] {
  const limit = opts?.limit ?? 12;
  const out: ZoneMissionRec[] = [];
  for (const zone of ds.zones()) {
    let nodes: GatherNodeDef[] = [];
    if (skill === 'skinning') {
      const entries = opts?.skinCreaturesByZone?.get(zone.id) ?? [];
      nodes = workableZoneSkinNodes(zone.id, atSkill, ds, entries);
    } else {
      nodes = workableZoneNodes(zone, skill, atSkill, ds);
    }
    if (!nodes.length) continue;
    let bestOrange = 0;
    let skillUpTargets = 0;
    for (const n of nodes) {
      if (n.orange > bestOrange) bestOrange = n.orange;
      // Still not gray ⇒ practice is worth something.
      if (atSkill < n.gray) skillUpTargets++;
    }
    const preview = nodes
      .slice()
      .sort((a, b) => b.orange - a.orange)
      .slice(0, 3)
      .map((n) => n.name);
    out.push({
      zoneId: zone.id,
      zoneName: zone.name,
      targetCount: nodes.length,
      bestOrange,
      skillUpTargets,
      preview,
    });
  }
  out.sort((a, b) => {
    if (b.skillUpTargets !== a.skillUpTargets) return b.skillUpTargets - a.skillUpTargets;
    if (b.bestOrange !== a.bestOrange) return b.bestOrange - a.bestOrange;
    return a.zoneName.localeCompare(b.zoneName);
  });
  return out.slice(0, limit);
}

// Materials a completed zone gather mission brings home. Uses rollGather (chance/100) — never the old
// rng.next() > chance bug.
export function zoneMissionYield(
  m: CompanionMission,
  comp: Companion,
  nodes: readonly GatherNodeDef[],
): MissionYieldRow[] {
  if (!nodes.length) return [];
  const hours = Math.max(1, Math.min(MAX_MISSION_HOURS, m.hours | 0));
  const minutesPer = m.skill === 'skinning' ? SKIN_MINUTES_PER_KILL : GATHER_MINUTES_PER_VISIT;
  const visits = Math.max(1, Math.floor((hours * 60) / minutesPer));
  // hashSeed is binary — fold zone id into a number first so the same trip always re-rolls the same.
  let zoneSalt = 0;
  for (let i = 0; i < m.zoneId.length; i++) {
    zoneSalt = Math.imul(zoneSalt ^ m.zoneId.charCodeAt(i), 0x9e3779b9) >>> 0;
  }
  const rng = mulberry32(hashSeed(comp.seed, hashSeed(m.departedAtEpochMs | 0, zoneSalt)));
  const drops: LootDrop[] = [];
  for (let i = 0; i < visits; i++) {
    const node = nodes[rng.int(0, nodes.length - 1)]!;
    drops.push(...rollGather(node, rng));
  }
  return tallyDrops(drops);
}

/** Practice skill gain from a completed gather trip (small, capped by level). */
export function gatherMissionSkillGain(m: CompanionMission): number {
  const hours = Math.max(1, Math.min(MAX_MISSION_HOURS, m.hours | 0));
  const cap = companionSkillCap(m.skill, m.atSkill, m.atLevel);
  const headroom = Math.max(0, cap - m.atSkill);
  // ~1 point per 2 hours, hard-capped so missions never replace crafting skill-ups.
  const raw = Math.min(5, Math.max(0, Math.floor(hours / 2)));
  return Math.max(0, Math.min(headroom, raw));
}

/** Human-readable "back in 3h 12m" / "back now". */
export function missionEtaLabel(p: MissionProgress): string {
  if (p.done) return 'back now';
  const mins = Math.ceil(p.remainingMs / 60_000);
  if (mins < 60) return `back in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `back in ${h}h ${m}m` : `back in ${h}h`;
}

/** Label for mission duration + energy cost. */
export function missionHoursLabel(hours: number): string {
  const h = Math.max(1, Math.min(MAX_MISSION_HOURS, Math.floor(hours)));
  return `${h} hour${h === 1 ? '' : 's'} · ${energyCostForHours(h)} energy`;
}

export function missionVerb(skill: MissionSkill): string {
  return skill === 'skinning' ? 'Skinning' : skill === 'herbalism' ? 'Herbing' : 'Mining';
}

// ---- missions desk (roster-wide send / filter / quick) ----------------------

export type MissionWorkerWhere = 'party' | 'roster';
export type MissionWorkerStatus = 'idle' | 'away' | 'back';

export interface MissionDeskWorker {
  id: string;
  name: string;
  where: MissionWorkerWhere;
  skills: MissionSkill[];
  mission?: CompanionMission;
  status: MissionWorkerStatus;
}

export interface MissionDeskFilter {
  status: 'all' | MissionWorkerStatus;
  skill: '' | MissionSkill;
  name: string;
}

export interface MissionPreset {
  skill: MissionSkill;
  zoneId: string;
  hours: number;
}

export const MAX_MISSION_FAVORITES = 8;

export const DEFAULT_MISSION_FILTER: MissionDeskFilter = {
  status: 'all',
  skill: '',
  name: '',
};

export function isMissionWorkerStatus(v: string): v is MissionWorkerStatus {
  return v === 'idle' || v === 'away' || v === 'back';
}

export function workerMissionStatus(
  m: CompanionMission | undefined,
  now: number,
): MissionWorkerStatus {
  if (!m) return 'idle';
  return missionProgress(m, now).done ? 'back' : 'away';
}

/** Mining / herbalism when trained; skinning is always last (untrained still works). */
export function missionSkillsFromLines(lines: ReadonlyArray<{ line: string }>): MissionSkill[] {
  const out: MissionSkill[] = [];
  for (const l of lines) {
    if (isMissionSkill(l.line) && l.line !== 'skinning') out.push(l.line);
  }
  out.push('skinning');
  return out;
}

export function listMissionWorkers(
  party: readonly Companion[],
  roster: Readonly<Record<string, Companion>> | undefined,
  now: number,
  skillsOf: (comp: Companion) => readonly MissionSkill[],
): MissionDeskWorker[] {
  const out: MissionDeskWorker[] = [];
  const push = (comp: Companion, where: MissionWorkerWhere): void => {
    const mission = comp.mission;
    out.push({
      id: comp.id,
      name: comp.name,
      where,
      skills: [...skillsOf(comp)],
      ...(mission ? { mission } : {}),
      status: workerMissionStatus(mission, now),
    });
  };
  for (const c of party) push(c, 'party');
  if (roster) {
    const benched = Object.values(roster);
    benched.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of benched) push(c, 'roster');
  }
  return out;
}

export function filterMissionWorkers(
  workers: readonly MissionDeskWorker[],
  filter: MissionDeskFilter,
): MissionDeskWorker[] {
  const q = filter.name.trim().toLowerCase();
  return workers.filter((w) => {
    if (filter.status !== 'all' && w.status !== filter.status) return false;
    if (filter.skill) {
      if (w.mission) {
        if (w.mission.skill !== filter.skill) return false;
      } else if (!w.skills.includes(filter.skill)) {
        return false;
      }
    }
    if (q && !w.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function countDoneMissions(
  party: readonly Companion[],
  roster: Readonly<Record<string, Companion>> | undefined,
  now: number,
): number {
  let n = 0;
  const tally = (c: Companion): void => {
    if (c.mission && missionProgress(c.mission, now).done) n++;
  };
  for (const c of party) tally(c);
  if (roster) for (const c of Object.values(roster)) tally(c);
  return n;
}

export function missionPresetKey(p: MissionPreset): string {
  return `${p.skill}|${p.zoneId}|${p.hours}`;
}

export function parseMissionPreset(
  skill: string | undefined,
  zoneId: string | undefined,
  hoursRaw: string | number | undefined,
): MissionPreset | null {
  if (!skill || !isMissionSkill(skill)) return null;
  if (!zoneId) return null;
  const hours = typeof hoursRaw === 'number' ? hoursRaw : Number(hoursRaw);
  if (!Number.isFinite(hours)) return null;
  const h = Math.floor(hours);
  if (h < 1 || h > MAX_MISSION_HOURS) return null;
  return { skill, zoneId, hours: h };
}

export function isFavoritePreset(list: readonly MissionPreset[], preset: MissionPreset): boolean {
  const key = missionPresetKey(preset);
  return list.some((p) => missionPresetKey(p) === key);
}

export function toggleMissionFavorite(
  list: readonly MissionPreset[],
  preset: MissionPreset,
  cap = MAX_MISSION_FAVORITES,
): MissionPreset[] {
  const key = missionPresetKey(preset);
  const idx = list.findIndex((p) => missionPresetKey(p) === key);
  if (idx >= 0) return list.filter((_, i) => i !== idx);
  if (list.length >= cap) return [...list];
  return [...list, preset];
}

// Quick send: this worker's last used, else global last used, else first favorite they can run, else
// `fallback` (first recommended zone at 1h).
export function resolveQuickPreset(
  worker: { id: string; skills: readonly MissionSkill[] },
  prefs: {
    lastById: Readonly<Record<string, MissionPreset>>;
    last?: MissionPreset;
    favorites: readonly MissionPreset[];
  },
  canRun: (preset: MissionPreset) => boolean,
  fallback: MissionPreset | null,
): MissionPreset | null {
  const own = prefs.lastById[worker.id];
  if (own && canRun(own)) return own;
  if (prefs.last && canRun(prefs.last)) return prefs.last;
  for (const fav of prefs.favorites) {
    if (canRun(fav)) return fav;
  }
  if (fallback && canRun(fallback)) return fallback;
  return null;
}

export function hoursAffordable(energy: number): number {
  return Math.max(0, Math.min(MAX_MISSION_HOURS, Math.floor(energy / ENERGY_PER_HOUR)));
}

// ---- legacy compatibility (old saves / old field names) ---------------------

// Normalize a mission loaded from a pre-revamp save. Old shape had kind/lengthId/skill without zoneId.
// Returns null when unrecoverable.
export function normalizeCompanionMission(raw: unknown): CompanionMission | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  // New shape.
  if (
    typeof m.zoneId === 'string'
    && typeof m.skill === 'string'
    && isMissionSkill(m.skill)
    && typeof m.departedAtEpochMs === 'number'
  ) {
    const hours = typeof m.hours === 'number'
      ? m.hours
      : legacyHoursFromLengthId(m.lengthId);
    return {
      skill: m.skill,
      zoneId: m.zoneId,
      hours: Math.max(1, Math.min(MAX_MISSION_HOURS, Math.floor(hours))),
      energyCost: typeof m.energyCost === 'number' ? m.energyCost : energyCostForHours(hours),
      departedAtEpochMs: m.departedAtEpochMs,
      atLevel: typeof m.atLevel === 'number' ? m.atLevel : 1,
      atSkill: typeof m.atSkill === 'number' ? m.atSkill : 1,
    };
  }
  // Old train missions: drop on load (no zone, no fair payout).
  if (m.kind === 'train') return undefined;
  // Old gather without zone: drop (cannot simulate fairly).
  if (m.kind === 'gather' && typeof m.zoneId !== 'string') return undefined;
  return undefined;
}

function legacyHoursFromLengthId(id: unknown): number {
  if (id === '1h') return 1;
  if (id === '4h') return 4;
  if (id === '8h') return 8;
  return 1;
}
