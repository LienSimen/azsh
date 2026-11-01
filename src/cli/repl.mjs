// The terminal game: a line-based command loop over the Game facade (src/engine/game/types.ts).
// Every verb here is a facade call the web client also makes; this file only reads and prints.
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { bootDataStore } from './bootData.mjs';
import { FileSaveRepository } from './fileRepository.mjs';
import { formatCombatLog, combatLogPlainText, POWER_MERGE_MS } from './combatLogFormat.ts';
import { createGame, newGameState } from '../engine/game.ts';
import { toSave } from '../persistence/saveShape.ts';
import { className, raceName } from '../domain/core/ids.ts';
import { moneyText } from '../domain/economy/money.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';
import { knownUsableSpells } from '../domain/character/characterSpells.ts';
import { bagCapacity } from '../domain/items/equipment.ts';
import { addItem } from '../domain/items/inventory.ts';
import { planStep, noteQuestDefeat } from '../autopilot/plan.ts';

// Deaths on one quest before world questing gives up on it and moves to the next.
const QUEST_SKIP_DEFEATS = 2;
import { pullOpts, squadLogNames, squadModeOf, setSquadMode, SQUAD_MODE_LABEL, SQUAD_MODE_WORDS, COMPANION_HINT_LINES } from './squad.mjs';

const useColor = stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = paint(2), bold = paint(1), yellow = paint(33), green = paint(32), red = paint(31), cyan = paint(36);

const QUALITY = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact'];
const WRAP = 78;

const GENDER_TOKEN = /\$[Gg]\s*([^:]*):([^;]*);/g;
/** $N name, $C class, $R race, $B break, $G male:female; (SharedDefines.h:26). Same codes as phonecraft questText. */
function questText(raw, ch) {
  return String(raw ?? '')
    .replace(GENDER_TOKEN, (_m, male, female) => (ch.gender === 1 ? female : male))
    .replace(/\$[Bb]/g, '\n')
    .replace(/\$[Nn]/g, () => ch.name)
    .replace(/\$[Cc]/g, () => className(ch.cls))
    .replace(/\$[Rr]/g, () => raceName(ch.race));
}

function wrap(text, ch, indent = '  ') {
  const out = [];
  for (const para of questText(text, ch).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + w).trim().length > WRAP - indent.length) { out.push(line); line = w; }
      else line = (line ? line + ' ' : '') + w;
    }
    out.push(line);
  }
  return out.map((l) => indent + l.trim()).join('\n');
}

/** Match `q` against a list: a number is an id, otherwise exact name, then prefix, then substring. */
function pick(list, q, nameOf, idOf) {
  const query = String(q ?? '').trim().toLowerCase();
  if (!query) return { many: list };
  if (/^\d+$/.test(query)) {
    const hit = list.find((x) => idOf(x) === Number(query));
    return hit ? { one: hit } : { none: true };
  }
  const named = list.filter((x) => nameOf(x));
  const exact = named.filter((x) => nameOf(x).toLowerCase() === query);
  if (exact.length === 1) return { one: exact[0] };
  const prefix = named.filter((x) => nameOf(x).toLowerCase().startsWith(query));
  if (prefix.length === 1) return { one: prefix[0] };
  const sub = named.filter((x) => nameOf(x).toLowerCase().includes(query));
  if (sub.length === 1) return { one: sub[0] };
  if (sub.length === 0) return { none: true };
  return { many: sub };
}

const HELP = `
  look (l)              zone: mobs, quests, NPCs, exits        travel <zone>        go to a neighbouring zone
  fight <mob> [xN]      fight a mob here, N times              rest [sec]           sit and regenerate (default 60 s)
  quests (q)            quest log with progress                quest <id>           quest text and rewards
  accept <quest>        take a quest offered here              turnin <quest> [n]   hand in, n = reward choice
  abandon <quest>       drop a quest                           talk <npc>           speak to an NPC by name
  bags (i)              inventory                              gear                 equipped items
  equip <item>          wear or wield an item                  unequip <slot>       take an item off
  use <item>            eat, drink, read or use an item        sell <item> [qty]    sell to the vendor you opened
  junk                  sell all grey items                    vendor [npc]         list vendors, or open one
  buy <item> [qty]      buy from the open vendor               repair               repair at the open vendor
  trainer               class trainer offers here              train <spell>|all    learn from the trainer
  spells                spellbook                              cast <spell>         cast out of combat
  char (c)              character sheet                        hearth / bind        hearthstone / set home at an inn
  release / reclaim     death: run to corpse, reclaim it       spirit               resurrect at the spirit healer
  auto [N] [farm <mob>] autopilot N steps (default 20)         log on|off           show or hide the combat log
  squad [solo|elites|party]  who fights beside you: alone, companions on elites, or the whole party
  save                  write the save file                    quit                 save and leave
`;

export async function main(argv = []) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY === true });
  // Buffered reader: piped input emits every line at once, and readline's question() drops the
  // ones that arrive while no question is pending. Null means the input ended.
  const queue = [];
  let waiter = null;
  let closed = false;
  rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else queue.push(l); });
  rl.on('close', () => { closed = true; if (waiter) { const w = waiter; waiter = null; w(null); } });
  const askRaw = (q) => {
    stdout.write(q);
    if (queue.length) return Promise.resolve(queue.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((r) => { waiter = r; });
  };
  const ask = async (q) => {
    const a = await askRaw(q);
    if (a == null) throw new Error('input ended');
    return a.trim();
  };
  console.log(bold('azsh') + dim('  Azeroth shell. WoW Classic 1.12 data via CMaNGOS. Type help.'));
  const t0 = performance.now();
  const ds = bootDataStore((s) => stdout.write(dim(`${s} `)));
  console.log(dim(`ready in ${Math.round(performance.now() - t0)} ms`));
  const repo = new FileSaveRepository();

  let save = null;
  const saves = await repo.list();
  const wantNew = argv.includes('--new');
  if (saves.length && !wantNew) {
    console.log('\nCharacters:');
    saves.forEach((m, i) => console.log(`  ${i + 1}. ${bold(m.name)}  L${m.level} ${className(m.cls)}  ${dim(new Date(m.updatedAt).toLocaleString())}`));
    const a = await ask('Pick a number, or "new": ');
    const i = Number(a);
    if (i >= 1 && i <= saves.length) save = await repo.load(saves[i - 1].slot);
  }
  let state = save?.state ?? null;
  let slot = save?.slot ?? null;
  let createdAt = save?.createdAt ?? Date.now();
  if (!state) {
    state = await createCharacter(ds, ask);
    slot = `${state.char.name.toLowerCase()}-${Date.now().toString(36)}`;
  }

  const g = createGame(ds, state, { travelPace: 'instant' });
  if (g.state.char.journey) g.completeJourneyNow();
  // Real createInfo has no starting weapon (ETL gap KI-003); phonecraft's harness.mjs hands one over too.
  if (!save && g.state.char.equipped.mainhand == null) {
    const weapon = ds.allItems().find((i) => i.slot === 'mainhand' && i.requiredLevel <= 1);
    if (weapon) { g.state.inventory = addItem(g.state.inventory, weapon.entry, 1, 1); g.equip(weapon.entry); }
  }

  const persist = async () => { await repo.save(toSave(slot, g.snapshot(), Date.now(), createdAt)); };
  const { commands, flushActivity, isDead, hp, pw, zoneHere } = createCommands({ g, ds, out: console.log, persist, slot });

  const prompt = () => {
    const ch = g.state.char;
    const dead = isDead() ? red(' dead') : '';
    return `${bold(ch.name)} ${dim(`L${ch.level}`)} ${cyan(zoneHere()?.name ?? ch.zoneId)} ${dim(`hp ${hp()} ${pw()}`)}${dead}\n> `;
  };

  console.log();
  commands.look();
  while (true) {
    const line = await askRaw(prompt());
    if (line == null) break;
    const [, cmd = '', args = ''] = line.trim().match(/^(\S+)\s*(.*)$/) ?? [];
    if (!cmd) continue;
    if (cmd === 'quit' || cmd === 'exit') break;
    const fn = commands[cmd.toLowerCase()];
    if (!fn) { console.log(dim(`Unknown command "${cmd}". Type help.`)); continue; }
    try { await fn.call(commands, args); }
    catch (err) { console.log(red(`Error: ${err instanceof Error ? err.message : String(err)}`)); if (process.env.AZSH_DEBUG) console.log(err.stack); }
    flushActivity();
    try { await persist(); } catch (err) { console.log(red(`save failed: ${err.message}`)); }
  }
  await persist();
  console.log(dim(`Saved ${g.state.char.name}. Farewell.`));
  rl.close();
}

async function createCharacter(ds, ask) {
  const races = ds.races();
  console.log('\nRaces:');
  races.forEach((r, i) => console.log(`  ${i + 1}. ${r.name.padEnd(10)} ${dim(r.faction)}`));
  let race;
  while (!race) { const i = Number(await ask('Race: ')); race = races[i - 1]; }
  const classes = race.classes.filter((c) => ds.createInfo(race.id, c));
  console.log('Classes:');
  classes.forEach((c, i) => console.log(`  ${i + 1}. ${className(c)}`));
  let cls;
  while (!cls) { const i = Number(await ask('Class: ')); cls = classes[i - 1]; }
  const gender = (await ask('Gender (m/f): ')).toLowerCase().startsWith('f') ? 1 : 0;
  let name = '';
  while (!/^[A-Za-z]{2,12}$/.test(name)) name = await ask('Name (2-12 letters): ');
  name = name[0].toUpperCase() + name.slice(1).toLowerCase();
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  return newGameState(ds, race.id, cls, name, seed, gender);
}


// Every verb of the line game, built over one Game facade. `out(line)` is where text goes: the REPL
// prints it, the windowed TUI appends it to its log pane. Returns the verb table plus the readers
// the prompt and the TUI command line need.
// `arrive()` runs after a departure and says whether the character is already there: the line game travels
// instantly; the windowed game passes its own when a real-time pace is set. `skipJourney()` lands the
// autopilot's trips at once whatever the pace (it does not wait out the road).
export function createCommands({ g, ds, out, persist, slot, arrive, skipJourney }) {
  arrive ??= () => { if (g.state.char.journey) g.completeJourneyNow(); return !g.state.char.journey; };
  skipJourney ??= () => g.completeJourneyNow();
  const onTheRoad = (to) => { const st = g.journeyStatus(); out(`You set off for ${bold(to)}.  ${dim(st ? `${Math.ceil(st.progress.remainingSeconds)} s to go` : '')}`); };
  let logOn = true;
  let curVendor = null;
  // Quests the world autopilot gave up on this session; later runs skip them too.
  const questBlacklist = new Set();
  let lastActivity = g.state.activity[0];
  // Party-buff pacing for squad pulls, and the one-shot "hire companions" hint.
  const buffPace = {};
  let companionHintShown = false;

  const flushActivity = () => {
    const act = g.state.activity;
    const idx = lastActivity == null ? act.length : act.indexOf(lastActivity);
    const fresh = act.slice(0, idx < 0 ? act.length : idx);
    for (const line of fresh.reverse()) out(dim('  · ' + line));
    lastActivity = act[0];
  };

  const names = () => ({
    playerName: g.state.char.name,
    enemyName: '',
    spellName: (id) => ds.spell(id)?.name,
  });

  const printLog = (events, enemyName, logNames) => {
    if (!logOn) return;
    const n = { ...(logNames ?? names()), enemyName };
    const rows = [];
    const line = (t, row) => `${dim((t / 1000).toFixed(1).padStart(6) + 's')}  ${combatLogPlainText(row)}`;
    // Passive regen ticks arrive as merge rows; add them up per unit and power within one quantum, like
    // the web client's combat log does, and drop a zero total (rage decay).
    let pend = null;
    const flush = () => { if (pend && pend.amount > 0) rows.push(line(pend.t, pend.remake(pend.amount))); pend = null; };
    for (const ev of events) {
      const row = formatCombatLog(ev, n);
      if (!row) continue;
      if (row.merge) {
        if (pend && pend.key === row.merge.key && row.merge.t - pend.t0 < POWER_MERGE_MS) { pend.amount += row.merge.amount; pend.t = row.merge.t; continue; }
        flush();
        pend = { key: row.merge.key, t0: row.merge.t, t: row.merge.t, amount: row.merge.amount, remake: row.merge.remake };
        continue;
      }
      flush();
      rows.push(line(ev.t, row));
    }
    flush();
    const MAX = 150;
    if (rows.length > MAX) {
      out(dim(`  … ${rows.length - MAX} earlier lines hidden (log off to silence)`));
      rows.splice(0, rows.length - MAX);
    }
    for (const r of rows) out(r);
  };

  const zoneHere = () => ds.zone(g.state.char.zoneId);
  const hp = () => `${g.state.char.health}/${maxHealth(g.state.char, ds)}`;
  const pw = () => `${g.state.char.power}/${maxPower(g.state.char, ds)}`;

  /** g.fight with the squad when the squad mode says so; the log names the companions. */
  const quickFight = (entry) => {
    const opts = pullOpts(g, ds, buffPace, entry, (l) => out(dim(`  ${l}`)));
    const r = g.fight(entry, opts);
    return { r, logNames: opts ? squadLogNames(g, entry, names()) : names() };
  };

  const reportFight = (r, enemyName, logNames) => {
    if (!r.ok) { out(red(`Cannot fight: ${r.reason}`)); return; }
    printLog(r.result.events, enemyName, logNames);
    const tag = r.outcome === 'win' ? green('Victory') : r.outcome === 'defeat' ? red('Defeat') : yellow('Stalemate');
    const bits = [`${(r.result.durationMs / 1000).toFixed(1)} s`, `HP ${hp()}`];
    if (r.xpGained) bits.push(`+${r.xpGained} xp`);
    if (r.goldGained) bits.push(`+${moneyText(r.goldGained)}`);
    out(`${tag} vs ${enemyName}  ${dim(bits.join('  '))}`);
    for (const d of r.loot) out(`  ${yellow('loot')} ${ds.item(d.item)?.name ?? d.item}${d.count > 1 ? ` x${d.count}` : ''}`);
    for (const lv of r.leveledTo) out(bold(green(`  You have reached level ${lv}!`)));
    if (r.outcome === 'defeat') deathHint();
  };

  // deathFlowStatus() is null while alive.
  const isDead = () => { const s = g.deathFlowStatus(); return !!s && s.deathState !== 'ALIVE' && s.deathState !== 'JUST_ALIVED'; };
  const deathHint = () => {
    const s = g.deathFlowStatus();
    out(red(`  You are dead (${s?.deathState ?? 'corpse'}).`) + dim(' Type release to run to your corpse, then reclaim; or spirit for the spirit healer.'));
  };

  const show = (res, okText) => {
    if (res.ok) { if (okText) out(green(okText)); }
    else out(red(res.reason || 'Nothing happened.'));
    return res.ok;
  };

  const questsHere = () => (zoneHere()?.quests ?? []).map((e) => ds.quest(e)).filter(Boolean);
  const questLogRows = () => g.state.questlog.quests.map((qs) => ({ qs, q: ds.quest(qs.entry) })).filter((x) => x.q);
  const countInBags = (item) => g.state.inventory.stacks.filter((s) => s.item === item).reduce((n, s) => n + s.count, 0);

  const objectiveLines = (q, qs) => {
    const out = [];
    for (const k of q.killTargets) out.push(`${ds.creature(k.creatureEntry)?.name ?? k.creatureEntry} slain: ${qs?.kills?.[String(k.creatureEntry)] ?? 0}/${k.count}`);
    for (const it of q.itemTargets) out.push(`${ds.item(it.item)?.name ?? it.item}: ${Math.min(countInBags(it.item), it.count)}/${it.count}`);
    for (const o of q.objectTargets) out.push(`${ds.gameObject?.(o.objectEntry)?.name ?? `object ${o.objectEntry}`}: ${qs?.objects?.[String(o.objectEntry)] ?? 0}/${o.count}`);
    return out;
  };

  const commands = {
    help() { out(HELP); },
    l() { this.look(); },
    look() {
      const z = zoneHere();
      if (!z) { out(red('You are nowhere.')); return; }
      out(bold(z.name) + dim(`  levels ${z.levelRange[0]}-${z.levelRange[1]}${z.faction ? `, ${z.faction}` : ''}`));
      const mobs = z.huntable.map((e) => ds.creature(e)).filter(Boolean).sort((a, b) => a.level - b.level);
      if (mobs.length) {
        out(cyan('Creatures:'));
        for (const m of mobs.slice(0, 30)) out(`  ${m.name} ${dim(`L${m.level} #${m.entry}`)}`);
        if (mobs.length > 30) out(dim(`  … ${mobs.length - 30} more`));
      }
      const have = new Set(g.state.questlog.quests.map((q) => q.entry));
      const offered = questsHere().filter((q) => !have.has(q.entry));
      if (offered.length) {
        out(cyan('Quests offered:'));
        for (const q of offered.slice(0, 25)) {
          const mark = q.minLevel <= g.state.char.level ? yellow('!') : dim('·');
          out(`  ${mark} ${q.title} ${dim(`L${q.questLevel} #${q.entry}`)}`);
        }
        if (offered.length > 25) out(dim(`  … ${offered.length - 25} more`));
      }
      const npc = [];
      for (const t of z.trainers ?? []) if (t.cls === g.state.char.cls) npc.push(`${ds.trainer(t.entry)?.name ?? t.entry} (${className(t.cls)} trainer)`);
      for (const v of z.vendors ?? []) { const d = ds.vendor(v); if (d) npc.push(`${d.name}${d.subname ? ` <${d.subname}>` : ''}`); }
      for (const p of z.profTrainers ?? []) { const d = ds.profTrainer(p); if (d) npc.push(`${d.name} (${ds.profession(d.skill)?.name ?? d.skill} trainer)`); }
      for (const i of z.innkeepers ?? []) npc.push(`${i.name} (innkeeper)`);
      if (npc.length) { out(cyan('People:')); for (const n of npc.slice(0, 30)) out('  ' + n); if (npc.length > 30) out(dim(`  … ${npc.length - 30} more`)); }
      out(cyan('Exits: ') + z.neighbors.map((id) => ds.zone(id)?.name ?? id).join(', '));
    },
    fight(args) {
      const m = args.match(/^(.*?)(?:\s+x(\d+))?$/i);
      const q = m[1].trim(); const times = Math.min(Number(m[2] ?? 1), 50);
      const mobs = (zoneHere()?.huntable ?? []).map((e) => ds.creature(e)).filter(Boolean);
      const r = pick(mobs, q, (c) => c.name, (c) => c.entry);
      if (r.none) { out(red('No such creature here. Try look.')); return; }
      if (r.many) { out('Which one? ' + r.many.slice(0, 12).map((c) => c.name).join(', ')); return; }
      for (let i = 0; i < times; i++) {
        const { r: res, logNames } = quickFight(r.one.entry);
        reportFight(res, r.one.name, logNames);
        if (!res.ok || res.outcome !== 'win') break;
      }
    },
    rest(args) {
      const secs = Math.max(1, Math.min(Number(args) || 60, 3600));
      g.regenTick(secs, true);
      out(`You rest for ${secs} s.  HP ${hp()}  power ${pw()}`);
    },
    q() { this.quests(); },
    quests() {
      const rows = questLogRows();
      if (!rows.length) { out('Your quest log is empty.'); return; }
      for (const { qs, q } of rows) {
        const st = qs.status === 'complete' ? green('complete') : qs.status === 'failed' ? red('failed') : qs.status === 'turnedIn' ? dim('done') : yellow('active');
        out(`${bold(q.title)} ${dim(`L${q.questLevel} #${q.entry}`)}  ${st}`);
        if (qs.status === 'active' || qs.status === 'complete') for (const o of objectiveLines(q, qs)) out('    ' + o);
      }
    },
    quest(args) {
      const all = [...questsHere(), ...questLogRows().map((x) => x.q)];
      const r = pick(all, args, (q) => q.title, (q) => q.entry);
      if (!r.one) { out(red('No such quest here or in your log.')); return; }
      const q = r.one;
      out(bold(q.title) + dim(`  L${q.questLevel}, requires ${q.minLevel}  #${q.entry}`));
      out(wrap(q.detailsText, g.state.char));
      out(cyan('  Objectives'));
      out(wrap(q.objectivesText, g.state.char));
      for (const o of objectiveLines(q, g.state.questlog.quests.find((s) => s.entry === q.entry))) out('    ' + o);
      const rew = [];
      if (q.rewMoney) rew.push(moneyText(q.rewMoney));
      if (q.rewXP) rew.push(`${q.rewXP} xp`);
      for (const it of q.rewItems) rew.push(`${ds.item(it.item)?.name ?? it.item}${it.count > 1 ? ` x${it.count}` : ''}`);
      if (rew.length) out(cyan('  Rewards: ') + rew.join(', '));
      if (q.rewChoiceItems?.length) out(cyan('  Choose one: ') + q.rewChoiceItems.map((it, i) => `[${i}] ${ds.item(it.item)?.name ?? it.item}`).join('  '));
    },
    accept(args) {
      const r = pick(questsHere(), args, (q) => q.title, (q) => q.entry);
      if (!r.one) { out(red(r.many ? 'Which quest? ' + r.many.map((q) => q.title).join(', ') : 'No such quest offered here.')); return; }
      show(g.acceptQuest(r.one.entry), `Quest accepted: ${r.one.title}`);
    },
    turnin(args) {
      const m = args.match(/^(.*?)(?:\s+(\d+))?$/);
      const r = pick(questLogRows().map((x) => x.q), m[1], (q) => q.title, (q) => q.entry);
      if (!r.one) { out(red('No such quest in your log.')); return; }
      const q = r.one;
      if (q.rewChoiceItems?.length && m[2] == null) {
        out('Pick a reward: ' + q.rewChoiceItems.map((it, i) => `[${i}] ${ds.item(it.item)?.name ?? it.item}`).join('  '));
        out(dim(`  turnin ${q.entry} <n>`));
        return;
      }
      const res = g.turnInQuest(q.entry, Number(m[2] ?? 0));
      if (!show(res, `Quest complete: ${q.title}`)) return;
      const bits = [];
      if (res.xp) bits.push(`+${res.xp} xp`);
      if (res.money) bits.push(`+${moneyText(res.money)}`);
      for (const it of res.items) bits.push(`${ds.item(it.item)?.name ?? it.item}${it.count > 1 ? ` x${it.count}` : ''}`);
      for (const s of res.spells ?? []) bits.push(`learned ${s.name ?? s.spellId ?? ''}`.trim());
      if (bits.length) out('  ' + bits.join(', '));
      for (const lv of res.leveledTo) out(bold(green(`  You have reached level ${lv}!`)));
    },
    abandon(args) {
      const r = pick(questLogRows().map((x) => x.q), args, (q) => q.title, (q) => q.entry);
      if (!r.one) { out(red('No such quest in your log.')); return; }
      show(g.abandonQuest(r.one.entry), `Abandoned ${r.one.title}.`);
    },
    talk(args) {
      if (!args) { out('talk <npc name>'); return; }
      show(g.talkToNpc({ npcName: args }), `You speak with ${args}.`);
    },
    i() { this.bags(); },
    bags() {
      const st = g.state.inventory.stacks;
      out(bold(`Bags ${st.length}/${bagCapacity(g.state.char, ds)}`) + dim(`  ${moneyText(g.state.char.gold)}`));
      for (const s of st) {
        const it = ds.item(s.item);
        const qn = QUALITY[it?.quality ?? 1] ?? '';
        out(`  ${it?.name ?? s.item}${s.count > 1 ? ` x${s.count}` : ''} ${dim(`${qn}${it?.slot ? ` ${it.slot}` : ''} #${s.item}`)}`);
      }
    },
    gear() {
      for (const [slotName, entry] of Object.entries(g.state.char.equipped)) {
        if (entry == null) continue;
        const it = ds.item(typeof entry === 'object' ? entry.entry : entry);
        out(`  ${slotName.padEnd(9)} ${it?.name ?? entry}`);
      }
    },
    equip(args) {
      const stacks = g.state.inventory.stacks;
      const r = pick(stacks, args, (s) => ds.item(s.item)?.name, (s) => s.item);
      if (!r.one) { out(red('No such item in your bags.')); return; }
      show(g.equip(r.one.item), `Equipped ${ds.item(r.one.item)?.name}.`);
    },
    unequip(args) { show(g.unequip(args.trim()), `Removed ${args.trim()}.`); },
    use(args) {
      const r = pick(g.state.inventory.stacks, args, (s) => ds.item(s.item)?.name, (s) => s.item);
      if (!r.one) { out(red('No such item in your bags.')); return; }
      show(g.consumeItem(r.one.item), `You use ${ds.item(r.one.item)?.name}.  HP ${hp()}  power ${pw()}`);
    },
    sell(args) {
      const m = args.match(/^(.*?)(?:\s+(\d+))?$/);
      const r = pick(g.state.inventory.stacks, m[1], (s) => ds.item(s.item)?.name, (s) => s.item);
      if (!r.one) { out(red('No such item in your bags.')); return; }
      const res = g.sellItem(r.one.item, m[2] ? Number(m[2]) : undefined);
      show(res, res.ok ? `Sold ${res.qty} for ${moneyText(res.earned)}.` : '');
    },
    junk() { const res = g.sellAllJunk(); show(res, res.ok ? `Sold ${res.count} grey items for ${moneyText(res.earned)}.` : ''); },
    vendor(args) {
      const vendors = (zoneHere()?.vendors ?? []).map((v) => ds.vendor(v)).filter(Boolean);
      if (!vendors.length) { out('No vendors here.'); return; }
      if (!args) { for (const v of vendors) out(`  ${v.name}${v.subname ? ` <${v.subname}>` : ''}${v.canRepair ? dim(' repairs') : ''}`); return; }
      const r = pick(vendors, args, (v) => v.name, (v) => v.entry);
      if (!r.one) { out(red(r.many ? 'Which vendor? ' + r.many.map((v) => v.name).join(', ') : 'No such vendor here.')); return; }
      curVendor = r.one;
      out(bold(curVendor.name) + dim(curVendor.canRepair ? '  (repairs)' : ''));
      for (const o of g.vendorOffers(curVendor.entry)) {
        const it = ds.item(o.itemEntry);
        const stock = o.stockRemaining == null ? '' : dim(`  ${o.stockRemaining} in stock`);
        out(`  ${it?.name ?? o.itemEntry}${o.unitsPerPurchase > 1 ? ` x${o.unitsPerPurchase}` : ''}  ${yellow(moneyText(o.pricePerPurchase))}${stock}${it?.requiredLevel > 1 ? dim(`  L${it.requiredLevel}`) : ''}`);
      }
    },
    buy(args) {
      if (!curVendor) { out('Open a vendor first: vendor <name>'); return; }
      const m = args.match(/^(.*?)(?:\s+(\d+))?$/);
      const offers = g.vendorOffers(curVendor.entry);
      const r = pick(offers, m[1], (o) => ds.item(o.itemEntry)?.name, (o) => o.itemEntry);
      if (!r.one) { out(red('The vendor does not sell that.')); return; }
      const res = g.buyItem(curVendor.entry, r.one.itemEntry, Number(m[2] ?? 1));
      show(res, res.ok ? `Bought ${ds.item(r.one.itemEntry)?.name} for ${moneyText(res.spent)}.` : '');
    },
    repair() {
      const res = g.repairAll(curVendor?.entry);
      show(res, res.ok ? `Repaired for ${moneyText(res.spent)}.` : '');
    },
    trainer() {
      const list = trainersHere();
      if (!list.length) { out(`No ${className(g.state.char.cls)} trainer here.`); return; }
      for (const t of list) {
        out(bold(t.name));
        const rows = learnable(t);
        if (!rows.length) out(dim('  nothing new to learn at your level'));
        for (const { sp, ts } of rows) out(`  ${sp.name}${sp.rank ? ` (Rank ${sp.rank})` : ''}  ${yellow(moneyText(ts.cost))} ${dim(`L${ts.reqLevel} #${sp.id}`)}`);
      }
    },
    train(args) {
      const list = trainersHere();
      if (!list.length) { out(`No ${className(g.state.char.cls)} trainer here.`); return; }
      const rows = list.flatMap((t) => learnable(t).map((x) => ({ ...x, t })));
      if (args.trim() === 'all') {
        let n = 0;
        for (const { sp, t } of rows) if (g.learnFromTrainer(t.entry, sp.id).ok) { n++; out(green(`  Learned ${sp.name}${sp.rank ? ` (Rank ${sp.rank})` : ''}.`)); }
        if (!n) out('Nothing learned.');
        return;
      }
      const r = pick(rows, args, (x) => x.sp.name, (x) => x.sp.id);
      if (!r.one) { out(red(r.many ? 'Which spell? ' + r.many.map((x) => `${x.sp.name} #${x.sp.id}`).join(', ') : 'The trainer does not teach that yet.')); return; }
      show(g.learnFromTrainer(r.one.t.entry, r.one.sp.id), `Learned ${r.one.sp.name}.`);
    },
    spells() {
      const known = knownUsableSpells(g.state.char, g.state.spellbook, ds).sort((a, b) => a.name.localeCompare(b.name));
      for (const sp of known) {
        const cd = g.spellCooldownRemaining(sp.id);
        out(`  ${sp.name}${sp.rank ? ` (Rank ${sp.rank})` : ''} ${dim(`${sp.cost ? `${sp.cost} ${sp.powerType}` : ''}${cd > 0 ? `  cooldown ${Math.ceil(cd / 1000)} s` : ''} #${sp.id}`)}`);
      }
    },
    cast(args) {
      const known = knownUsableSpells(g.state.char, g.state.spellbook, ds);
      const r = pick(known, args, (s) => s.name, (s) => s.id);
      if (!r.one) { out(red(r.many ? 'Which spell? ' + r.many.map((s) => `${s.name}${s.rank ? ` r${s.rank}` : ''} #${s.id}`).join(', ') : 'You do not know that spell.')); return; }
      show(g.castOutOfCombat(r.one.id), `You cast ${r.one.name}.`);
    },
    c() { this.char(); },
    char() {
      const ch = g.state.char;
      out(bold(ch.name) + `  level ${ch.level} ${raceName(ch.race)} ${className(ch.cls)}`);
      out(`  xp ${ch.xp}/${ds.xpToNext(ch.level)}  HP ${hp()}  power ${pw()}  ${moneyText(ch.gold)}`);
      out(`  zone ${zoneHere()?.name ?? ch.zoneId}${ch.hearth ? `, home ${ds.zone(ch.hearth.zoneId ?? ch.hearth)?.name ?? ''}` : ''}`);
      const skills = Object.entries(ch.skills ?? {});
      if (skills.length) out('  skills ' + skills.map(([k, v]) => `${ds.profession(k)?.name ?? k} ${typeof v === 'object' ? `${v.current ?? v.value ?? 0}/${v.max ?? '?'}` : v}`).join(', '));
    },
    travel(args) {
      const z = zoneHere();
      const dests = (z?.neighbors ?? []).map((id) => ds.zone(id)).filter(Boolean);
      let r = pick(dests, args, (d) => d.name, () => -1);
      if (!r.one) r = pick(ds.zones(), args, (d) => d.name, () => -1);
      if (!r.one) { out(red(r.many ? 'Which zone? ' + r.many.map((d) => d.name).join(', ') : 'No such zone.')); return; }
      const pv = g.previewTravel(r.one.id);
      if (!show(pv)) return;
      const res = g.travelTo(r.one.id);
      if (!show(res)) return;
      curVendor = null;
      if (!arrive()) { onTheRoad(r.one.name); return; }
      out(`You travel to ${bold(r.one.name)}.  ${dim(`${Math.round(pv.totalSeconds)} s${pv.totalCopper ? `, ${moneyText(pv.totalCopper)}` : ''}`)}`);
      this.look();
    },
    hearth() { const res = g.castHearth(); if (!show(res)) return; curVendor = null; if (arrive()) out(`You hearth to ${zoneHere()?.name}.`); else onTheRoad(g.journeyStatus()?.destination ? ds.zone(g.journeyStatus().destination)?.name ?? 'home' : 'home'); },
    bind() { show(g.bindHearth(), `Your home is now ${zoneHere()?.name}.`); },
    release() { show(g.runToCorpse(), 'You release your spirit and run to your corpse.'); },
    reclaim() { show(g.reclaimCorpse(), `You return to life.  HP ${hp()}`); },
    spirit() { show(g.spiritHealerResurrect(), `The spirit healer returns you to life.  HP ${hp()}`); },
    log(args) { logOn = args.trim() !== 'off'; out(`Combat log ${logOn ? 'on' : 'off'}.`); },
    auto(args) { runAutopilot(args); },
    squad(args) {
      const want = SQUAD_MODE_WORDS[args.trim().toLowerCase()];
      if (args.trim() && !want) { out(red('squad solo, squad elites or squad party')); return; }
      if (want) setSquadMode(g, want);
      const mode = squadModeOf(g.autopilotConfig());
      out(`${want ? 'Squad mode is now' : 'Squad mode:'} ${bold(mode ? SQUAD_MODE_LABEL[mode].title : 'custom')}. ${dim(mode ? SQUAD_MODE_LABEL[mode].detail : 'Set in the autopilot settings.')}`);
      if (!(g.state.squad ?? []).length) out(dim('  You have no companions seated. Innkeepers hire them out.'));
    },
    async save() { await persist(); out(dim(`saved ${slot}`)); },
  };

  function trainersHere() {
    return (zoneHere()?.trainers ?? []).filter((t) => t.cls === g.state.char.cls).map((t) => ds.trainer(t.entry)).filter(Boolean);
  }
  function learnable(t) {
    const known = new Set(g.state.spellbook.known);
    return t.spells
      .filter((ts) => ts.reqLevel <= g.state.char.level && !known.has(ts.spell))
      .map((ts) => ({ ts, sp: ds.spell(ts.spell) }))
      .filter((x) => x.sp)
      .sort((a, b) => a.ts.reqLevel - b.ts.reqLevel || a.sp.name.localeCompare(b.sp.name));
  }

  // One autopilot step per call: `next()` returns a log line (possibly empty), or null once it has
  // stopped. The REPL loops it synchronously; the TUI runs it on a timer so the player can watch.
  // Step-by-step autopilot over the pure planner. `liveFight(step, settle)` lets a host run
  // the fight as a real-time session and call `settle(outcome)` when it ends; without it fights are
  // auto-resolved by the engine. `ap.lastKind` is the kind of the step `next()` just took.
  // `quest` pins the run to one quest log entry (Do Quest); it stops when that quest is done or stuck.
  function createAutopilot(args, { liveFight, quest } = {}) {
    const m = String(args ?? '').match(/^(\d+)?\s*(?:farm\s+(.+))?$/i);
    const steps = Math.min(Number(m?.[1] ?? 20), 5000);
    // A reward choice is the player's to make, so Do Quest stops at the hand-in for those.
    let mode = quest != null ? { kind: 'quest', entry: quest, pin: true, handInByHand: !!ds.quest(quest)?.rewChoiceItems?.length } : { kind: 'quest' };
    if (m?.[2]) {
      const r = pick((zoneHere()?.huntable ?? []).map((e) => ds.creature(e)).filter(Boolean), m[2], (c) => c.name, (c) => c.entry);
      if (!r.one) return { error: 'No such creature here.' };
      mode = { kind: 'farm', creatureEntry: r.one.entry };
    }
    // World questing skips and blacklists a quest it fails on (a death, a dead end, an error) and moves on
    // to the next one instead of ending the run. Do Quest is an explicit pick, so it clears that quest's entry.
    const skipping = mode.kind === 'quest' && !mode.pin;
    if (quest != null) questBlacklist.delete(quest);
    const sets = { blockedAccepts: new Set(), blockedSpeaks: new Set(), blockedObjects: new Set(), blockedTurnins: new Set(), blockedUses: new Set(), blockedFights: new Set(), blockedTravels: new Set(), blockedQuests: new Set(skipping ? questBlacklist : []) };
    const prog = { elapsedMs: 0, recovering: false, consecutiveDefeats: 0, questDefeats: new Map(), ...sets };
    const cfg = g.autopilotConfig();
    const nm = (id) => ds.quest(id)?.title ?? `quest ${id}`;
    let i = 0;
    let done = false;
    let lastKind = null;
    let lastQuest = null; // the quest the latest step worked on, blamed when the planner gives up
    const skipped = [];
    const inLog = (entry) => g.state.questlog.quests.some((qs) => qs.entry === entry && qs.status !== 'turnedIn');
    const blacklist = (entry, why) => {
      sets.blockedQuests.add(entry); questBlacklist.add(entry); skipped.push(entry);
      prog.consecutiveDefeats = 0;
      return yellow(`skipping ${nm(entry)}: ${why}`);
    };
    // A fight's outcome feeds the planner's defeat streak and recovery latch (phonecraft autopilotController).
    // A quest is dropped once it has cost QUEST_SKIP_DEFEATS deaths this run (fewer than the run-wide
    // maxConsecutiveDefeats stop, so one hopeless quest is abandoned before it ends the whole run).
    const settle = (r, step) => {
      if (r.outcome === 'defeat') {
        if (skipping && step.questEntry != null && noteQuestDefeat(prog, step.questEntry, QUEST_SKIP_DEFEATS)) {
          out(`${dim(String(i).padStart(3) + '.')} ${blacklist(step.questEntry, `died ${prog.questDefeats.get(step.questEntry)} times, last to ${ds.creature(step.creatureEntry)?.name ?? step.creatureEntry}`)}`);
        } else if (!skipping || step.questEntry == null) { prog.consecutiveDefeats++; prog.recovering = true; }
      } else if (r.outcome === 'win') { prog.consecutiveDefeats = 0; prog.recovering = false; }
    };
    const next = () => {
      if (done || i >= steps) { done = true; return null; }
      i++;
      lastKind = null;
      if (isDead()) {
        g.runToCorpse();
        if (!g.reclaimCorpse().ok) g.spiritHealerResurrect();
        return dim(`${String(i).padStart(3)}. back to life, HP ${hp()}`);
      }
      let step = null;
      let line = '';
      try {
        step = planStep(g.state, ds, mode, cfg, prog);
        lastKind = step.kind;
        if (prog.eliteNeedsSquad && !companionHintShown && !(g.state.squad ?? []).length) {
          companionHintShown = true;
          for (const l of COMPANION_HINT_LINES) out(yellow(`  ${l}`));
        }
        if (step.questEntry != null) lastQuest = step.questEntry;
        switch (step.kind) {
          case 'fight': {
            const c = ds.creature(step.creatureEntry);
            if (liveFight) {
              const started = liveFight(step, (r) => settle(r, step));
              if (!started.ok) { sets.blockedFights.add(step.creatureEntry); line = red(`fight ${c?.name}: ${started.reason}`); }
              break;
            }
            const { r } = quickFight(step.creatureEntry);
            if (!r.ok) { sets.blockedFights.add(step.creatureEntry); line = red(`fight ${c?.name}: ${r.reason}`); break; }
            settle(r, step);
            const loot = r.loot.map((d) => ds.item(d.item)?.name ?? d.item).join(', ');
            line = `${r.outcome === 'win' ? 'killed' : r.outcome} ${c?.name}  HP ${hp()}${r.xpGained ? `  +${r.xpGained} xp` : ''}${loot ? `  ${yellow(loot)}` : ''}`;
            for (const lv of r.leveledTo) out(bold(green(`  Level ${lv}!`)));
            break;
          }
          case 'consume': { const r = g.consumeItem(step.itemEntry, step.effect); line = r.ok ? `${step.effect}: ${ds.item(step.itemEntry)?.name}` : red(`cannot ${step.effect}: ${r.reason}`); break; }
          case 'cannibalize': { const r = g.cannibalize(); line = r.ok ? 'cannibalize' : red(r.reason); break; }
          case 'wait': g.regenTick(10, true); prog.elapsedMs += 10_000; line = dim(`rest  HP ${hp()}  power ${pw()}`); break;
          case 'turnin': { const r = g.turnInQuest(step.questEntry, 0); if (!r.ok) sets.blockedTurnins.add(step.questEntry); line = r.ok ? green(`turned in ${nm(step.questEntry)}`) : red(`turn-in ${nm(step.questEntry)}: ${r.reason}`); break; }
          case 'accept': { const r = g.acceptQuest(step.questEntry); if (!r.ok) sets.blockedAccepts.add(step.questEntry); line = r.ok ? `accepted ${nm(step.questEntry)}` : dim(`skip ${nm(step.questEntry)}: ${r.reason}`); break; }
          case 'object': { const r = g.interactObject(step.objectEntry); if (!r.ok) sets.blockedObjects.add(step.objectEntry); line = r.ok ? `used ${ds.gameObject?.(step.objectEntry)?.name ?? step.objectEntry}` : dim(`object ${step.objectEntry}: ${r.reason}`); break; }
          case 'use': { const r = g.useQuestItemOnTarget({ itemEntry: step.itemEntry, targetCreatureEntry: step.targetCreatureEntry }); if (!r.ok) sets.blockedUses.add(step.itemEntry); line = r.ok ? `used ${ds.item(step.itemEntry)?.name}` : dim(`use ${ds.item(step.itemEntry)?.name}: ${r.reason}`); break; }
          case 'speak': { const r = g.talkToNpc({ npcName: step.npcName }); if (!r.ok) sets.blockedSpeaks.add(step.questEntry); line = r.ok ? `spoke to ${step.npcName}` : dim(`speak ${step.npcName}: ${r.reason}`); break; }
          case 'travel': { const r = g.travelTo(step.zoneId); if (r.ok) skipJourney(); else sets.blockedTravels.add(step.zoneId); line = r.ok ? cyan(`travel to ${ds.zone(step.zoneId)?.name} (${step.reason})`) : dim(`travel ${step.zoneId}: ${r.reason}`); break; }
          case 'equip': { const r = g.equip(step.itemEntry); line = r.ok ? `equipped ${ds.item(step.itemEntry)?.name}` : dim(`equip: ${r.reason}`); break; }
          case 'event': { const r = g.finishEscort(step.questEntry); if (!r.ok) sets.blockedQuests.add(step.questEntry); line = r.ok ? `event done for ${nm(step.questEntry)}` : dim(`event: ${r.reason}`); break; }
          case 'gather': { const r = g.gather(step.nodeId); line = r.ok ? `gathered ${r.yielded.map((d) => ds.item(d.item)?.name).join(', ')}` : dim(`gather: ${r.reason}`); break; }
          case 'skin': { const r = g.skin(); line = r.ok ? `skinned: ${r.yielded.map((d) => ds.item(d.item)?.name).join(', ')}` : dim(`skin: ${r.reason}`); break; }
          case 'buy': { const r = g.buyItem(step.vendorEntry, step.itemEntry, step.count); line = r.ok ? `bought ${ds.item(step.itemEntry)?.name} x${step.count}` : dim(`buy: ${r.reason}`); break; }
          case 'stop': {
            const why = `${step.reason}${step.detail ? ` (${step.detail})` : ''}`;
            // Stuck or beaten on a quest: drop that quest and plan again rather than end the run.
            if (skipping && (step.reason === 'noTargets' || step.reason === 'defeated') && lastQuest != null && !sets.blockedQuests.has(lastQuest) && inLog(lastQuest)) { line = blacklist(lastQuest, step.detail ?? step.reason); break; }
            line = yellow(`autopilot stopped: ${why}`); done = true; break;
          }
          default: line = dim(`unhandled step ${step.kind}`);
        }
      } catch (err) {
        const entry = step?.questEntry ?? lastQuest;
        if (!skipping || entry == null || sets.blockedQuests.has(entry)) throw err;
        line = blacklist(entry, `error: ${err.message}`);
      }
      prog.elapsedMs += 1000;
      return line ? `${dim(String(i).padStart(3) + '.')} ${line}` : '';
    };
    const summary = () => `Level ${g.state.char.level}, ${moneyText(g.state.char.gold)}, ${zoneHere()?.name}.${skipped.length ? ` Skipped: ${skipped.map(nm).join(', ')}.` : ''}`;
    return { next, steps, summary, get done() { return done; }, get lastKind() { return lastKind; }, get step() { return i; } };
  }

  function runAutopilot(args) {
    const ap = createAutopilot(args);
    if (ap.error) { out(red(ap.error)); return; }
    const wasLog = logOn; logOn = false;
    for (let line = ap.next(); line != null; line = ap.next()) if (line) out(line);
    logOn = wasLog;
    out(ap.summary());
  }
  return { commands, HELP, runAutopilot, createAutopilot, questBlacklist, buffPace, flushActivity, printLog, isDead, hp, pw, zoneHere, getVendor: () => curVendor, setVendor: (v) => { curVendor = v; } };
}
