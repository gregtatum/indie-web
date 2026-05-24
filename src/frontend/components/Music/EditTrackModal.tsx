import * as React from 'react';
import { $$ } from 'frontend';
import { Modal } from 'frontend/components/Modal';
import './EditTrackModal.css';

interface Props {
  trackPath: string | null;
  onClose: () => void;
}

export function EditTrackModal({ trackPath, onClose }: Props) {
  const tracks = $$.getMusicTracks();
  const track = tracks.find((t) => t.path === trackPath) ?? null;

  const [artist, setArtist] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [genre, setGenre] = React.useState('');

  React.useEffect(() => {
    setArtist(track?.artist ?? '');
    setTitle(track?.title ?? '');
    setGenre(track?.genre ?? '');
  }, [trackPath]);

  return (
    <Modal isOpen={!!trackPath} onClose={onClose}>
      <div className="editTrackModal">
        <h2 className="editTrackModalTitle">Edit Track</h2>
        <div className="editTrackModalFields">
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
            <span className="editTrackModalLabel">Song</span>
            <input
              className="editTrackModalInput"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
        </div>
      </div>
    </Modal>
  );
}
