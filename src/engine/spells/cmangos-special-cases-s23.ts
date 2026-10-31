// Stage s23: Chromaggus' Elemental Shield dummy strips any of the five school shields already on him,
// then casts one at random. Cite: SpellEffects.cpp:819-829; boss_chromaggus.cpp:111-117.

/** SpellEffects.cpp:820 case 22276 Elemental Shield. */
export const ELEMENTAL_SHIELD_DUMMY_SPELL_ID = 22276;

// The five elemental shield payloads, in the C++ array order. Each bakes damage taken down 75% on the
// magic mask and up 1100 on one school, until cancelled. Cite: SpellEffects.cpp:822.
export const ELEMENTAL_SHIELD_PAYLOAD_SPELL_IDS = [22277, 22278, 22279, 22280, 22281] as const;

// `elemshields[urand(0, 4)]`. `roll01` is [0,1); absent rng should pass 0 (first payload). Cite:
// SpellEffects.cpp:827.
export function pickElementalShieldSpellId(roll01: number): number {
  const n = ELEMENTAL_SHIELD_PAYLOAD_SPELL_IDS.length;
  let i = Math.floor(roll01 * n);
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  return ELEMENTAL_SHIELD_PAYLOAD_SPELL_IDS[i]!;
}

/** SpellEffects.cpp:993-1010 case 23195 Dragondog Breath Selection. */
export const CHROMAGGUS_BREATH_SELECTION_SPELL_ID = 23195;
/** blackwing_lair.h:21 TYPE_CHROMA_LBREATH. */
export const TYPE_CHROMA_LBREATH = 9;
/** blackwing_lair.h:22 TYPE_CHROMA_RBREATH. */
export const TYPE_CHROMA_RBREATH = 10;
// Left combat breaths. Cite: SpellEffects.cpp:1003 leftBreaths[] then blackwing_lair.cpp:629-634
// InitiateBreath 8446-8450.
export const CHROMAGGUS_LEFT_BREATHS = [23187, 23308, 23310, 23313, 23315] as const;
// Right combat breaths. Cite: SpellEffects.cpp:1007 rightBreaths[] then blackwing_lair.cpp:635-639
// InitiateBreath 8451-8455.
export const CHROMAGGUS_RIGHT_BREATHS = [23189, 23309, 23312, 23314, 23316] as const;

// `rightBreath = urand(0,4); leftBreath = (rightBreath + urand(1,4)) % 5`. `rightRoll`/`offsetRoll` are
// [0,1). Cite: SpellEffects.cpp:999-1000.
export function pickChromaggusBreathPair(
  rightRoll: number,
  offsetRoll: number,
): { left: number; right: number } {
  const n = CHROMAGGUS_LEFT_BREATHS.length;
  let right = Math.floor(rightRoll * n);
  if (right < 0) right = 0;
  if (right >= n) right = n - 1;
  let off = 1 + Math.floor(offsetRoll * (n - 1));
  if (off < 1) off = 1;
  if (off > n - 1) off = n - 1;
  const left = (right + off) % n;
  return {
    left: CHROMAGGUS_LEFT_BREATHS[left]!,
    right: CHROMAGGUS_RIGHT_BREATHS[right]!,
  };
}
