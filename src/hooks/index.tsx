import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { Selector } from 'src/@types';
import { pathJoin, setScrollTop } from 'src/utils';
import { T, $ } from 'src';

export function useStore(): T.Store {
  return Redux.useStore() as T.Store;
}

export function useDispatch(): T.Dispatch {
  return Redux.useDispatch();
}

export { useSelector } from 'react-redux';

type PromiseState<T> =
  | { type: 'pending' }
  | { type: 'fulfilled'; value: T }
  | { type: 'rejected'; error: unknown };

export function useInfalliblePromise<T>(promise: Promise<T>): null | T {
  const [inner, setInner] = React.useState<T | null>(null);
  React.useEffect(() => {
    promise
      .then((value) => {
        setInner(value);
      })
      .catch((error) => {
        console.error('An assumed infallible promise failed.', error);
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

export function useRetainScroll() {
  const navigationType = Router.useNavigationType();

  React.useEffect(() => {
    const { scrollingElement } = document;
    if (scrollingElement === null) {
      return () => {};
    }
    const scrollTop = scrollTops.get(window.location.href);
    setScrollTop(navigationType === 'POP' && scrollTop ? scrollTop : 0);
    const onScroll = () => {
      scrollTops.set(window.location.href, scrollingElement.scrollTop);
    };
    document.addEventListener('scroll', onScroll);
    return () => {
      document.removeEventListener('scroll', onScroll);
    };
  }, [window.location.href, navigationType]);
}

export function useFileDrop(
  targetRef: React.RefObject<HTMLElement | null>,
  onDropCallback: (files: FileList, element: HTMLElement) => any,
) {
  const [dragging, setDraggingState] = React.useState(false);

  function setDragging(value: boolean) {
    setDraggingState(value);
    if (value) {
      targetRef.current?.classList.add('dragging');
    } else {
      targetRef.current?.classList.remove('dragging');
    }
  }

  React.useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(true);
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);

      const files = event.dataTransfer?.files;
      if (files && event.target) {
        onDropCallback(files, event.target as any);
      }
    };

    const element = targetRef.current;
    if (!element) {
      return () => {};
    }

    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);

    return () => {
      element.removeEventListener('dragenter', handleDragEnter);
      element.removeEventListener('dragover', handleDragOver);
      element.removeEventListener('dragleave', handleDragLeave);
      element.removeEventListener('drop', handleDrop);
    };
  }, [targetRef, onDropCallback]);

  return dragging;
}

type AudioRef = React.MutableRefObject<HTMLAudioElement | null>;
type VideoRef = React.MutableRefObject<HTMLVideoElement | null>;

export function useMedia(
  folderPath: string,
  line:
    | { type: 'audio'; lineIndex: number; src: string; mimetype: string }
    | { type: 'video'; lineIndex: number; src: string; mimetype: string },
  mediaRef: AudioRef | VideoRef,
  getEmptyMediaUrl: () => string,
) {
  const dropbox = Redux.useSelector($.getDropbox);
  const [is404, setIs404] = React.useState<boolean>(false);
  const [src, setSrc] = React.useState<string>(getEmptyMediaUrl());
  const srcRef = React.useRef(src);
  const [isPlayRequested, setIsPlayRequested] = React.useState(false);
  const path =
    line.src[0] === '/'
      ? // This is an absolute path.
        line.src
      : // This is a relative path.
        pathJoin(folderPath, line.src);

  // Set the srcRef to a ref so it can be used in event handlers.
  React.useEffect(() => {
    srcRef.current = src;
  }, [src]);

  // When play is requested, download the file from Dropbox and play it.
  React.useEffect(() => {
    if (!path || !isPlayRequested) {
      return () => {};
    }
    let url: string;

    // Download the file from Dropbox.
    void (async () => {
      try {
        const response = (await dropbox.filesDownload({
          path,
        })) as T.FilesDownloadResponse;
        if (!mediaRef.current) {
          return;
        }

        // The file has been downloaded, use it in this component.
        let blob = response.result.fileBlob;
        if (blob.type === 'application/octet-stream') {
          // The mimetype was not properly sent.
          blob = blob.slice(0, blob.size, line.mimetype);
        }

        url = URL.createObjectURL(blob);
        mediaRef.current.src = url;
        setSrc(url);
        requestAnimationFrame(() => {
          mediaRef.current?.play().catch(() => {});
        });
      } catch (error) {
        console.error('Media load error:', error);
        setIs404(true);
      }
    })();

    // Clean-up the generated object URL.
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [dropbox, path, isPlayRequested]);

  function play(
    event: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>,
  ) {
    if (mediaRef.current && srcRef.current === getEmptyMediaUrl()) {
      event.preventDefault();
      mediaRef.current.pause();
      setIsPlayRequested(true);
    }
  }

  const isLoaded = src !== getEmptyMediaUrl();

  return { is404, src, isLoaded, path, play };
}
