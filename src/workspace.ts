/**
 * Workspace mode: serve a real folder through the gateway.
 *
 * One exclusion rule decides both what is listed and what can be read: dotfiles and dot-directories
 * (.env, .git, the policy file), node_modules, the configured session log, and the owner's blocked
 * patterns. It is checked on the path as requested and on its real path, so a symlink can't reach an
 * excluded file under an allowed name. Paths never leave the workspace. Only text files are read.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, type Stats } from 'node:fs';
import { extname, join, posix, relative, resolve, sep } from 'node:path';
import { POLICY_FILE, type Mode } from './config.js';
import type { SensitiveTerm } from './detectors.js';
import { writeFileAtomic } from './fs.js';

export interface Policy {
  block: string[];
  sensitive_terms: SensitiveTerm[];
  mode?: Mode;
}

export const emptyPolicy = (): Policy => ({ block: [], sensitive_terms: [] });

export type PolicyResult = { ok: true; policy: Policy } | { ok: false; error: string };

const isTerm = (t: unknown): t is SensitiveTerm =>
  typeof t === 'object' && t !== null
  && typeof (t as SensitiveTerm).term === 'string'
  && ((t as SensitiveTerm).category === 'cat1' || (t as SensitiveTerm).category === 'cat2');

/** Validate a parsed policy document. Any malformed field makes the whole policy invalid. */
function validatePolicy(raw: unknown): PolicyResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'the policy must be a JSON object' };
  const doc = raw as Record<string, unknown>;
  const block = doc.block ?? [];
  const terms = doc.sensitive_terms ?? [];
  if (!Array.isArray(block) || !block.every((g) => typeof g === 'string')) return { ok: false, error: '"block" must be a list of path patterns' };
  if (!Array.isArray(terms) || !terms.every(isTerm)) return { ok: false, error: '"sensitive_terms" must be a list of { "term", "category": "cat1" | "cat2" }' };
  if (doc.mode !== undefined && doc.mode !== 'monitor' && doc.mode !== 'enforce') return { ok: false, error: '"mode" must be "monitor" or "enforce"' };
  return { ok: true, policy: { block, sensitive_terms: terms, mode: doc.mode } };
}

/** Read the owner's policy. A missing file means no restrictions; anything unreadable or invalid is an error. */
export function readPolicy(root: string): PolicyResult {
  const path = join(root, POLICY_FILE);
  if (!existsSync(path)) return { ok: true, policy: emptyPolicy() };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { ok: false, error: `${POLICY_FILE} could not be read: ${(e as Error).message}` };
  }
  const result = validatePolicy(raw);
  return result.ok ? result : { ok: false, error: `${POLICY_FILE} is invalid: ${result.error}` };
}

export function savePolicy(root: string, policy: Policy): void {
  writeFileAtomic(join(root, POLICY_FILE), `${JSON.stringify(policy, null, 2)}\n`);
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

export const isBlockedPath = (rel: string, policy: Policy): boolean => policy.block.some((g) => globToRegExp(g).test(rel));

const isHiddenPath = (rel: string) => rel.split('/').some((part) => part.startsWith('.') || part === 'node_modules');

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
const toRel = (from: string, to: string) => relative(from, to).split(sep).join('/');

/** Resolve a user-supplied path to a real path inside root, or throw with a message for the AI. */
export function safeResolve(root: string, path: string): { abs: string; rel: string; requested: string } {
  const requested = posix.normalize(path.replace(/\\/g, '/').replace(/^\/+/, ''));
  if (requested.split('/').includes('..')) throw new Error('Path may not contain "..".');
  const abs = resolve(root, requested);
  if (!existsSync(abs)) throw new Error(`No such file: ${requested}`);
  const realRoot = realpathSync(root);
  const real = realpathSync(abs);
  if (!inside(realRoot, real)) throw new Error('Path resolves outside the workspace.');
  return { abs: real, rel: toRel(realRoot, real), requested };
}

export interface Entry { path: string; size: number; type: FileType }

export interface Listing { files: Entry[]; truncated: boolean; hidden: number }

export interface WalkOptions {
  /** Excluded without being counted (dotfiles, the session log). */
  isHidden?: (rel: string) => boolean;
  fileLimit?: number;
  dirLimit?: number;
}

/**
 * List visible files. Each real directory is visited once, so symlinks to ancestors can't loop,
 * and both files and directory visits are capped.
 */
export function walk(root: string, policy: Policy, { isHidden = isHiddenPath, fileLimit = 2000, dirLimit = 5000 }: WalkOptions = {}): Listing {
  const realRoot = realpathSync(root);
  const listing: Listing = { files: [], truncated: false, hidden: 0 };
  const seenDirs = new Set<string>();
  const visit = (dir: string, relDir: string) => {
    const realDir = realpathSync(dir);
    if (seenDirs.has(realDir)) return;
    if (seenDirs.size >= dirLimit) {
      listing.truncated = true;
      return;
    }
    seenDirs.add(realDir);
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return; // unreadable directory: skip it, keep listing the rest
    }
    for (const name of names) {
      if (listing.truncated) return;
      const abs = join(dir, name);
      const rel = relDir ? `${relDir}/${name}` : name;
      let st: Stats;
      let real: string;
      try {
        st = statSync(abs);
        real = realpathSync(abs);
      } catch {
        continue; // dangling symlink or a file removed while walking
      }
      if (!inside(realRoot, real)) continue;
      const realRel = toRel(realRoot, real);
      if (isHidden(rel) || isHidden(realRel)) continue;
      if (st.isDirectory()) {
        visit(abs, rel);
      } else if (!st.isFile()) {
        continue;
      } else if (isBlockedPath(rel, policy) || isBlockedPath(realRel, policy)) {
        listing.hidden++;
      } else if (listing.files.length >= fileLimit) {
        listing.truncated = true;
      } else {
        listing.files.push({ path: rel, size: st.size, type: fileType(rel) });
      }
    }
  };
  visit(realRoot, '');
  return listing;
}

/** The exclusion rule for one workspace, shared by listing and reading. */
export function workspaceAccess(root: string, policy: Policy, statePath: string) {
  const realRoot = realpathSync(root);
  const stateRel = existsSync(statePath) ? toRel(realRoot, realpathSync(statePath)) : toRel(realRoot, resolve(statePath));
  const isHidden = (rel: string) => isHiddenPath(rel) || rel === stateRel;
  const excluded = (rel: string) => isHidden(rel) || isBlockedPath(rel, policy);
  return {
    list: (): Listing => walk(root, policy, { isHidden }),
    /** Resolve a path for reading, or throw if it is outside the workspace or excluded under either name. */
    resolve(path: string): { abs: string; rel: string } {
      const target = safeResolve(root, path);
      if (excluded(target.requested) || excluded(target.rel)) throw new Error(`Access denied: "${target.requested}" is blocked by the workspace policy.`);
      return target;
    },
  };
}

export interface Document { text: string; totalLines: number }

/** Read a whole text file. Throws for PDF, Office and other binary content. */
export function readDocument(abs: string): Document {
  if (OFFICE_OR_PDF.test(abs)) throw new Error('PDF and Office files are not parsed yet. Export to text or CSV first.');
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) throw new Error('This looks like a binary file; only text files can be read.');
  const text = buf.toString('utf8');
  return { text, totalLines: text.split('\n').length };
}

export interface LineRange { firstLine: number; lastLine: number; start: number; end: number }

/** A 1-based inclusive line range, clamped to the document, with its character offsets. */
export function lineRange(doc: Document, startLine?: number, endLine?: number): LineRange {
  const lines = doc.text.split('\n');
  const firstLine = Math.min(Math.max(1, startLine ?? 1), lines.length);
  const lastLine = Math.max(firstLine, Math.min(lines.length, endLine ?? lines.length));
  const start = lines.slice(0, firstLine - 1).reduce((n, l) => n + l.length + 1, 0);
  const end = start + lines.slice(firstLine - 1, lastLine).join('\n').length;
  return { firstLine, lastLine, start, end };
}
