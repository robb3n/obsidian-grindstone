/**
 * Card ID generation.
 *
 * hash input = file_path + '\n' + cleaned_title
 * Stars and tags are stripped from the title so that
 * star-writeback and tag edits don't change the card identity.
 *
 * blockIndex is appended when > 0 to disambiguate identical titles
 * within the same file.
 */
export function computeCardId(
  filePath: string,
  cleanedTitle: string,
  blockIndex: number,
): string {
  let raw = `${filePath}\n${cleanedTitle}`;
  if (blockIndex > 0) {
    raw += `\n${blockIndex}`;
  }
  return cyrb53(raw);
}

/**
 * cyrb53 – fast, high-quality 53-bit string hash.
 * Returns a hex string.
 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
