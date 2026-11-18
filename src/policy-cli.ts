/**
 * Assessor / owner controls for the gateway. The AI can't reach these.
 *
 * Scenario mode edits the session log:
 *   trialrun-policy show | block <file_id…> | allow <file_id…> | reset
 *
 * Workspace mode edits <workspace>/.trialrun.json:
 *   trialrun-policy show
 *   trialrun-policy block "secrets/**" "*.env" credentials.txt
 *   trialrun-policy allow credentials.txt
 *   trialrun-policy term "Project Kestrel" cat1
 *   trialrun-policy untrm "Project Kestrel"
 *   trialrun-policy mode enforce
 *   trialrun-policy reset            (clears the audit log; the policy file is kept)
 */
import { join } from 'node:path';
import { POLICY_FILE, type GatewayConfig } from './config.js';
import { MIN_TERM_LENGTH, redactValue } from './detectors.js';
import { FILES } from './scenario/scenario.js';
import { SessionStore } from './state.js';
import { readPolicy, savePolicy, workspaceAccess } from './workspace.js';

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

const WORKSPACE_USAGE = 'Usage: trialrun-policy <show | block <glob…> | allow <glob…> | term <text> <cat1|cat2> | untrm <text> | mode <monitor|enforce> | reset>';
const SCENARIO_USAGE = 'Usage: trialrun-policy <show | block <file_id…> | allow <file_id…> | reset>';

/** Run one policy command. Returns the process exit code. */
export function runPolicy(argv: readonly string[], config: GatewayConfig, io: Io): number {
  const [cmd, ...args] = argv;
  const store = new SessionStore(config.statePath);
  if (cmd === 'reset') {
    store.reset();
    io.out(`Audit log reset (${config.statePath}).`);
    return 0;
  }
  return config.workspace ? workspaceCommand(config.workspace, cmd, args, store, config, io) : scenarioCommand(cmd, args, store, config, io);
}

function usage(io: Io, text: string, cmd: string | undefined): number {
  io.err(text);
  return cmd ? 1 : 0;
}

function workspaceCommand(root: string, cmd: string | undefined, args: string[], store: SessionStore, config: GatewayConfig, io: Io): number {
  const read = readPolicy(root);
  if (!read.ok) {
    // Never overwrite a policy we couldn't parse: the owner may lose blocks they meant to keep.
    io.err(`Policy file ${join(root, POLICY_FILE)} is invalid: ${read.error}. The gateway refuses all reads until it is fixed.`);
    return 1;
  }
  const policy = read.policy;
  const changed = (note: string) => { store.append({ type: 'policy-change', note, by: 'assessor' }); };
  switch (cmd) {
    case 'show': {
      const { files, hidden } = workspaceAccess(root, policy, config.statePath).list();
      const terms = policy.sensitive_terms.map((t) => `${redactValue(t.term)} (${t.category})`);
      io.out(`Workspace: ${root}`);
      io.out(`Policy: ${join(root, POLICY_FILE)}`);
      io.out(`State: ${config.statePath}`);
      io.out(`Mode: ${policy.mode ?? `${config.mode} (default)`}`);
      io.out(`Blocked patterns: ${policy.block.length ? policy.block.join(', ') : 'none'}`);
      io.out(`Sensitive terms: ${terms.length ? terms.join(', ') : 'none'}`);
      io.out(`Visible files: ${files.length}, hidden by policy: ${hidden}`);
      return 0;
    }
    case 'block':
    case 'allow': {
      if (!args.length) return usage(io, WORKSPACE_USAGE, cmd);
      policy.block = cmd === 'block' ? [...new Set([...policy.block, ...args])] : policy.block.filter((g) => !args.includes(g));
      savePolicy(root, policy);
      changed(`${cmd === 'block' ? 'blocked' : 'allowed'}: ${args.join(', ')}`);
      io.out(`${cmd === 'block' ? 'Blocked' : 'Allowed'}: ${args.join(', ')}`);
      return 0;
    }
    case 'term': {
      const [term, category] = args;
      if (!term || (category !== 'cat1' && category !== 'cat2')) return usage(io, WORKSPACE_USAGE, cmd);
      if (term.trim().length < MIN_TERM_LENGTH) {
        io.err(`A sensitive term must be at least ${MIN_TERM_LENGTH} characters; shorter ones would match inside ordinary words.`);
        return 1;
      }
      policy.sensitive_terms = [...policy.sensitive_terms.filter((t) => t.term !== term), { term, category }];
      savePolicy(root, policy);
      changed(`sensitive term added (${category})`);
      io.out(`Sensitive term added as ${category}: ${redactValue(term)}`);
      return 0;
    }
    case 'untrm': {
      if (!args[0]) return usage(io, WORKSPACE_USAGE, cmd);
      const before = policy.sensitive_terms.length;
      policy.sensitive_terms = policy.sensitive_terms.filter((t) => t.term !== args[0]);
      const removed = before !== policy.sensitive_terms.length;
      if (removed) {
        savePolicy(root, policy);
        changed('sensitive term removed');
      }
      io.out(removed ? 'Sensitive term removed.' : 'No such sensitive term.');
      return 0;
    }
    case 'mode': {
      const mode = args[0];
      if (mode !== 'monitor' && mode !== 'enforce') return usage(io, WORKSPACE_USAGE, cmd);
      policy.mode = mode;
      savePolicy(root, policy);
      changed(`mode: ${mode}`);
      io.out(`Mode: ${mode}`);
      return 0;
    }
    default:
      return usage(io, WORKSPACE_USAGE, cmd);
  }
}

function scenarioCommand(cmd: string | undefined, args: string[], store: SessionStore, config: GatewayConfig, io: Io): number {
  switch (cmd) {
    case 'show': {
      const state = store.load();
      io.out(`State: ${config.statePath}`);
      io.out(`Started: ${state.startedAt}   events: ${state.events.length}`);
      for (const f of FILES) io.out(`  ${state.blocked.includes(f.id) ? 'blocked' : 'allowed'}  ${f.id.padEnd(11)} ${f.folder} / ${f.name}`);
      return 0;
    }
    case 'block':
    case 'allow': {
      if (!args.length) return usage(io, SCENARIO_USAGE, cmd);
      const unknown = args.filter((id) => !FILES.some((f) => f.id === id));
      if (unknown.length) {
        io.err(`Unknown file id: ${unknown.join(', ')}. Known: ${FILES.map((f) => f.id).join(', ')}`);
        return 1;
      }
      const note = cmd === 'allow' ? 'allowed' : 'blocked';
      store.append(...args.map((id) => ({ type: 'set-access' as const, fileId: id, note, by: 'assessor' as const })));
      io.out(`${cmd === 'allow' ? 'Allowed' : 'Blocked'}: ${args.join(', ')}`);
      return 0;
    }
    default:
      return usage(io, SCENARIO_USAGE, cmd);
  }
}
