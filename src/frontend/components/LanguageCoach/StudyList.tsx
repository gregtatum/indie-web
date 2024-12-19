import * as React from 'react';
import './StudyList.css';
import { Stem } from 'frontend/@types';
import { Hooks, $$, A } from 'frontend';
import { boldWords, computeStems } from 'frontend/logic/language-tools';
import { useHunspell, useStemNavigation } from './hooks';

export function StudyList() {
  const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const stemsContainer = React.useRef<HTMLDivElement | null>(null);
  useStemNavigation(stemsContainer);

  const dispatch = Hooks.useDispatch();
  const stems = $$.getUnknownStems();
  const selectedStem = $$.getSelectedStemIndex();
  const languageCode = $$.getLanguageCode();
  const selectedSentences = $$.getSelectedSentences();
  const lastReadingPath = $$.getLastReadingPath();

  let defaultText: string = '';
  if (lastReadingPath) {
    const fileCache = $$.getDownloadFileCache();
    const downloadedFile = fileCache.get(lastReadingPath);
    if (downloadedFile) {
      defaultText = downloadedFile.text;
    }
  }

  const [text, setText] = React.useState<string>('');
  const hunspell = useHunspell();
  const [showLearnMore, setShowLearnMore] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (text && hunspell) {
      dispatch(A.stemFrequencyAnalysis(computeStems(hunspell, text)));
    }
  }, [text, hunspell]);

  return (
    <div className="lcStudyList">
      <div className="lcStudyListTop">
        <p>
          Paste text from a book, article, or podcast transcript into the box to
          create a study list. This will give you the most frequent words in the
          text that you don&apos;t know yet. Your learned words won&apos;t show
          up in the list.{' '}
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
            <p className="lcStudyListCodes">
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
          className="lcStudyListTextArea"
          ref={textAreaRef}
          placeholder="Paste your text here…"
          defaultValue={defaultText}
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
          className="lcButton lcStudyListAddButton"
        >
          Get the study List
        </button>
      </div>
      <div className="lcStudyListStems" tabIndex={0} ref={stemsContainer}>
        {stems ? (
          <>
            <div className="lcStudyListStemsRow lcStudyListStemsHeader">
              <div className="lcStudyListStemsHeaderRight">Count</div>
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

  let className = 'lcStudyListStemsRow';
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
      <div className="lcStudyListStemsCount">{stem.frequency}</div>
      <div>{stem.stem}</div>
      <div lang={languageCode}>{stem.tokens.join(', ')}</div>
      <div className="lcStudyListButtons">
        <button
          type="button"
          className="lcStudyListButton button"
          onClick={() => dispatch(A.learnStem(stem.stem))}
        >
          learn
        </button>
        <button
          type="button"
          className="lcStudyListButton button"
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
