/**
 * Precision / recall evaluation of the restricted-data detectors against labelled corpora.
 *
 *   npx tsx test/eval-detectors.ts [dir ...]     (default: test/corpus, test/corpus-heldout-v1, test/corpus-heldout-v2)
 *
 * A prediction matches a label when the labels are equal and the spans overlap; each label is
 * matched at most once. Exits non-zero if the TUNING corpus (test/corpus) falls below the targets:
 * overall precision >= 0.95, overall recall >= 0.95, and recall >= 0.90 for every label with at
 * least 5 instances. Held-out corpora are reported but never gate the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from '../src/detectors';

interface Span { label: string; category: string; text: string; start: number; end: number }
interface Counts { tp: number; fp: number; fn: number }

const here = path.dirname(fileURLToPath(import.meta.url));
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(here, 'corpus'), path.join(here, 'corpus-heldout-v1'), path.join(here, 'corpus-heldout-v2')];

const pct = (x: number) => (Number.isNaN(x) ? '  n/a' : `${(x * 100).toFixed(1).padStart(5)}%`);
const prf = (c: Counts) => {
  const p = c.tp / (c.tp + c.fp);
  const r = c.tp / (c.tp + c.fn);
  return { p, r, f: (2 * p * r) / (p + r) };
};

let gateFailed = false;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) { console.log(`(skipping ${path.relative(process.cwd(), dir)}: not found)`); continue; }
  const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.labels.json')).sort();
  const perLabel = new Map<string, Counts>();
  const bump = (label: string, k: keyof Counts) => {
    if (!perLabel.has(label)) perLabel.set(label, { tp: 0, fp: 0, fn: 0 });
    perLabel.get(label)![k]++;
  };
  const errors: string[] = [];

  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const { spans } = JSON.parse(fs.readFileSync(path.join(dir, `${f}.labels.json`), 'utf8')) as { spans: Span[] };
    const preds = detect(text);
    const used = new Set<number>();
    for (const p of preds) {
      const pEnd = p.index + p.length;
      const i = spans.findIndex((s, k) => !used.has(k) && s.label === p.label && p.index < s.end && s.start < pEnd);
      const lineNo = text.slice(0, p.index).split('\n').length;
      if (i >= 0) { used.add(i); bump(p.label, 'tp'); }
      else { bump(p.label, 'fp'); errors.push(`  FP ${f}:${lineNo} ${p.label} "${text.slice(p.index, pEnd)}"`); }
    }
    spans.forEach((s, k) => {
      if (used.has(k)) return;
      bump(s.label, 'fn');
      errors.push(`  FN ${f}:${text.slice(0, s.start).split('\n').length} ${s.label} "${s.text}"`);
    });
  }

  const total: Counts = { tp: 0, fp: 0, fn: 0 };
  console.log(`\n${path.relative(process.cwd(), dir)} (${files.length} documents)`);
  console.log(`${'label'.padEnd(28)} ${'n'.padStart(4)} ${'prec'.padStart(6)} ${'recall'.padStart(6)} ${'F1'.padStart(6)}`);
  for (const [label, c] of [...perLabel].sort()) {
    const { p, r, f } = prf(c);
    total.tp += c.tp; total.fp += c.fp; total.fn += c.fn;
    console.log(`${label.padEnd(28)} ${String(c.tp + c.fn).padStart(4)} ${pct(p)} ${pct(r)} ${pct(f)}`);
  }
  const t = prf(total);
  console.log(`${'OVERALL (micro)'.padEnd(28)} ${String(total.tp + total.fn).padStart(4)} ${pct(t.p)} ${pct(t.r)} ${pct(t.f)}`);
  console.log(errors.length ? `Errors (${errors.length}):\n${errors.join('\n')}` : 'No errors.');

  if (path.basename(dir) === 'corpus') {
    const weak = [...perLabel].filter(([, c]) => c.tp + c.fn >= 5 && prf(c).r < 0.9).map(([l]) => l);
    const ok = t.p >= 0.95 && t.r >= 0.95 && weak.length === 0;
    console.log(ok ? 'GATE: pass' : `GATE: FAIL${t.p < 0.95 ? ' (precision)' : ''}${t.r < 0.95 ? ' (recall)' : ''}${weak.length ? ` (weak labels: ${weak.join(', ')})` : ''}`);
    if (!ok) gateFailed = true;
  }
}

process.exit(gateFailed ? 1 : 0);
