#!/usr/bin/env node
/**
 * Assessor / owner CLI for the TrialRun MCP gateway. The AI can't reach these controls.
 *
 * Scenario mode (default), edits the session state file:
 *   trialrun-policy show
 *   trialrun-policy block oakmere passports logins
 *   trialrun-policy allow oakmere
 *   trialrun-policy reset
 *
 * Workspace mode (TRIALRUN_WORKSPACE set), edits <workspace>/.trialrun.json:
 *   trialrun-policy show
 *   trialrun-policy block "secrets/**" "*.env" credentials.txt
 *   trialrun-policy allow credentials.txt
 *   trialrun-policy term "Project Kestrel" cat1
 *   trialrun-policy mode enforce
 *   trialrun-policy reset            (clears the audit log; the policy file is kept)
 */
import { FILES } from './scenario/scenario.js';
import { STATE_PATH, appendEvent, freshState, loadState, saveState } from './state.js';
import { WORKSPACE, loadPolicy, savePolicy, walk } from './workspace.js';
import { redactValue } from './detectors.js';

const [cmd, ...args] = process.argv.slice(2);

function resetLog() {
  const s = freshState();
  saveState(s);
  appendEvent(s, { type: 'reset', note: 'session reset', by: 'assessor' });
  console.log(`Audit log reset (${STATE_PATH}).`);
}

if (WORKSPACE) {
  const root = WORKSPACE;
  const usage = 'Usage: trialrun-policy <show | block <glob…> | allow <glob…> | term <text> <cat1|cat2> | untrm <text> | mode <monitor|enforce> | reset>';
  const p = loadPolicy(root);
  switch (cmd) {
    case 'show': {
      const { files, hidden } = walk(root, p);
      console.log(`Workspace: ${root}\nPolicy: ${root}/.trialrun.json\nState: ${STATE_PATH}`);
      console.log(`Mode: ${p.mode ?? 'monitor (default)'}`);
      console.log(`Blocked patterns: ${p.block.length ? p.block.join(', ') : 'none'}`);
      console.log(`Sensitive terms: ${p.sensitive_terms.length ? p.sensitive_terms.map((t) => `${redactValue(t.term)} (${t.category})`).join(', ') : 'none'}`);
      console.log(`Visible files: ${files.length}, hidden by policy: ${hidden}`);
      break;
    }
    case 'block':
    case 'allow': {
      if (!args.length) { console.error(usage); process.exit(1); }
      p.block = cmd === 'block' ? [...new Set([...p.block, ...args])] : p.block.filter((g) => !args.includes(g));
      savePolicy(root, p);
      appendEvent(loadState(), { type: 'set-access', fileId: args.join(', '), note: cmd === 'block' ? 'blocked' : 'allowed', by: 'assessor' });
      console.log(`${cmd === 'block' ? 'Blocked' : 'Allowed'}: ${args.join(', ')}`);
      break;
    }
    case 'term': {
      const [term, cat] = args;
      if (!term || (cat !== 'cat1' && cat !== 'cat2')) { console.error(usage); process.exit(1); }
      p.sensitive_terms = [...p.sensitive_terms.filter((t) => t.term !== term), { term, category: cat }];
      savePolicy(root, p);
      console.log(`Sensitive term added as ${cat}: ${redactValue(term)}`);
      break;
    }
    case 'untrm': {
      p.sensitive_terms = p.sensitive_terms.filter((t) => t.term !== args[0]);
      savePolicy(root, p);
      console.log('Sensitive term removed.');
      break;
    }
    case 'mode': {
      if (args[0] !== 'monitor' && args[0] !== 'enforce') { console.error(usage); process.exit(1); }
      p.mode = args[0];
      savePolicy(root, p);
      console.log(`Mode: ${p.mode}`);
      break;
    }
    case 'reset':
      resetLog();
      break;
    default:
      console.error(usage);
      process.exit(cmd ? 1 : 0);
  }
} else {
  const usage = 'Usage: trialrun-policy <show | block <file_id…> | allow <file_id…> | reset>';
  switch (cmd) {
    case 'show': {
      const s = loadState();
      console.log(`State: ${STATE_PATH}`);
      console.log(`Started: ${s.startedAt}   events: ${s.events.length}`);
      for (const f of FILES) console.log(`  ${s.blocked.includes(f.id) ? 'blocked' : 'allowed'}  ${f.id.padEnd(11)} ${f.folder} / ${f.name}`);
      break;
    }
    case 'block':
    case 'allow': {
      if (!args.length) { console.error(usage); process.exit(1); }
      const unknown = args.filter((id) => !FILES.some((f) => f.id === id));
      if (unknown.length) {
        console.error(`Unknown file id: ${unknown.join(', ')}. Known: ${FILES.map((f) => f.id).join(', ')}`);
        process.exit(1);
      }
      const s = loadState();
      for (const id of args) {
        s.blocked = cmd === 'allow' ? s.blocked.filter((x) => x !== id) : [...new Set([...s.blocked, id])];
        appendEvent(s, { type: 'set-access', fileId: id, note: cmd === 'allow' ? 'allowed' : 'blocked', by: 'assessor' });
      }
      console.log(`${cmd === 'allow' ? 'Allowed' : 'Blocked'}: ${args.join(', ')}`);
      break;
    }
    case 'reset':
      resetLog();
      break;
    default:
      console.error(usage);
      process.exit(cmd ? 1 : 0);
  }
}
