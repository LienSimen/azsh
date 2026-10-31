// Paladin ActiveSeal state + pre-pull seed shape.
// Peeled from types.ts (filesize). Cite: applySpellLate seal; paladin-seals.ts; KI-894.

import type { School } from '../../data/schema.ts';

// The paladin's currently-active seal, one at a time: set when a seal effect is cast, read by the
// swing phase and by Judgement. Mirrored into buffActive so the rotation sees a present buff.
export interface ActiveSeal {
  spellId: number;
  name: string;
  seal: 'righteousness' | 'command' | 'light' | 'wisdom' | 'justice' | 'crusader';
  coeff?: number;
  procPpm?: number;
  onSwingWeaponPct?: number;
  onSwingHeal?: number;
  onSwingMana?: number;
  judge?: {
    school: School;
    min: number;
    max: number;
    halveIfNotStunned?: boolean;
    /** Judgement damage carrier id (JoR/JoC). Cite: JudgementBurst.spellId. */
    spellId?: number;
    // effectBonusCoefficient[0] of that carrier, resolved where the data store is reachable. The
    // burst rolls from the min/max tables, so without this it takes no spell power at all.
    coeff?: number;
    debuffSpellId?: number;
    debuffName?: string;
    debuffDurationMs?: number;
    onHitHeal?: number;
    onHitMana?: number;
    /** Judgement of the Crusader flat spell/holy damage taken. Cite: Spell.sql aura 14. */
    spellTaken?: number;
  };
  expiresAt: number;
}

/** OOC seal import: same payload as ActiveSeal with wall-clock remainingMs (combat t=0). */
export type StartActiveSeal = Omit<ActiveSeal, 'expiresAt'> & { remainingMs: number };
