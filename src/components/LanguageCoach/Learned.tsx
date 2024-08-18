import * as React from 'react';
import { Hooks, $, $$, A, T } from 'src';
import './Learned.css';

export function Learned() {
  const learnedStems = $$.getSortedLearnedStems();
  const ignoredStems = $$.getSortedIgnoredStems();
  const languageCode = $$.getLanguageCode();

  return (
    <div className="lcLearned" key={languageCode}>
      <div className="lcLearnedIntro">
        <p>
          These are the word roots that you have marked as learned. In order to
          de-duplicate words that may vary on tense or on verb ending, the
          learned word list is stored as the root of the word. This is not
          always perfect, as the word root is generated from a dictionary.
        </p>
      </div>
      <h2>Learned Words</h2>
      <TextArea
        words={learnedStems}
        selectWords={$.getLearnedStems}
        updateWords={A.updateLearnedWords}
      />
      <h2>Ignored Words</h2>
      <TextArea
        words={ignoredStems}
        selectWords={$.getIgnoredStems}
        updateWords={A.updateIgnoredWords}
      />
    </div>
  );
}

interface TextAreaProps {
  words: string[];
  selectWords: (state: T.State) => Set<string>;
  updateWords: (stems: Set<string>) => T.Action;
}

function TextArea(props: TextAreaProps) {
  const languageCode = $$.getLanguageCode();
  const { words, selectWords, updateWords } = props;
  const { dispatch, getState } = Hooks.useStore();

  return (
    <textarea
      className="lcLearnedTextArea"
      defaultValue={words.join('\n')}
      lang={languageCode}
      spellCheck="false"
      onBlur={(event) => {
        const words = new Set<string>();
        const previousWords = selectWords(getState());

        for (const word of event.target.value.split('\n')) {
          words.add(word.trim());
        }
        words.delete('');

        if (previousWords.size === words.size) {
          let isEqual = true;
          for (const word of words) {
            if (!previousWords.has(word)) {
              isEqual = false;
              break;
            }
          }
          if (isEqual) {
            // No need to to update, these sets are equal.
            return;
          }
        }

        dispatch(updateWords(words));
      }}
    />
  );
}
