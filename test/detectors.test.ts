/** Detector tests. Run: npx tsx test/detectors.test.ts */
import { detect, redact, type SensitiveTerm } from '../src/detectors.js';

const TERMS: SensitiveTerm[] = [
  { term: 'Project Kestrel', category: 'cat1' },
  { term: 'Larchmont Homes', category: 'cat2' },
];

// [text, expected label, expected category]
const POSITIVE: [string, string, 'cat1' | 'cat2'][] = [
  ['password: Kingfisher!2025', 'credential', 'cat1'],
  ['db_password = s3cr3tValue', 'credential', 'cat1'],
  ['pw: Bluebell#77', 'credential', 'cat1'],
  ['API_KEY=abcd1234efgh5678', 'credential', 'cat1'],
  ['client_secret: "zX9-qq_771mm"', 'credential', 'cat1'],
  ['aws key AKIAIOSFODNN7EXAMPLE in config', 'credential', 'cat1'],
  ['OPENAI=sk-proj_abcdefghijklmnopqrstuvwx', 'credential', 'cat1'],
  ['token ghp_ABCDEFGHIJKLMNOPQRSTUVWXyz0123', 'credential', 'cat1'],
  ['-----BEGIN RSA PRIVATE KEY-----', 'private key', 'cat1'],
  ['Card 4111 1111 1111 1111 exp 09/27', 'payment card', 'cat1'],
  ['mastercard 5555555555554444', 'payment card', 'cat1'],
  ['amex 3782-822463-10005', 'payment card', 'cat1'],
  ['UK passport no. 553829174', 'passport number', 'cat1'],
  ['Passport: 761204338 (expires 2029)', 'passport number', 'cat1'],
  ['Strictly private: Project Kestrel offer at 412p', 'sensitive term', 'cat1'],
  ['Contact priya.raman@example.co.uk for the pack', 'email', 'cat2'],
  ['Call 07700 900123 after 5pm', 'phone number', 'cat2'],
  ['Office: 020 7946 0018', 'phone number', 'cat2'],
  ['Spoke to Priya, mobile 07700 900123.', 'phone number', 'cat2'],
  ['Tel +44 (0) 1223 456789', 'phone number', 'cat2'],
  ['US desk +1 415 555 0132', 'phone number', 'cat2'],
  ['NI number JR 48 31 22 C', 'national insurance number', 'cat2'],
  ['ni: PK196047A', 'national insurance number', 'cat2'],
  ['14 Larkspur Close, Cherry Hinton, Cambridge CB1 9XY', 'home address', 'cat2'],
  ['lives at 27 Orchard Rise, Bury St Edmunds IP33 3AB', 'home address', 'cat2'],
  ['Pay to GB82 WEST 1234 5698 7654 32', 'IBAN', 'cat2'],
  ['sort code 40-22-18 account 31926819', 'bank account', 'cat2'],
  ['DOB 14/03/1979', 'date of birth', 'cat2'],
  ['born 2 November 1971 in Ely', 'date of birth', 'cat2'],
  ['Customer: Larchmont Homes', 'sensitive term', 'cat2'],
];

const NEGATIVE: string[] = [
  'The password policy says passwords must be 12 characters.',
  'Reset your password via the portal.',
  'Invoice INV-2025-00918 for £18,500.00',
  'Revenue 1,248,000 and purchases 612,000 in 2025',
  'Year ended 31 December 2025',
  'Version 4.12.3 released on 2026-01-14',
  'Order number 123456789 shipped',
  'Total £1,611,870.00 (both columns)',
  'Meeting on 14/03/2026 at 10:00',
  'The token bucket algorithm limits rate.',
  'api_key: ${API_KEY}',
  'password: ********',
  'Room CB1 is on the second floor',
  'Call ext. 4471 for IT',
  'SO-2291 despatched 3 Jan 2026',
  'Sort the 40-22-18 row by value',
  'Coordinates 52.2053, 0.1218',
  'Ratio 0.25 of profit before tax 145,500',
  'ISBN 978-0-306-40615-7',
];

let pass = 0;
let fail = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (cond) pass++; else { fail++; console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`); }
};

for (const [text, label, cat] of POSITIVE) {
  const hits = detect(text, TERMS);
  ok(hits.some((h) => h.label === label && h.category === cat), `positive: ${text}`, JSON.stringify(hits.map((h) => h.label)));
}
for (const text of NEGATIVE) {
  const hits = detect(text, TERMS);
  ok(hits.length === 0, `negative: ${text}`, JSON.stringify(hits.map((h) => `${h.label}:${h.match}`)));
}

// Hits never carry the raw value.
const secret = 'password: Kingfisher!2025 and card 4111 1111 1111 1111';
const hs = detect(secret);
ok(hs.every((h) => !h.match.includes('Kingfisher') && !h.match.includes('1111 1111')), 'hits are redacted');
// Redaction replaces the value with its label.
const red = redact(secret, hs);
ok(!red.includes('Kingfisher') && red.includes('[redacted: credential]') && red.includes('[redacted: payment card]'), 'redact() removes values', red);
// Line numbers.
const lines = detect('ok\nfine\nemail me: a.b@c.com');
ok(lines[0]?.line === 3, 'line numbers are 1-based', String(lines[0]?.line));

console.log(`\n${POSITIVE.length} positive, ${NEGATIVE.length} negative cases: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
