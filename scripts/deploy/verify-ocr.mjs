import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function verifyOcr() {
  const executable = process.env.RR_OCR_EXECUTABLE || 'tesseract';
  const installed = execFileSync(executable, ['--list-langs'], { encoding: 'utf8', timeout: 5000 }).split(/\r?\n/).map((v) => v.trim());
  for (const lang of ['eng', 'hin', 'ori']) if (!installed.includes(lang)) throw Error(`The native OCR image is missing the ${lang} language pack.`);
  const models = [
    ['models/ocr/best/eng.traineddata', '8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba'],
    ['/usr/share/tesseract-ocr/5/tessdata/eng.traineddata', '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'],
    ['/usr/share/tesseract-ocr/5/tessdata/hin.traineddata', '4c73ffc59d497c186b19d1e90f5d721d678ea6b2e277b719bee4e2af12271825'],
    ['/usr/share/tesseract-ocr/5/tessdata/ori.traineddata', '36f3135e61d501a3acfad41f5fe60b8e791274fff4c5375c969fdcca980cdbac'],
  ];
  for (const [file, expected] of models) {
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== expected) throw Error('An OCR model differs from the validated model manifest. Refusing to change recognition weights silently.');
  }
  console.log('Verified native Tesseract and pinned English, Hindi, Odia, and best-English models.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { verifyOcr(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
