/**
 * Smoke test: spawn the gateway over stdio in both roles and exercise every tool.
 * Exits non-zero on any failed assertion.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'trialrun-mcp-'));
const STATE = join(dir, 'session.json');
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };

async function connect(role: 'student' | 'assessor') {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/server.js'],
    env: { ...process.env, TRIALRUN_STATE: STATE, TRIALRUN_ROLE: role } as Record<string, string>,
  });
  const client = new Client({ name: `trialrun-smoke-${role}`, version: '0.0.1' });
  await client.connect(transport);
  return client;
}
const body = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);

// 1. Student role: no policy or reset tools.
const student = await connect('student');
const studentTools = (await student.listTools()).tools.map((t) => t.name);
console.log('student tools:', studentTools.join(', '));
check(!studentTools.includes('set_access'), 'student role hides set_access');
check(!studentTools.includes('reset_session'), 'student role hides reset_session');
check(['list_files', 'read_file', 'get_access_policy', 'check_text', 'get_audit_log'].every((t) => studentTools.includes(t)), 'student role has the five read/check tools');
await student.close();

// 2. Assessor role: blocks a file via the tool.
const assessor = await connect('assessor');
const assessorTools = (await assessor.listTools()).tools.map((t) => t.name);
check(assessorTools.includes('set_access') && assessorTools.includes('reset_session'), 'assessor role has set_access and reset_session');
console.log('resources:', (await assessor.listResources()).resources.map((r) => r.uri).join(', '));
console.log(body(await assessor.callTool({ name: 'set_access', arguments: { file_id: 'oakmere', allowed: false } })));
await assessor.close();

// 3. Assessor CLI: block another file in the same state file.
console.log(execFileSync('node', ['dist/policy.js', 'block', 'passports'], { env: { ...process.env, TRIALRUN_STATE: STATE }, encoding: 'utf8' }).trim());

// 4. Student session sees both blocks and is logged.
const s2 = await connect('student');
const call = async (name: string, args: Record<string, unknown> = {}) => s2.callTool({ name, arguments: args });
const bank = JSON.parse(body(await call('list_files', { folder: 'Bank & Loan' })));
const bankIds = bank.files.map((f: { id: string }) => f.id);
console.log('bank folder visible:', bankIds.join(', '));
check(!bankIds.includes('oakmere'), 'blocked oakmere hidden from list_files');
const oak = await call('read_file', { file_id: 'oakmere' });
check(Boolean((oak as { isError?: boolean }).isError), 'read_file refuses blocked oakmere');
const pass = await call('read_file', { file_id: 'passports' });
check(Boolean((pass as { isError?: boolean }).isError), 'read_file refuses passports blocked via CLI');
check(body(await call('read_file', { file_id: 'tb' })).includes('Trial balance'), 'tb readable');
body(await call('read_file', { file_id: 'payroll' }));
const sched = body(await call('read_file', { file_id: 'loan', section_id: 'schedule' }));
check(sched.includes('Repayment schedule') && !sched.includes('Larkspur'), 'loan schedule excerpt excludes the appendix');
const ct = JSON.parse(body(await call('check_text', { text: 'Daniel Mercer earns £75,000; see Project Kestrel.' })));
check(ct.hits.length >= 2, 'check_text flags payroll name and Kestrel');
const audit = JSON.parse(body(await call('get_audit_log')));
console.log('stewardship:', JSON.stringify(audit.dataStewardship.score), '-', audit.dataStewardship.reason);
check(audit.dataStewardship.score === 'Zero', 'Kestrel in an answer scores Zero');
check(audit.events.some((e: { type: string; fileId?: string }) => e.type === 'leak' && e.fileId === 'payroll'), 'payroll read logged as a leak');
await s2.close();

console.log(failures ? `\n${failures} check(s) failed` : '\nall MCP checks passed');
process.exit(failures ? 1 : 0);
