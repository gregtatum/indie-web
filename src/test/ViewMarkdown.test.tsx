import { createStore } from 'src/store/create-store';
import { AppRoutes } from 'src/components/App';
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import {
  mockDropboxAccessToken,
  mockDropboxFilesDownload,
  mockDropboxListFolder,
} from './utils/fixtures';
import { T, A } from 'src';
import { ensureExists } from 'src/utils';
import { stripIndent } from 'common-tags';
import { MemoryRouter } from 'react-router-dom';

const IdeasText = stripIndent`
# Great ideas

TODO - Come up with some great ideas.
 * Build something?
 * Learn to paint?
`;

describe('<ViewMarkdown>', () => {
  function setup() {
    const store = createStore();
    store.dispatch(A.changeFileSystem('dropbox'));
    mockDropboxAccessToken(store);
    const listFiles = mockDropboxListFolder([
      { type: 'folder', path: '/My Cool Notes' },
      { type: 'file', path: '/Ideas.md' },
      { type: 'file', path: '/Groceries.md' },
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
        metadata: getFileMetadata('/Ideas.md'),
        text: IdeasText,
      },
    ]);

    const renderResults = render(
      <MemoryRouter initialEntries={['/md/Ideas.md']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    return { store, ...renderResults };
  }

  it('view a markdown file', async () => {
    setup();
    await waitFor(() => screen.getByText(/Great ideas/));

    expect(screen.getByTestId('viewMarkdown')).toMatchInlineSnapshot(`
      <div
        class="splitterSolo"
        data-fullscreen="true"
        data-testid="viewMarkdown"
      >
        <div
          class="viewMarkdown"
        >
          <div
            class="viewMarkdownContainer"
          >
            <div
              class="viewMarkdownStickyHeader"
            >
              <button
                class="button"
                type="button"
              >
                Edit
              </button>
            </div>
            <div
              class="viewMarkdownDiv"
            >
              <h1>
                Great ideas
              </h1>
              <p>
                TODO - Come up with some great ideas.
              </p>
              <ul>
                

                <li>
                  Build something?
                </li>
                

                <li>
                  Learn to paint?
                </li>
                

              </ul>
            </div>
          </div>
        </div>
      </div>
    `);
  });
});
