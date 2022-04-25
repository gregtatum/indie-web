// prettier-ignore
export type Note =
  | 'A' | 'Ab' | 'A#'
  | 'B' | 'Bb' | 'B#'
  | 'C' | 'Cb' | 'C#'
  | 'D' | 'Db' | 'D#'
  | 'E' | 'Eb' | 'E#'
  | 'F' | 'Fb' | 'F#'
  | 'G' | 'Gb' | 'G#';

export type ChordType =
  | 'major'
  | 'minor'
  | 'power'
  | 'augmented'
  | 'sus2'
  | 'sus4';

export interface Chord {
  text: string;
  baseNote: Note;
  type?: ChordType;
  embellishment?: string;
  slash?: Note;
  add?: string;
}

export type TextOrChord =
  | { type: 'text'; text: string }
  | { type: 'chord'; chord: Chord };

export type LineType =
  | { type: 'line'; text: string }
  | { type: 'section'; text: string }
  | { type: 'line'; text: TextOrChord[]; hasChords: boolean };

export interface ParsedChordPro {
  directives: { [directive: string]: string };
  lines: LineType[];
}
