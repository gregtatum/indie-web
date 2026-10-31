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
  isFullyRevealed: () => boolean;
}

function AnkiStudyCarousel({ notes, containerRef }: AnkiStudyCarouselProps) {
  const [index, setIndex] = React.useState(0);
  const cardRef = React.useRef<AnkiCardHandle>(null);
  const totalSegments = Math.max(notes.length - 1, 1);
  const filledSegments = Math.min(index + 1, totalSegments);

  const goPrevious = React.useCallback(() => {
    setIndex((value) => Math.max(value - 1, 0));
  }, []);
  const goNext = React.useCallback(() => {
    setIndex((value) => Math.min(value + 1, notes.length - 1));
  }, [notes.length]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!containerRef.current?.contains(document.activeElement)) {
        return;
      }
      switch (event.key) {
        case ' ':
        case 'Enter':
          event.preventDefault();
          if (cardRef.current?.isFullyRevealed()) {
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
  }, [containerRef, goPrevious, goNext]);

  return (
    <>
      <div className="ankiDeckCarouselProgress">
        Card {index + 1} / {notes.length}
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
        {renderNote(notes[index], index, cardRef, 'carousel')}
      </div>
      <div className="ankiDeckCarouselNav">
        <button
          className="button"
          type="button"
          disabled={index === 0}
          onClick={goPrevious}
        >
          Previous
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={index === notes.length - 1}
          onClick={goNext}
        >
          Next
        </button>
      </div>
    </>
  );
}

type AnkiCardVariant = 'carousel' | 'list';

function renderNote(
  note: T.AnkiNote,
  key: number,
  ref: React.Ref<AnkiCardHandle> | undefined,
  variant: AnkiCardVariant,
) {
  if (note.clozeSpans !== null) {
    return <AnkiClozeCard key={key} note={note} ref={ref} variant={variant} />;
  }
  if (isBasicNote(note)) {
    return <AnkiBasicCard key={key} note={note} ref={ref} variant={variant} />;
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
}

const AnkiBasicCard = React.forwardRef<AnkiCardHandle, AnkiBasicCardProps>(
  function AnkiBasicCard({ note, variant }, ref) {
    const [revealed, setRevealed] = React.useState(false);
    const isStage = variant === 'carousel';

    React.useImperativeHandle(
      ref,
      () => ({
        revealAll: () => setRevealed(true),
        isFullyRevealed: () => revealed,
      }),
      [revealed],
    );

    return (
      <div
        className={isStage ? 'ankiDeckCard ankiDeckCardStage' : 'ankiDeckCard'}
      >
        {isStage && note.deck ? (
          <div className="ankiDeckDeckLabel">{formatDeckPath(note.deck)}</div>
        ) : null}
        <div className="ankiDeckCardFront">{note.fields[0]}</div>
        <div className="ankiDeckCardRevealRow">
          <button
            className="button ankiDeckCardReveal"
            type="button"
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? 'Hide answer' : 'Show answer'}
          </button>
          {isStage ? (
            <span className="ankiDeckKbd" aria-hidden="true">
              Space
            </span>
          ) : null}
        </div>
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
}

const AnkiClozeCard = React.forwardRef<AnkiCardHandle, AnkiClozeCardProps>(
  function AnkiClozeCard({ note, variant }, ref) {
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

    React.useImperativeHandle(
      ref,
      () => ({
        revealAll: () => setRevealedNums(new Set(clozeNums)),
        isFullyRevealed: () => clozeNums.every((num) => revealedNums.has(num)),
      }),
      [revealedNums, clozeNums],
    );

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
        {isStage ? (
          <div className="ankiDeckClozeHint">
            <span className="ankiDeckKbd" aria-hidden="true">
              Space
            </span>{' '}
            reveals all
          </div>
        ) : null}
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
