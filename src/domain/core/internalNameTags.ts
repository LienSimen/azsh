/** `<TXT>` / trailing `<PH>` are locale leftovers on a handful of vanilla names. */
export function stripInternalNameTags(name: string): string {
  const cleaned = String(name ?? '').replace(/^<TXT>/, '').replace(/\s*<PH>\s*$/, '').trim();
  return cleaned || name;
}
