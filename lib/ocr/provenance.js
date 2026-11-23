import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
function signature(data) {
  const key = process.env.RR_OCR_SIGNING_KEY;
  if (!key || key.length < 32)
    throw Error(
      'Configure RR_OCR_SIGNING_KEY with at least 32 random characters.',
    );
  return createHmac('sha256', key).update(data).digest();
}
export function seal(extraction, bytes, user) {
  const snapshot = {
    merchant: extraction.merchant,
    date: extraction.date,
    total: extraction.total,
    items: extraction.items,
    business: extraction.business,
    meta: extraction.extraction_meta,
  };
  const data = Buffer.from(
    JSON.stringify({ snapshot, user, hash: digest(bytes) }),
  ).toString('base64url');
  return data + '.' + signature(data).toString('base64url');
}
export function unseal(ticket, bytes, user) {
  if (typeof ticket !== 'string' || ticket.length > 350000) return null;
  const [data, part] = ticket.split('.');
  const mac = Buffer.from(part || '', 'base64url'),
    expected = signature(data);
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected))
    return null;
  const claim = JSON.parse(Buffer.from(data, 'base64url'));
  return claim.user === user && claim.hash === digest(bytes)
    ? claim.snapshot
    : null;
}
