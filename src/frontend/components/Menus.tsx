import * as React from 'react';
import { ensureExists } from 'frontend/utils';

import './Menus.css';
import { useEscape } from 'frontend/hooks';

// The bottom and top border.
const menuBorderHeight = 2;
// Keeping this static makes the positioning below much simpler as there is no
// measurement that needs to take place. Keep the value in sync with .menusFileButton
const menuItemHeight = 41;
const menuWidth = 200;
const menuMargin = 10;

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
      const div = ensureExists(divRef.current, 'There is no divRef');
      if (!div.contains(event.target as Node | null)) {
        // We clicked outside of the menu, dismiss it.
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

export interface MenuButton {
  children: React.ReactNode;
  key: string;
  onClick(): void;
}

interface MenuProps {
  clickedElement: React.MutableRefObject<HTMLElement | null>;
  openEventDetail: React.MouseEvent['detail'];
  openGeneration: number;
  buttons: MenuButton[];
}

export function Menu({
  clickedElement,
  openEventDetail,
  openGeneration,
  buttons,
}: MenuProps) {
  const [closeGeneration, setCloseGeneration] = React.useState(0);
  const isOpen = Boolean(openGeneration && openGeneration !== closeGeneration);
  const isClosed = !isOpen;
  const divRef = React.useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = React.useState<null | number>(null);
  const focusRef = React.useRef(focusIndex);
  focusRef.current = focusIndex;

  const dismiss = () => void setCloseGeneration((n) => n + 1);

  useEscape(dismiss, isOpen);
  useDismissOnOutsideClick(clickedElement, divRef, dismiss, isOpen);

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
          setFocusIndex((index) => moveFocusUp(index, buttons));
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusIndex((index) => moveFocusDown(index, buttons));
          break;
        case 'Tab':
          event.preventDefault();
          if (event.shiftKey) {
            setFocusIndex((index) => moveFocusUp(index, buttons));
          } else {
            setFocusIndex((index) => moveFocusDown(index, buttons));
          }
          break;
        default:
          break;
      }
    }
    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
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

  const elementRect = ensureExists(
    clickedElement.current,
    'The clicked element did not exist in the menu',
  ).getBoundingClientRect();
  const docBodyRect = document.body.getBoundingClientRect();

  const elementY1 = elementRect.top + elementRect.height / 3 - docBodyRect.top;
  const elementY2 =
    elementRect.bottom - elementRect.height / 3 - docBodyRect.top;
  const elementCenterX = elementRect.width / 2 + elementRect.left;

  let left = elementCenterX - menuWidth / 2;
  if (left < menuMargin) {
    left = menuMargin;
  } else if (left + menuWidth > docBodyRect.width - menuMargin) {
    left = docBodyRect.width - menuWidth - menuMargin;
  }

  let top = elementY2;
  let animationClass = 'menusFileAnimateDown';

  const { scrollTop } = document.documentElement;
  const scrollBottom = scrollTop + innerHeight;
  const menuHeight = buttons.length * menuItemHeight + menuBorderHeight;

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
      {buttons.map((button) => (
        <button
          type="button"
          className="menusFileButton"
          tabIndex={0}
          key={button.key}
          onClick={() => {
            button.onClick();
            dismiss();
          }}
        >
          {button.children}
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
