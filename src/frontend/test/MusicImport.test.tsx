import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { $, T } from 'frontend';
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
      const el = document.querySelector<HTMLElement>('.musicLibraryView');
      if (!el) {
        throw new Error('.musicLibraryView not rendered yet');
      }
      return el;
    });
  }

  async function dropTrack(
    fileName: string,
    tags: Parameters<typeof buildMp3WithTags>[0],
  ) {
    const { store } = await renderMusicApp({ server: getServer() });
    const zone = await dropZone();
    const file = new File([new Uint8Array(buildMp3WithTags(tags))], fileName, {
      type: 'audio/mpeg',
    });
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([file]) });
      await waitForNetworkIdle();
    });
    await screen.findByText(/Staged 1 track/);
    return { store };
  }

  async function dropTracks(
    files: Array<{
      fileName: string;
      tags: Parameters<typeof buildMp3WithTags>[0];
    }>,
  ) {
    const { store } = await renderMusicApp({ server: getServer() });
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
    await screen.findByText(new RegExp(`Staged ${files.length} track`));
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

      await screen.findByText(/Staged 1 track/);

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
      const batchDirs = await readdir(stagingRoot);
      expect(batchDirs).toHaveLength(1);
      const stagedFiles = await readdir(join(stagingRoot, batchDirs[0]));
      expect(stagedFiles).toEqual(['batch.json', 'time.mp3']);
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

    it('discards the staged batch via the header button, deleting the staging folder', async () => {
      const { store } = await dropTrack('time.mp3', {
        title: 'Time',
        artist: 'Pink Floyd',
      });
      const batch = $.getMusicImportBatch(store.getState());
      const batchDir = join(
        getServer().mountDir,
        '.music-staging',
        batch?.batchId as string,
      );

      const discardButton = screen.getByRole('button', {
        name: 'Discard staged import',
      });
      fireEvent.click(discardButton);
      await screen.findByText('Click again to discard');
      fireEvent.click(discardButton);

      await waitFor(() => {
        expect(screen.queryByText(/Import ·/)).toBeNull();
      });

      await expect(readdir(batchDir)).rejects.toThrow();
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
          batchId,
          'batch.json',
        );
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        expect(manifest.step).toBe('organizing');
      });
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
        screen.getByRole('button', { name: defaultPreset }).className,
      ).toContain('active');
      expect(destInput('Time').value).toBe(
        resolveOrganizationPath(defaultPreset, track),
      );

      fireEvent.click(screen.getByRole('button', { name: otherPreset }));

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
      fireEvent.click(screen.getByRole('button', { name: otherPreset }));
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
        fireEvent.click(screen.getByRole('button', { name: chosenPreset }));
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
        screen.getByRole('button', { name: chosenPreset }).className,
      ).toContain('active');
    }, 30_000);

    it('discards the staged batch from the organize screen', async () => {
      const { store } = await dropAndContinue('time.mp3', {
        title: 'Time',
        artist: 'Floyd',
      });
      const batch = $.getMusicImportBatch(store.getState());
      const batchDir = join(
        getServer().mountDir,
        '.music-staging',
        batch?.batchId as string,
      );

      const discardButton = screen.getByRole('button', {
        name: 'Discard staged import',
      });
      fireEvent.click(discardButton);
      await screen.findByText('Click again to discard');
      fireEvent.click(discardButton);

      await waitFor(() => {
        expect(screen.queryByText(/Organize ·/)).toBeNull();
      });
      await expect(readdir(batchDir)).rejects.toThrow();
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
      await dropTracks([
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
      ]);
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
        readdir(join(getServer().mountDir, '.music-staging', batchId)),
      ).rejects.toThrow();

      const tracks = $.getMusicTracks(store.getState());
      expect(tracks.some((t) => t.path === expectedPathA)).toBe(true);
      expect(tracks.some((t) => t.path === expectedPathB)).toBe(true);

      // No manual rescan needed — the library view already reflects the move.
      await screen.findByText('Time', { selector: '.musicTrackTitle' });
    }, 30_000);

    it('flags colliding destinations without moving them, letting the rest commit and allowing a retry', async () => {
      await renderMusicApp({ server: getServer() });
      await scanLibrary();
      const dupTags: Parameters<typeof buildMp3WithTags>[0] = {
        title: 'Same',
        artist: 'Dup',
        albumArtist: 'Dup',
        genre: 'Rock',
        track: 1,
      };
      await dropTracks([
        { fileName: 'dup1.mp3', tags: dupTags },
        { fileName: 'dup2.mp3', tags: dupTags },
        {
          fileName: 'solo.mp3',
          tags: { title: 'Unique', artist: 'Solo', genre: 'Jazz', track: 2 },
        },
      ]);

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
