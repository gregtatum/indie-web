import {
  ApiRoute,
  ClientError,
  type MountPath,
  NotFoundError,
  RequestConflict,
} from '../route-utils.ts';
import type { T } from '../index.ts';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, dirname } from 'node:path';
import { finished } from 'stream/promises';
import { parseFile } from 'music-metadata';
import { throttle } from '../../shared/utils.ts';
import {
  APP_FRAME_IDS,
  MUSIC_INDEX_VERSION,
  resolveTagValue,
} from '../../shared/music.ts';
import {
  MUSIC_INDEX_FILENAME,
  buildNodeId3Tags,
  embedArtworkIntoTrack,
  installScanCrashGuard,
  performScan,
  removeEmbeddedArtworkFromTrack,
  removeOutdatedFolderArtwork,
  serializeTagBlocks,
  sniffImageMimeType,
  updateMusicIndexAfterEmbeddedArtworkRemoval,
  updateIndexAfterFolderArtworkRemoval,
  updateIndexAfterFolderArtworkWrite,
  updateIndexAfterTrackTagWrites,
  writeTrackTagsForPath,
} from './logic.ts';
import type { EmbedArtworkFailure } from './logic.ts';

export { MUSIC_INDEX_FILENAME };

export function musicRoute(mountPath: MountPath) {
  const route = new ApiRoute();
  let scanInProgress = false;

  /**
   * List out the API routes as a simple hint and music index version.
   */
  route.get(
    '/',
    async (): Promise<{ routes: string[]; maxMusicIndexVersion: number }> => {
      return {
        routes: route.routes.map((r) => r.toString()),
        maxMusicIndexVersion: MUSIC_INDEX_VERSION,
      };
    },
  );

  /**
   * Returns the current music index, or 404 if no scan has been run yet.
   */
  route.get('/music-index', async (): Promise<T.MusicIndex> => {
    const indexPath = mountPath.joinOnMount(MUSIC_INDEX_FILENAME);
    if (!indexPath) {
      throw new Error('Unexpected: MUSIC_INDEX_FILENAME escaped the mount.');
    }
    try {
      const contents = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(contents) as T.MusicIndex;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new NotFoundError('Music index not found. Run a scan first.');
      }
      throw error;
    }
  });

  /**
   * Scans the mount directory for audio files, reads their ID3 tags, and
   * writes the result atomically to .music-index.json. Subsequent scans are
   * incremental: files whose mtime and size are unchanged reuse cached metadata.
   *
   * Returns 409 if a scan is already in progress.
   */
  route.post('/music-index/scan', async (req): Promise<T.MusicIndex> => {
    if (scanInProgress) {
      throw new RequestConflict('A scan is already in progress.');
    }
    scanInProgress = true;
    const uninstallScanCrashGuard = installScanCrashGuard();
    try {
      return await performScan(
        mountPath,
        undefined,
        req.query.force === 'true',
      );
    } finally {
      uninstallScanCrashGuard();
      scanInProgress = false;
    }
  });

  /**
   * SSE endpoint that streams scan progress in real time.
   * Events: total → progress × N → done (or error).
   */
  route.addBlobRoute('GET', '/music-index/scan', async (request, response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    // Guard against sending throttled updates after the scan finishes. This is a
    // separate local declaration from scanInProgress to guard against racy behavior.
    let canSendData = true;
    function sendData(event: Record<string, unknown>) {
      if (canSendData) {
        response.write('data: ' + JSON.stringify(event) + '\n\n');
      }
    }

    if (scanInProgress) {
      sendData({ type: 'error', message: 'A scan is already in progress.' });
      response.end();
      return;
    }

    scanInProgress = true;
    const uninstallScanCrashGuard = installScanCrashGuard();
    const sendProgress = throttle(
      (scanCount: number, path: string) =>
        sendData({ type: 'progress', scanCount, path }),
      500,
    );
    try {
      const index = await performScan(
        mountPath,
        {
          onTotalTracksCounted(count) {
            sendData({ type: 'total', count });
          },
          onTrackScanned(scanCount, path) {
            sendProgress(scanCount, path);
          },
        },
        request.query.force === 'true',
      );
      sendData({ type: 'done', tracks: index.tracks });
      response.end();
    } catch (err: any) {
      sendData({ type: 'error', message: err?.message ?? 'Scan failed.' });
      response.end();
    } finally {
      uninstallScanCrashGuard();
      scanInProgress = false;
      canSendData = false;
    }
  });

  /**
   * Streams an audio file with HTTP range request support so the browser
   * <audio> element can seek. Accepts a `path` query parameter.
   */
  route.addBlobRoute('GET', '/stream-audio', async (req, res) => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      res.status(400).send('Missing path query parameter.');
      return;
    }

    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }

    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(resolvedPath);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        res.status(404).send('File not found.');
        return;
      }
      throw error;
    }

    const fileSize = stats.size;
    res.setHeader('Accept-Ranges', 'bytes');

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      res.status(200);
      res.setHeader('Content-Length', fileSize);
      const stream = createReadStream(resolvedPath);
      stream.pipe(res);
      await finished(stream);
      return;
    }

    // Parse RFC 7233 byte ranges. Two distinct forms:
    //   bytes=<start>-[<end>]  (start required, end optional)
    //   bytes=-<suffix-length> (last N bytes; suffix-length required)
    const byteRangeMatch = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    const suffixMatch = /^bytes=-(\d+)$/.exec(rangeHeader);

    if (!byteRangeMatch && !suffixMatch) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).send();
      return;
    }

    let start: number;
    let end: number;

    if (suffixMatch) {
      const suffixLength = parseInt(suffixMatch[1], 10);
      start = Math.max(0, fileSize - suffixLength);
      end = fileSize - 1;
    } else {
      start = parseInt(byteRangeMatch![1], 10);
      end = byteRangeMatch![2]
        ? parseInt(byteRangeMatch![2], 10)
        : fileSize - 1;
    }

    if (start > end || end >= fileSize || start < 0) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).send();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    const stream = createReadStream(resolvedPath, { start, end });
    stream.pipe(res);
    await finished(stream);
  });

  /**
   * Returns all raw tag frames for a single audio file, serialized to
   * human-readable strings. Binary values (e.g. embedded pictures) are
   * represented as '[binary]'. Grouped by tag format (e.g. 'ID3v2.4', 'vorbis').
   */
  route.get('/track-tags', async (req): Promise<T.TrackTagsResponse> => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }
    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }
    const meta = await parseFile(resolvedPath);
    const blocks = serializeTagBlocks(meta.native ?? {});
    const resolved: Record<string, string> = {};
    for (const frameId of APP_FRAME_IDS) {
      const value = resolveTagValue(blocks, frameId);
      if (value !== undefined) {
        resolved[frameId] = value;
      }
    }
    return { blocks, resolved };
  });

  /**
   * Serves a folder artwork image stored in an album directory.
   * Accepts a ?path= query parameter using the same client-path convention as
   * stream-audio (e.g. /Artist/Album/Folder.jpg).
   */
  route.addBlobRoute('GET', '/artwork', async (req, res) => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }

    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }

    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(resolvedPath);
    } catch {
      res.status(404).send('Not found.');
      return;
    }

    const etag = `"${stats.size}-${stats.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    const ext = extname(resolvedPath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    const stream = createReadStream(resolvedPath);
    stream.pipe(res);
    await finished(stream);
  });

  /**
   * Reports the folder artwork size and type with no body, so the client can
   * show "· 240 KB" without downloading the image. Content-Length is
   * CORS-safelisted.
   */
  route.addBlobRoute('HEAD', '/artwork', async (req, res) => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }

    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }

    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(resolvedPath);
    } catch {
      res.status(404).end();
      return;
    }

    const ext = extname(resolvedPath).toLowerCase();
    res.setHeader('Content-Type', ext === '.png' ? 'image/png' : 'image/jpeg');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).end();
  });

  /**
   * Writes the album folder's primary artwork image, and optionally embeds the
   * same image into individual track files.
   */
  route.post('/artwork', async (req): Promise<T.WriteFolderArtworkResponse> => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }
    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }
    const dirFullPath = dirname(resolvedPath);
    const dirClientPath = dirname(
      clientPath.startsWith('/') ? clientPath : '/' + clientPath,
    );

    const uploaded =
      Buffer.isBuffer(req.body) && req.body.length > 0
        ? (req.body as Buffer)
        : null;

    let imageData: Buffer;
    let mimeType: 'image/jpeg' | 'image/png';
    if (uploaded) {
      const sniffed = sniffImageMimeType(uploaded);
      if (!sniffed) {
        throw new ClientError('Uploaded artwork must be a JPEG or PNG image.');
      }
      imageData = uploaded;
      mimeType = sniffed;
    } else {
      const meta = await parseFile(resolvedPath);
      const picture = meta.common.picture?.[0];
      if (!picture) {
        throw new ClientError('No embedded picture found in this file.');
      }
      imageData = Buffer.from(picture.data);
      mimeType = picture.format === 'image/png' ? 'image/png' : 'image/jpeg';
    }

    const filename = mimeType === 'image/png' ? 'Folder.png' : 'Folder.jpg';
    const artworkFullPath = mountPath.joinWithinMount(dirFullPath, filename);
    if (!artworkFullPath) {
      throw new Error('Unexpected: folder artwork path escaped the mount.');
    }
    await fs.writeFile(artworkFullPath, imageData);

    const response: T.WriteFolderArtworkResponse = {
      folderArtworkPath: dirClientPath + '/' + filename,
    };

    // An uploaded image is authoritative: clear the other recognized folder
    // artwork files so a higher-priority leftover (e.g. cover.jpg) can't
    // shadow it.
    if (uploaded) {
      await removeOutdatedFolderArtwork(
        mountPath,
        dirFullPath,
        dirClientPath,
        filename,
      );
    }

    const embedParam = req.query.embedInTracks;
    if (uploaded && typeof embedParam === 'string' && embedParam) {
      const trackPaths = embedParam
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      const updatedTracks: string[] = [];
      const errors: EmbedArtworkFailure[] = [];
      for (const trackClientPath of trackPaths) {
        const result = await embedArtworkIntoTrack(
          mountPath,
          trackClientPath,
          imageData,
        );
        if ('message' in result) {
          errors.push(result);
        } else {
          updatedTracks.push(result.clientPath);
        }
      }
      response.tracksEmbedded = { updatedTracks, errors };
    }

    await updateIndexAfterFolderArtworkWrite(
      mountPath,
      response.folderArtworkPath,
      response.tracksEmbedded?.updatedTracks ?? [],
    );

    return response;
  });

  /**
   * Deletes the album folder's artwork image.
   */
  route.post('/artwork/remove', async (req): Promise<{ removed: string[] }> => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }
    const resolvedPath = mountPath.resolve(clientPath);
    if (!resolvedPath) {
      throw new ClientError('Invalid path.');
    }
    const dirFullPath = dirname(resolvedPath);
    const dirClientPath = dirname(
      clientPath.startsWith('/') ? clientPath : '/' + clientPath,
    );

    const removed = await removeOutdatedFolderArtwork(
      mountPath,
      dirFullPath,
      dirClientPath,
      '',
    );

    await updateIndexAfterFolderArtworkRemoval(mountPath, dirClientPath);

    return { removed };
  });

  /**
   * Embeds an already-written folder artwork image into a list of track files,
   * so the album's per-track APIC art matches the folder image. Every track is
   * attempted. Per-file failures are reported without stopping the rest.
   */
  route.post(
    '/artwork/embed',
    async (req): Promise<T.EmbedFolderArtworkResponse> => {
      const { folderArtworkPath, trackPaths } =
        req.body as T.EmbedFolderArtworkRequest;
      if (typeof folderArtworkPath !== 'string' || !folderArtworkPath) {
        throw new ClientError('Missing folderArtworkPath.');
      }
      if (!Array.isArray(trackPaths) || trackPaths.length === 0) {
        throw new ClientError('Missing or empty trackPaths array.');
      }

      const resolvedArtwork = mountPath.resolve(folderArtworkPath);
      if (!resolvedArtwork) {
        throw new ClientError('Invalid folderArtworkPath.');
      }
      let imageData: Buffer;
      try {
        imageData = await fs.readFile(resolvedArtwork);
      } catch {
        throw new NotFoundError('Folder artwork file not found.');
      }
      if (!sniffImageMimeType(imageData)) {
        throw new ClientError('Folder artwork is not a JPEG or PNG image.');
      }

      const updated: string[] = [];
      const errors: EmbedArtworkFailure[] = [];
      for (const trackClientPath of trackPaths) {
        const result = await embedArtworkIntoTrack(
          mountPath,
          trackClientPath,
          imageData,
        );
        if ('message' in result) {
          errors.push(result);
        } else {
          updated.push(result.clientPath);
        }
      }

      // Best-effort: keep the durable music index fresh so the embedded art
      // survives without a rescan.
      await updateIndexAfterFolderArtworkWrite(
        mountPath,
        folderArtworkPath,
        updated,
      );
      return { updated, errors };
    },
  );

  /**
   * Strips every embedded picture (APIC) frame from a single MP3, leaving the
   * album's folder artwork file untouched.
   */
  route.post('/artwork/embedded/remove', async (req): Promise<{ ok: true }> => {
    const clientPath = req.query.path;
    if (typeof clientPath !== 'string' || !clientPath) {
      throw new ClientError('Missing path query parameter.');
    }
    const result = await removeEmbeddedArtworkFromTrack(mountPath, clientPath);
    if ('message' in result) {
      if (result.message === 'File not found.') {
        throw new NotFoundError(result.message);
      }
      throw new ClientError(result.message);
    }
    // Best-effort: flip hasEmbeddedArtwork in the durable index so it does
    // not go stale until the next scan.
    await updateMusicIndexAfterEmbeddedArtworkRemoval(mountPath, {
      clientPath: result.clientPath,
      resolvedPath: result.resolvedPath,
    });
    return { ok: true };
  });

  /**
   * Writes one or more ID3 tag frames to MP3 files in-place.
   * Accepts { paths, changes: [{ frameId, value }] }. Uses a diff approach —
   * only the specified frames are rewritten; all others are preserved.
   * Only MP3 (ID3v2.x) files are supported.
   */
  route.post(
    '/write-track-tags',
    async (req): Promise<T.WriteTrackTagsResponse> => {
      const { paths, changes } = req.body as T.WriteTrackTagsRequest;
      if (!Array.isArray(paths) || paths.length === 0) {
        throw new ClientError('Missing or empty paths array.');
      }
      if (!Array.isArray(changes) || changes.length === 0) {
        throw new ClientError('Missing or empty changes array.');
      }
      // Validate/build the requested tags once up front so a malformed
      // request fails before any file is touched.
      buildNodeId3Tags(changes);
      const updatedTracks = [] as T.ResultValue<typeof writeTrackTagsForPath>[];
      const errors: T.WriteTrackTagsResponse['errors'] = [];

      for (const clientPath of paths) {
        const result = await writeTrackTagsForPath(
          mountPath,
          clientPath,
          changes,
        );
        if (result.type === 'error') {
          errors.push({ path: clientPath, message: result.message });
        } else {
          updatedTracks.push(result);
        }
      }

      const index = await updateIndexAfterTrackTagWrites(
        mountPath,
        updatedTracks,
        changes,
      );
      return {
        updated: updatedTracks.map((track) => track.clientPath),
        errors,
        index,
      };
    },
  );

  return route.router;
}
