// The character create screen: race, class, gender, name and the five looks of the body on one form, the
// hero drawn in the starting gear beside it, and under the form a card of what they start with (the race
// and the class in a sentence, racials, pools and attributes at level 1, spells, gear). Left and Right
// change the row under the cursor; Enter on Race or Class opens a list with each choice drawn; Enter on
// Name types one; Enter on Create rolls the character. Esc goes back to the character list.
import { bold, dim, green, red, wrapLines, fit } from './text.mjs';
import { className, raceName } from '../domain/core/ids.ts';
import { newGameState, newGameStateFromWorldBot, pickRandomWorldBot } from '../engine/game.ts';
import { maxHealth, maxPower, knownUsableSpells } from '../domain/character/character.ts';
import { effectiveStats, powerType } from '../domain/character/characterStats.ts';
import { bodyOptions, clampAppearance, cycleAppearance, lowestSelectable, slotCount, APPEARANCE_SLOTS } from '../domain/character/appearance.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { nativeDisplayId } from '../domain/character/displayForm.ts';
import { creatureArt } from './modelArt.mjs';
import { paperdollArt } from './paperdoll.mjs';

// A sentence on each race and class, in the voice of the client's create screen; the racials, the start
// zone and everything else on the card come from the data.
const RACE_BLURB = {
  1: 'The people of Stormwind, adaptable and diplomatic: their spirit runs deeper, reputation comes sooner, and they see through stealth a little further.',
  2: 'The Horde of Thrall, hardy and fierce. Blood Fury hardens their attacks, stuns slide off them more often, their axes bite deeper, and their pets strike harder.',
  3: 'The stout folk of Ironforge. Stoneform shrugs off poison, disease and bleeding; they resist frost, shoot guns truer, and can find treasure in the earth.',
  4: 'The Kaldorei of Teldrassil, ancient and watchful. They melt into Shadowmeld, are harder to hit, resist nature, and walk as wisps when they fall.',
  5: 'The Forsaken of the Undercity, free of the Lich King. Will of the Forsaken breaks fear, charm and sleep; they eat the dead to heal, breathe underwater longer, and resist shadow.',
  6: 'The Shu\'halo of Mulgore, peaceful until roused. War Stomp stuns everything around them, they stand with more health, resist nature, and gather herbs faster.',
  7: 'The tinkers of Gnomeregan, guests of Ironforge. Escape Artist slips any snare, their minds hold more mana, they resist arcane, and they are born engineers.',
  8: 'The Darkspear, who followed Thrall from the Echo Isles. Berserking quickens blows and spells, they regenerate even in a fight, slay beasts harder, and throw and shoot bows truer.',
};
const CLASS_BLURB = {
  1: 'Steel and rage. Warriors wear the heaviest armour, hold the line behind a shield or swing a two-hander, and build rage by hitting and being hit.',
  2: 'The Light\'s champion in plate: a healer, a protector and a slow but sure fighter, with blessings for the party and a bubble for when it goes wrong.',
  3: 'A ranger with a bow or gun and a pet tamed from the wild. The pet holds the foe while the hunter shoots, and the map shows what they track.',
  4: 'A stealthy fighter who builds combo points with blades and spends them on finishing moves. Poisons, lockpicking and picking pockets come with the trade.',
  5: 'The great healer, in cloth. Holy mends and shields the party; Shadow drains and torments from Shadowform, trading the healing for the dark.',
  6: 'The Horde\'s keeper of the elements, in mail: totems, lightning and shocks, heals and weapon imbues, half melee and half spell at every turn.',
  7: 'The master of frost, fire and arcane, fragile in cloth and lethal at range. Conjures food and water, sheeps a foe, and opens portals between cities.',
  8: 'A wielder of fel magic in cloth: curses and damage over time, a demon summoned to tank or drain, and health, soul shards and healthstones traded for power.',
  9: 'The shapeshifter: a bear to tank, a cat to claw, healing and nature magic in caster form, and travel form for the road.',
};

const NAME_RE = /^[A-Za-z]{2,12}$/;
const properName = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();
const rand = (n) => Math.floor(Math.random() * n);
const newSeed = () => (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;

/** A random look within the body's legal choices (the create screen's shuffle; bald and hornless allowed where offered). */
export function randomLook(race, gender) {
  const look = {};
  APPEARANCE_SLOTS.forEach((key, s) => {
    const floor = lowestSelectable(race, gender, s), count = slotCount(race, gender, s);
    look[key] = count > floor ? floor + rand(count - floor) : 0;
  });
  return clampAppearance(look, race, gender);
}

/** A name from the world bots' pool for the gender, fit for a character. */
export function randomName(ds, gender) {
  const pool = ds.botNames()[gender === 1 ? 'female' : 'male'];
  for (let i = 0; i < 50 && pool.length; i++) { const n = pool[rand(pool.length)]; if (NAME_RE.test(n)) return properName(n); }
  return gender === 1 ? 'Aalina' : 'Aalart';
}

/** The screen. `done(state)` gets the new character's game state; `onCancel` is Esc (back to the character list). */
export function characterCreation(app, done, { onCancel } = {}) {
  const ds = app.ds;
  const races = ds.races();
  const classesOf = (race) => race.classes.filter((c) => ds.createInfo(race.id, c));
  const st = { race: races[0], cls: classesOf(races[0])[0], gender: 0, name: '', look: null };
  st.look = randomLook(st.race.id, st.gender);
  // The state a Create would make for a body and class, less the name and the look: its character carries the
  // starting gear, pools and attributes the card and the drawing read. One per combination, kept.
  const previews = new Map();
  const previewOf = (race, cls, gender) => {
    const key = `${race}-${cls}-${gender}`;
    let p = previews.get(key);
    if (!p) { p = newGameState(ds, race, cls, 'Preview', 1, gender); previews.set(key, p); }
    return p;
  };
  const preview = () => previewOf(st.race.id, st.cls, st.gender);
  const hero = (cls = st.cls) => ({ ...previewOf(st.race.id, cls, st.gender).char, name: st.name || 'Preview', appearance: st.look });
  const setRace = (r) => { st.race = r; const cs = classesOf(r); if (!cs.includes(st.cls)) st.cls = cs[0]; st.look = clampAppearance(st.look, r.id, st.gender); };
  const setGender = (g) => { st.gender = g; st.look = clampAppearance(st.look, st.race.id, g); };
  const cycle = (list, cur, dir) => list[(list.indexOf(cur) + dir + list.length) % list.length];
  const genderName = () => (st.gender === 1 ? 'Female' : 'Male');
  const factionName = (r) => (r.faction === 'horde' ? 'Horde' : 'Alliance');

  const view = { id: 'create', title: 'New character', hint: 'Left Right: change   Enter: pick or type' + (onCancel ? '   Esc: character list' : '') };
  const rowAt = (id) => app.rowsOf(view).findIndex((r) => r.id === id);
  const goTo = (id) => { const i = rowAt(id); if (i >= 0) { view.cursor = i; app.ensureVisible(view, app.rowsOf(view)); } app.render(); };

  // The hero drawn for the pane: the body in its starting gear with the look, or the bare body when the gear pack lacks it.
  const drawn = (cls, maxCols, maxRows) => paperdollArt(hero(cls), maxCols, maxRows) ?? creatureArt(nativeDisplayId(st.race.id, st.gender), maxCols, maxRows);
  const withBody = (text, art) => (art ? [...text, '', ...art] : text);

  const askName = () => app.prompt('Name (2-12 letters): ', (raw) => {
    const name = raw.trim();
    if (!NAME_RE.test(name)) { app.say(red('Letters only, 2 to 12 of them.')); askName(); return; } // said in the log: the prompt covers the hint line
    st.name = properName(name);
    goTo('create'); // named: Enter again creates
  }); // the line starts empty: Esc keeps the name they had
  const rollName = () => { st.name = randomName(ds, st.gender); app.render(); };
  const shuffle = () => { st.look = randomLook(st.race.id, st.gender); app.render(); };
  const create = () => {
    if (!st.name) { app.flashMsg('Give them a name first.'); goTo('name'); return; }
    done(newGameState(ds, st.race.id, st.cls, st.name, newSeed(), st.gender, st.look));
  };
  const randomCharacter = () => {
    const seed = newSeed();
    done(newGameStateFromWorldBot(ds, pickRandomWorldBot(ds, seed), seed));
  };

  // Enter on Race: every race listed with its body drawn; on Class: every class this race may be, drawn in its gear.
  const racePicker = () => {
    const p = app.pick('Race', races.map((r) => ({
      label: `${fit(r.name, 10)} ${dim(factionName(r))}`,
      detail: () => {
        const L = app.layout();
        const text = [bold(r.name), dim(factionName(r)), `Starts in ${ds.zone(r.startZone)?.name ?? r.startZone}`, dim('Classes: ') + classesOf(r).map(className).join(', ')];
        return withBody(text, creatureArt(nativeDisplayId(r.id, st.gender), L.detailW - 2, L.mainH - text.length - 1));
      },
      value: r,
    })), (r) => { setRace(r); app.render(); }, { hint: 'Enter: choose' });
    p.cursor = races.indexOf(st.race);
  };
  const classPicker = () => {
    const classes = classesOf(st.race);
    const p = app.pick('Class', classes.map((c) => ({
      label: className(c),
      detail: () => {
        const L = app.layout();
        const text = [bold(className(c)), ...wrapLines(dim(CLASS_BLURB[c] ?? ''), L.detailW - 2)];
        return withBody(text, drawn(c, L.detailW - 2, L.mainH - text.length - 1));
      },
      value: c,
    })), (c) => { st.cls = c; app.render(); }, { hint: 'Enter: choose' });
    p.cursor = classes.indexOf(st.cls);
  };

  // A form row: the label, the value, and the arrows when Left and Right change it.
  const field = (id, label, value, { cycle: cyc, act, arrows = true }) => ({ id, text: `${fit(label, 12)} ${fit(bold(value), 10)}${arrows ? ` ${dim('◂ ▸')}` : ''}`, cycle: cyc, act });
  const H = (text = '', plain = false) => ({ text, header: true, plain });

  // Under the form: what the race and the class are, and what a level 1 of them starts with.
  const card = () => {
    const L = app.layout();
    const w = Math.max(24, (L.detailW ? L.listW : L.W) - 3);
    const wrap = (t) => wrapLines(t, w).map((l) => H(l, true));
    const r = st.race, p = preview(), ch = p.char;
    const out = [H(`${r.name} · ${factionName(r)}`)];
    if (RACE_BLURB[r.id]) out.push(...wrap(RACE_BLURB[r.id]));
    out.push(...wrap(dim(`Starts in ${ds.zone(r.startZone)?.name ?? r.startZone}; home city ${r.city}.`)));
    const racials = [...new Set(r.racials.map((id) => ds.spell(id)?.name).filter(Boolean))];
    if (racials.length) out.push(...wrap(`${dim('Racials:')} ${racials.join(', ')}`));
    out.push(H(), H(className(st.cls)));
    if (CLASS_BLURB[st.cls]) out.push(...wrap(CLASS_BLURB[st.cls]));
    const s = effectiveStats(ch, ds), pt = powerType(ch);
    out.push(...wrap(`${dim('Level 1:')} ${maxHealth(ch, ds)} health, ${maxPower(ch, ds)} ${pt}`));
    out.push(...wrap(`${dim('Str')} ${s.str}  ${dim('Agi')} ${s.agi}  ${dim('Sta')} ${s.sta}  ${dim('Int')} ${s.int}  ${dim('Spi')} ${s.spi}`));
    const spells = [...new Set(knownUsableSpells(ch, p.spellbook, ds).map((sp) => sp.name))];
    if (spells.length) out.push(...wrap(`${dim('Knows:')} ${spells.join(', ')}`));
    const worn = new Set(Object.values(ch.equipped ?? {}).map(equippedEntry));
    const wears = [], carries = [];
    for (const it of ds.createInfo(r.id, st.cls)?.items ?? []) {
      const def = ds.item(it.item);
      if (def) (worn.has(it.item) ? wears : carries).push(it.amount > 1 ? `${def.name} ×${it.amount}` : def.name);
    }
    if (wears.length) out.push(...wrap(`${dim('Wears:')} ${wears.join(', ')}`));
    if (carries.length) out.push(...wrap(`${dim('Carries:')} ${carries.join(', ')}`));
    return out;
  };

  view.rows = () => {
    const rows = [
      field('race', 'Race', st.race.name, { cycle: (d) => setRace(cycle(races, st.race, d)), act: racePicker }),
      field('class', 'Class', className(st.cls), { cycle: (d) => { st.cls = cycle(classesOf(st.race), st.cls, d); }, act: classPicker }),
      field('gender', 'Gender', genderName(), { cycle: () => setGender(st.gender === 1 ? 0 : 1), act: () => { setGender(st.gender === 1 ? 0 : 1); app.render(); } }),
      { id: 'name', text: `${fit('Name', 12)} ${st.name ? bold(st.name) : dim('Enter: type one   n: a random one')}`, act: askName },
      H(), H('Look'),
    ];
    // The body's own slots, by the names the client gives them (Horn Style, Tusks…); a slot with one choice is left out.
    const body = bodyOptions(st.race.id, st.gender);
    APPEARANCE_SLOTS.forEach((key, s) => {
      const opt = body?.options[s];
      if (!opt) return;
      const floor = lowestSelectable(st.race.id, st.gender, s), count = opt.count;
      if (count - floor <= 1) return;
      const i = st.look[key];
      const value = i === 0 && opt.none ? 'None' : `${i + 1 - floor} of ${count - floor}`;
      rows.push(field(key, opt.name, value, { cycle: (d) => { st.look = cycleAppearance(st.look, st.race.id, st.gender, s, d); }, act: () => { st.look = cycleAppearance(st.look, st.race.id, st.gender, s, 1); app.render(); } }));
    });
    rows.push({ id: 'shuffle', text: `${fit('', 12)} ${dim('r: a random look')}`, act: shuffle });
    rows.push(H());
    rows.push({ id: 'create', text: green(bold(st.name ? `Create ${st.name}, ${genderName()} ${st.race.name} ${className(st.cls)}` : 'Create (needs a name)')), act: create });
    rows.push({ id: 'random', text: `Random character  ${dim('a world bot at its own level, geared and named')}`, act: randomCharacter });
    rows.push(H(), ...card());
    return rows;
  };
  // The pane: the hero as they will stand on the Character tab, in the starting gear, as large as the pane allows.
  view.detail = () => {
    const L = app.layout();
    const head = [`${st.name ? bold(st.name) : dim('Unnamed')}  ${dim(`${genderName()} ${raceName(st.race.id)} ${className(st.cls)}`)}`, ''];
    const art = drawn(st.cls, L.detailW - 2, L.mainH - head.length);
    return art ? [...head, ...art] : head;
  };
  view.keys = {
    n: { hint: 'random name', fn: rollName },
    r: { hint: 'random look', fn: shuffle },
  };
  view.onKey = (a, k, row) => {
    if ((k === 'left' || k === 'right') && row?.cycle) { row.cycle(k === 'left' ? -1 : 1); a.render(); return true; }
    if (k === 'escape') { onCancel?.(); return true; }
    return false;
  };
  app.push(view);
  return view;
}
