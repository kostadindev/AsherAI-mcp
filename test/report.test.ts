import { describe, expect, it } from 'vitest';
import { renderReport, stewardship } from '../src/report.js';
import { cleanNote, MAX_NOTE_LENGTH, scanText } from '../src/scan.js';
import { freshState, type GatewayEvent, type State } from '../src/state.js';
import { first } from './helpers.js';

const ev = (e: Omit<GatewayEvent, 't'>): GatewayEvent => ({ t: '2026-11-18T10:00:00.000Z', ...e });
const leak = (category: 'cat1' | 'cat2', label = 'email', channel: GatewayEvent['channel'] = 'ai-opened') =>
  ev({ type: 'leak', category, label, channel });

describe('stewardship', () => {
  it('is Full with no leaks', () => {
    expect(stewardship([ev({ type: 'ai-open', fileId: 'a' })]).score).toBe('Full');
  });

  it('is Partial with Category 2 only', () => {
    expect(stewardship([leak('cat2'), leak('cat2')]).score).toBe('Partial');
  });

  it('is Zero once any Category 1 data reaches the AI', () => {
    const result = stewardship([leak('cat2'), leak('cat1', 'credential')]);
    expect(result.score).toBe('Zero');
    expect(result.leaks).toHaveLength(2);
  });
});

describe('renderReport', () => {
  const state = (events: GatewayEvent[]): State => ({ ...freshState(), startedAt: '2026-11-18T09:00:00.000Z', events });

  it('reports an empty session', () => {
    const md = renderReport(state([]), 'Workspace mode.');
    expect(md).toContain('Session started 2026-11-18T09:00:00.000Z. Workspace mode.');
    expect(md).toContain('## Data stewardship: Full');
    expect(md).toContain('## Files the AI read (0)\n- none');
    expect(md).toContain('### Check the output: 0 did, 0 after a prompt, 0 missed\n- no moments recorded');
    expect(md).not.toContain('| Category |');
  });

  it('counts leaks by category, label and channel', () => {
    const md = renderReport(state([leak('cat2'), leak('cat2'), leak('cat1', 'credential', 'ai-answer')]), '');
    expect(md).toContain('| Category 2 | email | opened by the AI | 2 |');
    expect(md).toContain('| Category 1 | credential | in an AI answer or pasted text | 1 |');
  });

  it('lists each file read once and counts refusals', () => {
    const md = renderReport(state([
      ev({ type: 'ai-open', fileId: 'a.csv' }), ev({ type: 'ai-open', fileId: 'a.csv' }), ev({ type: 'ai-open', fileId: 'b.csv' }),
      ev({ type: 'refused', fileId: 'c.txt' }),
    ]), '');
    expect(md).toContain('## Files the AI read (2)\n- a.csv\n- b.csv');
    expect(md).toContain('1 read(s) refused by the access policy.');
  });

  it('counts habit outcomes and shows the last three notes', () => {
    const moments = ['one', 'two', 'three', 'four'].map((note, i) =>
      ev({ type: 'moment', habit: 'protect', outcome: i === 0 ? 'missed' : 'prompted', note }));
    const md = renderReport(state([...moments, ev({ type: 'moment', habit: 'check', outcome: 'did', note: 'checked' })]), '');
    expect(md).toContain('### Protect the data: 0 did, 3 after a prompt, 1 missed\n- prompted: two\n- prompted: three\n- prompted: four');
    expect(md).toContain('### Check the output: 1 did, 0 after a prompt, 0 missed\n- did: checked');
  });
});

describe('scanText', () => {
  it('uses owner terms and generic detectors', () => {
    const hits = scanText('Kestrel update to priya@example.co.uk', { terms: [{ term: 'Kestrel', category: 'cat1' }], scenario: false });
    expect(hits.map((h) => h.label).sort()).toEqual(['email', 'sensitive term']);
  });

  it('adds planted scenario markers only in scenario mode', () => {
    const text = 'Lunch with\nDaniel Mercer today';
    expect(scanText(text, { terms: [], scenario: false })).toEqual([]);
    const hit = first(scanText(text, { terms: [], scenario: true }));
    expect(hit).toMatchObject({ category: 'cat2', line: 2, match: 'Da***' });
    expect(hit.label).toMatch(/^restricted data from /);
  });
});

describe('cleanNote', () => {
  it('redacts restricted values and truncates', () => {
    const note = cleanNote(`Pasted JR 48 31 22 C ${'x'.repeat(400)}`, { terms: [], scenario: false });
    expect(note).toContain('[redacted: national insurance number]');
    expect(note).not.toContain('JR 48');
    expect(note).toHaveLength(MAX_NOTE_LENGTH);
  });
});
