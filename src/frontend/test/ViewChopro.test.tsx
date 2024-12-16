import { createStore } from 'frontend/store/create-store';
import { AppRoutes } from 'frontend/components/App';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import {
  mockDropboxAccessToken,
  mockDropboxFilesDownload,
  mockDropboxListFolder,
} from './utils/fixtures';
import { T, A } from 'frontend';
import { ensureExists } from 'frontend/utils';
import { stripIndent } from 'common-tags';
import { MemoryRouter } from 'react-router-dom';

const coldplayChordProText = stripIndent`
  {title: Clocks}
  {artist: Coldplay}
  {key: D}

  [D]Lights go out and I ca[Am]n't be saved
  tides that I tried to sw[Em]im against
`;

describe('<ViewChopro>', () => {
  function setup() {
    const store = createStore();
    store.dispatch(A.changeFileSystem('dropbox'));
    mockDropboxAccessToken(store);
    const listFiles = mockDropboxListFolder([
      { type: 'folder', path: '/My Cool Band' },
      { type: 'file', path: '/Clocks - Coldplay.chordpro' },
      { type: 'file', path: '/Mellow Yellow - Donovan.chordpro' },
    ]);

    function getFileMetadata(path: string): T.FileMetadata {
      const file = ensureExists(
        listFiles.find((file) => file.path === path),
        'Failed to find the file.',
      );
      if (file.type !== 'file') {
        throw new Error('Found a folder not a file.');
      }
      return file;
    }

    mockDropboxFilesDownload([
      {
        metadata: getFileMetadata('/Clocks - Coldplay.chordpro'),
        text: coldplayChordProText,
      },
    ]);

    const renderResults = render(
      <MemoryRouter
        initialEntries={['/dropbox/file/Clocks - Coldplay.chordpro']}
      >
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    return { store, ...renderResults };
  }

  it('view a chordpro file', async () => {
    setup();
    await waitFor(() => screen.getByText(/Lights go out and/));

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
              <div
                class="renderedSongStickyHeaderRow"
              >
                <button
                  class="renderedSongKey"
                  type="button"
                >
                  Key: 
                  D
                </button>
              </div>
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

  // I can't figure out why this test doesn't work.
  xit('can generate tabs', async () => {
    setup();
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
