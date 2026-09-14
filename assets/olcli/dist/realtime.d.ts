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
    private operationChain;
    private info;
    private constructor();
    static connect(baseUrl: string, projectId: string, cookie: string): Promise<OverleafRealtimeSession>;
    get sessionInfo(): RealtimeSessionInfo;
    private open;
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