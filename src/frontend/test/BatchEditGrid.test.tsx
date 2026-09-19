import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $, A, T } from 'frontend';
import {
  buildMp3WithTags,
  clearMusicMount,
  renderMusicApp,
  useMusicTestServer,
  waitForNetworkIdle,
} from './utils/music';

/**
 * Drives the Batch Edit grid against the real music server — see
 * BATCH_EDIT_PLAN.md for the feature design this covers.
 */

const jestDescribe = globalThis.describe;
let describe: (name: string, fn: () => void) => void = jestDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  // The check runner enables this in sandboxes that cannot bind localhost.
  describe = (name) => {
    process.stderr.write(`LOCALHOST_BIND_SKIPPED_TEST ${name}\n`);
  };
  it.skip('localhost-dependent tests skipped by check runner', () => {});
}

describe('<BatchEditGrid> with real server', () => {
  const { getServer } = useMusicTestServer();

  // The virtualizer reads offsetHeight/offsetWidth to decide how many rows to
  // render; jsdom returns 0 for both, so without this it renders nothing.
  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(600);
    jest
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockReturnValue(800);
  });

  // The server and its mount are shared for the lifetime of this file, so each
  // test has to leave the library empty for the next one.
  afterEach(async () => {
    await clearMusicMount(getServer());
    window.localStorage.removeItem('musicBatchEditColumns');
  });

  async function writeTrack(
    clientPath: string,
    tags: Parameters<typeof buildMp3WithTags>[0],
  ): Promise<void> {
    const full = join(getServer().mountDir, clientPath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buildMp3WithTags(tags));
  }

  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${getServer().baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async function fetchIndexTrack(
    clientPath: string,
  ): Promise<T.TrackMetadata | undefined> {
    const index = await fetchJson<T.MusicIndex>('/music/music-index');
    return index.tracks.find((track) => track.path === clientPath);
  }

  async function scanLibrary(): Promise<void> {
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    await screen.findByText(/Found \d+ tracks\./);
  }

  async function setup() {
    const rendered = await renderMusicApp({ server: getServer() });
    await scanLibrary();
    return rendered;
  }

  function findTrackRow(title: string) {
    return screen.findByText(title, { selector: '.musicTrackTitle' });
  }

  function getCellText(value: string) {
    return screen.getByText(value, { selector: '.musicBatchEditCellText' });
  }

  async function openBatchEdit(
    store: T.Store,
    paths: string[],
    anchorTitle: string,
  ) {
    await act(async () => {
      store.dispatch(A.setMusicSelectedTracks(paths));
    });
    const track = await findTrackRow(anchorTitle);
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Batch Edit' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText(/Loading ID3 tags/)).toBeNull();
      expect(screen.queryByText('Loading…')).toBeNull();
    });
  }

  async function writeAlbumA(): Promise<void> {
    await writeTrack('a.mp3', {
      title: 'Song A',
      artist: 'Artist A',
      albumArtist: 'Album Artist A',
      album: 'Album A',
      genre: 'Rock',
      track: 1,
    });
    await writeTrack('b.mp3', {
      title: 'Song B',
      artist: 'Artist B',
      albumArtist: 'Album Artist A',
      album: 'Album A',
      genre: 'Rock',
      track: 2,
    });
  }

  it('shows the real tag values for the frozen selection', async () => {
    await writeAlbumA();
    const { store } = await setup();

    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    expect(await screen.findByText('Batch Edit · 2 tracks')).toBeTruthy();
    getCellText('Song A');
    getCellText('Song B');
    getCellText('Artist A');
    getCellText('Artist B');
    expect(screen.getAllByText('Album A').length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Song A' })).toBeTruthy();
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/a.mp3']);
  }, 30_000);

  it('opens with only the first track and field active, not the whole frozen set', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/a.mp3']);

    const activeCells = document.querySelectorAll('.musicBatchEditCell.active');
    expect(activeCells).toHaveLength(1);
    expect(activeCells[0].textContent).toBe('1');
  }, 30_000);

  it('autosaves a single cell without touching other tracks', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    fireEvent.click(getCellText('Song A'));
    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    fireEvent.keyDown(document.body, { key: 'Enter' });

    // Scoped to the grid — the sidebar also has a "Song A" title input.
    const input = await within(grid).findByDisplayValue('Song A');
    fireEvent.change(input, { target: { value: 'Retitled A' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(async () => {
      expect((await fetchIndexTrack('/a.mp3'))?.title).toBe('Retitled A');
    });
    expect((await fetchIndexTrack('/b.mp3'))?.title).toBe('Song B');
    getCellText('Retitled A');
    getCellText('Song B');

    // Clicking the cell re-focused the row, which re-fetches the sidebar's
    // tags for the newly focused track.
    await act(async () => {
      await waitForNetworkIdle();
    });
  }, 30_000);

  it('moves the row selection with Up/Down but only the field with Left/Right', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    function activeCellText(): string | null {
      return (
        document.querySelector(
          '.musicBatchEditCell.active .musicBatchEditCellText',
        )?.textContent ?? null
      );
    }

    fireEvent.click(getCellText('Artist A'));
    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    expect(activeCellText()).toBe('Artist A');
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/a.mp3']);

    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/b.mp3']);
    expect(activeCellText()).toBe('Artist B');

    await act(async () => {
      await waitForNetworkIdle();
    });

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(activeCellText()).toBe('Song B');
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/b.mp3']);
  }, 30_000);

  it('a click that misses every cell falls back to the nearest one', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    const row = getCellText('Song A').closest(
      '.musicBatchEditRow',
    ) as HTMLElement;
    const cells = row.querySelectorAll<HTMLElement>('.musicBatchEditCell');
    expect(cells.length).toBe(6);
    for (const [index, cell] of cells.entries()) {
      jest.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
        left: index * 100,
        right: index * 100 + 90,
        top: 0,
        bottom: 32,
        width: 90,
        height: 32,
        x: index * 100,
        y: 0,
        toJSON() {
          return this;
        },
      } as DOMRect);
    }

    // Between the Artist cell (index 2, right edge 290) and the Album Artist
    // cell (index 3, left edge 300) — closer to Artist.
    fireEvent.click(row, { clientX: 292 });

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/a.mp3']);
    expect(
      document.querySelector(
        '.musicBatchEditCell.active .musicBatchEditCellText',
      )?.textContent,
    ).toBe('Artist A');
  }, 30_000);

  it('leaves Tab to the browser instead of cycling fields', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    function activeCellText(): string | null {
      return (
        document.querySelector(
          '.musicBatchEditCell.active .musicBatchEditCellText',
        )?.textContent ?? null
      );
    }

    fireEvent.click(getCellText('Song A'));
    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    expect(activeCellText()).toBe('Song A');

    expect(fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(true);
    expect(activeCellText()).toBe('Song A');
    expect(
      fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true }),
    ).toBe(true);
    expect(activeCellText()).toBe('Song A');

    fireEvent.keyDown(document.body, { key: 'Enter' });
    const input = await within(grid).findByDisplayValue('Song A');
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true);
  }, 30_000);

  it('bulk-edits every track in a multi-selection', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    fireEvent.click(getCellText('Artist A'));
    fireEvent.click(getCellText('Artist B'), { shiftKey: true });
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/a.mp3',
      '/b.mp3',
    ]);

    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    fireEvent.keyDown(document.body, { key: 'x' });

    const input = await within(grid).findByDisplayValue('x');
    fireEvent.change(input, { target: { value: 'New Artist' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(async () => {
      expect((await fetchIndexTrack('/a.mp3'))?.artist).toBe('New Artist');
    });
    expect((await fetchIndexTrack('/b.mp3'))?.artist).toBe('New Artist');
  }, 30_000);

  it('sidebar shows the single-track editor when only one row is selected', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    fireEvent.click(getCellText('Song A'));

    expect(await screen.findByRole('heading', { name: 'Song A' })).toBeTruthy();
    expect(screen.queryByText('2 selected tracks')).toBeNull();
  }, 30_000);

  it('sorts rows on header click without reordering on edits, until clicked again', async () => {
    await writeTrack('a.mp3', { title: 'Bravo', track: 1 });
    await writeTrack('b.mp3', { title: 'Alpha', track: 2 });
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Bravo');

    function titleOrder(): string[] {
      return screen
        .getAllByText(/^(Alpha|Bravo|Charlie)$/, {
          selector: '.musicBatchEditCellText',
        })
        .map((el) => el.textContent ?? '');
    }

    expect(titleOrder()).toEqual(['Bravo', 'Alpha']);

    // Captured once and reused below — once sorted, the header's accessible
    // name gains a direction-arrow suffix, so re-querying by name would break.
    const titleHeader = screen.getByRole('columnheader', { name: 'Title' });
    fireEvent.click(titleHeader);
    expect(titleOrder()).toEqual(['Alpha', 'Bravo']);

    fireEvent.click(titleHeader);
    expect(titleOrder()).toEqual(['Bravo', 'Alpha']);
    fireEvent.click(titleHeader);
    expect(titleOrder()).toEqual(['Alpha', 'Bravo']);

    fireEvent.click(getCellText('Alpha'));
    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    const input = await within(grid).findByDisplayValue('Alpha');
    fireEvent.change(input, { target: { value: 'Charlie' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      getCellText('Charlie');
    });
    expect(titleOrder()).toEqual(['Charlie', 'Bravo']);
  }, 30_000);

  it('hides a column via the header popover', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    expect(screen.getByRole('columnheader', { name: 'Genre' })).toBeTruthy();

    fireEvent.contextMenu(screen.getByRole('columnheader', { name: 'Genre' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'Genre' });
    fireEvent.click(checkbox);

    expect(screen.queryByRole('columnheader', { name: 'Genre' })).toBeNull();
  }, 30_000);

  it('closes back to the normal library view', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    fireEvent.click(screen.getByRole('button', { name: 'Close batch edit' }));

    expect(screen.queryByText(/Batch Edit ·/)).toBeNull();
    expect(screen.getByRole('listbox', { name: 'genre' })).toBeTruthy();
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/a.mp3']);
    expect(document.activeElement).toBe(
      screen.getByRole('listbox', { name: 'Tracks' }),
    );
  }, 30_000);

  it('selects every row with Cmd+A', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual(['/a.mp3']);

    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    fireEvent.keyDown(document.body, { key: 'a', metaKey: true });

    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/a.mp3',
      '/b.mp3',
    ]);
  }, 30_000);

  it('ignores the Delete key — deleting via keyboard is import-only', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    fireEvent.keyDown(document.body, { key: 'Delete' });

    getCellText('Song A');
    expect(await fetchIndexTrack('/a.mp3')).toBeTruthy();
  }, 30_000);
});
