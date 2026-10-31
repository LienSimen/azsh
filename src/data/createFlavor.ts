// Classic character-create lore strings from Interface/GlueXML/GlueStrings.lua — keys match
// FACTION_INFO_*, RACE_INFO_* (undead = SCOURGE), CLASS_*. Not the CLASS_BLURB tooltips.

import { RACE, CLASS } from './schema.ts';

/** Trim leading glue indent + collapse internal runs of spaces; keep paragraph form. */
function cleanGlue(s: string): string {
  return s
    .replace(/^\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const FACTION_INFO_ALLIANCE = cleanGlue(`
  The Alliance consists of four races: the noble humans, the adventurous dwarves, the enigmatic night elves, and the ingenious gnomes. Bound by a loathing for all things demonic, they fight to restore order in this war-torn world.
`);

const FACTION_INFO_HORDE = cleanGlue(`
  Four races comprise the Horde: the brutal orcs, the shadowy undead, the spiritual tauren, and the quick-witted trolls. Beset by enemies on all sides, these outcasts have forged a union they hope will ensure their mutual survival.
`);

const RACE_INFO: Record<number, string> = {
  [RACE.HUMAN]: cleanGlue(`
    Humans are a young race, and thus highly versatile, mastering the arts of combat, craftsmanship, and magic with stunning efficiency. The humans' valor and optimism have led them to build some of the world's greatest kingdoms. In this troubled era, after generations of conflict, humanity seeks to rekindle its former glory and forge a shining new future.
  `),
  [RACE.ORC]: cleanGlue(`
    The orc race originated on the planet Draenor. A peaceful people with shamanic beliefs, they were enslaved by the Burning Legion and forced into war with the humans of Azeroth. Although it took many years, the orcs finally escaped the demons' corruption and won their freedom. To this day they fight for honor in an alien world that hates and reviles them.
  `),
  [RACE.DWARF]: cleanGlue(`
    In ages past the dwarves cared only for riches taken from the earth's depths. Then records surfaced of a god-like race said to have given the dwarves life... and an enchanted birthright. Driven to learn more, the dwarves devoted themselves to the pursuit of lost artifacts and ancient knowledge. Today dwarven archaeologists are scattered throughout the globe.
  `),
  [RACE.NIGHTELF]: cleanGlue(`
    Ten thousand years ago, the night elves founded a vast empire, but their reckless use of primal magic brought them to ruin. In grief, they withdrew to the forests and remained isolated there until the return of their ancient enemy, the Burning Legion. With no other choice, the night elves emerged at last from their seclusion to fight for their place in the new world.
  `),
  // GlueStrings key is RACE_INFO_SCOURGE for playable undead (Forsaken).
  [RACE.UNDEAD]: cleanGlue(`
    Free of the Lich King's grasp, the Forsaken seek to overthrow his rule. Led by the banshee Sylvanas, they hunger for vengeance against the Scourge. Humans, too, have become the enemy, relentless in their drive to purge all undead from the land. The Forsaken care little even for their allies; to them the Horde is merely a tool that may further their dark schemes.
  `),
  [RACE.TAUREN]: cleanGlue(`
    Always the tauren strive to preserve the balance of nature and heed the will of their goddess, the Earth Mother. Recently attacked by murderous centaur, the tauren would have been wiped out, save for a chance encounter with the orcs, who helped defeat the interlopers. To honor this blood-debt, the tauren joined the Horde, solidifying the two races' friendship.
  `),
  [RACE.GNOME]: cleanGlue(`
    Though small in stature, the gnomes of Khaz Modan have used their great intellect to secure a place in history. Indeed, their subterranean kingdom, Gnomeregan, was once a marvel of steam-driven technology. Even so, due to a massive trogg invasion, the city was lost. Now its builders are vagabonds in the dwarven lands, aiding their allies as best they can.
  `),
  [RACE.TROLL]: cleanGlue(`
    Once at home in the jungles of Stranglethorn Vale, the fierce trolls of the Darkspear tribe were pushed out by warring factions. Eventually the trolls befriended the orcish Horde, and Thrall, the orcs' young warchief, convinced the trolls to travel with him to Kalimdor. Though they cling to their shadowy heritage, the Darkspear trolls hold a place of honor in the Horde.
  `),
};

const CLASS_INFO: Record<number, string> = {
  [CLASS.WARRIOR]: cleanGlue(`
    Warriors train constantly and strive for perfection in armed combat. Though they come from all walks of life, they are united by their singular commitment to engage in glorious battle. Many warriors serve as mercenary soldiers, while others become adventurers and danger-seeking fortune hunters. A typical warrior is strong, tough, and exceptionally violent.
  `),
  [CLASS.PALADIN]: cleanGlue(`
    Paladins do battle to protect the world from the forces of shadow. Powerful warriors in their own right, they can also call upon the Light to heal wounds, create shields of force, and incinerate evil creatures. Although paladins were once exclusively human, a number of stout-hearted dwarves have recently been welcomed into the Order of the Silver Hand.
  `),
  [CLASS.HUNTER]: cleanGlue(`
    Hunters know the uncharted places of the world. Gifted with a deep empathy for all life, they have an uncanny knack for befriending wild animals and taming them as pets. In addition, hunters can use their finely honed senses to become master trackers. Wherever hunters go, they fight back the ravages of sickness, exploitation, and industrialization.
  `),
  [CLASS.ROGUE]: cleanGlue(`
    Rogues are most successful when their deeds never come to light. Fond of poisons and silent projectile weapons, rogues rely on a blend of stealth and minor mysticism. Usually in the employ of rich nobles or local governments, the rogue redistributes wealth or eliminates designated targets. A rogue's allegiance lasts only as long as the latest contract.
  `),
  [CLASS.PRIEST]: cleanGlue(`
    Priests guide the spiritual destiny of their people. Through their unique insight into the mind, they are able to shape an individual's beliefs, whether to inspire or terrify, soothe or dominate, heal or harm. Just as the heart can hold both darkness and light, priests wield powers of creation and devastation by channeling the potent forces underlying faith.
  `),
  [CLASS.SHAMAN]: cleanGlue(`
    Shaman commune directly with the elements. Their combination of wisdom and resilience makes them ideal as tribal advisors and leaders. In battle the shaman use totems and spells to manipulate the elements and provoke other fighters to untold heights of rage and might. Shaman exemplify the primal bond between the savage races and their environment.
  `),
  [CLASS.MAGE]: cleanGlue(`
    Magi are wizards of immense knowledge and skill. Their obvious physical frailty is deceptive, for they can call upon the cosmic energies of the Twisting Nether. Rarely do magi engage in melee combat. Instead, they prefer to attack from a distance, hurling powerful bolts of frost and flame at their unsuspecting enemies.
  `),
  [CLASS.WARLOCK]: cleanGlue(`
    Warlocks are the bane of all life. Empowered by demonic blood, they can inflict great torment upon their foes. To replenish the dreadful energy their spells expend, warlocks drain vitality from their victims. The warlock can also summon and control terrifying demonic entities. Still, warlocks are feared above all else for their singular wickedness and cruelty.
  `),
  [CLASS.DRUID]: cleanGlue(`
    Druids live in a state of unparalleled union with nature. Tightly bound to the plant and animal kingdoms, they are natural shapeshifters, and so they know firsthand the abuse visited on their wild brethren. In consequence, despite their numbers, druids tend to be wary, reclusive, and difficult to spot. Few outsiders have plumbed the depths of their secrets.
  `),
};

export type CreateFactionId = 'alliance' | 'horde';

/** Classic FACTION_INFO_* body for the create-screen faction card. */
export function factionFlavor(faction: CreateFactionId): string {
  return faction === 'horde' ? FACTION_INFO_HORDE : FACTION_INFO_ALLIANCE;
}

/** Classic RACE_INFO_* body (undead uses RACE_INFO_SCOURGE). Empty string if unknown. */
export function raceFlavor(raceId: number): string {
  return RACE_INFO[raceId] ?? '';
}

/** Classic CLASS_* body for the create-screen class card. Empty string if unknown. */
export function classFlavor(classId: number): string {
  return CLASS_INFO[classId] ?? '';
}
