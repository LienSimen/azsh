# azsh port plan

What the terminal is still missing from phonecraft, and the order to bring it over. This file is the
checklist: a session should take the next unchecked item, build it as a screen in `src/cli/tui*.mjs`,
add a scenario to `src/cli/tuiCheck.mjs`, run `npm run check:all`, tick the box and commit.

Ground rules (from memory and `README.md`):

- azsh owns only `src/cli`. Engine, domain, world, quest, autopilot and data fixes land in
  phonecraft and get re-copied with `node scripts/sync-phonecraft.mjs` (path argument or `PHONECRAFT`,
  default `../../code/phonecraft`; `--dry` lists the changes). The script skips web-only and audio files,
  keeps the two azsh-only world shims (`bakeSlug.ts`, `navmeshFloors.ts`) and re-applies the azsh patches
  (the shim imports in `dungeonWingRooms.ts`, the autopilot rest thresholds in `autopilot/config.ts`).
- Build screens, not scrollback. Cursor list, detail pane, dialogs on the stack, `:` verbs as the escape hatch.
- Every feature below names the facade methods it needs. All of them already exist on `Game`
  (`src/engine/game/types.ts:447`). Nothing here requires new engine rules unless marked **engine**.

## Why the gap exists

Measured 2026-10-31: the `Game` facade has 379 methods, the terminal calls 116. The port was built one
prompted screen at a time and never diffed against the facade. There is no technical reason for the
gap. The web client's own logic that is *not* in the facade (autopilot loop, live floor walk, battleground
driver, arena settlement, mail-to-alt) is the only part that needs real porting work.

Phonecraft's UI is the reference for every item. The click handlers are `src/ui/app/appInteractClickA.ts`,
`appInteractClickB.ts`, `appInteractInputB.ts` and `appInteractCore.ts`; the panel files are named per item.

## Phase 0: engine fixes to make in phonecraft first

- [x] `fight(entry)` takes no `withSquad`. Add `opts` for parity with `beginFight` so the quick-fight
      key and the REPL `fight` verb can bring the squad. (`src/engine/game/combatSession.ts:3202`)
- [x] Durability fallback: on a solo fight `result.allies` is undefined and `allyDied` falls back to the
      player's death, so a benched companion pays the 10% death wear. Guard it so only allies who were
      in the session pay. (`combatSession.ts:2846`)
- [x] Companion professions: `unlearnCompanionProfession` on the last line leaves `professions: {}`,
      which `companionSkillMap` reads as unassigned; `learnCompanionProfession` accepts a primary below
      level 5 that `companionSkillMap` then drops. (`src/engine/game/squadDungeon.ts`)
- [x] Re-copy `src/engine`, `src/domain`, `src/world`, `src/quests`, `src/progression`,
      `src/persistence`, `src/autopilot`, `src/data` into azsh; keep the two world shims; run
      `npm run data:pack` if data changed; `npm run check:all`.

## Phase 1: companions fight beside you in the world

Engine status: done. `beginFight(entry, { withSquad: true })` folds seated companions in as real allies on
the same path dungeon pulls use (`combatSession.ts:1417`). Party auras, threat, roles, rotations,
companion XP and reputation on the kill, and per-ally durability all already work. Outdoor fights are solo
only because no caller asks.

- [x] **Squad mode setting.** Three modes, stored in the autopilot config the engine already has:
      Solo (`questSquadAlways=false, questEliteMode!='squad'`), Elites (`questEliteMode='squad'`),
      Party (`questSquadAlways=true`). Mirror `src/ui/panels/squadModePicker.ts`. Put it on the
      Companions tab header and as `:squad solo|elites|party`.
- [x] **Manual fights.** `tuiFight.mjs:19` passes `{ withSquad }` from the rule
      `squad.length > 0 && (always || (mode==='squad' && creatureRank(ds, entry) > 0))`
      (phonecraft `src/ui/autopilot/autopilotController.ts:1039`).
- [x] **Autopilot fights.** Same rule in the driver (`repl.mjs:547` `createAutopilot`), both the live
      path and the `g.fight` path. Also honour `prog.eliteNeedsSquad` from `plan.ts:175`.
- [x] **Quick fight and REPL verb.** `f` on World and `:fight` use `fight()`; after Phase 0 pass opts,
      or until then call `beginFight` + `session.runToEnd()` + `resolveFight`.
- [x] **Combat log names.** `tuiFight.mjs:24` only names player and enemy. Map `ally_N` sides through
      `allyIndexOfSide` (`src/engine/core/events.ts:50`) to `state.squad[i].name`; pets after the humans
      (`squadBattleParty().allyPetIndex`). Pattern: `runFullDungeon.ts:340`.
- [x] **Ally frames.** `alliesView()` is already drawn at `tuiFight.mjs:129`. Add role glyph, target
      and a dead marker; keep frames stable when four allies plus pets are present (height budget).
- [x] **Pre-pull.** Call `applyPrePullBuffs()` and `refreshPartyWeaponCoats()` before a squad fight
      when buffs are missing (the autopilot in phonecraft does this in `prepOoc`).
- [x] **In-fight orders (second pass).** `session.setAllyTarget`, `queueAllyAction`, `setUnitStance`
      behind a `t` targeting dialog; not needed for v1.
- [x] **Check.** tuiCheck scenario: hire two companions, set Party, Enter on a creature, assert ally
      frames and `ally_0` lines in the log, companion XP rises.

## Phase 2: dungeons as a text run

Engine shape (from `src/world/instances.ts`, `dungeonRoute.ts`, `dungeonRouteOrder.ts`): a dungeon is an
`InstanceDef` with an ordered encounter list. There is no room graph with exits. Each encounter has a
`roomName` (WMO box), a kind (trash, boss, object, rare, entrance, exit), a pack, optional patrol path,
`requiresFlag`/`setsFlag` gates and `objectGate` events for doors. `enterInstance` materialises a route
(`bosses` or `full` density), `isUnlocked` says which stops you may pull, `nextEncounter` suggests one.
Two run modes exist: sequential route (what `runFullDungeon` and `liveDungeonHeadless` use) and
continuous floor (nav mesh, aggro radius, patrol ticks; the canvas walk). **Build v1 on the sequential
route.** The continuous floor needs the nav bake loaded through `fetch` and 1,850 lines of UI
orchestration; skip it until the route run is fun.

"Say which way to go, see what you engage" maps onto the route as: a room is the run of consecutive
route stops that share a `roomName` (`roomSequence(route)` in `dungeonRouteOrder.ts:969`); the choices
offered are the uncleared stops whose `isUnlocked` is true, grouped by room, with the suggested one
first; engaging a stop runs it through the live fight view.

- [x] **2a Entry.** World tab: list portals from `world/instances:instancePortals` with `canEnter` and
      `lockRemainingMs`; `Enter` → `enterInstance(id, now, { routeDensity, asRaid, entranceTriggerId })`.
      Offer density (Bosses / Full) and Party / Raid. Replace the stub at `tuiViews.mjs:734`.
      Reference: `src/ui/views/worldView.ts:655`.
- [x] **2b Run screen.** A window (not a tab) while `state.instance` is set: header with dungeon, room,
      cleared/total, party frames; list of rooms with their stops (kind glyph, pack size, cleared,
      locked and by which flag, boss); detail pane shows the pack's creatures and boss intro text.
      `Enter` on an unlocked stop → `applyPrePullBuffs`, `beginEncounter(def.id, enc.id, { withSquad: true })`,
      live fight via `startFight` in `tuiFight.mjs`, then `resolveFight`. On a wipe: death flow as outdoors,
      retry allowed. Reference: `src/ui/views/instanceView.ts`, `src/ui/live/liveDungeonHeadless.ts:208`.
- [x] **2c Pull +1.** `p` during a fight → `pullAdditionalPack(dungeonId, session)` (next route trash
      pack joins the open session, never a boss).
- [x] **2d Objects.** Doors and levers from `objectGate` events → `useInstanceObject(goEntry)`; chests
      from `def.lootObjects` → `lootInstanceObject(goGuid)`; instance NPCs via `talkToNpc`,
      `acceptQuest`, `turnInQuest`, `finishEscort`. Show them as rows in the current room.
- [x] **2e Rest and supplies.** Between pulls `z` rests through `regenTick`; the run-supply ladder
      before entry (`runSupplyPlan`, `buyRunSupplies`, reference `src/ui/panels/runSupplyPanel.ts`).
- [x] **2f Finish instantly and summary.** `F` → loop remaining stops headlessly the way
      `finishDungeonHeadless` does (`beginEncounter` + `runToEnd` + `resolveFight`), or the whole run
      through `runFullDungeon({ keepLogs })`. End screen from `domain/run/dungeonRun:buildRunSummary`
      (pulls, deaths, loot, per-member damage and healing from `memberStatsFromEvents`).
- [x] **2g Leave, reset, lockouts.** `leaveInstance(now)` holds a 5-man for 30 min; `resetInstance`;
      show lockouts on the portal row.
- [x] **2h Raids.** Enter as raid, instance roster (`setInstanceRoster`, `fillInstanceRoster`,
      `clearInstanceRoster`, reference `src/ui/views/instanceRosterPicker.ts`), raid lineups 10/20/40
      (`setRaidLineup`, `fillRaidLineup`, `clearRaidLineup`), PallyPower board (`paladinBoard`,
      `stepPaladinBlessing`, `stepPaladinAura`, `autoSortPaladinAssignments`, `refreshPaladinBuffs`).
- [ ] **2i Patrols and the continuous floor (later).** Needs `ContinuousWorld`
      (`src/world/continuousDungeon.ts`), a nav mesh loader that reads from disk instead of `fetch`
      (`src/ui/dungeon/dungeonNavBakeLoader.ts:41`), `tickDungeonPatrolScripts`, and the pull lifecycle
      in `src/ui/live/livePullLifecycle.ts` and `liveAggroStream.ts`. Also the scripted dungeons
      (Stratholme timers, gauntlets and escorts in `live/liveStratUndead.ts`, `liveGauntletEscort.ts`).
- [x] **Check.** tuiCheck scenario: enter Ragefire Chasm or Deadmines with a squad, clear two stops,
      use one gate, finish headlessly, assert summary and lockout.

## Phase 3: the rest of the facade, by area

Size: S is an afternoon as a dialog on an existing tab, M is a new window, L is UI logic to re-host.
"Ref" is the phonecraft UI file to read.

### Companions (tab exists; `tuiCompanions.mjs` header says bars, talents, pets, raids were left out)

- [x] S  Spec, off-heal, XP lock, AoE mode, everyone-AoE: `setCompanionSpec`, `setCompanionOffHeal`,
      `setCompanionXpLocked`, `setCompanionAoeMode`, `setAllCompanionsAoeMode`. Ref `panels/companionsPanel.ts`.
- [x] S  Hire search by name or class: `searchInnCandidates`.
- [x] M  Companion rotation editor: reuse the Rotation tab with a crafter-style "whose rotation" switch.
      `companionRotation`, `setCompanionRotation`, `resetCompanionRotation`, profiles
      (`companionRotationProfiles`, `add/rename/delete/selectCompanionRotationProfile`). Ref
      `rotation/rotationEditor.ts`.
- [x] M  Companion action bars and kit: `companionActionBars`, `add/removeCompanionActionBar`,
      `resetCompanionActionBars`, `setCompanionActionSlot`, `setCompanionItemActionSlot`. Ref
      `panels/companionKitPanel.ts`. (Bars feed the autopilot's prep items; rotations drive the fight.)
- [x] S  Companion quests: `companionQuestOffers`, `accept/turnIn/abandonCompanionQuest`.
- [x] S  Companion bag verbs: `useCompanionItem`, `discardCompanionBagStack`,
      `disenchantCompanionBagStack`, `sellCompanionItemStack`, `sellCompanionJunk`,
      `companionJunkSellPreview`, `buyBackCompanionStack`, `moveItemBetweenBots`, `giveItemToBot`,
      `takeItemFromBot`. Add to the Companion page and the vendor's companions mode.
- [x] S  Companion bank and party vault: `companionBankDepositStack`, `companionBankWithdrawStack`,
      `buyCompanionBankSlot`, `equip/unequipCompanionBankBag`, `takeFromPartyStorage`.
- [x] S  Consumable sharing: `squadConsumableDetail`, `applySquadConsumablePlan`,
      `consumableShareState`, `consumableShareMembers`, `setConsumableShareRule/Scope/IncludeYou/Cat`.
- [x] S  Companion pets: `setCompanionPet`, `setCompanionPetAutocast`,
      `learnPetSpellFromItemOnCompanion`, `learnSpellFromItemOnCompanion`.
- [x] S  Talent link for a companion: `setCompanionTalentLink` (needs the talent-link text input).
- [x] S  Tavern duel against a companion: `tavernDuel(id)` into the live fight view, `sess.forfeit`.

### Pets (hunter, warlock)

- [x] M  Pet page under Character or a `Pet` row on World: `tamePet` (World row on tameable beasts),
      `dismissPet`, `feedPet`, `setPetAutoFeed`, `setPetCommand`, `setPetReact`, `togglePetAutocast`.
      Ref `views/playChrome.ts` feed modal, `render/petBar.ts`.
- [x] S  Stable master in cities: `stablePet`, `callStabledPet`, `buyStableSlot`. Ref `panels/stablePanel.ts`.
- [x] S  Pet trainer: `buyPetSpell`, `teachPetSpell`, `trainPet`; list via `world/world:zonePetTrainers`.
- [x] S  Warlock shard cap: autopilot config field. Pet frame in fights already renders `petView()`.

### Items, bags, gear

- [x] S  Loot window with hold: `resolveFight(sess, { holdLoot: true })`, `pendingLoot`, `takeLoot`,
      `takeLootMoney`, `takeAllLoot`, `closeLoot`; an auto-loot toggle keeps today's behaviour.
- [x] S  Bag housekeeping: `moveItem`, `sortContainer`, split stacks, `discardBagStack`,
      `discardKeyringStack`, `openContainerItem`, `consumeItemAll`, `wrapItem`, `unwrapItem`,
      `learnSpellFromItem`, `learnProfessionRankFromItem`.
- [x] S  Bulk: bulk disenchant and bulk learn. Ref `panels/bagBulkPanel.ts`, `app/appInteractBulkBags.ts`.
- [x] S  Ammo: `setAmmo`, `clearAmmo` on the Gear tab for ranged users.
- [x] S  Auto consumables: `setAutoConsumable`, `clearAutoConsumable`.
- [x] M  Outfitter (gear sets): `ensureOutfitter`, `createOutfit`, `rename/deleteOutfit`,
      `rebuildOutfit`, `selectOutfit`, `wearOutfit`, `unwearOutfit`, `setOutfitSlot`,
      `setOutfitSlotsAll`, `setOutfitDisabled`, `outfitterState`. Ref `panels/outfitterPanel.ts`.
- [x] S  Filters and helpers (a Settings window): `equipmentHelperConfig`/`setEquipmentHelperConfig`,
      `gatherFilterConfig`, junk filter and auto-DE configs (global and character), `runAutoJunk`,
      `autoDisenchantUpgrades`. Ref `panels/settingsPanel.ts` Loot tab.
- [x] S  Repair one slot and repair quote on the Gear tab: `repairSlot`, `repairQuote`.
- [x] S  Vendor buyback tab and `sellItemStack`, `junkSellPreview`. Ref `panels/vendorPanel.ts`.

### Spells, action bars, macros

- [x] M  Action bars with keybinds, so the in-fight number row is the player's own bar instead of the
      ability list: `addActionBar`, `removeActionBar`, `setActionSlot`, `setItemActionSlot`,
      `setMacroActionSlot`, `setActionKey`. Ref `views/hudActionBarPaint.ts`, `combat/actionBarModel.ts`.
- [x] S  Global action bar: `setGlobalItemSlot`, `setGlobalOutfitSlot`, `clearGlobalActionSlot`,
      `fireGlobalActionBar`, `fireGlobalActionSlot`.
- [x] M  Macros: `macros`, `macroById`, `macroByName`, `saveMacro`, `deleteMacro`, plus the two hosts
      (`macros/macroHostWorld.ts`, `macroHostCombat.ts`) over `domain/macro`. Terminal editor is a
      text field; templates from `macros/macroTemplates.ts`.
- [x] S  Cancel an aura (`cancelAura`, `canCancelAuraNow`) from the Character tab and the fight view.
- [x] S  Pick pocket on World for rogues: `castOutOfCombat(spell, { targetCreature })`, on resist
      start the fight with `{ withSquad, noAoe }`.

### Rotation and talents

- [x] S  Rotation profiles: `rotationProfiles`, `add/rename/delete/selectRotationProfile`.
- [x] S  Premade specs, saved builds and talent links: `applyPremadeSpec`, `saveTalentBuild`,
      `deleteTalentBuild`, `applyTalentBuild`, `applyTalentLink`.
- [x] M  Target dummy sim lab: `domain/sim/dummySim`, `targetDummy`. Ref `rotation/rotationSimLab.ts`.
- [x] S  Autopilot settings window: every `AutopilotConfig` field as a form (thresholds, pull counts,
      squad mode, quest policy, shard cap). Ref `rotation/rotationEditorAuto.ts`, `autopilot/runDials.ts`.

### World and travel

- [x] M  Real-time journeys instead of `travelPace: 'instant'`: `journeyTick` in the game loop,
      `journeyStatus` in the header, `cancelJourney`, `setJourneySpeed`, `setIdlePaused`, and a
      "skip" that calls `completeJourneyNow`. Remove the instant calls at `repl.mjs:132`, `tui.mjs:86`,
      `tuiViews.mjs:224/727/732`.
- [x] S  Offline rest on load: `accrueOfflineRest`.
- [ ] S  Mounts and riding: `useMount`, `dismount`, `trainRiding`.
- [ ] S  Objects as World rows (chests, books, meeting stones, banners): `interactObject` from the UI,
      not only the autopilot; book paging.
- [ ] S  Quests: `repeatQuest`, gray-log abandon, chain follow-up offers
      (`quests/quests:grayLogQuests`, `chainFollowUpOffer`), item-started quests
      (`bagQuestStartState`).
- [ ] S  Reputation window: `setFactionAtWar`, `setFactionInactive`, `setWatchedFaction`,
      `atWarFactions`. Ref `panels/reputationPanel.ts`.
- [ ] S  Meeting stone queue: `applyMeetingStoneQueue` from the stone's gossip, queue card,
      `leaveMeetingStoneQueue`. Ref `views/meetingStoneQueueView.ts`, `appInteractClickA.ts:1094`.
- [ ] S  Attack-farm chain ("fight this again until stopped") in the fight view. Ref
      `combat/attackFarmLoop.ts`.
- [ ] S  Profession specialisations: `selectProfessionSpec`, `professionSpecGossip`; `craftAll`.

### Bank, mail, auction

- [ ] S  `unequipBankBag`, `bankDeposit` by entry, `returnMail`.
- [ ] M  Mail to your own alt: pick a save in `~/.azsh/saves`, `sendMailBatch({ recipientMailbox,
      crossFaction })`, save the other slot through `fileRepository.mjs`. Ref `appInteractInputB.ts:1474`.

### PvP

- [ ] S  Honor window: rank, kills, weekly standing from `domain/run/honor` and `honorWeek`;
      `runWeeklyHonorPass` and `bankWeeklyHonor` in the game loop; City Defender ports via
      `classTravelOptions`. Ref `panels/honorPanel.ts`.
- [ ] M  Arena duel and team matches into the live fight view: `arenaDuel()`, `arenaMatch({ bracket,
      allies })`, then `settleArenaDuel`, `settleArenaRating`, `awardDuelHonor`, `awardArenaWinHonor`.
      Settlement logic lives in `src/ui/app/app.ts:1861`; port it into `tuiFight.mjs`.
- [ ] L  Warsong Gulch and Arathi Basin: `enterBattleground`, `leaveBattleground`, and the match
      driver in `src/ui/bg/bgScreen.ts` over `domain/bg/*` (`BgWorld`, `BgMatch`, `wsg`, `ab`). The
      map is graphical; the objective state and fights are not. Text form: objectives list, your
      assignment, engage.
- [ ] M  Alterac Valley: `enterInstance(avInstanceIdFor(team), now, { asRaid: true })`; it is a raid
      run and rides on Phase 2.
- [ ] S  Outdoor PvP world states (Eastern Plaguelands towers) as a World row; capture already
      happens through `interactObject`.

### Wiki, saves, dev

- [ ] M  Wiki window: item, spell, quest, NPC, talent, recipe, zone, dungeon, object, faction lookup
      from the DataStore, `/` search, cross-links. Ref `wiki/wikiView.ts` and siblings. This is
      the single biggest quality-of-life gain for a text game.
- [ ] S  Saves: backup, restore, export, import, delete from the picker.
- [ ] S  `:dev` verbs: `devGrantItem`, `devCompleteQuest`, `devLearnRecipe`, `devLearnProfession`,
      random world-bot character (`newGameStateFromWorldBot`, `pickRandomWorldBot`).

### Not porting

Audio, map tiles and viewports, canvas floor walk and camera, paperdoll sprites, tactical overlay,
path and route editors, nav debug, onboarding tutorial, bug reporter, and everything under `src/net`
(social hub, online party, guild, trade window, server mail and auction). Those are either graphics
or a multiplayer server the terminal does not talk to.

## Working the list

Each item is one session-sized task. A prompt that needs no further steering is:

> Work the next unchecked item in PORT-PLAN.md. Read the phonecraft reference file named on the item,
> build it as a screen in src/cli, add a tuiCheck scenario, run npm run check:all, tick the box, commit.

Items within a phase are independent, so several can run in parallel on worktrees as long as they touch
different `tui*.mjs` files. Phase 1 should go first: it is small and every later fight-related screen
assumes the squad can be present. Phase 2a to 2g is one feature and should be one branch.
