/** The trialrun-demo entry point, run as a user would: a child process writing a demo workspace. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_FILES } from '../src/bin/demo.js';
import { tempDir } from './helpers.js';

const DEMO = join(import.meta.dirname, '..', 'src', 'bin', 'demo.ts');
const run = (folder: string) => execFileSync(process.execPath, ['--import', 'tsx', DEMO, folder], { encoding: 'utf8', stdio: 'pipe' });

describe('trialrun-demo', () => {
  it('runs the scripted session end to end and prints the report', () => {
    const ws = join(tempDir(), 'demo');
    const out = run(ws);
    expect(out).toContain('(1 hidden by policy)');
    expect(out).toContain('Refused: Access denied: "payroll.csv" is blocked');
    expect(out).toContain('restricted item(s) flagged: sensitive term, bank account');
    expect(out).toContain('Not clean: bank account');
    expect(out).toContain('## Files the AI read (2)');
    expect(out).toContain('1 read(s) refused by the access policy.');
    expect(out).toContain('Demo complete.');
    // The pre-send draft check is not recorded as a leak into an answer.
    expect(out).not.toContain('in an AI answer');
    // The demo never prints the restricted values themselves.
    for (const secret of ['QQ123456C', '12345678', '12 Example Road']) expect(out).not.toContain(secret);
    // The session log keeps labels, not the blocked file's contents.
    expect(readFileSync(join(ws, '.trialrun-session.jsonl'), 'utf8')).not.toContain('QQ123456C');
  });

  it('can be run again on its own folder, starting a fresh log', () => {
    const ws = join(tempDir(), 'demo');
    run(ws);
    const out = run(ws);
    expect(out.match(/## Files the AI read \(2\)/g)).toHaveLength(1);
  });

  it('refuses a folder that holds other files', () => {
    const ws = tempDir();
    writeFileSync(join(ws, 'mine.txt'), 'keep me');
    expect(() => run(ws)).toThrow(/already holds other files/);
    expect(readFileSync(join(ws, 'mine.txt'), 'utf8')).toBe('keep me');
    expect(Object.keys(DEMO_FILES)).toContain('payroll.csv');
  });
});
