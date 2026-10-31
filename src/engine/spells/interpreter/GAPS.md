# RETIRED — incomplete C++ is not a "gap"

This file previously listed known `SpellEffects.cpp` / `SpellAuras.cpp` branches
(Bloodthirst AP%, Swiftmend, Ambush %, energize level scripts, etc.) as deferred
"GAPS." That was wrong.

**Policy (AI.md + grok-fleet standing rule 8):**

- CMaNGOS is not obfuscated. If Classic can cast it, the logic is in
  `../cmangos-classic` or the world DB — **port it**.
- Special-case branches inside a handler you ship **are the handler**, not SI4
  homework and not a GAPS table.
- Unclaimed opcodes (next SI wave) stay **unhandled** until that wave implements
  them. No permanent gap list.
- The only legitimate "cannot do" note is: you opened the real sources, the
  behavior is **absent there too**, and you explain why that is possible in
  Classic. That is almost never true for combat spells.

**Do not extend this file.** Finish ports in `handlers.ts` (and later SI batches)
with file:line citations and sourced fixtures. Delete remaining "deferred C++"
comments in favor of implementations.
