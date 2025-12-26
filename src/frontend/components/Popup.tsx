import * as React from 'react';
import { ensureExists } from 'frontend/utils';
import { useEscape } from 'frontend/hooks';

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

function getFocusableElement(
  popup: HTMLDivElement,
  focusOnOpenSelector?: string,
) {
  if (focusOnOpenSelector) {
    const target = popup.querySelector<HTMLElement>(focusOnOpenSelector);
    if (target) {
      return target;
    }
  }
  return popup.querySelector<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
}

function getFocusableElements(popup: HTMLDivElement) {
  return Array.from(
    popup.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled'));
}

interface PopupProps {
  clickedElement: React.MutableRefObject<HTMLElement | null>;
  openEventDetail: React.MouseEvent['detail'];
  openGeneration: number;
  className?: string;
  focusOnOpenSelector?: string;
  children: React.ReactNode;
}

export function Popup({
  clickedElement,
  openEventDetail,
  openGeneration,
  className,
  focusOnOpenSelector,
  children,
}: PopupProps) {
  const [closeGeneration, setCloseGeneration] = React.useState(0);
  const isOpen = Boolean(openGeneration && openGeneration !== closeGeneration);
  const isClosed = !isOpen;
  const divRef = React.useRef<HTMLDivElement>(null);
  const priorFocusRef = React.useRef<HTMLElement | null>(null);
  const [position, setPosition] = React.useState<null | {
    top: number;
    left: number;
  }>(null);

  const dismiss = () => void setCloseGeneration((n) => n + 1);

  useEscape(dismiss, isOpen);
  useDismissOnOutsideClick(clickedElement, divRef, dismiss, isOpen);

  React.useEffect(() => {
    if (isClosed) {
      return () => {};
    }
    priorFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      priorFocusRef.current?.focus();
    };
  }, [isOpen]);

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

  React.useEffect(() => {
    if (openEventDetail === 0 && isOpen) {
      const popup = divRef.current;
      if (!popup) {
        return;
      }
      const target = getFocusableElement(popup, focusOnOpenSelector);
      target?.focus();
    }
  }, [openEventDetail, isOpen, focusOnOpenSelector]);

  React.useEffect(() => {
    if (!isOpen) {
      return () => {};
    }
    const popup = divRef.current;
    if (!popup) {
      return () => {};
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = getFocusableElements(popup);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    popup.addEventListener('keydown', handleKeyDown);
    return () => popup.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (isClosed) {
    return null;
  }

  return (
    <div
      className={`popup${className ? ` ${className}` : ''}`}
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
