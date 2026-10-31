import * as React from 'react';
import * as T from 'frontend/@types';
import { getKeyboardString } from 'frontend/utils';
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

  return (
    <div
      className="ankiDeck"
      data-testid="ankiDeck"
      data-mode={mode}
      ref={containerRef}
      tabIndex={isStudyMode ? 0 : undefined}
    >
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

type CardResult = 'correct' | 'incorrect';
type SegmentState = 'unanswered' | 'current' | CardResult;

function segmentState(
  index: number,
  currentIndex: number,
  results: CardResult[],
): SegmentState {
  if (index === currentIndex) {
    return 'current';
  }
  return results[index] ?? 'unanswered';
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
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [results, setResults] = React.useState<CardResult[]>([]);
  const cardRef = React.useRef<AnkiCardHandle>(null);
  const previousRef = React.useRef<HTMLButtonElement>(null);
  const incorrectRef = React.useRef<HTMLButtonElement>(null);
  const correctRef = React.useRef<HTMLButtonElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const safeIndex = Math.min(index, notes.length);
  const isFinished = notes.length > 0 && safeIndex === notes.length;
  const answeredCount = results.length;

  React.useEffect(() => {
    setIndex((value) => Math.min(value, notes.length));
    setResults((value) => value.slice(0, notes.length));
  }, [notes.length]);

  React.useEffect(() => {
    if (revealed) {
      correctRef.current?.focus();
    }
  }, [revealed]);

  const goPrevious = React.useCallback(() => {
    setIndex((value) => Math.max(value - 1, 0));
    setRevealed(false);
    containerRef.current?.focus();
  }, [containerRef]);
  const goNext = React.useCallback(() => {
    setIndex((value) => Math.min(value + 1, answeredCount));
    setRevealed(false);
    containerRef.current?.focus();
  }, [answeredCount, containerRef]);
  const moveFocus = React.useCallback((direction: -1 | 1) => {
    const buttons = [previousRef, incorrectRef, correctRef, nextRef]
      .map((ref) => ref.current)
      .filter((button) => button && !button.disabled);
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const from = current === -1 ? buttons.indexOf(correctRef.current) : current;
    buttons[
      Math.min(Math.max(from + direction, 0), buttons.length - 1)
    ]?.focus();
  }, []);
  const grade = React.useCallback(
    (result: CardResult) => {
      setResults((value) => {
        const next = [...value];
        next[safeIndex] = result;
        return next;
      });
      setIndex(safeIndex + 1);
      setRevealed(false);
      containerRef.current?.focus();
    },
    [containerRef, safeIndex],
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
          event.preventDefault();
          if (revealed) {
            moveFocus(-1);
          } else {
            goPrevious();
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (revealed) {
            moveFocus(1);
          } else {
            goNext();
          }
          break;
        case ' ':
        case 'Enter':
          if (isFinished) {
            break;
          }
          if (!revealed) {
            event.preventDefault();
            cardRef.current?.revealAll();
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
  }, [
    containerRef,
    goPrevious,
    goNext,
    moveFocus,
    grade,
    revealed,
    isFinished,
  ]);

  if (notes.length === 0) {
    return <div className="ankiDeckEmpty">No cards yet.</div>;
  }

  return (
    <>
      <div className="ankiDeckCarouselTop">
        <div className="ankiDeckCarouselInfo">
          <div className="ankiDeckCarouselProgress">
            {Math.min(safeIndex + 1, notes.length)} / {notes.length}
          </div>
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
                setIndex(0);
                setResults([]);
                setRevealed(false);
              }}
            />
            Random
          </label>
        </div>
        <div className="ankiDeckCarouselNav">
          <button
            className="button ankiDeckCarouselNavButton"
            type="button"
            ref={previousRef}
            aria-label="Previous card"
            disabled={safeIndex === 0}
            onClick={goPrevious}
          >
            ←
          </button>
          {revealed ? (
            <>
              <button
                className="button ankiDeckCarouselGrade"
                type="button"
                ref={incorrectRef}
                onClick={() => grade('incorrect')}
              >
                Wrong
              </button>
              <button
                className="button button-primary ankiDeckCarouselGrade"
                type="button"
                ref={correctRef}
                onClick={() => grade('correct')}
              >
                Right
              </button>
            </>
          ) : (
            <button
              className="button ankiDeckCarouselShowNext"
              type="button"
              disabled={isFinished}
              onClick={() => cardRef.current?.revealAll()}
            >
              Show
            </button>
          )}
          <button
            className="button ankiDeckCarouselNavButton"
            type="button"
            ref={nextRef}
            aria-label="Next card"
            disabled={safeIndex >= answeredCount}
            onClick={goNext}
          >
            →
          </button>
        </div>
      </div>
      <div
        className="ankiDeckCarouselBar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={notes.length}
        aria-valuenow={Math.min(safeIndex + 1, notes.length)}
      >
        {notes.map((_, i) => (
          <div
            key={i}
            className="ankiDeckCarouselSegment"
            data-state={segmentState(i, safeIndex, results)}
          />
        ))}
      </div>
      <div className="ankiDeckCarouselStage">
        {isFinished ? (
          <div className="ankiDeckCarouselSummary">
            Done: {results.filter((r) => r === 'correct').length} right,{' '}
            {results.filter((r) => r === 'incorrect').length} wrong.
          </div>
        ) : (
          renderNote(
            notes[safeIndex],
            safeIndex,
            cardRef,
            'carousel',
            setRevealed,
          )
        )}
      </div>
    </>
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

/**
 * Anki deck paths use "::" to separate a deck from its subdecks, e.g.
 * "French::Basics". Render that the same way as the app's own breadcrumbs.
 */
function formatDeckPath(deck: string): string {
  return deck
    .split('::')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' » ');
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
        {isStage && note.deck ? (
          <div className="ankiDeckDeckLabel">{formatDeckPath(note.deck)}</div>
        ) : null}
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
        {isStage && note.deck ? (
          <div className="ankiDeckDeckLabel">{formatDeckPath(note.deck)}</div>
        ) : null}
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
