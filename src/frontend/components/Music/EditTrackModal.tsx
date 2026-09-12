import * as React from 'react';
import { Modal } from 'frontend/components/Modal';
import {
  TrackEditorPanel,
  type TrackEditorPanelHandle,
} from './TrackEditorPanel';

export { BULK_SMALL_LOAD_NOTICE_DELAY } from './TrackEditorPanel';

interface Props {
  trackPath: string | null;
  onClose: () => void;
}

export function EditTrackModal({ trackPath, onClose }: Props) {
  const panelRef = React.useRef<TrackEditorPanelHandle>(null);

  return (
    <Modal
      isOpen={!!trackPath}
      onClose={() => panelRef.current?.requestClose()}
      ariaLabelledBy="edit-track-modal-title"
      fillVertical
    >
      <TrackEditorPanel
        ref={panelRef}
        trackPath={trackPath}
        onClose={onClose}
      />
    </Modal>
  );
}
