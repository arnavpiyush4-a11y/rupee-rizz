import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['scripts/deploy/verify-ocr.mjs']);
run(['--test', ...readdirSync('tests').filter((f) => f.endsWith('.test.js')).sort().map((f) => `tests/${f}`)]);
run(['scripts/receiptBenchmark.mjs']);
run(['scripts/ocr/verification/check-receipt-route.mjs']);
