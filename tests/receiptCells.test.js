import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { recoverRetailCells } from '../lib/ocr/cells.js';

const word = (text, left, right, top, confidence = 0.9) => ({ text, left, right, top, bottom: top + 20, confidence });
function fixture() {
  const lineDetails = [
    { text: 'Item Rate Qty/Unit Disc.Amt NetAmt', top: 20, bottom: 40, words: [word('Item',20,80,20),word('Rate',180,220,20),word('Qty/Unit',260,300,20),word('Disc.Amt',350,390,20),word('NetAmt',430,470,20)] },
    { text: '12345678 398.00 1PC 0.00 399.00', top: 70, bottom: 90, words: [word('12345678',20,120,70),word('398.00',180,225,70),word('1PC',260,300,70),word('0.00',350,390,70),word('399.00',430,480,70)] },
    { text: 'Cotton Shirt / 61099090 / 380.00', top: 110, bottom: 130, words: [word('Cotton',20,80,110),word('Shirt',90,140,110)] },
  ];
  return { text: lineDetails.map((line) => line.text).join('\n'), confidence:0.9, lineDetails, lineScores:[null,0.9,0.9] };
}
const configs = [{ executable:'ocr',language:'eng',dataDir:'fast' },{ executable:'ocr',language:'eng',dataDir:'best' }];
const image = () => sharp({ create:{ width:500,height:200,channels:3,background:'white' } }).png().toBuffer();

test('cell recovery requires observed values and arithmetic before changing a numeric row', async () => {
  const pass = fixture();
  const outputs = ['12345678 399.00 1PC 0.00 399.00','12345678 398.00 1PC 0.00 398.00','399.00','398.00','0.00','0.00','399.00','398.00','1PC','1PC'];
  let calls = 0;
  const reader = async (bytes, language, psm) => {
    assert.equal(language,'eng'); assert.equal(psm,7); assert.ok(bytes.length);
    return { text:outputs[calls++],confidence:0.95 };
  };
  const result = await recoverRetailCells(await image(),pass,reader,configs);
  assert.equal(result.recoveredCount,1);
  assert.equal(result.pass.lineDetails[1].text,'12345678 399.00 1 PC 0.00 399.00');
  assert.equal(result.pass.lineDetails[2].text,pass.lineDetails[2].text);
  assert.equal(pass.lineDetails[1].text,'12345678 398.00 1PC 0.00 399.00');
  assert.equal(calls,10);
});

test('unreadable cell retries leave the original row intact', async () => {
  const pass = fixture();
  const result = await recoverRetailCells(await image(),pass,async () => ({ text:'unreadable',confidence:0.1 }),configs);
  assert.equal(result.recoveredCount,0);
  assert.equal(result.pass.text,pass.text);
});

test('a missing table header never triggers speculative cell crops', async () => {
  const pass = fixture();
  pass.lineDetails.shift();
  const result = await recoverRetailCells(await image(),pass,async () => { throw Error('Unexpected OCR call'); },configs);
  assert.equal(result.recoveredCount,0);
});

test('explicit quantity and net headings locate cells when rate and discount labels are damaged', async () => {
  const pass = fixture();
  pass.lineDetails[0].words[1].text = 'Broa';
  pass.lineDetails[0].words[3].text = 'Diec.Am{';
  let calls = 0;
  await recoverRetailCells(await image(),pass,async () => {
    calls++;
    return { text:'unreadable',confidence:0.1 };
  },configs);
  assert.equal(calls,10);
});
