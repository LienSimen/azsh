import type { Character } from '../domain/character/character.ts';
import type { SpellBook, SpellLookup } from '../domain/character/spellbook.ts';
import { knows, learn, learnGrantIds } from '../domain/character/spellbook.ts';
import type { RecipeDef, TrainerSpellDef } from '../data/schema.ts';
import { SKILL_LINE_BY_ID } from '../data/schema/profession.ts';
import type { CombatSkillMeta } from '../domain/character/combatSkills.ts';
import {
  applySpellTrainedSkills,
  isSpellFitByClassAndRace,
  skillRewardedSpellIds,
  spellLearnDependents,
} from '../domain/character/combatSkills.ts';
import {
  grantPoisonsProfession,
  isPoisonsSkillSpell,
  POISONS_SKILL_SPELL,
} from '../domain/professions/poisons.ts';

/** TrainerSpellState: gray = already known, red = a requirement is unmet, green = trainable. */
export type TrainerSpellState = 'green' | 'red' | 'gray';
export interface TrainCheck {
  ok: boolean;
  reason?: string;
  /** Cite: Player.cpp:3960-3990 GetTrainerSpellState — money is NOT part of the colour. */
  state?: TrainerSpellState;
}
export interface TrainResult extends TrainCheck {
  char: Character;
  spellbook: SpellBook;
  /** Spell id actually granted (LEARN stubs resolve to the castable taught ability). */
  learnedSpell?: number;
}

/** Optional DataStore-shaped lookup that also carries combat skill DBC meta. */
export type TrainLookup = SpellLookup & {
  combatSkillMeta?: () => CombatSkillMeta | undefined;
  /** Rank-chain node (prev/req prerequisites). Cite: SpellMgr::GetSpellChainNode. */
  spellChain?: (spellId: number) => { prev: number; first: number; rank: number; req?: number } | undefined;
  /** Talent trees for the character's class, so talent-only grants stay off the trainer. */
  talentTrees?: (cls: number) => Array<{ talents?: Array<{ id: number; ranks?: Array<{ spellId: number; effects?: Array<{ kind: string; spellId?: number }> }> }> }> | undefined;
  recipe?: (id: number) => RecipeDef | undefined;
  recipes?: () => RecipeDef[];
  /** Display name for a skill-line gate ("Poisons"), so the UI and the reason read the same. */
  profession?: (id: string) => { name: string } | undefined;
};

// Every spell id a talent GRANTS for this class. In vanilla these reach the spellbook only through
// LearnTalent — real trainer data has zero rows for any of them across the whole dump.
const talentGrantsByStore = new WeakMap<object, Map<number, Set<number>>>();
function talentGrantedIds(cls: number, ds?: TrainLookup): Set<number> {
  if (!ds?.talentTrees) return new Set();
  let byCls = talentGrantsByStore.get(ds as object);
  if (!byCls) { byCls = new Map(); talentGrantsByStore.set(ds as object, byCls); }
  const hit = byCls.get(cls);
  if (hit) return hit;
  const out = new Set<number>();
  for (const tree of ds.talentTrees(cls) ?? []) {
    for (const tal of tree.talents ?? []) {
      for (const rank of tal.ranks ?? []) {
        if (rank.spellId) out.add(rank.spellId);
        for (const e of rank.effects ?? []) {
          if (e.kind === 'grant_spell' && typeof e.spellId === 'number') out.add(e.spellId);
        }
      }
    }
  }
  byCls.set(cls, out);
  return out;
}

/** npc_trainer.reqlevel raised by the taught spell's own Spell.dbc level. Cite: KI-871 undergate. */
export function trainerReqLevel(ts: TrainerSpellDef, ds?: TrainLookup): number {
  let need = ts.reqLevel | 0;
  if (!ds) return need;
  for (const g of learnGrantIds(ts.spell, ds)) {
    const sp = ds.spell?.(g);
    if (sp) need = Math.max(need, sp.reqLevel | 0, (sp.spellLevel ?? 0) | 0);
  }
  return need;
}

/** npc_trainer.reqskill/reqskillvalue resolved against the character, or undefined when ungated. */
export function trainerReqSkill(
  ts: TrainerSpellDef,
  char: Pick<Character, 'skills' | 'combatSkills'>,
  ds?: TrainLookup,
): { need: number; have: number; label: string } | undefined {
  if ((ts.reqSkill | 0) <= 0) return undefined;
  const need = (ts.reqSkillValue | 0) > 0 ? (ts.reqSkillValue | 0) : 1;
  const line = SKILL_LINE_BY_ID[ts.reqSkill];
  const have = line
    ? (char.skills[line]?.current ?? 0)
    : (char.combatSkills?.[ts.reqSkill]?.current ?? 0);
  const label = (line && ds?.profession?.(line)?.name) || line || `skill ${ts.reqSkill}`;
  return { need, have, label };
}

// The trainer gate: class and race fit come from the skill-line tables, not an invented list. The
// chain and talent-grant checks were MISSING, which let a character with no talents buy capstones.
export function canTrain(char: Character, sb: SpellBook, ts: TrainerSpellDef, ds?: TrainLookup, discountMod = 1): TrainCheck {
  // Multi-slot LEARN stubs grant every EffectTriggerSpell — "already known" only when all are.
  // Cite: SpellEffects.cpp:2445–2465; Player.cpp:18226–18259 learnQuestRewardedSpells.
  const grants = ds ? learnGrantIds(ts.spell, ds) : [ts.spell];
  const grantId = grants[0] ?? ts.spell;
  if (grants.every((g) => knows(sb, g))) return { ok: false, reason: 'Already known', state: 'gray' };
  // Offer row + Spell.dbc gate: never train below spell.reqLevel (KI-871 undergate).
  const needLevel = trainerReqLevel(ts, ds);
  if (char.level < needLevel) return { ok: false, reason: `Requires level ${needLevel}`, state: 'red' };
  // Quest-only: ClassicDB has 0 npc_trainer rows for 2842. Cite: src_quest_template 2359.
  if (isPoisonsSkillSpell(ts.spell) || grants.includes(POISONS_SKILL_SPELL)) {
    return { ok: false, reason: 'Learned from a quest', state: 'red' };
  }
  // npc_trainer.reqskill / reqskillvalue — every poison rank needs SKILL_POISONS (40) at the rank's
  // own value, on top of reqlevel. Cite: Player.cpp:3980 GetTrainerSpellState skill value check.
  const skillReq = trainerReqSkill(ts, char, ds);
  if (skillReq && skillReq.have < skillReq.need) {
    return { ok: false, reason: `Requires ${skillReq.label} ${skillReq.need}`, state: 'red' };
  }
  const meta = ds?.combatSkillMeta?.();
  for (const g of grants) {
    if (meta && !isSpellFitByClassAndRace(g, char.race, char.cls, meta, char.level)) {
      return { ok: false, reason: 'Your class cannot learn this', state: 'red' };
    }
    // A talent's own ability is learned by spending the point, never bought.
    // Cite: Player::LearnTalent → learnSpell; npc_trainer has no rows for talent grants.
    if (talentGrantedIds(char.cls, ds).has(g)) {
      return { ok: false, reason: 'Learned by spending a talent point', state: 'red' };
    }
    // spell_chain: previous rank + the extra `req` spell must both be known.
    // Cite: Player.cpp:3974–3982 — TRAINER_SPELL_RED when either is missing.
    const node = ds?.spellChain?.(g);
    if (node) {
      if (node.prev && !knows(sb, node.prev)) {
        const prevName = ds?.spell?.(node.prev)?.name;
        return { ok: false, reason: prevName ? `Requires ${prevName}` : 'Requires the previous rank', state: 'red' };
      }
      if (node.req && !knows(sb, node.req)) {
        const reqName = ds?.spell?.(node.req)?.name;
        return { ok: false, reason: reqName ? `Requires ${reqName}` : 'Requires another spell first', state: 'red' };
      }
    }
  }
  // Money is the LAST gate: an affordable-tomorrow offer still colours green in the client, so the
  // row keeps its real requirement as the reason. Cite: ClassTrainerFrame.lua money-frame red.
  const cost = Math.floor(ts.cost * discountMod);
  if (char.gold < cost) return { ok: false, reason: 'Not enough money', state: 'green' };
  return { ok: true, state: 'green' };
}

// Learn a trainer spell: pay the gold, grant the spell, and apply the proficiency skills it trains.
// The gold is the cost times the reputation discount, floored. Cite: Player.cpp addSpell.
export function train(char: Character, sb: SpellBook, ts: TrainerSpellDef, ds?: TrainLookup, discountMod = 1): TrainResult {
  const check = canTrain(char, sb, ts, ds, discountMod);
  if (!check.ok) return { ok: false, reason: check.reason, char, spellbook: sb };
  // Multi-slot LEARN_SPELL: grant every EffectTriggerSpell (not only `teaches`).
  // Cite: SpellEffects.cpp:2445–2465 EffectLearnSpell per eff_idx.
  const grants = ds ? learnGrantIds(ts.spell, ds) : [ts.spell];
  const grantId = grants[0] ?? ts.spell;
  const cost = Math.floor(ts.cost * discountMod);
  let nextChar: Character = { ...char, gold: char.gold - cost };
  let nextSb = sb;
  for (const g of grants) {
    if (!knows(nextSb, g)) nextSb = learn(nextSb, g);
  }

  const meta = ds?.combatSkillMeta?.();
  // spell_learn_spell dependents (e.g. Poisons 2842 → Instant Poison craft 8681).
  // Cite: Player.cpp addSpell ~3412.
  for (const g of grants) {
    for (const dep of spellLearnDependents(g, meta)) {
      if (!knows(nextSb, dep)) nextSb = learn(nextSb, dep);
    }
  }

  const recipeList = ds?.recipes?.() ?? [];
  for (const g of grants) {
    if (g === POISONS_SKILL_SPELL || isPoisonsSkillSpell(g)) {
      nextChar = grantPoisonsProfession(nextChar, recipeList);
    }
    const rec = ds?.recipe?.(g);
    if (rec?.skill === 'poisons' && !nextChar.knownRecipes.includes(g)) {
      nextChar = { ...nextChar, knownRecipes: [...nextChar.knownRecipes, g] };
    }
  }

  if (nextChar.combatSkills) {
    const before = nextChar.combatSkills;
    let skills = before;
    for (const g of grants) {
      skills = applySpellTrainedSkills(
        skills,
        g,
        nextChar.level,
        meta,
        nextChar.race,
        nextChar.cls,
      ) ?? skills;
      for (const dep of spellLearnDependents(g, meta)) {
        skills = applySpellTrainedSkills(skills, dep, nextChar.level, meta, nextChar.race, nextChar.cls) ?? skills;
      }
    }
    if (skills) {
      nextChar = { ...nextChar, combatSkills: skills };
      // LearnSkillRewardedSpells: only for skills newly granted this learn
      // (e.g. create-kit skill → auto-learn proficiency spell). Cite: UpdateSkillTrainedSpells.
      if (meta?.spellGrants) {
        for (const key of Object.keys(skills)) {
          const id = Number(key);
          if (before[id]) continue; // already had skill
          const prog = skills[id];
          if (!prog || prog.current <= 0) continue;
          for (const rewarded of skillRewardedSpellIds(id, prog.current, meta)) {
            if (!knows(nextSb, rewarded)) nextSb = learn(nextSb, rewarded);
          }
        }
      }
    }
  }

  return {
    ok: true,
    char: nextChar,
    spellbook: nextSb,
    learnedSpell: grantId,
  };
}
