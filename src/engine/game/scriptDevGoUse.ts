// Player-reachable ScriptDev GO-use wiring, from interactObject through handleGoUse. The cast kinds
// must land real side effects here, because the combat tick leaves them IR-only by design.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../../domain/character/character.ts';
import { applyAura, getActiveBuffIds } from '../../domain/character/character.ts';
import type { ScriptDevAction, ScriptDevIR } from '../../domain/scriptdev/types.ts';
import { INSTANCE_DATA } from '../../domain/scriptdev/types.ts';
import {
  handleGoUse,
  planNonCharmAuraOnApply,
  type ScriptDevHookResult,
} from '../../domain/scriptdev/host.ts';
import {
  applyMajordomoSpawnToRun,
  MC_RUNE_BOSS_FIELDS,
} from '../../domain/scriptdev/moltenCore.ts';
import { lookupEventAiText } from '../../domain/creature/eventAiTexts.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import type { GameState } from './types.ts';
import type { InstanceRun } from '../../world/instances.ts';
import {
  STRATH_LIVE_POSTBOX,
  postboxOrigin,
} from '../../data/dungeons/stratholme-live.ts';

/** stratholme.h:23 TYPE_POSTMASTER — counter side-effect field. */
const TYPE_POSTMASTER = 9;
/** stratholme.h:81 SPELL_SUMMON_POSTMASTER — bake may lack the row; still queue 11143. */
const SPELL_SUMMON_POSTMASTER = STRATH_LIVE_POSTBOX.summonSpellId;

export interface ScriptDevGoUseApplied {
  handled: boolean;
  /** Spell ids applied via cast_on_player / cast_on_group. */
  castSpellIds: number[];
  /** summon_count rows recorded (creatureEntry × count). */
  summons: Array<{ creatureEntry: number; count: number }>;
  /** open_door GO entries toggled open in goRuntime. */
  openDoors: number[];
  writes: Array<{ field: number; value: number }>;
  flavor: string[];
}

/** Build a mutable Map from InstanceRun.scriptInstanceData (or empty). */
export function scriptInstanceDataMap(run: InstanceRun | null | undefined): Map<number, number> {
  const store = new Map<number, number>();
  const raw = run?.scriptInstanceData;
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      store.set(Number(k) | 0, (v as number) | 0);
    }
  }
  return store;
}

/** Persist Map → InstanceRun.scriptInstanceData (omit when empty). */
export function persistScriptInstanceData(
  run: InstanceRun,
  store: Map<number, number>,
): InstanceRun {
  if (store.size === 0) {
    if (!run.scriptInstanceData) return run;
    const next = { ...run };
    delete next.scriptInstanceData;
    return next;
  }
  const obj: Record<number, number> = {};
  for (const [k, v] of store) obj[k] = v;
  return { ...run, scriptInstanceData: obj };
}

// After the GO use writes its instance data, run the SetData side effects that are not plain store
// writes: the Stratholme postbox counter, and the Molten Core rune that spawns Majordomo.
export function applyPostUseInstanceSideEffects(
  store: Map<number, number>,
  writes: Array<{ field: number; value: number }>,
  run: InstanceRun,
): InstanceRun {
  let next = run;
  let mcRuneSpecial = false;
  for (const w of writes) {
    if (w.field === TYPE_POSTMASTER && w.value === INSTANCE_DATA.IN_PROGRESS) {
      const used = (next.postboxesUsed ?? 0) + 1;
      next = { ...next, postboxesUsed: used };
      // After the second post box prepare to spawn the Post Master.
      if (used === 2) {
        store.set(TYPE_POSTMASTER, INSTANCE_DATA.SPECIAL);
      }
    }
    if (
      (MC_RUNE_BOSS_FIELDS as readonly number[]).includes(w.field | 0)
      && w.value === INSTANCE_DATA.SPECIAL
    ) {
      mcRuneSpecial = true;
    }
  }
  if (mcRuneSpecial) {
    next = applyMajordomoSpawnToRun(next, store, { byPlayerEnter: false, hasPlayer: true });
  }
  return next;
}

// Peek handleGoUse against a copy of the run store (mutations are discarded). False → C++ GOUse returned
// true without SetData (boss TYPE not DONE).
export function scriptDevGoUseAllowed(
  ir: ScriptDevIR,
  run: InstanceRun | null | undefined,
  usedGoEntry?: number,
): boolean {
  if (!ir.goUse) return true;
  return handleGoUse(ir, scriptInstanceDataMap(run), usedGoEntry).handled;
}

function playerHasAura(char: Character, spellId: number, now: number, ds: DataStore): boolean {
  return getActiveBuffIds(char, now, ds).includes(spellId | 0);
}

// A triggered cast on the player. Named `applySpell` so the aifid census sees a real consumer. The
// duration prefers a typed effect and falls back to the spell's own duration index.
function applySpell(
  char: Character,
  spellId: number,
  now: number,
  ds: DataStore,
  opts?: { auraNotPresent?: boolean },
): Character {
  if (opts?.auraNotPresent && playerHasAura(char, spellId, now, ds)) {
    return char;
  }
  const def = ds.spell(spellId);
  let durationMs: number | undefined;
  if (def) {
    for (const eff of def.effects ?? []) {
      if (
        // SpellEffect kinds: buff / dot / speed (etc.). period_damage/mod_rating never existed.
        (eff.kind === 'buff' || eff.kind === 'dot' || eff.kind === 'speed')
        && 'durationMs' in eff
        && typeof (eff as { durationMs?: number }).durationMs === 'number'
      ) {
        durationMs = (eff as { durationMs: number }).durationMs;
        break;
      }
    }
    if (durationMs == null && def.durationIndex != null) {
      durationMs = durMs(def.durationIndex);
    }
  }
  // Still land an aura row even if spell-data is missing (cast remains observable).
  return applyAura(char, spellId, durationMs, now, ds);
}

type PendingSummon = NonNullable<InstanceRun['scriptPendingSummons']>[number];

function pushPendingSummon(
  state: GameState,
  summons: Array<{ creatureEntry: number; count: number }>,
  row: PendingSummon,
  log: (msg: string) => void,
  ds: DataStore,
): void {
  if (!(row.creatureEntry > 0) || !(row.count > 0)) return;
  summons.push({ creatureEntry: row.creatureEntry | 0, count: row.count | 0 });
  if (state.instance) {
    const prev = state.instance.scriptPendingSummons ?? [];
    let next: InstanceRun = {
      ...state.instance,
      scriptPendingSummons: [...prev, row],
    };
    // Stamp path-dependent Malown origin for spawnUnlockedBodies.
    if (row.encounterId && row.x != null && row.y != null) {
      next = {
        ...next,
        encounterOrigins: {
          ...(next.encounterOrigins ?? {}),
          [row.encounterId]: {
            x: row.x,
            y: row.y,
            ...(row.z != null ? { z: row.z } : {}),
          },
        },
      };
    }
    state.instance = next;
  }
  const cname = ds.creature(row.creatureEntry)?.name ?? `creature ${row.creatureEntry}`;
  log(`${row.count}× ${cname} appear!`);
}

// Persist a cast's wild and guardian summons onto the instance run, the same host path combat uses.
// With no spell data for the id, still queue Malown at the used postbox origin.
function applyCastSummons(
  spellId: number,
  state: GameState,
  ds: DataStore,
  summons: Array<{ creatureEntry: number; count: number }>,
  log: (msg: string) => void,
  origin?: { x: number; y: number; z?: number },
): void {
  const def = ds.spell(spellId);
  if (def) {
    const plan = planNonCharmAuraOnApply(spellId | 0, def.name ?? `spell ${spellId}`, 0, [def]);
    for (const step of plan) {
      if (step.kind !== 'summon' || step.creatureEntry <= 0 || step.count <= 0) continue;
      const isMalown =
        (spellId | 0) === SPELL_SUMMON_POSTMASTER
        && (step.creatureEntry | 0) === STRATH_LIVE_POSTBOX.malownEntry;
      pushPendingSummon(
        state,
        summons,
        {
          creatureEntry: step.creatureEntry | 0,
          count: step.count | 0,
          ...(origin ? { x: origin.x, y: origin.y, ...(origin.z != null ? { z: origin.z } : {}) } : {}),
          ...(isMalown ? { encounterId: STRATH_LIVE_POSTBOX.encId } : {}),
        },
        log,
        ds,
      );
    }
    return;
  }
  // Bake gap: 24627 absent from spell-data — still queue Malown from the cite.
  if ((spellId | 0) === SPELL_SUMMON_POSTMASTER && origin) {
    pushPendingSummon(
      state,
      summons,
      {
        creatureEntry: STRATH_LIVE_POSTBOX.malownEntry,
        count: 1,
        x: origin.x,
        y: origin.y,
        ...(origin.z != null ? { z: origin.z } : {}),
        encounterId: STRATH_LIVE_POSTBOX.encId,
      },
      log,
      ds,
    );
  }
}

// Apply non-store GO-use actions onto game state. set_instance_data is already applied by handleGoUse onto
// `store`.
export function applyGoUseActions(
  actions: readonly ScriptDevAction[],
  state: GameState,
  ds: DataStore,
  opts: {
    nowMs: number;
    goRuntimeKey: (entry: number) => string;
    log: (msg: string) => void;
    /** Used GO origin for path-dependent summons (Strat postboxes). */
    summonOrigin?: { x: number; y: number; z?: number };
  },
): ScriptDevGoUseApplied {
  const castSpellIds: number[] = [];
  const summons: Array<{ creatureEntry: number; count: number }> = [];
  const openDoors: number[] = [];
  const flavor: string[] = [];
  const origin = opts.summonOrigin;

  for (const act of actions) {
    if (act.kind === 'cast_on_player') {
      state.char = applySpell(state.char, act.spellId, opts.nowMs, ds, {
        auraNotPresent: act.auraNotPresent,
      });
      castSpellIds.push(act.spellId | 0);
      const nm = ds.spell(act.spellId)?.name ?? `spell ${act.spellId}`;
      opts.log(`Scripted GO casts ${nm} on you.`);
      // SUMMON_WILD on the cast spell (Postmaster Malown 24627 → 11143).
      applyCastSummons(act.spellId | 0, state, ds, summons, opts.log, origin);
    } else if (act.kind === 'cast_on_group') {
      // Solo (no group): cast on player. With companions: every member.
      // Cite: stratholmeScripts.cpp:71-87 Group loop + else player branch.
      state.char = applySpell(state.char, act.spellId, opts.nowMs, ds, {
        auraNotPresent: act.auraNotPresent,
      });
      castSpellIds.push(act.spellId | 0);
      const nm = ds.spell(act.spellId)?.name ?? `spell ${act.spellId}`;
      opts.log(`Scripted GO casts ${nm} on the group.`);
      applyCastSummons(act.spellId | 0, state, ds, summons, opts.log, origin);
    } else if (act.kind === 'summon_count') {
      if (act.creatureEntry > 0 && act.count > 0) {
        pushPendingSummon(
          state,
          summons,
          {
            creatureEntry: act.creatureEntry | 0,
            count: act.count | 0,
            ...(origin
              ? { x: origin.x, y: origin.y, ...(origin.z != null ? { z: origin.z } : {}) }
              : {}),
          },
          opts.log,
          ds,
        );
      }
    } else if (act.kind === 'open_door') {
      const key = opts.goRuntimeKey(act.goEntry);
      const rt: GoRuntimeState = {
        ...(state.goRuntime?.[key] ?? {}),
        open: true,
      };
      state.goRuntime = { ...(state.goRuntime ?? {}), [key]: rt };
      openDoors.push(act.goEntry | 0);
      opts.log(`Door ${act.goEntry} opens.`);
    } else if (act.kind === 'yell') {
      // No combat channel on a gameobject use — the line goes to the feed as text.
      const textId = act.textIds && act.textIds.length > 0 ? act.textIds[0] : (act.textId as number);
      const row = lookupEventAiText(textId);
      flavor.push(row?.content_default?.trim() || `yell ${textId}`);
    } else if (act.kind === 'flavor') {
      flavor.push(act.text);
      opts.log(act.text);
    }
    // set_instance_data: already on store via handleGoUse
  }

  return {
    handled: true,
    castSpellIds,
    summons,
    openDoors,
    writes: [],
    flavor,
  };
}

// Full GO-use path: handleGoUse against the run's instance data store, apply post-SetData side effects,
// persist store, apply cast/summon/door actions.
export function runScriptDevGoUse(
  ir: ScriptDevIR,
  state: GameState,
  ds: DataStore,
  opts: {
    nowMs: number;
    goRuntimeKey: (entry: number) => string;
    log: (msg: string) => void;
    /** GO entry the player used — `perEntry` scripts (MC runes) need it. */
    usedGoEntry?: number;
  },
): ScriptDevHookResult & ScriptDevGoUseApplied {
  if (!ir.goUse) {
    return {
      handled: false,
      actions: [],
      writes: [],
      flavor: [],
      castSpellIds: [],
      summons: [],
      openDoors: [],
    };
  }

  // An instance-scoped store inside a dungeon, an ephemeral map otherwise: the Stratholme scripts
  // require real instance data, while an outdoor script that only sets data still gets a store.
  const inInstance = !!state.instance;
  const store = scriptInstanceDataMap(state.instance);
  const hook = handleGoUse(ir, store, opts.usedGoEntry);
  if (!hook.handled) {
    return {
      ...hook,
      castSpellIds: [],
      summons: [],
      openDoors: [],
    };
  }

  if (inInstance && state.instance) {
    let run = applyPostUseInstanceSideEffects(store, hook.writes, state.instance);
    run = persistScriptInstanceData(run, store);
    state.instance = run;
  }

  // Postbox / other path-dependent summons use the GO the player opened.
  // Cite: stratholmeScripts.cpp:108-110; docs/dungeons/malown/README.md.
  const summonOrigin =
    opts.usedGoEntry != null ? postboxOrigin(opts.usedGoEntry) : undefined;

  const applied = applyGoUseActions(hook.actions, state, ds, {
    ...opts,
    ...(summonOrigin ? { summonOrigin } : {}),
  });
  return {
    ...hook,
    ...applied,
    writes: (() => {
      // Re-read final store values after side effects (postbox SPECIAL promotion).
      if (!inInstance) return hook.writes;
      const out: Array<{ field: number; value: number }> = [];
      for (const [field, value] of store) {
        out.push({ field, value });
      }
      return out.length ? out : hook.writes;
    })(),
  };
}
