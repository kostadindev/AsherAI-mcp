#!/usr/bin/env node
/**
 * End-to-end demo, no agent or API key needed:
 *
 *   npx -y -p github:kostadindev/trialrun-mcp trialrun-demo [folder]
 *
 * Writes a small fictional client folder, blocks the payroll file, starts the gateway over stdio and plays
 * the tool calls an AI agent would make, printing what the gateway does at each step, then the report.
 * The folder is kept so the same workspace can be connected to a real agent afterwards.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fictional files for a small accounting client. All names, numbers and addresses are invented. */
export const DEMO_FILES: Record<string, string> = {
  'README.txt': 'Demo workspace for trialrun-mcp. Every name, number and address here is fictional.\n',
  'budget.csv': 'line,amount_gbp\nSalaries,148000\nRent,48000\nSoftware,12500\nTravel,6400\n',
  'payroll.csv': [
    'employee,ni_number,home_address,salary_gbp',
    'Ada Fictional,QQ123456C,"12 Example Road, Oxford OX1 2AB",52000',
    'Ben Sample,QQ654321A,"4 Placeholder Lane, Leeds LS1 4CD",48000',
    'Cara Demo,QQ112233B,"9 Test Street, York YO1 6EF",48000',
    '',
  ].join('\n'),
  'client-email.txt': [
    'From: finance@northwind-example.co.uk',
    'Subject: Year-end figures and Project Kestrel',
    '',
    'Hi, attached are the year-end figures. Please keep Project Kestrel (the planned acquisition) confidential.',
    'For the refund, our bank details are sort code 12-34-56, account number 12345678.',
    '',
  ].join('\n'),
};

/** Owner policy: payroll is off limits, and the acquisition codename is a confidential term. */
export const DEMO_POLICY = { block: ['payroll.csv'], sensitive_terms: [{ term: 'Project Kestrel', category: 'cat1' }] };

interface Result { isError?: boolean; content: { type: string; text?: string }[] }
const text = (r: Result) => r.content.map((c) => c.text ?? '').join('\n');
const indent = (s: string) => s.split('\n').map((l) => `    ${l}`).join('\n');

export async function runDemo(folder: string, log: (line: string) => void = console.log): Promise<string> {
  const ws = resolve(folder);
  if (existsSync(ws) && readdirSync(ws).some((f) => !(f in DEMO_FILES) && f !== '.trialrun.json' && !f.startsWith('.trialrun-session'))) {
    throw new Error(`${ws} already holds other files. Pass an empty or new folder, e.g. trialrun-demo ./trialrun-demo`);
  }
  mkdirSync(ws, { recursive: true });
  for (const [name, body] of Object.entries(DEMO_FILES)) writeFileSync(join(ws, name), body);
  writeFileSync(join(ws, '.trialrun.json'), `${JSON.stringify(DEMO_POLICY, null, 2)}\n`);
  const state = join(ws, '.trialrun-session.jsonl');
  writeFileSync(state, ''); // a fresh log for every run

  log(`trialrun-mcp demo\n\nWorkspace: ${ws}\n  ${Object.keys(DEMO_FILES).join(', ')}\n  .trialrun.json blocks payroll.csv and marks "Project Kestrel" as confidential\n`);

  // The server entry point next to this file: server.js when installed, server.ts when run from source with tsx.
  const self = fileURLToPath(import.meta.url);
  const fromSource = self.endsWith('.ts');
  const server = join(dirname(self), fromSource ? 'server.ts' : 'server.js');
  const client = new Client({ name: 'trialrun-demo', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: fromSource ? ['--import', 'tsx', server] : [server],
    env: { ...process.env, TRIALRUN_WORKSPACE: ws, TRIALRUN_STATE: state },
    stderr: 'ignore',
  }));
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as Result;

  try {
    log('1. The agent lists the files it may read');
    const files = JSON.parse(text(await call('list_files'))) as { files: { path: string }[]; hiddenByPolicy: number };
    log(indent(`${files.files.map((f) => f.path).join(', ')}  (${files.hiddenByPolicy} hidden by policy)`));

    log('\n2. It reads budget.csv: allowed, nothing restricted');
    log(indent(text(await call('read_file', { path: 'budget.csv' })).split('\n').slice(0, 3).join('\n') + '\n…'));

    log('\n3. It tries payroll.csv: refused by the owner\'s policy');
    const refused = await call('read_file', { path: 'payroll.csv' });
    log(indent(`${refused.isError ? 'Refused' : 'NOT refused'}: ${text(refused)}`));

    log('\n4. It reads client-email.txt: allowed, but restricted data is flagged and logged');
    const email = text(await call('read_file', { path: 'client-email.txt' }));
    log(indent(email.slice(email.lastIndexOf('[Gateway'))));

    log('\n5. Before answering, it checks its draft and catches the account number before it is sent');
    const draft = 'Refund to sort code 12-34-56, account 12345678. Salaries are 68.9% of the budget.';
    const check = JSON.parse(text(await call('check_text', { text: draft, record: false }))) as { clean: boolean; hits: { label: string }[] };
    log(indent(check.clean ? 'Clean' : `Not clean: ${check.hits.map((h) => h.label).join(', ')}. The agent drops the bank details from its answer.`));

    log('\n6. A coaching skill records a habit moment');
    log(indent(text(await call('record_moment', { habit: 'check', outcome: 'did', note: 'User asked for the salary total to be checked against a second source.' }))));

    log('\n7. The user asks "how am I doing?": the literacy report');
    const report = text(await call('get_report'));
    log(indent(report));

    log(`\nDemo complete. The session log is ${state}\n`);
    log('Try the same folder with a real agent:');
    log(`  claude mcp add trialrun -e TRIALRUN_WORKSPACE=${ws} -- npx -y github:kostadindev/trialrun-mcp`);
    log('  then ask Claude: "What\'s the average salary in payroll.csv?" or "Summarise client-email.txt"');
    log('Add the coaching skill too (inside Claude Code): /plugin marketplace add kostadindev/trialrun-skill');
    return report;
  } finally {
    await client.close();
  }
}

// Run when launched directly, including through npx's bin symlink (compare real paths, not the symlink).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  runDemo(process.argv[2] ?? 'trialrun-demo').catch((e: unknown) => {
    console.error(`trialrun-demo: ${(e as Error).message}`);
    process.exit(1);
  });
}
