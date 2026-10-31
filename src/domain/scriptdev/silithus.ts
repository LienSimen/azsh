// Silithus ScriptDevAI IR — npc_solenor (Stave of the Ancients hunter fight). Source:
// kalimdor/silithus.cpp.

import type { ScriptDevIR } from './types.ts';

const NPC_NELSON = 14536;
const NPC_SOLENOR = 14530;
const SPELL_SOUL_FLAME = 23272;
const SPELL_DREADFUL_FRIGHT = 23275;
const SPELL_CREEPING_DOOM = 23589;
const SPELL_CRIPPLING_CLIP = 23279;

export const NPC_SOLENOR_SCRIPT: ScriptDevIR = {
  name: 'npc_solenor',
  boundCreatures: [NPC_NELSON, NPC_SOLENOR],
  sourceFile: 'kalimdor/silithus.cpp',
  spellIds: [SPELL_SOUL_FLAME, SPELL_DREADFUL_FRIGHT, SPELL_CREEPING_DOOM, SPELL_CRIPPLING_CLIP],
  timers: [
    {
      id: 'soul_flame',
      spellId: SPELL_SOUL_FLAME,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      creatureEntry: NPC_SOLENOR,
      cite: 'silithus.cpp:107 DoCastSpellIfCan SPELL_SOUL_FLAME on Solenor Reset; :245 delay 150 ms first visible cast',
    },
    {
      id: 'creeping_doom',
      spellId: SPELL_CREEPING_DOOM,
      initialMinMs: 3000,
      initialMaxMs: 6000,
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'self',
      creatureEntry: NPC_SOLENOR,
      cite: 'silithus.cpp:112 Reset urand(3-6)s; :261-264 DoCastSpellIfCan CREEPING_DOOM re-arm 15000',
    },
    {
      id: 'dreadful_fright',
      spellId: SPELL_DREADFUL_FRIGHT,
      initialMinMs: 10_000,
      initialMaxMs: 15_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 20_000,
      target: 'victim',
      creatureEntry: NPC_SOLENOR,
      cite: 'silithus.cpp:111 Reset urand(10-15)s; :269-276 CAST_OK if victim >5 yd, re-arm urand(15-20)s',
    },
  ],
  spellHits: [
    {
      spellId: 14268,
      actions: [
        { kind: 'cast_self', spellId: SPELL_CRIPPLING_CLIP, castFlags: 1, cite: 'silithus.cpp:198 DoCastSpellIfCan CRIPPLING_CLIP CAST_TRIGGERED' },
      ],
      cite: 'silithus.cpp:196-200 SpellHit Wing Clip Rank 3 (14268)',
    },
  ],
  gossipHello: {
    defaultTextId: 0,
    cite: 'silithus.cpp:287-294 GossipHello quest 7636 incomplete → "Show me your real face, demon."',
  },
  cites: [
    'silithus.cpp:30-306 npc_solenorAI Nelson 14536 → Solenor 14530 UpdateEntry',
    'silithus.cpp:118-122 Transform UpdateEntry - gossip 10s, movement GAP',
  ],
};
