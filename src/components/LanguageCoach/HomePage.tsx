import * as React from 'react';
import * as Router from 'react-router-dom';

import './HomePage.css';

// https://webflow.com/templates/html/apps-app-website-template
export function HomePage() {
  const { pathname } = window.location;

  return (
    <div className="lcHomepageWrapper">
      <div className="lcHomepage">
        <h1 className="lcHomepageHeader">Language Coach</h1>
        <p className="lcHomepageParagraph">
          Use the Language Coach tools to help learn another language. You can
          add reading materials, and generate study lists. Add words to
          &ldquo;Learned Words&rdquo; to track your progress.
        </p>
        <div className="lcHomepageButtons">
          <Router.Link
            to={`${pathname}?section=study-list`}
            className="lcHomepageButton"
          >
            Get Started
          </Router.Link>
        </div>
      </div>
    </div>
  );
}
