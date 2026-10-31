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
import { ensureExists, dedent } from 'frontend/utils';
import { MemoryRouter } from 'react-router-dom';

const fence = '```';

const FrenchText = dedent`
  # French Vocabulary

  ${fence}anki
  Hello;Bonjour
  Goodbye;Au revoir
  ${fence}
`;

const EightCardText = dedent`
  # French Vocabulary

  ${fence}anki
  Hello;Bonjour
  Goodbye;Au revoir
  Thanks;Merci
  Please;S'il vous plaît
  Yes;Oui
  No;Non
  Good night;Bonne nuit
  Excuse me;Excusez-moi
  ${fence}
`;

const ClozeText = dedent`
  # French Grammar

  ${fence}anki
  #notetype:Cloze
  Je {{c1::suis::être}} étudiant.
  {{c1::Je}} {{c2::vais}} {{c3::à la gare}} demain matin.
  ${fence}
`;

const EmptyText = dedent`
  # French Vocabulary

  ${fence}anki
  ${fence}
`;

const InterleavedText = dedent`
  # French Study Notes

  Some vocabulary to start with.

  ${fence}anki
  Hello;Bonjour
  ${fence}

  Now some grammar practice with cloze sentences.

  ${fence}anki
  #notetype:Cloze
  Je {{c1::suis::être}} étudiant.
  ${fence}

  That's everything for today.
`;

describe('<AnkiDeck>', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  type User = ReturnType<typeof userEvent.setup>;

  async function click(user: User, name: string) {
    await act(async () => {
      await Promise.all([
        user.click(screen.getByRole('button', { name })),
        jest.runAllTimersAsync(),
      ]);
    });
  }

  async function press(user: User, keys: string) {
    await act(async () => {
      await Promise.all([user.keyboard(keys), jest.runAllTimersAsync()]);
    });
  }

  function barFill() {
    const bar = screen.getByRole('progressbar');
    const fraction = (name: string) =>
      Number(bar.style.getPropertyValue(name)) || 0;
    return `solid ${fraction('--mastered')} dashed ${fraction('--retry')}`;
  }

  it('renders a separate deck for each #deck section', async () => {
    setup(dedent`
      # French

      ${fence}anki
      #deck:French Verbs
      acheter;to buy
      aider;to help

      #deck:French Nouns
      maison;house
      ${fence}
    `);
    await waitFor(() => screen.getAllByTestId('ankiDeck'));

    const decks = screen.getAllByTestId('ankiDeck');
    expect(
      decks.map((deck) => deck.textContent?.match(/\d \/ \d/)?.[0]),
    ).toEqual(['1 / 2', '1 / 1']);
  });

  it('defaults to study mode, showing one card at a time with the answer hidden', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.queryByText('Goodbye')).toBeNull();
    expect(screen.getByText('Bonjour').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();

    expect(screen.getByTestId('ankiDeck')).toMatchInlineSnapshot(`
      <div
        class="ankiDeck"
        data-mode="study"
        data-testid="ankiDeck"
        tabindex="0"
      >
        <div
          class="ankiDeckCarouselTop"
        >
          <div
            class="ankiDeckCarouselInfo"
          >
            <button
              class="button ankiDeckModeToggle"
              type="button"
            >
              Show all
            </button>
            <label
              class="ankiDeckCarouselRandom"
            >
              <input
                checked=""
                type="checkbox"
              />
              Random
            </label>
          </div>
          <div
            aria-label="Card controls"
            class="ankiDeckCarouselNav"
            role="toolbar"
          >
            <button
              class="button ankiDeckCarouselShowNext"
              tabindex="0"
              type="button"
            >
              Show
            </button>
          </div>
        </div>
        <div
          class="ankiDeckCarouselProgressRow"
        >
          <div
            class="ankiDeckCarouselProgress"
          >
            1
             / 
            2
          </div>
          <div
            aria-valuemax="2"
            aria-valuemin="0"
            aria-valuenow="0"
            class="ankiDeckCarouselBar"
            role="progressbar"
            style="--mastered: 0; --retry: 0;"
          >
            <div
              class="ankiDeckCarouselFill"
              data-fill="mastered"
            />
            <div
              class="ankiDeckCarouselFill"
              data-fill="retry"
            />
          </div>
        </div>
        <div
          class="ankiDeckCarouselStage"
        >
          <div
            class="ankiDeckCard ankiDeckCardStage"
          >
            <div
              class="ankiDeckCardFront"
            >
              Hello
            </div>
            <div
              aria-hidden="true"
              class="ankiDeckCardBack"
            >
              Bonjour
            </div>
          </div>
        </div>
      </div>
    `);
  });

  it('grades a card to advance to the next one with its answer hidden', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await click(user, 'Show');
    expect(screen.getByText('Bonjour')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();

    await click(user, 'Wrong');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.getByText('Au revoir').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
    expect(barFill()).toBe('solid 0 dashed 0.5');
  });

  it('masters a card right away when first answered right, but sends a missed card to the far right until it is the last one left', async () => {
    jest.setSystemTime(new Date(0));
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const progressBar = () => screen.getByRole('progressbar');
    const user = userEvent.setup();

    expect(progressBar().getAttribute('aria-valuemax')).toBe('2');
    expect(progressBar().getAttribute('aria-valuenow')).toBe('0');
    expect(barFill()).toBe('solid 0 dashed 0');

    async function grade(name: 'Right' | 'Wrong') {
      await click(user, 'Show');
      await click(user, name);
    }

    await grade('Wrong');
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(barFill()).toBe('solid 0 dashed 0.5');

    await grade('Right');
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(progressBar().getAttribute('aria-valuenow')).toBe('1');
    expect(barFill()).toBe('solid 0.5 dashed 0.5');

    // A missed card needs two rights in a row, unless it's the only one left.
    jest.setSystemTime(new Date(75_000));
    await grade('Right');
    expect(progressBar().getAttribute('aria-valuenow')).toBe('2');
    // Cards that needed a repeat stay hatched on the finished bar.
    expect(barFill()).toBe('solid 1 dashed 0');

    const stats = Object.fromEntries(
      Array.from(document.querySelectorAll('.ankiDeckSummaryStats > div')).map(
        (stat) => [
          stat.querySelector('dt')?.textContent,
          stat.querySelector('dd')?.textContent,
        ],
      ),
    );
    expect(stats).toEqual({
      'First try': '1 of 2 (50%)',
      Answers: '3',
      Time: '1:15',
      'Per answer': '25.0s',
    });
    const rows = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows.map((row) => row.slice(0, 3))).toEqual([
      ['Hello', '2', '1'],
      ['Goodbye', '1', '0'],
    ]);
  });

  it('restarts the whole deck with Study again, or only the missed cards with Study missed', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    async function grade(name: 'Right' | 'Wrong') {
      await click(user, 'Show');
      await click(user, name);
    }
    await grade('Wrong');
    await grade('Right');
    await grade('Right');

    await click(user, 'Study missed 1');
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.queryByText('Goodbye')).toBeNull();
    await grade('Right');
    expect(screen.queryByRole('button', { name: /Study missed/ })).toBeNull();

    await click(user, 'Study again');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(barFill()).toBe('solid 0 dashed 0');
  });

  it('reveals with Space/Enter, then grades with the Anki number keys, y/n, or Space', async () => {
    setup(EightCardText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();

    // Nothing is focused inside the carousel yet, so Space is a no-op.
    await press(user, '[Space]');
    expect(screen.getByText('Bonjour').getAttribute('aria-hidden')).toBe(
      'true',
    );

    await act(async () => {
      await Promise.all([
        user.click(screen.getByTestId('ankiDeck')),
        jest.runAllTimersAsync(),
      ]);
    });

    await press(user, '[Space]');
    expect(screen.getByText('Bonjour')).toBeTruthy();
    expect(screen.getByText('1 / 8')).toBeTruthy();

    // Keys 1, 2 and n are wrong; 3, 4, y, Space and Enter are right.
    const keys = ['1', '3', '2', '4', 'n', 'y', '[Space]', '[Enter]'];
    for (const [i, key] of keys.entries()) {
      if (i > 0) {
        await press(user, '[Enter]');
      }
      await press(user, key);
    }
    expect(barFill()).toBe('solid 0.625 dashed 0.375');

    for (let i = 0; i < 30 && !screen.queryByRole('table'); i++) {
      await press(user, '[Enter]');
      await press(user, '3');
    }
    expect(screen.getByText('5 of 8 (63%)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Study missed 3' })).toBeTruthy();
  });

  it('moves between the Wrong and Right buttons with the arrow keys, grading with Enter', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await act(async () => {
      await Promise.all([
        user.click(screen.getByTestId('ankiDeck')),
        jest.runAllTimersAsync(),
      ]);
    });

    await press(user, '[Space]');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Right' }),
    );
    await press(user, '[ArrowLeft]');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Wrong' }),
    );
    await press(user, '[Enter]');

    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(barFill()).toBe('solid 0 dashed 0.5');
  });

  it('walks focus between Wrong and Right with the arrow keys, stopping at the ends', async () => {
    setup(EightCardText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    const focused = () => document.activeElement?.textContent;
    await act(async () => {
      await Promise.all([
        user.click(screen.getByTestId('ankiDeck')),
        jest.runAllTimersAsync(),
      ]);
    });

    // Arrows do nothing while the focus is on the card.
    await press(user, '[ArrowRight]');
    expect(screen.getByText('1 / 8')).toBeTruthy();

    await press(user, '[Space]');
    expect(focused()).toBe('Right');
    await press(user, '[ArrowRight]');
    expect(focused()).toBe('Right');
    await press(user, '[ArrowLeft]');
    expect(focused()).toBe('Wrong');
    await press(user, '[ArrowLeft]');
    expect(focused()).toBe('Wrong');
  });

  it('treats the card controls as a single tab stop that the arrows move within', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    const toolbar = screen.getByRole('toolbar');
    const tabStops = () =>
      within(toolbar)
        .getAllByRole('button')
        .filter((button) => button.tabIndex === 0)
        .map((button) => button.textContent);

    expect(tabStops()).toEqual(['Show']);

    await act(async () => {
      await Promise.all([
        user.click(screen.getByTestId('ankiDeck')),
        jest.runAllTimersAsync(),
      ]);
    });
    await press(user, '[Tab][Tab][Tab]');
    expect(toolbar.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toBe('Show');

    await press(user, '[Enter]');
    expect(tabStops()).toEqual(['Right']);
    await press(user, '[ArrowLeft]');
    expect(tabStops()).toEqual(['Wrong']);

    await press(user, '[Tab]');
    expect(toolbar.contains(document.activeElement)).toBe(false);
  });

  it('hides the shown answer with Escape, keeping the keyboard usable', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await act(async () => {
      await Promise.all([
        user.click(screen.getByTestId('ankiDeck')),
        jest.runAllTimersAsync(),
      ]);
    });

    await press(user, '[Space]');
    expect(screen.getByText('Bonjour').getAttribute('aria-hidden')).toBe(
      'false',
    );

    await press(user, '[Escape]');
    expect(screen.getByText('Bonjour').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();

    await press(user, '[Space]');
    expect(screen.getByRole('button', { name: 'Right' })).toBeTruthy();
  });

  it('shuffles the cards by default and restores deck order when Random is unchecked', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const checkbox = screen.getByLabelText('Random') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.queryByText('Hello')).toBeNull();

    await act(() => user.click(checkbox));

    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('renders an empty anki block without crashing, e.g. while mid-edit', async () => {
    setup(EmptyText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('No cards yet.')).toBeTruthy();
    expect(screen.queryByText(/\d \/ \d/)).toBeNull();
  });

  it('switches to the full list view and back to study mode', async () => {
    setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Show all')),
        jest.runAllTimersAsync(),
      ]);
    });

    // Both cards are visible at once, in the full list view.
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.getAllByText('Show answer')).toHaveLength(2);
    expect(screen.queryByText(/\d \/ \d/)).toBeNull();

    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Study mode')),
        jest.runAllTimersAsync(),
      ]);
    });

    // Back in study mode, the carousel starts over from the first card.
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.queryByText('Goodbye')).toBeNull();
  });

  it('renders cloze blanks hidden, using the hint as a placeholder', async () => {
    setup(ClozeText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('1 / 2')).toBeTruthy();
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

    await click(user, 'Right');

    // The second card's blanks are independent, and start out hidden.
    expect(screen.getByText('2 / 2')).toBeTruthy();
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
    expect(
      within(basicDeck).getByRole('button', { name: 'Show' }),
    ).toBeTruthy();
    expect(within(basicDeck).queryByText('[être]')).toBeNull();

    // The second block only has the Cloze card's content.
    expect(within(clozeDeck).getByText('[être]')).toBeTruthy();
    expect(within(clozeDeck).queryByText('Hello')).toBeNull();
  });
});
