// :dev, phonecraft's dev panel as verbs: give an item, finish a quest, learn a recipe, learn a profession to its
// cap. They skip the game's rules on purpose; the engine logs what they did like anything else.
import { dim, green, red, yellow, pick } from './text.mjs';

const USAGE = [
  ':dev item <name or entry> [count]    put it in your bags',
  ':dev quest <name or entry>           accept, finish and hand in a quest',
  ':dev recipe <name or id>             learn a recipe',
  ':dev prof <profession> [all]         a profession at its top rank (all: every recipe too)',
];

/** One name or id out of a list, or a reason. `name` and `id` read a row. */
function find(list, q, name, id) {
  const n = Number(q);
  if (Number.isInteger(n) && n > 0) { const hit = list.find((x) => id(x) === n); return hit ? { one: hit } : { error: `Nothing with id ${n}.` }; }
  // Several rows can share a name (a test copy of an item); an exact name takes the first of them.
  const exact = list.find((x) => String(name(x) ?? '').toLowerCase() === q.trim().toLowerCase());
  if (exact) return { one: exact };
  const r = pick(list, q, name, () => -1);
  if (r.one) return { one: r.one };
  if (r.many) return { error: `Which one? ${r.many.slice(0, 8).map(name).join(', ')}${r.many.length > 8 ? ', ...' : ''}` };
  return { error: `Nothing called "${q}".` };
}

export function devCommand(app, args) {
  const [verb = '', ...rest] = args.trim().split(/\s+/);
  const g = app.g, ds = app.ds;
  const say = (r, ok) => { if (r.ok) app.say(green(ok(r))); else app.say(red(r.reason)); };
  switch (verb.toLowerCase()) {
    case 'item': {
      const last = rest[rest.length - 1];
      const count = rest.length > 1 && /^\d+$/.test(last) ? Number(rest.pop()) : 1;
      const f = find(ds.allItems(), rest.join(' '), (it) => it.name, (it) => it.entry);
      if (f.error) { app.say(red(f.error)); return; }
      say(g.devGrantItem(f.one.entry, count), (r) => `Added ${r.added} ${f.one.name}.`);
      return;
    }
    case 'quest': {
      const f = find(ds.quests(), rest.join(' '), (q) => q.title, (q) => q.entry);
      if (f.error) { app.say(red(f.error)); return; }
      say(g.devCompleteQuest(f.one.entry), (r) => `Quest done: ${f.one.title}. +${r.xp} xp`);
      return;
    }
    case 'recipe': {
      const f = find(ds.recipes(), rest.join(' '), (r) => r.name, (r) => r.id);
      if (f.error) { app.say(red(f.error)); return; }
      say(g.devLearnRecipe(f.one.id), () => `Learned ${f.one.name}.`);
      return;
    }
    case 'prof': case 'profession': {
      const all = rest[rest.length - 1]?.toLowerCase() === 'all';
      if (all) rest.pop();
      const f = find(ds.professions(), rest.join(' '), (p) => p.name, () => -1);
      if (f.error) { app.say(red(f.error)); return; }
      say(g.devLearnProfession(f.one.id, { recipes: all }), (r) => `${f.one.name} at ${r.cap}${r.recipes ? `, ${r.recipes} recipes` : ''}.`);
      return;
    }
    default:
      for (const l of USAGE) app.say(dim(l));
      if (verb) app.say(yellow(`No dev verb "${verb}".`));
  }
}
