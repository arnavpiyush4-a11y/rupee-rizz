import { promisify } from 'node:util';
import { spawn, execFile } from 'node:child_process';
import sharp from 'sharp';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { extractDocument } from './structure.js';
import { parseTsv } from './tsv.js';
import { itemQuality, selectReading, finalizeReadings } from './readings.js';
import { preparePaper, enlargePaper } from './preprocess.js';
import { tableRegion, joinTableReading } from './regions.js';
import { recoverRetailCells } from './cells.js';

const languages = { en: 'eng', hi: 'eng+hin', or: 'ori+eng' };
let active = 0;
let availableLanguages;
export function ocrConfig(lang = 'en') {
  if (!Object.hasOwn(languages, lang)) throw Error('Unsupported language.');
  const bundled = path.join(process.cwd(), 'models', 'ocr', 'best');
  const dataDir = process.env.RR_OCR_TESSDATA_DIR ||
    (lang === 'en' && existsSync(path.join(bundled, 'eng.traineddata')) ? bundled : null);
  const language = process.env[`RR_OCR_LANG_${lang.toUpperCase()}`] || languages[lang];
  if (!/^[a-zA-Z0-9_+-]+$/.test(language)) throw Error('Invalid OCR model name.');
  return { language, executable: process.env.RR_OCR_EXECUTABLE || 'tesseract',
    dataDir: dataDir ? path.resolve(dataDir) : null };
}
async function checkPack(language, config) {
  const cacheKey = `${config.executable}|${config.dataDir || ''}`;
  if (availableLanguages?.key !== cacheKey) availableLanguages = null;
  availableLanguages ??= { key: cacheKey, promise: promisify(execFile)(config.executable,
    [...(config.dataDir ? ['--tessdata-dir', config.dataDir] : []), '--list-langs'], {
    timeout: 5000,
  })
    .then(
      ({ stdout }) =>
        new Set(
          stdout
            .trim()
            .split(/\r?\n/)
            .map((l) => l.trim()),
        ),
    )
    .catch((e) => {
      availableLanguages = null;
      throw e;
    }) };
  const installed = await availableLanguages.promise;
  if (language.split('+').some((l) => !installed.has(l)))
    throw Error('Requested language pack unavailable.');
}
export function readTsv(bytes, language, psm = 6, config = ocrConfig(), options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.executable,
      [
        'stdin',
        'stdout',
        '-l',
        language,
        ...(config.dataDir ? ['--tessdata-dir', config.dataDir] : []),
        '--oem',
        '1',
        '--psm',
        String(psm),
        '-c',
        'tessedit_create_tsv=1',
        ...(options.sauvola ? ['-c', 'thresholding_method=2'] : []),
        ...(options.noDictionary ? ['-c', 'load_system_dawg=0', '-c', 'load_freq_dawg=0'] : []),
        ...(options.whitelist ? ['-c', `tessedit_char_whitelist=${options.whitelist}`] : []),
      ],
      {
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      },
    );
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
    child.on('error', () => {
      clearTimeout(timer);
      reject(Error('Local OCR executable unavailable.'));
    });
    child.stdout.on('data', (b) => {
      size += b.length;
      if (size > 2e6) child.kill('SIGKILL');
      else chunks.push(b);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(bytes);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(
          Error(
            'Local OCR could not finish. Check the language pack or retry a smaller image.',
          ),
        );
      resolve(parseTsv(Buffer.concat(chunks).toString()));
    });
  });
}
export async function recognize(bytes, lang = 'en', options = {}) {
  if (!Object.hasOwn(languages, lang)) throw Error('Unsupported language.');
  if (active >= 2) throw Error('Scanner busy. Try again shortly.');
  active++;
  try {
    const config = ocrConfig(lang);
    const originalMeta = await sharp(bytes, { limitInputPixels: 24000000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(originalMeta.format)) throw Error('Unsupported source format.');
    const paper = await preparePaper(bytes);
    const src = sharp(paper.image);
    await checkPack(config.language, config);
    const meta = await src.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format))
      throw Error('Unsupported source format.');
    const normalized = await src
      .resize({
        width: 1700,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: 'white' })
      .greyscale()
      .normalise()
      .sharpen()
      .png()
      .toBuffer();
    let best = null,
      bestScore = -1;
    const readings = [];
    const record = (result) => { readings.push(result); options.onReading?.(result); };
    let tableInput = null;
    for (const angle of [0, 90, 270, 180]) {
      const image = angle
        ? await sharp(normalized).rotate(angle).png().toBuffer()
        : normalized;
      const pass = await readTsv(image, config.language, 6, config);
      const result = extractDocument(
        pass.text,
        pass.confidence,
        pass.lineScores,
        pass.lineDetails,
      );
      record(result);
      if (
        result.extraction_meta.total_blocked &&
        (result.date || pass.confidence >= 0.65)
      ) {
        best = result;
        best.extraction_meta.rotation = angle;
        break;
      }
      const score =
        pass.confidence +
        (result.total !== null ? 1 : 0) +
        (result.date ? 0.3 : 0);
      if (score > bestScore) {
        best = result;
        bestScore = score;
        best.extraction_meta.rotation = angle;
      }
      if (result.total !== null && pass.confidence >= 0.62) break;
    }
    // A good total does not mean the table was read correctly. Small phone
    // images need enlarged text, and sparse mode needs geometric row joining.
    if (!itemQuality(best).reliable || paper.crop || best.merchant_confidence < 0.8 || !best.date || best.date_confidence < 0.8) {
      for (const [psm, variant, sauvola] of [[6, 'color', false], [11, 'color', false], [6, 'contrast', true]]) {
        const enlarged = await enlargePaper(paper, best.extraction_meta.rotation, variant);
        const pass = await readTsv(enlarged, config.language, psm, config, { sauvola, noDictionary: true });
        if (!tableInput) tableInput = { image: enlarged, pass };
        const alternate = extractDocument(pass.text, pass.confidence, pass.lineScores, pass.lineDetails);
        alternate.extraction_meta.rotation = best.extraction_meta.rotation;
        alternate.extraction_meta.layout = `paper, ${variant}, psm ${psm}`;
        record(alternate);
        best = selectReading(best, alternate);
        if (itemQuality(best).reliable && alternate.merchant_confidence >= 0.8 && alternate.date && alternate.date_confidence >= 0.8) break;
      }
    }
    if (!itemQuality(best).reliable && tableInput) {
      const region = await tableRegion(tableInput.image, tableInput.pass, best.extraction_meta.rotation === 0 ? paper.image : null);
      if (region) {
        const configs = [config];
        if (lang === 'en' && config.dataDir === path.join(process.cwd(), 'models', 'ocr', 'best')) configs.push({ ...config, dataDir: null });
        for (const reader of configs) {
          for (const psm of [6, 11]) {
            const table = await readTsv(region.image, config.language, psm, reader, { noDictionary: true });
            const pass = joinTableReading(tableInput.pass, table, region);
            const alternate = extractDocument(pass.text, pass.confidence, pass.lineScores, pass.lineDetails);
            alternate.extraction_meta.rotation = best.extraction_meta.rotation;
            alternate.extraction_meta.layout = `regional deskew ${region.skew}, psm ${psm}`;
            alternate.extraction_meta.model = reader.dataDir ? path.basename(reader.dataDir) : 'system';
            alternate.extraction_meta.reused_header = true;
            record(alternate);
            best = selectReading(best, alternate);
            if (itemQuality(best).reliable) break;
          }
          if (itemQuality(best).reliable) break;
        }
        if (!itemQuality(best).reliable) {
          const reader = configs.at(-1);
          const table = await readTsv(region.image, config.language, 6, reader, { noDictionary: true });
          const recovered = await recoverRetailCells(region.image, table, readTsv, [...configs].reverse());
          if (recovered.recoveredCount) {
            const pass = joinTableReading(tableInput.pass, recovered.pass, region);
            const alternate = extractDocument(pass.text, pass.confidence, pass.lineScores, pass.lineDetails);
            alternate.extraction_meta.rotation = best.extraction_meta.rotation;
            alternate.extraction_meta.layout = 'regional table with corroborated cell readings';
            alternate.extraction_meta.model = 'best+system';
            alternate.extraction_meta.reused_header = true;
            alternate.evidence.cells = recovered.pass.cell_recovery;
            record(alternate);
            best = selectReading(best, alternate);
          }
        }
      }
    }
    if (tableInput && new Set(readings.filter((r) => r.date).map((r) => r.date)).size > 1) {
      const word = tableInput.pass.lineDetails.flatMap((r) => r.words).find((w) => /\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/.test(w.text));
      if (word) {
        const meta = await sharp(tableInput.image).metadata();
        const left = Math.max(0, word.left - 8), top = Math.max(0, word.top - 8);
        const image = await sharp(tableInput.image).extract({ left, top,
          width: Math.min(meta.width - left, word.right - left + 8), height: Math.min(meta.height - top, word.bottom - top + 8) })
          .extend({ top: 15, bottom: 15, left: 15, right: 15, background: 'white' }).png().toBuffer();
        const reader = lang === 'en' && config.language === 'eng' ? { ...config, dataDir: null } : config;
        for (const psm of [7, 13]) {
          const pass = await readTsv(image, config.language, psm, reader, { noDictionary: true });
          const date = extractDocument(`Date: ${pass.text}`, pass.confidence).date;
          if (date) record({ ...best, date, date_confidence: pass.confidence,
            extraction_meta: { ...best.extraction_meta, reused_header: false, layout: `date cell, psm ${psm}` } });
        }
      }
    }
    if (best.total == null && !best.extraction_meta.total_blocked) {
      // Sparse-mode segmentation can separate a printed label from its amount.
      const original = await sharp(bytes, { limitInputPixels: 24000000 })
        .autoOrient()
        .resize({
          width: 1700,
          height: 2400,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const upright = await sharp(original)
        .rotate(best.extraction_meta.rotation)
        .png()
        .toBuffer();
      const sparseInput =
        best.extraction_meta.rotation === 0 &&
        (!meta.orientation || meta.orientation === 1) &&
        meta.width <= 1700 &&
        meta.height <= 2400
          ? bytes
          : upright;
      const sparse = await readTsv(sparseInput, config.language, 11, config);
      const alternate = extractDocument(
        sparse.text,
        sparse.confidence,
        sparse.lineScores,
        sparse.lineDetails,
      );
      record(alternate);
      const { tax, taxable } = alternate.business;
      if (
        alternate.total != null &&
        alternate.total_confidence >= 0.65 &&
        tax != null &&
        taxable != null &&
        Math.round(alternate.total * 100) ===
          Math.round(taxable * 100) + Math.round(tax * 100)
      ) {
        alternate.extraction_meta.rotation = best.extraction_meta.rotation;
        alternate.extraction_meta.layout =
          'sparse, tax arithmetic corroborated';
        best = alternate;
      }
    }
    if (best.total != null && best.total_confidence < 0.65) {
      const upright = await sharp(normalized)
        .rotate(best.extraction_meta.rotation)
        .png()
        .toBuffer();
      const check = await readTsv(upright, config.language, 11, config);
      const alternate = extractDocument(
        check.text,
        check.confidence,
        check.lineScores,
        check.lineDetails,
      );
      record(alternate);
      if (alternate.total !== best.total || alternate.total_confidence < 0.65) {
        best.total = null;
        best.total_confidence = 0;
        best.extraction_meta.warnings.push(
          'The amount was unclear on a second reading. Enter it from the source.',
        );
      }
    }
    best = finalizeReadings(best, readings);
    best.extraction_meta.languages = config.language;
    best.extraction_meta.model ||= config.dataDir ? path.basename(config.dataDir) : 'system';
    best.extraction_meta.paper_cropped = !!paper.crop;
    return best;
  } finally {
    active--;
  }
}
