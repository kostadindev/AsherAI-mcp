import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POLICY_FILE, STATE_FILE } from '../src/config.js';
import { emptyPolicy, fileType, globToRegExp, isBlockedPath, loadPolicy, readText, safeResolve, savePolicy, walk } from '../src/workspace.js';
import { tempDir } from './helpers.js';

function workspace() {
  const root = tempDir('trialrun-ws-');
  mkdirSync(join(root, 'finance', 'q4'), { recursive: true });
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'notes.md'), 'line one\nline two\nline three\n');
  writeFileSync(join(root, 'finance', 'budget.csv'), 'line,amount\nRent,48000\n');
  writeFileSync(join(root, 'finance', 'q4', 'payroll.csv'), 'name,salary\nA,1\n');
  writeFileSync(join(root, '.hidden'), 'dotfile');
  writeFileSync(join(root, 'node_modules', 'x.js'), '');
  writeFileSync(join(root, 'report.pdf'), '%PDF-1.7');
  writeFileSync(join(root, 'image.bin'), Buffer.from([1, 0, 2, 3]));
  writeFileSync(join(root, POLICY_FILE), '{}');
  writeFileSync(join(root, STATE_FILE), '{}');
  const outside = tempDir('trialrun-outside-');
  writeFileSync(join(outside, 'secret.txt'), 'outside');
  symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'));
  symlinkSync(join(root, 'missing-target'), join(root, 'dangling.txt'));
  return { root, outside };
}

describe('globToRegExp', () => {
  it.each([
    ['*.env', 'config/prod.env', true],
    ['*.env', 'prod.env', true],
    ['*.env', 'prod.env.bak', false],
    ['secrets/**', 'secrets/a/b.txt', true],
    ['secrets/**', 'other/secrets/a.txt', false],
    ['**/payroll.csv', 'payroll.csv', true],
    ['**/payroll.csv', 'finance/q4/payroll.csv', true],
    ['finance/*.csv', 'finance/budget.csv', true],
    ['finance/*.csv', 'finance/q4/payroll.csv', false],
    ['report?.txt', 'report1.txt', true],
    ['report?.txt', 'report10.txt', false],
    ['./credentials.txt', 'credentials.txt', true],
    ['a+b(1).txt', 'a+b(1).txt', true],
    ['finance\\*.csv', 'finance/budget.csv', true],
  ])('%s matches %s: %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});

describe('isBlockedPath', () => {
  it('always blocks gateway files at any depth', () => {
    expect(isBlockedPath(POLICY_FILE, emptyPolicy())).toBe(true);
    expect(isBlockedPath(`sub/${STATE_FILE}`, emptyPolicy())).toBe(true);
  });

  it('applies owner patterns', () => {
    const policy = { ...emptyPolicy(), block: ['*.env'] };
    expect(isBlockedPath('prod.env', policy)).toBe(true);
    expect(isBlockedPath('notes.md', policy)).toBe(false);
  });
});

describe('loadPolicy / savePolicy', () => {
  it('returns an empty policy when there is no file', () => {
    expect(loadPolicy(tempDir())).toEqual(emptyPolicy());
  });

  it('returns an empty policy for malformed JSON', () => {
    const root = tempDir();
    writeFileSync(join(root, POLICY_FILE), '{ not json');
    expect(loadPolicy(root)).toEqual(emptyPolicy());
  });

  it('drops malformed entries and unknown modes', () => {
    const root = tempDir();
    writeFileSync(join(root, POLICY_FILE), JSON.stringify({
      block: ['*.env', 3, null],
      sensitive_terms: [{ term: 'Kestrel', category: 'cat1' }, { term: 'x', category: 'cat3' }, 'bad', null],
      mode: 'loud',
    }));
    expect(loadPolicy(root)).toEqual({ block: ['*.env'], sensitive_terms: [{ term: 'Kestrel', category: 'cat1' }], mode: undefined });
  });

  it('ignores fields that are not arrays', () => {
    const root = tempDir();
    writeFileSync(join(root, POLICY_FILE), JSON.stringify({ block: 'x', sensitive_terms: {} }));
    expect(loadPolicy(root)).toEqual(emptyPolicy());
  });

  it('round-trips through savePolicy', () => {
    const root = tempDir();
    const policy = { block: ['secrets/**'], sensitive_terms: [{ term: 'Kestrel', category: 'cat2' as const }], mode: 'enforce' as const };
    savePolicy(root, policy);
    expect(loadPolicy(root)).toEqual(policy);
  });
});

describe('fileType', () => {
  it.each([['a.csv', 'text'], ['Makefile', 'text'], ['a.PDF', 'binary'], ['a.xyz', 'other']])('%s is %s', (path, type) => {
    expect(fileType(path)).toBe(type);
  });
});

describe('safeResolve', () => {
  const { root } = workspace();

  it('resolves a relative path', () => {
    expect(safeResolve(root, 'finance/budget.csv').rel).toBe('finance/budget.csv');
  });

  it('treats a leading slash and backslashes as relative to the workspace', () => {
    expect(safeResolve(root, '/finance\\budget.csv').rel).toBe('finance/budget.csv');
  });

  it('refuses ".." traversal', () => {
    expect(() => safeResolve(root, '../etc/passwd')).toThrow('may not contain ".."');
    expect(() => safeResolve(root, 'finance/../../x')).toThrow('may not contain ".."');
  });

  it('refuses a symlink that points outside', () => {
    expect(() => safeResolve(root, 'escape.txt')).toThrow('outside the workspace');
  });

  it('reports a missing file', () => {
    expect(() => safeResolve(root, 'nope.txt')).toThrow('No such file: nope.txt');
  });
});

describe('walk', () => {
  it('lists visible files only, sorted, with types', () => {
    const { root } = workspace();
    const { files, truncated, hidden } = walk(root, { ...emptyPolicy(), block: ['**/payroll.csv'] });
    expect(files.map((f) => f.path)).toEqual(['finance/budget.csv', 'image.bin', 'notes.md', 'report.pdf']);
    expect(files.find((f) => f.path === 'report.pdf')?.type).toBe('binary');
    expect(truncated).toBe(false);
    expect(hidden).toBe(1);
  });

  it('stops at the limit and says so', () => {
    const { root } = workspace();
    const listing = walk(root, emptyPolicy(), 2);
    expect(listing.files).toHaveLength(2);
    expect(listing.truncated).toBe(true);
  });
});

describe('readText', () => {
  const { root } = workspace();

  it('reads the whole file', () => {
    const slice = readText(join(root, 'notes.md'));
    expect(slice).toMatchObject({ firstLine: 1, totalLines: 4 });
    expect(slice.text).toContain('line three');
  });

  it('reads an inclusive line range and clamps it', () => {
    expect(readText(join(root, 'notes.md'), 2, 2)).toMatchObject({ text: 'line two', firstLine: 2, lastLine: 2 });
    expect(readText(join(root, 'notes.md'), 3, 99)).toMatchObject({ firstLine: 3, lastLine: 4 });
  });

  it('refuses PDF and Office files with a clear message', () => {
    expect(() => readText(join(root, 'report.pdf'))).toThrow('not parsed yet');
  });

  it('refuses binary content', () => {
    expect(() => readText(join(root, 'image.bin'))).toThrow('binary');
  });
});
