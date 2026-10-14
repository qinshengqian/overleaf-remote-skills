import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocketServer } from 'ws';
import { applyTextOperations, OverleafRealtimeSession } from '../src/realtime.js';

/**
 * A mock collaboration server that speaks the bits of the Socket.IO 0.9
 * protocol the session uses, and can push a collaborator's update on demand so
 * the read-and-reconcile paths can be exercised without touching Overleaf.
 */
interface Mock {
  baseUrl: string;
  pushRemoteEdit: (operation: unknown[], version: number, doc?: string) => void;
  joinCount: () => number;
  dropSocket: () => void;
}

async function startMock(t: { after: (fn: () => void) => void }): Promise<Mock> {
  let joins = 0;
  let docVersion = 3;
  let docLines = ['hello'];
  let socket: import('ws').WebSocket | undefined;

  const project = {
    protocolVersion: 2,
    permissionsLevel: 'owner',
    project: {
      rootFolder: [
        {
          _id: 'root',
          name: 'root',
          folders: [{ _id: 'f1', name: 'sections', folders: [], docs: [{ _id: 'doc-2', name: '02-results.tex' }], fileRefs: [] }],
          docs: [{ _id: 'doc-1', name: 'main.tex' }],
          fileRefs: [{ _id: 'file-1', name: 'fig.png' }],
        },
      ],
    },
  };

  const server = createServer((request, response) => {
    if (request.url?.startsWith('/socket.io/1/')) {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('test-session:15:60:websocket');
      return;
    }
    response.writeHead(404).end();
  });
  const websocketServer = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, sock, head) => {
    websocketServer.handleUpgrade(request, sock, head, ws => websocketServer.emit('connection', ws, request));
  });
  websocketServer.on('connection', ws => {
    socket = ws;
    ws.send('1::');
    ws.send(`5:::${JSON.stringify({ name: 'joinProjectResponse', args: [project] })}`);
    ws.on('message', raw => {
      const match = raw.toString().match(/^5:(\d+)\+::(.*)$/s);
      if (!match) return;
      const id = match[1];
      const event = JSON.parse(match[2]);
      if (event.name === 'joinDoc') {
        joins++;
        ws.send(`6:::${id}+[null,${JSON.stringify(docLines)},${docVersion},[],{},"sharejs-text-ot"]`);
      } else if (event.name === 'applyOtUpdate') {
        const update = event.args[1];
        docLines = [applyTextOperations(docLines.join('\n'), update.op)];
        docVersion = update.v + 1;
        ws.send(`6:::${id}+[null]`);
        // Our own confirmation carries no op array.
        ws.send(`5:::${JSON.stringify({ name: 'otUpdateApplied', args: [{ v: update.v, doc: 'doc-1' }] })}`);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    websocketServer.close();
    server.close();
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock server did not bind');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    joinCount: () => joins,
    dropSocket: () => socket?.terminate(),
    pushRemoteEdit: (operation, version, doc = 'doc-1') => {
      socket?.send(`5:::${JSON.stringify({ name: 'otUpdateApplied', args: [{ doc, v: version, op: operation }] })}`);
    },
  };
}

async function connect(mock: Mock): Promise<OverleafRealtimeSession> {
  return OverleafRealtimeSession.connect(mock.baseUrl, '0123456789abcdef01234567', 'overleaf_session2=secret');
}

test('lists every document and binary file path, sorted', async t => {
  const mock = await startMock(t);
  const session = await connect(mock);
  t.after(() => session.close());

  assert.deepEqual(session.listDocuments(), ['main.tex', 'sections/02-results.tex']);
  assert.deepEqual(session.listFiles(), ['fig.png']);
});

test('snapshot returns content and version, and caches the join', async t => {
  const mock = await startMock(t);
  const session = await connect(mock);
  t.after(() => session.close());

  const first = await session.snapshot('main.tex');
  assert.equal(first.content, 'hello');
  assert.equal(first.version, 3);
  assert.equal(first.rejoined, true, 'a cold read has to join');
  assert.equal(mock.joinCount(), 1);

  const second = await session.snapshot('main.tex');
  assert.equal(second.content, 'hello');
  assert.equal(second.rejoined, false, 'a warm read is served from memory');
  assert.equal(mock.joinCount(), 1, 'a warm read must not re-join');
});

test("counts a collaborator's edit and applies it to the cached copy", async t => {
  const mock = await startMock(t);
  const session = await connect(mock);
  t.after(() => session.close());

  await session.snapshot('main.tex');
  assert.equal(session.report('main.tex').remoteEdits, 0);

  mock.pushRemoteEdit([{ p: 5, i: '!' }], 3);
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(session.report('main.tex').remoteEdits, 1, 'a remote op bumps the counter');
  const after = await session.snapshot('main.tex');
  assert.equal(after.content, 'hello!', 'the remote edit is folded into the cache');
  assert.equal(after.version, 4);
  assert.equal(after.rejoined, false, 'the cache was current, so no re-join was needed');
});

test('our own write confirmation is not counted as a remote edit', async t => {
  const mock = await startMock(t);
  const session = await connect(mock);
  t.after(() => session.close());

  await session.mutate('main.tex', text => text.replace('hello', 'hi'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(session.report('main.tex').remoteEdits, 0);
});

test('remote-edit count survives a forced re-join and a reconnect', async t => {
  const mock = await startMock(t);
  const session = await connect(mock);
  t.after(() => session.close());

  await session.snapshot('main.tex');
  mock.pushRemoteEdit([{ p: 5, i: '?' }], 3);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(session.report('main.tex').remoteEdits, 1);

  // A forced re-join rebuilds the document state; the counter lives beside it
  // precisely so this does not silently reset to zero.
  await session.snapshot('main.tex', true);
  assert.equal(session.report('main.tex').remoteEdits, 1, 'a forced re-join must not reset the counter');

  mock.dropSocket();
  await new Promise(resolve => setTimeout(resolve, 20));
  await session.snapshot('main.tex', true);
  assert.equal(session.report('main.tex').remoteEdits, 1, 'a reconnect must not reset the counter');
});

test('noteRead records the baseline the changed-since flags compare against', async t => {
  const mock = await startMock(t);
  const session = await connect(mock);
  t.after(() => session.close());

  const snapshot = await session.snapshot('main.tex');
  assert.equal(session.report('main.tex').lastReadVersion, undefined);
  session.noteRead('main.tex');
  assert.equal(session.report('main.tex').lastReadVersion, snapshot.version);

  mock.pushRemoteEdit([{ p: 5, i: '.' }], 3);
  await new Promise(resolve => setTimeout(resolve, 20));
  const report = session.report('main.tex');
  assert.notEqual(report.lastReadVersion, report.version, 'the version moved past the recorded baseline');
});
