// Combustion 11129 and its stacking child 28682.
// Cite: UnitAuraProcHandler.cpp:991-1003; SpellAuras.cpp:1386-1390; Unit.cpp:5372-5375.

/** The player-cast holder: DUMMY aura + TRIGGER_SPELL 28682, procCharges 3, procFlags 0x10000. */
export const COMBUSTION_SPELL_ID = 11129;
/** The stacking crit child: aura 107 op 7 (CRITICAL_CHANCE) FLAT +10, StackAmount 10. */
export const COMBUSTION_STACK_SPELL_ID = 28682;
/** spell_template 28682 EffectBasePoints 9 + EffectBaseDice 1. */
export const COMBUSTION_CRIT_PER_STACK = 10;
/** spell_template 28682 StackAmount. */
export const COMBUSTION_MAX_STACKS = 10;
/** SpellMgr spell_proc_event 11129 schoolMask — fire only. */
export const COMBUSTION_SCHOOL = 'fire';
