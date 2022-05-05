import * as React from 'react';
import { A, $ } from 'src';
import * as Router from 'react-router-dom';
import * as Redux from 'react-redux';

import './LinkDropbox.css';
import { ensureExists, postData } from 'src/utils';
import { UnhandledCaseError } from '../utils';
import { randomBytes, createHash } from 'crypto';

const lambaAuthUrl = ensureExists(process.env.AUTH_URL, 'process.env.AUTH_URL');
const dropboxClientId = ensureExists(
  process.env.DROPBOX_CLIENT_ID,
  'process.env.DROPBOX_CLIENT_ID',
);

function getRedirectUri() {
  const uri = window.location.origin;
  return uri + '/login';
}

function base64Encode(str: Buffer) {
  return str
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer: string): Buffer {
  return createHash('sha256').update(buffer).digest();
}

const codeVerifier = base64Encode(randomBytes(32));
const codeChallenge = base64Encode(sha256(codeVerifier));

console.log(`Client generated code_verifier: ${codeVerifier}`);
console.log(`Client generated code_challenge: ${codeChallenge}`);

const url =
  'https://www.dropbox.com/oauth2/authorize?' +
  new URLSearchParams({
    response_type: `code`,
    code_challenge_method: `S256`,
    client_id: dropboxClientId,
    code_challenge: codeChallenge,
    redirect_uri: getRedirectUri(),
    token_access_type: 'offline',
  });

type AuthState = 'no-auth' | 'await-auth' | 'auth-failed';

function persistCodeVerifier() {
  window.localStorage.setItem('dropboxCodeVerifier', codeVerifier);
}

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
            const json = JSON.parse(text);
            // {
            //  "access_token": "sl.XXXX",
            //  "token_type": "bearer",
            //  "expires_in": 14400,
            //  "refresh_token": "G0TgYlyTtfcAAAAAAAAAAY8pNWiPMFtzeZV0i4n7Szodc30I7VevgaIeGmmcCbtr",
            //  "scope": "account_info.read file_requests.read files.content.read files.content.write files.metadata.read files.metadata.write",
            //  "uid": "2064116",
            //  "account_id": "dbid:AACqbOgi4TZtF3UsCOOJKo--3Ep90CPnu6A"
            // }
            const accessToken = json?.access_token;
            const expiresIn = json?.expires_in;
            const refreshToken = json?.refresh_token;
            if (
              typeof accessToken === 'string' &&
              typeof expiresIn === 'number' &&
              typeof refreshToken === 'string'
            ) {
              dispatch(
                A.setDropboxAccessToken(accessToken, expiresIn, refreshToken),
              );
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
              <a
                href={url}
                className="linkDropboxConnect"
                onClick={persistCodeVerifier}
              >
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
            <a
              href={url}
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
