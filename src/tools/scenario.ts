import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { redactValue } from '../detectors.js';
import { CRITERIA, trapFor } from '../scenario/assessment.js';
import { FILES, FOLDERS, SCENARIO, displayName, sectionText } from '../scenario/scenario.js';
import type { NewEvent } from '../state.js';
import { errorResult, jsonResult, textResult, type ToolContext } from './context.js';

const BRIEFING = `# ${SCENARIO.bank}: junior analyst assessment
Client: ${SCENARIO.client}. Prepare the income statement and balance sheet for the year ended ${SCENARIO.yearEnd}.

## Criteria
${CRITERIA.map((c) => `- **${c.name}.** ${c.blurb}`).join('\n')}

## Statement guidelines
- IFRS format, one year only, no comparatives, whole pounds.
- Show a working for every figure not taken straight from the trial balance.
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
  server.registerTool('list_files', {
    title: 'List workspace files',
    description: `List the files on the ${SCENARIO.client} assessment desktop that the AI is allowed to see. Files blocked by the assessor are hidden.`,
    inputSchema: { folder: z.enum(FOLDERS).optional().describe('Restrict to one folder') },
  }, ({ folder }) => {
    const { blocked } = ctx.store.load();
    const files = FILES
      .filter((f) => !blocked.includes(f.id) && (!folder || f.folder === folder))
      .map((f) => ({ id: f.id, name: displayName(f), folder: f.folder, sections: f.sections.map((s) => s.id) }));
    return jsonResult({ client: SCENARIO.client, yearEnd: SCENARIO.yearEnd, files });
  });

  server.registerTool('read_file', {
    title: 'Read a workspace file',
    description: 'Read a file (or one section of it) from the assessment desktop. Every read is logged by the gateway. Files blocked by the assessor are refused; in enforce mode, restricted sections are withheld.',
    inputSchema: {
      file_id: z.string().describe('File id from list_files'),
      section_id: z.string().optional().describe('Read only this section (e.g. the loan repayment schedule)'),
    },
  }, ({ file_id, section_id }) => {
    const file = FILES.find((f) => f.id === file_id);
    if (!file) return errorResult(`No such file: ${file_id}`);
    if (ctx.store.load().blocked.includes(file.id)) {
      ctx.store.append({ type: 'refused', fileId: file.id, note: 'blocked by the assessor' });
      return errorResult(`Access denied: "${displayName(file)}" is blocked.`);
    }
    const sections = section_id ? file.sections.filter((s) => s.id === section_id) : file.sections;
    if (!sections.length) return errorResult(`File ${file.id} has no section "${section_id}". Sections: ${file.sections.map((s) => s.id).join(', ')}`);

    const enforce = ctx.mode() === 'enforce';
    const events: NewEvent[] = [{ type: 'ai-open', fileId: file.id, sectionId: section_id }];
    const parts: string[] = [];
    const withheld: string[] = [];
    for (const s of sections) {
      if (s.restricted) {
        events.push({
          type: enforce ? 'withheld' : 'leak', channel: 'ai-opened', fileId: file.id, sectionId: s.id, category: s.restricted,
          label: `restricted data from ${file.id}`, markers: (s.markers ?? []).map(redactValue), trap: trapFor(file.id, s.id),
        });
        if (enforce) {
          // The section's id, never its title: a title can itself be restricted (another client's account).
          withheld.push(`${file.id}/${s.id}`);
          continue;
        }
      }
      parts.push(sectionText(file, s.id).replace(/^# .*\n?/, ''));
    }
    ctx.store.append(...events);
    const note = withheld.length ? `\n\n[Gateway: ${withheld.length} restricted section(s) withheld: ${withheld.join('; ')}]` : '';
    return textResult(`# ${displayName(file)}\n${parts.join('\n')}${note}`);
  });

  server.registerTool('get_access_policy', {
    title: 'Get access policy',
    description: 'Show the access checklist set by the assessor: which files the AI may and may not open, and the mode.',
    inputSchema: {},
  }, () => {
    const { blocked } = ctx.store.load();
    return jsonResult({ mode: ctx.mode(), role: ctx.config.role, files: FILES.map((f) => ({ id: f.id, name: displayName(f), folder: f.folder, allowed: !blocked.includes(f.id) })) });
  });

  if (ctx.config.role === 'assessor') {
    server.registerTool('set_access', {
      title: 'Allow or block a file',
      description: 'Assessor control: allow or block the AI from opening a file. Only registered when TRIALRUN_ROLE=assessor.',
      inputSchema: { file_id: z.string(), allowed: z.boolean() },
    }, ({ file_id, allowed }) => {
      if (!FILES.some((f) => f.id === file_id)) return errorResult(`No such file: ${file_id}`);
      ctx.store.append({ type: 'set-access', fileId: file_id, note: allowed ? 'allowed' : 'blocked', by: 'assessor' });
      return textResult(`${file_id} is now ${allowed ? 'ALLOWED' : 'BLOCKED'}.`);
    });
  }

  server.registerResource('briefing', 'trialrun://briefing', {
    title: 'Assessment briefing',
    description: 'Criteria, statement guidelines and data categories shown to the student.',
    mimeType: 'text/markdown',
  }, (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BRIEFING }] }));
}
