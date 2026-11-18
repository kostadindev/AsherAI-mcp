import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POLICY_FILE } from '../src/config.js';
import { savePolicy } from '../src/workspace.js';
import { connect, first, makeConfig, tempDir } from './helpers.js';

const RAW = ['JR 48 31 22 C', 'PK 19 60 47 A', 'priya.raman@example.co.uk', '07700 900123', '4111 1111 1111 1111', 'Kingfisher!2025', 'Project Kestrel'];

function workspace() {
  const root = tempDir('trialrun-ws-');
  const outside = tempDir('trialrun-outside-');
  writeFileSync(join(outside, 'secret.txt'), 'outside the workspace');
  mkdirSync(join(root, 'finance'));
  writeFileSync(join(root, 'notes.md'), '# Client call\nSpoke to Priya, priya.raman@example.co.uk, mobile 07700 900123.\nAgreed the Q4 timetable.\n');
  writeFileSync(join(root, 'finance', 'payroll.csv'), 'name,ni_number,salary\nDaniel Mercer,JR 48 31 22 C,75000\nAisha Khalid,PK 19 60 47 A,48000\n');
  writeFileSync(join(root, 'finance', 'budget.csv'), 'line,2026\nRevenue,1300000\nRent,48000\nInsurance,9600\n');
  writeFileSync(join(root, 'credentials.txt'), 'portal user: admin\npassword: Kingfisher!2025\n');
  writeFileSync(join(root, 'deal.md'), 'Board update: Project Kestrel is on track for January.\n');
  writeFileSync(join(root, 'report.pdf'), '%PDF-1.7');
  symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'));
  savePolicy(root, { block: ['credentials.txt'], sensitive_terms: [{ term: 'Project Kestrel', category: 'cat1' }] });
  return { root, config: makeConfig({ workspace: root, statePath: join(root, '.trialrun-session.json') }) };
}

describe('workspace mode', () => {
  it('lists visible files, hiding blocked, gateway and escaping files', async () => {
    const { config } = workspace();
    const gw = await connect(config);
    const listing = await gw.json<{ files: { path: string }[]; hiddenByPolicy: number }>('list_files');
    expect(listing.files.map((f) => f.path)).toEqual(['deal.md', 'finance/budget.csv', 'finance/payroll.csv', 'notes.md', 'report.pdf']);
    expect(listing.hiddenByPolicy).toBe(1);
    const finance = await gw.json<{ files: { path: string }[] }>('list_files', { prefix: './finance/' });
    expect(finance.files.map((f) => f.path)).toEqual(['finance/budget.csv', 'finance/payroll.csv']);
    await gw.close();
  });

  it('reads a clean file without flags', async () => {
    const { config } = workspace();
    const gw = await connect(config);
    const budget = await gw.text('read_file', { path: 'finance/budget.csv' });
    expect(budget).toMatch(/^# finance\/budget\.csv \(lines 1-5 of 5\)/);
    expect(budget).not.toContain('[Gateway');
    await gw.close();
  });

  it('flags restricted data and logs it by label with the file line', async () => {
    const { config } = workspace();
    const gw = await connect(config);
    const payroll = await gw.text('read_file', { path: 'finance/payroll.csv' });
    expect(payroll).toContain('[Gateway: 2 restricted item(s) flagged: national insurance number]');
    const audit = await gw.json<{ events: { type: string; line?: number; label?: string }[]; dataStewardship: { score: string; restrictedSources: unknown[] } }>('get_audit_log');
    expect(audit.events.filter((e) => e.type === 'leak').map((e) => e.line)).toEqual([2, 3]);
    expect(audit.dataStewardship).toMatchObject({ score: 'Partial', restrictedSources: [{ file: 'finance/payroll.csv', restriction: 'cat2', channels: ['ai-opened'] }] });
    await gw.close();
  });

  it('reads a line range and reports it', async () => {
    const { config } = workspace();
    const gw = await connect(config);
    const lines = await gw.text('read_file', { path: 'finance/budget.csv', start_line: 2, end_line: 3 });
    expect(lines).toBe('# finance/budget.csv (lines 2-3 of 5)\nRevenue,1300000\nRent,48000');
    await gw.close();
  });

  it.each([
    ['credentials.txt', 'blocked by the workspace policy'],
    ['../outside/secret.txt', 'may not contain ".."'],
    ['escape.txt', 'outside the workspace'],
    ['report.pdf', 'not parsed yet'],
    [POLICY_FILE, 'blocked by the workspace policy'],
    ['missing.txt', 'No such file'],
  ])('refuses %s', async (path, message) => {
    const { config } = workspace();
    const gw = await connect(config);
    const result = await gw.call('read_file', { path });
    expect(result.isError).toBe(true);
    expect(first(result.content).text).toContain(message);
    await gw.close();
  });

  it('redacts in place in enforce mode, including owner terms', async () => {
    const { root, config } = workspace();
    savePolicy(root, { block: ['credentials.txt'], sensitive_terms: [{ term: 'Project Kestrel', category: 'cat1' }], mode: 'enforce' });
    const gw = await connect(config);
    const notes = await gw.text('read_file', { path: 'notes.md' });
    expect(notes).toContain('[redacted: email]');
    expect(notes).toContain('[redacted: phone number]');
    expect(notes).toContain('restricted item(s) redacted');
    expect(await gw.text('read_file', { path: 'deal.md' })).toContain('[redacted: sensitive term]');
    expect(await gw.json<{ mode: string; sensitiveTerms: number }>('get_access_policy')).toMatchObject({ mode: 'enforce', sensitiveTerms: 1 });
    await gw.close();
  });

  it('never stores or reports raw restricted values', async () => {
    const { config } = workspace();
    const gw = await connect(config);
    await gw.text('read_file', { path: 'notes.md' });
    await gw.text('read_file', { path: 'finance/payroll.csv' });
    await gw.text('read_file', { path: 'deal.md' });
    await gw.text('check_text', { text: 'Pay with 4111 1111 1111 1111 please' });
    await gw.text('record_moment', { habit: 'protect', outcome: 'missed', note: 'Pasted rows with JR 48 31 22 C and priya.raman@example.co.uk.' });
    await gw.text('record_moment', { habit: 'check', outcome: 'did', note: 'Verified rent against the budget.' });
    const report = await gw.text('get_report');
    expect(report).toContain('## Data stewardship: Zero');
    expect(report).toContain('Workspace mode.');
    expect(report).toContain('### Check the output: 1 did');
    const stored = readFileSync(config.statePath, 'utf8');
    for (const raw of RAW) {
      expect(report).not.toContain(raw);
      expect(stored).not.toContain(raw);
    }
    await gw.close();
  });
});
