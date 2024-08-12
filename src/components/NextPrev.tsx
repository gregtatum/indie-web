import * as React from 'react';
import * as Router from 'react-router-dom';
import { $$ } from 'src';

import './NextPrev.css';

function noop() {}

export function useNextPrevSwipe(
  ref: React.MutableRefObject<null | HTMLElement>,
) {
  const prevRef = React.useRef(ref.current);
  const prevRemoveHandlers = React.useRef<null | (() => void)>(null);
  const pxStartThreshold = 30;
  const pxSwipeThreshold = window.innerWidth / 3;
  const { prevSong, nextSong } = $$.getNextPrevSong();
  const navigate = Router.useNavigate();

  React.useEffect(() => {
    const current = ref.current;
    const previous = prevRef.current;
    const linksLoaded = prevSong || nextSong;
    if (!current || !linksLoaded) {
      if (prevRemoveHandlers.current) {
        prevRemoveHandlers.current();
        prevRemoveHandlers.current = null;
      }
      return noop;
    }
    if (current === previous) {
      return noop;
    }

    prevRef.current = current;

    let touchId: null | number = null;
    let x = 0;
    let y = 0;
    let interaction: 'swiping' | 'scrolling' | 'none' = 'none';

    const getTouch = (event: TouchEvent) => {
      if (touchId === null) {
        return null;
      }
      for (let i = 0; i < event.touches.length; i++) {
        const touch = event.touches[i];
        if (touch.identifier === touchId) {
          return touch;
        }
        return null;
      }
      return null;
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touchId !== null) {
        // Ignore additional touches.
        return;
      }
      touchId = touch.identifier;
      x = touch.pageX;
      y = touch.pageY;
      current.style.transition = '';
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = getTouch(event);
      if (!touch) {
        return;
      }
      const dx = touch.pageX - x;
      const dy = touch.pageY - y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (interaction === 'none') {
        if (adx > ady && adx > pxStartThreshold) {
          interaction = 'swiping';
        } else if (ady > pxStartThreshold) {
          interaction = 'scrolling';
        }
      }
      if (interaction === 'swiping') {
        event.preventDefault();
        if (adx > pxSwipeThreshold) {
          if (dx < 0) {
            if (nextSong) {
              touchId = null;
              interaction = 'none';
              navigate(nextSong.url);
            }
          } else {
            if (prevSong) {
              navigate(prevSong.url);
            }
          }
        } else {
          const actualDx =
            (dx < 0 && nextSong) || (dx > 0 && prevSong) ? dx : 0;
          current.style.transform = `translateX(${actualDx}px)`;
          current.style.opacity = String(
            1 - Math.abs(actualDx) / pxSwipeThreshold,
          );
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const touch = getTouch(event);
      if (touch) {
        // Our touch is still in the list.
        return;
      }
      touchId = null;
      interaction = 'none';

      current.style.transition = 'transform 300ms';
      current.style.transform = `translateX(0px)`;
      current.style.opacity = `1`;
    };

    const removeHandlers = () => {
      current.removeEventListener('touchstart', onTouchStart);
      current.removeEventListener('touchmove', onTouchMove);
      current.removeEventListener('touchend', onTouchEnd);
    };

    prevRemoveHandlers.current = removeHandlers;

    current.addEventListener('touchstart', onTouchStart);
    current.addEventListener('touchmove', onTouchMove);
    current.addEventListener('touchend', onTouchEnd);

    return () => removeHandlers;
  });
}

export function NextPrevLinks() {
  const { nextSong, prevSong } = $$.getNextPrevSong();
  const navigate = Router.useNavigate();
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && nextSong) {
        navigate(nextSong.url);
      }
      if (event.key === 'ArrowLeft' && prevSong) {
        navigate(prevSong.url);
      }
    };
    document.addEventListener('keyup', handler);
    return () => {
      document.removeEventListener('keyup', handler);
    };
  }, []);
  return (
    <>
      {prevSong ? (
        <Router.Link
          to={prevSong.url}
          type="button"
          className="nextPrev nextPrevBack"
          aria-label="Back"
          title={prevSong.name}
        ></Router.Link>
      ) : null}
      {nextSong ? (
        <Router.Link
          to={nextSong.url}
          type="button"
          className="nextPrev nextPrevNext"
          aria-label="Next"
          title={nextSong.name}
        ></Router.Link>
      ) : null}
    </>
  );
}
