import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Category } from './detectors.js';

export type Habit = 'check' | 'decide' | 'protect';
export type Outcome = 'did' | 'prompted' | 'missed';
export const HABITS: readonly Habit[] = ['check', 'decide', 'protect'];

export interface GatewayEvent {
  /** ISO timestamp. */
  t: string;
  type: 'ai-open' | 'refused' | 'set-access' | 'check-text' | 'leak' | 'reset' | 'moment';
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

export const freshState = (): State => ({ startedAt: new Date().toISOString(), blocked: [], events: [] });

/**
 * The session log on disk. Every operation re-reads the file, so changes made by the assessor CLI
 * in another process apply immediately and concurrent writers don't overwrite each other's events.
 */
export class SessionStore {
  constructor(readonly path: string) {}

  load(): State {
    if (!existsSync(this.path)) return freshState();
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as State;
    } catch {
      // A corrupt log must not take the gateway down; start a fresh one.
      return freshState();
    }
  }

  save(state: State): void {
    writeFileSync(this.path, JSON.stringify(state, null, 2));
  }

  append(event: NewEvent): void {
    this.update((s) => { s.events.push({ t: new Date().toISOString(), ...event }); });
  }

  update(change: (state: State) => void): State {
    const state = this.load();
    change(state);
    this.save(state);
    return state;
  }

  reset(): State {
    const state = freshState();
    state.events.push({ t: state.startedAt, type: 'reset', note: 'session reset', by: 'assessor' });
    this.save(state);
    return state;
  }
}
