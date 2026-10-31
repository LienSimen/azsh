/** Build the play queue for a zone music category from the shipped manifest lists, in stable manifest
 *  order. @param {{ day: string[], night: string[] }} entry @param {boolean} night @returns {string[]} */
export function buildZoneMusicQueue(entry, night) {
  const primary = night ? entry.night : entry.day;
  const list = primary.length ? primary : (entry.day.length ? entry.day : entry.night);
  return list.slice();
}
