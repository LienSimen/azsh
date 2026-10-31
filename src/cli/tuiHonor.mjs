// The Honor window (phonecraft panels/honorPanel.ts): your PvP rank and title, kills and honor for today,
// yesterday, this week and last week, honor points, lifetime, when the week's standings are posted, and a City
// Defender's free capital teleports, and the arena brackets. The weekly pass (rank points from the week's
// standing) runs on load.
import { bold, dim, yellow, green, red, cyan } from './text.mjs';
import { afterDeparture } from './tuiWorld.mjs';
import { isCityDefender, newHonorState, PVP_RANKS, rankForRp, rankTitle, visualRankDecimal } from '../domain/run/honor.ts';
import { daysToNextMaintenance, nextMaintenanceDate } from '../domain/run/honorWeek.ts';
import { factionOf } from '../domain/character/races.ts';
import { arenaRows } from './tuiArena.mjs';

const H = (text) => ({ text, header: true });
const kv = (label, value, paint = (x) => x) => H(`  ${label.padEnd(20)} ${paint(String(value))}`);

export function honorFaction(app) {
  return factionOf(app.ds, app.ch.race) === 'horde' ? 'horde' : 'alliance';
}

/** "Sergeant (Rank 3.4)" or "No rank". */
export function honorRankLine(app) {
  const h = app.ch.honor ?? newHonorState();
  const rank = rankForRp(h.rp);
  if (!rank) return 'No rank';
  const tenths = Math.round(visualRankDecimal(h.rp) * 10) / 10;
  return `${rankTitle(rank, honorFaction(app))} (Rank ${tenths > 0 && !Number.isInteger(tenths) ? tenths.toFixed(1) : rank.rank})`;
}

function postedLine(now = Date.now()) {
  const days = daysToNextMaintenance(now);
  const weekday = new Date(`${nextMaintenanceDate(now)}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  return days === 1 ? `${weekday} (tomorrow)` : `${weekday} (in ${days} days)`;
}

/** Run the week's standings pass(es) the save owes; say so when one ran. */
export function weeklyHonorPass(app) {
  const before = app.ch.honor?.rp ?? 0;
  const n = app.g.runWeeklyHonorPass();
  if (n > 0) app.say(cyan(`The honor standings are posted${n > 1 ? ` (${n} weeks)` : ''}. ${honorRankLine(app)}`) + dim(`  rank points ${before} → ${app.ch.honor?.rp ?? 0}`));
  return n;
}

export function honorDialog(app) {
  weeklyHonorPass(app);
  return {
    id: 'honor', title: 'Honor', hint: '', noDetail: true,
    rows(a) {
      const h = a.ch.honor ?? newHonorState();
      const fac = honorFaction(a);
      const highest = h.highestRank >= 1 && h.highestRank <= PVP_RANKS.length ? rankTitle(PVP_RANKS[h.highestRank - 1], fac) : 'none';
      const rows = [H(`${bold(honorRankLine(a))}   ${fac === 'horde' ? red('Horde') : cyan('Alliance')}`)];
      rows.push(...arenaRows(a));
      // City Defender (rank 15 standing): the capital teleports cost no rune and no mana.
      if (isCityDefender(h)) {
        const ports = a.g.classTravelOptions().filter((t) => t.free);
        if (ports.length) {
          rows.push(H(''), H(cyan('Capital teleports')), H(dim('  No reagent, no mana.')));
          for (const t of ports) {
            const zone = a.ds.zone(t.toZone)?.name ?? t.toZone;
            rows.push(t.toZone === a.ch.zoneId ? H(dim(`  ${zone} (you are here)`)) : { text: `  ${zone}`, act: (a2) => { if (a2.result(a2.g.castTeleport(t.spellId))) { afterDeparture(a2, () => `You teleport to ${a2.zone()?.name}.`); a2.switchTab(0); } } });
          }
        }
      }
      rows.push(
        H(''), H(cyan('Today')), kv('Honorable kills', h.todayHk, green), kv('Dishonorable kills', h.todayDk, red),
        H(''), H(cyan('Yesterday')), kv('Honorable kills', h.yesterdayHk, green), kv('Honor', h.yesterdayHonor, yellow),
        H(''), H(cyan('This week')), kv('Honorable kills', h.thisWeekHk, green), kv('Honor', Math.trunc(h.cp), yellow), kv('Standings posted', postedLine()),
        H(''), H(cyan('Last week')), kv('Honorable kills', h.lastWeekHk, green), kv('Honor', h.lastWeekHonor, yellow), kv('Standing', h.lastWeekStanding > 0 ? h.lastWeekStanding : '-'),
        H(''), H(cyan('Honor points')), kv('To spend', h.honorPoints, yellow), kv('Earned all time', h.lifetimeHonorPoints, yellow),
        H(''), H(cyan('Lifetime')), kv('Honorable kills', h.lifetimeKills, green), kv('Dishonorable kills', h.dishonorableKills, red), kv('Highest rank', highest),
      );
      return rows;
    },
  };
}
