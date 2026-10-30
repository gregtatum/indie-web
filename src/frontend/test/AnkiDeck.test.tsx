import userEvent from '@testing-library/user-event';
import { createStore } from 'frontend/store/create-store';
import { AppRoutes } from 'frontend/components/App';
import { act, render, screen, waitFor } from '@testing-library/react';
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

const FrenchText = stripIndent`
  # French Vocabulary

  \`\`\`anki
  Hello;Bonjour
  Goodbye;Au revoir
  \`\`\`
`;

describe('<AnkiDeck>', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function setup() {
    const store = createStore();
    store.dispatch(A.changeFileStore('dropbox'));
    mockDropboxAccessToken(store);
    const listFiles = mockDropboxListFolder([
      { type: 'file', path: '/French.md' },
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
        metadata: getFileMetadata('/French.md'),
        text: FrenchText,
      },
    ]);

    const renderResults = render(
      <MemoryRouter initialEntries={['/dropbox/md/French.md']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    return { store, ...renderResults };
  }

  it('renders an anki block as cards with the answers hidden', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.queryByText('Bonjour')).toBeNull();
    expect(screen.queryByText('Au revoir')).toBeNull();
    expect(screen.getAllByText('Show answer')).toHaveLength(2);

    expect(screen.getByTestId('ankiDeck')).toMatchInlineSnapshot(`
      <div
        class="ankiDeck"
        data-testid="ankiDeck"
      >
        <div
          class="ankiDeckCard"
        >
          <div
            class="ankiDeckCardFront"
          >
            Hello
          </div>
          <button
            class="button ankiDeckCardReveal"
            type="button"
          >
            Show answer
          </button>
        </div>
        <div
          class="ankiDeckCard"
        >
          <div
            class="ankiDeckCardFront"
          >
            Goodbye
          </div>
          <button
            class="button ankiDeckCardReveal"
            type="button"
          >
            Show answer
          </button>
        </div>
      </div>
    `);
  });

  it('reveals a card answer independently of other cards', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    const [helloReveal] = screen.getAllByText('Show answer');
    await act(async () => {
      await Promise.all([user.click(helloReveal), jest.runAllTimersAsync()]);
    });

    expect(screen.getByText('Bonjour')).toBeTruthy();
    expect(screen.getByText('Hide answer')).toBeTruthy();

    // The second card is untouched.
    expect(screen.queryByText('Au revoir')).toBeNull();
    expect(screen.getByText('Show answer')).toBeTruthy();

    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Hide answer')),
        jest.runAllTimersAsync(),
      ]);
    });
    expect(screen.queryByText('Bonjour')).toBeNull();
    expect(screen.getAllByText('Show answer')).toHaveLength(2);
  });
});
