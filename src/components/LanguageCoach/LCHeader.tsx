import * as React from 'react';
import * as Router from 'react-router-dom';
import { $$, T } from 'src';

import './LCHeader.css';

export function LCHeader() {
  const view = $$.getLanguageCoachView();
  const learnedWords = $$.getLearnedStems();
  const { pathname } = window.location;

  function getActiveClass(v: T.LanguageCoachView): string {
    if (v === view) {
      return ' active';
    }
    return '';
  }

  return (
    <div className="lcHeader">
      <div className="lcHeaderLinks">
        <Router.Link
          to={pathname}
          className={'lcHeaderLink' + getActiveClass('home')}
        >
          Language Coach
        </Router.Link>
        <Router.Link
          to={`${pathname}?view=most-used`}
          className={'lcHeaderLink' + getActiveClass('most-used')}
        >
          Most Used Words
        </Router.Link>
        <Router.Link
          to={`${pathname}?view=learned`}
          className={'lcHeaderLink' + getActiveClass('learned')}
        >
          Learned Words{' '}
          <span className="lcHeaderBubble">{learnedWords.size}</span>
        </Router.Link>
      </div>
    </div>
  );
}
