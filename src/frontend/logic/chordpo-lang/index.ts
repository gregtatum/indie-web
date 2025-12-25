import { LRLanguage, LanguageSupport } from '@codemirror/language';
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
export function ChordPro() {
  return new LanguageSupport(ChordProLanguage, [
    ChordProLanguage.data.of({
      autocomplete: chordproCompletionSource,
    }),
  ]);
}

export { exampleStringLinter } from './lint';
