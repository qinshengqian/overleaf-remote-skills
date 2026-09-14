/**
 * Overleaf API Client
 *
 * Provides programmatic access to Overleaf's REST APIs for project
 * management, file operations, and LaTeX compilation.
 */
import { OverleafRealtimeSession } from './realtime.js';
export interface Project {
    id: string;
    name: string;
    lastUpdated: string;
    lastUpdatedBy?: string;
    owner?: {
        email: string;
        firstName?: string;
        lastName?: string;
    };
    archived?: boolean;
    trashed?: boolean;
}
export interface ProjectInfo {
    _id: string;
    name: string;
    rootDoc_id?: string;
    rootFolder: FolderEntry[];
}
export interface FolderEntry {
    _id: string;
    name: string;
    folders: FolderEntry[];
    docs: DocEntry[];
    fileRefs: FileEntry[];
}
export interface DocEntry {
    _id: string;
    name: string;
}
export interface FileEntry {
    _id: string;
    name: string;
}
export interface Credentials {
    cookies: Record<string, string>;
    csrf: string;
    baseUrl?: string;
}
export declare class OverleafClient {
    private cookies;
    private csrf;
    private baseUrl;
    private httpAgent;
    private httpsAgent;
    private prefetchedProjectsHtml?;
    private projectInfoCache;
    constructor(credentials: Credentials);
    private projectUrl;
    private downloadUrl;
    private uploadUrl;
    private folderUrl;
    private deleteUrl;
    private compileUrl;
    /** Create a blank Overleaf project. */
    createProject(name: string): Promise<Project>;
    /**
     * Create client from session cookie string
     */
    static fromSessionCookie(sessionCookie: string, baseUrl?: string, cookieName?: string): Promise<OverleafClient>;
    /** Open one persistent collaboration connection for low-latency OT edits. */
    openRealtimeSession(projectId: string): Promise<OverleafRealtimeSession>;
    private getCookieHeader;
    private getHeaders;
    private normalizeHeaders;
    private applySetCookieHeaders;
    private httpRequest;
    /**
     * Get all projects (not archived, not trashed)
     */
    listProjects(): Promise<Project[]>;
    /**
     * Get project by name
     */
    getProject(name: string): Promise<Project | undefined>;
    /**
     * Get project by ID
     */
    getProjectById(id: string): Promise<Project | undefined>;
    /**
     * Get detailed project info including file tree
     */
    getProjectInfo(projectId: string): Promise<ProjectInfo>;
    private invalidateProjectInfo;
    /**
     * Fetch the full project object via the collaboration socket.
     * Returns the `project` field of the joinProjectResponse, which contains
     * the rootFolder tree and other metadata that used to live in ol-project.
     */
    private getProjectFromSocket;
    /**
     * Download a URL as a Buffer using Node.js http/https modules.
     *
     * This avoids fetch's strict header validation which rejects non-Latin1
     * characters in response headers (e.g. Content-Disposition with Unicode
     * project names). See: https://github.com/aloth/olcli/issues/2
     */
    private downloadBuffer;
    /**
     * Download project as zip
     *
     * Uses downloadBuffer to avoid ByteString errors from non-Latin1
     * Content-Disposition headers. See: https://github.com/aloth/olcli/issues/2
     */
    downloadProject(projectId: string): Promise<Buffer>;
    /**
     * Compile project and get PDF
     */
    compileProject(projectId: string): Promise<{
        pdfUrl: string;
        logs: string[];
    }>;
    /**
     * Download compiled PDF
     */
    downloadPdf(projectId: string): Promise<Buffer>;
    /**
     * Create a folder in a project
     */
    createFolder(projectId: string, parentFolderId: string, name: string): Promise<string>;
    /**
     * Compute root folder ID from project ID
     * MongoDB ObjectIDs are 24 hex chars. The root folder ID is typically projectId - 1
     */
    computeRootFolderId(projectId: string): string;
    /**
     * Decode Socket.IO 0.9 payloads. Frames may be a single packet or \ufffd-length framed packets.
     */
    private decodeSocketIoPayload;
    /**
     * Extract root folder ID from a Socket.IO event packet (joinProjectResponse).
     */
    private extractRootFolderIdFromSocketPacket;
    /**
     * Extract full folder tree from a Socket.IO joinProjectResponse packet.
     * Returns a map of folder path -> folder ID, e.g. { '': rootId, 'figures': figuresId }
     */
    private extractFolderTreeFromSocketPacket;
    private folderTreeFromProjectInfo;
    /** Load the project tree once and reuse it for every upload in an operation. */
    getFolderTree(projectId: string): Promise<Record<string, string>>;
    /**
     * main problem to resolve root folder ID from Overleaf's collaboration join payload
     * authoritative for projects where ObjectID arithmetic does not apply
     */
    private getRootFolderIdFromSocket;
    /**
     * Get full folder tree for a project via Socket.IO.
     * Returns a map of folder path -> folder ID, e.g. { '': rootId, 'figures': figuresId }
     */
    getFolderTreeFromSocket(projectId: string): Promise<Record<string, string> | null>;
    /**
     * Resolve a folder path to a folder ID, creating missing folders as needed.
     * folderTree is a map of path -> ID (fetched once per push session).
     * folderPath is e.g. 'figures' or 'a/b/c'.
     */
    resolveFolderId(projectId: string, folderTree: Record<string, string>, folderPath: string): Promise<string>;
    /** Create a nested remote folder path and return its final folder ID. */
    createFolderByPath(projectId: string, folderPath: string): Promise<string>;
    /**
     * Get root folder ID for a project (tries multiple methods)
     */
    getRootFolderId(projectId: string): Promise<string>;
    /**
     * Find root folder ID by probing multiple candidates
     * This handles cases where projectId - 1 doesn't work
     */
    probeRootFolderId(projectId: string): Promise<string | null>;
    /**
     * Upload a file to a project.
     * If folderTree is provided and fileName contains a path (e.g. 'figures/img.png'),
     * the file will be uploaded into the correct subfolder, creating it if needed.
     */
    uploadFile(projectId: string, folderId: string | null, fileName: string, content: Buffer, folderTree?: Record<string, string>): Promise<{
        success: boolean;
        entityId?: string;
        entityType?: string;
    }>;
    /**
     * Delete a file or folder
     */
    deleteEntity(projectId: string, entityId: string, entityType: 'doc' | 'file' | 'folder'): Promise<void>;
    /**
     * Get list of entities (files/docs) with paths
     */
    getEntities(projectId: string): Promise<{
        path: string;
        type: 'doc' | 'file';
    }[]>;
    /**
     * Find entity ID by path (searches through project file tree)
     */
    findEntityByPath(projectId: string, targetPath: string): Promise<{
        id: string;
        type: 'doc' | 'file' | 'folder';
        name: string;
    } | null>;
    /**
     * Download a single file by ID
     */
    downloadFile(projectId: string, fileId: string, fileType: 'doc' | 'file'): Promise<Buffer>;
    /**
     * Replace an Overleaf text document without creating a local checkout.
     *
     * This uses Overleaf's supported upload route with the existing document
     * name. Overleaf treats that as an in-place replacement. Binary fileRefs are
     * intentionally rejected; they should continue to use uploadFile().
     */
    updateDocumentByPath(projectId: string, path: string, content: string): Promise<void>;
    /** Read the latest content of a remote text document. */
    readDocumentByPath(projectId: string, path: string): Promise<string>;
    /**
     * Rename a file, doc, or folder
     */
    renameEntity(projectId: string, entityId: string, entityType: 'doc' | 'file' | 'folder', newName: string): Promise<void>;
    /**
     * Delete a file by path
     */
    deleteByPath(projectId: string, path: string): Promise<void>;
    /**
     * Rename a file by path
     */
    renameByPath(projectId: string, oldPath: string, newName: string): Promise<void>;
    /**
     * Download a file by path (uses zip as fallback if ID not available)
     */
    downloadByPath(projectId: string, path: string): Promise<Buffer>;
    /**
     * Compile project and get all output files
     */
    compileWithOutputs(projectId: string): Promise<{
        status: 'success' | 'failure' | 'error';
        pdfUrl?: string;
        outputFiles: {
            path: string;
            type: string;
            url: string;
        }[];
    }>;
    /**
     * Download a compile output file (logs, bbl, aux, etc.)
     */
    downloadOutputFile(url: string): Promise<Buffer>;
}
//# sourceMappingURL=client.d.ts.map