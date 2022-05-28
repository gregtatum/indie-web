import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { Selector } from 'src/@types';

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

/**
 * Resets the document's scrollTop when the element is loaded.
 */
export function useResetScrollTop() {
  React.useEffect(() => {
    const { scrollingElement } = document;
    if (scrollingElement) {
      scrollingElement.scrollTop = 0;
    }
  }, []);
}
