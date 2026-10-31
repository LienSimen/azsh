// EventAI TEXT / TEXT_NEW broadcast_text and script_texts lookup, payload docs/aifid/eventai-texts.json.
// Cite: CreatureEventAI.h ACTION_T_TEXT; Creature.h CHAT_TYPE_* ~411–419; DoDisplayText.

import eventAiTextsJson from '../../../docs/aifid/eventai-texts.json' with { type: 'json' };
import scriptTextsJson from '../../data/tables/scriptTexts.json' with { type: 'json' };
import { TEXT_SOURCE_RANGE } from '../scriptdev/types.ts';

/** Creature.h ChatType for script_texts / broadcast_text.ChatTypeID. */
export const CHAT_TYPE = {
  SAY: 0,
  YELL: 1,
  TEXT_EMOTE: 2,
  BOSS_EMOTE: 3,
  WHISPER: 4,
  BOSS_WHISPER: 5,
  ZONE_YELL: 6,
  ZONE_EMOTE: 7,
  PARTY: 8,
} as const;

export interface EventAiTextRow {
  entry: number;
  content_default: string;
  content_other?: string;
  /** ChatTypeID — CHAT_TYPE_*. */
  type: number;
  sound?: number;
  emote?: number;
  language?: number;
}

export interface EventAiTextsPayload {
  texts: EventAiTextRow[];
  /** Text ids referenced by bake TEXT/TEXT_NEW rows but missing from DB payload. */
  unresolved: number[];
}

let cached: {
  byEntry: Map<number, EventAiTextRow>;
  unresolved: ReadonlySet<number>;
} | null = null;

function loadPayload(): { byEntry: Map<number, EventAiTextRow>; unresolved: ReadonlySet<number> } {
  if (cached) return cached;
  const raw = eventAiTextsJson as EventAiTextsPayload;
  const byEntry = new Map<number, EventAiTextRow>();
  // script_texts first — the census payload carries broadcast_text only, which is why every
  // ScriptDev yell used to render as a bare id. The two keyspaces do not overlap.
  const scripted = scriptTextsJson as Record<string, { text: string; type: number; emote?: number }>;
  for (const [key, row] of Object.entries(scripted)) {
    const entry = Number(key) | 0;
    if (!entry || !row?.text) continue;
    byEntry.set(entry, {
      entry,
      content_default: row.text,
      type: row.type | 0,
      emote: row.emote,
    });
  }
  for (const row of raw.texts ?? []) {
    byEntry.set(row.entry | 0, row);
  }
  cached = {
    byEntry,
    unresolved: new Set((raw.unresolved ?? []).map((n) => n | 0)),
  };
  return cached;
}

/** Lookup broadcast_text / script_texts row by entry id. */
export function lookupEventAiText(textId: number): EventAiTextRow | null {
  if (!textId) return null;
  const { byEntry } = loadPayload();
  return byEntry.get(textId | 0) ?? null;
}

/** True when the id was listed unresolved in the committed payload. */
export function isUnresolvedEventAiTextId(textId: number): boolean {
  if (!textId) return false;
  return loadPayload().unresolved.has(textId | 0);
}

/** True when the text ID is in the script_texts offset range. Cite: system.h:35-38. */
export function isScriptTextId(textId: number): boolean {
  const id = textId | 0;
  return id <= TEXT_SOURCE_RANGE.SCRIPT_TEXTS_START && id >= TEXT_SOURCE_RANGE.SCRIPT_TEXTS_END;
}

// Format a combat/zone feed line from ChatType + speaker name + body. Cite: Creature.h CHAT_TYPE_*; client
// chat prefixes (Say/Yell/Emote).
export function formatEventAiChatLine(
  speakerName: string,
  row: EventAiTextRow,
): { chatType: number; text: string; body: string } {
  const body = (row.content_default || row.content_other || '').trim();
  const chatType = row.type | 0;
  // TEXT_EMOTE / ZONE_EMOTE often use %s for the speaker.
  const expanded = body.includes('%s') ? body.split('%s').join(speakerName) : body;
  let text: string;
  switch (chatType) {
    case CHAT_TYPE.YELL:
    case CHAT_TYPE.ZONE_YELL:
      text = `${speakerName} yells: ${expanded}`;
      break;
    case CHAT_TYPE.TEXT_EMOTE:
    case CHAT_TYPE.BOSS_EMOTE:
    case CHAT_TYPE.ZONE_EMOTE:
      // Emote lines are usually already third-person; only prefix if bare.
      text = expanded.startsWith(speakerName) || expanded.includes(speakerName)
        ? expanded
        : `${speakerName} ${expanded}`;
      break;
    case CHAT_TYPE.WHISPER:
    case CHAT_TYPE.BOSS_WHISPER:
      text = `${speakerName} whispers: ${expanded}`;
      break;
    case CHAT_TYPE.SAY:
    default:
      text = `${speakerName} says: ${expanded}`;
      break;
  }
  return { chatType, text, body: expanded };
}

// Pick one text id from ACTION_T_TEXT's up-to-3 candidates. Cite: CreatureEventAI.cpp ACTION_T_TEXT
// ~682–689.
export function pickTextIdFromAction(
  id0: number,
  id1: number,
  id2: number,
  rnd01: number,
): number {
  const a = id0 | 0;
  const b = id1 | 0;
  const c = id2 | 0;
  if (!a) return 0;
  if (b && c) {
    const slot = Math.floor(rnd01 * 3) % 3;
    return slot === 0 ? a : slot === 1 ? b : c;
  }
  if (b) {
    return rnd01 < 0.5 ? a : b;
  }
  return a;
}
