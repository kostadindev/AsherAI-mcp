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
import { redactValue } from './detectors.js';
import { FILES } from './scenario/scenario.js';
import { SessionStore } from './state.js';
import { loadPolicy, savePolicy, walk } from './workspace.js';

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
  const policy = loadPolicy(root);
  switch (cmd) {
    case 'show': {
      const { files, hidden } = walk(root, policy);
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
      store.append({ type: 'set-access', fileId: args.join(', '), note: cmd === 'block' ? 'blocked' : 'allowed', by: 'assessor' });
      io.out(`${cmd === 'block' ? 'Blocked' : 'Allowed'}: ${args.join(', ')}`);
      return 0;
    }
    case 'term': {
      const [term, category] = args;
      if (!term || (category !== 'cat1' && category !== 'cat2')) return usage(io, WORKSPACE_USAGE, cmd);
      policy.sensitive_terms = [...policy.sensitive_terms.filter((t) => t.term !== term), { term, category }];
      savePolicy(root, policy);
      io.out(`Sensitive term added as ${category}: ${redactValue(term)}`);
      return 0;
    }
    case 'untrm': {
      if (!args[0]) return usage(io, WORKSPACE_USAGE, cmd);
      const before = policy.sensitive_terms.length;
      policy.sensitive_terms = policy.sensitive_terms.filter((t) => t.term !== args[0]);
      savePolicy(root, policy);
      io.out(before === policy.sensitive_terms.length ? 'No such sensitive term.' : 'Sensitive term removed.');
      return 0;
    }
    case 'mode': {
      const mode = args[0];
      if (mode !== 'monitor' && mode !== 'enforce') return usage(io, WORKSPACE_USAGE, cmd);
      policy.mode = mode;
      savePolicy(root, policy);
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
      store.update((s) => {
        for (const id of args) {
          s.blocked = cmd === 'allow' ? s.blocked.filter((x) => x !== id) : [...new Set([...s.blocked, id])];
          s.events.push({ t: new Date().toISOString(), type: 'set-access', fileId: id, note: cmd === 'allow' ? 'allowed' : 'blocked', by: 'assessor' });
        }
      });
      io.out(`${cmd === 'allow' ? 'Allowed' : 'Blocked'}: ${args.join(', ')}`);
      return 0;
    }
    default:
      return usage(io, SCENARIO_USAGE, cmd);
  }
}
