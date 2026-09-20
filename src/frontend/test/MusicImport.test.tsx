import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { $, A, T } from 'frontend';
import { resolveOrganizationPath } from 'shared/music';
import {
  buildMp3WithTags,
  clearMusicMount,
  renderMusicApp,
  useMusicTestServer,
  waitForNetworkIdle,
} from './utils/music';

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

/**
 * Covers the whole drag-and-drop import & organize feature (see
 * ORGANIZE_IMPORT_PLAN.md) in one file, nested by phase, rather than one
 * file per screen — this is a single feature with one end-to-end flow.
 */
describe('drag-and-drop import & organize', () => {
  const { getServer } = useMusicTestServer();

  afterEach(async () => {
    await clearMusicMount(getServer());
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
    await waitForImportBatch(store, 1);
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
    await waitForImportBatch(store, files.length);
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

  async function waitForImportBatch(
    store: Awaited<ReturnType<typeof renderMusicApp>>['store'],
    trackCount: number,
  ) {
    await waitFor(() => {
      expect($.getMusicImportBatch(store.getState())?.tracks).toHaveLength(
        trackCount,
      );
    });
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

  describe('dropping MP3s onto the library view', () => {
    it('stages dropped MP3s and populates the import batch', async () => {
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

      await waitForImportBatch(store, 1);

      // Staging auto-selects the first track, which mounts the sidebar editor
      // and kicks off its own (separate) tag-loading fetch.
      await act(async () => {
        await waitForNetworkIdle();
      });

      const batch = $.getMusicImportBatch(store.getState());
      expect(batch?.tracks).toHaveLength(1);
      expect(batch?.tracks[0].title).toBe('Time');
      expect(batch?.tracks[0].artist).toBe('Pink Floyd');

      const stagingRoot = join(getServer().mountDir, '.music-staging');
      const stagedFiles = await readdir(stagingRoot);
      expect(stagedFiles).toContain('time.mp3');
      const batchManifests = await readdir(join(stagingRoot, '.batches'));
      expect(batchManifests).toHaveLength(1);
    });

    it('rejects non-MP3 files with a message and stages nothing', async () => {
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

      await screen.findByText(/Only \.mp3 files can be imported/);

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

      await waitForImportBatch(store, 1);

      // Staging auto-selects the first track, which mounts the sidebar editor
      // and kicks off its own (separate) tag-loading fetch.
      await act(async () => {
        await waitForNetworkIdle();
      });

      const batch = $.getMusicImportBatch(store.getState());
      expect(batch?.tracks).toHaveLength(1);
      expect(batch?.tracks[0].title).toBe('Kaneda');

      const stagingRoot = join(getServer().mountDir, '.music-staging');
      const stagedFiles = await readdir(stagingRoot);
      expect(stagedFiles).toContain('kaneda.mp3');
      const batchManifests = await readdir(join(stagingRoot, '.batches'));
      expect(batchManifests).toHaveLength(1);
    });

    it('suffixes a new drop whose filename collides with a file already in the pool', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      await scanLibrary();
      await dropTrack(
        'time.mp3',
        { title: 'Time', artist: 'Pink Floyd' },
        store,
      );
      // Staging auto-selects the first track, which mounts the sidebar
      // editor and kicks off its own (separate) tag-loading fetch.
      await act(async () => {
        await waitForNetworkIdle();
      });

      const closeButton = screen.getByRole('button', {
        name: 'Close staged import',
      });
      await act(async () => {
        fireEvent.click(closeButton);
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
      await waitForImportBatch(store, 1);
      await act(async () => {
        await waitForNetworkIdle();
      });

      const batch = $.getMusicImportBatch(store.getState());
      expect(batch?.tracks[0].path).toBe('/.music-staging/time (2).mp3');
      expect(batch?.tracks[0].title).toBe('Time (Live)');

      const stagedFiles = await readdir(
        join(getServer().mountDir, '.music-staging'),
      );
      expect(stagedFiles).toContain('time.mp3');
      expect(stagedFiles).toContain('time (2).mp3');
    }, 30_000);
  });

  describe('staged batch-edit screen', () => {
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
      const batch = $.getMusicImportBatch(store.getState());
      const stagedPath = batch?.tracks[0].path as string;

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

    it('adds a second drop to the batch instead of starting a new one', async () => {
      const { store } = await dropTrack('a.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const firstBatchId = $.getMusicImportBatch(store.getState())?.batchId;

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
      await waitForImportBatch(store, 2);

      const batch = $.getMusicImportBatch(store.getState());
      expect(batch?.batchId).toBe(firstBatchId);
      expect(batch?.tracks.map((t) => t.title).sort()).toEqual([
        'Kaneda',
        'Time',
      ]);
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
      const { store } = await dropTracks([
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
      await waitForImportBatch(store, 4);

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
      const batch = $.getMusicImportBatch(store.getState());
      const allPaths = batch?.tracks.map((t) => t.path).sort();

      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      grid.focus();
      fireEvent.keyDown(document.body, { key: 'a', metaKey: true });

      expect($.getMusicSelectedTrackPaths(store.getState()).sort()).toEqual(
        allPaths,
      );
    }, 30_000);

    it('removes the selected track on Delete, staging file and all', async () => {
      const { store } = await dropTracks([
        { fileName: 'a.mp3', tags: { title: 'Time', artist: 'Pink Floyd' } },
        { fileName: 'b.mp3', tags: { title: 'Kaneda', artist: 'Geinoh' } },
      ]);
      const batch = $.getMusicImportBatch(store.getState());
      const kanedaPath = batch?.tracks.find((t) => t.title === 'Kaneda')
        ?.path as string;

      await act(async () => {
        store.dispatch(A.setMusicSelectedTracks([kanedaPath]));
      });
      const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
      grid.focus();

      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'Delete' });
        await waitForNetworkIdle();
      });

      await waitForImportBatch(store, 1);
      expect($.getMusicImportBatch(store.getState())?.tracks[0].title).toBe(
        'Time',
      );
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

    it('closes the staged batch via the header button without deleting it', async () => {
      const { store } = await dropTrack('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const batchId = $.getMusicImportBatch(store.getState())
        ?.batchId as string;
      const stagingRoot = join(getServer().mountDir, '.music-staging');

      const closeButton = screen.getByRole('button', {
        name: 'Close staged import',
      });
      await act(async () => {
        fireEvent.click(closeButton);
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(screen.queryByText(/Import ·/)).toBeNull();
      });
      expect($.getMusicImportBatch(store.getState())).toBeNull();

      expect(await readdir(stagingRoot)).toContain('time.mp3');
      const manifestPath = join(stagingRoot, '.batches', `${batchId}.json`);
      await expect(readFile(manifestPath, 'utf8')).resolves.toBeTruthy();
      await screen.findByText('1 incomplete import');
    }, 30_000);

    it('persists the organizing step to the manifest when Continue is clicked', async () => {
      const { store } = await dropTrack('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const batch = $.getMusicImportBatch(store.getState());
      const batchId = batch?.batchId as string;

      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(async () => {
        const manifestPath = join(
          getServer().mountDir,
          '.music-staging',
          '.batches',
          `${batchId}.json`,
        );
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        expect(manifest.step).toBe('organizing');
      });
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
      const batch = $.getMusicImportBatch(store.getState());
      const paths = batch?.tracks.map((t) => t.path) as string[];

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
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitForNetworkIdle();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);

      const destInput = screen.getByRole('textbox', {
        name: 'Destination path for Song A',
      }) as HTMLInputElement;
      expect(destInput.value).toContain('2014');
    }, 30_000);
  });

  describe('organize screen', () => {
    async function dropAndContinue(
      fileName: string,
      tags: Parameters<typeof buildMp3WithTags>[0],
    ) {
      const { store } = await dropTrack(fileName, tags);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);
      return { store };
    }

    function destInput(title: string): HTMLInputElement {
      return screen.getByRole('textbox', {
        name: `Destination path for ${title}`,
      }) as HTMLInputElement;
    }

    it('ignores a file drop while organizing', async () => {
      const { store } = await dropAndContinue('time.mp3', {
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

      const batch = $.getMusicImportBatch(store.getState());
      expect(batch?.tracks).toHaveLength(1);
      expect(batch?.tracks[0].title).toBe('Time');
      expect(screen.queryByText(/Staging/)).toBeNull();
    }, 30_000);

    it('previews the default preset and switches to another preset', async () => {
      await dropAndContinue('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
        albumArtist: 'Pink Floyd',
        album: 'The Dark Side of the Moon',
        genre: 'Rock',
        track: 1,
      });

      const track: T.OrganizationTrackFields = {
        genre: 'Rock',
        artist: 'Pink Floyd',
        albumArtist: 'Pink Floyd',
        album: 'The Dark Side of the Moon',
        year: null,
        title: 'Time',
        track: 1,
        composer: null,
      };

      const defaultPreset =
        '{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}';
      const otherPreset = '{Artist}/{AlbumArtist}/{Track} - {Title}';

      expect(
        (screen.getByLabelText('Naming template') as HTMLInputElement).value,
      ).toBe(defaultPreset);
      expect(destInput('Time').value).toBe(
        resolveOrganizationPath(defaultPreset, track),
      );

      fireEvent.change(
        screen.getByLabelText('Insert a preset filename format'),
        { target: { value: otherPreset } },
      );

      expect(destInput('Time').value).toBe(
        resolveOrganizationPath(otherPreset, track),
      );
    }, 30_000);

    it('supports a custom typed template that updates the preview live', async () => {
      await dropAndContinue('time.mp3', { title: 'Time', artist: 'Floyd' });

      const track: T.OrganizationTrackFields = {
        genre: null,
        artist: 'Floyd',
        albumArtist: null,
        album: null,
        year: null,
        title: 'Time',
        track: null,
        composer: null,
      };

      fireEvent.change(screen.getByLabelText('Naming template'), {
        target: { value: '{Artist} - {Title}' },
      });

      expect(destInput('Time').value).toBe(
        resolveOrganizationPath('{Artist} - {Title}', track),
      );
    }, 30_000);

    it('lets a single track override its destination path independent of the template', async () => {
      await dropAndContinue('time.mp3', {
        title: 'Time',
        artist: 'Floyd',
        albumArtist: 'Pink Floyd',
        genre: 'Rock',
        track: 3,
      });
      const track: T.OrganizationTrackFields = {
        genre: 'Rock',
        artist: 'Floyd',
        albumArtist: 'Pink Floyd',
        album: null,
        year: null,
        title: 'Time',
        track: 3,
        composer: null,
      };
      const otherPreset = '{Artist}/{AlbumArtist}/{Track} - {Title}';

      const input = destInput('Time');
      const computedPath = input.value;

      fireEvent.change(input, { target: { value: '/Custom/Path.mp3' } });
      expect(destInput('Time').value).toBe('/Custom/Path.mp3');

      // Switching presets doesn't clobber the manual override.
      fireEvent.change(
        screen.getByLabelText('Insert a preset filename format'),
        { target: { value: otherPreset } },
      );
      expect(destInput('Time').value).toBe('/Custom/Path.mp3');

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Reset Time to the template path',
        }),
      );
      const resetPath = resolveOrganizationPath(otherPreset, track);
      expect(destInput('Time').value).toBe(resetPath);
      expect(resetPath).not.toBe(computedPath);
    }, 30_000);

    it('returns to the batch-edit screen via Back to edit, keeping the chosen template', async () => {
      await dropAndContinue('time.mp3', { title: 'Time', artist: 'Floyd' });

      const chosenPreset = '{Artist}/{AlbumArtist}/{Track} - {Title}';
      await act(async () => {
        fireEvent.change(
          screen.getByLabelText('Insert a preset filename format'),
          { target: { value: chosenPreset } },
        );
        await waitForNetworkIdle();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Back to edit' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Import ·/);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);

      expect(
        (screen.getByLabelText('Naming template') as HTMLInputElement).value,
      ).toBe(chosenPreset);
    }, 30_000);

    it('closes the staged batch from the organize screen without deleting it', async () => {
      const { store } = await dropAndContinue('time.mp3', {
        title: 'Time',
        artist: 'Floyd',
      });
      const batchId = $.getMusicImportBatch(store.getState())
        ?.batchId as string;
      const stagingRoot = join(getServer().mountDir, '.music-staging');

      const closeButton = screen.getByRole('button', {
        name: 'Close staged import',
      });
      await act(async () => {
        fireEvent.click(closeButton);
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });
      expect($.getMusicImportBatch(store.getState())).toBeNull();

      expect(await readdir(stagingRoot)).toContain('time.mp3');
      const manifestPath = join(stagingRoot, '.batches', `${batchId}.json`);
      await expect(readFile(manifestPath, 'utf8')).resolves.toBeTruthy();
      await screen.findByText('1 incomplete import');
    }, 30_000);
  });

  describe('resuming or discarding an abandoned staged import', () => {
    async function abandonBatch(
      store: Awaited<ReturnType<typeof renderMusicApp>>['store'],
    ) {
      await act(async () => {
        store.dispatch(A.setMusicImportBatch(null));
        await store.dispatch(A.refreshMusicStagedBatchSummaries());
      });
      await screen.findByText('1 incomplete import');
    }

    it('resumes an abandoned staged batch, restoring its tracks', async () => {
      const { store } = await dropTrack('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const batchId = $.getMusicImportBatch(store.getState())
        ?.batchId as string;

      await abandonBatch(store);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
        await waitForNetworkIdle();
      });

      await waitForImportBatch(store, 1);
      const batch = $.getMusicImportBatch(store.getState());
      expect(batch?.batchId).toBe(batchId);
      expect(batch?.tracks[0].title).toBe('Time');
    }, 30_000);

    it('discards an abandoned staged batch from the resume banner', async () => {
      const { store } = await dropTrack('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const batchId = $.getMusicImportBatch(store.getState())
        ?.batchId as string;
      const stagingRoot = join(getServer().mountDir, '.music-staging');

      await abandonBatch(store);

      const discardButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(discardButton);
      await screen.findByText('Click again to delete');
      await act(async () => {
        fireEvent.click(discardButton);
        await waitForNetworkIdle();
      });

      await waitFor(() => {
        expect(screen.queryByText('1 incomplete import')).toBeNull();
      });
      expect(await readdir(stagingRoot)).not.toContain('time.mp3');
      await expect(
        readFile(join(stagingRoot, '.batches', `${batchId}.json`), 'utf8'),
      ).rejects.toThrow();
    }, 30_000);
  });

  describe('commit ("Done")', () => {
    beforeEach(() => {
      jest
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockReturnValue(600);
      jest
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockReturnValue(800);
    });

    async function continueToOrganize() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitForNetworkIdle();
      });
      await screen.findByText(/Organize ·/);
    }

    async function clickDone() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
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
      const batch = $.getMusicImportBatch(store.getState());
      const batchId = batch?.batchId as string;

      await continueToOrganize();
      await clickDone();

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });

      const defaultPreset =
        '{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}';
      const expectedPathA = resolveOrganizationPath(defaultPreset, {
        genre: 'Rock',
        artist: 'Pink Floyd',
        albumArtist: 'Pink Floyd',
        album: 'The Dark Side of the Moon',
        year: null,
        title: 'Time',
        track: 4,
        composer: null,
      });
      const expectedPathB = resolveOrganizationPath(defaultPreset, {
        genre: 'Soundtrack',
        artist: 'Geinoh',
        albumArtist: null,
        album: null,
        year: null,
        title: 'Kaneda',
        track: null,
        composer: null,
      });

      await expect(
        stat(join(getServer().mountDir, expectedPathA)),
      ).resolves.toBeTruthy();
      await expect(
        stat(join(getServer().mountDir, expectedPathB)),
      ).resolves.toBeTruthy();

      await expect(
        readFile(
          join(
            getServer().mountDir,
            '.music-staging',
            '.batches',
            `${batchId}.json`,
          ),
          'utf8',
        ),
      ).rejects.toThrow();

      const tracks = $.getMusicTracks(store.getState());
      expect(tracks.some((t) => t.path === expectedPathA)).toBe(true);
      expect(tracks.some((t) => t.path === expectedPathB)).toBe(true);

      // No manual rescan needed — the library view already reflects the move.
      await screen.findByText('Time', { selector: '.musicTrackTitle' });
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
          { fileName: 'dup1.mp3', tags: dupTags },
          { fileName: 'dup2.mp3', tags: dupTags },
          {
            fileName: 'solo.mp3',
            tags: { title: 'Unique', artist: 'Solo', genre: 'Jazz', track: 2 },
          },
        ],
        store,
      );

      await continueToOrganize();
      await clickDone();

      await waitFor(() => {
        expect(
          screen.getAllByText(
            'Already exists — change the name or path and retry',
          ),
        ).toHaveLength(2);
      });
      // The non-colliding track committed and dropped out of the preview.
      expect(screen.queryByText('Unique')).toBeNull();

      const uniquePath = resolveOrganizationPath(
        '{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}',
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
      );
      await expect(
        stat(join(getServer().mountDir, uniquePath)),
      ).resolves.toBeTruthy();

      // Giving one of the pair a unique destination resolves the mutual
      // collision entirely — retrying now lands both.
      const destInputs = screen.getAllByRole('textbox', {
        name: 'Destination path for Same',
      });
      fireEvent.change(destInputs[0], {
        target: { value: '/Rock/Dup/Dup/01 - Same (1).mp3' },
      });

      await clickDone();

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });
      await expect(
        stat(join(getServer().mountDir, '/Rock/Dup/Dup/01 - Same (1).mp3')),
      ).resolves.toBeTruthy();
      const otherDupPath = resolveOrganizationPath(
        '{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}',
        {
          genre: 'Rock',
          artist: 'Dup',
          albumArtist: 'Dup',
          album: null,
          year: null,
          title: 'Same',
          track: 1,
          composer: null,
        },
      );
      await expect(
        stat(join(getServer().mountDir, otherDupPath)),
      ).resolves.toBeTruthy();
    }, 30_000);
  });
});
