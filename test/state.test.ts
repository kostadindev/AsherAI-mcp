import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configFromEnv, STATE_FILE } from '../src/config.js';
import { SessionStore, type State } from '../src/state.js';
import { first, tempDir } from './helpers.js';

describe('configFromEnv', () => {
  it('defaults to a student in scenario mode, monitoring', () => {
    expect(configFromEnv({})).toEqual({ role: 'student', workspace: null, statePath: resolve('trialrun-session.json'), mode: 'monitor' });
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
  const store = () => new SessionStore(join(tempDir(), 'session.json'));

  it('starts fresh when there is no file', () => {
    const s = store().load();
    expect(s.events).toEqual([]);
    expect(s.blocked).toEqual([]);
  });

  it('starts fresh when the file is corrupt', () => {
    const path = join(tempDir(), 'session.json');
    writeFileSync(path, '{ broken');
    expect(new SessionStore(path).load().events).toEqual([]);
  });

  it('appends timestamped events and persists them', () => {
    const st = store();
    st.append({ type: 'ai-open', fileId: 'a.txt' });
    st.append({ type: 'refused', fileId: 'b.txt' });
    const { events } = JSON.parse(readFileSync(st.path, 'utf8')) as State;
    expect(events.map((e) => e.type)).toEqual(['ai-open', 'refused']);
    expect(Date.parse(first(events).t)).not.toBeNaN();
  });

  it('applies updates from another store on the same file (another process)', () => {
    const st = store();
    st.append({ type: 'ai-open', fileId: 'a.txt' });
    new SessionStore(st.path).update((s) => { s.blocked.push('payroll'); });
    expect(st.load().blocked).toEqual(['payroll']);
    expect(st.load().events).toHaveLength(1);
  });

  it('resets to a log holding only the reset event', () => {
    const st = store();
    st.append({ type: 'ai-open', fileId: 'a.txt' });
    st.update((s) => { s.blocked.push('x'); });
    const fresh = st.reset();
    expect(fresh.blocked).toEqual([]);
    expect(st.load().events.map((e) => e.type)).toEqual(['reset']);
  });
});
