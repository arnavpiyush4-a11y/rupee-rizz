// Sparse segmentation gives each table cell its own block. Reconstruct visual
// rows from their positions so the parser sees the same columns as the reader.
export function parseTsv(tsv) {
  const groups = new Map();
  let score = 0, count = 0;
  for (const line of String(tsv).split(/\r?\n/)) {
    const c = line.split('\t');
    if (c[0] !== '5' || !c[11]?.trim()) continue;
    const [left, top, width, height, confidence] = c.slice(6, 11).map(Number);
    if (![left, top, width, height, confidence].every(Number.isFinite) || height <= 0) continue;
    const key = c.slice(1, 5).join('.');
    const word = { text: c[11].trim(), left, top, right: left + width, bottom: top + height, confidence: confidence / 100 };
    if (!groups.has(key)) groups.set(key, { page: c[1], words: [], top, bottom: top + height });
    const group = groups.get(key);
    group.words.push(word);
    group.top = Math.min(group.top, top);
    group.bottom = Math.max(group.bottom, top + height);
    score += confidence;
    count++;
  }
  const rows = [];
  for (const group of [...groups.values()].sort((a, b) => Number(a.page) - Number(b.page) || a.top - b.top)) {
    const row = rows.findLast((r) => {
      const overlap = Math.min(r.bottom, group.bottom) - Math.max(r.top, group.top);
      const height = Math.min(r.bottom - r.top, group.bottom - group.top);
      return r.page === group.page && overlap / height >= 0.6;
    });
    if (row) {
      row.words.push(...group.words);
      row.top = Math.min(row.top, group.top);
      row.bottom = Math.max(row.bottom, group.bottom);
    } else rows.push({ ...group, words: [...group.words] });
  }
  const lineScores = [];
  const lineDetails = [];
  const text = rows.map((row) => {
    row.words.sort((a, b) => a.left - b.left);
    const numeric = row.words.filter((w) => /[0-9\u0966-\u096f\u0b66-\u0b6f]/.test(w.text));
    // The weakest numeric token matters, not just the last token on the row.
    lineScores.push(numeric.length ? Math.min(...numeric.map((w) => w.confidence)) : undefined);
    const text = row.words.map((w) => w.text).join(' ');
    const names = row.words.filter((w) => /\p{L}{2,}/u.test(w.text) && !/[0-9]/.test(w.text));
    lineDetails.push({ text, top: row.top, bottom: row.bottom,
      text_confidence: names.length ? Math.min(...names.map((w) => w.confidence)) : null,
      confidence: row.words.reduce((s, w) => s + w.confidence, 0) / row.words.length,
      words: row.words });
    return text;
  }).join('\n');
  return { text, lineScores, lineDetails, confidence: count ? score / count / 100 : 0 };
}
