import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { A, T } from 'frontend';
import {
  buildJpegBytes,
  buildMp3WithTags,
  clearMusicMount,
  renderMusicApp,
  useMusicTestServer,
  waitForNetworkIdle,
  writeFolderArtwork,
} from './utils/music';

/**
 * The preferred tests for driving the Edit Track modal behavior against the real music
 * server.
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

type TrackTags = {
  blocks: Array<{
    format: string;
    tags: Array<{ id: string; value: string; binary?: string }>;
  }>;
  resolved: Record<string, string>;
};

describe('<EditTrackModal> with real server', () => {
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

  function fetchTrackTags(clientPath: string): Promise<TrackTags> {
    return fetchJson<TrackTags>(
      `/music/track-tags?path=${encodeURIComponent(clientPath)}`,
    );
  }

  async function fetchIndexTrack(
    clientPath: string,
  ): Promise<T.TrackMetadata | undefined> {
    const index = await fetchJson<T.MusicIndex>('/music/music-index');
    return index.tracks.find((track) => track.path === clientPath);
  }

  function frameValue(tags: TrackTags, id: string): string | undefined {
    return tags.blocks.flatMap((block) => block.tags).find((t) => t.id === id)
      ?.value;
  }

  /**
   * Builds the durable index straight from the server, without rendering.
   */
  async function scanViaApi(): Promise<void> {
    const res = await fetch(`${getServer().baseUrl}/music/music-index/scan`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error(`scan failed: ${res.status}`);
    }
  }

  async function scanLibrary(): Promise<void> {
    await screen.findByText('Music library not found. Run a scan first.');
    await act(async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Scan Library' }),
      );
    });
    await screen.findByText(/Found \d+ tracks\./);
  }

  /**
   * Renders the app, scans the (already-written) files, and returns the store.
   */
  async function setup(search = '') {
    const rendered = await renderMusicApp({ server: getServer(), search });
    if (!search.includes('edit=')) {
      await scanLibrary();
    }
    return rendered;
  }

  function getDialog(name: string) {
    return screen.getByRole('dialog', { name });
  }

  function findTrackRow(title: string) {
    return screen.findByText(title, { selector: '.musicTrackTitle' });
  }

  async function openEditModal(trackText: string) {
    const track = await findTrackRow(trackText);
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    });
    await act(async () => {
      await waitForNetworkIdle();
    });
    expect(screen.queryByText('Loading…')).toBeNull();
  }

  async function openBulkEditModal(
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
        await screen.findByRole('button', { name: 'Edit Selection' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText(/Loading ID3 tags/)).toBeNull();
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

  async function waitForEnabledField(label: string) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    await waitFor(() => {
      expect(input.disabled).toBe(false);
    });
    return input;
  }

  it('opens with the right-clicked track fields pre-populated', async () => {
    await writeTrack('a.mp3', {
      title: 'Song A',
      artist: 'Artist A',
      album: 'Album A',
      genre: 'Rock',
    });
    await setup();

    await openEditModal('Song A');
    getDialog('Song A');
    await waitFor(() => {
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'Song A',
      );
    });
    expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
      'Artist A',
    );
    expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
      'Rock',
    );
  }, 30_000);

  it('reopens a bulk edit from URL params after refresh', async () => {
    await writeAlbumA();
    await scanViaApi();
    await renderMusicApp({
      server: getServer(),
      search: '?track=%2Fa.mp3&track=%2Fb.mp3&edit=%2Fa.mp3',
    });

    const dialog = await screen.findByRole('dialog', { name: 'Album A' });
    expect(within(dialog).getByText('Album Artist A')).toBeTruthy();
    expect(screen.queryByText('2 selected tracks')).toBeNull();
    await waitFor(() => {
      expect(
        (screen.getByLabelText('Artist') as HTMLInputElement).disabled,
      ).toBe(false);
    });
    expect(screen.queryByLabelText('Title')).toBeNull();
  }, 30_000);

  it('allows editing the artist field', async () => {
    await writeTrack('a.mp3', { title: 'Song A', artist: 'Artist A' });
    await setup();

    await openEditModal('Song A');
    const artistInput = await waitForEnabledField('Artist');
    await act(async () => {
      fireEvent.change(artistInput, { target: { value: 'New Artist' } });
    });
    expect(artistInput.value).toBe('New Artist');
  }, 30_000);

  it('saves and persists the artist to the MP3 when Enter is pressed', async () => {
    await writeTrack('a.mp3', { title: 'Song A', artist: 'Artist A' });
    await setup();

    await openEditModal('Song A');
    const artistInput = await waitForEnabledField('Artist');
    await act(async () => {
      await userEvent.clear(artistInput);
      await userEvent.type(artistInput, 'New Artist{Enter}');
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const tags = await fetchTrackTags('/a.mp3');
    expect(frameValue(tags, 'TPE1')).toBe('New Artist');
  }, 30_000);

  it('persists the prefer-composer-grouping private tag from the Details form', async () => {
    await writeTrack('a.mp3', {
      title: 'Song A',
      artist: 'Artist A',
      genre: 'Rock',
    });
    await setup();

    await openEditModal('Song A');
    const preferComposerRadio = await within(
      screen.getByRole('radiogroup', { name: 'Group Artist By' }),
    ).findByLabelText('Composer');
    await waitFor(() => {
      expect((preferComposerRadio as HTMLInputElement).disabled).toBe(false);
    });

    await act(async () => {
      await userEvent.click(preferComposerRadio);
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(async () => {
      expect((await fetchIndexTrack('/a.mp3'))?.preferComposerGrouping).toBe(
        true,
      );
    });
  }, 30_000);

  it('persists the prefer-composer-grouping default when the default is selected', async () => {
    await writeTrack('a.mp3', {
      title: 'Song A',
      artist: 'Artist A',
      genre: 'Classical',
      txxx: { 'indie-web:prefer-composer-grouping': 'false' },
    });
    await setup();

    await openEditModal('Song A');
    const defaultComposerRadio = await within(
      screen.getByRole('radiogroup', { name: 'Group Artist By' }),
    ).findByLabelText('Default (Composer)');
    await waitFor(() => {
      expect((defaultComposerRadio as HTMLInputElement).disabled).toBe(false);
    });

    await act(async () => {
      await userEvent.click(defaultComposerRadio);
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(async () => {
      expect((await fetchIndexTrack('/a.mp3'))?.preferComposerGrouping).toBe(
        true,
      );
    });
  }, 30_000);

  it('closes when the close button is clicked', async () => {
    await writeTrack('a.mp3', { title: 'Song A', artist: 'Artist A' });
    await setup();

    await openEditModal('Song A');
    getDialog('Song A');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 30_000);

  it('closes when Escape is pressed', async () => {
    await writeTrack('a.mp3', { title: 'Song A', artist: 'Artist A' });
    await setup();

    await openEditModal('Song A');
    getDialog('Song A');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 30_000);

  it('repopulates fields when opening for a different track', async () => {
    await writeTrack('a.mp3', {
      title: 'Song A',
      artist: 'Artist A',
      genre: 'Rock',
    });
    await writeTrack('b.mp3', {
      title: 'Song B',
      artist: 'Artist B',
      genre: 'Rock',
    });
    await setup();

    await openEditModal('Song A');
    await waitFor(() => {
      expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
        'Artist A',
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    await openEditModal('Song B');
    await waitFor(() => {
      expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe(
        'Artist B',
      );
    });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Song B',
    );
    expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
      'Rock',
    );
  }, 30_000);

  it('opens a bulk Details editor with shared values and mixed placeholders', async () => {
    await writeAlbumA();
    const { store } = await setup();

    await openBulkEditModal(store, ['/a.mp3', '/b.mp3'], 'Song A');

    const dialog = getDialog('Album A');
    await waitForEnabledField('Artist');

    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(within(dialog).getByText('Album Artist A')).toBeTruthy();

    const artistInput = screen.getByLabelText('Artist') as HTMLInputElement;
    const albumInput = screen.getByLabelText('Album') as HTMLInputElement;
    const genreInput = screen.getByLabelText('Genre') as HTMLInputElement;
    expect(artistInput.value).toBe('');
    expect(artistInput.placeholder).toBe('Mixed');
    expect(albumInput.value).toBe('Album A');
    expect(albumInput.placeholder).toBe('');
    expect(genreInput.value).toBe('Rock');

    const trackLabel = screen
      .getAllByText('Track')
      .find((node) => node.closest('label'));
    const trackInputs = trackLabel!.closest('label')!.querySelectorAll('input');
    expect(trackInputs[0].value).toBe('');
    expect(trackInputs[0].placeholder).toBe('–');
  }, 30_000);

  it('uses the bulk count header for mixed album edits', async () => {
    await writeAlbumA();
    await writeTrack('c.mp3', {
      title: 'Song C',
      artist: 'Artist A',
      albumArtist: 'Album Artist B',
      album: 'Album B',
      genre: 'Jazz',
    });
    const { store } = await setup();

    await openBulkEditModal(store, ['/a.mp3', '/c.mp3'], 'Song A');

    const dialog = getDialog('Edit 2 Tracks');
    expect(within(dialog).getByText('2 selected tracks')).toBeTruthy();
  }, 30_000);

  it('keeps ID3 disabled and persists shared bulk genre edits to every file', async () => {
    await writeAlbumA();
    const { store } = await setup();

    await openBulkEditModal(store, ['/a.mp3', '/b.mp3'], 'Song A');
    const id3Tab = screen.getByRole('tab', {
      name: 'ID3',
    }) as HTMLButtonElement;
    expect(id3Tab.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(id3Tab);
    });
    expect(id3Tab.getAttribute('aria-selected')).toBe('false');

    const genreInput = await waitForEnabledField('Genre');
    await act(async () => {
      fireEvent.change(genreInput, { target: { value: 'New Genre' } });
    });

    const saveButton = screen.getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    for (const path of ['/a.mp3', '/b.mp3']) {
      const tags = await fetchTrackTags(path);
      expect(frameValue(tags, 'TCON')).toBe('New Genre');
    }
    const state = store.getState() as T.State;
    const tracks = state.music.tracks as T.TrackMetadata[];
    expect(tracks.find((t) => t.path === '/a.mp3')?.genre).toBe('New Genre');
    expect(tracks.find((t) => t.path === '/b.mp3')?.genre).toBe('New Genre');
  }, 30_000);

  it('shows every server save error from a partial bulk failure', async () => {
    await writeAlbumA();
    // A non-MP3 the server will reject, plus a path that does not exist.
    await writeFile(join(getServer().mountDir, 'notes.txt'), 'not audio');
    const { store } = await setup();

    await act(async () => {
      store.dispatch(
        A.setMusicSelectedTracks(['/a.mp3', '/b.mp3', '/missing.mp3']),
      );
    });
    const track = await findTrackRow('Song A');
    await act(async () => {
      fireEvent.contextMenu(track);
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit Selection' }),
      );
    });

    const genreInput = await waitForEnabledField('Genre');
    await act(async () => {
      fireEvent.change(genreInput, { target: { value: 'New Genre' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await screen.findByText(/Could not save/);
    expect(screen.getByText('/missing.mp3')).toBeTruthy();

    // The tracks that could be written were written.
    const tags = await fetchTrackTags('/a.mp3');
    expect(frameValue(tags, 'TCON')).toBe('New Genre');
  }, 30_000);

  it('treats a co-located bulk selection as a folder artwork edit', async () => {
    const cover = buildJpegBytes();
    await writeFolderArtwork(getServer(), '/Album A', cover);
    await writeFolderArtwork(getServer(), '/Album B', cover);
    await writeTrack('Album A/1.mp3', {
      title: 'Shared One',
      artist: 'Artist A',
      albumArtist: 'Album Artist A',
      album: 'Album A',
      picture: { mimeType: 'image/jpeg', data: cover },
    });
    await writeTrack('Album A/2.mp3', {
      title: 'Shared Two',
      artist: 'Artist B',
      albumArtist: 'Album Artist A',
      album: 'Album A',
      picture: { mimeType: 'image/jpeg', data: cover },
    });
    await writeTrack('Album B/3.mp3', {
      title: 'Shared Three',
      artist: 'Artist C',
      albumArtist: 'Album Artist B',
      album: 'Album B',
      picture: { mimeType: 'image/jpeg', data: cover },
    });
    const { store } = await setup();

    await openBulkEditModal(
      store,
      ['/Album A/1.mp3', '/Album A/2.mp3'],
      'Shared One',
    );
    const headerArtwork = within(getDialog('Album A')).getByRole('img', {
      name: 'Album A artwork',
    });
    expect(headerArtwork.getAttribute('src')).toBe(
      `${getServer().baseUrl}/music/artwork?path=%2FAlbum%20A%2FFolder.jpg`,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    expect(
      (await screen.findAllByText('Album artwork')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('/Album A/')).toBeTruthy();
    // The per-file APIC section stays hidden — that is inherently one file.
    expect(screen.queryByText('Embedded in this file')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: /Set as Folder\.(jpg|png) artwork/,
      }),
    ).toBeNull();
    // …but the folder image is now editable, just like a single-track edit.
    expect(
      screen.getByRole('button', { name: /Change album artwork/ }),
    ).toBeTruthy();
    // Every track already carries the art, so nothing is left to embed.
    expect(screen.queryByRole('button', { name: 'Embed artwork' })).toBeNull();
  }, 30_000);

  it('offers a folder-wide embed from a co-located bulk selection', async () => {
    const cover = buildJpegBytes();
    await writeFolderArtwork(getServer(), '/Album A', cover);
    await writeTrack('Album A/1.mp3', {
      title: 'Bulk One',
      artist: 'Artist A',
      albumArtist: 'Album Artist A',
      album: 'Album A',
    });
    await writeTrack('Album A/2.mp3', {
      title: 'Bulk Two',
      artist: 'Artist B',
      albumArtist: 'Album Artist A',
      album: 'Album A',
    });
    await writeTrack('Album A/3.mp3', {
      title: 'Bulk Three',
      artist: 'Artist C',
      albumArtist: 'Album Artist A',
      album: 'Album A',
    });
    const { store } = await setup();

    // Select only two of the folder's three tracks.
    await openBulkEditModal(
      store,
      ['/Album A/1.mp3', '/Album A/2.mp3'],
      'Bulk One',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    const dialog = getDialog('Album A');
    expect(
      within(dialog).getByText(
        'The album artwork isn’t saved inside 3 tracks.',
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        await within(dialog).findByRole('button', { name: 'Embed artwork' }),
      );
    });

    // The banner clears once every folder track carries the art.
    await act(async () => {
      await waitForNetworkIdle();
    });
    expect(
      within(dialog).queryByRole('button', { name: 'Embed artwork' }),
    ).toBeNull();

    // The embed is folder-wide: the unselected third track gets the art too.
    for (const path of ['/Album A/1.mp3', '/Album A/2.mp3', '/Album A/3.mp3']) {
      expect(frameValue(await fetchTrackTags(path), 'APIC')).toBeDefined();
    }
  }, 30_000);

  it('keeps a cross-folder bulk selection preview-only', async () => {
    const cover = buildJpegBytes();
    await writeFolderArtwork(getServer(), '/Album A', cover);
    await writeTrack('Album A/1.mp3', {
      title: 'Cross One',
      artist: 'Artist A',
      album: 'Album A',
    });
    await writeTrack('Album B/2.mp3', {
      title: 'Cross Two',
      artist: 'Artist B',
      album: 'Album B',
    });
    const { store } = await setup();

    await openBulkEditModal(
      store,
      ['/Album A/1.mp3', '/Album B/2.mp3'],
      'Cross One',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    expect(await screen.findByText('Mixed folder artwork')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Change album artwork/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Add album artwork/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Embed artwork' })).toBeNull();
  }, 30_000);

  it('shows album artwork and a collapsible embedded row for a single track', async () => {
    const cover = buildJpegBytes();
    await writeFolderArtwork(getServer(), '/Album A', cover);
    await writeTrack('Album A/a.mp3', {
      title: 'Song A',
      artist: 'Artist A',
      album: 'Album A',
      picture: { mimeType: 'image/jpeg', data: cover },
    });
    await setup();

    await openEditModal('Song A');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    const dialog = getDialog('Song A');
    expect(within(dialog).getAllByText('Album artwork').length).toBeGreaterThan(
      0,
    );
    expect(within(dialog).getByText('/Album A/')).toBeTruthy();
    expect(await within(dialog).findByText(/Folder\.jpg.*240 KB/)).toBeTruthy();

    expect(
      await within(dialog).findByText('Embedded in this file'),
    ).toBeTruthy();
    expect(within(dialog).getByText(/image\/jpeg/)).toBeTruthy();
    expect(within(dialog).getByText('Embedded in ID3')).toBeTruthy();

    const toggle = within(dialog).getByRole('button', { expanded: false });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(within(dialog).getByRole('button', { expanded: true })).toBeTruthy();
    expect(within(dialog).getByText('Cover (front)')).toBeTruthy();
  }, 30_000);

  it('removes a track’s embedded artwork after a confirm click', async () => {
    const cover = buildJpegBytes();
    await writeFolderArtwork(getServer(), '/Album A', cover);
    await writeTrack('Album A/a.mp3', {
      title: 'Song A',
      artist: 'Artist A',
      album: 'Album A',
      picture: { mimeType: 'image/jpeg', data: cover },
    });
    await setup();

    await openEditModal('Song A');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    const dialog = getDialog('Song A');
    const toggle = await within(dialog).findByRole('button', {
      expanded: false,
    });
    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(
      within(dialog).getByRole('button', {
        name: 'Set as Folder.jpg artwork',
      }),
    ).toBeTruthy();

    // First click only arms the confirm; nothing is sent yet.
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    });
    expect(
      within(dialog).getByRole('button', { name: 'Click to confirm' }),
    ).toBeTruthy();
    expect(
      frameValue(await fetchTrackTags('/Album A/a.mp3'), 'APIC'),
    ).toBeDefined();

    // Second click performs the removal and the row drops away.
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Click to confirm' }),
      );
    });

    await waitFor(async () => {
      expect(
        frameValue(await fetchTrackTags('/Album A/a.mp3'), 'APIC'),
      ).toBeUndefined();
    });
    await waitFor(() =>
      expect(within(dialog).queryByText('Embedded in this file')).toBeNull(),
    );
    // The panel flips straight to the embed prompt; no reload round trip.
    expect(
      within(dialog).getByRole('button', { name: 'Embed artwork' }),
    ).toBeTruthy();
  }, 30_000);

  it('offers to embed the folder image into album tracks that lack it', async () => {
    const cover = buildJpegBytes();
    await writeFolderArtwork(getServer(), '/Album A', cover);
    await writeTrack('Album A/1.mp3', {
      title: 'Nested One',
      artist: 'Artist A',
      albumArtist: 'Album Artist A',
      album: 'Album A',
    });
    await writeTrack('Album A/2.mp3', {
      title: 'Nested Two',
      artist: 'Artist B',
      albumArtist: 'Album Artist A',
      album: 'Album A',
    });
    await setup();

    await openEditModal('Nested One');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });

    const dialog = getDialog('Nested One');
    const reason =
      'Embedding it keeps each file portable, so another player or app can ' +
      'show the artwork without this folder.';
    expect(await within(dialog).findByText(reason)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Embed artwork' }),
      );
    });

    // Both tracks now carry the artwork, so the prompt goes away…
    await act(async () => {
      await waitForNetworkIdle();
    });
    expect(within(dialog).queryByText(reason)).toBeNull();
    // …and it is really embedded on disk.
    for (const path of ['/Album A/1.mp3', '/Album A/2.mp3']) {
      expect(frameValue(await fetchTrackTags(path), 'APIC')).toBeDefined();
    }

    // The tab re-reads the track's tags, so the freshly embedded art shows up
    // under "Embedded in this file" instead of leaving the panel empty.
    expect(
      await within(dialog).findByText('Embedded in this file'),
    ).toBeTruthy();
  }, 30_000);

  it('re-arms the embed prompt immediately when the just-embedded art is removed', async () => {
    const cover = buildJpegBytes();
    await writeFolderArtwork(getServer(), '/Album A', cover);
    await writeTrack('Album A/only.mp3', {
      title: 'Only One',
      artist: 'Artist A',
      album: 'Album A',
    });
    await setup();

    await openEditModal('Only One');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }));
    });
    const dialog = getDialog('Only One');

    // Embed the folder art. The banner then unmounts (nothing left to embed).
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Embed artwork' }),
      );
    });
    const toggle = await within(dialog).findByRole('button', {
      expanded: false,
    });

    // Remove it right away; the embed prompt must come straight back.
    await act(async () => {
      fireEvent.click(toggle);
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    });
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Click to confirm' }),
      );
    });

    // The prompt comes back actionable — not stuck showing a stale "Embedded".
    const embedButton = await within(dialog).findByRole('button', {
      name: 'Embed artwork',
    });
    expect((embedButton as HTMLButtonElement).disabled).toBe(false);
  }, 30_000);
});
