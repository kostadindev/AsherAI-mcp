/**
 * Workspace mode: serve a real folder through the gateway.
 *
 * - Paths always resolve inside the workspace root (no "..", no symlinks escaping it).
 * - The owner-controlled policy lives in <workspace>/.trialrun.json and is never served to the AI.
 * - Only text files are read; binaries (PDF, Office, images) are refused with a clear message.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { SensitiveTerm } from './detectors.js';

export const WORKSPACE = process.env.TRIALRUN_WORKSPACE ? resolve(process.env.TRIALRUN_WORKSPACE) : null;
export const POLICY_FILE = '.trialrun.json';

export interface Policy {
  block: string[];
  sensitive_terms: SensitiveTerm[];
  mode?: 'monitor' | 'enforce';
}

export const emptyPolicy = (): Policy => ({ block: [], sensitive_terms: [] });

export function loadPolicy(root: string): Policy {
  const p = join(root, POLICY_FILE);
  if (!existsSync(p)) return emptyPolicy();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<Policy>;
    return {
      block: Array.isArray(raw.block) ? raw.block.filter((g) => typeof g === 'string') : [],
      sensitive_terms: Array.isArray(raw.sensitive_terms)
        ? raw.sensitive_terms.filter((t) => t && typeof t.term === 'string' && (t.category === 'cat1' || t.category === 'cat2'))
        : [],
      mode: raw.mode === 'enforce' ? 'enforce' : raw.mode === 'monitor' ? 'monitor' : undefined,
    };
  } catch {
    return emptyPolicy();
  }
}

export const savePolicy = (root: string, p: Policy) => writeFileSync(join(root, POLICY_FILE), JSON.stringify(p, null, 2) + '\n');

/** Glob → RegExp. Supports **, *, ?. A pattern without "/" matches the file name at any depth. */
export function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/^\.\//, '').replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return g.includes('/') ? new RegExp(`^${re}$`) : new RegExp(`(?:^|/)${re}$`);
}

export const isBlockedPath = (rel: string, policy: Policy) =>
  rel === POLICY_FILE || rel.split('/').some((part) => part.startsWith('.trialrun')) || policy.block.some((g) => globToRegExp(g).test(rel));

const TEXT_EXT = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.yaml', '.yml', '.eml', '.log', '.html', '.htm', '.xml',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.cs',
  '.php', '.sh', '.sql', '.css', '.scss', '.toml', '.ini', '.cfg', '.conf', '.env', '.r', '.swift', '.tex', '.rst',
]);
const BINARY_HINT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.png', '.jpg', '.jpeg', '.gif', '.zip']);

export const fileType = (p: string) => {
  const e = extname(p).toLowerCase();
  if (TEXT_EXT.has(e) || e === '') return 'text';
  if (BINARY_HINT.has(e)) return 'binary';
  return 'other';
};

/** Resolve a user-supplied path to an absolute path inside root, or throw. */
export function safeResolve(root: string, p: string): { abs: string; rel: string } {
  const cleaned = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleaned.split('/').includes('..')) throw new Error('Path may not contain "..".');
  const abs = resolve(root, cleaned);
  const realRoot = realpathSync(root);
  if (!existsSync(abs)) throw new Error(`No such file: ${cleaned}`);
  const real = realpathSync(abs);
  if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new Error('Path resolves outside the workspace.');
  return { abs: real, rel: relative(realRoot, real).split(sep).join('/') };
}

export interface Entry { path: string; size: number; type: 'text' | 'binary' | 'other' }

export function walk(root: string, policy: Policy, limit = 2000): { files: Entry[]; truncated: boolean; hidden: number } {
  const realRoot = realpathSync(root);
  const files: Entry[] = [];
  let hidden = 0;
  let truncated = false;
  const visit = (dir: string) => {
    if (truncated) return;
    let names: string[] = [];
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const abs = join(dir, name);
      let st;
      try { st = statSync(abs); } catch { continue; }
      let real: string;
      try { real = realpathSync(abs); } catch { continue; }
      if (real !== realRoot && !real.startsWith(realRoot + sep)) continue; // symlink escaping the workspace
      const rel = relative(realRoot, abs).split(sep).join('/');
      if (st.isDirectory()) { visit(abs); continue; }
      if (!st.isFile()) continue;
      if (isBlockedPath(rel, policy)) { hidden++; continue; }
      if (files.length >= limit) { truncated = true; return; }
      files.push({ path: rel, size: st.size, type: fileType(rel) as Entry['type'] });
    }
  };
  visit(realRoot);
  return { files, truncated, hidden };
}

export function readText(abs: string, startLine?: number, endLine?: number): { text: string; firstLine: number; totalLines: number } {
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) throw new Error('This looks like a binary file; only text files can be read.');
  const all = buf.toString('utf8').split('\n');
  const from = Math.max(1, startLine ?? 1);
  const to = Math.min(all.length, endLine ?? all.length);
  return { text: all.slice(from - 1, to).join('\n'), firstLine: from, totalLines: all.length };
}
