// Peeled from liveDungeonController (S13) — gauntlet/escort — waves, eggs, Mograine, escorts, ally release, Finkle.
// The live controller context, as much of it as this module reads; tuiFloor.mjs builds one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiveDungeonCtx = any;
import type { EncounterDef } from '../data/schema.ts';
import {
  applyEncounterCleared,
  isCleared,
  floorGauntletWaves,
  hasFlag,
  requiredFlags,
  setFlag,
} from '../world/instances.ts';
const sound = { clip: (_name: string): void => {} };
import { mulberry32 } from '../engine/core/rng.ts';
import {
  BRD_GORSHAK_JAIL,
  BRD_RIBBLY,
  BRD_RING_OF_LAW,
  materializeRingOfLawEncounter,
  ringOfLawAttemptSeed,
} from '../data/dungeons/blackrock-depths.ts';
import {
  UBRS_BEAST,
  UBRS_EMBERSEER,
  UBRS_ROOKERY_EGGS,
  UBRS_SOLAKAR,
  UBRS_STADIUM,
  finkleMaySpawn,
  solakarStartBlockedByDrakkisath,
  ubrsNearestFreeEgg,
} from '../data/dungeons/ubrs.ts';
import { LBRS_UROK } from '../data/dungeons/lbrs.ts';
import { STRATH_BLACK_GUARD } from '../data/dungeons/stratholme-undead.ts';
import { DM_EAST_PUSILLIN_CHASE, dmEastPusillinCanFight } from '../data/dungeons/dire-maul-east.ts';
import {
  SCHOLO_GANDLING,
  SCHOLO_KIRTONOS,
} from '../data/dungeons/scholomance.ts';
import {
  ZF_BLY,
  ZF_PYRAMID,
} from '../data/dungeons/zul-farrak.ts';
import { RAJAXX_ARMY } from '../data/dungeons/ruins-of-ahnqiraj.ts';
import {
  SM_MOGRAINE_WHITEMANE,
  canScarletResurrect,
  wipeResetPair,
} from '../data/dungeons/sm-cathedral.ts';
import {
  MARAUDON_CELEBRAS_RITUAL,
  maraCelebrasCompleteRitual,
  maraCelebrasRitualActive,
} from '../data/dungeons/maraudon.ts';
import {
  WILLIX_AMBUSH,
  willixAmbushSpawns,
} from '../data/dungeons/razorfen-kraul.ts';
const esc = (s: string): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
import { canAttackCreature } from '../domain/creature/faction.ts';
import { findPathForMap, WALK_MAX_VISITED } from '../domain/nav/nav.ts';
import {
  partyDistTo,
  sameStoreyAsParty,
  placeFloorBody,
  removeFloorEntities,
  spawnGauntletWave,
  summonedBodyGuid,
} from '../world/continuousDungeon.ts';
import { getQuest } from '../domain/quests/questlog.ts';
import {
  escortDefForQuest,
  escortDefs,
  failEscort,
  startEscort,
  tickEscort,
  type EscortDef,
  type EscortWaypoint,
} from '../world/escort.ts';
type LiveRouteEditNode = unknown;

type RouteEditNode = LiveRouteEditNode;
type ReachPt = { x: number; y: number; z?: number };

export const GAUNTLET_START_YD = 50;

export type GauntletEscortApi = Record<string, unknown>;

export function installGauntletEscort(ctx: LiveDungeonCtx): GauntletEscortApi {
    // ---- Floor gauntlet: authored `waves` run on the live floor -------------------
    // Flag-gated chains (Ring of Law, Mutanus, Gandling…) arm when their flags are
    // satisfied and START when the party stands at the arm point (ring: arena centre /
    // at_ring_of_law, blackrock_depths.cpp:211 + h:162; else enc.origin). Ungated chains
    // with hostile / bodyless primaries (Grubbis, Mograine, Belnistrasz, Gyth, Fenrus)
    // arm the same way. Ungated + standing non-hostile primary (Doom'rel) stays on the
    // gossip-challenge path: startChallengeGauntletAt gated on targetEncounterId.
    /**
     * Per-transition after calling wave `calledIdx` (0-based).
     * `clearAdvances`: when true, a fully-dead wave skips remaining fromCallMs
     * (Stadium clear-OR-60s). Default false = pure ctx.schedule(Solakar / Gor'shak).
     */
    type GauntletTransition = {
      fromCallMs?: number;
      fromClearMs?: number;
      clearAdvances?: boolean;
    };
    const gauntletTransition = (encId: string, calledIdx: number, waveCount: number): GauntletTransition | null => {
      if (calledIdx + 1 >= waveCount) return null;
      // instance_blackrock_depths.cpp DoCallNextDwarf: m_uiDwarfFightTimer = 30000 (:591).
      if (encId === 'doomrel') return { fromCallMs: 30_000 };
      if (encId === 'ring-of-law') {
        // wave1→wave2 only — blackrock_depths.cpp:459-460 m_uiEventTimer = 16000.
        if (calledIdx === 0) return { fromCallMs: BRD_RING_OF_LAW.mobWaveGapMs };
        // last mob wave→boss from death — blackrock_depths.cpp:318-319 m_uiEventTimer = 5000.
        if (calledIdx === 1) return { fromClearMs: BRD_RING_OF_LAW.bossAfterClearMs };
      }
      // dbscripts_on_quest_start 3982: wave1 @ 3s, wave2 @ 45s → gap 42s after wave1 call.
      if (encId === 'gorshak-jail' && calledIdx === 0) {
        return { fromCallMs: BRD_GORSHAK_JAIL.waveGapMs };
      }
      // instance_blackrock_spire.cpp:701-706 — 30s after waves 0–3, 40s after 4–5.
      if (encId === 'solakar-flamewreath') {
        if (calledIdx < UBRS_SOLAKAR.earlyWaveCount) {
          return { fromCallMs: UBRS_SOLAKAR.waveGapEarlyMs };
        }
        // calledIdx 4–5 → late gap; after Solakar (calledIdx 6) transition is null via waveCount.
        return { fromCallMs: UBRS_SOLAKAR.waveGapLateMs };
      }
      // instance_blackrock_spire.cpp:668-672 + :436-438 — 60s OR clear, add waves only.
      if (encId === 'gyth-rend') {
        if (calledIdx + 1 < UBRS_STADIUM.addWaveCount) {
          return { fromCallMs: UBRS_STADIUM.waveOrClearMs, clearAdvances: true };
        }
        // Last add → Gyth: clear only (timer stops when m_uiStadiumWaves >= MAX).
        return null;
      }
      // dbscripts_on_event 4845 — pure from-call gaps after waves 0–4 (5/13/28/42/58 → 66s).
      if (encId === LBRS_UROK.encId) {
        const gap = LBRS_UROK.waveGapsMs[calledIdx];
        if (gap != null) return { fromCallMs: gap };
        return null;
      }
      // boss_darkmaster_gandling.cpp:57/106 + dbScripts.event delay 2000 —
      // portal rooms (waves 0–5) pure from-call 20s min; last portal → Gandling on clear.
      if (encId === SCHOLO_GANDLING.encId) {
        if (calledIdx < 5) return { fromCallMs: SCHOLO_GANDLING.portalRepeatMinMs };
        return null; // last portal → Gandling when room clears
      }
      // stratholme.cpp:1212 mindless every 400ms (packs of 5 → packGapMs);
      // :718 60s after all mindless dead before Black Guards walk out.
      if (encId === STRATH_BLACK_GUARD.encId) {
        if (calledIdx + 1 < STRATH_BLACK_GUARD.mindlessWaveCount) {
          return { fromCallMs: STRATH_BLACK_GUARD.packGapMs };
        }
        if (calledIdx + 1 === STRATH_BLACK_GUARD.mindlessWaveCount) {
          return { fromClearMs: STRATH_BLACK_GUARD.blackGuardAfterClearMs };
        }
        return null;
      }
      // dbscripts_on_event 2609 — pure from-call gaps after waves 0–1 (10/100/250s).
      // Clear does NOT advance early (instance timer is absolute from unlock).
      if (encId === ZF_PYRAMID.encId) {
        const gap = ZF_PYRAMID.waveGapsMs[calledIdx];
        if (gap != null) return { fromCallMs: gap };
        return null;
      }
      // ruins_of_ahnqiraj.cpp:310/:370 m_armyDelayTimer = 3*MINUTE; clear does not advance.
      if (encId === RAJAXX_ARMY.encId) return { fromCallMs: RAJAXX_ARMY.waveGapMs };
      // Mograine/Whitemane: wave0→1 on clear (fake death); wave1→2 is HP-gated
      // Scarlet Resurrection inject (tickGauntlet tryMograineWhitemaneRes), not schedule.
      // Cite: boss_mograine_and_whitemane.cpp Deep Sleep L475–496 + HandleResurrection.
      if (encId === SM_MOGRAINE_WHITEMANE.encId) {
        return null;
      }
      return null;
    };
    // GAUNTLET_START_YD exported at module scope
    type FloorGauntlet = {
      encId: string;
      /** Materialized encounter (ring rolls); id-keyed lookups still use encId. */
      enc: EncounterDef;
      waves: { entry: number; count: number }[][];
      /** Optional per-wave spawn (ring POS_EAST / POS_NORTH); else enc.origin. */
      waveSpawns?: ({ x: number; y: number; z?: number } | undefined)[];
      /** Next wave index to call. */
      idx: number;
      /** Guids of every called wave member. */
      spawned: number[];
      // Solakar egg layer — hatcher-present clock (cpp:923/936/939). Armed when the first Hatcher wave is
      // called; null = no hatchers yet.
      rookeryHatcherSinceMs?: number | null;
      /** How many egg-hatch ticks have fired this gauntlet. */
      rookeryHatchesDone?: number;
      /** Undo for claimed standing bodies: guid → npcFlags before the claim. */
      claimedPrev: Map<number, number>;
      /** Auto-call deadline while the current wave still stands (tomb 30s, ring wave1→2 16s). */
      nextCallAtMs: number | null;
      /** Post-clear delay for the transition out of the wave just called (ring boss 5s). */
      clearDelayMs: number | null;
      /** runElapsedMs when clear delay elapses; set on first all-dead tick. */
      clearReadyAtMs: number | null;
      /** When true, all-dead skips remaining nextCallAtMs (Stadium clear-OR-timer). */
      clearAdvances: boolean;
    };
  
    const callGauntletWave = (): void => {
      if (!ctx.gauntlet) return;
      const enc = ctx.gauntlet.enc;
      const wave = ctx.gauntlet.waves[ctx.gauntlet.idx];
      if (!wave) return;
      const isFinal = ctx.gauntlet.idx === ctx.gauntlet.waves.length - 1;
      // Solakar: always rookeryEventSpawnPos (cpp:99) even if room-snap origin drifts.
      const spawnAt = ctx.gauntlet.waveSpawns?.[ctx.gauntlet.idx]
        ?? (enc.id === 'solakar-flamewreath' ? UBRS_SOLAKAR.spawn : undefined);
      const res = spawnGauntletWave(
        ctx.continuous, enc, wave, ctx.gauntlet.idx, isFinal, spawnAt,
        enc.id === RAJAXX_ARMY.encId ? RAJAXX_ARMY.claimMaxYd : undefined,
      );
      const calledIdx = ctx.gauntlet.idx;
      ctx.gauntlet.idx += 1;
      // Arm rookery egg clock on first wave that includes a Hatcher (cpp:923).
      if (enc.id === 'solakar-flamewreath' && ctx.gauntlet.rookeryHatcherSinceMs == null) {
        const hasHatcher = wave.some((m) => m.entry === UBRS_ROOKERY_EGGS.hatcherEntry);
        if (hasHatcher) {
          ctx.gauntlet.rookeryHatcherSinceMs = ctx.runElapsedMs;
          ctx.gauntlet.rookeryHatchesDone = 0;
        }
      }
      const trans = gauntletTransition(enc.id, calledIdx, ctx.gauntlet.waves.length);
      ctx.gauntlet.nextCallAtMs =
        trans?.fromCallMs != null ? ctx.runElapsedMs + trans.fromCallMs : null;
      ctx.gauntlet.clearDelayMs = trans?.fromClearMs ?? null;
      ctx.gauntlet.clearReadyAtMs = null;
      ctx.gauntlet.clearAdvances = !!trans?.clearAdvances;
      ctx.stampTemplates(res.created);
      for (const e of res.claimed) {
        ctx.gauntlet.claimedPrev.set(e.guid, e.npcFlags);
        e.npcFlags = 0;
      }
      const joined: typeof ctx.continuous.entities = [];
      for (const e of [...res.created, ...res.claimed]) {
        e.hostile = true; // event actor — attacks regardless of template reaction
        ctx.gauntlet.spawned.push(e.guid);
        if (e.state === 'alive') joined.push(e);
      }
      if (joined.length) {
        const names = [...new Set(joined.map((e) => ctx.ds.creature(e.entry)?.name ?? `entry ${e.entry}`))];
        ctx.pushFeed(`<span class="tw-auto-ev"><b>${esc(names.join(', '))}</b> ${joined.length > 1 ? 'join the fight' : 'joins the fight'}</span>`);
        ctx.aggroFloorEntities(joined, { ignoreAcquire: true });
      }
      ctx.saveFloorState();
    };
  
    /**
     * Rookery Hatchers disturb eggs → Rookery Whelp 10161.
     * Cite: instance_blackrock_spire.cpp:946-970 nearest unused GO_ROOKERY_EGG within 20 yd
     * of that Hatcher; one egg is one whelp, spawned at the egg. No egg → no whelp.
     * Shared consume with step-on (`go-used:<guid>`). Out of combat: cpp:977 returns early.
     */
    const tickRookeryEggs = (): void => {
      if (!ctx.gauntlet || ctx.gauntlet.encId !== 'solakar-flamewreath') return;
      const since = ctx.gauntlet.rookeryHatcherSinceMs;
      if (since == null) return;
      const run = ctx.game.state.instance;
      if (!run) return;
      const due = ctx.gauntlet.rookeryHatcherDueMs ?? (ctx.gauntlet.rookeryHatcherDueMs = new Map());
      const hatched = (guid: number) => hasFlag(ctx.game.state.instance!, `go-used:${guid}`);
      const inCombat = ctx.inActiveFight();
      const created: typeof ctx.continuous.entities = [];
      let done = ctx.gauntlet.rookeryHatchesDone ?? 0;
      for (const g of ctx.gauntlet.spawned) {
        const e = ctx.continuous.entities.find((x) => x.guid === g);
        if (!e || e.entry !== UBRS_ROOKERY_EGGS.hatcherEntry || e.state !== 'alive') continue;
        if (!inCombat && !ctx.continuous.engagedGuids.includes(e.guid)) continue;
        if (!due.has(g)) due.set(g, since + UBRS_ROOKERY_EGGS.firstHatchAfterCallMs);
        if (ctx.runElapsedMs < due.get(g)!) continue;
        const egg = ubrsNearestFreeEgg(hatched, e);
        if (!egg) continue;
        ctx.game.state.instance = setFlag(ctx.game.state.instance!, `go-used:${egg.guid}`);
        due.set(g, ctx.runElapsedMs + UBRS_ROOKERY_EGGS.nextHatchMs);
        const guid = summonedBodyGuid(`solakar-egg#${egg.guid}`);
        if (ctx.continuous.entities.some((x) => x.guid === guid)) continue;
        const ent = {
          guid,
          entry: UBRS_ROOKERY_EGGS.whelpEntry,
          x: egg.x,
          y: egg.y,
          z: egg.z ?? e.z,
          state: 'alive' as const,
          detectionRange: 18,
          level: 18,
          movementType: 0,
          npcFlags: 0,
          hostile: true,
        };
        ctx.continuous.entities.push(ent);
        created.push(ent);
        ctx.gauntlet.spawned.push(guid);
        done += 1;
      }
      ctx.gauntlet.rookeryHatchesDone = done;
      if (created.length) {
        ctx.stampTemplates(created);
        ctx.pushFeed(
          `<span class="tw-auto-ev"><b>Rookery Whelps</b> hatch from disturbed eggs `
          + `(${UBRS_ROOKERY_EGGS.disturbSpellId})!</span>`,
        );
        ctx.aggroFloorEntities(created, { ignoreAcquire: true });
        ctx.saveFloorState();
      }
    };
  
    const startGauntlet = (enc: EncounterDef): boolean => {
      const run = ctx.game.state.instance;
      if (ctx.gauntlet || !run || ctx.stopped || isCleared(run, enc.id)) return false;
      // instance_blackrock_spire.cpp:774-778 — Drakkisath DONE permanently locks rookery.
      if (enc.id === 'solakar-flamewreath' && solakarStartBlockedByDrakkisath(run.flags ?? [])) {
        return false;
      }
      // Sticky per-attempt rolls (LOCK 4 — same seed as beginEncounter via ringOfLawAttemptSeed).
      const rng = mulberry32(ringOfLawAttemptSeed(enc.id, ctx.continuous.clearedGuids.length));
      const mat = materializeRingOfLawEncounter(enc, () => rng.next());
      const waves = floorGauntletWaves(mat);
      if (!waves?.length) return false;
      // Ring: mobs POS_EAST, boss POS_NORTH — blackrock_depths.cpp:191-192, :459/:502.
      const waveSpawns = enc.id === 'ring-of-law'
        ? [BRD_RING_OF_LAW.mobSpawn, BRD_RING_OF_LAW.mobSpawn, BRD_RING_OF_LAW.bossSpawn]
        : enc.id === 'gyth-rend'
          ? [
              ...Array.from({ length: UBRS_STADIUM.addWaveCount }, () => UBRS_STADIUM.waveSpawn),
              UBRS_STADIUM.gythSpawn,
            ]
          : undefined;
      // Gor'shak: delay first wave 3s (dbscripts_on_quest_start 3982 delay 3000).
      // Emberseer: delay boss spawn growFullMs (spell 16048 duration / 20×3s stacks).
      // Black Guard: first mindless after 500ms (stratholme.cpp:312).
      // Urok: first wave at 5s (dbscripts_on_event 4845 delay 5000).
      const delayFirstMs = enc.id === 'gorshak-jail'
        ? BRD_GORSHAK_JAIL.wave1AtMs
        : enc.id === 'pyroguard-emberseer'
          ? UBRS_EMBERSEER.growFullMs
          : enc.id === STRATH_BLACK_GUARD.encId
            ? STRATH_BLACK_GUARD.firstMindlessMs
            : enc.id === LBRS_UROK.encId
              ? LBRS_UROK.firstWaveAtMs
              // dbscripts_on_go_use brazier 175564 delay 5000 → Kirtonos.
              : enc.id === SCHOLO_KIRTONOS.encId
                ? SCHOLO_KIRTONOS.firstWaveAtMs
                // first portal guardians @ cast 16s + DB 2s (cpp:57 + dbScripts delay).
                : enc.id === SCHOLO_GANDLING.encId
                  ? SCHOLO_GANDLING.firstPortalGuardiansAtMs
                  // dbscripts_on_event 2609 delay 10000 → pyramid wave 1.
                  : enc.id === ZF_PYRAMID.encId
                    ? ZF_PYRAMID.firstWaveAtMs
                    : 0;
      ctx.gauntlet = {
        encId: enc.id,
        enc: mat,
        waves,
        waveSpawns,
        idx: 0,
        spawned: [],
        claimedPrev: new Map(),
        nextCallAtMs: delayFirstMs > 0 ? ctx.runElapsedMs + delayFirstMs : null,
        clearDelayMs: null,
        clearReadyAtMs: null,
        clearAdvances: false,
        rookeryHatcherSinceMs: null,
        rookeryHatchesDone: 0,
        rookeryHatcherDueMs: new Map(),
      };
      ctx.pushFeed(`<span class="tw-auto-ev"><b>${esc(enc.name)}</b> - the event begins</span>`);
      if (delayFirstMs <= 0) callGauntletWave();
      return true;
    };
  
    ctx.startGauntlet = startGauntlet;
    /** Quest 3982 accept (or active log) starts the jail defense gauntlet. */
    const tryStartGorshakJail = (): boolean => {
      const run = ctx.game.state.instance;
      if (!run || ctx.stopped || ctx.gauntlet) return false;
      if (isCleared(run, 'gorshak-jail')) return false;
      const st = getQuest(ctx.game.state.questlog, BRD_GORSHAK_JAIL.questId);
      if (!st || st.status === 'turnedIn' || st.explored === true) return false;
      const enc = ctx.def.encounters.find((e) => e.id === 'gorshak-jail');
      if (!enc || !floorGauntletWaves(enc)) return false;
      return startGauntlet(enc);
    };
  
    const gauntletSpawnedDead = (): boolean => {
      if (!ctx.gauntlet) return false;
      // [].every is true — empty spawned after a failed first call then dumped every
      // remaining stadium wave in one tick (T3 one-shots wave 0, clearAdvances fires 1..7).
      if (!ctx.gauntlet.spawned.length) return false;
      return ctx.gauntlet.spawned.every((g) => {
        const e = ctx.continuous.entities.find((x) => x.guid === g);
        return !e || e.state === 'dead';
      });
    };
  
    ctx.tickGauntlet = (): void => {
      const run = ctx.game.state.instance;
      if (!run || ctx.stopped) return;
      if (!ctx.gauntlet) {
        if (ctx.runElapsedMs - ctx.lastGauntletScanMs < 1_500) return;
        ctx.lastGauntletScanMs = ctx.runElapsedMs;
        for (const enc of ctx.def.encounters) {
          if (isCleared(run, enc.id)) continue;
          const need = requiredFlags(enc);
          // Flag-gated chains still wait for flags; ungated chains may arm too.
          if (need.some((f) => !hasFlag(run, f))) continue;
          if (!floorGauntletWaves(enc)) continue;
          // Emberseer stands from mount (guid 2290394). Growing is liveFloorState, not a
          // gauntlet spawn — starting waves here synthesized a second 9816.
          if (enc.id === 'pyroguard-emberseer') continue;
          // Gor'shak: quest-accept only (dbscripts_on_quest_start 3982) — never walk-by.
          if (enc.id === 'gorshak-jail') {
            tryStartGorshakJail();
            continue;
          }
          // Ungated + standing non-hostile primary = gossip challenge (Doom'rel).
          // That path is startChallengeGauntletAt gated on targetEncounterId so walking
          // past never starts the tomb. Cite: boss_doomrel gossip → TYPE_TOMB_OF_SEVEN.
          if (!need.length) {
            const pe = enc.creatureEntry ?? 0;
            if (pe > 0 && ctx.continuous.entities.some((e) =>
              e.entry === pe && e.state === 'alive' && !e.hostile)) continue;
          }
          // Ring arms at arena centre (areatrigger), not POS_NORTH — blackrock_depths.h:162.
          // Stadium arms at AT 2026 (r=20), not aStadiumLocs[2] — a 50 yd centre circle
          // starts the gauntlet on a southern-edge drop (trashbot.md / cpp:808-823).
          const arm = enc.id === 'ring-of-law' ? BRD_RING_OF_LAW.arenaCenter
            : enc.id === 'gyth-rend' ? UBRS_STADIUM.at2026
            : enc.origin;
          if (!arm || !Number.isFinite(arm.x)) continue;
          const armZ = enc.id === 'ring-of-law' ? BRD_RING_OF_LAW.mobSpawn.z : arm.z;
          const armYd = enc.id === 'gyth-rend' ? UBRS_STADIUM.at2026.radius : GAUNTLET_START_YD;
          if (enc.id === 'ring-of-law' && !sameStoreyAsParty(ctx.continuous, armZ)) continue;
          if (enc.id === 'gyth-rend' && !sameStoreyAsParty(ctx.continuous, armZ)) continue;
          if (partyDistTo(ctx.continuous, arm.x, arm.y, armZ) > armYd) continue;
          // Bare primary from spawnUnlockedBodies blocks final-wave credit guid.
          // Also strip flag-gated leftovers (Kirtonos used to abort here and stay unfightable).
          const g = summonedBodyGuid(enc.id);
          if (ctx.continuous.entities.some((e) => e.guid === g)) {
            // Through the world writer: a hand-replaced `entities` leaves `nearIndexed`
            // counting a body that is gone, which strands it in the near grid and skips the
            // next appends. Cite: continuousDungeon.ts removeFloorEntities; E1.2.
            removeFloorEntities(ctx.continuous, (e) => e.guid !== g);
            ctx.continuous.clearedGuids = ctx.continuous.clearedGuids.filter((x) => x !== g);
          }
          if (startGauntlet(enc)) return;
        }
        return;
      }
      if (ctx.gauntlet.idx >= ctx.gauntlet.waves.length) {
        if (gauntletSpawnedDead()) ctx.gauntlet = null; // credit lands via the route loop
        return;
      }
      // Whitemane ≤50% → Scarlet Resurrection Mograine inject (mid-fight concurrent).
      if (tryMograineWhitemaneRes()) return;
      // Solakar hatchers → continuous egg whelps (cpp:923/936/939).
      tickRookeryEggs();
      if (gauntletSpawnedDead()) {
        // Pure ctx.schedule(tomb 30s, solakar 30/40s, gorshak 42s, emberseer grow): wait the
        // full fromCall even if the current wave died early. Stadium clearAdvances skips
        // that wait so clear-OR-60s matches instance_blackrock_spire.cpp:436-438.
        if (
          !ctx.gauntlet.clearAdvances
          && ctx.gauntlet.nextCallAtMs != null
          && ctx.runElapsedMs < ctx.gauntlet.nextCallAtMs
        ) return;
        // Ring boss: wait clearDelayMs from last death (cpp:318-319); else immediate.
        if (ctx.gauntlet.clearDelayMs != null && ctx.gauntlet.clearDelayMs > 0) {
          if (ctx.gauntlet.clearReadyAtMs == null) {
            ctx.gauntlet.clearReadyAtMs = ctx.runElapsedMs + ctx.gauntlet.clearDelayMs;
          }
          if (ctx.runElapsedMs >= ctx.gauntlet.clearReadyAtMs) callGauntletWave();
          return;
        }
        callGauntletWave();
        return;
      }
      if (ctx.gauntlet.nextCallAtMs != null && ctx.runElapsedMs >= ctx.gauntlet.nextCallAtMs) {
        callGauntletWave();
      }
    };
  
    /**
     * Arriving at an explicitly TARGETED boss whose body stands non-hostile:
     * - waves authored (Doom'rel) → the gossip challenge, run the gauntlet;
     * - plain neutral named (Ribbly, Plugger, Bly after pyramid) → attack-to-start, flip + engage.
     * Gated on targetEncounterId so walking PAST the bar never starts a fight.
     * Flag-gated non-wave bosses (Bly) unlock when requiresFlag is satisfied.
     * Cite: dbscripts_on_gossip 94101 → faction 14 @ +6s (ZF_BLY); boss_doomrel gossip.
     */
    const startChallengeGauntletAt = (): boolean => {
      const run = ctx.game.state.instance;
      if (!run || !ctx.targetEncounterId) return false;
      const enc = ctx.def.encounters.find((e) => e.id === ctx.targetEncounterId);
      if (!enc || enc.kind !== 'boss' || isCleared(run, enc.id)) return false;
      // Pusillin: gossip chase only — never challenge-flip before 5th stop.
      // Cite: dbscripts_on_gossip 570905 sets faction 90; earlier stages keep gossip.
      if (
        ctx.def.id === 'dire-maul-east'
        && enc.id === DM_EAST_PUSILLIN_CHASE.encId
        && !dmEastPusillinCanFight(run.flags ?? [])
      ) return false;
      const need = requiredFlags(enc);
      if (need.some((f) => !hasFlag(run, f))) return false;
      // Flag-gated wave chains arm on walk-in (tickGauntlet), not challenge gossip.
      if (need.length && floorGauntletWaves(enc)) return false;
      const primaryGuids = ctx.guidsForFloorEncounter(enc);
      const primary = ctx.continuous.entities.find((e) =>
        primaryGuids.includes(e.guid) && e.state === 'alive' && !e.hostile);
      if (!primary || partyDistTo(ctx.continuous, primary.x, primary.y, primary.z) > 12) return false;
      if (floorGauntletWaves(enc)) return !ctx.gauntlet && startGauntlet(enc);
      // Friendly-to-all templates can never be flipped (Unit::CanAttack — reaction < FRIENDLY), except
      // where a gossip script sets the faction: Bly 7604 (94101) and Ribbly 9543 (197001).
      if (
        enc.id !== ZF_BLY.encId
        && enc.id !== BRD_RIBBLY.encId
        && !canAttackCreature(ctx.ds, ctx.game.state.char.race, primary.entry)
      ) return false;
      primary.hostile = true;
      primary.npcFlags = 0;
      // Bly crew ride-along (Raven/Oro/Murta) — dbscripts 94101 sets faction 14 on all four.
      if (enc.id === ZF_BLY.encId) {
        for (const e of ctx.continuous.entities) {
          if (e.state !== 'alive') continue;
          if (!(ZF_BLY.crewEntries as readonly number[]).includes(e.entry)) continue;
          e.hostile = true;
          e.npcFlags = 0;
        }
      }
      // Ribbly's three cronies turn with him — 197001 names them by guid (data_flags 16).
      if (enc.id === BRD_RIBBLY.encId) {
        for (const e of ctx.continuous.entities) {
          if (e.state !== 'alive') continue;
          if (!(BRD_RIBBLY.cronyGuids as readonly number[]).includes(e.guid)) continue;
          e.hostile = true;
          e.npcFlags = 0;
        }
      }
      return ctx.aggroFloorEntities([primary]);
    };
  
    /**
     * Wipe: the event FAILS. Synthesized actors despawn (their guids scrubbed from
     * clear credit so a retry respawns them); claimed ghosts stand back down.
     * Cite: instance_blackrock_depths.cpp SetData FAIL → respawn all seven, round 0.
     * SM cathedral: instance_scarlet_monastery.cpp FAIL → SetRespawnDelay(30) pair
     * re-arm — wipeResetPair; never permanently dead (probe negative).
     */
    const resetGauntletOnWipe = (): void => {
      if (!ctx.gauntlet) return;
      if (ctx.gauntlet.encId === SM_MOGRAINE_WHITEMANE.encId) {
        const mogAlive = ctx.gauntlet.spawned.some((g) => {
          const e = ctx.continuous.entities.find((x) => x.guid === g);
          return e?.entry === SM_MOGRAINE_WHITEMANE.mograineEntry && e.state !== 'dead';
        });
        const whiAlive = ctx.gauntlet.spawned.some((g) => {
          const e = ctx.continuous.entities.find((x) => x.guid === g);
          return e?.entry === SM_MOGRAINE_WHITEMANE.whitemaneEntry && e.state !== 'dead';
        });
        const wr = wipeResetPair({ mograineAlive: mogAlive, whitemaneAlive: whiAlive });
        const delayS = wr.respawnDelayMs / 1000;
        ctx.pushFeed(
          `<span class="tw-auto-ev"><b>Mograine & Whitemane</b> - wipe (${wr.encounterState}`
          + `${delayS > 0 ? `, respawn ${delayS}s` : ''}). The pair is not permanently dead.</span>`,
        );
      }
      const created = new Set(ctx.gauntlet.spawned.filter((g) => !ctx.gauntlet!.claimedPrev.has(g)));
      // Same reason as the bare-primary drop above: the grid has to be rebuilt with the array.
      removeFloorEntities(ctx.continuous, (e) => !created.has(e.guid));
      ctx.continuous.clearedGuids = ctx.continuous.clearedGuids.filter((g) => !created.has(g));
      for (const [guid, npcFlags] of ctx.gauntlet.claimedPrev) {
        const e = ctx.continuous.entities.find((x) => x.guid === guid);
        if (e && e.state !== 'dead') {
          e.npcFlags = npcFlags;
          ctx.stampTemplates([e]); // reaction back from the template (tomb ghosts → friendly)
        }
      }
      ctx.gauntlet = null;
    };
  
    /**
     * Whitemane ≤50% → Deep Sleep + Scarlet Resurrection injects Mograine while she
     * still lives (wave 2). Negative: never if Mograine wave-0 is still alive.
     * Cite: boss_mograine_and_whitemane.cpp:475-496 / :423-443; canScarletResurrect.
     */
    const tryMograineWhitemaneRes = (): boolean => {
      if (!ctx.gauntlet || ctx.gauntlet.encId !== SM_MOGRAINE_WHITEMANE.encId) return false;
      // After wave0+wave1 called (idx===2), before final Mograine res inject (idx becomes 3).
      if (ctx.gauntlet.idx !== 2) return false;
  
      const mograineAlive = ctx.gauntlet.spawned.some((g) => {
        const e = ctx.continuous.entities.find((x) => x.guid === g);
        return !!e
          && e.entry === SM_MOGRAINE_WHITEMANE.mograineEntry
          && e.state !== 'dead';
      });
  
      // Resolve Whitemane HP% from the live session (fallback 100 if not engaged yet).
      let whitemaneHpPct = 100;
      let foundWhitemane = false;
      for (const g of ctx.gauntlet.spawned) {
        const e = ctx.continuous.entities.find((x) => x.guid === g);
        if (!e || e.entry !== SM_MOGRAINE_WHITEMANE.whitemaneEntry || e.state === 'dead') continue;
        foundWhitemane = true;
        const side = ctx.floorSideOfGuid(g);
        if (side && ctx.currentSession) {
          // One store read (E1.1). This scanned the view array for the seat, having already
          // stopped parsing the digits out of `enemy_3` to index by them.
          const v = ctx.currentSession.viewOfSide?.(side);
          if (v && v.maxHp > 0) {
            whitemaneHpPct = (100 * v.hp) / v.maxHp;
          }
        }
        break;
      }
      if (!foundWhitemane) return false;
  
      if (!canScarletResurrect({
        mograineAlive,
        whitemaneHpPct,
        alreadyResurrected: false, // idx===2 means final res wave not called yet
      })) return false;
  
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>High Inquisitor Whitemane</b> casts Deep Sleep `
        + `(${SM_MOGRAINE_WHITEMANE.spellDeepSleep}) and Scarlet Resurrection `
        + `(${SM_MOGRAINE_WHITEMANE.spellScarletResurrection})!</span>`,
      );
      callGauntletWave(); // final wave — Mograine inject; Whitemane stays in spawned
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>Scarlet Commander Mograine</b> rises - both fight together!</span>`,
      );
      return true;
    };
  
    /**
     * Boss death releases an allied boss: Emperor down → Princess Moira turns neutral
     * and evades; her encounter credits as "saved" so the run still completes. Killing
     * her FIRST (the loot run) still credits normally and skips the release.
     * Cite: boss_emperor_dagran_thaurissan.cpp:70-89 — SetFactionTemporary(FACTION_NEUTRAL
     * 734) + EnterEvadeMode on the Princess when the Emperor dies.
     */
    const RELEASE_ON_DEATH: Record<string, { allyEncId: string; feed: string }> = {
      'emperor-dagran-thaurissan': {
        allyEncId: 'princess-moira',
        feed: 'Princess Moira Bronzebeard turns neutral as the Emperor falls!',
      },
    };
    const standDownAlly = (allyEnc: EncounterDef): void => {
      for (const g of allyEnc.spawnGuids ?? []) {
        const e = ctx.continuous.entities.find((x) => x.guid === g);
        if (!e || e.state === 'dead') continue;
        const side = ctx.floorSideOfGuid(g);
        if (side && ctx.currentSession && typeof ctx.currentSession.disengageEnemySides === 'function') {
          ctx.currentSession.disengageEnemySides([side]);
          // Both directions, inside the un-bind.
          ctx.unbindFloorSide(side);
        }
        ctx.continuous.engagedGuids = ctx.continuous.engagedGuids.filter((x) => x !== g);
        e.state = 'alive';
        e.hostile = false;
        e.npcFlags = 2; // questgiver again — she ends The Royal Rescue / Fate of the Kingdom
      }
    };
    /**
     * Densify sparse escort polylines with map nav (Kernobee has 2 sourced endpoints;
     * Willix/Belnistrasz already have dense script_waypoint rows). Intermediate points
     * keep unique high point ids so credit/ambush hooks still match authored ids.
     * Cite: findPathForMap; never invent endpoints.
     */
    const densifyEscortDef = (
      base: EscortDef,
      start: { x: number; y: number; z?: number },
    ): EscortDef => {
      const anchors: EscortWaypoint[] = [
        { point: 0, x: start.x, y: start.y, z: start.z },
        ...base.waypoints,
      ];
      const dense: EscortWaypoint[] = [];
      let synth = 10_000;
      for (let i = 1; i < anchors.length; i++) {
        const a = anchors[i - 1]!;
        const b = anchors[i]!;
        const segYd = Math.hypot(b.x - a.x, b.y - a.y);
        // Only path-expand long gaps (sparse follower routes). Dense WPs stay as authored.
        if (segYd > 20) {
          const via = findPathForMap(
            ctx.def.mapId,
            { x: a.x, y: a.y, z: a.z },
            { x: b.x, y: b.y, z: b.z },
            undefined,
            { maxVisited: WALK_MAX_VISITED },
          );
          if (via && via.length > 2) {
            for (let j = 1; j < via.length - 1; j++) {
              const p = via[j]!;
              dense.push({ point: synth++, x: p.x, y: p.y, z: p.z ?? b.z });
            }
          }
        }
        dense.push(b);
      }
      if (dense.length <= base.waypoints.length) return base;
      return { ...base, waypoints: dense };
    };
  
    /**
     * Lane F5: when an escort quest is accepted (or already in log at mount), start the
     * authored waypoint run for that NPC. Pure path in escort.ts; here we mirror pose +
     * densify sparse routes + credit via finishEscort (recordEventHappens).
     */
    const tryStartFloorEscort = (questId: number, preferGuid?: number): boolean => {
      if (ctx.floorEscort && (ctx.floorEscort.status === 'active' || ctx.floorEscort.status === 'paused')) {
        return false;
      }
      const eDef = escortDefForQuest(questId, ctx.def.mapId);
      if (!eDef || eDef.instanceId !== ctx.def.id) return false;
      // Prefer the NPC the player just talked to (multiple Kernobee spawns).
      let npc = preferGuid != null
        ? ctx.continuous.entities.find((e) => e.guid === preferGuid && e.entry === eDef.npcEntry)
        : undefined;
      if (!npc || npc.state === 'dead') {
        npc = ctx.continuous.entities.find(
          (e) => e.entry === eDef.npcEntry && e.state !== 'dead',
        );
      }
      if (!npc) return false;
      const start = { x: npc.x, y: npc.y, z: npc.z };
      const liveDef = densifyEscortDef(eDef, start);
      ctx.floorEscortDef = liveDef;
      ctx.floorEscort = startEscort({
        def: liveDef,
        npcGuid: npc.guid,
        start,
      });
      // Drop questgiver flag while escorting (ScriptDev clears UNIT_NPC_FLAG_QUESTGIVER
      // on accept; restored at credit WP). Cite: razorfen_kraul.cpp:148 + WP46 SetFlag.
      npc.npcFlags = 0;
      ctx.pushFeed(
        `<span class="tw-auto-ev">Escort started: <b>${esc(ctx.ds.quest(questId)?.title ?? String(questId))}</b></span>`,
      );
      return true;
    };
  
    /** Resume any active escort quest already in the log (re-mount / continue). */
    const resumeFloorEscortsFromLog = (): void => {
      for (const d of escortDefs()) {
        if (d.instanceId !== ctx.def.id || d.mapId !== ctx.def.mapId) continue;
        const st = getQuest(ctx.game.state.questlog, d.questId);
        if (!st || st.status === 'turnedIn') continue;
        // Already credited — no need to re-walk.
        if (st.explored === true) continue;
        if (tryStartFloorEscort(d.questId)) break;
      }
    };
  
    // Maraudon 7046 — finish Celebras RP after sourced path+wait budget. Cite: dbscripts_on_quest_start
    // 7046 + movement 1371601–03 → gossip restored.
    const tickCelebrasRitual = (): void => {
      if (ctx.celebrasRitualStartedAtMs == null || ctx.def.id !== 'maraudon') return;
      const run = ctx.game.state.instance;
      if (!run || !maraCelebrasRitualActive(run.flags ?? [])) {
        ctx.celebrasRitualStartedAtMs = null;
        return;
      }
      if (ctx.runElapsedMs - ctx.celebrasRitualStartedAtMs < MARAUDON_CELEBRAS_RITUAL.completeAfterMs) {
        return;
      }
      const next = maraCelebrasCompleteRitual(run.flags ?? []);
      if (!next) {
        ctx.celebrasRitualStartedAtMs = null;
        return;
      }
      ctx.game.state.instance = { ...run, flags: next };
      ctx.celebrasRitualStartedAtMs = null;
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>Celebras the Redeemed</b> says: "`
        + `${esc(MARAUDON_CELEBRAS_RITUAL.says.whole.text)}" - scepter ritual complete `
        + `(turn in quest ${MARAUDON_CELEBRAS_RITUAL.questId}).</span>`,
      );
      sound.clip('questcomplete');
      ctx.saveFloorState();
      ctx.persist();
    };
  
    const tickFloorEscort = (dtMs: number): void => {
      if (!ctx.floorEscort || ctx.stopped) return;
      if (ctx.floorEscort.status === 'done' || ctx.floorEscort.status === 'failed') return;
      const eDef = ctx.floorEscortDef ?? escortDefForQuest(ctx.floorEscort.questId, ctx.def.mapId);
      if (!eDef) return;
  
      // Abandon fails the escort. Cite: ScriptDev escort AI ends when quest is gone.
      const st = getQuest(ctx.game.state.questlog, ctx.floorEscort.questId);
      if (!st) {
        ctx.floorEscort = failEscort(ctx.floorEscort, 'abandoned');
        const ent = ctx.continuous.entities.find((e) => e.guid === ctx.floorEscort!.npcGuid);
        if (ent) ent.npcFlags = 2;
        ctx.pushFeed(`<span class="tw-auto-ev">Escort failed (quest abandoned)</span>`);
        sound.clip('questfailed');
        return;
      }
  
      ctx.partyWorldFromSession();
      const { run: next, events } = tickEscort(ctx.floorEscort, eDef, dtMs, {
        partyPos: { x: ctx.continuous.party.x, y: ctx.continuous.party.y },
      });
      ctx.floorEscort = next;
      const ent = ctx.continuous.entities.find((e) => e.guid === next.npcGuid);
      if (ent) {
        placeFloorBody(ctx.continuous, ent, next.x, next.y, next.z);
      }
      for (const ev of events) {
        if (ev.kind === 'ambush') {
          ctx.pushFeed(
            `<span class="tw-auto-ev">Escort ambush at waypoint ${ev.point}!</span>`,
          );
          // Willix WP15/45 → 2× Raging Agam'ar at aBoarSpawn. Cite: razorfen_kraul.cpp:104-120.
          if (
            ctx.def.id === 'razorfen-kraul'
            && (ev.point === 15 || ev.point === 45)
          ) {
            const spawns = willixAmbushSpawns(ev.point as 15 | 45);
            let n = 0;
            for (let i = 0; i < spawns.length; i++) {
              const s = spawns[i]!;
              const guid = summonedBodyGuid(`willix-ambush-${ev.point}.${i}`);
              if (ctx.continuous.entities.some((e) => e.guid === guid)) continue;
              ctx.continuous.entities.push({
                guid,
                entry: s.entry,
                x: s.x,
                y: s.y,
                z: s.z,
                state: 'alive',
                detectionRange: 20,
                level: 25,
                movementType: 0,
                npcFlags: 0,
                hostile: true,
              });
              n += 1;
            }
            if (n > 0) {
              ctx.pushFeed(
                `<span class="tw-auto-ev"><b>${n}× Raging Agam'ar</b> ambush Willix `
                + `(entry ${WILLIX_AMBUSH.entry})!</span>`,
              );
            }
          }
        } else if (ev.kind === 'credit') {
          const res = ctx.game.finishEscort(ev.questId);
          if (res.ok) {
            ctx.pushFeed(
              `<span class="tw-auto-ev">Escort complete: <b>${esc(ctx.ds.quest(ev.questId)?.title ?? String(ev.questId))}</b></span>`,
            );
            sound.clip('questcomplete');
          }
          // Restore questgiver for turn-in. Cite: razorfen_kraul.cpp:124 SetFlag QUESTGIVER.
          // Kernobee turns in to Scooty outside; flag restore is harmless.
          if (ent) ent.npcFlags = 2;
        } else if (ev.kind === 'paused') {
          // Quiet — player is out of range; no spam.
        } else if (ev.kind === 'done') {
          ctx.saveFloorState();
          ctx.persist();
        } else if (ev.kind === 'failed') {
          ctx.pushFeed(`<span class="tw-auto-ev">Escort failed</span>`);
          sound.clip('questfailed');
          if (ent) ent.npcFlags = 2;
        }
      }
    };
  
    const tickAllyRelease = (): void => {
      const run = ctx.game.state.instance;
      if (!run) return;
      for (const [bossId, rel] of Object.entries(RELEASE_ON_DEATH)) {
        if (ctx.releasedAllies.has(bossId)) continue;
        const bossEnc = ctx.def.encounters.find((e) => e.id === bossId);
        const allyEnc = ctx.def.encounters.find((e) => e.id === rel.allyEncId);
        if (!bossEnc || !allyEnc) {
          ctx.releasedAllies.add(bossId); // not this dungeon
          continue;
        }
        if (isCleared(run, rel.allyEncId)) {
          // Saved on a prior mount (or slain first): stand her down silently post-rebuild.
          standDownAlly(allyEnc);
          ctx.releasedAllies.add(bossId);
          continue;
        }
        const bossGuids = ctx.guidsForFloorEncounter(bossEnc);
        if (!bossGuids.length) continue;
        const session = ctx.currentSession;
        const bossDead = bossGuids.every((g) => {
          const e = ctx.continuous.entities.find((x) => x.guid === g);
          if (!e) return false;
          if (e.state === 'dead') return true;
          if (e.state === 'engaged') {
            const side = ctx.floorSideOfGuid(g);
            const v = side != null ? session?.viewOfSide?.(side) : undefined;
            return !!v && !(v.hp > 0);
          }
          return false;
        });
        if (!bossDead) continue;
        ctx.releasedAllies.add(bossId);
        standDownAlly(allyEnc);
        ctx.game.state.instance = applyEncounterCleared(ctx.game.state.instance!, allyEnc);
        ctx.pushFeed(`<span class="tw-auto-ev">${esc(rel.feed)}</span>`);
        ctx.saveFloorState();
        ctx.persist();
      }
    };
  
    // The Beast dead → Finkle Einhorn 10776 (spell 16710). Cite: instance_blackrock_spire.cpp
    // OnCreatureDespawn :488-491. Negative: never spawn unless beast is dead (finkleMaySpawn).
    const tickFinkleSpawn = (): void => {
      if (ctx.finkleSpawned || ctx.def.id !== 'ubrs') return;
      const run = ctx.game.state.instance;
      if (!run) return;
      const beastDead = isCleared(run, 'the-beast');
      if (!finkleMaySpawn(beastDead)) return;
      if (ctx.continuous.entities.some((e) => e.entry === UBRS_BEAST.finkleEntry && e.state !== 'dead')) {
        ctx.finkleSpawned = true;
        return;
      }
      const beastEnc = ctx.def.encounters.find((e) => e.id === 'the-beast');
      const o = beastEnc?.origin ?? UBRS_BEAST.introLocs[0]!;
      const guid = summonedBodyGuid('ubrs-finkle');
      if (ctx.continuous.entities.some((e) => e.guid === guid)) {
        ctx.finkleSpawned = true;
        return;
      }
      ctx.continuous.entities.push({
        guid,
        entry: UBRS_BEAST.finkleEntry,
        x: o.x,
        y: o.y,
        ...(o.z != null && Number.isFinite(o.z) ? { z: o.z } : {}),
        state: 'alive',
        detectionRange: 18,
        level: 60,
        movementType: 0,
        npcFlags: 1, // gossip — flavor NPC
        hostile: false,
      });
      ctx.finkleSpawned = true;
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>Finkle Einhorn</b> climbs out of the Beast `
        + `(spell ${UBRS_BEAST.finkleSpellId})!</span>`,
      );
      ctx.saveFloorState();
    };
  
  ctx.gauntletTransition = gauntletTransition;
  ctx.callGauntletWave = callGauntletWave;
  ctx.tickRookeryEggs = tickRookeryEggs;
  ctx.startGauntlet = startGauntlet;
  ctx.tryStartGorshakJail = tryStartGorshakJail;
  ctx.gauntletSpawnedDead = gauntletSpawnedDead;
  ctx.startChallengeGauntletAt = startChallengeGauntletAt;
  ctx.resetGauntletOnWipe = resetGauntletOnWipe;
  ctx.tryMograineWhitemaneRes = tryMograineWhitemaneRes;
  ctx.standDownAlly = standDownAlly;
  ctx.densifyEscortDef = densifyEscortDef;
  ctx.tryStartFloorEscort = tryStartFloorEscort;
  ctx.resumeFloorEscortsFromLog = resumeFloorEscortsFromLog;
  ctx.tickCelebrasRitual = tickCelebrasRitual;
  ctx.tickFloorEscort = tickFloorEscort;
  ctx.tickAllyRelease = tickAllyRelease;
  ctx.tickFinkleSpawn = tickFinkleSpawn;
  return { gauntletTransition, callGauntletWave, tickRookeryEggs, startGauntlet, tryStartGorshakJail, gauntletSpawnedDead, startChallengeGauntletAt, resetGauntletOnWipe, tryMograineWhitemaneRes, standDownAlly, densifyEscortDef, tryStartFloorEscort, resumeFloorEscortsFromLog, tickCelebrasRitual, tickFloorEscort, tickAllyRelease, tickFinkleSpawn };
}
