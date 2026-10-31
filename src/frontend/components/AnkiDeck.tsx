import * as React from 'react';
import * as T from 'frontend/@types';
import './AnkiDeck.css';

interface AnkiDeckProps {
  parsed: T.ParsedAnkiFile;
}

type DeckMode = 'study' | 'full';

export function AnkiDeck({ parsed }: AnkiDeckProps) {
  const [mode, setMode] = React.useState<DeckMode>('study');
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
      <button
        className="button ankiDeckModeToggle"
        type="button"
        onClick={() => setMode(isStudyMode ? 'full' : 'study')}
      >
        {isStudyMode ? 'Show full list' : 'Study mode'}
      </button>
      {isStudyMode ? (
        <AnkiStudyCarousel notes={notes} containerRef={containerRef} />
      ) : (
        <div className="ankiDeckList">
          {notes.map((note, index) =>
            renderNote(note, index, undefined, 'list'),
          )}
        </div>
      )}
    </div>
  );
}

interface AnkiStudyCarouselProps {
  notes: T.AnkiNote[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface AnkiCardHandle {
  revealAll: () => void;
}

function AnkiStudyCarousel({ notes, containerRef }: AnkiStudyCarouselProps) {
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const cardRef = React.useRef<AnkiCardHandle>(null);
  const safeIndex = Math.min(index, Math.max(notes.length - 1, 0));
  const totalSegments = Math.max(notes.length - 1, 1);
  const filledSegments = Math.min(safeIndex + 1, totalSegments);

  React.useEffect(() => {
    setIndex((value) => Math.min(value, Math.max(notes.length - 1, 0)));
  }, [notes.length]);

  const goPrevious = React.useCallback(() => {
    setIndex((value) => Math.max(value - 1, 0));
    setRevealed(false);
  }, []);
  const goNext = React.useCallback(() => {
    setIndex((value) => Math.min(value + 1, notes.length - 1));
    setRevealed(false);
  }, [notes.length]);
  const showOrNext = React.useCallback(() => {
    if (revealed) {
      goNext();
    } else {
      cardRef.current?.revealAll();
    }
  }, [revealed, goNext]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!containerRef.current?.contains(document.activeElement)) {
        return;
      }
      switch (event.key) {
        case ' ':
        case 'Enter':
          event.preventDefault();
          if (revealed) {
            goNext();
          } else {
            cardRef.current?.revealAll();
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          goPrevious();
          break;
        default:
          break;
      }
    }
    document.body.addEventListener('keydown', handleKeyDown);
    return () => document.body.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, goPrevious, goNext, revealed]);

  if (notes.length === 0) {
    return <div className="ankiDeckEmpty">No cards yet.</div>;
  }

  return (
    <>
      <div className="ankiDeckCarouselTop">
        <div className="ankiDeckCarouselProgress">
          Card {safeIndex + 1} / {notes.length}
        </div>
        <div className="ankiDeckCarouselNav">
          <button
            className="button ankiDeckCarouselNavButton"
            type="button"
            aria-label="Previous card"
            disabled={safeIndex === 0}
            onClick={goPrevious}
          >
            ←
          </button>
          <button
            className="button ankiDeckCarouselShowNext"
            type="button"
            disabled={revealed && safeIndex === notes.length - 1}
            onClick={showOrNext}
          >
            {revealed ? 'Next' : 'Show'}
          </button>
          <button
            className="button button-primary ankiDeckCarouselNavButton"
            type="button"
            aria-label="Next card"
            disabled={safeIndex === notes.length - 1}
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
        aria-valuemax={totalSegments}
        aria-valuenow={filledSegments}
      >
        <div
          className="ankiDeckCarouselBarFill"
          style={{ width: `${(filledSegments / totalSegments) * 100}%` }}
        />
      </div>
      <div className="ankiDeckCarouselStage">
        {renderNote(
          notes[safeIndex],
          safeIndex,
          cardRef,
          'carousel',
          setRevealed,
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
        {revealed ? (
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
