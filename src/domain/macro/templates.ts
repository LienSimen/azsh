// Class and utility macro templates for the editor's Templates picker. Pure data: the documented
// vanilla and Roid macros, rewritten only where the shipped parser would reject the published text.

import { CLASS } from '../../data/schema.ts';
import { parseMacroBody } from './parse.ts';
import { sanitizeMacroName } from './normalize.ts';
import { validateMacroProgram } from './conditions.ts';
import { MACRO_NAME_MAX } from './types.ts';

export type MacroTemplateTag =
  | 'combat'
  | 'emergency'
  | 'mouseover'
  | 'downrank'
  | 'pet'
  | 'slots'
  | 'sequence'
  | 'pipeline';

export const MACRO_TEMPLATE_TAG_LABEL: Readonly<Record<MacroTemplateTag, string>> = {
  combat: 'Combat & Stances',
  emergency: 'Emergency & Panic',
  mouseover: 'Mouseover & Healing',
  downrank: 'Smart Downranking',
  pet: 'Pet Control',
  slots: 'Slots & Gear',
  sequence: 'Priority Sequences',
  pipeline: 'Advanced Pipelines',
};

export const MACRO_TEMPLATE_TAGS: readonly MacroTemplateTag[] = [
  'combat', 'emergency', 'mouseover', 'downrank', 'pet', 'slots', 'sequence', 'pipeline',
];

export type MacroTemplateScope = 'class' | 'general' | 'all';

export interface MacroTemplate {
  id: string;
  name: string;
  icon: string;
  /** Empty = General / Utility. Hamstring is warrior + druid, etc. */
  classes: readonly number[];
  tags: readonly MacroTemplateTag[];
  description: string;
  body: string;
  /** Other template ids created with this one so `{Name}` calls resolve. */
  nest?: readonly string[];
}

export type MacroTemplateCompat = {
  kind: 'auto' | 'manual';
  label: string;
};

const W = CLASS.WARRIOR;
const L = CLASS.PALADIN;
const H = CLASS.HUNTER;
const R = CLASS.ROGUE;
const P = CLASS.PRIEST;
const S = CLASS.SHAMAN;
const M = CLASS.MAGE;
const K = CLASS.WARLOCK;
const D = CLASS.DRUID;

function t(
  id: string,
  name: string,
  icon: string,
  classes: readonly number[],
  tags: readonly MacroTemplateTag[],
  description: string,
  body: string,
  nest?: readonly string[],
): MacroTemplate {
  return { id, name, icon, classes, tags, description, body, ...(nest ? { nest } : {}) };
}

export const MACRO_TEMPLATES: readonly MacroTemplate[] = [
  // ---- Slots (generic, any class) -----------------------------------------------------
  t('slot-trinket1', 'Use Trinket 1', 'inv_jewelry_talisman_08', [], ['slots'],
    'Uses whatever is in paperdoll slot 13 (first trinket). Swap the trinket; the macro stays the same.',
    `#showtooltip
/use 13`),
  t('slot-trinket2', 'Use Trinket 2', 'inv_jewelry_talisman_01', [], ['slots'],
    'Uses paperdoll slot 14 (second trinket).',
    `#showtooltip
/use 14`),
  t('slot-trinkets', 'Both Trinkets', 'inv_misc_orb_02', [], ['slots', 'pipeline'],
    'Slot 13 first; if that slot is empty, slot 14. Wear any on-use trinkets.',
    `#showtooltip
/use 13
/use 14`),
  t('slot-mh', 'Use Main Hand', 'inv_sword_04', [], ['slots'],
    'Uses paperdoll slot 16 (main hand on-use).',
    `#showtooltip
/use 16`),
  t('slot-oh', 'Use Off Hand', 'inv_shield_06', [], ['slots'],
    'Uses paperdoll slot 17 (off hand / shield on-use). Not a trinket: trinkets are 13 and 14.',
    `#showtooltip
/use 17`),
  t('slot-tankset', '1H + Shield', 'inv_shield_04', [], ['slots', 'combat'],
    'If you have no shield on, equips the first one-hand weapon and first shield in your bags. No named items.',
    `#showtooltip
/equip [noequipped:Shields] One-Hand
/equipoh [noequipped:Shields] Shields`),
  t('slot-outfit', 'Wear Tank Outfit', 'inv_chest_plate04', [], ['slots', 'pipeline'],
    'Wears an Outfitter set named Tank. Rename the set, or edit the line, to match yours.',
    `#showtooltip
/outfitter wear Tank`),

  // ---- Warrior ------------------------------------------------------------------------
  t('war-overpower', 'Overpower Dance', 'ability_meleedamage', [W], ['combat'],
    'Casts Overpower in Battle Stance; otherwise swaps into Battle Stance first.',
    `#showtooltip Overpower
/cast [stance:1] Overpower ; Battle Stance
/startattack`),
  t('war-shieldwall', 'Shield Wall Swap', 'ability_warrior_shieldwall', [W], ['emergency', 'combat', 'slots'],
    'Puts on the first 1H and shield in your bags if you have no shield, then Defensive Stance and Shield Wall.',
    `#showtooltip Shield Wall
/equip [noequipped:Shields] One-Hand
/equipoh [noequipped:Shields] Shields
/cast [nostance:2] Defensive Stance
/cast Shield Wall`),
  t('war-pummel', 'Pummel Interrupt', 'inv_gauntlets_04', [W], ['combat', 'emergency'],
    'Stops your current action, enters Berserker Stance if needed, then Pummel.',
    `#showtooltip Pummel
/stopcasting
/cast [stance:3] Pummel ; Berserker Stance`),
  t('war-charge', 'Charge / Intercept', 'ability_warrior_charge', [W], ['combat'],
    'Out of combat: Battle Stance and Charge. In combat: Berserker Stance and Intercept.',
    `#showtooltip
/cast [nocombat,stance:1] Charge ; [nocombat] Battle Stance ; [combat,stance:3] Intercept ; Berserker Stance
/startattack`),
  t('war-execute', 'Execute Finisher', 'inv_sword_48', [W], ['combat', 'sequence'],
    'Execute below 20% target health; otherwise Mortal Strike. Starts auto-attack.',
    `#showtooltip Execute
/cast [harm,hp<20] Execute ; Mortal Strike
/startattack`),

  // ---- Mage ---------------------------------------------------------------------------
  t('mage-cs', 'Counterspell', 'spell_frost_iceshock', [M], ['emergency', 'mouseover'],
    'Stops your current cast and Counterspells mouseover, then your target.',
    `#showtooltip Counterspell
/stopcasting
/cast [@mouseover,harm,nodead][harm,nodead] Counterspell`),
  t('mage-poly', 'Focus Polymorph', 'spell_nature_polymorph', [M], ['mouseover'],
    'Shift clears focus. Otherwise locks focus on your target and sheeps focus, then mouseover, then target.',
    `#showtooltip Polymorph
/clearfocus [mod:shift]
/focus [@focus,noexists][@focus,dead] target
/cast [@focus,harm,nodead][@mouseover,harm,nodead][harm] Polymorph`),
  t('mage-blizz', 'Blizzard Rank 1', 'spell_frost_icestorm', [M], ['downrank'],
    'Rank 1 Blizzard for the area slow. Hold Shift for max-rank damage.',
    `#showtooltip Blizzard
/cast [mod:shift] Blizzard ; Blizzard(Rank 1)`),
  t('mage-iceblock', 'Ice Block Cancel', 'spell_frost_frost', [M], ['emergency'],
    'First tap casts Ice Block. Second tap leaves the form/buff if /unshift can clear it.',
    `#showtooltip Ice Block
/stopcasting
/unshift [mybuff:Ice_Block]
/cast [nomybuff:Ice_Block] Ice Block`),
  t('mage-pom', 'PoM Pyroblast', 'spell_fire_fireball02', [M], ['combat', 'pipeline'],
    'Applies Presence of Mind if missing, then Pyroblast.',
    `#showtooltip Pyroblast
/cast [nomybuff:Presence_of_Mind] Presence of Mind
/cast Pyroblast`),

  // ---- Rogue --------------------------------------------------------------------------
  t('rogue-opener', 'Stealth Opener', 'ability_stealth', [R], ['combat'],
    'Enters Stealth if you are not stealthed. Stealthed: Cheap Shot, Shift Sap, Ctrl Ambush.',
    `#showtooltip
/cast [nostealth] Stealth
/cast [stealth,mod:shift] Sap ; [stealth,mod:ctrl] Ambush ; [stealth] Cheap Shot`),
  t('rogue-blind', 'Blind', 'spell_shadow_mindsteal', [R], ['emergency', 'mouseover'],
    'Stops auto-attack so a swing does not break Blind, then blinds mouseover or target.',
    `#showtooltip Blind
/stopattack
/cast [@mouseover,harm,nodead][harm] Blind`),
  t('rogue-riposte', 'Riposte / SS', 'spell_shadow_ritualofsacrifice', [R], ['combat'],
    'Riposte when it is ready after a parry; otherwise Sinister Strike.',
    `#showtooltip Sinister Strike
/cast [nocooldown:Riposte] Riposte ; Sinister Strike
/startattack`),
  t('rogue-vanish', 'Vanish Drop', 'ability_vanish', [R], ['emergency'],
    'Stops attacking and Vanishes in combat; Stealths out of combat.',
    `#showtooltip Vanish
/stopattack
/cast [combat] Vanish ; Stealth`),

  // ---- Priest -------------------------------------------------------------------------
  t('priest-shoot', 'Wand Shoot', 'ability_shootwand', [P], ['combat'],
    'Starts wanding without toggling it off if you press the button again.',
    `#showtooltip Shoot
/cast !Shoot`),
  t('priest-flay', 'Mind Flay', 'spell_shadow_siphonmana', [P], ['combat'],
    'Will not recast while you are already channelling, so ticks are not clipped.',
    `#showtooltip Mind Flay
/cast [nochanneled] Mind Flay`),
  t('priest-helpharm', 'Help / Harm', 'spell_holy_flashheal', [P], ['mouseover'],
    'Flash Heal on a friendly mouseover or target; Smite on an enemy; else Flash Heal.',
    `#showtooltip
/cast [@mouseover,help,nodead][help,nodead] Flash Heal ; [@mouseover,harm,nodead][harm,nodead] Smite ; Flash Heal`),
  t('priest-if', 'Inner Fire', 'spell_holy_innerfire', [P], ['combat', 'sequence'],
    'Recasts Inner Fire when the buff is gone; otherwise Holy Fire or Smite.',
    `#showtooltip
/cast [nomybuff:Inner_Fire] Inner Fire ; [harm] Holy Fire ; Smite`),
  t('priest-dp', 'Desperate Prayer', 'spell_holy_restoration', [P], ['emergency'],
    'Stops casting and, below 25-35% health, uses a healthstone, potion, then Desperate Prayer.',
    `#showtooltip Desperate Prayer
/stopcasting
/use [myhp<25] Major Healthstone
/use [myhp<25] Superior Healing Potion
/cast [myhp<35] Desperate Prayer`),

  // ---- Hunter -------------------------------------------------------------------------
  t('hunt-trap', 'Feign + Trap', 'spell_frost_chainsofice', [H], ['emergency', 'pet'],
    'Calls the pet back, stops attacking, Feign Deaths in combat, then Freezing Trap.',
    `#showtooltip Freezing Trap
/petfollow
/stopattack
/cast [combat] Feign Death
/cast Freezing Trap`),
  t('hunt-autoshot', 'Auto Shot Weave', 'ability_whirlwind', [H], ['combat'],
    'Keeps Auto Shot running at range and weaves Raptor Strike in melee.',
    `#showtooltip
/cast [harm,hp>0] !Auto Shot
/cast [combat] Raptor Strike
/startattack`),
  t('hunt-mark', "Hunter's Mark", 'ability_hunter_snipershot', [H], ['combat', 'pet'],
    "Applies Hunter's Mark if the target lacks it, then sends the pet.",
    `#showtooltip Hunter's Mark
/cast [harm,nodebuff:Hunter's_Mark] Hunter's Mark
/petattack [@target,harm,nodead]
/startattack`),
  t('hunt-cheetah', 'Cheetah Cancel', 'ability_mount_jungletiger', [H], ['combat'],
    'Drops Aspect of the Cheetah in combat so you are not dazed; Cheetah out of combat.',
    `#showtooltip
/cast [combat,mybuff:Aspect_of_the_Cheetah] Aspect of the Monkey ; [nocombat] Aspect of the Cheetah ; Aspect of the Hawk`),

  // ---- Warlock ------------------------------------------------------------------------
  t('lock-soul', 'Drain Soul', 'spell_shadow_haunting', [K], ['downrank', 'combat'],
    'Does not clip a channel. Rank 1 Drain Soul below 20% for shards; else Drain Life.',
    `#showtooltip Drain Soul
/cast [nochanneled,hp<20] Drain Soul(Rank 1) ; [nochanneled] Drain Life`),
  t('lock-sac', 'Sacrifice Panic', 'spell_shadow_sacrificialshield', [K], ['emergency', 'pet'],
    'Below 30% health, Voidwalker Sacrifice and a Major Healthstone.',
    `#showtooltip Sacrifice
/stopcasting
/cast [myhp<30] Sacrifice
/use [myhp<30] Major Healthstone`),
  t('lock-lock', 'Spell Lock', 'spell_shadow_mindrot', [K], ['emergency', 'mouseover', 'pet'],
    'Spell Lock on focus, then mouseover, then target.',
    `#showtooltip Spell Lock
/cast [@focus,harm,nodead][@mouseover,harm,nodead][harm] Spell Lock`),
  t('lock-dots', 'DoT Spreader', 'spell_shadow_abominationexplosion', [K], ['combat', 'sequence'],
    'Corruption if missing, then Curse of Agony if missing, then Shadow Bolt.',
    `#showtooltip
/cast [nodebuff:Corruption] Corruption ; [nodebuff:Curse_of_Agony] Curse of Agony ; Shadow Bolt`),

  // ---- Druid --------------------------------------------------------------------------
  t('druid-shift', 'Cat Powershift', 'ability_druid_catform', [D], ['combat'],
    'Leaves form and re-enters Cat Form for Furor / Wolfshead energy.',
    `#showtooltip Cat Form
/unshift
/cast !Cat Form
/startattack`),
  t('druid-charge', 'Feral Charge', 'ability_hunter_pet_bear', [D], ['combat'],
    'Feral Charge in Bear Form (stance 1); otherwise shifts into Bear Form.',
    `#showtooltip Feral Charge
/cast [stance:1] Feral Charge ; Bear Form`),
  t('druid-ns', 'NS Healing Touch', 'spell_nature_healingtouch', [D], ['emergency', 'mouseover'],
    'Leaves beast forms, applies Nature\'s Swiftness, then instant Healing Touch.',
    `#showtooltip Healing Touch
/stopcasting
/unshift [nostance:0]
/cast [nomybuff:Nature's_Swiftness] Nature's Swiftness
/cast [@mouseover,help,nodead][@player] Healing Touch`),
  t('druid-mf', 'Moonfire Rank 1', 'spell_nature_starfall', [D], ['downrank'],
    'Shift: max-rank Moonfire. Otherwise apply the debuff, then Rank 1 totem stomp.',
    `#showtooltip Moonfire
/cast [mod:shift] Moonfire ; [nodebuff:Moonfire] Moonfire ; Moonfire(Rank 1)`),

  // ---- Paladin ------------------------------------------------------------------------
  t('pal-bubble', 'Bubble Hearth', 'spell_holy_divineintervention', [L], ['emergency'],
    'Divine Shield if you lack it, then Hearthstone while the bubble is up.',
    `#showtooltip Divine Shield
/stopcasting
/cast [nomybuff:Divine_Shield] Divine Shield
/use [mybuff:Divine_Shield] Hearthstone`),
  t('pal-cleanse', 'Cleanse Mouseover', 'spell_holy_renew', [L], ['mouseover'],
    'Cleanse mouseover, then a friendly target, then yourself.',
    `#showtooltip Cleanse
/cast [@mouseover,help,nodead][help,nodead][@player] Cleanse`),
  t('pal-judge', 'Seal Judgement', 'spell_holy_righteousfury', [L], ['combat'],
    'Judgement if Seal of Command is up; otherwise apply the seal.',
    `#showtooltip Judgement
/cast [mybuff:Seal_of_Command] Judgement ; Seal of Command
/startattack`),
  t('pal-loh', 'Lay on Hands', 'spell_holy_layonhands', [L], ['emergency', 'mouseover'],
    'Lay on Hands mouseover, then a friendly target, then yourself.',
    `#showtooltip Lay on Hands
/stopcasting
/cast [@mouseover,help,nodead][@target,help,nodead][@player] Lay on Hands`),

  // ---- Shaman -------------------------------------------------------------------------
  t('sha-shock', 'Earth Shock R1', 'spell_nature_earthshock', [S], ['emergency', 'downrank', 'mouseover'],
    'Stops casting and fires Rank 1 Earth Shock for the lockout, on mouseover or target.',
    `#showtooltip Earth Shock(Rank 1)
/stopcasting
/cast [@mouseover,harm,nodead][harm] Earth Shock(Rank 1)`),
  t('sha-ns', 'NS Chain Heal', 'spell_nature_healingwavegreater', [S], ['emergency', 'mouseover'],
    'Applies Nature\'s Swiftness if missing, then Chain Heal mouseover / target / you.',
    `#showtooltip Chain Heal
/stopcasting
/cast [nomybuff:Nature's_Swiftness] Nature's Swiftness
/cast [@mouseover,help,nodead][help,nodead][@player] Chain Heal`),
  t('sha-helpharm', 'Purge / LHW', 'spell_nature_purge', [S], ['mouseover'],
    'Lesser Healing Wave on a friend; Purge on an enemy; else Lesser Healing Wave.',
    `#showtooltip
/cast [@mouseover,help,nodead][help,nodead] Lesser Healing Wave ; [@mouseover,harm,nodead][harm,nodead] Purge ; Lesser Healing Wave`),

  // ---- Advanced / shared --------------------------------------------------------------
  t('adv-exorcism', 'Exorcism Detector', 'spell_holy_excorcism_02', [L], ['combat', 'pipeline'],
    'On Undead or Demon, Exorcism then Holy Wrath when ready; otherwise Judgement.',
    `#showtooltip
/cast [harm,type:Undead/Demon,nocooldown:Exorcism] Exorcism ; [harm,type:Undead/Demon,nocooldown:Holy_Wrath] Holy Wrath ; Judgement
/startattack`),
  t('adv-taunt', 'Threat Recovery', 'spell_nature_reincarnation', [W], ['combat', 'pipeline'],
    'If the target is not attacking you: Taunt in Defensive, Mocking Blow in Battle; else Sunder.',
    `#showtooltip Taunt
/cast [noattacks:player,stance:2] Taunt ; [noattacks:player,stance:1] Mocking Blow ; Sunder Armor
/startattack`),
  t('adv-panic', 'Panic Consumables', 'inv_stone_04', [], ['emergency', 'pipeline'],
    'Below 20% health: Major Healthstone, then Major Healing Potion, then a bandage.',
    `#showtooltip
/stopcasting
/use [myhp<20] Major Healthstone
/use [myhp<20] Major Healing Potion
/use [myhp<20] Heavy Runecloth Bandage`),
  t('adv-prebuffs', 'PreBuffs', 'ability_warrior_battleshout', [W], ['pipeline'],
    'Out-of-combat shout helper that BurstEngage calls as {PreBuffs}.',
    `#showtooltip Battle Shout
/cast [nomybuff:Battle_Shout] Battle Shout
/cast [nomybuff:Berserker_Rage,stance:3] Berserker Rage`),
  t('adv-trinket', 'TrinketPop', 'inv_jewelry_talisman_08', [], ['pipeline', 'slots'],
    'Uses trinket slot 13, then 14 if 13 is empty. BurstEngage calls this as {TrinketPop}.',
    `#showtooltip
/use 13
/use 14`),
  t('adv-burst', 'BurstEngage', 'ability_warrior_savageblow', [W], ['pipeline', 'combat', 'sequence'],
    'Out of combat runs {PreBuffs}. In combat pops {TrinketPop} (slots 13/14), then Mortal Strike.',
    `#showtooltip
/cast [nocombat] {PreBuffs}
/cast [combat] {TrinketPop}
/cast [combat] Mortal Strike
/startattack`,
    ['adv-prebuffs', 'adv-trinket']),
  t('adv-hamstring', 'Rage / Hamstring', 'ability_shockwave', [W, D], ['combat', 'sequence'],
    'Bloodrage when rage is below 10, Hamstring if the target is not slowed, then Mortal Strike.',
    `#showtooltip
/cast [myrawpower<10,nocooldown:Bloodrage] Bloodrage
/cast [harm,nodebuff:Hamstring] Hamstring ; Mortal Strike
/startattack`),
  t('adv-priority', 'Priority Sequence', 'spell_shadow_shadowbolt', [K], ['sequence', 'pipeline'],
    'Vanilla has no /castsequence. This is the replacement: first matching branch wins, then the next line.',
    `#showtooltip
/cast [nochanneled,nodebuff:Corruption] Corruption ; [nochanneled,nodebuff:Curse_of_Agony] Curse of Agony ; [nochanneled] Shadow Bolt`),
  t('adv-fullkit', 'Full Toolkit', 'inv_misc_book_09', [W], ['pipeline', 'sequence', 'slots'],
    'Stance, gear type, slot use, hp gate, creature type, threat, and a nested trinket call on one button.',
    `#showtooltip
/cast [nocombat] {PreBuffs}
/equip [noequipped:Shields] One-Hand
/equipoh [noequipped:Shields] Shields
/cast [combat] {TrinketPop}
/cast [noattacks:player,stance:2] Taunt ; [harm,type:Undead/Demon] Hamstring ; [harm,hp<20] Execute ; Mortal Strike
/startattack`,
    ['adv-prebuffs', 'adv-trinket']),
];

const BY_ID: ReadonlyMap<string, MacroTemplate> = new Map(MACRO_TEMPLATES.map((row) => [row.id, row]));

export function macroTemplateById(id: string): MacroTemplate | null {
  return BY_ID.get(id) ?? null;
}

export function filterMacroTemplates(
  opts: { scope: MacroTemplateScope; cls: number; tag: MacroTemplateTag | null },
): MacroTemplate[] {
  return MACRO_TEMPLATES.filter((row) => {
    if (opts.scope === 'general' && row.classes.length) return false;
    if (opts.scope === 'class' && !row.classes.includes(opts.cls)) return false;
    if (opts.tag && !row.tags.includes(opts.tag)) return false;
    return true;
  });
}

// Structural badge: mouseover, focus, party, raid and modifier keys cannot be held by auto-combat,
// so those templates are Manual Only. Everything else can compile its /cast and /use lines.
export function macroTemplateCompat(body: string): MacroTemplateCompat {
  const prog = parseMacroBody(body);
  for (const line of prog.lines) {
    for (const clause of line.clauses) {
      const ref = clause.unit;
      if (ref && !(ref.base === 'target' && ref.hops === 0)
        && !(ref.base === 'player' && ref.hops === 0)) {
        return { kind: 'manual', label: 'Manual Only (Mouseover/Mod)' };
      }
      for (const group of clause.groups) {
        for (const cond of group) {
          if (cond.key === 'mod' || cond.key === 'nomod' || cond.key === 'modifier') {
            return { kind: 'manual', label: 'Manual Only (Mouseover/Mod)' };
          }
        }
      }
    }
  }
  return { kind: 'auto', label: 'Manual + Auto-Combat Compatible' };
}

export function uniqueMacroName(base: string, taken: Iterable<string>): string {
  const want = sanitizeMacroName(base) || 'Macro';
  const used = new Set<string>();
  for (const n of taken) used.add(n.toLowerCase());
  if (!used.has(want.toLowerCase())) return want;
  for (let i = 2; i <= 40; i++) {
    const next = sanitizeMacroName(`${want.slice(0, Math.max(1, MACRO_NAME_MAX - 1 - String(i).length))} ${i}`);
    if (next && !used.has(next.toLowerCase())) return next;
  }
  return want;
}

/** Helpers this template needs created so `{Name}` calls resolve, in create order. */
export function macroTemplateNest(row: MacroTemplate): MacroTemplate[] {
  if (!row.nest?.length) return [];
  const out: MacroTemplate[] = [];
  for (const id of row.nest) {
    const child = BY_ID.get(id);
    if (child) out.push(child);
  }
  return out;
}

/** Parse issues a player would see if they pasted this body. Empty = the template is legal. */
export function macroTemplateIssues(body: string) {
  return validateMacroProgram(parseMacroBody(body));
}
