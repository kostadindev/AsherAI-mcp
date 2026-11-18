import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { detect, redact, type Hit } from '../detectors.js';
import type { NewEvent } from '../state.js';
import { lineRange, readDocument, readPolicy, workspaceAccess } from '../workspace.js';
import { errorResult, jsonResult, textResult, type ToolContext } from './context.js';

/** Tools for a real folder: list, read (with detection or redaction) and show the policy. */
export function registerWorkspaceTools(server: McpServer, ctx: ToolContext, root: string): void {
  /** The current policy and access rule, or an error result: an invalid policy refuses everything. */
  const access = () => {
    const policy = readPolicy(root);
    if (!policy.ok) return { error: errorResult(`Refusing access: ${policy.error}. Ask the workspace owner to fix the policy file.`) };
    return { policy: policy.policy, rule: workspaceAccess(root, policy.policy, ctx.config.statePath) };
  };

  server.registerTool('list_files', {
    title: 'List workspace files',
    description: 'List the files in the workspace the AI may read (path, size in bytes, type). Hidden and blocked files are not listed. Every read is logged by the TrialRun gateway.',
    inputSchema: { prefix: z.string().optional().describe('Only list paths starting with this folder, e.g. "reports/"') },
  }, ({ prefix }) => {
    const a = access();
    if (a.error) return a.error;
    const { files, truncated, hidden } = a.rule.list();
    const folder = (prefix ?? '').replace(/^\.?\/+/, '');
    return jsonResult({ workspace: root, files: files.filter((f) => f.path.startsWith(folder)), truncated, hiddenByPolicy: hidden });
  });

  server.registerTool('read_file', {
    title: 'Read a workspace file',
    description: 'Read a text file (optionally a line range) from the workspace. The gateway logs the read and flags restricted data in what it returns. Blocked and hidden files are refused; PDFs and Office files are not parsed yet.',
    inputSchema: {
      path: z.string().describe('Path relative to the workspace, from list_files'),
      start_line: z.number().int().min(1).optional(),
      end_line: z.number().int().min(1).optional(),
    },
  }, ({ path, start_line, end_line }) => {
    const a = access();
    if (a.error) return a.error;
    let target: { abs: string; rel: string };
    try {
      target = a.rule.resolve(path);
    } catch (e) {
      const message = (e as Error).message;
      if (message.startsWith('Access denied')) ctx.store.append({ type: 'refused', fileId: path, note: 'blocked by workspace policy' });
      return errorResult(message);
    }
    let doc: ReturnType<typeof readDocument>;
    try {
      doc = readDocument(target.abs);
    } catch (e) {
      return errorResult(`${target.rel}: ${(e as Error).message}`);
    }
    // Detect on the whole document so a line range keeps its context (CSV headers, address blocks),
    // then keep the findings that fall inside the requested range.
    const range = lineRange(doc, start_line, end_line);
    const hits = detect(doc.text, a.policy.sensitive_terms).filter((h) => h.index < range.end && h.index + h.length > range.start);
    const enforce = ctx.mode() === 'enforce';
    const ranged = start_line !== undefined || end_line !== undefined;
    const lines = `lines ${range.firstLine}-${range.lastLine}`;
    const events: NewEvent[] = [{ type: 'ai-open', fileId: target.rel, sectionId: ranged ? lines : undefined }];
    for (const h of hits) {
      events.push({ type: enforce ? 'withheld' : 'leak', channel: 'ai-opened', fileId: target.rel, line: h.line, category: h.category, label: h.label, markers: [h.match] });
    }
    ctx.store.append(...events);

    const slice = doc.text.slice(range.start, range.end);
    const body = enforce ? redact(slice, clipToRange(hits, range.start, range.end)) : slice;
    const flag = hits.length
      ? `\n\n[Gateway: ${hits.length} restricted item(s) ${enforce ? 'redacted' : 'flagged'}: ${[...new Set(hits.map((h) => h.label))].join(', ')}]`
      : '';
    return textResult(`# ${target.rel} (${lines} of ${doc.totalLines})\n${body}${flag}`);
  });

  server.registerTool('get_access_policy', {
    title: 'Get access policy',
    description: 'Show the workspace policy: blocked path patterns, the number of owner-defined sensitive terms, and the mode.',
    inputSchema: {},
  }, () => {
    const a = access();
    if (a.error) return a.error;
    return jsonResult({ mode: ctx.mode(), role: ctx.config.role, blocked: a.policy.block, sensitiveTerms: a.policy.sensitive_terms.length });
  });
}

/** Findings clipped to [start, end) and shifted to offsets within that slice. */
function clipToRange(hits: readonly Hit[], start: number, end: number): Hit[] {
  return hits.map((h) => {
    const from = Math.max(h.index, start);
    const to = Math.min(h.index + h.length, end);
    return { ...h, index: from - start, length: to - from };
  });
}
