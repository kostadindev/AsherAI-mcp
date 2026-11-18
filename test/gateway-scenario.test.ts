import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FILES } from '../src/scenario/scenario.js';
import { SessionStore } from '../src/state.js';
import { connect, makeConfig } from './helpers.js';

interface Audit {
  dataStewardship: { score: string; restrictedSources: { file: string; restriction: string; channels: string[] }[] };
  events: { type: string; fileId?: string; trap?: string; markers?: string[] }[];
}

const RESTRICTED = FILES.filter((f) => f.sections.some((s) => s.restricted));

/** Raw strings that must never appear: every restricted section's markers and title. */
function secretsOf(file: (typeof FILES)[number]): string[] {
  return file.sections.filter((s) => s.restricted).flatMap((s) => [...(s.markers ?? []), ...(s.title ? [s.title] : [])]);
}
// The inside-information codename on its own, too: ids and trap names must not carry it.
const ALL_SECRETS = [...RESTRICTED.flatMap(secretsOf), 'Kestrel'];

function expectNoneOf(secrets: readonly string[], where: string, text: string) {
  const found = secrets.filter((m) => text.toLowerCase().includes(m.toLowerCase()));
  expect(found, where).toEqual([]);
}

describe.each(RESTRICTED.map((f) => [f.id, f] as const))('restricted scenario file %s', (_id, file) => {
  it('in enforce mode, no restricted value, title or name leaks anywhere and the score stays Full', async () => {
    const config = makeConfig({ mode: 'enforce' });
    const gw = await connect(config);
    expectNoneOf(ALL_SECRETS, 'list_files', await gw.text('list_files'));
    expectNoneOf(ALL_SECRETS, 'get_access_policy', await gw.text('get_access_policy'));
    expectNoneOf(secretsOf(file), 'read_file', await gw.text('read_file', { file_id: file.id }));
    for (const s of file.sections.filter((x) => x.restricted)) {
      expectNoneOf(secretsOf(file), `read_file section ${s.id}`, await gw.text('read_file', { file_id: file.id, section_id: s.id }));
    }
    const audit = await gw.json<Audit>('get_audit_log');
    expect(audit.dataStewardship.score).toBe('Full');
    expect(audit.events.filter((e) => e.type === 'withheld').length).toBeGreaterThan(0);
    expectNoneOf(ALL_SECRETS, 'audit log', JSON.stringify(audit));
    expectNoneOf(ALL_SECRETS, 'report', await gw.text('get_report'));
    expectNoneOf(ALL_SECRETS, 'session log on disk', readFileSync(config.statePath, 'utf8'));
    await gw.close();
  });

  it('in monitor mode, the log, audit log and report hold no raw value even though the AI saw the file', async () => {
    const config = makeConfig();
    const gw = await connect(config);
    await gw.text('read_file', { file_id: file.id });
    const audit = await gw.json<Audit>('get_audit_log');
    expect(audit.dataStewardship.score).not.toBe('Full');
    expectNoneOf(ALL_SECRETS, 'audit log', JSON.stringify(audit));
    expectNoneOf(ALL_SECRETS, 'report', await gw.text('get_report'));
    expectNoneOf(ALL_SECRETS, 'session log on disk', readFileSync(config.statePath, 'utf8'));
    await gw.close();
  });
});

describe('scenario mode, student role', () => {
  it('exposes read and self-check tools, but no policy tools', async () => {
    const gw = await connect(makeConfig());
    const tools = await gw.tools();
    expect(tools).toEqual(expect.arrayContaining(['list_files', 'read_file', 'get_access_policy', 'check_text', 'record_moment', 'get_report', 'get_audit_log']));
    expect(tools).not.toContain('set_access');
    expect(tools).not.toContain('reset_session');
    await gw.close();
  });

  it('lists files, optionally by folder, hiding blocked ones', async () => {
    const config = makeConfig();
    new SessionStore(config.statePath).append({ type: 'set-access', fileId: 'oakmere', note: 'blocked', by: 'assessor' });
    const gw = await connect(config);
    const bank = await gw.json<{ files: { id: string }[] }>('list_files', { folder: 'Bank & Loan' });
    expect(bank.files.map((f) => f.id)).toEqual(['bankstmt', 'loan', 'creditmemo']);
    const all = await gw.json<{ files: unknown[] }>('list_files');
    expect(all.files.length).toBeGreaterThan(bank.files.length);
    await gw.close();
  });

  it('refuses blocked and unknown files, and unknown sections', async () => {
    const config = makeConfig();
    new SessionStore(config.statePath).append({ type: 'set-access', fileId: 'passports', note: 'blocked', by: 'assessor' });
    const gw = await connect(config);
    expect(await gw.call('read_file', { file_id: 'passports' })).toMatchObject({ isError: true });
    expect(await gw.text('read_file', { file_id: 'nope' })).toBe('No such file: nope');
    expect(await gw.text('read_file', { file_id: 'loan', section_id: 'x' })).toMatch(/has no section "x"\. Sections: terms, schedule, appendix/);
    expect(new SessionStore(config.statePath).load().events.map((e) => e.type)).toEqual(['set-access', 'refused']);
    await gw.close();
  });

  it('serves one section without the restricted appendix', async () => {
    const config = makeConfig();
    const gw = await connect(config);
    const schedule = await gw.text('read_file', { file_id: 'loan', section_id: 'schedule' });
    expect(schedule).toContain('Repayment schedule');
    expect(schedule).not.toContain('Larkspur');
    const events = new SessionStore(config.statePath).load().events;
    expect(events).toEqual([expect.objectContaining({ type: 'ai-open', fileId: 'loan', sectionId: 'schedule' })]);
    await gw.close();
  });

  it('logs restricted sections as leaks with their trap and redacted markers', async () => {
    const config = makeConfig();
    const gw = await connect(config);
    await gw.text('read_file', { file_id: 'tb' });
    await gw.text('read_file', { file_id: 'payroll' });
    const audit = await gw.json<Audit>('get_audit_log');
    expect(audit.dataStewardship.score).toBe('Partial');
    const leak = audit.events.find((e) => e.type === 'leak');
    expect(leak).toMatchObject({ fileId: 'payroll', trap: 'ds_payroll' });
    expect(leak?.markers?.every((m) => m.endsWith('***'))).toBe(true);
    expect(audit.dataStewardship.restrictedSources).toEqual([{ file: 'Payroll – December 2025.xlsx', restriction: 'cat2', channels: ['ai-opened'] }]);
    await gw.close();
  });

  it('withholds restricted sections in enforce mode', async () => {
    const config = makeConfig({ mode: 'enforce' });
    const gw = await connect(config);
    const emails = await gw.text('read_file', { file_id: 'emails' });
    expect(emails).toContain('Halden Retail');
    expect(emails).not.toContain('Kestrel');
    expect(emails).toMatch(/\[Gateway: 1 restricted section\(s\) withheld/);
    expect((await gw.json<Audit>('get_audit_log')).dataStewardship.score).toBe('Full');
    await gw.close();
  });

  it('shows the access policy', async () => {
    const gw = await connect(makeConfig());
    const policy = await gw.json<{ mode: string; role: string; files: { id: string; allowed: boolean }[] }>('get_access_policy');
    expect(policy).toMatchObject({ mode: 'monitor', role: 'student' });
    expect(policy.files.every((f) => f.allowed)).toBe(true);
    await gw.close();
  });

  it('flags planted markers in text and scores a Category 1 leak as Zero', async () => {
    const gw = await connect(makeConfig());
    const result = await gw.json<{ clean: boolean; hits: { category: string; match: string }[] }>('check_text', { text: 'Daniel Mercer; see Project Kestrel.' });
    expect(result.clean).toBe(false);
    expect(result.hits.map((h) => h.category).sort()).toEqual(['cat1', 'cat2']);
    expect(JSON.stringify(result)).not.toContain('Kestrel');
    expect((await gw.json<Audit>('get_audit_log')).dataStewardship.score).toBe('Zero');
    await gw.close();
  });

  it('always records disclosures found by check_text: the AI cannot opt out', async () => {
    const config = makeConfig();
    const gw = await connect(config);
    const { tools } = await gw.client.listTools();
    const checkText = tools.find((t) => t.name === 'check_text');
    expect(Object.keys(checkText?.inputSchema.properties ?? {})).toEqual(['text']);
    await gw.call('check_text', { text: 'password: Kingfisher!2025', record: false });
    expect(new SessionStore(config.statePath).load().events.map((e) => e.type)).toEqual(['check-text', 'leak']);
    expect((await gw.json<Audit>('get_audit_log')).dataStewardship.score).toBe('Zero');
    await gw.close();
  });

  it('records habit moments with scenario markers redacted', async () => {
    const config = makeConfig();
    const gw = await connect(config);
    const reply = await gw.text('record_moment', { habit: 'protect', outcome: 'missed', note: 'Shared Daniel Mercer salary row' });
    expect(reply).not.toContain('Daniel Mercer');
    expect(await gw.text('get_report')).toContain('### Protect the data: 0 did, 0 after a prompt, 1 missed');
    await gw.close();
  });

  it('serves the briefing, report and audit log as resources', async () => {
    const gw = await connect(makeConfig());
    const briefing = await gw.resource('trialrun://briefing');
    expect(briefing).toContain('## Data categories');
    // The scenario ships no statement template, so the briefing must not tell the candidate to use one.
    expect(briefing).not.toMatch(/template/i);
    expect(await gw.resource('trialrun://report')).toContain('Scenario: Fernvale Kitchens Ltd.');
    expect(JSON.parse(await gw.resource('trialrun://audit-log'))).toMatchObject({ blocked: [], events: [] });
    await gw.close();
  });
});

describe('scenario mode, assessor role', () => {
  it('can block, allow and reset', async () => {
    const config = makeConfig({ role: 'assessor' });
    const gw = await connect(config);
    expect(await gw.tools()).toEqual(expect.arrayContaining(['set_access', 'reset_session']));
    expect(await gw.text('set_access', { file_id: 'oakmere', allowed: false })).toBe('oakmere is now BLOCKED.');
    expect(new SessionStore(config.statePath).load().blocked).toEqual(['oakmere']);
    expect(await gw.text('set_access', { file_id: 'oakmere', allowed: true })).toBe('oakmere is now ALLOWED.');
    expect(new SessionStore(config.statePath).load().blocked).toEqual([]);
    expect(await gw.text('set_access', { file_id: 'nope', allowed: false })).toBe('No such file: nope');
    expect(await gw.text('reset_session')).toBe('Session reset.');
    expect(new SessionStore(config.statePath).load().events.map((e) => e.type)).toEqual(['reset']);
    await gw.close();
  });
});
