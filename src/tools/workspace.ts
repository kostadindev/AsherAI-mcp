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
    const terms = policy.policy.sensitive_terms;
    /** A path as it may be logged or echoed: restricted values in the name replaced by their labels. */
    const safe = (path: string) => redact(path, detect(path, terms));
    const nameIsRestricted = (path: string) => detect(path, terms).length > 0;
    return { policy: policy.policy, rule: workspaceAccess(root, policy.policy, ctx.config.statePath), safe, nameIsRestricted };
  };

  server.registerTool('list_files', {
    title: 'List workspace files',
    description: 'List the files in the workspace the AI may read (path, size in bytes, type). Hidden and blocked files are not listed, nor in enforce mode files whose names hold restricted data. Every read is logged by the TrialRun gateway.',
    inputSchema: { prefix: z.string().optional().describe('Only list paths starting with this folder, e.g. "reports/"') },
  }, ({ prefix }) => {
    const a = access();
    if (a.error) return a.error;
    const listing = a.rule.list();
    const folder = (prefix ?? '').replace(/^\.?\/+/, '');
    // In enforce mode a name that itself holds restricted data is withheld like the data would be.
    const shown = ctx.mode() === 'enforce' ? listing.files.filter((f) => !a.nameIsRestricted(f.path)) : listing.files;
    const hidden = listing.hidden + listing.files.length - shown.length;
    return jsonResult({ workspace: root, files: shown.filter((f) => f.path.startsWith(folder)), truncated: listing.truncated, hiddenByPolicy: hidden });
  });

  server.registerTool('read_file', {
    title: 'Read a workspace file',
    description: 'Read a text file (optionally a line range) from the workspace. The gateway logs the read; in monitor mode it returns the file as written and flags restricted data, in enforce mode it redacts it. Blocked and hidden files, files over the size limit, PDFs and Office files are refused.',
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
      const message = a.safe((e as Error).message);
      if (message.startsWith('Access denied')) ctx.store.append({ type: 'refused', fileId: a.safe(path), note: 'blocked by workspace policy' });
      return errorResult(message);
    }
    const enforce = ctx.mode() === 'enforce';
    const logName = a.safe(target.rel);
    if (enforce && a.nameIsRestricted(target.rel)) {
      ctx.store.append({ type: 'refused', fileId: logName, note: 'file name holds restricted data (enforce mode)' });
      return errorResult(`Access denied: the name of "${logName}" holds restricted data (enforce mode).`);
    }
    let doc: ReturnType<typeof readDocument>;
    try {
      doc = readDocument(target.abs);
    } catch (e) {
      return errorResult(`${enforce ? logName : target.rel}: ${(e as Error).message}`);
    }
    // Detect on the whole document so a line range keeps its context (CSV headers, address blocks),
    // then keep the findings that fall inside the requested range.
    const range = lineRange(doc, start_line, end_line);
    const hits = detect(doc.text, a.policy.sensitive_terms).filter((h) => h.index < range.end && h.index + h.length > range.start);
    const ranged = start_line !== undefined || end_line !== undefined;
    const lines = `lines ${range.firstLine}-${range.lastLine}`;
    const events: NewEvent[] = [{ type: 'ai-open', fileId: logName, sectionId: ranged ? lines : undefined }];
    for (const h of hits) {
      events.push({ type: enforce ? 'withheld' : 'leak', channel: 'ai-opened', fileId: logName, line: h.line, category: h.category, label: h.label, markers: [h.match] });
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
