// Warsong Gulch and Arathi Basin as a text match, from the Honor window. The map, rules, roster and strategy layer
// are phonecraft's own (domain/bg: BgWorld, installWsg / installAb, bgRoster, BgMatch); what is not ported is
// bgScreen.ts's whole-match combat session. Here the world resolves its own engagements (BgMatch's attrition
// resolver, flat damage and healing per body), so a match is watched rather than fought: you are one seat on your
// team with an assignment you pick (flag carrier, escort, defence; assault or hold a base), and the scoreboard,
// the flags or bases and the feed run in front of you. Honor and Marks of Honor settle as bgScreen.ts does.
import { bold, dim, yellow, green, red, cyan, fit, bar } from './text.mjs';
import { BATTLEGROUNDS } from '../domain/run/battlegroundRun.ts';
import { BgWorld } from '../domain/bg/bgWorld.ts';
import { BgMatch, attritionResolver } from '../domain/bg/match.ts';
import { installWsg, wsgGraveyard, WSG_GEOMETRY } from '../domain/bg/wsg.ts';
import { installAb, abGraveyard, AB_GEOMETRY, AB_NODES } from '../domain/bg/ab.ts';
import { buildFriendlySeats, buildEnemySeats, seatLevel } from '../domain/bg/bgRoster.ts';
import { bgTier } from '../domain/bg/bgTier.ts';
import { OTHER_TEAM, FAIR_VISION } from '../domain/bg/types.ts';
import { addBonusHonor, bgBracketId, hkHonorAtLevel, newHonorState, recordHonorableKill, BG_MARK_SPELL, WSG_FLAG_CAPTURED_HONOR, WSG_WIN_MATCH_HONOR } from '../domain/run/honor.ts';
import { companionCharacter } from '../domain/bots/squad.ts';
import { maxHealth } from '../domain/character/character.ts';
import { addItem } from '../domain/items/inventory.ts';
import { mulberry32, hashSeed } from '../engine/core/rng.ts';
import { BASE_RUN_SPEED } from '../domain/nav/speed.ts';

const H = (text) => ({ text, header: true });
const TEAM = { alliance: 'Alliance', horde: 'Horde' };
const paintTeam = (t, s) => (t === 'horde' ? red(s) : cyan(s));
const COUNTDOWN_MS = 10_000;
const MATCH_MAX_MS = 60 * 60_000;
// The job boards phonecraft deals seats from (bgScreen.ts:140-151).
const WSG_ROLES = ['flag-carrier', 'fc-escort', 'offense', 'defense', 'defense', 'mid', 'offense', 'fc-escort', 'mid', 'flex'];
const AB_ROLES = ['node-assault', 'node-assault', 'node-defense', 'node-assault', 'node-defense'];
const ROLE_TEXT = {
  'flag-carrier': 'carry their flag home', 'fc-escort': 'escort our flag carrier', offense: 'push into their base',
  defense: 'guard our flag', mid: 'hold the middle', flex: 'go where it is needed',
  'node-assault': 'assault their bases', 'node-defense': 'hold our bases',
};
const STEPS_PER_TICK = 5; // world ticks (100 ms each) per screen tick at 1x

/** The Honor window's Warsong / Arathi rows. */
export function objectiveBgRows(app) {
  const rows = [];
  for (const id of ['wsg', 'ab']) {
    const b = BATTLEGROUNDS[id];
    if (!b) continue;
    rows.push(app.ch.level >= b.minLevel
      ? { text: `  ${b.name}  ${dim(`${b.minLevel}-${b.maxLevel}, ${b.teamSize}v${b.teamSize}, you and your companions`)}`, act: (a) => startBattleground(a, id) }
      : H(dim(`  ${b.name}  level ${b.minLevel}`)));
  }
  return rows;
}

export function startBattleground(app, bgId) {
  const g = app.g, ds = app.ds, state = g.state;
  const allies = (state.squad ?? []).map((c) => c.id);
  const r = g.enterBattleground(bgId, { allies });
  if (!app.result(r)) return null;
  const run = state.battleground;
  const def = BATTLEGROUNDS[run.bgId];
  const team = run.team, foe = OTHER_TEAM[team];
  const tier = bgTier(run.tier);
  const isAb = def.mapId === 529;
  const world = new BgWorld({ mapId: def.mapId, teamSize: run.teamSize, tickMs: 100, startMaxDist: def.startMaxDist, engageYd: 30, countdownMs: COUNTDOWN_MS, timeLimitMs: MATCH_MAX_MS });
  const wsgEvents = isAb ? [] : installWsg(world);
  const abEvents = isAb ? installAb(world, { rng: mulberry32(hashSeed(run.seed, 0x61626766)) }) : [];
  const friendly = buildFriendlySeats({ ds, char: state.char, playerRole: state.squadRole ?? null, squad: state.squad ?? [], roster: state.botRoster ?? {}, allies: run.allies ?? [], team, teamSize: run.teamSize, seed: run.seed, consumes: false });
  const enemies = buildEnemySeats({ ds, char: state.char, team: foe, teamSize: run.teamSize, seed: run.seed, tier });
  const start = isAb ? AB_GEOMETRY.start : WSG_GEOMETRY.start;
  const roles = isAb ? AB_ROLES : WSG_ROLES;
  const addTeam = (side, seats) => {
    seats.forEach((seat, i) => {
      const isPlayer = seat.kind === 'player';
      const lvl = seatLevel(seat, state.char.level);
      const hp = maxHealth(isPlayer ? state.char : companionCharacter(seat.comp, lvl, ds), ds);
      world.addUnit({
        id: `${side[0]}${i}`, team: side, name: isPlayer ? state.char.name : seat.comp.name, cls: isPlayer ? state.char.cls : seat.comp.cls, level: lvl,
        pos: { x: start[side].x + (i % 5) - 2, y: start[side].y + Math.floor(i / 5) * 3 - 1 }, z: start[side].z ?? 0,
        hp, maxHp: hp, role: roles[i % roles.length], order: { kind: 'hold' }, speedYd: BASE_RUN_SPEED,
        // Not driven by hand here: the strategy layer plays your seat to the assignment you pick.
        human: false,
      });
    });
    world.setVision(side, FAIR_VISION);
  };
  addTeam(team, friendly);
  addTeam(foe, enemies);
  const match = new BgMatch({
    world, seed: run.seed, strategyMs: 1000, strategyMsByTeam: { [foe]: tier.enemyStrategyMs },
    resolveShard: attritionResolver(), graveyard: isAb ? (t) => abGraveyard(world, t) : wsgGraveyard, respawnMs: 30_000,
  });
  const bg = {
    def, team, foe, isAb, world, match, wsgEvents, abEvents, selfId: run.selfId ?? `${team[0]}0`,
    wsgAt: 0, abAt: 0, honor: 0, kills: 0, caps: 0, marks: 0, speed: 1, paused: false, timer: null, settled: false,
    bracket: bgBracketId(state.char.level, 10, 60),
  };
  app.bg = bg;
  app.say(yellow(`You enter ${def.name} for the ${TEAM[team]}. ${run.teamSize}v${run.teamSize}.`) + dim('  The gates open in 10 seconds.'));
  const view = bgView(app, bg);
  app.push(view);
  bg.timer = app.term.setInterval(() => { if (!bg.paused) { stepBg(app, bg, STEPS_PER_TICK * bg.speed); app.render(); } }, 100);
  return bg;
}

const unitName = (bg, id) => bg.world.units.get(id)?.name ?? 'Someone';
const nodeName = (id) => AB_NODES.find((n) => n.id === id)?.name ?? 'a base';

function awardCp(app, bg, cp, asKill = false) {
  if (cp <= 0 && !asKill) return;
  if (cp > 0) bg.honor += cp;
  app.g.state.char.honor = addBonusHonor(app.g.state.char.honor ?? newHonorState(), cp, { today: new Date().toISOString().slice(0, 10), asKill });
  app.g.bankWeeklyHonor('player', cp, asKill ? 1 : 0);
}

/** Everyone else on the field banks too, so the weekly standing has a population (bgScreen.ts:1218). */
function bankRosterBonus(app, bg, side, cp) {
  if (cp <= 0) return;
  for (const u of bg.world.units.values()) if (u.team === side && u.id !== bg.selfId) app.g.bankWeeklyHonor(u.name, cp, 0);
}

/** Run `n` world ticks and turn what happened into log lines and honor. */
export function stepBg(app, bg, n) {
  const { world, match } = bg;
  for (let i = 0; i < n && !world.ended; i++) match.tick();
  for (const c of world.takeKillCredit()) {
    const killer = world.units.get(c.killer), victim = world.units.get(c.victim);
    if (!killer || !victim || killer.team === victim.team || world.isHonorless(victim)) continue;
    if (killer.id === bg.selfId) {
      // Player.cpp:6645 RewardHonor: the rank-and-level formula with the per-victim falloff.
      const res = recordHonorableKill(app.g.state.char.honor ?? newHonorState(), { level: app.ch.level }, { id: victim.name, level: victim.level, rankPoints: 0 }, new Date().toISOString().slice(0, 10));
      app.g.state.char.honor = res.state;
      if (res.cp > 0) { bg.honor += res.cp; bg.kills++; }
      app.g.bankWeeklyHonor('player', res.cp, 1);
      app.say(green(`You kill ${victim.name}.`) + (res.cp ? dim(`  +${res.cp} honor`) : ''));
    } else app.g.bankWeeklyHonor(killer.name, hkHonorAtLevel(c.victimLevel, 1), 1);
  }
  for (; bg.wsgAt < bg.wsgEvents.length; bg.wsgAt++) {
    const e = bg.wsgEvents[bg.wsgAt];
    if (e.kind === 'pickup') app.say(`${unitName(bg, e.unit)} picks up the ${TEAM[OTHER_TEAM[e.team]]} flag!`);
    else if (e.kind === 'drop') app.say(dim(`${unitName(bg, e.unit)} drops the flag.`));
    else if (e.kind === 'return') app.say(dim(`The ${TEAM[e.team]} flag returns to its base.`));
    else if (e.kind === 'capture') {
      app.say(bold(paintTeam(e.team, `${unitName(bg, e.unit)} captures the flag for the ${TEAM[e.team]}!`)));
      const cp = WSG_FLAG_CAPTURED_HONOR[bg.bracket] ?? 0;
      if (e.team === bg.team) { bg.caps++; awardCp(app, bg, cp); }
      bankRosterBonus(app, bg, e.team, cp);
    }
  }
  for (; bg.abAt < bg.abEvents.length; bg.abAt++) {
    const e = bg.abEvents[bg.abAt];
    if (e.kind === 'assault') { app.say(`${unitName(bg, e.unit)} assaults the ${nodeName(e.node)}.`); if (e.team === bg.team && e.unit === bg.selfId) bg.caps++; }
    else if (e.kind === 'capture') app.say(bold(paintTeam(e.team, `The ${TEAM[e.team]} claim the ${nodeName(e.node)}!`)));
    else if (e.kind === 'defend') { app.say(`${unitName(bg, e.unit)} defends the ${nodeName(e.node)}.`); if (e.team === bg.team && e.unit === bg.selfId) bg.caps++; }
    else if (e.kind === 'near-victory') app.say(bold(`The ${TEAM[e.team]} are close to victory!`));
    else if (e.kind === 'honor') { const cp = hkHonorAtLevel(app.ch.level, e.amount ?? 1); if (e.team === bg.team) awardCp(app, bg, cp); bankRosterBonus(app, bg, e.team, cp); }
  }
  if (world.ended && !bg.settled) settle(app, bg);
}

/** Marks, the win honor, the weekly pass, then out of the battleground (bgScreen.ts:1277-1330). */
function settle(app, bg) {
  bg.settled = true;
  if (bg.timer) app.term.clearInterval(bg.timer);
  bg.timer = null;
  const { world } = bg;
  const won = world.winner === bg.team, drawn = world.winner == null;
  const marks = bg.isAb ? BG_MARK_SPELL.ab : BG_MARK_SPELL.wsg;
  const spell = marks ? app.ds.spell(won ? marks.winner : marks.loser) : null;
  for (const eff of spell?.effects ?? []) {
    if (eff.kind !== 'conjure' || !eff.item) continue;
    const count = Math.max(1, eff.count ?? 1);
    app.g.state.inventory = addItem(app.g.state.inventory, eff.item, count, app.ds.item(eff.item)?.stackable ?? 1);
    bg.marks += count;
  }
  const winCp = bg.isAb ? hkHonorAtLevel(app.ch.level, 1) : (WSG_WIN_MATCH_HONOR[bg.bracket] ?? 0);
  if (bg.isAb) { awardCp(app, bg, winCp); bankRosterBonus(app, bg, 'alliance', winCp); bankRosterBonus(app, bg, 'horde', winCp); }
  if (won) awardCp(app, bg, winCp);
  if (world.winner) bankRosterBonus(app, bg, world.winner, winCp);
  app.g.runWeeklyHonorPass();
  app.say(bold(drawn ? 'Draw.' : won ? green('Victory!') : red('Defeat.')) + `  ${scoreText(bg)}  ` + dim(`+${bg.honor} honor${bg.marks ? `, ${bg.marks} Mark${bg.marks === 1 ? '' : 's'} of Honor` : ''}${bg.kills ? `, ${bg.kills} kills` : ''}`));
  app.g.leaveBattleground();
  void app.persist();
}

function scoreText(bg) {
  const s = bg.world.score;
  return `${cyan(`Alliance ${s.alliance}`)} - ${red(`Horde ${s.horde}`)}`;
}

function leave(app, bg) {
  if (bg.timer) app.term.clearInterval(bg.timer);
  bg.timer = null;
  if (!bg.settled) { app.g.leaveBattleground(); app.say(yellow(`You leave ${bg.def.name}. The match goes on without you.`)); bg.settled = true; }
  app.bg = null;
}

function bgView(app, bg) {
  const self = () => bg.world.units.get(bg.selfId);
  return {
    id: 'bg', title: bg.def.name, hint: 'Enter: your job', noDetail: true,
    onClose: (a) => leave(a, bg),
    keys: {
      space: { hint: 'pause', fn: () => { bg.paused = !bg.paused; } },
      '+': { hint: 'faster', fn: () => { bg.speed = Math.min(16, bg.speed * 2); } },
      '-': { fn: () => { bg.speed = Math.max(1, bg.speed / 2); } },
    },
    rows(a) {
      const { world } = bg;
      const me = self();
      const t = Math.max(0, world.t - COUNTDOWN_MS);
      const clock = `${Math.floor(t / 60000)}:${String(Math.floor((t % 60000) / 1000)).padStart(2, '0')}`;
      const rows = [H(`${bold(bg.def.name)}   ${scoreText(bg)}   ${dim(world.gatesOpen ? clock : 'gates closed')}${bg.paused ? red('  PAUSED') : ''}${bg.speed !== 1 ? dim(`  ${bg.speed}x`) : ''}`), H('')];
      if (bg.isAb) {
        for (const n of AB_NODES) {
          const o = world.objectives.get(n.id);
          const who = o?.owner ? paintTeam(o.owner, TEAM[o.owner]) : dim('nobody');
          rows.push(H(`  ${fit(n.name, 14)} ${who}${o?.state === 'assaulted' ? yellow('  under assault') : ''}`));
        }
      } else {
        for (const side of ['alliance', 'horde']) {
          const flag = [...world.objectives.values()].find((o) => o.kind === 'flag' && o.owner === side);
          const st = !flag ? '?' : flag.state === 'carried' ? `carried by ${unitName(bg, flag.carrier)}` : flag.state === 'ground' ? 'on the ground' : 'at its base';
          rows.push(H(`  ${paintTeam(side, `${TEAM[side]} flag`)}  ${st}`));
        }
      }
      rows.push(H(''), H(`  ${paintTeam(bg.team, `Your side ${world.livingOf(bg.team).length}/${world.unitsOf(bg.team).length} up`)}   ${paintTeam(bg.foe, `Theirs ${world.livingOf(bg.foe).length}/${world.unitsOf(bg.foe).length} up`)}`), H(''));
      if (me) {
        const dead = !world.alive(me);
        rows.push(H(`  ${bold(me.name)} ${bar(Math.max(0, me.hp), me.maxHp, 20, dead ? red : green)} ${dead ? red(`dead, back in ${Math.ceil(Math.max(0, (me.deadUntilMs ?? world.t) - world.t) / 1000)} s`) : `${Math.round((me.hp / me.maxHp) * 100)}%`}${me.carryingFlag ? yellow('  carrying the flag!') : ''}`));
        rows.push({ text: `  Your job: ${cyan(ROLE_TEXT[me.role] ?? me.role)}   ${dim('Enter: change it')}`, act: (a2) => pickRole(a2, bg) });
      }
      rows.push(H(''), H(dim(`  This match: +${bg.honor} honor${bg.kills ? `, ${bg.kills} kills` : ''}${bg.caps ? `, ${bg.caps} ${bg.isAb ? 'bases worked' : 'captures'}` : ''}`)));
      if (bg.settled) rows.push(H(''), { text: green('Leave the battleground'), act: (a2) => a2.pop() });
      else rows.push(H(''), { text: dim('Leave now (the match goes on without you)'), act: (a2) => a2.confirm(`Leave ${bg.def.name}? You get no win honor and no marks.`, () => a2.pop()) });
      return rows;
    },
  };
}

function pickRole(app, bg) {
  const roles = bg.isAb ? ['node-assault', 'node-defense'] : ['flag-carrier', 'fc-escort', 'offense', 'defense', 'mid'];
  app.pick('Your job', roles.map((r) => ({ label: ROLE_TEXT[r], value: r })), (r) => {
    const me = bg.world.units.get(bg.selfId);
    if (me) { me.role = r; app.say(dim(`You will ${ROLE_TEXT[r]}.`)); }
  });
}
