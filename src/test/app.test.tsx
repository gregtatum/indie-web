import { createStore } from 'src/store/create-store';
import { App } from 'src/components/App';
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import {
  mockDropboxAccessToken,
  mockDropboxFilesDownload,
  mockDropboxListFolder,
} from './fixtures';

describe('app', () => {
  it('can render', async () => {
    const store = createStore();
    const { container } = render(
      <Provider store={store as any}>
        <App />
      </Provider>,
    );

    await waitFor(() => screen.getByText(/Browser Chords/));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('can list files', async () => {
    const store = createStore();
    mockDropboxAccessToken(store);
    mockDropboxListFolder([
      { type: 'folder', path: '/My Cool Band' },
      { type: 'file', path: '/Clocks - Coldplay.chordpro' },
      { type: 'file', path: '/Mellow Yellow - Donovan.chordpro' },
    ]);
    mockDropboxFilesDownload([]);

    render(
      <Provider store={store as any}>
        <App />
      </Provider>,
    );

    await waitFor(() => screen.getByText(/Coldplay/));
    await waitFor(() => screen.getByText(/Mellow Yellow/));

    const listFiles = screen.getByTestId('list-files');

    expect(listFiles).toMatchInlineSnapshot(`
      <div
        class="listFiles"
        data-testid="list-files"
      >
        <div
          class="listFilesFilter"
        >
          <input
            class="listFilesFilterInput"
            placeholder="Filter files"
            type="text"
          />
        </div>
        <div
          class="listFilesList"
        >
          <div
            class="listFilesFile"
          >
            <a
              class="listFilesFileLink"
              href="/folder/My Cool Band"
            >
              <span
                class="listFilesIcon"
              >
                📁
              </span>
              <span
                class="listFileDisplayName"
              >
                My Cool Band
              </span>
            </a>
            <button
              aria-label="File Menu"
              class="listFilesFileMenu"
              type="button"
            >
              <span
                class="listFilesFileMenuIcon"
              />
            </button>
          </div>
          <div
            class="listFilesFile"
          >
            <a
              class="listFilesFileLink"
              href="/file/Clocks - Coldplay.chordpro"
            >
              <span
                class="listFilesIcon"
              >
                🎵
              </span>
              <span
                class="listFileDisplayName"
              >
                Clocks - Coldplay
                .
                <span
                  class="listFilesExtension"
                >
                  chordpro
                </span>
              </span>
            </a>
            <button
              aria-label="File Menu"
              class="listFilesFileMenu"
              type="button"
            >
              <span
                class="listFilesFileMenuIcon"
              />
            </button>
          </div>
          <div
            class="listFilesFile"
          >
            <a
              class="listFilesFileLink"
              href="/file/Mellow Yellow - Donovan.chordpro"
            >
              <span
                class="listFilesIcon"
              >
                🎵
              </span>
              <span
                class="listFileDisplayName"
              >
                Mellow Yellow - Donovan
                .
                <span
                  class="listFilesExtension"
                >
                  chordpro
                </span>
              </span>
            </a>
            <button
              aria-label="File Menu"
              class="listFilesFileMenu"
              type="button"
            >
              <span
                class="listFilesFileMenuIcon"
              />
            </button>
          </div>
          <button
            class="button listFilesCreate"
            type="button"
          >
            Create ChordPro File
          </button>
        </div>
      </div>
    `);
  });
});
