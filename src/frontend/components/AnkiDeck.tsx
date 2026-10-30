import * as React from 'react';
import * as T from 'frontend/@types';
import './AnkiDeck.css';

interface AnkiDeckProps {
  parsed: T.ParsedAnkiFile;
}

export function AnkiDeck({ parsed }: AnkiDeckProps) {
  const basicNotes = parsed.notes.filter(isBasicNote);
  return (
    <div className="ankiDeck" data-testid="ankiDeck">
      {basicNotes.map((note, index) => (
        <AnkiBasicCard key={index} note={note} />
      ))}
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
