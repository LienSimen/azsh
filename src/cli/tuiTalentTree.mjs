// The Talents tab as the client's trees: each tree a 4x7 grid of talent icons with prerequisite arrows, the
// rank in the corner, framed gold when maxed, green when you can put a point in and grey (the icon greyed
// too) when you cannot yet. As many trees as fit stand side by side; Up and Down walk the talents in reading
// order, Shift+arrows move on the trees (crossing into the next one at the edge). The rows are the talents view's own (a talent row carries `node`); this file
// only places them, so Enter, u and the tooltip work as in the list. No colour or no room: the list.
import { canvas, drawCell, gridStep } from './iconGrid.mjs';
import { iconsOn } from './iconArt.mjs';
import { availablePoints, spentInTree, TALENT_TIER_POINTS } from '../domain/character/talents.ts';
import { bold, dim, cyan, fit, plural } from './text.mjs';

const TIERS = 7, COLS = 4, GAP = 2;

/** maxed, up or locked, the client's three node states. Phonecraft talentTreeGrid.ts talentNodeTone. */
export function talentTone(ch, t, ds) {
  const cur = ch.talents?.[t.id] ?? 0;
  if (cur >= t.maxRank) return 'maxed';
  if (cur <= 0 && availablePoints(ch) <= 0) return 'locked';
  if (spentInTree(ch, t.tabId, ds) < t.tier * TALENT_TIER_POINTS) return 'locked';
  if (t.prereq && (ch.talents?.[t.prereq.talentId] ?? 0) < t.prereq.rank) return 'locked';
  return 'up';
}

/** The talent's icon: its own, else its first rank spell's. */
export const talentIcon = (ds, t) => t.icon ?? ds.spell(t.ranks?.[0]?.spellId)?.icon;

const treeW = (s) => COLS * (s + 2);
const treeH = (s) => TIERS * (s / 2) + TIERS - 1;

/** Icon size and trees side by side for a `w` x `h` list pane: three trees first, big icons next. */
function treeSize(w, h) {
  for (const [s, n] of [[6, 3], [4, 3], [6, 2], [4, 2], [6, 1], [4, 1]]) {
    if (h >= 2 + treeH(s) && w >= n * treeW(s) + (n - 1) * GAP + 1) return { s, n };
  }
  return null;
}

/** Will the Talents tab draw as trees right now? */
export function talentPlan(app) {
  if (!iconsOn()) return null;
  const L = app.layout();
  return L.detailW ? treeSize(L.listW, L.mainH) : null;
}

const FRAME = { maxed: '33', up: '32', locked: '90' };
const BADGE = { maxed: '93', up: '92', locked: '37' };

/** The trees' lines for the talents view's `rows` in a `W` x `H` pane, and where the arrows go. */
export function talentGrid(app, rows, W, H) {
  const plan = iconsOn() ? treeSize(W, H) : null;
  if (!plan) return null;
  const { s, n } = plan, ch = s / 2, cw = s + 2;
  const view = app.top();
  const cur = view?.cursor ?? 0;
  const trees = app.ds.talentTrees(app.ch.cls);
  const nodes = rows.map((r, i) => ({ ...r.node, i })).filter((x) => x.t);
  const curTree = nodes.find((x) => x.i === cur)?.tree ?? 0;
  // The trees on screen follow the cursor when they do not all fit.
  let start = Math.max(0, Math.min(view?.treeStart ?? 0, trees.length - n));
  if (curTree < start) start = curTree;
  if (curTree >= start + n) start = curTree - n + 1;
  if (view) view.treeStart = start;

  const cv = canvas(W, H);
  const free = availablePoints(app.ch);
  cv.text(1, 0, app.ch.level < 10 ? dim('Talents unlock at level 10.') : `${bold(plural(free, 'point'))} to spend   ${dim('Enter: learn   u: refund   Shift+arrows: move on the trees   B: builds')}`);
  const top = 2;
  // Room left over spreads the trees apart (up to a few columns), so three narrow trees do not huddle left.
  const gap = n > 1 ? Math.min(6, Math.floor((W - 1 - n * treeW(s)) / (n - 1))) : 0;
  const ox = (k) => (k - start) * (treeW(s) + gap);
  const at = new Map(nodes.map((x) => [x.t.id, x]));
  const cellX = (x) => ox(x.tree) + x.t.col * cw;
  const cellY = (x) => top + x.t.tier * (ch + 1);
  const paint = (codes, c) => `\x1b[${codes}m${c}\x1b[0m`;

  for (let k = start; k < Math.min(trees.length, start + n); k++) {
    const tr = trees[k];
    const title = `${tr.name} ${spentInTree(app.ch, tr.tabId, app.ds)}`;
    const pad = Math.max(0, Math.floor((treeW(s) - title.length) / 2));
    const arrows = n < trees.length ? `${k === start && start > 0 ? '◀' : ' '}${' '.repeat(Math.max(0, pad - 1))}` : ' '.repeat(pad);
    cv.text(ox(k), 1, fit(`${arrows}${k === curTree ? cyan(bold(title)) : dim(title)}`, treeW(s) - 1));
    if (k === start + n - 1 && start + n < trees.length) cv.text(ox(k) + treeW(s) - 1, 1, '▶');
  }

  const visible = (x) => x.tree >= start && x.tree < start + n;
  const draw = (x) => drawCell(cv, cellX(x), cellY(x), s, {
    icon: x.icon, tone: x.tone === 'locked' && !x.rank ? 'gray' : '', frame: FRAME[x.tone], selected: x.i === cur,
    badge: x.tone === 'locked' && !x.rank ? null : { text: String(x.rank), codes: BADGE[x.tone] },
  });
  for (const x of nodes) if (visible(x)) draw(x);

  // Prerequisite arrows: along a tier, down a column, or down then across into the node (a diagonal).
  const taken = new Set(nodes.filter(visible).map((x) => `${x.tree}:${x.t.tier}:${x.t.col}`));
  for (const x of nodes) {
    const pre = x.t.prereq && at.get(x.t.prereq.talentId);
    if (!pre || !visible(x)) continue;
    const codes = (app.ch.talents?.[pre.t.id] ?? 0) >= x.t.prereq.rank ? '93' : '90';
    const py = cellY(pre), ty = cellY(x), mid = Math.floor((ch - 1) / 2);
    if (pre.t.tier === x.t.tier) {
      const right = x.t.col > pre.t.col;
      const from = right ? cellX(pre) + s + 1 : cellX(x) + s + 1, to = right ? cellX(x) : cellX(pre);
      for (let c = from; c <= to; c++) cv.put(c, py + mid, paint(codes, c === (right ? to : from) ? (right ? '►' : '◄') : '─'));
      continue;
    }
    const pcx = cellX(pre) + s / 2, tcx = cellX(x) + s / 2;
    const bend = pre.t.col !== x.t.col;
    for (let y = py + ch; y < ty - (bend ? 1 : 0); y++) {
      const tier = Math.floor((y - top) / (ch + 1));
      const onNode = (y - top) % (ch + 1) < ch && taken.has(`${x.tree}:${tier}:${pre.t.col}`);
      if (!onNode) cv.put(pcx, y, paint(codes, y === ty - 1 ? '▼' : '│'));
    }
    if (bend) {
      const y = ty - 1, right = tcx > pcx;
      cv.put(pcx, y, paint(codes, right ? '└' : '┘'));
      for (let c = Math.min(pcx, tcx) + 1; c < Math.max(pcx, tcx); c++) cv.put(c, y, paint(codes, '─'));
      cv.put(tcx, y, paint(codes, '▼'));
    }
  }
  // The cursor's frame goes on last so no arrow cuts it.
  const sel = nodes.find((x) => x.i === cur);
  if (sel && visible(sel)) draw(sel);

  const pts = nodes.map((x) => ({ i: x.i, x: x.tree * (COLS + 1) + x.t.col, y: x.t.tier, g: x.tree }));
  return { lines: cv.lines(), nav: (dir, from) => gridStep(pts, from, dir, { dyW: 10, dxW: 1, slack: TIERS }) };
}
