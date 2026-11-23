export const money = (p) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    p / 100,
  );
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function paise(value) {
  const s = String(value).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s))
    throw Error('Enter rupees with up to two decimal places.');
  const [whole, fraction = ''] = s.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function summarize(entries, receipts = [], asOf = today()) {
  let sales = 0,
    expenses = 0,
    costs = 0,
    cash = 0,
    recent = 0,
    owed = 0,
    payable = 0,
    supported = 0,
    costKnown = true;
  const stock = new Map(),
    suppliers = new Map();
  const docs = new Map(receipts.map((r) => [r.id, r]));
  const rows = [...entries].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
  const evidence = [];
  for (const r of rows) {
    const sign = r.kind === 'sale' ? 1 : -1;
    const net = r.amount - r.tax;
    const lines = r.stock_lines?.length ? r.stock_lines : r.item ? [{item:r.item,units:r.units,net,reorder:r.reorder}] : [];
    if (sign === 1) sales += net;
    else if (r.kind === 'expense' || !lines.length) expenses += net;
    if (r.kind === 'purchase' && r.party)
      suppliers.set(r.party, (suppliers.get(r.party) || 0) + r.amount);
    for (const line of lines) {
      const key = line.item.trim().toLowerCase();
      const s = stock.get(key) || {
        name: line.item,
        units: 0,
        cost: 0,
        reorder: 0,
      };
      if (sign === 1) {
        if (s.units < line.units) costKnown = false;
        const used =
          s.units > 0
            ? Number(
                (BigInt(s.cost) * BigInt(line.units) * 2n + BigInt(s.units)) /
                  (2n * BigInt(s.units)),
              )
            : 0;
        costs += used;
        s.cost -= used;
        s.units -= line.units;
      } else {
        s.cost += line.net;
        s.units += line.units;
        s.reorder = line.reorder ?? s.reorder;
      }
      stock.set(key, s);
    }
    const paid = r.method === 'udhaar' ? r.paid_on : r.day;
    if (paid) {
      cash += sign * r.amount;
      const age = (Date.parse(asOf) - Date.parse(paid)) / 86400000;
      if (age >= 0 && age < 30) recent += sign * r.amount;
    } else if (sign === 1) owed += r.amount;
    else payable += r.amount;
    const doc = docs.get(r.receipt_id);
    const matches = !!(
      doc?.user_verified && doc.has_source!==false &&
      doc.currency === 'INR' &&
      Number(doc.total) > 0 &&
      Math.round(Number(doc.total) * 100) === r.amount &&
      doc.receipt_date === r.day
    );
    if (matches) supported++;
    evidence.push({
      entry: r.id,
      receipt: r.receipt_id || null,
      origin: doc?.source_sha256 ? 'Source image with owner review' : doc ? 'Legacy owner-reviewed record' : 'Self-reported',
      source_sha256:doc?.source_sha256||null,
      independently_verified:false,
      classification:!doc?'self-reported':doc.ocr_origin||doc.provenance?'OCR extracted, owner confirmed':'owner confirmed',

      status: matches
        ? 'Reviewed receipt matches date and amount'
        : doc
          ? 'Review receipt date, currency and amount'
          : 'Attach a receipt when available',
    });
  }
  const days = new Set(rows.map((r) => r.day)).size;
  return {
    sales,
    expenses,
    costs,
    profit: costKnown ? sales - expenses - costs : null,
    cash,
    owed,
    payable,
    forecast:
      rows.length && Date.parse(asOf) - Date.parse(rows[0].day) >= 29 * 86400000
        ? recent
        : null,
    stock: [...stock.values()],
    suppliers: [...suppliers],
    supported,
    days,
    evidence,
    coverage: rows.length ? Math.round((100 * supported) / rows.length) : null,
  };
}
export function voiceDraft(text) {
  const s = text
    .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 2406))
    .replace(/[୦-୯]/g, (c) => String(c.charCodeAt(0) - 2918));
  const amounts = s.match(/\d+(?:[,.]\d+)*/g) || [];
  const kind = /sale|sold|बिक्री|बेचा|ବିକ୍ରି|ବିକ୍ରୟ/i.test(s)
    ? 'sale'
    : /purchase|bought|खरीद|କିଣ/i.test(s)
      ? 'purchase'
      : /expense|spent|खर्च|ଖର୍ଚ୍ଚ/i.test(s)
        ? 'expense'
        : null;
  const method = /cash|नकद|नगद|ନଗଦ/i.test(s)
    ? 'cash'
    : /upi|digital|डिजिटल|ୟୁପିଆଇ|ଡିଜିଟାଲ/i.test(s)
      ? 'digital'
      : /credit|udhaar|उधार|ଉଧାର/i.test(s)
        ? 'udhaar'
        : null;
  return {
    ...(kind && { kind }),
    ...(method && { method }),
    ...(amounts.length === 1 && { rupees: amounts[0].replaceAll(',', '') }),
  };
}
