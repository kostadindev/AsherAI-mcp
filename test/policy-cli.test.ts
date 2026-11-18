import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPolicy } from '../src/policy-cli.js';
import { SessionStore } from '../src/state.js';
import { readPolicy, type Policy } from '../src/workspace.js';

function loadPolicy(root: string): Policy {
  const result = readPolicy(root);
  if (!result.ok) throw new Error(result.error);
  return result.policy;
}
import { makeConfig, tempDir } from './helpers.js';

function run(argv: string[], config = makeConfig()) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runPolicy(argv, config, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function workspaceConfig() {
  const root = tempDir('trialrun-cli-');
  writeFileSync(join(root, 'notes.md'), 'hello');
  writeFileSync(join(root, 'credentials.txt'), 'password: x');
  return { root, config: makeConfig({ workspace: root, statePath: join(root, '.trialrun-session.jsonl') }) };
}

describe('policy CLI, workspace mode', () => {
  it('blocks and allows globs, logging each change', () => {
    const { root, config } = workspaceConfig();
    expect(run(['block', 'credentials.txt', '*.env'], config)).toMatchObject({ code: 0, out: 'Blocked: credentials.txt, *.env' });
    expect(loadPolicy(root).block).toEqual(['credentials.txt', '*.env']);
    run(['block', 'credentials.txt'], config);
    expect(loadPolicy(root).block).toEqual(['credentials.txt', '*.env']);
    expect(run(['allow', '*.env'], config).code).toBe(0);
    expect(loadPolicy(root).block).toEqual(['credentials.txt']);
    const events = new SessionStore(config.statePath).load().events;
    expect(events.map((e) => e.type)).toEqual(['policy-change', 'policy-change', 'policy-change']);
    expect(events.map((e) => e.note)).toEqual(['blocked: credentials.txt, *.env', 'blocked: credentials.txt', 'allowed: *.env']);
  });

  it('refuses to change or show an invalid policy and leaves the file untouched', () => {
    const { root, config } = workspaceConfig();
    writeFileSync(join(root, '.trialrun.json'), '{ "block": "not-a-list" }');
    for (const argv of [['show'], ['block', 'x'], ['mode', 'monitor']]) {
      const result = run(argv, config);
      expect(result.code).toBe(1);
      expect(result.err).toMatch(/is invalid/);
    }
    expect(readFileSync(join(root, '.trialrun.json'), 'utf8')).toBe('{ "block": "not-a-list" }');
  });

  it('adds, replaces and removes sensitive terms without echoing them', () => {
    const { root, config } = workspaceConfig();
    const added = run(['term', 'Project Kestrel', 'cat2'], config);
    expect(added.out).toBe('Sensitive term added as cat2: Pr***');
    run(['term', 'Project Kestrel', 'cat1'], config);
    expect(loadPolicy(root).sensitive_terms).toEqual([{ term: 'Project Kestrel', category: 'cat1' }]);
    expect(run(['untrm', 'Project Kestrel'], config).out).toBe('Sensitive term removed.');
    expect(run(['untrm', 'Project Kestrel'], config).out).toBe('No such sensitive term.');
  });

  it('sets the mode', () => {
    const { root, config } = workspaceConfig();
    expect(run(['mode', 'enforce'], config).out).toBe('Mode: enforce');
    expect(loadPolicy(root).mode).toBe('enforce');
  });

  it('shows the policy with terms redacted', () => {
    const { config } = workspaceConfig();
    run(['block', 'credentials.txt'], config);
    run(['term', 'Project Kestrel', 'cat1'], config);
    const { out } = run(['show'], config);
    expect(out).toContain('Mode: monitor (default)');
    expect(out).toContain('Blocked patterns: credentials.txt');
    expect(out).toContain('Sensitive terms: Pr*** (cat1)');
    expect(out).toContain('Visible files: 1, hidden by policy: 1');
    expect(out).not.toContain('Kestrel');
  });

  it.each([
    [['block']], [['term', 'x']], [['term', 'x', 'cat3']], [['untrm']], [['mode', 'loud']], [['frobnicate']],
  ])('rejects %j with usage and exit code 1', (argv) => {
    const { code, err } = run(argv, workspaceConfig().config);
    expect(code).toBe(1);
    expect(err).toMatch(/^Usage: trialrun-policy/);
  });

  it('prints usage and exits 0 with no command', () => {
    expect(run([], workspaceConfig().config)).toMatchObject({ code: 0, err: expect.stringMatching(/^Usage/) as unknown });
  });
});

describe('policy CLI, scenario mode', () => {
  it('blocks and allows scenario files', () => {
    const config = makeConfig();
    expect(run(['block', 'oakmere', 'passports'], config).out).toBe('Blocked: oakmere, passports');
    expect(new SessionStore(config.statePath).load().blocked).toEqual(['oakmere', 'passports']);
    run(['allow', 'oakmere'], config);
    expect(new SessionStore(config.statePath).load().blocked).toEqual(['passports']);
  });

  it('rejects unknown file ids', () => {
    const { code, err } = run(['block', 'nope']);
    expect(code).toBe(1);
    expect(err).toContain('Unknown file id: nope');
  });

  it('shows every file with its status', () => {
    const config = makeConfig();
    run(['block', 'logins'], config);
    const { out } = run(['show'], config);
    expect(out).toMatch(/blocked {2}logins/);
    expect(out).toMatch(/allowed {2}tb/);
  });

  it('resets the log', () => {
    const config = makeConfig();
    run(['block', 'logins'], config);
    expect(run(['reset'], config).out).toContain('Audit log reset');
    expect(new SessionStore(config.statePath).load().blocked).toEqual([]);
  });

  it.each([[['block']], [['frobnicate']]])('rejects %j with usage', (argv) => {
    expect(run(argv).code).toBe(1);
  });
});
