// Burning Steppes ScriptDevAI IR — Grark escort + Klinfran stave-demon. Source:
// eastern_kingdoms/burning_steppes.cpp.

import type { ScriptDevIR } from './types.ts';

const NPC_GRARK = 9520;
const NPC_FRANKLIN = 14529;
const NPC_KLINFRAN_ENTRY = 14534;
const SPELL_CAPTURE_GRARK = 14250;
const SPELL_FOOLS_PLIGHT = 23504;
const SPELL_DEMONIC_FRENZY = 23257;
const SPELL_ENTROPIC_STING = 23260;

export const NPC_GRARK_LORKRUB: ScriptDevIR = {
  name: 'npc_grark_lorkrub',
  boundCreatures: [NPC_GRARK],
  sourceFile: 'eastern_kingdoms/burning_steppes.cpp',
  spellIds: [SPELL_CAPTURE_GRARK],
  timers: [],
  cites: [
    'burning_steppes.cpp:37-336 npc_grark_lorkrubAI escort quest 4121',
    'burning_steppes.cpp:59 SPELL_CAPTURE_GRARK 14250 — quest item, not a combat timer',
  ],
};

export const NPC_KLINFRAN_SCRIPT: ScriptDevIR = {
  name: 'npc_klinfran',
  boundCreatures: [NPC_FRANKLIN, NPC_KLINFRAN_ENTRY],
  sourceFile: 'eastern_kingdoms/burning_steppes.cpp',
  spellIds: [SPELL_FOOLS_PLIGHT, SPELL_DEMONIC_FRENZY, SPELL_ENTROPIC_STING],
  timers: [
    {
      id: 'demonic_frenzy',
      spellId: SPELL_DEMONIC_FRENZY,
      initialMinMs: 5000,
      initialMaxMs: 5000,
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'self',
      creatureEntry: NPC_KLINFRAN_ENTRY,
      cite: 'burning_steppes.cpp:416 Reset frenzy=5000; :535-541 CAST_OK re-arm 15000 + EMOTE_FRENZY',
    },
  ],
  spellHits: [
    {
      spellId: 14277,
      actions: [
        { kind: 'remove_auras', spellId: SPELL_DEMONIC_FRENZY, cite: 'burning_steppes.cpp:487 RemoveAurasDueToSpell DEMONIC_FRENZY' },
        { kind: 'cast_self', spellId: SPELL_ENTROPIC_STING, castFlags: 1, cite: 'burning_steppes.cpp:488 DoCastSpellIfCan ENTROPIC_STING CAST_TRIGGERED' },
      ],
      cite: 'burning_steppes.cpp:485-489 SpellHit Scorpid Sting Rank 4 (14277)',
    },
  ],
  gossipHello: {
    defaultTextId: 0,
    cite: 'burning_steppes.cpp:550-557 GossipHello quest 7636 incomplete → "Show me your real face, demon."',
  },
  cites: [
    'burning_steppes.cpp:347-583 npc_klinfranAI Franklin 14529 → Klinfran 14534 UpdateEntry',
    'burning_steppes.cpp:423-426 Transform UpdateEntry(NPC_KLINFRAN_THE_CRAZED) - gossip 10s, movement GAP',
  ],
};
