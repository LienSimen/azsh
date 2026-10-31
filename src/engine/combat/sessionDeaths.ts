// Peeled from createSession (Wave 4 createSession.md P5) — pattern (D).
// unsummonTotem / unsummonAllTotems / checkDeaths (soul-shard + death-summon order).

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import type { Side, TotemSide, EnemySide } from '../core/events.ts';
import { CREATURE_TYPE } from '../../data/schema.ts';
import { isTrivialLevelDifference } from '../../progression/xpGain.ts';
import {
  applyInstanceSetData,
  instanceEventForCreature,
  lifecycleActions,
  noteScriptDevAddDeath,
  scriptDevByCreature,
  scriptDevInstanceForCreature,
} from '../../domain/scriptdev/index.ts';
import { formatEventAiChatLine, lookupEventAiText } from '../../domain/creature/eventAiTexts.ts';
import { SPELL_ATTR_EX, hasAttrEx } from '../spells/spellAttributes.ts';
import { channelInterruptCtx, interruptChannel } from './channel.ts';
import { stripTotemAuras } from './totemAuras.ts';
import { stripPetPartyAreaAuras } from './petAuras.ts';
import { applyForceDespawn } from './forceDespawnAction.ts';
import { linkedDeathFollowers } from '../../domain/creature/creatureLinking.ts';
import { emitSimEffect } from './simEffects.ts';
import { isEnemySide, isPlayerCharacterSide } from '../core/events.ts';
import { SOUL_SHARD_ITEM } from '../../domain/core/ids.ts';

export type TotemUnsummonReason = 'expire' | 'death' | 'replace' | 'owner' | 'zone';

/** Player::RemoveFromWorld → UnsummonAllTotems. Cite: Player.cpp:2238; Unit.cpp:6868–6873. */
export function unsummonTotemsOnLeaveWorld(
  session: { unsummonAllTotems?: (reason: 'owner' | 'expire' | 'zone') => void } | null | undefined,
): void {
  session?.unsummonAllTotems?.('zone');
}

export type SessionDeathsDeps = {
  dead: (f: Fighter) => boolean;
  sanitizeHp: (f: Fighter) => void;
  clearManualMotion: (side: string) => void;
};

export function installSessionDeaths(ctx: CombatContext, deps: SessionDeathsDeps): void {
  const { dead, sanitizeHp, clearManualMotion } = deps;
  const {
    player, pet, allies, enemies, totems, effects, deathEmitted, cfg,
    instanceData, enemyCastBySide,
  } = ctx;

  /** Strip auras applied by a totem and remove it from the slot (expire / death / replace / owner / zone). */
  const unsummonTotem = (side: TotemSide, reason: TotemUnsummonReason): void => {
    const tot = totems.get(side);
    if (!tot) return;
    // Clear the rotation marker from whoever summoned it (companion shamans own their own).
    if (tot.totemSummonSpellId) ctx.bySide(tot.totemOwnerSide ?? 'player').buffActive.delete(tot.totemSummonSpellId);
    // Strips only RemoveAurasDueToSpell(GetSpell()) — see totemAuras.ts for why that asymmetry
    // is what makes totem twisting work. Cite: Entities/Totem.cpp UnSummon :131–158.
    stripTotemAuras({
      effects,
      side,
      kitSpellId: tot.totemKitSpellId ?? 0,
      t: ctx.t,
      bySide: ctx.bySide,
      push: ctx.push,
    });
    ctx.removeFromAllThreat!(side); // drop totem from every hate list on unsummon
    ctx.rosterClearTotem!(side); // seat + fightersOrder generation, one writer
    if (reason === 'death' || reason === 'expire') {
      ctx.push({ t: ctx.t, kind: 'death', actor: side });
      ctx.push({ t: ctx.t, kind: 'flavor', text: `${tot.spec.name} ${reason === 'expire' ? 'expires' : 'is destroyed'}.` });
    } else if (reason === 'replace') {
      ctx.push({ t: ctx.t, kind: 'flavor', text: `${tot.spec.name} is replaced.` });
    }
  };

  // `owner` limits it to that unit's own seats — Unit::UnsummonAllTotems walks the caller's array.
  // Cite: Unit.cpp:6867–6872. Omitted (zone change / wipe) takes the session's.
  const unsummonAllTotems = (reason: 'owner' | 'expire' | 'zone', owner?: Side): void => {
    for (const [side, tot] of [...totems.entries()]) {
      if (owner != null && (tot.totemOwnerSide ?? 'player') !== owner) continue;
      unsummonTotem(side, reason === 'expire' ? 'expire' : reason);
    }
  };

  // A corpse holds no bar and no channel. The cast fields were cleared per death site and the channel
  // was not, so a killed Drain Life left its aura ticking on the survivor.
  const dropCastAndChannel = (f: Fighter): void => {
    f.castingSpell = null;
    f.castFinishAt = 0;
    f.castStartedAt = 0;
    // Quiet: the death row is the log line here.
    if (f.channeling) interruptChannel(f, channelInterruptCtx(ctx), { quiet: true });
  };

  // Totem::Update unsummons the moment its owner stops being alive. A creature's totem is a body on
  // its own side, so the four-slot map never held it. Cite: Entities/Totem.cpp:79-84.
  const unsummonTotemBodiesOfOwner = (ownerSide: Side): void => {
    const owned = ctx.guardianSidesBySummoner.get(ownerSide);
    if (!owned || owned.size === 0) return;
    let any = false;
    for (const side of [...owned]) {
      const body = ctx.sideFighter?.(side);
      if (!body || body.spec.isTotem !== true || dead(body)) continue;
      if (isEnemySide(side)) ctx.forceDespawnEnemy!(body);
      else {
        body.hp = 0;
        body.summonDespawnAt = 0;
        deathEmitted.add(side);
        ctx.push({ t: ctx.t, kind: 'despawn', actor: side });
      }
      ctx.removeFromAllThreat!(side);
      clearManualMotion(side);
      any = true;
    }
    if (any) ctx.bumpRoster!();
  };

  // RemovePet runs BEFORE Unit::SetDeathState, so the owner's pet leaves the fight ALIVE rather than
  // dying with them. Cite: Player.cpp:1666-1673 (RemoveGuardians beside it spares one in combat).
  const unsummonPetOfOwner = (ownerSide: Side): void => {
    const petSide = ownerSide === 'player' ? pet?.side : ctx.sideFighter?.(ownerSide)?.spec.petSide;
    const p = petSide == null ? null : (ownerSide === 'player' ? pet : ctx.sideFighter?.(petSide) ?? null);
    if (!p || dead(p) || deathEmitted.has(p.side)) return;
    if (ownerSide === 'player') ctx.petUnsummonedHp = Math.max(1, Math.round(p.hp));
    if (ctx.isCharmed(p) || p.charmedBy != null) ctx.breakCharm!(p);
    deathEmitted.add(p.side);
    p.hp = 0;
    dropCastAndChannel(p);
    // Blood Pact and the rest of the pet's APPLY_AREA_AURA_PARTY copies fall with the caster.
    stripPetPartyAreaAuras({
      effects,
      pet: p,
      t: ctx.t,
      bySide: ctx.bySide,
      push: ctx.push,
      recipients: ['player', ...ctx.allyBlock().map((a) => a.side)],
    });
    ctx.push({ t: ctx.t, kind: 'despawn', actor: p.side });
    ctx.removeFromAllThreat!(p.side);
    clearManualMotion(p.side);
    ctx.bumpRoster!();
  };

  const checkDeaths = (): void => {
    // Snap NaN, negative and sub-HP dust so liveness and the frame number cannot diverge, over EVERY
    // seat. Fusing it with the revive-clear is exact, since each write touches only its own unit.
    let pending = 0;
    for (const f of ctx.allSeats()) {
      sanitizeHp(f);
      if (!dead(f)) deathEmitted.delete(f.side);
      else if (!deathEmitted.has(f.side)) pending++;
    }
    // Nothing died since the last call, so every block below is a test that cannot fire. This runs four
    // times a tick. The end-of-fight test stays OUTSIDE the skip: a roster change can flip it.
    if (pending === 0) {
      if (!cfg.endless && (ctx.partyWiped!() || ctx.allEnemiesDead!())) ctx.ended = true;
      return;
    }

    let poolDirty = false;
    let died = false;
    // A downed pet is benched (a one-time death event) but the fight continues — only the
    // player dying or *all* enemies dying ends it.
    if (pet && dead(pet) && !deathEmitted.has('pet')) {
      poolDirty = true;
      died = true;
      if (ctx.isCharmed(pet) || pet.charmedBy != null) ctx.breakCharm!(pet);
      deathEmitted.add('pet');
      pet.hp = 0;
      dropCastAndChannel(pet);
      // APPLY_AREA_AURA_PARTY copies (Blood Pact) drop when the pet caster dies.
      // Cite: SpellAuras.cpp AreaAura::Update non-caster; KI-066.
      stripPetPartyAreaAuras({
        effects,
        pet,
        t: ctx.t,
        bySide: ctx.bySide,
        push: ctx.push,
        recipients: ['player', ...ctx.allyBlock().map((a) => a.side)],
      });
      ctx.push({ t: ctx.t, kind: 'death', actor: 'pet' });
      ctx.removeFromAllThreat!('pet');
    }
    // Downed allies bench like the pet — one death event, off every threat list.
    // Fight continues while any of player/allies still lives (party-wipe end condition).
    for (const al of ctx.allyBlock()) {
      if (!dead(al) || deathEmitted.has(al.side)) continue;
      poolDirty = true;
      died = true;
      // Possess break on death. Cite: boss_baroness_anastari.cpp !pPlayer || !IsAlive → remove inv.
      if (ctx.isCharmed(al) || al.charmedBy != null || al.charmSpellId !== 0) ctx.breakCharm!(al);
      deathEmitted.add(al.side);
      al.hp = 0;
      dropCastAndChannel(al);
      ctx.push({ t: ctx.t, kind: 'death', actor: al.side });
      ctx.removeFromAllThreat!(al.side);
      clearManualMotion(al.side);
      // A companion shaman's own totems go with it, the same as the player's below.
      // Cite: Unit.cpp:6867–6872 Unit::UnsummonAllTotems.
      unsummonAllTotems('owner', al.side);
      unsummonTotemBodiesOfOwner(al.side);
      unsummonPetOfOwner(al.side); // a dead companion hunter/warlock keeps no pet out
    }
    // Totems that reach 0 HP unsummon (Stoneclaw tank death).
    for (const [side, tot] of [...totems.entries()]) {
      if (tot && dead(tot)) {
        tot.hp = 0;
        ctx.removeFromAllThreat!(tot.side);
        unsummonTotem(side, 'death'); // bumpRoster inside
        died = true;
      }
    }
    if (dead(player) && !deathEmitted.has('player')) {
      poolDirty = true;
      died = true;
      // Possess break on player death so boss inv clears if the fight somehow continues.
      if (ctx.isCharmed(player) || player.charmedBy != null || player.charmSpellId !== 0) {
        ctx.breakCharm!(player);
      }
      deathEmitted.add('player');
      player.hp = 0;
      dropCastAndChannel(player);
      ctx.push({ t: ctx.t, kind: 'death', actor: 'player' });
      unsummonAllTotems('owner', 'player'); // CMaNGOS: owner death → its own totems unsummon
      unsummonTotemBodiesOfOwner('player');
      unsummonPetOfOwner('player');
      clearManualMotion('player');
      // WHICH ENEMIES WERE ACTUALLY FIGHTING THE PLAYER, captured BEFORE the removal below. The seed
      // used to re-engage every un-engaged mob within 45 yd, so one death aggroed the whole floor.
      const wasFightingPlayer = new Set<string>();
      for (const ef of ctx.livingEnemies()) {
        const tm = ctx.threatOf(ef);
        if (tm && tm.getThreatIds().includes('player')) wasFightingPlayer.add(ef.side);
      }
      // Drop the player from every hate list. Do NOT clearAllThreat: living companions
      // keep the pull when the player dies (party-wipe only when everyone is down).
      ctx.removeFromAllThreat!('player');
      // Empty threat reads as !engaged → false pack-clear + OOC rez. Seed the nearest ally, on
      // the pull only.
      if (ctx.livingAllies().length > 0) {
        for (const ef of ctx.livingEnemies()) {
          if (!wasFightingPlayer.has(ef.side)) continue;
          const tm = ctx.threatOf(ef);
          if (!tm || !tm.isEmpty()) continue;
          const seedOn = ctx.nearestPartyInAcquire?.(ef.side);
          if (!seedOn || seedOn === 'player') continue;
          tm.addThreatDirectly(seedOn, 1, false);
        }
        ctx.invalidateViewMemo?.();
      }
    }
    // Each enemy death clears that owner's list only; the fight continues while others live. The death
    // event fires BEFORE the all-dead test so a death-summon can inject and keep the session alive.
    for (const ef of ctx.enemyBlock()) {
      if (!dead(ef) || deathEmitted.has(ef.side)) continue;
      poolDirty = true;
      died = true;
      deathEmitted.add(ef.side);
      ef.hp = 0;
      dropCastAndChannel(ef);
      ctx.push({ t: ctx.t, kind: 'death', actor: ef.side });
      unsummonTotemBodiesOfOwner(ef.side); // a dead shaman's ward goes with it
      // LINKING_EVENT_DIE: the master's death takes its slaves — SELFKILL leaves a corpse, DESPAWN
      // does not. Cite: CreatureLinkingMgr.cpp ProcessTeamCommand; .h:66-67.
      {
        const master = (ef.spec.creatureEntry ?? 0) | 0;
        const followers = master ? linkedDeathFollowers(master, ef.spec.mapId) : [];
        for (const fol of followers) {
          for (const slave of ctx.enemyBlock()) {
            if (dead(slave) || ((slave.spec.creatureEntry ?? 0) | 0) !== fol.entry) continue;
            if (fol.selfkill) { slave.hp = 0; continue; }
            ctx.forceDespawnEnemy?.(slave);
            ctx.push({ t: ctx.t, kind: 'despawn', actor: slave.side as EnemySide });
          }
        }
      }
      // Keep the dead owner's threat list for the post-kill API and meters — who had aggro. The unit is
      // still in the array at zero health, and the list clears on evade, release or a new fight.
      (ctx.runEnemyDeathEventAi as (e: Fighter) => void)(ef);
      // EVENT_T_SUMMONED_JUST_DIED (25) fires on the SUMMONER, not the corpse. 9 DB rows (Stonevault Oracle
      // 4852, Sandfury Witch Doctor 5650). Cite: CreatureEventAI.cpp SummonedCreatureJustDied.
      for (const [summonerSide, owned] of ctx.guardianSidesBySummoner) {
        if (!owned.has(ef.side)) continue;
        const summoner = ctx.sideFighter?.(summonerSide);
        if (summoner && !dead(summoner)) {
          ctx.notifyEventAiSummoned?.(summoner, (ef.spec.creatureEntry ?? 0) | 0, true);
          // Interrupt channeling spellInfo when a Possessed Summoned is killed
          const createdBySpell = ef.spec.createdBySpell;
          if (createdBySpell && summoner.channeling?.spellId === createdBySpell && ef.charmedBy === summoner.side) {
            const spellInfo = ctx.spellOf?.(createdBySpell);
            if (hasAttrEx(spellInfo, SPELL_ATTR_EX.TOGGLE_FARSIGHT) && hasAttrEx(spellInfo, SPELL_ATTR_EX.IS_CHANNELED)) {
              interruptChannel(summoner, channelInterruptCtx(ctx));
            }
          }
        }
      }
      // The instance hooks on a creature death: set the encounter type done and open its doors. Cite:
      // stratholme.cpp:691-699; sunken_temple.cpp:162-178 for the remaining-protectors counter.
      {
        const entry = (ef.spec.creatureEntry ?? 0) | 0;
        if (entry) {
          const instIr = scriptDevInstanceForCreature(entry);
          if (instIr) {
            const ev = instanceEventForCreature(instIr, entry, 'death');
            if (ev) {
              const res = applyInstanceSetData(instIr, ev.field, ev.value, instanceData);
              for (const w of res.writes) {
                ctx.push({ t: ctx.t, kind: 'instance_data', field: w.field, value: w.value });
              }
              for (const go of res.openDoors) {
                ctx.push({ t: ctx.t, kind: 'flavor', text: `Door ${go} opens.` });
              }
              for (const text of res.flavor) {
                ctx.push({ t: ctx.t, kind: 'flavor', text });
              }
              // Persist store + stamp goRuntime (callers, not helpers). Cite: #1385 179550.
              emitSimEffect(ctx, {
                kind: 'instanceData',
                store: new Map(instanceData),
                openDoors: res.openDoors,
              });
            }
          }
          // Boss onDeath yell/SetData/summons. Cite: boss_herod.cpp:87-91 JustDied.
          const bossIr = scriptDevByCreature(entry);
          for (const act of bossIr ? lifecycleActions(bossIr, 'onDeath') : []) {
            if (act.kind === 'set_instance_data') {
              instanceData.set(act.field | 0, act.value | 0);
              ctx.push({ t: ctx.t, kind: 'instance_data', field: act.field | 0, value: act.value | 0 });
            } else if (act.kind === 'yell') {
              // The death yell is the line a boss is remembered for — speak it, and carry the
              // textId so the UI can play the recorded take. Cite: core.scriptTexts.
              const textId = act.textIds && act.textIds.length > 0 ? act.textIds[ctx.rng.int(0, act.textIds.length - 1)] : (act.textId as number);
              const row = lookupEventAiText(textId);
              if (row) {
                const line = formatEventAiChatLine(ef.spec.name, row);
                ctx.push({
                  t: ctx.t,
                  kind: 'creature_text',
                  actor: ef.side,
                  textId: textId | 0,
                  chatType: line.chatType,
                  text: line.text,
                });
              } else {
                ctx.push({ t: ctx.t, kind: 'flavor', text: `${ef.spec.name} yells! (${textId})` });
              }
            } else if (act.kind === 'summon_count' || act.kind === 'summon') {
              const cid = (act.creatureEntry ?? 0) | 0;
              const n = act.kind === 'summon_count' ? Math.max(0, act.count | 0) : 1;
              // Map-absolute SummonCreature(x,y). Cite: boss_herod.cpp:90; injectEnemySummon worldPos.
              const worldPos =
                act.kind === 'summon_count' && act.x != null && act.y != null
                  ? { x: act.x, y: act.y }
                  : undefined;
              if (cid > 0) for (let i = 0; i < n; i++) ctx.injectEnemySummon!(ef, cid, 0, worldPos);
            } else if (act.kind === 'flavor') {
              void act; // internal port note, not player copy: scriptdev-flavor-leak.test.ts
            } else if (act.kind === 'set_combat_movement') {
              // Rare onDeath path; keep same state as EventAI combat_movement.
              // Cite: UnitAI.cpp:301-318 SetCombatMovement.
              const ocs = enemyCastBySide.get(ef.side as EnemySide);
              if (ocs) ocs.eventAi.combatMovement = act.enabled;
              ctx.push({
                t: ctx.t,
                kind: 'flavor',
                text: act.enabled
                  ? `${ef.spec.name} resumes combat movement.`
                  : `${ef.spec.name} stops combat movement.`,
              });
            } else if (act.kind === 'set_death_prevention') {
              // Cite: CreatureAI.cpp:130-135 SetDeathPrevention; Unit.cpp:1000-1001 leave 1 HP.
              const ocs = enemyCastBySide.get(ef.side as EnemySide);
              if (ocs) ocs.eventAi.deathPrevention = act.enabled;
              ctx.push({ t: ctx.t, kind: 'death_prevention', actor: ef.side, enabled: act.enabled });
            } else if (act.kind === 'send_ai_event') {
              // JustDied SendAIEvent. Cite: boss_golemagg.cpp:73-84; UnitAI.cpp:664-668.
              ctx.applyScriptDevCombatActions?.(ef, [act]);
            } else if (act.kind === 'force_despawn') {
              // Cite: hinterlands.cpp:137-145 JustDied ForcedDespawn; Creature::ForcedDespawn.
              // forceDespawnEnemy passed by name keeps the census WIRING_SIDE_EFFECT_RE token here.
              applyForceDespawn(act, ef, ctx.t,
                {
                  forceDespawnEnemy: ctx.forceDespawnEnemy!,
                  enemyCastBySide,
                  push: ctx.push,
                  dead,
                  emitWhenAlreadyDead: true,
                });
            } else {
              // cast_self / cast_on_script_targets. Cite: boss_razuvious.cpp:104-108 SPELL_HOPELESS.
              ctx.applyScriptDevCombatActions?.(ef, [act]);
            }
          }
        }
      }
      // A LIVING scripted unit reacts to one of its own adds dying. Majordomo is the case this exists
      // for: he cannot be killed, so without it his pull can only ever be lost.
      {
        const deadEntry = (ef.spec.creatureEntry ?? 0) | 0;
        if (deadEntry) {
          for (const other of ctx.livingEnemies()) {
            if (other === ef) continue;
            const cs = enemyCastBySide.get(other.side as EnemySide);
            if (!cs?.scriptDev?.ir.addDeaths?.length) continue;
            const acts = noteScriptDevAddDeath(cs.scriptDev, deadEntry);
            if (acts.length) {
              const pos = ctx.posOf?.(ef.side);
              const stamped = pos
                ? acts.map((a) => (
                  a.kind === 'summon_count' && a.x == null && a.y == null
                    ? { ...a, x: pos.x, y: pos.y }
                    : a
                ))
                : acts;
              ctx.applyScriptDevCombatActions?.(other, stamped);
            }
          }
        }
      }
      // A Soul Shard when the kill would yield XP and a shard-granting aura is up. Critters and grey
      // mobs yield neither XP nor shards. The shard belongs to the warlock who drained it, which is
      // any player-side seat — a companion warlock that never gains one can never re-stone the party.
      const shardAura = ctx.effectsOn(ef.side).find(
        (e) =>
          (e.kind === 'dot' || e.kind === 'buff')
          && e.grantsSoulShardOnKill === true
          && isPlayerCharacterSide(e.source),
      );
      const shardSide = ef.soulShardLethalCredit || shardAura?.source || null;
      if (
        shardSide
        && ef.creatureType !== CREATURE_TYPE.CRITTER
        && !isTrivialLevelDifference(player.spec.level, ef.spec.level)
      ) {
        if (shardSide === 'player') ctx.soulShardsGained += 1;
        else {
          let gained = ctx.unitItemsGained.get(shardSide);
          if (!gained) { gained = new Map(); ctx.unitItemsGained.set(shardSide, gained); }
          gained.set(SOUL_SHARD_ITEM, (gained.get(SOUL_SHARD_ITEM) ?? 0) + 1);
        }
      }
      ef.soulShardLethalCredit = null;
      // Retarget player focus off the corpse.
      if (ctx.playerFocusFighter === ef) ctx.ensurePlayerFocus!();
    }
    // A team match does not go quiet because a seat fell: an enemy whose threat list emptied with
    // that body re-opens on the nearest living hostile. Off for a creature pull, where an empty
    // list means stand down and walk home.
    if (cfg.reacquireOnEmptyThreat) ctx.reacquireEmptyThreat!();
    // An `endless` (PvP match) session benches its dead and fights on — the match, not a
    // wipe, decides when it is over.
    if (!cfg.endless && (ctx.partyWiped!() || ctx.allEnemiesDead!())) ctx.ended = true;
    if (poolDirty) {
      ctx.bumpPool!();
      // S2 dirty trigger "its target dies": survivors re-decide at the first GCD-ready
      // tick instead of waiting out the slow-update slice (slowUpdate.ts).
      for (const f of ctx.fightersOrder()) {
        if (!dead(f)) f.decideDirty = true;
      }
    }
    // onRemove-by-death lives in the effects sweep — lower the watermark so the next step
    // does not skip it. Cite: SpellAuras.cpp:1425–1430 AURA_REMOVE_BY_DEATH.
    if (died) ctx.touchPeriodicDue(ctx.t);
  };

  ctx.unsummonTotem = unsummonTotem;
  ctx.checkDeaths = checkDeaths;
}
