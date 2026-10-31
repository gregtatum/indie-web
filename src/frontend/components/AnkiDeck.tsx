import * as React from 'react';
import * as T from 'frontend/@types';
import { getKeyboardString } from 'frontend/utils';
import { splitDeckPath } from 'frontend/logic/parse-anki';
import './AnkiDeck.css';

interface AnkiDeckProps {
  parsed: T.ParsedAnkiFile;
}

type DeckMode = 'study' | 'full';

export function AnkiDeck({ parsed }: AnkiDeckProps) {
  const [mode, setMode] = React.useState<DeckMode>('study');
  const [random, setRandom] = React.useState(true);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { notes } = parsed;
  const isStudyMode = mode === 'study';
  const { title } = splitDeckPath(notes[0]?.deck);

  return (
    <div
      className="ankiDeck"
      data-testid="ankiDeck"
      data-mode={mode}
      ref={containerRef}
      tabIndex={isStudyMode ? 0 : undefined}
    >
      {title ? <h3>{title}</h3> : null}
      {isStudyMode ? (
        <AnkiStudyCarousel
          notes={notes}
          containerRef={containerRef}
          random={random}
          onRandomChange={setRandom}
          onShowAll={() => setMode('full')}
        />
      ) : (
        <>
          <button
            className="button ankiDeckModeToggle"
            type="button"
            onClick={() => setMode('study')}
          >
            Study mode
          </button>
          <div className="ankiDeckList">
            {notes.map((note, index) =>
              renderNote(note, index, undefined, 'list'),
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface AnkiStudyCarouselProps {
  notes: T.AnkiNote[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  random: boolean;
  onRandomChange: (random: boolean) => void;
  onShowAll: () => void;
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
}

function createStudySession(
  source: T.AnkiNote[],
  deck: T.AnkiNote[] = source,
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

function AnkiStudyCarousel({
  notes: orderedNotes,
  containerRef,
  random,
  onRandomChange,
  onShowAll,
}: AnkiStudyCarouselProps) {
  const notes = React.useMemo(
    () => (random ? shuffled(orderedNotes) : orderedNotes),
    [orderedNotes, random],
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
    (deck: T.AnkiNote[]) => {
      setSession(createStudySession(notes, deck));
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
      <div className="ankiDeckCarouselTop">
        <div className="ankiDeckCarouselInfo">
          <button
            className="button ankiDeckModeToggle"
            type="button"
            onClick={onShowAll}
          >
            Show all
          </button>
          <label className="ankiDeckCarouselRandom">
            <input
              type="checkbox"
              checked={random}
              onChange={(event) => {
                onRandomChange(event.target.checked);
              }}
            />
            Random
          </label>
        </div>
        <div
          className="ankiDeckCarouselNav"
          role="toolbar"
          aria-label="Card controls"
          ref={groupRef}
        >
          {revealed ? (
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
          ) : (
            <button
              className="button ankiDeckCarouselShowNext"
              type="button"
              disabled={isFinished}
              onClick={reveal}
              {...groupButtonProps('show')}
            >
              Show
            </button>
          )}
        </div>
      </div>
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
          <AnkiStudySummary
            session={session}
            onStudyAgain={() => startSession(notes)}
            onStudyMissed={() => {
              const missed = deck.filter(
                (_, id) => session.progress[id].misses,
              );
              startSession(random ? shuffled(missed) : missed);
            }}
          />
        ) : (
          renderNote(
            deck[currentId],
            session.step,
            cardRef,
            'carousel',
            setRevealed,
          )
        )}
      </div>
    </>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${Math.floor(totalSeconds / 60)}:${seconds}`;
}

function noteSummary(note: T.AnkiNote): string {
  if (note.clozeSpans === null) {
    return note.fields[0];
  }
  return note.clozeSpans
    .map((span) => (span.type === 'text' ? span.text : span.answer))
    .join('');
}

interface AnkiStudySummaryProps {
  session: StudySession;
  onStudyAgain: () => void;
  onStudyMissed: () => void;
}

function AnkiStudySummary({
  session,
  onStudyAgain,
  onStudyMissed,
}: AnkiStudySummaryProps) {
  const { deck, progress } = session;
  const elapsed = (session.finishedAt ?? session.startedAt) - session.startedAt;
  const firstTry = progress.filter((card) => card.misses === 0).length;
  const missedCount = deck.length - firstTry;
  const rows = deck
    .map((note, id) => ({ note, ...progress[id] }))
    .sort((a, b) => b.misses - a.misses || b.ms - a.ms);
  const slowestMs = Math.max(1, ...rows.map((row) => row.ms));

  return (
    <div className="ankiDeckSummary">
      <dl className="ankiDeckSummaryStats">
        <div>
          <dt>First try</dt>
          <dd>
            {firstTry} of {deck.length} (
            {Math.round((firstTry / deck.length) * 100)}%)
          </dd>
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
      <div className="ankiDeckSummaryActions">
        {missedCount > 0 ? (
          <button
            className="button button-primary"
            type="button"
            onClick={onStudyMissed}
          >
            Study missed
            <span className="ankiDeckSummaryPill">{missedCount}</span>
          </button>
        ) : null}
        <button className="button" type="button" onClick={onStudyAgain}>
          Study again
        </button>
      </div>
    </div>
  );
}

type AnkiCardVariant = 'carousel' | 'list';

function renderNote(
  note: T.AnkiNote | undefined,
  key: number,
  ref: React.Ref<AnkiCardHandle> | undefined,
  variant: AnkiCardVariant,
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
        variant={variant}
        onRevealedChange={onRevealedChange}
      />
    );
  }
  if (isBasicNote(note)) {
    return (
      <AnkiBasicCard
        key={key}
        note={note}
        ref={ref}
        variant={variant}
        onRevealedChange={onRevealedChange}
      />
    );
  }
  return null;
}

function isBasicNote(note: T.AnkiNote): boolean {
  return note.notetype === null || note.notetype.toLowerCase() === 'basic';
}

interface AnkiBasicCardProps {
  note: T.AnkiNote;
  variant: AnkiCardVariant;
  onRevealedChange?: (revealed: boolean) => void;
}

const AnkiBasicCard = React.forwardRef<AnkiCardHandle, AnkiBasicCardProps>(
  function AnkiBasicCard({ note, variant, onRevealedChange }, ref) {
    const [revealed, setRevealed] = React.useState(false);
    const isStage = variant === 'carousel';

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
      <div
        className={isStage ? 'ankiDeckCard ankiDeckCardStage' : 'ankiDeckCard'}
      >
        <div className="ankiDeckCardFront">{note.fields[0]}</div>
        {isStage ? null : (
          <div className="ankiDeckCardRevealRow">
            <button
              className="button ankiDeckCardReveal"
              type="button"
              onClick={() => setRevealed((value) => !value)}
            >
              {revealed ? 'Hide answer' : 'Show answer'}
            </button>
          </div>
        )}
        {isStage ? (
          <div
            className={
              revealed
                ? 'ankiDeckCardBack ankiDeckCardBackRevealed'
                : 'ankiDeckCardBack'
            }
            aria-hidden={!revealed}
          >
            {note.fields[1]}
          </div>
        ) : null}
        {!isStage && revealed ? (
          <div className="ankiDeckCardBack">{note.fields[1]}</div>
        ) : null}
      </div>
    );
  },
);

interface AnkiClozeCardProps {
  note: T.AnkiNote;
  variant: AnkiCardVariant;
  onRevealedChange?: (revealed: boolean) => void;
}

const AnkiClozeCard = React.forwardRef<AnkiCardHandle, AnkiClozeCardProps>(
  function AnkiClozeCard({ note, variant, onRevealedChange }, ref) {
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

    const isStage = variant === 'carousel';

    return (
      <div
        className={isStage ? 'ankiDeckCard ankiDeckCardStage' : 'ankiDeckCard'}
      >
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
