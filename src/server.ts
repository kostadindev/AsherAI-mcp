#!/usr/bin/env node
/**
 * TrialRun MCP gateway: a data-stewardship monitor/enforcer that sits between ANY MCP-capable AI
 * client (Claude Desktop, Claude Code, an IDE assistant…) and files.
 *
 * Two modes:
 *   - Scenario mode (default): serves the Fernvale Kitchens assessment desktop, with planted markers.
 *   - Workspace mode (TRIALRUN_WORKSPACE=/abs/path): serves a real folder for real work. Generic
 *     detectors (credentials, cards, passports, emails, phones, NI numbers, addresses, IBANs…) flag
 *     restricted data the AI reads or repeats; an owner-controlled .trialrun.json blocks paths.
 *
 * Every file the AI opens is logged with a timestamp. Logs and reports hold labels and redacted
 * snippets only, never raw restricted values. A coaching skill can log habit moments
 * (record_moment) and anyone can read the AI literacy report (get_report / trialrun://report).
 *
 *   trialrun-mcp
 *
 * Env:
 *   TRIALRUN_WORKSPACE  absolute path of a real folder (switches to workspace mode)
 *   TRIALRUN_STATE      path of the JSON session file
 *   TRIALRUN_MODE       "monitor" (default: log + flag, content returned) | "enforce" (restricted data withheld)
 *   TRIALRUN_ROLE       "student" (default) | "assessor"
 *
 * Role separation: in the default student-facing role the AI can only read and self-check. It can't
 * change the access policy or reset the audit log. Policy changes go through the assessor CLI
 * (src/policy.ts) or TRIALRUN_ROLE=assessor.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { FILES, FOLDERS, SCENARIO, fileRestriction, scanMarkers, sectionText } from './scenario/scenario.js';
import { CRITERIA, FILE_TRAP, SECTION_TRAP } from './scenario/model.js';
import { STATE_PATH, appendEvent, freshState, loadState, saveState, type GatewayEvent, type Habit } from './state.js';
import { detect, redact, redactValue, type Hit } from './detectors.js';
import { WORKSPACE, isBlockedPath, loadPolicy, readText, safeResolve, walk } from './workspace.js';

const ROLE = process.env.TRIALRUN_ROLE === 'assessor' ? 'assessor' : 'student';
const envMode = () => (process.env.TRIALRUN_MODE === 'enforce' ? 'enforce' : 'monitor');
/** In workspace mode the owner's policy file may set the mode; otherwise the env var does. */
const currentMode = () => (WORKSPACE ? loadPolicy(WORKSPACE).mode ?? envMode() : envMode());

/* ───────────────────────── persistent session state ───────────────────────── */

let state = loadState();
/** Re-read before each operation so assessor CLI changes (blocks, resets) apply immediately. */
const refresh = () => { state = loadState(); };
const log = (e: Omit<GatewayEvent, 't'>) => appendEvent(state, e);

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const json = (o: unknown) => text(JSON.stringify(o, null, 2));
const err = (s: string) => ({ ...text(s), isError: true });

function stewardship() {
  const leaks = state.events.filter((e) => e.type === 'leak');
  const cat1 = leaks.some((l) => l.category === 'cat1');
  const cat2 = leaks.some((l) => l.category === 'cat2');
  const score = cat1 ? 'Zero' : cat2 ? 'Partial' : 'Full';
  const reason = cat1 ? 'Category 1 (prohibited) data reached the AI.'
    : cat2 ? 'Category 2 (not-for-AI) data reached the AI.'
    : 'No restricted data reached the AI so far.';
  return { leaks, score, reason };
}

/** Detect restricted data in free text: generic detectors, plus planted markers in scenario mode. */
function scanText(body: string): Hit[] {
  const hits = detect(body, WORKSPACE ? loadPolicy(WORKSPACE).sensitive_terms : []);
  if (!WORKSPACE) {
    const lower = body.toLowerCase();
    for (const m of scanMarkers(body)) {
      const index = lower.indexOf(m.marker.toLowerCase());
      hits.push({ category: m.category, label: `restricted data from ${FILES.find((f) => f.id === m.fileId)?.name ?? m.fileId}`, match: redactValue(m.marker), index, length: m.marker.length, line: body.slice(0, index).split('\n').length });
    }
  }
  return hits;
}

/** Remove restricted values from a note before it is stored. */
const cleanNote = (note: string) => redact(note, scanText(note)).slice(0, 300);

/* ───────────────────────── server ───────────────────────── */

const server = new McpServer({ name: 'trialrun-gateway', version: '0.2.0' });

if (WORKSPACE) {
  /* ───── workspace mode: a real folder ───── */
  const root = WORKSPACE;

  server.registerTool('list_files', {
    title: 'List workspace files',
    description: 'List the files in the workspace the AI may read (path, size in bytes, type). Files the owner has blocked are hidden. Every read is logged by the TrialRun gateway.',
    inputSchema: { prefix: z.string().optional().describe('Only list paths starting with this folder, e.g. "reports/"') },
  }, async ({ prefix }) => {
    const policy = loadPolicy(root);
    const { files, truncated, hidden } = walk(root, policy);
    const p = (prefix ?? '').replace(/^\.?\/+/, '');
    return json({ workspace: root, files: files.filter((f) => !p || f.path.startsWith(p)), truncated, hiddenByPolicy: hidden });
  });

  server.registerTool('read_file', {
    title: 'Read a workspace file',
    description: 'Read a text file (optionally a line range) from the workspace. The gateway logs the read and flags restricted data in what it returns. Blocked files are refused; PDFs and Office files are not parsed yet.',
    inputSchema: {
      path: z.string().describe('Path relative to the workspace, from list_files'),
      start_line: z.number().int().min(1).optional(),
      end_line: z.number().int().min(1).optional(),
    },
  }, async ({ path, start_line, end_line }) => {
    refresh();
    const policy = loadPolicy(root);
    let abs: string, rel: string;
    try { ({ abs, rel } = safeResolve(root, path)); } catch (e) { return err((e as Error).message); }
    if (isBlockedPath(rel, policy)) {
      log({ type: 'refused', fileId: rel, note: 'blocked by workspace policy' });
      return err(`Access denied: "${rel}" is blocked by the workspace policy.`);
    }
    let out: { text: string; firstLine: number; totalLines: number };
    try { out = readText(abs, start_line, end_line); } catch (e) {
      const msg = /\.(pdf|docx?|xlsx?|pptx?)$/i.test(rel) ? 'PDF and Office files are not parsed yet. Export to text or CSV first.' : (e as Error).message;
      return err(`${rel}: ${msg}`);
    }
    const ranged = start_line !== undefined || end_line !== undefined;
    log({ type: 'ai-open', fileId: rel, sectionId: ranged ? `lines ${out.firstLine}-${out.firstLine + out.text.split('\n').length - 1}` : undefined });
    const hits = detect(out.text, policy.sensitive_terms);
    for (const h of hits) log({ type: 'leak', channel: 'ai-opened', fileId: rel, line: h.line + out.firstLine - 1, category: h.category, label: h.label, markers: [h.match] });
    const enforce = currentMode() === 'enforce';
    const body = enforce ? redact(out.text, hits) : out.text;
    let note = '';
    if (hits.length) note = `\n\n[Gateway: ${hits.length} restricted item(s) ${enforce ? 'redacted' : 'flagged'}: ${[...new Set(hits.map((h) => h.label))].join(', ')}]`;
    return text(`# ${rel} (lines ${out.firstLine}-${out.firstLine + out.text.split('\n').length - 1} of ${out.totalLines})\n${body}${note}`);
  });

  server.registerTool('get_access_policy', {
    title: 'Get access policy',
    description: 'Show the workspace policy: blocked path patterns, the number of owner-defined sensitive terms, and the mode.',
    inputSchema: {},
  }, async () => {
    const p = loadPolicy(root);
    return json({ mode: currentMode(), role: ROLE, blocked: p.block, sensitiveTerms: p.sensitive_terms.length });
  });
} else {
  /* ───── scenario mode: the Fernvale Kitchens assessment desktop ───── */
  const isBlocked = (id: string) => state.blocked.includes(id);
  const visibleFiles = () => FILES.filter((f) => !isBlocked(f.id));

  server.registerTool('list_files', {
    title: 'List workspace files',
    description: `List the files on the ${SCENARIO.client} assessment desktop that the AI is allowed to see. Files the student has blocked are hidden.`,
    inputSchema: { folder: z.enum(FOLDERS).optional().describe('Restrict to one folder') },
  }, async ({ folder }) => {
    refresh();
    const files = visibleFiles().filter((f) => !folder || f.folder === folder)
      .map((f) => ({ id: f.id, name: f.name, folder: f.folder, sections: f.sections.map((s) => s.id) }));
    return json({ client: SCENARIO.client, yearEnd: SCENARIO.yearEnd, files });
  });

  server.registerTool('read_file', {
    title: 'Read a workspace file',
    description: 'Read a file (or one section of it) from the assessment desktop. Every read is logged by the gateway. Blocked files are refused.',
    inputSchema: {
      file_id: z.string().describe('File id from list_files'),
      section_id: z.string().optional().describe('Read only this section (e.g. the loan repayment schedule)'),
    },
  }, async ({ file_id, section_id }) => {
    refresh();
    const f = FILES.find((x) => x.id === file_id);
    if (!f) return err(`No such file: ${file_id}`);
    if (isBlocked(f.id)) {
      log({ type: 'refused', fileId: f.id, note: 'blocked by student access policy' });
      return err(`Access denied: the student has blocked "${f.name}".`);
    }
    const sections = section_id ? f.sections.filter((s) => s.id === section_id) : f.sections;
    if (!sections.length) return err(`File ${f.id} has no section "${section_id}". Sections: ${f.sections.map((s) => s.id).join(', ')}`);

    log({ type: 'ai-open', fileId: f.id, sectionId: section_id });
    const parts: string[] = [];
    const withheld: string[] = [];
    for (const s of sections) {
      if (s.restricted) {
        const trap = SECTION_TRAP[`${f.id}/${s.id}`] ?? FILE_TRAP[f.id];
        if (envMode() === 'enforce') {
          withheld.push(s.title ?? s.id);
          log({ type: 'refused', fileId: f.id, sectionId: s.id, category: s.restricted, note: 'restricted section withheld (enforce mode)' });
          continue;
        }
        log({ type: 'leak', channel: 'ai-opened', fileId: f.id, sectionId: s.id, category: s.restricted, label: `restricted data from ${f.name}`, markers: (s.markers ?? []).map(redactValue), trap });
      }
      parts.push(sectionText(f, s.id).replace(/^# .*\n?/, ''));
    }
    let out = `# ${f.name}\n${parts.join('\n')}`;
    if (withheld.length) out += `\n\n[Gateway: ${withheld.length} restricted section(s) withheld: ${withheld.join('; ')}]`;
    return text(out);
  });

  server.registerTool('get_access_policy', {
    title: 'Get access policy',
    description: 'Show the student\'s access checklist: which files the AI may and may not open.',
    inputSchema: {},
  }, async () => {
    refresh();
    return json({ mode: envMode(), role: ROLE, files: FILES.map((f) => ({ id: f.id, name: f.name, folder: f.folder, allowed: !isBlocked(f.id) })) });
  });

  if (ROLE === 'assessor') {
    server.registerTool('set_access', {
      title: 'Allow or block a file',
      description: 'Assessor control: allow or block the AI from opening a file. Only registered when TRIALRUN_ROLE=assessor.',
      inputSchema: { file_id: z.string(), allowed: z.boolean() },
    }, async ({ file_id, allowed }) => {
      refresh();
      if (!FILES.some((f) => f.id === file_id)) return err(`No such file: ${file_id}`);
      state.blocked = allowed ? state.blocked.filter((x) => x !== file_id) : [...new Set([...state.blocked, file_id])];
      log({ type: 'set-access', fileId: file_id, note: allowed ? 'allowed' : 'blocked', by: 'assessor' });
      return text(`${file_id} is now ${allowed ? 'ALLOWED' : 'BLOCKED'}.`);
    });
  }
}

/* ───────────────────────── shared tools ───────────────────────── */

server.registerTool('check_text', {
  title: 'Scan text for restricted data',
  description: 'Scan an outgoing AI answer, a draft, or text the user pasted, for restricted data (credentials, cards, personal details, sensitive terms) before it is shown or saved. Hits are logged as leaks into the AI answer. Returns labels and redacted snippets only.',
  inputSchema: { text: z.string(), record: z.boolean().optional().describe('Log hits as answer leaks (default true)') },
}, async ({ text: body, record }) => {
  refresh();
  const hits = scanText(body);
  log({ type: 'check-text', note: `${hits.length} hit(s)` });
  if (record !== false) {
    for (const h of hits) log({ type: 'leak', channel: 'ai-answer', category: h.category, label: h.label, line: h.line, markers: [h.match] });
  }
  return json({ clean: hits.length === 0, hits: hits.map(({ category, label, match, line }) => ({ category, label, match, line })) });
});

server.registerTool('record_moment', {
  title: 'Record an AI-literacy habit moment',
  description: 'For a coaching skill: log a moment for one of three habits. habit: "check" (verifying AI output), "decide" (keeping a judgement call), "protect" (keeping restricted data out). outcome: "did" (the user did it unprompted), "prompted" (after a coaching note), "missed". Restricted values in the note are redacted before storage.',
  inputSchema: {
    habit: z.enum(['check', 'decide', 'protect']),
    outcome: z.enum(['did', 'prompted', 'missed']),
    note: z.string().max(2000).describe('One sentence describing what happened, without personal data'),
  },
}, async ({ habit, outcome, note }) => {
  refresh();
  const clean = cleanNote(note);
  log({ type: 'moment', habit, outcome, note: clean, by: 'ai' });
  return text(`Recorded ${habit}/${outcome}: ${clean}`);
});

const HABIT_NAME: Record<Habit, string> = { check: 'Check the output', decide: 'Keep the decision', protect: 'Protect the data' };

function report(): string {
  refresh();
  const { leaks, score, reason } = stewardship();
  const reads = [...new Set(state.events.filter((e) => e.type === 'ai-open').map((e) => e.fileId!))];
  const refused = state.events.filter((e) => e.type === 'refused').length;
  const lines: string[] = [];
  lines.push(`# AI literacy report`, '', `Session started ${state.startedAt}. ${WORKSPACE ? 'Workspace mode.' : `Scenario: ${SCENARIO.client}.`}`, '');
  lines.push(`## Data stewardship: ${score}`, reason, '');
  if (leaks.length) {
    const groups = new Map<string, number>();
    for (const l of leaks) {
      const k = `${l.category === 'cat1' ? 'Category 1' : 'Category 2'} | ${l.label ?? 'restricted data'} | ${l.channel === 'ai-answer' ? 'in an AI answer or pasted text' : 'opened by the AI'}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    lines.push('| Category | What | How | Count |', '|---|---|---|---|');
    for (const [k, n] of groups) lines.push(`| ${k} | ${n} |`);
    lines.push('');
  }
  lines.push(`## Files the AI read (${reads.length})`, reads.length ? reads.map((r) => `- ${r}`).join('\n') : '- none', refused ? `\n${refused} read(s) refused by the access policy.` : '', '');
  lines.push('## Habits');
  for (const h of ['check', 'decide', 'protect'] as Habit[]) {
    const m = state.events.filter((e) => e.type === 'moment' && e.habit === h);
    const n = (o: string) => m.filter((e) => e.outcome === o).length;
    lines.push(`### ${HABIT_NAME[h]}: ${n('did')} did, ${n('prompted')} after a prompt, ${n('missed')} missed`);
    for (const e of m.slice(-3)) lines.push(`- ${e.outcome}: ${e.note}`);
    if (!m.length) lines.push('- no moments recorded');
  }
  return lines.join('\n');
}

server.registerTool('get_report', {
  title: 'AI literacy report',
  description: 'A short markdown report for the user: data stewardship score, restricted data by type and channel (counts only, no values), files read, and the three habits with recent examples.',
  inputSchema: {},
}, async () => text(report()));

server.registerTool('get_audit_log', {
  title: 'Audit log',
  description: 'Timestamped gateway events, restricted-data leak summary and a preliminary Data Stewardship score (Full / Partial / Zero). Contains labels and redacted snippets only.',
  inputSchema: {},
}, async () => {
  refresh();
  const { leaks, score, reason } = stewardship();
  const sources = [...new Set(leaks.map((l) => l.fileId).filter(Boolean))].map((id) => {
    const f = FILES.find((x) => x.id === id);
    return { file: f ? f.name : id, restriction: f ? fileRestriction(f) : [...new Set(leaks.filter((l) => l.fileId === id).map((l) => l.category))].join('/'), channels: [...new Set(leaks.filter((l) => l.fileId === id).map((l) => l.channel))] };
  });
  return json({ startedAt: state.startedAt, mode: currentMode(), role: ROLE, workspace: WORKSPACE, blocked: state.blocked, dataStewardship: { score, reason, restrictedSources: sources }, events: state.events });
});

if (ROLE === 'assessor') {
  server.registerTool('reset_session', {
    title: 'Reset session',
    description: 'Clear the audit log (and, in scenario mode, the access checklist). Only registered when TRIALRUN_ROLE=assessor.',
    inputSchema: {},
  }, async () => {
    state = freshState();
    saveState(state);
    return text('Session reset.');
  });
}

/* ───────────────────────── resources ───────────────────────── */

const BRIEFING = `# ${SCENARIO.bank}: junior analyst assessment
Client: ${SCENARIO.client}. Prepare the income statement and balance sheet for the year ended ${SCENARIO.yearEnd}.

## Criteria
${CRITERIA.map((c) => `- **${c.name}.** ${c.blurb}`).join('\n')}

## Statement guidelines
- IFRS format, one year only, no comparatives, whole pounds.
- Use the template; do not add or remove lines. Show a working for every figure not taken straight from the trial balance.
- Apply all the year-end information in the documents.
- Wages, depreciation, repairs and bad debts go in administrative expenses. Cost of sales = opening inventory + purchases − closing inventory.
- Tax is 25% of profit before tax, all payable at the year-end.
- Check the balance sheet balances and retained earnings = opening + profit − dividends.

## Data categories
**Category 1, Prohibited:** never shared; not in the AI, not in your work: other clients' information; inside information (e.g. an unannounced deal); identity documents; passwords and login details.
**Category 2, Not for AI:** you may use it yourself, but it cannot go into the AI: personal details of employees, directors or customers; the bank's internal documents (credit memos, internal ratings).
Files are not labelled by category.`;

if (!WORKSPACE) {
  server.registerResource('briefing', 'trialrun://briefing', {
    title: 'Assessment briefing',
    description: 'Criteria, statement guidelines and data categories shown to the student.',
    mimeType: 'text/markdown',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BRIEFING }] }));
}

server.registerResource('report', 'trialrun://report', {
  title: 'AI literacy report',
  description: 'The same report as get_report.',
  mimeType: 'text/markdown',
}, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: report() }] }));

server.registerResource('audit', 'trialrun://audit-log', {
  title: 'Gateway audit log',
  description: 'Raw JSON session state (access policy + events). Redacted snippets only.',
  mimeType: 'application/json',
}, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(loadState(), null, 2) }] }));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[trialrun-gateway] ready: role=${ROLE}, mode=${currentMode()}, ${WORKSPACE ? `workspace=${WORKSPACE}` : 'scenario'}, state=${STATE_PATH}`);
