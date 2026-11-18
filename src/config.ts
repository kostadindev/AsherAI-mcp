import { join, resolve } from 'node:path';

export type Role = 'student' | 'assessor';
export type Mode = 'monitor' | 'enforce';

/** Owner-controlled policy file inside a workspace. Never listed or served to the AI. */
export const POLICY_FILE = '.trialrun.json';
/** Default session log inside a workspace. Never listed or served to the AI. */
export const STATE_FILE = '.trialrun-session.json';

export interface GatewayConfig {
  /** "assessor" also registers the tools that change the access policy or reset the log. */
  role: Role;
  /** Absolute path of a real folder (workspace mode), or null for the built-in scenario. */
  workspace: string | null;
  /** Absolute path of the JSON session log. */
  statePath: string;
  /** Default mode; in workspace mode the policy file can override it. */
  mode: Mode;
}

/**
 * TRIALRUN_WORKSPACE  folder to serve (switches to workspace mode)
 * TRIALRUN_STATE      session log path (default: <workspace>/.trialrun-session.json, else ./trialrun-session.json)
 * TRIALRUN_MODE       "monitor" (default) or "enforce"
 * TRIALRUN_ROLE       "student" (default) or "assessor"
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const workspace = env.TRIALRUN_WORKSPACE ? resolve(env.TRIALRUN_WORKSPACE) : null;
  return {
    role: env.TRIALRUN_ROLE === 'assessor' ? 'assessor' : 'student',
    workspace,
    statePath: resolve(env.TRIALRUN_STATE ?? (workspace ? join(workspace, STATE_FILE) : 'trialrun-session.json')),
    mode: env.TRIALRUN_MODE === 'enforce' ? 'enforce' : 'monitor',
  };
}
