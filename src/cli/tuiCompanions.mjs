// The Companions tab: your party and bench, hiring at an inn, one page per companion (role, gear, bags,
// professions) and their gathering trips, and the squad mode that decides who fights beside you. A trimmed
// port of phonecraft's companionsPanel.ts, companionMissionsDesk.ts and squadModePicker.ts.
import { bold, dim, cyan, yellow, green, red, qualityPaint, fit, plural } from './text.mjs';
import { itemLines } from './tuiViews.mjs';
import { recipeBook, openSendGoods, companionsOf } from './tuiProfessions.mjs';
import { SQUAD_MODES, SQUAD_MODE_LABEL, squadModeOf, setSquadMode } from './squad.mjs';
import { moneyText } from '../domain/economy/money.ts';
import { className, raceName } from '../domain/core/ids.ts';
import { bagCapacity, EQUIP_SLOTS, SLOT_LABEL, itemSlotTargets } from '../domain/items/equipment.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { companionCharacter, companionLevel, hireSkillMap, MAX_COMPANIONS, SQUAD_ROLES } from '../domain/bots/squad.ts';
import { companionEquipOpts } from '../domain/professions/autoDisenchant.ts';
import { companionSkillCap, companionTrainedRank, SECONDARY_SKILLS } from '../domain/bots/botProfessions.ts';
import { displayGearScore, gearProfileLabel } from '../domain/bots/companionHireCost.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';
import { effectiveStats, effectiveArmor, attackPower, powerType } from '../domain/character/characterStats.ts';
import { critChanceDisplay, dodgeChanceDisplay } from '../domain/character/characterRatings.ts';
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
  return lines.map((l) => `  ${fit(app.ds.profession(l.line)?.name ?? l.line, 15)} ${fit(`${l.current}/${l.max}`, 8)} ${dim(l.rank ?? '')}`);
}

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
  return lines.map((l) => ({ text: l.trim(), detail: () => [bold('Stats'), '', ...lines, '', dim(note)] }));
}

function wornLines(app, gear) {
  const out = [];
  for (const slot of EQUIP_SLOTS) {
    const e = equippedEntry(gear?.[slot]);
    if (e != null) { const it = app.ds.item(e); out.push(`  ${fit(SLOT_LABEL[slot] ?? slot, 10)} ${qualityPaint(it?.quality)(it?.name ?? e)}`); }
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
    },
    rows(a) {
      const g = a.g, squad = g.state.squad ?? [], bench = Object.values(g.state.botRoster ?? {});
      const energy = g.companionPartyEnergy(Date.now());
      const rows = [H(`Party ${squad.length}/${MAX_COMPANIONS}   ${dim(`trip energy ${energy}/${MAX_COMPANION_ENERGY}`)}   ${yellow(moneyText(a.ch.gold) || '0c')}`), squadModeRow(a)];
      const row = (c) => ({
        text: `${fit(c.name, 12)} ${fit(dim(`L${companionLevel(c, a.ch.level)} ${className(c.cls)}`), 12)} ${fit(roleText(c.role), 6)} ${c.mission ? yellow('away ') : ''}${profTags(compProfLines(a, c))}`,
        detail: () => [...compLines(a, c), '', dim('Enter: open their page')],
        act: () => a.push(companionDialog(a, c.id)),
      });
      if (!squad.length && !bench.length) rows.push(H(''), H(dim('  You travel alone. Innkeepers hire out companions: they fight beside you, carry and craft.')));
      rows.push(...squad.map(row));
      if (bench.length) rows.push(H(''), H(`Bench (${bench.length})`), ...bench.map(row));
      const inn = g.innkeeperHere();
      rows.push(H(''), H('Hire'));
      if (inn) {
        const n = g.innCandidates().length;
        rows.push({ text: `Hire a companion at ${inn.name} ${dim(`(${plural(n, 'face')})`)}`, detail: () => [bold(inn.name), 'Innkeeper', '', `${plural(n, 'adventurer')} near your level looking for work. A hire joins at their own level in their own gear; a bench companion comes back free.`], act: () => a.push(hireDialog(a)) });
      } else rows.push(H(dim('  No inn here. Companions are hired from innkeepers (Goldshire, Razor Hill, every capital).')));
      if (squad.length || bench.length) {
        const ups = g.squadUpgradePlan().length;
        const back = countDoneMissions(squad, g.state.botRoster, Date.now());
        rows.push(H(''), H('Everyone'));
        rows.push({ text: `Put on every upgrade ${ups ? green(`(${ups})`) : dim('(none)')} ${dim('u')}`, detail: () => [bold('Gear everyone'), '', 'Each companion, party and bench, takes the best piece for them out of their own bags, your bags and your bank. Shared items go to whoever gains the most.'], act: () => gearAll(a) });
        rows.push({ text: `Send trade goods and upgrades ${dim('g')}`, detail: () => [bold('Send goods'), '', 'Ore, herbs, leather and cloth go to the companions whose recipes use them; you review the list first.'], act: () => openSendGoods(a) });
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
  return (rows ?? []).map((y) => `${app.itemName(y.item)}${y.count > 1 ? ` x${y.count}` : ''}`).join(', ') || 'nothing';
}

// ---- hiring -------------------------------------------------------------------------------------------

function findCand(app, botId) { return app.g.innCandidates().find((c) => c.bot.id === botId) ?? null; }

// The body they would bring: same shell hireCandidate builds, on their own spec, for the stat preview.
function candCharacter(app, c) {
  const b = c.bot;
  return companionCharacter({ id: b.id, name: b.name, race: b.race, cls: b.cls, gender: b.gender, role: c.specRole ?? 'dps', seed: b.seed, equipped: { ...c.gear }, level: b.level, specIdx: b.specIdx, gearProfile: c.gearProfile }, b.level, app.ds);
}

function hireText(app, c, short = false) {
  const cost = c.hireCostCopper ?? 0;
  return (app.ch.gold >= cost ? yellow : red)((short ? shortMoney(cost) : moneyText(cost)) || 'free');
}

// The two biggest coins only, for the list column: 1g 20s, 51s, 76c.
function shortMoney(copper) {
  const g = Math.floor(copper / 10000), sv = Math.floor((copper % 10000) / 100), c = copper % 100;
  if (g) return `${g}g${sv ? ` ${sv}s` : ''}`;
  if (sv) return `${sv}s`;
  return c ? `${c}c` : '';
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
  return app.result(r, `${r.name ?? c.bot.name} joins you as ${role}${r.costCopper ? ` for ${moneyText(r.costCopper)}` : ''}${r.benched ? ', on the bench' : ''}.`);
}

function pickRoleAndHire(app, c, after) {
  const roles = [...SQUAD_ROLES].sort((x, y) => Number(y === c.specRole) - Number(x === c.specRole));
  app.pick(`${c.bot.name}: what role?`, roles.map((r) => ({ label: `${roleText(r)}${r === c.specRole ? dim('  (their spec)') : ''}`, value: r })), (role) => { if (hireAs(app, c, role)) after?.(); });
}

function hireDialog(app) {
  return {
    id: 'hire', title: 'Hire', hint: 'Enter: look closer',
    keys: { h: { hint: 'hire', fn: (a, row) => { const c = row?.data && findCand(a, row.data); if (c) pickRoleAndHire(a, c, () => a.pop()); } } },
    rows(a) {
      const g = a.g, list = g.innCandidates();
      const squad = g.state.squad ?? [];
      const rows = [H(`${plural(list.length, 'adventurer')} for hire   ${squad.length >= MAX_COMPANIONS ? yellow('party full: a new hire goes to the bench') : dim(`party ${squad.length}/${MAX_COMPANIONS}`)}   ${yellow(moneyText(a.ch.gold) || '0c')}`), H('')];
      if (!list.length) rows.push(H(dim('  Nobody is looking for work here right now.')));
      for (const c of list) {
        const b = c.bot;
        rows.push({
          text: `${fit(b.name, 12)} ${fit(dim(`L${b.level} ${className(b.cls)}`), 12)} ${fit(c.specRole ? roleText(c.specRole) : '', 6)} ${fit(hireText(a, c, true), 7)} ${profTags(candProfLines(c))}`,
          data: b.id,
          detail: () => [...candLines(a, c), '', dim('Enter: their page   h: hire')],
          act: () => a.push(candidateDialog(a, b.id)),
        });
      }
      return rows;
    },
  };
}

/** One face at the inn: everything about them, and the hire buttons. */
function candidateDialog(app, botId) {
  const viewId = `cand-${botId}`;
  return {
    id: viewId, title: findCand(app, botId)?.bot.name ?? 'Hire', hint: 'Enter: choose',
    rows(a) {
      const c = findCand(a, botId);
      if (!c) { setTimeout(() => { if (a.top()?.id === viewId) a.pop(); }, 0); return [H('They are no longer looking for work.')]; }
      const b = c.bot, ds = a.ds;
      const rows = [H(`${bold(b.name)}  ${dim(`L${b.level} ${raceName(b.race)} ${className(b.cls)}`)}  ${c.specName ?? ''}  ${hireText(a, c)}`), H('')];

      // Hire: their spec's role first; any role works, it rebuilds talents and rotation.
      rows.push(H('Hire'));
      const roles = [...SQUAD_ROLES].sort((x, y) => Number(y === c.specRole) - Number(x === c.specRole));
      for (const role of roles) {
        rows.push({
          text: `Hire as ${roleText(role)} for ${hireText(a, c)}${role === c.specRole ? dim('  their spec') : ''}`,
          detail: () => [bold(`Hire ${b.name} as ${role}`), '', `Cost: ${hireText(a, c)}   you have ${yellow(moneyText(a.ch.gold) || '0c')}`,
            role === c.specRole ? dim(`They already play ${c.specName}.`) : dim('They respec for the role: talents and rotation rebuild for free.'),
            (a.g.state.squad ?? []).length >= MAX_COMPANIONS ? yellow('Your party is full: they start on the bench.') : '', '', dim('A released hire refunds the price.')],
          act: () => { if (hireAs(a, c, role)) { a.popTo('hire'); a.pop(); } },
        });
      }

      rows.push(H(''), H('Professions'));
      for (const l of candProfLines(c)) {
        const prof = ds.profession(l.line);
        rows.push({
          text: `${fit(prof?.name ?? l.line, 16)} ${fit(`${l.current}/${l.max}`, 8)} ${dim(l.rank ?? '')}${isSecondary(l.line) ? dim('  secondary') : ''}`,
          detail: () => [bold(prof?.name ?? l.line), `${l.current}/${l.max}${l.rank ? `  ${l.rank}` : ''}`, '',
            isMissionSkill(l.line) ? `Once hired they can go on ${missionVerb(l.line).toLowerCase()} trips while you play.` : `Once hired they craft from their own ${prof?.name ?? l.line} recipe book with your materials.`,
            dim('Companions train for free as they level, and can swap trades later.')],
        });
      }

      rows.push(H(''), H('Stats'), ...statRows(a, candCharacter(a, c), 'With the gear they arrive in, on their own spec.'));

      rows.push(H(''), H(`Wearing ${dim(c.gearProfile ? `${gearProfileLabel(c.gearProfile)} kit` : '')}`));
      for (const slot of EQUIP_SLOTS) {
        const e = equippedEntry(c.gear?.[slot]);
        if (e == null) continue;
        const it = ds.item(e);
        rows.push({ text: `${fit(SLOT_LABEL[slot] ?? slot, 10)} ${qualityPaint(it?.quality)(it?.name ?? e)}`, detail: () => (it ? itemLines(a, it) : []) });
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
      x: { hint: 'take off / drop', fn: (a, row) => {
        const d = row?.data;
        if (d?.slot && d.it) a.result(a.g.unequipCompanionSlot(id, d.slot), `${findComp(a, id)?.name} takes off ${d.it.name}.`);
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
      rows.push({ text: `Role: ${roleText(comp.role)}`, detail: () => [bold('Role'), '', 'Tank, healer or damage. Changing it is free and rebuilds their talents and rotation for the role.'],
        act: () => a.pick(`${comp.name}: what role?`, SQUAD_ROLES.map((r) => ({ label: roleText(r), value: r })), (r) => a.result(g.setCompanionRole(id, r), `${comp.name} is now your ${r}.`)) });
      rows.push(seated
        ? { text: 'Move to the bench', detail: () => [bold('Bench'), '', 'They stay yours with their gear, level and bags, and come back free from any inn or right here.'], act: () => a.result(g.dismissCompanion(id), `${comp.name} waits on the bench.`) }
        : { text: green('Seat in the party'), detail: () => [bold('Party'), '', `Up to ${MAX_COMPANIONS} companions travel with you.`], act: () => a.result(g.activateCompanion(id), `${comp.name} joins the party.`) });
      rows.push({ text: 'Put on their best gear', detail: () => [bold('Best gear'), '', 'Strict upgrades from their own bags first, then from yours. What you hand over becomes theirs.'], act: () => { const r = g.equipCompanionBest(id); a.result(r, r.equipped ? `${comp.name} puts on ${plural(r.equipped, 'piece')}.` : `${comp.name} already wears the best they can.`); } });
      rows.push({ text: 'Give them something from your bags…', detail: () => [bold('Give'), '', 'Anything you hand over is theirs. A Plans or Pattern they can use is learned on the spot.'], act: () => giveDialog(a, id) });

      // Professions: Enter opens their book (crafting) or trips (gathering); x drops one.
      const profs = g.companionProfessionsOf(id);
      rows.push(H(''), H(`Professions${profs ? dim(`  (up to 2 primary)`) : ''}`));
      for (const l of sortLines(profs?.lines ?? [])) {
        const prof = ds.profession(l.line);
        rows.push({
          text: `${fit(prof?.name ?? l.line, 16)} ${fit(`${l.current}/${l.max}`, 8)} ${dim(l.rank ?? '')}${isSecondary(l.line) ? dim('  secondary') : ''}${comp.mission?.skill === l.line ? yellow('  away') : ''}`, data: { line: l.line },
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
          detail: () => (it ? itemLines(a, it, ['', dim('Enter: change   x: take off')]) : [dim(`Nothing in the ${SLOT_LABEL[slot] ?? slot} slot.`), '', dim('Enter: pick something for them to wear')]),
          act: () => slotPicker(a, id, slot),
        });
      }

      // Their bags: Enter takes a stack into yours.
      const bags = comp.bags?.stacks ?? [];
      const cap = bagCapacity(companionCharacter(comp, lvl, ds), ds);
      rows.push(H(''), H(`Their bags ${dim(`${bags.length}/${cap}   Enter: take it`)}`));
      if (!bags.length) rows.push(H(dim('  Empty.')));
      bags.forEach((s, slot) => {
        const it = ds.item(s.item);
        rows.push({
          text: `${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}`,
          detail: () => itemLines(a, it, ['', dim('Enter: take it into your bags (soulbound gear stays with them)')]),
          act: () => { const r = g.takeItemFromBotStack(id, slot); a.result(r, `You take ${it?.name ?? 'it'}${r.moved > 1 ? ` x${r.moved}` : ''} from ${comp.name}.`); },
        });
      });

      rows.push(H(''), { text: red(`Release ${comp.name} for good`), detail: () => [bold('Release'), '', 'They leave your roster for good. You get the hire price back. Their bags and gear go with them.'],
        act: () => a.confirm(`Release ${comp.name} for good? Their bags and gear go with them.`, () => { const r = g.releaseCompanions({ ids: [id] }); if (a.result(r, `${comp.name} leaves.${r.refundCopper ? ` You get ${moneyText(r.refundCopper)} back.` : ''}`)) a.popTo('__none__'); }) });
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
    return { label: `${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}`, detail: () => itemLines(app, it), value: { s, slot, it } };
  }), ({ slot, it }) => {
    const r = app.g.giveItemToBotStack(id, slot);
    app.result(r, `You give ${it?.name ?? 'it'}${r.moved > 1 ? ` x${r.moved}` : ''} to ${comp?.name}.`);
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
    options.push({ label: `${qualityPaint(it.quality)(it.name)}${up ? green(`  ▲ +${Math.round(up.delta)}`) : ''}${it.requiredLevel > lvl ? red(`  L${it.requiredLevel}`) : ''}${dim(from === 'you' ? '  your bags' : '  their bags')}`, detail: () => itemLines(app, it), value: it });
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
