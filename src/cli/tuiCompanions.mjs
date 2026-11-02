// The Companions tab: your party and bench, hiring at an inn, one page per companion (role, gear, bags,
// professions) and their gathering trips, and the squad mode that decides who fights beside you. A trimmed
// port of phonecraft's companionsPanel.ts, companionMissionsDesk.ts and squadModePicker.ts.
import { bold, dim, cyan, yellow, green, red, inverse, qualityPaint, fit, cut, plural, itemText, vis, wrapLines, coinText, coin } from './text.mjs';
import { miniIcon } from './iconArt.mjs';
import { paperdollGrid, paperdollPlan } from './tuiPaperdoll.mjs';
import { itemLines } from './tuiViews.mjs';
import { recipeBook, openSendGoods, companionsOf } from './tuiProfessions.mjs';
import { SQUAD_MODES, SQUAD_MODE_LABEL, squadModeOf, setSquadMode } from './squad.mjs';
import { settingsRows, petRows, questRows, teachRow, bagRows, bankRows, shareDialog, vaultDialog, hireSearch, tavernDuel } from './tuiCompanionKit.mjs';
import { barsDialog, companionBarsOwner } from './tuiBars.mjs';
import { enchantLines } from './tuiGear.mjs';
import { className, raceName } from '../domain/core/ids.ts';
import { paperdollArt } from './paperdoll.mjs';
import { bagCapacity, EQUIP_SLOTS, SLOT_LABEL, itemSlotTargets } from '../domain/items/equipment.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { companionCharacter, companionLevel, hireSkillMap, MAX_COMPANIONS, SQUAD_ROLES } from '../domain/bots/squad.ts';
import { companionEquipOpts } from '../domain/professions/autoDisenchant.ts';
import { companionSkillCap, companionTrainedRank, SECONDARY_SKILLS } from '../domain/bots/botProfessions.ts';
import { displayGearScore, gearProfileLabel, hireCostCopper } from '../domain/bots/companionHireCost.ts';
import { GEAR_PROFILES } from '../domain/bots/botGear.ts';
import { searchWorldBots, innZoneSalt, pickProfile, WORLD_BOT_COUNT } from '../domain/bots/botPool.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';
import { effectiveStats, effectiveArmor, attackPower, powerType } from '../domain/character/characterStats.ts';
import { critChanceDisplay, dodgeChanceDisplay, hitChance } from '../domain/character/characterRatings.ts';
import {
  canCompanionLearnProfession, countDoneMissions, hoursAffordable, isMissionSkill, missionEtaLabel, missionHoursLabel,
  missionProgress, missionVerb, energyResetsAtMs, MAX_COMPANION_ENERGY,
} from '../domain/bots/companionMissions.ts';

const H = (text) => ({ text, header: true });
const ROLE_PAINT = { tank: cyan, healer: green, dps: red };
const roleText = (role) => (ROLE_PAINT[role] ?? dim)(role);

function findComp(app, id) { return companionsOf(app.g).find((c) => c.id === id) ?? null; }
function isSeated(app, id) { return (app.g.state.squad ?? []).some((c) => c.id === id); }

function awayText(app, comp) {
  if (!comp.mission) return '';
  const p = missionProgress(comp.mission, Date.now());
  return `${missionVerb(comp.mission.skill)} in ${app.ds.zone(comp.mission.zoneId)?.name ?? comp.mission.zoneId}, ${p.done ? 'back' : missionEtaLabel(p)}`;
}

// Short trade names for the one-line lists; the pages spell them out.
const PROF_SHORT = {
  mining: 'Mining', herbalism: 'Herb', skinning: 'Skin', blacksmithing: 'Smith', leatherworking: 'Leather', tailoring: 'Tailor',
  engineering: 'Engi', alchemy: 'Alchemy', enchanting: 'Enchant', cooking: 'Cook', firstaid: 'First Aid', fishing: 'Fish',
};
const isSecondary = (line) => SECONDARY_SKILLS.includes(line);

// Primaries first, then Cooking, First Aid and Fishing.
function sortLines(lines) { return [...lines].sort((x, y) => Number(isSecondary(x.line)) - Number(isSecondary(y.line))); }

function compProfLines(app, comp) { return sortLines(app.g.companionProfessionsOf(comp.id)?.lines ?? []); }

/** What a hire arrives knowing: the same seed roll companionSkillMap makes once they are yours. */
function candProfLines(c) {
  const skills = hireSkillMap(c.bot.seed, c.bot.level, c.gearProfile);
  return sortLines(Object.entries(skills).map(([line, v]) => ({ line, current: v.current, max: v.max, rank: companionTrainedRank(line, v.current, c.bot.level)?.name })));
}

function profTags(lines) {
  if (!lines.length) return dim('no trades');
  return lines.map((l) => { const t = `${PROF_SHORT[l.line] ?? l.line} ${l.current}`; return isSecondary(l.line) ? dim(t) : t; }).join(dim(' · '));
}

function profLines(app, lines) {
  if (!lines.length) return [`  ${dim('none')}`];
  return lines.map((l) => { const prof = app.ds.profession(l.line); return paneLine(app, `  ${miniIcon(prof?.icon)}${fit(prof?.name ?? l.line, 15)} ${fit(`${l.current}/${l.max}`, 8)} ${dim(l.rank ?? '')}`); });
}

/** A detail-pane line kept to one row: a mini icon (sixel) is blank cells the pane's wrap would squeeze. */
function paneLine(app, line) { const w = (app.layout?.().detailW ?? 0) - 2; return w > 0 && vis(line) > w ? cut(line, w) : line; }

/** What a piece is, for the line under its name: Plate  412 armor, Sword  41-77. */
function gearKind(it) { return it ? [it.typeName, it.armor ? `${it.armor} armor` : '', it.weapon ? `${it.weapon.dmgMin}-${it.weapon.dmgMax}` : ''].filter(Boolean).join('  ') : ''; }

function statLines(app, char) {
  const ds = app.ds, st = effectiveStats(char, ds), pt = powerType(char);
  return [
    `  Health ${maxHealth(char, ds)}   ${pt[0].toUpperCase() + pt.slice(1)} ${maxPower(char, ds)}`,
    `  Str ${st.str}  Agi ${st.agi}  Sta ${st.sta}  Int ${st.int}  Spi ${st.spi}`,
    `  Armor ${effectiveArmor(char, ds)}  AP ${attackPower(char, ds)}  Crit ${(critChanceDisplay(char, ds) * 100).toFixed(1)}%  Dodge ${(dodgeChanceDisplay(char, ds) * 100).toFixed(1)}%`,
  ];
}

function statRows(app, char, note) {
  const lines = statLines(app, char);
  return lines.map((l) => ({ text: l.trim(), detail: () => withArt(app, char, [bold('Stats'), '', ...lines, '', dim(note)]) }));
}

/** The text, then `subject` (a companion, a candidate's body, any { race, gender, name, equipped }) drawn in their gear under it when the pane has room. */
function withArt(app, subject, text) {
  const L = app.layout(), w = L.detailW - 2;
  const used = text.reduce((n, line) => n + (vis(line) > w ? wrapLines(line, w).length : 1), 0); // as the pane wraps them
  const art = paperdollArt(subject, w, L.mainH - used - 1);
  return art ? [...text, '', ...art] : text;
}

function wornLines(app, gear) {
  const out = [];
  for (const slot of EQUIP_SLOTS) {
    const e = equippedEntry(gear?.[slot]);
    if (e != null) { const it = app.ds.item(e); out.push(paneLine(app, `  ${miniIcon(it?.icon)}${fit(SLOT_LABEL[slot] ?? slot, 10)} ${qualityPaint(it?.quality)(it?.name ?? e)}`)); }
  }
  return out.length ? out : [`  ${dim('nothing')}`];
}

const specOf = (app, cls, idx) => app.ds.botSpecs(cls)?.[idx];

function compLines(app, comp) {
  const lvl = companionLevel(comp, app.ch.level);
  const spec = specOf(app, comp.cls, comp.specIdx);
  const ilvl = displayGearScore(comp.equipped ?? {}, app.ds);
  const out = [bold(comp.name), `Level ${lvl} ${raceName(comp.race)} ${className(comp.cls)}`,
    `Role: ${roleText(comp.role)}${spec ? dim(`  (${spec.name})`) : ''}${ilvl ? dim(`  item level ~${ilvl}`) : ''}`,
    isSeated(app, comp.id) ? green('In your party') : dim('On the bench')];
  if (comp.mission) out.push(yellow(awayText(app, comp)));
  out.push('', cyan('Professions'), ...profLines(app, compProfLines(app, comp)));
  out.push('', cyan('Stats'), ...statLines(app, companionCharacter(comp, lvl, app.ds)));
  out.push('', cyan('Wearing'), ...wornLines(app, comp.equipped));
  return out;
}

// ---- the tab ------------------------------------------------------------------------------------------

export function companionsView(app) {
  const collectAll = (a) => {
    const r = a.g.collectAllCompanionMissions(Date.now());
    if (!r.ok || !r.collected.length) { a.flashMsg('Nobody is back from a trip yet.'); return; }
    for (const c of r.collected) a.say(green(`${c.name} is back: ${yieldText(a, c.yielded)}.`) + (c.skillUp ? cyan(`  +${c.skillUp} skill.`) : ''));
  };
  const gearAll = (a) => {
    if (!a.g.squadUpgradePlan().length) { a.flashMsg('No upgrades for anyone in your bags, your bank or theirs.'); return; }
    const r = a.g.applySquadUpgrades();
    a.result(r, `Your companions put on ${plural(r.equipped ?? 0, 'upgrade')}.`);
  };
  return {
    id: 'companions', title: 'Companions', hint: 'Enter: open',
    keys: {
      g: { hint: 'send goods', fn: (a) => openSendGoods(a) },
      u: { hint: 'gear everyone', fn: gearAll },
      c: { hint: 'collect trips', fn: collectAll },
      m: { hint: 'squad mode', fn: (a) => pickSquadMode(a) },
      s: { hint: 'share consumables', fn: (a) => a.push(shareDialog(a)) },
      v: { hint: 'party storage', fn: (a) => a.push(vaultDialog(a)) },
      A: { hint: 'everyone AoE', fn: (a) => { const r = a.g.setAllCompanionsAoeMode('aoe'); const ap = a.g.autopilotConfig(); if (ap.aoeMode !== 'aoe') a.g.setAutopilotConfig({ ...ap, aoeMode: 'aoe' }); a.result(r, 'Everyone prefers area spells against two or more.'); } },
    },
    rows(a) {
      const g = a.g, squad = g.state.squad ?? [], bench = Object.values(g.state.botRoster ?? {});
      const energy = g.companionPartyEnergy(Date.now());
      const rows = [H(`Party ${squad.length}/${MAX_COMPANIONS}   ${dim(`trip energy ${energy}/${MAX_COMPANION_ENERGY}`)}   ${coinText(a.ch.gold)}`), squadModeRow(a)];
      const row = (c) => ({
        text: `${fit(c.name, 12)} ${fit(dim(`L${companionLevel(c, a.ch.level)} ${className(c.cls)}`), 12)} ${fit(roleText(c.role), 6)} ${c.mission ? yellow('away ') : ''}${profTags(compProfLines(a, c))}`,
        detail: () => withArt(a, c, [...compLines(a, c), '', dim('Enter: open their page')]), // them in their gear
        act: () => a.push(companionDialog(a, c.id)),
      });
      if (!squad.length && !bench.length) rows.push(H(''), H(dim('  You travel alone. Innkeepers hire out companions: they fight beside you, carry and craft.')));
      rows.push(...squad.map(row));
      if (bench.length) rows.push(H(''), H(`Bench (${bench.length})`), ...bench.map(row));
      const inn = g.innkeeperHere();
      rows.push(H(''), H('Hire'));
      if (inn) {
        const n = hirePool(a).list.length;
        rows.push({ text: `Hire a companion at ${inn.name} ${dim(`(${plural(n, 'face')})`)}`, detail: () => [bold(inn.name), 'Innkeeper', '', `${plural(n, 'adventurer')} of your faction looking for work, every level, sorted by role and kit. A hire joins at their own level in their own gear; a bench companion comes back free.`], act: () => a.push(hireDialog(a)) });
      } else rows.push(H(dim('  No inn here. Companions are hired from innkeepers (Goldshire, Razor Hill, every capital).')));
      if (squad.length || bench.length) {
        const ups = g.squadUpgradePlan().length;
        const back = countDoneMissions(squad, g.state.botRoster, Date.now());
        rows.push(H(''), H('Everyone'));
        rows.push({ text: `Put on every upgrade ${ups ? green(`(${ups})`) : dim('(none)')} ${dim('u')}`, detail: () => [bold('Gear everyone'), '', 'Each companion, party and bench, takes the best piece for them out of their own bags, your bags and your bank. Shared items go to whoever gains the most.'], act: () => gearAll(a) });
        rows.push({ text: `Send trade goods and upgrades ${dim('g')}`, detail: () => [bold('Send goods'), '', 'Ore, herbs, leather and cloth go to the companions whose recipes use them; you review the list first.'], act: () => openSendGoods(a) });
        rows.push({ text: `Share consumables ${dim('s')}`, detail: () => [bold('Share consumables'), '', 'Potions, elixirs, food buffs, coats, devices, bandages, ammo and reagents from your bags, split to whoever gains the most, or by your rules.'], act: () => a.push(shareDialog(a)) });
        rows.push({ text: `Party storage ${dim('v')}`, detail: () => [bold('Party storage'), '', 'Everything your companions carry and bank, by item. Take any of it back.'], act: () => a.push(vaultDialog(a)) });
        rows.push({ text: `Collect finished trips ${back ? green(`(${back} back)`) : dim('(none back)')} ${dim('c')}`, detail: () => [bold('Gathering trips'), '', `Energy ${energy}/${MAX_COMPANION_ENERGY}, refills at ${new Date(energyResetsAtMs(Date.now())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`], act: () => collectAll(a) });
      }
      return rows;
    },
  };
}

/** Solo, elite support or party: the three autopilot knobs every world fight reads. */
export function pickSquadMode(app) {
  const cur = squadModeOf(app.g.autopilotConfig());
  app.pick('How do your companions fight?', SQUAD_MODES.map((m) => ({
    label: `${m === cur ? green('● ') : '  '}${SQUAD_MODE_LABEL[m].title}`,
    detail: [bold(SQUAD_MODE_LABEL[m].title), '', SQUAD_MODE_LABEL[m].detail, '', dim('Live fights, f, the autopilot and :fight all follow it.')],
    value: m,
  })), (m) => { setSquadMode(app.g, m); app.say(green(`Squad mode: ${SQUAD_MODE_LABEL[m].title}.`)); });
}

function squadModeRow(app) {
  const mode = squadModeOf(app.g.autopilotConfig());
  const label = mode ? SQUAD_MODE_LABEL[mode] : { title: 'custom', detail: 'The autopilot knobs match none of the three modes.' };
  return {
    text: `Fights: ${cyan(label.title)} ${dim('m')}`,
    detail: () => [bold('Squad mode'), '', label.detail, '', ...SQUAD_MODES.map((m) => `${m === mode ? green('●') : dim('·')} ${SQUAD_MODE_LABEL[m].title}`), '', dim('Enter or m: change   :squad solo|elites|party')],
    act: () => pickSquadMode(app),
  };
}

function yieldText(app, rows) {
  return (rows ?? []).map((y) => `${app.itemLabel(y.item)}${y.count > 1 ? ` x${y.count}` : ''}`).join(', ') || 'nothing';
}

// ---- hiring -------------------------------------------------------------------------------------------

// Every same-faction face not already yours, from the bot pool alone: who they are, their spec, kit and
// price. Their gear is the dear part (a gear walk each, 6 s for 3000), so a face gets it when you look at
// them. The inn's own slate rolls its kits as a set, and hiring prices a slate face by that roll, so those
// faces come from the slate.
function hirePool(app) {
  const g = app.g, ch = g.state.char;
  const taken = [...(g.state.squad ?? []).map((c) => c.id), ...Object.keys(g.state.botRoster ?? {})];
  const key = `${ch.zoneId}|${ch.level}|${ch.race}|${g.innkeeperHere()?.entry}|${taken.sort().join(',')}`;
  if (app.hirePoolMemo?.g === g && app.hirePoolMemo.key === key) return app.hirePoolMemo;
  const slate = new Map(g.innCandidates().map((c) => [c.bot.id, c]));
  const salt = innZoneSalt(ch.zoneId, ch.level);
  const bots = g.innkeeperHere() ? searchWorldBots({ ds: app.ds, playerRace: ch.race, playerLevel: ch.level, zoneId: ch.zoneId, excludeIds: taken, filters: { roles: SQUAD_ROLES, limit: WORLD_BOT_COUNT } }) : [];
  const list = bots.map((bot) => slate.get(bot.id) ?? (() => {
    const spec = app.ds.botSpecs(bot.cls)?.[bot.specIdx], gearProfile = pickProfile(bot.id, salt, ch.level);
    return { bot, ...(spec ? { specName: spec.name, specRole: spec.role } : {}), gearProfile, hireCostCopper: hireCostCopper(bot.level, gearProfile) };
  })());
  app.hirePoolMemo = { g, key, list, full: new Map(), tags: new Map() };
  return app.hirePoolMemo;
}

/** A pool face with their gear on: built once, through the engine's own search so it is the body a hire gets. */
function fullCand(app, c) {
  if (c.gear) return c;
  const memo = hirePool(app);
  if (!memo.full.has(c.bot.id)) {
    const b = c.bot;
    memo.full.set(b.id, app.g.searchInnCandidates({ name: b.name, classes: [b.cls], minLevel: b.level, maxLevel: b.level, limit: WORLD_BOT_COUNT }).find((x) => x.bot.id === b.id) ?? null);
  }
  return memo.full.get(c.bot.id) ?? null;
}

function findCand(app, botId) {
  const c = [...app.g.innCandidates(), ...(app.hireResults ?? [])].find((x) => x.bot.id === botId) ?? hirePool(app).list.find((x) => x.bot.id === botId);
  return c ? fullCand(app, c) : null;
}

// The body they would bring: same shell hireCandidate builds, on their own spec, for the stat preview.
function candCharacter(app, c) {
  const b = c.bot;
  return companionCharacter({ id: b.id, name: b.name, race: b.race, cls: b.cls, gender: b.gender, role: c.specRole ?? 'dps', seed: b.seed, equipped: { ...c.gear }, level: b.level, specIdx: b.specIdx, gearProfile: c.gearProfile }, b.level, app.ds);
}

function hireText(app, c, short = false) {
  const cost = c.hireCostCopper ?? 0;
  if (!cost) return yellow('free');
  return (app.ch.gold >= cost ? yellow : red)(short ? shortMoney(cost) : coinText(cost));
}

// The two biggest coins only, for the list column: 1g 20s, 51s, 76c.
function shortMoney(copper) {
  const g = Math.floor(copper / 10000), sv = Math.floor((copper % 10000) / 100), c = copper % 100;
  if (g) return `${g}${coin('g')}${sv ? ` ${sv}${coin('s')}` : ''}`;
  if (sv) return `${sv}${coin('s')}`;
  return `${c}${coin('c')}`;
}

function candLines(app, c) {
  const b = c.bot;
  const out = [bold(b.name), `Level ${b.level} ${raceName(b.race)} ${className(b.cls)}`];
  if (c.specName) out.push(`Spec: ${c.specName}${c.specRole ? dim(`  (plays ${c.specRole})`) : ''}`);
  if (c.gearProfile) out.push(`Kit: ${gearProfileLabel(c.gearProfile)}${c.gearScore ? dim(`  item level ~${Math.round(c.gearScore)}`) : ''}`);
  out.push(`Hire: ${hireText(app, c)}`);
  out.push('', cyan('Professions'), ...profLines(app, candProfLines(c)));
  out.push('', cyan('Stats'), ...statLines(app, candCharacter(app, c)));
  out.push('', cyan('Wearing'), ...wornLines(app, c.gear));
  return out;
}

function hireAs(app, c, role) {
  const r = app.g.hireCandidate(c.bot.id, role);
  if (r.ok && app.hireResults) app.hireResults = app.hireResults.filter((x) => x.bot.id !== c.bot.id);
  return app.result(r, `${r.name ?? c.bot.name} joins you as ${role}${r.costCopper ? ` for ${coinText(r.costCopper)}` : ''}${r.benched ? ', on the bench' : ''}.`);
}

function pickRoleAndHire(app, c, after) {
  const roles = [...SQUAD_ROLES].sort((x, y) => Number(y === c.specRole) - Number(x === c.specRole));
  app.pick(`${c.bot.name}: what role?`, roles.map((r) => ({ label: `${roleText(r)}${r === c.specRole ? dim('  (their spec)') : ''}`, value: r })), (role) => { if (hireAs(app, c, role)) after?.(); });
}

// The hire list's two filters: a role tab (Left and Right) and a kit (t), each with its count under the other.
const HIRE_ROLES = [{ role: null, label: 'All' }, { role: 'dps', label: 'DPS' }, { role: 'healer', label: 'Heal' }, { role: 'tank', label: 'Tank' }];
const KIT_SHORT = { naked: 'Naked', shabby: 'Shabby', field: 'Field', twink: 'Twink', 'raid-mixed': 'Raid', 'raid-t2': 'Raid T2', 'raid-t3': 'Raid T3' };
const roleOfCand = (c) => c.specRole ?? 'dps';

function hireDialog(app, results) {
  // The kits this list has, cheapest first; t steps through them and back to any.
  const kitsOf = (list) => [null, ...GEAR_PROFILES.filter((p) => list.some((c) => c.gearProfile === p))];
  const view = {
    id: results ? 'hire-search' : 'hire', hint: 'Enter: look closer   Left Right: role',
    roleTab: 0, kit: null, placed: false,
    // The filter rows scroll off a long list; the breadcrumb keeps them in sight.
    get title() { return [results ? 'Search' : 'Hire', HIRE_ROLES[this.roleTab].role && HIRE_ROLES[this.roleTab].label, this.kit && KIT_SHORT[this.kit]].filter(Boolean).join(' · '); },
    keys: {
      h: { hint: 'hire', fn: (a, row) => { const c = row?.data && findCand(a, row.data); if (c) pickRoleAndHire(a, c); } },
      t: { hint: 'kit', fn: (a) => stepKit(a, +1) },
      T: { hint: 'kit back', fn: (a) => stepKit(a, -1) },
      '/': { hint: 'search', fn: (a) => hireSearch(a, (found) => { a.hireResults = found; a.push(hireDialog(a, found)); }) },
      D: { hint: 'duel', fn: (a, row) => { if (row?.data) tavernDuel(a, row.data); } },
    },
    onKey(a, k) {
      const d = { right: +1, tab: +1, left: -1, 'shift-tab': -1 }[k];
      if (!d) return false;
      view.roleTab = (view.roleTab + d + HIRE_ROLES.length) % HIRE_ROLES.length;
      view.placed = false;
      a.render();
      return true;
    },
    rows(a) {
      const g = a.g, all = results ?? hirePool(a).list, memo = hirePool(a);
      const squad = g.state.squad ?? [];
      const { role } = HIRE_ROLES[view.roleTab];
      const ofRole = (c) => !role || roleOfCand(c) === role, ofKit = (c) => !view.kit || c.gearProfile === view.kit;
      const list = all.filter((c) => ofRole(c) && ofKit(c));
      const roleTabs = HIRE_ROLES.map((t, i) => { const label = ` ${t.label} ${all.filter((c) => (!t.role || roleOfCand(c) === t.role) && ofKit(c)).length} `; return i === view.roleTab ? inverse(bold(label)) : dim(label); }).join(' ');
      const kitTabs = kitsOf(all).map((p) => { const label = p ? `${KIT_SHORT[p] ?? p} ${all.filter((c) => ofRole(c) && c.gearProfile === p).length}` : 'Any'; return p === view.kit ? inverse(bold(` ${label} `)) : dim(` ${label} `); });
      // Seven kits and their counts outrun the list pane at 60: they wrap onto a second row.
      const kitW = a.listWOf(view, a.layout()) - 2, kitLines = [`Kit`];
      for (const t of [...kitTabs, dim('  t')]) { if (vis(kitLines.at(-1)) + vis(t) > kitW) kitLines.push('   '); kitLines[kitLines.length - 1] += t; }
      const rows = [
        H(`${plural(list.length, 'adventurer')} for hire   ${squad.length >= MAX_COMPANIONS ? yellow('party full: a new hire goes to the bench') : dim(`party ${squad.length}/${MAX_COMPANIONS}`)}   ${coinText(a.ch.gold)}`),
        H(`${roleTabs}   ${dim('Left Right')}`), ...kitLines.map(H), H(''),
      ];
      if (!list.length) rows.push(H(dim(all.length ? '  Nobody here fits that role and kit.' : '  Nobody is looking for work here right now.')));
      for (const c of list) {
        const b = c.bot;
        if (!memo.tags.has(b.id)) memo.tags.set(b.id, profTags(candProfLines(c)));
        rows.push({
          text: `${fit(b.name, 12)} ${fit(dim(`L${b.level} ${className(b.cls)}`), 12)} ${fit(c.specRole ? roleText(c.specRole) : '', 6)} ${fit(dim(KIT_SHORT[c.gearProfile] ?? ''), 7)} ${fit(hireText(a, c, true), 7)} ${memo.tags.get(b.id)}`,
          data: b.id,
          detail: () => { const full = fullCand(a, c); return full ? withArt(a, candCharacter(a, full), [...candLines(a, full), '', dim('Enter: their page   h: hire')]) : []; },
          act: () => a.push(candidateDialog(a, b.id)),
        });
      }
      // A new list opens on your own level (the slate's window), not on the level 1s at its top.
      if (!view.placed && list.length) {
        view.placed = true;
        const at = list.findIndex((c) => c.bot.level >= a.ch.level - 2);
        view.cursor = rows.length - list.length + (at < 0 ? list.length - 1 : at);
        view.scroll = at > 0 ? view.cursor - 3 : 0; // a few lower levels above it, or the filter rows when it heads the list
      }
      return rows;
    },
  };
  const stepKit = (a, d) => {
    const kits = kitsOf(results ?? hirePool(a).list);
    view.kit = kits[(kits.indexOf(view.kit) + d + kits.length) % kits.length];
    view.placed = false;
    a.render();
  };
  return view;
}

/** One face at the inn: everything about them, and the hire buttons. */
function candidateDialog(app, botId) {
  const viewId = `cand-${botId}`;
  return {
    id: viewId, title: findCand(app, botId)?.bot.name ?? 'Hire', hint: 'Enter: choose',
    rows(a) {
      const c = findCand(a, botId);
      if (!c) { setTimeout(() => { if (a.top()?.id === viewId) a.pop(); }, 0); return [H('They are no longer looking for work.')]; }
      const b = c.bot, ds = a.ds, body = candCharacter(a, c);
      const rows = [H(`${bold(b.name)}  ${dim(`L${b.level} ${raceName(b.race)} ${className(b.cls)}`)}  ${c.specName ?? ''}  ${hireText(a, c)}`), H('')];

      // Hire: their spec's role first; any role works, it rebuilds talents and rotation.
      rows.push(H('Hire'));
      const roles = [...SQUAD_ROLES].sort((x, y) => Number(y === c.specRole) - Number(x === c.specRole));
      for (const role of roles) {
        rows.push({
          text: `Hire as ${roleText(role)} for ${hireText(a, c)}${role === c.specRole ? dim('  their spec') : ''}`,
          detail: () => withArt(a, body, [bold(`Hire ${b.name} as ${role}`), `Cost: ${hireText(a, c)}   you have ${coinText(a.ch.gold)}`,
            role === c.specRole ? dim(`They already play ${c.specName}.`) : dim('They respec for the role: talents and rotation rebuild for free.'),
            ...((a.g.state.squad ?? []).length >= MAX_COMPANIONS ? [yellow('Your party is full: they start on the bench.')] : []), dim('A released hire refunds the price.')]),
          act: () => { if (hireAs(a, c, role)) a.pop(); },
        });
      }

      rows.push(H(''), H('Professions'));
      for (const l of candProfLines(c)) {
        const prof = ds.profession(l.line);
        rows.push({
          text: `${fit(prof?.name ?? l.line, 16)} ${fit(`${l.current}/${l.max}`, 8)} ${dim(l.rank ?? '')}`,
          icon: prof?.icon, sub: dim(isSecondary(l.line) ? 'secondary' : prof?.kind ?? ''),
          detail: () => [bold(prof?.name ?? l.line), `${l.current}/${l.max}${l.rank ? `  ${l.rank}` : ''}`, '',
            isMissionSkill(l.line) ? `Once hired they can go on ${missionVerb(l.line).toLowerCase()} trips while you play.` : `Once hired they craft from their own ${prof?.name ?? l.line} recipe book with your materials.`,
            dim('Companions train for free as they level, and can swap trades later.')],
        });
      }

      rows.push(H(''), H('Stats'), ...statRows(a, body, 'With the gear they arrive in, on their own spec.'));

      rows.push(H(''), H(`Wearing ${dim(c.gearProfile ? `${gearProfileLabel(c.gearProfile)} kit` : '')}`));
      for (const slot of EQUIP_SLOTS) {
        const e = equippedEntry(c.gear?.[slot]);
        if (e == null) continue;
        const it = ds.item(e);
        rows.push({ text: `${fit(SLOT_LABEL[slot] ?? slot, 10)} ${qualityPaint(it?.quality)(it?.name ?? e)}`, icon: it?.icon, sub: dim(`${fit('', 10)} ${gearKind(it)}`), detail: () => (it ? itemLines(a, it) : []) });
      }
      return rows;
    },
  };
}

// ---- one companion ----------------------------------------------------------------------------------------

export function companionDialog(app, id) {
  return {
    id: `comp-${id}`, title: findComp(app, id)?.name ?? 'Companion', hint: 'Enter: act',
    keys: {
      c: { hint: 'character sheet', fn: (a) => a.push(companionSheet(a, id)) },
      x: { hint: 'take off / drop', fn: (a, row) => {
        const d = row?.data;
        if (d?.slot && d.it) a.result(a.g.unequipCompanionSlot(id, d.slot), `${findComp(a, id)?.name} takes off ${itemText(d.it)}.`);
        else if (d?.line) { const name = a.ds.profession(d.line)?.name ?? d.line; a.confirm(`${findComp(a, id)?.name} drops ${name}, forgetting the skill and its recipes?`, () => a.result(a.g.unlearnCompanionProfession(id, d.line), `Dropped ${name}.`)); }
      } },
    },
    rows(a) {
      const g = a.g, ds = a.ds, comp = findComp(a, id);
      if (!comp) { setTimeout(() => { if (a.top()?.id === `comp-${id}`) a.pop(); }, 0); return [H('They are gone.')]; }
      const lvl = companionLevel(comp, a.ch.level);
      const seated = isSeated(a, id);
      const spec = specOf(a, comp.cls, comp.specIdx);
      const rows = [H(`${bold(comp.name)}  ${dim(`L${lvl} ${raceName(comp.race)} ${className(comp.cls)}`)}  ${roleText(comp.role)}${spec ? dim(` ${spec.name}`) : ''}  ${seated ? green('party') : dim('bench')}`)];
      if (comp.mission) {
        rows.push({ text: yellow(awayText(a, comp)), detail: () => missionStatusLines(a, comp), act: () => a.push(missionDialog(a, id, comp.mission.skill)) });
      }
      rows.push(H(''));
      const note = (title, ...lines) => withArt(a, comp, [bold(title), '', ...lines]);
      rows.push({ text: `Character sheet ${dim('c')}`, icon: 'inv_misc_head_human_01', sub: dim('their gear on the paperdoll, and their stats'),
        detail: () => note('Character sheet', 'What they wear on the paperdoll, the way your Character tab shows you: each piece in its slot, its tooltip beside, their numbers underneath.'),
        act: () => a.push(companionSheet(a, id)) });
      rows.push({ text: `Role: ${roleText(comp.role)}`, detail: () => note('Role', 'Tank, healer or damage. Changing it is free and rebuilds their talents and rotation for the role.'),
        act: () => a.pick(`${comp.name}: what role?`, SQUAD_ROLES.map((r) => ({ label: roleText(r), value: r })), (r) => a.result(g.setCompanionRole(id, r), `${comp.name} is now your ${r}.`)) });
      rows.push(seated
        ? { text: 'Move to the bench', detail: () => note('Bench', 'They stay yours with their gear, level and bags, and come back free from any inn or right here.'), act: () => a.result(g.dismissCompanion(id), `${comp.name} waits on the bench.`) }
        : { text: green('Seat in the party'), detail: () => note('Party', `Up to ${MAX_COMPANIONS} companions travel with you.`), act: () => a.result(g.activateCompanion(id), `${comp.name} joins the party.`) });
      rows.push({ text: 'Put on their best gear', detail: () => note('Best gear', 'Strict upgrades from their own bags first, then from yours. What you hand over becomes theirs.'), act: () => { const r = g.equipCompanionBest(id); a.result(r, r.equipped ? `${comp.name} puts on ${plural(r.equipped, 'piece')}.` : `${comp.name} already wears the best they can.`); } });
      rows.push({ text: 'Give them something from your bags…', detail: () => note('Give', 'Anything you hand over is theirs. A Plans or Pattern they can use is learned on the spot.'), act: () => giveDialog(a, id) });
      rows.push(...teachRow(a, comp));
      rows.push({ text: 'Action bars…', detail: () => note('Action bars', 'Their kit: what they can fire when you take them over, and the bag items their autopilot preps with.'), act: () => a.push(barsDialog(a, (x) => companionBarsOwner(x, findComp(x, id)))) });
      rows.push(...settingsRows(a, comp));
      rows.push(...petRows(a, comp));
      rows.push(...questRows(a, comp));

      // Professions: Enter opens their book (crafting) or trips (gathering); x drops one.
      const profs = g.companionProfessionsOf(id);
      rows.push(H(''), H(`Professions${profs ? dim(`  (up to 2 primary)`) : ''}`));
      for (const l of sortLines(profs?.lines ?? [])) {
        const prof = ds.profession(l.line);
        rows.push({
          text: `${fit(prof?.name ?? l.line, 16)} ${fit(`${l.current}/${l.max}`, 8)} ${dim(l.rank ?? '')}${comp.mission?.skill === l.line ? yellow('  away') : ''}`, data: { line: l.line },
          icon: prof?.icon, sub: dim(`${isSecondary(l.line) ? 'secondary' : prof?.kind ?? ''}   ${isMissionSkill(l.line) ? 'Enter: trips' : 'Enter: recipe book'}`),
          detail: () => [bold(prof?.name ?? l.line), `${l.current}/${l.max}${l.rank ? `  ${l.rank}` : ''}`, '', dim(isMissionSkill(l.line) ? 'Enter: smelting and gathering trips' : 'Enter: their recipe book'), dim('x: drop it')],
          act: () => a.push(recipeBook(a, id, l.line)),
        });
      }
      rows.push({ text: dim('Take up a profession…'), detail: () => [bold('New profession'), '', 'Companions train for free. They hold two primary professions like you; Cooking, First Aid and Fishing are extra.'], act: () => {
        const have = new Set((profs?.lines ?? []).map((l) => l.line));
        const opts = ds.professions().filter((p) => !have.has(p.id) && p.id !== 'poisons').sort((x, y) => x.name.localeCompare(y.name)).map((p) => {
          // A primary line has no rank before level 5 and companionSkillMap drops it, so learning it would vanish.
          const ok = companionSkillCap(p.id, 1, lvl) <= 0 ? { ok: false, reason: 'trains at level 5' } : canCompanionLearnProfession(comp, p.id, ds);
          return { label: `${ok.ok ? p.name : dim(p.name)} ${dim(p.kind)}${ok.ok ? '' : red(`  ${ok.reason}`)}`, value: p };
        });
        a.pick(`${comp.name} takes up…`, opts, (p) => a.result(g.learnCompanionProfession(id, p.id), `${comp.name} takes up ${p.name}.`));
      } });

      const ilvl = displayGearScore(comp.equipped ?? {}, ds);
      rows.push(H(''), H('Stats'), ...statRows(a, companionCharacter(comp, lvl, ds), 'With what they wear now, buffs aside.'));

      // Gear: Enter picks from their bags and yours, x takes it off into their bags.
      rows.push(H(''), H(`Gear${ilvl ? dim(`  item level ~${ilvl}`) : ''}   ${dim('Enter: change   x: take off')}`));
      for (const slot of EQUIP_SLOTS) {
        const e = equippedEntry(comp.equipped?.[slot]);
        const it = e != null ? ds.item(e) : null;
        rows.push({
          text: `${fit(SLOT_LABEL[slot] ?? slot, 10)} ${it ? qualityPaint(it.quality)(it.name) : dim('—')}`, data: { slot, it },
          icon: it?.icon, sub: it ? dim(`${fit('', 10)} ${gearKind(it)}`) : undefined,
          detail: () => (it ? itemLines(a, it, [...enchantLines(a, comp, slot), '', dim('Enter: change   x: take off')]) : [dim(`Nothing in the ${SLOT_LABEL[slot] ?? slot} slot.`), '', dim('Enter: pick something for them to wear')]),
          act: () => slotPicker(a, id, slot),
        });
      }

      rows.push(...bagRows(a, comp, bagCapacity(companionCharacter(comp, lvl, ds), ds)));
      rows.push(...bankRows(a, comp));

      rows.push(H(''), { text: red(`Release ${comp.name} for good`), detail: () => note('Release', 'They leave your roster for good. You get the hire price back. Their bags and gear go with them.'),
        act: () => a.confirm(`Release ${comp.name} for good? Their bags and gear go with them.`, () => { const r = g.releaseCompanions({ ids: [id] }); if (a.result(r, `${comp.name} leaves.${r.refundCopper ? ` You get ${coinText(r.refundCopper)} back.` : ''}`)) a.popTo('__none__'); }) });
      return rows;
    },
  };
}

// ---- their character sheet ------------------------------------------------------------------------------

/** Their numbers at the foot of the sheet's tooltip pane, laid out like yours under the Character tab. */
function sheetStats(app, char, w) {
  const ds = app.ds, st = effectiveStats(char, ds), pt = powerType(char);
  const pct = (x) => `${((x ?? 0) * 100).toFixed(2)}%`;
  const attrs = [['Strength', st.str], ['Agility', st.agi], ['Stamina', st.sta], ['Intellect', st.int], ['Spirit', st.spi]];
  const combat = [['Armor', effectiveArmor(char, ds)], ['Attack pwr', attackPower(char, ds)], ['Crit', pct(critChanceDisplay(char, ds))],
    ['Hit', pct(hitChance(char, ds))], ['Dodge', pct(dodgeChanceDisplay(char, ds))]];
  return [
    dim('─'.repeat(Math.max(0, w))),
    `Health ${maxHealth(char, ds)}   ${pt[0].toUpperCase() + pt.slice(1)} ${maxPower(char, ds)}`,
    '',
    ...attrs.map(([name, v], i) => `${fit(name, 10)}${String(v).padStart(5)}    ${fit(combat[i][0], 10)} ${String(combat[i][1]).padStart(7)}`),
  ];
}

function sheetTitle(app, comp) {
  const ilvl = displayGearScore(comp.equipped ?? {}, app.ds);
  return `${bold(comp.name)}  ${dim(`level ${companionLevel(comp, app.ch.level)} ${raceName(comp.race)} ${className(comp.cls)}`)}  ${roleText(comp.role)}${ilvl ? dim(`  ilvl ~${ilvl}`) : ''}`;
}

/**
 * A companion's character sheet: the Character tab's paperdoll (tuiPaperdoll.mjs) for them. Their pieces
 * framed in quality colour down both sides, them in their gear in the middle, the tooltip beside and their
 * stats at its foot. Enter picks from their bags and yours, x takes a piece off, u puts on every upgrade.
 * Too small a window or no colour, and it lists the slots with their icons instead.
 */
export function companionSheet(app, id) {
  const viewId = `sheet-${id}`;
  const hint = 'Enter: change   x: take off   u: upgrades';
  return {
    id: viewId, title: 'Character sheet', hint: 'Enter: change',
    detailFoot: (a, w) => { const c = findComp(a, id); return c ? sheetStats(a, companionCharacter(c, companionLevel(c, a.ch.level), a.ds), w) : []; },
    keys: {
      x: { hint: 'take off', fn: (a, row) => { const d = row?.data; if (d?.slot && d.it) a.result(a.g.unequipCompanionSlot(id, d.slot), `${findComp(a, id)?.name} takes off ${itemText(d.it)}.`); } },
      u: { hint: 'put on upgrades', fn: (a) => { const c = findComp(a, id), r = a.g.equipCompanionBest(id); a.result(r, r.equipped ? `${c?.name} puts on ${plural(r.equipped, 'piece')}.` : `${c?.name} already wears the best they can.`); } },
    },
    grid: (a, rows, w, h) => { const c = findComp(a, id); return c ? paperdollGrid(a, rows, w, h, (cols, lines) => paperdollArt(c, cols, lines), sheetTitle(a, c), hint) : null; },
    rows(a) {
      const ds = a.ds, comp = findComp(a, id);
      if (!comp) { setTimeout(() => { if (a.top()?.id === viewId) a.pop(); }, 0); return [H('They are gone.')]; }
      const ups = a.g.companionUpgradesFor(id);
      const rows = paperdollPlan(a, 0) ? [] : [{ text: sheetTitle(a, comp), header: true, plain: true }, H('')];
      for (const slot of EQUIP_SLOTS) {
        const e = equippedEntry(comp.equipped?.[slot]);
        const it = e != null ? ds.item(e) : null;
        const best = ups.filter((u) => u.slot === slot).sort((x, y) => y.delta - x.delta)[0];
        const bestLines = best ? ['', green(`▲ Better: ${a.itemName(best.entry)} (+${Math.round(best.delta)})${best.from === 'player' ? ', in your bags' : ', in their bags'}`), dim('Enter: pick it   u: put on every upgrade')] : [];
        rows.push({
          text: `${fit(SLOT_LABEL[slot] ?? slot, 10)} ${it ? qualityPaint(it.quality)(it.name) : dim('—')}${best ? green('  ▲') : ''}`, data: { slot, it },
          icon: it?.icon, sub: it ? dim(`${fit('', 10)} ${gearKind(it)}`) : undefined,
          cell: { slot, it, up: !!best, sub: dim(gearKind(it)) },
          detail: () => (it ? itemLines(a, it, [...enchantLines(a, comp, slot), '', dim('Enter: change   x: take off'), ...bestLines])
            : [bold(SLOT_LABEL[slot] ?? slot), dim('Nothing worn here.'), '', dim('Enter: pick something for them to wear'), ...bestLines]),
          act: () => slotPicker(a, id, slot),
        });
      }
      return rows;
    },
  };
}

/** Pick a stack from your bags to hand over. */
function giveDialog(app, id) {
  const comp = findComp(app, id);
  const st = app.g.state.inventory.stacks;
  if (!st.length) { app.flashMsg('Your bags are empty.'); return; }
  app.pick(`Give to ${comp?.name}`, st.map((s, slot) => {
    const it = app.ds.item(s.item);
    return { label: `${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}`, icon: it?.icon, sub: dim(it?.typeName ?? ''), detail: () => itemLines(app, it), value: { s, slot, it } };
  }), ({ slot, it }) => {
    const r = app.g.giveItemToBotStack(id, slot);
    app.result(r, `You give ${itemText(it, 'it')}${r.moved > 1 ? ` x${r.moved}` : ''} to ${comp?.name}.`);
    app.afterAction();
  });
}

/** What fits one of their slots, from their bags and yours. */
function slotPicker(app, id, slot) {
  const comp = findComp(app, id);
  const ds = app.ds, lvl = companionLevel(comp, app.ch.level);
  const opts = companionEquipOpts(comp, lvl, ds);
  const fits = (s) => { const it = ds.item(s.item); return it?.slot && itemSlotTargets(it, opts).includes(slot); };
  const ups = new Map(app.g.companionUpgradesFor(id).filter((u) => u.slot === slot).map((u) => [u.entry, u]));
  const options = [];
  const add = (s, from) => {
    const it = ds.item(s.item), up = ups.get(s.item);
    options.push({ label: `${qualityPaint(it.quality)(it.name)}${up ? green(`  ▲ +${Math.round(up.delta)}`) : ''}${it.requiredLevel > lvl ? red(`  L${it.requiredLevel}`) : ''}${dim(from === 'you' ? '  your bags' : '  their bags')}`, icon: it.icon, sub: dim(gearKind(it)), detail: () => itemLines(app, it), value: it });
  };
  for (const s of comp.bags?.stacks ?? []) if (fits(s)) add(s, 'them');
  for (const s of app.g.state.inventory.stacks) if (fits(s)) add(s, 'you');
  if (!options.length) { app.flashMsg(`Nothing in their bags or yours goes in the ${SLOT_LABEL[slot] ?? slot} slot.`); return; }
  app.pick(`${comp.name}: ${SLOT_LABEL[slot] ?? slot}`, options, (it) => { app.result(app.g.equipCompanionSlot(id, it.entry, slot), `${comp.name} puts on ${it.name}.`); app.afterAction(); });
}

// ---- gathering trips ------------------------------------------------------------------------------------

function missionStatusLines(app, comp) {
  const pv = app.g.previewCompanionMission(comp.id, Date.now());
  const out = [bold(awayText(app, comp)), ''];
  if (pv?.progress.done) out.push(cyan('Bringing back'), `  ${yieldText(app, pv.yielded)}`, pv.skillUp ? `  +${pv.skillUp} skill` : '');
  else out.push(dim('What they find shows when they are back.'));
  return out;
}

/** Send a companion out to mine, herb or skin for a few hours; collect or recall them. */
export function missionDialog(app, id, skill) {
  return {
    id: `trip-${id}`, title: `${missionVerb(skill)} trips`, hint: 'Enter: choose',
    rows(a) {
      const g = a.g, comp = findComp(a, id);
      if (!comp) return [H('They are gone.')];
      const now = Date.now();
      const energy = g.companionPartyEnergy(now);
      const rows = [H(`${bold(comp.name)}  ${missionVerb(skill)}   ${dim(`energy ${energy}/${MAX_COMPANION_ENERGY}, 10 an hour, refills at ${new Date(energyResetsAtMs(now)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)}`), H('')];
      if (comp.mission) {
        const p = missionProgress(comp.mission, now);
        rows.push({ text: yellow(awayText(a, comp)), header: true });
        if (p.done) rows.push({ text: green('Collect what they brought back'), detail: () => missionStatusLines(a, comp), act: () => { const r = g.collectCompanionMission(id, Date.now()); if (a.result(r, `${comp.name} is back: ${yieldText(a, r.yielded)}.`) && r.skillUp) a.say(cyan(`  +${r.skillUp} ${a.ds.profession(skill)?.name ?? skill}.`)); } });
        else rows.push({ text: red('Call them back now'), detail: () => [bold('Recall'), '', 'They come home empty-handed and the energy is not refunded.'], act: () => a.confirm(`Call ${comp.name} back? They bring nothing and the energy is spent.`, () => a.result(g.recallCompanionMission(id), `${comp.name} heads home.`)) });
        return rows;
      }
      if (!isMissionSkill(skill)) return [...rows, H(dim('Only Mining, Herbalism and Skinning have trips.'))];
      const zones = g.companionMissionZones(id, skill);
      rows.push(H(`Where to (${zones.length})`));
      if (!zones.length) rows.push(H(dim(`  Nowhere suits ${comp.name}'s skill yet.`)));
      const hours = hoursAffordable(energy);
      for (const z of zones) {
        rows.push({
          text: `${fit(z.zoneName, 22)} ${dim(z.preview.slice(0, 3).join(', '))}`,
          detail: () => [bold(z.zoneName), `${plural(z.targetCount, skill === 'skinning' ? 'kind of beast' : 'kind of node')} ${comp.name} can work`, '', ...z.preview.map((p) => `  ${p}`), '', hours ? dim('Enter: pick how long') : red('Not enough energy today.')],
          act: () => {
            if (!hours) { a.flashMsg('Not enough energy for a trip today.'); return; }
            const opts = Array.from({ length: hours }, (_, i) => ({ label: missionHoursLabel(i + 1), value: i + 1 }));
            a.pick(`${comp.name} to ${z.zoneName}: how long?`, opts, (h) => { if (a.result(g.sendCompanionOnMission(id, skill, z.zoneId, h, Date.now()), `${comp.name} sets out for ${z.zoneName} for ${plural(h, 'hour')}.`)) a.pop(); });
          },
        });
      }
      return rows;
    },
  };
}
