import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, Hooks, $, $$ } from 'frontend';
import { getDirName, getPathFileName } from 'frontend/utils';
import type { TrackTagsLoadState } from 'frontend/logic/music/metadata';
import type { WriteFolderArtworkResponse } from 'shared/@types/shared';

interface Props {
  folderArtworkUrl: string | null;
  folderArtworkPath: string | null;
  emptyMessage?: string;
  hideEmbeddedArtwork?: boolean;
  tagsState: TrackTagsLoadState;
  trackPath: string;
  serverUrl: string;
}

interface DetailItem {
  key: string;
  value: string;
  href?: string;
  onClick?: () => void;
}

interface OverwriteButtonProps {
  trackPath: string;
  serverUrl: string;
}

function OverwriteButton({ trackPath, serverUrl }: OverwriteButtonProps) {
  const dispatch = Hooks.useDispatch();
  const saveStatus = $$.getMusicFolderArtworkSaveStatus();

  function saveFolderArtwork() {
    dispatch(A.musicFolderArtworkSaveStart());
    fetch(`${serverUrl}/music/artwork?path=${encodeURIComponent(trackPath)}`, {
      method: 'POST',
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(t || `${res.status}`);
          });
        }
        return res.json() as Promise<WriteFolderArtworkResponse>;
      })
      .then(() => dispatch(A.musicFolderArtworkSaveSuccess()))
      .catch(() => dispatch(A.musicFolderArtworkSaveError()));
  }

  return (
    <button
      type="button"
      className="artworkSaveFolderBtn"
      disabled={saveStatus === 'saving' || saveStatus === 'saved'}
      onClick={saveFolderArtwork}
    >
      {saveStatus === 'saving' && 'Saving…'}
      {saveStatus === 'saved' && 'Saved ✓'}
      {saveStatus === 'error' && 'Error — retry'}
      {saveStatus === 'idle' && 'Overwrite with embedded artwork'}
    </button>
  );
}

function ArtworkSection({
  src,
  details,
  children,
  reloading = false,
}: {
  src: string;
  details: DetailItem[];
  children?: React.ReactNode;
  reloading?: boolean;
}) {
  const [naturalWidth, setNaturalWidth] = React.useState<number | null>(null);
  // The resolution of the underlying image's pixels
  const [resolution, setResolution] = React.useState<string>('');
  const [imgError, setImgError] = React.useState(false);

  return (
    <div className="artworkSection">
      {imgError ? (
        <div className="artworkSectionError">Unable to load image</div>
      ) : (
        <img
          className="artworkSectionImage"
          src={src}
          style={naturalWidth ? { maxWidth: naturalWidth } : undefined}
          onLoad={(event) => {
            const img: HTMLImageElement = event.currentTarget;
            setNaturalWidth(img.naturalWidth);
            setResolution(`${img.width} × ${img.height}`);
          }}
          onError={() => setImgError(true)}
        />
      )}
      <div className="artworkSectionDetails">
        {details.map(({ key, value, href, onClick }) => (
          <div key={key} className="artworkSectionDetailsRow">
            <span className="artworkSectionDetailsKey">{key}</span>
            {href ? (
              <a
                className="artworkSectionDetailsLink"
                href={href}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                    return;
                  }
                  e.preventDefault();
                  onClick?.();
                }}
              >
                {value}
              </a>
            ) : (
              <span>{value}</span>
            )}
          </div>
        ))}
        {resolution && !reloading && (
          <div className="artworkSectionDetailsRow">
            <span className="artworkSectionDetailsKey">Resolution</span>
            <span>{resolution}</span>
          </div>
        )}
        {children && <div className="artworkSectionDetailsRow">{children}</div>}
      </div>
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
  serverUrl,
}: Props) {
  const dispatch = Hooks.useDispatch();
  const { getState } = Hooks.useStore();
  const navigate = Router.useNavigate();
  const version = $$.getMusicFolderArtworkVersion();
  const saveStatus = $$.getMusicFolderArtworkSaveStatus();

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
      </div>
    );
  }

  return (
    <div className="editTrackModalArtworkSections">
      {folderArtworkUrl && folderArtworkPath && (
        <div className="artworkBlock">
          <div className="artworkBlockLabel">Folder</div>
          <ArtworkSection
            key={version}
            src={folderArtworkUrl}
            reloading={saveStatus === 'saving'}
            details={[
              {
                key: 'File',
                value: folderArtworkPath,
                href: folderArtworkHref ?? undefined,
                onClick: () => navigateToFile(folderArtworkPath),
              },
            ]}
          >
            {!hideEmbeddedArtwork && embeddedArtwork.length > 0 && (
              <OverwriteButton trackPath={trackPath} serverUrl={serverUrl} />
            )}
          </ArtworkSection>
        </div>
      )}
      {embeddedArtwork.map((entry, i) => {
        const parts = entry.value.split(' — ');
        const rawMime = parts[0] ?? '';
        const pictureType = parts[1] ?? '';
        const mimeType = rawMime.startsWith('image/') ? rawMime : 'image/jpeg';
        const src = `data:${mimeType};base64,${entry.binary}`;
        const details: DetailItem[] = [];
        if (rawMime) {
          details.push({ key: 'Format', value: rawMime });
        }
        if (pictureType) {
          details.push({ key: 'Type', value: pictureType });
        }
        return (
          <div key={i} className="artworkBlock">
            <div className="artworkBlockLabel">
              {embeddedArtwork.length > 1 ? `Embedded ${i + 1}` : 'Embedded'}
            </div>
            <ArtworkSection src={src} details={details} />
          </div>
        );
      })}
    </div>
  );
}
