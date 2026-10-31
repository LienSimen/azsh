// QI5/QI6 — quest turn-in reward application (peeled from game.ts for filesize). Cite: Player.cpp
// RewardQuest ~12544–12660; QuestDef.cpp XPValue:171; docs/archive/QUEST-INTERPRETER.md §7 QI5/QI6.

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestDef } from '../../data/schema.ts';
import type { Character } from '../../domain/character/character.ts';
import { knownUsableSpells, lowerRanksFor } from '../../domain/character/character.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import {
  applyCreatedItems,
  removeItem,
} from '../../domain/items/inventory.ts';
import {
  hasIdentity,
  identityCapable,
} from '../../domain/items/itemInstance.ts';
import { createItemInstance } from '../../domain/items/createItem.ts';
import type { BagHandle, FullBagsHandle } from './context.ts';
import { overflowLine, storeOrOverflow } from './bagOverflow.ts';
import { applyBindToInstance, resolveBonding } from '../../domain/items/itemBonding.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import { rewardQuestReputation, reputationAuraModFromSpells } from '../../domain/creature/reputation.ts';
import { racialSpells } from '../../domain/character/races.ts';
import { markTurnedIn, type QuestLog } from '../../domain/quests/questlog.ts';
import {
  runQuestTurnInScripts,
} from '../../domain/quests/interpreter/dbscript/hooks.ts';
import type { TempSpawnRecord } from '../../domain/quests/interpreter/dbscript/types.ts';
import type { SpellBook } from '../../domain/character/spellbook.ts';
import { knows, learn, learnGrantIds } from '../../domain/character/spellbook.ts';
import { applyOocCastEffects } from './oocCastEffects.ts';
import {
  applySpellTrainedSkills,
  spellLearnDependents,
} from '../../domain/character/combatSkills.ts';
import {
  replaceSpell as replaceBarSpell,
  type ActionBar,
} from '../../domain/character/actionbar.ts';
import { ensureLivePlayerRotation, upgradeSpellInRotation, type Rotation } from '../../domain/rotation/rotation.ts';
import { roleSpecOverride } from '../../domain/bots/companionRotation.ts';
import type { SquadRole } from '../../domain/bots/squad.ts';
import {
  questXpValue,
  questMoneyAtMaxLevel,
  CLASSIC_MAX_PLAYER_LEVEL,
} from '../../progression/xpGain.ts';
import { grantXp } from '../../progression/leveling.ts';
import {
  grantPoisonsProfession,
  isPoisonsSkillSpell,
  POISONS_SKILL_SPELL,
} from '../../domain/professions/poisons.ts';
import { mulberry32, hashSeed } from '../core/rng.ts';
import { appendSystemMail, mailExpireDelaySec, spendMailItem, type Mailbox } from '../../domain/economy/mail.ts';
import { mailFromTemplate } from './mail.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { rollLootDeep } from '../../domain/items/loot.ts';
import { applyWorldStateWrites, ensureWorldStates } from './worldState.ts';
import { questConditionSnapshot } from '../../quests/quests.ts';
import {
  applyFailedQuests,
  collectFailedQuestIds,
  makeDbScriptEvaluateCondition,
} from './applyTerminateFromDbScript.ts';
import { applyActiveObjectFromDbScript } from './applyActiveObjectFromDbScript.ts';
import { applyEscortFromDbScript } from './applyEscortFromDbScript.ts';
import { applyHoverFromDbScript } from './applyHoverFromDbScript.ts';
import {
  applyDoorAndGoBags,
  lookupDungeonGoActor,
} from './applyDoorFromDbScript.ts';
import { applyTailFromDbScript } from './applyTailFromDbScript.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import { autofillPlayerBars } from './barAutofill.ts';
import type { PrimaryBarPages } from '../../domain/character/stanceBar.ts';

export interface QuestTurnInState {
  char: Character;
  inventory: Inventory;
  questlog: QuestLog;
  spellbook: SpellBook;
  actionBars: ActionBar[];
  /** Form pages of bar 0 — a reward spell autofills onto the page the player is looking at. */
  primaryBarPages?: PrimaryBarPages;
  rotation?: Rotation | null;
  squadRole?: SquadRole;
  rotationSpec?: string | null;
  rngSeed: number;
  fightCounter: number;
  /** Quest RewMailTemplateId items land here as MailMessage rows. */
  mailbox: Mailbox;
  worldStates?: Record<number, number>;
  goRuntime?: Record<string, GoRuntimeState>;
}

export interface QuestTurnInDeps {
  ds: DataStore;
  log: (msg: string) => void;
  cap: () => number;
  runAutoEquipUpgrades: (n: number) => void;
  refreshQuests: () => void;
  /** Your bags plus the mailbox queue behind them. Full bags queue the reward, never refuse it. */
  bags: BagHandle;
  handleFullBags: (item: number, count: number, owner?: BagHandle) => FullBagsHandle;
  // The junk pass and auto-equip write the LIVE character, not the snapshot this function walks.
  // Publish before calling one, adopt after, or the write-back at the end erases what they did.
  publish: (char: Character, inventory: Inventory, mailbox: Mailbox) => void;
  adopt: () => { char: Character; inventory: Inventory; mailbox: Mailbox };
}

/** Floor/world placement from dbscripts_on_quest_end TEMP_SPAWN_CREATURE (cmd 10). */
export type QuestEndTempSpawn = {
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  despawnDelayMs: number;
};

export type QuestTurnInSpell = { spell: number; name: string };

export type QuestTurnInResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      xp: number;
      money: number;
      items: LootDrop[];
      /** Newly learned rewSpell grants (learnGrantIds), not spell_learn_spell dependents. */
      spells: QuestTurnInSpell[];
      /** Auras the rewSpellCast landed on you (Rage of Ages, Agamaggan's Strength, …). */
      buffs: QuestTurnInSpell[];
      leveledTo: number[];
      state: QuestTurnInState;
      /** dbscripts_on_quest_end TEMP_SPAWN_CREATURE rows (e.g. 7461 ×8 spirits). */
      tempSpawns: QuestEndTempSpawn[];
    };

function questEndTempSpawnsFromScripts(
  endScripts: { world?: { tempSpawns?: TempSpawnRecord[] }; intents?: ReadonlyArray<{ kind: string; creatureEntry?: number; x?: number; y?: number; z?: number; o?: number; despawnDelay?: number }> },
): QuestEndTempSpawn[] {
  const out: QuestEndTempSpawn[] = [];
  const seen = new Set<string>();
  const push = (rec: {
    creatureEntry?: number;
    x?: number;
    y?: number;
    z?: number;
    o?: number;
    despawnDelay?: number;
  }): void => {
    const creatureEntry = (rec.creatureEntry ?? 0) | 0;
    if (!(creatureEntry > 0)) return;
    const x = Number(rec.x) || 0;
    const y = Number(rec.y) || 0;
    const z = Number(rec.z) || 0;
    const key = `${creatureEntry}:${x}:${y}:${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      creatureEntry,
      x,
      y,
      z,
      o: Number(rec.o) || 0,
      despawnDelayMs: (rec.despawnDelay ?? 0) | 0,
    });
  };
  for (const rec of endScripts.world?.tempSpawns ?? []) push(rec);
  for (const intent of endScripts.intents ?? []) {
    if (intent.kind !== 'temp_spawn_creature') continue;
    push(intent);
  }
  return out;
}

// QI6: resolve pick-one reward index into a grant row (or null if none / empty slot). Cite: Player.cpp
// CanRewardQuest(pQuest, reward); RewChoiceItemId[reward].
export function resolveRewChoice(
  quest: QuestDef,
  rewardChoice: number,
): { ok: true; grant: { item: number; count: number } | null } | { ok: false; reason: string } {
  const choices = quest.rewChoiceItems ?? [];
  if (choices.length === 0) return { ok: true, grant: null };
  const idx = Math.max(0, Math.floor(rewardChoice | 0));
  if (idx >= choices.length) return { ok: false, reason: 'Invalid reward choice' };
  const pick = choices[idx]!;
  if (pick.item > 0 && pick.count > 0) return { ok: true, grant: pick };
  return { ok: true, grant: null };
}

// QI6 runtime XP + money for turn-in (Quest::XPValue + max-level gold path). Cite: QuestDef.cpp:171;
// Player.cpp:12594–12602.
export function computeQuestXpAndMoney(
  quest: QuestDef,
  playerLevel: number,
): { xpAward: number; moneyAward: number } {
  const rewMoneyMax = quest.rewMoneyMaxLevel;
  let xpAward = quest.rewXP;
  let moneyAward = quest.rewMoney;
  if (rewMoneyMax != null && rewMoneyMax > 0) {
    if (playerLevel >= CLASSIC_MAX_PLAYER_LEVEL) {
      xpAward = 0;
      moneyAward = moneyAward + questMoneyAtMaxLevel(rewMoneyMax, 1, quest.questFlags ?? 0);
    } else {
      // Raw QuestLevel, no minLevel fallback: C++ passes it straight in and 0 means 0 XP (8856).
      xpAward = questXpValue(playerLevel, quest.questLevel | 0, rewMoneyMax);
    }
  }
  return { xpAward, moneyAward };
}

// Apply RewardQuest body after questComplete has already been verified by the host. Mutates a copy of state
// fields and returns the new snapshot.
export function applyQuestTurnIn(
  quest: QuestDef,
  entry: number,
  rewardChoice: number,
  stateIn: QuestTurnInState,
  deps: QuestTurnInDeps,
): QuestTurnInResult {
  const { ds, log, cap, runAutoEquipUpgrades, refreshQuests } = deps;
  // Eligible bar ids from the *working* spellbook (host eligibleSpellIds closes over
  // pre-write state and would miss newly learned rewSpells).
  let state: QuestTurnInState = {
    ...stateIn,
    char: stateIn.char,
    inventory: stateIn.inventory,
    questlog: stateIn.questlog,
    spellbook: stateIn.spellbook,
    actionBars: stateIn.actionBars,
    rotation: stateIn.rotation,
    rngSeed: stateIn.rngSeed,
    fightCounter: stateIn.fightCounter,
    mailbox: stateIn.mailbox ?? [],
    goRuntime: stateIn.goRuntime,
  };

  // The junk / make-room / auto-equip passes write the LIVE character and bags, so anything that
  // calls one publishes first and adopts after; the snapshot above would otherwise win the write-back.
  const bags = deps.bags;
  const shared = <T>(run: () => T): T => {
    deps.publish(state.char, bags.get(), state.mailbox);
    const out = run();
    const back = deps.adopt();
    state.char = back.char;
    state.mailbox = back.mailbox;
    bags.set(back.inventory);
    return out;
  };
  bags.set(state.inventory);

  const choice = resolveRewChoice(quest, rewardChoice);
  if (!choice.ok) return choice;
  const choiceGrant = choice.grant;

  const guaranteed = quest.rewItems ?? [];
  // RewardQuest destroys ReqItemId only (Player.cpp:12548–12551). Its EQUIP_ERR_INVENTORY_FULL
  // refusal is NOT ported — full bags junk-filter, wear or queue the reward (storeOrOverflow).

  for (const it of quest.itemTargets) {
    const [nextInv, fromBags] = removeItem(bags.get(), it.item, it.count);
    bags.set(nextInv);
    if (fromBags < it.count) {
      const mail = spendMailItem(state.mailbox, it.item, it.count - fromBags);
      state.mailbox = mail.mailbox;
    }
  }

  const { xpAward, moneyAward } = computeQuestXpAndMoney(quest, state.char.level);
  state.char = { ...state.char, gold: state.char.gold + moneyAward };

  const items: LootDrop[] = [];
  const grantRewItem = (ri: { item: number; count: number }) => {
    const def = ds.item(ri.item);
    if (def) {
      const rewRng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const inst = applyBindToInstance(
        createItemInstance(ri.item, ri.count, ds, rewRng),
        resolveBonding(def),
        'loot',
      );
      const carry = hasIdentity(inst) || identityCapable(def) ? inst : undefined;
      const outcome = shared(() => storeOrOverflow(bags, ds, deps.handleFullBags, ri.item, ri.count, carry));
      if (outcome === 'overflow') log(overflowLine(deps.bags, ds, ri.item, ri.count));
      items.push(
        inst.randomPropertyId != null && inst.randomPropertyId > 0
          ? { item: ri.item, count: ri.count, randomPropertyId: inst.randomPropertyId }
          : { item: ri.item, count: ri.count },
      );
    } else {
      log(`Quest reward item ${ri.item} no longer exists - skipped.`);
    }
  };
  if (choiceGrant) grantRewItem(choiceGrant);
  for (const ri of guaranteed) grantRewItem(ri);

  if (quest.rewRep?.length) {
    const questLevel = quest.questLevel || quest.minLevel || state.char.level;
    // Diplomacy etc. Cite: Player.cpp GetTotalAuraModifier(SPELL_AURA_MOD_REPUTATION_GAIN).
    const repSpells = [
      ...racialSpells(ds, state.char.race),
      ...(state.spellbook?.known ?? [])
        .map((id) => ds.spell(id))
        .filter((s): s is NonNullable<typeof s> => !!s?.passive),
    ];
    const repMod = reputationAuraModFromSpells(repSpells);
    const repResult = rewardQuestReputation({
      rewRep: quest.rewRep,
      playerLevel: state.char.level,
      questLevel,
      raceId: state.char.race,
      classId: state.char.cls,
      reputations: state.char.reputations ?? {},
      factions: ds.factions(),
      rates: ds.reputationRates(),
      spillover: ds.reputationSpillover(),
      flags: state.char.factionFlags ?? {},
      spilloverMask: quest.reputationSpilloverMask ?? 0,
      ...(repMod ? { repMod } : {}),
    });
    state.char = {
      ...state.char,
      reputations: repResult.reputations,
      // Keeps SetVisible / auto at-war from the grant (a faction you just earned rep with joins
      // the reputation pane). Cite: ReputationMgr::SetOneFactionReputation.
      factionFlags: repResult.flags ?? state.char.factionFlags,
    };
    for (const a of repResult.applied) {
      if (a.delta === 0) continue;
      const name = ds.faction(a.faction)?.name ?? `faction ${a.faction}`;
      const sign = a.delta > 0 ? '+' : '';
      log(`${sign}${a.delta} reputation with ${name}`);
    }
  }

  if ((quest.rewMailTemplateId ?? 0) > 0) {
    // Cite: Player.cpp:12605 MailDraft(template).SendMailTo; Mail.cpp prepareItems LOOT_MAIL.
    const tid = quest.rewMailTemplateId!;
    const delay = quest.rewMailDelaySecs ?? 0;
    const expireSec = mailExpireDelaySec(0);
    const rows = ds.lootTable(`mail:${tid}`) ?? [];
    const sender = quest.enderName ?? 'Mailbox';
    if (rows.length > 0) {
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const drops = rollLootDeep(rows, (id) => ds.lootTable(id), rng);
      if (drops.length > 0) {
        const applied = appendSystemMail(state.mailbox, {
          sender,
          subject: quest.title,
          nowMs: Date.now(),
          delaySec: delay,
          attachments: drops.map((d) => ({ entry: d.item, quantity: d.count })),
        });
        state.mailbox = applied.mailbox;
      }
    } else {
      const applied = appendSystemMail(state.mailbox, {
        sender,
        subject: quest.title,
        nowMs: Date.now(),
        delaySec: delay,
      });
      state.mailbox = applied.mailbox;
    }
    log(
      delay > 0
        ? `Mail reward scheduled (template ${tid}, delay ${delay}s, expires ${expireSec}s after delivery).`
        : `Mail reward sent (template ${tid}, expires ${expireSec}s).`,
    );
  }

  const lv = grantXp(state.char, xpAward, ds);
  state.char = lv.char;
  state.questlog = markTurnedIn(state.questlog, entry);

  shared(() => runAutoEquipUpgrades(6));

  const skillMeta = ds.combatSkillMeta?.();
  const grantIds = new Set<number>();
  for (const raw of quest.rewSpells ?? []) {
    for (const sid of learnGrantIds(raw, ds)) grantIds.add(sid);
  }
  const spells: QuestTurnInSpell[] = [];
  for (const raw of quest.rewSpells ?? []) {
    // A multi-slot learn stub grants every triggered spell, not only the one named by `teaches`. Baked
    // reward spells are often pre-expanded, so the expand is a no-op for a plain id.
    const grants = learnGrantIds(raw, ds);
    const toLearn = [
      ...grants,
      ...grants.flatMap((sp) => spellLearnDependents(sp, skillMeta)),
    ].filter((id, i, arr) => arr.indexOf(id) === i);
    for (const sid of toLearn) {
      if (knows(state.spellbook, sid)) continue;
      if (!ds.spell(sid)) continue;
      state.spellbook = learn(state.spellbook, sid);
      if (grantIds.has(sid)) {
        spells.push({ spell: sid, name: ds.spell(sid)?.name ?? `spell ${sid}` });
      }
      if (sid === POISONS_SKILL_SPELL || isPoisonsSkillSpell(sid)) {
        state.char = grantPoisonsProfession(state.char, ds.recipes());
      }
      if (state.char.combatSkills) {
        state.char = {
          ...state.char,
          combatSkills: applySpellTrainedSkills(
            state.char.combatSkills,
            sid,
            state.char.level,
            skillMeta,
            state.char.race,
            state.char.cls,
          ),
        };
      }
      const lowers = lowerRanksFor(state.spellbook, sid, ds);
      if (lowers.length) {
        for (const oldId of lowers) {
          state.actionBars = replaceBarSpell(state.actionBars, oldId, sid);
        }
        if (state.rotation?.custom) {
          state.rotation = upgradeSpellInRotation(state.rotation, lowers, sid);
        }
      }
      {
        const role = state.squadRole;
        const band = state.rotationSpec
          ?? ((role === 'healer' || role === 'tank')
            ? (roleSpecOverride(state.char.cls, role) ?? undefined)
            : undefined);
        state.rotation = ensureLivePlayerRotation(
          state.rotation,
          state.char,
          state.spellbook,
          ds,
          bags.get(),
          { band: band ?? null, role },
        );
      }
      const eligible = knownUsableSpells(state.char, state.spellbook, ds).map((s) => s.id);
      autofillPlayerBars(state, eligible);
      log(`You learned ${ds.spell(sid)?.name ?? `spell ${sid}`}!`);
    }
  }

  let tempSpawns: QuestEndTempSpawn[] = [];
  try {
    // CompleteScript after rewards. Cite: Player.cpp RewardQuest CompleteScript.
    const condRows = ds.conditionsList() ?? [];
    const condTable = new Map(condRows.map((c) => [c.id | 0, c]));
    const goRuntimeKey = (e: number) => `${state.char.zoneId}:${e}`;
    const goLookupCache = new Map<number, ReturnType<typeof lookupDungeonGoActor>>();
    const lookupGameObjectByGuid = (g: number) => {
      if (goLookupCache.has(g)) return goLookupCache.get(g) ?? null;
      const a = lookupDungeonGoActor(g, {
        goRuntime: state.goRuntime,
        goRuntimeKey,
        gameObject: (entry) => ds.gameObject(entry),
      });
      goLookupCache.set(g, a);
      return a;
    };
    const endScripts = runQuestTurnInScripts(quest, {
      evaluateCondition: makeDbScriptEvaluateCondition(
        questConditionSnapshot(state.questlog, state.char.level, undefined, state.worldStates),
        condTable,
      ),
      lookupGameObjectByGuid,
    });
    tempSpawns = questEndTempSpawnsFromScripts(endScripts);
    for (const intent of endScripts.intents ?? []) {
      if (intent.kind === 'talk' && intent.textId) {
        log(`(quest) says text #${intent.textId}`);
      }
    }
    if (endScripts.world?.worldStates) {
      state.worldStates = ensureWorldStates(state.worldStates);
      applyWorldStateWrites(state.worldStates, endScripts.world.worldStates);
    }
    // Cite: ScriptMgr.cpp:2220-2235 StoreNewItemInInventorySlot / DestroyItemCount.
    bags.set(applyCreatedItems(
      bags.get(),
      endScripts.world?.createdItems,
      (e) => ds.item(e),
      cap(),
    ));
    // Cite: ScriptMgr.cpp:2719–2734 TERMINATE_COND failQuest; Player.cpp:12730–12761.
    state.questlog = applyFailedQuests(
      state.questlog,
      collectFailedQuestIds(endScripts.world, endScripts.intents),
    );
    // Cite: ScriptMgr.cpp:2367–2376; Object.cpp:2563–2578.
    applyActiveObjectFromDbScript(endScripts.world, endScripts.intents);
    // Cite: ScriptMgr.cpp:1829–1874 / :2439–2456 / :2684–2692 / :2757–2826 / :2237–2250.
    applyEscortFromDbScript(endScripts.world, endScripts.intents, {
      source: endScripts.world.source,
      // Same objects so MOVE_TO after TEMP_SPAWN updates the returned placements.
      bodies: tempSpawns.map((s) => Object.assign(s, { entry: s.creatureEntry })),
    });
    // Cite: ScriptMgr.cpp:2847–2864 SetHover(fly) on Creature pSource.
    applyHoverFromDbScript(endScripts.world, endScripts.intents, {
      source: endScripts.world.source,
      bodies: tempSpawns.map((s) => Object.assign(s, { entry: s.creatureEntry })),
    });
    // Cite: ScriptMgr.cpp:1980–2025 / :2864–2871 / :2478–2503 / :2907–2923.
    state.goRuntime = applyDoorAndGoBags(
      endScripts.world,
      endScripts.intents,
      state.goRuntime,
      goRuntimeKey,
      log,
    );
    // Cite: ScriptMgr.cpp:3264–3267 / :2828–2843 / :2182–2218 / :1815–1911 / :2881–2992 / :2938–2948.
    // SEND_MAIL feed line lives in applyTail (was inline here).
    {
      state.worldStates = ensureWorldStates(state.worldStates);
      const tail = applyTailFromDbScript(endScripts.world, endScripts.intents, {
        source: endScripts.world.source,
        bodies: tempSpawns.map((s) => Object.assign(s, { entry: s.creatureEntry })),
        worldStates: state.worldStates,
        log,
        relayScripts: (id) => ds.relayScripts(id),
        questlog: state.questlog,
        goRuntime: state.goRuntime,
        goRuntimeKey,
        evaluateCondition: makeDbScriptEvaluateCondition(
          questConditionSnapshot(state.questlog, state.char.level, undefined, state.worldStates),
          condTable,
        ),
        lookupGameObjectByGuid,
        onMail: (rec) => {
          const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
          state.mailbox = mailFromTemplate(state.mailbox ?? [], (id) => ds.lootTable(id), rec, {
            nowMs: Date.now(),
            sender: quest.enderName ?? 'Mailbox',
            rng,
          });
        },
      });
      if (tail.questlog) state.questlog = tail.questlog;
      if (tail.goRuntime) state.goRuntime = tail.goRuntime;
    }
    if (tempSpawns.length) {
      log(`${tempSpawns.length}× summoned creature(s) from quest end script.`);
    }
  } catch (e) {
    log(`Quest end script error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // RewSpellCast || RewSpell cast at the player once the LEARN stub is already resolved into
  // rewSpells: what is left is the buff / conjure itself. Cite: Player.cpp:12652-12678.
  const buffs: QuestTurnInSpell[] = [];
  if ((quest.rewSpellCast ?? 0) > 0) {
    const castId = quest.rewSpellCast!;
    const castSpell = ds.spell(castId);
    if (castSpell) {
      const now = Date.now();
      const out = applyOocCastEffects({
        spellId: castId,
        spell: castSpell,
        char: state.char,
        inventory: bags.get(),
        ds,
        now,
        alreadyStealthed: false,
        log,
        rng: mulberry32(hashSeed(state.rngSeed, state.fightCounter++)),
      });
      state.char = out.char;
      bags.set(out.inventory);
      for (const d of out.conjured) items.push(d);
      if ((state.char.activeAuras ?? []).some((a) => a.spellId === castId)) {
        const name = castSpell.name ?? `spell ${castId}`;
        buffs.push({ spell: castId, name });
        log(`You gain ${name}.`);
      }
    }
  }

  refreshQuests();
  state.inventory = bags.get();
  log(`Quest complete: ${quest.title}. +${xpAward} XP, +${moneyMarked(moneyAward)}.`);
  for (const nl of lv.leveledTo) log(`You reached level ${nl}!`);

  return {
    ok: true,
    xp: xpAward,
    money: moneyAward,
    items,
    spells,
    buffs,
    leveledTo: lv.leveledTo,
    state,
    tempSpawns,
  };
}
