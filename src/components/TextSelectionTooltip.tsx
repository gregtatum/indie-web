import * as React from 'react';
import { useBoundingClientRect, useEscape } from 'src/hooks';
import { ensureExists } from 'src/utils';

/**
 * Logic for handling when a user clicks outside of the element.
 */
export function useDismissOnOutsideClick(
  overlayRef: React.RefObject<HTMLElement>,
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
    removeHandler();
    clickHandler.current = (event) => {
      const div = ensureExists(overlayRef.current, 'There is no overlayRef');
      if (!div.contains(event.target as Node | null)) {
        // We clicked outside of the overlay, dismiss it.
        dismiss();
      }
    };
    document.addEventListener('click', clickHandler.current, true);
    return removeHandler;
  }, [isOpen]);
}

interface Props {
  overlayRef: React.RefObject<HTMLElement>;
  children: any;
  selection: Selection;
  dismiss: () => void;
}

export function TextSelectionTooltip(props: Props) {
  const { overlayRef, children, selection, dismiss } = props;
  const [isFirstRender, setIsFirstRender] = React.useState(true);
  const overlayRect = useBoundingClientRect(overlayRef);
  const selectionRect = React.useMemo(() => {
    const range = selection.getRangeAt(0);
    return range.getBoundingClientRect();
  }, [selection]);

  {
    // What are even rules.
    const overlayContainer =
      document.querySelector<HTMLDivElement>('#overlayContainer');
    if (!overlayContainer) {
      throw new Error('Could not find the overlay container.');
    }
    overlayContainer.style.visibility = isFirstRender ? 'hidden' : 'visible';
  }

  React.useEffect(() => {
    if (isFirstRender) {
      // We need to lay things out once, then measure.

      setIsFirstRender(false);
      return;
    }

    const overlay = overlayRef.current;

    if (!overlayRect || !selectionRect || !overlay) {
      console.error(
        'Unable to get all of the required information for positioning the overlay',
      );
      return;
    }
    // Sync with the CSS width calculation.
    const margin = 10;
    const left = Math.max(
      margin,
      (selectionRect.left + selectionRect.right) / 2 - overlayRect.width / 2,
    );

    overlay.style.top = String(
      selectionRect.bottom + margin + document.body.scrollTop,
    );
    overlay.style.left = String(left);
  }, [overlayRef, overlayRect, selectionRect, isFirstRender]);

  useEscape(dismiss, true /* isOpen */);
  // useDismissOnOutsideClick(overlayRef, dismiss, true /* isOpen */);

  if (process.env.NODE_ENV === 'development') {
    // Development assertion that this is used correctly.
    React.useEffect(() => {
      const div = overlayRef.current;
      if (div) {
        if (div.parentElement?.id !== 'overlayContainer') {
          throw new Error(
            'The <TextSelectionTooltip> should be wrapped in `overlayPortal`.',
          );
        }
      }
    }, [overlayRef]);
  }

  return children;
}
