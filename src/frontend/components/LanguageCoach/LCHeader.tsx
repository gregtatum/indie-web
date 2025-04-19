import * as React from 'react';
import * as Router from 'react-router-dom';
import { $$, T } from 'frontend';

import './LCHeader.css';

export function LCHeader() {
  const view = $$.getLanguageCoachSection();
  const learnedWords = $$.getLearnedStems();
  const fsSlug = $$.getCurrentFileStoreSlug();
  const coachPath = $$.getLanguageCoachPath();
  const lastReadingPath = $$.getLastReadingPath();
  const pathPrefix = `${fsSlug}/language-coach${coachPath}`;
  const section = $$.getLanguageCoachSection();

  // Go back to the last read book.
  let lastReadingPrefix;
  if (lastReadingPath && section !== 'reading') {
    lastReadingPrefix = `${fsSlug}/language-coach${lastReadingPath}`;
  }

  function getActiveClass(v: T.LanguageCoachSection): string {
    if (v === view) {
      return ' active';
    }
    return '';
  }

  return (
    <div className="lcHeader">
      <div className="lcHeaderLinks">
        <Router.Link
          to={pathPrefix}
          className={'lcHeaderLink' + getActiveClass('home')}
        >
          Language Coach
        </Router.Link>
        <Router.Link
          to={`${lastReadingPrefix ?? pathPrefix}?section=reading`}
          className={'lcHeaderLink' + getActiveClass('reading')}
        >
          Reading
        </Router.Link>
        <Router.Link
          to={`${pathPrefix}?section=study-list`}
          className={'lcHeaderLink' + getActiveClass('study-list')}
        >
          Study List
        </Router.Link>
        <Router.Link
          to={`${pathPrefix}?section=learned`}
          className={'lcHeaderLink' + getActiveClass('learned')}
        >
          Learned Words{' '}
          <span className="lcHeaderBubble">{learnedWords.size}</span>
        </Router.Link>
      </div>
    </div>
  );
}
