export type TextOrChord = { type: 'text' | 'chord'; text: string };

export type LineType =
  | { type: 'line'; text: string }
  | { type: 'section'; text: string }
  | { type: 'line'; text: TextOrChord[]; hasChords: boolean };

export interface ParsedChordPro {
  directives: { [directive: string]: string };
  lines: LineType[];
}

// prettier-ignore
export type Note =
  | 'A' | 'Ab' | 'A#'
  | 'B' | 'Bb' | 'B#'
  | 'C' | 'Cb' | 'C#'
  | 'D' | 'Db' | 'D#'
  | 'E' | 'Eb' | 'E#'
  | 'F' | 'Fb' | 'F#'
  | 'G' | 'Gb' | 'G#';

export type MajorMinor = 'major' | 'minor' | 'power';

export interface Chord {
  text: string;
  baseNote: Note;
  majorMinor?: MajorMinor;
  slash?: Note;
}
