// Talent builds for the Talents tab (B): the premade playerbot specs for your class, loadouts you saved, a pasted
// talent string (Wowhead-style digits or a classicdb link), and your own string to copy. Applying any of them
// is a respec at the usual price when points are already spent.
import { bold, dim, yellow, green, red, cyan } from './text.mjs';
import { moneyText } from '../domain/economy/money.ts';
import { talentLinkFromTalents } from '../domain/character/talentLink.ts';
import { linkFromClassicdbHash } from '../domain/character/talentImport.ts';

function applied(app, r) {
  app.result(r, r.ok ? `Your talents are now ${r.name}${r.cost ? ` (respec ${moneyText(r.cost)})` : ''}.` : '');
}

/** Spent points cost a respec; say the price before doing it. */
function withRespec(app, label, run) {
  const cost = app.g.respecCost();
  if (cost > 0) app.confirm(`Switch to ${label}? The respec costs ${moneyText(cost)}.`, () => applied(app, run()));
  else applied(app, run());
}

export function myTalentLink(app) {
  return talentLinkFromTalents(app.ch.talents ?? {}, app.ch.cls, app.ds);
}

/** A pasted string: bare digits ("3030502-05"), or a classicdb talent URL / hash. */
function parseLink(app, raw) {
  const text = raw.trim();
  if (/^[0-9-]+$/.test(text)) return text;
  const hash = text.includes('?') ? text.slice(text.lastIndexOf('?') + 1) : text.includes('#') ? text.slice(text.lastIndexOf('#') + 1) : text;
  const fromDb = linkFromClassicdbHash(hash, app.ds);
  if (fromDb && fromDb.cls !== app.ch.cls) return { error: 'That build is for another class.' };
  return fromDb?.link ?? { error: 'Not a talent string. Paste digits like 30305-0505 or a classicdb talent link.' };
}

export function talentBuildsMenu(app) {
  const g = app.g, cls = app.ch.cls;
  const specs = app.ds.botSpecs(cls) ?? [];
  const saved = (g.state.talentBuilds ?? []).filter((b) => b.cls === cls);
  const mine = myTalentLink(app);
  const opts = [
    ...specs.map((s, i) => ({ label: `${dim('premade ')} ${s.name}`, value: () => withRespec(app, s.name, () => g.applyPremadeSpec(i)) })),
    ...saved.map((b) => ({ label: `${cyan('saved   ')} ${b.name}${b.link === mine ? green('  ● current') : ''}`, detail: () => [bold(b.name), dim(b.link)], value: () => savedMenu(app, b) })),
    { label: green('Save my talents as a build'), value: () => app.prompt('Name: ', (name) => { const r = g.saveTalentBuild(name, cls, mine); app.result(r, r.ok ? `Saved ${r.name}.` : ''); app.afterAction(); }) },
    { label: 'Paste a talent string', value: () => app.prompt('Talent string or classicdb link: ', (raw) => {
      const link = parseLink(app, raw);
      if (typeof link !== 'string') { app.say(red(link.error)); app.afterAction(); return; }
      withRespec(app, 'that build', () => g.applyTalentLink(link));
      app.afterAction();
    }) },
    { label: `Show my talent string  ${dim(mine || 'nothing spent')}`, value: () => app.say(`Your talents: ${yellow(mine || '(none)')}`) },
  ];
  app.pick('Talent builds', opts, (fn) => fn());
}

function savedMenu(app, b) {
  app.pick(b.name, [
    { label: 'Use this build', value: () => withRespec(app, b.name, () => app.g.applyTalentBuild(b.id)) },
    { label: `Show its string  ${dim(b.link)}`, value: () => app.say(`${b.name}: ${yellow(b.link)}`) },
    { label: red('Delete it'), value: () => app.confirm(`Delete the ${b.name} build?`, () => app.result(app.g.deleteTalentBuild(b.id), `${b.name} deleted.`)) },
  ], (fn) => fn());
}
