import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { redactValue } from '../detectors.js';
import { CRITERIA, trapFor } from '../scenario/assessment.js';
import { FILES, FOLDERS, SCENARIO, sectionText } from '../scenario/scenario.js';
import { errorResult, jsonResult, textResult, type ToolContext } from './context.js';

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

/** Tools for the built-in Fernvale Kitchens assessment desktop. */
export function registerScenarioTools(server: McpServer, ctx: ToolContext): void {
  const isBlocked = (id: string) => ctx.store.load().blocked.includes(id);

  server.registerTool('list_files', {
    title: 'List workspace files',
    description: `List the files on the ${SCENARIO.client} assessment desktop that the AI is allowed to see. Files the student has blocked are hidden.`,
    inputSchema: { folder: z.enum(FOLDERS).optional().describe('Restrict to one folder') },
  }, ({ folder }) => {
    const files = FILES
      .filter((f) => !isBlocked(f.id) && (!folder || f.folder === folder))
      .map((f) => ({ id: f.id, name: f.name, folder: f.folder, sections: f.sections.map((s) => s.id) }));
    return jsonResult({ client: SCENARIO.client, yearEnd: SCENARIO.yearEnd, files });
  });

  server.registerTool('read_file', {
    title: 'Read a workspace file',
    description: 'Read a file (or one section of it) from the assessment desktop. Every read is logged by the gateway. Blocked files are refused.',
    inputSchema: {
      file_id: z.string().describe('File id from list_files'),
      section_id: z.string().optional().describe('Read only this section (e.g. the loan repayment schedule)'),
    },
  }, ({ file_id, section_id }) => {
    const file = FILES.find((f) => f.id === file_id);
    if (!file) return errorResult(`No such file: ${file_id}`);
    if (isBlocked(file.id)) {
      ctx.store.append({ type: 'refused', fileId: file.id, note: 'blocked by student access policy' });
      return errorResult(`Access denied: the student has blocked "${file.name}".`);
    }
    const sections = section_id ? file.sections.filter((s) => s.id === section_id) : file.sections;
    if (!sections.length) return errorResult(`File ${file.id} has no section "${section_id}". Sections: ${file.sections.map((s) => s.id).join(', ')}`);

    ctx.store.append({ type: 'ai-open', fileId: file.id, sectionId: section_id });
    const enforce = ctx.mode() === 'enforce';
    const parts: string[] = [];
    const withheld: string[] = [];
    for (const s of sections) {
      if (s.restricted && enforce) {
        withheld.push(s.title ?? s.id);
        ctx.store.append({ type: 'refused', fileId: file.id, sectionId: s.id, category: s.restricted, note: 'restricted section withheld (enforce mode)' });
        continue;
      }
      if (s.restricted) {
        ctx.store.append({
          type: 'leak', channel: 'ai-opened', fileId: file.id, sectionId: s.id, category: s.restricted,
          label: `restricted data from ${file.name}`, markers: (s.markers ?? []).map(redactValue), trap: trapFor(file.id, s.id),
        });
      }
      parts.push(sectionText(file, s.id).replace(/^# .*\n?/, ''));
    }
    const note = withheld.length ? `\n\n[Gateway: ${withheld.length} restricted section(s) withheld: ${withheld.join('; ')}]` : '';
    return textResult(`# ${file.name}\n${parts.join('\n')}${note}`);
  });

  server.registerTool('get_access_policy', {
    title: 'Get access policy',
    description: 'Show the student\'s access checklist: which files the AI may and may not open.',
    inputSchema: {},
  }, () => {
    const { blocked } = ctx.store.load();
    return jsonResult({ mode: ctx.mode(), role: ctx.config.role, files: FILES.map((f) => ({ id: f.id, name: f.name, folder: f.folder, allowed: !blocked.includes(f.id) })) });
  });

  if (ctx.config.role === 'assessor') {
    server.registerTool('set_access', {
      title: 'Allow or block a file',
      description: 'Assessor control: allow or block the AI from opening a file. Only registered when TRIALRUN_ROLE=assessor.',
      inputSchema: { file_id: z.string(), allowed: z.boolean() },
    }, ({ file_id, allowed }) => {
      if (!FILES.some((f) => f.id === file_id)) return errorResult(`No such file: ${file_id}`);
      ctx.store.update((s) => {
        s.blocked = allowed ? s.blocked.filter((x) => x !== file_id) : [...new Set([...s.blocked, file_id])];
        s.events.push({ t: new Date().toISOString(), type: 'set-access', fileId: file_id, note: allowed ? 'allowed' : 'blocked', by: 'assessor' });
      });
      return textResult(`${file_id} is now ${allowed ? 'ALLOWED' : 'BLOCKED'}.`);
    });
  }

  server.registerResource('briefing', 'trialrun://briefing', {
    title: 'Assessment briefing',
    description: 'Criteria, statement guidelines and data categories shown to the student.',
    mimeType: 'text/markdown',
  }, (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BRIEFING }] }));
}
