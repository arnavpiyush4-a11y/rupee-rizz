import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { recognize, readTsv, ocrConfig } from '../../lib/ocr/recognize.js';
import { maskSensitive } from '../../lib/demo.js';

const usage = 'Usage: node scripts/ocr/diagnose.mjs IMAGE --out PRIVATE_REPORT.json [--language en|hi|or] [--reference EXPECTED.json] [--include-text]';
const args = process.argv.slice(2);
const source = args.shift();
const options = {};
while (args.length) {
  const flag = args.shift();
  if (flag === '--include-text') options.includeText = true;
  else if (['--out', '--language', '--reference'].includes(flag) && args.length && !args[0].startsWith('--'))
    options[flag.slice(2)] = args.shift();
  else { console.error(usage); process.exit(2); }
}
const language = options.language || 'en';
if (!source || !options.out || !['en', 'hi', 'or'].includes(language)) {
  console.error(usage); process.exit(2);
}
if (path.resolve(source) === path.resolve(options.out) ||
    (options.reference && path.resolve(options.reference) === path.resolve(options.out))) {
  console.error('The report must be a new file, separate from the image and reference.');
  process.exit(2);
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clean = (value) => typeof value === 'string' ? maskSensitive(value).text
  : Array.isArray(value) ? value.map(clean)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]))
  : value;
const report = {
  format: 'rupeerizz-private-ocr-diagnostic-1',
  created_at: new Date().toISOString(),
  language,
  model_hashes: {},
  readings: [],
};
let failed = false;
try {
  const config = ocrConfig(language);
  const model = config.language;
  report.model = model;
  report.executable = path.basename(config.executable);
  const bytes = await fs.readFile(source);
  report.source_sha256 = hash(bytes);
  const modelDir = config.dataDir || process.env.TESSDATA_PREFIX;
  if (modelDir) {
    for (const name of model.split('+')) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid model name');
      report.model_hashes[name] = await fs.readFile(path.join(modelDir, `${name}.traineddata`)).then(hash).catch(() => null);
    }
  }
  const started = performance.now();
  const extraction = await recognize(bytes, language);
  report.elapsed_ms = Math.round(performance.now() - started);
  report.extraction = clean(extraction);
  // Raw-pass details are opt-in. Even masked text may contain names/addresses;
  // the report remains a local private artifact and is never uploaded.
  if (options.includeText) {
    for (const psm of [6, 11]) {
      const reading = await readTsv(bytes, model, psm, config);
      report.readings.push({
        psm, confidence: reading.confidence,
        line_scores: reading.lineScores, text: clean(reading.text),
      });
    }
  }
  if (options.reference) {
    const expected = JSON.parse(await fs.readFile(options.reference, 'utf8'));
    const fields = {};
    for (const key of ['merchant', 'date', 'total', 'currency']) {
      if (Object.hasOwn(expected, key)) fields[key] = expected[key] === extraction[key];
    }
    const remaining = [...(extraction.items || [])];
    const itemResults = (expected.items || []).map((wanted) => {
      const index = remaining.findIndex((item) => Object.entries(wanted).every(([key, value]) => item[key] === value));
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
    report.reference_check = {
      fields,
      items_matched: itemResults.filter(Boolean).length,
      items_expected: expected.items?.length ?? null,
      unexpected_items: Object.hasOwn(expected, 'items') ? remaining.length : null,
      exact: Object.values(fields).every(Boolean) && itemResults.every(Boolean) &&
        (!Object.hasOwn(expected, 'items') || remaining.length === 0),
    };
    failed = !report.reference_check.exact;
  }
} catch (error) {
  // Exception messages can contain paths, provider text or document content.
  report.error = {
    code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,50}$/.test(error.code) ? error.code : 'OCR_DIAGNOSTIC_FAILED',
    message: 'Diagnostic failed. Check the image, model configuration, engine and reference file locally.',
  };
  failed = true;
}
try {
  // Exclusive create avoids accidentally overwriting private evidence or a
  // previous result. POSIX permissions are restricted; Windows inherits ACLs.
  await fs.writeFile(options.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(failed ? 'Private diagnostic saved; extraction/reference checks need review.' : 'Private diagnostic saved.');
  process.exitCode = failed ? 1 : 0;
} catch {
  console.error('Could not create the private report. Choose a new path in an existing directory.');
  process.exitCode = 2;
}
