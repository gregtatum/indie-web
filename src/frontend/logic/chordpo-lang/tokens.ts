import {
  titleText,
  authorText,
  chordLineStart,
  directiveLineStart,
  blankLine,
  Comment,
  SectionName,
  Chord,
  Dialect_noTitle,
} from './syntax.grammar.terms.ts';
import { ExternalTokenizer, InputStream } from '@lezer/lr';

const Ch = {
  Eof: -1,
  Tab: 9,
  Newline: 10,
  Return: 13,
  Space: 32,
  Hash: 35,
  ParenL: 40,
  ParenR: 41,
  Plus: 42,
  Dash: 45,
  Dot: 46,
  Slash: 47,
  Zero: 48,
  One: 49,
  Seven: 55,
  Nine: 57,
  Colon: 58,
  A: 65,
  G: 71,
  I: 73,
  M: 77,
  V: 86,
  Z: 90,
  Underscore: 95,
  Backtick: 96,
  a: 97,
  b: 98,
  d: 100,
  g: 103,
  i: 105,
  j: 106,
  m: 109,
  n: 110,
  o: 111,
  r: 114,
  s: 115,
  t: 116,
  u: 117,
  v: 118,
  x: 120,
  z: 122,
  BraceL: 123,
  Pipe: 124,
  BraceR: 125,
} as const;

function readSymbolNote(input: InputStream) {
  if (input.next < Ch.A || input.next > Ch.G) return false;
  input.advance();
  if (input.next == Ch.b || input.next == Ch.Hash) input.advance();
  return true;
}

function numeralChar(code: number) {
  return code == Ch.I || code == Ch.V || code == Ch.i || code == Ch.v;
}

function readNumeralNote(input: InputStream) {
  let off = 0;
  if (input.next == Ch.b || input.next == Ch.Hash) off++;
  if (!numeralChar(input.peek(off))) return false;
  input.advance(off + 1);
  if (numeralChar(input.next)) input.advance();
  if (numeralChar(input.next)) input.advance();
  return true;
}

function readNumericNote(input: InputStream) {
  let off = 0;
  if (input.next == Ch.b || input.next == Ch.Hash) off++;
  const next = input.peek(off);
  if (next < Ch.One || next > Ch.Seven) return false;
  input.advance(off + 1);
  return true;
}

function readSuffixPart(input: InputStream, off: number) {
  const n = input.peek(off);
  if (n < 0) return off;
  if (
    n == Ch.b ||
    n == Ch.Hash ||
    n == Ch.o ||
    n == Ch.x ||
    n == Ch.Plus ||
    n == Ch.Dash ||
    (n >= Ch.Zero && n <= Ch.Nine)
  )
    return off + 1;
  const n1 = input.peek(off + 1),
    n2 = input.peek(off + 2);
  if (n == Ch.n && n1 == Ch.o) return off + 2; // no
  if (n == Ch.s && n1 == Ch.u && n2 == Ch.s) return off + 3; // sus
  if (n == Ch.a && ((n1 == Ch.d && n2 == Ch.d) || (n1 == Ch.u && n2 == Ch.g)))
    return off + 3; // add/aug
  if (n == Ch.d && (n1 == Ch.i || n1 == Ch.o) && n2 == Ch.m) return off + 3; // dim/dom
  if (n == Ch.u && n1 == Ch.n && n2 == Ch.i && input.peek(off + 3) == Ch.s)
    return off + 4; // unis
  if (n == Ch.t && n1 == Ch.r && n2 == Ch.i) {
    for (let i = off + 3; i < off + 8; i++)
      if (input.peek(i) != 'triangle'.charCodeAt(i)) return off;
    return off + 8;
  }
  // Major/Majj/Minor or some prefix of that
  if (n == Ch.m || n == Ch.M) {
    if (n1 == Ch.a) {
      if (n2 == Ch.j) {
        const n3 = input.peek(off + 3);
        if (n3 == Ch.j) return off + 4;
        if (n3 == Ch.o && input.peek(off + 4) == Ch.r) return off + 5;
        return off + 3;
      }
      return off + 2;
    } else if (n1 == Ch.i) {
      if (n2 == Ch.n) {
        if (input.peek(off + 3) == Ch.o && input.peek(off + 4) == Ch.r)
          return off + 5;
        return off + 3;
      }
      return off + 2;
    }
    return off + 1;
  }
  return off;
}

function readSuffixParts(input: InputStream, off: number) {
  for (;;) {
    const next = readSuffixPart(input, off);
    if (next == off) return off;
    off = next;
  }
}

function readChordSuffix(input: InputStream) {
  let off = 0;
  for (;;) {
    if (input.peek(off) == Ch.ParenL) {
      const end = readSuffixParts(input, off + 1);
      if (input.peek(end) != Ch.ParenR) break;
      off = end + 1;
    } else {
      const end = readSuffixParts(input, off);
      if (end == off) break;
      off = end;
    }
  }
  if (off) input.advance(off);
}

function readChord(input: InputStream) {
  const parens = input.next == Ch.ParenL;
  if (parens) input.advance();
  if (readSymbolNote(input)) {
    readChordSuffix(input);
    if (input.next == Ch.Slash) {
      input.advance();
      readSymbolNote(input);
    }
  } else if (readNumeralNote(input)) {
    readChordSuffix(input);
    if (input.next == Ch.Slash) {
      input.advance();
      readNumeralNote(input);
    }
  } else if (readNumericNote(input)) {
    readChordSuffix(input);
    if (input.next == Ch.Slash) {
      input.advance();
      if (
        !readNumericNote(input) &&
        ((input.next as any) == Ch.b || (input.next as any) == Ch.Hash)
      )
        input.advance();
    }
  } else if (input.next == Ch.Slash) {
    input.advance();
    readSymbolNote(input) || readNumeralNote(input) || readNumericNote(input);
  } else if (
    input.next == Ch.Pipe ||
    input.next == Ch.Dash ||
    input.next == Ch.x
  ) {
    input.advance();
  } else {
    return false;
  }
  if (parens) {
    if (input.next == Ch.ParenR) input.advance();
    else return false;
  }
  return true;
}

function endOfLine(ch: number) {
  return ch == Ch.Newline || ch == Ch.Return || ch == Ch.Eof;
}

function wordChar(ch: number) {
  return (
    (ch >= Ch.Zero && ch <= Ch.Nine) ||
    (ch >= Ch.A && ch <= Ch.Z) ||
    (ch >= Ch.a && ch <= Ch.z) ||
    ch == Ch.Underscore
  );
}

function hasDirectiveName(input: InputStream) {
  if (!wordChar(input.next)) return false;
  let off = 1;
  while (wordChar(input.peek(off))) off++;
  if (input.peek(off) != Ch.Colon) return false;
  off++;
  while (input.peek(off) == Ch.Space) off++;
  return !endOfLine(input.peek(off));
}

const sectionHeaders = [
  'verse',
  'chorus',
  'bridge',
  'tag',
  'interlude',
  'instrumental',
  'inst',
  'intro',
];
const sectionHeadersUpper = sectionHeaders.map((h) => h.toUpperCase());

function readSectionHeader(input: InputStream) {
  headers: for (let i = 0; i < sectionHeaders.length; i++) {
    const header = sectionHeaders[i],
      upper = sectionHeadersUpper[i];
    for (let j = 0; j < header.length; j++) {
      const next = input.peek(j);
      if (next != header.charCodeAt(j) && next != upper.charCodeAt(j))
        continue headers;
    }
    const after = input.peek(header.length);
    if (
      endOfLine(after) ||
      after == Ch.Space ||
      after == Ch.Colon ||
      after == Ch.ParenL
    ) {
      input.advance(header.length);
      return true;
    }
  }
  return false;
}

function skipLine(input: InputStream) {
  while (!endOfLine(input.next)) input.advance();
}

export const line = new ExternalTokenizer((input, stack) => {
  const prev = input.peek(-1),
    startPos = input.pos;
  if (prev != -1 && prev != Ch.Newline && prev != Ch.Return) return;
  while (input.next == Ch.Space || input.next == Ch.Tab) input.advance();
  const maybeComment = input.next == Ch.Hash;

  if (input.next == Ch.Newline || input.next == Ch.Return) {
    input.acceptToken(blankLine);
  } else if (readSectionHeader(input)) {
    input.acceptToken(SectionName);
  } else if (hasDirectiveName(input)) {
    input.acceptToken(directiveLineStart);
  } else if (
    !stack.dialectEnabled(Dialect_noTitle) &&
    stack.canShift(titleText) &&
    wordChar(input.next)
  ) {
    skipLine(input);
    input.acceptToken(titleText);
  } else if (
    !stack.dialectEnabled(Dialect_noTitle) &&
    stack.canShift(authorText) &&
    wordChar(input.next)
  ) {
    skipLine(input);
    input.acceptToken(authorText);
  } else if (readChord(input)) {
    // See if this is a chord-only line
    for (;;) {
      if (endOfLine(input.next)) {
        input.acceptToken(chordLineStart, startPos - input.pos);
        return;
      } else if (input.next == Ch.Space || input.next == Ch.Tab) {
        input.advance();
      } else if (!readChord(input)) {
        return;
      }
    }
  } else if (maybeComment) {
    skipLine(input);
    input.acceptToken(Comment);
  }
});

export const chord = new ExternalTokenizer((input) => {
  if (readChord(input)) input.acceptToken(Chord);
});
