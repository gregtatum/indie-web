import * as React from 'react';
import { $$ } from 'frontend';
import { Modal } from 'frontend/components/Modal';
import { Tabs } from 'frontend/components/Tabs';
import { ArtworkTab } from './ArtworkTab';
import { TagsTab } from './TagsTab';
import {
  DETAIL_FIELDS,
  emptyDetailFieldValues,
  detailFieldValues,
  isSplitField,
  type TrackTagsLoadState,
  type DetailFieldValues,
} from 'frontend/logic/music/tags';
import type { TrackTagsResponse } from 'shared/@types/shared';
import './EditTrackModal.css';

type TabId = 'details' | 'artwork' | 'id3';

const GROUP_LABELS: Record<string, string> = {
  core: 'Identity',
  position: 'Position',
  classification: 'Classification',
  credits: 'Credits',
};

interface Props {
  trackPath: string | null;
  onClose: () => void;
}

export function EditTrackModal({ trackPath, onClose }: Props) {
  const tracks = $$.getMusicTracks();
  const track = tracks.find((t) => t.path === trackPath) ?? null;
  const server = $$.getCurrentServerOrNull();

  const [activeTab, setActiveTab] = React.useState<TabId>('details');
  const [formState, setFormState] = React.useState<DetailFieldValues>(
    emptyDetailFieldValues,
  );
  const [tagsState, setTagsState] = React.useState<TrackTagsLoadState>({
    status: 'loading',
  });

  function setField(key: string, value: string) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  // Reset the form immediately from TrackMetadata when track changes
  React.useEffect(() => {
    setFormState(detailFieldValues(track, null));
    setTagsState({ status: 'loading' });
    setActiveTab('details');
  }, [trackPath]);

  // Fetch tags once per track
  React.useEffect(() => {
    if (!trackPath || !server) {
      return () => {};
    }
    let cancelled = false;
    fetch(
      `${server.url}/music/track-tags?path=${encodeURIComponent(trackPath)}`,
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<TrackTagsResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setTagsState({ status: 'loaded', data });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTagsState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trackPath, server?.url]);

  // Upgrade form state when tags load
  React.useEffect(() => {
    if (tagsState.status === 'loaded') {
      setFormState(detailFieldValues(track, tagsState.data));
    }
  }, [tagsState]);

  const artUrl =
    server && track?.coverArt
      ? `${server.url}/music/cover-art?path=${encodeURIComponent(track.coverArt)}`
      : null;

  // Build the Details panel by iterating detailFields
  let lastGroup: string | null = null;
  const detailRows: React.ReactNode[] = [];
  for (const field of DETAIL_FIELDS) {
    if (field.group !== lastGroup) {
      detailRows.push(
        <div key={`group-${field.group}`} className="editTrackModalGroupHeader">
          {GROUP_LABELS[field.group]}
        </div>,
      );
      lastGroup = field.group;
    }

    if (isSplitField(field)) {
      detailRows.push(
        <label key={field.key} className="editTrackModalField">
          <span className="editTrackModalLabel">{field.label}</span>
          <div className="editTrackModalSplitInput">
            <input
              className="editTrackModalInput editTrackModalSplitInput-num"
              type="text"
              inputMode="numeric"
              value={formState[field.key]}
              onChange={(e) => setField(field.key, e.target.value)}
            />
            <span className="editTrackModalSplitSep">of</span>
            <input
              className="editTrackModalInput editTrackModalSplitInput-total"
              type="text"
              inputMode="numeric"
              value={formState[field.totalKey]}
              onChange={(e) => setField(field.totalKey, e.target.value)}
            />
          </div>
        </label>,
      );
    } else {
      detailRows.push(
        <label key={field.key} className="editTrackModalField">
          <span className="editTrackModalLabel">{field.label}</span>
          <input
            className="editTrackModalInput"
            type="text"
            inputMode={field.type === 'number' ? 'numeric' : 'text'}
            value={formState[field.key]}
            onChange={(e) => setField(field.key, e.target.value)}
          />
        </label>,
      );
    }
  }

  const tabs = [
    {
      id: 'details' as TabId,
      label: 'Details',
      panel: <div className="editTrackModalDetails">{detailRows}</div>,
    },
    {
      id: 'artwork' as TabId,
      label: 'Artwork',
      panel:
        track && server ? (
          <ArtworkTab
            artUrl={artUrl}
            coverArtPath={track.coverArt ?? null}
            tagsState={tagsState}
          />
        ) : (
          <div className="editTrackModalArtwork">
            <div className="editTrackModalArtworkEmpty">No track selected</div>
          </div>
        ),
    },
    {
      id: 'id3' as TabId,
      label: 'ID3',
      panel: track ? (
        <TagsTab tagsState={tagsState} />
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
