import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POLICY_FILE } from '../src/config.js';
import { effectiveMode } from '../src/gateway.js';
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
  return { root, config: makeConfig({ workspace: root, statePath: join(root, '.trialrun-session.jsonl') }) };
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
    expect(notes).not.toContain('priya.raman@example.co.uk');
    expect(notes).not.toContain('07700 900123');
    const deal = await gw.text('read_file', { path: 'deal.md' });
    expect(deal).toContain('[redacted: sensitive term]');
    expect(deal).not.toContain('Kestrel');
    expect(await gw.json<{ mode: string; sensitiveTerms: number }>('get_access_policy')).toMatchObject({ mode: 'enforce', sensitiveTerms: 1 });
    expect((await gw.json<{ dataStewardship: { score: string } }>('get_audit_log')).dataStewardship.score).toBe('Full');
    await gw.close();
  });

  it('detects on the whole file when reading a line range', async () => {
    const { root, config } = workspace();
    writeFileSync(join(root, 'staff.csv'), 'name,start_date,date_of_birth,postcode\nLeah Morgan,2025-02-03,1994-07-12,CB4 2QW\n');
    const gw = await connect(config);
    const row = await gw.text('read_file', { path: 'staff.csv', start_line: 2, end_line: 2 });
    expect(row).toContain('date of birth');
    const audit = await gw.json<{ events: { type: string; line?: number }[] }>('get_audit_log');
    expect(audit.events.filter((e) => e.type === 'leak').map((e) => e.line)).toEqual([2, 2]);
    await gw.close();
  });

  it('redacts contextual data in a line range in enforce mode', async () => {
    const { root, config } = workspace();
    writeFileSync(join(root, 'staff.csv'), 'name,start_date,date_of_birth,postcode\nLeah Morgan,2025-02-03,1994-07-12,CB4 2QW\n');
    savePolicy(root, { block: [], sensitive_terms: [], mode: 'enforce' });
    const gw = await connect(config);
    const row = await gw.text('read_file', { path: 'staff.csv', start_line: 2, end_line: 2 });
    expect(row).not.toContain('1994-07-12');
    expect(row).not.toContain('CB4 2QW');
    await gw.close();
  });

  it('in enforce mode records findings as withheld and keeps the score Full', async () => {
    const { root, config } = workspace();
    savePolicy(root, { block: [], sensitive_terms: [], mode: 'enforce' });
    const gw = await connect(config);
    const creds = await gw.text('read_file', { path: 'credentials.txt' });
    expect(creds).not.toContain('Kingfisher!2025');
    const audit = await gw.json<{ events: { type: string }[]; dataStewardship: { score: string } }>('get_audit_log');
    expect(audit.dataStewardship.score).toBe('Full');
    expect(audit.events.some((e) => e.type === 'withheld')).toBe(true);
    expect(audit.events.some((e) => e.type === 'leak')).toBe(false);
    expect(await gw.text('get_report')).toContain('withheld');
    await gw.close();
  });

  it.each([
    ['null policy', 'null'],
    ['unparseable policy', '{ nope'],
  ])('fails closed on a %s', async (_name, body) => {
    const { root, config } = workspace();
    writeFileSync(join(root, POLICY_FILE), body);
    const gw = await connect(config);
    const read = await gw.call('read_file', { path: 'notes.md' });
    expect(read.isError).toBe(true);
    expect(first(read.content).text).toContain('policy');
    expect((await gw.call('list_files')).isError).toBe(true);
    expect((await gw.call('get_access_policy')).isError).toBe(true);
    expect(effectiveMode({ ...config, mode: 'monitor' })).toBe('enforce');
    await gw.close();
  });

  it('never serves hidden files, internal symlinks to blocked files, or a custom session log', async () => {
    const { root } = workspace();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.env'), 'API_KEY=abcd1234efgh5678\n');
    writeFileSync(join(root, '.git', 'config'), '[remote]\n');
    symlinkSync(join(root, 'credentials.txt'), join(root, 'creds-alias.txt'));
    const config = makeConfig({ workspace: root, statePath: join(root, 'audit.json') });
    const gw = await connect(config);
    await gw.text('read_file', { path: 'notes.md' });
    for (const path of ['.env', '.git/config', 'creds-alias.txt', 'audit.json']) {
      expect((await gw.call('read_file', { path })).isError, path).toBe(true);
    }
    const listing = await gw.json<{ files: { path: string }[] }>('list_files');
    expect(listing.files.map((f) => f.path)).not.toContain('audit.json');
    expect(listing.files.map((f) => f.path)).not.toContain('creds-alias.txt');
    await gw.close();
  });

  it('describes workspace files by path, not by scenario metadata', async () => {
    const { root, config } = workspace();
    writeFileSync(join(root, 'logins'), 'password: Kingfisher!2025\n');
    const gw = await connect(config);
    await gw.text('read_file', { path: 'logins' });
    const audit = await gw.json<{ dataStewardship: { restrictedSources: { file: string; restriction: string }[] } }>('get_audit_log');
    expect(audit.dataStewardship.restrictedSources).toEqual([{ file: 'logins', restriction: 'cat1', channels: ['ai-opened'] }]);
    await gw.close();
  });

  it('writes the log once per tool call', async () => {
    const { config } = workspace();
    const gw = await connect(config);
    await gw.text('read_file', { path: 'finance/payroll.csv' });
    const lines = readFileSync(config.statePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
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
