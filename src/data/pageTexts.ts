// Readable pages behind dungeon TEXT GOs (books / plaques). Baked by src/dev/etl/emit-page-text.mjs from
// gameobject_template.data0 + page_text.
import pageTextsJson from './tables/pageTexts.json' with { type: 'json' };

type PageTexts = {
  goPages: Record<string, number>;
  pages: Record<string, { text: string; next?: number }>;
};

const data = pageTextsJson as PageTexts;

/** First page id for a TEXT GO entry, or null when the book has no baked pages. */
export function firstPageForGo(goEntry: number): number | null {
  return data.goPages[String(goEntry)] ?? null;
}

export function pageText(pageId: number): { text: string; next?: number } | null {
  return data.pages[String(pageId)] ?? null;
}
