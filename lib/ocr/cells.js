import sharp from 'sharp';

const center = (word) => (word.left + word.right) / 2;
const label = (word) => word.text.toLowerCase().replace(/[^a-z]/g, '');
const money = (text) => {
  const token = String(text || '').trim().replace(/^["'“”‘’~]+|["'“”‘’.]+$/g, '').trim();
  return /^\d{1,7}\.\d{2}$/.test(token) ? Number(token) : null;
};
const rowPattern = /^(\d{7,16})[.,]?\s+(\d+\.\d{2})\s+(\d+(?:\.\d+)?)\s*p[gc]s?\s+(\d+\.\d{2})\.?\s+(\d+\.\d{2})\.?$/i;
const valid = (rate, qty, discount, net) => Math.abs(Math.round((rate * qty - discount) * 100) - Math.round(net * 100)) <= 1;

// Retry the table cells identified by OCR geometry. No merchant-specific
// coordinates, expected amounts, or balancing entries are used for recovery.
export async function recoverRetailCells(image, pass, readTsv, configs = []) {
  const result = structuredClone(pass);
  const details = result.lineDetails || [];
  const headerIndex = details.findIndex((line) =>
    line.words?.some((word) => /netamt|netamount/.test(label(word))) &&
    (line.words?.some((word) => /^(?:rate|price)$/.test(label(word))) ||
      line.words?.some((word) => /qty|quantity|qiy/.test(label(word)))),
  );
  if (headerIndex < 0 || !configs.length) return { pass: result, recoveredCount: 0 };
  const header = details[headerIndex];
  const netHeader = header.words.find((word) => /netamt|netamount/.test(label(word)));
  const qtyHeader = header.words.find((word) => /qty|quantity|qiy/.test(label(word)));
  if (!qtyHeader) return { pass: result, recoveredCount: 0 };
  const rateHeader = header.words.find((word) => /^(?:rate|price)$/.test(label(word))) ||
    header.words.filter((word) => center(word) < center(qtyHeader) && /\p{L}{3,}/u.test(word.text) && !/^items?$/i.test(word.text)).at(-1);
  const discountHeader = header.words.find((word) => /^d[il][se]c/.test(label(word))) ||
    header.words.find((word) => center(word) > center(qtyHeader) && center(word) < center(netHeader) && /\p{L}{3,}/u.test(word.text));
  if (!rateHeader || !discountHeader) return { pass: result, recoveredCount: 0 };
  const meta = await sharp(image).metadata();
  const positions = [rateHeader, qtyHeader, discountHeader, netHeader].map(center);
  if (positions.some((value, i) => i && value <= positions[i - 1])) return { pass: result, recoveredCount: 0 };
  const configurations = configs.filter((config, index) =>
    configs.findIndex((other) => other.executable === config.executable && other.dataDir === config.dataDir && other.language === config.language) === index,
  ).slice(0, 2);
  let recoveredCount = 0;
  const evidence = [];

  for (let index = headerIndex + 1; index < details.length; index++) {
    const row = details[index];
    if (/^(?:total|grand|tender)\b/i.test(row.text)) break;
    const skuMatch = row.text.match(/^(\d{7,16})[.,]?(?=\s)/);
    const quantityMatch = row.text.match(/\b(\d+(?:\.\d+)?)\s*p[gc]s?\b/i);
    if (!skuMatch || !quantityMatch) continue;
    const original = row.text.match(rowPattern);
    if (original && valid(Number(original[2]), Number(original[3]), Number(original[4]), Number(original[5]))) continue;
    const originalQuantity = Number(quantityMatch[1]);
    if (!(originalQuantity > 0)) continue;
    const quantityWord = row.words.find((word) => /\d\s*p[gc]s?\b/i.test(word.text));
    const quantities = [{ value:originalQuantity, confidence:quantityWord?.confidence || 0, source:'table' }];
    const pools = { rate: [], discount: [], net: [] };
    const columns = {
      rate: [(center(rateHeader) + center(row.words[0])) / 2, (center(rateHeader) + center(qtyHeader)) / 2],
      discount: [(center(qtyHeader) + center(discountHeader)) / 2, (center(discountHeader) + center(netHeader)) / 2],
      net: [(center(discountHeader) + center(netHeader)) / 2, meta.width],
    };
    const originalWords = {};
    const add = (field, value, confidence, source) => {
      if (value != null && Number.isFinite(value)) pools[field].push({ value, confidence: Number(confidence) || 0, source });
    };
    for (const [field, bounds] of Object.entries(columns)) {
      const words = row.words.filter((word) => center(word) >= bounds[0] && center(word) < bounds[1]);
      const nearest = words.sort((a, b) => Math.abs(center(a) - center(field === 'rate' ? rateHeader : field === 'net' ? netHeader : discountHeader)) - Math.abs(center(b) - center(field === 'rate' ? rateHeader : field === 'net' ? netHeader : discountHeader)))[0];
      originalWords[field] = nearest;
      if (nearest) add(field, money(nearest.text), nearest.confidence, 'table');
    }
    const following = details[index + 1];
    const bottomLimit = following && following.top > row.top ? following.top - 2 : meta.height;
    async function crop(left, top, right, bottom) {
      left = Math.max(0, Math.floor(left)); top = Math.max(0, Math.floor(top));
      right = Math.min(meta.width, Math.ceil(right)); bottom = Math.min(meta.height, Math.ceil(bottom));
      if (right <= left || bottom <= top) return null;
      return sharp(image).extract({ left, top, width: right - left, height: bottom - top })
        .extend({ top: 20, bottom: 20, left: 20, right: 20, background: 'white' }).png().toBuffer();
    }
    const rowImage = await crop(Math.min(...row.words.map((word) => word.left)) - 5, row.top - 5,
      Math.max(...row.words.map((word) => word.right)) + 8, Math.min(row.bottom + 8, bottomLimit));
    if (rowImage) for (const config of configurations) {
      try {
        const reading = await readTsv(rowImage, config.language || 'eng', 7, config, { noDictionary: true });
        const quantityReading = reading.text.match(/(?:^|[^\d])(\d+(?:\.\d+)?)\s*p[gc]s?(?=$|[^\p{L}])/iu);
        if (quantityReading) quantities.push({ value:Number(quantityReading[1]),confidence:reading.confidence,source:'row' });
        const match = reading.text.trim().match(rowPattern);
        if (match) {
          add('rate', Number(match[2]), reading.confidence, 'row');
          add('discount', Number(match[4]), reading.confidence, 'row');
          add('net', Number(match[5]), reading.confidence, 'row');
        }
      } catch { /* A failed retry must not erase the original OCR pass. */ }
    }
    for (const [field, bounds] of Object.entries(columns)) {
      const word = originalWords[field];
      const left = word ? Math.max(bounds[0], word.left - 8) : bounds[0];
      const right = word ? Math.min(bounds[1], word.right + 10) : bounds[1];
      const bytes = await crop(left, (word?.top ?? row.top) - 5, right,
        Math.min((word?.bottom ?? row.bottom) + 8, bottomLimit));
      if (!bytes) continue;
      for (const config of configurations) {
        try {
          const reading = await readTsv(bytes, config.language || 'eng', 7, config, { noDictionary: true });
          add(field, money(reading.text), reading.confidence, 'cell');
        } catch { /* Continue to independent evidence from other cells. */ }
      }
    }
    if (quantityWord) {
      const bytes = await crop(quantityWord.left - 8, quantityWord.top - 5, quantityWord.right + 8,
        Math.min(quantityWord.bottom + 8, bottomLimit));
      if (bytes) for (const config of configurations) {
        try {
          const reading = await readTsv(bytes, config.language || 'eng', 7, config, { noDictionary:true });
          const match = reading.text.trim().match(/^(\d+(?:\.\d+)?)\s*p[gc]s?\.?$/i);
          if (match) quantities.push({ value:Number(match[1]),confidence:reading.confidence,source:'cell' });
        } catch { /* Keep quantities grounded in the available row readings. */ }
      }
    }
    const quantityCandidates = quantities.filter((candidate) => candidate.value > 0 &&
      (candidate.value === originalQuantity || quantities.filter((other) => other.value === candidate.value).length >= 2));
    const candidates = [];
    for (const quantity of quantityCandidates) for (const rate of pools.rate) for (const discount of pools.discount) for (const net of pools.net) {
      if (!valid(rate.value, quantity.value, discount.value, net.value)) continue;
      const agreement = pools.net.filter((candidate) => candidate.value === net.value);
      const supports = new Set(agreement.map((candidate) => candidate.source));
      if (!supports.has('cell') || (agreement.length < 2 && rate.source === net.source)) continue;
      candidates.push({ rate, discount, net, quantity:quantity.value,
        confidence: Math.min(Math.max(...quantities.filter((candidate) => candidate.value === quantity.value).map((candidate) => candidate.confidence)),
          Math.max(...pools.rate.filter((candidate) => candidate.value === rate.value).map((candidate) => candidate.confidence)),
          Math.max(...pools.discount.filter((candidate) => candidate.value === discount.value).map((candidate) => candidate.confidence)),
          Math.max(...agreement.map((candidate) => candidate.confidence))),
        votes: agreement.length });
    }
    candidates.sort((a, b) => b.confidence - a.confidence || b.votes - a.votes);
    const chosen = candidates[0];
    if (!chosen || chosen.confidence < 0.4) continue;
    if (chosen.confidence < 0.5 && pools.net.filter((candidate) =>
      candidate.source === 'cell' && candidate.value === chosen.net.value && candidate.confidence >= 0.8).length < 2) continue;
    const text = `${skuMatch[1]} ${chosen.rate.value.toFixed(2)} ${chosen.quantity} PC ${chosen.discount.value.toFixed(2)} ${chosen.net.value.toFixed(2)}`;
    row.text = text;
    row.confidence = chosen.confidence;
    if (quantityWord) {
      quantityWord.text = `${chosen.quantity}PC`;
      quantityWord.confidence = Math.max(...quantities.filter((candidate) => candidate.value === chosen.quantity).map((candidate) => candidate.confidence));
    }
    for (const field of ['rate', 'discount', 'net']) {
      const word = originalWords[field];
      if (word) { word.text = chosen[field].value.toFixed(2); word.confidence = Math.max(...pools[field].filter((candidate) => candidate.value === chosen[field].value).map((candidate) => candidate.confidence)); }
    }
    result.lineScores[index] = chosen.confidence;
    evidence.push({ line: index, rate: chosen.rate.value, quantity:chosen.quantity, discount: chosen.discount.value, net: chosen.net.value,
      confidence: Math.max(...pools.net.filter((candidate) => candidate.value === chosen.net.value).map((candidate) => candidate.confidence)),
      weakest_field_confidence:chosen.confidence });
    recoveredCount++;
  }
  result.text = details.map((line) => line.text).join('\n');
  result.cell_recovery = evidence;
  return { pass: result, recoveredCount };
}
