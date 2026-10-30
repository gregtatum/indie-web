import userEvent from '@testing-library/user-event';
import { createStore } from 'frontend/store/create-store';
import { AppRoutes } from 'frontend/components/App';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

const EightCardText = stripIndent`
  # French Vocabulary

  \`\`\`anki
  Hello;Bonjour
  Goodbye;Au revoir
  Thanks;Merci
  Please;S'il vous plaît
  Yes;Oui
  No;Non
  Good night;Bonne nuit
  Excuse me;Excusez-moi
  \`\`\`
`;

const ClozeText = stripIndent`
  # French Grammar

  \`\`\`anki
  #notetype:Cloze
  Je {{c1::suis::être}} étudiant.
  {{c1::Je}} {{c2::vais}} {{c3::à la gare}} demain matin.
  \`\`\`
`;

const InterleavedText = stripIndent`
  # French Study Notes

  Some vocabulary to start with.

  \`\`\`anki
  Hello;Bonjour
  \`\`\`

  Now some grammar practice with cloze sentences.

  \`\`\`anki
  #notetype:Cloze
  Je {{c1::suis::être}} étudiant.
  \`\`\`

  That's everything for today.
`;

describe('<AnkiDeck>', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function setup(text = FrenchText) {
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
        text,
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

  it('defaults to study mode, showing one card at a time with the answer hidden', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('Card 1 / 2')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.queryByText('Goodbye')).toBeNull();
    expect(screen.queryByText('Bonjour')).toBeNull();
    expect(screen.getByText('Show answer')).toBeTruthy();

    expect(screen.getByTestId('ankiDeck')).toMatchInlineSnapshot(`
      <div
        class="ankiDeck"
        data-testid="ankiDeck"
      >
        <button
          class="button ankiDeckModeToggle"
          type="button"
        >
          Show full list
        </button>
        <div
          class="ankiDeckCarousel"
          data-testid="ankiDeckCarousel"
          tabindex="0"
        >
          <div
            class="ankiDeckCarouselProgress"
          >
            Card 
            1
             / 
            2
          </div>
          <div
            aria-valuemax="1"
            aria-valuemin="0"
            aria-valuenow="1"
            class="ankiDeckCarouselBar"
            role="progressbar"
          >
            <div
              class="ankiDeckCarouselBarFill"
              style="width: 100%;"
            />
          </div>
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
            class="ankiDeckCarouselNav"
          >
            <button
              class="button"
              disabled=""
              type="button"
            >
              Previous
            </button>
            <button
              class="button"
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    `);
  });

  it('advances through cards one at a time, resetting the reveal state', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Show answer')),
        jest.runAllTimersAsync(),
      ]);
    });
    expect(screen.getByText('Bonjour')).toBeTruthy();

    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Next')),
        jest.runAllTimersAsync(),
      ]);
    });
    expect(screen.getByText('Card 2 / 2')).toBeTruthy();
    expect(screen.getByText('Goodbye')).toBeTruthy();
    // The new card starts with its answer hidden again.
    expect(screen.queryByText('Au revoir')).toBeNull();
    expect(screen.getByText('Show answer')).toBeTruthy();
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Previous')),
        jest.runAllTimersAsync(),
      ]);
    });
    expect(screen.getByText('Card 1 / 2')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect((screen.getByText('Previous') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('fills one bar segment per card, completing the bar on the last card', async () => {
    setup(EightCardText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    function progressBar() {
      return screen.getByRole('progressbar');
    }

    // 8 cards means 7 logical segments (the gaps between them).
    expect(progressBar().getAttribute('aria-valuemax')).toBe('7');

    // Card 1 of 8: the first segment is already filled.
    expect(progressBar().getAttribute('aria-valuenow')).toBe('1');

    const user = userEvent.setup();
    for (let card = 2; card <= 8; card++) {
      await act(async () => {
        await Promise.all([
          user.click(screen.getByText('Next')),
          jest.runAllTimersAsync(),
        ]);
      });
      // Card N fills segment N, capped at 7 — so card 8 (the last) completes
      // the bar instead of leaving a trailing empty segment.
      expect(progressBar().getAttribute('aria-valuenow')).toBe(
        String(Math.min(card, 7)),
      );
    }
  });

  it('reveals and advances with Space, but only while focus is inside the carousel', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();

    // Nothing is focused inside the carousel yet, so Space is a no-op.
    await act(async () => {
      await Promise.all([user.keyboard('[Space]'), jest.runAllTimersAsync()]);
    });
    expect(screen.queryByText('Bonjour')).toBeNull();

    await act(async () => {
      await Promise.all([
        user.click(screen.getByTestId('ankiDeckCarousel')),
        jest.runAllTimersAsync(),
      ]);
    });

    // First Space reveals the current card's answer.
    await act(async () => {
      await Promise.all([user.keyboard('[Space]'), jest.runAllTimersAsync()]);
    });
    expect(screen.getByText('Bonjour')).toBeTruthy();
    expect(screen.getByText('Card 1 / 2')).toBeTruthy();

    // A second Space, with the answer already shown, advances to the next card.
    await act(async () => {
      await Promise.all([user.keyboard('[Space]'), jest.runAllTimersAsync()]);
    });
    expect(screen.getByText('Card 2 / 2')).toBeTruthy();
    expect(screen.queryByText('Au revoir')).toBeNull();
  });

  it('navigates cards with the ArrowLeft/ArrowRight keys', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await act(async () => {
      await Promise.all([
        user.click(screen.getByTestId('ankiDeckCarousel')),
        jest.runAllTimersAsync(),
      ]);
    });

    await act(async () => {
      await Promise.all([
        user.keyboard('[ArrowRight]'),
        jest.runAllTimersAsync(),
      ]);
    });
    expect(screen.getByText('Card 2 / 2')).toBeTruthy();

    await act(async () => {
      await Promise.all([
        user.keyboard('[ArrowLeft]'),
        jest.runAllTimersAsync(),
      ]);
    });
    expect(screen.getByText('Card 1 / 2')).toBeTruthy();
  });

  it('switches to the full list view and back to study mode', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Show full list')),
        jest.runAllTimersAsync(),
      ]);
    });

    // Both cards are visible at once, in the full list view.
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.getAllByText('Show answer')).toHaveLength(2);
    expect(screen.queryByText(/Card \d \/ \d/)).toBeNull();

    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Study mode')),
        jest.runAllTimersAsync(),
      ]);
    });

    // Back in study mode, the carousel starts over from the first card.
    expect(screen.getByText('Card 1 / 2')).toBeTruthy();
    expect(screen.queryByText('Goodbye')).toBeNull();
  });

  it('renders cloze blanks hidden, using the hint as a placeholder', async () => {
    setup(ClozeText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('Card 1 / 2')).toBeTruthy();
    expect(screen.getByText('[être]')).toBeTruthy();
    expect(screen.queryByText('suis')).toBeNull();
    expect(screen.queryByText('[...]')).toBeNull();
    expect(screen.getByText(/étudiant\./)).toBeTruthy();
  });

  it('reveals a cloze blank independently by number, resetting on the next card', async () => {
    setup(ClozeText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('[être]')),
        jest.runAllTimersAsync(),
      ]);
    });
    expect(screen.getByText('suis')).toBeTruthy();
    expect(screen.queryByText('[être]')).toBeNull();

    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Next')),
        jest.runAllTimersAsync(),
      ]);
    });

    // The second card's blanks are independent, and start out hidden.
    expect(screen.getByText('Card 2 / 2')).toBeTruthy();
    expect(screen.getAllByText('[...]')).toHaveLength(3);

    const [firstBlank] = screen.getAllByText('[...]');
    await act(async () => {
      await Promise.all([user.click(firstBlank), jest.runAllTimersAsync()]);
    });
    expect(screen.getByText('Je')).toBeTruthy();
    expect(screen.getAllByText('[...]')).toHaveLength(2);
  });

  it('renders multiple anki blocks interleaved with regular markdown text', async () => {
    setup(InterleavedText);
    await waitFor(() => screen.getAllByTestId('ankiDeck'));

    // The surrounding markdown text rendered, in order, around both blocks.
    expect(screen.getByText('Some vocabulary to start with.')).toBeTruthy();
    expect(
      screen.getByText('Now some grammar practice with cloze sentences.'),
    ).toBeTruthy();
    expect(screen.getByText("That's everything for today.")).toBeTruthy();

    const decks = screen.getAllByTestId('ankiDeck');
    expect(decks).toHaveLength(2);
    const [basicDeck, clozeDeck] = decks;

    // The first block only has the Basic card's content.
    expect(within(basicDeck).getByText('Hello')).toBeTruthy();
    expect(within(basicDeck).getByText('Show answer')).toBeTruthy();
    expect(within(basicDeck).queryByText('[être]')).toBeNull();

    // The second block only has the Cloze card's content.
    expect(within(clozeDeck).getByText('[être]')).toBeTruthy();
    expect(within(clozeDeck).queryByText('Hello')).toBeNull();
    expect(within(clozeDeck).queryByText('Show answer')).toBeNull();
  });
});
