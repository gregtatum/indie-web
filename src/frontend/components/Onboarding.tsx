import * as React from 'react';
import './Onboarding.css';
import { A, $$, Hooks } from 'frontend';
import * as Router from 'react-router-dom';

/**
 * Show the onboarding process for new users, controlled by a key in localStorage.
 * Once the user has onboarded they will never see onboarding again on that device.
 */
export function Onboarding(props: { children: any }) {
  const hasOnboarded = $$.getHasOnboarded();
  const dispatch = Hooks.useDispatch();
  const navigate = Router.useNavigate();

  if (hasOnboarded) {
    return props.children;
  }

  const markdown = (
    <div key="markdown">
      <h2>Write with Markdown</h2>
      <p>
        Use portable Markdown to draft notes, write documents, or manage your
        entire D&D campaign. Organize your creative life on your desktop, or jot
        a quick note on mobile. Swipe through your docs on your tablet.
      </p>
    </div>
  );

  const chordPro = (
    <div key="chordPro">
      <h2>Music with ChordPro</h2>
      <p>
        Compose and edit song sheets and tabs using the{' '}
        <a href="https://en.wikipedia.org/wiki/ChordPro">ChordPro</a> language.
        Perfect for managing your personal songbook.
      </p>
    </div>
  );
  const sheetMusic = (
    <div key="sheetMusic">
      <h2>Manage Sheet Music</h2>
      <p>
        Upload and view your sheet music as PDFs or images — fast to load, easy
        to organize, and available across your devices, with no proprietary
        lock-in.
      </p>
    </div>
  );

  let intro, blurbs, image;
  if (process.env.SITE === 'floppydisk') {
    intro = (
      <>
        <h1>
          Your{' '}
          <span className="onboardingShadow" aria-hidden="true">
            creative
          </span>
          creative documents.
          <br />
          On your storage.
        </h1>
        <div className="onboardingSubtag">
          An indie web project to store and edit your creative docs –
          <br />
          in-browser, on Dropbox, or your own NAS.
        </div>
      </>
    );
    blurbs = [markdown, chordPro, sheetMusic];
    image = (
      <div className="onboardingImage">
        <div>
          <img
            width="2918"
            height="1786"
            src="screenshot.jpg"
            alt="A markdown editor showcasing editing D&D notes with an inline image of a map."
          />
        </div>
        <div>
          <img
            width="1085"
            height="2226"
            src="screenshot-phone.png"
            alt="A markdown editor showcasing editing D&D notes with an inline image of a map."
          />
        </div>
      </div>
    );
  } else {
    intro = (
      <>
        <h1>
          Your{' '}
          <span className="onboardingShadow" aria-hidden="true">
            musical
          </span>
          musical documents.
          <br />
          On your storage.
        </h1>
        <div className="onboardingSubtag">
          An indie web project to store and edit your music –
          <br />
          in-browser, on Dropbox, or your own NAS.
        </div>
      </>
    );
    image = (
      <div className="onboardingImage">
        <div>
          <img
            width="2916"
            height="1786"
            src="screenshot.jpg"
            alt="A text editor showcasing editing Jingle Bells using the ChordPro format, on a desktop view."
          />
        </div>
        <div>
          <img
            width="1085"
            height="2226"
            src="screenshot-phone.png"
            alt="Tabs for Rose Tattoo by the Dropbkick Murphys with flute sheet music embeded in it, on a mobile view."
          />
        </div>
      </div>
    );
    blurbs = [chordPro, sheetMusic];
  }

  return (
    <>
      <div className="onboarding">
        {intro}
        <div className="onboardingButtons">
          <button
            className="button button-primary"
            onClick={() => {
              // TODO, This should be better.
              dispatch(A.setHasOnboarded(true));
            }}
          >
            Try a Demo Project
          </button>
          <button
            className="button onboardingSecondary"
            onClick={() => {
              dispatch(A.setHasOnboarded(true));
            }}
          >
            Start a Blank Workspace
          </button>
          <button
            className="button onboardingSecondary"
            onClick={() => {
              navigate('/connect');
            }}
          >
            Connect to Storage
          </button>
        </div>
      </div>
      {image}
      <div className="onboardingSupport">{blurbs}</div>
    </>
  );
}
