import fs from 'node:fs/promises';
import path from 'node:path';
import { recognize } from '../../lib/ocr/recognize.js';
const dir = process.argv[2],
  rows = [];
for (const file of (await fs.readdir(dir))
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const { total, lang } = JSON.parse(await fs.readFile(path.join(dir, file)));
  const started = performance.now(),
    result = await recognize(
      await fs.readFile(path.join(dir, file.replace('.json', '.png'))),
      lang,
    );
  rows.push({
    file,
    expected: total,
    read: result.total,
    ms: Math.round(performance.now() - started),
  });
}
console.log(JSON.stringify(rows, null, 2));
