// "Where does this come from" — the reverse of the bake's forward keys.
//
// loot-data.json is keyed by lootId, vendors by NPC, quests by quest: every acquisition path
// points AT an item, never back from one. This walks all 9,359 loot tables plus vendors,
// quests and recipes once and inverts them. Built lazily behind ds.ensureLoot() (the 41 MB
// loot chunk is deliberately deferred at boot — bootData.ts:30) and memoized on ds identity.
//
// NOT quests.ts droppersForItem: that one is scoped to zone `huntable` lists and level-band
// gated for the auto-quest router, so it hides instance bosses and anything off-level. Right
// for routing, wrong for a database.

import type { DataStore } from '../data/dataStore.ts';
import type { GatherNodeDef } from '../data/schema.ts';

export type WikiSourceKind =
  | 'drop' | 'object' | 'gather' | 'skin' | 'pickpocket' | 'fishing'
  | 'disenchant' | 'container' | 'spell' | 'mail'
  | 'vendor' | 'quest-reward' | 'crafted' | 'starts-quest' | 'quest-objective';

export interface WikiSource {
  kind: WikiSourceKind;
  /** creature / gameobject / vendor / quest entry, recipe id, or gather-node id per kind. */
  ref: number;
  /** Drop weight as a percent. Absent for non-loot kinds. */
  chance?: number;
  minCount?: number;
  maxCount?: number;
  /** Signed-negative bake chance: eligible only while a quest needs the item. */
  questOnly?: boolean;
  /** Zone slug for a gather node. */
  zone?: string;
  /** `quest-reward` only: it is one of the pick-one choices, not a guaranteed reward. */
  choice?: boolean;
}

/** Loot rows kept per item. Everything past this is counted, not stored (Linen Cloth: 700+). */
const LOOT_CAP = 25;

interface Bucket { list: WikiSource[]; total: number }

export interface WikiSourceIndex {
  /** Best-first sources for an item, plus how many loot rows were dropped past the cap. */
  itemSources(item: number): { sources: readonly WikiSource[]; more: number };
  /** Quests this creature hands out and takes back in. */
  questsForCreature(entry: number): { starts: readonly number[]; ends: readonly number[] };
  /** Recipe ids that consume this item as a reagent. */
  reagentFor(item: number): readonly number[];
  /** Every way a spell is learned or cast from something else. */
  spellSources(spellId: number): {
    trainers: readonly number[];
    items: readonly number[];
    talents: readonly number[];
    quests: readonly number[];
  };
  buildMs: number;
  /** Loot rows walked — the number to quote when reporting the build cost. */
  lootRows: number;
  /** Stored source rows per kind. The capability ledger commits these. */
  stats: Readonly<Record<WikiSourceKind, number>>;
  /** Distinct items with at least one source of any kind. */
  itemsWithSource: number;
}

/** Bounded push: keep the {@link LOOT_CAP} highest-chance rows, count the rest. */
function addLoot(buckets: Map<number, Bucket>, item: number, src: WikiSource): void {
  let b = buckets.get(item);
  if (!b) buckets.set(item, (b = { list: [], total: 0 }));
  b.total++;
  if (b.list.length < LOOT_CAP) { b.list.push(src); return; }
  let worst = 0;
  for (let i = 1; i < b.list.length; i++) {
    if ((b.list[i]!.chance ?? 0) < (b.list[worst]!.chance ?? 0)) worst = i;
  }
  if ((src.chance ?? 0) > (b.list[worst]!.chance ?? 0)) b.list[worst] = src;
}

/** Non-loot paths are few per item, so they are never capped. */
function addFlat(buckets: Map<number, WikiSource[]>, item: number, src: WikiSource): void {
  const list = buckets.get(item);
  if (list) list.push(src);
  else buckets.set(item, [src]);
}

/** Gather nodes the player can actually reach: every zone's node list plus skinning nodes. */
function reachableNodes(ds: DataStore): { byKey: Map<string, { node: GatherNodeDef; zone?: string }[]>; skinCreatures: Map<number, number[]> } {
  const byKey = new Map<string, { node: GatherNodeDef; zone?: string }[]>();
  const put = (key: string, node: GatherNodeDef, zone?: string): void => {
    const list = byKey.get(key);
    if (list) list.push({ node, zone });
    else byKey.set(key, [{ node, zone }]);
  };
  // Same key rule as engine/game/professions.ts gatherLootKey — do not invent a second one.
  const keyOf = (node: GatherNodeDef): string | null => {
    if (node.sourceId == null) return null;
    if (node.source === 'fishing') return `fishing:${node.sourceId}`;
    if (node.source === 'skinning') return `skinning:${node.sourceId}`;
    if (node.source === 'gameobject') {
      const lootId = ds.gameObject(node.sourceId)?.lootId ?? 0;
      return lootId > 0 ? `go:${lootId}` : null;
    }
    return null;
  };
  const seen = new Set<number>();
  for (const z of ds.zones()) {
    for (const id of z.nodes ?? []) {
      const node = ds.gatherNode(id);
      if (!node) continue;
      const key = keyOf(node);
      if (key) put(key, node, z.id);
      seen.add(id);
    }
  }
  // Skinning nodes hang off creatures, not zones (ds.skinNode is the game's own resolver).
  const skinCreatures = new Map<number, number[]>();
  for (const c of ds.creatures()) {
    const nodeId = ds.skinNode(c.entry);
    if (nodeId == null) continue;
    const list = skinCreatures.get(nodeId);
    if (list) list.push(c.entry);
    else skinCreatures.set(nodeId, [c.entry]);
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const node = ds.gatherNode(nodeId);
    if (!node) continue;
    const key = keyOf(node);
    if (key) put(key, node);
  }
  return { byKey, skinCreatures };
}

/** Stored rows per kind, for the capability ledger. Counts what is KEPT, so the cap is in it. */
function countByKind(
  loot: Map<number, Bucket>, flat: Map<number, WikiSource[]>,
): Record<WikiSourceKind, number> {
  const out = {} as Record<WikiSourceKind, number>;
  for (const b of loot.values()) for (const s of b.list) out[s.kind] = (out[s.kind] ?? 0) + 1;
  for (const list of flat.values()) for (const s of list) out[s.kind] = (out[s.kind] ?? 0) + 1;
  return out;
}

/** Loot-kind for a namespaced table key, plus the numeric id it carries. */
function parseKey(key: number | string): { kind: WikiSourceKind | 'creature'; id: number } | null {
  if (typeof key === 'number') return { kind: 'creature', id: key };
  const colon = key.indexOf(':');
  if (colon < 0) {
    const n = Number(key);
    return Number.isFinite(n) ? { kind: 'creature', id: n } : null;
  }
  const id = Number(key.slice(colon + 1));
  if (!Number.isFinite(id)) return null;
  switch (key.slice(0, colon)) {
    case 'go': return { kind: 'object', id };
    case 'pickpocket': return { kind: 'pickpocket', id };
    case 'skinning': return { kind: 'skin', id };
    case 'fishing': return { kind: 'fishing', id };
    case 'disenchant': return { kind: 'disenchant', id };
    case 'item': return { kind: 'container', id };
    case 'spell': return { kind: 'spell', id };
    case 'mail': return { kind: 'mail', id };
    default: return null;
  }
}

// Build the inversion. Not memoized: {@link ensureWikiSources} and {@link wikiSourceIndexSync} own the
// cache. Measured on the real bake: 1,371,814 loot rows, 660 ms, ~230 MB retained.
export function buildWikiSourceIndex(ds: DataStore): WikiSourceIndex {
  const t0 = performance.now();
  const loot = new Map<number, Bucket>();
  const flat = new Map<number, WikiSource[]>();
  let lootRows = 0;

  const creaturesByLootId = new Map<number, number[]>();
  for (const c of ds.creatures()) {
    if (!c.lootId) continue;
    const list = creaturesByLootId.get(c.lootId);
    if (list) list.push(c.entry);
    else creaturesByLootId.set(c.lootId, [c.entry]);
  }
  const objectsByLootId = new Map<number, number[]>();
  for (const go of ds.gameObjects()) {
    if (!go.lootId) continue;
    const list = objectsByLootId.get(go.lootId);
    if (list) list.push(go.entry);
    else objectsByLootId.set(go.lootId, [go.entry]);
  }
  const { byKey: nodesByKey, skinCreatures } = reachableNodes(ds);

  for (const key of ds.lootTemplateIds()) {
    const parsed = parseKey(key);
    if (!parsed) continue;
    const rows = ds.lootTable(key);
    lootRows += rows.length;
    // Who this table hangs off. An unreferenced table (a pure reference_loot row) yields
    // nothing to show, so it is skipped rather than reported as a nameless source.
    const holders: WikiSource[] = [];
    if (parsed.kind === 'creature') {
      for (const ce of creaturesByLootId.get(parsed.id) ?? []) holders.push({ kind: 'drop', ref: ce });
    } else if (parsed.kind === 'object') {
      for (const ge of objectsByLootId.get(parsed.id) ?? []) holders.push({ kind: 'object', ref: ge });
      for (const n of nodesByKey.get(`go:${parsed.id}`) ?? []) holders.push({ kind: 'gather', ref: n.node.id, zone: n.zone });
    } else if (parsed.kind === 'skin') {
      for (const n of nodesByKey.get(`skinning:${parsed.id}`) ?? []) {
        for (const ce of skinCreatures.get(n.node.id) ?? []) holders.push({ kind: 'skin', ref: ce });
      }
    } else if (parsed.kind === 'fishing') {
      for (const n of nodesByKey.get(`fishing:${parsed.id}`) ?? []) holders.push({ kind: 'fishing', ref: n.node.id, zone: n.zone });
    } else {
      holders.push({ kind: parsed.kind, ref: parsed.id });
    }
    if (!holders.length) continue;
    for (const row of rows) {
      for (const h of holders) {
        addLoot(loot, row.item, {
          ...h,
          chance: Math.abs(row.chance),
          minCount: row.minCount,
          maxCount: row.maxCount,
          ...(row.chance < 0 || row.questRequired ? { questOnly: true } : {}),
        });
      }
    }
  }

  for (const v of ds.vendors()) {
    for (const item of v.items) addFlat(flat, item, { kind: 'vendor', ref: v.entry });
  }
  const starts = new Map<number, number[]>();
  const ends = new Map<number, number[]>();
  const link = (m: Map<number, number[]>, ce: number, quest: number): void => {
    const list = m.get(ce);
    if (list) { if (!list.includes(quest)) list.push(quest); }
    else m.set(ce, [quest]);
  };
  for (const q of ds.quests()) {
    for (const it of q.rewItems ?? []) addFlat(flat, it.item, { kind: 'quest-reward', ref: q.entry });
    for (const it of q.rewChoiceItems ?? []) addFlat(flat, it.item, { kind: 'quest-reward', ref: q.entry, choice: true });
    for (const it of q.itemTargets ?? []) addFlat(flat, it.item, { kind: 'quest-objective', ref: q.entry });
    for (const ce of q.starterCreatureEntries ?? []) link(starts, ce, q.entry);
    for (const ce of q.enderCreatureEntries ?? []) link(ends, ce, q.entry);
  }
  const reagentOf = new Map<number, number[]>();
  for (const r of ds.recipes()) {
    addFlat(flat, r.product.item, { kind: 'crafted', ref: r.id });
    if (r.recipeItem) addFlat(flat, r.recipeItem, { kind: 'crafted', ref: r.id });
    for (const g of r.reagents) {
      const list = reagentOf.get(g.item);
      if (list) { if (!list.includes(r.id)) list.push(r.id); }
      else reagentOf.set(g.item, [r.id]);
    }
  }

  // Reverse "how do I get this spell". Four independent paths, one pass each.
  const spellTrainers = new Map<number, number[]>();
  const spellItems = new Map<number, number[]>();
  const spellTalents = new Map<number, number[]>();
  const spellQuests = new Map<number, number[]>();
  const bind = (m: Map<number, number[]>, spell: number, ref: number): void => {
    const list = m.get(spell);
    if (list) { if (!list.includes(ref)) list.push(ref); }
    else m.set(spell, [ref]);
  };
  for (const tr of ds.trainers()) {
    for (const ts of tr.spells) bind(spellTrainers, ts.spell, tr.entry);
  }
  for (const it of ds.items()) {
    if (it.startQuest) addFlat(flat, it.entry, { kind: 'starts-quest', ref: it.startQuest });
    if (it.useSpell) bind(spellItems, it.useSpell, it.entry);
    if (it.teachPetSpell) bind(spellItems, it.teachPetSpell, it.entry);
    for (const sp of it.equipSpells ?? []) bind(spellItems, sp, it.entry);
  }
  for (const cls of [1, 2, 3, 4, 5, 7, 8, 9, 11]) {
    for (const tree of ds.talentTrees(cls)) {
      for (const tal of tree.talents) {
        for (const r of tal.ranks) bind(spellTalents, r.spellId, tal.id);
      }
    }
  }
  for (const q of ds.quests()) {
    for (const sp of q.rewSpells ?? []) bind(spellQuests, sp, q.entry);
    if ((q.rewSpellCast ?? 0) > 0) bind(spellQuests, q.rewSpellCast!, q.entry);
  }

  // Loot first (highest chance first), then the deterministic paths.
  const ORDER: Readonly<Record<WikiSourceKind, number>> = {
    drop: 0, object: 1, gather: 2, skin: 3, fishing: 4, pickpocket: 5, container: 6,
    disenchant: 7, spell: 8, mail: 9, vendor: 10, crafted: 11, 'quest-reward': 12,
    'quest-objective': 13, 'starts-quest': 14,
  };
  const empty = { sources: [] as readonly WikiSource[], more: 0 };
  return {
    itemSources: (item) => {
      const b = loot.get(item);
      const f = flat.get(item);
      if (!b && !f) return empty;
      const sources = [...(b?.list ?? []), ...(f ?? [])].sort((x, y) =>
        (ORDER[x.kind] - ORDER[y.kind]) || ((y.chance ?? 0) - (x.chance ?? 0)) || (x.ref - y.ref));
      return { sources, more: Math.max(0, (b?.total ?? 0) - (b?.list.length ?? 0)) };
    },
    questsForCreature: (entry) => ({ starts: starts.get(entry) ?? [], ends: ends.get(entry) ?? [] }),
    reagentFor: (item) => reagentOf.get(item) ?? [],
    spellSources: (spellId) => ({
      trainers: spellTrainers.get(spellId) ?? [],
      items: spellItems.get(spellId) ?? [],
      talents: spellTalents.get(spellId) ?? [],
      quests: spellQuests.get(spellId) ?? [],
    }),
    buildMs: performance.now() - t0,
    lootRows,
    stats: countByKind(loot, flat),
    itemsWithSource: new Set([...loot.keys(), ...flat.keys()]).size,
  };
}

const cache = new WeakMap<DataStore, WikiSourceIndex>();
const pending = new WeakMap<DataStore, Promise<WikiSourceIndex>>();

/**
 * Build-and-cache, synchronously. Only for callers that already know the loot chunk is attached:
 * smoke and the capability ledger, which share one build rather than paying 660 ms and 230 MB
 * twice. The browser path uses {@link ensureWikiSources}, which awaits the deferred chunk first.
 */
export function wikiSourceIndexSync(ds: DataStore): WikiSourceIndex {
  let hit = cache.get(ds);
  if (!hit) cache.set(ds, (hit = buildWikiSourceIndex(ds)));
  return hit;
}

/** The index if it is already built, else null. Never blocks. */
export function wikiSourcesNow(ds: DataStore): WikiSourceIndex | null {
  return cache.get(ds) ?? null;
}

/** True while a build is in flight — render a "Loading sources" state. */
export function wikiSourcesLoading(ds: DataStore): boolean {
  return !cache.has(ds) && pending.has(ds);
}

/** Build once per store, awaiting the deferred loot chunk first. Concurrent calls share one build. */
export function ensureWikiSources(ds: DataStore): Promise<WikiSourceIndex> {
  const hit = cache.get(ds);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(ds);
  if (inflight) return inflight;
  const p = ds.ensureLoot().then(() => {
    const built = buildWikiSourceIndex(ds);
    cache.set(ds, built);
    pending.delete(ds);
    return built;
  }, (err: unknown) => {
    pending.delete(ds);
    throw err;
  });
  pending.set(ds, p);
  return p;
}
