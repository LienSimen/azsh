// The reputation window (the web client's reputationPanel.ts): every faction you know, grouped by its parent,
// with your standing inside the rank. Enter on one: watch it on the xp bar, declare war or peace, or park it at
// the bottom (inactive). The engine refuses what the client would (forced peace, hidden factions).
import { bold, dim, yellow, green, red, cyan, brightBlue, magenta, fit, bar } from './text.mjs';
import { getStanding, progressInRank, effectiveFactionFlags, isFactionVisible, isInactiveFlags, isFactionAtWar, canToggleAtWar, canToggleInactive } from '../domain/creature/reputation.ts';

const H = (text) => ({ text, header: true });
const RANK_PAINT = [red, red, yellow, yellow, green, green, cyan, brightBlue];

function factionRow(app, f) {
  const ch = app.ch;
  const standing = getStanding(ch.reputations, f, ch.race, ch.cls);
  const p = progressInRank(standing);
  const atWar = isFactionAtWar(f, ch.reputations, ch.factionFlags, ch.race, ch.cls);
  const watched = ch.watchedFaction === f.id;
  const paint = RANK_PAINT[p.rank] ?? dim;
  return {
    text: `${watched ? magenta('◆ ') : '  '}${fit(f.name, 30)} ${bar(p.current, p.span, 16, paint)} ${paint(fit(p.name, 10))} ${dim(`${p.current}/${p.span}`)}${atWar ? red('  at war') : ''}`,
    data: { faction: f },
    detail: () => [bold(f.name), paint(`${p.name}  ${p.current}/${p.span}`), dim(`standing ${standing}${p.remaining ? `, ${p.remaining} to the next rank` : ''}`), '', ...(f.description ? [f.description, ''] : []), atWar ? red('At war: their guards attack you on sight.') : '', watched ? magenta('Shown on your xp bar.') : '', '', dim('Enter: watch, war, park')],
    act: (a) => factionMenu(a, f),
  };
}

function factionMenu(app, f) {
  const g = app.g, ch = app.ch;
  const eff = effectiveFactionFlags(f, ch.factionFlags, ch.race, ch.cls);
  const atWar = isFactionAtWar(f, ch.reputations, ch.factionFlags, ch.race, ch.cls);
  const inactive = isInactiveFlags(eff);
  const watched = ch.watchedFaction === f.id;
  const opts = [{ label: watched ? 'Stop watching it' : 'Watch it on the xp bar', value: () => app.result(g.setWatchedFaction(watched ? 0 : f.id), watched ? 'Back to the xp bar.' : `Watching ${f.name}.`) }];
  if (canToggleAtWar(eff, !atWar)) opts.push({ label: atWar ? 'Make peace' : red('Declare war'), value: () => app.result(g.setFactionAtWar(f.id, !atWar), atWar ? `At peace with ${f.name}.` : `At war with ${f.name}.`) });
  if (canToggleInactive(eff, !inactive)) opts.push({ label: inactive ? 'Bring it back up' : 'Park it at the bottom', value: () => app.result(g.setFactionInactive(f.id, !inactive)) });
  app.pick(f.name, opts, (fn) => fn());
}

export function reputationDialog(app) {
  return {
    id: 'reputation', title: 'Reputation', hint: 'Enter: watch / war / park',
    rows(a) {
      const ch = a.ch;
      const known = a.ds.factions().filter((f) => isFactionVisible(f, ch.reputations, ch.factionFlags, ch.race, ch.cls));
      const parked = [], groups = new Map();
      for (const f of known) {
        if (isInactiveFlags(effectiveFactionFlags(f, ch.factionFlags, ch.race, ch.cls))) { parked.push(f); continue; }
        if (known.some((x) => x.team === f.id && x.id !== f.id)) continue; // a group header, not a faction you earn
        const key = f.team || 0;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
      }
      const atWar = a.g.atWarFactions().size;
      const rows = [H(`${bold('Reputation')}   ${dim(`${known.length} factions${atWar ? `, at war with ${atWar}` : ''}`)}`)];
      const groupName = (id) => a.ds.faction(id)?.name ?? 'Other';
      for (const [key, list] of [...groups].sort((x, y) => groupName(x[0]).localeCompare(groupName(y[0])))) {
        rows.push(H(''), H(cyan(key ? groupName(key) : 'Other')));
        for (const f of list.sort((x, y) => x.name.localeCompare(y.name))) rows.push(factionRow(a, f));
      }
      if (parked.length) {
        rows.push(H(''), H(dim('Inactive')));
        for (const f of parked) rows.push(factionRow(a, f));
      }
      return rows;
    },
  };
}
