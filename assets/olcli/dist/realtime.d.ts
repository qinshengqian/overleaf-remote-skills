export type TextOperation = {
    p: number;
    i: string;
} | {
    p: number;
    d: string;
};
/** A point-in-time view of one document, captured without touching the network. */
export interface DocReport {
    path: string;
    tracked: boolean;
    stale: boolean;
    version?: number;
    remoteEdits: number;
    lastRemoteAt?: number;
    lastReadVersion?: number;
    lastReadRemoteEdits?: number;
    lastPulledVersion?: number;
    lastPulledHash?: string;
    lastPulledAt?: number;
    lastPulledBytes?: number;
    lastPulledMtimeMs?: number;
    pulls: number;
}
export interface DocumentSnapshot {
    path: string;
    content: string;
    version: number;
    remoteEdits: number;
    stale: boolean;
    /** True when serving this snapshot required a fresh network join. */
    rejoined: boolean;
}
export interface RealtimeSessionInfo {
    protocolVersion?: number;
    permissionsLevel?: string;
    documents: number;
    files: number;
}
export declare class RealtimeUnavailableError extends Error {
    readonly safeToFallback: boolean;
    constructor(message: string, safeToFallback?: boolean);
}
export declare function computeTextOperations(before: string, after: string): TextOperation[];
export declare function applyTextOperations(content: string, operations: TextOperation[]): string;
export declare function decodeOverleafText(text: string): string;
export declare class OverleafRealtimeSession {
    private readonly baseUrl;
    private readonly projectId;
    private cookie;
    private socket?;
    private nextAckId;
    private pendingAcks;
    private eventWaiters;
    private documents;
    private documentIds;
    private fileIds;
    /** Survives re-join and reconnect; see DocStats. */
    private stats;
    private updateListeners;
    private fileCount;
    private closed;
    private needsReconnect;
    private reconnecting;
    private operationChain;
    private info;
    private constructor();
    static connect(baseUrl: string, projectId: string, cookie: string): Promise<OverleafRealtimeSession>;
    get sessionInfo(): RealtimeSessionInfo;
    private open;
    /**
     * The collaboration socket can die without the process noticing: a sleeping
     * laptop, a network switch, or an Overleaf deploy leaves it half-open, and
     * every later operation would fail with "connection is not open" until the
     * whole session is restarted.
     *
     * Reconnect lazily, at the start of an operation. An idle session then costs
     * nothing, and a write is never retried behind the caller's back: an
     * operation that was in flight when the socket dropped still fails, because
     * the server may or may not have applied it.
     */
    private ensureConnected;
    private reconnect;
    private indexProject;
    /** Every text-document path known to this project, sorted. */
    listDocuments(): string[];
    /** Every binary file path known to this project, sorted. */
    listFiles(): string[];
    /**
     * Subscribe to edits that came from another connection. The listener gets the
     * document path and must not throw; returns an unsubscribe function.
     */
    onUpdate(listener: (path: string) => void): () => void;
    private statsFor;
    /** A read-only view of one document's bookkeeping, with no network access. */
    report(path: string): DocReport;
    /** Record that a caller has just observed this document's current version. */
    noteRead(path: string): void;
    /** Record that the local mirror has written this document to disk. */
    notePull(path: string, info: {
        version?: number;
        hash: string;
        bytes: number;
        mtimeMs: number;
    }): void;
    registerDocument(path: string, id: string): void;
    hasDocument(path: string): boolean;
    private waitForEvent;
    private handleMessage;
    private handlePacket;
    /**
     * An update that came from another connection. Our own writes are acked with
     * no `op` array, so anything reaching here is someone else's edit.
     *
     * Note the server identifies the sender by socket, not by person: the same
     * account editing in a browser tab, or a second `olcli live` on the same
     * project, counts as remote here.
     */
    private noteRemoteEdit;
    private handleOtUpdate;
    private sendRaw;
    private emitWithAck;
    private joinDocument;
    read(path: string, force?: boolean): Promise<string>;
    /**
     * Read one document's current content and version.
     *
     * With `force: false` and a healthy cache this is a pure map lookup, no
     * network at all; it re-joins only when the document was never joined, is
     * marked stale, or `force` is set.
     *
     * Content, version and staleness are copied out in one synchronous step:
     * `handleOtUpdate` runs on the socket callback and applies a change
     * atomically, so a reader sees the state either before or after an update,
     * never half-way through one.
     */
    snapshot(path: string, force?: boolean): Promise<DocumentSnapshot>;
    refresh(path?: string): Promise<void>;
    mutate(path: string, transform: (content: string) => string, verify?: boolean): Promise<{
        content: string;
        version: number;
        verified: boolean;
    }>;
    close(): void;
    private handleClose;
}
//# sourceMappingURL=realtime.d.ts.map