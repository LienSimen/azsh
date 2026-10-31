// Autopilot settings (phonecraft rotation/rotationEditorAuto.ts and autopilot/runDials.ts): every AutopilotConfig
// field a player sets, as one form. Enter flips a switch, steps through a choice, or asks for a number. The raid
// plan fields are left to the raid screens that own them.
import { bold, dim, green, cyan } from './text.mjs';
import { MAX_SOUL_SHARD_CAP } from '../autopilot/config.ts';

const H = (text) => ({ text, header: true });
const pct = (v) => `${Math.round(v * 100)}%`;

// [key, label, kind, extra, shown?]: kind 'bool' | 'choice' (extra = [[value, label], ...]) | 'num' (extra = { min, max,
// show? (value -> text), read? (typed text -> value), edit? (value -> what the prompt starts with) }).
const SECTIONS = [
  ['Rest between fights', [
    ['autoEat', 'Eat when hurt', 'bool'],
    ['autoDrink', 'Drink when low on mana', 'bool'],
    ['healthEnterPct', 'Rest below health', 'num', { min: 0.05, max: 1, show: pct, read: (t) => Number(t.replace('%', '')) / 100, edit: (v) => String(Math.round(v * 100)), ask: '% health' }],
    ['manaEnterPct', 'Rest below mana', 'num', { min: 0.05, max: 1, show: pct, read: (t) => Number(t.replace('%', '')) / 100, edit: (v) => String(Math.round(v * 100)), ask: '% mana' }],
    ['recoverToPct', 'Rest until', 'num', { min: 0.1, max: 1, show: pct, read: (t) => Number(t.replace('%', '')) / 100, edit: (v) => String(Math.round(v * 100)), ask: '% full' }],
    ['restMode', 'How to rest', 'choice', [['eat-then-wait', 'eat, then wait it out'], ['eat-only', 'eat and drink only']]],
  ]],
  ['The run', [
    ['sessionMs', 'Stop after', 'num', { min: 60_000, max: 24 * 3_600_000, show: (v) => `${Math.round(v / 60_000)} min`, read: (t) => Number(t) * 60_000, edit: (v) => String(Math.round(v / 60_000)), ask: 'minutes' }],
    ['maxConsecutiveDefeats', 'Stop after deaths in a row', 'num', { min: 1, max: 20 }],
    ['stopAtLevel', 'Stop at level', 'num', { min: 0, max: 60, show: (v) => (v ? String(v) : 'never') }],
    ['autoGather', 'Mine, pick and skin on the way', 'bool'],
  ]],
  ['Fighting', [
    ['combatRole', 'Role in a group', 'choice', [['dps', 'damage'], ['tank', 'tank'], ['offtank', 'off-tank']]],
    ['aoeMode', 'Area spells', 'choice', [['auto', 'when it pays'], ['aoe', 'against two or more'], ['single', 'never']]],
    ['offHeal', 'Off-heal when the healer cannot', 'bool'],
    ['threatWatch', 'Stop damage while a mob is on you', 'bool'],
    ['ccPreferCasters', 'Crowd control casters first', 'bool'],
    ['movement', 'Moving in a fight', 'choice', [['auto', 'as the fight needs'], ['hold', 'hold your ground'], ['melee', 'stay in melee']]],
    ['pullOpenYards', 'Open the fight from', 'num', { min: -1, max: 40, show: (v) => (v === 0 ? 'auto' : v === -1 ? 'max spell range' : `${v} yd`), ask: 'yards (0 auto)' }],
    ['totemTwisting', 'Twist the air totem (shaman)', 'bool', null, (app) => app.ch.cls === 7],
    ['keepSoulShards', 'Soul shards to keep (warlock)', 'num', { min: 0, max: MAX_SOUL_SHARD_CAP }, (app) => app.ch.cls === 9],
  ]],
  ['How much to pull', [
    ['pullNormalCount', 'Normal mobs per pull on a run', 'num', { min: 1, max: 10 }],
    ['pullEliteCount', 'Elites per pull on a run', 'num', { min: 1, max: 5 }],
    ['pullAttackNormalCount', 'Normal mobs when you press Enter', 'num', { min: 1, max: 10 }],
    ['pullAttackEliteCount', 'Elites when you press Enter', 'num', { min: 1, max: 5 }],
  ]],
  ['Questing', [
    ['questAutoAccept', 'Accept quests on its own', 'bool'],
    ['questRewardChoice', 'Quest reward', 'choice', [['auto', 'pick the best one'], ['wait', 'ask me']]],
    ['questZoneSwap', 'Move to another zone', 'choice', [['level-safe', 'when the level fits'], ['any', 'wherever the quests go'], ['off', 'never']]],
    ['questEliteMode', 'Elite quests', 'choice', [['squad', 'with the companions'], ['solo', 'alone'], ['skip', 'skip them']]],
    ['questSquadAlways', 'Companions in every fight', 'bool'],
    ['questSquadShare', 'Share quests with companions', 'bool'],
    ['questLevelBelow', 'Take quests down to levels below', 'num', { min: 0, max: 60, show: (v) => (v ? String(v) : 'no limit') }],
    ['questLevelAbove', 'Take quests up to levels above', 'num', { min: 0, max: 10 }],
    ['questSkipAbandon', 'Abandon quests it cannot finish', 'bool'],
  ]],
];

function set(app, key, value) {
  app.g.setAutopilotConfig({ ...app.g.autopilotConfig(), [key]: value });
}

export function autopilotSettingsDialog(app) {
  return {
    id: 'autopilot-settings', title: 'Autopilot settings', hint: 'Enter: change',
    rows(a) {
      const cfg = a.g.autopilotConfig();
      const rows = [H(`${bold('Autopilot')}   ${dim('how the run rests, fights, pulls and quests')}`)];
      for (const [title, fields] of SECTIONS) {
        rows.push(H(''), H(cyan(title)));
        for (const [key, label, kind, extra, shown] of fields) {
          if (shown && !shown(a)) continue;
          const v = cfg[key];
          let text, act;
          if (kind === 'bool') { text = v ? green('on') : dim('off'); act = (a2) => set(a2, key, !v); }
          else if (kind === 'choice') {
            const i = Math.max(0, extra.findIndex(([x]) => x === v));
            text = extra[i][1];
            act = (a2) => set(a2, key, extra[(i + 1) % extra.length][0]);
          } else {
            text = extra.show ? extra.show(v) : String(v);
            act = (a2) => a2.prompt(`${label} (${extra.ask ?? `${extra.min}-${extra.max}`}): `, (t) => {
              const n = extra.read ? extra.read(t.trim()) : Number(t.trim());
              if (!Number.isFinite(n) || n < extra.min || n > extra.max) { a2.flashMsg(`Out of range: ${t}`); return; }
              set(a2, key, key.endsWith('Pct') ? n : Math.round(n));
              a2.afterAction();
            }, extra.edit ? extra.edit(v) : String(v));
          }
          rows.push({ text: `${label.padEnd(36)} ${text}`, data: { key }, act });
        }
      }
      return rows;
    },
  };
}
