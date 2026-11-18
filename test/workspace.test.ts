import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POLICY_FILE, STATE_FILE } from '../src/config.js';
import { emptyPolicy, fileType, globToRegExp, isBlockedPath, lineRange, readDocument, readPolicy, safeResolve, savePolicy, walk, workspaceAccess } from '../src/workspace.js';
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
  it('applies owner patterns', () => {
    const policy = { ...emptyPolicy(), block: ['*.env'] };
    expect(isBlockedPath('prod.env', policy)).toBe(true);
    expect(isBlockedPath('notes.md', policy)).toBe(false);
  });
});

describe('readPolicy / savePolicy', () => {
  it('returns an empty policy when there is no file', () => {
    expect(readPolicy(tempDir())).toEqual({ ok: true, policy: emptyPolicy() });
  });

  it('accepts a partial policy', () => {
    const root = tempDir();
    writeFileSync(join(root, POLICY_FILE), JSON.stringify({ block: ['*.env'] }));
    expect(readPolicy(root)).toEqual({ ok: true, policy: { block: ['*.env'], sensitive_terms: [] } });
  });

  it('round-trips through savePolicy', () => {
    const root = tempDir();
    const policy = { block: ['secrets/**'], sensitive_terms: [{ term: 'Kestrel', category: 'cat2' as const }], mode: 'enforce' as const };
    savePolicy(root, policy);
    expect(readPolicy(root)).toEqual({ ok: true, policy });
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
    const listing = walk(root, emptyPolicy(), { fileLimit: 2 });
    expect(listing.files).toHaveLength(2);
    expect(listing.truncated).toBe(true);
  });

  it('stops after visiting the directory cap and says so', () => {
    const root = tempDir('trialrun-dirs-');
    for (const d of ['a', 'b', 'c']) {
      mkdirSync(join(root, d));
      writeFileSync(join(root, d, 'f.txt'), 'x');
    }
    const listing = walk(root, emptyPolicy(), { dirLimit: 2 });
    expect(listing.truncated).toBe(true);
    expect(listing.files.length).toBeLessThan(3);
  });
});

describe('one exclusion rule for listing and reading', () => {
  function tree() {
    const root = tempDir('trialrun-excl-');
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'secrets'));
    writeFileSync(join(root, '.env'), 'API_KEY=abcd1234efgh5678\n');
    writeFileSync(join(root, '.git', 'config'), '[remote]\n');
    writeFileSync(join(root, 'audit.json'), '{}');
    writeFileSync(join(root, 'public.txt'), 'hello');
    symlinkSync(join(root, 'public.txt'), join(root, 'secrets', 'alias.txt'));
    symlinkSync(join(root, '.env'), join(root, 'env-link.txt'));
    const access = workspaceAccess(root, { ...emptyPolicy(), block: ['secrets/**'] }, join(root, 'audit.json'));
    return { root, access };
  }

  it.each(['.env', '.git/config', 'audit.json', 'secrets/alias.txt', 'env-link.txt'])('refuses to read %s', (path) => {
    const { access } = tree();
    expect(() => access.resolve(path)).toThrow();
  });

  it('lists none of them', () => {
    const { access } = tree();
    expect(access.list().files.map((f) => f.path)).toEqual(['public.txt']);
  });

  it('reads an allowed file', () => {
    const { access } = tree();
    expect(access.resolve('public.txt').rel).toBe('public.txt');
  });
});

describe('policy validation (fail closed)', () => {
  it.each([
    ['null', 'null'],
    ['not JSON', '{ nope'],
    ['block not an array', '{"block": "x"}'],
    ['a non-string pattern', '{"block": ["ok", 3]}'],
    ['a bad term', '{"sensitive_terms": [{"term": "x", "category": "cat3"}]}'],
    ['an unknown mode', '{"mode": "loud"}'],
  ])('rejects %s', (_name, body) => {
    const root = tempDir();
    writeFileSync(join(root, POLICY_FILE), body);
    const result = readPolicy(root);
    expect(result.ok).toBe(false);
  });

  it('saves atomically, leaving no temporary files', () => {
    const root = tempDir();
    savePolicy(root, { block: ['*.env'], sensitive_terms: [] });
    expect(readdirSync(root)).toEqual([POLICY_FILE]);
  });
});

describe('walk on cyclic symlinks', () => {
  it('visits each real directory once', () => {
    const root = tempDir('trialrun-cycle-');
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    writeFileSync(join(root, 'a', 'b', 'f.txt'), 'x');
    symlinkSync(root, join(root, 'a', 'b', 'up'));
    symlinkSync(join(root, 'a'), join(root, 'a', 'b', 'sideways'));
    expect(walk(root, emptyPolicy()).files.map((f) => f.path)).toEqual(['a/b/f.txt']);
  });
});

describe('readDocument / lineRange', () => {
  const { root } = workspace();
  const slice = (start?: number, end?: number) => {
    const doc = readDocument(join(root, 'notes.md'));
    const range = lineRange(doc, start, end);
    return { ...range, text: doc.text.slice(range.start, range.end) };
  };

  it('reads the whole file', () => {
    expect(readDocument(join(root, 'notes.md')).totalLines).toBe(4);
    expect(slice()).toMatchObject({ firstLine: 1, lastLine: 4 });
    expect(slice().text).toContain('line three');
  });

  it('gives an inclusive line range as offsets and clamps it', () => {
    expect(slice(2, 2)).toMatchObject({ text: 'line two', firstLine: 2, lastLine: 2 });
    expect(slice(3, 99)).toMatchObject({ firstLine: 3, lastLine: 4 });
  });

  it('refuses PDF and Office files with a clear message', () => {
    expect(() => readDocument(join(root, 'report.pdf'))).toThrow('not parsed yet');
  });

  it('refuses binary content', () => {
    expect(() => readDocument(join(root, 'image.bin'))).toThrow('binary');
  });
});
