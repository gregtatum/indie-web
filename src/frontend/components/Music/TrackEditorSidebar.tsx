import * as React from 'react';
import { $$ } from 'frontend';
import type { MusicTrackSource } from 'frontend/logic/music/metadata';
import { TrackEditorPanel } from './TrackEditorPanel';

interface TrackEditorSidebarProps {
  trackSource: MusicTrackSource;
}

export function TrackEditorSidebar({ trackSource }: TrackEditorSidebarProps) {
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const trackPath =
    selectedTrackPaths.length === 1 ? selectedTrackPaths[0] : null;

  if (selectedTrackPaths.length === 0) {
    return (
      <div className="musicBatchEditSidebar musicBatchEditSidebar-empty">
        Nothing selected
      </div>
    );
  }

  return (
    <div className="musicBatchEditSidebar">
      <TrackEditorPanel
        trackPath={trackPath}
        onClose={null}
        trackSource={trackSource}
      />
    </div>
  );
}
