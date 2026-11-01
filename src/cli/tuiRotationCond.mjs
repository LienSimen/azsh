// The Rotation tab's "when it fires" editor: every condition phonecraft's web editor offers, driven by
// menus. The catalog (metrics, defaults, buckets) is the engine's condMetricPicker; the field shapes per
// metric (subject, reference, yes/no vs compare) mirror phonecraft src/ui/rotation/rotationEditor.ts.
// Also the smart defaults a freshly added spell or item rule starts with (build.ts defaultSpellRuleConditions).
import { bold, dim, cyan, green, red, yellow } from './text.mjs';
import {
  condSentence, conditionsSentence, ruleSentence, SUBJECT_LABEL, FORM_NAMES,
  CREATURE_TYPE_NAME, DISPEL_TYPE_NAME, SCHOOL_NAMES, TOTEM_ELEMENTS, AOE_MODE_NAMES, creatureMaskName,
} from './rotationText.mjs';
import { COND_METRIC_DEFAULTS, COND_METRIC_LABEL, COND_METRIC_BUCKET, metricsForFilter } from '../domain/rotation/condMetricPicker.ts';
import { defaultSpellRuleConditions, defaultItemRuleConditions, knownSpellsForSuggestionResolve } from '../domain/rotation/build.ts';
import { applyFormEnterGate, cond } from '../domain/rotation/classify.ts';
import { keepUpPresenceCondition } from '../domain/rotation/auraSide.ts';
import { spellAddPresetsFor } from '../domain/rotation/spellPicker.ts';
import { combatItems } from '../domain/character/character.ts';
import { imbueItemsIn } from '../domain/bots/companionPrep.ts';
import { consumableFamilyOfEntry } from '../domain/items/consumableFamily.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { allySideAt } from '../engine/core/events.ts';
import { CLASS_NAMES } from '../domain/core/ids.ts';
import { DISPEL_TYPE } from '../domain/spells/dispel.ts';

// ---- field shapes per metric (phonecraft rotationEditor.ts) ---------------------------------------

const SUBJECTS = ['self', 'target', 'pet'];
/** Metrics whose subject may be a friendly, so the list offers "an ally" on them. */
const ALLY_SUBJECT_METRICS = new Set([
  'healthPct', 'powerPct', 'manaPct', 'level', 'alive', 'timeToDieMs',
  'buffPresent', 'debuffPresent', 'buffStacks', 'debuffStacks', 'buffRemainingMs', 'debuffRemainingMs',
  'castingPresent', 'castingIsHeal', 'castingSchool', 'castingSpellId',
  'classId', 'isHealer', 'isCaster', 'isHunter', 'formId', 'inMelee',
  'controlled', 'rooted', 'feared', 'stunned', 'snared', 'charmed', 'hasFlag', 'isFlagCarrier', 'drLevel',
]);
/** Metrics that ignore the subject entirely (evaluate.ts resolves them without subjectOf). */
const SUBJECTLESS_METRICS = new Set([
  'itemCount', 'itemEquipped', 'combatTimeMs', 'inCombat', 'enemyCount', 'totemPresent', 'weaponImbuePresent',
  'allyLowestHpPct', 'hasAggro', 'targetAttackingMe', 'charmedHostileCount', 'deadAllyCount', 'aoeMode',
  'offHealAllowed', 'partySeats', 'allyLowestBuffPresent', 'allyAuraPresent', 'allyAuraStacks',
  'alliesBelowHpCount', 'nearbyAlliesBelowHpCount', 'meleeAllyCount', 'allyHasFlag', 'enemyHasFlag',
  'enemiesWithinYd', 'alliesWithinYd', 'healersWithinYd', 'enemyHealersWithinYd', 'enemyCastingOnAlly',
  'enemyCastingOnSelf', 'objectiveContested', 'objectiveOwnedByUs', 'objectiveDistanceYd', 'allyWithoutAuraNearYd',
  'hazardProximityYd', 'targetDistanceYd', 'creatureDistanceYd', 'allyHasAggro', 'isMainTank', 'isOffTank',
  'myJob', 'myCamp', 'assignedHealSubgroup', 'healerPowerPct',
]);
/** Metrics whose reference is a spell id. */
const SPELL_REF_METRICS = new Set([
  'buffPresent', 'debuffPresent', 'buffStacks', 'debuffStacks', 'allyLowestBuffPresent', 'buffRemainingMs',
  'debuffRemainingMs', 'canAfford', 'allyAuraPresent', 'allyAuraStacks', 'allyWithoutAuraNearYd',
  'aggroHolderDebuffPresent', 'aggroHolderDebuffStacks', 'castingSpellId',
]);
/** Metrics whose comparison is a plain yes / no, with the wording for each side ([yes, no]). */
const BOOL_LABEL = {
  alive: ['is alive', 'is dead'],
  buffPresent: ['has it', 'does not have it'], debuffPresent: ['has it', 'does not have it'],
  allyLowestBuffPresent: ['the most-hurt ally has it', 'the most-hurt ally does not have it'],
  allyAuraPresent: ['anyone has it', 'nobody has it'],
  aggroHolderDebuffPresent: ['the tank has it', 'the tank does not have it'],
  castingPresent: ['is casting', 'is not casting'], castingIsHeal: ['the cast is a heal', 'the cast is not a heal'],
  castingSpellId: ['is casting that spell', 'is not casting that spell'],
  dodgedRecently: ['dodged recently', 'has not dodged recently'],
  defenseReactRecently: ['had a defense react', 'had no defense react'],
  hunterParryRecently: ['parried recently', 'has not parried recently'],
  inMelee: ['in melee', 'at range'], charmed: ['is charmed / possessed', 'is not charmed'],
  totemPresent: ['slot occupied', 'slot empty'], weaponImbuePresent: ['has an imbue', 'has no imbue'],
  hasAggro: ['an enemy is on you', 'no enemy is on you'], allyHasAggro: ['an enemy is on an ally', 'no enemy is on an ally'],
  targetAttackingMe: ['the target is attacking you', 'the target is attacking someone else'],
  offHealAllowed: ['off-heal is on', 'off-heal is off'],
  creatureTypeMask: ['matches', 'does not match'], dispellablePresent: ['is present', 'is not present'],
  controlled: ['under crowd control', 'free of crowd control'], rooted: ['rooted', 'not rooted'],
  feared: ['feared', 'not feared'], stunned: ['stunned', 'not stunned'], snared: ['snared', 'not snared'],
  silenced: ['silenced', 'not silenced'],
  hasFlag: ['carrying the flag', 'not carrying the flag'], allyHasFlag: ['we have a flag', 'we have no flag'],
  enemyHasFlag: ['they have our flag', 'they do not have it'], isFlagCarrier: ['is the flag carrier', 'is not the carrier'],
  isHealer: ['is a healer', 'is not a healer'], isCaster: ['is a caster', 'is not a caster'],
  isHunter: ['is a hunter', 'is not a hunter'], inCombat: ['in combat', 'out of combat'],
  itemEquipped: ['equipped', 'not equipped'],
  enemyCastingOnAlly: ['an enemy is casting at an ally', 'no enemy is casting at an ally'],
  enemyCastingOnSelf: ['an enemy is casting at you', 'no enemy is casting at you'],
  objectiveContested: ['contested', 'not contested'], objectiveOwnedByUs: ['ours', 'not ours'],
  inTargetCone: ['in the frontal cone', 'out of the frontal cone'],
  isMainTank: ['is the main tank', 'is not the main tank'], isOffTank: ['is an off-tank', 'is not an off-tank'],
};
const OPS = ['<', '<=', '>', '>=', '==', '!='];
const OP_LABEL = { '<': 'less than', '<=': 'at most', '>': 'more than', '>=': 'at least', '==': 'equal to', '!=': 'not equal to' };
/** Metrics whose value is a named thing rather than a number: [value, label] pairs. */
const NAMED_VALUE = {
  castingSchool: { opWords: ['is', 'is not'], options: () => SCHOOL_NAMES.map((n, i) => [i, n]) },
  aoeMode: { opWords: ['is', 'is not'], options: () => Object.entries(AOE_MODE_NAMES).map(([v, n]) => [Number(v), n]) },
  classId: { opWords: ['is a', 'is not a'], options: () => PLAYER_CLASS_IDS.map((id) => [id, CLASS_NAMES[id] ?? String(id)]) },
  formId: { opWords: ['in', 'not in'], options: () => Object.entries(FORM_NAMES).map(([v, n]) => [Number(v), n]) },
  myJob: { opWords: ['is', 'is not'], options: () => [[0, 'DPS'], [1, 'Healer'], [2, 'Off-tank'], [3, 'Main tank']] },
  myCamp: { opWords: ['is', 'is not'], options: () => [[0, 'unassigned'], [1, 'camp A'], [2, 'camp B'], [3, 'camp C']] },
};
const PLAYER_CLASS_IDS = [1, 2, 3, 4, 5, 7, 8, 9, 11];
/** The dispel categories a gate can ask about (classify.ts dispelGateConditions). */
const DISPEL_CATEGORIES = [DISPEL_TYPE.MAGIC, DISPEL_TYPE.CURSE, DISPEL_TYPE.DISEASE, DISPEL_TYPE.POISON, DISPEL_TYPE.STEALTH, DISPEL_TYPE.INVISIBILITY, DISPEL_TYPE.ENRAGE];
const ALLY_WHO = [
  ['any', 'any ally'], ['role:tank', 'the tank'], ['role:healer', 'a healer'], ['role:damage', 'a DPS'],
  ['not:tank', 'anyone but the tank'], ['not:healer', 'anyone but a healer'], ['not:damage', 'anyone but a DPS'],
];
/** What a metric's number means, for the prompt. */
const VALUE_UNIT = {
  healthPct: '%', powerPct: '%', manaPct: '%', petHappiness: '%', allyLowestHpPct: '%', healerPowerPct: '%',
  buffRemainingMs: 'ms', debuffRemainingMs: 'ms', combatTimeMs: 'ms', timeToDieMs: 'ms',
  enemiesWithinYd: 'enemies', alliesWithinYd: 'allies', healersWithinYd: 'healers', enemyHealersWithinYd: 'healers',
  objectiveDistanceYd: 'yd', hazardProximityYd: 'yd', targetDistanceYd: 'yd', creatureDistanceYd: 'yd', allyWithoutAuraNearYd: 'yd',
};
/** Metrics whose `ref` is a yard radius / health band the count is taken over. */
const REF_NUMBER = {
  enemiesWithinYd: 'Within how many yards', alliesWithinYd: 'Within how many yards', healersWithinYd: 'Within how many yards',
  enemyHealersWithinYd: 'Within how many yards', alliesBelowHpCount: 'Below what health %', nearbyAlliesBelowHpCount: 'Within how many yards',
  creatureDistanceYd: 'Creature entry', drLevel: 'Diminishing group',
};
const isBool = (m) => m in BOOL_LABEL;
const condYes = (c) => (c.op === '!=' ? c.value === 0 : c.value !== 0);

// ---- smart defaults for a new rule ------------------------------------------------------------------

/** The conditions a spell rule starts with: the engine's smart default, plus the form-enter gate. */
export function defaultConditionsForSpell(sp, char) {
  const base = defaultSpellRuleConditions(sp, char).conditions;
  return applyFormEnterGate(sp, base);
}

/** The conditions an item rule starts with, read off what the item actually does, and its rank ladder. */
export function defaultItemRule(app, owner, itemEntry) {
  const ds = app.ds;
  const bags = { stacks: owner.bag() };
  const isImbue = imbueItemsIn(bags, ds).some((x) => x.entry === itemEntry);
  const ci = combatItems(owner.char(), bags, ds).find((x) => x.entry === itemEntry);
  const effect = ci?.effect;
  const kind = isImbue ? 'weapon_imbue' : (effect?.kind ?? '');
  const buffSpellId = effect?.kind === 'apply_buff' ? effect.spellId : undefined;
  const payload = effect?.kind === 'friendly_cast' ? { spell: effect.spell, spellId: effect.spellId, ds } : {};
  const { conditions } = defaultItemRuleConditions(kind, { itemEntry, ...(buffSpellId != null ? { buffSpellId } : {}), ...payload });
  const family = consumableFamilyOfEntry(itemEntry, ds);
  return { action: { kind: 'item', itemEntry, ...(family ? { family } : {}) }, conditions };
}

/** The quick presets for a spell rule (phonecraft's template chips), each a whole condition list. */
function presetLists(sp, char) {
  if (!sp) return [];
  const smart = defaultConditionsForSpell(sp, char);
  const out = [{ label: `Recommended for ${sp.name}`, conds: smart }];
  for (const p of spellAddPresetsFor(sp)) {
    switch (p.id) {
      case 'on_cast': out.push({ label: p.title, conds: [cond('target', 'castingPresent', '==', 1)] }); break;
      case 'on_aggro': out.push({ label: p.title, conds: [cond('self', 'hasAggro', '==', 1)] }); break;
      case 'off_target': out.push({ label: p.title, conds: [cond('self', 'targetAttackingMe', '==', 0)] }); break;
      case 'low_self_hp': out.push({ label: p.title, conds: [cond('self', 'healthPct', '<', 35)] }); break;
      case 'pack': out.push({ label: p.title, conds: [cond('self', 'enemyCount', '>=', 2)] }); break;
      case 'keep_up': {
        const hasGate = smart.some((c) => ['debuffPresent', 'buffPresent', 'buffStacks', 'debuffStacks', 'buffRemainingMs', 'debuffRemainingMs', 'feared'].includes(c.metric));
        out.push({ label: p.title, conds: hasGate ? smart : [keepUpPresenceCondition(sp)] });
        break;
      }
      default: break;
    }
  }
  return out;
}

// ---- the editor ----------------------------------------------------------------------------------------

/** A list view whose rows are rebuilt on every render, so it stays open while sub-pickers change the rule. */
function liveMenu(app, id, title, rowsFn) {
  const view = { id, title, hint: 'Enter: choose   Esc: back', rows: () => rowsFn() };
  app.push(view);
  return view;
}
const numberPrompt = (app, label, cur, onOk) => app.prompt(`${label} (now ${cur}): `, (txt) => {
  const n = Number(txt);
  if (!Number.isFinite(n)) { app.flashMsg('Enter a number.'); return; }
  onOk(n);
  app.afterAction();
}, '');

/** Switch a condition to another metric: the catalog's starting comparison, keeping what still applies. */
function applyMetric(c, metric, ruleSpellId) {
  c.metric = metric;
  const def = COND_METRIC_DEFAULTS[metric];
  c.op = def.op; c.value = def.value;
  if (def.subject) c.subject = def.subject;
  else if (SUBJECTLESS_METRICS.has(metric)) c.subject = 'self';
  if (def.ref != null) c.ref = def.ref;
  else if (SPELL_REF_METRICS.has(metric) && ruleSpellId) c.ref = ruleSpellId;
  else delete c.ref;
  if (c.subject !== 'ally') delete c.ally;
}

/**
 * Open the condition editor for one rule. `ctx` is `{ phase, index, owner, names, mutate }` where
 * `mutate(fn)` edits the live rotation (fn receives the rotation) and `owner` is the Rotation tab's subject.
 */
export function conditionEditor(app, ctx) {
  const { phase, index, owner, names } = ctx;
  const ruleNow = () => owner.get().phases[phase]?.[index];
  const edit = (fn) => ctx.mutate((rot) => { const r = rot.phases[phase]?.[index]; if (r) fn(r); });
  const editCond = (i, fn) => edit((r) => { const c = r.conditions[i]; if (c) fn(c, r); });
  const ruleSpellId = () => { const r = ruleNow(); return r?.action.kind === 'spell' ? r.action.spellId : 0; };
  const ruleSpell = () => (ruleSpellId() ? app.ds.spell(ruleSpellId()) : null);
  const char = () => owner.char();

  // ---- pickers for one field ----
  const pickMetric = (cur, onPick) => {
    const view = { filter: 'all', q: '' };
    const open = () => {
      const metrics = metricsForFilter(view.filter, cur, view.q);
      const opts = [];
      let last = null;
      for (const m of metrics) {
        const b = COND_METRIC_BUCKET[m];
        if (b !== last && !view.q) { opts.push({ label: bold(b === 'common' ? 'Common' : 'Situational'), value: null }); last = b; }
        opts.push({ label: `${m === cur ? green('● ') : '  '}${COND_METRIC_LABEL[m]}`, value: m });
      }
      app.pick(view.q ? `Conditions matching "${view.q}"` : 'What to check', opts, (m) => { if (m) onPick(m); else open(); }, { hint: 'Enter: choose   /: search   Esc: back' });
      const top = app.top();
      top.onKey = (a, k) => {
        if (k !== '/') return false;
        a.prompt('Search conditions: ', (txt) => { a.pop(); view.q = txt; open(); });
        return true;
      };
    };
    open();
  };
  const pickSpellRef = (cur, onPick) => {
    const known = knownSpellsForSuggestionResolve(char(), owner.spellbook(), app.ds).sort((a, b) => a.name.localeCompare(b.name));
    const opts = known.map((s) => ({ label: `${s.id === cur ? green('● ') : '  '}${s.name}${s.rank ? dim(` (Rank ${s.rank})`) : ''}`, value: s.id }));
    if (cur != null && !known.some((s) => s.id === cur)) opts.unshift({ label: `${green('● ')}${names.spell(cur)}`, value: cur });
    app.pick('Which spell or aura', opts, onPick);
  };
  const pickItemRef = (cur, includeEquipped, onPick) => {
    const seen = new Set();
    const opts = [];
    for (const st of owner.bag()) {
      if (seen.has(st.item)) continue; seen.add(st.item);
      const it = app.ds.item(st.item);
      if (it) opts.push({ label: `${it.entry === cur ? green('● ') : '  '}${it.name}`, value: it.entry });
    }
    if (includeEquipped) {
      for (const v of Object.values(owner.equipped() ?? {})) {
        const e = equippedEntry(v);
        if (e == null || seen.has(e)) continue; seen.add(e);
        const it = app.ds.item(e);
        if (it) opts.push({ label: `${e === cur ? green('● ') : '  '}${it.name} ${dim('(worn)')}`, value: e });
      }
    }
    if (cur != null && !seen.has(cur)) opts.unshift({ label: `${green('● ')}${names.item(cur)}`, value: cur });
    if (!opts.length) { app.flashMsg('Nothing in the bags to pick.'); return; }
    app.pick('Which item', opts, onPick);
  };
  const pickNamed = (title, pairs, cur, onPick) => app.pick(title, pairs.map(([v, n]) => ({ label: `${v === cur ? green('● ') : '  '}${n}`, value: v })), onPick);

  // ---- the rows describing one condition's reference ----
  const refRow = (c, i) => {
    const m = c.metric;
    const set = (ref) => editCond(i, (x) => { x.ref = ref; });
    if (SPELL_REF_METRICS.has(m)) return { text: `Spell: ${cyan(c.ref ? names.spell(c.ref) : 'choose…')}`, act: () => pickSpellRef(c.ref, set) };
    if (m === 'itemCount' || m === 'itemEquipped') return { text: `Item: ${cyan(c.ref ? names.item(c.ref) : 'choose…')}`, act: () => pickItemRef(c.ref, m === 'itemEquipped', set) };
    if (m === 'totemPresent') return { text: `Totem slot: ${cyan(TOTEM_ELEMENTS[c.ref ?? 0] ?? '?')}`, act: () => pickNamed('Which totem slot', TOTEM_ELEMENTS.map((n, k) => [k, n]), c.ref ?? 0, set) };
    if (m === 'weaponImbuePresent') { const hands = [[0, 'main hand'], [1, 'off hand'], [2, 'any open weapon hand']]; return { text: `Hand: ${cyan(hands.find(([v]) => v === (c.ref ?? 0))?.[1] ?? '?')}`, act: () => pickNamed('Which hand', hands, c.ref ?? 0, set) }; }
    if (m === 'creatureTypeMask') {
      const types = [...CREATURE_TYPE_NAME].map(([t, n]) => [1 << (t - 1), n]);
      return { text: `Creature type: ${cyan(creatureMaskName(c.ref))}`, act: () => pickNamed('Which creature type', types, c.ref, set) };
    }
    if (m === 'dispellablePresent') return { text: `Aura kind: ${cyan(DISPEL_TYPE_NAME.get(c.ref ?? 0) ?? 'any')}`, act: () => pickNamed('Which kind of aura', DISPEL_CATEGORIES.map((t) => [t, DISPEL_TYPE_NAME.get(t) ?? String(t)]), c.ref, set) };
    if (REF_NUMBER[m]) return { text: `${REF_NUMBER[m]}: ${cyan(String(c.ref ?? COND_METRIC_DEFAULTS[m].ref ?? 0))}`, act: () => numberPrompt(app, REF_NUMBER[m], c.ref ?? COND_METRIC_DEFAULTS[m].ref ?? 0, set) };
    return null;
  };

  // ---- the rows describing the comparison ----
  const compareRows = (c, i) => {
    const m = c.metric;
    if (isBool(m)) {
      const [yes, no] = BOOL_LABEL[m];
      return [{ text: `Is: ${cyan(condYes(c) ? yes : no)}`, act: () => pickNamed('Fire when', [[1, yes], [0, no]], condYes(c) ? 1 : 0, (v) => editCond(i, (x) => { x.op = '=='; x.value = v; })) }];
    }
    if (NAMED_VALUE[m]) {
      const nv = NAMED_VALUE[m];
      const pairs = nv.options();
      const isNot = c.op === '!=';
      const rows = [{ text: `Compare: ${cyan(isNot ? nv.opWords[1] : nv.opWords[0])}`, act: () => pickNamed('Compare', [['==', nv.opWords[0]], ['!=', nv.opWords[1]]], isNot ? '!=' : '==', (op) => editCond(i, (x) => { x.op = op; })) }];
      rows.push({ text: `Value: ${cyan(pairs.find(([v]) => v === c.value)?.[1] ?? String(c.value))}`, act: () => pickNamed(COND_METRIC_LABEL[m], pairs, c.value, (v) => editCond(i, (x) => { x.value = v; })) });
      return rows;
    }
    return [
      { text: `Compare: ${cyan(OP_LABEL[c.op] ?? c.op)}`, act: () => pickNamed('Compare', OPS.map((o) => [o, OP_LABEL[o]]), c.op, (op) => editCond(i, (x) => { x.op = op; })) },
      { text: `Value: ${cyan(`${c.value}${VALUE_UNIT[m] ? ` ${VALUE_UNIT[m]}` : ''}`)}`, act: () => numberPrompt(app, `Value${VALUE_UNIT[m] ? ` (${VALUE_UNIT[m]})` : ''}`, c.value, (n) => editCond(i, (x) => { x.value = n; })) },
    ];
  };

  // ---- the ally filter rows ----
  const allyRows = (c, i) => {
    const fl = c.ally ?? {};
    const who = fl.role ? `role:${fl.role}` : fl.notRole ? `not:${fl.notRole}` : 'any';
    const seats = [['player', app.g.state.char.name || 'You'], ...(app.g.state.squad ?? []).map((m, k) => [allySideAt(k), m.name])];
    const setAlly = (fn) => editCond(i, (x) => {
      const f = { ...(x.ally ?? {}) }; fn(f);
      if (f.role == null && f.notRole == null && f.classId == null && !f.unit) delete x.ally; else x.ally = f;
    });
    return [
      { text: `  Which ally: ${cyan(ALLY_WHO.find(([v]) => v === who)?.[1])}`, act: () => pickNamed('Which ally', ALLY_WHO, who, (v) => setAlly((f) => { delete f.role; delete f.notRole; const [k, r] = v.split(':'); if (k === 'role') f.role = r; else if (k === 'not') f.notRole = r; })) },
      { text: `  Only this class: ${cyan(fl.classId != null ? CLASS_NAMES[fl.classId] : 'any class')}`, act: () => pickNamed('Only this class', [[null, 'any class'], ...PLAYER_CLASS_IDS.map((id) => [id, CLASS_NAMES[id]])], fl.classId ?? null, (v) => setAlly((f) => { if (v == null) delete f.classId; else f.classId = v; })) },
      { text: `  One exact ally: ${cyan(fl.unit ? (seats.find(([s]) => s === fl.unit)?.[1] ?? fl.unit) : 'anyone')}`, act: () => pickNamed('One exact ally', [[null, 'anyone'], ...seats], fl.unit ?? null, (v) => setAlly((f) => { if (v == null) delete f.unit; else f.unit = v; })) },
    ];
  };

  // ---- one condition's menu ----
  const openCond = (i) => {
    liveMenu(app, 'cond', `Condition ${i + 1}`, () => {
      const r = ruleNow(); const c = r?.conditions[i];
      if (!c) return [{ text: dim('This condition is gone. Esc to go back.'), header: true }];
      const rows = [{ text: bold(condSentence(c, names)), header: true }, { text: '', header: true }];
      rows.push({ text: `Check: ${cyan(COND_METRIC_LABEL[c.metric] ?? c.metric)}`, detail: () => [bold('What to check'), '', 'The whole catalog: health and power, auras and stacks, casting, crowd control, counts of enemies and allies, distances, battleground and raid state.'], act: () => pickMetric(c.metric, (m) => editCond(i, (x) => applyMetric(x, m, ruleSpellId()))) });
      if (!SUBJECTLESS_METRICS.has(c.metric)) {
        const subjects = ALLY_SUBJECT_METRICS.has(c.metric) || c.subject === 'ally' ? [...SUBJECTS, 'ally'] : SUBJECTS;
        rows.push({ text: `Who: ${cyan(SUBJECT_LABEL[c.subject] ?? c.subject)}`, act: () => pickNamed('Who', subjects.map((s) => [s, SUBJECT_LABEL[s]]), c.subject, (s) => editCond(i, (x) => { x.subject = s; if (s !== 'ally') delete x.ally; })) });
        if (c.subject === 'ally') rows.push(...allyRows(c, i));
      }
      const ref = refRow(c, i);
      if (ref) rows.push(ref);
      rows.push(...compareRows(c, i));
      if (i > 0) rows.push({ text: `Joins the one above with: ${cyan(c.join === 'or' ? 'or' : 'and')}`, detail: () => [bold('and / or'), '', '"and" means both must hold. "or" starts a new group, so "A and B or C" fires on (A and B) or (C).'], act: () => editCond(i, (x) => { if (x.join === 'or') delete x.join; else x.join = 'or'; }) });
      rows.push({ text: '', header: true });
      if (r.conditions.length > 1) {
        if (i > 0) rows.push({ text: 'Move up', act: () => { edit((rr) => { [rr.conditions[i - 1], rr.conditions[i]] = [rr.conditions[i], rr.conditions[i - 1]]; }); app.pop(); openCond(i - 1); } });
        if (i < r.conditions.length - 1) rows.push({ text: 'Move down', act: () => { edit((rr) => { [rr.conditions[i + 1], rr.conditions[i]] = [rr.conditions[i], rr.conditions[i + 1]]; }); app.pop(); openCond(i + 1); } });
      }
      rows.push({ text: red('Remove this condition'), act: () => { edit((rr) => { rr.conditions.splice(i, 1); }); app.pop(); } });
      return rows;
    });
  };

  // ---- the rule's list of conditions ----
  const addCondition = () => pickMetric(undefined, (m) => {
    let at = 0;
    edit((r) => {
      const c = { subject: 'self', metric: 'healthPct', op: '<', value: 50 };
      applyMetric(c, m, ruleSpellId());
      r.conditions.push(c);
      at = r.conditions.length - 1;
    });
    openCond(at);
  });
  const quickPresets = () => {
    const sp = ruleSpell();
    const opts = [{ label: 'Always (no conditions)', value: [] }, ...presetLists(sp, char()).map((p) => ({ label: p.label, detail: () => [bold(p.label), '', conditionsSentence(p.conds, names)], value: p.conds }))];
    const spellName = sp?.name ?? 'this spell';
    opts.push(
      { label: 'My health is below …%', value: 'hp', prompt: { metric: 'healthPct', subject: 'self', op: '<' } },
      { label: 'My mana/power is above …%', value: 'pw', prompt: { metric: 'powerPct', subject: 'self', op: '>' } },
      { label: "The enemy's health is below …%", value: 'ehp', prompt: { metric: 'healthPct', subject: 'target', op: '<' } },
      { label: "The enemy's health is above …%", value: 'ehp2', prompt: { metric: 'healthPct', subject: 'target', op: '>' } },
      ...(sp ? [
        { label: `The enemy does not have ${spellName}`, value: [cond('target', 'debuffPresent', '==', 0, sp.id)] },
        { label: `I do not have ${spellName}`, value: [cond('self', 'buffPresent', '==', 0, sp.id)] },
        { label: `${spellName} has under 3 s left on the enemy`, value: [cond('target', 'debuffRemainingMs', '<', 3000, sp.id)] },
      ] : []),
      { label: 'The enemy is casting', value: [cond('target', 'castingPresent', '==', 1)] },
      { label: 'More than one living enemy', value: [cond('self', 'enemyCount', '>', 1)] },
      { label: 'I am in melee range', value: [cond('self', 'inMelee', '==', 1)] },
      { label: 'I am at range', value: [cond('self', 'inMelee', '==', 0)] },
    );
    const apply = (conds) => edit((r) => { r.conditions = structuredClone(conds); });
    app.pick('Replace the conditions with…', opts.map((o) => ({ label: o.label, detail: o.detail, value: o })), (o) => {
      if (Array.isArray(o.value)) { apply(o.value); return; }
      app.prompt('Percent: ', (txt) => {
        const n = Number(txt);
        if (!(n >= 0 && n <= 100)) { app.flashMsg('Enter a number from 0 to 100.'); return; }
        apply([{ ...o.prompt, value: n }]);
        app.afterAction();
      });
    });
  };

  liveMenu(app, 'conds', 'When it fires', () => {
    const r = ruleNow();
    if (!r) return [{ text: dim('This rule is gone. Esc to go back.'), header: true }];
    const rows = [{ text: bold(ruleSentence(r, names)), header: true }, { text: dim(r.conditions.length ? `Fires only when ${conditionsSentence(r.conditions, names)}.` : 'No conditions: fires whenever it is the first usable row.'), header: true }, { text: '', header: true }];
    r.conditions.forEach((c, i) => rows.push({
      text: `${i === 0 ? dim('when ') : c.join === 'or' ? yellow('or   ') : dim('and  ')}${condSentence(c, names)}`,
      detail: () => [bold(condSentence(c, names)), '', 'Enter to change what it checks, who it is about, the comparison, or remove it.'],
      act: () => openCond(i),
    }));
    rows.push({ text: green('+ Add a condition'), detail: () => [bold('Add a condition'), '', 'Pick from the whole catalog, then set who it is about and the comparison.'], act: addCondition });
    rows.push({ text: 'Quick presets…', detail: () => [bold('Quick presets'), '', 'Replace the list with a recommended set: the smart default for this spell, keep-up, on cast, low health, packs.'], act: quickPresets });
    if (r.conditions.length) rows.push({ text: 'Clear all (always)', act: () => edit((rr) => { rr.conditions = []; }) });
    return rows;
  });
}
