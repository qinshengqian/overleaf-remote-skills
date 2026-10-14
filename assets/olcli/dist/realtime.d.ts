export type TextOperation = {
    p: number;
    i: string;
} | {
    p: number;
    d: string;
};
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
    registerDocument(path: string, id: string): void;
    hasDocument(path: string): boolean;
    private waitForEvent;
    private handleMessage;
    private handlePacket;
    private handleOtUpdate;
    private sendRaw;
    private emitWithAck;
    private joinDocument;
    read(path: string, force?: boolean): Promise<string>;
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