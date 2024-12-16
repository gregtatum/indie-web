import * as React from 'react';
import { Stem } from 'frontend/@types';
import { type Hunspell } from 'hunspell-asm';

export function segmentSentence(text: string, locale = 'es'): string[] {
  if (Intl.Segmenter) {
    const sentences = [];
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
    for (const { segment } of segmenter.segment(text)) {
      sentences.push(segment);
    }
    return sentences;
  }
  // Use a regular expression to split text into sentences on periods, question marks,
  // exclamation points, and newlines.
  const sentenceRegex = /[.!?]\s*|\n+/;
  return text.split(sentenceRegex);
}

export function segmentWords(text: string, locale = 'es'): string[] {
  const words = [];

  if (Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    for (const { segment, isWordLike } of segmenter.segment(text)) {
      if (isWordLike) {
        words.push(segment);
      }
    }
  } else {
    const regex = /\p{Alphabetic}+/gu;
    for (const [segment] of text.matchAll(regex)) {
      words.push(segment);
    }
  }
  return words;
}

// const sampleText = [
//   'Que trata de la condición y ejercicio del famoso hidalgo don Quijote de',
//   'la Mancha Que trata de la primera salida que de su tierra hizo el',
//   'ingenioso don Quijote Donde se cuenta la graciosa manera que tuvo don',
//   'Quijote en armarse caballero',
// ];

export function computeStems(
  hunspell: Hunspell,
  text: string,
  locale = 'es',
): Stem[] {
  const stemsByStem: Map<string, Stem> = new Map();
  const isNumeric = /^\d+$/;
  for (let sentence of segmentSentence(text, locale)) {
    sentence = sentence.trim();
    if (sentence.startsWith('http://') || sentence.startsWith('https://')) {
      // Don't stem URLs.
      continue;
    }
    for (const word of segmentWords(sentence, locale)) {
      if (word.match(isNumeric)) {
        continue;
      }
      const stemmedWord = (hunspell?.stem(word)[0] ?? word).toLowerCase();
      let stem = stemsByStem.get(stemmedWord);
      if (!stem) {
        stem = {
          stem: stemmedWord,
          frequency: 0,
          tokens: [],
          sentences: [],
        };
        stemsByStem.set(stemmedWord, stem);
      }

      const lowerCasedWord = word.toLowerCase();

      if (lowerCasedWord === word) {
        if (!stem.tokens.includes(word)) {
          // Remove any other cased versions of this word, so there aren't duplicate
          // casing varieties.
          stem.tokens = stem.tokens.filter(
            (token) => token.toLowerCase() !== lowerCasedWord,
          );
          // This word is lowercased.
          stem.tokens.push(word);
        }
      } else if (
        !stem.tokens.includes(word) &&
        !stem.tokens.includes(lowerCasedWord)
      ) {
        // Only add the token if it's not present before.
        stem.tokens.push(word);
      }

      const trimmedSentence = sentence.trim();
      if (!stem.sentences.includes(trimmedSentence)) {
        stem.sentences.push(trimmedSentence);
      }
      stem.frequency++;
    }
  }
  const stems = [...stemsByStem.values()];
  return stems.sort((a, b) => b.frequency - a.frequency);
}

export function boldWords(sentence: string, tokens: string[]) {
  const splitToken = '\uE000'; // This is a "private use" token.
  for (const token of tokens) {
    sentence = sentence.replaceAll(token, splitToken + token + splitToken);
  }
  const parts = sentence.split(splitToken);
  const results = [];
  for (let i = 0; i < parts.length; i += 2) {
    results.push(<span key={i}>{parts[i]}</span>);
    results.push(<b key={i + 1}>{parts[i + 1]}</b>);
  }
  return results;
}

export function applyClassToWords(
  sentence: string,
  tokens: string[],
  className: string,
) {
  const splitToken = '\uE000'; // This is a "private use" token.
  for (const token of tokens) {
    sentence = sentence.replaceAll(token, splitToken + token + splitToken);
  }
  const parts = sentence.split(splitToken);
  const results = [];
  for (let i = 0; i < parts.length; i += 2) {
    const key1 = sentence + i;
    const key2 = sentence + (i + 1);

    results.push(<span key={key1}>{parts[i]}</span>);
    if (parts[i + 1]) {
      results.push(
        <span key={key2} className={className}>
          {parts[i + 1]}
        </span>,
      );
    }
  }
  return results;
}
