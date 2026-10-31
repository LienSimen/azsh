// Premade playerbot spec links → real talent maps. Each spec is a classic Wowhead talent string in
// the order seed-talents bakes; spending toward the stage build mirrors InitTalentsTree. Pure.

import type { DataStore } from '../../data/dataStore.ts';
import type { BotSpecDef } from '../../data/schema.ts';
import type { Character } from './character.ts';
import { canSpend, pointsForLevel } from './talents.ts';

/** The link stage a bot of `level` works toward: highest stage.level <= level, else the first. */
export function stageFor(spec: BotSpecDef, level: number): { level: number; link: string } {
  let best = spec.stages[0]!;
  for (const st of spec.stages) {
    if (st.level <= level) best = st;
  }
  return best;
}

// Deterministic prob-weighted spec pick (PremadeSpecProb, conf default 100). Returns the spec index into
// ds.botSpecs(cls), or undefined when none baked.
export function pickSpecIndex(specs: readonly BotSpecDef[], seed: number): number | undefined {
  if (specs.length === 0) return undefined;
  const total = specs.reduce((s, sp) => s + Math.max(1, sp.prob), 0);
  let r = Math.abs(seed) % total;
  for (let i = 0; i < specs.length; i++) {
    r -= Math.max(1, specs[i]!.prob);
    if (r < 0) return i;
  }
  return specs.length - 1;
}

/** One build per (ds, spec, cls, level). Nothing in the tree writes into a returned map. */
const specTalents = new WeakMap<DataStore, WeakMap<BotSpecDef, Map<string, Record<number, number>>>>();

// Materialize a spec link as spent talents for `cls` at `level`, multi-pass so prereqs later in
// the string still fill. Cached: rebuilding per body was 114 ms of a Molten Core pack-clear.
export function talentsForSpec(spec: BotSpecDef, cls: number, level: number, ds: DataStore): Record<number, number> {
  let byDs = specTalents.get(ds);
  if (!byDs) specTalents.set(ds, (byDs = new WeakMap()));
  let bySpec = byDs.get(spec);
  if (!bySpec) byDs.set(spec, (bySpec = new Map()));
  const key = `${cls}|${level}`;
  const hit = bySpec.get(key);
  if (hit) return hit;
  const built = buildTalentsForSpec(spec, cls, level, ds);
  bySpec.set(key, built);
  return built;
}

function buildTalentsForSpec(spec: BotSpecDef, cls: number, level: number, ds: DataStore): Record<number, number> {
  return talentsFromLink(stageFor(spec, level).link, cls, level, ds);
}

/** A tree's talents in link-digit order: TalentTab OrderIndex outer, (tier, col) inner. */
function talentsInLinkOrder(tree: { talents: readonly { id: number; tier: number; col: number; maxRank: number }[] }):
  { id: number; maxRank: number }[] {
  return [...tree.talents]
    .sort((a, b) => (a.tier - b.tier) || (a.col - b.col))
    .map((t) => ({ id: t.id, maxRank: t.maxRank }));
}

// Decode a classic Wowhead talent string into spent talents for `cls` at `level`, under the real
// rules and multi-pass for late prereqs. Unknown or short trees no-op.
export function talentsFromLink(link: string, cls: number, level: number, ds: DataStore): Record<number, number> {
  const trees = ds.talentTrees(cls);
  const linkTrees = link.split('-');
  // Desired ranks in link order.
  const desired: { id: number; rank: number }[] = [];
  for (let t = 0; t < trees.length; t++) {
    const digits = linkTrees[t] ?? '';
    const tals = talentsInLinkOrder(trees[t]!);
    for (let i = 0; i < tals.length && i < digits.length; i++) {
      const rank = Number(digits[i]) || 0;
      if (rank > 0) desired.push({ id: tals[i]!.id, rank: Math.min(rank, tals[i]!.maxRank) });
    }
  }
  if (desired.length === 0) return {};
  // Scratch character purely for the spend rules, spent in place: only `talents` escapes and every
  // helper re-reads char. Cloning char and the talents map per POINT was 56 ms of a pack-clear.
  const talents: Record<number, number> = {};
  const char: Character = {
    name: '', race: 0, cls, level: Math.max(1, level), xp: 0, gold: 0, zoneId: '',
    health: 1, power: 0, equipped: {}, activeBuffs: [], activeAuras: [],
    skills: {}, knownRecipes: [], talents,
  };
  let budget = pointsForLevel(level);
  let progress = true;
  while (budget > 0 && progress) {
    progress = false;
    for (const d of desired) {
      while (budget > 0 && ((talents[d.id] ?? 0) < d.rank) && canSpend(char, d.id, ds).ok) {
        talents[d.id] = (talents[d.id] ?? 0) + 1;
        budget--;
        progress = true;
      }
    }
  }
  return talents;
}

// The inverse of talentsFromLink: one digit per talent in (tier, col) order, trees joined by '-'.
// Trailing zeros per tree and empty trailing trees are both trimmed, so the string is byte-equal to
// the one Wowhead prints for the same build ("303050213520105001-0505300502", botSpecs.json).
export function talentLinkFromTalents(
  talents: Record<number, number>, cls: number, ds: DataStore,
): string {
  return ds.talentTrees(cls)
    .map((tree) => talentsInLinkOrder(tree)
      .map((t) => String(Math.min(9, talents[t.id] ?? 0)))
      .join('')
      .replace(/0+$/, ''))
    .join('-')
    .replace(/-+$/, '');
}

/** Per-tree point split of a talent map (candidate vetting UI: "Holy 31 / Ret 20"). */
export function talentTreeSplit(
  talents: Record<number, number>, cls: number, ds: DataStore,
): { name: string; points: number }[] {
  return ds.talentTrees(cls).map((tree) => ({
    name: tree.name,
    points: tree.talents.reduce((s, t) => s + (talents[t.id] ?? 0), 0),
  }));
}
