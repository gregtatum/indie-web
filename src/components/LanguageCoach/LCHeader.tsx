import * as React from 'react';
import * as Router from 'react-router-dom';
import { $$, T } from 'src';

import './LCHeader.css';

export function LCHeader() {
  const view = $$.getLanguageCoachSection();
  const learnedWords = $$.getLearnedStems();
  const fsName = $$.getCurrentFileSystemName();
  const coachPath = $$.getLanguageCoachPath();
  const lastReadingPath = $$.getLastReadingPath();
  const pathPrefix = `${fsName}/language-coach${coachPath}`;
  const section = $$.getLanguageCoachSection();

  // Go back to the last read book.
  let lastReadingPrefix;
  if (lastReadingPath && section !== 'reading') {
    lastReadingPrefix = `${fsName}/language-coach${lastReadingPath}`;
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
          to={`${pathPrefix}?section=most-used`}
          className={'lcHeaderLink' + getActiveClass('most-used')}
        >
          Most Used Words
        </Router.Link>
        <Router.Link
          to={`${lastReadingPrefix ?? pathPrefix}?section=reading`}
          className={'lcHeaderLink' + getActiveClass('reading')}
        >
          Reading
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
