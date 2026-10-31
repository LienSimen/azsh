// Talent strings from outside this game: a Wowhead classic talent-calc URL, a classicdb.ch hash, or
// the bare digit string. A hash ends a tree by its talent count, so these take the DataStore.

import type { DataStore } from '../../data/dataStore.ts';
import { CLASS } from '../../data/schema.ts';
import { className } from '../core/ids.ts';

/** Wowhead classic talent-calc path segment per 1.12 class. */
export const CLASS_SLUG: Record<number, string> = {
  [CLASS.WARRIOR]: 'warrior', [CLASS.PALADIN]: 'paladin', [CLASS.HUNTER]: 'hunter',
  [CLASS.ROGUE]: 'rogue', [CLASS.PRIEST]: 'priest', [CLASS.SHAMAN]: 'shaman',
  [CLASS.MAGE]: 'mage', [CLASS.WARLOCK]: 'warlock', [CLASS.DRUID]: 'druid',
};

// classicdb.ch runs the old Wowhead calculator; every constant below is read from
// templates/wowhead/js/TalentCalc.js?16.7 (fetched 2026-09-04) at the line named.
const AH = '0zMcmVokRsaqbdrfwihuGINALpTjnyxtgevElBCDFHJKOPQSUWXYZ123456789'; // TalentCalc.js:51
const SEP = 'Z'; // TalentCalc.js:52 (`L`); index 52, clear of the pair range 0-35
/** classId → calculator slot, `aw.L` at TalentCalc.js:1139-1149 (6→9 is the DK, not 1.12). */
const CALC_SLOT: Record<number, number> = {
  [CLASS.DRUID]: 0, [CLASS.HUNTER]: 1, [CLASS.MAGE]: 2, [CLASS.PALADIN]: 3, [CLASS.PRIEST]: 4,
  [CLASS.ROGUE]: 5, [CLASS.SHAMAN]: 6, [CLASS.WARLOCK]: 7, [CLASS.WARRIOR]: 8,
};
const CLASS_BY_SLOT = new Map<number, number>(
  Object.entries(CALC_SLOT).map(([cls, slot]) => [slot, Number(cls)]),
);

export type TalentImport = { link: string; cls?: number } | { error: string };

/** The Wowhead classic calculator link for a build (checked 2026-09-04; classic.wowhead.com 301s here). */
export function wowheadTalentUrl(cls: number, link: string): string {
  return `https://www.wowhead.com/classic/talent-calc/${CLASS_SLUG[cls] ?? 'warrior'}/${link}`;
}

/** The classicdb.ch calculator link for a build. Page href is `?talent#<build>` (TalentCalc.js:1339). */
export function classicdbTalentUrl(cls: number, link: string, ds: DataStore): string {
  return `https://classicdb.ch/?talent#${classicdbHashFromLink(cls, link, ds)}`;
}

function treeSizes(cls: number, ds: DataStore): number[] {
  return ds.talentTrees(cls).map((t) => t.talents.length);
}

/** Digit pairs → one char each, `x()` at TalentCalc.js:1076-1088. An odd tail pads with 0. */
function encodePairs(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 2) {
    // Pair index caps at 35 (5*6+5): 5 is the highest maxRank in 1.12, so it never leaves the alphabet.
    const a = Math.min(5, Number(digits[i]) || 0);
    const b = Math.min(5, Number(digits[i + 1]) || 0);
    out += AH.charAt(a * 6 + b);
  }
  return out;
}

// A digit link → the classicdb hash. `getWhBuild` at TalentCalc.js:150-180: rtrim each tree's zeros,
// pair-encode, separator only when the even-rounded length falls short, class char in front.
export function classicdbHashFromLink(cls: number, link: string, ds: DataStore): string {
  const sizes = treeSizes(cls, ds);
  const parts = link.split('-');
  let body = '';
  for (let t = 0; t < sizes.length; t++) {
    const digits = (parts[t] ?? '').slice(0, sizes[t]).replace(/0+$/, '');
    body += encodePairs(digits);
    const written = digits.length + (digits.length % 2);
    if (written < sizes[t]!) body += SEP;
  }
  const slot = CALC_SLOT[cls];
  const head = slot === undefined ? '' : AH.charAt(slot * 3); // TalentCalc.js:176
  return head + body.replace(/Z+$/, '');
}

// The inverse: `aA` at TalentCalc.js:1440-1483 for the body, TalentCalc.js:1776-1785 for the class
// char. Returns null when the head names no 1.12 class.
export function linkFromClassicdbHash(hash: string, ds: DataStore): { cls: number; link: string } | null {
  const raw = hash.trim().replace(/^#/, '').split(':')[0] ?? '';
  const head = raw ? AH.indexOf(raw.charAt(0)) : -1;
  if (head < 0 || head > 27) return null;
  const cls = CLASS_BY_SLOT.get(Math.floor(head / 3));
  if (cls === undefined) return null;
  const sizes = treeSizes(cls, ds);
  if (sizes.length === 0) return null;
  const trees = sizes.map(() => '');
  let tree = 0;
  let at = 0;
  for (let i = 1; i < raw.length && tree < sizes.length; i++) {
    const ch = raw.charAt(i);
    if (ch !== SEP) {
      const idx = AH.indexOf(ch);
      if (idx < 0) continue;
      const second = idx % 6;
      for (const rank of [(idx - second) / 6, second]) {
        trees[tree] += String(rank);
        if (++at >= sizes[tree]!) break;
      }
    }
    if (at >= sizes[tree]! || ch === SEP) { at = 0; tree++; }
  }
  const link = trees.map((s) => s.replace(/0+$/, '')).join('-').replace(/-+$/, '');
  return { cls, link };
}

const BARE_LINK = /^[0-9]+(?:-[0-9]*)*$/;
const WOWHEAD_URL = /(?:^|\/\/)(?:www\.|classic\.)?wowhead\.com\/(?:classic\/)?talent-calc\/([a-z-]+)\/?([^/?#\s]*)/i;

// A paste from either calculator, or our own string. A bare digit string carries no class and is
// taken as-is; a URL or hash naming another class is refused by name, not left to fit nothing.
export function parseTalentImport(text: string, cls: number, ds: DataStore): TalentImport {
  const raw = text.trim();
  if (!raw) return { error: 'Paste a talent string first.' };
  const url = WOWHEAD_URL.exec(raw);
  if (url) {
    const slug = (url[1] ?? '').toLowerCase();
    const owner = Number(Object.keys(CLASS_SLUG).find((k) => CLASS_SLUG[Number(k)] === slug) ?? 0);
    if (!owner) return { error: `That Wowhead link is not a 1.12 class ("${slug}").` };
    if (owner !== cls) return { error: `That is a ${className(owner)} build. You are a ${className(cls)}.` };
    const link = url[2] ?? '';
    if (!BARE_LINK.test(link)) return { error: 'That Wowhead link carries no talent string.' };
    return { link, cls: owner };
  }
  const bare = raw.replace(/^#/, '');
  if (BARE_LINK.test(bare)) return { link: bare.replace(/-+$/, '') };
  const hashText = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw;
  const decoded = linkFromClassicdbHash(hashText, ds);
  if (!decoded) return { error: 'That is not a talent string, a Wowhead link, or a classicdb hash.' };
  if (decoded.cls !== cls) {
    return { error: `That is a ${className(decoded.cls)} build. You are a ${className(cls)}.` };
  }
  return { link: decoded.link, cls: decoded.cls };
}
