import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocketServer } from 'ws';
import {
  applyTextOperations,
  computeTextOperations,
  decodeOverleafText,
  OverleafRealtimeSession,
} from '../src/realtime.js';

test('computes a compact replacement instead of uploading a full document', () => {
  const before = 'prefix old suffix';
  const after = 'prefix new suffix';
  const operations = computeTextOperations(before, after);
  assert.deepEqual(operations, [
    { p: 7, d: 'old' },
    { p: 7, i: 'new' },
  ]);
  assert.equal(applyTextOperations(before, operations), after);
});

test('handles insertions, deletions, and Unicode safely', () => {
  for (const [before, after] of [
    ['abc', 'aXYZbc'],
    ['abc', 'ac'],
    ['论文内容', '论文新内容'],
    ['🙂 old', '🙂 new'],
    ['', 'new document'],
  ]) {
    assert.equal(applyTextOperations(before, computeTextOperations(before, after)), after);
  }
});

test('decodes Overleaf legacy UTF-8 document lines', () => {
  const encoded = unescape(encodeURIComponent('中文与 café'));
  assert.equal(decodeOverleafText(encoded), '中文与 café');
});

test('rejects a delete against unexpected content', () => {
  assert.throws(
    () => applyTextOperations('abcdef', [{ p: 2, d: 'XX' }]),
    /did not match/,
  );
});

test('speaks the Socket.IO 0.9 joinDoc/applyOtUpdate protocol', async t => {
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/socket.io/1/')) {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('test-session:15:60:websocket');
      return;
    }
    response.writeHead(404).end();
  });
  const websocketServer = new WebSocketServer({ noServer: true });
  let receivedUpdate: any;
  server.on('upgrade', (request, socket, head) => {
    websocketServer.handleUpgrade(request, socket, head, ws => websocketServer.emit('connection', ws, request));
  });
  websocketServer.on('connection', ws => {
    ws.send('1::');
    ws.send('5:::{"name":"joinProjectResponse","args":[{"protocolVersion":2,"permissionsLevel":"owner","project":{"rootFolder":[{"_id":"root","name":"root","folders":[],"docs":[{"_id":"doc-1","name":"main.tex"}],"fileRefs":[]}]}}]}');
    ws.on('message', raw => {
      const packet = raw.toString();
      const match = packet.match(/^5:(\d+)\+::(.*)$/s);
      if (!match) return;
      const id = match[1];
      const event = JSON.parse(match[2]);
      if (event.name === 'joinDoc') {
        ws.send(`6:::${id}+[null,["hello"],3,[],{},"sharejs-text-ot"]`);
      } else if (event.name === 'applyOtUpdate') {
        receivedUpdate = event.args[1];
        ws.send(`6:::${id}+[null]`);
        ws.send('5:::{"name":"otUpdateApplied","args":[{"v":3,"doc":"doc-1"}]}');
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

  const session = await OverleafRealtimeSession.connect(
    `http://127.0.0.1:${address.port}`,
    '0123456789abcdef01234567',
    'overleaf_session2=secret',
  );
  const result = await session.mutate('main.tex', text => text.replace('e', 'a'));
  session.close();

  assert.equal(result.content, 'hallo');
  assert.equal(result.version, 4);
  assert.deepEqual(receivedUpdate.op, [{ p: 1, d: 'e' }, { p: 1, i: 'a' }]);
  assert.equal(receivedUpdate.v, 3);
});
