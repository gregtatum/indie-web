import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, $$, Hooks, T } from 'frontend';
import {
  getBrowserAccentColor,
  getBrowserIcon,
  getBrowserName,
} from 'frontend/logic/app-logic';
import { IDB_CACHE_NAME } from 'frontend/logic/file-store/dropbox-fs';
import {
  DROPBOX_CACHE_KEY,
  getMaxCacheBudget,
  isCacheEnabled,
  resolveCacheBudget,
} from 'frontend/logic/file-store';
import { openIDBFS } from 'frontend/logic/file-store/indexeddb-fs';
import { FILE_CATEGORIES, formatBytes, getEnv } from 'frontend/utils';
import { useCodeVerifier } from 'frontend/hooks/pcse';
import { ConnectedFoldersSettings } from './ConnectFolder';
import { InfoLink } from './InfoLink';
import { Tooltip } from './Tooltip';
import './Settings.css';

const CATEGORY_LABELS: Record<T.FileCategory, string> = {
  audio: 'Audio',
  text: 'Text',
  images: 'Images',
  pdf: 'PDFs',
  other: 'Other',
};

type CacheUsage =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      categories: T.CacheCategoryUsage;
      totalBytes: number;
      fileCount: number;
      maxBudgetBytes: number;
    };

export function StoreCache({
  label,
  cacheKey,
  dbName,
}: {
  label: string;
  cacheKey: string;
  dbName: string;
}) {
  const dispatch = Hooks.useDispatch();
  const enabled = isCacheEnabled($$.getFileStoreCacheSettings(), cacheKey);
  const workerClient = $$.getWorkerClient();
  const budgetSetting = $$.getFileStoreCacheBudget();
  const [expanded, setExpanded] = React.useState(false);
  const [usage, setUsage] = React.useState<CacheUsage>({ status: 'loading' });
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = React.useCallback(async () => {
    setUsage({ status: 'loading' });
    try {
      const cache = await openIDBFS(dbName, workerClient);
      const [categories, maxBudgetBytes] = await Promise.all([
        cache.getUsageByCategory(),
        getMaxCacheBudget(),
      ]);
      if (isMountedRef.current) {
        setUsage({
          status: 'ready',
          categories,
          totalBytes: sumCategories(categories, 'bytes'),
          fileCount: sumCategories(categories, 'files'),
          maxBudgetBytes,
        });
      }
    } catch (error) {
      console.error(error);
      if (isMountedRef.current) {
        setUsage({ status: 'error', error: 'Could not estimate cache size.' });
      }
    }
  }, [dbName, workerClient]);

  const needsUsage = enabled || expanded;
  React.useEffect(() => {
    if (needsUsage) {
      void refresh();
    }
  }, [needsUsage, refresh]);

  async function changeBudget(value: number) {
    dispatch(A.setFileStoreCacheBudget(value));
    try {
      const cache = await openIDBFS(dbName, workerClient);
      await cache.evictLargeFiles(resolveCacheBudget(value, maxBudgetBytes));
      await refresh();
    } catch (error) {
      console.error(error);
    }
  }

  async function clear() {
    if (
      !window.confirm(
        `Clear the ${label} cache? Files will be downloaded again the next time you view them.`,
      )
    ) {
      return;
    }
    setUsage({ status: 'loading' });
    try {
      const cache = await openIDBFS(dbName, workerClient);
      await cache.clear();
      await refresh();
    } catch (error) {
      console.error(error);
      if (isMountedRef.current) {
        setUsage({ status: 'error', error: 'Could not clear cache.' });
      }
    }
  }

  let usageSummary = 'Estimating...';
  if (usage.status === 'error') {
    usageSummary = usage.error;
  } else if (usage.status === 'ready') {
    usageSummary =
      usage.fileCount === 0 ? 'Empty' : formatBytes(usage.totalBytes);
  }
  const summary = enabled ? usageSummary : 'Off';
  const categoryRows =
    usage.status === 'ready'
      ? FILE_CATEGORIES.filter(
          (category) => usage.categories[category].files > 0,
        ).map((category) => {
          const { bytes } = usage.categories[category];
          const percent = usage.totalBytes
            ? ((bytes / usage.totalBytes) * 100).toFixed(1)
            : '0.0';
          return { category, bytes, percent };
        })
      : [];
  const textBytes = usage.status === 'ready' ? usage.categories.text.bytes : 0;
  const largeBytes =
    usage.status === 'ready' ? usage.totalBytes - textBytes : 0;
  const maxBudgetBytes = usage.status === 'ready' ? usage.maxBudgetBytes : 0;
  const budgetBytes = resolveCacheBudget(budgetSetting, maxBudgetBytes);
  const barBytes = textBytes + Math.max(budgetBytes, largeBytes);
  const barRows = [
    ...categoryRows.filter(({ category }) => category === 'text'),
    ...categoryRows.filter(({ category }) => category !== 'text'),
  ];
  const canClear =
    usage.status === 'error' ||
    (usage.status === 'ready' && usage.fileCount !== 0);

  return (
    <div className="storeCache">
      <div className="storeCacheSummary">
        <button
          type="button"
          className="storeCacheToggle"
          aria-expanded={expanded}
          aria-label={`${label} cache: ${summary}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="disclosureChevron" aria-hidden="true" />
          <span className="storeCacheTitle">Cache</span>
          <span className="storeCacheSummaryText">{summary}</span>
          <span className="storeCacheBar">
            {(enabled ? barRows : []).map(({ category, bytes, percent }) => (
              <Tooltip
                key={category}
                className={`storeCacheBarSegment storeCacheCategory-${category}`}
                style={{ flexBasis: `${(bytes / barBytes) * 100}%` }}
                text={`${CATEGORY_LABELS[category]} · ${formatBytes(bytes)} (${percent}%)`}
              >
                <span
                  className="storeCacheBarFill"
                  role="img"
                  aria-label={CATEGORY_LABELS[category]}
                />
              </Tooltip>
            ))}
            {enabled && usage.status === 'ready' && barBytes > 0 && (
              <span
                className="storeCacheBarLimit"
                style={{
                  insetInlineStart: `${((textBytes + budgetBytes) / barBytes) * 100}%`,
                }}
              />
            )}
          </span>
        </button>
      </div>
      {expanded && (
        <div className="storeCacheBody">
          <div className="storeCacheOptions">
            <label className="storeCacheOption">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) =>
                  dispatch(
                    A.setFileStoreCacheEnabled(cacheKey, event.target.checked),
                  )
                }
              />
              Enable offline caching
            </label>
            <button
              type="button"
              className="button"
              aria-label={`Clear ${label} Cache`}
              disabled={!canClear}
              onClick={clear}
            >
              Clear
            </button>
          </div>
          {usage.status === 'ready' && (
            <div className="storeCacheOption">
              <Tooltip text="Music, images, and other large files are saved for offline use up to this limit. Notes and other small text files are always saved.">
                <button
                  type="button"
                  className="storeCacheHelp"
                  aria-label="About the limit"
                >
                  <span className="infoLinkIcon" />
                </button>
              </Tooltip>
              <label htmlFor="storeCacheLimit">Limit</label>
              <select
                id="storeCacheLimit"
                value={budgetBytes}
                onChange={(event) =>
                  void changeBudget(Number(event.target.value))
                }
              >
                {getBudgetChoices(budgetBytes, maxBudgetBytes).map((bytes) => (
                  <option key={bytes} value={bytes}>
                    {formatBytes(bytes)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {usage.status === 'ready' && usage.fileCount > 0 ? (
            <table className="storeCacheTable">
              <tbody>
                {categoryRows.map(({ category, bytes, percent }) => {
                  return (
                    <tr
                      key={category}
                      className={`storeCacheCategory-${category}`}
                    >
                      <td className="storeCacheCategoryIconCell">
                        <span
                          className="storeCacheCategoryIcon"
                          aria-hidden="true"
                        />
                      </td>
                      <th scope="row">{CATEGORY_LABELS[category]}</th>
                      <td>
                        <span
                          className="storeCacheCategoryDot"
                          aria-hidden="true"
                        />
                        {formatBytes(bytes)}{' '}
                        <span className="storeCachePercent">({percent}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            usage.status !== 'ready' && (
              <p className="storeCacheMessage">{usageSummary}</p>
            )
          )}
        </div>
      )}
    </div>
  );
}

const BUDGET_PRESETS = [
  100_000_000, 250_000_000, 500_000_000, 1_000_000_000, 2_000_000_000,
  5_000_000_000, 10_000_000_000, 25_000_000_000, 50_000_000_000,
];

function getBudgetChoices(current: number, max: number): number[] {
  const choices = new Set(BUDGET_PRESETS.filter((bytes) => bytes <= max));
  choices.add(current);
  return [...choices].sort((a, b) => a - b);
}

function sumCategories(
  categories: T.CacheCategoryUsage,
  field: 'bytes' | 'files',
): number {
  return FILE_CATEGORIES.reduce(
    (total, category) => total + categories[category][field],
    0,
  );
}

export function Settings() {
  const experimentalFeatures = $$.getExperimentalFeatures();
  const editorAutocomplete = $$.getEditorAutocompleteSettings();
  const inputMode = $$.getInputMode();
  const dropboxOauth = $$.getDropboxOauth();
  const idbfs = $$.getIDBFSOrNull();
  const servers = $$.getServers();
  let nonServerFallbackStorage: T.FileStoreName | null = null;
  if (idbfs) {
    nonServerFallbackStorage = 'browser';
  } else if (dropboxOauth) {
    nonServerFallbackStorage = 'dropbox';
  }
  const dispatch = Hooks.useDispatch();
  Hooks.useRetainScroll();

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
            <fieldset className="settingsFieldset">
              <legend>Primary Input:</legend>
              <div>
                <input
                  type="radio"
                  id="input-mode-auto"
                  name="input-mode"
                  defaultChecked={inputMode === 'auto'}
                  onChange={() => dispatch(A.setInputMode('auto'))}
                />
                <label htmlFor="input-mode-auto">Auto Detect</label>
                <input
                  type="radio"
                  id="input-mode-touch"
                  name="input-mode"
                  defaultChecked={inputMode === 'touch'}
                  onChange={() => dispatch(A.setInputMode('touch'))}
                />
                <label htmlFor="input-mode-touch">Touch</label>
                <input
                  type="radio"
                  id="input-mode-mouse"
                  name="input-mode"
                  defaultChecked={inputMode === 'mouse'}
                  onChange={() => dispatch(A.setInputMode('mouse'))}
                />
                <label htmlFor="input-mode-mouse">Mouse &amp; Keyboard</label>
              </div>
            </fieldset>
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
      {dropbox && (
        <StoreCache
          label="Dropbox"
          cacheKey={DROPBOX_CACHE_KEY}
          dbName={IDB_CACHE_NAME}
        />
      )}
    </section>
  );
}
