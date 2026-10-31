// World session surface: gossip, graveyard, events, innkeeper, pools, entrance yards, weather.
// Pattern C: createWorldSessionModule(ctx) — private sessionWeatherByZone. No import of game.ts.

import { mulberry32, hashSeed } from '../core/rng.ts';
import { factionOf } from '../../domain/character/races.ts';
import { isEventIdActive } from '../../domain/world/gameEvents.ts';
import {
  applyInnkeeperGossipSelect,
  buildInnkeeperGossipHello,
} from './scriptDevInnkeeper.ts';
import {
  TEAM_ALLIANCE,
  TEAM_HORDE,
  resolveClosestGraveyard,
} from '../../domain/run/death.ts';
import {
  resolveNpcGossip,
  indexGossipMenus,
  type NpcServiceHints,
  type GossipMenu,
} from '../../domain/quests/gossip.ts';
import { rollFromBakedPool, type BakedPoolRow } from '../../domain/world/pools.ts';
import {
  entranceYardForTrigger,
  entranceYardsForZone,
} from '../../domain/nav/travel.ts';
import {
  getWeather,
  seasonIndexFromDayOfYear,
  stepWeather,
  weatherRatesForZone,
  type WeatherState,
} from '../../domain/world/weather.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';

export function createWorldSessionModule(
  ctx: GameCtx,
): Pick<
  Game,
  | 'npcGossip'
  | 'closestGraveyard'
  | 'isGameEventActive'
  | 'innkeeperGossip'
  | 'selectInnkeeperGossip'
  | 'rollPoolGuid'
  | 'entranceYard'
  | 'weather'
  | 'stepZoneWeather'
> {
  const { ds, state, log } = ctx;

  // Session-only weather by Phonecraft zoneId. Not part of GameState / not saved.
  // Joined at step time via ZoneDef.areaId → DataBundle.zoneWeather.zone.
  const sessionWeatherByZone = new Map<string, WeatherState>();

  /** Lazy gossip menu index (baked rows → Map once). */
  let _gossipMenuIndex: Map<number, GossipMenu> | undefined;
  const gossipMenuIndex = (): Map<number, GossipMenu> => {
    if (!_gossipMenuIndex) _gossipMenuIndex = indexGossipMenus(ds.gossipMenus());
    return _gossipMenuIndex;
  };

  // Infer NPC service roles from zone lists + DataStore catalogs (no gossipMenuId bake). Only flags roles
  // that are real in the data — never invents.
  const npcServiceHints = (npcEntry: number): NpcServiceHints => {
    const zone = ds.zone(state.char.zoneId);
    const hints: NpcServiceHints = {};
    if (ds.vendor(npcEntry) || zone?.vendors?.includes(npcEntry)) hints.vendor = true;
    if (
      ds.trainer(npcEntry)
      || zone?.trainers?.some((t) => t.entry === npcEntry)
      || zone?.weaponTrainers?.includes(npcEntry)
      || zone?.petTrainers?.includes(npcEntry)
      || zone?.profTrainers?.includes(npcEntry)
      || zone?.ridingTrainers?.includes(npcEntry)
    ) {
      hints.trainer = true;
    }
    if (zone?.flightMasters?.some((f) => f.entry === npcEntry)) hints.taxi = true;
    if (zone?.innkeepers?.some((i) => i.entry === npcEntry)) hints.innkeeper = true;
    // Quest givers: zone quests whose starter/ender name matches this creature (bake has names, not entries).
    const npcName = ds.creature(npcEntry)?.name;
    if (npcName && zone?.quests?.length) {
      for (const qid of zone.quests) {
        const q = ds.quest(qid);
        if (!q) continue;
        if (q.starterName === npcName || q.enderName === npcName) {
          hints.questgiver = true;
          break;
        }
      }
    }
    return hints;
  };

  return {
    npcGossip(npcEntry, opts) {
      // Prefer the baked gossip menu when a menu id is supplied, else the service shortcuts. Condition
      // evaluation is permissive here; combat conditions use the full snapshot.
      return resolveNpcGossip(
        gossipMenuIndex(),
        opts?.menuId,
        npcServiceHints(npcEntry),
        () => true,
      );
    },

    closestGraveyard(pos) {
      const zone = ds.zone(state.char.zoneId);
      const areaId = zone?.areaId;
      if (areaId == null) return undefined;
      const team = factionOf(ds, state.char.race) === 'horde' ? TEAM_HORDE : TEAM_ALLIANCE;
      return resolveClosestGraveyard(ds.graveyards(), areaId, team, pos);
    },

    isGameEventActive(eventId, nowMs) {
      return isEventIdActive(ds.gameEvents(), eventId, nowMs ?? Date.now());
    },

    innkeeperGossip(nowMs = Date.now()) {
      // Cite: npcs_special.cpp:771-788; GameEventMgr IsHolidayActive HOLIDAY_HALLOWS_END.
      return buildInnkeeperGossipHello(state, ds, nowMs);
    },

    selectInnkeeperGossip(action, nowMs = Date.now()) {
      // Cite: npcs_special.cpp:791-811 GossipSelect_npc_innkeeper.
      const applied = applyInnkeeperGossipSelect(action | 0, state, ds, {
        nowMs,
        log,
      });
      if (!applied.handled) {
        return { ok: false as const, reason: 'Unhandled innkeeper gossip action' };
      }
      return {
        ok: true as const,
        phase: applied.phase,
        textId: applied.textId,
        castSpellId: applied.castSpellId,
        closeMenu: applied.closeMenu,
        flavor: applied.flavor,
      };
    },

    rollPoolGuid(poolId, spawned = []) {
      const row = ds.pools().find((p) => p.id === poolId) as BakedPoolRow | undefined;
      if (!row) return undefined;
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const pick = rollFromBakedPool(row, { spawned }, rng);
      return pick?.guid;
    },

    entranceYard(query) {
      const rows = ds.entranceYards();
      if ('trigger' in query) return entranceYardForTrigger(rows, query.trigger);
      return entranceYardsForZone(rows, query.zone);
    },

    weather(opts) {
      const zoneId = opts?.zoneId ?? state.char.zoneId;
      return getWeather(sessionWeatherByZone, zoneId);
    },

    stepZoneWeather(opts) {
      const zoneId = opts?.zoneId ?? state.char.zoneId;
      const zone = ds.zone(zoneId);
      // No areaId / no bake row → empty seasons → stepWeather forces FINE.
      const rates = zone
        ? weatherRatesForZone(zone, ds.zoneWeather())
        : undefined;
      const zoneRates = rates ?? { seasons: [] as const };
      // Injected yday → season; omit → season 0 (spring rates) for tests / default.
      const season =
        opts?.dayOfYear != null ? seasonIndexFromDayOfYear(opts.dayOfYear) : 0;
      const prev = getWeather(sessionWeatherByZone, zoneId);
      // fightCounter advances per step so successive regenerations re-seed (LOCK 4).
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const next = stepWeather(prev, zoneRates, rng, season);
      sessionWeatherByZone.set(zoneId, next);
      return next;
    },
  };
}
