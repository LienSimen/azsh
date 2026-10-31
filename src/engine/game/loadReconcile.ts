// Load reconciliation for createGame: pure moves and one-shot mutators, run once on entry and mutating
// state in place. Also exports the talent-granted spell unlearn for respec.

import type { DataStore } from '../../data/dataStore.ts';
import { applyAura, knownUsableSpells, lowerRanksFor, maxHealth } from '../../domain/character/character.ts';
import { reconcileGamePartyAuras } from './partyAuras.ts';
import { pruneStaleRuntime } from './pruneStaleRuntime.ts';
import {
  normalizeBars,
  autofill as autofillBars,
  autofillPrimaryBar,
  replaceSpell as replaceBarSpell,
  type ActionBar,
} from '../../domain/character/actionbar.ts';
import {
  normalizePrimaryPages,
  seedFormPageFromDefaultIfEmpty,
  type PrimaryBarPages,
} from '../../domain/character/stanceBar.ts';
import { allTalentGrantedSpellIds, talentGrantedSpellIds } from '../../domain/character/talents.ts';
import { knows, learn, learnGrantIds, migrateLearnStubs } from '../../domain/character/spellbook.ts';
import { SPELL_ATTR_AURA_IS_DEBUFF } from '../../domain/spells/cancelAura.ts';
import { hasAttr, hasAttrEx, hasAttrEx4, SPELL_ATTR_EX, SPELL_ATTR_EX4 } from '../spells/spellAttributes.ts';
import {
  upgradeSpellInRotation,
  type RotationRule,
} from '../../domain/rotation/rotation.ts';
import {
  maxLockpickingSkill,
  syncCombatSkillsFromKnownSpells,
  spellLearnDependents,
} from '../../domain/character/combatSkills.ts';
import {
  BATTLE_STANCE_SPELL,
  defaultFormForClass,
} from '../../domain/character/forms.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { SpellDef } from '../../data/schema.ts';
import { getSpellRecoveryTime } from '../spells/recovery.ts';
import {
  grantPoisonsProfession,
  isPoisonQuest,
  POISONS_SKILL_SPELL,
} from '../../domain/professions/poisons.ts';
import { itemUseCooldown } from '../../domain/items/itemUseCooldown.ts';
import { equippedEntry } from '../../domain/items/itemInstance.ts';
import { emptyInventory } from '../../domain/items/inventory.ts';
import { trimSoulShards } from '../../domain/bots/soulShardCap.ts';
import { companionLevel } from '../../domain/bots/squad.ts';
import { syncCompanionProfessionTools } from './companionTraining.ts';
import { petHasHappiness, reconcilePetPartyAuras } from '../../domain/pet/pet.ts';
import { playerbotJunkItem } from '../../domain/bots/playerbotItemEligibility.ts';
import type { EquippedMap } from '../../domain/character/character.ts';
import { createAliveDeathFlow, isPlayerAlive } from '../../domain/run/death.ts';
import type { GameState } from './types.ts';
import { fillOutdoorPvpInitialWorldStates } from './outdoorPvp.ts';

/** Universal melee auto-attack toggle (counterpart to Shoot). */
const ATTACK_SPELL = 6603;

// Drop talent-granted spell ids from the spellbook, bars, stance pages and rotation — only the ids the
// talent granted plus the rank ladder above each, never a trainer, racial or quest spell.
function unlearnTalentGrantedSpells(
  state: GameState,
  spellIds: Set<number>,
  ds: DataStore,
): void {
  if (!spellIds.size) return;
  const drop = new Set<number>();
  for (const id of spellIds) {
    if (knows(state.spellbook, id)) drop.add(id);
  }
  // Ranks 2 to 4 of a talent ability ARE sold by the class trainer, gated only by the spell chain, so
  // dropping the talent's own rank 1 leaves rank 4 on the bar and still castable.
  for (const id of state.spellbook.known) {
    const first = ds.spellChain?.(id)?.first;
    if (first != null && first !== id && drop.has(first)) drop.add(id);
  }
  if (!drop.size) return;
  state.spellbook = { known: state.spellbook.known.filter((id) => !drop.has(id)) };
  // Clear bar slots that held the unlearned spells. Spread the bar first: items, macros and outfits
  // live on the same bar, and a rebuild from slots and keys alone wiped every one of them on respec.
  let barsChanged = false;
  const nextBars: ActionBar[] = state.actionBars.map((b) => ({ ...b, slots: [...b.slots], keys: [...b.keys] }));
  for (const b of nextBars) {
    for (let i = 0; i < b.slots.length; i++) {
      const sid = b.slots[i];
      if (sid != null && drop.has(sid)) {
        b.slots[i] = null;
        barsChanged = true;
      }
    }
  }
  if (barsChanged) state.actionBars = nextBars;
  // Each stance page keeps its OWN copy of bar 0 and the renderer reads the page, so clearing the
  // action bars alone leaves the unlearned spell on screen and castable in that stance.
  if (state.primaryBarPages) {
    let pagesChanged = false;
    const nextPages: PrimaryBarPages = { ...state.primaryBarPages };
    for (const [pageId, layout] of Object.entries(state.primaryBarPages)) {
      if (!layout || !layout.slots.some((sid) => sid != null && drop.has(sid))) continue;
      nextPages[pageId] = {
        ...layout,
        slots: layout.slots.map((sid) => (sid != null && drop.has(sid) ? null : sid)),
      };
      pagesChanged = true;
    }
    if (pagesChanged) state.primaryBarPages = nextPages;
  }
  if (state.rotation) {
    const filterRules = (rules: RotationRule[]): RotationRule[] =>
      rules.filter((r) => !(r.action.kind === 'spell' && drop.has(r.action.spellId)));
    const rot = state.rotation;
    state.rotation = {
      ...rot,
      phases: {
        prebuff: filterRules(rot.phases.prebuff ?? []),
        buffs: filterRules(rot.phases.buffs),
        pull: filterRules(rot.phases.pull),
        combat: filterRules(rot.phases.combat),
        recovery: filterRules(rot.phases.recovery),
      },
      overrides: rot.overrides
        ? Object.fromEntries(Object.entries(rot.overrides).map(([k, rs]) => [k, filterRules(rs)]))
        : undefined,
    };
  }
}

// Longest duration this spell's own bake claims, ms. 0 means "unknown", never "expired": until-cancelled
// auras carry no duration, and a hollow row builds its effects from rawEffects at runtime.
function bakedAuraDurationMs(sp: SpellDef | null | undefined): number {
  let max = 0;
  for (const e of sp?.effects ?? []) {
    const d = Number((e as { durationMs?: number }).durationMs ?? 0) | 0;
    if (d > max) max = d;
  }
  return max;
}

// Pull world stamps back to at most their own duration: a save written before the wall-clock timers
// carries sim-versus-wall drift, so a 30 s buff reading 25 minutes is drift, not a duration.
function clampDriftedWorldTimers(ds: DataStore, state: GameState, now: number, offlineTimeMs: number): void {
  const maxSpellCdMs = new Map<number, number>();
  const maxCatCdMs = new Map<number, number>();
  const noteSpell = (id: number | undefined): void => {
    if (!id) return;
    const sp = ds.spell(id);
    if (!sp) return;
    const rec = getSpellRecoveryTime(sp);
    if (rec > (maxSpellCdMs.get(id) ?? 0)) maxSpellCdMs.set(id, rec);
    const cat = (sp.category ?? 0) | 0;
    const catRec = (sp.categoryRecoveryMs ?? 0) | 0;
    if (cat > 0 && catRec > (maxCatCdMs.get(cat) ?? 0)) maxCatCdMs.set(cat, catRec);
  };
  // Item on-use CDs live on the use-spell id and are the ITEM's number, not the spell's.
  const noteItem = (entry: number | null | undefined): void => {
    const it = entry ? ds.item(entry) : null;
    if (!it) return;
    const cd = itemUseCooldown(it);
    if (it.useSpell) {
      noteSpell(it.useSpell);
      if (cd.cooldownMs > (maxSpellCdMs.get(it.useSpell) ?? 0)) {
        maxSpellCdMs.set(it.useSpell, cd.cooldownMs);
      }
    }
    if (cd.category > 0 && cd.categoryCooldownMs > (maxCatCdMs.get(cd.category) ?? 0)) {
      maxCatCdMs.set(cd.category, cd.categoryCooldownMs);
    }
  };
  for (const id of state.spellbook?.known ?? []) noteSpell(id);
  for (const st of state.inventory?.stacks ?? []) noteItem(st.item);
  for (const v of Object.values(state.char.equipped ?? {})) noteItem(equippedEntry(v));

  const spellCds = state.spellCooldowns ?? {};
  for (const [k, until] of Object.entries(spellCds)) {
    const max = maxSpellCdMs.get(Number(k)) ?? 0;
    if (max > 0 && until > now + max) spellCds[Number(k)] = now + max;
  }
  const catCds = state.categoryCooldowns ?? {};
  for (const [k, until] of Object.entries(catCds)) {
    const max = maxCatCdMs.get(Number(k)) ?? 0;
    if (max > 0 && until > now + max) catCds[Number(k)] = now + max;
  }
  const auras = state.char.activeAuras;
  if (auras?.length) {
    const nextAuras = [];
    for (let a of auras) {
      if (a.expiresAt != null) {
        const sp = ds.spell(a.spellId);
        if (offlineTimeMs > 0 && (hasAttrEx4(sp, SPELL_ATTR_EX4.AURA_EXPIRES_OFFLINE) || hasAttr(sp, SPELL_ATTR_AURA_IS_DEBUFF))) {
          if (a.expiresAt - now <= offlineTimeMs) continue;
          a = { ...a, expiresAt: a.expiresAt - offlineTimeMs };
        }
        const max = bakedAuraDurationMs(sp);
        if (max > 0 && a.expiresAt! > now + max) {
          a = { ...a, expiresAt: now + max };
        }
      }
      nextAuras.push(a);
    }
    state.char = {
      ...state.char,
      activeAuras: nextAuras,
    };
  }
}

// One-shot Phase A load reconciliation. Mutates `state`. Returns helpers that close over the same `state`
// for later createGame use.
export function applyLoadReconcile(ds: DataStore, state: GameState, opts?: import('./types.ts').CreateGameOptions): {
  unlearnTalentGrantedSpells: (spellIds: Set<number>) => void;
  eligibleSpellIds: () => number[];
} {
  function applyLearnSpell(state: GameState, sid: number, ds: DataStore) {
    state.spellbook = learn(state.spellbook, sid);
    if (hasAttrEx(ds.spell(sid), SPELL_ATTR_EX.CAST_WHEN_LEARNED)) {
      state.char = applyAura(state.char, sid, undefined, Date.now(), ds);
    }
  }

  // Defensive: a save pointing at a dungeon that no longer exists would strand the player in an
  // instance view with no Leave control, so drop the dangling run on load.
  if (state.instance && !ds.instance(state.instance.dungeonId)) state.instance = null;

  // Pre-feature saves have no store. Fill SI/EP defaults (GetVariable missing → 0 is the same
  // for unset counters; SI max 200 and EP Neutral ADD must be written).
  if (!state.worldStates) {
    state.worldStates = {};
    fillOutdoorPvpInitialWorldStates(state.worldStates);
  }

  // A BG match no more survives a reload than a logout (battlegroundRun.ts doc). Left set,
  // enterBattleground refuses forever with "already in a battleground" and no UI offers leave.
  if (state.battleground) state.battleground = null;

  // A save at 0 HP with no dead deathFlow is stranded: every gate refuses YOU_ARE_DEAD, no ghost
  // card paints, resurrect says "You are not dead". Revive at half, as a lost fight does.
  if (!isPlayerAlive(state.char.health, state.deathFlow) && !state.deathFlow?.corpse) {
    state.deathFlow = createAliveDeathFlow(state.deathFlow?.deathExpireTimeSec ?? 0);
    state.char.health = Math.max(1, Math.round(maxHealth(state.char, ds) * 0.5));
  }

  // Re-apply proficiency spell → combat skill grants (UpdateSpellTrainedSkills) so a save
  // that learned "Daggers" before skill grant was wired still unlocks equip. Idempotent.
  if (state.char.combatSkills) {
    state.char.combatSkills = syncCombatSkillsFromKnownSpells(
      state.char.combatSkills,
      state.spellbook.known,
      state.char.level,
      ds.combatSkillMeta?.(),
      state.char.race,
      state.char.cls,
    );
    state.char.combatSkills = maxLockpickingSkill(state.char.combatSkills, state.char.level);
  }

  // Reconcile quest spell grants: a quest turned in before its reward spells were baked correctly
  // grants the missing ones on load, idempotently, along with their learn dependents.
  {
    const known = new Set(state.spellbook.known);
    const skillMeta = ds.combatSkillMeta?.();
    const grantId = (sid: number) => {
      if (known.has(sid) || !ds.spell(sid)) return;
      state.spellbook.known.push(sid);
      known.add(sid);
    };
    for (const st of state.questlog?.quests ?? []) {
      if (st.status !== 'turnedIn') continue;
      for (const raw of ds.quest(st.entry)?.rewSpells ?? []) {
        // Multi-slot LEARN stubs grant every EffectTriggerSpell (not only `teaches`).
        // Cite: SpellEffects.cpp:2445–2465; learnGrantIds.
        for (const sid of learnGrantIds(raw, ds)) {
          grantId(sid);
          for (const dep of spellLearnDependents(sid, skillMeta)) grantId(dep);
        }
      }
    }
    // spell_learn_spell for any already-known spell (Poisons after partial bake, etc.).
    for (const id of [...known]) {
      for (const dep of spellLearnDependents(id, skillMeta)) grantId(dep);
    }
    // spell_learn_spell: knowing Beast Training (5149) grants the Growl r1/r2 wrappers —
    // seed them into the pet-ability repertoire (5149→1853→2649, 5149→14922→14916).
    if (known.has(5149)) {
      state.char.petSpells = state.char.petSpells ?? [];
      for (const gid of [2649, 14916]) {
        if (ds.spell(gid) && !state.char.petSpells.includes(gid)) state.char.petSpells.push(gid);
      }
    }
    const poisonQuestDone = (state.questlog?.quests ?? []).some(
      (st) => st.status === 'turnedIn' && isPoisonQuest(st.entry),
    );
    if (known.has(POISONS_SKILL_SPELL) || poisonQuestDone) {
      grantId(POISONS_SKILL_SPELL);
      for (const dep of spellLearnDependents(POISONS_SKILL_SPELL, skillMeta)) grantId(dep);
      state.char = grantPoisonsProfession(state.char, ds.recipes());
    }
    // A trained craft spell IS the recipe (Player::addSpell); this tree spells the same fact twice,
    // and a rank trained while its recipe row was absent left the spell known and the craft gone.
    {
      const have = new Set(state.char.knownRecipes);
      const add = [];
      for (const id of known) {
        const rec = ds.recipe(id);
        if (rec && !have.has(id) && state.char.skills[rec.skill]) add.push(id);
      }
      if (add.length) state.char = { ...state.char, knownRecipes: [...state.char.knownRecipes, ...add] };
    }
  }

  // The pet teaching queue: a pet saved before it existed derives one from the innate actives the
  // owner has not learned. An empty array means everything is learned and is left alone.
  {
    const rep = state.char.petSpells ?? [];
    for (const p of [state.char.pet, state.char.storedPet, ...(state.char.stablePets ?? [])]) {
      if (!p || p.teachSpells !== undefined) continue;
      const cdef = ds.creature(p.creature);
      if (!cdef || !petHasHappiness(cdef)) continue;
      p.teachSpells = (cdef.petDefaultSpells ?? []).filter((id) => {
        const s = ds.spell(id);
        return !!s && !s.passive && !rep.includes(id);
      });
    }
  }

  // Action bars: normalize any loaded/legacy shape, and for a save that predates them
  // (empty) seed bar 1 with the player's usable abilities so combat isn't blank.
  state.actionBars = normalizeBars(state.actionBars);
  const eligibleSpellIds = (): number[] =>
    knownUsableSpells(state.char, state.spellbook, ds).map((s) => s.id);
  if (state.actionBars.length === 1 && state.actionBars[0].slots.every((s) => s == null)) {
    state.actionBars = autofillBars(state.actionBars, eligibleSpellIds());
  }
  // Form-paged primary bar: seed page "0" from bar 0 when missing (pre-v38 / empty).
  state.primaryBarPages = normalizePrimaryPages(state.primaryBarPages, state.actionBars[0]);
  // Keep page "0" in sync when autofill just filled bar 0.
  if (state.primaryBarPages['0'] && state.actionBars[0]) {
    const p0 = state.primaryBarPages['0'];
    const empty0 = p0.slots.every((s) => s == null) && p0.items.every((e) => e == null)
      && (p0.macros ?? []).every((m) => m == null);
    if (empty0 && state.actionBars[0].slots.some((s) => s != null)) {
      state.primaryBarPages = {
        ...state.primaryBarPages,
        '0': {
          slots: [...state.actionBars[0].slots],
          items: Array.from({ length: state.actionBars[0].slots.length }, (_, i) =>
            typeof state.actionBars[0]!.items?.[i] === 'number' ? state.actionBars[0]!.items![i]! : null),
          macros: Array.from({ length: state.actionBars[0].slots.length }, (_, i) =>
            state.actionBars[0]!.macros?.[i] ?? null),
        },
      };
    }
  }

  // Ensure cooldown maps exist (pre-implementation saves) and prune anything already expired.
  state.spellCooldowns = state.spellCooldowns || {};
  state.categoryCooldowns = state.categoryCooldowns || {};
  const _now = Date.now();
  for (const k of Object.keys(state.spellCooldowns)) {
    if ((state.spellCooldowns as any)[k] <= _now) delete (state.spellCooldowns as any)[k];
  }
  for (const k of Object.keys(state.categoryCooldowns)) {
    if ((state.categoryCooldowns as any)[k] <= _now) delete (state.categoryCooldowns as any)[k];
  }
  // Same rule for the per-node / per-GO / pickpocket timers: an expired key reads as pristine.
  pruneStaleRuntime(state, _now);

  // Repair stamps written on the old sim chain — no timer can outlast its own duration. A stamp whose
  // maximum is unknown here, because the spell is unlearned or the item gone, is left alone.
  clampDriftedWorldTimers(ds, state, _now, opts?.offlineTimeMs ?? 0);

  // Learn-spell stubs migrate to the real taught ability when the bake names one, and the action bars
  // and rotations are rewritten so the player casts the spell that carries the cooldown.
  {
    const mig = migrateLearnStubs(state.spellbook, ds);
    if (mig.replacements.length) {
      state.spellbook = mig.spellbook;
      for (const { from, to } of mig.replacements) {
        state.actionBars = replaceBarSpell(state.actionBars, from, to);
        if (state.rotation) state.rotation = upgradeSpellInRotation(state.rotation, [from], to);
        // Carry any remaining world CD from the stub id onto the taught id.
        if (state.spellCooldowns[from] != null) {
          state.spellCooldowns[to] = Math.max(state.spellCooldowns[to] ?? 0, state.spellCooldowns[from]!);
          delete state.spellCooldowns[from];
        }
      }
      state.actionBars = autofillPrimaryBar(state.actionBars, eligibleSpellIds());
    }
  }

  // Racials are derived from race but learned into the spellbook so every screen sees them, granted on
  // load with Attack. Class-quest reward spells are NOT free-granted: those come from a turn-in.
  const grantable = [...(ds.race(state.char.race)?.racials ?? []), ATTACK_SPELL];
  let learnedAny = false;
  for (const id of grantable) {
    if (ds.spell(id) && !knows(state.spellbook, id)) {
      applyLearnSpell(state, id, ds);
      const lowers = lowerRanksFor(state.spellbook, id, ds);
      if (lowers.length) {
        for (const oldId of lowers) state.actionBars = replaceBarSpell(state.actionBars, oldId, id);
        if (state.rotation) state.rotation = upgradeSpellInRotation(state.rotation, lowers, id);
      }
      learnedAny = true;
    }
  }
  if (learnedAny) state.actionBars = autofillPrimaryBar(state.actionBars, eligibleSpellIds());

  // Strip classic-db GM/QA/test junk from paperdolls (player + companions) on load so
  // pre-HJ1 / name-class saves drop Martin Fury, "90 Epic …", "Nax PH …", etc.
  {
    const stripJunk = (eq: EquippedMap | undefined): EquippedMap | undefined => {
      if (!eq) return eq;
      let dirty = false;
      const next: EquippedMap = { ...eq };
      for (const [slot, v] of Object.entries(next)) {
        const e = equippedEntry(v as never);
        if (e == null) continue;
        const it = ds.item(e);
        // Strip only GM/test junk — not full factory pool gates (itemLevel/sellPrice),
        // which would empty fixture starter kits and some legitimate low-data rows.
        if (it && playerbotJunkItem(it)) {
          delete next[slot as keyof EquippedMap];
          dirty = true;
        }
      }
      return dirty ? next : eq;
    };
    const cleaned = stripJunk(state.char.equipped);
    if (cleaned && cleaned !== state.char.equipped) state.char.equipped = cleaned;
    for (const comp of state.squad ?? []) {
      const cEq = stripJunk(comp.equipped);
      if (cEq && cEq !== comp.equipped) comp.equipped = cEq;
    }
    for (const comp of Object.values(state.botRoster ?? {})) {
      const cEq = stripJunk(comp.equipped);
      if (cEq && cEq !== comp.equipped) comp.equipped = cEq;
    }
  }

  // Saves written before the shard cap carry a warlock's whole drain history — 103 unstacked shards
  // in an 80-slot bag — which blocks every gear swap because a displaced piece has nowhere to go.
  for (const comp of [...(state.squad ?? []), ...Object.values(state.botRoster ?? {})]) {
    const trimmed = trimSoulShards(comp.bags ?? emptyInventory());
    if (trimmed.dropped > 0) comp.bags = trimmed.bags;
    // A hire below level 5 had no trained primary, so its InitInventorySkill kit carried no pick,
    // knife or rod. Idempotent, and the only path that reaches a body already past its level-up.
    syncCompanionProfessionTools(comp, companionLevel(comp, state.char.level), ds);
  }

  // Talent-granted spells materialize idempotently on load, exactly like racials and quest rewards.
  // Respec unlearns them immediately; this load path is the safety net for older saves.
  {
    let learnedFromTalents = false;
    const spent = state.char.talents ?? {};
    for (const [tidStr, rnk] of Object.entries(spent)) {
      const tid = Number(tidStr) | 0;
      if (!rnk || rnk < 1) continue;
      const tal = ds.talent(tid);
      if (!tal) continue;
      const rankIdx = Math.min(rnk - 1, tal.ranks.length - 1);
      const rank = tal.ranks[rankIdx];
      if (!rank) continue;
      for (const eff of (rank.effects ?? [])) {
        if (eff.kind === 'grant_spell' && typeof (eff as any).spellId === 'number') {
          const sid = (eff as any).spellId as number;
          if (ds.spell(sid) && !knows(state.spellbook, sid)) {
            applyLearnSpell(state, sid, ds);
            const lowers = lowerRanksFor(state.spellbook, sid, ds);
            if (lowers.length) {
              for (const oldId of lowers) state.actionBars = replaceBarSpell(state.actionBars, oldId, sid);
              if (state.rotation) state.rotation = upgradeSpellInRotation(state.rotation, lowers, sid);
            }
            learnedFromTalents = true;
          }
        }
        if (eff.kind === 'grant_passive' && rank.spellId) {
          const sid = rank.spellId;
          if (ds.spell(sid) && !knows(state.spellbook, sid)) {
            applyLearnSpell(state, sid, ds);
            learnedFromTalents = true;
          }
        }
      }
    }
    if (learnedFromTalents) {
      state.actionBars = autofillPrimaryBar(state.actionBars, eligibleSpellIds());
    }
  }

  // The other direction: a talent ability with no talent behind it. Before the training gate, the class
  // trainer sold every capstone to anyone and nothing took them back — this is that reconcile.
  {
    const granted = talentGrantedSpellIds(state.char, ds);
    const stray = new Set<number>();
    for (const id of allTalentGrantedSpellIds(state.char.cls, ds)) {
      if (!granted.has(id) && knows(state.spellbook, id)) stray.add(id);
    }
    // unlearnTalentGrantedSpells walks the rank ladder above each stray root itself.
    if (stray.size) unlearnTalentGrantedSpells(state, stray, ds);
  }

  // Vanilla warriors always stand in a stance, and create-info left form undefined, so Charge and Rend
  // failed until a manual cast. Enter Battle Stance when it is known and no form is set.
  {
    const cur = (state.char.form ?? 0) | 0;
    const next = defaultFormForClass(state.char.cls, state.char.form, state.spellbook.known);
    if (next && cur === 0) {
      state.char.form = next;
      // Until-cancelled stance aura (mirrors castOutOfCombat shapeshift path).
      if (
        next === SHAPESHIFT_FORM.BATTLESTANCE
        && knows(state.spellbook, BATTLE_STANCE_SPELL)
        && ds.spell(BATTLE_STANCE_SPELL)
      ) {
        state.char = applyAura(state.char, BATTLE_STANCE_SPELL, undefined, Date.now(), ds);
      }
    }
  }

  // Re-sync page 0 from bar 0 after the late autofills, then seed the form-selected page when empty:
  // otherwise Battle Stance shows a blank bar while the starter kit sits only on page 0.
  if (state.actionBars[0]) {
    state.primaryBarPages = {
      ...normalizePrimaryPages(state.primaryBarPages, state.actionBars[0]),
      '0': {
        slots: [...state.actionBars[0].slots],
        items: Array.from({ length: state.actionBars[0].slots.length }, (_, i) =>
          typeof state.actionBars[0]!.items?.[i] === 'number' ? state.actionBars[0]!.items![i]! : null),
        macros: Array.from({ length: state.actionBars[0].slots.length }, (_, i) =>
          state.actionBars[0]!.macros?.[i] ?? null),
      },
    };
  }
  state.primaryBarPages = seedFormPageFromDefaultIfEmpty(
    state.primaryBarPages ?? {},
    (state.char.form ?? 0) | 0,
  );

  // Living pet on boot: align owner APPLY_AREA_AURA_PARTY (world-bot + save-load).
  // Cite: SpellAuras.cpp AreaAura::Update :469–471 (add owner); KI-856.
  state.char = reconcilePetPartyAuras(state.char, ds);

  // Saved class-A party auras (Devotion on a solo mage) drop if nobody in the party holds them.
  reconcileGamePartyAuras(state, ds);

  return {
    unlearnTalentGrantedSpells: (spellIds) => unlearnTalentGrantedSpells(state, spellIds, ds),
    eligibleSpellIds,
  };
}
