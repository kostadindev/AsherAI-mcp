/**
 * Shared helpers for the detector evaluation corpus.
 *
 * Documents are authored once with inline span markup: [[label|value]]. `materialise` strips the
 * markup and returns the plain text plus exact character offsets for every restricted span, so the
 * labels can never drift from the text.
 */
import fs from 'node:fs';
import path from 'node:path';

export const CATEGORY: Record<string, 'cat1' | 'cat2'> = {
  'credential': 'cat1',
  'private key': 'cat1',
  'payment card': 'cat1',
  'passport number': 'cat1',
  'email': 'cat2',
  'phone number': 'cat2',
  'national insurance number': 'cat2',
  'IBAN': 'cat2',
  'bank account': 'cat2',
  'home address': 'cat2',
  'date of birth': 'cat2',
};

export interface Span { label: string; category: 'cat1' | 'cat2'; text: string; start: number; end: number }
export interface Doc { file: string; body: string }

export function materialise(body: string): { text: string; spans: Span[] } {
  const spans: Span[] = [];
  let text = '';
  const re = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
  let last = 0;
  for (const m of body.matchAll(re)) {
    text += body.slice(last, m.index);
    const [whole, label = '', value = ''] = m;
    const category = CATEGORY[label];
    if (!category) throw new Error(`Unknown label "${label}"`);
    spans.push({ label, category, text: value, start: text.length, end: text.length + value.length });
    text += value;
    last = m.index + whole.length;
  }
  text += body.slice(last);
  return { text, spans };
}

/** Write each document and its sibling .labels.json into `dir`. */
export function writeCorpus(dir: string, docs: Doc[]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const d of docs) {
    const { text, spans } = materialise(d.body.replace(/^\n/, ''));
    fs.writeFileSync(path.join(dir, d.file), text);
    fs.writeFileSync(path.join(dir, `${d.file}.labels.json`), JSON.stringify({ spans }, null, 2) + '\n');
  }
}
