import * as React from 'react';
import * as Router from 'react-router-dom';
import { getEnv } from 'src/utils';
import { UnlinkDropbox } from './LinkDropbox';
import { Hooks, A, $ } from 'src';
import { getFileSystemDisplayName } from 'src/logic/app-logic';
import './Page.css';

export function Settings() {
  Hooks.useRetainScroll();
  return (
    <div className="page">
      <div className="pageInner">
        <UnlinkDropbox />
        <DeleteBrowserFiles />
        <h2>About</h2>
        <p>
          <Router.Link to="/privacy">Privacy Policy and Usage.</Router.Link>
        </p>
      </div>
    </div>
  );
}

function DeleteBrowserFiles() {
  const dispatch = Hooks.useDispatch();
  const idbfs = Hooks.useSelector($.getIDBFSOrNull);
  const [fileCount, setFileCount] = React.useState(0);

  React.useEffect(() => {
    idbfs?.getFileCount().then(
      (count) => setFileCount(count),
      (error) => console.error(error),
    );
  }, [idbfs]);

  return (
    <>
      <h2>Delete {getFileSystemDisplayName('indexeddb')}</h2>
      {idbfs ? (
        <>
          <p>
            There are {fileCount} files stored in the browser. They can be
            deleted here. This operation cannot be undone. Note that if you
            revisit the main file listing, demo files will be recreated.
          </p>
          <button
            onClick={() => {
              confirm(
                'Are you sure you want to delete your browser files? This operation cannot ' +
                  'be undone.',
              );
              dispatch(A.removeBrowserFiles());
            }}
          >
            Delete files
          </button>
        </>
      ) : (
        <p>All files have been deleted.</p>
      )}
    </>
  );
}

export function Privacy() {
  Hooks.useRetainScroll();
  let description;
  if (process.env.SITE === 'floppydisk') {
    description = (
      <p>
        {getEnv('SITE_DISPLAY_NAME')} is a personal project by me, Greg Tatum.
        It is a collection of tools that work on files. These files are stored
        either on your machine via the browser, or via a third party service,
        such as Dropbox.
      </p>
    );
  } else {
    description = (
      <p>
        {getEnv('SITE_DISPLAY_NAME')} is a personal project by me, Greg Tatum.
        It is mainly built to provide a great experience with managing chords,
        and sheet music for playing music. It is designed to be extremely
        portable and work with just files stored on a Dropbox account and common
        music formats.
      </p>
    );
  }
  return (
    <div className="page">
      <div className="pageInner">
        <h1>Privacy Policy and Usage</h1>

        <h2>Definitions</h2>
        <p>
          <b>The Site:</b> {getEnv('SITE_DISPLAY_NAME')} at {getEnv('SITE_URL')}
          <br />
          <b>User:</b> A user of The Site.
        </p>
        {description}

        <h2>Dropbox</h2>
        <p>
          The Site requires a Dropbox account to access files. The Site does not
          store Dropbox user information beyond the authorization tokens
          provided by Dropbox.{' '}
          <a href="https://dropbox.com/privacy">
            Dropbox has its own privacy policy.
          </a>{' '}
          The Site only requests access to a scoped app folder, and not the
          broader Dropbox files. The information about the files and folders are
          only stored in the User&apos;s browser through the localStorage and
          IndexedDB APIs.
        </p>
        <p>
          Information about the User&apos;s Dropbox account and the User&apos;s
          files and folders are <i>not</i> stored nor collected by The Site.
        </p>

        {/* <h2>Google Analytics</h2>
        <p>
          The Site uses Google Analytics to track basic User behavior such as
          what parts of The Site are used. The Site does not collect any
          information about specific files that are being accessed and viewed,
          beyond general characterizations such as the file type, and what parts
          of the app are being used to view the file. Please{' '}
          <a href="https://github.com/gregtatum/browser-chords/">
            file an issue
          </a>{' '}
          if any data about file paths and contents is found to be leaking.
        </p>
        <p>
          <a href="https://policies.google.com/privacy?hl=en-US">
            Google privacy policy.
          </a>
        </p> */}

        <h2>Netlify</h2>
        <p>
          The front-end application is hosted through Netlify which has its own{' '}
          <a href="https://www.netlify.com/privacy/">privacy policy</a>.
        </p>

        <h2>Guarantees</h2>
        <p>
          The Site is a personal project of Greg Tatum, and it is not monetized.
          Users are free to use the service, but Greg Tatum provides no
          guarantees and assumes no responsibility for the usage of the app or
          the integrity of the data that is stored in the website or stored in
          third party services, such as Dropbox..
        </p>
        <p>
          Please report any bugs for data integrity on{' '}
          <a href="https://github.com/gregtatum/browser-chords/">GitHub</a>.
        </p>
      </div>
    </div>
  );
}
