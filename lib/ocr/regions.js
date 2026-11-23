import sharp from 'sharp';
import { estimateSkew } from './preprocess.js';

// Receipt paper can bend: the header and item table need different deskewing.
// Locate the table from printed labels, never from a merchant-specific offset.
export async function tableRegion(image, pass, sourceImage = null) {
  const rows = pass.lineDetails || [];
  const header = rows.findIndex((r) => /description.*(?:hsn|taxable)/i.test(r.text));
  const footer = rows.findIndex((r, i) => i > header && /(?:total\s+invo[iIl]ce\s+amount|grand\s+total|total\s+amount)/i.test(r.text));
  if (header < 0 || footer <= header + 2) return null;
  const meta = await sharp(image).metadata();
  const start = Math.max(0, header - 1);
  const productRows = rows.slice(start, footer).filter((r) => /^\d{7,}/.test(r.text) || /\/\s*\d{4,}/.test(r.text));
  const words = productRows.flatMap((r) => r.words);
  const left = words.length ? Math.max(0, Math.min(...words.map((w) => w.left)) - 12) : 0;
  const right = words.length ? Math.min(meta.width, Math.max(...words.map((w) => w.right)) + 12) : meta.width;
  const top = Math.max(0, rows[start].top - 8);
  const bottom = Math.min(meta.height, rows[footer].top - 4);
  if (bottom - top < 50) return null;
  let cropped;
  if (sourceImage) {
    const source = await sharp(sourceImage).metadata();
    const scale = (meta.width - 40) / source.width;
    const sourceTop = Math.max(0, Math.floor((top - 20) / scale));
    const sourceBottom = Math.min(source.height, Math.ceil((bottom - 20) / scale));
    const sourceLeft = Math.max(0, Math.floor((left - 20) / scale));
    const sourceRight = Math.min(source.width, Math.ceil((right - 20) / scale));
    cropped = await sharp(sourceImage).extract({ left: sourceLeft, top: sourceTop, width: sourceRight - sourceLeft, height: sourceBottom - sourceTop }).png().toBuffer();
  } else cropped = await sharp(image).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
  const skew = await estimateSkew(cropped);
  const region = await sharp(cropped).rotate(skew, { background: 'white' })
    .resize({ width: sourceImage ? (await sharp(cropped).metadata()).width * 3 : meta.width })
    .extend({ top: 15, bottom: 15, left: 15, right: 15, background: 'white' }).png().toBuffer();
  return { image: region, skew, start, end: footer };
}

export function joinTableReading(original, table, region) {
  const before = original.lineDetails.slice(0, region.start);
  const after = original.lineDetails.slice(region.end);
  const details = [...before, ...table.lineDetails, ...after];
  return {
    text: details.map((r) => r.text).join('\n'),
    lineDetails: details,
    lineScores: [...original.lineScores.slice(0, region.start), ...table.lineScores, ...original.lineScores.slice(region.end)],
    confidence: details.reduce((s, r) => s + r.confidence, 0) / details.length,
  };
}
