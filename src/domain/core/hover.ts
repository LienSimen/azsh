/** SPELL_AURA_HOVER SetHover. Cite: SpellAuras.cpp:1681–1688; Unit.cpp:12428–12438; Object.h:750. */

/** Cite: Object.h:750 MOVEFLAG_HOVER. */
export const MOVEFLAG_HOVER = 0x40000000;

/** Cite: Unit.cpp:12428–12438 SetHover Add/RemoveMovementFlag. */
export function setHover(moveFlags: number, enable: boolean): number {
  return enable ? (moveFlags | MOVEFLAG_HOVER) : (moveFlags & ~MOVEFLAG_HOVER);
}

/** Cite: Unit.h:1788 IsHovering HasMovementFlag(MOVEFLAG_HOVER). */
export function isHovering(moveFlags: number): boolean {
  return (moveFlags & MOVEFLAG_HOVER) !== 0;
}
