import * as React from 'react';
import { $$ } from 'frontend';
import { TrackEditorPanel } from './TrackEditorPanel';

export function TrackEditorSidebar() {
  const selectedTrackPaths = $$.getMusicSelectedTrackPaths();
  const trackPath =
    selectedTrackPaths.length === 1 ? selectedTrackPaths[0] : null;

  return (
    <div className="musicBatchEditSidebar">
      <TrackEditorPanel trackPath={trackPath} onClose={null} />
    </div>
  );
}
