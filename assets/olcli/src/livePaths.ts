import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Path handling for the live local mirror.
 *
 * A read-only copy of a project's documents is kept under
 * `~/.olcli/live/<projectId>/`. It exists so an agent can read a document
 * without a fresh download, and it is re-synced whenever the remote moves.
 *
 * Remote paths come from Overleaf and are attacker-influenced input to a
 * filesystem write, so every one of them is validated before it is used.
 */

/**
 * Cap on an inlined read. A reply has to stay one pane line that
 * `scripts/olcli-live` can scrape, so only bounded reads are inlined; anything
 * larger is written to a file and referred to by path.
 */
export const LIVE_INLINE_LIMIT_BYTES = 64 * 1024;
export const LIVE_MIRROR_DEFAULT_INTERVAL_MS = 1000;
/** Reserved sibling of a project's mirror dir, so no remote name can shadow it. */
export const LIVE_MANIFEST_SUFFIX = '.manifest.json';

export function liveRoot(): string {
  return join(homedir(), '.olcli', 'live');
}

export function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[^A-Za-z0-9._-]/g, '_');
  // A bare "." or ".." survives the character filter but would resolve to the
  // live root, or its parent. Defuse it rather than trusting the caller.
  return /^\.+$/.test(cleaned) ? `_${cleaned}` : cleaned;
}

export function liveManifestPath(projectId: string): string {
  return join(liveRoot(), `${sanitizeSegment(projectId)}${LIVE_MANIFEST_SUFFIX}`);
}

/**
 * Map a remote path onto the local mirror, refusing anything that could escape
 * the mirror root. Segment filtering is defence in depth; the `resolve` prefix
 * assertion is the actual guard.
 */
export function liveMirrorFile(projectId: string, remotePath: string): string {
  const root = join(liveRoot(), sanitizeSegment(projectId));
  const segments = remotePath.replace(/^\/+/, '').split('/');
  if (segments.length === 0 || segments.some(s => !s)) {
    throw new Error(`Invalid remote path: ${remotePath}`);
  }
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || segment.includes('\\') || segment.includes('\0')) {
      throw new Error(`Refusing unsafe remote path: ${remotePath}`);
    }
  }
  const target = resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Refusing remote path outside the mirror: ${remotePath}`);
  }
  return target;
}

/** Short content fingerprint; matches what the mirror stores per document. */
export function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

/** Write via a temp file plus rename, so a concurrent reader never sees half. */
export function writeFileAtomic(target: string, data: string): number {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.olcli-tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, target);
  return statSync(target).mtimeMs;
}

export function readLiveManifest(projectId: string): Record<string, any> {
  const file = liveManifestPath(projectId);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

export function writeLiveManifest(projectId: string, manifest: Record<string, any>): void {
  writeFileAtomic(liveManifestPath(projectId), JSON.stringify(manifest, null, 2));
}

/** Slice a document into lines by an optional 1-based offset and a limit. */
export function sliceLines(
  content: string,
  offset?: unknown,
  limit?: unknown,
): { text: string; offset: number; limit?: number; total: number } {
  const lines = content.split('\n');
  const start = Number.isInteger(offset) && Number(offset) > 0 ? Number(offset) - 1 : 0;
  const take = Number.isInteger(limit) && Number(limit) > 0 ? Number(limit) : undefined;
  const slice = take === undefined ? lines.slice(start) : lines.slice(start, start + take);
  return { text: slice.join('\n'), offset: start + 1, limit: take, total: lines.length };
}
