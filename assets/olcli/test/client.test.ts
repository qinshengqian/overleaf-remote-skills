import assert from 'node:assert/strict';
import test from 'node:test';
import { OverleafClient } from '../src/client.js';

test('a cached root folder prevents redundant root discovery for root files', async () => {
  const client = new OverleafClient({
    cookies: { overleaf_session2: 'secret' },
    csrf: 'csrf',
    baseUrl: 'https://example.invalid',
  });
  let rootLookups = 0;
  (client as any).getRootFolderId = async () => {
    rootLookups++;
    return 'wrong-root';
  };
  (client as any).httpRequest = async () => ({
    status: 200,
    ok: true,
    headers: {},
    body: JSON.stringify({ success: true, entity_id: 'doc-1', entity_type: 'doc' }),
  });

  const result = await client.uploadFile(
    '0123456789abcdef01234567',
    null,
    'main.tex',
    Buffer.from('hello'),
    { '': 'cached-root' },
  );

  assert.equal(result.entityId, 'doc-1');
  assert.equal(rootLookups, 0);
});

test('a stale nested folder is refreshed without flattening the upload into root', async () => {
  const client = new OverleafClient({
    cookies: { overleaf_session2: 'secret' },
    csrf: 'csrf',
    baseUrl: 'https://example.invalid',
  });
  const urls: string[] = [];
  let attempt = 0;
  (client as any).httpRequest = async (url: string) => {
    urls.push(url);
    attempt++;
    return attempt === 1
      ? { status: 422, ok: false, headers: {}, body: '{"error":"folder_not_found"}' }
      : { status: 200, ok: true, headers: {}, body: '{"success":true,"entity_id":"doc-1","entity_type":"doc"}' };
  };
  (client as any).getFolderTree = async () => ({ '': 'fresh-root', chapters: 'fresh-subfolder' });
  (client as any).getRootFolderId = async () => {
    throw new Error('nested upload must not resolve or probe the root');
  };

  await client.uploadFile(
    '0123456789abcdef01234567',
    null,
    'chapters/method.tex',
    Buffer.from('hello'),
    { '': 'stale-root', chapters: 'stale-subfolder' },
  );

  assert.match(urls[0], /folder_id=stale-subfolder/);
  assert.match(urls[1], /folder_id=fresh-subfolder/);
  assert.equal(urls.some(url => url.includes('fresh-root')), false);
});

test('downloads documents from both current plain-text and legacy JSON responses', async () => {
  const client = new OverleafClient({
    cookies: { overleaf_session2: 'secret' },
    csrf: 'csrf',
    baseUrl: 'https://example.invalid',
  });
  let requestedUrl = '';
  (client as any).httpRequest = async (url: string) => {
    requestedUrl = url;
    return ({
    status: 200,
    ok: true,
    headers: {},
    body: Buffer.from('plain document'),
    });
  };
  assert.equal((await client.downloadFile('project', 'doc', 'doc')).toString(), 'plain document');
  assert.match(requestedUrl, /\/Project\/project\/doc\/doc\/download$/);

  (client as any).httpRequest = async () => ({
    status: 200,
    ok: true,
    headers: {},
    body: Buffer.from(JSON.stringify({ lines: ['legacy', 'document'] })),
  });
  assert.equal((await client.downloadFile('project', 'doc', 'doc')).toString(), 'legacy\ndocument');
});
