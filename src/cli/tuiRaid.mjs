// Who walks into an instance and how the paladins bless them. The roster picker is the web client's
// instanceRosterPicker.ts (picks from every companion you own, Fill matches the instance template), the
// lineup is the 10/20/40 raid group, and the board is the PallyPower grid (engine/game/paladinBoard.ts).
import { bold, dim, cyan, green, yellow, fit, plural, wrapLines } from './text.mjs';
import { className } from '../domain/core/ids.ts';
import { companionLevel, maxCompanionsFor, MAX_COMPANIONS } from '../domain/bots/squad.ts';
import { resolveOwnedLineup } from '../domain/raid/instanceRoster.ts';

const H = (text) => ({ text, header: true });
const ROLE_NAME = { tank: 'tank', healer: 'healer', dps: 'damage' };

const owned = (g) => [...(g.state.squad ?? []), ...Object.values(g.state.botRoster ?? {})];

/** The raid size a lineup is kept for: the instance's own, rounded up to 10, 20 or 40. */
export function lineupSize(maxPlayers) { return maxPlayers > 20 ? 40 : maxPlayers > 10 ? 20 : 10; }

/** The ids that would walk in now, the same resolution the door makes. */
export function walkingIn(g, def, asRaid) {
  const cap = maxCompanionsFor(def.maxPlayers);
  const list = owned(g);
  const resolved = resolveOwnedLineup({
    dungeonId: def.id, cap, asRaid: asRaid && cap > MAX_COMPANIONS, ownedIds: new Set(list.map((c) => c.id)),
    dungeonPicks: g.state.instanceRoster, raidLineup: g.state.raidLineup,
  });
  return { cap, ids: resolved ?? (g.state.squad ?? []).map((c) => c.id).slice(0, cap), picked: !!resolved };
}

/** Pick who walks into this instance: Enter toggles, f fills to the template, c goes back to auto. */
export function rosterDialog(app, def, getAsRaid) {
  return {
    id: `roster-${def.id}`, title: 'Who walks in', hint: 'Enter: in / out',
    keys: {
      f: { hint: 'fill', fn: (a) => { const r = a.g.fillInstanceRoster(def.id); a.result(r, r.ok ? `${plural(r.picked, 'companion')} picked for ${def.name}${r.mage ? ', a mage among them' : ''}.` : ''); } },
      c: { hint: 'auto', fn: (a) => a.result(a.g.clearInstanceRoster(), 'Back to auto: the party you have walks in.') },
    },
    rows(a) {
      const g = a.g, { cap, ids, picked } = walkingIn(g, def, getAsRaid());
      const set = new Set(ids);
      const rows = [H(`${bold(def.name)}   ${picked ? `${ids.length} of ${cap} picked` : dim(`auto: your party, ${ids.length} of ${cap}`)}`), H('')];
      const list = owned(g).sort((x, y) => Number(set.has(y.id)) - Number(set.has(x.id)) || x.name.localeCompare(y.name));
      if (!list.length) rows.push(H(dim('  You own no companions. Innkeepers hire them out.')));
      for (const c of list) {
        rows.push({
          text: `${set.has(c.id) ? green('✓') : dim('·')} ${fit(c.name, 14)} ${fit(dim(`L${companionLevel(c, a.ch.level)} ${className(c.cls)}`), 14)} ${ROLE_NAME[c.role] ?? c.role}`,
          detail: () => [bold(c.name), `${className(c.cls)}, ${ROLE_NAME[c.role] ?? c.role}`, '', set.has(c.id) ? 'Walks in.' : 'Stays outside.', '', dim('Enter: in or out   f: fill   c: auto')],
          act: () => {
            const next = set.has(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id];
            if (next.length > cap) { a.flashMsg(`${def.name} takes ${cap} companions.`); return; }
            a.result(g.setInstanceRoster(def.id, next));
          },
        });
      }
      return rows;
    },
  };
}

/** The raid group kept for the next 10, 20 or 40-man: Enter toggles, f fills by role, c clears. */
export function lineupDialog(app, size) {
  return {
    id: `lineup-${size}`, title: `${size}-man group`, hint: 'Enter: in / out',
    keys: {
      f: { hint: 'fill', fn: (a) => { const r = a.g.fillRaidLineup(size); a.result(r, r.ok ? `${r.picked} of ${r.cap} seats filled.` : ''); } },
      c: { hint: 'clear', fn: (a) => a.result(a.g.clearRaidLineup(), 'Raid group cleared.') },
    },
    rows(a) {
      const g = a.g, cap = size - 1;
      const cur = g.state.raidLineup?.size === size ? g.state.raidLineup.ids : [];
      const set = new Set(cur);
      const counts = { tank: 0, healer: 0, dps: 0 };
      for (const c of owned(g)) if (set.has(c.id)) counts[c.role] = (counts[c.role] ?? 0) + 1;
      const rows = [H(`${bold(`${size}-man group`)}   ${cur.length} of ${cap}   ${dim(`${counts.tank} tank, ${counts.healer} healer, ${counts.dps} damage`)}`), H('')];
      for (const c of owned(g).sort((x, y) => Number(set.has(y.id)) - Number(set.has(x.id)) || x.role.localeCompare(y.role))) {
        rows.push({
          text: `${set.has(c.id) ? green('✓') : dim('·')} ${fit(c.name, 14)} ${fit(dim(`L${companionLevel(c, a.ch.level)} ${className(c.cls)}`), 14)} ${ROLE_NAME[c.role] ?? c.role}`,
          act: () => {
            const next = set.has(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id];
            if (next.length > cap) { a.flashMsg(`A ${size}-man takes ${cap} companions.`); return; }
            a.result(g.setRaidLineup(size, next));
          },
        });
      }
      return rows;
    },
  };
}

/** PallyPower: one row per paladin, the aura and one Blessing per class column. Enter steps forward, - back. */
export function paladinDialog(app) {
  const after = (a, r) => { if (a.result(r)) { const n = a.g.refreshPaladinBuffs(); if (n) a.say(dim(`The paladins recast ${plural(n, 'buff')}.`)); } };
  return {
    id: 'pallypower', title: 'Paladin blessings', hint: 'Enter: next   -: previous',
    keys: {
      a: { hint: 'auto sort', fn: (a) => after(a, a.g.autoSortPaladinAssignments()) },
      c: { hint: 'clear', fn: (a) => after(a, a.g.clearPaladinAssignments()) },
    },
    onKey(a, k, row) {
      if (k !== '-' || !row?.data) return false;
      const d = row.data;
      after(a, d.col ? a.g.stepPaladinBlessing(d.key, d.col, -1) : a.g.stepPaladinAura(d.key, -1));
      return true;
    },
    rows(a) {
      const b = a.g.paladinBoard();
      if (!b.rows.length) return [H(dim('No paladin in the party. Seat one to hand out Blessings.'))];
      const rows = [...wrapLines('Each paladin keeps one aura up and one Blessing on each class. Auto follows the CMaNGOS order.', a.layout().listW - 2).map((t) => H(dim(t))), H('')];
      for (const p of b.rows) {
        rows.push(H(`${bold(p.name)} ${dim(`L${p.level}`)}${p.symbols ? dim(`  Symbols of Kings ${p.symbols}, spends ${p.symbolsSpent}`) : ''}`));
        const auraName = p.auras.find((x) => x.aura === p.aura)?.name ?? (p.aura ?? 'none');
        rows.push({ text: `  ${fit('Aura', 12)} ${cyan(auraName)}${p.assignedAura ? '' : dim('  auto')}`, data: { key: p.key }, act: () => after(a, a.g.stepPaladinAura(p.key, 1)) });
        for (const col of b.columns) {
          const cell = b.cells[`${p.key}|${col.col}`];
          const name = cell?.name ?? (cell?.effective ?? dim('nobody'));
          rows.push({
            text: `  ${fit(col.label, 12)} ${cell?.effective ? (cell.greater ? yellow(name) : name) : dim('—')}${cell?.assigned ? '' : dim('  auto')}${dim(`  ${col.bodies} ${col.bodies === 1 ? 'body' : 'bodies'}`)}`,
            data: { key: p.key, col: col.col },
            act: () => after(a, a.g.stepPaladinBlessing(p.key, col.col, 1)),
          });
        }
      }
      return rows;
    },
  };
}

/** Is there a paladin anywhere in the party (you or a seated companion)? */
export function partyHasPaladin(g) { return g.state.char.cls === 2 || (g.state.squad ?? []).some((c) => c.cls === 2); }
