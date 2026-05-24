import * as React from 'react';
import { Hooks } from 'frontend';
import './Modal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, children }: Props) {
  Hooks.useEscape(onClose, isOpen);

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
      <div className="modalBox">
        <button className="modalCloseButton" onClick={onClose} aria-label="Close">
          <img src="/svg/xmark.svg" alt="" />
        </button>
        {children}
      </div>
    </div>,
  );
}
