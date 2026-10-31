// Gap-fill skinNode for beasts with SkinningLootId=0 that share a family with skinned peers (Black
// Bear 1129, family-7 carrion birds). Reuses an already-baked gather node — no invented loot rows.

import type { CreatureDef, GatherNodeDef } from './schema.ts';

export type SkinPeer = { entry: number; level: number; family: number; node: number };

export type SkinGapFill = {
  invalidate(): void;
  resolve(creatureEntry: number): number | undefined;
};

export function createSkinGapFill(
  skinnable: Map<number, number>,
  gatherNodes: Map<number, GatherNodeDef>,
  creatureOf: (entry: number) => CreatureDef | undefined,
): SkinGapFill {
  let peers: SkinPeer[] | null = null;
  let families: Set<number> | null = null;

  const ensure = (): { peers: SkinPeer[]; families: Set<number> } => {
    if (peers && families) return { peers, families };
    const nextPeers: SkinPeer[] = [];
    const nextFamilies = new Set<number>();
    for (const [entry, node] of skinnable) {
      if (!gatherNodes.has(node)) continue;
      const c = creatureOf(entry);
      if (!c || c.creatureType !== 1) continue;
      const family = c.family ?? 0;
      const level = c.level ?? c.scaling?.minLevel ?? 1;
      nextPeers.push({ entry, level, family, node });
      if (family > 0) nextFamilies.add(family);
    }
    peers = nextPeers;
    families = nextFamilies;
    return { peers, families };
  };

  return {
    invalidate() {
      peers = null;
      families = null;
    },
    resolve(creatureEntry: number) {
      const direct = skinnable.get(creatureEntry);
      if (direct != null) return direct;
      const c = creatureOf(creatureEntry);
      if (!c || c.creatureType !== 1) return undefined;
      const family = c.family ?? 0;
      if (family <= 0) return undefined;
      const { peers: p, families: f } = ensure();
      if (!p.length || !f.has(family)) return undefined;
      const level = c.level ?? c.scaling?.minLevel ?? 1;
      const same = p.filter((x) => x.family === family && Math.abs(x.level - level) <= 5);
      const pool = same.length ? same : p;
      let best: SkinPeer | null = null;
      let bestD = Infinity;
      for (const x of pool) {
        const d = Math.abs(x.level - level);
        if (d < bestD || (d === bestD && best != null && x.entry < best.entry)) {
          bestD = d;
          best = x;
        }
      }
      return best?.node;
    },
  };
}
