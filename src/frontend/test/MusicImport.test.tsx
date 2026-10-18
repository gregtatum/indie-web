import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { act } from 'react';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $, A, T } from 'frontend';
import { persistedState } from 'frontend/logic/persisted-state';
import {
  ORGANIZATION_PRESET_TEMPLATES,
  resolveOrganizationPath,
} from 'shared/music';
import {
  buildJpegBytes,
  buildMp3WithTags,
  clearMusicMount,
  renderMusicApp,
  useMusicTestServer,
  waitForNetworkIdle,
} from './utils/music';
import { expectConsoleError } from './utils/setupAfterEnv';

const jestDescribe = globalThis.describe;
let describe: (name: string, fn: () => void) => void = jestDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  describe = (name) => {
    process.stderr.write(`LOCALHOST_BIND_SKIPPED_TEST ${name}\n`);
  };
  it.skip('localhost-dependent tests skipped by check runner', () => {});
}

function makeDataTransfer(files: File[]): DataTransfer {
  return {
    files,
    types: ['Files'],
    items: [],
    setData: () => {},
    getData: () => '',
    clearData: () => {},
  } as unknown as DataTransfer;
}

function fileEntry(file: File): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    file: (success: (file: File) => void) => success(file),
  } as unknown as FileSystemFileEntry;
}

function dirEntry(name: string, children: FileSystemEntry[]): FileSystemEntry {
  let read = false;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (success: (entries: FileSystemEntry[]) => void) => {
        success(read ? [] : children);
        read = true;
      },
    }),
  } as unknown as FileSystemEntry;
}

function makeFolderDataTransfer(entries: FileSystemEntry[]): DataTransfer {
  return {
    files: [],
    types: ['Files'],
    items: entries.map((entry) => ({
      kind: 'file',
      webkitGetAsEntry: () => entry,
    })),
    setData: () => {},
    getData: () => '',
    clearData: () => {},
  } as unknown as DataTransfer;
}

function treeRows(): string[] {
  return within(screen.getByRole('list', { name: 'Organized folders' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '');
}

function presetRadio(template: string): HTMLInputElement {
  return screen.getByRole('radio', {
    name: (name) =>
      name.replace(/\s/g, '') ===
      (template === 'Custom…' ? template : `/${template}`).replace(/\s/g, ''),
  }) as HTMLInputElement;
}

describe('drag-and-drop import & organize', () => {
  const { getServer } = useMusicTestServer();

  afterEach(async () => {
    await clearMusicMount(getServer());
    window.localStorage.removeItem(persistedState.musicOrganizePattern.key);
  });

  async function dropZone(): Promise<HTMLElement> {
    return waitFor(() => {
      const el =
        document.querySelector<HTMLElement>(
          '.musicLibrarySplitterDropTarget',
        ) ?? document.querySelector<HTMLElement>('.musicLibraryView');
      if (!el) {
        throw new Error('.musicLibraryView not rendered yet');
      }
      return el;
    });
  }

  async function waitForStagingPool(
    store: Awaited<ReturnType<typeof renderMusicApp>>['store'],
    trackCount: number,
  ) {
    await waitFor(() => {
      expect($.getMusicStagingPool(store.getState())).toHaveLength(trackCount);
    });
  }

  async function dropTrack(
    fileName: string,
    tags: Parameters<typeof buildMp3WithTags>[0],
    existingStore?: Awaited<ReturnType<typeof renderMusicApp>>['store'],
  ) {
    const store =
      existingStore ?? (await renderMusicApp({ server: getServer() })).store;
    const zone = await dropZone();
    const file = new File([new Uint8Array(buildMp3WithTags(tags))], fileName, {
      type: 'audio/mpeg',
    });
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([file]) });
      await waitForNetworkIdle();
    });
    await waitForStagingPool(store, 1);
    return { store };
  }

  async function dropTracks(
    files: Array<{
      fileName: string;
      tags: Parameters<typeof buildMp3WithTags>[0];
    }>,
    existingStore?: Awaited<ReturnType<typeof renderMusicApp>>['store'],
  ) {
    const store =
      existingStore ?? (await renderMusicApp({ server: getServer() })).store;
    const zone = await dropZone();
    const dataTransfer = makeDataTransfer(
      files.map(
        ({ fileName, tags }) =>
          new File([new Uint8Array(buildMp3WithTags(tags))], fileName, {
            type: 'audio/mpeg',
          }),
      ),
    );
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer });
      await waitForNetworkIdle();
    });
    await waitForStagingPool(store, files.length);
    await act(async () => {
      await waitForNetworkIdle();
    });
    return { store };
  }

  function mockClipboard() {
    const clipboard = { text: '' };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          clipboard.text = text;
        },
        readText: async () => clipboard.text,
      },
    });
    return clipboard;
  }

  async function copyArtistAndPasteIntoAll(
    store: Awaited<ReturnType<typeof renderMusicApp>>['store'],
    artist: string,
  ) {
    mockClipboard();
    await act(async () => {
      fireEvent.click(
        screen.getAllByText(artist, {
          selector: '.musicBatchEditCellText',
        })[0],
      );
    });
    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'c', metaKey: true });
      fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
    });
    expect(
      $.getMusicSelectedTrackPaths(store.getState()).length,
    ).toBeGreaterThan(1);
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'v', metaKey: true });
      await waitForNetworkIdle();
    });
  }

  const albumA = { albumArtist: 'Pink Floyd', album: 'Meddle' };
  const albumB = { albumArtist: 'Geinoh', album: 'Akira' };

  async function dropFolders(
    folders: Array<{
      name: string;
      tracks: Array<{
        fileName: string;
        tags: Parameters<typeof buildMp3WithTags>[0];
      }>;
      coverSize?: number;
    }>,
    existingStore?: Awaited<ReturnType<typeof renderMusicApp>>['store'],
  ) {
    const store =
      existingStore ?? (await renderMusicApp({ server: getServer() })).store;
    const zone = await dropZone();
    const entries = folders.map((folder) =>
      dirEntry(folder.name, [
        ...folder.tracks.map(({ fileName, tags }) =>
          fileEntry(
            new File([new Uint8Array(buildMp3WithTags(tags))], fileName, {
              type: 'audio/mpeg',
            }),
          ),
        ),
        ...(folder.coverSize
          ? [
              fileEntry(
                new File(
                  [new Uint8Array(buildJpegBytes(folder.coverSize))],
                  'cover.jpg',
                  { type: 'image/jpeg' },
                ),
              ),
            ]
          : []),
      ]),
    );
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: makeFolderDataTransfer(entries) });
      await waitForNetworkIdle();
    });
    await waitForStagingPool(
      store,
      folders.reduce((sum, folder) => sum + folder.tracks.length, 0),
    );
    await act(async () => {
      await waitForNetworkIdle();
    });
    return { store };
  }

  async function scanLibrary(): Promise<void> {
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
      await waitForNetworkIdle();
    });
    await screen.findByText(/Found \d+ tracks\./);
  }

  async function scanStagedTrack(
    path: string,
  ): Promise<T.TrackMetadata | undefined> {
    const res = await fetch(
      `${getServer().baseUrl}/music/music-index/scan-paths`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [path] }),
      },
    );
    const data = (await res.json()) as T.ScanTrackPathsResponse;
    return data.tracks[0];
  }

  function backToLibraryButton(): HTMLElement {
    return screen.getByRole('button', { name: 'Back to library' });
  }

  describe('dropping MP3s onto the library view', () => {
    it('stages dropped MP3s into the pool', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      const zone = await dropZone();

      const file = new File(
        [
          new Uint8Array(
            buildMp3WithTags({ title: 'Time', artist: 'Pink Floyd' }),
          ),
        ],
        'time.mp3',
        { type: 'audio/mpeg' },
      );
      const dataTransfer = makeDataTransfer([file]);

      await act(async () => {
        fireEvent.drop(zone, { dataTransfer });
        await waitForNetworkIdle();
      });

      await waitForStagingPool(store, 1);

      // Staging auto-selects the first track, which mounts the sidebar editor
      // and kicks off its own (separate) tag-loading fetch.
      await act(async () => {
        await waitForNetworkIdle();
      });

      const pool = $.getMusicStagingPool(store.getState());
      expect(pool[0].title).toBe('Time');
      expect(pool[0].artist).toBe('Pink Floyd');

      const stagingRoot = join(getServer().mountDir, '.music-staging');
      const stagedFiles = await readdir(stagingRoot);
      expect(stagedFiles).toContain('time.mp3');
    });

    it('reports byte progress while copying files into staging', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      const zone = await dropZone();
      const files = ['a.mp3', 'b.mp3'].map(
        (name) =>
          new File([new Uint8Array(buildMp3WithTags({ title: name }))], name, {
            type: 'audio/mpeg',
          }),
      );
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      const seen: Array<{
        message: unknown;
        loaded: number;
        total: number;
        detail?: string;
      }> = [];
      store.subscribe(() => {
        for (const { message, progress } of $.getMessages(store.getState())) {
          if (progress && progress.total === totalBytes) {
            seen.push({ message, ...progress });
          }
        }
      });

      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: makeDataTransfer(files) });
        await waitForNetworkIdle();
      });
      await waitForStagingPool(store, 2);

      const last = seen[seen.length - 1];
      expect(last.loaded).toBe(totalBytes);
      expect(last.message).toContain('Copying 2 tracks');
      expect(last.detail).toBe(
        `${(totalBytes / 1_000_000).toFixed(1)} MB of ${(totalBytes / 1_000_000).toFixed(1)} MB`,
      );
    });

    it('rejects unsupported files with a message and stages nothing', async () => {
      await renderMusicApp({ server: getServer() });
      const zone = await dropZone();

      const file = new File(['not audio'], 'notes.txt', {
        type: 'text/plain',
      });
      const dataTransfer = makeDataTransfer([file]);

      await act(async () => {
        fireEvent.drop(zone, { dataTransfer });
        await waitForNetworkIdle();
      });

      await screen.findByText(/Skipped 1 non-audio file/);

      const stagingRoot = join(getServer().mountDir, '.music-staging');
      await expect(readdir(stagingRoot)).rejects.toThrow();
    });

    it('recurses into a dropped folder, staging its MP3s and ignoring everything else', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      const zone = await dropZone();

      const track = new File(
        [
          new Uint8Array(
            buildMp3WithTags({ title: 'Kaneda', artist: 'Geinoh' }),
          ),
        ],
        'kaneda.mp3',
        { type: 'audio/mpeg' },
      );
      const cover = new File(['not audio'], 'cover.jpg', {
        type: 'image/jpeg',
      });
      const folder = dirEntry('AKIRA Ambient Soundtrack', [
        fileEntry(track),
        fileEntry(cover),
        dirEntry('Artwork', [fileEntry(cover)]),
      ]);

      await act(async () => {
        fireEvent.drop(zone, {
          dataTransfer: makeFolderDataTransfer([folder]),
        });
        await waitForNetworkIdle();
      });

      await waitForStagingPool(store, 1);

      // Staging auto-selects the first track, which mounts the sidebar editor
      // and kicks off its own (separate) tag-loading fetch.
      await act(async () => {
        await waitForNetworkIdle();
      });

      const pool = $.getMusicStagingPool(store.getState());
      expect(pool[0].title).toBe('Kaneda');

      const stagingRoot = join(getServer().mountDir, '.music-staging');
      const stagedFiles = await readdir(stagingRoot);
      expect(stagedFiles).toContain('kaneda.mp3');
    });

    it('stages dropped FLAC and M4A files with their tags', async () => {
      const fixtures = join(process.cwd(), 'src/server/test/fixtures');
      const files = await Promise.all(
        ['tagged.flac', 'tagged.m4a'].map(
          async (name) =>
            new File(
              [new Uint8Array(await readFile(join(fixtures, name)))],
              name,
            ),
        ),
      );

      const { store } = await renderMusicApp({ server: getServer() });
      const zone = await dropZone();
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: makeDataTransfer(files) });
        await waitForNetworkIdle();
      });
      await waitForStagingPool(store, 2);
      await act(async () => {
        await waitForNetworkIdle();
      });

      const pool = $.getMusicStagingPool(store.getState());
      expect(pool.map((track) => track.title)).toEqual([
        'Fixture Title',
        'Fixture Title',
      ]);
      const stagedFiles = await readdir(
        join(getServer().mountDir, '.music-staging'),
      );
      expect(stagedFiles).toContain('tagged.flac');
      expect(stagedFiles).toContain('tagged.m4a');
    });

    it('suffixes a new drop whose filename collides with a file already in the pool', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      await dropTrack(
        'time.mp3',
        { title: 'Time', artist: 'Pink Floyd' },
        store,
      );
      await act(async () => {
        await waitForNetworkIdle();
      });

      await act(async () => {
        fireEvent.click(backToLibraryButton());
        await waitForNetworkIdle();
      });

      const zone = await dropZone();
      const file = new File(
        [
          new Uint8Array(
            buildMp3WithTags({ title: 'Time (Live)', artist: 'Pink Floyd' }),
          ),
        ],
        'time.mp3',
        { type: 'audio/mpeg' },
      );
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: makeDataTransfer([file]) });
        await waitForNetworkIdle();
      });
      await waitForStagingPool(store, 2);
      await act(async () => {
        await waitForNetworkIdle();
      });

      const pool = $.getMusicStagingPool(store.getState());
      const live = pool.find((t) => t.title === 'Time (Live)');
      expect(live?.path).toBe('/.music-staging/time (2).mp3');

      const stagedFiles = await readdir(
        join(getServer().mountDir, '.music-staging'),
      );
      expect(stagedFiles).toContain('time.mp3');
      expect(stagedFiles).toContain('time (2).mp3');
    }, 30_000);

    it('skips a byte-identical duplicate of an already-staged file', async () => {
      const tags = { title: 'Time', artist: 'Pink Floyd' };
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      await dropTrack('time.mp3', tags, store);
      await act(async () => {
        await waitForNetworkIdle();
      });

      await act(async () => {
        fireEvent.click(backToLibraryButton());
        await waitForNetworkIdle();
      });

      const zone = await dropZone();
      const file = new File(
        [new Uint8Array(buildMp3WithTags(tags))],
        'time-copy.mp3',
        { type: 'audio/mpeg' },
      );
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: makeDataTransfer([file]) });
        await waitForNetworkIdle();
      });

      await screen.findByText('Skipped 1 duplicate file — already staged.');
      expect($.getMusicStagingPool(store.getState())).toHaveLength(1);

      const stagedFiles = await readdir(
        join(getServer().mountDir, '.music-staging'),
      );
      expect(stagedFiles).toContain('time.mp3');
      expect(stagedFiles).not.toContain('time-copy.mp3');
    }, 30_000);
  });

  describe('staging pool edit screen', () => {
    // The virtualizer reads offsetHeight/offsetWidth to decide how many rows
    // to render; jsdom returns 0 for both, so without this it renders nothing.
    beforeEach(() => {
      jest
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockReturnValue(600);
      jest
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockReturnValue(800);
    });

    it('autosaves a cell edit to the staged file', async () => {
      const { store } = await dropTrack('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const stagedPath = $.getMusicStagingPool(store.getState())[0].path;

      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      fireEvent.click(
        screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
      );
      grid.focus();
      fireEvent.keyDown(document.body, { key: 'Enter' });

      const input = await within(grid).findByDisplayValue('Time');
      fireEvent.change(input, { target: { value: 'Money' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        screen.getByText('Money', { selector: '.musicBatchEditCellText' });
      });
      await waitFor(async () => {
        expect((await scanStagedTrack(stagedPath))?.title).toBe('Money');
      });
    }, 30_000);

    it('shows the staged track in the sidebar editor by default', async () => {
      await dropTrack('time.mp3', { title: 'Time', artist: 'Pink Floyd' });

      expect(await screen.findByRole('heading', { name: 'Time' })).toBeTruthy();
    }, 30_000);

    it("shows a dropped folder's cover as pending album artwork before organizing, and lets it be embedded", async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      const zone = await dropZone();

      const track = new File(
        [
          new Uint8Array(
            buildMp3WithTags({ title: 'Time', artist: 'Pink Floyd' }),
          ),
        ],
        'time.mp3',
        { type: 'audio/mpeg' },
      );
      const cover = new File([new Uint8Array(buildJpegBytes())], 'cover.jpg', {
        type: 'image/jpeg',
      });
      const folder = dirEntry('The Dark Side of the Moon', [
        fileEntry(track),
        fileEntry(cover),
      ]);

      await act(async () => {
        fireEvent.drop(zone, {
          dataTransfer: makeFolderDataTransfer([folder]),
        });
        await waitForNetworkIdle();
      });
      await waitForStagingPool(store, 1);
      await act(async () => {
        await waitForNetworkIdle();
      });

      expect(await screen.findByRole('heading', { name: 'Time' })).toBeTruthy();

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
      });

      expect(
        (await screen.findAllByText('Album artwork')).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText('No artwork found')).toBeNull();

      const embedButton = await screen.findByRole('button', {
        name: 'Embed artwork',
      });
      await act(async () => {
        fireEvent.click(embedButton);
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Embed artwork' }),
        ).toBeNull();
      });

      const pool = $.getMusicStagingPool(store.getState());
      expect(pool[0].hasEmbeddedArtwork).toBe(true);
    }, 30_000);

    it("keeps the dropped folder's pending cover association across a reload", async () => {
      await renderMusicApp({ server: getServer() });
      const zone = await dropZone();

      const track = new File(
        [
          new Uint8Array(
            buildMp3WithTags({ title: 'Time', artist: 'Pink Floyd' }),
          ),
        ],
        'time.mp3',
        { type: 'audio/mpeg' },
      );
      const cover = new File([new Uint8Array(buildJpegBytes())], 'cover.jpg', {
        type: 'image/jpeg',
      });
      const folder = dirEntry('The Dark Side of the Moon', [
        fileEntry(track),
        fileEntry(cover),
      ]);

      await act(async () => {
        fireEvent.drop(zone, {
          dataTransfer: makeFolderDataTransfer([folder]),
        });
        await waitForNetworkIdle();
      });

      cleanup();
      const { store } = await renderMusicApp({
        server: getServer(),
        search: '?stagingView=staging',
      });
      await waitForStagingPool(store, 1);
      await act(async () => {
        await waitForNetworkIdle();
      });

      const [reloadedTrack] = $.getMusicStagingPool(store.getState());
      expect(reloadedTrack.folderArtworkPath).toMatch(
        /^\/\.music-staging\/\.artwork\/[0-9a-f]{64}\.jpg$/,
      );
      await expect(
        stat(join(getServer().mountDir, reloadedTrack.folderArtworkPath ?? '')),
      ).resolves.toBeTruthy();
    }, 30_000);

    it('adds a second drop to the pool instead of starting a new view', async () => {
      await dropTrack('a.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });

      const zone = await dropZone();
      const file = new File(
        [
          new Uint8Array(
            buildMp3WithTags({ title: 'Kaneda', artist: 'Geinoh' }),
          ),
        ],
        'b.mp3',
        { type: 'audio/mpeg' },
      );
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: makeDataTransfer([file]) });
        await waitForNetworkIdle();
      });
      await screen.findByRole('heading', { name: 'Staging · 2 tracks' });

      // The grid itself must pick up the new row, not just the store.
      expect(
        await screen.findByText('Kaneda', {
          selector: '.musicBatchEditCellText',
        }),
      ).toBeTruthy();
      expect(
        screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
      ).toBeTruthy();
    }, 30_000);

    it('defaults to Album, Album Artist (or Artist), Track #, Title order', async () => {
      await dropTracks([
        {
          fileName: 'c.mp3',
          tags: {
            title: 'Song C',
            album: 'Zulu',
            albumArtist: 'Zulu Band',
            track: 1,
          },
        },
        {
          fileName: 'a.mp3',
          tags: {
            title: 'Song A',
            album: 'Alpha',
            albumArtist: 'Alpha Band',
            track: 2,
          },
        },
        {
          fileName: 'b.mp3',
          tags: {
            title: 'Song B',
            album: 'Alpha',
            albumArtist: 'Alpha Band',
            track: 1,
          },
        },
        {
          fileName: 'd.mp3',
          tags: {
            title: 'Song D',
            album: 'Alpha',
            artist: 'Zzz Artist',
            track: 3,
          },
        },
      ]);

      const titleOrder = screen
        .getAllByText(/^Song [A-D]$/, {
          selector: '.musicBatchEditCellText',
        })
        .map((el) => el.textContent);

      expect(titleOrder).toEqual(['Song B', 'Song A', 'Song D', 'Song C']);
    }, 30_000);

    it('breaks a column sort tie using ascending Track #', async () => {
      await dropTracks([
        {
          fileName: 'b.mp3',
          tags: { title: 'Bravo', artist: 'Same', track: 1 },
        },
        {
          fileName: 'a.mp3',
          tags: { title: 'Alpha', artist: 'Same', track: 9 },
        },
      ]);

      function titleOrder(): string[] {
        return screen
          .getAllByText(/^(Alpha|Bravo)$/, {
            selector: '.musicBatchEditCellText',
          })
          .map((el) => el.textContent ?? '');
      }

      // Sorting by Title first scrambles the row order alphabetically.
      fireEvent.click(screen.getByRole('columnheader', { name: 'Title' }));
      expect(titleOrder()).toEqual(['Alpha', 'Bravo']);

      // Every row ties on Artist, so the sort should fall back to ascending
      // Track # (Bravo's 1, then Alpha's 9) rather than the Title order.
      fireEvent.click(screen.getByRole('columnheader', { name: 'Artist' }));
      expect(titleOrder()).toEqual(['Bravo', 'Alpha']);
    }, 30_000);

    it('selects every staged track with Cmd+A', async () => {
      const { store } = await dropTracks([
        { fileName: 'a.mp3', tags: { title: 'Time', artist: 'Pink Floyd' } },
        { fileName: 'b.mp3', tags: { title: 'Kaneda', artist: 'Geinoh' } },
      ]);
      const allPaths = $.getMusicStagingPool(store.getState())
        .map((t) => t.path)
        .sort();

      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      grid.focus();
      fireEvent.keyDown(document.body, { key: 'a', metaKey: true });

      expect($.getMusicSelectedTrackPaths(store.getState()).sort()).toEqual(
        allPaths,
      );
    }, 30_000);

    it('removes the selected track on Cmd+Delete, staging file and all', async () => {
      const { store } = await dropTracks([
        { fileName: 'a.mp3', tags: { title: 'Time', artist: 'Pink Floyd' } },
        { fileName: 'b.mp3', tags: { title: 'Kaneda', artist: 'Geinoh' } },
      ]);
      const kanedaPath = $.getMusicStagingPool(store.getState()).find(
        (t) => t.title === 'Kaneda',
      )?.path as string;

      await act(async () => {
        store.dispatch(A.setMusicSelectedTracks([kanedaPath]));
      });
      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      grid.focus();

      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'Delete', metaKey: true });
        await waitForNetworkIdle();
      });

      await waitForStagingPool(store, 1);
      expect($.getMusicStagingPool(store.getState())[0].title).toBe('Time');
      expect(
        screen.queryByText('Kaneda', { selector: '.musicBatchEditCellText' }),
      ).toBeNull();
      expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([]);

      const stagedFiles = await readdir(
        join(getServer().mountDir, '.music-staging'),
      );
      expect(stagedFiles).toContain('a.mp3');
      expect(stagedFiles).not.toContain('b.mp3');
    }, 30_000);

    it('clears the focused column of the selected track on Delete', async () => {
      const { store } = await dropTracks([
        { fileName: 'a.mp3', tags: { title: 'Time', artist: 'Pink Floyd' } },
      ]);

      await act(async () => {
        fireEvent.click(
          screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
        );
      });
      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      grid.focus();

      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'Delete' });
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect($.getMusicStagingPool(store.getState())[0].title).toBeFalsy();
      });
      expect($.getMusicStagingPool(store.getState())[0].artist).toBe(
        'Pink Floyd',
      );
      expect($.getMusicStagingPool(store.getState())).toHaveLength(1);
    }, 30_000);

    it('copies a cell with Cmd+C and pastes it into the selected tracks with Cmd+V', async () => {
      const clipboard = mockClipboard();
      const { store } = await dropTracks([
        { fileName: 'a.mp3', tags: { title: 'Time', artist: 'Pink Floyd' } },
        { fileName: 'b.mp3', tags: { title: 'Kaneda', artist: 'Geinoh' } },
      ]);

      await act(async () => {
        fireEvent.click(
          screen.getByText('Pink Floyd', {
            selector: '.musicBatchEditCellText',
          }),
        );
      });
      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      grid.focus();
      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'c', metaKey: true });
      });
      expect(clipboard.text).toBe('Pink Floyd');

      await act(async () => {
        fireEvent.click(
          screen.getByText('Geinoh', { selector: '.musicBatchEditCellText' }),
        );
      });
      grid.focus();
      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'v', metaKey: true });
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(
          $.getMusicStagingPool(store.getState()).map((t) => t.artist),
        ).toEqual(['Pink Floyd', 'Pink Floyd']);
      });
    }, 30_000);

    it('pastes across more than one write chunk, updating every row', async () => {
      const { store } = await dropTracks(
        Array.from({ length: 12 }, (_, i) => ({
          fileName: `track-${i}.mp3`,
          tags: {
            title: `Song ${i}`,
            artist: i === 0 ? 'Pink Floyd' : 'Geinoh',
          },
        })),
      );
      const writeSpy = jest.spyOn(globalThis, 'fetch');

      await copyArtistAndPasteIntoAll(store, 'Pink Floyd');

      await waitFor(() => {
        expect(
          new Set($.getMusicStagingPool(store.getState()).map((t) => t.artist)),
        ).toEqual(new Set(['Pink Floyd']));
      });
      const writes = writeSpy.mock.calls.filter(([input]) =>
        String(input).endsWith('/music/write-track-tags'),
      );
      expect(writes).toHaveLength(2);
      expect(
        document.querySelectorAll('.musicBatchEditCell.error'),
      ).toHaveLength(0);
      writeSpy.mockRestore();
    }, 30_000);

    it('marks cells and shows a message when the server cannot write a track', async () => {
      const { store } = await dropTracks([
        { fileName: 'a.mp3', tags: { title: 'Time', artist: 'Pink Floyd' } },
        { fileName: 'b.mp3', tags: { title: 'Kaneda', artist: 'Geinoh' } },
      ]);
      await rm(join(getServer().mountDir, '.music-staging', 'b.mp3'));
      expectConsoleError((args) => String(args[0]).includes('[music-server]'));

      await copyArtistAndPasteIntoAll(store, 'Pink Floyd');

      await screen.findByText(/Saved 1 of 2 tracks\./);
      expect(
        document.querySelectorAll('.musicBatchEditCell.error'),
      ).toHaveLength(1);
      expect(
        $.getMusicStagingPool(store.getState()).find((t) => t.title === 'Time')
          ?.artist,
      ).toBe('Pink Floyd');
      expect(
        $.getMusicStagingPool(store.getState()).find(
          (t) => t.title === 'Kaneda',
        )?.artist,
      ).toBe('Geinoh');
    }, 30_000);

    async function clearArtistFromGrid() {
      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      await act(async () => {
        fireEvent.click(
          screen.getByText('Pink Floyd', {
            selector: '.musicBatchEditCellText',
          }),
        );
      });
      grid.focus();
      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'Delete' });
        await waitForNetworkIdle();
      });
    }

    async function artistInputOfSidebar(): Promise<HTMLInputElement> {
      const input = (await screen.findByLabelText(
        'Artist',
      )) as HTMLInputElement;
      await waitFor(() => {
        expect(input.disabled).toBe(false);
      });
      return input;
    }

    it('shows a grid edit in a clean sidebar form', async () => {
      await dropTrack('a.mp3', { title: 'Time', artist: 'Pink Floyd' });
      await act(async () => {
        fireEvent.click(
          screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
        );
      });
      const artistInput = await artistInputOfSidebar();
      await waitFor(() => {
        expect(artistInput.value).toBe('Pink Floyd');
      });

      await clearArtistFromGrid();

      await waitFor(() => {
        expect(artistInput.value).toBe('');
      });
    }, 30_000);

    it('keeps typed sidebar text when the grid edits the same field', async () => {
      await dropTrack('a.mp3', { title: 'Time', artist: 'Pink Floyd' });
      await act(async () => {
        fireEvent.click(
          screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
        );
      });
      const artistInput = await artistInputOfSidebar();
      await waitFor(() => {
        expect(artistInput.value).toBe('Pink Floyd');
      });
      await act(async () => {
        fireEvent.change(artistInput, { target: { value: 'Draft' } });
      });

      await clearArtistFromGrid();

      expect(artistInput.value).toBe('Draft');
    }, 30_000);

    it('applies sidebar edits on blur and Enter without a Save button', async () => {
      const { store } = await dropTrack('a.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      await act(async () => {
        fireEvent.click(
          screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
        );
      });
      const artistInput = await artistInputOfSidebar();
      await waitFor(() => {
        expect(artistInput.value).toBe('Pink Floyd');
      });
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

      await act(async () => {
        fireEvent.change(artistInput, { target: { value: 'Roger Waters' } });
        fireEvent.blur(artistInput);
        await waitForNetworkIdle();
      });
      await waitFor(() => {
        expect($.getMusicStagingPool(store.getState())[0].artist).toBe(
          'Roger Waters',
        );
      });

      const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(titleInput, { target: { value: 'Money' } });
        fireEvent.submit(titleInput.closest('form') as HTMLFormElement);
        await waitForNetworkIdle();
      });
      await waitFor(() => {
        expect($.getMusicStagingPool(store.getState())[0].title).toBe('Money');
      });
    }, 30_000);

    it('reverts an unapplied sidebar edit on Escape', async () => {
      const { store } = await dropTrack('a.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      await act(async () => {
        fireEvent.click(
          screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
        );
      });
      const artistInput = await artistInputOfSidebar();
      await waitFor(() => {
        expect(artistInput.value).toBe('Pink Floyd');
      });

      await act(async () => {
        fireEvent.change(artistInput, { target: { value: 'Draft' } });
      });
      expect(artistInput.value).toBe('Draft');
      await act(async () => {
        fireEvent.keyDown(artistInput, { key: 'Escape' });
      });
      expect(artistInput.value).toBe('Pink Floyd');
      await act(async () => {
        fireEvent.blur(artistInput);
        await waitForNetworkIdle();
      });

      expect(artistInput.value).toBe('Pink Floyd');
      expect($.getMusicStagingPool(store.getState())[0].artist).toBe(
        'Pink Floyd',
      );
    }, 30_000);

    async function selectTitles(
      store: Awaited<ReturnType<typeof renderMusicApp>>['store'],
      titles: string[],
    ) {
      const paths = $.getMusicStagingPool(store.getState())
        .filter((t) => titles.includes(t.title ?? ''))
        .map((t) => t.path);
      await act(async () => {
        store.dispatch(A.setMusicSelectedTracks(paths));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
      });
    }

    function artworkOf(
      store: Awaited<ReturnType<typeof renderMusicApp>>['store'],
      title: string,
    ) {
      return $.getMusicStagingPool(store.getState()).find(
        (t) => t.title === title,
      )?.folderArtworkPath;
    }

    it('sets and removes artwork for the selected track’s whole album only', async () => {
      const { store } = await dropFolders([
        {
          name: 'Mixed',
          tracks: [
            { fileName: 'a1.mp3', tags: { title: 'One', ...albumA } },
            { fileName: 'a2.mp3', tags: { title: 'Two', ...albumA } },
            { fileName: 'b1.mp3', tags: { title: 'Kaneda', ...albumB } },
          ],
        },
      ]);
      await selectTitles(store, ['One']);

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const cover = Object.assign(new Uint8Array(buildJpegBytes(3000)), {
        type: 'image/jpeg',
      });
      await act(async () => {
        fireEvent.change(input, { target: { files: [cover] } });
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(artworkOf(store, 'One')).toBeTruthy();
      });
      expect(artworkOf(store, 'Two')).toBe(artworkOf(store, 'One'));
      expect(artworkOf(store, 'Kaneda')).toBeFalsy();

      const remove = await screen.findByRole('button', {
        name: 'Remove artwork',
      });
      await act(async () => {
        fireEvent.click(remove);
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Click to confirm' }),
        );
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(artworkOf(store, 'One')).toBeFalsy();
      });
      expect(artworkOf(store, 'Two')).toBeFalsy();
    }, 30_000);

    it('only offers artwork editing when the selection is one album', async () => {
      const { store } = await dropFolders([
        {
          name: 'Mixed',
          tracks: [
            { fileName: 'a1.mp3', tags: { title: 'One', ...albumA } },
            { fileName: 'a2.mp3', tags: { title: 'Two', ...albumA } },
            { fileName: 'b1.mp3', tags: { title: 'Kaneda', ...albumB } },
          ],
        },
      ]);

      await selectTitles(store, ['One', 'Two']);
      expect(
        await screen.findByRole('button', { name: 'Add artwork file' }),
      ).toBeTruthy();

      await act(async () => {
        store.dispatch(
          A.setMusicSelectedTracks(
            $.getMusicStagingPool(store.getState()).map((t) => t.path),
          ),
        );
      });
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Add artwork file' }),
        ).toBeNull();
      });
    }, 30_000);

    it('embeds a shared cover only into the selected tracks', async () => {
      const { store } = await dropFolders([
        {
          name: 'Meddle',
          tracks: [
            { fileName: 'a1.mp3', tags: { title: 'One', ...albumA } },
            { fileName: 'a2.mp3', tags: { title: 'Two', ...albumA } },
          ],
          coverSize: 2500,
        },
      ]);
      await selectTitles(store, ['One']);

      await act(async () => {
        fireEvent.click(
          await screen.findByRole('button', { name: 'Embed artwork' }),
        );
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        const pool = $.getMusicStagingPool(store.getState());
        expect(pool.find((t) => t.title === 'One')?.hasEmbeddedArtwork).toBe(
          true,
        );
      });
      expect(
        $.getMusicStagingPool(store.getState()).find((t) => t.title === 'Two')
          ?.hasEmbeddedArtwork,
      ).toBeFalsy();
    }, 30_000);

    it('gives a dropped cover to its album and keeps it on mixed folders', async () => {
      const { store } = await dropFolders([
        {
          name: 'Meddle',
          tracks: [
            { fileName: 'a1.mp3', tags: { title: 'One', ...albumA } },
            { fileName: 'a2.mp3', tags: { title: 'Two', ...albumA } },
          ],
          coverSize: 2600,
        },
        {
          name: 'Jumble',
          tracks: [
            { fileName: 'm1.mp3', tags: { title: 'Three', ...albumA } },
            { fileName: 'm2.mp3', tags: { title: 'Kaneda', ...albumB } },
          ],
          coverSize: 2700,
        },
      ]);

      expect(artworkOf(store, 'One')).toBeTruthy();
      expect(artworkOf(store, 'Two')).toBe(artworkOf(store, 'One'));
      expect(artworkOf(store, 'Three')).toBe(artworkOf(store, 'One'));
      expect(artworkOf(store, 'Kaneda')).toBeTruthy();
      expect(artworkOf(store, 'Kaneda')).not.toBe(artworkOf(store, 'One'));
    }, 30_000);

    it('leaves the pool intact on disk when going back to the library', async () => {
      const { store } = await dropTrack('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const stagingRoot = join(getServer().mountDir, '.music-staging');

      await act(async () => {
        fireEvent.click(backToLibraryButton());
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Staging ·/ })).toBeNull();
      });
      // The pool itself is unaffected by leaving the view — it's not tied
      // to a batch that gets discarded.
      expect($.getMusicStagingPool(store.getState())).toHaveLength(1);
      expect(await readdir(stagingRoot)).toContain('time.mp3');

      await screen.findByText('1 track staged');
    }, 30_000);

    it('reopens the staging view from the library banner', async () => {
      await dropTrack('time.mp3', { title: 'Time', artist: 'Pink Floyd' });
      await act(async () => {
        fireEvent.click(backToLibraryButton());
        await waitForNetworkIdle();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
      });

      await screen.findByRole('heading', { name: 'Staging · 1 track' });
      expect(
        screen.getByText('Time', { selector: '.musicBatchEditCellText' }),
      ).toBeTruthy();
    }, 30_000);

    it('does not force the staging view back open on a plain reload', async () => {
      await dropTrack('time.mp3', { title: 'Time', artist: 'Pink Floyd' });
      await act(async () => {
        fireEvent.click(backToLibraryButton());
        await waitForNetworkIdle();
      });

      cleanup();
      const { store: reloadedStore } = await renderMusicApp({
        server: getServer(),
      });

      await waitForStagingPool(reloadedStore, 1);
      expect(screen.queryByRole('heading', { name: /Staging ·/ })).toBeNull();
      await screen.findByText('1 track staged');
    }, 30_000);

    it('restores the staging view on reload when the URL says to', async () => {
      await dropTrack('time.mp3', { title: 'Time', artist: 'Pink Floyd' });

      cleanup();
      await renderMusicApp({
        server: getServer(),
        search: '?stagingView=staging',
      });

      await screen.findByRole('heading', { name: 'Staging · 1 track' });
    }, 30_000);

    it('deletes the whole pool from the library banner, staging files and all', async () => {
      const { store } = await dropTracks([
        { fileName: 'a.mp3', tags: { title: 'Time', artist: 'Pink Floyd' } },
        { fileName: 'b.mp3', tags: { title: 'Kaneda', artist: 'Geinoh' } },
      ]);
      const stagingRoot = join(getServer().mountDir, '.music-staging');

      await act(async () => {
        fireEvent.click(backToLibraryButton());
        await waitForNetworkIdle();
      });
      await screen.findByText('2 tracks staged');

      const discardButton = screen.getByRole('button', { name: 'Discard' });
      fireEvent.click(discardButton);
      await screen.findByText('Click again to discard');
      await act(async () => {
        fireEvent.click(discardButton);
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(screen.queryByText(/tracks? staged/)).toBeNull();
      });
      expect($.getMusicStagingPool(store.getState())).toHaveLength(0);
      const stagedFiles = await readdir(stagingRoot);
      expect(stagedFiles).not.toContain('a.mp3');
      expect(stagedFiles).not.toContain('b.mp3');
    }, 30_000);

    it('propagates a bulk-edited year into the resolved organize path', async () => {
      const { store } = await dropTracks([
        {
          fileName: 'a.mp3',
          tags: {
            title: 'Song A',
            artist: 'Wilco',
            albumArtist: 'Wilco',
            album: 'A.M.',
            genre: 'Rock',
            track: 1,
          },
        },
        {
          fileName: 'b.mp3',
          tags: {
            title: 'Song B',
            artist: 'Wilco',
            albumArtist: 'Wilco',
            album: 'A.M.',
            genre: 'Rock',
            track: 2,
          },
        },
      ]);
      const paths = $.getMusicStagingPool(store.getState()).map((t) => t.path);

      await act(async () => {
        store.dispatch(A.setMusicSelectedTracks(paths));
      });

      const yearInput = (await screen.findByLabelText(
        'Year',
      )) as HTMLInputElement;
      await waitFor(() => {
        expect(yearInput.disabled).toBe(false);
      });
      fireEvent.change(yearInput, { target: { value: '2014' } });
      await act(async () => {
        fireEvent.blur(yearInput);
        await waitForNetworkIdle();
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Next 2 selected' }),
        );
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);

      expect(treeRows().join('/')).toContain('2014');
    }, 30_000);
  });

  describe('organize screen', () => {
    async function dropAndOrganize(
      fileName: string,
      tags: Parameters<typeof buildMp3WithTags>[0],
    ) {
      const { store } = await dropTrack(fileName, tags);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);
      return { store };
    }

    it('ignores a file drop while organizing', async () => {
      const { store } = await dropAndOrganize('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });

      const zone = await dropZone();
      const file = new File(
        [new Uint8Array(buildMp3WithTags({ title: 'Kaneda' }))],
        'kaneda.mp3',
        { type: 'audio/mpeg' },
      );
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: makeDataTransfer([file]) });
        await waitForNetworkIdle();
      });

      expect($.getMusicStagingPool(store.getState())).toHaveLength(1);
      expect(screen.queryByText(/Staging \d/)).toBeNull();
    }, 30_000);

    it('restores the organize screen on reload when the URL says to', async () => {
      await dropAndOrganize('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });

      cleanup();
      await renderMusicApp({
        server: getServer(),
        search: '?stagingView=organize',
      });

      await screen.findByText(/Organize ·/);
    }, 30_000);

    it('shows the organized files as a folder tree', async () => {
      await dropAndOrganize('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
        albumArtist: 'Pink Floyd',
        album: 'The Dark Side of the Moon',
        genre: 'Rock',
        track: 4,
      });

      expect(treeRows()).toEqual([
        'Rock',
        'Pink Floyd',
        'The Dark Side of the Moon',
        '04 - Time.mp3',
      ]);
    }, 30_000);

    it('previews the default preset and switches to another preset', async () => {
      await dropAndOrganize('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
        albumArtist: 'Pink Floyd',
        album: 'The Dark Side of the Moon',
        genre: 'Rock',
        track: 1,
      });

      expect(presetRadio(ORGANIZATION_PRESET_TEMPLATES[0]).checked).toBe(true);
      expect(treeRows()).toEqual([
        'Rock',
        'Pink Floyd',
        'The Dark Side of the Moon',
        '01 - Time.mp3',
      ]);

      fireEvent.click(presetRadio(ORGANIZATION_PRESET_TEMPLATES[3]));

      expect(treeRows()).toEqual([
        'Pink Floyd',
        'The Dark Side of the Moon',
        '01 - Time.mp3',
      ]);
    }, 30_000);

    it('supports a custom typed template that updates the preview live', async () => {
      await dropAndOrganize('time.mp3', { title: 'Time', artist: 'Floyd' });

      fireEvent.click(presetRadio('Custom…'));
      fireEvent.change(screen.getByLabelText('Naming template'), {
        target: { value: '{Artist} - {Title}' },
      });

      expect(treeRows()).toEqual(['Floyd - Time.mp3']);
    }, 30_000);

    it('returns to the staging screen via Back, and Next restores the last selected preset', async () => {
      await dropAndOrganize('time.mp3', { title: 'Time', artist: 'Floyd' });

      fireEvent.click(presetRadio(ORGANIZATION_PRESET_TEMPLATES[3]));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '← Back' }));
        await waitForNetworkIdle();
      });
      await screen.findByRole('heading', { name: /Staging ·/ });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);

      expect(
        (presetRadio(ORGANIZATION_PRESET_TEMPLATES[3]) as HTMLInputElement)
          .checked,
      ).toBe(true);
    }, 30_000);
  });

  describe('commit ("Save")', () => {
    beforeEach(() => {
      jest
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockReturnValue(600);
      jest
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockReturnValue(800);
    });

    async function organizeAll() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);
    }

    async function clickDone() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitForNetworkIdle();
      });
    }

    it('moves staged tracks to their resolved destinations and patches the library without a rescan', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      await dropTracks(
        [
          {
            fileName: 'a.mp3',
            tags: {
              title: 'Time',
              artist: 'Pink Floyd',
              albumArtist: 'Pink Floyd',
              album: 'The Dark Side of the Moon',
              genre: 'Rock',
              track: 4,
            },
          },
          {
            fileName: 'b.mp3',
            tags: { title: 'Kaneda', artist: 'Geinoh', genre: 'Soundtrack' },
          },
        ],
        store,
      );

      await organizeAll();
      await clickDone();

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });

      const defaultPreset = ORGANIZATION_PRESET_TEMPLATES[0];
      const expectedPathA = resolveOrganizationPath(
        defaultPreset,
        {
          genre: 'Rock',
          artist: 'Pink Floyd',
          albumArtist: 'Pink Floyd',
          album: 'The Dark Side of the Moon',
          year: null,
          title: 'Time',
          track: 4,
          composer: null,
        },
        '.mp3',
      );
      const expectedPathB = resolveOrganizationPath(
        defaultPreset,
        {
          genre: 'Soundtrack',
          artist: 'Geinoh',
          albumArtist: null,
          album: null,
          year: null,
          title: 'Kaneda',
          track: null,
          composer: null,
        },
        '.mp3',
      );

      await expect(
        stat(join(getServer().mountDir, expectedPathA)),
      ).resolves.toBeTruthy();
      await expect(
        stat(join(getServer().mountDir, expectedPathB)),
      ).resolves.toBeTruthy();

      expect($.getMusicStagingPool(store.getState())).toHaveLength(0);

      const tracks = $.getMusicTracks(store.getState());
      expect(tracks.some((t) => t.path === expectedPathA)).toBe(true);
      expect(tracks.some((t) => t.path === expectedPathB)).toBe(true);

      // No manual rescan needed — the library view already reflects the move.
      await screen.findByText('Time', { selector: '.musicTrackTitle' });
    }, 30_000);

    it("writes a dropped folder's cover art to the organized destination and sets folderArtworkPath", async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      const zone = await dropZone();

      const track = new File(
        [
          new Uint8Array(
            buildMp3WithTags({
              title: 'Time',
              artist: 'Pink Floyd',
              albumArtist: 'Pink Floyd',
              album: 'The Dark Side of the Moon',
              genre: 'Rock',
              track: 4,
            }),
          ),
        ],
        'time.mp3',
        { type: 'audio/mpeg' },
      );
      const cover = new File(
        [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
        'cover.jpg',
        { type: 'image/jpeg' },
      );
      const folder = dirEntry('The Dark Side of the Moon', [
        fileEntry(track),
        fileEntry(cover),
      ]);

      await act(async () => {
        fireEvent.drop(zone, {
          dataTransfer: makeFolderDataTransfer([folder]),
        });
        await waitForNetworkIdle();
      });
      await waitForStagingPool(store, 1);
      await act(async () => {
        await waitForNetworkIdle();
      });

      await organizeAll();
      await clickDone();

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });

      const defaultPreset = ORGANIZATION_PRESET_TEMPLATES[0];
      const expectedPath = resolveOrganizationPath(
        defaultPreset,
        {
          genre: 'Rock',
          artist: 'Pink Floyd',
          albumArtist: 'Pink Floyd',
          album: 'The Dark Side of the Moon',
          year: null,
          title: 'Time',
          track: 4,
          composer: null,
        },
        '.mp3',
      );
      const expectedFolder = dirname(expectedPath);
      const expectedFolderArtworkPath = `${expectedFolder}/Folder.jpg`;

      await expect(
        stat(join(getServer().mountDir, expectedFolderArtworkPath)),
      ).resolves.toBeTruthy();

      const tracks = $.getMusicTracks(store.getState());
      const movedTrack = tracks.find((t) => t.path === expectedPath);
      expect(movedTrack?.folderArtworkPath).toBe(expectedFolderArtworkPath);
    }, 30_000);

    it('splits a shared folder cover across every distinct destination folder its tracks land in', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      const zone = await dropZone();

      const trackA = new File(
        [
          new Uint8Array(
            buildMp3WithTags({
              title: 'Time',
              artist: 'Pink Floyd',
              albumArtist: 'Pink Floyd',
              album: 'The Dark Side of the Moon',
              genre: 'Rock',
              track: 4,
            }),
          ),
        ],
        'a.mp3',
        { type: 'audio/mpeg' },
      );
      const trackB = new File(
        [
          new Uint8Array(
            buildMp3WithTags({
              title: 'Kaneda',
              artist: 'Geinoh',
              genre: 'Soundtrack',
            }),
          ),
        ],
        'b.mp3',
        { type: 'audio/mpeg' },
      );
      const cover = new File(
        [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
        'cover.jpg',
        { type: 'image/jpeg' },
      );
      const folder = dirEntry('Compilation', [
        fileEntry(trackA),
        fileEntry(trackB),
        fileEntry(cover),
      ]);

      await act(async () => {
        fireEvent.drop(zone, {
          dataTransfer: makeFolderDataTransfer([folder]),
        });
        await waitForNetworkIdle();
      });
      await waitForStagingPool(store, 2);
      await act(async () => {
        await waitForNetworkIdle();
      });

      await organizeAll();
      await clickDone();

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });

      const defaultPreset = ORGANIZATION_PRESET_TEMPLATES[0];
      const expectedPathA = resolveOrganizationPath(
        defaultPreset,
        {
          genre: 'Rock',
          artist: 'Pink Floyd',
          albumArtist: 'Pink Floyd',
          album: 'The Dark Side of the Moon',
          year: null,
          title: 'Time',
          track: 4,
          composer: null,
        },
        '.mp3',
      );
      const expectedPathB = resolveOrganizationPath(
        defaultPreset,
        {
          genre: 'Soundtrack',
          artist: 'Geinoh',
          albumArtist: null,
          album: null,
          year: null,
          title: 'Kaneda',
          track: null,
          composer: null,
        },
        '.mp3',
      );
      const folderA = dirname(expectedPathA);
      const folderB = dirname(expectedPathB);
      expect(folderA).not.toBe(folderB);

      await expect(
        stat(join(getServer().mountDir, `${folderA}/Folder.jpg`)),
      ).resolves.toBeTruthy();
      await expect(
        stat(join(getServer().mountDir, `${folderB}/Folder.jpg`)),
      ).resolves.toBeTruthy();

      const tracks = $.getMusicTracks(store.getState());
      expect(
        tracks.find((t) => t.path === expectedPathA)?.folderArtworkPath,
      ).toBe(`${folderA}/Folder.jpg`);
      expect(
        tracks.find((t) => t.path === expectedPathB)?.folderArtworkPath,
      ).toBe(`${folderB}/Folder.jpg`);
    }, 30_000);

    it('notes when one cover is shared by several albums', async () => {
      await dropFolders([
        {
          name: 'Jumble',
          tracks: [
            { fileName: 'm1.mp3', tags: { title: 'Three', ...albumA } },
            { fileName: 'm2.mp3', tags: { title: 'Kaneda', ...albumB } },
          ],
          coverSize: 2800,
        },
      ]);

      await organizeAll();

      expect(
        (await screen.findByText(/One cover is shared by/)).textContent,
      ).toContain('Meddle');
    }, 30_000);

    it('writes no cover into a folder that would get different covers', async () => {
      await dropFolders([
        {
          name: 'First',
          tracks: [{ fileName: 'a1.mp3', tags: { title: 'One', ...albumA } }],
          coverSize: 2900,
        },
        {
          name: 'Second',
          tracks: [{ fileName: 'b1.mp3', tags: { title: 'Two', ...albumB } }],
          coverSize: 3100,
        },
      ]);
      await organizeAll();
      await act(async () => {
        fireEvent.click(presetRadio('Custom…'));
      });
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Naming template'), {
          target: { value: 'Shared/{Title}' },
        });
      });

      expect(
        await screen.findByText(/Different covers would land in/),
      ).toBeTruthy();

      await clickDone();
      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });

      const shared = await readdir(join(getServer().mountDir, 'Shared'));
      expect(shared.filter((name) => name.endsWith('.mp3'))).toHaveLength(2);
      expect(shared).not.toContain('Folder.jpg');
    }, 30_000);

    it('flags colliding destinations without moving them, letting the rest commit and allowing a retry', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      const dupTags: Parameters<typeof buildMp3WithTags>[0] = {
        title: 'Same',
        artist: 'Dup',
        albumArtist: 'Dup',
        genre: 'Rock',
        track: 1,
      };
      await dropTracks(
        [
          { fileName: 'dup1.mp3', tags: { ...dupTags, composer: 'One' } },
          { fileName: 'dup2.mp3', tags: { ...dupTags, composer: 'Two' } },
          {
            fileName: 'solo.mp3',
            tags: { title: 'Unique', artist: 'Solo', genre: 'Jazz', track: 2 },
          },
        ],
        store,
      );

      await organizeAll();
      await clickDone();

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain(
          '2 files already exist',
        );
      });
      // The non-colliding track committed and dropped out of the preview.
      expect(treeRows().join('/')).not.toContain('Unique');
      expect($.getMusicStagingPool(store.getState())).toHaveLength(2);

      const uniquePath = resolveOrganizationPath(
        ORGANIZATION_PRESET_TEMPLATES[0],
        {
          genre: 'Jazz',
          artist: 'Solo',
          albumArtist: null,
          album: null,
          year: null,
          title: 'Unique',
          track: 2,
          composer: null,
        },
        '.mp3',
      );
      await expect(
        stat(join(getServer().mountDir, uniquePath)),
      ).resolves.toBeTruthy();

      // A pattern that tells the pair apart resolves the collision, and the
      // notice goes away while the pattern is being changed.
      fireEvent.click(presetRadio('Custom…'));
      fireEvent.change(screen.getByLabelText('Naming template'), {
        target: {
          value: '{Genre}/{AlbumArtist}/{Track} - {Title} ({Composer})',
        },
      });
      expect(screen.queryByRole('alert')).toBeNull();

      await clickDone();

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });
      expect($.getMusicStagingPool(store.getState())).toHaveLength(0);
      for (const composer of ['One', 'Two']) {
        await expect(
          stat(
            join(getServer().mountDir, `/Rock/Dup/01 - Same (${composer}).mp3`),
          ),
        ).resolves.toBeTruthy();
      }
    }, 30_000);

    it('organizes only a multi-selected subset, leaving the rest staged', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      await dropTracks(
        [
          {
            fileName: 'a.mp3',
            tags: {
              title: 'Song A',
              artist: 'Artist',
              genre: 'Rock',
              track: 1,
            },
          },
          {
            fileName: 'b.mp3',
            tags: {
              title: 'Song B',
              artist: 'Artist',
              genre: 'Rock',
              track: 2,
            },
          },
          {
            fileName: 'c.mp3',
            tags: {
              title: 'Song C',
              artist: 'Artist',
              genre: 'Rock',
              track: 3,
            },
          },
        ],
        store,
      );

      const pool = $.getMusicStagingPool(store.getState());
      const selectedPaths = pool
        .filter((t) => t.title !== 'Song C')
        .map((t) => t.path);
      await act(async () => {
        store.dispatch(A.setMusicSelectedTracks(selectedPaths));
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Next 2 selected' }),
        );
        await waitForNetworkIdle();
      });
      await screen.findByText('Organize · 2 tracks');

      await clickDone();

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });

      // Song C was never selected for organizing, so it's still staged.
      const remaining = $.getMusicStagingPool(store.getState());
      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe('Song C');

      const defaultPreset = ORGANIZATION_PRESET_TEMPLATES[0];
      const pathA = resolveOrganizationPath(
        defaultPreset,
        {
          genre: 'Rock',
          artist: 'Artist',
          albumArtist: null,
          album: null,
          year: null,
          title: 'Song A',
          track: 1,
          composer: null,
        },
        '.mp3',
      );
      await expect(
        stat(join(getServer().mountDir, pathA)),
      ).resolves.toBeTruthy();
    }, 30_000);
  });
});
