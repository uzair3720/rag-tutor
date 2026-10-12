export type Chunk = { page: number; index: number; text: string };

export function chunkPages(pages: string[], size = 1000, overlap = 150): Chunk[] {
  const out: Chunk[] = [];
  let index = 0;
  for (let p = 0; p < pages.length; p++) {
    const text = pages[p].replace(/\s+/g, " ").trim();
    if (!text) continue;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const space = text.lastIndexOf(" ", end);
        if (space > start + size / 2) end = space;
      }
      const piece = text.slice(start, end).trim();
      if (piece) out.push({ page: p + 1, index: index++, text: piece });
      if (end >= text.length) break;
      start = end - overlap;
    }
  }
  return out;
}
