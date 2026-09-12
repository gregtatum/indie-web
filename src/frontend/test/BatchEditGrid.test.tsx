import { fireEvent, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $, A, T } from 'frontend';
import {
  buildMp3WithTags,
  clearMusicMount,
  renderMusicApp,
  useMusicTestServer,
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
    const rendered = renderMusicApp({ server: getServer() });
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

    // The sidebar reuses the shared selection: with both rows still selected
    // and sharing an album, it shows the existing bulk "shared album" editor
    // (the same one EditTrackModal already renders for this case).
    expect(screen.getByRole('heading', { name: 'Album A' })).toBeTruthy();
  }, 30_000);

  it('autosaves a single cell without touching other tracks', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();

    // First key press only seeds the cursor at (row 0, column 0).
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    // Second moves the cursor onto the Title column.
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    // Typing a printable character opens the cell for editing, seeded with it.
    fireEvent.keyDown(document.body, { key: 'x' });

    const input = await screen.findByDisplayValue('x');
    fireEvent.change(input, { target: { value: 'Retitled A' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(async () => {
      expect((await fetchIndexTrack('/a.mp3'))?.title).toBe('Retitled A');
    });
    // The other row's title is untouched — this was a single-track write.
    expect((await fetchIndexTrack('/b.mp3'))?.title).toBe('Song B');
    getCellText('Retitled A');
    getCellText('Song B');
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

    // A second click is a two-state toggle: it reverses to descending...
    fireEvent.click(titleHeader);
    expect(titleOrder()).toEqual(['Bravo', 'Alpha']);
    // ...and a third click goes back to ascending (no third "unsorted" state).
    fireEvent.click(titleHeader);
    expect(titleOrder()).toEqual(['Alpha', 'Bravo']);

    // Editing the sorted column's value doesn't reorder rows mid-session: a
    // live re-sort would move this row (now "Charlie") after "Bravo".
    const grid = screen.getByRole('grid', { name: 'Batch edit tracks' });
    grid.focus();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' }); // seed (0,0)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' }); // -> title column
    fireEvent.keyDown(document.body, { key: 'C' });
    const input = await screen.findByDisplayValue('C');
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

  it('closes back to the normal library view and keeps the selection', async () => {
    await writeAlbumA();
    const { store } = await setup();
    await openBatchEdit(store, ['/a.mp3', '/b.mp3'], 'Song A');

    fireEvent.click(screen.getByRole('button', { name: 'Close batch edit' }));

    expect(screen.queryByText(/Batch Edit ·/)).toBeNull();
    expect(screen.getByRole('listbox', { name: 'genre' })).toBeTruthy();
    expect($.getMusicSelectedTrackPaths(store.getState())).toEqual([
      '/a.mp3',
      '/b.mp3',
    ]);
  }, 30_000);
});
