import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { musicRoute } from '../route-music.ts';
import { createTestServer, withLogs } from './helpers.ts';
import type { TestServer } from './helpers.ts';

// 256 bytes of deterministic content for range assertions.
const FILE_CONTENT = Buffer.alloc(256, 0);
for (let i = 0; i < 256; i++) {
  FILE_CONTENT[i] = i;
}

describe('GET /music/stream-audio', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer((app, mountDir) => {
      app.use('/music', musicRoute(mountDir));
    });
    await writeFile(join(server.mountDir, 'audio.mp3'), FILE_CONTENT);
  });

  after(() => server.close());

  it(
    'returns 200 and full content when no Range header is sent',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/audio.mp3`,
      );
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Accept-Ranges'), 'bytes');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.length, 256);
      assert.ok(buf.equals(FILE_CONTENT));
    }),
  );

  it(
    'returns 206 and the correct byte slice for a range request',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/audio.mp3`,
        { headers: { Range: 'bytes=0-99' } },
      );
      assert.equal(res.status, 206);
      assert.equal(res.headers.get('Content-Range'), 'bytes 0-99/256');
      assert.equal(res.headers.get('Content-Length'), '100');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.length, 100);
      assert.equal(buf[0], 0);
      assert.equal(buf[99], 99);
    }),
  );

  it(
    'handles a mid-file range correctly',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/audio.mp3`,
        { headers: { Range: 'bytes=100-149' } },
      );
      assert.equal(res.status, 206);
      assert.equal(res.headers.get('Content-Range'), 'bytes 100-149/256');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.length, 50);
      assert.equal(buf[0], 100);
      assert.equal(buf[49], 149);
    }),
  );

  it(
    'handles a suffix range (bytes=-N)',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/audio.mp3`,
        { headers: { Range: 'bytes=-10' } },
      );
      assert.equal(res.status, 206);
      assert.equal(res.headers.get('Content-Range'), 'bytes 246-255/256');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.length, 10);
      assert.equal(buf[0], 246);
    }),
  );

  it(
    'returns 416 for a malformed Range header (bytes=-)',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/audio.mp3`,
        { headers: { Range: 'bytes=-' } },
      );
      assert.equal(res.status, 416);
    }),
  );

  it(
    'returns 416 for an out-of-range request',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/audio.mp3`,
        { headers: { Range: 'bytes=300-400' } },
      );
      assert.equal(res.status, 416);
      assert.equal(res.headers.get('Content-Range'), 'bytes */256');
    }),
  );

  it(
    'returns 404 for a file that does not exist',
    withLogs([], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/nonexistent.mp3`,
      );
      assert.equal(res.status, 404);
    }),
  );

  it(
    'returns 400 when path query parameter is missing',
    withLogs([], async () => {
      const res = await fetch(`${server.baseUrl}/music/stream-audio`);
      assert.equal(res.status, 400);
    }),
  );

  it(
    'rejects path traversal attempts',
    withLogs(['[400err ]'], async () => {
      const res = await fetch(
        `${server.baseUrl}/music/stream-audio?path=/../../etc/passwd`,
      );
      assert.equal(res.status, 400);
    }),
  );
});
