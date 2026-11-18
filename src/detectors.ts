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

export type DetCategory = 'cat1' | 'cat2';

export interface SensitiveTerm { term: string; category: DetCategory }

export interface Hit {
  category: DetCategory;
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
const MONTHS = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

interface Rule {
  category: DetCategory;
  label: string;
  re: RegExp;
  /** Which capture group holds the sensitive value (default whole match). */
  group?: number;
  check?: (value: string, ctx: { text: string; index: number; lineText: string }) => boolean;
}

const RULES: Rule[] = [
  // ── Category 1 ──
  {
    category: 'cat1', label: 'credential',
    // A labelled secret: "password: hunter2", "api_key=…", "pw: …". Needs a separator and a value.
    re: /(?<![A-Za-z])(?:password|passwd|passcode|pwd|pw|pass|api[_ -]?key|secret(?:[_ -]?key)?|access[_ -]?token|auth[_ -]?token|token|client[_ -]?secret)(?![A-Za-z])\s*[:=]\s*["']?([^\s"',;]{4,})/gi,
    group: 1,
    check: (v) => !/^(?:\*+|x+|<[^>]*>|\$\{?[A-Z_]+\}?|changeme|required|none|null|n\/a|tbc|tbd)$/i.test(v),
  },
  { category: 'cat1', label: 'credential', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { category: 'cat1', label: 'credential', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { category: 'cat1', label: 'credential', re: /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/g },
  { category: 'cat1', label: 'private key', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  {
    category: 'cat1', label: 'payment card',
    re: /(?<![\w.-])(?:\d[ -]?){12,18}\d(?![\w.-])/g,
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
  { category: 'cat2', label: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g },
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
    re: /\b\d{2}-\d{2}-\d{2}\b[^\n\d]{0,30}\b\d{8}\b/g,
  },
  {
    category: 'cat2', label: 'phone number',
    // UK numbers (07…, 01…, 02…, 03…, +44 …) and international +CC numbers.
    re: /(?<![\w£$€.,])(?:\+44\s?(?:\(0\)\s?)?|0)[1237](?:[\s-]?\d){8,9}(?!\d|[.,]\d)|(?<![\w£$€])\+(?!44)[1-9]\d{0,2}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){2,4}(?!\d|[.,]\d)/g,
    check: (v) => { const n = v.replace(/\D/g, '').length; return n >= 10 && n <= 15; },
  },
  {
    category: 'cat2', label: 'home address',
    re: /\b(?:GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/g,
    check: (_v, { lineText }) => ADDRESS_WORDS.test(lineText) && /\b\d{1,4}[A-Za-z]?\s+[A-Z][a-z]+/.test(lineText),
  },
  {
    category: 'cat2', label: 'date of birth',
    re: new RegExp(`\\b(?:\\d{1,2}[\\/.-]\\d{1,2}[\\/.-](?:19|20)?\\d{2}|\\d{1,2}(?:st|nd|rd|th)? ${MONTHS},? (?:19|20)\\d{2}|(?:19|20)\\d{2}-\\d{2}-\\d{2})\\b`, 'gi'),
    check: (_v, { text, index }) => /\b(?:dob|d\.o\.b\.?|date of birth|born|birth ?date)\b/i.test(text.slice(Math.max(0, index - 40), index)),
  },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Detect restricted data in text. `terms` are owner-defined sensitive terms (e.g. a deal codename). */
export function detect(text: string, terms: SensitiveTerm[] = []): Hit[] {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const lineTextAt = (idx: number) => {
    const l = lineOf(idx);
    const end = l + 1 < lineStarts.length ? lineStarts[l + 1] - 1 : text.length;
    return text.slice(lineStarts[l], end);
  };

  const hits: Hit[] = [];
  const rules: Rule[] = [
    ...terms.filter((t) => t.term.trim().length >= 3).map((t) => ({ category: t.category, label: 'sensitive term', re: new RegExp(escapeRe(t.term.trim()), 'gi') })),
    ...RULES,
  ];
  for (const r of rules) {
    r.re.lastIndex = 0;
    for (const m of text.matchAll(r.re)) {
      const value = r.group ? m[r.group] : m[0];
      if (!value) continue;
      const index = r.group ? (m.index ?? 0) + m[0].indexOf(value) : m.index ?? 0;
      if (r.check && !r.check(value, { text, index, lineText: lineTextAt(index) })) continue;
      hits.push({ category: r.category, label: r.label, match: redactValue(value), index, length: value.length, line: lineOf(index) + 1 });
    }
  }
  // Drop hits fully inside an earlier, longer hit (e.g. digits of an IBAN read as a phone).
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const out: Hit[] = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && h.index >= prev.index && h.index + h.length <= prev.index + prev.length) {
      if (h.category === 'cat1' && prev.category === 'cat2') out[out.length - 1] = h; // keep the stricter label
      continue;
    }
    out.push(h);
  }
  return out;
}

/** Replace each detected value with "[redacted: label]". */
export function redact(text: string, hits: Hit[]): string {
  let out = text;
  for (const h of [...hits].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, h.index) + `[redacted: ${h.label}]` + out.slice(h.index + h.length);
  }
  return out;
}
