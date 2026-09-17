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
