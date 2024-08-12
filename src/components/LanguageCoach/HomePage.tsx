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
          Use the Language Coach tools to help learn another language. Right now
          you can generate a study list with the &ldquo;Most Used Words&rdquo;
          tool. More tools are coming soon, like a translation coach.
          <br />
          <br />
          Select your language at top right.
        </p>
        <div className="lcHomepageButtons">
          <Router.Link
            to={`${pathname}?view=most-used`}
            className="lcHomepageButton"
          >
            Get Started
          </Router.Link>
        </div>
      </div>
    </div>
  );
}
