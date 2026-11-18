import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { renderReport, stewardship } from '../report.js';
import { cleanNote, scanText } from '../scan.js';
import type { GatewayEvent, NewEvent } from '../state.js';
import { jsonResult, textResult, type ToolContext } from './context.js';

/** Restriction level and channels for every source that leaked, for the audit log. */
function restrictedSources(leaks: readonly GatewayEvent[], describeSource: ToolContext['describeSource']) {
  const ids = [...new Set(leaks.map((l) => l.fileId).filter((id): id is string => Boolean(id)))];
  return ids.map((id) => {
    const fromSource = leaks.filter((l) => l.fileId === id);
    const source = describeSource(id);
    return {
      file: source?.name ?? id,
      restriction: source?.restriction ?? [...new Set(fromSource.map((l) => l.category))].join('/'),
      channels: [...new Set(fromSource.map((l) => l.channel))],
    };
  });
}

/** Tools available in both modes: self-checks, habit moments, the report and the audit log. */
export function registerSharedTools(server: McpServer, ctx: ToolContext): void {
  const report = () => renderReport(ctx.store.load(), ctx.describe());

  server.registerTool('check_text', {
    title: 'Scan text for restricted data',
    description: 'Scan an outgoing AI answer, a draft, or text the user pasted, for restricted data (credentials, cards, personal details, sensitive terms) before it is shown or saved. Hits are logged as leaks into the AI answer. Returns labels and redacted snippets only.',
    inputSchema: { text: z.string(), record: z.boolean().optional().describe('Log hits as answer leaks (default true)') },
  }, ({ text, record }) => {
    const hits = scanText(text, ctx.scanOptions());
    const events: NewEvent[] = [{ type: 'check-text', note: `${hits.length} hit(s)` }];
    if (record !== false) {
      for (const h of hits) events.push({ type: 'leak', channel: 'ai-answer', category: h.category, label: h.label, line: h.line, markers: [h.match] });
    }
    ctx.store.append(...events);
    return jsonResult({ clean: hits.length === 0, hits: hits.map(({ category, label, match, line }) => ({ category, label, match, line })) });
  });

  server.registerTool('record_moment', {
    title: 'Record an AI-literacy habit moment',
    description: 'For a coaching skill: log a moment for one of three habits. habit: "check" (verifying AI output), "decide" (keeping a judgement call), "protect" (keeping restricted data out). outcome: "did" (the user did it unprompted), "prompted" (after a coaching note), "missed". Restricted values in the note are redacted before storage.',
    inputSchema: {
      habit: z.enum(['check', 'decide', 'protect']),
      outcome: z.enum(['did', 'prompted', 'missed']),
      note: z.string().max(2000).describe('One sentence describing what happened, without personal data'),
    },
  }, ({ habit, outcome, note }) => {
    const clean = cleanNote(note, ctx.scanOptions());
    ctx.store.append({ type: 'moment', habit, outcome, note: clean, by: 'ai' });
    return textResult(`Recorded ${habit}/${outcome}: ${clean}`);
  });

  server.registerTool('get_report', {
    title: 'AI literacy report',
    description: 'A short markdown report for the user: data stewardship score, restricted data by type and channel (counts only, no values), files read, and the three habits with recent examples.',
    inputSchema: {},
  }, () => textResult(report()));

  server.registerTool('get_audit_log', {
    title: 'Audit log',
    description: 'Timestamped gateway events, restricted-data leak summary and a preliminary Data Stewardship score (Full / Partial / Zero). Contains labels and redacted snippets only.',
    inputSchema: {},
  }, () => {
    const state = ctx.store.load();
    const { leaks, score, reason } = stewardship(state.events);
    return jsonResult({
      startedAt: state.startedAt, mode: ctx.mode(), role: ctx.config.role, workspace: ctx.config.workspace, blocked: state.blocked,
      dataStewardship: { score, reason, restrictedSources: restrictedSources(leaks, (id) => ctx.describeSource(id)) },
      events: state.events,
    });
  });

  if (ctx.config.role === 'assessor') {
    server.registerTool('reset_session', {
      title: 'Reset session',
      description: 'Clear the audit log (and, in scenario mode, the access checklist). Only registered when TRIALRUN_ROLE=assessor.',
      inputSchema: {},
    }, () => {
      ctx.store.reset();
      return textResult('Session reset.');
    });
  }

  server.registerResource('report', 'trialrun://report', {
    title: 'AI literacy report',
    description: 'The same report as get_report.',
    mimeType: 'text/markdown',
  }, (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: report() }] }));

  server.registerResource('audit', 'trialrun://audit-log', {
    title: 'Gateway audit log',
    description: 'Raw JSON session state (access policy + events). Redacted snippets only.',
    mimeType: 'application/json',
  }, (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(ctx.store.load(), null, 2) }] }));
}
