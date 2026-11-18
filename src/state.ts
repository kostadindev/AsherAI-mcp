/** Persistent gateway state shared by the MCP server (src/server.ts) and the assessor CLI (src/policy.ts). */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Category } from './scenario/types.js';

/**
 * Default location: in workspace mode a dotfile inside the workspace (never listed or served),
 * otherwise ./trialrun-session.json. TRIALRUN_STATE overrides both.
 */
export const STATE_PATH = resolve(
  process.env.TRIALRUN_STATE
    ?? (process.env.TRIALRUN_WORKSPACE ? join(process.env.TRIALRUN_WORKSPACE, '.trialrun-session.json') : './trialrun-session.json'),
);

export type Habit = 'check' | 'decide' | 'protect';
export type Outcome = 'did' | 'prompted' | 'missed';

export interface GatewayEvent {
  t: string; // ISO timestamp
  type: 'ai-open' | 'refused' | 'set-access' | 'check-text' | 'leak' | 'reset' | 'moment';
  /** Scenario file id, or workspace-relative path. */
  fileId?: string;
  sectionId?: string;
  line?: number;
  category?: Category;
  /** Detector label (workspace mode) or "restricted section" (scenario mode). Never a raw value. */
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

export interface State {
  startedAt: string;
  blocked: string[];
  events: GatewayEvent[];
}

export const freshState = (): State => ({ startedAt: new Date().toISOString(), blocked: [], events: [] });

export function loadState(): State {
  if (existsSync(STATE_PATH)) {
    try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State; } catch { /* fall through */ }
  }
  return freshState();
}

export const saveState = (s: State) => writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));

export function appendEvent(s: State, e: Omit<GatewayEvent, 't'>) {
  s.events.push({ t: new Date().toISOString(), ...e });
  saveState(s);
}
