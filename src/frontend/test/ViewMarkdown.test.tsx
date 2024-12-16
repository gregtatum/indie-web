import userEvent from '@testing-library/user-event';
import { createStore } from 'frontend/store/create-store';
import { AppRoutes } from 'frontend/components/App';
import {
  act,
  getByText,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import {
  mockDropboxAccessToken,
  mockDropboxFilesDownload,
  mockDropboxListFolder,
} from './utils/fixtures';
import { T, $, A } from 'frontend';
import { ensureExists } from 'frontend/utils';
import { stripIndent } from 'common-tags';
import { MemoryRouter } from 'react-router-dom';

const IdeasText = stripIndent`
# Great ideas

Come up with some great ideas.
 * Build something?
 * Learn to paint?
`;

describe('<ViewMarkdown>', () => {
  // TODO - This would be better across the entire test suite.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

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
      <MemoryRouter initialEntries={['/dropbox/md/Ideas.md']}>
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
                Come up with some great ideas.
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

  fit('can edit markdown files', async () => {
    const { store } = setup();
    const edit = await waitFor(() => screen.getByText(/Edit/));
    act(() => {
      edit.click();
    });
    const textAreaMount = screen.getByTestId('textAreaMount');
    const renderedMarkdown = screen.getByTestId('renderedMarkdown');

    const line = getByText(textAreaMount, /Come up with some great ideas\./);

    await act(async () => {
      const user = userEvent.setup();
      await Promise.all([user.click(line), jest.runAllTimersAsync()]);
      await Promise.all([user.keyboard('hello\n'), jest.runAllTimersAsync()]);
    });

    await waitFor(() => getByText(renderedMarkdown, /hello/));

    // The modified text is debounced
    jest.runAllTimers();

    expect($.getModifiedText(store.getState())).toMatchInlineSnapshot(`
      {
        "generation": 0,
        "text": "hello
      # Great ideas

      Come up with some great ideas.
       * Build something?
       * Learn to paint?",
      }
    `);
  });
});
