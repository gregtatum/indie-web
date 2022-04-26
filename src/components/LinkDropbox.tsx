import * as React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as $ from 'src/store/selectors';
import * as A from 'src/store/actions';

import './LinkDropbox.css';
import { ensureExists } from 'src/utils';

export function LinkDropbox(props: { children: any }) {
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
