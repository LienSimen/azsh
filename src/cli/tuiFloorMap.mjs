// The floor seen from above: the nav mesh around the party drawn in half blocks, north up, with what stands on it
// marked. One storey at a time (the party's), so a deck above or a cellar below does not paint over the room you are
// in. A cell is twice as tall as it is wide, so the half blocks give square pixels.
import { navMeshForMap, isWalkableNavMesh } from '../domain/nav/navmesh.ts';
import { floorEntities } from '../world/continuousDungeon.ts';
import { useColor, bold, dim, yellow, green, red, cyan, magenta, fit } from './text.mjs';

const YD = 2.5;          // yards per pixel at zoom 1
const STOREY_YD = 8;     // what counts as the party's floor, up or down
// The floor is dark ground the marks stand on: a background where a whole cell is floor, a half block where half is.
const FLOOR = '236';
const ground = (top, bot) => (!useColor ? (top && bot ? '█' : top ? '▀' : bot ? '▄' : ' ')
  : top && bot ? `\x1b[48;5;${FLOOR}m \x1b[0m` : top ? `\x1b[38;5;${FLOOR}m▀\x1b[0m` : bot ? `\x1b[38;5;${FLOOR}m▄\x1b[0m` : ' ');
const onGround = (m) => (useColor ? `\x1b[48;5;${FLOOR}m${m}\x1b[0m` : m);

export const OBJECT_MARK = { chest: yellow('▣'), ore: yellow('◆'), herb: green('♣'), book: cyan('≡'), gate: cyan('◇') };
const npcMark = (o) => (o.quests?.turnIn.length ? green('?') : yellow('!'));
const ARROWS = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];

/** Walkable pixels around the party, rebuilt only when the party moves a pixel or changes storey. */
function raster(f, m, cols, rows, s) {
  const P = f.world.party;
  const key = `${Math.round(P.x / s)},${Math.round(P.y / s)},${Math.round((P.z ?? 0) / 4)},${cols},${rows},${s}`;
  if (f.mapRaster?.key === key) return f.mapRaster.px;
  const px = new Uint8Array(cols * rows * 2);
  for (let r = 0; r < rows * 2; r++) {
    for (let c = 0; c < cols; c++) {
      // North is +x, west is +y: up the screen is +x, right is -y.
      const x = P.x + (rows - r - 0.5) * s, y = P.y - (c - cols / 2 + 0.5) * s;
      px[r * cols + c] = isWalkableNavMesh(m, x, y, P.z, STOREY_YD) ? 1 : 0;
    }
  }
  f.mapRaster = { key, px };
  return px;
}

/** Map lines `cols` wide and `rows` tall around the party. `focus` ({x, y}) is marked, or pointed at from the edge. */
export function floorMapLines(app, f, cols, rows, { focus = null, objects = [], zoom = 1 } = {}) {
  const m = navMeshForMap(f.def.mapId);
  if (!m || cols < 8 || rows < 4) return [];
  const s = YD * zoom, P = f.world.party;
  const px = raster(f, m, cols, rows, s);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      const top = px[2 * r * cols + c], bot = px[(2 * r + 1) * cols + c];
      line.push(ground(top, bot));
    }
    grid.push(line);
  }
  const cell = (x, y) => ({ c: Math.floor(cols / 2 - (y - P.y) / s), r: Math.floor((rows - (x - P.x) / s) / 2) });
  const inside = ({ c, r }) => c >= 0 && c < cols && r >= 0 && r < rows;
  const mark = (at, m) => { grid[at.r][at.c] = px[2 * at.r * cols + at.c] || px[(2 * at.r + 1) * cols + at.c] ? onGround(m) : m; };
  const put = (x, y, m) => { const at = cell(x, y); if (inside(at)) mark(at, m); };
  const onStorey = (z) => z == null || P.z == null || Math.abs(z - P.z) <= STOREY_YD;
  // The way the party is walking.
  const path = [{ x: P.x, y: P.y }, ...(f.world.movePath ?? [])];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / s);
    for (let k = 1; k <= n; k++) put(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, yellow('·'));
  }
  for (const o of objects) if (onStorey(o.z)) put(o.x, o.y, o.kind === 'npc' ? npcMark(o) : OBJECT_MARK[o.kind] ?? dim('?'));
  const bosses = f.bossEntries ??= new Set(f.def.encounters.filter((e) => e.kind === 'boss' && e.creatureEntry > 0).map((e) => e.creatureEntry));
  for (const e of floorEntities(f.world)) {
    if (e.party || e.state === 'dead' || !onStorey(e.z)) continue;
    put(e.x, e.y, !e.hostile ? green('•') : bosses.has(e.entry) ? red(bold('B')) : e.movementType === 2 ? yellow('•') : red('•'));
  }
  if (focus) {
    const at = cell(focus.x, focus.y);
    if (inside(at)) mark(at, magenta(bold('◎')));
    else {
      // Off the map: an arrow on the edge, the way it lies.
      const dc = at.c - cols / 2, dr = (rows / 2 - at.r) * 2, k = Math.max(Math.abs(dc) / (cols / 2 - 1), Math.abs(dr) / (rows - 2));
      const ec = Math.round(cols / 2 + dc / k), er = Math.round(rows / 2 - dr / 2 / k);
      const arrow = ARROWS[Math.round(((Math.atan2(dr, dc) / Math.PI) * 4 + 8)) % 8];
      mark({ r: Math.max(0, Math.min(rows - 1, er)), c: Math.max(0, Math.min(cols - 1, ec)) }, magenta(bold(arrow)));
    }
  }
  mark({ r: Math.floor(rows / 2), c: Math.floor(cols / 2) }, bold('@'));
  return grid.map((l) => l.join(''));
}

/** One line saying what the marks are. */
export function mapLegend(width) {
  return fit(dim(`@ you  ${red('•')} foe  ${yellow('•')} patrol  ${red('B')} boss  ${magenta('◎')} there  ${OBJECT_MARK.chest} chest  ${OBJECT_MARK.ore} ore  ${OBJECT_MARK.herb} herb  ${OBJECT_MARK.book} book  ${OBJECT_MARK.gate} gate  ${yellow('!')} quest   north up`), width);
}

/** The map above a row's detail, sized to the pane. */
export function withMap(app, f, view, focus, lines) {
  const L = app.layout(), cols = L.detailW - 2;
  if (cols < 20) return lines;
  const rows = Math.max(6, Math.min(Math.floor(cols / 2), L.mainH - 4 - Math.min(lines.length, 8)));
  return [...floorMapLines(app, f, cols, rows, { focus, objects: view.objects ?? [] }), mapLegend(cols), '', ...lines];
}

/** The map on the whole screen (m on the floor); the floor keeps walking under it. */
export function floorMapView(app, f, objectsOf) {
  const view = {
    id: 'floor-map', title: 'Map', hint: 'the floor walks on while you look',noDetail: true, floor: f, zoom: 1,
    keys: {
      '+': { hint: 'closer', fn: () => { view.zoom = Math.max(0.5, view.zoom / 2); } },
      '-': { hint: 'farther', fn: () => { view.zoom = Math.min(4, view.zoom * 2); } },
      space: { hint: 'stop', fn: () => { f.walking = false; f.follow = false; f.goal = null; f.world.movePath = []; } },
    },
    rows(a) {
      const L = a.layout();
      const target = f.goal ?? (f.target ? f.def.encounters.find((e) => e.id === f.target)?.origin : null);
      const lines = floorMapLines(a, f, L.W - 2, L.mainH - 2, { focus: target, objects: objectsOf(a), zoom: view.zoom });
      return [...lines.map((l) => ({ text: ` ${l}`, header: true, plain: true })), { text: ` ${mapLegend(L.W - 2)}`, header: true, plain: true }];
    },
  };
  return view;
}
