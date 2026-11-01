import * as React from 'react';
import * as T from 'frontend/@types';
import { getKeyboardString } from 'frontend/utils';
import { A, Hooks, $$ } from 'frontend';
import { overlayPortal } from 'frontend/hooks';
import { Popup } from './Popup';
import {
  noteSummary,
  noteTerm,
  splitDeckPath,
} from 'frontend/logic/parse-anki';
import './AnkiDeck.css';

interface AnkiDeckProps {
  parsed: T.ParsedAnkiFile;
}

type DeckMode = 'study' | 'full';

type AnswerMode = 'reveal' | 'type';

const ANSWER_MODES: Array<{ id: AnswerMode; label: string }> = [
  { id: 'reveal', label: 'Reveal' },
  { id: 'type', label: 'Type' },
];

export function AnkiDeck({ parsed }: AnkiDeckProps) {
  const [mode, setMode] = React.useState<DeckMode>('study');
  const [random, setRandom] = React.useState(true);
  const [answerMode, setAnswerMode] = React.useState<AnswerMode>('reveal');
  const [reverse, setReverse] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { notes } = parsed;
  const isStudyMode = mode === 'study';
  const { title } = splitDeckPath(notes[0]?.deck);
  const stats = useAnkiStats(notes[0]?.deck ?? null);
  const [weakTerms, setWeakTerms] = React.useState<string[] | null>(null);
  if (weakTerms === null && stats !== null) {
    setWeakTerms(stats.weak);
  }

  return (
    <div
      className="ankiDeck"
      data-testid="ankiDeck"
      data-mode={mode}
      ref={containerRef}
      tabIndex={isStudyMode ? 0 : undefined}
    >
      <div className="ankiDeckHeader">
        {title ? <h3>{title}</h3> : null}
        {stats ? (
          <div className="ankiDeckStats">
            <span>{pluralize(stats.runs, 'session')}</span>
            <span>{stats.weak.length} weak</span>
          </div>
        ) : null}
      </div>
      {isStudyMode ? (
        weakTerms && (
          <AnkiStudyCarousel
            notes={notes}
            weakTerms={weakTerms}
            containerRef={containerRef}
            random={random}
            onRandomChange={setRandom}
            answerMode={answerMode}
            onAnswerModeChange={setAnswerMode}
            reverse={reverse}
            onReverseChange={setReverse}
            onModeChange={setMode}
          />
        )
      ) : (
        <>
          <AnkiOptionsMenu
            mode={mode}
            onModeChange={setMode}
            random={random}
            onRandomChange={setRandom}
            answerMode={answerMode}
            onAnswerModeChange={setAnswerMode}
            reverse={reverse}
            onReverseChange={setReverse}
          />
          <div className="ankiDeckList">
            {notes.map((note, index) => (
              <AnkiListRow key={index} note={note} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

type ReadAnkiStats = typeof import('frontend/logic/anki').readAnkiStats;

function useAnkiStats(deck: string | null): T.AnkiDeckStats | null {
  const text = $$.getActiveFileText();
  const [readStats, setReadStats] = React.useState<ReadAnkiStats | null>(null);
  React.useEffect(() => {
    void import(/* webpackChunkName: "anki" */ 'frontend/logic/anki').then(
      ({ readAnkiStats }) => setReadStats(() => readAnkiStats),
    );
  }, []);
  return React.useMemo(
    () => (readStats ? readStats(text, deck) : null),
    [readStats, text, deck],
  );
}

interface AnkiStudyCarouselProps {
  notes: T.AnkiNote[];
  weakTerms: string[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  random: boolean;
  onRandomChange: (random: boolean) => void;
  answerMode: AnswerMode;
  onAnswerModeChange: (answerMode: AnswerMode) => void;
  reverse: boolean;
  onReverseChange: (reverse: boolean) => void;
  onModeChange: (mode: DeckMode) => void;
}

interface AnkiCardHandle {
  revealAll: () => void;
  hideAll: () => void;
}

type GroupButton = 'show' | 'incorrect' | 'correct';

const GROUP_BUTTONS: GroupButton[] = ['show', 'incorrect', 'correct'];

const STREAK_TO_MASTER_AFTER_MISS = 2;

type CardResult = 'correct' | 'incorrect';

interface CardProgress {
  attempts: number;
  misses: number;
  streak: number;
  ms: number;
}

interface StudySession {
  source: T.AnkiNote[];
  deck: T.AnkiNote[];
  queue: number[];
  mastered: number[];
  progress: CardProgress[];
  step: number;
  startedAt: number;
  shownAt: number;
  finishedAt: number | null;
  retry: boolean;
}

function createStudySession(
  source: T.AnkiNote[],
  deck: T.AnkiNote[] = source,
  retry = false,
): StudySession {
  const now = Date.now();
  return {
    source,
    deck,
    queue: deck.map((_, id) => id),
    mastered: [],
    progress: deck.map(() => ({ attempts: 0, misses: 0, streak: 0, ms: 0 })),
    step: 0,
    startedAt: now,
    shownAt: now,
    finishedAt: null,
    retry,
  };
}

function createRunUpdate(session: StudySession): T.AnkiRunUpdate {
  const { deck, progress, source } = session;
  const terms = (keep: (card: CardProgress) => boolean) =>
    deck.filter((_, id) => keep(progress[id])).map(noteTerm);
  return {
    deck: source[0]?.deck ?? null,
    run: {
      first: progress.filter((card) => card.misses === 0).length,
      of: deck.length,
      answers: session.step,
      seconds: Math.round(
        ((session.finishedAt ?? session.startedAt) - session.startedAt) / 1000,
      ),
    },
    retry: session.retry,
    missed: terms((card) => card.misses > 0),
    clean: terms((card) => card.misses === 0),
    current: source.map(noteTerm),
  };
}

function gradeCurrentCard(
  session: StudySession,
  result: CardResult,
): StudySession {
  const [id, ...rest] = session.queue;
  if (id === undefined) {
    return session;
  }
  const now = Date.now();
  const previous = session.progress[id];
  const streak = result === 'correct' ? previous.streak + 1 : 0;
  const progress = [...session.progress];
  progress[id] = {
    attempts: previous.attempts + 1,
    misses: previous.misses + (result === 'correct' ? 0 : 1),
    streak,
    ms: previous.ms + now - session.shownAt,
  };
  const missed = progress[id].misses > 0;
  const isMastered =
    result === 'correct' &&
    (!missed || streak >= STREAK_TO_MASTER_AFTER_MISS || rest.length === 0);
  return {
    ...session,
    queue: isMastered ? rest : [...rest, id],
    mastered: isMastered ? [...session.mastered, id] : session.mastered,
    progress,
    step: session.step + 1,
    shownAt: now,
    finishedAt: isMastered && rest.length === 0 ? now : null,
  };
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weakFirst(
  notes: T.AnkiNote[],
  weakTerms: string[],
  random: boolean,
): T.AnkiNote[] {
  const weak = new Set(weakTerms);
  const order = random ? shuffled : <Item,>(items: Item[]) => items;
  return [
    ...order(notes.filter((note) => weak.has(noteTerm(note)))),
    ...order(notes.filter((note) => !weak.has(noteTerm(note)))),
  ];
}

function AnkiStudyCarousel({
  notes: orderedNotes,
  weakTerms,
  containerRef,
  random,
  onRandomChange,
  answerMode,
  onAnswerModeChange,
  reverse,
  onReverseChange,
  onModeChange,
}: AnkiStudyCarouselProps) {
  const notes = React.useMemo(
    () => weakFirst(orderedNotes, weakTerms, random),
    [orderedNotes, weakTerms, random],
  );
  const [session, setSession] = React.useState(() => createStudySession(notes));
  const [revealed, setRevealed] = React.useState(false);
  if (session.source !== notes) {
    setSession(createStudySession(notes));
    setRevealed(false);
  }
  const cardRef = React.useRef<AnkiCardHandle>(null);
  const groupRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<
    Partial<Record<GroupButton, HTMLButtonElement | null>>
  >({});
  const focusGroupOnReveal = React.useRef(false);
  const [lastFocused, setLastFocused] = React.useState<GroupButton | null>(
    null,
  );
  const dispatch = Hooks.useDispatch();
  const currentId = session.queue[0];
  const { deck } = session;
  const isFinished = deck.length > 0 && currentId === undefined;

  React.useEffect(() => {
    if (revealed && focusGroupOnReveal.current) {
      buttonRefs.current.correct?.focus();
    }
    focusGroupOnReveal.current = false;
    setLastFocused(null);
  }, [revealed, session.step]);

  const { finishedAt } = session;
  React.useEffect(() => {
    if (finishedAt !== null) {
      void dispatch(A.recordAnkiRun(createRunUpdate(session)));
    }
  }, [finishedAt]);

  const reveal = React.useCallback(() => {
    focusGroupOnReveal.current = true;
    cardRef.current?.revealAll();
  }, []);
  const moveFocus = React.useCallback((direction: -1 | 1) => {
    const buttons = GROUP_BUTTONS.map((id) => buttonRefs.current[id]).filter(
      (button) => button && !button.disabled,
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    buttons[
      Math.min(Math.max(current + direction, 0), buttons.length - 1)
    ]?.focus();
  }, []);
  const startSession = React.useCallback(
    (deck: T.AnkiNote[], retry = false) => {
      setSession(createStudySession(notes, deck, retry));
      setRevealed(false);
      containerRef.current?.focus();
    },
    [notes, containerRef],
  );
  const grade = React.useCallback(
    (result: CardResult) => {
      setSession((value) => gradeCurrentCard(value, result));
      setRevealed(false);
      containerRef.current?.focus();
    },
    [containerRef],
  );

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const active = document.activeElement;
      if (!containerRef.current?.contains(active)) {
        return;
      }
      const canGrade = revealed && !isFinished;
      if (active instanceof HTMLInputElement) {
        if (event.key === 'Enter' && !revealed && !isFinished) {
          event.preventDefault();
          reveal();
        }
        return;
      }
      switch (getKeyboardString(event)) {
        case 'ArrowLeft':
        case 'ArrowRight':
          if (groupRef.current?.contains(active)) {
            event.preventDefault();
            moveFocus(event.key === 'ArrowLeft' ? -1 : 1);
          }
          break;
        case ' ':
        case 'Enter':
          if (isFinished) {
            break;
          }
          if (!revealed) {
            event.preventDefault();
            reveal();
          } else if (!(active instanceof HTMLButtonElement)) {
            event.preventDefault();
            grade('correct');
          }
          break;
        case 'Escape':
          if (!isFinished) {
            event.preventDefault();
            cardRef.current?.hideAll();
            containerRef.current?.focus();
          }
          break;
        case '1':
        case '2':
        case 'N':
          if (canGrade) {
            grade('incorrect');
          }
          break;
        case '3':
        case '4':
        case 'Y':
          if (canGrade) {
            grade('correct');
          }
          break;
        default:
          break;
      }
    }
    document.body.addEventListener('keydown', handleKeyDown);
    return () => document.body.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, moveFocus, grade, reveal, revealed, isFinished]);

  if (notes.length === 0) {
    return <div className="ankiDeckEmpty">No cards yet.</div>;
  }

  const missedCount = deck.filter(
    (_, id) => session.progress[id].misses,
  ).length;
  const studyMissed = () => {
    const missed = deck.filter((_, id) => session.progress[id].misses);
    startSession(random ? shuffled(missed) : missed, true);
  };

  const retryCount = session.queue.filter(
    (id) => session.progress[id].misses > 0,
  ).length;

  const enabledButtons: Record<GroupButton, boolean> = {
    show: !revealed && !isFinished,
    incorrect: revealed,
    correct: revealed,
  };
  const primaryButton: GroupButton = revealed ? 'correct' : 'show';
  const tabStop = [lastFocused, primaryButton, ...GROUP_BUTTONS].find(
    (id) => id && enabledButtons[id],
  );

  function groupButtonProps(id: GroupButton) {
    return {
      ref: (button: HTMLButtonElement | null) => {
        buttonRefs.current[id] = button;
      },
      tabIndex: id === tabStop ? 0 : -1,
      onFocus: () => setLastFocused(id),
    };
  }

  return (
    <>
      <div className="ankiDeckCarouselProgressRow">
        <div className="ankiDeckCarouselProgress">
          {Math.min(session.mastered.length + 1, deck.length)} / {deck.length}
        </div>
        <div
          className="ankiDeckCarouselBar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={deck.length}
          aria-valuenow={session.mastered.length}
          style={
            {
              '--mastered': session.mastered.length / deck.length,
              '--retry': retryCount / deck.length,
            } as React.CSSProperties
          }
        >
          <div className="ankiDeckCarouselFill" data-fill="mastered" />
          <div className="ankiDeckCarouselFill" data-fill="retry" />
        </div>
      </div>
      <div className="ankiDeckCarouselStage">
        {currentId === undefined ? (
          <AnkiStudySummary session={session} />
        ) : (
          renderNote(
            deck[currentId],
            session.step,
            cardRef,
            answerMode,
            reverse,
            setRevealed,
          )
        )}
      </div>
      <div className="ankiDeckCarouselTop">
        <AnkiOptionsMenu
          mode="study"
          onModeChange={onModeChange}
          random={random}
          onRandomChange={onRandomChange}
          answerMode={answerMode}
          onAnswerModeChange={onAnswerModeChange}
          reverse={reverse}
          onReverseChange={onReverseChange}
        />
        <div
          className="ankiDeckCarouselNav"
          role="toolbar"
          aria-label="Card controls"
          ref={groupRef}
        >
          {isFinished ? (
            <>
              {missedCount > 0 ? (
                <button
                  className="button ankiDeckCarouselGrade"
                  type="button"
                  onClick={studyMissed}
                >
                  Study weak
                  <span className="ankiDeckSummaryPill">{missedCount}</span>
                </button>
              ) : null}
              <button
                className="button button-primary ankiDeckCarouselGrade"
                type="button"
                onClick={() => startSession(notes)}
              >
                Study again
              </button>
            </>
          ) : null}
          {!isFinished && revealed ? (
            <>
              <button
                className="button ankiDeckCarouselGrade"
                type="button"
                onClick={() => grade('incorrect')}
                {...groupButtonProps('incorrect')}
              >
                Wrong
              </button>
              <button
                className="button button-primary ankiDeckCarouselGrade"
                type="button"
                onClick={() => grade('correct')}
                {...groupButtonProps('correct')}
              >
                Right
              </button>
            </>
          ) : null}
          {!isFinished && !revealed ? (
            <button
              className="button button-primary ankiDeckCarouselShowNext"
              type="button"
              onClick={reveal}
              {...groupButtonProps('show')}
            >
              Show
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

interface AnkiOptionsMenuProps {
  mode: DeckMode;
  onModeChange: (mode: DeckMode) => void;
  random: boolean;
  onRandomChange: (random: boolean) => void;
  answerMode: AnswerMode;
  onAnswerModeChange: (answerMode: AnswerMode) => void;
  reverse: boolean;
  onReverseChange: (reverse: boolean) => void;
}

function AnkiOptionsMenu({
  mode,
  onModeChange,
  random,
  onRandomChange,
  answerMode,
  onAnswerModeChange,
  reverse,
  onReverseChange,
}: AnkiOptionsMenuProps) {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [openGeneration, setOpenGeneration] = React.useState(0);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);

  return (
    <>
      <button
        className="button ankiDeckOptionsButton"
        type="button"
        ref={buttonRef}
        onClick={(event) => {
          setOpenGeneration((generation) => generation + 1);
          setOpenEventDetail(event.detail);
        }}
      >
        Options
      </button>
      {overlayPortal(
        <Popup
          clickedElement={buttonRef}
          openEventDetail={openEventDetail}
          openGeneration={openGeneration}
          className="ankiDeckOptionsMenu"
        >
          <button
            className="button ankiDeckModeToggle"
            type="button"
            onClick={() => onModeChange(mode === 'study' ? 'full' : 'study')}
          >
            {mode === 'study' ? 'Show all' : 'Study mode'}
          </button>
          {mode === 'study' ? (
            <div
              className="ankiDeckOptionsGroup"
              role="radiogroup"
              aria-label="Answer mode"
            >
              {ANSWER_MODES.map(({ id, label }) => (
                <button
                  key={id}
                  className={
                    answerMode === id
                      ? 'ankiDeckOptionsGroupButton ankiDeckOptionsGroupButton-active'
                      : 'ankiDeckOptionsGroupButton'
                  }
                  type="button"
                  role="radio"
                  aria-checked={answerMode === id}
                  onClick={() => onAnswerModeChange(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {mode === 'study' ? (
            <label className="ankiDeckOptionsRandom">
              <input
                type="checkbox"
                checked={reverse}
                onChange={(event) => onReverseChange(event.target.checked)}
              />
              Reverse
            </label>
          ) : null}
          <label className="ankiDeckOptionsRandom">
            <input
              type="checkbox"
              checked={random}
              onChange={(event) => {
                onRandomChange(event.target.checked);
              }}
            />
            Random
          </label>
        </Popup>,
        'anki-options-menu',
      )}
    </>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${Math.floor(totalSeconds / 60)}:${seconds}`;
}

interface AnkiStudySummaryProps {
  session: StudySession;
}

function AnkiStudySummary({ session }: AnkiStudySummaryProps) {
  const { deck, progress } = session;
  const elapsed = (session.finishedAt ?? session.startedAt) - session.startedAt;
  const firstTry = progress.filter((card) => card.misses === 0).length;
  const rows = deck
    .map((note, id) => ({ note, ...progress[id] }))
    .sort((a, b) => b.misses - a.misses || b.ms - a.ms);
  const slowestMs = Math.max(1, ...rows.map((row) => row.ms));

  return (
    <div className="ankiDeckSummary">
      <dl className="ankiDeckSummaryStats">
        <div>
          <dt>First try</dt>
          <dd>{Math.round((firstTry / deck.length) * 100)}%</dd>
        </div>
        <div>
          <dt>Answers</dt>
          <dd>{session.step}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatDuration(elapsed)}</dd>
        </div>
        <div>
          <dt>Per answer</dt>
          <dd>{(elapsed / session.step / 1000).toFixed(1)}s</dd>
        </div>
      </dl>
      <div className="ankiDeckSummaryCardsWrap">
        <table className="ankiDeckSummaryCards">
          <thead>
            <tr>
              <th>Card</th>
              <th>Tries</th>
              <th>Misses</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ note, attempts, misses, ms }, i) => (
              <tr key={i}>
                <td className="ankiDeckSummaryCardName">{noteSummary(note)}</td>
                <td>{attempts}</td>
                <td
                  className={misses === 0 ? 'ankiDeckSummaryZero' : undefined}
                >
                  {misses}
                </td>
                <td>
                  <div className="ankiDeckSummaryTime">
                    <div className="ankiDeckSummaryTimeTrack">
                      <div
                        className="ankiDeckSummaryTimeBar"
                        style={{ width: `${(ms / slowestMs) * 100}%` }}
                      />
                    </div>
                    <span>{formatDuration(ms)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderNote(
  note: T.AnkiNote | undefined,
  key: number,
  ref: React.Ref<AnkiCardHandle> | undefined,
  answerMode: AnswerMode,
  reverse: boolean,
  onRevealedChange?: (revealed: boolean) => void,
) {
  if (!note) {
    return null;
  }
  if (note.clozeSpans !== null) {
    return (
      <AnkiClozeCard
        key={key}
        note={note}
        ref={ref}
        onRevealedChange={onRevealedChange}
      />
    );
  }
  if (isBasicNote(note)) {
    return (
      <AnkiBasicCard
        key={key}
        note={note}
        answerMode={answerMode}
        reverse={reverse}
        ref={ref}
        onRevealedChange={onRevealedChange}
      />
    );
  }
  return null;
}

function AnkiListRow({ note }: { note: T.AnkiNote }) {
  if (note.clozeSpans !== null) {
    const spans = note.clozeSpans;
    const answers = spans.flatMap((span) =>
      span.type === 'cloze' ? [span.answer] : [],
    );
    return (
      <div className="ankiDeckListRow">
        <div className="ankiDeckListQuestion">
          {spans.map((span) =>
            span.type === 'text' ? span.text : clozeBlankText(span, false),
          )}
        </div>
        <div className="ankiDeckListAnswer">{answers.join(', ')}</div>
      </div>
    );
  }
  if (!isBasicNote(note)) {
    return null;
  }
  return (
    <div className="ankiDeckListRow">
      <div className="ankiDeckListQuestion">{note.fields[0]}</div>
      <div className="ankiDeckListAnswer">{note.fields[1]}</div>
    </div>
  );
}

function isTypedMatch(typed: string, answer: string): boolean {
  const normalize = (text: string) => text.trim().toLowerCase();
  return normalize(typed) === normalize(answer);
}

function isBasicNote(note: T.AnkiNote): boolean {
  return note.notetype === null || note.notetype.toLowerCase() === 'basic';
}

interface AnkiBasicCardProps {
  note: T.AnkiNote;
  answerMode: AnswerMode;
  reverse: boolean;
  onRevealedChange?: (revealed: boolean) => void;
}

const AnkiBasicCard = React.forwardRef<AnkiCardHandle, AnkiBasicCardProps>(
  function AnkiBasicCard({ note, answerMode, reverse, onRevealedChange }, ref) {
    const [revealed, setRevealed] = React.useState(false);
    const [typed, setTyped] = React.useState('');
    const [question, answer] = reverse
      ? [note.fields[1], note.fields[0]]
      : [note.fields[0], note.fields[1]];
    const isTyping = answerMode === 'type';
    React.useImperativeHandle(
      ref,
      () => ({
        revealAll: () => setRevealed(true),
        hideAll: () => setRevealed(false),
      }),
      [],
    );

    React.useEffect(() => {
      onRevealedChange?.(revealed);
    }, [revealed, onRevealedChange]);

    return (
      <div className="ankiDeckCard ankiDeckCardStage">
        <div className="ankiDeckCardFront">{question}</div>
        {isTyping ? (
          <input
            className="ankiDeckCardTyped"
            type="text"
            aria-label="Your answer"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            readOnly={revealed}
            value={typed}
            data-match={revealed ? isTypedMatch(typed, answer) : undefined}
            onChange={(event) => setTyped(event.target.value)}
          />
        ) : null}
        <div
          className={
            revealed
              ? 'ankiDeckCardBack ankiDeckCardBackRevealed'
              : 'ankiDeckCardBack'
          }
          aria-hidden={!revealed}
        >
          {answer}
        </div>
      </div>
    );
  },
);

interface AnkiClozeCardProps {
  note: T.AnkiNote;
  onRevealedChange?: (revealed: boolean) => void;
}

const AnkiClozeCard = React.forwardRef<AnkiCardHandle, AnkiClozeCardProps>(
  function AnkiClozeCard({ note, onRevealedChange }, ref) {
    const [revealedNums, setRevealedNums] = React.useState<Set<number>>(
      new Set(),
    );
    const spans = note.clozeSpans ?? [];
    const clozeNums = spans
      .filter(
        (span): span is Extract<T.TextOrCloze, { type: 'cloze' }> =>
          span.type === 'cloze',
      )
      .map((span) => span.num);
    const isFullyRevealed =
      clozeNums.length > 0 && clozeNums.every((num) => revealedNums.has(num));

    React.useImperativeHandle(
      ref,
      () => ({
        revealAll: () => setRevealedNums(new Set(clozeNums)),
        hideAll: () => setRevealedNums(new Set()),
      }),
      [clozeNums],
    );

    React.useEffect(() => {
      onRevealedChange?.(isFullyRevealed);
    }, [isFullyRevealed, onRevealedChange]);

    function toggle(num: number) {
      setRevealedNums((prev) => {
        const next = new Set(prev);
        if (next.has(num)) {
          next.delete(num);
        } else {
          next.add(num);
        }
        return next;
      });
    }

    return (
      <div className="ankiDeckCard ankiDeckCardStage">
        <p className="ankiDeckClozeText">
          {spans.map((span, index) =>
            span.type === 'text' ? (
              <React.Fragment key={index}>{span.text}</React.Fragment>
            ) : (
              <button
                key={index}
                type="button"
                className="ankiDeckClozeBlank"
                aria-pressed={revealedNums.has(span.num)}
                onClick={() => toggle(span.num)}
              >
                {clozeBlankText(span, revealedNums.has(span.num))}
              </button>
            ),
          )}
        </p>
      </div>
    );
  },
);

function clozeBlankText(
  span: Extract<T.TextOrCloze, { type: 'cloze' }>,
  revealed: boolean,
): string {
  if (revealed) {
    return span.answer;
  }
  return span.hint ? `[${span.hint}]` : '[...]';
}
