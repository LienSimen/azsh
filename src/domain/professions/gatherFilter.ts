// Auto-gather / auto-skin take-list: skill-colour boxes plus node skip/always lists, the same
// shape as junkFilter quality + keep/sell. Manual clicks are never filtered.

import type { DataStore } from '../../data/dataStore.ts';
import type { GatherNodeDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { SpellBook } from '../character/spellbook.ts';
import type { Companion } from '../bots/squad.ts';
import { companionLevel, companionSkillMap } from '../bots/squad.ts';
import { actionColor, professionSkillValue, type SkillColor } from './professions.ts';

export type GatherTakeColor = 'orange' | 'yellow' | 'green' | 'gray';

export interface GatherFilterConfig {
  /** Auto-take nodes of these colours. Default: orange/yellow/green; gray off. */
  takeColor: Record<GatherTakeColor, boolean>;
  /** Node ids never auto-gathered (quest yields and alwaysEntries still take). */
  skipEntries: number[];
  /** Node ids always auto-gathered, even when gray. */
  alwaysEntries: number[];
}

const TAKE_COLORS: GatherTakeColor[] = ['orange', 'yellow', 'green', 'gray'];

export const DEFAULT_GATHER_FILTER_CONFIG: GatherFilterConfig = {
  takeColor: { orange: true, yellow: true, green: true, gray: false },
  skipEntries: [],
  alwaysEntries: [],
};

function colorMap(
  raw: unknown,
  fallback: Record<GatherTakeColor, boolean>,
): Record<GatherTakeColor, boolean> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<GatherTakeColor, unknown>>;
  const out = { ...fallback };
  for (const c of TAKE_COLORS) {
    if (typeof r[c] === 'boolean') out[c] = r[c];
  }
  return out;
}

function entryList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x);
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function normalizeGatherFilterConfig(raw: unknown): GatherFilterConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GatherFilterConfig>;
  return {
    takeColor: colorMap(r.takeColor, DEFAULT_GATHER_FILTER_CONFIG.takeColor),
    skipEntries: entryList(r.skipEntries),
    alwaysEntries: entryList(r.alwaysEntries),
  };
}

export type GatherListKind = 'always' | 'skip';

export function setGatherListMembership(
  cfg: GatherFilterConfig,
  nodeId: number,
  list: GatherListKind | null,
): GatherFilterConfig {
  const n = normalizeGatherFilterConfig(cfg);
  const skipEntries = n.skipEntries.filter((e) => e !== nodeId);
  const alwaysEntries = n.alwaysEntries.filter((e) => e !== nodeId);
  if (list === 'always') alwaysEntries.push(nodeId);
  else if (list === 'skip') skipEntries.push(nodeId);
  return { ...n, skipEntries, alwaysEntries };
}

export function gatherListKindFor(
  cfg: GatherFilterConfig,
  nodeId: number,
): GatherListKind | null {
  const n = normalizeGatherFilterConfig(cfg);
  if (n.alwaysEntries.includes(nodeId)) return 'always';
  if (n.skipEntries.includes(nodeId)) return 'skip';
  return null;
}

export function clearGatherList(cfg: GatherFilterConfig, list: GatherListKind): GatherFilterConfig {
  const n = normalizeGatherFilterConfig(cfg);
  if (list === 'always') return { ...n, alwaysEntries: [] };
  return { ...n, skipEntries: [] };
}

// Mining/skinning colour from UpdateGatherSkill RedLevel, not the baked herb curve.
// Cite: Player.cpp:5104-5123; gatherSkillGainChanceTenths.
export function gatherNodeColor(skill: number, node: GatherNodeDef): SkillColor {
  if (skill < node.orange) return 'locked';
  if (node.skill === 'mining' || node.skill === 'skinning') {
    let red = node.orange;
    if (red === 1) red = 5;
    if (skill >= red + 100) return 'gray';
    if (skill >= red + 50) return 'green';
    if (skill >= red + 25) return 'yellow';
    return 'orange';
  }
  return actionColor(skill, node);
}

// Every group member who could work the node, player first then squad order — the same candidate
// set gatherWorkers builds. Reporting the player alone let a capped skinner's gray hide a companion
// whose yellow would have taken it, so the corpse was skipped for a colour nobody would swing at.
export function gatherFilterSkills(
  char: Character,
  ds: DataStore,
  node: GatherNodeDef,
  sb?: SpellBook | null,
  squad?: readonly Companion[],
): number[] {
  const out: number[] = [];
  const player = professionSkillValue(char, node.skill, ds, sb);
  if (player != null && player >= node.orange) out.push(player);
  for (const comp of squad ?? []) {
    if (comp.mission) continue;
    const cur = companionSkillMap(comp, companionLevel(comp, char.level))[node.skill];
    if (cur && cur.current >= node.orange) out.push(cur.current);
  }
  return out;
}

export function autoGatherAllowed(
  node: GatherNodeDef,
  workerSkills: readonly number[],
  cfg: GatherFilterConfig,
  questProtected: ReadonlySet<number>,
): boolean {
  const n = normalizeGatherFilterConfig(cfg);
  if (n.alwaysEntries.includes(node.id)) return true;
  for (const y of node.yield) {
    if (questProtected.has(y.item)) return true;
  }
  if (n.skipEntries.includes(node.id)) return false;
  for (const skill of workerSkills) {
    const color = gatherNodeColor(skill, node);
    if (color !== 'locked' && n.takeColor[color]) return true;
  }
  return false;
}
