import * as React from 'react';
import { $$ } from 'frontend';
import { TrackEditorPanel } from './TrackEditorPanel';

/**
 * The Batch Edit detail view's persistent sidebar. Reuses TrackEditorPanel
 * as-is against the shared `selectedTrackPaths` — a single selected row shows
 * the full single-track editor, multiple rows show the existing "Mixed" bulk
 * editor, and there is no separate close affordance since the panel always
 * just reflects the current selection.
 */
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
