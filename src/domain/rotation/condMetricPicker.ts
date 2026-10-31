// Rotation "if" catalog, split into Common and Situational so the metric list stays scannable.
// Common is everyday gates; Situational is PvP, CC subtypes, class reacts and companion knobs.
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { CondMetric, CondOp, CondSubject } from './types.ts';

/** Sensible starting comparison when the player switches a condition to this metric. */
export const COND_METRIC_DEFAULTS: Record<CondMetric, { op: CondOp; value: number; subject?: CondSubject; ref?: number }> = {
  healthPct: { op: '<', value: 50 },
  powerPct: { op: '<', value: 20 },
  manaPct: { op: '<', value: 20 },
  level: { op: '>=', value: 1 },
  alive: { op: '==', value: 1 },
  buffPresent: { op: '==', value: 0 },
  debuffPresent: { op: '==', value: 0, subject: 'target' },
  buffStacks: { op: '<', value: 5 },
  debuffStacks: { op: '<', value: 5, subject: 'target' },
  // 3 s is the refresh window a HoT wants: absent reads 0 and so satisfies the same row.
  buffRemainingMs: { op: '<', value: 3000 },
  debuffRemainingMs: { op: '<', value: 3000, subject: 'target' },
  canAfford: { op: '==', value: 0 },
  castingPresent: { op: '==', value: 1, subject: 'target' },
  // ref 5 is 'polymorph' in DIMINISHING_GROUP_ORDER; step 0 is full duration, so the seeded
  // row reads "the target's sheep track is fresh" - the question a CC row actually asks.
  drLevel: { op: '==', value: 0, subject: 'target', ref: 5 },
  castingSchool: { op: '==', value: 2, subject: 'target' },
  castingSpellId: { op: '==', value: 0, subject: 'target' },
  castingIsHeal: { op: '==', value: 1, subject: 'target' },
  dodgedRecently: { op: '==', value: 1, subject: 'target' },
  defenseReactRecently: { op: '==', value: 1, subject: 'self' },
  hunterParryRecently: { op: '==', value: 1, subject: 'self' },
  controlled: { op: '==', value: 1, subject: 'self' },
  rooted: { op: '==', value: 1, subject: 'self' },
  feared: { op: '==', value: 0, subject: 'target' },
  stunned: { op: '==', value: 1, subject: 'self' },
  snared: { op: '==', value: 1, subject: 'self' },
  silenced: { op: '==', value: 1, subject: 'self' },
  hasFlag: { op: '==', value: 1, subject: 'self' },
  allyHasFlag: { op: '==', value: 1 },
  enemyHasFlag: { op: '==', value: 1 },
  isFlagCarrier: { op: '==', value: 1, subject: 'target' },
  isHealer: { op: '==', value: 1, subject: 'target' },
  isCaster: { op: '==', value: 1, subject: 'target' },
  isHunter: { op: '==', value: 1, subject: 'self' },
  classId: { op: '==', value: 8, subject: 'target' },
  enemiesWithinYd: { op: '>=', value: 3, ref: 10 },
  alliesWithinYd: { op: '>=', value: 2, ref: 10 },
  healersWithinYd: { op: '==', value: 0, ref: 30 },
  enemyHealersWithinYd: { op: '>=', value: 1, ref: 30 },
  enemyCastingOnAlly: { op: '==', value: 1 },
  enemyCastingOnSelf: { op: '==', value: 1 },
  objectiveContested: { op: '==', value: 1 },
  objectiveOwnedByUs: { op: '==', value: 1 },
  objectiveDistanceYd: { op: '<', value: 20 },
  inMelee: { op: '==', value: 1, subject: 'target' },
  charmed: { op: '==', value: 1, subject: 'target' },
  charmedHostileCount: { op: '>=', value: 1 },
  itemCount: { op: '<', value: 5 },
  itemEquipped: { op: '==', value: 1 },
  petHappiness: { op: '<', value: 60, subject: 'pet' },
  combatTimeMs: { op: '>', value: 5000 }, inCombat: { op: '==', value: 0 },
  timeToDieMs: { op: '<', value: 6000, subject: 'target' },
  comboPoints: { op: '>=', value: 4 },
  enemyCount: { op: '>=', value: 2 },
  allyLowestHpPct: { op: '<', value: 75 },
  allyLowestBuffPresent: { op: '==', value: 0 },
  alliesBelowHpCount: { op: '>=', value: 2, ref: 80 },
  nearbyAlliesBelowHpCount: { op: '>=', value: 2, ref: 15 },
  meleeAllyCount: { op: '>=', value: 2 },
  deadAllyCount: { op: '>=', value: 1 },
  hasAggro: { op: '==', value: 1 },
  allyHasAggro: { op: '==', value: 1 },
  aggroHolderDebuffPresent: { op: '==', value: 1, subject: 'target' },
  aggroHolderDebuffStacks: { op: '>=', value: 3, subject: 'target' },
  allyAuraPresent: { op: '==', value: 1 },
  allyAuraStacks: { op: '>=', value: 1 },
  targetAttackingMe: { op: '==', value: 0 },
  aoeMode: { op: '!=', value: 2 },
  offHealAllowed: { op: '==', value: 1 },
  healerPowerPct: { op: '<', value: 5 },
  partySeats: { op: '<=', value: 1 },
  formId: { op: '!=', value: SHAPESHIFT_FORM.CAT },
  totemPresent: { op: '==', value: 0, ref: 0 },
  weaponImbuePresent: { op: '==', value: 0, ref: 2 },
  creatureTypeMask: { op: '==', value: 1, subject: 'target', ref: 32 },
  dispellablePresent: { op: '==', value: 1, subject: 'self', ref: 1 },
  hazardProximityYd: { op: '<=', value: 0 },
  targetDistanceYd: { op: '<=', value: 20 },
  creatureDistanceYd: { op: '<=', value: 20, ref: 0 },
  allyWithoutAuraNearYd: { op: '<=', value: 13 },
  inTargetCone: { op: '==', value: 1 },
  isMainTank: { op: '==', value: 1 },
  isOffTank: { op: '==', value: 1 },
  myJob: { op: '==', value: 3 },
  myCamp: { op: '==', value: 1 },
  assignedHealSubgroup: { op: '==', value: 0 },
};

export type CondMetricBucket = 'common' | 'situational';
export type CondMetricFilter = CondMetricBucket | 'all';

export const COND_METRIC_BUCKET_ORDER: readonly CondMetricBucket[] = ['common', 'situational'];

export const COND_METRIC_BUCKET_LABEL: Record<CondMetricBucket, string> = {
  common: 'Common',
  situational: 'Situational',
};

export const COND_METRIC_FILTER_LABEL: Record<CondMetricFilter, string> = {
  common: 'Common',
  situational: 'Situational',
  all: 'All',
};

/** Dropdown / picker name for each if. Exhaustive on CondMetric. */
export const COND_METRIC_LABEL: Record<CondMetric, string> = {
  healthPct: 'health %', powerPct: 'mana / power %', level: 'level', alive: 'alive',
  manaPct: 'mana % (never rage / energy)',
  buffPresent: 'has buff', debuffPresent: 'has debuff', itemCount: 'items in bags',
  itemEquipped: 'item equipped',
  buffStacks: 'buff stacks', debuffStacks: 'debuff stacks',
  buffRemainingMs: 'buff time left (ms)', debuffRemainingMs: 'debuff time left (ms)',
  canAfford: 'can pay for spell',
  castingPresent: 'is casting', castingSchool: 'cast school', castingIsHeal: 'cast is a heal',
  drLevel: 'diminishing step',
  castingSpellId: 'casting spell id',
  dodgedRecently: 'dodged recently',
  defenseReactRecently: 'defense react (dodge/parry/block)',
  hunterParryRecently: 'parried recently',
  inMelee: 'in melee',
  charmed: 'charmed / possessed',
  petHappiness: 'pet happiness %', combatTimeMs: 'fight time (ms)', inCombat: 'in combat (this unit)',
  controlled: 'under crowd control', rooted: 'rooted', feared: 'feared',
  stunned: 'stunned', snared: 'snared', silenced: 'silenced',
  hasFlag: 'carrying the flag', allyHasFlag: 'our team has the flag',
  enemyHasFlag: 'they have our flag', isFlagCarrier: 'is the flag carrier',
  isHealer: 'is a healer', isCaster: 'is a caster', isHunter: 'is a hunter',
  classId: 'class',
  enemiesWithinYd: 'enemies within N yards (self=at me, target=at focus)', alliesWithinYd: 'allies within N yards',
  healersWithinYd: 'our healers within N yards', enemyHealersWithinYd: 'their healers within N yards',
  enemyCastingOnAlly: 'an enemy is casting at an ally',
  enemyCastingOnSelf: 'an enemy is casting at you',
  objectiveContested: 'objective contested', objectiveOwnedByUs: 'objective is ours',
  objectiveDistanceYd: 'yards to objective',
  comboPoints: 'combo points', enemyCount: 'living enemies', formId: 'form / stance',
  timeToDieMs: "time until it dies (this fight's rate)",
  allyLowestHpPct: 'most-hurt ally health %',
  allyLowestBuffPresent: 'most-hurt ally has buff',
  alliesBelowHpCount: 'hurt allies (count)',
  nearbyAlliesBelowHpCount: 'hurt allies in range (count)',
  meleeAllyCount: 'melee allies (count)',
  deadAllyCount: 'dead allies (count)',
  hasAggro: 'has aggro (any enemy)',
  allyHasAggro: 'an ally has aggro (any enemy)',
  aggroHolderDebuffPresent: 'tank has debuff',
  aggroHolderDebuffStacks: 'tank debuff stacks',
  allyAuraPresent: 'anyone has aura',
  allyAuraStacks: 'anyone aura stacks',
  targetAttackingMe: 'target attacking me',
  charmedHostileCount: 'charmed hostiles (possessed allies)',
  aoeMode: 'AoE mode',
  offHealAllowed: 'off-heal allowed',
  healerPowerPct: "party healer's mana %",
  partySeats: 'party size (1 = solo)',
  totemPresent: 'totem slot',
  weaponImbuePresent: 'weapon imbue',
  creatureTypeMask: 'creature type (Undead/Demon…)',
  dispellablePresent: 'dispellable aura present',
  hazardProximityYd: 'yards to nearest ground hazard',
  targetDistanceYd: 'yards to current target',
  creatureDistanceYd: 'yards to creature entry',
  allyWithoutAuraNearYd: 'yards to nearest ally without this aura',
  inTargetCone: "in the target's frontal cone",
  isMainTank: 'is main tank',
  isOffTank: 'is off-tank',
  myJob: 'raid job (0 dps / 1 heal / 2 OT / 3 MT)',
  myCamp: 'raid camp (0 none / 1 a / 2 b)',
  assignedHealSubgroup: 'assigned heal subgroup',
};

export const COND_METRIC_BUCKET: Record<CondMetric, CondMetricBucket> = {
  healthPct: 'common',
  powerPct: 'common',
  manaPct: 'common',
  buffPresent: 'common',
  debuffPresent: 'common',
  buffStacks: 'common',
  debuffStacks: 'common',
  buffRemainingMs: 'common',
  debuffRemainingMs: 'common',
  canAfford: 'common',
  castingPresent: 'common',
  drLevel: 'situational',
  comboPoints: 'common',
  timeToDieMs: 'common',
  enemyCount: 'common',
  formId: 'common',
  inMelee: 'common',
  hasAggro: 'common',
  allyHasAggro: 'situational',
  aggroHolderDebuffPresent: 'situational',
  aggroHolderDebuffStacks: 'situational',
  allyAuraPresent: 'situational',
  allyAuraStacks: 'situational',
  targetAttackingMe: 'common',
  allyLowestHpPct: 'common',
  allyLowestBuffPresent: 'common',
  alliesBelowHpCount: 'common',
  nearbyAlliesBelowHpCount: 'common',
  dispellablePresent: 'common',
  inCombat: 'common',
  itemCount: 'common',
  itemEquipped: 'common',
  castingSchool: 'situational',
  castingSpellId: 'situational',
  castingIsHeal: 'situational',
  dodgedRecently: 'situational',
  defenseReactRecently: 'situational',
  charmed: 'situational',
  charmedHostileCount: 'situational',
  totemPresent: 'situational',
  weaponImbuePresent: 'situational',
  petHappiness: 'situational',
  creatureTypeMask: 'situational',
  aoeMode: 'situational',
  offHealAllowed: 'situational',
  healerPowerPct: 'situational',
  partySeats: 'situational',
  meleeAllyCount: 'situational',
  deadAllyCount: 'situational',
  controlled: 'situational',
  rooted: 'situational',
  feared: 'situational',
  stunned: 'situational',
  snared: 'situational',
  silenced: 'situational',
  hasFlag: 'situational',
  allyHasFlag: 'situational',
  enemyHasFlag: 'situational',
  isFlagCarrier: 'situational',
  isHealer: 'situational',
  isCaster: 'situational',
  isHunter: 'situational',
  classId: 'situational',
  enemiesWithinYd: 'situational',
  alliesWithinYd: 'situational',
  healersWithinYd: 'situational',
  enemyHealersWithinYd: 'situational',
  enemyCastingOnAlly: 'situational',
  enemyCastingOnSelf: 'situational',
  objectiveContested: 'situational',
  objectiveOwnedByUs: 'situational',
  objectiveDistanceYd: 'situational',
  hazardProximityYd: 'situational',
  targetDistanceYd: 'situational',
  creatureDistanceYd: 'situational',
  allyWithoutAuraNearYd: 'situational',
  inTargetCone: 'situational',
  hunterParryRecently: 'situational',
  alive: 'situational',
  level: 'situational',
  combatTimeMs: 'situational',
  isMainTank: 'situational',
  isOffTank: 'situational',
  myJob: 'situational',
  myCamp: 'situational',
  assignedHealSubgroup: 'situational',
};

// Scan order inside a bucket (and for All: Common first, then Situational). `as const` + Missing check so a
// new CondMetric cannot ship unlisted.
const COND_METRIC_ORDER = [
  'healthPct', 'powerPct', 'manaPct', 'buffPresent', 'debuffPresent', 'buffStacks', 'debuffStacks',
  'buffRemainingMs', 'debuffRemainingMs', 'canAfford',
  'castingPresent', 'comboPoints', 'drLevel', 'enemyCount', 'formId', 'inMelee',
  'hasAggro', 'allyHasAggro', 'targetAttackingMe', 'aggroHolderDebuffPresent', 'aggroHolderDebuffStacks',
  'allyAuraPresent', 'allyAuraStacks',
  'allyLowestHpPct', 'allyLowestBuffPresent', 'alliesBelowHpCount', 'nearbyAlliesBelowHpCount',
  'dispellablePresent', 'inCombat', 'itemCount', 'itemEquipped',
  'castingSchool', 'castingSpellId', 'castingIsHeal', 'dodgedRecently', 'defenseReactRecently',
  'hunterParryRecently',
  'controlled', 'rooted', 'feared', 'stunned', 'snared', 'silenced',
  'totemPresent', 'weaponImbuePresent', 'petHappiness', 'creatureTypeMask',
  'aoeMode', 'offHealAllowed', 'healerPowerPct', 'partySeats', 'meleeAllyCount', 'deadAllyCount',
  'charmed', 'charmedHostileCount',
  'hasFlag', 'allyHasFlag', 'enemyHasFlag', 'isFlagCarrier',
  'isHealer', 'isCaster', 'isHunter', 'classId',
  'enemiesWithinYd', 'alliesWithinYd', 'healersWithinYd', 'enemyHealersWithinYd',
  'enemyCastingOnAlly',
  'enemyCastingOnSelf',
  'objectiveContested', 'objectiveOwnedByUs', 'objectiveDistanceYd',
  'hazardProximityYd',
  'targetDistanceYd',
  'creatureDistanceYd',
  'allyWithoutAuraNearYd',
  'inTargetCone',
  'isMainTank', 'isOffTank', 'myJob', 'myCamp', 'assignedHealSubgroup',
  'alive', 'level', 'combatTimeMs',
] as const satisfies readonly CondMetric[];

type MissingCondMetric = Exclude<CondMetric, (typeof COND_METRIC_ORDER)[number]>;
const _allMetricsListed: MissingCondMetric extends never ? true : { missing: MissingCondMetric } = true;
void _allMetricsListed;

export const ALL_COND_METRICS: CondMetric[] = [...COND_METRIC_ORDER];

export function condMetricBucket(metric: CondMetric): CondMetricBucket {
  return COND_METRIC_BUCKET[metric];
}

export function metricsInBucket(bucket: CondMetricBucket): CondMetric[] {
  return ALL_COND_METRICS.filter((m) => COND_METRIC_BUCKET[m] === bucket);
}

// Words the search accepts that the LABEL does not carry: "team" / "friendly" / "party" matched
// nothing, and a plain subject metric can now be asked about an ally, which no label says.
const COND_METRIC_ALIAS: Partial<Record<CondMetric, string>> = {
  healthPct: 'ally team friendly party raid mate',
  powerPct: 'ally team friendly party mate',
  manaPct: 'ally team friendly party mate',
  buffPresent: 'ally team friendly party mate aura',
  debuffPresent: 'ally team friendly party mate aura',
  buffRemainingMs: 'ally team friendly party mate',
  debuffRemainingMs: 'ally team friendly party mate',
  timeToDieMs: 'ally team friendly party mate dying',
  isHealer: 'ally team friendly party role',
  classId: 'ally team friendly party mage priest warrior',
  alive: 'ally team friendly party dead',
  allyLowestHpPct: 'team friendly party raid mate hurt triage',
  allyLowestBuffPresent: 'team friendly party raid mate hot triage',
  alliesBelowHpCount: 'team friendly party raid mates',
  nearbyAlliesBelowHpCount: 'team friendly party raid mates',
  meleeAllyCount: 'team friendly party raid mates',
  deadAllyCount: 'team friendly party raid mates rez',
  alliesWithinYd: 'team friendly party raid mates',
  healersWithinYd: 'team friendly party raid mates',
  allyAuraPresent: 'ally team friendly party raid mates',
  allyAuraStacks: 'ally team friendly party raid mates',
  allyWithoutAuraNearYd: 'team friendly party raid mates',
  allyHasFlag: 'team friendly party mates',
  enemyCastingOnAlly: 'team friendly party mate peel',
  enemyCastingOnSelf: 'self peel grounding totem incoming cast',
  healerPowerPct: 'team friendly party mana',
  partySeats: 'team friendly raid solo group size',
  aggroHolderDebuffPresent: 'tank team friendly party swap',
  aggroHolderDebuffStacks: 'tank team friendly party swap',
};

/** Everything a query may match on one metric: its label plus the words above. */
function metricSearchText(m: CondMetric): string {
  const alias = COND_METRIC_ALIAS[m];
  return alias ? `${COND_METRIC_LABEL[m].toLowerCase()} ${alias}` : COND_METRIC_LABEL[m].toLowerCase();
}

// Metrics to show for a filter chip. `current` stays in the list so a switch to the other bucket cannot
// blank the open condition's select.
export function metricsForFilter(
  filter: CondMetricFilter,
  current?: CondMetric,
  query = '',
): CondMetric[] {
  const q = query.trim().toLowerCase();
  // A TYPED query searches the whole catalog: a search that only reaches the open chip's half is
  // how "ally" on the Common chip returned "No matches" while six ally rows sat in Situational.
  const pool = filter === 'all' || q ? ALL_COND_METRICS : metricsInBucket(filter);
  const out = pool.filter((m) => !q || metricSearchText(m).includes(q));
  if (current != null && !out.includes(current)) out.unshift(current);
  return out;
}

export function metricOptgroups(
  metrics: readonly CondMetric[],
): { bucket: CondMetricBucket; label: string; metrics: CondMetric[] }[] {
  const groups: { bucket: CondMetricBucket; label: string; metrics: CondMetric[] }[] = [];
  for (const bucket of COND_METRIC_BUCKET_ORDER) {
    const list = metrics.filter((m) => COND_METRIC_BUCKET[m] === bucket);
    if (list.length) groups.push({ bucket, label: COND_METRIC_BUCKET_LABEL[bucket], metrics: list });
  }
  return groups;
}
