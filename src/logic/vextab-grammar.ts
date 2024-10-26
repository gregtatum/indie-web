import { LanguageSupport, LRLanguage } from '@codemirror/language';
import { tags, styleTags } from '@lezer/highlight';
import { parser } from './vextab-generated';

export const VexTabLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      styleTags({
        tabstave: tags.namespace,
        options: tags.namespace,
        notes: tags.namespace,
        'Boolean!': tags.bool,
        'StaveAttributeName!': tags.attributeName,
        'OptionsAttributeName!': tags.attributeName,
        'StaveAttributeValue!': tags.attributeValue,
        'OptionsAttributeValue!': tags.attributeValue,
        'Note!': tags.character,
        'FretNumber!': tags.character,
        'Octave!': tags.variableName,
      }),
    ],
  }),
  languageData: {
    commentTokens: { line: '//' },
  },
});
export function VexTab() {
  return new LanguageSupport(VexTabLanguage);
}
