/**
 * Install check against GitHub, the way the README tells people to install: a fresh npm cache, then
 * `npx -y github:kostadindev/trialrun-mcp` driven over stdio by an MCP client, plus the demo bin.
 *
 *   npx tsx scripts/online-smoke.ts [git-ref]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ref = process.argv[2] ? `#${process.argv[2]}` : '';
const spec = `github:kostadindev/trialrun-mcp${ref}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const work = mkdtempSync(join(tmpdir(), 'trialrun-online-'));
const env = { ...process.env, npm_config_cache: join(work, 'npm-cache'), npm_config_update_notifier: 'false' } as Record<string, string>;

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`online smoke test failed: ${what}`);
  console.log(`ok - ${what}`);
}

try {
  const ws = join(work, 'ws');
  mkdirSync(ws);
  writeFileSync(join(ws, 'budget.csv'), 'line,amount\nSalaries,148000\nRent,48000\n');
  writeFileSync(join(ws, 'payroll.csv'), 'name,ni_number,salary\nA. Example,QQ123456C,52000\n');
  const wsEnv = { ...env, TRIALRUN_WORKSPACE: ws };

  const blocked = execFileSync(npx, ['-y', '-p', spec, 'trialrun-policy', 'block', 'payroll.csv'], { cwd: work, env: wsEnv, encoding: 'utf8' });
  check(blocked.includes('payroll.csv'), `trialrun-policy installs from ${spec} and blocks a file`);

  const client = new Client({ name: 'trialrun-online-smoke', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: npx, args: ['-y', spec], cwd: work, env: wsEnv, stderr: 'inherit' }));
  const { tools } = await client.listTools();
  check(tools.some((t) => t.name === 'read_file') && tools.some((t) => t.name === 'get_report'), 'server installs and lists its tools over stdio');
  const files = (await client.callTool({ name: 'list_files', arguments: {} })) as { content: { text: string }[] };
  check(files.content[0]?.text.includes('budget.csv') ?? false, 'server lists the workspace');
  const refused = (await client.callTool({ name: 'read_file', arguments: { path: 'payroll.csv' } })) as { isError?: boolean };
  check(refused.isError === true, 'blocked file is refused');
  const ok = (await client.callTool({ name: 'read_file', arguments: { path: 'budget.csv' } })) as { isError?: boolean; content: { text: string }[] };
  check(!ok.isError && (ok.content[0]?.text.includes('148000') ?? false), 'allowed file is read');
  const report = (await client.callTool({ name: 'get_report', arguments: {} })) as { content: { text: string }[] };
  check((report.content[0]?.text.length ?? 0) > 0, 'server renders a report');
  await client.close();

  if (process.env.SMOKE_DEMO !== '0') {
    const demo = execFileSync(npx, ['-y', '-p', spec, 'trialrun-demo', join(work, 'demo')], { cwd: work, env, encoding: 'utf8' });
    check(demo.includes('Demo complete'), 'trialrun-demo runs end to end');
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
