import * as React from 'react';
import { Hooks } from 'frontend';
import './Modal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ariaLabelledBy?: string;
  children: React.ReactNode;
}

/**
 * Full-screen interrupting dialog for actions that require focused user attention. The
 * caller owns the open/close state (isOpen + onClose) because the data being edited and
 * the visibility state are naturally coupled — closing means clearing the data too. A
 * dimmed, blurred backdrop covers the page, so outside-click detection is a simple
 * onMouseDown on the backdrop rather than a document listener. Focus is trapped inside
 * for accessibility and restored to the previously active element on close.
 *
 * Rendered into #modalsContainer (z-index: 1, before #overlayContainer in DOM order),
 * which places it above app content but below context menus and other overlays. The
 * backdrop uses position:fixed to cover the viewport within modalsContainer's stacking
 * context, so it blocks interaction with the app without escaping to the document root.
 * Cross-reference: Modal.css (.modalsContainer), Menus.css (.overlayContainer),
 * index.html (DOM order), hooks/index.tsx (overlayPortal, modalPortal), Popup.tsx.
 * Update all of these if the stacking strategy changes.
 */
export function Modal({ isOpen, onClose, ariaLabelledBy, children }: Props) {
  const boxRef = React.useRef<HTMLDivElement>(null);

  Hooks.useEscape(onClose, isOpen);
  Hooks.useFocusTrap(boxRef, isOpen);

  if (!isOpen) {
    return null;
  }

  return Hooks.modalPortal(
    <div
      className="modalBackdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modalBox"
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        <button
          className="modalCloseButton"
          onClick={onClose}
          aria-label="Close"
        >
          <img src="/svg/xmark.svg" alt="" />
        </button>
        {children}
      </div>
    </div>,
  );
}
