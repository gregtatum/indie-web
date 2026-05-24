import * as React from 'react';
import { ensureExists } from 'frontend/utils';
import { useEscape, useFocusTrap } from 'frontend/hooks';

import './Popup.css';

const popupMargin = 10;

function useDismissOnOutsideClick(
  elementRef: React.MutableRefObject<HTMLElement | null>,
  popupRef: React.RefObject<HTMLDivElement>,
  dismiss: () => void,
  isOpen: boolean,
) {
  const clickHandler = React.useRef<null | ((event: MouseEvent) => void)>(null);

  function removeHandler() {
    if (clickHandler.current) {
      document.removeEventListener('click', clickHandler.current, true);
    }
  }

  React.useEffect(() => {
    if (!isOpen) {
      return () => {};
    }
    const element = elementRef.current;
    removeHandler();
    if (!element) {
      return () => {};
    }
    clickHandler.current = (event) => {
      const popup = ensureExists(popupRef.current, 'There is no popupRef');
      if (!popup.contains(event.target as Node | null)) {
        dismiss();
        if (element.contains(event.target as Node | null)) {
          event.stopImmediatePropagation();
        }
      }
    };
    document.addEventListener('click', clickHandler.current, true);
    return removeHandler;
  }, [elementRef, isOpen]);
}

interface PopupProps {
  clickedElement: React.MutableRefObject<HTMLElement | null>;
  openEventDetail: React.MouseEvent['detail'];
  openGeneration: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Anchored contextual UI (tooltips, dropdowns, right-click menus) that floats near a
 * trigger element. The caller only ever opens it — Popup owns its dismissed state
 * internally via generation counters, which lets it handle rapid re-triggers on the same
 * element without a toggle-off/on cycle from the parent. Positioning is computed from the
 * anchor's bounding rect and flips automatically near viewport edges. No backdrop: the
 * page remains visible and interactive around it, so outside-click detection uses a
 * capture-phase document listener rather than a covering element.
 *
 * Rendered into #overlayContainer (z-index: 1, last in DOM order), which places it above
 * #modalsContainer (also z-index: 1 but earlier in DOM). When z-indexes tie among
 * siblings, later DOM position wins — so context menus always stack above modal backdrops.
 * Cross-reference: Menus.css (.overlayContainer), Modal.css (.modalsContainer),
 * index.html (DOM order), hooks/index.tsx (overlayPortal, modalPortal), Modal.tsx.
 * Update all of these if the stacking strategy changes.
 */
export function Popup({
  clickedElement,
  openEventDetail,
  openGeneration,
  className,
  children,
}: PopupProps) {
  const [closeGeneration, setCloseGeneration] = React.useState(0);
  const isOpen = Boolean(openGeneration && openGeneration !== closeGeneration);
  const isClosed = !isOpen;
  const divRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<null | {
    top: number;
    left: number;
  }>(null);

  const dismiss = () => void setCloseGeneration((n) => n + 1);

  useEscape(dismiss, isOpen);
  useDismissOnOutsideClick(clickedElement, divRef, dismiss, isOpen);
  useFocusTrap(divRef, isOpen);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const popup = divRef.current;
    const anchor = clickedElement.current;
    if (!popup || !anchor) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const docRect = document.body.getBoundingClientRect();
    const scrollTop = document.documentElement.scrollTop;
    const scrollBottom = scrollTop + innerHeight;

    let left = anchorRect.left - docRect.left;
    if (left < popupMargin) {
      left = popupMargin;
    } else if (left + popupRect.width > docRect.width - popupMargin) {
      left = docRect.width - popupRect.width - popupMargin;
    }

    let top = anchorRect.bottom - docRect.top + 6;
    if (top + popupRect.height + popupMargin > scrollBottom) {
      top = anchorRect.top - docRect.top - popupRect.height - 6;
    }
    if (top < popupMargin) {
      top = popupMargin;
    }

    setPosition({ top, left });
  }, [isOpen]);

  if (isClosed) {
    return null;
  }

  return (
    <div
      className={`popup ${className ?? ''}`}
      ref={divRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}
