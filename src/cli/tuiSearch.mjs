// World search (s on the World tab): "where do I find X?" It starts on the zone you stand in (its vendors,
// trainers, wares, nodes, creatures); a in the window widens it to the whole world. Every place that answers is a
// row: the vendors that sell an item and the zone each stands in, the creatures that drop it, the node that
// yields it, who crafts it; an NPC by name and where it is; a dungeon and its entrance; a gather node and the
// zones it grows in; a zone, a quest, an object. Enter acts on the place: open it when you are already there
// (the vendor, the fight, the portal, the node), travel there when you are not. The matching is the wiki's
// (substring, then character subsequence), over the wiki's name index plus a gather-node index of our own.
import { bold, dim, yellow, green, red, cyan, qualityPaint, secondsText, plural } from './text.mjs';
import { wikiIndex, wikiTokens, rowMatches } from './wikiIndex.ts';
import { wikiSourceIndexSync } from './wikiSources.ts';
import { wikiPage } from './tuiWiki.mjs';
import { itemLines, creatureLines, questLines, travelPreviewLines, travelTo, vendorDialog, trainerDialog, innDialog, questDialog, conPaint } from './tuiViews.mjs';
import { profTrainerDialog } from './tuiProfessions.mjs';
import { entryDialog } from './tuiDungeon.mjs';
import { startFight } from './tuiFight.mjs';
import { moneyText } from '../domain/economy/money.ts';
import { vendorPriceMultiplierFor } from '../engine/game/vendorOffers.ts';
import { className } from '../domain/core/ids.ts';

const H = (text) => ({ text, header: true });
/** Wiki kinds a world search answers. Spells, talents and factions have no place to go to. */
const WORLD_KINDS = new Set(['item', 'npc', 'zone', 'dungeon', 'object', 'quest', 'recipe']);
const MAX_HITS = 40;
const MAX_PLACES_PER_ITEM = 8;
const SOURCE_ORDER = { vendor: 0, gather: 1, crafted: 2, fishing: 3, object: 4, drop: 5, skin: 6, pickpocket: 7, 'quest-reward': 8, container: 9, disenchant: 10, spell: 11, mail: 12 };

// ---- the place index ----------------------------------------------------------------------------------------

const cache = new WeakMap();

/** Who stands where: NPC entry → zone ids, gather node → zone ids, object entry → zone ids, plus one search row per distinct node name. */
export function placeIndex(ds) {
  const hit = cache.get(ds);
  if (hit) return hit;
  const npcZones = new Map(), nodeZones = new Map(), objectZones = new Map(), nodeRowsByName = new Map();
  const add = (map, key, zone) => { const l = map.get(key); if (l) { if (!l.includes(zone)) l.push(zone); } else map.set(key, [zone]); };
  for (const z of ds.zones()) {
    for (const t of z.trainers ?? []) add(npcZones, t.entry, z.id);
    for (const list of [z.vendors, z.profTrainers, z.weaponTrainers, z.petTrainers, z.ridingTrainers, z.huntable]) for (const e of list ?? []) add(npcZones, e, z.id);
    for (const i of z.innkeepers ?? []) add(npcZones, i.entry, z.id);
    for (const f of z.flightMasters ?? []) add(npcZones, f.entry, z.id);
    for (const o of z.objects ?? []) add(objectZones, o, z.id);
    for (const id of z.nodes ?? []) {
      const n = ds.gatherNode(id);
      if (!n) continue;
      add(nodeZones, id, z.id);
      let row = nodeRowsByName.get(n.name);
      if (!row) nodeRowsByName.set(n.name, (row = { kind: 'node', id, name: n.name, lower: n.name.toLowerCase(), sub: `${ds.profession(n.skill)?.name ?? n.skill} ${n.orange}`, ids: [], zones: [] }));
      row.ids.push(id);
      if (!row.zones.includes(z.id)) row.zones.push(z.id);
    }
  }
  const nodeRows = [...nodeRowsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const built = { npcZones, nodeZones, objectZones, nodeRows };
  cache.set(ds, built);
  return built;
}

/** The wiki's world-facing rows plus our node rows: the pool a search runs over. */
function searchPool(ds) {
  const ix = wikiIndex(ds), pi = placeIndex(ds);
  // A vein or herb is also a gameobject row in the wiki; the node row (skill, yield, zones) is the one to show.
  const nodeNames = new Set(pi.nodeRows.map((r) => r.lower));
  return [...ix.all.filter((r) => WORLD_KINDS.has(r.kind) && !(r.kind === 'object' && nodeNames.has(r.lower))), ...pi.nodeRows];
}

const zoneCache = new WeakMap();

/**
 * What one zone holds: the search pool cut to its NPCs, nodes, objects, dungeon doors and quest givers,
 * plus every item its vendors sell, its nodes yield and its creatures and objects drop, each with the
 * sources here (`items`: item entry → sources, the itemSources shape). Keyed on the wiki index so a
 * rebuilt index (catalogs arriving) rebuilds this too.
 */
export function zoneSearchIndex(ds, zoneId) {
  const ix = wikiIndex(ds);
  let byZone = zoneCache.get(ix);
  if (!byZone) zoneCache.set(ix, (byZone = new Map()));
  const hit = byZone.get(zoneId);
  if (hit) return hit;
  const z = ds.zone(zoneId), pi = placeIndex(ds);
  const nodeNames = new Set(pi.nodeRows.map((r) => r.lower));
  const items = new Map();
  const add = (item, src) => {
    const list = items.get(item);
    if (!list) { items.set(item, [src]); return; }
    const same = list.find((s) => s.kind === src.kind && s.ref === src.ref);
    if (!same) list.push(src);
    else if ((src.chance ?? 0) > (same.chance ?? 0)) Object.assign(same, src);
  };
  const loot = (key, holder) => { for (const row of ds.lootTable(key)) add(row.item, { ...holder, chance: Math.abs(row.chance), ...(row.chance < 0 || row.questRequired ? { questOnly: true } : {}) }); };
  for (const e of z?.vendors ?? []) for (const item of ds.vendor(e)?.items ?? []) add(item, { kind: 'vendor', ref: e });
  for (const id of z?.nodes ?? []) for (const y of ds.gatherNode(id)?.yield ?? []) add(y.item, { kind: 'gather', ref: id, zone: zoneId, chance: y.chance });
  for (const e of z?.huntable ?? []) { const c = ds.creature(e); if (c?.lootId) loot(c.lootId, { kind: 'drop', ref: e }); }
  for (const ge of z?.objects ?? []) { const go = ds.gameObject(ge); if (go?.lootId && !nodeNames.has(go.name.toLowerCase())) loot(`go:${go.lootId}`, { kind: 'object', ref: ge }); }
  const isHere = (r) => {
    switch (r.kind) {
      case 'item': return items.has(r.id);
      case 'npc': return (pi.npcZones.get(r.id) ?? []).includes(zoneId);
      case 'node': return r.zones.includes(zoneId);
      case 'object': return (pi.objectZones.get(r.id) ?? []).includes(zoneId);
      case 'dungeon': return ds.instance(r.id)?.portalZone === zoneId;
      case 'quest': return (ds.quest(r.id)?.starterZones ?? []).includes(zoneId);
      default: return false;
    }
  };
  const built = { pool: searchPool(ds).filter(isHere), items };
  byZone.set(zoneId, built);
  return built;
}

/**
 * wikiSearch's buckets (exact, prefix, substring, then subsequence only when nothing contains the words),
 * with one change for typos: the loose bucket ranks by how little longer the name is than what was typed,
 * so "hoger" puts Hogger first instead of forty items whose letters happen to contain h-o-g-e-r in order.
 */
export function worldSearch(pool, tokens) {
  if (!tokens.length) return [];
  const q = tokens.join(' ');
  const exact = [], prefix = [], substr = [], loose = [];
  for (const row of pool) {
    if (!rowMatches(row, tokens)) continue;
    if (row.lower === q) exact.push(row);
    else if (row.lower.startsWith(q)) prefix.push(row);
    else if (tokens.every((t) => row.lower.includes(t))) substr.push(row);
    else loose.push(row);
  }
  // Within the tight buckets a name close in length to the query wins ("deadmines": The Deadmines before
  // Deadmines Cleaver); the bucket and then the pool's kind order break ties.
  const bucket = new Map([...prefix.map((r) => [r, 0]), ...substr.map((r) => [r, 1])]);
  const order = new Map([...prefix, ...substr].map((r, i) => [r, i]));
  const closeness = (r) => r.lower.length - q.length;
  const tight = [...exact, ...[...prefix, ...substr].sort((a, b) => closeness(a) - closeness(b) || bucket.get(a) - bucket.get(b) || order.get(a) - order.get(b))];
  if (tight.length) return tight;
  return loose.sort((a, b) => (a.lower.length - b.lower.length) || a.name.localeCompare(b.name));
}

// ---- places ------------------------------------------------------------------------------------------------

/** Where an NPC stands: its zones, or the dungeon it lives in. `{ zones, dungeon }`, both possibly empty. */
function npcPlace(app, entry) {
  const zones = placeIndex(app.ds).npcZones.get(entry) ?? [];
  const dungeon = zones.length ? null : app.ds.instanceForCreature(entry) ?? null;
  return { zones, dungeon };
}

function zoneName(app, id) { return app.ds.zone(id)?.name ?? id; }

/** The zone list as a short label, the current zone first and highlighted. */
function zonesLabel(app, zones, max = 3) {
  if (!zones.length) return '';
  const here = app.ch.zoneId;
  const sorted = [...zones].sort((a, b) => (a === here ? -1 : b === here ? 1 : 0));
  const shown = sorted.slice(0, max).map((z) => (z === here ? green('here') : zoneName(app, z)));
  return shown.join(', ') + (sorted.length > max ? dim(` +${sorted.length - max} more`) : '');
}

/** Travel to a zone after a confirm that quotes the journey; or do `here()` when already standing in it. */
function goTo(app, zoneId, here) {
  if (zoneId === app.ch.zoneId) { if (here) here(); else app.flashMsg('You are already here.'); return; }
  const dest = app.ds.zone(zoneId);
  if (!dest) { app.flashMsg('No road leads there.'); return; }
  const pv = app.g.previewTravel(dest.id);
  if (!app.result(pv)) return;
  app.confirm(`Travel to ${dest.name}? ${secondsText(pv.totalSeconds * 1000)}${pv.totalCopper ? `, ${moneyText(pv.totalCopper)} in fares` : ''}`, () => travelTo(app, dest));
}

/** Enter on a place with several zones: travel to the one you pick, the current zone first. */
function goToOne(app, zones, title, here) {
  if (!zones.length) { app.flashMsg('No reachable place for that.'); return; }
  if (zones.length === 1) { goTo(app, zones[0], here); return; }
  const hereId = app.ch.zoneId;
  const sorted = [...zones].sort((a, b) => (a === hereId ? -1 : b === hereId ? 1 : 0) || zoneName(app, a).localeCompare(zoneName(app, b)));
  app.pick(title, sorted.map((z) => {
    const dest = app.ds.zone(z);
    return { label: z === hereId ? green(`${zoneName(app, z)}  (here)`) : `${zoneName(app, z)} ${dim(dest ? `levels ${dest.levelRange[0]}-${dest.levelRange[1]}` : '')}`, value: z, detail: dest ? () => travelPreviewLines(app, dest) : undefined };
  }), (z) => goTo(app, z, here));
}

function travelHint(app, zones) {
  if (!zones.length) return dim('No reachable place is known for this.');
  if (zones.includes(app.ch.zoneId)) return dim('Enter: open it here');
  const dest = app.ds.zone(zones[0]);
  const pv = dest ? app.g.previewTravel(dest.id) : null;
  if (pv && !pv.ok) return red(pv.reason);
  return dim(`Enter: travel to ${zoneName(app, zones[0])}${pv ? ` (${secondsText(pv.totalSeconds * 1000)}${pv.totalCopper ? `, ${moneyText(pv.totalCopper)}` : ''})` : ''}${zones.length > 1 ? ', or pick another zone' : ''}`);
}

// ---- rows per kind ------------------------------------------------------------------------------------------

/** A vendor/trainer/innkeeper/creature as one place row. `tag` names the role. */
function npcRow(app, entry, { indent = '', note = '' } = {}) {
  const ds = app.ds, ch = app.ch;
  const c = ds.creature(entry);
  const v = ds.vendor(entry), tr = ds.trainer(entry), pt = ds.profTrainer(entry);
  const inn = ds.zones().some((z) => (z.innkeepers ?? []).some((i) => i.entry === entry));
  const name = c?.name ?? v?.name ?? tr?.name ?? pt?.name ?? `creature ${entry}`;
  const role = v ? `<${v.subname ?? 'Vendor'}>` : pt ? `<${ds.profession(pt.skill)?.name ?? pt.skill} Trainer>` : tr ? `<${tr.subname || `${className(ds.trainerClass(entry)) || ''} Trainer`.trim()}>` : inn ? '<Innkeeper>' : c ? `L${c.level}` : '';
  const { zones, dungeon } = npcPlace(app, entry);
  const hostile = !!c && !v && !tr && !pt && !inn && (ds.zones().some((z) => z.huntable.includes(entry)) || !!dungeon);
  const where = dungeon ? `${cyan(dungeon.name)}${dungeon.portalZone ? dim(`, entrance in ${zoneName(app, dungeon.portalZone)}`) : ''}` : zonesLabel(app, zones);
  const paint = hostile && c ? conPaint(ch.level, c.level) : (s) => s;
  const here = () => {
    if (inn) { const i = (app.zone()?.innkeepers ?? []).find((x) => x.entry === entry); if (i) { app.push(innDialog(app, i)); return; } }
    if (v) { app.push(vendorDialog(app, v)); return; }
    if (pt) { app.push(profTrainerDialog(app, pt)); return; }
    if (tr) { app.push(trainerDialog(app, tr)); return; }
    if (hostile && app.zone()?.huntable.includes(entry)) { startFight(app, entry); return; }
    app.flashMsg(`${name} is around here somewhere.`);
  };
  return {
    text: `${indent}${paint(name)} ${dim(role)}${note}  ${where || dim('(nowhere you can walk to)')}`,
    data: { entry },
    detail: () => {
      const out = c && hostile ? creatureLines(app, c).filter((l) => !/Enter: fight live/.test(l)) : [bold(name), dim(role.replace(/[<>]/g, ''))];
      if (v) out.push(dim(`${v.items.length} wares${v.canRepair ? ', repairs' : ''}`));
      out.push('', cyan('Where'), ...(dungeon ? [`  ${dungeon.name}${dungeon.portalZone ? ` (entrance in ${zoneName(app, dungeon.portalZone)})` : ''}`] : zones.length ? zones.map((z) => `  ${zoneName(app, z)}${z === ch.zoneId ? green('  here') : ''}`) : [dim('  no reachable zone lists this one')]));
      out.push('', dungeon ? dim(`Enter: go to the entrance in ${zoneName(app, dungeon.portalZone)}`) : travelHint(app, zones));
      return out;
    },
    act: () => {
      if (dungeon) { goTo(app, dungeon.portalZone, () => app.push(entryDialog(app, dungeon))); return; }
      goToOne(app, zones, `Where to find ${name}`, here);
    },
  };
}

function zoneRow(app, z) {
  const here = z.id === app.ch.zoneId;
  return {
    text: `${cyan(z.name)} ${dim(`Zone  levels ${z.levelRange[0]}-${z.levelRange[1]}${z.faction ? `, ${z.faction}` : ''}`)}${here ? green('  (here)') : ''}`,
    detail: () => (here ? [bold(z.name), dim('You are here.')] : travelPreviewLines(app, z)),
    act: () => goTo(app, z.id),
  };
}

function dungeonRow(app, def) {
  const ch = app.ch, low = ch.level < def.minLevel;
  const raid = (def.maxPlayers ?? 5) > 5;
  return {
    text: `${low ? dim(def.name) : cyan(def.name)} ${dim(`Dungeon  L${def.levelRange[0]}-${def.levelRange[1]}${raid ? `, ${def.maxPlayers}-man raid` : ''}`)}${low ? red(`  requires ${def.minLevel}`) : ''}  ${dim('entrance in')} ${def.portalZone === ch.zoneId ? green(`${zoneName(app, def.portalZone)} (here)`) : zoneName(app, def.portalZone)}`,
    detail: () => {
      const bosses = def.encounters.filter((e) => e.kind === 'boss');
      return [bold(def.name), dim(`levels ${def.levelRange[0]}-${def.levelRange[1]}, requires ${def.minLevel}${raid ? `, ${def.maxPlayers} players` : ''}`), `Entrance in ${zoneName(app, def.portalZone)}`, '', cyan(`Bosses (${bosses.length})`), ...bosses.slice(0, 12).map((b) => `  ${b.name}`), ...(bosses.length > 12 ? [dim(`  and ${bosses.length - 12} more`)] : []), '', travelHint(app, [def.portalZone])];
    },
    act: () => goTo(app, def.portalZone, () => app.push(entryDialog(app, def))),
  };
}

function nodeRow(app, row, { indent = '', note = '' } = {}) {
  const ds = app.ds, n = ds.gatherNode(row.id);
  const zones = row.zones ?? placeIndex(ds).nodeZones.get(row.id) ?? [];
  const prof = ds.profession(n?.skill)?.name ?? n?.skill ?? '';
  const sk = n ? app.ch.skills[n.skill] : null;
  return {
    text: `${indent}${green(row.name)} ${dim(`${prof} ${n?.orange ?? ''}`)}${note}  ${zonesLabel(app, zones) || dim('(nowhere you can walk to)')}`,
    detail: () => {
      const out = [bold(row.name), dim(`${prof}, skill ${n?.orange ?? '?'}`), sk ? `Your ${prof}: ${sk.current}/${sk.max}` : red(`You do not know ${prof}.`), ''];
      if (n) { out.push(cyan('Yields')); for (const y of n.yield) out.push(`  ${app.itemLabel(y.item)} ${dim(`${y.minCount === y.maxCount ? y.minCount : `${y.minCount}-${y.maxCount}`}, ${y.chance}%`)}`); out.push(''); }
      out.push(cyan(`Found in (${zones.length})`), ...zones.slice(0, 14).map((z) => `  ${zoneName(app, z)}${z === app.ch.zoneId ? green('  here') : ''}`), ...(zones.length > 14 ? [dim(`  and ${zones.length - 14} more`)] : []));
      out.push('', zones.includes(app.ch.zoneId) ? dim('Enter: gather it from the World tab') : travelHint(app, zones));
      return out;
    },
    act: () => goToOne(app, zones, `Where to gather ${row.name}`, () => { app.stack = []; app.switchTab(0); app.flashMsg(`${row.name} is in this zone: see Gathering on the World tab.`); }),
  };
}

function objectRow(app, go, { indent = '', note = '', zones: given } = {}) {
  const zones = given ?? placeIndex(app.ds).objectZones.get(go.entry) ?? [];
  return {
    text: `${indent}${go.name} ${dim('Object')}${note}  ${zonesLabel(app, zones) || dim('(nowhere you can walk to)')}`,
    detail: () => [bold(go.name), dim('object'), '', cyan(`Found in (${zones.length})`), ...zones.slice(0, 14).map((z) => `  ${zoneName(app, z)}${z === app.ch.zoneId ? green('  here') : ''}`), '', travelHint(app, zones)],
    act: () => goToOne(app, zones, `Where to find ${go.name}`, () => { app.stack = []; app.switchTab(0); app.flashMsg(`${go.name} is in this zone: see Objects on the World tab.`); }),
  };
}

function questRow(app, q, { indent = '', note = '' } = {}) {
  const zones = q.starterZones ?? [];
  const qs = app.g.state.questlog.quests.find((s) => s.entry === q.entry);
  return {
    text: `${indent}${yellow('!')} ${conPaint(app.ch.level, q.questLevel)(q.title)} ${dim(`Quest L${q.questLevel}`)}${note}  ${dim('from')} ${q.starterName || '?'}${zones.length ? `, ${zonesLabel(app, zones)}` : ''}`,
    detail: () => [...questLines(app, q, qs), '', cyan('Starts in'), ...(zones.length ? zones.map((z) => `  ${zoneName(app, z)}`) : [dim('  unknown')]), '', travelHint(app, zones)],
    act: () => goToOne(app, zones, `Where ${q.title} starts`, () => app.push(questDialog(app, q, qs ? 'log' : 'offer'))),
  };
}

function recipeRow(app, r, { indent = '', note = '' } = {}) {
  const ds = app.ds, prof = ds.profession(r.skill)?.name ?? r.skill;
  const trainers = ds.zones().flatMap((z) => (z.profTrainers ?? []).filter((e) => ds.profTrainer(e)?.skill === r.skill).map((e) => ({ e, z: z.id })));
  const zones = [...new Set(trainers.map((t) => t.z))];
  return {
    text: `${indent}${r.name} ${dim(`Recipe  ${prof} ${r.orange}`)}${note}  ${zones.length ? `${dim(`${prof} trainers in`)} ${zonesLabel(app, zones)}` : ''}`,
    detail: () => [bold(r.name), dim(`${prof} ${r.orange}`), '', cyan('Makes'), `  ${app.itemLabel(r.product.item)}${r.product.count > 1 ? ` x${r.product.count}` : ''}`, '', cyan('Reagents'), ...r.reagents.map((g) => `  ${g.count} ${app.itemLabel(g.item)}`), '', dim('Enter: the wiki page (who teaches it, what it needs)')],
    act: () => app.push(wikiPage(app, 'recipe', r.id)),
  };
}

/** An item hit: the item line, then every place that gives it, best first. `only` limits it to those sources (a zone search). */
function itemRows(app, entry, only) {
  const ds = app.ds, it = ds.item(entry);
  if (!it) return [];
  const rows = [{ text: `${qualityPaint(it.quality)(bold(it.name))} ${dim(`Item${it.typeName ? `  ${it.typeName}` : ''}${it.itemLevel ? `  ilvl ${it.itemLevel}` : ''}`)}`, detail: () => [...itemLines(app, it), '', dim('Enter: the wiki page, every source')], act: () => app.push(wikiPage(app, 'item', entry)) }];
  const { sources, more } = only ? { sources: only, more: 0 } : wikiSourceIndexSync(ds).itemSources(entry);
  const here = app.ch.zoneId;
  const pi = placeIndex(ds);
  const nodeNames = new Set(pi.nodeRows.map((r) => r.lower));
  // One row per place, not per DB row: a herb is one gather source per zone and one gameobject per spawn
  // entry, and the gameobject IS the node. Same-name sources merge, their zones union, the best chance kept.
  const merged = new Map();
  for (const s of sources) {
    let zones = [], key = `${s.kind}:${s.ref}`;
    if (s.kind === 'vendor' || s.kind === 'drop' || s.kind === 'skin' || s.kind === 'pickpocket') { const p = npcPlace(app, s.ref); zones = p.zones.length ? p.zones : p.dungeon ? [p.dungeon.portalZone] : []; }
    else if (s.kind === 'gather') { const n = ds.gatherNode(s.ref); if (!n) continue; key = `gather:${n.name.toLowerCase()}`; zones = s.zone ? [s.zone] : pi.nodeZones.get(s.ref) ?? []; }
    else if (s.kind === 'object' || s.kind === 'fishing') { const go = ds.gameObject(s.ref); if (!go) continue; if (nodeNames.has(go.name.toLowerCase())) continue; key = `${s.kind}:${go.name.toLowerCase()}`; zones = pi.objectZones.get(s.ref) ?? []; }
    else if (s.kind === 'quest-reward') zones = ds.quest(s.ref)?.starterZones ?? [];
    const m = merged.get(key);
    if (m) { for (const z of zones) if (!m.zones.includes(z)) m.zones.push(z); if ((s.chance ?? 0) > (m.s.chance ?? 0)) m.s = { ...s, zone: undefined }; continue; }
    merged.set(key, { s: { ...s }, zones: [...zones] });
  }
  const placed = [...merged.values()].map((m) => ({ ...m, hereNow: m.zones.includes(here) }));
  // The reachable before the unreachable, where-you-stand first, then by kind (a shop beats a 2% drop), then by chance.
  placed.sort((a, b) => (b.zones.length > 0) - (a.zones.length > 0) || b.hereNow - a.hereNow || (SOURCE_ORDER[a.s.kind] ?? 99) - (SOURCE_ORDER[b.s.kind] ?? 99) || (b.s.chance ?? 0) - (a.s.chance ?? 0));
  const indent = '    ';
  let shown = 0;
  for (const { s, zones } of placed) {
    if (shown >= MAX_PLACES_PER_ITEM) break;
    const pct = s.chance != null ? dim(`  ${Math.round(s.chance * 10) / 10}%${s.questOnly ? ' (quest)' : ''}`) : '';
    if (s.kind === 'vendor') {
      const v = ds.vendor(s.ref);
      if (!v) continue;
      const price = it.buyPrice ? dim(`  ${moneyText(Math.floor(it.buyPrice * vendorPriceMultiplierFor(ds, app.ch, v.entry)))}`) : '';
      rows.push(npcRow(app, s.ref, { indent: `${indent}${dim('sold by')} `, note: price }));
    } else if (s.kind === 'drop' || s.kind === 'skin' || s.kind === 'pickpocket') {
      if (!ds.creature(s.ref)) continue;
      rows.push(npcRow(app, s.ref, { indent: `${indent}${dim(s.kind === 'drop' ? 'dropped by' : s.kind === 'skin' ? 'skinned from' : 'picked from')} `, note: pct }));
    } else if (s.kind === 'gather') {
      const n = ds.gatherNode(s.ref);
      if (!n) continue;
      rows.push(nodeRow(app, { id: n.id, name: n.name, zones }, { indent: `${indent}${dim('gathered from')} `, note: pct }));
    } else if (s.kind === 'object' || s.kind === 'fishing') {
      const go = ds.gameObject(s.ref);
      if (!go) continue;
      rows.push(objectRow(app, go, { indent: `${indent}${dim(s.kind === 'fishing' ? 'fished from' : 'found in')} `, note: pct, zones }));
    } else if (s.kind === 'quest-reward') {
      const q = ds.quest(s.ref);
      if (!q) continue;
      rows.push(questRow(app, q, { indent: `${indent}${dim('reward from')} `, note: s.choice ? dim('  (a choice)') : '' }));
    } else if (s.kind === 'crafted') {
      const r = ds.recipe(s.ref);
      if (!r) continue;
      rows.push(recipeRow(app, r, { indent: `${indent}${dim('crafted with')} ` }));
    } else continue;
    shown++;
  }
  const rest = placed.length - shown + more;
  if (rest > 0) rows.push({ text: `${indent}${dim(`and ${plural(rest, 'more source')}: open the wiki page`)}`, act: () => app.push(wikiPage(app, 'item', entry)) });
  if (!placed.length && !more) rows.push(H(`${indent}${dim('No known source: not sold, dropped, gathered or crafted.')}`));
  return rows;
}

/** The rows for one search hit. `zoneItems` (a zone search) keeps an item to its sources in that zone. */
function hitRows(app, r, zoneItems) {
  const ds = app.ds;
  switch (r.kind) {
    case 'item': return itemRows(app, r.id, zoneItems?.get(r.id));
    case 'npc': return [npcRow(app, r.id)];
    case 'zone': { const z = ds.zone(r.id); return z ? [zoneRow(app, z)] : []; }
    case 'dungeon': { const d = ds.instance(r.id); return d ? [dungeonRow(app, d)] : []; }
    case 'node': return [nodeRow(app, r)];
    case 'object': { const go = ds.gameObject(r.id); return go ? [objectRow(app, go)] : []; }
    case 'quest': { const q = ds.quest(r.id); return q ? [questRow(app, q)] : []; }
    case 'recipe': { const rc = ds.recipe(r.id); return rc ? [recipeRow(app, rc)] : []; }
    default: return [];
  }
}

// ---- the dialog ----------------------------------------------------------------------------------------------

/** The search window. `query` starts it filled in; `all` searches the whole world instead of the zone you stand in. */
export function worldSearchDialog(app, query = '', all = false) {
  const s = { query, all };
  const top = () => { view.cursor = 0; view.scroll = 0; };
  const view = {
    id: 'world-search', title: 'Search', hint: 'Enter: go there / open',
    keys: {
      s: { hint: 'search', fn: (a) => a.prompt(s.all ? 'Find in the world: ' : `Find in ${zoneName(a, a.ch.zoneId)}: `, (t) => { s.query = t; top(); a.render(); }, s.query) },
      a: { hint: 'this zone / all', fn: (a) => { s.all = !s.all; top(); a.flashMsg(s.all ? 'Searching the whole world.' : `Searching ${zoneName(a, a.ch.zoneId)} only.`); } },
      w: { hint: 'wiki', fn: (a, row) => { if (row?.data?.entry) a.push(wikiPage(a, 'npc', row.data.entry)); else a.flashMsg('Open the wiki with /.'); } },
    },
    rows(a) {
      const zone = zoneName(a, a.ch.zoneId);
      view.title = s.all ? 'Search the world' : `Search ${zone}`;
      const scope = s.all ? dim('   (whole world, a: this zone only)') : dim(`   (in ${zone}, a: search everywhere)`);
      const rows = [H(s.query ? `Find: ${yellow(s.query)}${scope}` : dim(`Press s and type a name: ${s.all ? 'an item, a vendor, a creature, a dungeon, an ore or herb, a zone...' : `a vendor, a trainer, an item sold or dropped in ${zone}...`}`)), H('')];
      if (!s.query.trim()) {
        if (s.all) rows.push(H(dim('  "mining pick" lists who sells one and where they stand; "copper vein" the zones it is mined in;')), H(dim('  "deadmines" the entrance; "hogger" where he prowls. Enter travels there, or opens it when you are there.')));
        else rows.push(H(dim(`  Only what is in ${zone}: its people, its wares, its nodes and creatures. Enter opens it.`)), H(dim('  a searches the whole world instead.')));
        return rows;
      }
      const zi = s.all ? null : zoneSearchIndex(a.ds, a.ch.zoneId);
      const hits = worldSearch(zi ? zi.pool : searchPool(a.ds), wikiTokens(s.query));
      if (!hits.length) { rows.push(H(dim(s.all ? '  Nothing by that name. The wiki (/) searches spells and talents too.' : `  Nothing by that name in ${zone}. Press a to search the whole world.`))); return rows; }
      for (const r of hits.slice(0, MAX_HITS)) rows.push(...hitRows(a, r, zi?.items));
      if (hits.length > MAX_HITS) rows.push(H(''), H(dim(`  ${hits.length - MAX_HITS} more matches. Narrow the search.`)));
      return rows;
    },
  };
  return view;
}

/** s on the World tab: open the search on the zone you stand in and start typing (`all`: the whole world). */
export function openWorldSearch(app, query = '', all = false) {
  const v = worldSearchDialog(app, query, all);
  app.push(v);
  if (!query) v.keys.s.fn(app);
}
