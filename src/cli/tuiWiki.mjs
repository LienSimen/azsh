// The wiki (phonecraft ui/wiki): look anything up in the data the game runs on. / searches every catalog
// (items, spells, quests, NPCs, talents, recipes, zones, dungeons, objects, factions); Tab narrows to one kind.
// A page lists what links to it (where an item drops, who sells it, which quest rewards it, who teaches a spell)
// as rows: Enter follows a link, Esc goes back. Search and sources are phonecraft's own pure indexes.
import { bold, dim, yellow, green, red, cyan, qualityPaint, wrapLines } from './text.mjs';
import { itemLines, spellLines, creatureLines, rewardLines } from './tuiViews.mjs';
import { wikiIndex, wikiTokens, wikiSearch, WIKI_KINDS, WIKI_KIND_LABEL, WIKI_KIND_ONE } from './wikiIndex.ts';
import { wikiSourceIndexSync } from './wikiSources.ts';
import { moneyText } from '../domain/economy/money.ts';
import { className } from '../domain/core/ids.ts';

const H = (text) => ({ text, header: true });
const MAX_RESULTS = 300;
const SOURCE_LABEL = {
  drop: 'Dropped by', object: 'Found in', gather: 'Gathered from', skin: 'Skinned from', pickpocket: 'Pickpocketed from',
  fishing: 'Fished in', disenchant: 'Disenchanted from', container: 'Inside', spell: 'Made by the spell', mail: 'Sent by mail',
  vendor: 'Sold by', 'quest-reward': 'Reward from', crafted: 'Crafted with', 'starts-quest': 'Starts', 'quest-objective': 'Needed for',
};

/** The search window. `query` starts it filled in (from :wiki <words>). */
export function wikiDialog(app, query = '') {
  const s = { query, kind: null };
  const view = {
    id: 'wiki', title: 'Wiki', hint: '/: search   Tab: kind',
    keys: {
      '/': { hint: 'search', fn: (a) => a.prompt('Search the wiki: ', (t) => { s.query = t; view.cursor = 0; view.scroll = 0; a.render(); }, s.query) },
      tab: { hint: 'kind', fn: () => { const i = s.kind == null ? 0 : WIKI_KINDS.indexOf(s.kind) + 1; s.kind = WIKI_KINDS[i] ?? null; view.cursor = 0; view.scroll = 0; } },
    },
    rows(a) {
      const ix = wikiIndex(a.ds);
      const tabs = [s.kind == null ? bold('[All]') : dim('All'), ...WIKI_KINDS.map((k) => (k === s.kind ? bold(`[${WIKI_KIND_LABEL[k]}]`) : dim(WIKI_KIND_LABEL[k])))].join(' ');
      const rows = [H(tabs), H(s.query ? `Search: ${yellow(s.query)}` : dim('Press / and type a name: an item, a spell, a quest, an NPC, a zone...')), H('')];
      if (!s.query.trim()) return rows;
      const pool = s.kind ? ix.byKind[s.kind] : ix.all;
      const hits = wikiSearch(pool, wikiTokens(s.query));
      if (!hits.length) rows.push(H(dim('  Nothing by that name.')));
      for (const r of hits.slice(0, MAX_RESULTS)) {
        rows.push({ text: `${linkName(a, r.kind, r.id, r.name)}  ${dim(`${s.kind ? '' : `${WIKI_KIND_ONE[r.kind]}  `}${r.sub ?? ''}`)}`, detail: () => pageLines(a, r.kind, r.id).slice(0, 40), act: (a2) => a2.push(wikiPage(a2, r.kind, r.id)) });
      }
      if (hits.length > MAX_RESULTS) rows.push(H(dim(`  ${hits.length - MAX_RESULTS} more. Narrow the search.`)));
      return rows;
    },
  };
  return view;
}

function linkName(app, kind, id, fallback) {
  if (kind === 'item') { const it = app.ds.item(id); return qualityPaint(it?.quality)(it?.name ?? fallback); }
  return fallback ?? String(id);
}

/** A link row to another page. */
function link(app, kind, id, label) {
  return { text: `  ${label}`, act: (a) => a.push(wikiPage(a, kind, id)) };
}

/** The text half of a page (no links), also used as the search detail pane. */
function pageLines(app, kind, id) {
  const ds = app.ds;
  switch (kind) {
    case 'item': return itemLines(app, ds.item(id));
    case 'spell': return ds.spell(id) ? spellLines(app, ds.spell(id)) : [`spell ${id}`];
    case 'npc': return ds.creature(id) ? creatureLines(app, ds.creature(id)) : [`creature ${id}`];
    case 'quest': {
      const q = ds.quest(id);
      if (!q) return [`quest ${id}`];
      return [bold(q.title), dim(`Level ${q.questLevel}, from level ${q.minLevel}`), '', ...wrapLines(q.objectivesText ?? '', 60), '', ...rewardLines(app, q)];
    }
    case 'recipe': {
      const r = ds.recipe(id);
      if (!r) return [`recipe ${id}`];
      return [bold(r.name), dim(`${ds.profession(r.skill)?.name ?? r.skill} ${r.orange}`), '', ...r.reagents.map((g) => `  ${g.count} ${app.itemLabel(g.item)}`)];
    }
    case 'zone': { const z = ds.zone(id); return z ? [bold(z.name), dim(`levels ${z.levelRange[0]}-${z.levelRange[1]}${z.faction ? `, ${z.faction}` : ''}`)] : [String(id)]; }
    case 'dungeon': { const d = ds.instance(id); return d ? [bold(d.name), dim(`levels ${d.levelRange[0]}-${d.levelRange[1]}, from ${d.minLevel}${d.maxPlayers ? `, ${d.maxPlayers} players` : ''}`), ...(d.description ? ['', ...wrapLines(d.description, 60)] : [])] : [String(id)]; }
    case 'object': { const o = ds.gameObject(id); return o ? [bold(o.name), dim(`object type ${o.type}`)] : [`object ${id}`]; }
    case 'faction': { const f = ds.faction(id); return f ? [bold(f.name), '', ...wrapLines(f.description ?? '', 60)] : [`faction ${id}`]; }
    case 'talent': {
      const t = ds.talent(id);
      if (!t) return [`talent ${id}`];
      return [bold(t.name), dim(`${t.maxRank} rank${t.maxRank === 1 ? '' : 's'}, tier ${t.tier + 1}`), '', ...wrapLines(t.ranks?.[t.maxRank - 1]?.description ?? t.ranks?.[0]?.description ?? '', 60)];
    }
    default: return [String(id)];
  }
}

/** The links half of a page. */
function pageLinks(app, kind, id) {
  const ds = app.ds;
  const src = wikiSourceIndexSync(ds);
  const rows = [];
  const section = (title, list) => { if (list.length) rows.push(H(''), H(cyan(title)), ...list); };
  if (kind === 'item') {
    const { sources, more } = src.itemSources(id);
    const byKind = new Map();
    for (const s of sources) { if (!byKind.has(s.kind)) byKind.set(s.kind, []); byKind.get(s.kind).push(s); }
    for (const [k, list] of byKind) {
      section(SOURCE_LABEL[k] ?? k, list.map((s) => {
        const pct = s.chance != null ? dim(`  ${Math.round(s.chance * 10) / 10}%${s.questOnly ? ' (quest)' : ''}`) : '';
        const count = s.minCount && (s.minCount > 1 || s.maxCount > 1) ? dim(`  x${s.minCount === s.maxCount ? s.minCount : `${s.minCount}-${s.maxCount}`}`) : '';
        if (k === 'drop' || k === 'skin' || k === 'pickpocket' || k === 'vendor') return link(app, 'npc', s.ref, `${ds.creature(s.ref)?.name ?? ds.vendor?.(s.ref)?.name ?? s.ref}${pct}${count}`);
        if (k === 'object' || k === 'fishing') return ds.gameObject(s.ref) ? link(app, 'object', s.ref, `${ds.gameObject(s.ref).name}${pct}${count}`) : H(`  ${s.zone ?? s.ref}${pct}`);
        if (k === 'quest-reward' || k === 'starts-quest' || k === 'quest-objective') return link(app, 'quest', s.ref, `${ds.quest(s.ref)?.title ?? s.ref}${s.choice ? dim('  (a choice)') : ''}`);
        if (k === 'crafted') return link(app, 'recipe', s.ref, ds.recipe(s.ref)?.name ?? String(s.ref));
        if (k === 'container' || k === 'disenchant') return link(app, 'item', s.ref, `${app.itemLabel(s.ref)}${pct}${count}`);
        if (k === 'spell') return link(app, 'spell', s.ref, ds.spell(s.ref)?.name ?? String(s.ref));
        if (k === 'gather') return H(`  ${ds.gatherNode?.(s.ref)?.name ?? `node ${s.ref}`}${s.zone ? dim(`  ${ds.zone(s.zone)?.name ?? s.zone}`) : ''}${pct}`);
        return H(`  ${s.ref}${pct}`);
      }));
    }
    if (more) rows.push(H(dim(`  and ${more} more drops`)));
    section('Reagent for', src.reagentFor(id).map((r) => link(app, 'recipe', r, ds.recipe(r)?.name ?? String(r))));
    const it = ds.item(id);
    if (it?.teachRecipe) section('Teaches', [link(app, 'recipe', it.teachRecipe, ds.recipe(it.teachRecipe)?.name ?? String(it.teachRecipe))]);
    if (it?.startQuest) section('Starts', [link(app, 'quest', it.startQuest, ds.quest(it.startQuest)?.title ?? String(it.startQuest))]);
  } else if (kind === 'spell') {
    const s = src.spellSources(id);
    section('Taught by', s.trainers.map((e) => link(app, 'npc', e, ds.creature(e)?.name ?? ds.trainer(e)?.name ?? String(e))));
    section('From the item', s.items.map((e) => link(app, 'item', e, app.itemLabel(e))));
    section('From the talent', s.talents.map((t) => link(app, 'talent', t, ds.talent(t)?.name ?? String(t))));
    section('Reward from', s.quests.map((q) => link(app, 'quest', q, ds.quest(q)?.title ?? String(q))));
  } else if (kind === 'npc') {
    const q = src.questsForCreature(id);
    section('Starts', q.starts.map((e) => link(app, 'quest', e, ds.quest(e)?.title ?? String(e))));
    section('Ends', q.ends.map((e) => link(app, 'quest', e, ds.quest(e)?.title ?? String(e))));
    const v = ds.vendor(id);
    if (v) section('Sells', v.items.slice(0, 60).map((e) => link(app, 'item', e, app.itemLabel(e))));
  } else if (kind === 'quest') {
    const q = ds.quest(id);
    if (q) {
      section('Kill', q.killTargets.map((k) => link(app, 'npc', k.creatureEntry, `${ds.creature(k.creatureEntry)?.name ?? k.creatureEntry} x${k.count}`)));
      section('Bring', (q.itemTargets ?? []).map((k) => link(app, 'item', k.item, `${app.itemLabel(k.item)} x${k.count}`)));
      section('Rewards', [...q.rewItems, ...(q.rewChoiceItems ?? [])].map((r) => link(app, 'item', r.item, `${app.itemLabel(r.item)}${r.count > 1 ? ` x${r.count}` : ''}`)));
      section('Teaches', (q.rewSpells ?? []).map((sp) => link(app, 'spell', sp, ds.spell(sp)?.name ?? String(sp))));
      section('Reputation', (q.rewRep ?? []).filter((r) => r.value).map((r) => link(app, 'faction', r.faction, `${ds.faction(r.faction)?.name ?? r.faction} ${r.value > 0 ? '+' : ''}${r.value}`)));
      const chain = [q.prevQuest && ['Comes after', q.prevQuest], q.nextQuest && ['Leads to', q.nextQuest]].filter(Boolean);
      for (const [label, e] of chain) section(label, [link(app, 'quest', e, ds.quest(e)?.title ?? String(e))]);
      rows.push(H(''), H(dim(`From ${q.starterName || '?'}, to ${q.enderName || '?'}${q.rewMoney ? `, ${moneyText(q.rewMoney)}` : ''}`)));
    }
  } else if (kind === 'recipe') {
    const r = ds.recipe(id);
    if (r) {
      section('Makes', [link(app, 'item', r.product.item, `${app.itemLabel(r.product.item)}${r.product.count > 1 ? ` x${r.product.count}` : ''}`)]);
      section('Reagents', r.reagents.map((g) => link(app, 'item', g.item, `${app.itemLabel(g.item)} x${g.count}`)));
    }
  } else if (kind === 'zone') {
    const z = ds.zone(id);
    if (z) {
      section('Dungeons', ds.instances().filter((d) => d.portalZone === id).map((d) => link(app, 'dungeon', d.id, d.name)));
      section('Creatures', (z.huntable ?? []).map((e) => ds.creature(e)).filter(Boolean).sort((a, b) => a.level - b.level).slice(0, 80).map((c) => link(app, 'npc', c.entry, `${c.name} ${dim(`L${c.level}`)}`)));
      section('Next door', (z.neighbors ?? []).map((n) => link(app, 'zone', n, ds.zone(n)?.name ?? n)));
    }
  } else if (kind === 'dungeon') {
    const d = ds.instance(id);
    if (d) {
      section('Bosses', d.encounters.filter((e) => e.kind === 'boss').map((e) => link(app, 'npc', e.creatureEntry, e.name)));
      section('Quests', (d.quests ?? []).map((q) => link(app, 'quest', q, ds.quest(q)?.title ?? String(q))));
      if (d.portalZone) section('Entrance', [link(app, 'zone', d.portalZone, ds.zone(d.portalZone)?.name ?? d.portalZone)]);
    }
  } else if (kind === 'object') {
    const o = ds.gameObject(id);
    if (o) {
      const loot = o.lootId ? ds.lootTable(o.lootId) : [];
      section('Holds', loot.slice(0, 40).map((l) => link(app, 'item', l.item, `${app.itemLabel(l.item)}${l.chance != null ? dim(`  ${Math.abs(l.chance)}%`) : ''}`)));
      section('Starts', (o.questsStarted ?? []).map((q) => link(app, 'quest', q, ds.quest(q)?.title ?? String(q))));
      section('Ends', (o.questsEnded ?? []).map((q) => link(app, 'quest', q, ds.quest(q)?.title ?? String(q))));
    }
  }
  return rows;
}

export function wikiPage(app, kind, id) {
  return {
    id: 'wiki-page', title: `${WIKI_KIND_ONE[kind] ?? kind}`, hint: 'Enter: follow the link   Esc: back', noDetail: true,
    rows(a) {
      const rows = pageLines(a, kind, id).map((l) => H(l));
      rows.push(...pageLinks(a, kind, id));
      return rows;
    },
  };
}
