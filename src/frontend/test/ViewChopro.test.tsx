import userEvent from '@testing-library/user-event';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { stripIndent } from 'common-tags';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { T, A, $ } from 'frontend';
import { ensureExists } from 'frontend/utils';
import {
  mockDropboxAccessToken,
  mockDropboxFilesDownload,
  mockDropboxListFolder,
} from './utils/fixtures';

const coldplayChordProText = stripIndent`
  {title: Clocks}
  {artist: Coldplay}
  {key: D}

  [D]Lights go out and I ca[Am]n't be saved
  tides that I tried to sw[Em]im against
`;

const kokomoChordProText = stripIndent`
  {title: Kokomo}
  {artist: Beach Boys}
  {key: C}

  Ar[C]uba, Jamaica, ooh I wanna take ya
  Ber[F]muda, Bahama, come on pretty mama
  Key [C]Largo, Montego, baby why don't we go, Ja[F]maica
  Off the Florida [C]Keys[Cmaj7]
  [Gm7]   There's a place called [F]Kokomo
  [Fm]   That's where you [C]wanna go to get aw[D7]ay from it all[G7]
  [C]  Bodies in the [Cmaj7]sand
  [Gm7]  Tropical drink melting [F]in your hand
  [Fm]  We'll be falling in [C]love to the rhythm of a [D7]steel drum band
  [G7]  Down in Kokom[C]o
`;

describe('<ViewChopro>', () => {
  function setupColdplay() {
    return setup({
      text: coldplayChordProText,
      path: '/Clocks - Coldplay.chordpro',
      siblingPath: '/Mellow Yellow - Donovan.chordpro',
    });
  }

  function setup({
    text,
    path,
    siblingPath,
  }: {
    text: string;
    path: string;
    siblingPath?: string;
  }) {
    const store = createStore();
    store.dispatch(A.changeFileStore('dropbox'));
    mockDropboxAccessToken(store);
    const files = [
      { type: 'folder' as const, path: '/My Cool Band' },
      { type: 'file' as const, path },
    ];
    if (siblingPath) {
      files.push({ type: 'file' as const, path: siblingPath });
    }
    const listFiles = mockDropboxListFolder(files);

    function getFileMetadata(filePath: string): T.FileMetadata {
      const file = ensureExists(
        listFiles.find((item) => item.path === filePath),
        'Failed to find the file.',
      );
      if (file.type !== 'file') {
        throw new Error('Found a folder not a file.');
      }
      return file;
    }

    mockDropboxFilesDownload([
      {
        metadata: getFileMetadata(path),
        text,
      },
    ]);

    const renderResults = render(
      <MemoryRouter initialEntries={[`/dropbox/file${path}`]}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    function getSongText() {
      return screen
        .getAllByTestId('renderedSongLine')
        .map((line) => line.textContent)
        .join('\n');
    }

    return { store, getSongText, ...renderResults };
  }

  it('view a chordpro file', async () => {
    setupColdplay();
    await screen.findByText(/Lights go out and/, {
      selector: 'span.renderedSongLineText',
    });

    expect(screen.getByTestId('viewChopro')).toMatchInlineSnapshot(`
      <div
        class="splitterSolo viewChoproSolo"
        data-testid="viewChopro"
      >
        <div
          class="renderedSong"
          data-fullscreen="true"
          data-testid="renderedSong"
        >
          <a
            aria-label="Next"
            class="nextPrev nextPrevNext"
            href="/dropbox/file/Mellow Yellow - Donovan.chordpro"
            title="Mellow Yellow - Donovan.chordpro"
            type="button"
          />
          <div
            class="renderedSongStickyHeader"
          >
            <div
              class="renderedSongStickyHeaderRow"
            >
              <span>
                Key: 
                D
              </span>
            </div>
            <button
              class="button"
              type="button"
            >
              Edit
            </button>
          </div>
          <div
            class="renderedSongHeader"
          >
            <div
              class="renderedSongHeaderTitle"
            >
              <h1>
                Clocks
                 
                <a
                  class="button renderedSongHeaderSpotify"
                  href="https://open.spotify.com/search/Clocks"
                  rel="noreferrer"
                  target="_blank"
                >
                  Spotify
                </a>
              </h1>
              <h2>
                Coldplay
              </h2>
            </div>
          </div>
          <div
            class="renderedSongSpace"
          />
          <div
            class="renderedSongLine renderedSongLine-mixed"
            data-line-index="4"
            data-testid="renderedSongLine"
          >
            <span
              class="renderedSongLineText"
            />
            <span
              class="renderedSongLineChord"
            >
              <span
                class="renderedSongLineChordText"
              >
                D
              </span>
              <span
                class="renderedSongLineChordExtras"
              />
            </span>
            <span
              class="renderedSongLineText"
            >
              Lights go out and I ca
            </span>
            <span
              class="renderedSongLineChord"
            >
              <span
                class="renderedSongLineChordText"
              >
                Am
              </span>
              <span
                class="renderedSongLineChordExtras"
              />
            </span>
            <span
              class="renderedSongLineText"
            >
              n't be saved
            </span>
          </div>
          <div
            class="renderedSongLine renderedSongLine-mixed"
            data-line-index="5"
            data-testid="renderedSongLine"
          >
            <span
              class="renderedSongLineText"
            >
              tides that I tried to sw
            </span>
            <span
              class="renderedSongLineChord"
            >
              <span
                class="renderedSongLineChordText"
              >
                Em
              </span>
              <span
                class="renderedSongLineChordExtras"
              />
            </span>
            <span
              class="renderedSongLineText"
            >
              im against
            </span>
          </div>
          <div
            class="renderedSongEndPadding"
          />
        </div>
      </div>
    `);
  });

  it('updates song info directives from the UI', async () => {
    const { store } = setupColdplay();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText(/Lights go out and/));

    const editButton = screen.queryByRole('button', { name: 'Edit' });
    if (editButton) {
      await act(async () => {
        await user.click(editButton);
      });
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Song Info' }));
    });

    const artistInput = screen.getByLabelText<HTMLInputElement>('Artist');
    const subtitleInput = screen.getByLabelText<HTMLInputElement>('Subtitle');

    await act(async () => {
      await user.clear(artistInput);
    });
    await act(async () => {
      await user.type(subtitleInput, 'Live');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.artist).toBeUndefined();
      expect(directives?.subtitle).toBe('Live');

      const songText = $.getActiveFileText(store.getState());
      expect(songText.split(/\r?\n/).slice(0, 4)).toEqual([
        '{title: Clocks}',
        '{subtitle: Live}',
        '{key: D}',
        '',
      ]);
    });
  });

  it('removes directives when cleared in the UI', async () => {
    const { store } = setupColdplay();
    const user = userEvent.setup();
    await screen.findByText(/Lights go out and/, {
      selector: 'span.renderedSongLineText',
    });

    const editButton = screen.queryByRole('button', { name: 'Edit' });
    if (editButton) {
      await act(async () => {
        await user.click(editButton);
      });
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Song Info' }));
    });

    const subtitleInput = screen.getByLabelText<HTMLInputElement>('Subtitle');

    await act(async () => {
      await user.type(subtitleInput, 'Live');
    });
    await act(async () => {
      await user.clear(subtitleInput);
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.subtitle).toBeUndefined();

      const songText = $.getActiveFileText(store.getState());
      expect(songText.split(/\r?\n/).slice(0, 4)).toEqual([
        '{title: Clocks}',
        '{artist: Coldplay}',
        '{key: D}',
        '',
      ]);
    });
  });

  it('clears transpose when key matches the transposed key', async () => {
    const { store } = setupColdplay();
    const user = userEvent.setup();
    await screen.findByText(/Lights go out and/, {
      selector: 'span.renderedSongLineText',
    });

    const editButton = screen.queryByRole('button', { name: 'Edit' });
    if (editButton) {
      await act(async () => {
        await user.click(editButton);
      });
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Song Info' }));
    });

    const transposeSelect =
      screen.getByLabelText<HTMLSelectElement>('Transpose');
    await act(async () => {
      await user.selectOptions(transposeSelect, 'F');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.transpose).toBe('F');

      const songText = $.getActiveFileText(store.getState());
      expect(songText.split(/\r?\n/).slice(0, 5)).toEqual([
        '{title: Clocks}',
        '{artist: Coldplay}',
        '{key: D}',
        '{transpose: F}',
        '',
      ]);
    });

    const keySelect = screen.getByLabelText<HTMLSelectElement>('Key');
    await act(async () => {
      await user.selectOptions(keySelect, 'F');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.transpose).toBeUndefined();
    });
  });

  it('hides transpose dropdown when no key directive exists', async () => {
    const { store } = setupColdplay();
    const user = userEvent.setup();
    await screen.findByText(/Lights go out and/, {
      selector: 'span.renderedSongLineText',
    });

    const editButton = screen.queryByRole('button', { name: 'Edit' });
    if (editButton) {
      await act(async () => {
        await user.click(editButton);
      });
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Song Info' }));
    });

    const keySelect = screen.getByLabelText<HTMLSelectElement>('Key');
    await act(async () => {
      await user.selectOptions(keySelect, '');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.key).toBeUndefined();
    });

    expect(screen.queryByLabelText('Transpose')).toBeNull();
  });

  it('updates the key directive from the dropdown', async () => {
    const { store } = setupColdplay();
    const user = userEvent.setup();
    await screen.findByText(/Lights go out and/, {
      selector: 'span.renderedSongLineText',
    });

    const editButton = screen.queryByRole('button', { name: 'Edit' });
    if (editButton) {
      await act(async () => {
        await user.click(editButton);
      });
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Song Info' }));
    });

    const keySelect = screen.getByLabelText<HTMLSelectElement>('Key');
    await act(async () => {
      await user.selectOptions(keySelect, 'D');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.key).toBe('D');

      const songText = $.getActiveFileText(store.getState());
      expect(songText.split(/\r?\n/).slice(0, 4)).toEqual([
        '{title: Clocks}',
        '{artist: Coldplay}',
        '{key: D}',
        '',
      ]);
    });
  });

  it('updates the capo directive from the dropdown', async () => {
    const { store } = setupColdplay();
    const user = userEvent.setup();
    await screen.findByText(/Lights go out and/, {
      selector: 'span.renderedSongLineText',
    });

    const editButton = screen.queryByRole('button', { name: 'Edit' });
    if (editButton) {
      await act(async () => {
        await user.click(editButton);
      });
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Song Info' }));
    });

    const capoSelect = screen.getByLabelText<HTMLSelectElement>('Capo');
    await act(async () => {
      await user.selectOptions(capoSelect, '5');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.capo).toBe('5');

      const songText = $.getActiveFileText(store.getState());
      expect(songText.split(/\r?\n/).slice(0, 5)).toEqual([
        '{title: Clocks}',
        '{artist: Coldplay}',
        '{key: D}',
        '{capo: 5}',
        '',
      ]);
    });
  });

  it('clears transpose when adding a key to match the transposed key', async () => {
    const { store } = setupColdplay();
    const user = userEvent.setup();
    await screen.findByText(/Lights go out and/, {
      selector: 'span.renderedSongLineText',
    });

    const editButton = screen.queryByRole('button', { name: 'Edit' });
    if (editButton) {
      await act(async () => {
        await user.click(editButton);
      });
    }
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Song Info' }));
    });

    const keySelect = screen.getByLabelText<HTMLSelectElement>('Key');
    await act(async () => {
      await user.selectOptions(keySelect, '');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.key).toBeUndefined();
    });

    await act(async () => {
      await user.selectOptions(keySelect, 'C');
    });
    await act(async () => {
      await user.selectOptions(
        screen.getByLabelText<HTMLSelectElement>('Transpose'),
        'F',
      );
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.transpose).toBe('F');
    });

    await act(async () => {
      await user.selectOptions(keySelect, 'F');
    });

    await waitFor(() => {
      const directives = $.getActiveFileParsedOrNull(
        store.getState(),
      )?.directives;
      expect(directives?.transpose).toBeUndefined();
    });
  });

  it('renders the song display as text', async () => {
    const { getSongText } = setup({
      text: kokomoChordProText,
      path: '/Kokomo - Beach Boys.chordpro',
    });
    await waitFor(() => {
      screen.findByText(/Aruba/);
    });

    expect(getSongText()).toMatchInlineSnapshot(`
      "ArCuba, Jamaica, ooh I wanna take ya
      BerFmuda, Bahama, come on pretty mama
      Key CLargo, Montego, baby why don't we go, JaFmaica
      Off the Florida CKeysCmaj7
      Gm7   There's a place called FKokomo
      Fm   That's where you Cwanna go to get awD7ay from it allG7
      C  Bodies in the Cmaj7sand
      Gm7  Tropical drink melting Fin your hand
      Fm  We'll be falling in Clove to the rhythm of a D7steel drum band
      G7  Down in KokomCo"
    `);
  });

  it('renders the song display as text after transpose', async () => {
    const { getSongText } = setup({
      text: stripIndent`
        {transpose: D}
        ${kokomoChordProText}
      `,
      path: '/Kokomo - Beach Boys (Transpose).chordpro',
    });
    await waitFor(() => {
      screen.findByText(/Aruba/);
    });

    expect(getSongText()).toMatchInlineSnapshot(`
      "ArDuba, Jamaica, ooh I wanna take ya
      BerGmuda, Bahama, come on pretty mama
      Key DLargo, Montego, baby why don't we go, JaGmaica
      Off the Florida DKeysDmaj7
      Am7   There's a place called GKokomo
      Gm   That's where you Dwanna go to get awE7ay from it allA7
      D  Bodies in the Dmaj7sand
      Am7  Tropical drink melting Gin your hand
      Gm  We'll be falling in Dlove to the rhythm of a E7steel drum band
      A7  Down in KokomDo"
    `);
  });

  it('renders the song display as text after capo', async () => {
    const { getSongText } = setup({
      text: stripIndent`
        {capo: 2}
        ${kokomoChordProText}
      `,
      path: '/Kokomo - Beach Boys (Capo).chordpro',
    });
    await waitFor(() => {
      screen.findByText(/Aruba/);
    });

    expect(getSongText()).toMatchInlineSnapshot(`
      "ArBbuba, Jamaica, ooh I wanna take ya
      BerEbmuda, Bahama, come on pretty mama
      Key BbLargo, Montego, baby why don't we go, JaEbmaica
      Off the Florida BbKeysBbmaj7
      Fm7   There's a place called EbKokomo
      Ebm   That's where you Bbwanna go to get awC7ay from it allF7
      Bb  Bodies in the Bbmaj7sand
      Fm7  Tropical drink melting Ebin your hand
      Ebm  We'll be falling in Bblove to the rhythm of a C7steel drum band
      F7  Down in KokomBbo"
    `);
  });

  it('renders the song display as text after capo and transpose', async () => {
    const { getSongText } = setup({
      text: stripIndent`
        {transpose: D}
        {capo: 2}
        ${kokomoChordProText}
      `,
      path: '/Kokomo - Beach Boys (Capo + Transpose).chordpro',
    });
    await waitFor(() => {
      screen.findByText(/Aruba/);
    });

    expect(getSongText()).toMatchInlineSnapshot(`
      "ArCuba, Jamaica, ooh I wanna take ya
      BerFmuda, Bahama, come on pretty mama
      Key CLargo, Montego, baby why don't we go, JaFmaica
      Off the Florida CKeysCmaj7
      Gm7   There's a place called FKokomo
      Fm   That's where you Cwanna go to get awD7ay from it allG7
      C  Bodies in the Cmaj7sand
      Gm7  Tropical drink melting Fin your hand
      Fm  We'll be falling in Clove to the rhythm of a D7steel drum band
      G7  Down in KokomCo"
    `);
  });

  it('renders the song display as text with Nashville chords', async () => {
    const { getSongText } = setup({
      text: stripIndent`
        {chords: nashville}
        ${kokomoChordProText}
      `,
      path: '/Kokomo - Beach Boys (Nashville).chordpro',
    });
    await waitFor(() => {
      screen.findByText(/Aruba/);
    });

    expect(getSongText()).toMatchInlineSnapshot(`
      "Ar1uba, Jamaica, ooh I wanna take ya
      Ber4muda, Bahama, come on pretty mama
      Key 1Largo, Montego, baby why don't we go, Ja4maica
      Off the Florida 1Keys1maj7
      5m7   There's a place called 4Kokomo
      4m   That's where you 1wanna go to get aw27ay from it all57
      1  Bodies in the 1maj7sand
      5m7  Tropical drink melting 4in your hand
      4m  We'll be falling in 1love to the rhythm of a 27steel drum band
      57  Down in Kokom1o"
    `);
  });

  it('renders the song display as text with Roman numerals', async () => {
    const { getSongText } = setup({
      text: stripIndent`
        {chords: roman}
        ${kokomoChordProText}
      `,
      path: '/Kokomo - Beach Boys (Roman).chordpro',
    });
    await waitFor(() => {
      screen.findByText(/Aruba/);
    });

    expect(getSongText()).toMatchInlineSnapshot(`
      "ArIuba, Jamaica, ooh I wanna take ya
      BerIVmuda, Bahama, come on pretty mama
      Key ILargo, Montego, baby why don't we go, JaIVmaica
      Off the Florida IKeysI△
      v7   There's a place called IVKokomo
      iv   That's where you Iwanna go to get awII7ay from it allV7
      I  Bodies in the I△sand
      v7  Tropical drink melting IVin your hand
      iv  We'll be falling in Ilove to the rhythm of a II7steel drum band
      V7  Down in KokomIo"
    `);
  });

  // I can't figure out why this test doesn't work.
  xit('can generate tabs', async () => {
    setupColdplay();
    await waitFor(() => screen.getByText(/Lights go out and/));

    const getSong = () =>
      screen
        .getAllByTestId('renderedSongLine')
        .map((line) => line.textContent)
        .join('\n');

    expect(getSong()).toMatchInlineSnapshot(`
      "DLights go out and I caAmn't be saved
      tides that I tried to swEmim against"
    `);

    const key = screen.getByText(/Key: D/);
    fireEvent.click(key);

    const transpose = screen.getByText(/Transpose/);
    fireEvent.click(transpose);

    const d = screen.getByRole<HTMLOptionElement>('option', { name: 'D' });
    expect(d.selected).toBeTruthy();

    const select = screen.getByLabelText<HTMLSelectElement>(/Transpose:/);
    fireEvent.change(select, {
      target: { value: 'Eb' },
    });

    // TODO - This should re-render React here, but it doesn't. The store event fires.

    await screen.findByText('Dm');
    const eb = screen.getByRole<HTMLOptionElement>('option', { name: 'Eb' });
    expect(eb.selected).toBeTruthy();

    expect(getSong()).toMatchInlineSnapshot(`
      "EbLights go out and I caBbmn't be saved
      tides that I tried to swDmim against"
    `);
  });
});
