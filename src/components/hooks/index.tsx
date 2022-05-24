import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { Selector } from 'src/@types';
import { A, $ } from 'src';
import { ensureExists } from 'src/utils';

type PromiseState<T> =
  | { type: 'pending' }
  | { type: 'fulfilled'; value: T }
  | { type: 'rejected'; error: unknown };

export function useInfalliblePromise<T>(promise: Promise<T>): null | T {
  const [inner, setInner] = React.useState<T | null>(null);
  React.useEffect(() => {
    promise.then((value) => {
      setInner(value);
    });
  }, [promise]);
  return inner;
}

const pending: PromiseState<any> = {
  type: 'pending',
};

export function usePromise<T>(promise: Promise<T>): PromiseState<T> {
  const [inner, setInner] = React.useState<PromiseState<T>>(pending);
  React.useEffect(() => {
    promise.then(
      (value: T) => {
        setInner({ type: 'fulfilled', value });
      },
      (error: unknown) => {
        setInner({ type: 'rejected', error });
      },
    );
  }, [promise]);
  return inner;
}

export function usePromiseSelector<T>(
  selector: Selector<Promise<T>>,
): PromiseState<T> {
  return usePromise(Redux.useSelector(selector));
}

const scrollTops = new Map<string, number>();
export function useRetainScroll(uniqueName: string) {
  const navigationType = Router.useNavigationType();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const { current } = scrollRef;
    if (current === null) {
      return () => {};
    }
    if (navigationType === 'POP') {
      const scrollTop = scrollTops.get(uniqueName);
      if (scrollTop) {
        current.scrollTop = scrollTop;
      }
    }
    const onScroll = () => {
      scrollTops.set(uniqueName, current.scrollTop);
    };
    current.addEventListener('scroll', onScroll);
    return () => {
      current.removeEventListener('scroll', onScroll);
    };
  }, [uniqueName, navigationType]);

  return scrollRef;
}

export function useShouldHideHeader() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const { dispatch, getState } = Redux.useStore();

  React.useEffect(() => {
    const { current: container } = scrollRef;
    if (container === null) {
      return () => {};
    }
    const headerPaddingStr =
      getComputedStyle(container).getPropertyValue('--header-padding');
    if (!headerPaddingStr) {
      throw new Error('Expected to find a headerPadding style');
    }
    headerPaddingStr.replace('px', '');
    const headerPadding = parseInt(headerPaddingStr, 10) * 0.5;
    let prevScroll = 0;

    // Measure the height of the container using a resize observer.
    let containerHeight = 0;
    const resizeObserver = new ResizeObserver(
      (resizes: ResizeObserverEntry[]) => {
        const [resize] = resizes;
        if (resizes.length !== 1) {
          throw new Error('Expected only 1 resize entry.');
        }
        containerHeight = ensureExists(
          resize.borderBoxSize[0].blockSize,
          'Could not read the blockSize',
        );
      },
    );
    resizeObserver.observe(container);

    const onScroll = () => {
      const dx = container.scrollTop - prevScroll;
      prevScroll = container.scrollTop;
      if (dx > 0) {
        // Scrolling down;
        if (
          container.scrollTop > headerPadding &&
          !$.shouldHideHeader(getState())
        ) {
          dispatch(A.shouldHideHeader(true));
        }
      } else {
        // Scrolling up.
        if (
          // iPad registers scrolling when it drags past the end of the document.
          // Ensure the header doesn't come back when that happens.
          container.scrollHeight - container.scrollTop > containerHeight &&
          $.shouldHideHeader(getState())
        ) {
          dispatch(A.shouldHideHeader(false));
        }
      }
    };

    container.addEventListener('scroll', onScroll);
    return () => {
      container.removeEventListener('scroll', onScroll);
      if ($.shouldHideHeader(getState())) {
        dispatch(A.shouldHideHeader(false));
      }
    };
  });

  return scrollRef;
}
