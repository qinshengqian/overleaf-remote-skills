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
export declare const LIVE_INLINE_LIMIT_BYTES: number;
export declare const LIVE_MIRROR_DEFAULT_INTERVAL_MS = 1000;
/** Reserved sibling of a project's mirror dir, so no remote name can shadow it. */
export declare const LIVE_MANIFEST_SUFFIX = ".manifest.json";
export declare function liveRoot(): string;
export declare function sanitizeSegment(segment: string): string;
export declare function liveManifestPath(projectId: string): string;
/**
 * Map a remote path onto the local mirror, refusing anything that could escape
 * the mirror root. Segment filtering is defence in depth; the `resolve` prefix
 * assertion is the actual guard.
 */
export declare function liveMirrorFile(projectId: string, remotePath: string): string;
/** Short content fingerprint; matches what the mirror stores per document. */
export declare function contentHash(content: string): string;
/** Write via a temp file plus rename, so a concurrent reader never sees half. */
export declare function writeFileAtomic(target: string, data: string): number;
export declare function readLiveManifest(projectId: string): Record<string, any>;
export declare function writeLiveManifest(projectId: string, manifest: Record<string, any>): void;
/** Slice a document into lines by an optional 1-based offset and a limit. */
export declare function sliceLines(content: string, offset?: unknown, limit?: unknown): {
    text: string;
    offset: number;
    limit?: number;
    total: number;
};
//# sourceMappingURL=livePaths.d.ts.map