import * as http from 'node:http';
import * as https from 'node:https';
import WebSocket from 'ws';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_UPDATE_BYTES = 512 * 1024;

export type TextOperation = { p: number; i: string } | { p: number; d: string };

interface FolderLike {
  _id: string;
  name: string;
  folders?: FolderLike[];
  docs?: { _id: string; name: string }[];
  fileRefs?: { _id: string; name: string }[];
}

interface DocumentState {
  id: string;
  path: string;
  content: string;
  version: number;
  stale: boolean;
  inFlight?: {
    baseVersion: number;
    remoteDuringWrite: boolean;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  };
}

interface PendingAck {
  resolve: (args: unknown[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface RealtimeSessionInfo {
  protocolVersion?: number;
  permissionsLevel?: string;
  documents: number;
  files: number;
}

export class RealtimeUnavailableError extends Error {
  constructor(message: string, readonly safeToFallback = false) {
    super(message);
    this.name = 'RealtimeUnavailableError';
  }
}

export function computeTextOperations(before: string, after: string): TextOperation[] {
  if (before === after) return [];
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(before.length - prefix, after.length - prefix);
  while (
    suffix < maxSuffix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;

  const removed = before.slice(prefix, before.length - suffix);
  const inserted = after.slice(prefix, after.length - suffix);
  const operations: TextOperation[] = [];
  if (removed) operations.push({ p: prefix, d: removed });
  if (inserted) operations.push({ p: prefix, i: inserted });
  return operations;
}

export function applyTextOperations(content: string, operations: TextOperation[]): string {
  let result = content;
  for (const operation of operations) {
    if (!Number.isInteger(operation.p) || operation.p < 0 || operation.p > result.length) {
      throw new Error(`Invalid OT position: ${operation.p}`);
    }
    if ('d' in operation) {
      if (result.slice(operation.p, operation.p + operation.d.length) !== operation.d) {
        throw new Error('OT delete did not match the current document');
      }
      result = result.slice(0, operation.p) + result.slice(operation.p + operation.d.length);
    } else {
      result = result.slice(0, operation.p) + operation.i + result.slice(operation.p);
    }
  }
  return result;
}

export function decodeOverleafText(text: string): string {
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function decodePayload(payload: string): string[] {
  if (!payload.startsWith('\ufffd')) return [payload];
  const packets: string[] = [];
  let offset = 0;
  while (offset < payload.length && payload[offset] === '\ufffd') {
    const endLength = payload.indexOf('\ufffd', offset + 1);
    if (endLength < 0) break;
    const length = Number(payload.slice(offset + 1, endLength));
    if (!Number.isFinite(length) || length < 0) break;
    const start = endLength + 1;
    packets.push(payload.slice(start, start + length));
    offset = start + length;
  }
  return packets;
}

function requestText(url: string, cookie: string): Promise<{ body: string; setCookie: string[] }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.get(parsed, {
      headers: { Cookie: cookie, 'User-Agent': 'olcli-realtime/1' },
      timeout: DEFAULT_TIMEOUT_MS,
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new RealtimeUnavailableError(`Socket handshake failed: HTTP ${response.statusCode || 0}`, true));
          return;
        }
        resolve({
          body: Buffer.concat(chunks).toString('utf-8'),
          setCookie: response.headers['set-cookie'] || [],
        });
      });
    });
    request.on('timeout', () => request.destroy(new RealtimeUnavailableError('Socket handshake timed out', true)));
    request.on('error', reject);
  });
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RealtimeUnavailableError(message)), DEFAULT_TIMEOUT_MS);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export class OverleafRealtimeSession {
  private socket?: WebSocket;
  private nextAckId = 1;
  private pendingAcks = new Map<number, PendingAck>();
  private eventWaiters = new Map<string, Array<(args: unknown[]) => void>>();
  private documents = new Map<string, DocumentState>();
  private documentIds = new Map<string, string>();
  private fileCount = 0;
  private closed = false;
  private operationChain: Promise<unknown> = Promise.resolve();
  private info: RealtimeSessionInfo = { documents: 0, files: 0 };

  private constructor(
    private readonly baseUrl: string,
    private readonly projectId: string,
    private cookie: string,
  ) {}

  static async connect(baseUrl: string, projectId: string, cookie: string): Promise<OverleafRealtimeSession> {
    const session = new OverleafRealtimeSession(baseUrl, projectId, cookie);
    try {
      await session.open();
      return session;
    } catch (error) {
      session.close();
      throw error;
    }
  }

  get sessionInfo(): RealtimeSessionInfo {
    return { ...this.info };
  }

  private async open(): Promise<void> {
    const handshakeUrl = `${this.baseUrl}/socket.io/1/?projectId=${encodeURIComponent(this.projectId)}&t=${Date.now()}`;
    const handshake = await requestText(handshakeUrl, this.cookie);
    for (const header of handshake.setCookie) {
      const match = header.match(/^([^=]+)=([^;]+)/);
      if (match && !this.cookie.includes(`${match[1]}=`)) this.cookie += `; ${match[1]}=${match[2]}`;
    }
    const [sid, , , transports = ''] = handshake.body.trim().split(':');
    if (!sid || !transports.split(',').includes('websocket')) {
      throw new RealtimeUnavailableError('This Overleaf instance does not offer the WebSocket transport', true);
    }

    const base = new URL(this.baseUrl);
    const wsProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${base.host}/socket.io/1/websocket/${encodeURIComponent(sid)}?projectId=${encodeURIComponent(this.projectId)}`;
    const projectResponse = this.waitForEvent('joinProjectResponse');
    const connected = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl, {
        headers: {
          Cookie: this.cookie,
          Origin: base.origin,
          'User-Agent': 'olcli-realtime/1',
        },
        handshakeTimeout: DEFAULT_TIMEOUT_MS,
        maxPayload: 16 * 1024 * 1024,
        perMessageDeflate: false,
      });
      this.socket = socket;
      socket.once('open', resolve);
      socket.once('error', reject);
      socket.on('message', data => this.handleMessage(data.toString()));
      socket.on('close', () => this.handleClose(new RealtimeUnavailableError('Realtime connection closed')));
    });
    await withTimeout(connected, 'WebSocket connection timed out');
    const args = await withTimeout(projectResponse, 'Timed out waiting for joinProjectResponse');
    const payload = args[0] as any;
    if (!payload?.project) throw new RealtimeUnavailableError('Overleaf did not return project metadata');
    if (payload.permissionsLevel === 'readOnly') {
      throw new RealtimeUnavailableError('Project is read-only for this account', true);
    }
    this.info.protocolVersion = payload.protocolVersion;
    this.info.permissionsLevel = payload.permissionsLevel;
    this.indexProject(payload.project.rootFolder || []);
  }

  private indexProject(roots: FolderLike[]): void {
    this.documentIds.clear();
    this.fileCount = 0;
    const visit = (folder: FolderLike, prefix: string) => {
      for (const doc of folder.docs || []) {
        this.documentIds.set(prefix ? `${prefix}/${doc.name}` : doc.name, doc._id);
      }
      this.fileCount += (folder.fileRefs || []).length;
      for (const child of folder.folders || []) {
        visit(child, prefix ? `${prefix}/${child.name}` : child.name);
      }
    };
    for (const root of roots) visit(root, '');
    this.info.documents = this.documentIds.size;
    this.info.files = this.fileCount;
  }

  registerDocument(path: string, id: string): void {
    const normalized = path.replace(/^\/+/, '');
    this.documentIds.set(normalized, id);
    this.info.documents = this.documentIds.size;
  }

  hasDocument(path: string): boolean {
    return this.documentIds.has(path.replace(/^\/+/, ''));
  }

  private waitForEvent(name: string): Promise<unknown[]> {
    return new Promise(resolve => {
      const waiters = this.eventWaiters.get(name) || [];
      waiters.push(resolve);
      this.eventWaiters.set(name, waiters);
    });
  }

  private handleMessage(payload: string): void {
    for (const packet of decodePayload(payload)) this.handlePacket(packet);
  }

  private handlePacket(packet: string): void {
    const match = packet.match(/^([0-8]):([^:]*):([^:]*)(?::([\s\S]*))?$/);
    if (!match) return;
    const [, type, , , data = ''] = match;
    if (type === '2') {
      this.sendRaw('2::');
      return;
    }
    if (type === '0') {
      this.handleClose(new RealtimeUnavailableError('Server closed the realtime connection'));
      return;
    }
    if (type === '6') {
      const plus = data.indexOf('+');
      const idText = plus >= 0 ? data.slice(0, plus) : data;
      const id = Number(idText);
      const pending = this.pendingAcks.get(id);
      if (!pending) return;
      this.pendingAcks.delete(id);
      clearTimeout(pending.timer);
      let args: unknown[] = [];
      if (plus >= 0 && data.slice(plus + 1)) {
        try { args = JSON.parse(data.slice(plus + 1)); } catch { args = []; }
      }
      pending.resolve(args);
      return;
    }
    if (type !== '5') return;
    let event: any;
    try { event = JSON.parse(data); } catch { return; }
    if (!event?.name || !Array.isArray(event.args)) return;
    if (event.name === 'otUpdateApplied') this.handleOtUpdate(event.args[0]);
    if (event.name === 'otUpdateError') {
      this.handleClose(new RealtimeUnavailableError(`Overleaf rejected the OT update: ${String(event.args[0] || 'unknown error')}`));
    }
    if (event.name === 'connectionRejected') {
      this.handleClose(new RealtimeUnavailableError(`Realtime connection rejected: ${String(event.args[0] || 'unknown reason')}`));
    }
    const waiters = this.eventWaiters.get(event.name) || [];
    this.eventWaiters.delete(event.name);
    for (const resolve of waiters) resolve(event.args);
  }

  private handleOtUpdate(update: any): void {
    if (!update?.doc || !Number.isInteger(update.v)) return;
    const state = Array.from(this.documents.values()).find(item => item.id === update.doc);
    if (!state) return;
    if (state.inFlight) {
      if (!update.op && update.v === state.inFlight.baseVersion) {
        clearTimeout(state.inFlight.timer);
        state.inFlight.resolve();
      } else {
        state.inFlight.remoteDuringWrite = true;
        state.stale = true;
      }
      return;
    }
    if (!Array.isArray(update.op) || update.v !== state.version) {
      state.stale = true;
      return;
    }
    try {
      state.content = applyTextOperations(state.content, update.op as TextOperation[]);
      state.version++;
    } catch {
      state.stale = true;
    }
  }

  private sendRaw(packet: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new RealtimeUnavailableError('Realtime connection is not open');
    }
    this.socket.send(packet);
  }

  private emitWithAck(name: string, args: unknown[]): Promise<unknown[]> {
    const id = this.nextAckId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(id);
        reject(new RealtimeUnavailableError(`${name} acknowledgement timed out`));
      }, DEFAULT_TIMEOUT_MS);
      this.pendingAcks.set(id, { resolve, reject, timer });
      try {
        this.sendRaw(`5:${id}+::${JSON.stringify({ name, args })}`);
      } catch (error) {
        clearTimeout(timer);
        this.pendingAcks.delete(id);
        reject(error);
      }
    });
  }

  private async joinDocument(path: string, force = false): Promise<DocumentState> {
    const normalized = path.replace(/^\/+/, '');
    const current = this.documents.get(normalized);
    if (current && !current.stale && !force) return current;
    const id = this.documentIds.get(normalized);
    if (!id) throw new Error(`Remote text document not found: ${path}`);
    let args: unknown[];
    try {
      args = await this.emitWithAck('joinDoc', [id, { encodeRanges: true, supportsHistoryOT: false }]);
    } catch (error: any) {
      // Joining is read-only. Even if its acknowledgement is lost, no edit can
      // have been applied, so the HTTP path is safe here.
      throw new RealtimeUnavailableError(error.message || String(error), true);
    }
    if (args[0]) throw new RealtimeUnavailableError(`joinDoc failed: ${String(args[0])}`, true);
    const lines = args[1];
    const version = args[2];
    const type = args[5] || 'sharejs-text-ot';
    if (!Array.isArray(lines) || !Number.isInteger(version)) {
      throw new RealtimeUnavailableError('joinDoc returned an unsupported response', true);
    }
    if (type !== 'sharejs-text-ot') {
      throw new RealtimeUnavailableError(`Unsupported document OT type: ${String(type)}`, true);
    }
    const state: DocumentState = {
      id,
      path: normalized,
      content: lines.map(line => decodeOverleafText(String(line))).join('\n'),
      version: version as number,
      stale: false,
    };
    this.documents.set(normalized, state);
    return state;
  }

  async read(path: string, force = false): Promise<string> {
    return (await this.joinDocument(path, force)).content;
  }

  async refresh(path?: string): Promise<void> {
    if (path) {
      await this.joinDocument(path, true);
      return;
    }
    for (const state of this.documents.values()) state.stale = true;
  }

  async mutate(path: string, transform: (content: string) => string, verify = false): Promise<{ content: string; version: number; verified: boolean }> {
    const run = async () => {
      const state = await this.joinDocument(path);
      const before = state.content;
      const after = transform(before).replace(/\r\n/g, '\n');
      if (after === before) throw new Error('The requested operation did not change the document');
      const operations = computeTextOperations(before, after);
      const update = { doc: state.id, op: operations, v: state.version, dupIfSource: [] };
      if (Buffer.byteLength(JSON.stringify(update)) > MAX_UPDATE_BYTES) {
        throw new RealtimeUnavailableError('OT update is too large for the realtime channel', true);
      }

      let appliedResolve!: () => void;
      let appliedReject!: (error: Error) => void;
      const applied = new Promise<void>((resolve, reject) => {
        appliedResolve = resolve;
        appliedReject = reject;
      });
      const timer = setTimeout(() => appliedReject(new RealtimeUnavailableError('OT apply confirmation timed out')), DEFAULT_TIMEOUT_MS);
      state.inFlight = {
        baseVersion: state.version,
        remoteDuringWrite: false,
        resolve: appliedResolve,
        reject: appliedReject,
        timer,
      };

      try {
        const ackPromise = this.emitWithAck('applyOtUpdate', [state.id, update]).then(ack => {
          if (ack[0]) throw new RealtimeUnavailableError(`applyOtUpdate failed: ${String(ack[0])}`);
          return ack;
        });
        await Promise.all([
          ackPromise,
          applied,
        ]);
        const raced = state.inFlight.remoteDuringWrite;
        state.inFlight = undefined;
        if (raced || verify) {
          const fresh = await this.joinDocument(path, true);
          if (!raced && fresh.content !== after) {
            throw new RealtimeUnavailableError('Versioned verification did not match the requested content');
          }
          return { content: fresh.content, version: fresh.version, verified: true };
        }
        state.content = after;
        state.version++;
        state.stale = false;
        return { content: after, version: state.version, verified: true };
      } catch (error) {
        state.stale = true;
        throw error;
      } finally {
        if (state.inFlight) {
          clearTimeout(state.inFlight.timer);
          state.inFlight = undefined;
        }
      }
    };
    const result = this.operationChain.then(run, run);
    this.operationChain = result.then(() => undefined, () => undefined);
    return result;
  }

  close(): void {
    this.closed = true;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send('0::');
    this.socket?.close();
    this.handleClose(new RealtimeUnavailableError('Realtime session closed'));
  }

  private handleClose(error: Error): void {
    if (!this.closed) {
      for (const state of this.documents.values()) state.stale = true;
    }
    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingAcks.clear();
    for (const state of this.documents.values()) {
      if (state.inFlight) {
        clearTimeout(state.inFlight.timer);
        state.inFlight.reject(error);
        state.inFlight = undefined;
      }
    }
  }
}
