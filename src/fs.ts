import { renameSync, writeFileSync } from 'node:fs';

/** Write a file so readers see either the old or the new content, never a partial write. */
export function writeFileAtomic(path: string, content: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}
