import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, $$, Hooks, T } from 'frontend';
import {
  getBrowserAccentColor,
  getBrowserIcon,
  getBrowserName,
} from 'frontend/logic/app-logic';
import { IDB_CACHE_NAME } from 'frontend/logic/file-store/dropbox-fs';
import { openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';
import { formatBytes, getEnv } from 'frontend/utils';
import { useCodeVerifier } from 'frontend/hooks/pcse';
import { ConnectedFoldersSettings } from './ConnectFolder';
import { InfoLink } from './InfoLink';
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
  const idbfs = $$.getIDBFSOrNull();
  const servers = $$.getServers();
  let nonServerFallbackStorage: T.FileStoreName | null = null;
  if (idbfs) {
    nonServerFallbackStorage = 'browser';
  } else if (dropboxOauth) {
    nonServerFallbackStorage = 'dropbox';
  }
  const workerClient = $$.getWorkerClient();
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
        const cache = await openIDBFS(target.dbName, workerClient);
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
    [workerClient],
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
        <h1 className="settingsTitle">Settings</h1>
        <p className="settingsSubtitle">
          Manage where your files are stored, how the editor works,
          <br />
          and advanced options for {getEnv('SITE_DISPLAY_NAME')}.
        </p>
        <div className="settingsSectionHeading">
          <div className="settingsSectionTitleRow">
            <img
              className="settingsSectionIcon"
              src="/svg/database.svg"
              alt=""
            />
            <h2>Storage Providers</h2>
          </div>
          <p>Where your files live.</p>
        </div>
        <div className="settingsCard settingsProviderList">
          <BrowserStorageProvider />
          <DropboxStorageProvider />
          {servers.length > 0 ? (
            <section className="settingsProvider">
              <div className="settingsProviderSummary">
                <div className="settingsProviderTitle">
                  <div className="settingsProviderIconTile settingsProviderIconTileAccent">
                    <span className="settingsProviderIconMask settingsProviderIconMaskServer" />
                  </div>
                  <div>
                    <div className="settingsProviderNameRow">
                      <h3>Local &amp; Network Storage</h3>
                      <InfoLink
                        href="/docs/file-store-server.html"
                        title="Access folders from your computer, home server, or NAS."
                      />
                    </div>
                    <p>{servers.length} configured</p>
                  </div>
                </div>
                <Router.Link className="button" to="/connect-folder">
                  Connect Folder
                </Router.Link>
              </div>
              <ConnectedFoldersSettings
                fileStoreServers={servers}
                nonServerFallbackStorage={nonServerFallbackStorage}
              />
            </section>
          ) : (
            <section className="settingsProvider">
              <div className="settingsProviderSummary">
                <div className="settingsProviderTitle">
                  <div className="settingsProviderIconTile settingsProviderIconTileAccent">
                    <span className="settingsProviderIconMask settingsProviderIconMaskServer" />
                  </div>
                  <div>
                    <div className="settingsProviderNameRow">
                      <h3>Local &amp; Network Storage</h3>
                      <InfoLink
                        href="/docs/file-store-server.html"
                        title="Access folders from your computer, home server, or NAS."
                      />
                    </div>
                    <p>
                      Access folders from your computer, home server, or NAS.
                    </p>
                  </div>
                </div>
                <Router.Link className="button" to="/connect-folder">
                  Connect Folder
                </Router.Link>
              </div>
            </section>
          )}
        </div>
        <div className="settingsSectionGrid">
          <div className="settingsCard settingsSectionCard">
            <div className="settingsSectionHeading">
              <div className="settingsSectionTitleRow">
                <img
                  className="settingsSectionIcon"
                  src="/svg/offline.svg"
                  alt=""
                />
                <h2>Offline & Cache</h2>
              </div>
              <p>
                Cache files in your browser for faster access and offline use.
              </p>
            </div>
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
              <label htmlFor="file-store-cache">
                Enable offline file caching
              </label>
            </p>
            {fileStoreCacheEnabled && cacheTargets.length === 0 && (
              <p>Files you view will appear here for offline use.</p>
            )}
            {fileStoreCacheEnabled && cacheTargets.length > 0 && (
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
                            const cache = await openIDBFS(
                              target.dbName,
                              workerClient,
                            );
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
            )}
          </div>
          <div className="settingsCard settingsSectionCard">
            <div className="settingsSectionHeading">
              <div className="settingsSectionTitleRow">
                <img
                  className="settingsSectionIcon"
                  src="/svg/pencil.svg"
                  alt=""
                />
                <h2>Editor</h2>
              </div>
              <p>Customize the editing experience.</p>
            </div>
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
          </div>
          <div className="settingsCard settingsSectionCard">
            <div className="settingsSectionHeading">
              <div className="settingsSectionTitleRow">
                <img
                  className="settingsSectionIcon"
                  src="/svg/lab.svg"
                  alt=""
                />
                <h2>Developer</h2>
              </div>
              <p>
                Enable experimental features which may not be as fully fleshed
                out, not documented, and may have bugs.
              </p>
            </div>
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
          </div>
        </div>
        <hr className="settingsFooterRule" />
        <p className="settingsFooter">
          <a href="/docs/privacy.html">Privacy Policy and Usage.</a>
        </p>
      </div>
    </div>
  );
}

function BrowserStorageProvider() {
  const dispatch = Hooks.useDispatch();
  const navigate = Router.useNavigate();
  const idbfs = $$.getIDBFSOrNull();
  const dropboxOauth = $$.getDropboxOauth();
  const servers = $$.getServers();
  const currentFileStoreName = $$.getCurrentFileStoreName();
  const [fileCount, setFileCount] = React.useState<null | number>(null);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const hasOtherStorage = Boolean(dropboxOauth) || servers.length > 0;

  React.useEffect(() => {
    if (!idbfs) {
      setFileCount(null);
      setIsDeleteOpen(false);
      return;
    }
    idbfs.getFileCount().then(
      (count) => setFileCount(count),
      (error) => console.error(error),
    );
  }, [idbfs]);

  let browserFileCountLabel;
  if (!idbfs) {
    browserFileCountLabel = 'No browser storage activated';
  } else if (fileCount === null) {
    browserFileCountLabel = 'Counting files stored…';
  } else if (fileCount === 0) {
    browserFileCountLabel = 'No files stored yet';
  } else {
    browserFileCountLabel = `${fileCount} file${fileCount === 1 ? '' : 's'} stored in the browser`;
  }

  return (
    <section className="settingsProvider">
      <div className="settingsProviderSummary">
        <div className="settingsProviderTitle">
          <div
            className="settingsProviderIconTile"
            style={{ backgroundColor: getBrowserAccentColor() }}
          >
            <span
              className="settingsProviderIconMask"
              style={{
                WebkitMaskImage: `url(${getBrowserIcon()})`,
                maskImage: `url(${getBrowserIcon()})`,
              }}
            />
          </div>
          <div>
            <div className="settingsProviderNameRow">
              <h3>{getBrowserName()}</h3>
              <InfoLink
                href="/docs/file-store-browser.html"
                title="Store files directly in your browser. This is convenient, but clearing your browser data will also remove your files."
              />
            </div>
            <p>{browserFileCountLabel}</p>
          </div>
        </div>
        {idbfs ? (
          <button
            className="button"
            type="button"
            onClick={() => {
              setIsDeleteOpen((value) => !value);
            }}
          >
            Delete Files
          </button>
        ) : null}
      </div>
      {isDeleteOpen ? (
        <div className="settingsProviderWarning">
          <div>
            This removes the files stored in this browser. This cannot be
            undone.
          </div>
          <button
            className="button"
            type="button"
            onClick={() => {
              if (hasOtherStorage) {
                if (currentFileStoreName === 'browser') {
                  if (dropboxOauth) {
                    dispatch(A.changeFileStore('dropbox'));
                  } else if (servers[0]) {
                    dispatch(A.changeFileStore('server', servers[0]));
                  }
                }
                dispatch(A.removeBrowserFiles());
              } else {
                dispatch(A.removeAllStorage());
                navigate('/');
              }
            }}
          >
            Delete Local Files
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DropboxStorageProvider() {
  const dispatch = Hooks.useDispatch();
  const navigate = Router.useNavigate();
  const dropbox = $$.getDropboxOrNull();
  const idbfs = $$.getIDBFSOrNull();
  const servers = $$.getServers();
  const hasOtherStorage = Boolean(idbfs) || servers.length > 0;
  const { persistCodeVerifier, authorizationUrl } = useCodeVerifier();

  return (
    <section className="settingsProvider">
      <div className="settingsProviderSummary">
        <div className="settingsProviderTitle">
          <div className="settingsProviderIconTile">
            <img
              className="settingsProviderIcon"
              src="/svg/dropbox.svg"
              alt=""
            />
          </div>
          <div>
            <div className="settingsProviderNameRow">
              <h3>Dropbox</h3>
              <InfoLink
                href="/docs/file-store-dropbox.html"
                title="Sync files across your devices using a Dropbox folder dedicated to this app."
              />
            </div>
            <p>
              {dropbox
                ? 'Connected to the Dropbox Apps folder.'
                : 'Connect Dropbox to browse and edit files directly.'}
            </p>
          </div>
        </div>
        {dropbox ? (
          <button
            className="button"
            type="button"
            onClick={() => {
              if (
                !confirm(
                  'Are you sure you want to log out of Dropbox? Your Dropbox folder will ' +
                    'still be available on Dropbox or if you sign back in.',
                )
              ) {
                return;
              }
              if (hasOtherStorage) {
                dispatch(A.removeDropboxAccessToken());
              } else {
                dispatch(A.removeAllStorage());
                navigate('/');
              }
            }}
          >
            Sign Out
          </button>
        ) : (
          <a
            className="button"
            href={authorizationUrl}
            onClick={persistCodeVerifier}
          >
            Connect Dropbox
          </a>
        )}
      </div>
    </section>
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
