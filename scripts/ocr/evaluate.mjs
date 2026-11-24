import fs from 'node:fs/promises';
import path from 'node:path';
import { recognize, readTsv } from '../../lib/ocr/recognize.js';
import { parseReceiptDeterministically } from '../../lib/receiptEngine.js';
const dir = process.argv[2],
  results = [];
for (const file of (await fs.readdir(dir))
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const label = JSON.parse(await fs.readFile(path.join(dir, file)));
  const bytes = await fs.readFile(
    path.join(dir, file.replace('.json', '.png')),
  );
  const language = { hi: 'hin+eng', or: 'ori+eng' }[label.language] || 'eng';
  for (const pipeline of ['baseline', 'local']) {
    const start = performance.now();
    const r =
      pipeline === 'local'
        ? await recognize(bytes, label.language)
        : parseReceiptDeterministically((await readTsv(bytes, language)).text);
    const fields = {
      merchant: r.merchant === label.merchant,
      date: r.date === label.date,
      total: r.total === label.total,
      invoice: r.business?.invoice === label.invoice,
      method: r.business?.method === label.method,
      docType: r.business?.docType === label.docType,
    };
    const items = label.items.filter((expected) =>
      r.items.some(
        (it) =>
          it.name === expected.name &&
          it.quantity === expected.quantity &&
          it.price === expected.price,
      ),
    ).length;
    results.push({
      file,
      language: label.language,
      pipeline,
      fields,
      itemsDetected: r.items.length,
      itemsMatched: items,
      itemsExpected: label.items.length,
      all:
        Object.values(fields).every(Boolean) &&
        items === label.items.length &&
        r.items.length === items,
      ms: Math.round(performance.now() - start),
    });
  }
}
console.log(JSON.stringify(results, null, 2));
