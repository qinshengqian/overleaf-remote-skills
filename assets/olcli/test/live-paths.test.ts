import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import {
  contentHash,
  liveManifestPath,
  liveMirrorFile,
  liveRoot,
  sanitizeSegment,
  sliceLines,
} from '../src/livePaths.js';

const PROJECT = '0123456789abcdef01234567';

test('maps a remote path under the project mirror, preserving folders', () => {
  const target = liveMirrorFile(PROJECT, 'sections/02-results.tex');
  assert.equal(target, join(liveRoot(), PROJECT, 'sections', '02-results.tex'));
});

test('strips a leading slash instead of treating the path as absolute', () => {
  assert.equal(liveMirrorFile(PROJECT, '/main.tex'), join(liveRoot(), PROJECT, 'main.tex'));
});

test('refuses paths that would escape the mirror', () => {
  for (const path of ['../escape.tex', 'a/../../escape.tex', '/../escape.tex', 'a//b.tex', '', '.']) {
    assert.throws(() => liveMirrorFile(PROJECT, path), /remote path/, `expected ${JSON.stringify(path)} to be refused`);
  }
});

test('refuses windows-style and NUL separators', () => {
  assert.throws(() => liveMirrorFile(PROJECT, 'a\\b.tex'), /remote path/);
  assert.throws(() => liveMirrorFile(PROJECT, 'a\0b.tex'), /remote path/);
});

test('sanitizes a project id before it reaches the filesystem', () => {
  assert.equal(sanitizeSegment('../../etc'), '.._.._etc');
  // "." and ".." would otherwise resolve to the live root, or its parent.
  assert.equal(sanitizeSegment('..'), '_..');
  assert.equal(sanitizeSegment('.'), '_.');
  assert.ok(liveManifestPath('..').startsWith(liveRoot() + '/'));
});

test('keeps the manifest outside the mirror tree so a document cannot shadow it', () => {
  const mirrorDir = join(liveRoot(), PROJECT) + '/';
  assert.ok(!liveManifestPath(PROJECT).startsWith(mirrorDir));
});

test('hashes content stably and briefly', () => {
  assert.equal(contentHash('hello'), contentHash('hello'));
  assert.notEqual(contentHash('hello'), contentHash('hello!'));
  assert.equal(contentHash('hello').length, 16);
});

test('slices lines by a 1-based offset and a limit', () => {
  const content = 'a\nb\nc\nd';
  assert.deepEqual(sliceLines(content, 2, 2), { text: 'b\nc', offset: 2, limit: 2, total: 4 });
  assert.deepEqual(sliceLines(content), { text: content, offset: 1, limit: undefined, total: 4 });
  assert.deepEqual(sliceLines(content, 3), { text: 'c\nd', offset: 3, limit: undefined, total: 4 });
});
