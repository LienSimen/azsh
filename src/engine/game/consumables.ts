// Bag-use consumables + auto-consume prefs. Pattern C: createConsumablesModule(ctx, extras).
// No import of game.ts.

import type { Character } from '../../domain/character/character.ts';
import {
  maxHealth, maxPower, powerType, applyAura, pruneExpiredAuras,
} from '../../domain/character/character.ts';
import { TUNING } from '../combat/formulas.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { grantSpellReputationEffects } from './spellReputation.ts';
import { recoveryReadyAts } from '../spells/recovery.ts';
import {
  classifyConsumable,
  isAutoConsumableCandidate,
  toggleAutoConsumable,
  clearAutoConsumable,
  type AutoConsumablePrefs,
} from '../../domain/bots/autoConsumables.ts';
import { removeItem } from '../../domain/items/inventory.ts';
import { consumeItemCharges } from '../../domain/items/inventory.ts';
import { equippedEntry } from '../../domain/items/itemInstance.ts';
import { recordSpellCast } from '../../domain/quests/questlog.ts';
import { refuseBareTamingRodUse } from './tamingRodUse.ts';
import { stampCorpseSpellHit, tryQuestItemOnCorpse } from './questItemOnCorpse.ts';
import { refuseBareScriptTargetItemUse } from './questItemOnCreature.ts';
import { routeTeachItem } from './learnFromItem.ts';
import { isOpenableContainer } from '../../domain/items/itemContainer.ts';
import { itemUseCooldown, itemUseCooldownRemainingMs } from '../../domain/items/itemUseCooldown.ts';
import { itemUseGates } from '../../domain/items/itemRestrictions.ts';
import { creditQuestCompleteFromSpell } from './questSpellComplete.ts';
import { applySendEventFromSpell, type ApplySendEventFromSpellResult } from './sendEventFromSpell.ts';
import { runSpellScripts } from './applyDeathAndSpellScripts.ts';
import { deliverScriptMail } from './mail.ts';
import {
  collectSummonObjectWildFromSpell,
  mergeWildSummoned,
} from './summonObjectWild.ts';
import {
  collectSummonObjectSlotFromSpell,
  placeSummonObjectSlot,
} from './summonObjectSlot.ts';
import { consume, canPreferConsumableDump, tickPendingWellFed } from '../../progression/rest.ts';
import { refuseIfDead } from '../../domain/run/death.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { removeCharAurasWithInterruptFlags } from './oocAuraInterrupt.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { EnchantItemResult } from './enchantItem.ts';
import type { WeaponImbueItemResult } from './weaponImbueItem.ts';
import type { CombatSession } from '../combat/session-types.ts';
import { countItem } from '../../domain/items/inventory.ts';
import type { ConsumeItemOpts, Game, UseAllStop } from './types.ts';
import type { GameCtx } from './context.ts';

// Food and drink are out-of-combat only, so the bag path must match the combat kit, which already omits
// them. Bandages and in-combat potions are neither. Cite: SPELL_ATTR_NOT_IN_COMBAT_ONLY_PEACEFUL.
export function isOocFoodOrDrinkItem(it: ItemDef | undefined, ds: DataStore): boolean {
  if (!it) return false;
  if (it.useInCombat) return false;
  const sp = it.useSpell != null ? ds.spell(it.useSpell) : undefined;
  if (sp?.mechanic === 'bandage') return false;
  const cons = it.consumable?.effect;
  if (cons === 'food' || cons === 'drink') return true;
  // useSpell-only meals: ATTR bit → notInCombatOnly + restore_* payload (Food 433 / Drink 430).
  if (sp?.notInCombatOnly) {
    const fx = sp.effects ?? [];
    return fx.some((e) => e.kind === 'restore_health' || e.kind === 'restore_power');
  }
  return false;
}

export type ConsumablesExtras = {
  enchantItemRouter: (itemEntry: number, opts: ConsumeItemOpts) => EnchantItemResult | null;
  weaponImbueItemRouter: (itemEntry: number, opts: ConsumeItemOpts) => WeaponImbueItemResult | null;
  castHearth: (nowMs?: number) => { ok: boolean; reason?: string };
  openContainerItem: Game['openContainerItem'];
  teachApi: Pick<
    Game,
    'trainPet' | 'learnRecipeFromItem' | 'learnEnchantFromItem' | 'learnSpellFromItem' | 'learnProfessionRankFromItem'
  >;
  applySendEventTempSpawns: (fired: ApplySendEventFromSpellResult['fired']) => void;
  /** Live floor fight / pending pull — food/drink refuse while set (KI-909). */
  isInCombat: () => boolean;
  /** Open combat/floor session, when one owns the player's live auras and vitals. */
  liveSession: () => CombatSession | null;
  onOutfitterSync?: () => void;
};

export function createConsumablesModule(
  ctx: GameCtx,
  extras: ConsumablesExtras,
): Pick<Game, 'consumeItem' | 'consumeItemAll' | 'setAutoConsumable' | 'clearAutoConsumable'> {
  const { ds, state, log, refreshQuests, cap } = ctx;
  const {
    enchantItemRouter,
    weaponImbueItemRouter,
    castHearth,
    openContainerItem,
    teachApi,
    applySendEventTempSpawns,
    isInCombat,
    liveSession,
    onOutfitterSync,
  } = extras;

  // A dungeon keeps ONE endless session open, and while it is open THAT session owns the player's live
  // auras — so replay a bag use as a free self-cast, resolved through the interpreter first.
  const replayUseOnLiveUnit = (spellIds: Array<number | undefined>): void => {
    const live = liveSession();
    if (!live || typeof live.applySpellToUnit !== 'function') return;
    for (const id of new Set(spellIds.map((s) => (s ?? 0) | 0))) {
      if (id <= 0) continue;
      const raw = ds.spell(id);
      if (!raw) continue;
      live.applySpellToUnit('player', resolveCombatSpell(raw, { casterLevel: state.char.level }));
    }
  };

  const api: Pick<
    Game,
    'consumeItem' | 'consumeItemAll' | 'setAutoConsumable' | 'clearAutoConsumable'
  > = {
    consumeItem(itemEntry, preferEffect) {
      // Back-compat: the second argument used to be only 'food' | 'drink'. Accept both shapes so
      // every existing caller (action bar, autopilot, regenTick) keeps working untouched.
      const opts: ConsumeItemOpts = typeof preferEffect === 'string'
        ? { preferEffect }
        : (preferEffect ?? {});
      const prefer = opts.preferEffect;

      // Dead cannot use bag items (food/drink/pots/hearth/enchant). Cite: Spell.cpp CheckCast
      // SPELL_FAILED_CASTER_DEAD; domain/run/death.ts refuseIfDead (KI-936).
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return { ...dead, restored: 0 };
      }

      // The ON_USE cooldown gate. This path STAMPED a cooldown and never checked one, so every on-use
      // item was spammable outside a fight: three Minor Healing Potions in one tick, measured.
      {
        const rem = itemUseCooldownRemainingMs(
          ds.item(itemEntry), state.spellCooldowns, state.categoryCooldowns, Date.now(),
        );
        if (rem > 0) {
          return { ok: false, reason: `Not ready yet - ${Math.ceil(rem / 1000)}s`, restored: 0 };
        }
      }

      // Food and drink are refused in a live fight; potions and bandages stay usable. The bag path had
      // no such gate. Cite: isOocFoodOrDrinkItem; travel.ts "You are in combat".
      if (isInCombat() && isOocFoodOrDrinkItem(ds.item(itemEntry), ds)) {
        return { ok: false, reason: 'You are in combat', restored: 0 };
      }

      // AllowableClass / RequiredLevel / race. Cite: Player.cpp CanUseItem; KI-1067.
      {
        const it = ds.item(itemEntry);
        if (it) {
          const g = itemUseGates(state.char, it, ds);
          if (!g.ok) return { ok: false, reason: g.reason, restored: 0 };
        }
      }

      // RemoveAurasWithInterruptFlags(AURA_INTERRUPT_FLAG_ITEM_USE) once the gates pass, before the
      // item resolves. Cite: SpellHandler.cpp:146 HandleUseItemOpcode.
      {
        const stripped = removeCharAurasWithInterruptFlags(
          state.char, AURA_INTERRUPT.ITEM_USE, ds, null, liveSession(),
        );
        for (const gone of stripped) log(`${gone.name} fades.`);
      }

      // An enchant-applying item resolves BEFORE the generic consume path, because consume() would eat
      // the item and hand back a decision we could not act on if the slot turned out ineligible.
      const enchantRoute = enchantItemRouter(itemEntry, opts);
      if (enchantRoute) {
        if (enchantRoute.ok) refreshQuests();
        return enchantRoute;
      }
      // A temporary weapon imbue needs a hand pick, on the same contract as a permanent one. This
      // replaced a hard-coded main-hand path that made off-hand poisons unreachable.
      const imbueRoute = weaponImbueItemRouter(itemEntry, opts);
      if (imbueRoute) {
        if (imbueRoute.ok) {
          const useSp = ds.item(itemEntry)?.useSpell;
          if (useSp) state.questlog = recordSpellCast(state.questlog, useSp, (e) => ds.quest(e));
          refreshQuests();
        }
        return imbueRoute;
      }

      // FQ2 / KI-141 / KI-439: bare bag use of a Taming Rod never free-completes.
      // Credit only via useQuestItemOnTarget + named practice beast (tamingRodUse.ts).
      const bareTame = refuseBareTamingRodUse(itemEntry, state.inventory, ds);
      if (bareTame) return bareTame;
      // Type-2 corpse items (Bramble 10699 / molt / pike): never consume() destroy.
      // Credit only via lastCorpse + gossip KILL_CREDIT / CREATE_ITEM.
      {
        const onCorpse = tryQuestItemOnCorpse({
          itemEntry,
          lastCorpse: state.lastCorpse,
          corpse: state.corpse,
          inventory: state.inventory,
          questlog: state.questlog,
          ds,
        });
        if (onCorpse.handled) {
          if (!onCorpse.ok) return { ok: false, reason: onCorpse.reason, restored: 0 };
          state.questlog = onCorpse.questlog;
          if (onCorpse.inventory) state.inventory = onCorpse.inventory;
          // The USE succeeded, so it spends a charge — an unlimited bramble (spellcharges 0) is kept
          // and a -1 pike is destroyed. Cite: Spell.cpp:4209 TakeCastItem.
          {
            const spent = consumeItemCharges(state.inventory, itemEntry, ds.item(itemEntry));
            if (spent.ok) state.inventory = spent.inventory;
          }
          state.lastCorpse = stampCorpseSpellHit(
            state.lastCorpse, onCorpse.hitSpellId, onCorpse.targetEntry,
          );
          refreshQuests();
          log(onCorpse.logLine);
          return { ok: true, restored: 0 };
        }
      }
      // An item whose use spell needs a named LIVE creature near the caster: a bag click has no target,
      // so the core refuses bad targets before the item is spent. Placed after the corpse route.
      {
        const bareScript = refuseBareScriptTargetItemUse(itemEntry, state.inventory, ds);
        if (bareScript) return bareScript;
      }
      // teleport_hearth bag-use (Hearthstone 6948 / spell 8690) → castHearth; consume() has no handler (KI-880).
      // Cite: UI useHeld→castHearth; SpellEffects.cpp EffectTeleportUnits HOME_BIND; travel.ts castHearth.
      {
        const useSp = ds.item(itemEntry)?.useSpell;
        const sp = useSp ? ds.spell(useSp) : undefined;
        if (sp?.effects?.some((e) => e.kind === 'teleport_hearth')) {
          const hr = castHearth(Date.now());
          if (!hr.ok) return { ok: false, reason: hr.reason ?? 'Cannot use Hearthstone', restored: 0 };
          return { ok: true, restored: 0 };
        }
      }
      // An openable container: bag use opens it, and this is the chokepoint for autopilot and repros.
      // No hold — contents go straight to bags. Cite: SpellHandler.cpp:162 HandleOpenItemOpcode.
      {
        const containerDef = ds.item(itemEntry);
        if (
          containerDef
          && isOpenableContainer(containerDef, (e) => ds.lootTable(`item:${e}`).length > 0)
        ) {
          const slot = state.inventory.stacks.findIndex((s) => s.item === itemEntry);
          if (slot < 0) return { ok: false, reason: "You don't have that" };
          const opened = openContainerItem(slot);
          if (!opened.ok) return opened;
          // openContainer yields loot, not HP/mana — stamp restored:0 for ActionResult shape.
          return { ...opened, restored: 0 };
        }
      }
      // "Use" on a recipe or book IS the learn: every teaching item carries a learn stub as its use
      // spell, so without this route the generic dispatch eats the book and teaches nothing.
      const taught = routeTeachItem(itemEntry, ds, teachApi);
      if (taught) return taught;
      // When the caller's intent is explicitly to eat or drink, apply the item's consumable directly:
      // re-baked food often carries a level-gated use spell that shadows it. Long HP5 defers to consume.
      if (prefer) {
        const it = ds.item(itemEntry);
        const cons = it?.consumable;
        const usable = !!cons && cons.effect === prefer
          && state.char.level >= cons.reqLevel
          && !(cons.effect === 'drink' && powerType(state.char) !== 'mana');
        if (usable && cons && it && canPreferConsumableDump(it, cons, ds)) {
          const [inv2, removed] = removeItem(state.inventory, itemEntry, 1);
          if (removed > 0) {
            const ticks = Math.max(1, Math.floor(cons.durationMs / cons.tickMs));
            let c: Character = { ...state.char };
            // Percent-of-max food ticks a PERCENTAGE, not a flat amount. This fast path is a second
            // copy of rest.ts consume(), so it needs the same handling or Harvest Fish heals 2.
            const maxRes = cons.effect === 'food' ? maxHealth(c, ds) : maxPower(c, ds);
            const perTick = cons.pctOfMax
              ? Math.floor((maxRes * cons.pctOfMax) / 100)
              : cons.amountPerTick;
            const total = perTick * ticks;
            let restored = 0;
            if (cons.effect === 'food') {
              const before = c.health;
              c.health = Math.min(maxHealth(c, ds), before + total);
              restored = c.health - before;
            } else {
              const before = c.power;
              c.power = Math.min(maxPower(c, ds), before + total);
              restored = c.power - before;
            }
            // PERIODIC_TRIGGER well-fed: same seated gate as rest.ts consume() (EffectAmplitude).
            // Prefer path used to dump HP only and drop the aura-23 tail.
            if (cons.effect === 'food' && it?.useSpell) {
              const spRaw = ds.spell(it.useSpell);
              if (spRaw) {
                const resolved = resolveCombatSpell(spRaw);
                const pts = (resolved.effects ?? []).find(
                  (e) => e.kind === 'proc_trigger_spell'
                    && typeof (e as { triggerSpellId?: number }).triggerSpellId === 'number'
                    && ((e as { triggerSpellId: number }).triggerSpellId | 0) > 0,
                ) as { triggerSpellId?: number; tickMs?: number } | undefined;
                const tid = (pts?.triggerSpellId ?? 0) | 0;
                const needMs = (pts?.tickMs ?? 0) | 0;
                if (tid > 0 && needMs > 0) {
                  const trigDef = ds.spell(tid);
                  if (trigDef) {
                    const trig = resolveCombatSpell(trigDef);
                    let durationMs = 0;
                    for (const be of trig.effects ?? []) {
                      if (be.kind === 'buff') {
                        const d = Number((be as { durationMs?: number }).durationMs) || 0;
                        if (d > durationMs) durationMs = d;
                      }
                    }
                    if (durationMs > 0) {
                      c = tickPendingWellFed(
                        {
                          ...c,
                          pendingWellFed: {
                            triggerSpellId: tid,
                            needMs,
                            elapsedMs: 0,
                            durationMs,
                          },
                        },
                        ds,
                        needMs / 1000,
                        true,
                      );
                    }
                  }
                }
              }
            }
            state.char = c;
            state.inventory = inv2;
            refreshQuests();
            const verb = cons.effect === 'food' ? 'ate' : 'drank';
            log(`You ${verb} ${it?.name ?? itemEntry} (+${restored}).`);
            return { ok: true, restored, kind: cons.effect };
          }
        }
        // Not a pure short food/drink dump (or unusable as preferred): fall through to consume().
      }
      const res = consume(state.char, state.inventory, ds, itemEntry, state.deathFlow);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot consume' };
      // Apply auras for buff consumables here, with the duration from the DB. A pure use-buff has no
      // spell id, so 0 stands in; the multi-aura path applies each owning spell id from consume().
      let appliedChar = res.char;
      const now = Date.now();
      if (res.applyAuras && res.applyAuras.length > 0) {
        for (const a of res.applyAuras) {
          appliedChar = applyAura(appliedChar, a.spellId, a.durationMs, now, ds);
        }
      } else if (res.buff) {
        // Prefer the real spellId from the item's useSpell (populated in rebake) so the aura
        // gets the correct spell icon, name, duration etc. Fallback to 0 for old data.
        const itemDef = ds.item(itemEntry);
        const auraId = itemDef?.useSpell || 0;
        appliedChar = applyAura(res.char, auraId, res.buff.durationMs, now, ds);
      }
      // A temporary weapon imbue is handled by the router above, which needs a slot. Seeing one here
      // means the router missed a path — refuse rather than hard-code main hand.
      if (res.weaponImbueSpellId) {
        return {
          ok: false,
          reason: 'Choose which weapon to coat',
          needsTarget: {
            itemEntry,
            enchantId: 0,
            target: opts.target ?? { kind: 'self' },
            slots: (['mainhand', 'offhand'] as const).filter((s) => equippedEntry(state.char.equipped[s]) != null),
            rejected: [],
          },
        };
      }
      state.char = { ...appliedChar, activeAuras: pruneExpiredAuras(appliedChar.activeAuras) };
      state.inventory = res.inventory;
      if (res.buff && res.buff.mod === 'stamina') {
        const gain = Math.round((res.buff.amount || 0) * TUNING.hpPerStamina);
        const mh = maxHealth(state.char, ds);
        state.char.health = Math.min(mh, state.char.health + gain);
      }
      // SPELL_AURA_MOD_INCREASE_HEALTH: gain max HP and heal by the same delta (ModIncreaseHealth).
      // Cite: fighterFactory applyBuffMod max_health; SpellAuras HandleAuraModIncreaseHealth; KI-442.
      if (res.buff && res.buff.mod === 'max_health') {
        const gain = res.buff.amount || 0;
        if (gain > 0) {
          const mh = maxHealth(state.char, ds);
          state.char.health = Math.min(mh, state.char.health + gain);
        }
      }
      // The same use, mirrored onto the open session's player unit. The item's own use spell is the
      // whole cast; applyAuras carries the owning id for rows that have no use spell to replay.
      replayUseOnLiveUnit([
        ds.item(itemEntry)?.useSpell,
        ...(res.applyAuras ?? []).map((a) => a.spellId),
      ]);
      // An item use spell counts as a successful cast for quest credit, and permanent on-use gear
      // starts its spell and category cooldowns. Never invent a duration — only what the bake carries.
      {
        const itemDef = ds.item(itemEntry);
        const useSp = itemDef?.useSpell;
        if (useSp) {
          state.questlog = creditQuestCompleteFromSpell(recordSpellCast(state.questlog, useSp, (e) => ds.quest(e)), ds.spell(useSp));
          // Place-GO secondaries on quest items. consume() already spent the item, so materialize the
          // wild gameobjects from the resolved spell. Cite: SpellEffects.cpp:3620-3662.
          const useRaw = ds.spell(useSp);
          if (useRaw) {
            const useResolved = resolveCombatSpell(useRaw, { casterLevel: state.char.level });
            // SPELL_EFFECT_REPUTATION on an on-use item: consume() only walks restore and buff kinds,
            // so Destroy Bijou 24377 and the Zandalar honor tokens were spent for nothing.
            state.char = grantSpellReputationEffects(
              state.char, useResolved.effects, ds, Date.now(), log,
            );
            const wilds = collectSummonObjectWildFromSpell(useResolved, Date.now());
            if (wilds.length) {
              const nowWild = Date.now();
              state.wildSummonedObjects = mergeWildSummoned(state.wildSummonedObjects, wilds, nowWild);
              for (const w of wilds) {
                const goName = ds.gameObject(w.goEntry)?.name ?? `object ${w.goEntry}`;
                log(`You summon ${goName}.`);
              }
            }
            const slots = collectSummonObjectSlotFromSpell(useResolved, Date.now());
            if (slots.length) {
              const nowSlot = Date.now();
              state.objectSlots = placeSummonObjectSlot(state.objectSlots, slots, nowSlot);
              for (const w of slots) {
                const goName = ds.gameObject(w.goEntry)?.name ?? `object ${w.goEntry}`;
                log(`You summon ${goName}.`);
              }
            }
            // SPELL_EFFECT_SEND_EVENT — StartEvents_Event(misc) on item useSpell.
            // Cite: SpellEffects.cpp:1794–1798; game/sendEventFromSpell.ts.
            const se = applySendEventFromSpell(
              state.questlog,
              useResolved,
              (id) => ds.eventScripts(id),
              log,
              (e) => ds.quest(e),
            );
            state.questlog = se.log;
            // TEMP_SPAWN_CREATURE (cmd 10) — Binding runes 6284 / event 1785 → 5676.
            // Cite: game/tempSpawnCreature.ts; ScriptMgr.cpp:2027–2051; KI-840.
            applySendEventTempSpawns(se.fired);
            // dbscripts_on_spell — same finish moment. Cite: SpellEffects.cpp:1529–1531.
            {
              const rows = ds.spellScripts(useSp);
              if (rows.length) {
                const applied = runSpellScripts(useSp, rows, {
                  questlog: state.questlog,
                  inventory: state.inventory,
                  itemOf: (e) => ds.item(e),
                  bagCap: cap(),
                  goRuntime: state.goRuntime,
                  goRuntimeKey: (e) => `${state.char.zoneId}:${e}`,
                  worldStates: state.worldStates,
                  relayScripts: (id) => ds.relayScripts(id),
                  questOf: (e) => ds.quest(e),
                  log,
                  source: { kind: 'player' },
                  onMail: (rec) => deliverScriptMail(ctx, rec, Date.now(), 'Mailbox'),
                });
                state.questlog = applied.questlog;
                if (applied.inventory) state.inventory = applied.inventory;
                if (applied.goRuntime) state.goRuntime = applied.goRuntime;
                if (applied.worldStates) state.worldStates = applied.worldStates;
              }
            }
            // ACTIVATE_OBJECT needs a gameobject target, which a plain bag use has none of — the C++
            // early-out. The cast-on-GO item path applies it. Cite: SpellEffects.cpp:4377-4482.
          }
        }
        const nowCd = Date.now();
        // Item-template CDs ride on useBuff / useInCombat when the effect classifier matched a shape, and
        // on the unconditional top-level carrier otherwise (626 items). Cite: schema ItemDef.useCooldownMs.
        const itemCd = itemUseCooldown(itemDef);
        const itemCdMs = itemCd.cooldownMs;
        if ((itemCdMs > 0 || itemCd.categoryCooldownMs > 0) && useSp) {
          if (itemCdMs > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            const ready = nowCd + itemCdMs;
            const prev = state.spellCooldowns[useSp] ?? 0;
            if (ready > prev) state.spellCooldowns[useSp] = ready;
          }
          // The shared category was dropped entirely on this branch, so a world-drunk potion never
          // locked its family. Combat has always stamped both. Cite: Spell.cpp SendSpellCooldown.
          if (itemCd.category > 0 && itemCd.categoryCooldownMs > 0) {
            if (!state.categoryCooldowns) state.categoryCooldowns = {};
            const catReady = nowCd + itemCd.categoryCooldownMs;
            const prevCat = state.categoryCooldowns[itemCd.category] ?? 0;
            if (catReady > prevCat) state.categoryCooldowns[itemCd.category] = catReady;
          }
        } else if (useSp) {
          const spDef = ds.spell(useSp);
          if (spDef) {
            const rec = recoveryReadyAts(spDef, nowCd);
            if (rec.personalReadyAt != null) {
              if (!state.spellCooldowns) state.spellCooldowns = {};
              const prev = state.spellCooldowns[useSp] ?? 0;
              if (rec.personalReadyAt > prev) state.spellCooldowns[useSp] = rec.personalReadyAt;
            }
            if (rec.categoryReadyAt != null && rec.category != null) {
              if (!state.categoryCooldowns) state.categoryCooldowns = {};
              const prev = state.categoryCooldowns[rec.category] ?? 0;
              if (rec.categoryReadyAt > prev) state.categoryCooldowns[rec.category] = rec.categoryReadyAt;
            }
          }
        }
      }
      refreshQuests();
      const itName = ds.item(itemEntry)?.name ?? itemEntry;
      // Multi-effect cooking food restores HP AND queues a secondary buff; do not mask
      // restored behind the buff-only early return (Nightfin 810 + mp5 — KI-881).
      if (res.buff && res.restored > 0) {
        const verb = res.kind === 'drink' ? 'drank' : res.kind === 'food' ? 'ate' : 'used';
        log(`You ${verb} ${itName} (+${res.restored}, +${res.buff.amount} ${res.buff.mod}).`);
        if (res.kind === 'food' || res.kind === 'drink') onOutfitterSync?.();
        return {
          ok: true,
          restored: res.restored,
          kind: res.kind,
          buff: res.buff,
        };
      }
      if (res.buff) {
        // Trinket buffs are often seconds (Ephemeral Power 15s); avoid "0m" for short durations.
        const durLabel = res.buff.durationMs >= 60_000
          ? `${Math.round(res.buff.durationMs / 60000)}m`
          : `${Math.round(res.buff.durationMs / 1000)}s`;
        log(`You used ${itName} (+${res.buff.amount} ${res.buff.mod} for ${durLabel}).`);
        return { ok: true, restored: 0, buff: res.buff };
      }
      if (res.kind === undefined && res.restored > 0) {
        log(`You used ${itName} (+${res.restored}).`);
        return { ok: true, restored: res.restored };
      }
      if (!res.kind && res.restored === 0) {
        log(`You use ${itName}.`);
        return { ok: true, restored: 0 };
      }
      const verb = res.kind === 'food' ? 'ate' : 'drank';
      log(`You ${verb} ${itName} (+${res.restored}).`);
      if (res.kind === 'food' || res.kind === 'drink') onOutfitterSync?.();
      return { ok: true, restored: res.restored, kind: res.kind ?? 'food' };
    },

    // Whole stack through the single-use route, so the ON_USE cooldown, the combat gate and the
    // container branch all still apply and the first refusal ends the run.
    consumeItemAll(itemEntry, max) {
      const it = ds.item(itemEntry);
      if (!it) return { ok: false, reason: 'Unknown item' };
      // Bags only: consumeItem spends a bag stack, so the keyring and the overflow mailbox are not
      // rounds this can run.
      const held = countItem(state.inventory, itemEntry);
      if (held <= 0) return { ok: false, reason: "You don't have that" };
      const rounds = Math.max(1, Math.min(max ?? held, held));
      let used = 0;
      let restored = 0;
      let stopped: UseAllStop = 'stack';
      let lastReason: string | undefined;
      while (used < rounds) {
        const res = api.consumeItem(itemEntry);
        if (!res.ok) {
          if (used === 0) return { ok: false, reason: res.reason };
          stopped = 'blocked';
          lastReason = res.reason;
          break;
        }
        used++;
        restored += res.restored;
        // A container round spills what the bags could not take, and the direct-to-bags path drops
        // it. One lost roll is a bug; twenty is the whole stack, so stop at the first.
        const spilled = (res as { spilled?: unknown }).spilled;
        if (Array.isArray(spilled) && spilled.length > 0) {
          stopped = 'blocked';
          lastReason = 'Your bags are full';
          break;
        }
        if (used >= rounds) { stopped = used >= held ? 'stack' : 'cap'; break; }
      }
      return { ok: true, used, restored, stopped, ...(lastReason ? { lastReason } : {}) };
    },

    setAutoConsumable(itemEntry) {
      const it = ds.item(itemEntry);
      if (!it) return { ok: false, reason: 'Unknown item' };
      if (!isAutoConsumableCandidate(it, state.char)) {
        return { ok: false, reason: 'That is not a usable consumable for you' };
      }
      const kind = classifyConsumable(it, state.char);
      if (!kind) return { ok: false, reason: 'That is not a usable consumable for you' };
      const next = toggleAutoConsumable(state.char.autoConsumables, itemEntry, kind);
      if (next) state.char.autoConsumables = next;
      else delete state.char.autoConsumables;
      const on =
        next?.food === itemEntry
        || next?.drink === itemEntry
        || !!next?.buffs?.includes(itemEntry);
      const role =
        kind === 'food' ? 'food'
        : kind === 'drink' ? 'drink'
        : kind === 'heal' ? 'heal potion'
        : 'buff';
      log(on
        ? `Auto-use ${role}: ${it.name}.`
        : `Stopped auto-using ${it.name}.`);
      return { ok: true, prefs: next as AutoConsumablePrefs | undefined };
    },

    clearAutoConsumable(itemEntry) {
      // Unconditional — setAutoConsumable() refuses anything not currently an eligible candidate,
      // which is exactly the state a stuck entry is in (item gone from the bags, or now excluded).
      const next = clearAutoConsumable(state.char.autoConsumables, itemEntry);
      if (next) state.char.autoConsumables = next;
      else delete state.char.autoConsumables;
      log(`Stopped auto-using ${ds.item(itemEntry)?.name ?? `item ${itemEntry}`}.`);
      return { ok: true, prefs: next as AutoConsumablePrefs | undefined };
    },
  };
  return api;
}
