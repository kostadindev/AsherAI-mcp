/**
 * Workspace mode: serve a real folder through the gateway.
 *
 * - Paths always resolve inside the workspace (no "..", no symlinks escaping it).
 * - The owner-controlled policy file and the session log are never listed or served.
 * - Only text files are read; binaries (PDF, Office, images) are refused with a clear message.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, type Stats } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { POLICY_FILE, type Mode } from './config.js';
import type { SensitiveTerm } from './detectors.js';

export interface Policy {
  block: string[];
  sensitive_terms: SensitiveTerm[];
  mode?: Mode;
}

export const emptyPolicy = (): Policy => ({ block: [], sensitive_terms: [] });

const isTerm = (t: unknown): t is SensitiveTerm =>
  typeof t === 'object' && t !== null
  && typeof (t as SensitiveTerm).term === 'string'
  && ((t as SensitiveTerm).category === 'cat1' || (t as SensitiveTerm).category === 'cat2');

/** Read the policy file, ignoring malformed entries. A missing or unreadable file means no policy. */
export function loadPolicy(root: string): Policy {
  const path = join(root, POLICY_FILE);
  if (!existsSync(path)) return emptyPolicy();
  let raw: Partial<Record<keyof Policy, unknown>>;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Record<keyof Policy, unknown>>;
  } catch {
    return emptyPolicy();
  }
  return {
    block: Array.isArray(raw.block) ? raw.block.filter((g): g is string => typeof g === 'string') : [],
    sensitive_terms: Array.isArray(raw.sensitive_terms) ? raw.sensitive_terms.filter(isTerm) : [],
    mode: raw.mode === 'enforce' || raw.mode === 'monitor' ? raw.mode : undefined,
  };
}

export function savePolicy(root: string, policy: Policy): void {
  writeFileSync(join(root, POLICY_FILE), `${JSON.stringify(policy, null, 2)}\n`);
}

/** Glob → RegExp. Supports **, *, ?. A pattern without "/" matches the file name at any depth. */
export function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g.charAt(i);
    if (c === '*' && g[i + 1] === '*') {
      i++;
      if (g[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return g.includes('/') ? new RegExp(`^${re}$`) : new RegExp(`(?:^|/)${re}$`);
}

/** Gateway files (.trialrun*) are always blocked; otherwise the owner's patterns decide. */
export const isBlockedPath = (rel: string, policy: Policy): boolean =>
  rel.split('/').some((part) => part.startsWith('.trialrun')) || policy.block.some((g) => globToRegExp(g).test(rel));

const TEXT_EXT = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.yaml', '.yml', '.eml', '.log', '.html', '.htm', '.xml',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.cs',
  '.php', '.sh', '.sql', '.css', '.scss', '.toml', '.ini', '.cfg', '.conf', '.env', '.r', '.swift', '.tex', '.rst',
]);
const BINARY_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.png', '.jpg', '.jpeg', '.gif', '.zip']);
const OFFICE_OR_PDF = /\.(pdf|docx?|xlsx?|pptx?|odt|ods)$/i;

export type FileType = 'text' | 'binary' | 'other';

export function fileType(path: string): FileType {
  const ext = extname(path).toLowerCase();
  if (ext === '' || TEXT_EXT.has(ext)) return 'text';
  return BINARY_EXT.has(ext) ? 'binary' : 'other';
}

const inside = (realRoot: string, real: string) => real === realRoot || real.startsWith(realRoot + sep);

/** Resolve a user-supplied path to a real path inside root, or throw with a message for the AI. */
export function safeResolve(root: string, path: string): { abs: string; rel: string } {
  const cleaned = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleaned.split('/').includes('..')) throw new Error('Path may not contain "..".');
  const abs = resolve(root, cleaned);
  if (!existsSync(abs)) throw new Error(`No such file: ${cleaned}`);
  const realRoot = realpathSync(root);
  const real = realpathSync(abs);
  if (!inside(realRoot, real)) throw new Error('Path resolves outside the workspace.');
  return { abs: real, rel: relative(realRoot, real).split(sep).join('/') };
}

export interface Entry { path: string; size: number; type: FileType }

export interface Listing { files: Entry[]; truncated: boolean; hidden: number }

/** List visible files: no dotfiles, no node_modules, nothing blocked, nothing outside the root. */
export function walk(root: string, policy: Policy, limit = 2000): Listing {
  const realRoot = realpathSync(root);
  const listing: Listing = { files: [], truncated: false, hidden: 0 };
  const visit = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return; // unreadable directory: skip it, keep listing the rest
    }
    for (const name of names) {
      if (listing.truncated) return;
      if (name.startsWith('.') || name === 'node_modules') continue;
      const abs = join(dir, name);
      let st: Stats;
      let real: string;
      try {
        st = statSync(abs);
        real = realpathSync(abs);
      } catch {
        continue; // dangling symlink or a file removed while walking
      }
      if (!inside(realRoot, real)) continue;
      if (st.isDirectory()) {
        visit(abs);
        continue;
      }
      if (!st.isFile()) continue;
      const rel = relative(realRoot, abs).split(sep).join('/');
      if (isBlockedPath(rel, policy)) {
        listing.hidden++;
      } else if (listing.files.length >= limit) {
        listing.truncated = true;
      } else {
        listing.files.push({ path: rel, size: st.size, type: fileType(rel) });
      }
    }
  };
  visit(realRoot);
  return listing;
}

export interface TextSlice { text: string; firstLine: number; lastLine: number; totalLines: number }

/** Read a text file, optionally a 1-based inclusive line range. Throws for binary content. */
export function readText(abs: string, startLine?: number, endLine?: number): TextSlice {
  if (OFFICE_OR_PDF.test(abs)) throw new Error('PDF and Office files are not parsed yet. Export to text or CSV first.');
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) throw new Error('This looks like a binary file; only text files can be read.');
  const lines = buf.toString('utf8').split('\n');
  const firstLine = Math.max(1, startLine ?? 1);
  const lastLine = Math.min(lines.length, endLine ?? lines.length);
  return { text: lines.slice(firstLine - 1, lastLine).join('\n'), firstLine, lastLine: Math.max(firstLine, lastLine), totalLines: lines.length };
}
