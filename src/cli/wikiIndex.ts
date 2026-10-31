// One searchable name index over every baked catalog, built once per DataStore.
//
// Built lazily and memoized on `ds` identity, the shape macroIconPicker.ts:26 uses: the
// catalogs are ~55k rows and a per-keystroke walk of ds.allItems() + ds.allSpells() +
// ds.creatures() re-reads every def object. Rows here hold only what SEARCH needs; the row
// renderers re-resolve the def by id (a Map hit) when they need icons or stats.
//
// Pure: no DOM, no clock, no Math.random.

import type { DataStore } from '../data/dataStore.ts';
import { CREATURE_TYPE } from '../data/schema.ts';
import { className } from '../domain/core/ids.ts';

export type WikiKind =
  | 'item' | 'spell' | 'quest' | 'npc' | 'talent' | 'recipe' | 'zone' | 'dungeon' | 'object' | 'faction';

/** Every kind the search box can return, in tab order. */
export const WIKI_KINDS: readonly WikiKind[] = [
  'item', 'spell', 'quest', 'npc', 'talent', 'recipe', 'zone', 'dungeon', 'object', 'faction',
];

export const WIKI_KIND_LABEL: Readonly<Record<WikiKind, string>> = {
  item: 'Items', spell: 'Spells', quest: 'Quests', npc: 'NPCs', talent: 'Talents',
  recipe: 'Recipes', zone: 'Zones', dungeon: 'Dungeons', object: 'Objects', faction: 'Factions',
};

/** Singular, for a detail-pane heading. */
export const WIKI_KIND_ONE: Readonly<Record<WikiKind, string>> = {
  item: 'Item', spell: 'Spell', quest: 'Quest', npc: 'NPC', talent: 'Talent',
  recipe: 'Recipe', zone: 'Zone', dungeon: 'Dungeon', object: 'Object', faction: 'Faction',
};

export interface WikiRow {
  kind: WikiKind;
  /** Numeric entry/id, except zones which are slug strings. */
  id: number | string;
  name: string;
  /** `name.toLowerCase()` (NPCs also include the trainer role), precomputed — matching reads this. */
  lower: string;
  /** Right-hand list label ("Level 60 Humanoid", "Rank 4", "ilvl 66 Sword"). */
  sub: string;
}

export interface WikiIndex {
  byKind: Readonly<Record<WikiKind, readonly WikiRow[]>>;
  /** Rows in every kind, name-sorted. Backs the "All" tab. */
  all: readonly WikiRow[];
  buildMs: number;
}

export const CREATURE_TYPE_NAME: Readonly<Record<number, string>> = {
  [CREATURE_TYPE.BEAST]: 'Beast',
  [CREATURE_TYPE.DRAGONKIN]: 'Dragonkin',
  [CREATURE_TYPE.DEMON]: 'Demon',
  [CREATURE_TYPE.ELEMENTAL]: 'Elemental',
  [CREATURE_TYPE.GIANT]: 'Giant',
  [CREATURE_TYPE.UNDEAD]: 'Undead',
  [CREATURE_TYPE.HUMANOID]: 'Humanoid',
  [CREATURE_TYPE.CRITTER]: 'Critter',
  [CREATURE_TYPE.MECHANICAL]: 'Mechanical',
};

/** What this NPC trains. Cite: TrainerDef.subname (creature_template.SubName); ProfTrainerDef.skill → ProfessionDef.name. */
export function npcTrainsLabel(ds: DataStore, entry: number): string {
  const sub = (ds.trainer(entry)?.subname ?? '').trim();
  if (sub) return sub;
  const prof = ds.profTrainer(entry);
  if (!prof) return '';
  return (ds.profession(prof.skill)?.name ?? '').trim();
}

/**
 * Same match rules as appHelpers.ts:16 fuzzyMatch, minus one redundancy: its rule 2 (a word
 * starting with the token) can never fire without rule 1 (the token appearing anywhere) also
 * firing, so a precomputed word list buys nothing. Substring, then character subsequence for
 * tokens of 4+ chars only — a bare subsequence on short tokens made the zone filter look
 * broken ("ben" matched "Boucher ... Arcane").
 */
function matchToken(lower: string, token: string): boolean {
  if (lower.includes(token)) return true;
  if (token.length < 4) return false;
  let i = 0;
  for (let c = 0; c < lower.length; c++) {
    if (lower[c] === token[i]) i++;
    if (i >= token.length) return true;
  }
  return false;
}

/** Split a raw query into lowercase tokens. Empty array = match everything. */
export function wikiTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function rowMatches(row: WikiRow, tokens: readonly string[]): boolean {
  for (const t of tokens) if (!matchToken(row.lower, t)) return false;
  return true;
}

/** Filtered rows, best first. Subsequence only when no row contains the tokens as text. */
export function wikiSearch(rows: readonly WikiRow[], tokens: readonly string[]): WikiRow[] {
  if (!tokens.length) return rows as WikiRow[];
  const q = tokens.join(" ");
  const exact: WikiRow[] = [];
  const prefix: WikiRow[] = [];
  const substr: WikiRow[] = [];
  const loose: WikiRow[] = [];
  for (const row of rows) {
    if (!rowMatches(row, tokens)) continue;
    if (row.lower === q) exact.push(row);
    else if (row.lower.startsWith(q)) prefix.push(row);
    else if (tokens.every((t) => row.lower.includes(t))) substr.push(row);
    else loose.push(row);
  }
  const tight = [...exact, ...prefix, ...substr];
  return tight.length ? tight : loose;
}

/**
 * Rows the client never shipped to a player: bracketed dev entries, `Monster - Sword, Long
 * Basic` art props, the DEPRECATED twins (there are two Thunderfurys in item_template), and the
 * Unused/Test wardrobe. 1,000-odd items and 600-odd creatures. They are real DB rows, so the
 * bake keeps them and the engine can still resolve one by id — they are only hidden from SEARCH.
 */
export function isDevRowName(name: string): boolean {
  return /^\[/.test(name)
    || /\bDEPRECATED\b/.test(name)
    || /^[(]OLD[)]|^OLD[_ ]/i.test(name)
    || /^Monster - /i.test(name)
    || /\btest\b/i.test(name)
    || /\bunused\b/i.test(name);
}

/** GAMEOBJECT_TYPE_* names we bother labelling; the rest read "Object". */
const GO_TYPE_NAME: Readonly<Record<number, string>> = {
  0: 'Door', 1: 'Button', 2: 'Quest Giver', 3: 'Chest', 6: 'Trap', 7: 'Chair',
  8: 'Spell Focus', 9: 'Text', 10: 'Goober', 11: 'Transport', 17: 'Fishing Node',
  19: 'Mailbox', 22: 'Spell Caster', 25: 'Fishing Hole',
};

/** Class ids in the client's own list order — CLASS has no 6 or 10 in vanilla. */
const CLASS_IDS: readonly number[] = [1, 2, 3, 4, 5, 7, 8, 9, 11];

function push(rows: WikiRow[], kind: WikiKind, id: number | string, name: string, sub: string): void {
  if (!name || isDevRowName(name)) return;
  rows.push({ kind, id, name, lower: name.toLowerCase(), sub });
}

function byName(a: WikiRow, b: WikiRow): number {
  return a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id));
}

/** All-tab tie-break: what a player is most likely to have meant. */
const KIND_RANK: Readonly<Record<WikiKind, number>> =
  Object.fromEntries(WIKI_KINDS.map((k, i) => [k, i])) as Record<WikiKind, number>;

function buildIndex(ds: DataStore): WikiIndex {
  const t0 = performance.now();
  const byKind: Record<WikiKind, WikiRow[]> = {
    item: [], spell: [], quest: [], npc: [], talent: [], recipe: [], zone: [], dungeon: [], object: [], faction: [],
  };

  for (const it of ds.items()) {
    const bits = [it.typeName, it.itemLevel ? `ilvl ${it.itemLevel}` : ''].filter(Boolean);
    push(byKind.item, 'item', it.entry, it.name, bits.join(' \u00b7 '));
  }
  for (const sp of ds.allSpells()) {
    const bits = [sp.rank ? `Rank ${sp.rank}` : '', sp.school].filter(Boolean);
    push(byKind.spell, 'spell', sp.id, sp.name, bits.join(' \u00b7 '));
  }
  for (const q of ds.quests()) {
    push(byKind.quest, 'quest', q.entry, q.title, q.questLevel ? `Level ${q.questLevel}` : '');
  }
  for (const c of ds.creatures()) {
    const type = CREATURE_TYPE_NAME[c.creatureType ?? 0] ?? '';
    const trains = npcTrainsLabel(ds, c.entry);
    const base = [c.level ? `Level ${c.level}` : '', type].filter(Boolean).join(' ');
    const sub = trains ? (base ? `${base} \u00b7 ${trains}` : trains) : base;
    if (!c.name || isDevRowName(c.name)) continue;
    byKind.npc.push({
      kind: 'npc',
      id: c.entry,
      name: c.name,
      lower: (trains ? `${c.name} ${trains}` : c.name).toLowerCase(),
      sub,
    });
  }
  for (const cls of CLASS_IDS) {
    for (const tree of ds.talentTrees(cls)) {
      for (const tal of tree.talents) {
        push(byKind.talent, 'talent', tal.id, tal.name, `${className(cls)} \u00b7 ${tree.name}`);
      }
    }
  }
  for (const r of ds.recipes()) {
    push(byKind.recipe, 'recipe', r.id, r.name, ds.profession(r.skill)?.name ?? r.skill);
  }
  for (const z of ds.zones()) {
    push(byKind.zone, 'zone', z.id, z.name, `Level ${z.levelRange[0]}-${z.levelRange[1]}`);
  }
  for (const d of ds.instances()) {
    const size = d.maxPlayers && d.maxPlayers > 5 ? `${d.maxPlayers}-man` : 'dungeon';
    push(byKind.dungeon, 'dungeon', d.id, d.name, `L${d.levelRange[0]}-${d.levelRange[1]} \u00b7 ${size}`);
  }
  // Objects collapse by name: creature_template has one row per placement, so the raw list is
  // 1,244 "Wooden Chair"s and 673 "Campfire"s. One row per distinct name, first entry wins.
  const goSeen = new Set<string>();
  for (const go of ds.gameObjects()) {
    if (goSeen.has(go.name)) continue;
    goSeen.add(go.name);
    push(byKind.object, 'object', go.entry, go.name, GO_TYPE_NAME[go.type] ?? 'Object');
  }
  for (const f of ds.factions()) {
    push(byKind.faction, 'faction', f.id, f.name, '');
  }

  const all: WikiRow[] = [];
  for (const kind of WIKI_KINDS) {
    byKind[kind].sort(byName);
    all.push(...byKind[kind]);
  }
  all.sort((a, b) => (KIND_RANK[a.kind] - KIND_RANK[b.kind]) || byName(a, b));
  return { byKind, all, buildMs: performance.now() - t0 };
}

const cache = new WeakMap<DataStore, WikiIndex>();

/**
 * Every catalog the index reads is attached.
 *
 * boot.ts:81 hands mountApp the store while six lazy chunks are still in flight and passes
 * `playReady` for when they land (bootData.ts:143). The character-select menu therefore paints
 * BEFORE items, creatures and quests exist, and the wiki opens from that menu: a build during
 * that window sees the 115-row boot keep set and no creatures at all. Measured on a cold vite,
 * the index came out 10,308 rows instead of 58,036.
 */
function catalogsReady(ds: DataStore): boolean {
  return ds.itemCatalogComplete() && ds.creatures().length > 0 && ds.quests().length > 0;
}

/** False while the bake is still streaming in; the view says so instead of showing a total. */
export function wikiCatalogsReady(ds: DataStore): boolean {
  return catalogsReady(ds);
}

/**
 * The index for this store, built on first use. Do not mutate the returned rows.
 *
 * Only a COMPLETE build earns the cache. A partial one would otherwise survive for the life of
 * the store, so the wiki would keep answering out of a tenth of the game after the chunks
 * landed. The rebuild-per-render cost only applies inside the boot window.
 */
export function wikiIndex(ds: DataStore): WikiIndex {
  const hit = cache.get(ds);
  if (hit) return hit;
  const built = buildIndex(ds);
  if (catalogsReady(ds)) cache.set(ds, built);
  return built;
}
