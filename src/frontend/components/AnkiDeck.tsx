import * as React from 'react';
import * as T from 'frontend/@types';
import './AnkiDeck.css';

interface AnkiDeckProps {
  parsed: T.ParsedAnkiFile;
}

type DeckMode = 'study' | 'full';

export function AnkiDeck({ parsed }: AnkiDeckProps) {
  const [mode, setMode] = React.useState<DeckMode>('study');
  const { notes } = parsed;

  return (
    <div className="ankiDeck" data-testid="ankiDeck">
      <button
        className="button ankiDeckModeToggle"
        type="button"
        onClick={() => setMode(mode === 'study' ? 'full' : 'study')}
      >
        {mode === 'study' ? 'Show full list' : 'Study mode'}
      </button>
      {mode === 'study' ? (
        <AnkiStudyCarousel notes={notes} />
      ) : (
        notes.map((note, index) => renderNote(note, index))
      )}
    </div>
  );
}

interface AnkiStudyCarouselProps {
  notes: T.AnkiNote[];
}

// A card's reveal state lives inside AnkiBasicCard/AnkiClozeCard (so each card
// in the full-list view stays independent), but the carousel's Space/Enter
// shortcut needs to know "is the current card's answer fully shown yet" to
// decide between revealing it and advancing. This handle exposes just that,
// following the same activeElement-containment pattern as the music library's
// keyboard navigation (src/frontend/components/Music/MusicLibraryView.tsx):
// a single document-level listener, guarded by whether focus is inside this
// component's container, rather than per-element key handlers.
interface AnkiCardHandle {
  revealAll: () => void;
  isFullyRevealed: () => boolean;
}

function AnkiStudyCarousel({ notes }: AnkiStudyCarouselProps) {
  const [index, setIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<AnkiCardHandle>(null);
  // The bar has one fewer segment than there are cards (the gaps between
  // them), so the first card already fills one segment and the last card
  // completes the bar, rather than leaving a trailing empty segment.
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
  }, [goPrevious, goNext]);

  return (
    <div
      className="ankiDeckCarousel"
      data-testid="ankiDeckCarousel"
      ref={containerRef}
      tabIndex={0}
    >
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
      {renderNote(notes[index], index, cardRef)}
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
          className="button"
          type="button"
          disabled={index === notes.length - 1}
          onClick={goNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function renderNote(
  note: T.AnkiNote,
  key: number,
  ref?: React.Ref<AnkiCardHandle>,
) {
  if (note.clozeSpans !== null) {
    return <AnkiClozeCard key={key} note={note} ref={ref} />;
  }
  if (isBasicNote(note)) {
    return <AnkiBasicCard key={key} note={note} ref={ref} />;
  }
  return null;
}

function isBasicNote(note: T.AnkiNote): boolean {
  return note.notetype === null || note.notetype.toLowerCase() === 'basic';
}

interface AnkiBasicCardProps {
  note: T.AnkiNote;
}

const AnkiBasicCard = React.forwardRef<AnkiCardHandle, AnkiBasicCardProps>(
  function AnkiBasicCard({ note }, ref) {
    const [revealed, setRevealed] = React.useState(false);

    React.useImperativeHandle(
      ref,
      () => ({
        revealAll: () => setRevealed(true),
        isFullyRevealed: () => revealed,
      }),
      [revealed],
    );

    return (
      <div className="ankiDeckCard">
        <div className="ankiDeckCardFront">{note.fields[0]}</div>
        <button
          className="button ankiDeckCardReveal"
          type="button"
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? 'Hide answer' : 'Show answer'}
        </button>
        {revealed ? (
          <div className="ankiDeckCardBack">{note.fields[1]}</div>
        ) : null}
      </div>
    );
  },
);

interface AnkiClozeCardProps {
  note: T.AnkiNote;
}

const AnkiClozeCard = React.forwardRef<AnkiCardHandle, AnkiClozeCardProps>(
  function AnkiClozeCard({ note }, ref) {
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

    return (
      <div className="ankiDeckCard">
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
