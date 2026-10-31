// Guide-screen test grants, reached from the wiki detail pane (wikiView.ts onDevClick). They skip
// the accept gates, the trainer and the cost the real paths enforce.

import { countItem } from '../../domain/items/inventory.ts';
import {
  grantStarterRecipes as doGrantStarterRecipes,
  learnRecipe as doLearnRecipe,
} from '../../domain/professions/professions.ts';
import { accept, getQuest, creatureCreditTargets } from '../../domain/quests/questlog.ts';
import type { GameCtx } from './context.ts';
import type { Game } from './types.ts';
import { isPoisonsProfession, poisonsSkillCap } from '../../domain/professions/poisons.ts';

export function createDevGrantModule(
  ctx: GameCtx,
  extras: { turnInQuest: Game['turnInQuest'] },
): Pick<Game, 'devGrantItem' | 'devCompleteQuest' | 'devLearnProfession' | 'devLearnRecipe'> {
  const { ds, state, log, refreshQuests, takeDrop } = ctx;

  return {
    devGrantItem(entry, qty = 1) {
      const def = ds.item(entry);
      if (!def) return { ok: false, reason: 'Unknown item' };
      const want = Math.max(1, Math.min(1000, qty | 0));
      // takeDrop is the loot path: bag space, the keyring family, unique and MaxCount all apply.
      let added = 0;
      for (let left = want; left > 0;) {
        const step = Math.min(left, Math.max(1, def.stackable ?? 1));
        const took = takeDrop(entry, step);
        if (took <= 0) break;
        added += took;
        left -= took;
      }
      if (added <= 0) return { ok: false, reason: 'Bags full, or you already carry the most you can' };
      log(`Added ${added}x ${def.name}.`);
      refreshQuests();
      return { ok: true, added };
    },

    devCompleteQuest(entry) {
      const q = ds.quest(entry);
      if (!q) return { ok: false, reason: 'Unknown quest' };
      if (getQuest(state.questlog, entry)?.status === 'turnedIn') {
        return { ok: false, reason: 'Already completed' };
      }
      // accept() straight from the domain, so level, class, chain and zone never block a test.
      state.questlog = accept(state.questlog, q);
      const st = getQuest(state.questlog, entry);
      if (!st) return { ok: false, reason: 'Could not add it to the log' };
      st.status = 'active';
      for (const k of creatureCreditTargets(q)) st.kills[String(k.creatureEntry)] = k.count;
      for (const o of q.objectTargets ?? []) st.objects[String(o.objectEntry)] = o.count;
      st.spells = st.spells ?? {};
      for (const s of q.spellCastTargets ?? []) st.spells[String(s.spell)] = s.count;
      st.uses = st.uses ?? {};
      for (const s of q.sourceItemTargets ?? []) st.uses[String(s.item)] = s.count;
      st.explored = true;
      st.talked = true;
      // Item objectives are counted off the bags, never off the log, so they have to be real.
      for (const t of [...(q.itemTargets ?? []), ...(q.sourceItemTargets ?? [])]) {
        const have = countItem(state.inventory, t.item);
        if (have < t.count) takeDrop(t.item, t.count - have);
      }
      refreshQuests();
      const res = extras.turnInQuest(entry);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Could not turn it in' };
      return { ok: true, xp: res.xp, money: res.money };
    },

    devLearnProfession(skill, opts) {
      const prof = ds.profession(skill);
      if (!prof) return { ok: false, reason: 'Unknown profession' };
      const cap = isPoisonsProfession(prof.id)
        ? poisonsSkillCap(state.char.level)
        : prof.ranks.reduce((n, r) => Math.max(n, r.cap), 1);
      state.char = {
        ...state.char,
        skills: { ...state.char.skills, [prof.id]: { current: cap, max: cap } },
      };
      const starters = doGrantStarterRecipes(state.char, prof.id, ds.recipes());
      state.char = starters.char;
      let recipes = 0;
      if (opts?.recipes) {
        const known = new Set(state.char.knownRecipes);
        for (const r of ds.recipes()) {
          if (r.skill !== prof.id || known.has(r.id)) continue;
          known.add(r.id);
          recipes++;
        }
        const enchants = prof.id === 'enchanting'
          ? [...new Set([...(state.char.knownEnchants ?? []), ...ds.enchants().map((e) => e.id)])]
          : state.char.knownEnchants;
        state.char = {
          ...state.char,
          knownRecipes: [...known],
          ...(enchants !== undefined ? { knownEnchants: enchants } : {}),
        };
      }
      log(`Learned ${prof.name} at ${cap}${recipes ? ` with ${recipes} recipes` : ''}.`);
      return { ok: true, cap, recipes };
    },

    devLearnRecipe(recipeId) {
      const recipe = ds.recipe(recipeId);
      if (!recipe) return { ok: false, reason: 'Unknown recipe' };
      if (!state.char.skills[recipe.skill]) {
        return { ok: false, reason: `Learn ${recipe.skill} first` };
      }
      // fromItem skips the trainer's orange-skill gate and the cost, as a world-drop recipe does.
      const res = doLearnRecipe(state.char, recipe, { fromItem: true });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot learn' };
      state.char = res.char;
      log(`Learned recipe: ${recipe.name}.`);
      return { ok: true };
    },
  };
}
