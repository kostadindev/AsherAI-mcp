import { describe, expect, it } from 'vitest';
import { detect, redact, redactValue, type Category, type SensitiveTerm } from '../src/detectors.js';
import { first } from './helpers.js';

const TERMS: SensitiveTerm[] = [
  { term: 'Project Kestrel', category: 'cat1' },
  { term: 'Larchmont Homes', category: 'cat2' },
];

const POSITIVE: [text: string, label: string, category: Category][] = [
  ['password: Kingfisher!2025', 'credential', 'cat1'],
  ['db_password = s3cr3tValue', 'credential', 'cat1'],
  ['pw: Bluebell#77', 'credential', 'cat1'],
  ['API_KEY=abcd1234efgh5678', 'credential', 'cat1'],
  ['client_secret: "zX9-qq_771mm"', 'credential', 'cat1'],
  ['{"password": "Winter2026!fern"}', 'credential', 'cat1'],
  ['the temporary password is Winter2026!fern', 'credential', 'cat1'],
  ['aws key AKIAIOSFODNN7EXAMPLE in config', 'credential', 'cat1'],
  ['OPENAI=sk-proj_abcdefghijklmnopqrstuvwx', 'credential', 'cat1'],
  ['token ghp_ABCDEFGHIJKLMNOPQRSTUVWXyz0123', 'credential', 'cat1'],
  ['Authorization: Bearer abcdefghijklmnop0123456789', 'credential', 'cat1'],
  ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl', 'credential', 'cat1'],
  ['-----BEGIN RSA PRIVATE KEY-----', 'private key', 'cat1'],
  ['Card 4111 1111 1111 1111 exp 09/27', 'payment card', 'cat1'],
  ['Paid with 4111111111111111.', 'payment card', 'cat1'],
  ['mastercard 5555555555554444', 'payment card', 'cat1'],
  ['amex 3782-822463-10005', 'payment card', 'cat1'],
  ['UK passport no. 553829174', 'passport number', 'cat1'],
  ['Passport: 761204338 (expires 2029)', 'passport number', 'cat1'],
  ['Strictly private: Project Kestrel offer at 412p', 'sensitive term', 'cat1'],
  ['Contact priya.raman@example.co.uk for the pack', 'email', 'cat2'],
  ['Call 07700 900123 after 5pm', 'phone number', 'cat2'],
  ['Office: 020 7946 0018', 'phone number', 'cat2'],
  ['Tel +44 (0) 1223 456789', 'phone number', 'cat2'],
  ['US desk +1 415 555 0132', 'phone number', 'cat2'],
  ['NI number JR 48 31 22 C', 'national insurance number', 'cat2'],
  ['ni: PK196047A', 'national insurance number', 'cat2'],
  ['14 Larkspur Close, Cherry Hinton, Cambridge CB1 9XY', 'home address', 'cat2'],
  ['lives at 27 Orchard Rise, Bury St Edmunds IP33 3AB', 'home address', 'cat2'],
  ['Pay to GB82 WEST 1234 5698 7654 32', 'IBAN', 'cat2'],
  ['sort code 40-22-18 account 31926819', 'bank account', 'cat2'],
  ['Sort code: 20-45-77\nAccount number: 63849217', 'bank account', 'cat2'],
  ['A/C no: 63849217', 'bank account', 'cat2'],
  ['DOB 14/03/1979', 'date of birth', 'cat2'],
  ['born 2 November 1971 in Ely', 'date of birth', 'cat2'],
  ['Customer: Larchmont Homes', 'sensitive term', 'cat2'],
];

const NEGATIVE: string[] = [
  'The password policy says passwords must be 12 characters.',
  'Reset your password via the portal.',
  'PASSWORD_MIN_LENGTH=12',
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
  'Questions to accounts@fernvale.co.uk please',
  'Our helpline 0345 600 1234',
  'Card number 4111 1111 1111 1112 failed the check',
  'Fernvale Kitchens Ltd, Unit 4 Marsh Lane Trading Estate, Ely CB7 4QF',
  'Passport Office opening hours',
];

describe('detect', () => {
  it.each(POSITIVE)('flags %j', (text, label, category) => {
    expect(detect(text, TERMS)).toContainEqual(expect.objectContaining({ label, category }));
  });

  it.each(NEGATIVE)('does not flag %j', (text) => {
    expect(detect(text, TERMS)).toEqual([]);
  });

  it('never returns the raw value', () => {
    const hits = detect('password: Kingfisher!2025 and card 4111 1111 1111 1111');
    expect(hits).toHaveLength(2);
    for (const h of hits) {
      expect(h.match).toMatch(/^.{2}\*\*\*$/);
      expect(h.match).not.toContain('Kingfisher');
    }
  });

  it('reports 1-based line numbers and offsets', () => {
    const text = 'ok\nfine\nemail me: a.b@c.com';
    const hit = first(detect(text));
    expect(hit.line).toBe(3);
    expect(text.slice(hit.index, hit.index + hit.length)).toBe('a.b@c.com');
  });

  it('ignores sensitive terms shorter than three characters', () => {
    expect(detect('AB went to the bank', [{ term: 'AB', category: 'cat1' }])).toEqual([]);
  });

  it('keeps the stricter category when hits overlap', () => {
    const hits = detect('note: Project Kestrel', [{ term: 'Kestrel', category: 'cat2' }, { term: 'Project Kestrel', category: 'cat1' }]);
    expect(hits).toHaveLength(1);
    expect(first(hits).category).toBe('cat1');
  });

  it('reads date-of-birth columns from a CSV header in any spelling', () => {
    const csv = 'name,start_date,Date_of_Birth,team\nLeah Morgan,2025-02-03,1994-07-12,Audit\n';
    expect(detect(csv).map((h) => h.label)).toContain('date of birth');
  });

  it('treats a postcode column in a table of people as a home address', () => {
    const csv = 'name,role,postcode\nLeah Morgan,Analyst,CB4 2QW\n';
    expect(detect(csv).map((h) => h.label)).toContain('home address');
  });

  it('does not treat a supplier postcode column as a home address', () => {
    const csv = 'supplier,name,postcode\nBrightline,Accounts,CB4 2QW\n';
    expect(detect(csv).map((h) => h.label)).not.toContain('home address');
  });

  it('only flags a date as a birth date when the nearest label is a birth label', () => {
    const labels = detect('Date of birth: 1979-03-14   Appointed: 2016-05-01').filter((h) => h.label === 'date of birth');
    expect(labels).toHaveLength(1);
  });
});

describe('private keys', () => {
  const KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAxyz123\nQ29uZmlkZW50aWFsS2V5Qm9keQ==\n-----END RSA PRIVATE KEY-----';

  it('covers the whole block, header to footer', () => {
    const hit = first(detect(`config:\n${KEY}\nend`).filter((h) => h.label === 'private key'));
    expect(hit.length).toBe(KEY.length);
  });

  it('redacts the key body, not just the header', () => {
    const text = `config:\n${KEY}\nend`;
    const out = redact(text, detect(text));
    expect(out).toBe('config:\n[redacted: private key]\nend');
  });

  it('covers a truncated block to the end of the text', () => {
    const text = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC';
    expect(first(detect(text)).length).toBe(text.length);
  });
});

describe('overlapping detections', () => {
  it('merge into one interval covering both, with the stricter category', () => {
    const text = 'sort code 40-22-18 account 31926819';
    const hits = detect(text, [{ term: '319', category: 'cat1' }]);
    expect(hits).toHaveLength(1);
    const hit = first(hits);
    expect(hit.category).toBe('cat1');
    expect(text.slice(hit.index, hit.index + hit.length)).toBe('40-22-18 account 31926819');
    expect(redact(text, hits)).toBe('sort code [redacted: sensitive term]');
  });

  it('merge partial overlaps without corrupting the redaction', () => {
    const text = 'call 07700 900123 now';
    const hits = detect(text, [{ term: '900123 now', category: 'cat2' }]);
    expect(redact(text, hits)).not.toMatch(/\d/);
  });
});

describe('date of birth', () => {
  it('does not flag a second date after the birth date on the same line', () => {
    const labels = detect('Date of birth: 1979-03-14, 2016-05-01').filter((h) => h.label === 'date of birth');
    expect(labels).toHaveLength(1);
  });
});

describe('redact', () => {
  it('replaces every value with its label', () => {
    const text = 'password: Kingfisher!2025 and card 4111 1111 1111 1111';
    expect(redact(text, detect(text))).toBe('password: [redacted: credential] and card [redacted: payment card]');
  });

  it('returns the text unchanged with no hits', () => {
    expect(redact('nothing here', [])).toBe('nothing here');
  });
});

describe('redactValue', () => {
  it('keeps two characters', () => {
    expect(redactValue('  Kingfisher ')).toBe('Ki***');
  });
});
