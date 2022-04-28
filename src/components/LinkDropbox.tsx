import * as React from 'react';
import * as $ from 'src/store/selectors';
import * as A from 'src/store/actions';
import * as Router from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import './LinkDropbox.css';
import { ensureExists } from 'src/utils';
import { UnhandledCaseError } from '../utils';

const awsAuthUrl = ensureExists(process.env.AUTH_URL, 'process.env.AUTH_URL');
const dropboxClientId = ensureExists(
  process.env.DROPBOX_CLIENT_ID,
  'process.env.DROPBOX_CLIENT_ID',
);

function getRedirectUri() {
  const uri = window.location.origin;
  return uri + '/login';
}

console.log(getRedirectUri());

const url = `https://www.dropbox.com/oauth2/authorize?client_id=${dropboxClientId}&redirect_uri=${getRedirectUri()}&response_type=code`;

type AuthState =
  | 'no-auth'
  | 'auth-requested'
  | 'auth-failed'
  | 'auth-succeeded';

export function LinkDropbox(props: { children: any }) {
  const [authState, setAuthState] = React.useState<AuthState>('no-auth');
  React.useEffect(() => {
    if (window.location.pathname !== '/login') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setAuthState('auth-requested');
    window
      .fetch(awsAuthUrl)
      .then(async (response) => {
        console.log(`!!! response`, await response.json());
      })
      .then(null, (error) => {
        console.error(error);
        setAuthState('auth-failed');
      });
    console.log(`!!! params.get("code");`, params.get('code'));
  }, []);

  switch (authState) {
    case 'no-auth':
      break;
    case 'auth-requested':
      break;
    case 'auth-failed':
      break;
    case 'auth-succeeded':
      break;
    default:
      throw new UnhandledCaseError(authState, 'AuthState');
  }

  const accessToken = useSelector($.getDropboxAccessToken);
  const dispatch = useDispatch();
  if (!accessToken) {
    return (
      <div className="linkDropbox">
        <div className="linkDropboxDescription">
          <h1>View ChordPro Files</h1>
          <p>
            This app works by hooking into a Dropbox folder. Create a dropbox
            app for the folder you want to give this app access to.
          </p>
          <p>
            <a
              href="https://dropbox.tech/developers/generate-an-access-token-for-your-own-account"
              target="_new"
            >
              Follow the directions on this blog post
            </a>{' '}
            to get an access token. Or directly generate on in the{' '}
            <a href="https://www.dropbox.com/developers/apps" target="_new">
              App Console
            </a>
            .
          </p>
        </div>
        <div>
          <a href={url} className="linkDropboxConnect">
            Connect Dropbox
          </a>
        </div>
        <form
          className="linkDropboxForm"
          onSubmit={(event) => {
            const { value } = ensureExists(
              (event.target as HTMLFormElement).querySelector('input'),
              'input element',
            );
            if (value) {
              dispatch(A.setDropboxAccessToken(value));
            }
          }}
        >
          <input
            type="text"
            className="linkDropboxInput"
            placeholder="Insert access token"
          />
          <input type="submit" className="linkDropboxSubmit" value="Add" />
        </form>
      </div>
    );
  }
  return props.children;
}

export function UnlinkDropbox() {
  const dispatch = useDispatch();
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
