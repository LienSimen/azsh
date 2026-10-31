// Player rotation band / default kit / editor surface.
// Pattern C: createRotationModule(ctx) — no import of game.ts.

import {
  buildDefaultRotation,
  ensureLivePlayerRotation,
  ensurePartyBuffRows,
  isMultiTargetCombatSpell,
  isRotationValid,
  primarySpec,
  rotationAutoSig,
  raidRowOptionsOf,
  rotationBandOptionsOf,
  rotationSigDiffers,
  withRaidTacticRows,
  type Rotation,
  type RotationBandOptions,
  type RotationProfileId,
} from '../../domain/rotation/rotation.ts';
import {
  getClassSuggestions,
  resolveTalentTreeName,
  selectBand,
  suggestionClassKeyFromClassId,
} from '../../domain/rotation/rotationSuggestions.ts';
import { rotationWithMacros, type MacroExpandEnv } from '../../domain/macro/rotation.ts';
import { buildMacroExpandEnv } from '../../domain/macro/rotationEnv.ts';
import { normalizeMacros } from '../../domain/macro/normalize.ts';
import type { MacroDef } from '../../domain/macro/types.ts';
import type { Game, GameState } from './types.ts';
import type { GameCtx } from './context.ts';
import type { AllyActionProvider } from '../combat.ts';
import { normalizeAutopilotConfig } from '../../autopilot/config.ts';
import {
  activeProfile,
  activeProfileIndex,
  addProfile,
  MAX_ROTATION_PROFILES,
  migrateLegacyProfiles,
  moveProfile,
  removeProfile,
  renameProfile,
  setActiveProfile,
  syncActiveFromMirror,
} from '../../domain/rotation/rotationProfiles.ts';

// The player and every companion are ONE system, so the band tables live in domain and both sides
// read the same definition. Imported, not re-exported: this module calls both below.
import {
  isCompanionKeepUpSpell, isSupportRotationBand, dpsRotationBand, roleSpecOverride,
  rotationActionProvider, syncCompanionBagItemRules,
} from '../../domain/bots/companionRotation.ts';

export { isSupportRotationBand, dpsRotationBand };

/** Band used for player default build/sig, ignoring which profile is in force. */
export function playerRoleBand(state: GameState): string | undefined {
  if (state.rotationSpec) return state.rotationSpec;
  const role = state.squadRole;
  if (role === 'healer' || role === 'tank') {
    return roleSpecOverride(state.char.cls, role) ?? undefined;
  }
  return undefined;
}

/** True when this character's active band is a tank / healer tree. */
export function playerHasDpsProfile(state: GameState): boolean {
  return isSupportRotationBand(state.char.cls, playerRoleBand(state));
}

/** Profile in force. 'dps' falls back to primary the moment the band stops being tank/healer. */
export function activeRotationProfile(state: GameState): RotationProfileId {
  return state.rotationProfile === 'dps' && playerHasDpsProfile(state) ? 'dps' : 'primary';
}

/** Band for one profile: the DPS slot swaps the role band for the class damage band. */
export function playerProfileBand(state: GameState, profile: RotationProfileId): string | undefined {
  const band = playerRoleBand(state);
  return profile === 'dps' ? dpsRotationBand(state.char.cls, band) : band;
}

/** The stored rotation in a profile slot. Exported for combatSession's engine-driven ticks. */
export function playerRotationSlot(state: GameState, profile: RotationProfileId): Rotation | undefined {
  return profile === 'dps' ? state.rotationDps : state.rotation;
}

function writeRotationSlot(state: GameState, profile: RotationProfileId, rot: Rotation): void {
  if (profile === 'dps') state.rotationDps = rot;
  else state.rotation = rot;
}

/** Stamp the slot a list belongs to, reusing the object when it is already right. */
function stampProfile(rot: Rotation, profile: RotationProfileId): Rotation {
  return (rot.profile ?? 'primary') === profile ? rot : { ...rot, profile };
}

// Refresh + return the player rotation in a profile slot. THE one ensure point, so a fight, the editor and
// the autopilot all read the same list. Cite: build.ts ensureLivePlayerRotation.
export function ensurePlayerRotation(
  state: GameState,
  ds: GameCtx['ds'],
  profile: RotationProfileId,
): Rotation {
  const next = ensureLivePlayerRotation(
    playerRotationSlot(state, profile),
    state.char,
    state.spellbook,
    ds,
    state.inventory,
    {
      band: playerProfileBand(state, profile) ?? null,
      role: profile === 'dps' ? 'dps' : state.squadRole,
    },
  );
  const stamped = stampProfile(next, profile);
  writeRotationSlot(state, profile, stamped);
  return stamped;
}

// Seed the named-profile list on first touch, folding a legacy save in: the single rotation becomes
// profile 1 and the old fixed DPS slot profile 2, named for the role. Idempotent.
export function ensureProfileList(state: GameState, ds: GameCtx['ds']): void {
  if (state.rotationProfiles?.length) {
    if (!state.activeRotationProfileId) {
      state.activeRotationProfileId = state.rotationProfiles[0]!.id;
      state.rotation = state.rotationProfiles[0]!.rotation;
    }
    return;
  }
  // Make sure at least the primary exists before it becomes profile 1.
  ensurePlayerRotation(state, ds, 'primary');
  const role = state.squadRole;
  const list = migrateLegacyProfiles(state, {
    primary: role === 'tank' ? 'Tank' : role === 'healer' ? 'Heal' : 'Main',
    dps: 'Damage',
  });
  state.rotationProfiles = list;
  const wantDps = state.rotationProfile === 'dps' && list.length > 1;
  const act = wantDps ? list[1]! : list[0]!;
  state.activeRotationProfileId = act.id;
  state.rotation = act.rotation;
}

// The player's macro compiler view over BOTH scopes, normalized on read as the macros module does.
// Exported because the engine-driven fight path must compile against the same resolver the UI does.
export function playerMacroExpandEnv(
  state: GameState,
  ds: GameCtx['ds'],
  opts: GameCtx['opts'],
): MacroExpandEnv {
  const raw = typeof opts.accountMacros === 'function'
    ? opts.accountMacros()
    : (opts.accountMacros ?? []);
  let account: MacroDef[] = [];
  try {
    account = normalizeMacros(raw, 'account');
  } catch {
    account = [];
  }
  return buildMacroExpandEnv({
    ds,
    char: state.char,
    spellbook: state.spellbook,
    inventory: state.inventory,
    macros: [...normalizeMacros(state.macros, 'character'), ...account],
  });
}

// Engine-driven ticks for the player. Arena skipped this, so Auto-resolve used class heuristics
// and never drank a bagged healthstone. Cite: combatSession.ts:832.
export function playerFightActionProvider(
  state: GameState,
  ds: GameCtx['ds'],
  opts: GameCtx['opts'],
  targetEntry?: number,
): AllyActionProvider | null {
  const autoCfg = normalizeAutopilotConfig(state.autopilot);
  const liveRot = rotationWithMacros(
    syncCompanionBagItemRules(
      ensurePlayerRotation(state, ds, activeRotationProfile(state)),
      state.char,
      state.inventory,
      ds,
    ),
    playerMacroExpandEnv(state, ds, opts),
  );
  if (!isRotationValid(liveRot, state.char.cls)) return null;
  return rotationActionProvider(liveRot, targetEntry, {
    aoeMode: autoCfg.aoeMode === 'aoe' || autoCfg.aoeMode === 'single' ? autoCfg.aoeMode : 'auto',
    offHealAllowed: autoCfg.offHeal === true,
    isMultiSpell: (id) => isMultiTargetCombatSpell(ds.spell(id)),
    isOocKeepUp: (id) => isCompanionKeepUpSpell(ds.spell(id)),
  });
}

export function createRotationModule(
  ctx: GameCtx,
): Pick<
  Game,
  | 'playerRotationBand'
  | 'buildPlayerDefaultRotation'
  | 'rotation'
  | 'rotationForCombat'
  | 'setRotation'
  | 'resetRotation'
  | 'rotationProfile'
  | 'setRotationProfile'
  | 'hasDpsRotationProfile'
  | 'rotationProfiles'
  | 'addRotationProfile'
  | 'hasPvpRotationBand'
  | 'renameRotationProfile'
  | 'deleteRotationProfile'
  | 'selectRotationProfile'
  | 'moveRotationProfile'
  | 'rotationSpec'
  | 'effectiveRotationSpec'
  | 'setRotationSpec'
  | 'rotationNeedsRefresh'
> {
  const { ds, state } = ctx;

  function playerRotationBand(): string | undefined {
    return playerRoleBand(state);
  }

  // True when a pvp band really covers this level AND tree. `autoSig.mode` records the REQUEST, and
  // `selectBand` falls back to the PvE ladder, so a list labelled PvP would silently be the PvE one.
  function playerHasPvpBand(): boolean {
    const key = suggestionClassKeyFromClassId(state.char.cls);
    if (!key) return false;
    const spec = primarySpec(state.char, ds, playerRotationBand());
    return selectBand(getClassSuggestions(key), state.char.level, spec, { mode: 'pvp' })?.mode === 'pvp';
  }

  function buildPlayerDefaultRotation(
    specOverride?: string | null,
    profile: RotationProfileId = 'primary',
    // `mode: 'pvp'` is what lets `selectBand` take a pvp band for the PLAYER; without it the pvp pool
    // is filtered out entirely (rotationSuggestions.ts selectBand) and only bots could reach it.
    opts?: RotationBandOptions,
  ): Rotation {
    const role = profile === 'dps' ? 'dps' : state.squadRole;
    const band = specOverride !== undefined
      ? (specOverride ?? undefined)
      : playerProfileBand(state, profile);
    const sigBand = band ?? null;
    return {
      ...buildDefaultRotation(state.char, state.spellbook, ds, state.inventory, band, opts),
      profile,
      autoSig: {
        ...rotationAutoSig(state.char, state.spellbook, ds, sigBand, opts),
        role: role === 'healer' || role === 'tank' ? role : 'dps',
      },
    };
  }

  // The live player rotation for a profile, with the same kit-drift rebuild the trainer and fight
  // start do. Folding an external rewrite back in is what stops the list serving a stale copy.
  function liveRotation(profile?: RotationProfileId): Rotation {
    if (state.rotationProfiles?.length && profile === undefined) {
      syncActiveFromMirror(state);
      const act = activeProfile(state);
      if (act) {
        const fresh = ensureLivePlayerRotation(
          act.rotation, state.char, state.spellbook, ds, state.inventory,
          { band: playerRotationBand() ?? null, role: state.squadRole },
        );
        if (fresh !== act.rotation) {
          const i = activeProfileIndex(state);
          state.rotationProfiles![i] = { ...act, rotation: fresh };
          state.rotation = fresh;
        }
        return fresh;
      }
    }
    return ensurePlayerRotation(state, ds, profile ?? activeRotationProfile(state));
  }

  return {
    // Band used for player default build/sig: explicit rotationSpec wins; else Holy/Resto/ Protection when
    // signed healer/tank (same as companions); else talent primary.
    playerRotationBand,
    // The class default for the editor and auto-refresh, from the same builder companions use. The
    // packs under src/data/rotations hold the full kit — nothing is invented for a role.
    buildPlayerDefaultRotation,
    rotation: liveRotation,
    // The same list with every macro rule compiled and the raid rows for the instance you stand in.
    // Never written back: the stored rule stays a macro, and the save carries no raid row.
    rotationForCombat(profile) {
      // Same bag-item inject companions get (squadDungeon.ts). A custom list had no potion
      // rows; BG already did this and dungeon companions always did. Not written back.
      const withBags = syncCompanionBagItemRules(
        ensurePartyBuffRows(liveRotation(profile), ds), state.char, state.inventory, ds,
      );
      return withRaidTacticRows(
        rotationWithMacros(withBags, playerMacroExpandEnv(state, ds, ctx.opts)),
        state.instance?.dungeonId,
        state.char,
        state.spellbook,
        ds,
        raidRowOptionsOf(state),
      );
    },
    // An explicit editor save marks the rotation custom so auto-refresh leaves the hand-edits alone.
    // Stamp version:1 so hand-edits missing the field still pass isRotationValid (KI-343).
    setRotation(rot, profile) {
      const next = { ...rot, version: 1 as const, custom: true };
      if (state.rotationProfiles?.length && profile === undefined) {
        const i = activeProfileIndex(state);
        if (i >= 0) {
          state.rotationProfiles[i] = { ...state.rotationProfiles[i]!, rotation: next };
          state.rotation = next;
          return;
        }
      }
      const p = profile ?? activeRotationProfile(state);
      writeRotationSlot(state, p, { ...next, profile: p });
    },
    resetRotation(profile) {
      // "Reset to recommended" — same pack-backed default as companions for this role/band, and
      // for the same POOL: resetting a `+ PvP` list used to hand back the PvE one.
      const p = profile ?? activeRotationProfile(state);
      const rot = buildPlayerDefaultRotation(
        playerProfileBand(state, p) ?? null, p, rotationBandOptionsOf(playerRotationSlot(state, p)),
      );
      writeRotationSlot(state, p, rot);
      return rot;
    },
    rotationProfile() { return activeRotationProfile(state); },
    setRotationProfile(profile) {
      if (profile === 'dps' && !playerHasDpsProfile(state)) {
        return { ok: false, reason: 'Only a tank or healer spec has a second rotation' };
      }
      state.rotationProfile = profile;
      return { ok: true };
    },
    hasDpsRotationProfile() { return playerHasDpsProfile(state); },

    // ---- named profiles: as many as the player wants -----------------------------------
    hasPvpRotationBand() { return playerHasPvpBand(); },
    rotationProfiles() {
      ensureProfileList(state, ds);
      syncActiveFromMirror(state);
      return (state.rotationProfiles ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        active: p.id === activeProfile(state)?.id,
      }));
    },
    addRotationProfile(opts) {
      ensureProfileList(state, ds);
      if (opts?.mode === 'pvp' && !playerHasPvpBand()) {
        const spec = primarySpec(state.char, ds, playerRotationBand()) || 'no tree';
        return { ok: false, reason: `No PvP list is authored for ${spec} at level ${state.char.level}` };
      }
      const made = addProfile(state, {
        name: opts?.name,
        copyFromId: opts?.copyFromId,
        // "start from the recommended list for a band" — the template path. `mode: 'pvp'` is the
        // player's way to reach the authored pvp bands, which only bot seats could select before.
        ...(opts?.mode === 'pvp' || opts?.fromBand !== undefined
          ? {
            rotation: buildPlayerDefaultRotation(
              // `undefined` = the band the gate just asked about (playerProfileBand), so the list is
              // built for the tree the editor shows; `null` was autodetect-from-talents and disagreed.
              opts?.fromBand,
              undefined,
              opts?.mode ? { mode: opts.mode } : undefined,
            ),
          }
          : {}),
      });
      if (!made) return { ok: false, reason: `At most ${MAX_ROTATION_PROFILES} rotations` };
      return { ok: true, id: made.id, name: made.name };
    },
    renameRotationProfile(id, name) {
      ensureProfileList(state, ds);
      return renameProfile(state, id, name)
        ? { ok: true }
        : { ok: false, reason: 'No such rotation' };
    },
    deleteRotationProfile(id) {
      ensureProfileList(state, ds);
      return removeProfile(state, id)
        ? { ok: true }
        : { ok: false, reason: 'Cannot delete your only rotation' };
    },
    selectRotationProfile(id) {
      ensureProfileList(state, ds);
      return setActiveProfile(state, id)
        ? { ok: true }
        : { ok: false, reason: 'No such rotation' };
    },
    moveRotationProfile(from, to) {
      ensureProfileList(state, ds);
      return moveProfile(state, from, to) ? { ok: true } : { ok: false, reason: 'Bad index' };
    },
    rotationSpec() { return state.rotationSpec ?? null; },
    effectiveRotationSpec() {
      return primarySpec(state.char, ds, playerRotationBand());
    },
    setRotationSpec(spec) {
      // null / unknown => auto (derive from talents). Accepts exact tree names, case-insensitive
      // names, and MD aliases (e.g. "feral" / "frost leveling") via resolveTalentTreeName.
      const trees = ds.talentTrees(state.char.cls);
      state.rotationSpec = spec == null || String(spec).trim() === ''
        ? null
        : resolveTalentTreeName(state.char.cls, trees, spec);
      // Applying a spec is an explicit action, like "reset to recommended": rebuild the default.
      state.rotation = buildPlayerDefaultRotation(playerRotationBand());
      return state.rotation;
    },
    // True when the player's HAND-EDITED rotation no longer matches the recommended default for
    // their current level/spec (the editor shows a non-destructive "reset to recommended" prompt).
    rotationNeedsRefresh() {
      const p = activeRotationProfile(state);
      const cur = playerRotationSlot(state, p);
      if (!cur || !cur.custom) return false;
      return rotationSigDiffers(
        cur, state.char, state.spellbook, ds, playerProfileBand(state, p), rotationBandOptionsOf(cur),
      );
    },
  };
}
