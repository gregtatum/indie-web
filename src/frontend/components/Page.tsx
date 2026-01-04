import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, $$, Hooks } from 'frontend';
import {
  getBrowserName,
  getFileStoreDisplayName,
} from 'frontend/logic/app-logic';
import { IDB_CACHE_NAME } from 'frontend/logic/file-store/dropbox-fs';
import { openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';
import { formatBytes, getEnv } from 'frontend/utils';
import { UnlinkDropbox } from './LinkDropbox';
import './Page.css';

type CacheEstimate = {
  status: 'loading' | 'ready' | 'error';
  size: number | null;
  error: string | null;
};

export function Settings() {
  const experimentalFeatures = $$.getExperimentalFeatures();
  const editorAutocomplete = $$.getEditorAutocompleteSettings();
  const fileStoreCacheEnabled = $$.getFileStoreCacheEnabled();
  const dropboxOauth = $$.getDropboxOauth();
  const servers = $$.getServers();
  const dispatch = Hooks.useDispatch();
  const [cacheEstimates, setCacheEstimates] = React.useState<
    Record<string, CacheEstimate>
  >({});
  const isMountedRef = React.useRef(true);
  Hooks.useRetainScroll();

  const cacheTargets = React.useMemo(() => {
    const targets: Array<{ id: string; label: string; dbName: string }> = [];
    if (dropboxOauth) {
      targets.push({
        id: 'dropbox',
        label: 'Dropbox',
        dbName: IDB_CACHE_NAME,
      });
    }
    for (const server of servers) {
      targets.push({
        id: `server:${server.id}`,
        label: server.name,
        dbName: `server-fs-cache(${server.id})`,
      });
    }
    return targets;
  }, [dropboxOauth, servers]);
  const estimateCacheSizeForTarget = React.useCallback(
    async (target: { id: string; dbName: string }) => {
      try {
        const cache = await openIDBFS(target.dbName);
        const size = await cache.getApproximateSize();
        if (!isMountedRef.current) {
          return;
        }
        setCacheEstimates((prev) => ({
          ...prev,
          [target.id]: {
            status: 'ready',
            size,
            error: null,
          },
        }));
      } catch (error) {
        console.error(error);
        if (!isMountedRef.current) {
          return;
        }
        setCacheEstimates((prev) => ({
          ...prev,
          [target.id]: {
            status: 'error',
            size: null,
            error: 'Could not estimate cache size.',
          },
        }));
      }
    },
    [],
  );

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (cacheTargets.length === 0 || !fileStoreCacheEnabled) {
      setCacheEstimates({});
      return undefined;
    }
    const startingEstimates: Record<string, CacheEstimate> = {};
    for (const target of cacheTargets) {
      startingEstimates[target.id] = {
        status: 'loading',
        size: null,
        error: null,
      };
    }
    setCacheEstimates(startingEstimates);
    void Promise.all(
      cacheTargets.map(async (target) => {
        await estimateCacheSizeForTarget(target);
      }),
    );
    return undefined;
  }, [cacheTargets, estimateCacheSizeForTarget, fileStoreCacheEnabled]);

  return (
    <div className="page">
      <div className="pageInner">
        <h2>Enable experimental features</h2>
        <p>
          Enable experimental features which many not be as fully fleshed out,
          not documented, and may have bugs.
        </p>
        <p>
          <input
            type="checkbox"
            id="experimental-features"
            defaultChecked={experimentalFeatures}
            onChange={(event) => {
              dispatch(
                A.setExperimentalFeatures(Boolean(event.target.checked)),
              );
            }}
          />
          <label htmlFor="experimental-features">
            Enable experimental features
          </label>
        </p>
        <h2>Offline files</h2>
        <p>
          While you passively view your files, {getEnv('SITE_DISPLAY_NAME')} can
          cache the files to your browser allowing for faster retrieval and
          offline support for your files.
        </p>
        <p>
          <input
            type="checkbox"
            id="file-store-cache"
            defaultChecked={fileStoreCacheEnabled}
            onChange={(event) => {
              dispatch(
                A.setFileStoreCacheEnabled(Boolean(event.target.checked)),
              );
            }}
          />
          <label htmlFor="file-store-cache">Enable offline file caching</label>
        </p>
        {fileStoreCacheEnabled ? (
          cacheTargets.length === 0 ? (
            <p>No offline caches available yet.</p>
          ) : (
            <div>
              {cacheTargets.map((target) => {
                const estimate = cacheEstimates[target.id];
                let label = `${target.label}: Estimating...`;
                if (estimate?.status === 'error') {
                  label = `${target.label}: ${estimate.error}`;
                } else if (estimate?.status === 'ready') {
                  label = `${target.label}: ${formatBytes(estimate.size ?? 0)}`;
                }
                return (
                  <div key={target.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        setCacheEstimates((prev) => ({
                          ...prev,
                          [target.id]: {
                            status: 'loading',
                            size: null,
                            error: null,
                          },
                        }));
                        try {
                          const cache = await openIDBFS(target.dbName);
                          await cache.clear();
                          await estimateCacheSizeForTarget(target);
                        } catch (error) {
                          console.error(error);
                          if (!isMountedRef.current) {
                            return;
                          }
                          setCacheEstimates((prev) => ({
                            ...prev,
                            [target.id]: {
                              status: 'error',
                              size: null,
                              error: 'Could not clear cache.',
                            },
                          }));
                        }
                      }}
                    >
                      Clear Cache
                    </button>{' '}
                    {label}
                  </div>
                );
              })}
            </div>
          )
        ) : null}
        <h2>Editor Settings</h2>
        <p>
          <input
            type="checkbox"
            id="editor-autocomplete-markdown"
            defaultChecked={editorAutocomplete.markdown}
            onChange={(event) => {
              dispatch(
                A.setEditorAutocomplete(
                  'markdown',
                  Boolean(event.target.checked),
                ),
              );
            }}
          />
          <label htmlFor="editor-autocomplete-markdown">
            Enable Markdown autocompletion
          </label>
        </p>
        <p>
          <input
            type="checkbox"
            id="editor-autocomplete-chordpro"
            defaultChecked={editorAutocomplete.chordpro}
            onChange={(event) => {
              dispatch(
                A.setEditorAutocomplete(
                  'chordpro',
                  Boolean(event.target.checked),
                ),
              );
            }}
          />
          <label htmlFor="editor-autocomplete-chordpro">
            Enable ChordPro autocompletion
          </label>
        </p>
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
  const idbfs = $$.getIDBFSOrNull();
  const [fileCount, setFileCount] = React.useState(0);

  React.useEffect(() => {
    idbfs?.getFileCount().then(
      (count) => setFileCount(count),
      (error) => console.error(error),
    );
  }, [idbfs]);

  return (
    <>
      <h2>Delete {getFileStoreDisplayName('browser', null)}</h2>
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
        {getEnv('SITE_DISPLAY_NAME')} is a personal project by me,{' '}
        <a href="https://gregtatum.com/">Greg Tatum</a>. It is a collection of
        tools that work on files. These files are stored either on your machine
        via the browser, on a locally hosted server, or via a third party
        service, such as Dropbox.
      </p>
    );
  } else {
    description = (
      <p>
        {getEnv('SITE_DISPLAY_NAME')} is a personal project by me,{' '}
        <a href="https://gregtatum.com/">Greg Tatum</a>. It is mainly built to
        provide a great experience with managing chords, and sheet music for
        playing music. It is designed to be extremely portable and work with
        just files stored in the browser, on a locally hosted server, or on a
        Dropbox account. It works with common music formats.
      </p>
    );
  }
  return (
    <div className="page">
      <div className="pageInner">
        <h1>Privacy Policy and Usage</h1>

        <h2>Definitions</h2>
        <p>
          <b>The Site:</b> {getEnv('SITE_DISPLAY_NAME')} at{' '}
          <a href={getEnv('SITE_URL')}>{getEnv('SITE_URL')}</a>
          <br />
          <b>User:</b> A user of The Site.
        </p>
        {description}

        <h2>Dropbox</h2>
        <p>
          The Site can use a Dropbox account to access files. The Site does not
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
          <a href="https://github.com/gregtatum/indie-web/">
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
          <a href="https://github.com/gregtatum/indie-web/">GitHub</a>.
        </p>
      </div>
    </div>
  );
}

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
          files directly in your browser, on Dropbox, or host your own server to
          connect to a NAS or your local file system. You can always add another
          storage location later.
        </p>
        <div className="pageButtonList">
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              dispatch(A.setHasOnboarded(true));
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
              dispatch(A.changeFileStore('dropbox'));
              navigate('/');
            }}
          >
            Connect Dropbox
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              navigate('/add-file-storage');
            }}
          >
            Host Your Own <span className="pageButtonBeta">Beta</span>
          </button>
        </div>
      </div>
    </div>
  );
}
