import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { Selector } from 'frontend/@types';
import {
  ensureExists,
  getPathFileName,
  getPathFileNameNoExt,
  htmlElementOrNull,
  pathJoin,
  setScrollTop,
} from 'frontend/utils';
import { T, $, A } from 'frontend';
import { FileSystemError } from 'frontend/logic/file-system';

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
  onDropCallback: (event: DragEvent) => unknown,
): boolean {
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
      onDropCallback(event);
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
  const fileSystem = Redux.useSelector($.getCurrentFS);
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
        let { blob } = await fileSystem.loadBlob(path);
        if (!mediaRef.current) {
          return;
        }

        // The file has been downloaded, use it in this component.
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
  }, [fileSystem, path, isPlayRequested]);

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

export function useAudio(
  folderPath: string,
  line: { type: 'audio'; lineIndex: number; src: string; mimetype: string },
) {
  const [audio, setAudio] = React.useState<HTMLAudioElement | null>(null);
  const fileSystem = Redux.useSelector($.getCurrentFS);
  const [is404, setIs404] = React.useState<boolean>(false);
  const [duration, setDuration] = React.useState<string>('0:00');
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isLoadRequested, setIsLoadRequested] = React.useState(false);
  const isPlayingRef = React.useRef(false);
  const audioRef = propToRef(audio);

  // Let event handlers use the isPlaying value.
  React.useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Compute these once.
  const { path, name } = React.useMemo(() => {
    const path =
      line.src[0] === '/'
        ? // This is an absolute path.
          line.src
        : // This is a relative path.
          pathJoin(folderPath, line.src);

    const name = getPathFileNameNoExt(line.src)
      .trim()
      // If the track starts with a number, strip it off.
      .replace(/^\d+/, '');

    return { path, name };
  }, []);

  function togglePlay(event: React.SyntheticEvent) {
    const newIsPlayRequested = !isPlayingRef.current;
    setIsPlaying(newIsPlayRequested);
    event.preventDefault();

    // Create the audio element if it's not available.
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      setAudio(audio);
      console.log('useAudio created an audio element', audio);
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
      });
    }

    if (newIsPlayRequested) {
      // We need to immediately play the audio even if there is no `src`, or else
      // the audio file will not play in Safari. The `play` method must be called
      // within an event handler.
      audio.play().catch(console.error.bind(console));
    } else {
      audio.pause();
    }
  }

  // Determine if a load is requested on the first play.
  React.useEffect(() => {
    if (isPlaying && !isLoadRequested) {
      setIsLoadRequested(true);
    }
  }, [isPlaying]);

  // When play is requested, download the file from Dropbox and play it.
  React.useEffect(() => {
    if (!path || !isLoadRequested || !audio) {
      return () => {};
    }
    let url: string;

    // Download the file from Dropbox.
    void (async () => {
      try {
        let { blob } = await fileSystem.loadBlob(path);

        if (blob.type === 'application/octet-stream') {
          // The mimetype was not properly sent.
          blob = blob.slice(0, blob.size, line.mimetype);
        }

        url = URL.createObjectURL(blob);
        audio.src = url;
        audio.addEventListener('loadedmetadata', () => {
          const min = Math.floor(audio.duration / 60);
          const sec = Math.floor(audio.duration % 60);
          setDuration(`${min}:${sec}`);
        });

        if (isPlayingRef.current) {
          audio.play().catch((error) => console.error(error));
        }
      } catch (error) {
        console.error(
          'Media load error:',
          (error as FileSystemError).toString(),
        );
        setIs404(true);
      }
    })();

    // Clean-up the generated object URL.
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [isLoadRequested]);

  return {
    is404,
    audio,
    path,
    togglePlay,
    isPlaying,
    duration,
    name,
    isLoadRequested,
  };
}

export function useListener<
  E extends HTMLElement | Document,
  Handler extends E['addEventListener'],
  Type extends Parameters<Handler>[0],
  Listener extends Parameters<Handler>[1],
  Options extends Parameters<Handler>[2],
>(
  elementOrRef: E | React.RefObject<E> | null,
  type: Type | Type[],
  deps: any[],
  callback: Listener,
  options?: Options,
): void {
  const types: Type[] = Array.isArray(type) ? type : [type];
  React.useEffect(() => {
    if (!elementOrRef) {
      return () => {};
    }
    const element =
      'current' in elementOrRef ? elementOrRef.current : elementOrRef;
    if (!element) {
      return () => {};
    }
    for (const type of types) {
      element.addEventListener(type, callback, options);
    }

    return () => {
      for (const type of types) {
        element.removeEventListener(type, callback, options);
      }
    };
  }, [elementOrRef, ...deps]);
}

export function useBoundingClientRect(
  element: React.RefObject<HTMLElement | null>,
): DOMRect | null {
  const [rect, setRect] = React.useState<null | DOMRect>(null);

  React.useEffect(() => {
    if (element.current) {
      setRect(element.current.getBoundingClientRect());
    }
  }, [element]);

  useListener(element.current, 'resize', [], (event) => {
    if (event.target) {
      setRect((event.target as HTMLElement).getBoundingClientRect());
    }
  });

  return rect;
}

export function useContext2D(
  canvasRef: React.RefObject<HTMLCanvasElement>,
): null | CanvasRenderingContext2D {
  const [ctx, setContext] = React.useState<null | CanvasRenderingContext2D>(
    null,
  );
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      setContext(ensureExists(canvas.getContext('2d')));
    }
  }, [canvasRef]);
  return ctx;
}

export function propToRef<T>(value: T | null): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useSelectionChange(
  elementRef: React.RefObject<HTMLElement | null>,
  setSelection: (selection: Selection | null) => void,
  doUseNode: (element: Node | null) => boolean = () => true,
) {
  const selectionRef = React.useRef<Selection | null>(null);

  function getSelectionInDiv() {
    const selection = window.getSelection();
    const div = elementRef.current;
    if (
      selection &&
      div &&
      div.contains(selection.anchorNode) &&
      doUseNode(selection.anchorNode)
    ) {
      return selection;
    }
    return null;
  }

  useListener(document, 'selectionchange', [], () => {
    const selection = getSelectionInDiv();
    if (selection) {
      selectionRef.current = selection;
    }
  });

  useListener(document, 'mouseup', [], () => {
    const selection = selectionRef.current;
    if (!selection) {
      return;
    }
    selectionRef.current = null;

    if (selection.toString()) {
      setSelection(selection);
    } else {
      setSelection(null);
    }
  });

  useListener(document, 'keydown', [], (event) => {
    if ((event as KeyboardEvent).key !== 'Enter') {
      return;
    }
    const selection = getSelectionInDiv();
    if (!selection) {
      return;
    }

    selectionRef.current = null;
    if (selection.toString()) {
      setSelection(selection);
    } else {
      setSelection(null);
    }
  });
}

/**
 * Handle dismissing something by hitting escape.
 */
export function useEscape(dismiss: () => void, isOpen: boolean) {
  const keyHandler = React.useRef<null | ((event: KeyboardEvent) => void)>(
    null,
  );
  React.useEffect(() => {
    if (!isOpen) {
      return () => {};
    }
    keyHandler.current = (event) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };
    document.addEventListener('keydown', keyHandler.current);
    return () => {
      if (keyHandler.current) {
        document.removeEventListener('keydown', keyHandler.current);
      }
    };
  }, [isOpen]);
}

import { createPortal } from 'react-dom';

let overlayContainer: HTMLDivElement;

/**
 * When creating an overlay, such a menu or tooltip, place it in the overlayContainer, as
 * the z-indexing is guaranteed to be correct.
 */
export function overlayPortal(child: React.ReactNode, key?: string) {
  if (!overlayContainer) {
    overlayContainer = ensureExists(
      document.querySelector<HTMLDivElement>('#overlayContainer'),
      'Could not find the overlayContainer',
    );
  }
  return createPortal(child, overlayContainer, key);
}

export function useUploadOnFileDrop(
  divRef: React.RefObject<HTMLElement | null>,
  folderPath: string,
) {
  const dispatch = useDispatch();
  useFileDrop(divRef, (event) => {
    const { dataTransfer } = event;
    if (!dataTransfer) {
      return;
    }

    const { files } = dataTransfer;

    if (files?.length) {
      // This is infallible, as it reports errors with messages.
      void dispatch(A.uploadFilesWithMessages(folderPath, dataTransfer.files));
      return;
    }

    // A DOM element was dragged and dropped. Parse the DOM to see if it was a
    // file link. If it was it will have a [data-file-path].
    const html = dataTransfer.getData('text/html');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const fileElement = htmlElementOrNull(
      doc.querySelector('[data-file-path]'),
    );

    const fromPath = fileElement?.dataset.filePath;
    if (!fromPath) {
      return;
    }

    const toPath = pathJoin(folderPath, getPathFileName(fromPath));

    // This is infallible, as it reports errors with messages.
    void dispatch(A.moveFile(fromPath, toPath));
  });
}
