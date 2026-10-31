// SPELL_EFFECT_ACTIVATE_OBJECT: the action applies only when a target GO entry is set, matching the
// C++ early-out. With no target the cast still succeeds for its co-slots. Cite: SpellEffects.cpp:4377.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import { GO_ACTION } from '../spells/interpreter/handlers/shared.ts';
import type { WildSummonedObject } from './summonObjectWild.ts';

export type ActivateObjectEffect = Extract<SpellEffect, { kind: 'activate_object' }>;

export interface ActivateObjectApplied {
  action: number;
  goEntry: number;
  /** OPEN / DISTURB / OPEN_AND_UNLOCK / DESTROY / MAKE_ACTIVE → open. CLOSE / REBUILD → closed. */
  open?: boolean;
  /** DESPAWN → ForcedDespawn (permanent consume on goRuntime). */
  despawned?: boolean;
  /** ANIMATE_CUSTOM_0..3 index, or true for spell-id custom anim (17731). */
  customAnim?: number | true;
  /** Twilight MAKE_ACTIVE/MAKE_INERT summon NPC when effect carries it. */
  summonNpcEntry?: number;
  /** Player-visible activity line. */
  message: string;
}

export interface ApplyActivateObjectResult {
  applied: ActivateObjectApplied[];
  goRuntime: Record<string, GoRuntimeState> | undefined;
  wildSummonedObjects: WildSummonedObject[] | undefined;
}

/** Collect materialized activate_object effects (order preserved). */
export function collectActivateObjectEffects(
  spell: SpellDef | null | undefined,
): ActivateObjectEffect[] {
  if (!spell?.effects?.length) return [];
  return spell.effects.filter((e): e is ActivateObjectEffect => e.kind === 'activate_object');
}

// Apply each ACTIVATE_OBJECT slot to `targetGoEntry`. Returns updated goRuntime / wildSummonedObjects
// copies when mutated.
export function applyActivateObjectFromSpell(
  spell: SpellDef | null | undefined,
  opts: {
    /** gameObjTarget entry. Cite: SpellEffects.cpp:4379–4380. */
    targetGoEntry?: number | null;
    goRuntime?: Record<string, GoRuntimeState>;
    /** Key for goRuntime (`${zoneId}:${entry}` in createGame). */
    goRuntimeKey: (entry: number) => string;
    wildSummonedObjects?: readonly WildSummonedObject[];
    /** Display name for activity log. */
    goName?: string;
  },
): ApplyActivateObjectResult {
  const applied: ActivateObjectApplied[] = [];
  let goRuntime = opts.goRuntime;
  let wilds = opts.wildSummonedObjects ? [...opts.wildSummonedObjects] : undefined;

  const target = (opts.targetGoEntry ?? 0) | 0;
  // C++: if (!gameObjTarget) return; — no GO, no apply. Cite: :4379–4380.
  if (!target) {
    return {
      applied,
      goRuntime: opts.goRuntime,
      wildSummonedObjects: opts.wildSummonedObjects ? [...opts.wildSummonedObjects] : undefined,
    };
  }

  const effects = collectActivateObjectEffects(spell);
  if (!effects.length) {
    return {
      applied,
      goRuntime: opts.goRuntime,
      wildSummonedObjects: opts.wildSummonedObjects ? [...opts.wildSummonedObjects] : undefined,
    };
  }

  const goName = opts.goName?.trim() || `object ${target}`;
  const key = opts.goRuntimeKey(target);

  for (const e of effects) {
    const action = e.action | 0;
    const one = applyOne(action, e, target, goName, key, goRuntime, wilds);
    if (one.applied) applied.push(one.applied);
    if (one.goRuntime) goRuntime = one.goRuntime;
    if (one.wilds) wilds = one.wilds;
  }

  return { applied, goRuntime, wildSummonedObjects: wilds };
}

function patchRuntime(
  goRuntime: Record<string, GoRuntimeState> | undefined,
  key: string,
  patch: Partial<GoRuntimeState>,
): Record<string, GoRuntimeState> {
  const prev = goRuntime?.[key] ?? {};
  return { ...(goRuntime ?? {}), [key]: { ...prev, ...patch } };
}

function applyOne(
  action: number,
  e: ActivateObjectEffect,
  goEntry: number,
  goName: string,
  key: string,
  goRuntime: Record<string, GoRuntimeState> | undefined,
  wilds: WildSummonedObject[] | undefined,
): {
  applied?: ActivateObjectApplied;
  goRuntime?: Record<string, GoRuntimeState>;
  wilds?: WildSummonedObject[];
} {
  // ANIMATE_CUSTOM_0..3 → SendGameObjectCustomAnim(action - ANIMATE_CUSTOM_0). Cite: :4388–4392.
  if (
    action === GO_ACTION.ANIMATE_CUSTOM_0
    || action === GO_ACTION.ANIMATE_CUSTOM_1
    || action === GO_ACTION.ANIMATE_CUSTOM_2
    || action === GO_ACTION.ANIMATE_CUSTOM_3
  ) {
    const anim = action - GO_ACTION.ANIMATE_CUSTOM_0;
    return {
      applied: {
        action,
        goEntry,
        customAnim: anim,
        message: `${goName} animates (custom ${anim}).`,
      },
    };
  }

  // DISTURB / OPEN — Use(caster), or custom anim for 17731. Cite: :4394–4405.
  if (action === GO_ACTION.DISTURB || action === GO_ACTION.OPEN) {
    if (e.customAnim) {
      return {
        applied: {
          action,
          goEntry,
          customAnim: true,
          message: `${goName} animates.`,
        },
      };
    }
    const next = patchRuntime(goRuntime, key, { open: true });
    return {
      goRuntime: next,
      applied: {
        action,
        goEntry,
        open: true,
        message: action === GO_ACTION.DISTURB
          ? `You disturb ${goName}.`
          : `You open ${goName}.`,
      },
    };
  }

  // OPEN_AND_UNLOCK — UseDoorOrButton then unlock. Cite: :4406–4411.
  if (action === GO_ACTION.OPEN_AND_UNLOCK) {
    const next = patchRuntime(goRuntime, key, { open: true });
    return {
      goRuntime: next,
      applied: {
        action,
        goEntry,
        open: true,
        message: `You open and unlock ${goName}.`,
      },
    };
  }

  // UNLOCK / LOCK — ApplyModFlag GO_FLAG_LOCKED. Cite: :4409–4412.
  if (action === GO_ACTION.UNLOCK) {
    return {
      applied: {
        action,
        goEntry,
        message: `You unlock ${goName}.`,
      },
    };
  }
  if (action === GO_ACTION.LOCK) {
    return {
      applied: {
        action,
        goEntry,
        message: `You lock ${goName}.`,
      },
    };
  }

  // CLOSE / REBUILD — ResetDoorOrButton. Cite: :4413–4416.
  if (action === GO_ACTION.CLOSE || action === GO_ACTION.REBUILD) {
    const next = patchRuntime(goRuntime, key, { open: false });
    return {
      goRuntime: next,
      applied: {
        action,
        goEntry,
        open: false,
        message: action === GO_ACTION.REBUILD
          ? `You rebuild ${goName}.`
          : `You close ${goName}.`,
      },
    };
  }

  // TOGGLE_OPEN. Cite: :4417 (enum; switch uses OPEN path variants in client data).
  if (action === GO_ACTION.TOGGLE_OPEN) {
    const wasOpen = goRuntime?.[key]?.open === true;
    const nextOpen = !wasOpen;
    const next = patchRuntime(goRuntime, key, { open: nextOpen });
    return {
      goRuntime: next,
      applied: {
        action,
        goEntry,
        open: nextOpen,
        message: nextOpen ? `You open ${goName}.` : `You close ${goName}.`,
      },
    };
  }

  // DESTROY — UseDoorOrButton(0, true) destroyed state. Cite: :4475–4477.
  if (action === GO_ACTION.DESTROY) {
    const next = patchRuntime(goRuntime, key, {
      open: true,
      readyAtMs: Number.MAX_SAFE_INTEGER,
    });
    return {
      goRuntime: next,
      applied: {
        action,
        goEntry,
        open: true,
        despawned: true,
        message: `You destroy ${goName}.`,
      },
    };
  }

  // DESPAWN — ForcedDespawn. Cite: :4417–4419.
  if (action === GO_ACTION.DESPAWN) {
    const next = patchRuntime(goRuntime, key, {
      readyAtMs: Number.MAX_SAFE_INTEGER,
    });
    // Also drop any session wild summons of this entry (placed GO then despawn co-slot).
    const nextWilds = wilds?.filter((w) => (w.goEntry | 0) !== goEntry);
    return {
      goRuntime: next,
      wilds: nextWilds,
      applied: {
        action,
        goEntry,
        despawned: true,
        message: `${goName} despawns.`,
      },
    };
  }

  // MAKE_INERT / MAKE_ACTIVE — GO_FLAG_NO_INTERACT + optional Twilight summon. Cite: :4421–4470.
  if (action === GO_ACTION.MAKE_INERT || action === GO_ACTION.MAKE_ACTIVE) {
    const inert = action === GO_ACTION.MAKE_INERT;
    const next = patchRuntime(goRuntime, key, {
      open: !inert,
      ...(inert ? { readyAtMs: Number.MAX_SAFE_INTEGER } : { readyAtMs: 0 }),
    });
    const npc = (e.summonNpcEntry ?? 0) | 0;
    const msg = npc > 0
      ? (inert
        ? `${goName} becomes inert; creature ${npc} appears.`
        : `${goName} activates; creature ${npc} appears.`)
      : (inert ? `${goName} becomes inert.` : `You activate ${goName}.`);
    return {
      goRuntime: next,
      applied: {
        action,
        goEntry,
        open: !inert,
        despawned: inert,
        ...(npc > 0 ? { summonNpcEntry: npc } : {}),
        message: msg,
      },
    };
  }

  // CLOSE_AND_LOCK — ResetDoorOrButton + GO_FLAG_LOCKED. Cite: :4471–4474.
  if (action === GO_ACTION.CLOSE_AND_LOCK) {
    const next = patchRuntime(goRuntime, key, { open: false });
    return {
      goRuntime: next,
      applied: {
        action,
        goEntry,
        open: false,
        message: `You close and lock ${goName}.`,
      },
    };
  }

  // CREATION / NONE / unknown — C++ default logs unhandled. Honest no-op with message.
  // Cite: :4478–4480 default sLog.outError unhandled action.
  if (action === GO_ACTION.NONE || action === GO_ACTION.CREATION) {
    return {
      applied: {
        action,
        goEntry,
        message: `You interact with ${goName}.`,
      },
    };
  }

  return {
    applied: {
      action,
      goEntry,
      message: `You activate ${goName} (action ${action}).`,
    },
  };
}
