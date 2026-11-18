/**
 * Generic restricted-data detectors for the TrialRun gateway's workspace mode.
 *
 * Category 1 (prohibited, never to an AI): credentials, payment cards, passport numbers, cat1 terms.
 * Category 2 (personal / internal, not for AI): emails, phones, NI numbers, address postcodes, IBANs,
 * UK bank accounts, dates of birth, cat2 terms.
 *
 * Tuned for low false positives: most patterns need context (a "password:" label, an address word,
 * "passport" nearby, a checksum). Hits never carry the raw value, only a redacted snippet.
 */

export type Category = 'cat1' | 'cat2';

export interface SensitiveTerm { term: string; category: Category }

export interface Hit {
  category: Category;
  label: string;
  /** Redacted snippet: first two characters, then ***. Never the raw value. */
  match: string;
  index: number;
  length: number;
  /** 1-based line number in the scanned text. */
  line: number;
}

export const redactValue = (s: string) => `${s.trim().slice(0, 2)}***`;

function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const c of code) rem = (rem * 10 + (c.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

const ADDRESS_WORDS = /\b(road|rd|street|st|lane|ln|close|avenue|ave|way|drive|dr|rise|walk|court|ct|place|pl|crescent|gardens|terrace|hill|view|square|grove|mews|row|park)\b/i;
/** Lines that describe an organisation's premises, not where a person lives. */
const BUSINESS_ADDRESS = /\b(ltd|limited|plc|llp|inc|gmbh|unit \d+|business park|trading estate|industrial estate|science park|retail park|registered office|head office|house,|suite \d+|floor)\b/i;
const MONTHS = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const ANY_DATE = /\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}/;
const DOB_LABEL = /\b(?:dob|d\.o\.b\.?|date of birth|born|birth ?date)\b/i;

/**
 * Role mailboxes (accounts@, info@, noreply@ …) belong to a function, not a person, so they are not
 * personal data. Matched on the first token of the local part.
 */
const ROLE_MAILBOX = new Set([
  'accounts', 'account', 'info', 'finance', 'invoices', 'invoice', 'billing', 'sales', 'support', 'help', 'helpdesk',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'admin', 'office', 'contact', 'enquiries', 'enquiry', 'hello',
  'team', 'payroll', 'hr', 'careers', 'jobs', 'notices', 'notifications', 'credit', 'creditcontrol', 'ap', 'ar',
  'payables', 'receivables', 'treasury', 'compliance', 'legal', 'press', 'media', 'marketing', 'orders', 'purchasing',
  'procurement', 'reception', 'service', 'customerservice', 'customer', 'relationship', 'operations', 'ops', 'it',
  'security', 'privacy', 'dpo', 'webmaster', 'postmaster', 'creditors', 'remittance', 'remittances', 'tax', 'vat', 'audit',
  'disputes', 'dispute', 'chargebacks', 'payments', 'payment', 'refunds', 'returns', 'claims', 'collections',
  'bookings', 'accounting', 'bookkeeping', 'events', 'facilities', 'recruitment', 'investors', 'ir', 'cosec',
]);

/** Normalise a CSV header ("Date_of_Birth", "birth-date") for label matching. */
const normHeader = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
const DOB_HEADER = /^(?:dob|d o b|date of birth|birth ?date|birthday|born|date born)$/;
const POSTCODE_HEADER = /^(?:post ?code|postal code|zip|zip code|home post ?code)$/;
/** Columns that show the rows are people. */
const PERSON_HEADER = /^(?:name|full name|surname|last name|forename|first name|given name|employee|employee name|staff|member|cardholder|guarantor|applicant|tenant|customer name)$/;
/** A nearby line that names an organisation: letterheads put the company on the line above its address. */
const ORG_NAME_LINE = /\b(?:plc|ltd|limited|llp|holdings|group plc|bank plc|building society)\b|\bbank\s*$/i;
const isRoleMailbox = (email: string) => {
  const local = email.slice(0, email.indexOf('@')).toLowerCase();
  const firstWord = local.split(/[._+-]/, 1)[0] ?? local;
  return ROLE_MAILBOX.has(local) || ROLE_MAILBOX.has(firstWord);
};

const firstLineOf = (text: string) => text.split('\n', 1)[0] ?? text;

/** Setting names that are about passwords rather than holding one (PASSWORD_MIN_LENGTH, token_expiry_days …). */
const CREDENTIAL_SETTING = /(length|policy|min|max|expiry|expires|expire|days|timeout|ttl|rotation|count|attempts|retries|reset|url|uri|file|path|enabled|disabled|required|header|type|name|id_type|hint|format)/i;
const MASKED = /^[*•x#.]+$/i;
const PLACEHOLDER = /^(?:<[^>]*>|\$\{?[A-Z_]+\}?|changeme|required|none|null|n\/a|tbc|tbd|unchanged|reset|redacted|hidden|blank|empty|set|not set|never|required\.?)$/i;

/** Column name of a CSV cell, read from the first line of the text. */
function csvHeaderFor(text: string, lineText: string, index: number, lineStart: number): string | null {
  const firstLine = firstLineOf(text);
  if (!firstLine.includes(',') || firstLine === lineText) return null;
  const splitCsv = (s: string) => {
    const cells: { start: number; value: string }[] = [];
    let i = 0;
    while (i <= s.length) {
      let start = i;
      let value = '';
      if (s[i] === '"') { const end = s.indexOf('"', i + 1); value = s.slice(i + 1, end === -1 ? s.length : end); i = (end === -1 ? s.length : end + 1); start++; }
      else { const end = s.indexOf(',', i); value = s.slice(i, end === -1 ? s.length : end); i = end === -1 ? s.length : end; }
      cells.push({ start, value });
      if (s[i] === ',') i++; else break;
    }
    return cells;
  };
  const cells = splitCsv(lineText);
  const header = splitCsv(firstLine).map((c) => c.value.trim().toLowerCase());
  // Only a real table: at least 3 columns, and this row has the same shape as the header.
  if (header.length < 3 || cells.length !== header.length) return null;
  const offset = index - lineStart;
  let col = -1;
  cells.forEach((c, k) => { if (offset >= c.start) col = k; });
  return header[col] ?? null;
}

/** All column names of the table, if the text is a CSV with a header row. */
function csvHeaders(text: string): string[] {
  const cols = firstLineOf(text).split(',').map((c) => normHeader(c.replace(/"/g, '')));
  return cols.length >= 3 ? cols : [];
}

interface Rule {
  category: Category;
  label: string;
  re: RegExp;
  /** Which capture group holds the sensitive value (default whole match). */
  group?: number;
  check?: (value: string, ctx: { text: string; index: number; lineText: string; lineStart: number; match: RegExpMatchArray }) => boolean;
  /** Trim trailing punctuation from the captured value before checking and reporting. */
  trimPunct?: boolean;
}

const SECRET_WORD = '(?:password|passwd|passcode|pwd|pw|pass|api[_ -]?key|apikey|secret|access[_ -]?key|access[_ -]?token|auth[_ -]?token|token|client[_ -]?secret|private[_ -]?key)';

const RULES: Rule[] = [
  // ── Category 1 ──
  {
    category: 'cat1', label: 'credential',
    // A labelled secret: "password: hunter2", "DB_PASSWORD=…", "aws_secret_access_key = …".
    // The setting name may wrap the secret word (DB_PASSWORD, XERO_CLIENT_SECRET) but must not be a
    // setting *about* passwords (PASSWORD_MIN_LENGTH).
    // Keys may be quoted, as in JSON ("password": "…") or YAML (api_key: "…").
    re: new RegExp(`(?<![A-Za-z0-9])([A-Za-z0-9_.-]*?${SECRET_WORD}[A-Za-z0-9_]*)["']?\\s*[:=]\\s*["']?([^\\s"',;]{4,})`, 'gi'),
    group: 2,
    trimPunct: true,
    check: (v, { match }) => {
      const name = match[1] ?? '';
      // The secret word must be a whole part of the name (DB_PASSWORD, clientSecret), not part of
      // another word (Passport, Tokenizer).
      const parts = name.split(/[_.\-\s]+|(?<=[a-z])(?=[A-Z])/).map((p) => p.toLowerCase()).filter(Boolean);
      const whole = parts.some((p, i) =>
        ['password', 'passwd', 'passcode', 'pwd', 'pw', 'pass', 'secret', 'token', 'apikey', 'passphrase'].includes(p)
        || (p === 'key' && ['api', 'access', 'private', 'secret'].includes(parts[i - 1] ?? ''))
        || (p === 'token' && ['access', 'auth'].includes(parts[i - 1] ?? '')));
      if (!whole) return false;
      const rest = parts.filter((p) => !['password', 'passwd', 'passcode', 'pwd', 'pw', 'pass', 'secret', 'token', 'api', 'key', 'apikey', 'access', 'auth', 'client', 'private', 'aws', 'db'].includes(p)).join('_');
      if (CREDENTIAL_SETTING.test(rest)) return false;
      if (v.length < 4 || MASKED.test(v) || PLACEHOLDER.test(v)) return false;
      return true;
    },
  },
  {
    category: 'cat1', label: 'credential',
    // Secrets stated in prose: "the temporary password is Winter2026!fern".
    re: /\b(?:password|passcode|pin|passphrase)\s+(?:is|was|will be|has been set to|set to)\s+["']?([^\s"',;]{4,})/gi,
    group: 1,
    trimPunct: true,
    check: (v) => !MASKED.test(v) && !PLACEHOLDER.test(v) && !/^(?:required|unchanged|the|a|an|still|now|being|not|valid|strong|weak|correct|incorrect|expired|changed|reset)$/i.test(v),
  },
  { category: 'cat1', label: 'credential', re: /\bAKIA[0-9A-Z]{16}\b/g },
  // Bearer tokens in an Authorization header, and JWTs anywhere (three base64url segments, header starts eyJ).
  { category: 'cat1', label: 'credential', re: /\bBearer\s+([A-Za-z0-9._~+/-]{16,}=*)/g, group: 1 },
  { category: 'cat1', label: 'credential', re: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g },
  { category: 'cat1', label: 'credential', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { category: 'cat1', label: 'credential', re: /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/g },
  // The whole block, header to footer; a truncated block runs to the end of the text.
  { category: 'cat1', label: 'private key', re: /-----BEGIN ((?:[A-Z]+ )*)PRIVATE KEY-----[\s\S]*?(?:-----END \1PRIVATE KEY-----|$)/g },
  {
    category: 'cat1', label: 'payment card',
    // Sentence punctuation may follow the number ("…4242."), but not more digits ("4242.50").
    re: /(?<![\w.-])(?:\d[ -]?){12,18}\d(?![\w-]|[.,]\d)/g,
    check: (v) => {
      const d = v.replace(/[ -]/g, '');
      if (d.length < 13 || d.length > 19) return false;
      if (/^(\d)\1+$/.test(d)) return false;
      if (!/^[2-6]/.test(d)) return false; // Visa, Mastercard, Amex, Discover, UnionPay, Maestro ranges
      return luhn(d);
    },
  },
  {
    category: 'cat1', label: 'passport number',
    re: /(?<![\d])\d{9}(?!\d)/g,
    check: (_v, { text, index }) => /passport/i.test(text.slice(Math.max(0, index - 60), index + 60)),
  },

  // ── Category 2 ──
  {
    category: 'cat2', label: 'email',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    check: (v) => !isRoleMailbox(v),
  },
  {
    category: 'cat2', label: 'national insurance number',
    re: /\b(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g,
  },
  {
    category: 'cat2', label: 'IBAN',
    re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g,
    check: (v) => ibanValid(v),
  },
  {
    category: 'cat2', label: 'bank account',
    // Sort code then account number, on one line or the next (supplier emails, remittance advice).
    re: /\b\d{2}-\d{2}-\d{2}\b[^\d]{0,40}?\b\d{8}\b/g,
  },
  {
    category: 'cat2', label: 'bank account',
    // An 8-digit number explicitly labelled as an account number.
    re: /\b(?:account\s+(?:number|no\.?)|acc(?:t|ount)?\.?\s*no\.?|a\/c(?:\s*no\.?)?)\s*[:#]?\s*\d{8}\b/gi,
  },
  {
    category: 'cat2', label: 'phone number',
    // Personal UK numbers (07 mobile, 01/02 geographic, +44) and international +CC numbers.
    // Non-geographic business numbers (03xx, 08xx, 09xx) are not personal data.
    re: /(?<![\w£$€.])(?<!\d,)(?:\+44\s?(?:\(0\)\s?)?[127]|0[127])(?:[\s-]?\d){8,9}(?!\d|[.,]\d)|(?<![\w£$€])\+(?!44)[1-9]\d{0,2}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){2,4}(?!\d|[.,]\d)/g,
    check: (v) => { const n = v.replace(/\D/g, '').length; return n >= 10 && n <= 15; },
  },
  {
    category: 'cat2', label: 'home address',
    re: /\b(?:GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/g,
    check: (_v, { text, index, lineText, lineStart }) => {
      // A postcode column in a table of people (payroll, HR, customer lists) is a home address.
      const header = csvHeaderFor(text, lineText, index, lineStart);
      if (header !== null && POSTCODE_HEADER.test(normHeader(header))) {
        const cols = csvHeaders(text);
        return cols.some((c) => PERSON_HEADER.test(c)) && !cols.some((c) => /^(?:supplier|vendor|company|business|payee|merchant|branch|site|store)\b/.test(c));
      }
      // The address is on this line, or (for a letter's address block) on the few lines above.
      const looksLikeStreet = (s: string) => ADDRESS_WORDS.test(s) && /\b\d{1,4}[A-Za-z]?\s+[A-Z][a-z]+/.test(s);
      if (BUSINESS_ADDRESS.test(lineText)) return false;
      // Letterhead: an organisation's name on one of the two lines above, and nothing marking it as a home.
      const above = text.slice(0, lineStart).split('\n').slice(-3, -1);
      if (above.some((l) => ORG_NAME_LINE.test(l)) && !/\b(?:home|residential|current address|lives at|personal)\b/i.test(lineText)) return false;
      if (looksLikeStreet(lineText)) return true;
      const before = text.slice(0, lineStart).split('\n').slice(-4, -1);
      const isBlockLine = lineText.trim().length <= 10; // the postcode stands alone on its line
      return isBlockLine && before.some(looksLikeStreet) && !before.some((l) => BUSINESS_ADDRESS.test(l));
    },
  },
  {
    category: 'cat2', label: 'date of birth',
    re: new RegExp(`\\b(?:\\d{1,2}[\\/.-]\\d{1,2}[\\/.-](?:19|20)?\\d{2}|\\d{1,2}(?:st|nd|rd|th)? ${MONTHS},? (?:19|20)\\d{2}|(?:19|20)\\d{2}-\\d{2}-\\d{2})\\b`, 'gi'),
    check: (_v, { text, index, lineText, lineStart }) => {
      // A CSV column headed dob / date of birth.
      const header = csvHeaderFor(text, lineText, index, lineStart);
      if (header !== null) return DOB_HEADER.test(normHeader(header)) || DOB_LABEL.test(normHeader(header));
      // Otherwise the nearest preceding label on the line must be a date-of-birth label:
      // "DOB 02/11/1971" yes; "Date of birth: 1979-03-14   Appointed: 2016-05-01" only for the first date.
      const prefix = text.slice(Math.max(lineStart, index - 40), index);
      // The trailing "0" stands in for the date itself so "born 14 March" ends in a digit.
      const labels = [...`${prefix}0`.matchAll(/([A-Za-z][A-Za-z. ]{1,24})(?::|\s(?=\d))/g)];
      const nearest = labels.at(-1);
      if (!DOB_LABEL.test(nearest?.[1] ?? prefix)) return false;
      // No other date between the label and this one ("DOB: 1979-03-14, 2016-05-01" flags only the first).
      const afterLabel = nearest ? prefix.slice(nearest.index + (nearest[1]?.length ?? 0)) : prefix;
      return !ANY_DATE.test(afterLabel);
    },
  },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Detect restricted data in text. `terms` are owner-defined sensitive terms (e.g. a deal codename). */
export function detect(text: string, terms: SensitiveTerm[] = []): Hit[] {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const lineTextAt = (idx: number) => {
    const l = lineOf(idx);
    const next = lineStarts[l + 1];
    return text.slice(lineStarts[l] ?? 0, next === undefined ? text.length : next - 1);
  };

  const hits: Hit[] = [];
  const rules: Rule[] = [
    ...terms.filter((t) => t.term.trim().length >= 3).map((t) => ({ category: t.category, label: 'sensitive term', re: new RegExp(escapeRe(t.term.trim()), 'gi') })),
    ...RULES,
  ];
  for (const r of rules) {
    r.re.lastIndex = 0;
    for (const m of text.matchAll(r.re)) {
      const raw = r.group ? m[r.group] : m[0];
      if (!raw) continue;
      const index = r.group ? m.index + m[0].lastIndexOf(raw) : m.index;
      // Drop trailing punctuation, but keep "!" or "?" that is part of a password ("Winter2026!").
      const value = r.trimPunct
        ? raw.replace(/[).,;:!?\]]+$/, (p) => (/[!?]/.test(p) && raw.length - p.length >= 4 ? p.replace(/[).,;:\]]+$/, '') : ''))
        : raw;
      if (!value) continue;
      const lineStart = lineStarts[lineOf(index)] ?? 0;
      if (r.check && !r.check(value, { text, index, lineText: lineTextAt(index), lineStart, match: m })) continue;
      hits.push({ category: r.category, label: r.label, match: redactValue(value), index, length: value.length, line: lineOf(index) + 1 });
    }
  }
  return mergeHits(text, hits);
}

const severity = (c: Category) => (c === 'cat1' ? 2 : 1);

/**
 * Merge overlapping hits into one hit per covered interval, so redaction never leaves part of a value
 * exposed. The merged hit takes the stricter category and the label of its strictest, longest member.
 */
export function mergeHits(text: string, hits: readonly Hit[]): Hit[] {
  const sorted = [...hits].sort((a, b) => a.index - b.index || b.length - a.length);
  const groups: Hit[][] = [];
  let groupEnd = -1;
  for (const h of sorted) {
    const group = groups.at(-1);
    if (group && h.index < groupEnd) group.push(h);
    else groups.push([h]);
    groupEnd = Math.max(groupEnd, h.index + h.length);
  }
  return groups.map((group) => {
    const start = Math.min(...group.map((h) => h.index));
    const end = Math.max(...group.map((h) => h.index + h.length));
    const lead = group.reduce((best, h) => {
      const order = severity(h.category) - severity(best.category) || h.length - best.length;
      return order > 0 ? h : best;
    });
    return { ...lead, index: start, length: end - start, match: redactValue(text.slice(start, end)), line: Math.min(...group.map((h) => h.line)) };
  });
}

/** Replace each detected value with "[redacted: label]". Overlapping hits are merged first. */
export function redact(text: string, hits: readonly Hit[]): string {
  let out = text;
  for (const h of mergeHits(text, hits).sort((a, b) => b.index - a.index)) {
    out = out.slice(0, h.index) + `[redacted: ${h.label}]` + out.slice(h.index + h.length);
  }
  return out;
}
