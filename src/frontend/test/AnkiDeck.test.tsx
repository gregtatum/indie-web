import userEvent from '@testing-library/user-event';
import { createStore } from 'frontend/store/create-store';
import { AppRoutes } from 'frontend/components/App';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { settleApp } from './utils/fixtures';
import { connectBrowserFiles, flushStorage, useTestIDBFS } from './utils/idbfs';
import { A } from 'frontend';
import { dedent } from 'frontend/utils';
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
  afterEach(flushStorage);

  const { getIDBFS } = useTestIDBFS();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(Element.prototype, 'requestFullscreen');
    jest.restoreAllMocks();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  async function setup(text = FrenchText) {
    const idbfs = getIDBFS();
    const store = createStore();
    store.dispatch(A.changeFileStore('browser'));
    await connectBrowserFiles(store, idbfs, []);
    await idbfs.saveText('/French.md', 'overwrite', text);

    const renderResults = render(
      <MemoryRouter initialEntries={['/browser/md/French.md']}>
        <Provider store={store as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await settleApp();

    async function readSavedText() {
      return (await idbfs.loadBlob('/French.md')).blob.text();
    }

    return { store, readSavedText, ...renderResults };
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
    await setup(dedent`
      # French

      ${fence}anki
      #deck:French::Verbs
      acheter;to buy
      aider;to help

      #deck:French::Nouns
      maison;house

      #deck:Spanish
      casa;house
      ${fence}
    `);
    await waitFor(() => screen.getAllByTestId('ankiDeck'));

    const decks = screen.getAllByTestId('ankiDeck');
    expect(
      decks.map((deck) => deck.textContent?.match(/\d \/ \d/)?.[0]),
    ).toEqual(['1 / 2', '1 / 1', '1 / 1']);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['French']);
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Verbs', 'Nouns', 'Spanish']);
  });

  it('defaults to study mode, showing one card at a time with the answer hidden', async () => {
    await setup();
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
          class="ankiDeckHeader"
        >
          <div
            class="ankiDeckStats"
          >
            <span>
              0 sessions
            </span>
            <span>
              0
               weak
            </span>
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
        <div
          class="ankiDeckCarouselTop"
        >
          <button
            class="button ankiDeckOptionsButton"
            type="button"
          >
            Options
          </button>
          <div
            aria-label="Card controls"
            class="ankiDeckCarouselNav"
            role="toolbar"
          >
            <button
              class="button button-primary ankiDeckCarouselShowNext"
              tabindex="0"
              type="button"
            >
              Show
            </button>
          </div>
        </div>
      </div>
    `);
  });

  it('grades a card to advance to the next one with its answer hidden', async () => {
    await setup();
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
    await setup();
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
      'First try': '50%',
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

  it('restarts the whole deck with Study again, or only the missed cards with Study weak', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    async function grade(name: 'Right' | 'Wrong') {
      await click(user, 'Show');
      await click(user, name);
    }
    await grade('Wrong');
    await grade('Right');
    await grade('Right');

    await click(user, 'Study weak 1');
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.queryByText('Goodbye')).toBeNull();
    await grade('Right');
    expect(screen.queryByRole('button', { name: /Study weak/ })).toBeNull();

    await click(user, 'Study again');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(barFill()).toBe('solid 0 dashed 0');
  });

  it('reveals with Space/Enter, then grades with the Anki number keys, y/n, or Space', async () => {
    await setup(EightCardText);
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
    expect(screen.getByText('63%')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Study weak 3' })).toBeTruthy();
  });

  it('moves between the Wrong and Right buttons with the arrow keys, grading with Enter', async () => {
    await setup();
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
    await setup(EightCardText);
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
    await setup();
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
    await press(user, '[Tab][Tab]');
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
    await setup();
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
    await setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await click(user, 'Options');
    const checkbox = screen.getByLabelText('Random') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.queryByText('Hello')).toBeNull();

    await act(() => user.click(checkbox));

    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('studies in reverse and with typed answers from the options menu', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    Object.defineProperty(document, 'fullscreenEnabled', {
      value: true,
      configurable: true,
    });
    const { store } = await setup();
    await act(async () => {
      store.dispatch(A.hideEditor(true));
    });
    await waitFor(() => screen.getByTestId('ankiDeck'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const requestFullscreen = jest.fn(() => Promise.resolve());
    Element.prototype.requestFullscreen = requestFullscreen;
    await click(user, 'Options');
    await act(() => user.click(screen.getByLabelText('Reverse')));
    expect(
      screen.getByText('Au revoir').getAttribute('aria-hidden'),
    ).toBeNull();
    expect(screen.getByText('Goodbye').getAttribute('aria-hidden')).toBe(
      'true',
    );

    await act(() => user.click(screen.getByRole('radio', { name: 'Type' })));
    await click(user, 'Options');
    const input = screen.getByRole('textbox', { name: 'Your answer' });
    await act(() => user.type(input, 'f'));
    expect(requestFullscreen).not.toHaveBeenCalled();
    await act(() => user.clear(input));
    await act(() => user.type(input, 'goodbye'));
    await press(user, '[Enter]');
    expect(input.getAttribute('data-match')).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Right' }),
    );
  });

  it('focuses Wrong after a blank or incorrect typed answer', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await click(user, 'Options');
    await act(() => user.click(screen.getByRole('radio', { name: 'Type' })));
    await click(user, 'Options');
    await act(() =>
      user.click(screen.getByRole('textbox', { name: 'Your answer' })),
    );

    await press(user, '[Enter]');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Wrong' }),
    );
    await press(user, '[Enter]');

    await act(() =>
      user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'nope'),
    );
    await press(user, '[Enter]');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Wrong' }),
    );
  });

  it('leaves Space and Enter to the focused options control instead of advancing the card', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const options = screen.getByRole('button', { name: 'Options' });
    await act(async () => options.focus());
    await press(user, '[Enter]');

    expect(
      screen.getByRole('radiogroup', { name: 'Answer mode' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Right' })).toBeNull();
  });

  it('renders an empty anki block without crashing, e.g. while mid-edit', async () => {
    await setup(EmptyText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('No cards yet.')).toBeTruthy();
    expect(screen.queryByText(/\d \/ \d/)).toBeNull();
  });

  it('switches to the full list view and back to study mode', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('ankiDeck'));

    const user = userEvent.setup();
    await click(user, 'Options');
    await act(async () => {
      await Promise.all([
        user.click(screen.getByText('Show all')),
        jest.runAllTimersAsync(),
      ]);
    });

    // Both cards are visible at once, in the full list view.
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.getByText('Bonjour')).toBeTruthy();
    expect(screen.getByText('Au revoir')).toBeTruthy();
    expect(screen.queryByText(/\d \/ \d/)).toBeNull();

    await click(user, 'Options');
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
    await setup(ClozeText);
    await waitFor(() => screen.getByTestId('ankiDeck'));

    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('[être]')).toBeTruthy();
    expect(screen.queryByText('suis')).toBeNull();
    expect(screen.queryByText('[...]')).toBeNull();
    expect(screen.getByText(/étudiant\./)).toBeTruthy();
  });

  it('reveals a cloze blank independently by number, resetting on the next card', async () => {
    await setup(ClozeText);
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
    await setup(InterleavedText);
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

  describe('study stats in frontmatter', () => {
    async function study(text: string, answers: Array<'Right' | 'Wrong'>) {
      const { readSavedText } = await setup(text);
      await waitFor(() => screen.getByTestId('ankiDeck'));
      const user = userEvent.setup();
      for (const answer of answers) {
        await click(user, 'Show');
        await click(user, answer);
      }
      await flushStorage();
      return { readSavedText, user };
    }

    function normalizeTimes(text: string) {
      return text
        .replace(/at: [\w:-]+/g, 'at: AT')
        .replace(/seconds: \d+/g, 'seconds: S');
    }

    it('saves a run and the missed terms into new frontmatter, keeping the study summary', async () => {
      const { readSavedText } = await study(FrenchText, [
        'Wrong',
        'Right',
        'Right',
      ]);

      expect(normalizeTimes(await readSavedText())).toEqual(
        [
          '---',
          'anki:',
          '  default:',
          '    weak: [ Hello ]',
          '    runs:',
          '      - { at: AT, first: 1, of: 2, answers: 3, seconds: S }',
          '---',
          FrenchText,
        ].join('\n'),
      );
      expect(screen.getByText('Study again')).toBeTruthy();
      expect(screen.queryByText(/anki:/)).toBeNull();
    });

    it('appends to existing frontmatter, clearing weak terms answered right and keeping other keys', async () => {
      const { readSavedText } = await study(
        [
          '---',
          'title: French # keep me',
          'anki:',
          '  default:',
          '    weak: [ Hello, Gone ]',
          '    runs:',
          '      - { at: 2026-10-30T17:12Z, first: 1, of: 2, answers: 3, seconds: 9 }',
          '---',
          FrenchText,
        ].join('\n'),
        ['Right', 'Wrong', 'Right'],
      );

      expect(normalizeTimes(await readSavedText())).toEqual(
        [
          '---',
          'title: French # keep me',
          'anki:',
          '  default:',
          '    weak: [ Goodbye ]',
          '    runs:',
          '      - { at: AT, first: 1, of: 2, answers: 3, seconds: S }',
          '      - { at: AT, first: 1, of: 2, answers: 3, seconds: S }',
          '---',
          FrenchText,
        ].join('\n'),
      );
    });

    it.each([
      ['CRLF line endings', '\r\n', '---', '---'],
      ['trailing spaces after the fences', '\n', '---  ', '--- \t'],
    ])('reads frontmatter with %s', async (_, eol, open, close) => {
      const { readSavedText } = await study(
        [open, 'title: French', close, FrenchText].join(eol),
        ['Right', 'Right'],
      );

      expect(normalizeTimes(await readSavedText())).toEqual(
        [
          '---',
          'title: French',
          'anki:',
          '  default:',
          '    runs:',
          '      - { at: AT, first: 2, of: 2, answers: 2, seconds: S }',
          '---',
          FrenchText,
        ].join('\n'),
      );
    });

    it('shows practice stats and studies weak cards first', async () => {
      await setup(
        [
          '---',
          'anki:',
          '  default:',
          '    weak: [Thanks, No]',
          '    runs:',
          '      - { at: 2026-10-30T17:12Z, first: 6, of: 8, answers: 10, seconds: 60 }',
          '      - { at: 2026-10-31T17:12Z, first: 8, of: 8, answers: 8, seconds: 40 }',
          '---',
          EightCardText,
        ].join('\n'),
      );
      await waitFor(() => screen.getByTestId('ankiDeck'));
      expect(screen.getByText('2 sessions')).toBeTruthy();
      expect(screen.getByText('2 weak')).toBeTruthy();

      const user = userEvent.setup();
      const seen: Array<string | null> = [];
      for (let i = 0; i < 4; i++) {
        seen.push(
          document.querySelector('.ankiDeckCardFront')?.textContent ?? null,
        );
        await click(user, 'Show');
        await click(user, 'Right');
      }
      expect(seen.slice(0, 2).sort()).toEqual(['No', 'Thanks']);
      expect(seen.slice(2)).not.toContain('No');
      expect(seen.slice(2)).not.toContain('Thanks');
    });

    it('flags Study weak runs as retries and keeps their weak terms', async () => {
      const { readSavedText, user } = await study(FrenchText, [
        'Wrong',
        'Right',
        'Right',
      ]);
      await click(user, 'Study weak 1');
      await click(user, 'Show');
      await click(user, 'Right');

      expect(normalizeTimes(await readSavedText())).toContain(
        [
          '    weak: [ Hello ]',
          '    runs:',
          '      - { at: AT, first: 1, of: 2, answers: 3, seconds: S }',
          '      - { at: AT, first: 1, of: 1, answers: 1, seconds: S, retry: true }',
        ].join('\n'),
      );
    });
  });
});
