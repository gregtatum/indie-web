import * as React from 'react';
import { Hooks, $, A } from 'src';
import './Learned.css';

export function Learned() {
  const stems = Hooks.useSelector($.getSortedLearnedStems);
  const languageCode = Hooks.useSelector($.getLanguageCode);
  const store = Hooks.useStore();
  return (
    <div className="learned AppScroll" key={languageCode}>
      <div>
        <p className="learnedIntro">
          These are the word roots that you have marked as learned. In order to
          de-duplicate words that may vary on tense or on verb ending, the
          learned word list is stored as the root of the word. This is not
          always perfect, as the word root is generated from a dictionary.
        </p>
        <p>
          <button
            type="button"
            className="button learnedButton"
            onClick={() => {
              // Download the words.
              const link = document.createElement('a');
              const words = $.getSortedLearnedStems(store.getState());
              const code = $.getLanguageCode(store.getState());

              const file = new Blob([words.join('\n')], { type: 'text/plain' });
              link.href = URL.createObjectURL(file);
              link.download = `learned-words-${code}.txt`;
              link.click();
              URL.revokeObjectURL(link.href);
            }}
          >
            Download learned words
          </button>
        </p>
      </div>
      <textarea
        className="learnedList"
        defaultValue={stems.join('\n')}
        lang={languageCode}
        spellCheck="false"
        onBlur={(event) => {
          const words = new Set<string>();
          const previousWords = $.getLearnedStems(store.getState());

          for (const word of event.target.value.split('\n')) {
            words.add(word.trim());
          }
          words.delete('');

          if (previousWords.size === words.size) {
            console.log(`!!! Sets are the same size`);
            let isEqual = true;
            for (const word of words) {
              if (!previousWords.has(word)) {
                isEqual = false;
                break;
              }
            }
            if (isEqual) {
              console.log(`!!! Sets are equal, not saving`);
              // No need to to update, these sets are equal.
              return;
            }
          }

          store.dispatch(A.updateLearnedWords(words));
        }}
      />
    </div>
  );
}
