import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseReceiptDeterministically } from '../lib/receiptEngine.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(here, '..', 'tests', 'fixtures', 'receiptBenchmark.json')
const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

let passed = 0
for (const testCase of cases) {
  const out = parseReceiptDeterministically(testCase.text)
  const e = testCase.expected
  const merchantOk = !e.merchantContains || String(out.merchant || '').toLowerCase().includes(e.merchantContains)
  const dateOk = e.date == null ? true : out.date === e.date
  const totalOk = e.total == null ? true : Math.abs(Number(out.total) - Number(e.total)) < 0.011
  const itemsOk = e.minItems == null ? true : (out.items?.length || 0) >= e.minItems
  const verifyOk = e.mustVerifyTotal ? out.needs_user_verification.includes('total') : true
  const ok = merchantOk && dateOk && totalOk && itemsOk && verifyOk
  if (ok) passed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.id} — ${testCase.description}`)
  if (!ok) {
    console.log(JSON.stringify({ out, expected: e }, null, 2))
  }
}

console.log(`\nReceipt benchmark: ${passed}/${cases.length} passed`)
if (passed !== cases.length) process.exitCode = 1
