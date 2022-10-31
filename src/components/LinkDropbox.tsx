import * as React from 'react';
import { A, T, $, Hooks } from 'src';
import * as Router from 'react-router-dom';

import './LinkDropbox.css';
import {
  getEnv,
  UnhandledCaseError,
  getStringProp,
  getNumberProp,
  dropboxErrorMessage,
} from 'src/utils';
import { Privacy } from './Page';
import { getRedirectUri, useCodeVerifier } from '../hooks/pcse';

const dropboxClientId = getEnv('DROPBOX_CLIENT_ID');

type AuthState = 'no-auth' | 'await-auth' | 'auth-failed' | 'refreshing';

export function LinkDropbox(props: { children: any }) {
  const isLogin = window.location.pathname === '/login';
  const isDropboxInitiallyExpired = Hooks.useSelector(
    $.getIsDropboxInitiallyExpired,
  );
  const oauth = Hooks.useSelector($.getDropboxOauth);
  const oauthRef = React.useRef<T.DropboxOauth | null>(null);
  oauthRef.current = oauth;
  let defaultAuthState: AuthState = 'no-auth';
  if (isLogin) {
    defaultAuthState = 'await-auth';
  }
  if (oauth && oauth.expires < Date.now()) {
    defaultAuthState = 'refreshing';
  }
  const [authState, setAuthState] = React.useState<AuthState>(defaultAuthState);
  const [authError, setAuthError] = React.useState('');
  const dispatch = Hooks.useDispatch();
  const navigate = Router.useNavigate();

  React.useEffect(() => {
    if (!oauth) {
      return;
    }
    if (oauth.expires === Infinity) {
      // This is most likely a test that is opting out of refresh token behavior.
      return;
    }
    if (oauth.expires > Date.now()) {
      setTimeout(useRefreshToken, oauth.expires - Date.now());
      return;
    }
    useRefreshToken();

    function useRefreshToken() {
      if (!oauth || oauthRef.current !== oauth) {
        return;
      }
      console.log('Refresh token is out of date, fetching a new one.');
      setAuthState('refreshing');
      fetch(
        'https://www.dropbox.com/oauth2/token' +
          '?' +
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: dropboxClientId,
            refresh_token: oauth.refreshToken,
          }),
        { method: 'POST' },
      )
        .then(async (response) => {
          if (response.status === 200) {
            const text = await response.text();
            try {
              const json: unknown = JSON.parse(text);
              // {
              //   "access_token": "sl...-...",
              //   "token_type": "bearer",
              //   "expires_in": 14400
              // }
              const accessToken = getStringProp(json, 'access_token');
              const expiresIn = getNumberProp(json, 'expires_in');
              if (accessToken && expiresIn) {
                dispatch(
                  A.setDropboxAccessToken(
                    accessToken,
                    expiresIn,
                    oauth.refreshToken,
                  ),
                );
                setAuthState('no-auth');
              } else {
                console.error(
                  'Did not receive all expected data from refreshing the Dropbox access token',
                  { json, accessToken, expiresIn },
                );
                setAuthState('auth-failed');
              }
            } catch (_err) {
              console.error('Could not parse response', text);
              setAuthError('Dropbox returned strange data.');
              setAuthState('auth-failed');
            }
          } else {
            console.error(
              'The Dropbox API returned an error.',
              await response.text(),
            );
            setAuthError(
              'Dropbox replied with information that could not be understood.',
            );
            setAuthState('auth-failed');
          }
        })
        .catch((error) => {
          console.error(`Error with refresh token:`, error);
          setAuthError(dropboxErrorMessage(error));
          setAuthState('auth-failed');
        });
    }
  }, [oauth]);

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

    // Client generated code_verifier: 0u0JGkp5kmy5AsqotDjHvTOGmVEUpRzK8yLlv8ctCkY LinkDropbox.tsx:37:8
    // Client generated code_challenge: 8nPqPl5DW8MA4loRgwWZndFnuqY91RdqHVEMtr0ZFOA LinkDropbox.tsx:38:8
    // Code: bk2Gh-J_8KAAAAAAAAFQU-GPJ1APhuIYuTauGKrOHEU

    // curl https://api.dropbox.com/oauth2/token \
    //     -d code=<AUTHORIZATION_CODE> \
    //     -d grant_type=authorization_code \
    //     -d redirect_uri=<REDIRECT_URI> \
    //     -d code_verifier=<VERIFICATION_CODE> \
    //     -d client_id=<APP_KEY>

    fetch(
      'https://www.dropbox.com/oauth2/token' +
        '?' +
        new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: getRedirectUri(),
          code_verifier:
            window.localStorage.getItem('dropboxCodeVerifier') ?? '',
          client_id: dropboxClientId,
        }),
      { method: 'POST' },
    )
      .then(async (response) => {
        if (response.status === 200) {
          const text = await response.text();
          try {
            const json: unknown = JSON.parse(text);
            // {
            //  "access_token": "sl.XXXX",
            //  "token_type": "bearer",
            //  "expires_in": 14400,
            //  "refresh_token": "...",
            //  "scope": "account_info.read file_requests.read files.content.read files.content.write files.metadata.read files.metadata.write",
            //  "uid": "2064116",
            //  "account_id": "..."
            // }
            const accessToken = getStringProp(json, 'access_token');
            const expiresIn = getNumberProp(json, 'expires_in');
            const refreshToken = getStringProp(json, 'refresh_token');
            if (accessToken && expiresIn && refreshToken) {
              dispatch(
                A.setDropboxAccessToken(accessToken, expiresIn, refreshToken),
              );
              setAuthState('no-auth');
              const url =
                window.localStorage.getItem('dropboxRedirectURL') || '/';
              window.localStorage.removeItem('dropboxRedirectURL');
              navigate(url, { replace: true });
            } else {
              console.error(
                'Did not receive all expected data from authentication',
                { json, accessToken, expiresIn, refreshToken },
              );
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
        setAuthError(dropboxErrorMessage(error));
        setAuthState('auth-failed');
      });
  }, [isLogin]);

  const { persistCodeVerifier, authorizationUrl } = useCodeVerifier();
  const view = Hooks.useSelector($.getView);

  if (isDropboxInitiallyExpired) {
    return (
      <div className="linkDropboxAuth centered">
        <img
          src="/logo.png"
          width="148"
          height="179"
          alt="Accessing Your Dropbox…"
        />
        <p>{authError ? authError : null}</p>
      </div>
    );
  }

  if (!oauth) {
    switch (authState) {
      case 'no-auth':
        if (view === 'privacy') {
          return <Privacy />;
        }
        return (
          <div className="linkDropboxHome">
            <div className="linkDropboxBegin">
              <div className="linkDropbox">
                <div className="linkDropboxDescription">
                  <h1 className="linkDropboxH1">🎵 Browser Chords</h1>
                  <h2 className="linkDropboxH2">A Greg Tatum Web App</h2>
                  <p>
                    Manage tabs, chords, and sheet music in Dropbox. Access and
                    edit them directly in the browser, from anywhere.
                  </p>
                  <p>
                    Privacy is important. This app will only be given access to
                    the <code>Dropbox/Apps/Chords</code> folder in Dropbox to
                    manage files. See the{' '}
                    <Router.Link to="/privacy">privacy policy</Router.Link> for
                    more details. The source code is on{' '}
                    <a href="https://github.com/gregtatum/browser-chords">
                      GitHub
                    </a>
                    .
                  </p>
                </div>
                <div>
                  <a
                    href={authorizationUrl}
                    className="linkDropboxConnect"
                    onClick={persistCodeVerifier}
                  >
                    Connect Dropbox
                  </a>
                </div>
              </div>
            </div>
            <div className="linkDropboxEnd">
              <div className="linkDropboxScroller">
                <img src="/Chords.tiny.png" width="1125" height="1500" />
                <img src="/Songs.tiny.png" width="1125" height="1500" />
                <img src="/Sheet.tiny.png" width="1125" height="1500" />
              </div>
            </div>
          </div>
        );
      case 'await-auth':
        return <div className="appViewMessage">Logging you in...</div>;
      case 'refreshing':
        return <div className="appViewMessage">Connecting to DropBox...</div>;
      case 'auth-failed':
        return (
          <div className="appViewMessage">
            <p>The Dropbox login failed. </p>
            <a
              href={authorizationUrl}
              className="linkDropboxConnect"
              onClick={persistCodeVerifier}
            >
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
  const dispatch = Hooks.useDispatch();
  return (
    <button
      className="button linkDropboxUnlink"
      type="button"
      onClick={() => {
        confirm(
          'Are you sure you want to log out of the site? All of your data in the ' +
            'browser will be removed, but your Dropbox folder will still be available ' +
            'on Dropbox or if you sign back in.',
        );
        dispatch(A.removeDropboxAccessToken());
      }}
    >
      Sign Out
    </button>
  );
}
