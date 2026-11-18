import { spawn } from 'node:child_process';
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { configFromEnv, STATE_FILE } from '../src/config.js';
import { SessionStore, type GatewayEvent } from '../src/state.js';
import { first, tempDir } from './helpers.js';

describe('configFromEnv', () => {
  it('defaults to a student in scenario mode, monitoring', () => {
    expect(configFromEnv({})).toEqual({ role: 'student', workspace: null, statePath: resolve('trialrun-session.jsonl'), mode: 'monitor' });
  });

  it('reads workspace, role and mode, and keeps the log inside the workspace', () => {
    const config = configFromEnv({ TRIALRUN_WORKSPACE: '/tmp/ws', TRIALRUN_ROLE: 'assessor', TRIALRUN_MODE: 'enforce' });
    expect(config).toEqual({ role: 'assessor', workspace: resolve('/tmp/ws'), statePath: join(resolve('/tmp/ws'), STATE_FILE), mode: 'enforce' });
  });

  it('lets TRIALRUN_STATE override the log path', () => {
    expect(configFromEnv({ TRIALRUN_WORKSPACE: '/tmp/ws', TRIALRUN_STATE: '/tmp/log.json' }).statePath).toBe(resolve('/tmp/log.json'));
  });

  it('ignores unknown roles and modes', () => {
    expect(configFromEnv({ TRIALRUN_ROLE: 'admin', TRIALRUN_MODE: 'loud' })).toMatchObject({ role: 'student', mode: 'monitor' });
  });
});

describe('SessionStore', () => {
  const store = () => new SessionStore(join(tempDir(), 'session.jsonl'));
  const lines = (path: string) => readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GatewayEvent[]);

  it('starts fresh when there is no file', () => {
    const s = store().load();
    expect(s.events).toEqual([]);
    expect(s.blocked).toEqual([]);
  });

  it('refuses a corrupt log instead of silently replacing the history', () => {
    const path = join(tempDir(), 'session.jsonl');
    writeFileSync(path, '[{"t":"x","type":"ai-open"}]\n{ broken\n');
    expect(() => new SessionStore(path).load()).toThrow(/corrupt at line 2/);
  });

  it('appends one timestamped line per batch', () => {
    const st = store();
    st.append({ type: 'ai-open', fileId: 'a.txt' }, { type: 'leak', fileId: 'a.txt', category: 'cat1' });
    st.append({ type: 'refused', fileId: 'b.txt' });
    st.append();
    const batches = lines(st.path);
    expect(batches.map((b) => b.map((e) => e.type))).toEqual([['ai-open', 'leak'], ['refused']]);
    expect(Date.parse(first(first(batches)).t)).not.toBeNaN();
  });

  it('folds access changes from any writer in order', () => {
    const st = store();
    st.append({ type: 'ai-open', fileId: 'a.txt' });
    new SessionStore(st.path).append(
      { type: 'set-access', fileId: 'payroll', note: 'blocked', by: 'assessor' },
      { type: 'set-access', fileId: 'loan', note: 'blocked', by: 'assessor' },
    );
    new SessionStore(st.path).append({ type: 'set-access', fileId: 'loan', note: 'allowed', by: 'assessor' });
    expect(st.load().blocked).toEqual(['payroll']);
    expect(st.load().events).toHaveLength(4);
  });

  it('clears a stale lock left by a crashed writer', () => {
    const st = store();
    const lock = `${st.path}.lock`;
    writeFileSync(lock, '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    st.append({ type: 'ai-open', fileId: 'a.txt' });
    expect(st.load().events).toHaveLength(1);
    expect(existsSync(lock)).toBe(false);
  });

  it('loses no events when two processes append at once', async () => {
    const st = store();
    const worker = fileURLToPath(new URL('./fixtures/append-worker.ts', import.meta.url));
    const run = (id: string) => new Promise<number | null>((done, fail) => {
      const child = spawn(process.execPath, ['--import', 'tsx', worker, st.path, '150', id], { stdio: 'inherit' });
      child.on('error', fail);
      child.on('exit', done);
    });
    expect(await Promise.all([run('a'), run('b')])).toEqual([0, 0]);
    const batches = lines(st.path);
    expect(batches).toHaveLength(300);
    expect(batches.every((b) => b.length === 2)).toBe(true);
    const opened = st.load().events.filter((e) => e.type === 'ai-open').map((e) => e.fileId);
    expect(new Set(opened).size).toBe(300);
  }, 30_000);

  it('resets to a log holding only the reset event', () => {
    const st = store();
    st.append({ type: 'ai-open', fileId: 'a.txt' });
    st.append({ type: 'set-access', fileId: 'x', note: 'blocked', by: 'assessor' });
    const fresh = st.reset();
    expect(fresh.blocked).toEqual([]);
    expect(st.load().events.map((e) => e.type)).toEqual(['reset']);
  });
});
