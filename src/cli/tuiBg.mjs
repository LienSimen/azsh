// Warsong Gulch and Arathi Basin as a text match, from the Honor window. The map, rules, roster and strategy layer
// are phonecraft's own (domain/bg: BgWorld, installWsg / installAb, bgRoster, BgMatch); what is not ported is
// bgScreen.ts's whole-match combat session. Here the world resolves its own engagements (BgMatch's attrition
// resolver, flat damage and healing per body), so a fight is watched, but the field is yours to play: a strip map
// of the gulch above the scoreboard, orders for your own seat by place (our flag room, mid, their graveyard, a
// buff, the flag itself) or an autopilot job the strategy layer plays, and team calls to your side through
// BgMatch's playerCommanded hook. The clock drops back to 1x when a flag changes hands, so you get a moment to
// react. Enemies are drawn from your team's BgView, the same fair-vision rule the bots are held to. Honor and
// Marks of Honor settle as bgScreen.ts does.
import { bold, dim, yellow, green, red, cyan, fit, bar } from './text.mjs';
import { BATTLEGROUNDS } from '../domain/run/battlegroundRun.ts';
import { BgWorld } from '../domain/bg/bgWorld.ts';
import { BgMatch, attritionResolver } from '../domain/bg/match.ts';
import { installWsg, wsgGraveyard, WSG_GEOMETRY, flagObjectiveId } from '../domain/bg/wsg.ts';
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
// Vanilla 1.12 had no clock and a double turtle could run for hours; patch 2.3 put 25 minutes on the
// gulch, which is what an unattended match here needs to reach a result. A tied clock goes to kills.
const MATCH_MAX_MS = 25 * 60_000;
// The job boards phonecraft deals seats from (bgScreen.ts:140-151).
const WSG_ROLES = ['flag-carrier', 'fc-escort', 'offense', 'defense', 'defense', 'mid', 'offense', 'fc-escort', 'mid', 'flex'];
const AB_ROLES = ['node-assault', 'node-assault', 'node-defense', 'node-assault', 'node-defense'];
const ROLE_TEXT = {
  'flag-carrier': 'carry their flag home', 'fc-escort': 'escort our flag carrier', offense: 'push into their base',
  defense: 'guard our flag', mid: 'hold the middle', flex: 'go where it is needed',
  'node-assault': 'assault their bases', 'node-defense': 'hold our bases',
};
const STEPS_PER_TICK = 5; // world ticks (100 ms each) per screen tick at 1x
/** How long a team call holds your side before the strategy layer takes its jobs back. */
const CALL_MS = 45_000;
const ASCII = !!process.env.AZSH_ASCII;
const GLYPH = ASCII ? { flag: 'F', fight: 'x', dash: '-', mid: ':' } : { flag: '⚑', fight: '⚔', dash: '─', mid: '·' };
const MAP_ROWS = 7;
// The gulch is a long, narrow lane: Warsong (Horde) holds the west end and Silverwing (Alliance) the east, so the
// strip draws Horde on the left and Alliance on the right, at about 10 yards a column and 34 a row.
const WSG_FIELD = { x0: 895, x1: 1565, y0: 1335, y1: 1575 };
const POWERUP_CHAR = { speed: 's', regen: 'r', zerk: 'z' };
const xy = (p) => ({ x: p.x, y: p.y });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
    const bodies = seats.map((seat, i) => {
      const isPlayer = seat.kind === 'player';
      const lvl = seatLevel(seat, state.char.level);
      return { seat, i, isPlayer, lvl, hp: maxHealth(isPlayer ? state.char : companionCharacter(seat.comp, lvl, ds), ds), heals: isPlayer ? state.squadRole === 'healer' : seat.comp.role === 'healer' };
    });
    // The flag runs on the sturdiest body that does not heal, as a real team's does; dealt by seat, the
    // run went to seat 0, a 560-hp healer who died 100 yd out of the enemy flag room every time.
    const runner = bodies.filter((b) => !b.heals).sort((a, b) => b.hp - a.hp)[0] ?? bodies[0];
    const rest = roles.filter((r) => r !== 'flag-carrier');
    let k = 0;
    for (const b of bodies) {
      const { seat, i, isPlayer, lvl, hp } = b;
      const role = isAb ? roles[i % roles.length] : b === runner ? 'flag-carrier' : rest[(k++) % rest.length];
      world.addUnit({
        id: `${side[0]}${i}`, team: side, name: isPlayer ? state.char.name : seat.comp.name, cls: isPlayer ? state.char.cls : seat.comp.cls, level: lvl,
        pos: { x: start[side].x + (i % 5) - 2, y: start[side].y + Math.floor(i / 5) * 3 - 1 }, z: start[side].z ?? 0,
        hp, maxHp: hp, role, order: { kind: 'hold' }, speedYd: BASE_RUN_SPEED,
        // The resolver heals with the seats the roster made healers (three a side), not with every
        // paladin, priest, shaman and druid: by class, six of ten bodies a side healed and nobody died.
        heals: b.heals,
        // Autopilot to begin with: the strategy layer plays your seat to the job you pick. Your first order by
        // place flips this to true and the layer lets go of you (match.ts runStrategy).
        human: false,
      });
    }
    world.setVision(side, FAIR_VISION);
  };
  addTeam(team, friendly);
  addTeam(foe, enemies);
  const bg = {
    def, team, foe, isAb, world, match: null, wsgEvents, abEvents, selfId: run.selfId ?? `${team[0]}0`,
    wsgAt: 0, abAt: 0, honor: 0, kills: 0, caps: 0, marks: 0, speed: 1, paused: false, timer: null, settled: false,
    // Both sides' kills, from the field's deaths: the kill line under the map counts only yours.
    teamKills: { alliance: 0, horde: 0 }, dead: new Set(),
    bracket: bgBracketId(state.char.level, 10, 60),
    // Your standing order ({ label, make }) while you drive your own seat, and the label of what it resolved to.
    my: null, myLabel: null,
    // Team calls: unit id → match clock the call expires on. The strategy layer skips these until then.
    commanded: new Map(), slowLatch: null, zones: null,
  };
  bg.match = new BgMatch({
    world, seed: run.seed, strategyMs: 1000, strategyMsByTeam: { [foe]: tier.enemyStrategyMs },
    resolveShard: attritionResolver(), graveyard: isAb ? (t) => abGraveyard(world, t) : wsgGraveyard, respawnMs: 30_000,
    playerCommanded: (id) => (bg.commanded.get(id) ?? -Infinity) > world.t,
  });
  app.bg = bg;
  app.say(yellow(`You enter ${def.name} for the ${TEAM[team]}. ${run.teamSize}v${run.teamSize}.`) + dim('  The gates open in 10 seconds.  o: your orders, t: a team call.'));
  const view = bgView(app, bg);
  app.push(view);
  bg.timer = app.term.setInterval(() => { if (!bg.paused) { stepBg(app, bg, STEPS_PER_TICK * bg.speed); app.renderSoon(); } }, 100);
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

/** Drop the clock back to 1x at a decision point, once. */
function slowDown(app, bg, why) {
  if (bg.speed <= 1) return;
  bg.speed = 1;
  app.say(dim(`Back to 1x: ${why}.`));
}

/** The enemy carrying OUR flag, if any. */
function theirCarrier(bg) {
  const f = bg.world.objectives.get(flagObjectiveId(bg.team));
  const c = f?.state === 'carried' ? bg.world.units.get(f.carrier) : null;
  return c && bg.world.alive(c) ? c : null;
}

/** Run `n` world ticks and turn what happened into log lines and honor. */
export function stepBg(app, bg, n) {
  const { world, match } = bg;
  for (let i = 0; i < n && !world.ended; i++) match.tick();
  // Deaths this step, by the side that scored them. Credits skip an honorless victim, so count bodies.
  for (const u of world.units.values()) {
    if (u.deadUntilMs != null) { if (!bg.dead.has(u.id)) { bg.dead.add(u.id); bg.teamKills[OTHER_TEAM[u.team]]++; } }
    else bg.dead.delete(u.id);
  }
  for (const c of world.takeKillCredit()) {
    const killer = world.units.get(c.killer), victim = world.units.get(c.victim);
    if (!killer || !victim || killer.team === victim.team) continue;
    if (killer.id !== bg.selfId) app.say(dim(`${paintTeam(killer.team, killer.name)} kills ${paintTeam(victim.team, victim.name)}.`));
    if (world.isHonorless(victim)) continue;
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
    if (e.kind === 'pickup') { app.say(`${unitName(bg, e.unit)} picks up the ${TEAM[OTHER_TEAM[e.team]]} flag!`); slowDown(app, bg, 'a flag is up'); }
    else if (e.kind === 'drop') { app.say(dim(`${unitName(bg, e.unit)} drops the flag.`)); slowDown(app, bg, 'a flag is on the ground'); }
    else if (e.kind === 'return') app.say(dim(`The ${TEAM[e.team]} flag returns to its base.`));
    else if (e.kind === 'capture') {
      app.say(bold(paintTeam(e.team, `${unitName(bg, e.unit)} captures the flag for the ${TEAM[e.team]}!`)));
      slowDown(app, bg, 'a capture');
      const cp = WSG_FLAG_CAPTURED_HONOR[bg.bracket] ?? 0;
      if (e.team === bg.team) { bg.caps++; awardCp(app, bg, cp); }
      bankRosterBonus(app, bg, e.team, cp);
    }
  }
  for (; bg.abAt < bg.abEvents.length; bg.abAt++) {
    const e = bg.abEvents[bg.abAt];
    if (e.kind === 'assault') { app.say(`${unitName(bg, e.unit)} assaults the ${nodeName(e.node)}.`); if (e.team === bg.team && e.unit === bg.selfId) bg.caps++; slowDown(app, bg, `the ${nodeName(e.node)} is under assault`); }
    else if (e.kind === 'capture') app.say(bold(paintTeam(e.team, `The ${TEAM[e.team]} claim the ${nodeName(e.node)}!`)));
    else if (e.kind === 'defend') { app.say(`${unitName(bg, e.unit)} defends the ${nodeName(e.node)}.`); if (e.team === bg.team && e.unit === bg.selfId) bg.caps++; }
    else if (e.kind === 'near-victory') { app.say(bold(`The ${TEAM[e.team]} are close to victory!`)); slowDown(app, bg, 'the end is near'); }
    else if (e.kind === 'honor') { const cp = hkHonorAtLevel(app.ch.level, e.amount ?? 1); if (e.team === bg.team) awardCp(app, bg, cp); bankRosterBonus(app, bg, e.team, cp); }
  }
  if (!bg.isAb) {
    // Their carrier closing on a score while their flag sits at home: the moment to react.
    const tc = theirCarrier(bg);
    if (tc && world.objectives.get(flagObjectiveId(bg.foe))?.state === 'base' && dist(tc.pos, WSG_GEOMETRY.flagBase[bg.foe]) < 80) {
      if (bg.slowLatch !== tc.id) { bg.slowLatch = tc.id; slowDown(app, bg, `${tc.name} is about to score`); }
    } else bg.slowLatch = null;
  }
  expireCalls(bg);
  driveSelf(app, bg);
  if (world.ended && !bg.settled) settle(app, bg);
}

// A call lapses when its clock runs out, when the body died (kill() reset it to hold and the strategy layer must
// have it back on respawn), when it picked up the flag (runFlagHome is the layer's job), or when the unit it
// was following is gone.
function expireCalls(bg) {
  const { world } = bg;
  for (const [id, until] of bg.commanded) {
    const u = world.units.get(id);
    const tgt = u?.order.kind === 'follow' ? world.units.get(u.order.target) : null;
    if (!u || world.t >= until || !world.alive(u) || u.carryingFlag || u.order.kind === 'hold' || (u.order.kind === 'follow' && !(tgt && world.alive(tgt)))) bg.commanded.delete(id);
  }
}

// Your standing order, re-resolved every screen tick: a respawn walks you back to your place, "take their flag"
// follows the flag wherever it went, and an order with nothing left to do lets go of you.
function driveSelf(app, bg) {
  const me = bg.world.units.get(bg.selfId);
  if (!me || !me.human || !bg.my || !bg.world.alive(me)) return;
  const r = bg.my.make();
  if (!r) { app.say(dim(`${bg.myLabel ?? bg.my.label}: nothing left to do. You hold here.`)); bg.my = null; bg.myLabel = 'holding here'; return; }
  bg.world.issue(me.id, r.order, bg.team);
  bg.myLabel = r.label ?? bg.my.label;
}

/** Marks, the win honor, the weekly pass, then out of the battleground (bgScreen.ts:1277-1330). */
function settle(app, bg) {
  bg.settled = true;
  if (bg.timer) app.term.clearInterval(bg.timer);
  bg.timer = null;
  const { world } = bg;
  if (world.winner == null && bg.teamKills.alliance !== bg.teamKills.horde) {
    world.winner = bg.teamKills.alliance > bg.teamKills.horde ? 'alliance' : 'horde';
    app.say(yellow(`Time. The ${TEAM[world.winner]} take it on kills, ${bg.teamKills[world.winner]} to ${bg.teamKills[OTHER_TEAM[world.winner]]}.`));
  }
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

// ---- places ------------------------------------------------------------------------------------------------

/** The places you can be sent, named from your side of the field. */
function zonesOf(bg) {
  if (bg.zones) return bg.zones;
  const t = bg.team, f = bg.foe;
  const z = [];
  if (bg.isAb) {
    z.push({ id: 'our-base', label: 'our base', pos: xy(AB_GEOMETRY.baseGraveyard[t]) });
    for (const n of AB_NODES) z.push({ id: n.id, label: `the ${n.name}`, pos: { x: n.x, y: n.y } });
    z.push({ id: 'their-base', label: 'their base', pos: xy(AB_GEOMETRY.baseGraveyard[f]) });
  } else {
    const g = WSG_GEOMETRY;
    const buff = (kind, side) => xy(g.powerups.find((p) => p.id === `${kind}-${side[0]}`));
    z.push(
      { id: 'our-base', label: 'our flag room', pos: xy(g.flagBase[t]) },
      { id: 'our-gy', label: 'our graveyard', pos: xy(g.graveyard[t]) },
      { id: 'our-speed', label: 'our speed buff', pos: buff('speed', t) },
      { id: 'our-regen', label: 'our restoration buff', pos: buff('regen', t) },
      { id: 'our-zerk', label: 'our berserking buff', pos: buff('zerk', t) },
      { id: 'mid', label: 'mid', pos: xy(g.mid) },
      { id: 'their-zerk', label: 'their berserking buff', pos: buff('zerk', f) },
      { id: 'their-regen', label: 'their restoration buff', pos: buff('regen', f) },
      { id: 'their-speed', label: 'their speed buff', pos: buff('speed', f) },
      { id: 'their-gy', label: 'their graveyard', pos: xy(g.graveyard[f]) },
      { id: 'their-base', label: 'their flag room', pos: xy(g.flagBase[f]) },
    );
  }
  bg.zones = z;
  return z;
}

/** Where on the field a point is, in words: the nearest named place, else which half. */
function placeName(bg, pos) {
  if (!pos) return 'the field';
  let best = null, bd = 60;
  for (const z of zonesOf(bg)) { const d = dist(z.pos, pos); if (d < bd) { bd = d; best = z; } }
  if (best) return best.label;
  if (bg.isAb) return 'the field';
  return (pos.x < WSG_GEOMETRY.mid.x ? 'horde' : 'alliance') === bg.team ? 'our half' : 'their half';
}

// ---- the map strip -----------------------------------------------------------------------------------------

function mapWidth(app) { return Math.max(40, Math.min(72, app.term.cols - 6)); }

/** The gulch as a strip: flags, graveyards (G), buffs (s r z), each side's bodies, fights, and you as @. */
function wsgMapRows(app, bg) {
  const { world } = bg;
  const W = mapWidth(app), F = WSG_FIELD;
  const colYd = (F.x1 - F.x0) / W, rowYd = (F.y1 - F.y0) / MAP_ROWS;
  const colOf = (pos) => Math.min(W - 1, Math.max(0, Math.floor((pos.x - F.x0) / colYd)));
  const rowOf = (pos) => Math.min(MAP_ROWS - 1, Math.max(0, Math.floor((F.y1 - pos.y) / rowYd)));
  const cells = Array.from({ length: MAP_ROWS }, () => Array.from({ length: W }, () => ({ ch: ' ', paint: null, prio: -1 })));
  const put = (pos, ch, paint, prio) => {
    const cell = cells[rowOf(pos)][colOf(pos)];
    if (prio > cell.prio) { cell.ch = ch; cell.paint = paint; cell.prio = prio; }
  };
  const midCol = colOf(WSG_GEOMETRY.mid);
  for (let r = 0; r < MAP_ROWS; r++) put({ x: F.x0 + (midCol + 0.5) * colYd, y: F.y1 - (r + 0.5) * rowYd }, GLYPH.mid, dim, 0);
  for (const side of ['alliance', 'horde']) put(WSG_GEOMETRY.graveyard[side], 'G', dim, 1);
  for (const o of world.objectives.values()) {
    if (o.kind === 'powerup') put(o.pos, POWERUP_CHAR[o.id.split('-')[0]] ?? '?', o.state === 'up' ? green : dim, 1);
    else if (o.kind === 'flag' && o.owner) {
      put(WSG_GEOMETRY.flagBase[o.owner], GLYPH.flag, o.state === 'base' ? (o.owner === 'horde' ? red : cyan) : dim, 2);
      if (o.state === 'ground') put(o.pos, GLYPH.flag, yellow, 3);
    }
  }
  // Bodies, tallied per cell. Ours in full; theirs only as far as our side can see them (BgView).
  const tally = new Map();
  const add = (u, ours) => {
    const key = rowOf(u.pos) * W + colOf(u.pos);
    const t = tally.get(key) ?? { pos: u.pos, ours: 0, theirs: 0, carrier: null, self: false };
    if (ours) t.ours++; else t.theirs++;
    if (u.carryingFlag) t.carrier = ours ? bg.team : bg.foe;
    if (u.id === bg.selfId) t.self = true;
    tally.set(key, t);
  };
  for (const u of world.livingOf(bg.team)) add(u, true);
  for (const e of world.viewFor(bg.team).enemies) if (e.alive) add(e, false);
  for (const t of tally.values()) {
    if (t.self) put(t.pos, '@', bold, 6);
    else if (t.ours && t.theirs) put(t.pos, GLYPH.fight, (s) => bold(red(s)), 5);
    else if (t.carrier) put(t.pos, t.carrier[0].toUpperCase(), (s) => bold(yellow(s)), 5);
    else {
      const side = t.ours ? bg.team : bg.foe, n = t.ours || t.theirs;
      put(t.pos, n > 1 ? (n > 9 ? '+' : String(n)) : side[0], (s) => paintTeam(side, s), 4);
    }
  }
  const left = 'Horde ', right = ' Alliance', midLabel = ' mid ';
  const midStart = Math.max(left.length + 1, Math.min(W - right.length - midLabel.length - 1, midCol - 2));
  const header = red(left) + dim(GLYPH.dash.repeat(midStart - left.length) + midLabel + GLYPH.dash.repeat(Math.max(0, W - right.length - midStart - midLabel.length))) + cyan(right);
  return [H(`  ${header}`), ...cells.map((row) => H(`  ${row.map((c) => (c.paint ? c.paint(c.ch) : c.ch)).join('')}`))];
}

/** Lines under the map: one per flag carrier, then one per fight, largest first. */
const FIELD_LINES = 4;

// Always FIELD_LINES rows, blank when quiet, so the cursor does not jump as fights start and end under it.
function fieldLines(bg) {
  const { world } = bg;
  const lines = [];
  if (!bg.isAb) {
    for (const o of world.objectives.values()) {
      if (o.kind !== 'flag' || o.state !== 'carried') continue;
      const c = world.units.get(o.carrier);
      if (!c || !world.alive(c)) continue;
      const ours = c.team === bg.team;
      const near = world.unitsNear(c.pos.x, c.pos.y, 40).filter((u) => u.team !== c.team && world.alive(u)).length;
      lines.push(`${paintTeam(c.team, c.name)} ${ours ? 'carries their flag' : 'has our flag'} near ${placeName(bg, c.pos)}, ${Math.round((c.hp / c.maxHp) * 100)}%${near ? `, ${near} ${ours ? 'chasing' : 'of ours on it'}` : ''}`);
    }
  }
  const shards = [];
  for (const s of world.currentShards()) {
    let ours = 0, theirs = 0, self = false, cx = 0, cy = 0, n = 0;
    for (const id of s.units) {
      const u = world.units.get(id);
      if (!u || !world.alive(u)) continue;
      if (u.team === bg.team) ours++; else theirs++;
      if (id === bg.selfId) self = true;
      cx += u.pos.x; cy += u.pos.y; n++;
    }
    if (ours && theirs) shards.push({ ours, theirs, self, pos: { x: cx / n, y: cy / n } });
  }
  shards.sort((a, b) => (b.ours + b.theirs) - (a.ours + a.theirs));
  for (const s of shards) lines.push(`${paintTeam(bg.team, String(s.ours))}v${paintTeam(bg.foe, String(s.theirs))} at ${placeName(bg, s.pos)}${s.self ? bold('  you are in it') : ''}`);
  while (lines.length < FIELD_LINES) lines.push('');
  return lines.slice(0, FIELD_LINES);
}

// ---- orders ------------------------------------------------------------------------------------------------

const goTo = (z) => ({ label: `going to ${z.label}`, make: () => ({ order: { kind: 'attack-move', to: z.pos } }) });

/** Their flag, wherever it is: at its base or on the ground, walk to it; carried by one of ours, escort them. */
const takeTheirFlag = (bg) => ({
  label: 'taking their flag',
  make: () => {
    const { world } = bg;
    const me = world.units.get(bg.selfId);
    if (me?.carryingFlag) return { label: 'running the flag home', order: { kind: 'move', to: xy(WSG_GEOMETRY.flagBase[bg.team]) } };
    const f = world.objectives.get(flagObjectiveId(bg.foe));
    if (f?.state === 'carried') {
      const c = world.units.get(f.carrier);
      return c ? { label: `escorting ${c.name}`, order: { kind: 'follow', target: c.id } } : null;
    }
    return { order: { kind: 'attack-move', to: f?.state === 'ground' ? xy(f.pos) : xy(WSG_GEOMETRY.flagBase[bg.foe]) } };
  },
});

const followUnit = (bg, id, verb) => ({
  label: `${verb} ${unitName(bg, id)}`,
  make: () => { const u = bg.world.units.get(id); return u && bg.world.alive(u) ? { order: { kind: 'follow', target: id } } : null; },
});

function setMyOrder(app, bg, standing) {
  const me = bg.world.units.get(bg.selfId);
  if (!me) return;
  me.human = true;
  bg.my = standing;
  bg.myLabel = standing.label;
  app.say(dim(`You are ${standing.label}.`));
  driveSelf(app, bg);
}

function pickOrder(app, bg) {
  const { world } = bg;
  const me = world.units.get(bg.selfId);
  const opts = [];
  if (me?.carryingFlag) opts.push({ label: 'Run the flag home', value: { label: 'running the flag home', make: () => ({ order: { kind: 'move', to: xy(WSG_GEOMETRY.flagBase[bg.team]) } }) } });
  if (!bg.isAb) opts.push({ label: 'Take their flag', value: takeTheirFlag(bg) });
  for (const z of zonesOf(bg)) opts.push({ label: `Go to ${z.label}`, value: goTo(z) });
  opts.push({ label: 'Follow an ally…', value: 'follow' }, { label: 'Attack an enemy you can see…', value: 'attack' }, { label: `Autopilot: ${me?.human ? 'hand your seat back to a job' : ROLE_TEXT[me?.role] ?? 'pick a job'}`, value: 'auto' });
  app.pick('Your orders', opts, (v) => {
    if (v === 'auto') return pickRole(app, bg);
    if (v === 'follow') {
      const allies = world.livingOf(bg.team).filter((u) => u.id !== bg.selfId);
      if (!allies.length) return app.say(dim('Nobody of yours is up.'));
      return app.pick('Follow', allies.map((u) => ({ label: `${u.name}  ${dim(ROLE_TEXT[u.role] ?? u.role)}${u.carryingFlag ? yellow('  carrying the flag') : ''}`, value: u.id })), (id) => setMyOrder(app, bg, followUnit(bg, id, 'following')));
    }
    if (v === 'attack') {
      const seen = world.viewFor(bg.team).enemies.filter((e) => e.alive);
      if (!seen.length) return app.say(dim('You see no enemy right now.'));
      return app.pick('Attack', seen.map((e) => ({ label: `${e.name}  ${dim(`${e.hpPct}%, near ${placeName(bg, e.pos)}`)}${e.carryingFlag ? yellow('  has our flag') : ''}`, value: e.id })), (id) => setMyOrder(app, bg, followUnit(bg, id, 'attacking')));
    }
    setMyOrder(app, bg, v);
  });
}

/** A job for the strategy layer to play your seat to; your own orders are dropped. */
function pickRole(app, bg) {
  const roles = bg.isAb ? ['node-assault', 'node-defense'] : ['flag-carrier', 'fc-escort', 'offense', 'defense', 'mid'];
  app.pick('Your job', roles.map((r) => ({ label: ROLE_TEXT[r], value: r })), (r) => {
    const me = bg.world.units.get(bg.selfId);
    if (!me) return;
    me.role = r; me.human = false; bg.my = null; bg.myLabel = null;
    app.say(dim(`You will ${ROLE_TEXT[r]}.`));
  });
}

/** One order to everyone of yours who is up, held for CALL_MS, then the strategy layer has them back. */
function teamCall(app, bg, say, orderFor) {
  const { world } = bg;
  let n = 0;
  for (const u of world.livingOf(bg.team)) {
    if (u.id === bg.selfId) continue;
    const o = orderFor(u);
    if (o && world.issue(u.id, o, bg.team)) { bg.commanded.set(u.id, world.t + CALL_MS); n++; }
  }
  app.say(n ? yellow(say) + dim(`  ${n} answer, for ${CALL_MS / 1000} s.`) : dim('Nobody of yours is up to answer.'));
}

function pickTeamCall(app, bg) {
  const opts = [];
  const call = (label, say, orderFor) => opts.push({ label, value: () => teamCall(app, bg, say, orderFor) });
  if (!bg.isAb) {
    const tc = theirCarrier(bg);
    if (tc) call(`All on their carrier, ${tc.name}`, `You call: all on ${tc.name}!`, () => ({ kind: 'follow', target: tc.id }));
    call('Everyone to mid', 'You call: everyone to mid!', () => ({ kind: 'attack-move', to: xy(WSG_GEOMETRY.mid) }));
    call('Turtle: everyone back to our flag room', 'You call: turtle!', () => ({ kind: 'attack-move', to: xy(WSG_GEOMETRY.flagBase[bg.team]) }));
    call('Push their flag room', 'You call: push their base!', () => ({ kind: 'attack-move', to: xy(WSG_GEOMETRY.flagBase[bg.foe]) }));
  } else {
    for (const n of AB_NODES) call(`Everyone to the ${n.name}`, `You call: everyone to the ${n.name}!`, () => ({ kind: 'attack-move', to: { x: n.x, y: n.y } }));
  }
  call('Escort me', 'You call: on me!', () => ({ kind: 'follow', target: bg.selfId }));
  opts.push({ label: 'Back to your jobs', value: () => { bg.commanded.clear(); app.say(dim('Your side goes back to its jobs.')); } });
  app.pick('Team call', opts, (fn) => fn());
}

// ---- the view ----------------------------------------------------------------------------------------------

function bgView(app, bg) {
  const self = () => bg.world.units.get(bg.selfId);
  return {
    id: 'bg', title: bg.def.name, hint: 'Enter: act', noDetail: true,
    onClose: (a) => leave(a, bg),
    keys: {
      o: { hint: 'your orders', fn: (a) => pickOrder(a, bg) },
      t: { hint: 'team call', fn: (a) => pickTeamCall(a, bg) },
      j: { hint: 'autopilot job', fn: (a) => pickRole(a, bg) },
      space: { hint: 'pause', fn: () => { bg.paused = !bg.paused; } },
      '+': { hint: 'faster', fn: () => { bg.speed = Math.min(16, bg.speed * 2); } },
      '-': { fn: () => { bg.speed = Math.max(1, bg.speed / 2); } },
    },
    rows(a) {
      const { world } = bg;
      const me = self();
      const t = Math.max(0, world.t - COUNTDOWN_MS);
      const clock = `${Math.floor(t / 60000)}:${String(Math.floor((t % 60000) / 1000)).padStart(2, '0')}`;
      const up = `${paintTeam(bg.team, `${world.livingOf(bg.team).length}/${world.unitsOf(bg.team).length} up`)} ${dim('vs')} ${paintTeam(bg.foe, `${world.livingOf(bg.foe).length}/${world.unitsOf(bg.foe).length}`)}`;
      const kills = `${dim('kills')} ${paintTeam(bg.team, String(bg.teamKills[bg.team]))}${dim('-')}${paintTeam(bg.foe, String(bg.teamKills[bg.foe]))}`;
      const rows = [H(`${bold(bg.def.name)}   ${scoreText(bg)}   ${dim(world.gatesOpen ? clock : 'gates closed')}   ${up}   ${kills}${bg.paused ? red('  PAUSED') : ''}${bg.speed !== 1 ? dim(`  ${bg.speed}x`) : ''}`)];
      if (bg.isAb) {
        rows.push(H(''));
        for (const n of AB_NODES) {
          const o = world.objectives.get(n.id);
          const who = o?.owner ? paintTeam(o.owner, TEAM[o.owner]) : dim('nobody');
          rows.push(H(`  ${fit(n.name, 14)} ${who}${o?.state === 'assaulted' ? yellow('  under assault') : ''}`));
        }
      } else {
        rows.push(...wsgMapRows(a, bg));
        const flagText = (side) => {
          const flag = world.objectives.get(flagObjectiveId(side));
          const st = !flag ? '?' : flag.state === 'carried' ? `carried by ${unitName(bg, flag.carrier)}` : flag.state === 'ground' ? 'on the ground' : flag.state === 'respawning' ? 'captured, respawning' : 'at its base';
          return `${paintTeam(side, `${TEAM[side]} flag`)} ${st}`;
        };
        rows.push(H(`  ${flagText(bg.team)}   ${flagText(bg.foe)}`));
      }
      for (const l of fieldLines(bg)) rows.push(H(`  ${l}`));
      rows.push(H(''));
      if (me) {
        const dead = !world.alive(me);
        rows.push(H(`  ${bold(me.name)} ${bar(Math.max(0, me.hp), me.maxHp, 20, dead ? red : green)} ${dead ? red(`dead, back in ${Math.ceil(Math.max(0, (me.deadUntilMs ?? world.t) - world.t) / 1000)} s`) : `${Math.round((me.hp / me.maxHp) * 100)}%`}${me.carryingFlag ? yellow('  carrying the flag!') : ''}`));
        const what = me.human ? `You: ${cyan(bg.myLabel ?? 'holding here')}` : `Autopilot: ${cyan(ROLE_TEXT[me.role] ?? me.role)}`;
        rows.push({ text: `  ${what}   ${dim('Enter: your orders')}`, act: (a2) => pickOrder(a2, bg) });
        const held = [...bg.commanded.keys()].filter((id) => { const u = world.units.get(id); return u && world.alive(u); }).length;
        rows.push({ text: `  Team: ${held ? yellow(`${held} on your call`) : dim('on their jobs')}   ${dim('Enter: a team call')}`, act: (a2) => pickTeamCall(a2, bg) });
      }
      rows.push(H(dim(`  This match: +${bg.honor} honor${bg.kills ? `, ${bg.kills} kills` : ''}${bg.caps ? `, ${bg.caps} ${bg.isAb ? 'bases worked' : 'captures'}` : ''}`)));
      if (bg.settled) rows.push({ text: green('Leave the battleground'), act: (a2) => a2.pop() });
      else rows.push({ text: dim('Leave now (the match goes on without you)'), act: (a2) => a2.confirm(`Leave ${bg.def.name}? You get no win honor and no marks.`, () => a2.pop()) });
      return rows;
    },
  };
}
