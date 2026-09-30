// RupeeRizz — INR + date formatting helpers (en-IN). Pure functions, safe on server & client.

export function formatINR(amount, { decimals = 0 } = {}) {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
}

export function formatNum(n) {
  const v = Number(n);
  return new Intl.NumberFormat('en-IN').format(Number.isFinite(v) ? v : 0);
}

export function formatDate(d, lang = 'en') {
  if (!d) return '\u2014';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!date || isNaN(date.getTime())) return '\u2014';
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}

export function pctOf(part, whole) {
  const w = Number(whole);
  if (!w) return 0;
  return Math.max(0, Math.min(100, (Number(part) / w) * 100));
}
