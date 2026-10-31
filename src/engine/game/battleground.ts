// Joining and leaving a battleground, the GameState half only. The match lives in src/domain/bg and
// never sees GameState; all that crosses the line is the identity record.

import { BATTLEGROUNDS, type BattlegroundId } from '../../domain/run/battlegroundRun.ts';
import { DEFAULT_BG_TIER, BG_TIERS } from '../../domain/bg/bgTier.ts';
import { factionOf } from '../../domain/character/races.ts';
import { hashSeed, mulberry32 } from '../core/rng.ts';
import { buildCombatant, combatItems } from '../../domain/character/buildCombatant.ts';
import { createSession, type CombatantSpec } from '../combat.ts';
import { seedDuelGeometry } from './combatSeed.ts';
import { createDuelSession } from '../../domain/run/duel.ts';
import { arenaSeats } from '../../domain/bg/arenaLab.ts';
import { buildFriendlySeats } from '../../domain/bg/bgRoster.ts';
import { applyBgTeamPrebuffs } from '../../domain/bg/bgPrebuff.ts';
import { normalizePaladinAssignments } from '../../domain/rotation/paladinBuffs.ts';
import {
  companionCharacter, companionLevel, companionPetSpec, companionSpec,
} from '../../domain/bots/squad.ts';
import { buildPet } from '../../domain/pet/pet.ts';
import {
  companionActionProvider, companionRotationOf, isCompanionKeepUpSpell, syncCompanionBagItemRules,
} from '../../domain/bots/companionRotation.ts';
import { playerFightActionProvider } from './rotation.ts';
import { seedReagentBagCounts } from '../combat/spellReagents.ts';
import { countItem, removeItem } from '../../domain/items/inventory.ts';
import { runPrePullHealthstones, stoneHolder } from './prePullHealthstones.ts';
import {
  gauntletLength, gauntletRungAfter, type ArenaBracket,
} from '../../domain/bg/arenaComps.ts';
import {
  arenaRatingOf, compDecideMs, compRating, compRatingById, pickRatedComp, ratingAfter,
} from '../../domain/bg/arenaRating.ts';
import { pacedActionProvider } from '../../domain/bg/arenaPace.ts';
import type { GameCtx } from './context.ts';
import type { Game, GameState } from './types.ts';
import type { DataStore } from '../../data/dataStore.ts';

export function createBattlegroundMethods(
  ctx: GameCtx,
  extras?: { onOutfitterSync?: () => void },
): Pick<Game,
  'enterBattleground' | 'leaveBattleground' | 'arenaDuel' | 'arenaMatch' | 'settleArenaDuel'
  | 'settleArenaRating'> {
  const { ds, state, log } = ctx;

  return {
    enterBattleground(bgId: BattlegroundId = 'wsg', opts) {
      const def = BATTLEGROUNDS[bgId];
      if (!def) return { ok: false, reason: 'Unknown battleground' };
      // No arena bracket rides the BG world any more: this screen cycles its dead through a
      // graveyard, which decides nothing in a last-team-standing match. Every bracket mounts the
      // combat surface through `arenaDuel` / `arenaMatch`.
      if (def.mode === 'arena') return { ok: false, reason: 'Arena runs on the combat surface' };
      if (state.battleground) return { ok: false, reason: 'You are already in a battleground' };
      if (state.instance) return { ok: false, reason: 'Leave the dungeon first' };
      if (state.char.level < def.minLevel) {
        return { ok: false, reason: `${def.name} starts at level ${def.minLevel}` };
      }
      const team = factionOf(ds, state.char.race) === 'horde' ? 'horde' : 'alliance';
      const tier = opts?.tier && BG_TIERS[opts.tier] ? opts.tier : DEFAULT_BG_TIER;
      // Bring the ids the caller picked, else the active squad. Existence is re-checked
      // at roster build (buildFriendlySeats) so a stale id degrades to a merc, not a crash.
      const allies = opts?.allies ?? (state.squad ?? []).map((c) => c.id);
      state.fightCounter += 1; // the seeded-action nonce, so a re-join is a different match
      state.battleground = {
        bgId,
        team,
        // Seat 0 of your own team is the cockpit; the roster builder puts the player there.
        selfId: `${team[0]}0`,
        teamSize: def.teamSize,
        seed: opts?.seed ?? hashSeed(state.rngSeed, state.fightCounter),
        tier,
        allies: allies.slice(0, def.teamSize - 1),
      };
      state.corpse = null;
      log(`You join ${def.name}.`);
      extras?.onOutfitterSync?.();
      return { ok: true };
    },

    // The 1v1 IS the auto-battler: one session with the gauntlet duelist seated where a mob would be.
    // The ENEMY gets an action provider — without one a player-shaped spec only auto-attacks.
    arenaDuel() {
      // Seated by RATING, not by the rung: the rung is now the highest one beaten, a trophy the
      // panel shows, and it no longer decides who walks in. A losing streak walks back down.
      const rating = arenaRatingOf(state.arenaRating, 1);
      const comp = pickRatedComp(1, rating, hashSeed(state.rngSeed, state.fightCounter));
      if (!comp) return { ok: false, reason: 'No duelists are authored yet' };
      if (state.instance) return { ok: false, reason: 'Leave the dungeon first' };
      if (state.char.health <= 0) return { ok: false, reason: 'You are dead' };
      const seed = hashSeed(state.rngSeed, state.fightCounter);
      const foe = factionOf(ds, state.char.race) === 'horde' ? 'alliance' : 'horde';
      // The gauntlet is a ladder of DUELISTS, so a rung its foe faction cannot field takes the other
      // side. Paladin and shaman are faction-locked, which made 5 of the 45 rungs unfightable.
      // G16: the duelist is told YOUR class, so it can run a list authored for this matchup.
      const seat = arenaSeats(ds, state.char, comp, seed, {
        team: foe, otherFactionIfUnseatable: true, vsClass: state.char.cls,
      })[0] ?? null;
      if (!seat) return { ok: false, reason: 'Could not seat that duelist' };
      const oppRating = compRating(comp);
      const decideMs = compDecideMs(comp);
      state.fightCounter += 1;
      // You buff up at the gate too. `arenaSeats` already prepped the duelist, so without this the
      // rung walks in with its keep-ups and coats and you walk in with whatever you were wearing.
      state.char = applyBgTeamPrebuffs({
        ds, now: Date.now(), playerLevel: state.char.level, seats: [{ kind: 'player' }],
        player: { char: state.char, spellbook: state.spellbook },
        playerBags: state.inventory,
        assignments: normalizePaladinAssignments(state.paladinAssignments),
        spendPlayerReagent: (item, count) => {
          state.inventory = removeItem(state.inventory, item, count)[0];
        },
      }) ?? state.char;
      prepArenaPlayer(state, ds);
      const playerSpec = buildCombatant(state.char, state.spellbook, ds, state.inventory);
      stampPlayerFightKit(playerSpec, state, ds);
      // Your own beast or demon fights the duel too, the same body PvE seats (combatSession.ts:792)
      // and a BG seats (bgScreen.ts:326); the duelist's rides one more enemy side.
      const playerPet = buildPet(state.char, ds);
      const foeBodies = seat.pet ? [seat.spec, seat.pet] : [seat.spec];
      // Yards at t=0 make this the auto-battler's fight rather than floating frames: the combat stage
      // only mounts when the session has geometry, and the stage carries the plate, chips and WASD.
      const geo = seedDuelGeometry({
        player: playerSpec,
        enemySpecs: foeBodies,
        includePet: playerPet != null,
        spellOf: (id) => ds.spell(id),
      });
      const playerProvider = playerFightActionProvider(state, ds, ctx.opts);
      const session = createDuelSession(
        playerSpec,
        foeBodies,
        mulberry32(seed),
        {
          // null for a pet: it has no rotation section, so the pet heuristics drive it. The
          // duelist's own brain is PACED by its tier - the combat surface's half of enemyStrategyMs.
          enemyActionProviders: seat.pet
            ? [pacedActionProvider(seat.provider, decideMs), null]
            : [pacedActionProvider(seat.provider, decideMs)],
          ...(playerProvider ? { playerActionProvider: playerProvider } : {}),
          unitPositionsYd: geo.positions,
          geometryAnchor: geo.anchor,
        },
        playerPet,
      );
      log(`Arena 1v1 at ${rating}: ${seat.spec.name} (${oppRating}).`);
      return {
        ok: true,
        session,
        compId: comp.id,
        rating,
        oppRating,
        targetName: seat.spec.name,
        targetLevel: seat.body.level ?? state.char.level,
        opponent: {
          race: seat.body.race,
          cls: seat.body.cls,
          ...(seat.body.gender != null ? { gender: seat.body.gender } : {}),
          equipped: seat.body.equipped,
        },
      };
    },

    // ANY team bracket as ONE auto-battler fight: you plus your team against an authored comp with
    // pvp brains. 3v3 and 5v5 joined the 2v2 here on 2026-09-01 by operator direction — the BG
    // screen stood the dead back up at a spirit healer (bgScreen.ts:1246), and an arena is decided
    // by who is left standing. Elimination, not yield-at-1-HP: `partyWiped` needs the player AND
    // every ally down (sessionPools.ts:300), so one seat falling fights on.
    arenaMatch(opts) {
      if (state.instance) return { ok: false, reason: 'Leave the dungeon first' };
      if (state.char.health <= 0) return { ok: false, reason: 'You are dead' };
      const bracket: ArenaBracket = opts?.bracket ?? 2;
      const seed = hashSeed(state.rngSeed, state.fightCounter);
      // Rating picks the comp AND its tier; there is no picker to read any more. `opts.tier` is gone
      // from the type for the same reason the honor panel stopped drawing the buttons.
      const rating = arenaRatingOf(state.arenaRating, bracket);
      const comp = pickRatedComp(bracket, rating, seed);
      if (!comp) return { ok: false, reason: `No ${bracket}v${bracket} teams are authored yet` };
      const tier = comp.tier;
      const oppRating = compRating(comp);
      const decideMs = compDecideMs(comp);
      const team = factionOf(ds, state.char.race) === 'horde' ? 'horde' : 'alliance';
      const foe = team === 'horde' ? 'alliance' : 'horde';
      const enemies = arenaSeats(ds, state.char, comp, seed, {
        teamSize: bracket, tier, team: foe, otherFactionIfUnseatable: true,
      });
      if (enemies.length !== bracket) return { ok: false, reason: 'Could not seat that team' };
      const allies = opts?.allies ?? (state.squad ?? []).map((c) => c.id);
      const seats = buildFriendlySeats({
        ds, char: state.char, playerRole: state.squadRole ?? null,
        squad: state.squad ?? [], roster: state.botRoster ?? {},
        allies, team, teamSize: bracket, seed, consumes: false,
      });
      // Mercenaries already filled the team out to `bracket` (bgRoster.ts:251-256), so this is
      // bracket-1 bodies unless the bot pool came up short.
      const mates = seats.filter((s) => s.kind !== 'player' && s.comp).map((s) => s.comp!);
      if (mates.length !== bracket - 1) return { ok: false, reason: 'Your team could not be seated' };
      // Same gate-time pass the enemy team got inside `arenaSeats`, on your side this time: the
      // player takes the merged party buffs and each teammate its own keep-ups and coats.
      state.char = applyBgTeamPrebuffs({
        ds, now: Date.now(), playerLevel: state.char.level, seats,
        player: { char: state.char, spellbook: state.spellbook },
        playerBags: state.inventory,
        assignments: normalizePaladinAssignments(state.paladinAssignments),
        spendPlayerReagent: (item, count) => {
          state.inventory = removeItem(state.inventory, item, count)[0];
        },
      }) ?? state.char;
      prepArenaPlayer(state, ds);
      const mateSeats = mates.map((mate) => {
        const lvl = companionLevel(mate, state.char.level);
        const spec = companionSpec(mate, lvl, ds);
        spec.groupRole = mate.role === 'dps' ? 'damage' : mate.role;
        const rot = syncCompanionBagItemRules(
          companionRotationOf(mate, state.char.level, ds, undefined, { mode: 'pvp' }),
          companionCharacter(mate, lvl, ds),
          mate.bags,
          ds,
        );
        return {
          mate,
          spec,
          rot,
          pet: companionPetSpec(mate, state.char.level, ds),
        };
      });
      state.fightCounter += 1;
      const playerSpec = buildCombatant(state.char, state.spellbook, ds, state.inventory);
      stampPlayerFightKit(playerSpec, state, ds);
      // Pets on both sides, seated the way a BG seats them (bgScreen.ts:366-419): yours on side `pet`,
      // your team's and the comp's appended AFTER the humans so ally_0/enemy_0 stay index-aligned.
      const playerPet = buildPet(state.char, ds);
      const matePets = mateSeats
        .map((m) => m.pet).filter((p): p is NonNullable<typeof p> => p != null);
      const allyBodies = [...mateSeats.map((m) => m.spec), ...matePets];
      const foeBodies = [
        ...enemies.map((e) => e.spec),
        ...enemies.map((e) => e.pet).filter((p): p is NonNullable<typeof p> => p != null),
      ];
      // Same reason as arenaDuel above: no yards, no stage.
      const geo = seedDuelGeometry({
        player: playerSpec,
        enemySpecs: foeBodies,
        allySpecs: allyBodies,
        includePet: playerPet != null,
        spellOf: (id) => ds.spell(id),
      });
      const playerProvider = playerFightActionProvider(state, ds, ctx.opts);
      const session = createSession(
        playerSpec,
        foeBodies,
        mulberry32(seed),
        {
          // null per pet body: pets have no rotation section, so the pet heuristics drive them.
          enemyActionProviders: [
            ...enemies.map((e) => pacedActionProvider(e.provider, decideMs)),
            ...foeBodies.slice(enemies.length).map(() => null),
          ],
          allyActionProviders: [
            ...mateSeats.map((m) => companionActionProvider(m.rot, undefined, {
              companion: m.mate,
              isOocKeepUp: (id) => isCompanionKeepUpSpell(ds.spell(id)),
            })),
            ...matePets.map(() => null),
          ],
          ...(playerProvider ? { playerActionProvider: playerProvider } : {}),
          unitPositionsYd: geo.positions,
          geometryAnchor: geo.anchor,
          // The trinket every other PvP seat gets. An arena is not a duel session, so it needs its own.
          autoRescueItems: true,
          // A team match is not over when a seat falls, so it must not go QUIET when one does: the
          // `seedAttackStart` seed opens every foe on one body, and that body dying emptied every
          // threat list and stood the whole field down for the rest of the match.
          reacquireOnEmptyThreat: true,
        },
        playerPet,
        allyBodies,
      );
      log(`Arena ${bracket}v${bracket} at ${rating} with ${mates.map((m) => m.name).join(', ')} vs ${comp.name} (${oppRating}).`);
      return {
        ok: true,
        session,
        bracket,
        name: comp.name,
        compId: comp.id,
        rating,
        oppRating,
        opponents: enemies.map((e) => ({
          name: e.body.name,
          level: companionLevel(e.body, state.char.level),
          race: e.body.race,
          cls: e.body.cls,
          ...(e.body.gender != null ? { gender: e.body.gender } : {}),
          equipped: e.body.equipped,
        })),
        allies: mates.map((mate) => ({
          name: mate.name,
          race: mate.race,
          cls: mate.cls,
          ...(mate.gender != null ? { gender: mate.gender } : {}),
          equipped: mate.equipped,
        })),
      };
    },

    // The ladder half of a finished gauntlet duel. Honor is the caller's second call, in another
    // methods module, so composing it here would mean reaching for a half-built Game.
    settleArenaDuel(compId, won) {
      const rung = Math.max(0, Math.trunc(state.gauntletRung ?? 0));
      const next = gauntletRungAfter(rung, compId, won);
      if (next !== rung) {
        state.gauntletRung = next;
        log(`Gauntlet rung ${next} of ${gauntletLength()} beaten.`);
      }
      return { rung: next, of: gauntletLength(), advanced: next !== rung };
    },

    // The Elo half, and it runs on a LOSS too - that is the whole difference between a rating and
    // the rung above. `oppRating` is what the match handed back; a settle that only kept the comp id
    // (the BG screen) resolves it here instead.
    settleArenaRating(bracket, opponent, outcome) {
      const before = arenaRatingOf(state.arenaRating, bracket);
      const oppRating = typeof opponent === 'number'
        ? opponent
        : compRatingById(opponent);
      // No opponent rating means no expectation, so no Elo. Silent, and the rating is unchanged.
      if (oppRating == null) return { rating: before, before, delta: 0 };
      const after = ratingAfter(before, oppRating, outcome);
      state.arenaRating = { ...(state.arenaRating ?? {}), [bracket]: after };
      const delta = after - before;
      log(`Arena ${bracket}v${bracket} rating ${after} (${delta >= 0 ? '+' : ''}${delta}).`);
      return { rating: after, before, delta };
    },

    leaveBattleground() {
      const run = state.battleground;
      if (!run) return { ok: false, reason: 'You are not in a battleground' };
      state.battleground = null;
      log(`You leave ${BATTLEGROUNDS[run.bgId]?.name ?? 'the battleground'}.`);
      extras?.onOutfitterSync?.();
      return { ok: true };
    },
  };
}

// Same conjure the duelist seat already ran (arenaLab.ts seatHealthstones). A 1v1 spends the last
// shard on the stone rather than holding the raid reserve of 2.
function prepArenaPlayer(state: GameState, ds: DataStore): void {
  runPrePullHealthstones([
    stoneHolder({
      name: state.char.name,
      char: state.char,
      role: state.squadRole === 'tank' ? 'tank' : state.squadRole === 'healer' ? 'healer' : 'dps',
      specName: state.rotationSpec ?? null,
      knownSpellIds: state.spellbook.known,
      auraSpellIds: (state.char.activeAuras ?? []).map((a) => a.spellId),
      read: () => state.inventory,
      write: (inv) => { state.inventory = inv; },
    }),
  ], ds, state.char.name, { maxPerSupplier: 1, shardReserve: 0 });
}

// PvE pull copies bags into spec.items (combatSession.ts:732). Arena skipped that, so a bagged
// healthstone never reached session.items() and usableItem stayed false.
function stampPlayerFightKit(spec: CombatantSpec, state: GameState, ds: DataStore): void {
  spec.items = combatItems(state.char, state.inventory, ds);
  const bag = seedReagentBagCounts(spec.spells ?? [], (item) => countItem(state.inventory, item));
  if (bag) spec.bagItemCounts = bag;
}
