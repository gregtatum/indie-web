import * as React from 'react';
import { ensureExists, getKeyboardString } from 'frontend/utils';

import './Menus.css';
import { useEscape } from 'frontend/hooks';

// The bottom and top border, plus the bottom and top padding of .menusFile.
const menuBorderHeight = 2 + 4;
// Items are sized by --density-touch-target (see .menusFileButton), so reading
// the variable avoids having to measure the rendered menu.
function getMenuItemHeight(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    '--density-touch-target',
  );
  return parseFloat(value) || 44;
}
const menuWidth = 220;
const menuMargin = 10;

const dismissEventTypes = ['click', 'contextmenu'] as const;

/**
 * Logic for handling when a user clicks outside of the element.
 */
function useDismissOnOutsideClick(
  elementRef: React.MutableRefObject<HTMLElement | null>,
  divRef: React.RefObject<HTMLDivElement>,
  dismiss: () => void,
  isOpen: boolean,
) {
  const clickHandler = React.useRef<null | ((event: MouseEvent) => void)>(null);

  function removeHandler() {
    if (clickHandler.current) {
      for (const type of dismissEventTypes) {
        document.removeEventListener(type, clickHandler.current, true);
      }
    }
  }

  React.useEffect(() => {
    if (!isOpen) {
      return () => {};
    }
    const element = elementRef.current;
    removeHandler();
    clickHandler.current = (event) => {
      const div = ensureExists(divRef.current, 'There is no divRef');
      if (!div.contains(event.target as Node | null)) {
        // We clicked outside of the menu, dismiss it.
        dismiss();
        // `element` can be null when the menu is opened with a right click.
        if (element?.contains(event.target as Node | null)) {
          event.stopImmediatePropagation();
        }
      }
    };
    for (const type of dismissEventTypes) {
      document.addEventListener(type, clickHandler.current, true);
    }
    return removeHandler;
  }, [elementRef, isOpen]);
}

export interface MenuButton {
  children: React.ReactNode;
  key: string;
  onClick(): void;
  shortcut?: React.ReactNode;
}

interface MenuProps {
  clickedElement: React.MutableRefObject<HTMLElement | null>;
  openEventDetail: React.MouseEvent['detail'];
  openGeneration: number;
  buttons: MenuButton[];
  onCancel?: () => void;
  // Anchor via an explicit point rather than the measured element.
  anchorPoint?: { x: number; y: number } | null;
}

export function Menu({
  clickedElement,
  openEventDetail,
  openGeneration,
  buttons,
  onCancel,
  anchorPoint,
}: MenuProps) {
  const [closeGeneration, setCloseGeneration] = React.useState(0);
  const isOpen = Boolean(openGeneration && openGeneration !== closeGeneration);
  const isClosed = !isOpen;
  const divRef = React.useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = React.useState<null | number>(null);
  const focusRef = React.useRef(focusIndex);
  focusRef.current = focusIndex;

  const dismiss = () => void setCloseGeneration((n) => n + 1);

  const cancel = () => {
    dismiss();
    onCancel?.();
  };

  useEscape(cancel, isOpen, true);
  useDismissOnOutsideClick(clickedElement, divRef, cancel, isOpen);

  // Focus the menu if opened via keyboard.
  React.useEffect(() => {
    // Was this opened by keyboard?
    if (openEventDetail === 0) {
      const button = divRef.current?.querySelector('button');
      if (button) {
        setFocusIndex(0);
      }
    } else {
      divRef.current?.focus();
    }
  }, [divRef, openEventDetail]);

  React.useEffect(() => {
    if (isClosed) {
      return () => {};
    }
    return () => {
      if (focusRef.current !== null) {
        // Restore the focus. Intentionally use the capture value.
        clickedElement.current?.focus();
      }
    };
  }, [isOpen, clickedElement]);

  // Remove the focus when the dialog is closed.
  React.useEffect(() => {
    if (focusIndex !== null && isClosed) {
      setFocusIndex(null);
    }
  }, [focusIndex, isOpen]);

  // Apply the current focus.
  React.useEffect(() => {
    const div = divRef.current;
    if (!div || focusIndex === null) {
      return;
    }
    const buttons = div.querySelectorAll('button');
    const button = buttons[focusIndex];
    button.focus();
  }, [focusIndex]);

  React.useEffect(() => {
    if (isClosed) {
      return () => {};
    }
    function handleKeyDown(event: KeyboardEvent) {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setFocusIndex((index) => moveFocusUp(index, buttons));
          break;
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setFocusIndex((index) => moveFocusDown(index, buttons));
          break;
        case 'Tab': {
          const key = getKeyboardString(event);
          if (key === 'Tab' || key === 'Shift+Tab') {
            event.preventDefault();
            event.stopPropagation();
          }
          break;
        }
        default:
          break;
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [buttons, isClosed]);

  if (process.env.NODE_ENV === 'development') {
    React.useEffect(() => {
      const div = divRef.current;
      if (div) {
        if (div.parentElement?.id !== 'overlayContainer') {
          throw new Error('The <Menu> should be wrapped in `overlayPortal`.');
        }
      }
    }, [divRef, isOpen]);
  }

  if (isClosed) {
    return null;
  }

  const docBodyRect = document.body.getBoundingClientRect();

  let elementY1: number;
  let elementY2: number;
  let left: number;
  if (anchorPoint) {
    // Anchor to the exact point the user clicked (e.g. a right-click),
    // rather than to an element's bounding rect.
    elementY1 = anchorPoint.y - docBodyRect.top;
    elementY2 = elementY1;
    left = anchorPoint.x;
  } else if (clickedElement.current) {
    const elementRect = clickedElement.current.getBoundingClientRect();
    elementY1 = elementRect.top + elementRect.height / 3 - docBodyRect.top;
    elementY2 = elementRect.bottom - elementRect.height / 3 - docBodyRect.top;
    const elementCenterX = elementRect.width / 2 + elementRect.left;
    left = elementCenterX - menuWidth / 2;
  } else {
    return null;
  }

  if (left < menuMargin) {
    left = menuMargin;
  } else if (left + menuWidth > docBodyRect.width - menuMargin) {
    left = docBodyRect.width - menuWidth - menuMargin;
  }

  let top = elementY2;
  let animationClass = 'menusFileAnimateDown';

  const { scrollTop } = document.documentElement;
  const scrollBottom = scrollTop + innerHeight;
  const menuHeight = buttons.length * getMenuItemHeight() + menuBorderHeight;

  if (elementY2 + menuHeight + menuMargin > scrollBottom) {
    // The menu is off the bottom of the scroll space.
    top = elementY1 - menuHeight;
    animationClass = 'menusFileAnimateUp';
  }

  return (
    <div
      className={`menusFile ${animationClass}`}
      ref={divRef}
      style={{
        top,
        left,
        width: menuWidth,
      }}
    >
      {buttons.map((button, index) => (
        <button
          type="button"
          className="menusFileButton"
          tabIndex={0}
          key={button.key}
          onMouseMove={() => {
            if (focusIndex !== index) {
              setFocusIndex(index);
            }
          }}
          onClick={() => {
            button.onClick();
            dismiss();
          }}
        >
          <span className="menusFileButtonLabel">{button.children}</span>
          {button.shortcut ? (
            <span className="menusFileButtonShortcut" aria-hidden="true">
              {button.shortcut}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function moveFocusDown(index: null | number, buttons: MenuButton[]) {
  return ((index ?? -1) + 1) % buttons.length;
}

function moveFocusUp(index: null | number, buttons: MenuButton[]) {
  return ((index ?? buttons.length) - 1 + buttons.length) % buttons.length;
}
