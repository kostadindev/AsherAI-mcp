/**
 * Smoke test of the published package, not the source tree: pack it, install the tarball into an empty
 * project, then drive the installed bins the way an MCP client and an assessor would.
 *
 *   npm run build && npm run test:package
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const work = mkdtempSync(join(tmpdir(), 'trialrun-pack-'));

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`package smoke test failed: ${what}`);
  console.log(`ok - ${what}`);
}

try {
  const packed = JSON.parse(execFileSync(npm, ['pack', '--json', '--pack-destination', work], { cwd: pkgRoot, encoding: 'utf8' })) as { filename: string; files: { path: string }[] }[];
  const [pack] = packed;
  if (!pack) throw new Error('npm pack produced nothing');
  const paths = pack.files.map((f) => f.path);
  check(['server', 'policy', 'demo'].every((b) => paths.includes(`dist/bin/${b}.js`)), 'tarball contains all three bins');
  check(!paths.some((p) => p.startsWith('src/') || p.startsWith('test/') || p.startsWith('accuracy/')), 'tarball has no sources, tests or corpora');

  const project = join(work, 'project');
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'smoke', version: '0.0.0', private: true }));
  execFileSync(npm, ['install', '--no-audit', '--no-fund', join(work, pack.filename)], { cwd: project, stdio: 'inherit' });

  const bin = (name: string) => join(project, 'node_modules', 'trialrun-mcp', 'dist', 'bin', `${name}.js`);
  const env = { ...process.env, TRIALRUN_STATE: join(work, 'session.jsonl') } as Record<string, string>;

  const blocked = execFileSync(process.execPath, [bin('policy'), 'block', 'oakmere'], { cwd: project, env, encoding: 'utf8' });
  check(blocked.trim() === 'Blocked: oakmere', 'installed trialrun-policy blocks a file');

  const client = new Client({ name: 'trialrun-package-smoke', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin('server')], cwd: project, env, stderr: 'inherit' }));
  const { tools } = await client.listTools();
  check(tools.some((t) => t.name === 'read_file') && tools.some((t) => t.name === 'get_report'), 'installed trialrun-mcp lists its tools over stdio');
  const refused = (await client.callTool({ name: 'read_file', arguments: { file_id: 'oakmere' } })) as { isError?: boolean };
  check(refused.isError === true, 'server honours the block set by the policy CLI');
  const report = (await client.callTool({ name: 'get_report', arguments: {} })) as { content: { text: string }[] };
  check(report.content[0]?.text.includes('Data stewardship') ?? false, 'server renders a report');
  await client.close();

  const demo = execFileSync(process.execPath, [bin('demo'), join(work, 'demo')], { cwd: project, encoding: 'utf8' });
  check(demo.includes('Demo complete.') && demo.includes('Refused: Access denied'), 'installed trialrun-demo runs end to end');
} finally {
  rmSync(work, { recursive: true, force: true });
}
