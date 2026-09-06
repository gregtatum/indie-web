import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, Hooks, $, $$ } from 'frontend';
import { getDirName, getPathFileName } from 'frontend/utils';
import type { TrackTagsLoadState } from 'frontend/logic/music/metadata';
import type {
  EmbedFolderArtworkResponse,
  WriteFolderArtworkResponse,
} from 'shared/@types/shared';

interface Props {
  folderArtworkUrl: string | null;
  folderArtworkPath: string | null;
  emptyMessage?: string;
  hideEmbeddedArtwork?: boolean;
  tagsState: TrackTagsLoadState;
  trackPath: string;
  embeddableTrackPaths: string[];
  onFolderArtworkWritten: (folderArtworkPath: string) => void;
  onTracksEmbedded: (trackPaths: string[]) => void;
  onEmbeddedArtworkRemoved: (trackPath: string) => void;
  serverUrl: string;
}

/**
 * How long a button lingers on its "done" state ("Saved", "Embedded")
 * before it returns to the actionable label.
 */
const STATUS_RESET_MS = 2500;

/**
 * Human-readable byte size, e.g. 240 KB.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Decoded byte length of a base64 string, ignoring padding.
 */
function base64ByteLength(b64: string): number {
  let length = Math.floor((b64.length * 3) / 4);
  if (b64.endsWith('==')) {
    length -= 2;
  } else if (b64.endsWith('=')) {
    length -= 1;
  }
  return length;
}

/**
 * Join the non-empty parts of a middot-separated metadata run.
 */
function metaLine(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' · ');
}

/**
 * Inline SVG icons. Kept inline (rather than /svg/*.svg files) so they inherit
 * the surrounding text colour via `currentColor`.
 */
function OpenExternalIcon() {
  return (
    <svg
      className="artworkPathLinkIcon"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 13v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={
        open
          ? 'artworkEmbeddedChevron artworkEmbeddedChevron-open'
          : 'artworkEmbeddedChevron'
      }
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function PictureIcon() {
  return (
    <svg
      className="artworkChangeBtnIcon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-4.5-4.5L7 21" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="artworkEmbedBannerIcon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function EmbedIcon() {
  return (
    <svg
      className="artworkEmbedBannerButtonIcon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

interface ArtworkButtonProps {
  trackPath: string;
  serverUrl: string;
  /** Called with the written folder artwork path once a save succeeds. */
  onSaved: (folderArtworkPath: string) => void;
}

function useFolderArtworkSave(
  serverUrl: string,
  onSaved: (folderArtworkPath: string) => void,
) {
  const dispatch = Hooks.useDispatch();
  const saveStatus = $$.getMusicFolderArtworkSaveStatus();
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    if (saveStatus === 'idle') {
      setActive(false);
    }
  }, [saveStatus]);

  // Drop back to the actionable label a beat after a success.
  React.useEffect(() => {
    if (!active || saveStatus !== 'saved') {
      return undefined;
    }
    const id = window.setTimeout(() => setActive(false), STATUS_RESET_MS);
    return () => window.clearTimeout(id);
  }, [active, saveStatus]);

  const save = React.useCallback(
    (trackPath: string, body?: { data: Blob; contentType: string }) => {
      setActive(true);
      dispatch(A.musicFolderArtworkSaveStart());
      fetch(
        `${serverUrl}/music/artwork?path=${encodeURIComponent(trackPath)}`,
        body
          ? {
              method: 'POST',
              headers: { 'Content-Type': body.contentType },
              body: body.data,
            }
          : { method: 'POST' },
      )
        .then((res) => {
          if (!res.ok) {
            return res.text().then((t) => {
              throw new Error(t || `${res.status}`);
            });
          }
          return res.json() as Promise<WriteFolderArtworkResponse>;
        })
        .then((data) => {
          if (data.folderArtworkPath) {
            onSaved(data.folderArtworkPath);
          }
          dispatch(A.musicFolderArtworkSaveSuccess());
        })
        .catch(() => dispatch(A.musicFolderArtworkSaveError()));
    },
    [dispatch, serverUrl, onSaved],
  );

  return { saveStatus, active, save };
}

function artworkButtonStatus(
  active: boolean,
  saveStatus: ReturnType<typeof $$.getMusicFolderArtworkSaveStatus>,
): string | null {
  if (!active) {
    return null;
  }
  if (saveStatus === 'saving') {
    return 'Saving…';
  }
  if (saveStatus === 'saved') {
    return 'Saved';
  }
  if (saveStatus === 'error') {
    return 'Error — retry';
  }
  return null;
}

function ChangeArtworkButton({
  trackPath,
  serverUrl,
  onSaved,
  label = 'Change album artwork',
}: ArtworkButtonProps & { label?: string }) {
  const { saveStatus, active, save } = useFolderArtworkSave(serverUrl, onSaved);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const status = artworkButtonStatus(active, saveStatus);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            save(trackPath, {
              data: file,
              contentType: file.type || 'image/jpeg',
            });
          }
        }}
      />
      <button
        type="button"
        className="artworkChangeBtn"
        disabled={saveStatus === 'saving' || (active && saveStatus === 'saved')}
        onClick={() => inputRef.current?.click()}
      >
        {status ?? (
          <>
            <PictureIcon />
            {label}
          </>
        )}
      </button>
    </>
  );
}

function SetAsAlbumArtworkButton({
  trackPath,
  serverUrl,
  onSaved,
  format,
}: ArtworkButtonProps & { format: string }) {
  const { saveStatus, active, save } = useFolderArtworkSave(serverUrl, onSaved);
  const status = artworkButtonStatus(active, saveStatus);
  const targetFile = format === 'image/png' ? 'Folder.png' : 'Folder.jpg';

  return (
    <button
      type="button"
      className="artworkSaveFolderBtn"
      disabled={saveStatus === 'saving' || (active && saveStatus === 'saved')}
      onClick={() => save(trackPath)}
    >
      {status ?? `Set as ${targetFile} artwork`}
    </button>
  );
}

function useRemoveEmbeddedArtwork(
  serverUrl: string,
  onRemoved: (trackPath: string) => void,
) {
  const dispatch = Hooks.useDispatch();
  const removeStatus = $$.getMusicEmbeddedArtworkRemoveStatus();
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    if (removeStatus === 'idle') {
      setActive(false);
    }
  }, [removeStatus]);

  const remove = React.useCallback(
    (path: string) => {
      setActive(true);
      dispatch(A.musicEmbeddedArtworkRemoveStart());
      fetch(
        `${serverUrl}/music/artwork/embedded/remove?path=${encodeURIComponent(path)}`,
        { method: 'POST' },
      )
        .then((res) => {
          if (!res.ok) {
            return res.text().then((t) => {
              throw new Error(t || `${res.status}`);
            });
          }
          return res.json();
        })
        .then(() => {
          onRemoved(path);
          dispatch(A.musicEmbeddedArtworkRemoveSuccess());
        })
        .catch(() => dispatch(A.musicEmbeddedArtworkRemoveError()));
    },
    [dispatch, serverUrl, onRemoved],
  );

  return { removeStatus, active, remove };
}

function RemoveEmbeddedArtworkButton({
  trackPath,
  serverUrl,
  onRemoved,
}: {
  trackPath: string;
  serverUrl: string;
  onRemoved: (trackPath: string) => void;
}) {
  const { removeStatus, active, remove } = useRemoveEmbeddedArtwork(
    serverUrl,
    onRemoved,
  );
  const [confirming, setConfirming] = React.useState(false);
  const busy =
    active && (removeStatus === 'saving' || removeStatus === 'saved');

  let label: React.ReactNode = (
    <>
      <span className="artworkEmbeddedRemoveBtnIcon" aria-hidden="true" />
      Remove
    </>
  );
  if (active && removeStatus === 'saving') {
    label = 'Removing…';
  } else if (active && removeStatus === 'saved') {
    label = 'Removed';
  } else if (active && removeStatus === 'error') {
    label = 'Error — retry';
  } else if (confirming) {
    label = 'Click to confirm';
  }

  return (
    <button
      type="button"
      className={
        confirming
          ? 'artworkEmbeddedRemoveBtn artworkEmbeddedRemoveBtnConfirm'
          : 'artworkEmbeddedRemoveBtn'
      }
      disabled={busy}
      onClick={() => {
        if (busy) {
          return;
        }
        if (confirming || (active && removeStatus === 'error')) {
          setConfirming(false);
          remove(trackPath);
        } else {
          setConfirming(true);
        }
      }}
      onBlur={() => setConfirming(false)}
    >
      {label}
    </button>
  );
}

function EmbedArtworkBanner({
  folderArtworkPath,
  trackPaths,
  serverUrl,
  onEmbedded,
}: {
  folderArtworkPath: string;
  trackPaths: string[];
  serverUrl: string;
  onEmbedded: (trackPaths: string[]) => void;
}) {
  const dispatch = Hooks.useDispatch();
  const embedStatus = $$.getMusicFolderArtworkEmbedStatus();
  const [statusHidden, setStatusHidden] = React.useState(false);
  const count = trackPaths.length;
  const tracksLabel = count === 1 ? 'this track' : `${count} tracks`;

  // Drop back to the actionable label a beat after a success.
  React.useEffect(() => {
    if (embedStatus !== 'saved') {
      setStatusHidden(false);
      return undefined;
    }
    const id = window.setTimeout(() => setStatusHidden(true), STATUS_RESET_MS);
    return () => window.clearTimeout(id);
  }, [embedStatus]);

  const status = statusHidden ? 'idle' : embedStatus;

  function embed() {
    dispatch(A.musicFolderArtworkEmbedStart());
    fetch(`${serverUrl}/music/artwork/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderArtworkPath, trackPaths }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(t || `${res.status}`);
          });
        }
        return res.json() as Promise<EmbedFolderArtworkResponse>;
      })
      .then((data) => {
        if (data.updated.length > 0) {
          onEmbedded(data.updated);
        }
        if (data.updated.length === 0 && data.errors.length > 0) {
          dispatch(A.musicFolderArtworkEmbedError());
        } else {
          dispatch(A.musicFolderArtworkEmbedSuccess());
        }
      })
      .catch(() => dispatch(A.musicFolderArtworkEmbedError()));
  }

  let buttonLabel: React.ReactNode = (
    <>
      <EmbedIcon />
      Embed artwork
    </>
  );
  if (status === 'saving') {
    buttonLabel = 'Embedding…';
  } else if (status === 'saved') {
    buttonLabel = 'Embedded';
  } else if (status === 'error') {
    buttonLabel = 'Error — retry';
  }

  return (
    <div className="artworkEmbedBanner">
      <InfoIcon />
      <div className="artworkEmbedBannerText">
        <strong>The album artwork isn’t saved inside {tracksLabel}.</strong>
        <span>
          Embedding it keeps each file portable, so another player or app can
          show the artwork without this folder.
        </span>
      </div>
      <button
        type="button"
        className="artworkEmbedBannerButton"
        disabled={status === 'saving' || status === 'saved'}
        onClick={embed}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function AlbumArtwork({
  src,
  fileName,
  dirName,
  dirHref,
  onOpenDir,
  children,
}: {
  src: string;
  fileName: string;
  dirName: string;
  dirHref: string | null;
  onOpenDir: () => void;
  children?: React.ReactNode;
}) {
  const [dimensions, setDimensions] = React.useState<string | null>(null);
  const [sizeBytes, setSizeBytes] = React.useState<number | null>(null);
  const [imgError, setImgError] = React.useState(false);

  // Send a HEAD request for the Content-Length so the meta line can show
  // "· 240 KB". This is best effort, so the size segment is dropped if the
  // request fails.
  React.useEffect(() => {
    let cancelled = false;
    fetch(src, { method: 'HEAD' })
      .then((res) => {
        const header = res.ok ? res.headers.get('content-length') : null;
        const parsed = header ? parseInt(header, 10) : NaN;
        if (!cancelled && Number.isFinite(parsed) && parsed > 0) {
          setSizeBytes(parsed);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="artworkAlbumLayout">
      <div className="artworkAlbumImageWrap">
        {imgError ? (
          <div className="artworkSectionError">Unable to load image</div>
        ) : (
          <img
            className="artworkSectionImage"
            src={src}
            onLoad={(event) => {
              const img = event.currentTarget;
              setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
            }}
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <div className="artworkAlbumInfo">
        <div className="artworkAlbumHeading">Album artwork</div>
        <div className="artworkMetaLine">
          {metaLine([
            fileName,
            dimensions,
            sizeBytes ? formatBytes(sizeBytes) : null,
          ])}
        </div>
        {dirHref && (
          <a
            className="artworkPathLink"
            href={dirHref}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                return;
              }
              e.preventDefault();
              onOpenDir();
            }}
          >
            <span className="artworkPathLinkText">{dirName}</span>
            <OpenExternalIcon />
          </a>
        )}
        {children && <div className="artworkAlbumActions">{children}</div>}
      </div>
    </div>
  );
}

function EmbeddedArtworkRow({
  src,
  format,
  pictureType,
  sizeBytes,
  trackPath,
  serverUrl,
  onSetAsAlbumArtwork,
  onRemoved,
}: {
  src: string;
  format: string;
  pictureType: string;
  sizeBytes: number;
  trackPath: string;
  serverUrl: string;
  onSetAsAlbumArtwork: (folderArtworkPath: string) => void;
  onRemoved: (trackPath: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [dimensions, setDimensions] = React.useState<string | null>(null);
  const [imgError, setImgError] = React.useState(false);

  return (
    <div className="artworkEmbeddedRow">
      <button
        type="button"
        className="artworkEmbeddedRowToggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronIcon open={expanded} />
        <span className="artworkEmbeddedThumb">
          {!imgError && (
            <img
              src={src}
              alt=""
              onLoad={(event) => {
                const img = event.currentTarget;
                setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
              }}
              onError={() => setImgError(true)}
            />
          )}
        </span>
        <span className="artworkEmbeddedInfo">
          <span className="artworkMetaLine">
            {metaLine([
              format || 'image',
              dimensions,
              sizeBytes > 0 ? formatBytes(sizeBytes) : null,
            ])}
          </span>
          <span className="artworkEmbeddedSub">Embedded in ID3 (APIC)</span>
        </span>
      </button>
      {expanded && (
        <div className="artworkEmbeddedExpanded">
          {!imgError && (
            <img className="artworkSectionImage" src={src} alt="" />
          )}
          {pictureType && (
            <div className="artworkEmbeddedSub">{pictureType}</div>
          )}
          <div className="artworkEmbeddedExpandedActions">
            <SetAsAlbumArtworkButton
              trackPath={trackPath}
              serverUrl={serverUrl}
              format={format}
              onSaved={onSetAsAlbumArtwork}
            />
            <RemoveEmbeddedArtworkButton
              trackPath={trackPath}
              serverUrl={serverUrl}
              onRemoved={onRemoved}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ArtworkTab({
  folderArtworkUrl,
  folderArtworkPath,
  emptyMessage = 'No artwork found',
  hideEmbeddedArtwork = false,
  tagsState,
  trackPath,
  embeddableTrackPaths,
  onFolderArtworkWritten,
  onTracksEmbedded,
  onEmbeddedArtworkRemoved,
  serverUrl,
}: Props) {
  const dispatch = Hooks.useDispatch();
  const { getState } = Hooks.useStore();
  const navigate = Router.useNavigate();
  const version = $$.getMusicFolderArtworkVersion();

  const embeddedArtwork = React.useMemo(() => {
    if (hideEmbeddedArtwork) {
      return [];
    }
    if (tagsState.status !== 'loaded') {
      return [];
    }
    return tagsState.data.blocks
      .flatMap((block) => block.tags)
      .filter((tag) => tag.id === 'APIC' && tag.binary !== undefined)
      .map((tag) => ({ value: tag.value, binary: tag.binary! }))
      .filter((entry) => !entry.value.startsWith('-->'));
  }, [hideEmbeddedArtwork, tagsState]);

  const navigateToFile = React.useCallback(
    (filePath: string) => {
      const fsSlug = $.getCurrentFileStoreSlug(getState());
      const folderPath = getDirName(filePath);
      const fileName = getPathFileName(filePath);
      dispatch(A.changeFileFocus(folderPath, fileName));
      navigate(`/${fsSlug}/folder${folderPath}`);
    },
    [dispatch, getState, navigate],
  );

  const folderArtworkHref = React.useMemo(() => {
    if (!folderArtworkPath) {
      return null;
    }
    const fsSlug = $.getCurrentFileStoreSlug(getState());
    return `/${fsSlug}/folder${getDirName(folderArtworkPath)}`;
  }, [folderArtworkPath, getState]);

  if (!folderArtworkUrl && tagsState.status === 'loading') {
    return (
      <div className="editTrackModalArtwork">
        <div className="editTrackModalArtworkEmpty">Loading…</div>
      </div>
    );
  }

  if (
    !folderArtworkUrl &&
    (embeddedArtwork.length === 0 || tagsState.status === 'error')
  ) {
    return (
      <div className="editTrackModalArtwork">
        <div className="editTrackModalArtworkEmpty">{emptyMessage}</div>
        {!hideEmbeddedArtwork && (
          <ChangeArtworkButton
            trackPath={trackPath}
            serverUrl={serverUrl}
            onSaved={onFolderArtworkWritten}
            label="Add album artwork"
          />
        )}
      </div>
    );
  }

  return (
    <div className="editTrackModalArtworkSections">
      {folderArtworkUrl && folderArtworkPath && (
        <div className="artworkBlock">
          <div className="artworkBlockLabel">Album artwork</div>
          <AlbumArtwork
            src={
              version ? `${folderArtworkUrl}&v=${version}` : folderArtworkUrl
            }
            fileName={getPathFileName(folderArtworkPath)}
            dirName={`${getDirName(folderArtworkPath)}/`}
            dirHref={folderArtworkHref}
            onOpenDir={() => navigateToFile(folderArtworkPath)}
          >
            {!hideEmbeddedArtwork && (
              <ChangeArtworkButton
                trackPath={trackPath}
                serverUrl={serverUrl}
                onSaved={onFolderArtworkWritten}
              />
            )}
          </AlbumArtwork>
        </div>
      )}
      {folderArtworkUrl &&
        folderArtworkPath &&
        !hideEmbeddedArtwork &&
        embeddableTrackPaths.length > 0 && (
          <EmbedArtworkBanner
            folderArtworkPath={folderArtworkPath}
            trackPaths={embeddableTrackPaths}
            onEmbedded={onTracksEmbedded}
            serverUrl={serverUrl}
          />
        )}
      {!hideEmbeddedArtwork && embeddedArtwork.length > 0 && (
        <>
          <div className="artworkDivider" />
          <div className="artworkBlock">
            <div className="artworkBlockLabel">Embedded in this file</div>
            <div className="artworkEmbeddedList">
              {embeddedArtwork.map((entry, i) => {
                const parts = entry.value.split(' — ');
                const rawMime = parts[0] ?? '';
                const pictureType = parts[1] ?? '';
                const mimeType = rawMime.startsWith('image/')
                  ? rawMime
                  : 'image/jpeg';
                const src = `data:${mimeType};base64,${entry.binary}`;
                return (
                  <EmbeddedArtworkRow
                    key={i}
                    src={src}
                    format={rawMime}
                    pictureType={pictureType}
                    sizeBytes={base64ByteLength(entry.binary)}
                    trackPath={trackPath}
                    serverUrl={serverUrl}
                    onSetAsAlbumArtwork={onFolderArtworkWritten}
                    onRemoved={onEmbeddedArtworkRemoved}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
