// Peeled from liveDungeonController (S3) — Stratholme undead timers.
// The live controller context, as much of it as this module reads; tuiFloor.mjs builds one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiveDungeonCtx = any;
import { hasFlag, setFlag } from '../world/instances.ts';
import {
  placeFloorBody,
  resolveKill,
  summonedBodyGuid,
  type ContinuousEntity,
} from '../world/continuousDungeon.ts';
import {
  STRATH_AURIUS,
  STRATH_BARON_RUN,
  STRATH_BARTHILAS_RUN,
  STRATH_RIVENDARE_RAISE,
  STRATH_WALK_THROUGH_GATES,
  STRATH_YSIDA,
  rivendareRaiseCastsByMs,
  strathAuriusJoinsBaron,
  strathBarthilasShouldRelocate,
} from '../data/dungeons/stratholme-undead.ts';

export type StratUndeadApi = {
  tickBaronRun: () => void;
  tickStratUndeadResiduals: () => void;
};

/**
 * Pass-through radius for a portcullis. The party walks THROUGH these gates rather than
 * clicking them, and a walk only has to end within `ROUTE_LEAD_ARRIVE_YD` (8) of its lead —
 * so the 5 yd click range (GO_INTERACT_YD / INTERACTION_DISTANCE) alone can be missed by a
 * party that legitimately went through the arch. 5 + 8.
 */
const GATE_USE_YD = 13;

/** Stable floor guid for the summoned Ysida (no `creature` row on map 329). */
const YSIDA_GUID = summonedBodyGuid('strath-undead-ysida');

export function installStratUndead(ctx: LiveDungeonCtx): StratUndeadApi {
  /** Arm / expire Baron's Ultimatum. Cite: stratholme.cpp:230, :1137-1190. */
  const tickBaronRun = (): void => {
    const run = ctx.game.state.instance;
    if (!run || ctx.stopped) return;
    // Arm on first observation of the run flag (objectGate 175357).
    if (
      hasFlag(run, STRATH_BARON_RUN.runFlag)
      && ctx.baronRunDeadlineMs == null
      && !hasFlag(run, STRATH_BARON_RUN.successFlag)
      && !hasFlag(run, STRATH_BARON_RUN.failFlag)
    ) {
      ctx.baronRunDeadlineMs = ctx.runElapsedMs + STRATH_BARON_RUN.durationMs;
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>The Baron's Ultimatum</b> - 45 minutes to reach Rivendare!</span>`,
      );
    }
    if (ctx.baronRunDeadlineMs == null) return;
    if (hasFlag(run, STRATH_BARON_RUN.successFlag) || hasFlag(run, STRATH_BARON_RUN.failFlag)) {
      return;
    }
    const remaining = ctx.baronRunDeadlineMs - ctx.runElapsedMs;
    if (!ctx.baronRunWarned10 && remaining <= STRATH_BARON_RUN.warn10MinMs) {
      ctx.baronRunWarned10 = true;
      ctx.pushFeed(`<span class="tw-auto-ev">The Baron: <b>ten minutes</b> remain…</span>`);
    }
    if (!ctx.baronRunWarned5 && remaining <= STRATH_BARON_RUN.warn5MinMs) {
      ctx.baronRunWarned5 = true;
      ctx.pushFeed(`<span class="tw-auto-ev">The Baron: <b>five minutes</b> remain…</span>`);
    }
    if (remaining <= 0) {
      ctx.game.state.instance = setFlag(run, STRATH_BARON_RUN.failFlag);
      // FAIL is not instant death: the cage opens, she walks out to the same point the
      // rescue would have freed her on, and the Baron drains her 8 s later.
      // Cite: stratholme.cpp:1160-1183 cage + MovePoint, m_baronRunTimer = 8s, Soul Drain.
      const ysida = ctx.continuous.entities.find((e) => e.guid === YSIDA_GUID);
      if (ysida && ysida.state !== 'dead') {
        const p = STRATH_YSIDA.freedPoint;
        placeFloorBody(ctx.continuous, ysida, p.x, p.y, p.z);
      }
      ctx.ysidaSoulDrainAtMs = ctx.runElapsedMs + STRATH_BARON_RUN.failSpeechDelayMs;
      ctx.pushFeed(
        `<span class="tw-auto-ev">The Baron's Ultimatum has <b>expired</b> - `
        + `Ysida's cage swings open.</span>`,
      );
      ctx.baronRunDeadlineMs = null;
    }
  };

  /**
   * Ysida Harmon's body and her two exits from the cage.
   *
   * She has no `creature` row on map 329 — the Baron summons her the instant the Gauntlet
   * Gate arms the run, with gossip/questgiver stripped while she is caged. Freed (Baron down
   * inside the window) she steps out and becomes quest 8945's turn-in; failed, the Baron
   * kills her 8 s after the cage opens. Kill credit itself is granted where the Baron dies
   * (livePullLifecycle) — this owns the body.
   * Cite: stratholme.cpp:222-227 summon in cage; :375-392 freed; :1160-1183 fail.
   */
  const tickYsida = (): void => {
    const run = ctx.game.state.instance;
    if (!run || ctx.stopped) return;
    const armed = hasFlag(run, STRATH_BARON_RUN.runFlag);
    let ysida = ctx.continuous.entities.find((e) => e.guid === YSIDA_GUID);

    if (armed && !ysida) {
      const p = STRATH_YSIDA.cagePoint;
      const body: ContinuousEntity = {
        guid: YSIDA_GUID,
        entry: STRATH_YSIDA.entry,
        x: p.x,
        y: p.y,
        z: p.z,
        state: 'alive',
        detectionRange: 0,
        level: 60,
        movementType: 0,
        npcFlags: 0, // stripped while caged — stratholme.cpp:227
        hostile: false,
      };
      ctx.continuous.entities.push(body);
      ysida = body;
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>Ysida Harmon</b> is caged beside Baron Rivendare `
        + `(GO ${STRATH_YSIDA.cageGo}).</span>`,
      );
    }
    if (!ysida || ysida.state === 'dead') return;

    // Rescued: cage opens, she steps out, gossip + questgiver return (she ENDS quest 8945).
    if (hasFlag(run, STRATH_BARON_RUN.successFlag) && ysida.npcFlags !== STRATH_YSIDA.freedNpcFlags) {
      const p = STRATH_YSIDA.freedPoint;
      placeFloorBody(ctx.continuous, ysida, p.x, p.y, p.z);
      ysida.npcFlags = STRATH_YSIDA.freedNpcFlags;
      ysida.hostile = false;
      ctx.ysidaSoulDrainAtMs = null;
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>Ysida:</b> "You did it... you've slain Baron Rivendare! `
        + `The Argent Dawn shall hear of your valiant deeds!" - speak with her to hand in `
        + `${STRATH_YSIDA.questDeadMansPlea}.</span>`,
      );
      return;
    }

    // Failed: Soul Drain lands 8 s after the cage opened.
    if (
      ctx.ysidaSoulDrainAtMs != null
      && ctx.runElapsedMs >= ctx.ysidaSoulDrainAtMs
      && !hasFlag(run, STRATH_BARON_RUN.successFlag)
    ) {
      ctx.ysidaSoulDrainAtMs = null;
      // Through the one writer, not `state = 'dead'` by hand. `resolveKill` also drops the body
      // from the near grid and records the guid in `clearedGuids`, which `liveFloorState.ts:91`
      // persists as `floorClearedGuids` and `continuousDungeon.ts:341` replays on a Continue -
      // without it she stood back up alive in her cage after a failed run. State only: loot and
      // XP are `creditFloorKills`, which is not called here. Cite: E1.2; livePullLifecycle.ts:445.
      resolveKill(ctx.continuous, [YSIDA_GUID]);
      ctx.pushFeed(
        `<span class="tw-auto-ev">Baron Rivendare casts <b>Soul Drain</b> `
        + `(${STRATH_YSIDA.spellSoulDrain}) - Ysida Harmon is dead.</span>`,
      );
    }
  };

  /**
   * The two portcullises with a GOUse script sit ON the way in, 34 yd and 177 yd from the
   * zone-in, and there is no route past them. Nothing was firing either: the live floor only
   * uses a GO the autopilot deliberately walks to for an unmet `requiresFlag`, and neither
   * gate hosts one — so the 45-minute Ultimatum never armed in a live run and Barthilas
   * never fled, which left his route stop 374 yd back at the door.
   * Cite: stratholmeScripts.cpp:36-55 GOUse_go_service_gate; :61-91 GOUse_go_gauntlet_gate.
   */
  const tickWalkThroughGates = (): void => {
    const run = ctx.game.state.instance;
    if (!run || ctx.stopped) return;
    const p = ctx.continuous.party;
    for (const gate of STRATH_WALK_THROUGH_GATES) {
      if (ctx.strathGatesUsed.has(gate.goEntry)) continue;
      if (hasFlag(run, gate.setsFlag)) {
        ctx.strathGatesUsed.add(gate.goEntry);
        continue;
      }
      if (Math.hypot(p.x - gate.at.x, p.y - gate.at.y) > GATE_USE_YD) continue;
      ctx.strathGatesUsed.add(gate.goEntry);
      ctx.game.state.instance = setFlag(ctx.game.state.instance!, gate.setsFlag);
      ctx.pushFeed(
        `<span class="tw-auto-ev">The party opens the <b>${gate.name}</b> `
        + `(GO ${gate.goEntry}).</span>`,
      );
    }
  };

  /**
   * Strat undead residuals — Aurius ally, Barthilas flee, Rivendare Raise Dead feed.
   * Cite: stratholme.cpp:356-358/1109-1135 Aurius; :427-437/1089-1106 Barthilas;
   *   EventAI 1044005–07 Raise Dead.
   */
  const tickStratUndeadResiduals = (): void => {
    if (ctx.def.id !== 'stratholme-undead') return;
    const run = ctx.game.state.instance;
    if (!run || ctx.stopped) return;

    tickWalkThroughGates();
    tickYsida();

    // Service Entrance Gate armed → 8s tele if Barthilas not in combat.
    if (
      hasFlag(run, STRATH_BARTHILAS_RUN.runFlag)
      && ctx.barthilasRunArmedAtMs == null
      && !hasFlag(run, STRATH_BARTHILAS_RUN.relocatedFlag)
    ) {
      ctx.barthilasRunArmedAtMs = ctx.runElapsedMs;
      ctx.pushFeed(
        `<span class="tw-auto-ev"><b>Magistrate Barthilas</b> flees toward Slaughter Square!</span>`,
      );
    }
    if (ctx.barthilasRunArmedAtMs != null) {
      const barthInCombat = ctx.continuous.entities.some(
        (e) =>
          e.entry === STRATH_BARTHILAS_RUN.entry
          && (e.state === 'engaged' || ctx.continuous.engagedGuids.includes(e.guid)),
      );
      if (
        strathBarthilasShouldRelocate({
          flags: run.flags ?? [],
          elapsedMs: ctx.runElapsedMs - ctx.barthilasRunArmedAtMs,
          inCombat: barthInCombat,
        })
      ) {
        ctx.game.state.instance = setFlag(run, STRATH_BARTHILAS_RUN.relocatedFlag);
        const tp = STRATH_BARTHILAS_RUN.telePoint;
        for (const e of ctx.continuous.entities) {
          if (e.entry !== STRATH_BARTHILAS_RUN.entry || e.state === 'dead') continue;
          placeFloorBody(ctx.continuous, e, tp.x, tp.y, tp.z);
        }
        ctx.pushFeed(
          `<span class="tw-auto-ev"><b>Magistrate Barthilas</b> appears near Slaughter Square `
          + `(GO ${STRATH_BARTHILAS_RUN.goEntry}).</span>`,
        );
        ctx.barthilasRunArmedAtMs = null;
      }
    }

    // Baron engaged + TYPE_AURIUS → +5s Aurius joins.
    const baronEngaged = ctx.continuous.entities.some(
      (e) =>
        e.entry === 10440
        && (e.state === 'engaged' || ctx.continuous.engagedGuids.includes(e.guid)),
    );
    if (
      ctx.auriusSummonAtMs == null
      && strathAuriusJoinsBaron({ flags: run.flags ?? [], baronEngaged })
    ) {
      ctx.auriusSummonAtMs = ctx.runElapsedMs + STRATH_AURIUS.summonDelayMs;
    }
    if (ctx.auriusSummonAtMs != null && ctx.runElapsedMs >= ctx.auriusSummonAtMs) {
      const r2 = ctx.game.state.instance;
      if (r2 && strathAuriusJoinsBaron({ flags: r2.flags ?? [], baronEngaged: true })) {
        ctx.game.state.instance = setFlag(r2, STRATH_AURIUS.joinedFlag);
        // Teleport chapel Aurius beside Baron (4yd stand-in).
        const baron = ctx.continuous.entities.find((e) => e.entry === 10440 && e.state !== 'dead');
        for (const e of ctx.continuous.entities) {
          if (e.entry !== STRATH_AURIUS.entry || e.state === 'dead') continue;
          if (baron) {
            placeFloorBody(ctx.continuous, e, baron.x + STRATH_AURIUS.teleportRadiusYd, baron.y, baron.z);
          }
          e.hostile = false;
          e.npcFlags = 0;
        }
        ctx.pushFeed(
          `<span class="tw-auto-ev"><b>Aurius</b> teleports into the Slaughter House and attacks `
          + `Baron Rivendare! (quest ${STRATH_AURIUS.questMedallion})</span>`,
        );
      }
      ctx.auriusSummonAtMs = null;
    }

    // Raise Dead cadence feed while Baron is engaged (EventAI 1044005 every 15s).
    const baronFighting = ctx.continuous.entities.some(
      (e) =>
        e.entry === 10440
        && (e.state === 'engaged' || ctx.continuous.engagedGuids.includes(e.guid)),
    );
    if (!baronFighting) {
      ctx.rivendareFightStartMs = null;
      ctx.rivendareRaiseCastsDone = 0;
    } else {
      if (ctx.rivendareFightStartMs == null) ctx.rivendareFightStartMs = ctx.runElapsedMs;
      const fightMs = ctx.runElapsedMs - ctx.rivendareFightStartMs;
      const casts = rivendareRaiseCastsByMs(fightMs);
      while (ctx.rivendareRaiseCastsDone < casts) {
        ctx.rivendareRaiseCastsDone += 1;
        ctx.pushFeed(
          `<span class="tw-auto-ev"><b>Baron Rivendare</b> casts Raise Dead `
          + `(${STRATH_RIVENDARE_RAISE.spellRaiseDead}) - `
          + `${STRATH_RIVENDARE_RAISE.skeletonCount}× Mindless Skeleton `
          + `(${STRATH_RIVENDARE_RAISE.skeletonEntry})!</span>`,
        );
      }
    }
  };

  ctx.tickBaronRun = tickBaronRun;
  ctx.tickStratUndeadResiduals = tickStratUndeadResiduals;
  return { tickBaronRun, tickStratUndeadResiduals };
}
