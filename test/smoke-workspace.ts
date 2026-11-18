/**
 * Workspace-mode smoke test: build a temp folder of realistic files, connect over stdio and check
 * listing, policy blocking, detection, enforce-mode redaction, habit moments and the report.
 * Run: npx tsx test/smoke-workspace.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ws = mkdtempSync(join(tmpdir(), 'trialrun-ws-'));
const outside = mkdtempSync(join(tmpdir(), 'trialrun-outside-'));
writeFileSync(join(outside, 'secret.txt'), 'outside the workspace');
mkdirSync(join(ws, 'finance'));
writeFileSync(join(ws, 'notes.md'), '# Client call\nSpoke to Priya, priya.raman@example.co.uk, mobile 07700 900123.\nAgreed the Q4 timetable.\n');
writeFileSync(join(ws, 'finance', 'payroll.csv'), 'name,ni_number,salary\nDaniel Mercer,JR 48 31 22 C,75000\nAisha Khalid,PK 19 60 47 A,48000\n');
writeFileSync(join(ws, 'finance', 'budget.csv'), 'line,2026\nRevenue,1300000\nRent,48000\nInsurance,9600\n');
writeFileSync(join(ws, 'credentials.txt'), 'portal user: admin\npassword: Kingfisher!2025\n');
writeFileSync(join(ws, 'deal.md'), 'Board update: Project Kestrel is on track for January.\n');
writeFileSync(join(ws, 'report.pdf'), '%PDF-1.7 \u0000\u0001 binary');
symlinkSync(join(outside, 'secret.txt'), join(ws, 'escape.txt'));
writeFileSync(join(ws, '.trialrun.json'), JSON.stringify({ block: ['credentials.txt'], sensitive_terms: [{ term: 'Project Kestrel', category: 'cat1' }] }));

const STATE = join(ws, '.trialrun-session.json');
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };
const body = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
const isErr = (r: unknown) => Boolean((r as { isError?: boolean }).isError);

async function connect(extra: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: 'node', args: ['dist/server.js'],
    env: { ...process.env, TRIALRUN_WORKSPACE: ws, ...extra } as Record<string, string>,
  });
  const c = new Client({ name: 'trialrun-smoke-ws', version: '0.0.1' });
  await c.connect(transport);
  return c;
}

const c = await connect();
const call = async (name: string, args: Record<string, unknown> = {}) => c.callTool({ name, arguments: args });
const tools = (await c.listTools()).tools.map((t) => t.name);
check(['list_files', 'read_file', 'check_text', 'record_moment', 'get_report', 'get_audit_log'].every((t) => tools.includes(t)), 'workspace tools registered');
check(!tools.includes('set_access') && !tools.includes('reset_session'), 'student role has no policy tools');

const listing = JSON.parse(body(await call('list_files')));
const paths = listing.files.map((f: { path: string }) => f.path);
console.log('visible:', paths.join(', '));
check(!paths.includes('credentials.txt'), 'blocked credentials.txt hidden');
check(!paths.some((p: string) => p.startsWith('.trialrun')), 'policy and state files hidden');
check(!paths.includes('escape.txt'), 'symlink escaping the workspace not listed');
check(listing.hiddenByPolicy >= 1, 'listing reports files hidden by policy');

const budget = body(await call('read_file', { path: 'finance/budget.csv' }));
check(budget.includes('Revenue') && !budget.includes('[Gateway'), 'budget read with no flags');
const payroll = body(await call('read_file', { path: 'finance/payroll.csv' }));
check(payroll.includes('[Gateway') && payroll.includes('national insurance number'), 'payroll read flagged (NI numbers)');
check(isErr(await call('read_file', { path: 'credentials.txt' })), 'blocked file refused');
check(isErr(await call('read_file', { path: '../' + outside.split('/').pop() + '/secret.txt' })), '.. path refused');
check(isErr(await call('read_file', { path: 'escape.txt' })), 'symlink escape refused');
const pdf = await call('read_file', { path: 'report.pdf' });
check(isErr(pdf) && body(pdf).includes('not parsed yet'), 'PDF refused with a clear message');
check(isErr(await call('read_file', { path: '.trialrun.json' })), 'policy file unreadable');

const ct = JSON.parse(body(await call('check_text', { text: 'Pay with 4111 1111 1111 1111 please' })));
check(!ct.clean && ct.hits[0].category === 'cat1' && !JSON.stringify(ct).includes('4111 1111'), 'check_text flags a card (cat1), redacted');

await call('record_moment', { habit: 'check', outcome: 'did', note: 'Verified the rent figure against the 2026 budget before using it.' });
await call('record_moment', { habit: 'decide', outcome: 'prompted', note: 'Chose the depreciation policy after the options were laid out.' });
await call('record_moment', { habit: 'protect', outcome: 'missed', note: 'Pasted payroll rows including JR 48 31 22 C and priya.raman@example.co.uk.' });

const rep = body(await call('get_report'));
console.log('\n' + rep + '\n');
check(rep.includes('Data stewardship: Zero'), 'report scores Zero (card in pasted text is Category 1)');
check(rep.includes('Check the output: 1 did') && rep.includes('Keep the decision: 0 did, 1 after a prompt') && rep.includes('Protect the data: 0 did, 0 after a prompt, 1 missed'), 'report counts habits');
const RAW = ['JR 48 31 22 C', 'PK 19 60 47 A', 'priya.raman@example.co.uk', '07700 900123', '4111 1111 1111 1111', 'Kingfisher!2025', 'Project Kestrel'];
check(!RAW.some((r) => rep.includes(r)), 'report contains no raw restricted values');
const resources = (await c.listResources()).resources.map((r) => r.uri);
check(resources.includes('trialrun://report'), 'report exposed as a resource');
await c.close();

const stateText = readFileSync(STATE, 'utf8');
check(!RAW.some((r) => stateText.includes(r)), 'audit log on disk contains no raw restricted values');

// Owner CLI: add a cat2 term and switch to enforce mode; reads are then redacted.
const env = { ...process.env, TRIALRUN_WORKSPACE: ws };
console.log(execFileSync('node', ['dist/policy.js', 'mode', 'enforce'], { env, encoding: 'utf8' }).trim());
console.log(execFileSync('node', ['dist/policy.js', 'show'], { env, encoding: 'utf8' }).trim());
const c2 = await connect();
const notes = body(await c2.callTool({ name: 'read_file', arguments: { path: 'notes.md' } }));
check(notes.includes('[redacted: email]') && notes.includes('[redacted: phone number]') && !notes.includes('priya.raman@'), 'enforce mode redacts values in place');
const deal = body(await c2.callTool({ name: 'read_file', arguments: { path: 'deal.md' } }));
check(deal.includes('[redacted: sensitive term]') && !deal.includes('Kestrel'), 'owner-defined sensitive term redacted');
const lines = body(await c2.callTool({ name: 'read_file', arguments: { path: 'finance/budget.csv', start_line: 2, end_line: 3 } }));
check(lines.includes('Revenue') && lines.includes('Rent') && !lines.includes('Insurance'), 'line range respected');
await c2.close();

console.log(failures ? `\n${failures} check(s) failed` : '\nall workspace checks passed');
process.exit(failures ? 1 : 0);
