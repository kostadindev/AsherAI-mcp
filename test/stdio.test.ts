/** End to end: the real entry points, as an MCP client would spawn them. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from './helpers.js';

const BIN = (name: string) => join(import.meta.dirname, '..', 'src', 'bin', `${name}.ts`);
const NODE_ARGS = ['--import', 'tsx'];

describe('stdio entry points', () => {
  it('the policy CLI and the server share one session log', async () => {
    const env = { ...process.env, TRIALRUN_STATE: join(tempDir(), 'session.json') } as Record<string, string>;
    const out = execFileSync(process.execPath, [...NODE_ARGS, BIN('policy'), 'block', 'oakmere'], { env, encoding: 'utf8' });
    expect(out.trim()).toBe('Blocked: oakmere');

    const client = new Client({ name: 'trialrun-e2e', version: '0.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [...NODE_ARGS, BIN('server')], env, stderr: 'ignore' }));
    const result = (await client.callTool({ name: 'read_file', arguments: { file_id: 'oakmere' } })) as { isError?: boolean };
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('the policy CLI exits non-zero on a bad command', () => {
    const env = { ...process.env, TRIALRUN_STATE: join(tempDir(), 'session.json') };
    expect(() => execFileSync(process.execPath, [...NODE_ARGS, BIN('policy'), 'block', 'nope'], { env, stdio: 'pipe' })).toThrow();
  });
});
