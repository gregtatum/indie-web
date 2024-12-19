import { ensureExists } from 'frontend/utils';
import { T } from 'frontend';

export const languages: Array<T.Language> = [
  {
    code: 'hy',
    long: 'Armenian',
    short: 'Armenian',
  },
  {
    code: 'eu',
    long: 'Basque',
    short: 'Basque',
  },
  {
    code: 'br',
    long: 'Breton',
    short: 'Breton',
  },
  {
    code: 'bg',
    long: 'Bulgarian',
    short: 'Bulgarian',
  },
  {
    code: 'ca',
    long: 'Catalan',
    short: 'Catalan',
  },
  {
    code: 'hr',
    long: 'Croatian',
    short: 'Croatian',
  },
  {
    code: 'cs',
    long: 'Czech',
    short: 'Czech',
  },
  {
    code: 'da',
    long: 'Danish',
    short: 'Danish',
  },
  {
    code: 'nl',
    long: 'Dutch',
    short: 'Dutch',
  },
  {
    code: 'en',
    long: 'English',
    short: 'English',
  },
  {
    code: 'en-AU',
    long: 'English (Australian)',
    short: 'English',
  },
  {
    code: 'en-GB',
    long: 'English (British)',
    short: 'English',
  },
  {
    code: 'en-CA',
    long: 'English (Canadian)',
    short: 'English',
  },
  {
    code: 'en-ZA',
    long: 'English (South Africa)',
    short: 'English',
  },
  {
    code: 'eo',
    long: 'Esperanto',
    short: 'Esperanto',
  },
  {
    code: 'et',
    long: 'Estonian',
    short: 'Estonian',
  },
  {
    code: 'fo',
    long: 'Faroese',
    short: 'Faroese',
  },
  {
    code: 'fr',
    long: 'French',
    short: 'French',
  },
  {
    code: 'fur',
    long: 'Friulian',
    short: 'Friulian',
  },
  {
    code: 'gl',
    long: 'Galician',
    short: 'Galician',
  },
  {
    code: 'ka',
    long: 'Georgian',
    short: 'Georgian',
  },
  {
    code: 'de',
    long: 'German',
    short: 'German',
  },
  {
    code: 'de-AT',
    long: 'German (Austrian)',
    short: 'German',
  },
  {
    code: 'de-CH',
    long: 'German (Swiss High)',
    short: 'German',
  },
  {
    code: 'el',
    long: 'Greek',
    short: 'Greek',
  },
  {
    code: 'el-polyton',
    long: 'Greek (Polytonic)',
    short: 'Greek',
  },
  {
    code: 'he',
    long: 'Hebrew',
    short: 'Hebrew',
  },
  {
    code: 'hu',
    long: 'Hungarian',
    short: 'Hungarian',
  },
  {
    code: 'is',
    long: 'Icelandic',
    short: 'Icelandic',
  },
  {
    code: 'ia',
    long: 'Interlingua',
    short: 'Interlingua',
  },
  {
    code: 'ie',
    long: 'Interlingue',
    short: 'Interlingue',
  },
  {
    code: 'ga',
    long: 'Irish',
    short: 'Irish',
  },
  {
    code: 'it',
    long: 'Italian',
    short: 'Italian',
  },
  {
    code: 'rw',
    long: 'Kinyarwanda',
    short: 'Kinyarwanda',
  },
  {
    code: 'tlh',
    long: 'Klingon',
    short: 'Klingon',
  },
  {
    code: 'tlh-Latn',
    long: 'Klingon (Latin)',
    short: 'Klingon',
  },
  {
    code: 'ko',
    long: 'Korean',
    short: 'Korean',
  },
  {
    code: 'ltg',
    long: 'Latgalian',
    short: 'Latgalian',
  },
  {
    code: 'la',
    long: 'Latin',
    short: 'Latin',
  },
  {
    code: 'lv',
    long: 'Latvian',
    short: 'Latvian',
  },
  {
    code: 'lt',
    long: 'Lithuanian',
    short: 'Lithuanian',
  },
  {
    code: 'nds',
    long: 'Low German',
    short: 'Low German',
  },
  {
    code: 'lb',
    long: 'Luxembourgish',
    short: 'Luxembourgish',
  },
  {
    code: 'mk',
    long: 'Macedonian',
    short: 'Macedonian',
  },
  {
    code: 'mn',
    long: 'Mongolian',
    short: 'Mongolian',
  },
  {
    code: 'ne',
    long: 'Nepali',
    short: 'Nepali',
  },
  {
    code: 'nb',
    long: 'Norwegian Bokmål',
    short: 'Norwegian',
  },
  {
    code: 'nn',
    long: 'Norwegian Nynorsk',
    short: 'Norwegian',
  },
  {
    code: 'oc',
    long: 'Occitan',
    short: 'Occitan',
  },
  {
    code: 'fa',
    long: 'Persian',
    short: 'Persian',
  },
  {
    code: 'pl',
    long: 'Polish',
    short: 'Polish',
  },
  {
    code: 'pt',
    long: 'Portuguese',
    short: 'Portuguese',
  },
  {
    code: 'pt-PT',
    long: 'Portuguese (European)',
    short: 'Portuguese',
  },
  {
    code: 'ro',
    long: 'Romanian',
    short: 'Romanian',
  },
  {
    code: 'ru',
    long: 'Russian',
    short: 'Russian',
  },
  {
    code: 'gd',
    long: 'Scottish Gaelic',
    short: 'Gaelic',
  },
  {
    code: 'sr',
    long: 'Serbian',
    short: 'Serbian',
  },
  {
    code: 'sr-Latn',
    long: 'Serbian (Latin)',
    short: 'Serbian',
  },
  {
    code: 'sk',
    long: 'Slovak',
    short: 'Slovak',
  },
  {
    code: 'sl',
    long: 'Slovenian',
    short: 'Slovenian',
  },
  {
    code: 'es',
    long: 'Spanish',
    short: 'Spanish',
  },
  {
    code: 'es-AR',
    long: 'Spanish (Argentina)',
    short: 'Spanish',
  },
  {
    code: 'es-BO',
    long: 'Spanish (Bolivia)',
    short: 'Spanish',
  },
  {
    code: 'es-CL',
    long: 'Spanish (Chile)',
    short: 'Spanish',
  },
  {
    code: 'es-CO',
    long: 'Spanish (Colombia)',
    short: 'Spanish',
  },
  {
    code: 'es-CR',
    long: 'Spanish (Costa Rica)',
    short: 'Spanish',
  },
  {
    code: 'es-CU',
    long: 'Spanish (Cuba)',
    short: 'Spanish',
  },
  {
    code: 'es-DO',
    long: 'Spanish (Dominican Republic)',
    short: 'Spanish',
  },
  {
    code: 'es-EC',
    long: 'Spanish (Ecuador)',
    short: 'Spanish',
  },
  {
    code: 'es-SV',
    long: 'Spanish (El Salvador)',
    short: 'Spanish',
  },
  {
    code: 'es-GT',
    long: 'Spanish (Guatemala)',
    short: 'Spanish',
  },
  {
    code: 'es-HN',
    long: 'Spanish (Honduras)',
    short: 'Spanish',
  },
  {
    code: 'es-MX',
    long: 'Spanish (Mexico)',
    short: 'Spanish',
  },
  {
    code: 'es-NI',
    long: 'Spanish (Nicaragua)',
    short: 'Spanish',
  },
  {
    code: 'es-PA',
    long: 'Spanish (Panama)',
    short: 'Spanish',
  },
  {
    code: 'es-PY',
    long: 'Spanish (Paraguay)',
    short: 'Spanish',
  },
  {
    code: 'es-PE',
    long: 'Spanish (Peru)',
    short: 'Spanish',
  },
  {
    code: 'es-PH',
    long: 'Spanish (Philippines)',
    short: 'Spanish',
  },
  {
    code: 'es-PR',
    long: 'Spanish (Puerto Rico)',
    short: 'Spanish',
  },
  {
    code: 'es-US',
    long: 'Spanish (United States)',
    short: 'Spanish',
  },
  {
    code: 'es-UY',
    long: 'Spanish (Uruguay)',
    short: 'Spanish',
  },
  {
    code: 'es-VE',
    long: 'Spanish (Venezuela)',
    short: 'Spanish',
  },
  {
    code: 'sv',
    long: 'Swedish',
    short: 'Swedish',
  },
  {
    code: 'sv-FI',
    long: 'Swedish (Finland)',
    short: 'Swedish (Finland)',
  },
  {
    code: 'tr',
    long: 'Turkish',
    short: 'Turkish',
  },
  {
    code: 'tk',
    long: 'Turkmen',
    short: 'Turkmen',
  },
  {
    code: 'uk',
    long: 'Ukrainian',
    short: 'Ukrainian',
  },
  {
    code: 'ca-valencia',
    long: 'Valencian',
    short: 'Valencian',
  },
  {
    code: 'vi',
    long: 'Vietnamese',
    short: 'Vietnamese',
  },
  {
    code: 'hyw',
    long: 'Western Armenian',
    short: 'Western Armenian',
  },
  {
    code: 'fy',
    long: 'Western Frisian',
    short: 'Western Frisian',
  },
];

let byCode: Map<string, T.Language> | void;

export function getLanguageByCode(code: string): T.Language {
  if (!byCode) {
    byCode = new Map();
    for (const language of languages) {
      byCode.set(language.code, language);
    }
  }

  return ensureExists(byCode.get(code), 'Code does not exist');
}
