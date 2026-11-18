/**
 * The session log: append-only JSON Lines, one line per tool call or CLI command holding that
 * call's events. Writers take a lock file, so the MCP server and the policy CLI can write from
 * separate processes without losing events; a reset rewrites the file atomically. The current
 * state (start time, blocked scenario files, events) is folded from the lines on every read.
 */
import { closeSync, existsSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { Category } from './detectors.js';
import { writeFileAtomic } from './fs.js';

export type Habit = 'check' | 'decide' | 'protect';
export type Outcome = 'did' | 'prompted' | 'missed';
export const HABITS: readonly Habit[] = ['check', 'decide', 'protect'];

export interface GatewayEvent {
  /** ISO timestamp. */
  t: string;
  /**
   * leak: restricted data reached the AI. withheld: restricted data was found and redacted or
   * withheld, so it did not. policy-change: the owner edited the workspace policy.
   */
  type: 'ai-open' | 'refused' | 'set-access' | 'policy-change' | 'check-text' | 'leak' | 'withheld' | 'reset' | 'moment';
  /** Scenario file id, or workspace-relative path. */
  fileId?: string;
  sectionId?: string;
  line?: number;
  category?: Category;
  /** Detector label. Never a raw value. */
  label?: string;
  /** Redacted snippets only. */
  markers?: string[];
  trap?: string;
  channel?: 'ai-opened' | 'ai-answer';
  habit?: Habit;
  outcome?: Outcome;
  note?: string;
  by?: 'assessor' | 'ai';
}

export type NewEvent = Omit<GatewayEvent, 't'>;

export interface State {
  startedAt: string;
  /** Scenario file ids the assessor has blocked. */
  blocked: string[];
  events: GatewayEvent[];
}

const LOCK_TIMEOUT_MS = 5000;
/** A lock older than this was left by a crashed process. */
const STALE_LOCK_MS = 10_000;

const sleep = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** Fold the log into the current state: everything after the last reset, with blocks applied in order. */
export function foldEvents(events: readonly GatewayEvent[]): State {
  const lastReset = events.findLastIndex((e) => e.type === 'reset');
  const current = lastReset === -1 ? events : events.slice(lastReset);
  const blocked = new Set<string>();
  for (const e of current) {
    if (e.type !== 'set-access' || !e.fileId) continue;
    if (e.note === 'blocked') blocked.add(e.fileId);
    else blocked.delete(e.fileId);
  }
  return { startedAt: current[0]?.t ?? new Date().toISOString(), blocked: [...blocked], events: [...current] };
}

export class SessionStore {
  constructor(readonly path: string) {}

  private get lockPath() {
    return `${this.path}.lock`;
  }

  /** Run `write` while holding the lock file; waits for other writers and clears stale locks. */
  private withLock(write: () => void): void {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    let fd: number | undefined;
    while (fd === undefined) {
      try {
        fd = openSync(this.lockPath, 'wx');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const lock = statSync(this.lockPath, { throwIfNoEntry: false });
        if (lock && Date.now() - lock.mtimeMs > STALE_LOCK_MS) rmSync(this.lockPath, { force: true });
        if (Date.now() > deadline) throw new Error(`Timed out waiting for the session log lock at ${this.lockPath}.`);
        sleep(5);
      }
    }
    try {
      write();
    } finally {
      closeSync(fd);
      rmSync(this.lockPath, { force: true });
    }
  }

  /** The current state. Throws if the log is corrupt, so a damaged history is never silently replaced. */
  load(): State {
    if (!existsSync(this.path)) return foldEvents([]);
    const events: GatewayEvent[] = [];
    const lines = readFileSync(this.path, 'utf8').split('\n');
    for (const [i, line] of lines.entries()) {
      if (!line.trim()) continue;
      try {
        events.push(...(JSON.parse(line) as GatewayEvent[]));
      } catch {
        throw new Error(`Session log ${this.path} is corrupt at line ${i + 1}; move it aside to start a new session.`);
      }
    }
    return foldEvents(events);
  }

  /** Append one batch of events as a single line. */
  append(...events: NewEvent[]): void {
    if (!events.length) return;
    const t = new Date().toISOString();
    const line = `${JSON.stringify(events.map((e) => ({ t, ...e })))}\n`;
    this.withLock(() => { writeFileSync(this.path, line, { flag: 'a' }); });
  }

  /** Start a new session: the log holds only the reset event. */
  reset(): State {
    const event: GatewayEvent = { t: new Date().toISOString(), type: 'reset', note: 'session reset', by: 'assessor' };
    this.withLock(() => { writeFileAtomic(this.path, `${JSON.stringify([event])}\n`); });
    return foldEvents([event]);
  }
}
