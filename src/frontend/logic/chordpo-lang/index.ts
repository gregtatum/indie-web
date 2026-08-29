import {
  LRLanguage,
  LanguageSupport,
  HighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { chordproCompletionSource } from './completion';
import { parser } from './syntax.grammar.ts';

export const ChordProLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      styleTags({
        Chord: t.keyword,
        Comment: t.lineComment,
        DirectiveName: t.tagName,
        DirectiveValue: t.attributeValue,
        Title: t.heading1,
        Author: t.meta,
        SectionName: t.name,
        'Section/...': t.heading2,
        Lyric: t.content,
        '{ }': t.brace,
        '[ ]': t.squareBracket,
        ':': t.punctuation,
        Separator: t.separator,
      }),
    ],
    dialect: 'noTitle',
  }),
  languageData: {
    commentTokens: { line: '#' },
  },
});
const chordProHighlightStyle = HighlightStyle.define(
  [
    { tag: t.keyword, color: 'var(--accent-strong)', fontWeight: '700' },
    { tag: t.squareBracket, color: 'var(--accent-strong)' },
    { tag: t.tagName, color: 'var(--accent-strong)' },
    { tag: t.attributeValue, color: 'var(--syntax-string)' },
    { tag: [t.brace, t.punctuation, t.separator], color: 'var(--muted)' },
    { tag: t.lineComment, color: 'var(--muted)', fontStyle: 'italic' },
    {
      tag: [t.heading1, t.heading2, t.name],
      color: 'var(--ink)',
      fontWeight: '700',
    },
    { tag: t.meta, color: 'var(--muted)' },
  ],
  { scope: ChordProLanguage },
);

export function ChordPro() {
  return new LanguageSupport(ChordProLanguage, [
    ChordProLanguage.data.of({
      autocomplete: chordproCompletionSource,
    }),
    syntaxHighlighting(chordProHighlightStyle),
  ]);
}

export { exampleStringLinter } from './lint';
