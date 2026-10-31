// Peeled from createSession (createSession.md P8) — pattern (D).
// resolveItemTarget / useItem (hostile_cast stays in hostileItemUse leaf).

import type { CombatContext } from './context.ts';
import type { CombatItem, Fighter } from './types.ts';
import type { Side } from '../core/events.ts';
import { isAllySide, isEnemySide } from '../core/events.ts';
import type { CombatantId } from './threat.ts';
import { rollBetween } from './formulas.ts';
import { applyBuffMod } from './fighterFactory.ts';
import { maxPowerOfType, powerOfType, setPowerOfType } from './powerPools.ts';
import { POWER_MANA } from '../spells/effects.ts';
import { useHostileItem } from './hostileItemUse.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { hasAttrEx4, SPELL_ATTR_EX4 } from '../spells/spellAttributes.ts';
import { spendKitItem } from './types.ts';
import { emitSimEffect } from './simEffects.ts';
import { refuseCmangosCheckCast } from './cmangosCastGates.ts';
import { isPlayerCharacterTarget } from './castTargetGates.ts';

export function installItemUse(ctx: CombatContext): void {
  const dead = (f: Fighter): boolean =>
    ((ctx as { dead?: (f: Fighter) => boolean }).dead?.(f) ?? !(f.hp > 0));

  /** Item-use target; null when side absent. */
  const resolveItemTarget = (targetId: CombatantId): Fighter | null => {
    if (targetId === 'player') return ctx.player;
    if (targetId === 'pet') return ctx.pet;
    if (isAllySide(targetId) || isEnemySide(targetId)) return ctx.sideFighter?.(targetId) ?? null;
    return null;
  };

  /** Friendly unit sides legal for restore_health / restore_power / apply_buff item effects. */
  const isItemFriendlySide = (s: Side): boolean =>
    s === 'player' || s === 'pet' || isAllySide(s);

  // Use a carried consumable: an instant restore or buff on the target, defaulting to self, then
  // decrement and start the cooldown. Off the GCD but blocked while casting, and friendly-only.
  const useItem = (entry: number, targetId?: CombatantId, actor: Side = 'player'): boolean => {
    let bag: CombatItem[];
    let cdMap: Map<number, number>;
    let spentMap: Map<number, number>;
    let caster: Fighter;
    if (actor === 'player') {
      bag = ctx.playerItems;
      cdMap = ctx.itemCd;
      spentMap = ctx.itemsSpent;
      caster = ctx.player;
    } else if (isAllySide(actor) || isEnemySide(actor)) {
      // One lookup by side. BG enemy bots quaff from their own kits; an enemy injected
      // mid-fight (EventAI summon) has no bag entry and the empty fallback refuses cleanly.
      const unit = ctx.bySide(actor as Side);
      if (!unit || unit.side !== actor) return false;
      bag = ctx.unitItems.get(actor as Side) ?? [];
      cdMap = ctx.unitItemCd.get(actor as Side) ?? new Map();
      spentMap = ctx.unitItemsSpent.get(actor as Side) ?? new Map();
      caster = unit;
    } else {
      return false;
    }
    // "Friendly" for an item is relative to who uses it — an enemy bot's potion lands on
    // enemy sides, its grenade on ours. Totem/summon sides stay untargetable, as before.
    const actorIsEnemyFaction = isEnemySide(actor);
    const friendlyToActor = (s: Side): boolean =>
      actorIsEnemyFaction ? isEnemySide(s) : isItemFriendlySide(s);
    const hostileToActor = (s: Side): boolean =>
      actorIsEnemyFaction ? isItemFriendlySide(s) : isEnemySide(s);
    const selfTarget: CombatantId = actor;
    const resolvedTargetId = targetId ?? selfTarget;

    const it = bag.find((x) => x.entry === entry);
    if (!it || it.count <= 0 || (cdMap.get(entry) ?? 0) > ctx.t) return false;
    // An item's use spell runs CheckCast like any cast: a hardcast OR a live channel refuses it with
    // SPELL_IN_PROGRESS unless the use spell itself allows casting while casting.
    // Cite: Spell.cpp:5902; Unit.cpp:4351-4359 IsNonMeleeSpellCasted; SpellDefines.h:181.
    const useSpell = 'spell' in it.effect ? it.effect.spell : undefined;
    const busy = !!caster.castingSpell || (!!caster.channeling && caster.channeling.endsAt > ctx.t);
    if (busy && !hasAttrEx4(useSpell, SPELL_ATTR_EX4.ALLOW_CAST_WHILE_CASTING)) return false;
    // A charge-bearing unit with none left refuses before any effect, and is not destroyed by trying.
    // Cite: Spell.cpp:6462-6465 CheckItems SPELL_FAILED_NO_CHARGES_REMAIN.
    if (it.charges != null && it.charges <= 0) return false;
    // Shared category CD (potions=4 / bombs=24) from item_template.spellcategory_*.
    if (
      it.category != null
      && it.categoryCooldownMs != null
      && it.categoryCooldownMs > 0
      && (caster.categoryCooldowns.get(it.category) ?? 0) > ctx.t
    ) {
      return false;
    }

    const stampItemCds = (): void => {
      if (it.cooldownMs > 0) cdMap.set(entry, ctx.t + it.cooldownMs);
      if (it.category != null && it.categoryCooldownMs != null && it.categoryCooldownMs > 0) {
        caster.categoryCooldowns.set(it.category, ctx.t + it.categoryCooldownMs);
      }
    };

    // Offensive on-use (grenade / bomb / Tidal Charm) — handled up front and returned, so
    // everything below stays the friendly-only path it has always been. See hostileItemUse.ts.
    if (it.effect.kind === 'hostile_cast') {
      return useHostileItem(it, it.effect, {
        t: ctx.t,
        caster,
        actor,
        targetId,
        resolveItemTarget,
        livingHostilesFor: ctx.livingHostilesFor,
        hostileToActor,
        dead,
        castOnTargets: ctx.castOnTargets!,
        push: ctx.push,
        cdMap,
        spentMap,
      });
    }

    const tgt = resolveItemTarget(resolvedTargetId);
    if (!tgt) return false;
    // Heal/buff items: actor's own faction only. Reject foes / totems / missing units before any RNG.
    if (!friendlyToActor(tgt.side)) return false;
    if (dead(tgt)) return false;

    // A defensive on-use is replayed as a real cast on the friendly target, the mirror of the hostile
    // path. That seam is what lets a feared flag carrier trinket out rather than a flattened copy.
    if (it.effect.kind === 'friendly_cast') {
      // Rocket Boots blow up instead of firing. The buff never lands, the boots are destroyed
      // (reusable or not) and the malfunction spell hits the USER, not the item's target.
      const mf = it.malfunction;
      // CheckCast before spend: a refused bandage must not eat the item.
      // Cite: Spell.cpp:3114 MECHANIC_BANDAGE; Spell.cpp CheckCast then TakeCastItem.
      if (it.effect.spell.mechanic === 'bandage' && refuseCmangosCheckCast(it.effect.spell, {
        flags: tgt.spec.flags,
        creatureEntry: tgt.spec.creatureEntry,
        powerType: tgt.spec.powerType,
        classId: tgt.spec.classId,
        auraSpellIds: tgt.buffActive,
        isPlayer: isPlayerCharacterTarget(tgt),
      }, {
        mapId: caster.spec.mapId,
        hasActivePet: !!ctx.livingPetOf?.(caster) || ctx.isCharmed(caster),
      }, false)) return false;
      if (mf && tgt === caster && ctx.rng.next() * 100 < mf.chancePct) {
        ctx.castOnTargets!(caster, caster, mf.spell);
        it.count = 0;
        spentMap.set(entry, (spentMap.get(entry) ?? 0) + 1);
        // The wreck goes to the PLAYER's bags only; a bot's kit is rebuilt every match.
        if (actor === 'player') {
          ctx.itemsGained.set(mf.destroysInto, (ctx.itemsGained.get(mf.destroysInto) ?? 0) + 1);
        }
        stampItemCds();
        ctx.push({
          t: ctx.t, kind: 'item_use', actor, entry, name: it.name, effect: 'apply_buff', amount: 0,
        });
        return true;
      }
      ctx.castOnTargets!(caster, tgt, it.effect.spell);
      spendKitItem(it, spentMap);
      stampItemCds();
      ctx.push({
        t: ctx.t, kind: 'item_use', actor, entry, name: it.name, effect: 'apply_buff', amount: 0,
        ...(tgt.side === actor ? {} : { target: tgt.side }),
      });
      return true;
    }

    const itemUseEvt = (
      effect: 'restore_health' | 'restore_power' | 'apply_buff',
      amount: number,
    ): void => {
      // Omit target when self so existing solo log shapes stay compatible.
      if (tgt.side === actor) {
        ctx.push({ t: ctx.t, kind: 'item_use', actor, entry, name: it.name, effect, amount });
      } else {
        ctx.push({ t: ctx.t, kind: 'item_use', actor, entry, name: it.name, effect, amount, target: tgt.side });
      }
    };

    if (it.effect.kind === 'apply_buff') {
      // A multi-effect buff consumable replays the item's own spell, so every effect lands and
      // reverses exactly as a cast would. The flat mod path below can only carry one.
      const whole = it.effect.spell;
      if (whole) {
        ctx.castOnTargets!(caster, tgt, whole);
        spendKitItem(it, spentMap);
        stampItemCds();
        itemUseEvt('apply_buff', it.effect.amount);
        return true;
      }
      const { mod, amount, durationMs } = it.effect;
      // Prefer real spell id from useSpell; pure useBuff keys chips by item entry.
      const spellId = it.effect.spellId ?? it.entry;
      const expAt = durationMs > 0 ? ctx.t + durationMs : Number.POSITIVE_INFINITY;
      const liveBuff = ctx.effectsOn(tgt.side).find(
        (e) => e.kind === 'buff' && e.spellId === spellId && e.source === actor,
      );
      if (!liveBuff) {
        applyBuffMod(tgt, mod, amount);
        tgt.buffActive.add(spellId);
        ctx.effects.push({
          kind: 'buff', source: actor, target: tgt.side, spellId, name: it.name,
          mod, amount, expiresAt: expAt,
        });
        ctx.push({ t: ctx.t, kind: 'aura', actor: tgt.side, name: it.name, applied: true });
      } else {
        // Refresh duration without double-adding flat mods (same as spell buff refresh).
        liveBuff.expiresAt = expAt;
        liveBuff.amount = amount;
        liveBuff.mod = mod;
        liveBuff.name = it.name;
        ctx.touchEffect(liveBuff);
      }
      spendKitItem(it, spentMap);
      stampItemCds();
      itemUseEvt('apply_buff', amount);
      return true;
    }

    const amount = Math.max(1, Math.round(rollBetween(it.effect.min, it.effect.max, ctx.rng.next())));
    if (it.effect.kind === 'restore_health') {
      tgt.hp = Math.min(tgt.spec.maxHealth, Math.round(tgt.hp + amount));
    } else {
      // restore_power — the potion fills the pool its energize names, so a Mana Potion on a warrior
      // restores nothing rather than 100 rage. Cite: SpellEffects.cpp EffectEnergize EffectMiscValue.
      const pwr = it.effect.powerType != null ? it.effect.powerType | 0 : POWER_MANA;
      const max = maxPowerOfType(tgt, pwr);
      if (max > 0) setPowerOfType(tgt, pwr, Math.min(max, powerOfType(tgt, pwr) + amount));
    }
    spendKitItem(it, spentMap);
    stampItemCds();
    itemUseEvt(it.effect.kind, amount);
    return true;
  };

  ctx.resolveItemTarget = resolveItemTarget;
  // The item-use interrupt fires on the USER before the item's own effect runs, and every stealth and
  // invisibility rank carries the bit. Wrapped here so one seam covers all four success returns.
  ctx.useItem = (entry: number, targetId?: CombatantId, actor: Side = 'player'): boolean => {
    const user = ctx.sideFighter?.(actor) ?? (actor === 'player' ? ctx.player : undefined);
    if (user) ctx.removeAurasWithInterruptFlags?.(user, AURA_INTERRUPT.ITEM_USE, 'item use');
    const ok = useItem(entry, targetId, actor);
    // Off-thread the tick's `itemsSpent` lives in the WORKER, so `result().itemsConsumed` on the
    // reading side is empty and the bags never pay. Ride it back as a recorded effect instead.
    if (ok && (actor === 'player' || isAllySide(actor))) {
      const bag = actor === 'player' ? ctx.playerItems : (ctx.unitItems.get(actor) ?? []);
      const spentMap = actor === 'player'
        ? ctx.itemsSpent
        : (ctx.unitItemsSpent.get(actor) ?? new Map());
      const left = bag.find((x) => x.entry === entry)?.charges;
      emitSimEffect(ctx, {
        kind: 'itemSpend',
        entry,
        total: spentMap.get(entry) ?? 0,
        ...(left != null ? { charges: left } : {}),
        ...(actor === 'player' ? {} : { side: actor }),
      });
    }
    return ok;
  };
}
