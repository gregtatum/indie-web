import * as React from 'react';
import { A, $ } from 'src';
import * as Router from 'react-router-dom';
import * as Redux from 'react-redux';

import './LinkDropbox.css';
import { ensureExists } from 'src/utils';
import { UnhandledCaseError } from '../utils';

const lambaAuthUrl = ensureExists(process.env.AUTH_URL, 'process.env.AUTH_URL');
const dropboxClientId = ensureExists(
  process.env.DROPBOX_CLIENT_ID,
  'process.env.DROPBOX_CLIENT_ID',
);

function getRedirectUri() {
  const uri = window.location.origin;
  return uri + '/login';
}

const url = `https://www.dropbox.com/oauth2/authorize?client_id=${dropboxClientId}&redirect_uri=${getRedirectUri()}&response_type=code`;

type AuthState = 'no-auth' | 'await-auth' | 'auth-failed';

export function LinkDropbox(props: { children: any }) {
  const isLogin = window.location.pathname === '/login';
  const [authState, setAuthState] = React.useState<AuthState>(
    isLogin ? 'await-auth' : 'no-auth',
  );
  const dispatch = Redux.useDispatch();
  const navigate = Router.useNavigate();

  React.useEffect(() => {
    if (authState === 'no-auth') {
      // Ensure the old dropbox redirect URL isn't still sitting around.
      window.localStorage.removeItem('dropboxRedirectURL');
    }
  }, [authState]);

  React.useEffect(() => {
    if (!isLogin) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      setAuthState('auth-failed');
      return;
    }

    const paramsOut = new URLSearchParams();
    paramsOut.set('code', code);

    window
      .fetch(lambaAuthUrl + '?' + paramsOut.toString())
      .then(async (response) => {
        if (response.status === 200) {
          const text = await response.text();
          try {
            const json = JSON.parse(text);
            // {
            //   "access_token": "...",
            //   "token_type": "bearer",
            //   "expires_in": 14400,
            //   "scope": "account_info.read ...",
            //   "uid": "12345",
            //   "account_id": "dbid:..."
            // }
            const authToken = json?.access_token;
            if (authToken) {
              dispatch(A.setDropboxAccessToken(authToken));
              setAuthState('no-auth');
              const url =
                window.localStorage.getItem('dropboxRedirectURL') || '/';
              window.localStorage.removeItem('dropboxRedirectURL');
              navigate(url, { replace: true });
            } else {
              console.error('No auth token was received', json);
              setAuthState('auth-failed');
            }
          } catch (_err) {
            console.error('Could not parse lambda response', text);
            setAuthState('auth-failed');
          }
        } else {
          console.error('The lambda returned an error.', await response.text());
          setAuthState('auth-failed');
        }
      })
      .then(null, (error) => {
        console.error(error);
        setAuthState('auth-failed');
      });
  }, [isLogin]);

  const accessToken = Redux.useSelector($.getDropboxAccessToken);
  if (!accessToken) {
    switch (authState) {
      case 'no-auth':
        return (
          <div className="linkDropbox">
            <div className="linkDropboxDescription">
              <h1>View ChordPro Files</h1>
              <p>
                View ChordPro files in a Dropbox folder. This app will only be
                given acces to the <code>Dropbox/Apps/Chords</code> folder in
                Dropbox once access is given.
              </p>
            </div>
            <div>
              <a href={url} className="linkDropboxConnect">
                Connect Dropbox
              </a>
            </div>
          </div>
        );
      case 'await-auth':
        return <div className="appViewMessage">Logging you in...</div>;
      case 'auth-failed':
        return (
          <div className="appViewMessage">
            <p>The Dropbox login failed. </p>
            <a href={url} className="linkDropboxConnect">
              Try Again…
            </a>
          </div>
        );
      default:
        throw new UnhandledCaseError(authState, 'AuthState');
    }
  }
  return props.children;
}

export function UnlinkDropbox() {
  const dispatch = Redux.useDispatch();
  return (
    <button
      className="linkDropboxUnlink"
      type="button"
      onClick={() => {
        confirm('Are you sure you want to remove the access token?');
        dispatch(A.removeDropboxAccessToken());
      }}
    >
      Unlink Dropbox
    </button>
  );
}

export function HandleAuth() {
  const params = Router.useParams();
  return <div>{params.code}</div>;
}

export function DropboxExpired() {
  const accessToken = Redux.useSelector($.getDropboxAccessToken);
  const navigate = Router.useNavigate();
  React.useEffect(() => {
    if (accessToken) {
      // Only allow this page if the access token is gone.
      navigate('/');
    }
  }, [accessToken]);
  return (
    <div className="linkDropbox">
      <div className="linkDropboxDescription">
        <h1>Dropbox Session Expired</h1>
      </div>
      <div>
        <a href={url} className="linkDropboxConnect">
          Re-connect Dropbox
        </a>
      </div>
    </div>
  );
}
