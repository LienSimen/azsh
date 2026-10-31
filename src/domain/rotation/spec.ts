// PURE: no DOM/RNG/Date. Spec resolution (generic talent-tree pick).
// Per-class finalizers and kit filters live under ./classes/.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import { spentInTree } from '../character/talents.ts';
import {
  CLASS_DEFAULT_SPEC,
  normalizeSpecKey,
  suggestionClassKeyFromClassId,
} from './rotationSuggestions.ts';

// Re-export class-owned APIs so existing `from './spec.ts'` / barrel paths stay stable.
export {
  finalizeHunterRangedPrimary,
  finalizePaladinSealJudge,
  reconcilePullStanceWithCombat,
  spellAllowedInRoleBucketFallback,
} from './classes/index.ts';

// Primary talent tree for band pick. An editor override wins when it names one of this class's
// trees; otherwise the tree with the most spent points, with a tie falling to the class default.
export function primarySpec(char: Character, ds: DataStore, override?: string | null): string {
  const classKey = suggestionClassKeyFromClassId(char.cls);
  const defaultSpec = classKey ? CLASS_DEFAULT_SPEC[classKey] : 'Unknown';
  const trees = ds.talentTrees(char.cls);
  // Canonicalize tree labels so "Feral Combat" (Classic tree) matches bands keyed "Feral".
  const canon = (name: string): string =>
    classKey ? normalizeSpecKey(classKey, name) : name;

  // An explicit override wins when it matches a tree by raw or canonical name. Role-facing band
  // labels that are not trees keep their key, and unknown labels fall through to autodetect.
  if (override && String(override).trim()) {
    const want = canon(override);
    const hit = trees.find((t) => t.name === override || canon(t.name) === want);
    if (hit) {
      // Tree match only when the override *is* that tree (Protection, Feral, …).
      // "Feral tank" normalizes distinctly from "Feral Combat" → keep the tank band key.
      if (want === canon(hit.name)) return canon(hit.name);
      return want;
    }
    // Non-tree role bands (Feral tank) or empty talent tables.
    if (!trees.length || want === 'Feral tank') return want;
  }
  if (!trees.length) return defaultSpec;

  const matchesDefault = (name: string): boolean => {
    if (name === defaultSpec) return true;
    if (!classKey) return false;
    return normalizeSpecKey(classKey, name) === normalizeSpecKey(classKey, defaultSpec);
  };

  let maxPts = 0;
  const ptsByTab = new Map<number, number>();
  for (const tree of trees) {
    const pts = spentInTree(char, tree.tabId, ds);
    ptsByTab.set(tree.tabId, pts);
    if (pts > maxPts) maxPts = pts;
  }
  if (maxPts <= 0) {
    // Prefer the actual tree name that aliases to the class default (not a phantom label).
    const defTree = trees.find((t) => matchesDefault(t.name));
    return defTree?.name ?? defaultSpec;
  }

  const leaders = trees.filter((t) => (ptsByTab.get(t.tabId) ?? 0) === maxPts);
  if (leaders.length === 1) return canon(leaders[0]!.name);
  const preferred = leaders.find((t) => canon(t.name) === defaultSpec);
  return preferred ? canon(preferred.name) : canon(leaders[0]!.name);
}
