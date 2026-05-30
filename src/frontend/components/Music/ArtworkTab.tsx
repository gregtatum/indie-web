import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, Hooks, $, $$ } from 'frontend';
import { getDirName, getPathFileName } from 'frontend/utils';
import type { TrackTagsLoadState } from 'frontend/logic/music/tags';
import type { WriteFolderArtResponse } from 'shared/@types/shared';

interface Props {
  artUrl: string | null;
  coverArtPath: string | null;
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

function FolderArtOverwriteButton({
  trackPath,
  serverUrl,
}: {
  trackPath: string;
  serverUrl: string;
}) {
  const dispatch = Hooks.useDispatch();
  const saveStatus = $$.getMusicFolderArtSaveStatus();

  function saveFolderArt() {
    dispatch(A.musicFolderArtSaveStart());
    fetch(
      `${serverUrl}/music/write-folder-art?path=${encodeURIComponent(trackPath)}`,
      { method: 'POST' },
    )
      .then((res) => {
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(t || `${res.status}`);
          });
        }
        return res.json() as Promise<WriteFolderArtResponse>;
      })
      .then(() => dispatch(A.musicFolderArtSaveSuccess()))
      .catch(() => dispatch(A.musicFolderArtSaveError()));
  }

  return (
    <button
      type="button"
      className="artworkSaveFolderBtn"
      disabled={saveStatus === 'saving' || saveStatus === 'saved'}
      onClick={saveFolderArt}
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
}: {
  src: string;
  details: DetailItem[];
  children?: React.ReactNode;
}) {
  const [naturalWidth, setNaturalWidth] = React.useState<number | null>(null);
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
          style={naturalWidth !== null ? { maxWidth: naturalWidth } : undefined}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            setNaturalWidth(w);
            setResolution(`${w} × ${h}`);
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
        {resolution && (
          <div className="artworkSectionDetailsRow">
            <span className="artworkSectionDetailsKey">Resolution</span>
            <span>{resolution}</span>
          </div>
        )}
        {children && (
          <div className="artworkSectionDetailsRow">{children}</div>
        )}
      </div>
    </div>
  );
}

export function ArtworkTab({
  artUrl,
  coverArtPath,
  tagsState,
  trackPath,
  serverUrl,
}: Props) {
  const dispatch = Hooks.useDispatch();
  const { getState } = Hooks.useStore();
  const navigate = Router.useNavigate();
  const version = $$.getMusicFolderArtVersion();

  const apics = React.useMemo(() => {
    if (tagsState.status !== 'loaded') {
      return [];
    }
    return tagsState.data.native
      .flatMap((block) => block.tags)
      .filter((tag) => tag.id === 'APIC' && tag.binary !== undefined)
      .map((tag) => ({ value: tag.value, binary: tag.binary! }))
      .filter((apic) => !apic.value.startsWith('-->'));
  }, [tagsState]);

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

  const folderArtHref = React.useMemo(() => {
    if (!coverArtPath) {
      return null;
    }
    const fsSlug = $.getCurrentFileStoreSlug(getState());
    return `/${fsSlug}/folder${getDirName(coverArtPath)}`;
  }, [coverArtPath, getState]);

  if (!artUrl && tagsState.status === 'loading') {
    return (
      <div className="editTrackModalArtwork">
        <div className="editTrackModalArtworkEmpty">Loading…</div>
      </div>
    );
  }

  if (!artUrl && (apics.length === 0 || tagsState.status === 'error')) {
    return (
      <div className="editTrackModalArtwork">
        <div className="editTrackModalArtworkEmpty">No artwork found</div>
      </div>
    );
  }

  return (
    <div className="editTrackModalArtworkSections">
      {artUrl && coverArtPath && (
        <div className="artworkBlock">
          <div className="artworkBlockLabel">Folder</div>
          <ArtworkSection
            key={version}
            src={artUrl}
            details={[
              {
                key: 'File',
                value: coverArtPath,
                href: folderArtHref ?? undefined,
                onClick: () => navigateToFile(coverArtPath),
              },
            ]}
          >
            {apics.length > 0 && (
              <FolderArtOverwriteButton
                trackPath={trackPath}
                serverUrl={serverUrl}
              />
            )}
          </ArtworkSection>
        </div>
      )}
      {apics.map((apic, i) => {
        const parts = apic.value.split(' — ');
        const rawMime = parts[0] ?? '';
        const pictureType = parts[1] ?? '';
        const mimeType = rawMime.startsWith('image/') ? rawMime : 'image/jpeg';
        const src = `data:${mimeType};base64,${apic.binary}`;
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
              {apics.length > 1 ? `Embedded ${i + 1}` : 'Embedded'}
            </div>
            <ArtworkSection src={src} details={details} />
          </div>
        );
      })}
    </div>
  );
}
