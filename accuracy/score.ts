/**
 * Precision / recall evaluation of the restricted-data detectors against labelled corpora.
 *
 *   npm run accuracy -- [dir ...]     (default: accuracy/corpus, accuracy/corpus-heldout-v1, -v2, -v3)
 *
 * Recall is per labelled span: a span counts only when one prediction with the same label covers it
 * end to end, because redacting part of a password or address still leaks the rest. A partly covered
 * span is a miss and is listed as PARTIAL. Precision is per prediction: a prediction is correct when it
 * overlaps a labelled span with the same label.
 *
 * Exits non-zero if a GATED corpus (tuning, and the held-out v1 and v2 regression sets) falls below
 * the targets: overall precision >= 0.95, overall recall >= 0.95, and recall >= 0.90 for every label
 * with at least 5 instances. Held-out v3 is reported but never gates the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from '../src/detectors.js';

const GATED = new Set(['corpus', 'corpus-heldout-v1', 'corpus-heldout-v2']);

interface Span { label: string; category: string; text: string; start: number; end: number }
/** tp / fp count predictions; covered / fn count labelled spans. */
interface Counts { tp: number; fp: number; covered: number; fn: number }

const here = path.dirname(fileURLToPath(import.meta.url));
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(here, 'corpus'), path.join(here, 'corpus-heldout-v1'), path.join(here, 'corpus-heldout-v2'), path.join(here, 'corpus-heldout-v3')];

const pct = (x: number) => (Number.isNaN(x) ? '  n/a' : `${(x * 100).toFixed(1).padStart(5)}%`);
const prf = (c: Counts) => {
  const p = c.tp / (c.tp + c.fp);
  const r = c.covered / (c.covered + c.fn);
  return { p, r, f: (2 * p * r) / (p + r) };
};

let gateFailed = false;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) { console.log(`(skipping ${path.relative(process.cwd(), dir)}: not found)`); continue; }
  const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.labels.json')).sort();
  const perLabel = new Map<string, Counts>();
  const bump = (label: string, k: keyof Counts) => {
    const counts = perLabel.get(label) ?? { tp: 0, fp: 0, covered: 0, fn: 0 };
    counts[k]++;
    perLabel.set(label, counts);
  };
  const errors: string[] = [];

  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const { spans } = JSON.parse(fs.readFileSync(path.join(dir, `${f}.labels.json`), 'utf8')) as { spans: Span[] };
    const preds = detect(text);
    for (const p of preds) {
      const pEnd = p.index + p.length;
      if (spans.some((sp) => sp.label === p.label && p.index < sp.end && sp.start < pEnd)) { bump(p.label, 'tp'); continue; }
      bump(p.label, 'fp');
      errors.push(`  FP ${f}:${text.slice(0, p.index).split('\n').length} ${p.label} "${text.slice(p.index, pEnd)}"`);
    }
    for (const sp of spans) {
      const same = preds.filter((p) => p.label === sp.label && p.index < sp.end && sp.start < p.index + p.length);
      if (same.some((p) => p.index <= sp.start && p.index + p.length >= sp.end)) { bump(sp.label, 'covered'); continue; }
      bump(sp.label, 'fn');
      const kind = same.length ? 'PARTIAL' : 'FN';
      errors.push(`  ${kind} ${f}:${text.slice(0, sp.start).split('\n').length} ${sp.label} "${sp.text}"`);
    }
  }

  const total: Counts = { tp: 0, fp: 0, covered: 0, fn: 0 };
  console.log(`\n${path.relative(process.cwd(), dir)} (${files.length} documents)`);
  console.log(`${'label'.padEnd(28)} ${'n'.padStart(4)} ${'prec'.padStart(6)} ${'recall'.padStart(6)} ${'F1'.padStart(6)}`);
  for (const [label, c] of [...perLabel].sort()) {
    const { p, r, f } = prf(c);
    total.tp += c.tp; total.fp += c.fp; total.covered += c.covered; total.fn += c.fn;
    console.log(`${label.padEnd(28)} ${String(c.covered + c.fn).padStart(4)} ${pct(p)} ${pct(r)} ${pct(f)}`);
  }
  const t = prf(total);
  console.log(`${'OVERALL (micro)'.padEnd(28)} ${String(total.covered + total.fn).padStart(4)} ${pct(t.p)} ${pct(t.r)} ${pct(t.f)}`);
  console.log(errors.length ? `Errors (${errors.length}):\n${errors.join('\n')}` : 'No errors.');

  if (GATED.has(path.basename(dir))) {
    const weak = [...perLabel].filter(([, c]) => c.covered + c.fn >= 5 && prf(c).r < 0.9).map(([l]) => l);
    const ok = t.p >= 0.95 && t.r >= 0.95 && weak.length === 0;
    console.log(ok ? 'GATE: pass' : `GATE: FAIL${t.p < 0.95 ? ' (precision)' : ''}${t.r < 0.95 ? ' (recall)' : ''}${weak.length ? ` (weak labels: ${weak.join(', ')})` : ''}`);
    if (!ok) gateFailed = true;
  }
}

process.exit(gateFailed ? 1 : 0);
