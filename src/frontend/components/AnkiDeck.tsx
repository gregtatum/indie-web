import * as React from 'react';
import * as T from 'frontend/@types';
import './AnkiDeck.css';

interface AnkiDeckProps {
  parsed: T.ParsedAnkiFile;
}

export function AnkiDeck({ parsed }: AnkiDeckProps) {
  return (
    <div className="ankiDeck" data-testid="ankiDeck">
      {parsed.notes.map((note, index) => {
        if (note.clozeSpans !== null) {
          return <AnkiClozeCard key={index} note={note} />;
        }
        if (isBasicNote(note)) {
          return <AnkiBasicCard key={index} note={note} />;
        }
        return null;
      })}
    </div>
  );
}

function isBasicNote(note: T.AnkiNote): boolean {
  return note.notetype === null || note.notetype.toLowerCase() === 'basic';
}

interface AnkiBasicCardProps {
  note: T.AnkiNote;
}

function AnkiBasicCard({ note }: AnkiBasicCardProps) {
  const [revealed, setRevealed] = React.useState(false);

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
}

interface AnkiClozeCardProps {
  note: T.AnkiNote;
}

function AnkiClozeCard({ note }: AnkiClozeCardProps) {
  const [revealedNums, setRevealedNums] = React.useState<Set<number>>(
    new Set(),
  );
  const spans = note.clozeSpans ?? [];

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
}

function clozeBlankText(
  span: Extract<T.TextOrCloze, { type: 'cloze' }>,
  revealed: boolean,
): string {
  if (revealed) {
    return span.answer;
  }
  return span.hint ? `[${span.hint}]` : '[...]';
}
