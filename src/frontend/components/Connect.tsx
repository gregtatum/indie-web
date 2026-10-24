import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, Hooks } from 'frontend';
import { getBrowserName } from 'frontend/logic/app-logic';
import './Page.css';
import './Connect.css';

export function Connect() {
  const dispatch = Hooks.useDispatch();
  const navigate = Router.useNavigate();
  Hooks.useRetainScroll();
  return (
    <div className="page">
      <div className="pageInner">
        <h1>Connect to Storage</h1>
        <p>
          Different storage locations are available. Choose between storing the
          files directly in your browser, on Dropbox, or connecting a folder
          from your computer, home server, or NAS. You can always add another
          storage location later.
        </p>
        <div className="pageButtonList">
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              dispatch(A.setHasOnboarded(true));
              dispatch(A.changeFileStore('browser'));
              navigate('/');
            }}
          >
            Use {getBrowserName()}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              dispatch(A.setHasOnboarded(true));
              navigate('/dropbox/folder');
            }}
          >
            Connect Dropbox
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              navigate('/connect-folder');
            }}
          >
            Connect Folder <span className="pageButtonBeta">Beta</span>
          </button>
        </div>
      </div>
    </div>
  );
}
