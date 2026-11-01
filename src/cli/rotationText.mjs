// Plain-English rendering of rotation rules and conditions for the terminal. Ported from phonecraft's
// src/ui/rotation/rotationEditorSentence.ts so a rule reads the same sentence here as in the web editor.
import { CREATURE_TYPE, SHAPESHIFT_FORM } from '../data/schema.ts';
import { DISPEL_TYPE } from '../domain/spells/dispel.ts';
import { raidJobFromCode } from '../domain/raid/raidPlan.ts';
import { COND_METRIC_LABEL } from '../domain/rotation/condMetricPicker.ts';
import { CLASS_NAMES } from '../domain/core/ids.ts';

export const SUBJECT_LABEL = { self: 'you', target: 'the enemy', pet: 'your pet', ally: 'an ally' };
const ALLY_ROLE_LABEL = { tank: 'tank', healer: 'healer', damage: 'DPS' };
const COND_OP_LABEL = { '<': 'less than', '<=': 'at most', '>': 'more than', '>=': 'at least', '==': 'equal to', '!=': 'not equal to' };
const RAID_JOB_LABEL = { 'main-tank': 'Main tank', 'off-tank': 'Off-tank', healer: 'Healer', dps: 'DPS' };
export const SCHOOL_NAMES = ['Physical', 'Holy', 'Fire', 'Nature', 'Frost', 'Shadow', 'Arcane'];
export const TOTEM_ELEMENTS = ['Fire', 'Earth', 'Water', 'Air'];
export const AOE_MODE_NAMES = { 0: 'auto', 1: 'AoE', 2: 'single-target' };

const titleCase = (k) => k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');
export const CREATURE_TYPE_NAME = new Map(Object.entries(CREATURE_TYPE).map(([k, v]) => [v, titleCase(k)]));
export const DISPEL_TYPE_NAME = new Map(Object.entries(DISPEL_TYPE).map(([k, v]) => [v, titleCase(k)]));
export const creatureMaskName = (mask) => {
  const hit = [...CREATURE_TYPE_NAME].filter(([t]) => (((1 << (t - 1)) & (mask ?? 0)) !== 0));
  return hit.length ? hit.map(([, n]) => n).join(' or ') : 'that creature type';
};
export const FORM_NAMES = {
  [SHAPESHIFT_FORM.NONE]: 'no form', [SHAPESHIFT_FORM.CAT]: 'Cat Form', [SHAPESHIFT_FORM.TREE]: 'Tree of Life',
  [SHAPESHIFT_FORM.TRAVEL]: 'Travel Form', [SHAPESHIFT_FORM.AQUA]: 'Aquatic Form', [SHAPESHIFT_FORM.BEAR]: 'Bear Form',
  [SHAPESHIFT_FORM.DIREBEAR]: 'Dire Bear Form', [SHAPESHIFT_FORM.BATTLESTANCE]: 'Battle Stance',
  [SHAPESHIFT_FORM.DEFENSIVESTANCE]: 'Defensive Stance', [SHAPESHIFT_FORM.BERSERKERSTANCE]: 'Berserker Stance',
  [SHAPESHIFT_FORM.SHADOWFORM]: 'Shadowform', [SHAPESHIFT_FORM.STEALTH]: 'Stealth', [SHAPESHIFT_FORM.MOONKIN]: 'Moonkin Form',
};

const allyFilterIsAny = (f) => !f || (f.classId == null && f.role == null && f.notRole == null && !f.unit);
function allySubjectPhrase(f, seatName) {
  if (allyFilterIsAny(f)) return 'the most-hurt ally';
  if (f.unit) return seatName ? seatName(f.unit) : f.unit;
  const bits = [];
  if (f.classId != null) bits.push(CLASS_NAMES[f.classId] ?? `class ${f.classId}`);
  if (f.role != null) bits.push(ALLY_ROLE_LABEL[f.role]);
  if (f.notRole != null) bits.push(`non-${ALLY_ROLE_LABEL[f.notRole]}`);
  return `the most-hurt ${bits.join(' ')} ally`;
}
const condHasCompare = (op, value, suffix = '') => `has ${COND_OP_LABEL[op]} ${value}${suffix}`;

/** One condition as a sentence. `names.spell(id)` / `names.item(id)` resolve references. */
export function condSentence(c, names) {
  const subj = c.subject === 'ally' ? allySubjectPhrase(c.ally, names.seat) : SUBJECT_LABEL[c.subject];
  const poss = c.subject === 'self' ? 'your' : c.subject === 'target' ? "the enemy's" : c.subject === 'ally' ? `${subj}'s` : "your pet's";
  const yes = c.op === '!=' ? c.value === 0 : c.value !== 0;
  const cmp = COND_OP_LABEL[c.op];
  const isAre = c.subject === 'self' ? 'are' : 'is';
  const have = c.subject === 'self' ? 'have' : 'has';
  const haveNot = c.subject === 'self' ? "don't have" : "doesn't have";
  const refOr = (fallback) => (c.ref != null && c.ref > 0 ? c.ref : fallback);
  switch (c.metric) {
    case 'healthPct': return `${poss} health ${condHasCompare(c.op, c.value, '%')}`;
    case 'powerPct': return `${poss} mana/power ${condHasCompare(c.op, c.value, '%')}`;
    case 'manaPct': return `${poss} mana ${condHasCompare(c.op, c.value, '%')}`;
    case 'buffRemainingMs':
    case 'debuffRemainingMs':
      return `${names.spell(c.ref)} on ${subj} ${cmp} ${(c.value / 1000).toFixed(c.value % 1000 ? 1 : 0)}s left`;
    case 'canAfford': return yes ? `you can pay for ${names.spell(c.ref)}` : `you can't pay for ${names.spell(c.ref)}`;
    case 'level': return `${poss} level ${condHasCompare(c.op, c.value)}`;
    case 'alive': return `${subj} ${isAre} ${yes ? 'alive' : 'dead'}`;
    case 'buffPresent':
    case 'debuffPresent': return yes ? `${subj} ${have} ${names.spell(c.ref)}` : `${subj} ${haveNot} ${names.spell(c.ref)}`;
    case 'buffStacks':
    case 'debuffStacks': return `${names.spell(c.ref)} stacks on ${subj} ${cmp} ${c.value}`;
    case 'castingPresent': return `${subj} ${isAre} ${yes ? '' : 'not '}casting`;
    case 'castingSchool': return `the cast is ${SCHOOL_NAMES[c.value] ?? '?'} school`;
    case 'castingIsHeal': return yes ? 'the cast is a heal' : 'the cast is not a heal';
    case 'castingSpellId': return yes ? 'casting that ability' : 'not casting that ability';
    case 'dodgedRecently': return yes ? `${subj} dodged recently` : `${subj} ${c.subject === 'self' ? "haven't" : "hasn't"} dodged recently`;
    case 'defenseReactRecently': return yes ? `${subj} had a defense react (dodge/parry/block)` : `${subj} ${have} no defense react`;
    case 'hunterParryRecently': return yes ? `${subj} parried recently` : `${subj} ${c.subject === 'self' ? "haven't" : "hasn't"} parried recently`;
    case 'inMelee': return `${subj} ${isAre} ${yes ? 'in melee' : 'at range'}`;
    case 'charmed': return `${subj} ${isAre} ${yes ? 'charmed / possessed' : 'not charmed'}`;
    case 'itemCount': return `${names.item(c.ref)} in bags ${cmp} ${c.value}`;
    case 'itemEquipped': return `${names.item(c.ref)} ${yes ? '' : 'not '}equipped`;
    case 'petHappiness': return `pet happiness ${condHasCompare(c.op, c.value, '%')}`;
    case 'combatTimeMs': return `fight time ${cmp} ${c.value} ms`;
    case 'timeToDieMs': return c.op === '<' || c.op === '<=' ? `${subj} dies within ${c.value} ms at this fight's rate` : `${subj} lives past ${c.value} ms at this fight's rate`;
    case 'inCombat': return `${subj} is ${yes ? 'in' : 'out of'} combat`;
    case 'comboPoints': return `combo points ${cmp} ${c.value}`;
    case 'enemyCount': return `living enemies ${cmp} ${c.value}`;
    case 'charmedHostileCount': return `charmed hostiles (possessed allies) ${cmp} ${c.value}`;
    case 'deadAllyCount': return `dead allies ${cmp} ${c.value}`;
    case 'meleeAllyCount': return `melee allies ${cmp} ${c.value}`;
    case 'alliesBelowHpCount': return `allies under ${refOr(75)}% health ${cmp} ${c.value}`;
    case 'nearbyAlliesBelowHpCount': return `hurt allies within ${refOr(30)} yd ${cmp} ${c.value}`;
    case 'creatureTypeMask': return `${subj} ${isAre} ${yes ? '' : 'not '}${creatureMaskName(c.ref)}`;
    case 'dispellablePresent': {
      const who = c.subject === 'target' ? 'the enemy has' : 'an ally has';
      const kind = DISPEL_TYPE_NAME.get(c.ref ?? -1);
      if (!kind) return yes ? `${who} a dispellable aura` : `${who} no dispellable aura`;
      return yes ? `${who} a dispellable ${kind} aura` : `${who} no dispellable ${kind} aura`;
    }
    case 'controlled': return `${subj} ${isAre} ${yes ? 'under crowd control' : 'free of crowd control'}`;
    case 'rooted': return `${subj} ${isAre} ${yes ? '' : 'not '}rooted`;
    case 'feared': return `${subj} ${isAre} ${yes ? '' : 'not '}feared`;
    case 'stunned': return `${subj} ${isAre} ${yes ? '' : 'not '}stunned`;
    case 'snared': return `${subj} ${isAre} ${yes ? '' : 'not '}snared`;
    case 'hasFlag': return `${subj} ${isAre} ${yes ? '' : 'not '}carrying the flag`;
    case 'isFlagCarrier': return `${subj} ${isAre} ${yes ? '' : 'not '}the flag carrier`;
    case 'isHealer': return `${subj} ${isAre} ${yes ? 'a healer' : 'not a healer'}`;
    case 'isCaster': return `${subj} ${isAre} ${yes ? 'a caster' : 'not a caster'}`;
    case 'isHunter': return `${subj} ${isAre} ${yes ? 'a hunter' : 'not a hunter'}`;
    case 'enemyCastingOnAlly': return yes ? 'an enemy is casting at an ally' : 'no enemy is casting at an ally';
    case 'enemyCastingOnSelf': return yes ? 'an enemy is casting at you' : 'no enemy is casting at you';
    case 'allyHasFlag': return yes ? 'our team has the flag' : 'our team does not have the flag';
    case 'enemyHasFlag': return yes ? 'they have our flag' : 'they do not have our flag';
    case 'enemiesWithinYd': return `enemies within ${refOr(10)} yd ${cmp} ${c.value}`;
    case 'alliesWithinYd': return `allies within ${refOr(10)} yd ${cmp} ${c.value}`;
    case 'healersWithinYd': return `our healers within ${refOr(30)} yd ${cmp} ${c.value}`;
    case 'enemyHealersWithinYd': return `their healers within ${refOr(30)} yd ${cmp} ${c.value}`;
    case 'objectiveContested': return `the objective is ${yes ? '' : 'not '}contested`;
    case 'objectiveOwnedByUs': return yes ? 'we own the objective' : 'we do not own the objective';
    case 'objectiveDistanceYd': return `yards to the objective ${cmp} ${c.value}`;
    case 'hazardProximityYd': return `yards to nearest ground hazard ${cmp} ${c.value}`;
    case 'targetDistanceYd': return `yards to the target ${cmp} ${c.value}`;
    case 'creatureDistanceYd': return `yards to creature ${c.ref ?? 0} ${cmp} ${c.value}`;
    case 'allyLowestHpPct': return `the most-hurt ally's health ${condHasCompare(c.op, c.value, '%')}`;
    case 'allyLowestBuffPresent': return yes ? `the most-hurt ally has ${names.spell(c.ref)}` : `the most-hurt ally does not have ${names.spell(c.ref)}`;
    case 'hasAggro': return yes ? 'an enemy is attacking you' : 'no enemy is attacking you';
    case 'targetAttackingMe': return yes ? 'your target is attacking you' : 'your target is attacking someone else';
    case 'aoeMode': {
      const name = AOE_MODE_NAMES[c.value] ?? `mode ${c.value}`;
      return c.op === '==' ? `AoE mode is ${name}` : c.op === '!=' ? `AoE mode is not ${name}` : `AoE mode ${cmp} ${name}`;
    }
    case 'offHealAllowed': return yes ? 'off-heal is on' : 'off-heal is off';
    case 'partySeats': return c.op === '<=' && c.value === 1 ? 'you are solo' : `party size ${cmp} ${c.value}`;
    case 'formId': {
      const name = FORM_NAMES[c.value] ?? `form ${c.value}`;
      return c.op === '!=' ? `not in ${name}` : c.op === '==' ? `in ${name}` : `form ${cmp} ${c.value}`;
    }
    case 'classId': {
      const name = CLASS_NAMES[c.value] ?? `class ${c.value}`;
      return c.op === '==' ? `${subj} ${isAre} a ${name}` : c.op === '!=' ? `${subj} ${isAre} not a ${name}` : `${subj} class ${cmp} ${c.value}`;
    }
    case 'isMainTank': return yes ? 'you are the main tank' : 'you are not the main tank';
    case 'isOffTank': return yes ? 'you are an off-tank' : 'you are not an off-tank';
    case 'myJob': {
      const job = raidJobFromCode(c.value);
      const name = job ? RAID_JOB_LABEL[job] : `job ${c.value}`;
      return c.op === '!=' ? `your raid job is not ${name}` : c.op === '==' ? `your raid job is ${name}` : `your raid job ${cmp} ${c.value}`;
    }
    case 'myCamp': {
      const name = c.value <= 0 ? 'unassigned' : `camp ${String.fromCharCode(96 + c.value)}`;
      return c.op === '!=' ? `you are not ${name}` : c.op === '==' ? `you are ${name}` : `your camp ${cmp} ${c.value}`;
    }
    case 'assignedHealSubgroup': return c.op === '==' ? `you heal group ${c.value}` : `your heal group ${cmp} ${c.value}`;
    case 'aggroHolderDebuffPresent': return yes ? `the tank has ${names.spell(c.ref)}` : `the tank does not have ${names.spell(c.ref)}`;
    case 'aggroHolderDebuffStacks': return `the tank has ${cmp} ${c.value} stacks of ${names.spell(c.ref)}`;
    case 'allyAuraPresent': return yes ? `anyone has ${names.spell(c.ref)}` : `nobody has ${names.spell(c.ref)}`;
    case 'allyAuraStacks': return `anyone has ${cmp} ${c.value} stacks of ${names.spell(c.ref)}`;
    case 'totemPresent': return `${TOTEM_ELEMENTS[c.ref ?? 0] ?? '?'} totem slot is ${yes ? 'occupied' : 'empty'}`;
    case 'weaponImbuePresent': {
      const r = c.ref ?? 0;
      if (r === 2) return yes ? 'all weapon hands have an imbue' : 'a weapon hand has no imbue';
      return `${r === 1 ? 'off hand' : 'main hand'} ${yes ? 'has an imbue' : 'has no imbue'}`;
    }
    default: return `${subj} ${COND_METRIC_LABEL[c.metric] ?? c.metric} ${cmp} ${c.value}`;
  }
}

/** The condition list joined as the evaluator reads it: AND within a group, OR between groups. */
export function conditionsSentence(conds, names) {
  if (!conds?.length) return 'always';
  const parts = [];
  conds.forEach((c, i) => {
    const s = condSentence(c, names);
    parts.push(i === 0 ? s : `${c.join === 'or' ? 'OR' : 'and'} ${s}`);
  });
  return parts.join(' ');
}

/** What a rule does, without its conditions: "Cast Rend", "Use Minor Healing Potion", ... */
export function actionSentence(action, names) {
  switch (action.kind) {
    case 'spell': {
      const target = action.target && typeof action.target === 'object'
        ? ('creatureEntry' in action.target ? ` on ${names.creature?.(action.target.creatureEntry) ?? `creature ${action.target.creatureEntry}`}` : ` on the ${ALLY_ROLE_LABEL[action.target.role] ?? action.target.role}`)
        : action.target === 'other' ? ' on another enemy' : '';
      return `Cast ${names.spell(action.spellId)}${target}`;
    }
    case 'item': return `Use ${names.item(action.itemEntry)}${action.family ? ' (best rank in bags)' : ''}${action.target === 'lowest_ally' ? ' on the most-hurt ally' : action.target === 'pet' ? ' on your pet' : ''}`;
    case 'macro': return `Run macro ${names.macro?.(action.macroId) ?? action.macroId}`;
    case 'move': {
      const m = action.move;
      switch (m.kind) {
        case 'spread': return `Spread out to ${m.minYd} yd`;
        case 'flee_raid': return `Run ${m.yd} yd from the raid`;
        case 'stack_on': return `Stack on the ${m.role ? ALLY_ROLE_LABEL[m.role] : m.unit}`;
        case 'behind_target': return 'Move behind the target';
        case 'flank_target': return 'Move to the target\'s flank';
        case 'move_to': return `Move to (${m.x}, ${m.y})`;
        case 'avoid_zone': return `Avoid zone ${m.id}`;
        default: return `Move (${m.kind})`;
      }
    }
    case 'halt_dps': return `Stop ${action.school && action.school !== 'all' ? `${Array.isArray(action.school) ? action.school.join('/') : action.school} ` : ''}damage`;
    case 'keep_aura': return `Keep ${names.spell(action.spellId)}`;
    case 'kill_order': return `Kill order: ${action.entries.map((e) => (e < 0 ? `anything but ${names.creature?.(-e) ?? -e}` : names.creature?.(e) ?? e)).join(', ')}`;
    case 'use_object': return `Use object ${names.object?.(action.goEntry) ?? action.goEntry}`;
    default: return `${action.kind}`;
  }
}

export function ruleSentence(rule, names) {
  let s = actionSentence(rule.action, names);
  if (rule.before) s = `${names.spell(rule.before.spellId)}, then ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  const after = rule.after ?? rule.action.after;
  if (after) {
    const steps = after.steps?.length ? after.steps.map((st) => names.spell(st.spellId)) : after.spellId ? [names.spell(after.spellId)] : [];
    if (after.stepBackYd) s += `, then step back ${after.stepBackYd} yd`;
    if (steps.length) s += `, then ${steps.join(', then ')}`;
  }
  return s;
}

export const PHASE_LABEL = {
  prebuff: 'Pre-buff (button-driven, before a pull)',
  buffs: 'Buffs (kept up automatically)',
  pull: 'Pull (the opener)',
  combat: 'Combat (checked top to bottom every tick)',
  recovery: 'Recovery (after the fight)',
};
