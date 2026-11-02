// The Settings window (phonecraft panels/settingsPanel.ts, Loot tab): auto-loot, the equipment helper, automatic
// disenchanting, the junk rules (what gets sold or destroyed on its own) and which gathering nodes the autopilot
// takes. Enter flips or cycles a row. "Every character" settings live in ~/.azsh/prefs.json through the
// createGame hooks; "this character" settings live in the save.
import { bold, dim, yellow, green, red, cyan, qualityPaint, coinText } from './text.mjs';
import { autoLootOn } from './tuiLoot.mjs';
import { JUNK_PROTECT_CATEGORIES } from '../domain/items/junkCategories.ts';
import { autopilotSettingsDialog } from './tuiAutopilotSettings.mjs';
import { paceLabel, nextPace } from './tuiWorld.mjs';

const H = (text) => ({ text, header: true });
const QUALITY_NAME = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic'];
const DE_STEPS = [null, 2, 3, 4]; // off, then the ceiling
const REFRESH_STEPS = [50, 100, 250, 500, 1000]; // ms between screen repaints while the game runs on its own
const onOff = (v) => (v ? green('on') : dim('off'));

/** How often a running game loop repaints the screen, from the prefs file (100 ms, every engine tick, by default). */
export function refreshMs(prefs) {
  const ms = prefs.get('refreshMs');
  return REFRESH_STEPS.includes(ms) ? ms : 100;
}
const box = (v) => (v ? green('✓') : dim('·'));

/** The `createGame` options that back the every-character layers (and account macros) with the prefs file. */
export function globalSettingsOpts(prefs) {
  return {
    junkFilter: () => prefs.get('junkFilter'),
    onJunkFilterChange: (cfg) => prefs.set('junkFilter', cfg),
    autoDisenchant: () => prefs.get('autoDisenchant'),
    onAutoDisenchantChange: (cfg) => prefs.set('autoDisenchant', cfg),
    accountMacros: () => prefs.get('accountMacros') ?? [],
    onAccountMacrosChange: (list) => prefs.set('accountMacros', list),
  };
}

function deText(cfg) { return cfg.enabled ? `up to ${qualityPaint(cfg.maxQuality)(QUALITY_NAME[cfg.maxQuality])}` : dim('off'); }
function nextDe(cfg) {
  const i = DE_STEPS.indexOf(cfg.enabled ? cfg.maxQuality : null);
  const q = DE_STEPS[(i + 1) % DE_STEPS.length];
  return q == null ? { ...cfg, enabled: false } : { ...cfg, enabled: true, maxQuality: q };
}

/** The junk layer edits land on: this character's when it keeps its own rules, else every character's. */
function junkLayer(g) {
  const ch = g.characterJunkFilterConfig();
  return ch.characterSpecific
    ? { cfg: ch, set: (next) => g.setCharacterJunkFilterConfig({ ...ch, ...next }), scope: 'this character' }
    : { cfg: g.globalJunkFilterConfig(), set: (next) => g.setGlobalJunkFilterConfig({ ...g.globalJunkFilterConfig(), ...next }), scope: 'every character' };
}

export function settingsDialog(app) {
  return {
    id: 'settings', title: 'Settings', hint: 'Enter: change',
    rows(a) {
      const g = a.g;
      const rows = [{ text: `Autopilot settings  ${dim('resting, pulls, fighting, questing   (:autopilot)')}`, act: (a2) => a2.push(autopilotSettingsDialog(a2)) }, H(''), H(bold('Loot'))];
      rows.push({ text: `Auto-loot                 ${onOff(autoLootOn(a))}`, detail: () => [bold('Auto-loot'), '', 'On: a corpse\'s drops and coin go straight into your bags.', 'Off: the loot window opens and you take what you want.'], act: (a2) => a2.prefs.set('autoLoot', !autoLootOn(a2)) });

      const ms = refreshMs(a.prefs);
      rows.push(H(''), H(bold('Screen')));
      rows.push({
        text: `Screen refresh            ${ms === 100 ? dim('100 ms') : cyan(`${ms} ms`)}`,
        detail: () => [bold('Screen refresh'), '', 'How often fights, the autopilot, dungeon walks and battlegrounds repaint the screen.', 'The game itself still ticks every 100 ms; this only changes how often you see it.', 'Slower is calmer and lighter on a slow terminal or a remote session; 50 ms is smoother at high speed.', 'Key presses always repaint at once.'],
        act: (a2) => a2.prefs.set('refreshMs', REFRESH_STEPS[(REFRESH_STEPS.indexOf(ms) + 1) % REFRESH_STEPS.length]),
      });

      const pace = a.prefs.get('travelPace') ?? 'instant';
      rows.push(H(''), H(bold('Travel')));
      rows.push({
        text: `Travel pace               ${pace === 'instant' ? dim('instant') : cyan(paceLabel(pace))}`,
        detail: () => [bold('Travel pace'), '', 'Instant: you arrive the moment you set off.', 'Real time: a trip takes as long as the road (1x), or half or a quarter of it. The header counts it down; the World tab has the journey card.'],
        act: (a2) => {
          const next = nextPace(pace);
          a2.prefs.set('travelPace', next);
          // Switching to instant lands a trip already underway, as phonecraft does.
          if (next === 'instant' && g.state.char.journey) a2.arriveNow();
        },
      });

      const eh = g.equipmentHelperConfig();
      rows.push(H(''), H(bold('Equipment helper')));
      rows.push({ text: `Helper                    ${onOff(eh.enabled)}`, detail: () => [bold('Equipment helper'), '', 'Scores what you pick up against what you wear and marks upgrades with ▲.'], act: (a2) => g.setEquipmentHelperConfig({ ...eh, enabled: !eh.enabled }) });
      rows.push({ text: `Upgrades                  ${eh.mode === 'auto' ? green('put on as they drop') : cyan('suggest only')}`, detail: () => [bold('Upgrades'), '', 'Suggest: ▲ on the Character and Bags tabs, u puts them on.', 'Put on: strict upgrades are worn the moment they land in your bags.'], act: () => g.setEquipmentHelperConfig({ ...eh, mode: eh.mode === 'auto' ? 'suggest' : 'auto' }) });

      const deMine = g.characterAutoDisenchantConfig(), deAll = g.globalAutoDisenchantConfig();
      rows.push(H(''), H(bold('Disenchant on its own')));
      const deDetail = ['Gear that is not an upgrade breaks down into enchanting mats once someone in the group has the skill.', 'The higher of the two settings wins.'];
      rows.push({ text: `This character            ${deText(deMine)}`, detail: () => [bold('Auto-disenchant, this character'), '', ...deDetail], act: () => g.setCharacterAutoDisenchantConfig(nextDe(deMine)) });
      rows.push({ text: `Every character           ${deText(deAll)}`, detail: () => [bold('Auto-disenchant, every character'), '', ...deDetail], act: () => g.setGlobalAutoDisenchantConfig(nextDe(deAll)) });
      rows.push({ text: `Keep companion upgrades   ${onOff(deMine.protectCompanionUpgrades)}`, detail: () => [bold('Keep companion upgrades'), '', 'Gear a companion would wear is never broken down or sold. Your own upgrades are always kept.'], act: () => g.setCharacterAutoDisenchantConfig({ ...deMine, protectCompanionUpgrades: !deMine.protectCompanionUpgrades }) });
      rows.push({ text: green('Disenchant now'), detail: () => [bold('Disenchant now'), '', 'Runs the rule above over your bags once.'], act: (a2) => { const n = g.autoDisenchantUpgrades(); if (n) a2.say(green(`Disenchanted ${n} item${n === 1 ? '' : 's'}.`)); else a2.flashMsg(g.autoDisenchantConfig().enabled ? 'Nothing in your bags matches.' : 'Switch auto-disenchant on first.'); } });

      const own = g.characterJunkFilterConfig().characterSpecific;
      const { cfg: jf, set: setJunk, scope } = junkLayer(g);
      rows.push(H(''), H(`${bold('Junk')}   ${dim(`editing the rules for ${scope}`)}`));
      rows.push({ text: `Rules                     ${own ? cyan('this character\'s own') : dim('shared by every character')}`, detail: () => [bold('Whose junk rules'), '', 'Every character shares one set of junk rules unless this one keeps its own.', 'The keep, sell and destroy lists always apply from both.'], act: () => { const ch = g.characterJunkFilterConfig(); g.setCharacterJunkFilterConfig({ ...ch, characterSpecific: !ch.characterSpecific }); } });
      rows.push({ text: `Sell junk at a vendor     ${onOff(jf.autoSell)}`, act: () => setJunk({ autoSell: !jf.autoSell }) });
      for (let q = 0; q <= 4; q++) rows.push({ text: `  ${box(jf.sellQuality[q])} sell ${qualityPaint(q)(QUALITY_NAME[q])}`, act: () => setJunk({ sellQuality: { ...jf.sellQuality, [q]: !jf.sellQuality[q] } }) });
      rows.push({ text: `Destroy junk              ${jf.autoDestroy ? red('on') : dim('off')}`, act: () => setJunk({ autoDestroy: !jf.autoDestroy }) });
      for (let q = 0; q <= 4; q++) rows.push({ text: `  ${box(jf.destroyQuality[q])} destroy ${qualityPaint(q)(QUALITY_NAME[q])}`, act: () => setJunk({ destroyQuality: { ...jf.destroyQuality, [q]: !jf.destroyQuality[q] } }) });
      const prot = new Set(jf.protectCategories);
      rows.push({
        text: `Never sell or destroy     ${dim(`${prot.size} of ${JUNK_PROTECT_CATEGORIES.length} kinds`)}`,
        detail: () => [bold('Protected kinds'), '', ...JUNK_PROTECT_CATEGORIES.map((c) => `${box(prot.has(c.id))} ${c.label}`), '', dim('Enter: choose')],
        act: (a2) => a2.push(protectDialog(a2)),
      });
      const lists = [['keepEntries', 'Always keep'], ['sellEntries', 'Always sell'], ['destroyEntries', 'Always destroy']];
      for (const [key, label] of lists) {
        const n = jf[key].length;
        rows.push({ text: `${label.padEnd(26)}${n ? `${n} item${n === 1 ? '' : 's'}` : dim('none')}`, detail: () => [bold(label), '', ...(n ? jf[key].map((e) => a.itemLabel(e)) : [dim('Empty. m on a bag item adds to it.')]), '', dim('Enter: edit')], act: (a2) => a2.push(junkListDialog(a2, key, label)) });
      }
      rows.push({ text: green('Clear out junk now'), detail: () => [bold('Clear out junk now'), '', 'Sells (when a vendor is open or the rule allows) and destroys what the rules say, once.'], act: (a2) => { const r = g.runAutoJunk(); if (r.sold || r.destroyed) a2.say(green(`Junk: ${r.sold} sold${r.earned ? ` for ${coinText(r.earned)}` : ''}, ${r.destroyed} destroyed.`)); else a2.flashMsg('Nothing in your bags is junk by these rules.'); } });

      const gf = g.gatherFilterConfig();
      rows.push(H(''), H(`${bold('Gathering')}   ${dim('which nodes the autopilot mines, picks and skins, by skill colour')}`));
      for (const [c, paint] of [['orange', yellow], ['yellow', yellow], ['green', green], ['gray', dim]]) {
        rows.push({ text: `  ${box(gf.takeColor[c])} ${paint(c)}`, act: () => g.setGatherFilterConfig({ ...gf, takeColor: { ...gf.takeColor, [c]: !gf.takeColor[c] } }) });
      }
      return rows;
    },
  };
}

function protectDialog(app) {
  return {
    id: 'junk-protect', title: 'Never sell or destroy', hint: 'Enter: on / off',
    rows(a) {
      const { cfg, set } = junkLayer(a.g);
      const prot = new Set(cfg.protectCategories);
      return [H(dim('These kinds are never junk, whatever the quality boxes say.')), H(''), ...JUNK_PROTECT_CATEGORIES.map((c) => ({
        text: `${box(prot.has(c.id))} ${c.label}`, detail: () => [bold(c.label), '', c.hint ?? ''],
        act: () => { if (prot.has(c.id)) prot.delete(c.id); else prot.add(c.id); set({ protectCategories: [...prot] }); },
      }))];
    },
  };
}

function junkListDialog(app, key, label) {
  return {
    id: 'junk-list', title: label, hint: 'Enter: take it off the list',
    empty: 'Empty. m on a bag item adds to it.',
    rows(a) {
      const { cfg, set } = junkLayer(a.g);
      return cfg[key].map((e) => ({ text: a.itemLabel(e), act: () => set({ [key]: cfg[key].filter((x) => x !== e) }) }));
    },
  };
}

/** Bag item menu entries: put an item on one of the junk lists (or take it off). */
export function junkListOptions(app, entry) {
  const { cfg, set } = junkLayer(app.g);
  const name = app.itemLabel(entry);
  return [['keepEntries', 'Always keep'], ['sellEntries', 'Always sell'], ['destroyEntries', 'Always destroy']].map(([key, label]) => {
    const on = cfg[key].includes(entry);
    return {
      label: on ? dim(`${label}: take it off`) : label,
      value: () => {
        const strip = (list) => list.filter((x) => x !== entry);
        // An item sits on one list at most: keep beats sell beats destroy only by being the last one picked.
        set(on ? { [key]: strip(cfg[key]) } : { keepEntries: strip(cfg.keepEntries), sellEntries: strip(cfg.sellEntries), destroyEntries: strip(cfg.destroyEntries), [key]: [...strip(cfg[key]), entry] });
        app.say(dim(on ? `${name} is off the ${label.toLowerCase()} list.` : `${name}: ${label.toLowerCase()}.`));
      },
    };
  });
}
