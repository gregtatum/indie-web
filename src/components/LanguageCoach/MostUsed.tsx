import * as React from 'react';
import './MostUsed.css';
import { Stem } from 'src/@types';
import { Hunspell, loadModule } from 'hunspell-asm';
import { Hooks, $$, A } from 'src';
import { isElementInViewport } from 'src/utils';

function segmentSentence(text: string, locale = 'es'): string[] {
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

function segmentWords(text: string, locale = 'es'): string[] {
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

function computeStems(hunspell: Hunspell, text: string, locale = 'es'): Stem[] {
  const stemsByStem: Map<string, Stem> = new Map();
  for (const sentence of segmentSentence(text, locale)) {
    for (const word of segmentWords(sentence, locale)) {
      const stemmedWord = hunspell?.stem(word)[0] ?? word;
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
      if (!stem.tokens.includes(word)) {
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

function boldWords(sentence: string, tokens: string[]) {
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

export function MostUsed() {
  const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const stemsContainer = React.useRef<HTMLDivElement | null>(null);

  const dispatch = Hooks.useDispatch();
  const stems = $$.getUnknownStems();
  const selectedStem = $$.getSelectedStemIndex();
  const languageCode = $$.getLanguageCode();
  const selectedSentences = $$.getSelectedSentences();

  const [text, setText] = React.useState<string>('');
  const [hunspell, setHunspell] = React.useState<Hunspell | undefined>();
  const [showLearnMore, setShowLearnMore] = React.useState<boolean>(false);

  React.useEffect(() => {
    // TODO - Implement proper async behavior here and error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const affResponse = await fetch(`dictionaries/${languageCode}/index.aff`);
      const dicResponse = await fetch(`dictionaries/${languageCode}/index.dic`);
      const affBuffer = new Uint8Array(await affResponse.arrayBuffer());
      const dicBuffer = new Uint8Array(await dicResponse.arrayBuffer());

      const hunspellFactory = await loadModule();

      const affFile = hunspellFactory.mountBuffer(
        affBuffer,
        `${languageCode}.aff`,
      );
      const dictFile = hunspellFactory.mountBuffer(
        dicBuffer,
        `${languageCode}.dic`,
      );

      console.log(`Hunspell loaded for "${languageCode}".`);
      setHunspell(hunspellFactory.create(affFile, dictFile));
    })().catch((error) => console.error(error));
  }, [languageCode]);

  React.useEffect(() => {
    if (text && hunspell) {
      dispatch(A.stemFrequencyAnalysis(computeStems(hunspell, text)));
    }
  }, [text, hunspell]);

  Hooks.useListener(stemsContainer, 'keydown', [], (event) => {
    let stemIndex;
    const keyboardEvent = event as KeyboardEvent;

    switch (keyboardEvent.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Prevent scrolling.
        event.preventDefault();
        break;
      default:
    }

    switch (keyboardEvent.key) {
      case 'j':
      case 'ArrowDown':
        stemIndex = dispatch(A.selectNextStem(1));
        break;
      case 'k':
      case 'ArrowUp':
        stemIndex = dispatch(A.selectNextStem(-1));
        break;
      case 'i':
        dispatch(A.ignoreSelectedStem());
        break;
      case 'l':
        dispatch(A.learnSelectedStem());
        break;
      case 'ArrowLeft':
        dispatch(A.nextSentence(-1));
        break;
      case 'ArrowRight':
        dispatch(A.nextSentence(1));
        break;
      case 'z':
        if (
          (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
          !keyboardEvent.shiftKey
        ) {
          dispatch(A.applyUndo());
        }
        break;
      default:
      // Do nothing.
    }
    if (stemIndex !== undefined) {
      const selector = `[data-stem-index="${stemIndex}"]`;
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Could not find stem element from ${selector}`);
      }

      if (!isElementInViewport(element)) {
        element.scrollIntoView();
      }
    }
  });

  return (
    <div className="lcMostUsed AppScroll">
      <div className="lcMostUsedTop">
        <p>
          Paste text from a book, article, or podcast transcript into the box to
          find the most used words. This will give you a targeted list of new
          words to study. Your learned words will be hidden from the list.{' '}
          {showLearnMore ? null : (
            <button
              type="button"
              className="inline-button"
              onClick={() => setShowLearnMore(true)}
            >
              Learn more…
            </button>
          )}
        </p>
        {showLearnMore ? (
          <>
            <h2>Keyboard Shortcuts</h2>
            <p>
              You can build up your vocab list very quickly by using keyboard
              shortcuts. Marking a word as learned adds it to your vocab list so
              that you can see your progress on your language learning journey.
              Marking a word as ignored hides the word. This is useful for
              invented words, or proper nouns.
            </p>
            <p className="lcMostUsedCodes">
              <code>k</code>, <code>↑</code> - Move the selected row up.
              <br />
              <code>j</code>, <code>↓</code> - Move the selected row down.
              <br />
              <code>l</code> - Mark a word as learned.
              <br />
              <code>i</code> - Mark a word as ignored.
              <br />
              <code>ctrl + z</code> - Undo the action.
              <br />
              <code>←</code>, <code>→</code> - Change the selected sentence
              <br />
            </p>
            <h2>Word Roots</h2>
            <p>
              Words are grouped by their word roots, which may remove part of
              the word, such as the verb ending or the pluralization. This way
              variations of words are grouped around the same root.
            </p>
            <p>
              {showLearnMore ? (
                <button
                  type="button"
                  className="inline-button"
                  onClick={() => setShowLearnMore(false)}
                >
                  Hide learn more.
                </button>
              ) : null}
            </p>
          </>
        ) : null}
        <textarea
          className="lcMostUsedTextArea"
          ref={textAreaRef}
          placeholder="Paste your text here…"
        />
        <button
          onClick={() => {
            const textArea = textAreaRef.current;
            if (textArea) {
              // Normalize the text as hunspell doesn't seem to handle decomposed unicode
              // graphemes. Use decomposition -> composition to ensure a consistent
              // stemming.
              setText(textArea.value.normalize('NFC'));
            }
            stemsContainer.current?.focus();
          }}
          className="button mostUsedStartButton"
        >
          Get the Word List
        </button>
      </div>
      <div className="lcMostUsedStems" tabIndex={0} ref={stemsContainer}>
        {stems ? (
          <>
            <div className="lcMostUsedStemsRow lcMostUsedStemsHeader">
              <div className="lcMostUsedStemsHeaderRight">Count</div>
              <div>Word Root</div>
              <div>Word Uses</div>
              <div></div>
              <div>Sentences</div>
            </div>
            {stems.map((stem, stemIndex) => (
              <StemRow
                stem={stem}
                key={stemIndex}
                stemIndex={stemIndex}
                selectedStem={selectedStem}
                stemsContainer={stemsContainer}
                languageCode={languageCode}
                selectedSentence={selectedSentences.get(stem.stem) ?? 0}
              />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

interface StemRowProps {
  stem: Stem;
  stemIndex: number;
  selectedStem: number | null;
  stemsContainer: React.RefObject<HTMLDivElement | null>;
  languageCode: string;
  selectedSentence: number;
}

function StemRow({
  stem,
  selectedStem,
  stemIndex,
  stemsContainer,
  languageCode,
  selectedSentence,
}: StemRowProps) {
  const dispatch = Hooks.useDispatch();
  const isSelected = selectedStem === stemIndex;

  let className = 'lcMostUsedStemsRow';
  if (isSelected) {
    className += ' selected';
  }

  return (
    <div
      className={className}
      onClick={() => {
        dispatch(A.selectStem(stemIndex));
        stemsContainer.current?.focus();
      }}
      aria-selected={isSelected}
      data-stem-index={stemIndex}
    >
      <div className="lcMostUsedStemsCount">{stem.frequency}</div>
      <div>{stem.stem}</div>
      <div lang={languageCode}>{stem.tokens.join(', ')}</div>
      <div className="lcMostUsedButtons">
        <button
          type="button"
          className="lcMostUsedButton button"
          onClick={() => dispatch(A.learnStem(stem.stem))}
        >
          learn
        </button>
        <button
          type="button"
          className="lcMostUsedButton button"
          onClick={() => dispatch(A.ignoreStem(stem.stem))}
        >
          ignore
        </button>
      </div>
      <div lang={languageCode}>
        {boldWords(stem.sentences[selectedSentence], stem.tokens)}
      </div>
    </div>
  );
}
