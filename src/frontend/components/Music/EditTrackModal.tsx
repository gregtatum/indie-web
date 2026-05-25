import * as React from 'react';
import { $$ } from 'frontend';
import { Modal } from 'frontend/components/Modal';
import { Tabs } from 'frontend/components/Tabs';
import { TagsTab } from './TagsTab';
import './EditTrackModal.css';

type TabId = 'details' | 'artwork' | 'id3';

interface Props {
  trackPath: string | null;
  onClose: () => void;
}

export function EditTrackModal({ trackPath, onClose }: Props) {
  const tracks = $$.getMusicTracks();
  const track = tracks.find((t) => t.path === trackPath) ?? null;
  const server = $$.getCurrentServerOrNull();

  const [activeTab, setActiveTab] = React.useState<TabId>('details');
  const [title, setTitle] = React.useState('');
  const [artist, setArtist] = React.useState('');
  const [album, setAlbum] = React.useState('');
  const [genre, setGenre] = React.useState('');
  const [trackNumber, setTrackNumber] = React.useState('');

  React.useEffect(() => {
    setTitle(track?.title ?? '');
    setArtist(track?.artist ?? '');
    setAlbum(track?.album ?? '');
    setGenre(track?.genre ?? '');
    setTrackNumber(
      track?.track !== null && track?.track !== undefined
        ? String(track.track)
        : '',
    );
    setActiveTab('details');
  }, [trackPath]);

  const artUrl =
    server && track?.coverArt
      ? `${server.url}/music/cover-art?path=${encodeURIComponent(track.coverArt)}`
      : null;

  const tabs = [
    {
      id: 'details' as TabId,
      label: 'Details',
      panel: (
        <div className="editTrackModalDetails">
          <label className="editTrackModalField">
            <span className="editTrackModalLabel">Title</span>
            <input
              className="editTrackModalInput"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="editTrackModalField">
            <span className="editTrackModalLabel">Artist</span>
            <input
              className="editTrackModalInput"
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </label>
          <label className="editTrackModalField">
            <span className="editTrackModalLabel">Album</span>
            <input
              className="editTrackModalInput"
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
            />
          </label>
          <label className="editTrackModalField">
            <span className="editTrackModalLabel">Genre</span>
            <input
              className="editTrackModalInput"
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
          </label>
          <label className="editTrackModalField">
            <span className="editTrackModalLabel">Track</span>
            <input
              className="editTrackModalInput editTrackModalInput-short"
              type="number"
              min="1"
              value={trackNumber}
              onChange={(e) => setTrackNumber(e.target.value)}
            />
          </label>
        </div>
      ),
    },
    {
      id: 'artwork' as TabId,
      label: 'Artwork',
      panel: (
        <div className="editTrackModalArtwork">
          {artUrl ? (
            <img
              className="editTrackModalArtworkImage"
              src={artUrl}
              alt="Album artwork"
            />
          ) : (
            <div className="editTrackModalArtworkEmpty">No artwork found</div>
          )}
        </div>
      ),
    },
    {
      id: 'id3' as TabId,
      label: 'ID3',
      panel:
        track && server ? (
          <TagsTab trackPath={track.path} serverUrl={server.url} />
        ) : (
          <div className="editTrackModalTags">
            <div className="editTrackModalTagsLoading">No track selected</div>
          </div>
        ),
    },
  ];

  return (
    <Modal isOpen={!!trackPath} onClose={onClose}>
      <div className="editTrackModal">
        <div className="editTrackModalHeader">
          <div className="editTrackModalHeaderTitle">
            {track?.title ?? 'Unknown Title'}
          </div>
          {track?.artist && (
            <div className="editTrackModalHeaderMeta">{track.artist}</div>
          )}
          {track?.album && (
            <div className="editTrackModalHeaderMeta">{track.album}</div>
          )}
        </div>
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
        />
      </div>
    </Modal>
  );
}
