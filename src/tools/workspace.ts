import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { detect, redact } from '../detectors.js';
import { isBlockedPath, loadPolicy, readText, safeResolve, walk } from '../workspace.js';
import { errorResult, jsonResult, textResult, type ToolContext } from './context.js';

/** Tools for a real folder: list, read (with detection or redaction) and show the policy. */
export function registerWorkspaceTools(server: McpServer, ctx: ToolContext, root: string): void {
  server.registerTool('list_files', {
    title: 'List workspace files',
    description: 'List the files in the workspace the AI may read (path, size in bytes, type). Files the owner has blocked are hidden. Every read is logged by the TrialRun gateway.',
    inputSchema: { prefix: z.string().optional().describe('Only list paths starting with this folder, e.g. "reports/"') },
  }, ({ prefix }) => {
    const { files, truncated, hidden } = walk(root, loadPolicy(root));
    const folder = (prefix ?? '').replace(/^\.?\/+/, '');
    return jsonResult({ workspace: root, files: files.filter((f) => f.path.startsWith(folder)), truncated, hiddenByPolicy: hidden });
  });

  server.registerTool('read_file', {
    title: 'Read a workspace file',
    description: 'Read a text file (optionally a line range) from the workspace. The gateway logs the read and flags restricted data in what it returns. Blocked files are refused; PDFs and Office files are not parsed yet.',
    inputSchema: {
      path: z.string().describe('Path relative to the workspace, from list_files'),
      start_line: z.number().int().min(1).optional(),
      end_line: z.number().int().min(1).optional(),
    },
  }, ({ path, start_line, end_line }) => {
    const policy = loadPolicy(root);
    let target: { abs: string; rel: string };
    try {
      target = safeResolve(root, path);
    } catch (e) {
      return errorResult((e as Error).message);
    }
    const { abs, rel } = target;
    if (isBlockedPath(rel, policy)) {
      ctx.store.append({ type: 'refused', fileId: rel, note: 'blocked by workspace policy' });
      return errorResult(`Access denied: "${rel}" is blocked by the workspace policy.`);
    }
    let slice: ReturnType<typeof readText>;
    try {
      slice = readText(abs, start_line, end_line);
    } catch (e) {
      return errorResult(`${rel}: ${(e as Error).message}`);
    }
    const ranged = start_line !== undefined || end_line !== undefined;
    const range = `lines ${slice.firstLine}-${slice.lastLine}`;
    ctx.store.append({ type: 'ai-open', fileId: rel, sectionId: ranged ? range : undefined });

    const hits = detect(slice.text, policy.sensitive_terms);
    for (const h of hits) {
      ctx.store.append({ type: 'leak', channel: 'ai-opened', fileId: rel, line: h.line + slice.firstLine - 1, category: h.category, label: h.label, markers: [h.match] });
    }
    const enforce = ctx.mode() === 'enforce';
    const body = enforce ? redact(slice.text, hits) : slice.text;
    const flag = hits.length
      ? `\n\n[Gateway: ${hits.length} restricted item(s) ${enforce ? 'redacted' : 'flagged'}: ${[...new Set(hits.map((h) => h.label))].join(', ')}]`
      : '';
    return textResult(`# ${rel} (${range} of ${slice.totalLines})\n${body}${flag}`);
  });

  server.registerTool('get_access_policy', {
    title: 'Get access policy',
    description: 'Show the workspace policy: blocked path patterns, the number of owner-defined sensitive terms, and the mode.',
    inputSchema: {},
  }, () => {
    const policy = loadPolicy(root);
    return jsonResult({ mode: ctx.mode(), role: ctx.config.role, blocked: policy.block, sensitiveTerms: policy.sensitive_terms.length });
  });
}
