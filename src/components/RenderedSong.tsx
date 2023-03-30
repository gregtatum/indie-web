import * as React from 'react';
import { A, $, T, Hooks } from 'src';
import {
  ensureExists,
  getPathFileNameNoExt,
  getPathFolder,
  UnhandledCaseError,
} from 'src/utils';
import { pathJoin } from '../utils';
import './RenderedSong.css';
import { NextPrevLinks } from './NextPrev';
import { fixupFileMetadata } from 'src/logic/offline-db';

function getSpotifyLink(
  { title, subtitle }: Record<string, string>,
  fileName: string,
) {
  let search: string = '';
  if (title) {
    search = title;
  }
  if (subtitle) {
    if (search) {
      search += ' ';
    }
    search += subtitle;
  }
  if (!search) {
    search = fileName;
  }

  return 'https://open.spotify.com/search/' + encodeURIComponent(search);
}

export function RenderedSong() {
  const displayPath = Hooks.useSelector($.getActiveFileDisplayPath);
  const folderPath = getPathFolder(displayPath);
  const fileNameNoExt = getPathFileNameNoExt(displayPath);

  const renderedSongRef = React.useRef(null);
  const path = Hooks.useSelector($.getPath);
  const fileKey = Hooks.useSelector($.getActiveFileSongKey);
  const hideEditor = Hooks.useSelector($.getHideEditor);
  const { directives, lines } = Hooks.useSelector($.getActiveFileParsed);
  const dispatch = Hooks.useDispatch();
  uploadFileHook(renderedSongRef, path, folderPath);

  return (
    <div
      className="renderedSong"
      key={path}
      data-fullscreen
      ref={renderedSongRef}
    >
      {hideEditor ? <NextPrevLinks /> : null}
      <div className="renderedSongStickyHeader">
        {fileKey ? (
          <div className="renderedSongStickyHeaderRow">Key: {fileKey}</div>
        ) : null}
        {hideEditor ? (
          <button
            className="renderedSongEdit"
            type="button"
            onClick={() => dispatch(A.hideEditor(false))}
          >
            Edit
          </button>
        ) : null}
      </div>
      <div className="renderedSongHeader">
        <div className="renderedSongHeaderTitle">
          <h1>
            {directives.title ?? fileNameNoExt}{' '}
            <a
              href={getSpotifyLink(directives, fileNameNoExt)}
              className="button renderedSongHeaderSpotify"
              target="_blank"
              rel="noreferrer"
            >
              Spotify
            </a>
          </h1>
          {directives.subtitle ? <h2>{directives.subtitle}</h2> : null}
        </div>
      </div>
      {lines.map((line) => {
        const lineKey = getLineTypeKey(line);
        switch (line.type) {
          case 'line': {
            return (
              <div
                className={`renderedSongLine renderedSongLine-${line.content}`}
                data-line-index={line.lineIndex}
                key={lineKey}
              >
                {line.spans.map((span, spanIndex) => {
                  return span.type === 'text' ? (
                    <span
                      className="renderedSongLineText"
                      key={`${span.text}-${spanIndex}`}
                    >
                      {span.text}
                    </span>
                  ) : (
                    <span
                      className="renderedSongLineChord"
                      key={`${span.chord.text}-${spanIndex}`}
                    >
                      <span className="renderedSongLineChordText">
                        {span.chord.chordText}
                      </span>
                      <span className="renderedSongLineChordExtras">
                        {span.chord.extras}
                      </span>
                    </span>
                  );
                  return <div />;
                })}
              </div>
            );
          }
          case 'section':
            return (
              <h3 className="renderedSongSection" key={lineKey}>
                {line.text}
              </h3>
            );
          case 'space':
            return <div className="renderedSongSpace" key={lineKey} />;
          case 'image':
            return (
              <DropboxImage
                className="renderedSongImage"
                src={
                  line.src[0] === '/'
                    ? // This is an absolute path.
                      line.src
                    : // This is a relative path.
                      pathJoin(folderPath, line.src)
                }
                key={lineKey}
              />
            );
          case 'audio':
          case 'video':
            return (
              <DropboxMedia
                className="renderedSongMedia"
                line={line}
                path={
                  line.src[0] === '/'
                    ? // This is an absolute path.
                      line.src
                    : // This is a relative path.
                      pathJoin(folderPath, line.src)
                }
                key={lineKey}
              />
            );
          case 'link':
            return (
              <a
                href={line.href}
                target="_blank"
                rel="noreferrer"
                key={lineKey}
              >
                {line.href}
              </a>
            );
          case 'comment': {
            let className = 'renderedSongComment';
            if (line.italic) {
              className += ' renderedSongItalic';
            }
            return (
              <div className={className} key={lineKey}>
                {line.text}
              </div>
            );
          }
          default:
            throw new UnhandledCaseError(line, 'LineType');
        }
      })}
      <div className="renderedSongEndPadding" />
    </div>
  );
}

const imageCache: Record<string, string> = Object.create(null);

function DropboxImage({
  // eslint-disable-next-line react/prop-types
  src,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const dropbox = Hooks.useSelector($.getDropbox);
  const [objectUrl, setObjectUrl] = React.useState<string>('');
  const [is404, setIs404] = React.useState<boolean>(false);
  const generationRef = React.useRef(0);
  const { getState } = Hooks.useStore();

  React.useEffect(() => {
    return () => {
      generationRef.current++;
    };
  });

  React.useEffect(() => {
    if (!src) {
      return;
    }

    if (imageCache[src]) {
      setObjectUrl(imageCache[src]);
      return;
    }
    const generation = ++generationRef.current;
    const db = $.getOfflineDB(getState());

    const handleBlob = (blob: Blob) => {
      if (generation !== generationRef.current) {
        return;
      }

      imageCache[src] = URL.createObjectURL(blob);
      setObjectUrl(imageCache[src]);
    };

    (async () => {
      if (db) {
        try {
          const file = await db.getFile(src);
          if (file?.type === 'blob') {
            handleBlob(file.blob);
          }
        } catch (error) {
          console.error('Error with indexeddb', error);
        }
      }

      dropbox
        .filesDownload({ path: src })
        .then(async ({ result }) => {
          const blob: Blob = (result as T.BlobFileMetadata).fileBlob;
          handleBlob(blob);
          if (db) {
            const metadata = fixupFileMetadata(result);
            await db.addBlobFile(metadata, blob);
          }
        })
        .catch((error) => {
          console.error('<DropboxImage /> error:', error);
          setIs404(true);
        });
    })().catch((error) => {
      console.error('DropboxImage had async error', error);
    });
  }, [dropbox, src]);

  if (is404) {
    return (
      <img
        {...props}
        className="missing-image"
        alt={'Missing Image: ' + (src ?? '')}
      ></img>
    );
  }

  return <img {...props} src={objectUrl} />;
}

type DropboxMediaProps = {
  path: string;
  line:
    | { type: 'audio'; lineIndex: number; src: string }
    | { type: 'video'; lineIndex: number; src: string; mimetype: string };
};

function DropboxMedia({
  // eslint-disable-next-line react/prop-types
  path,
  line,
  ...props
}: React.AudioHTMLAttributes<HTMLAudioElement> & DropboxMediaProps) {
  type AudioRef = React.MutableRefObject<HTMLAudioElement | null>;
  type VideoRef = React.MutableRefObject<HTMLVideoElement | null>;
  const mediaRef: AudioRef | VideoRef = React.useRef(null);
  const dropbox = Hooks.useSelector($.getDropbox);
  const [is404, setIs404] = React.useState<boolean>(false);
  const [objectUrl, setObjectUrl] = React.useState<string>(
    getEmptyMediaUrl(line.type),
  );
  const objectUrlRef = React.useRef(objectUrl);

  // Set the object url to a ref so it can be used in event handlers.
  React.useEffect(() => {
    objectUrlRef.current = objectUrl;
  }, [objectUrl]);

  const [isPlayRequested, setIsPlayRequested] = React.useState(false);

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
        url = URL.createObjectURL(response.result.fileBlob);
        mediaRef.current.src = url;
        setObjectUrl(url);
        requestAnimationFrame(() => {
          mediaRef.current?.play().catch(() => {});
        });
      } catch (error) {
        console.error('<DropboxMedia /> error:', error);
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

  function handlePlay(
    event: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>,
  ) {
    if (
      mediaRef.current &&
      objectUrlRef.current === getEmptyMediaUrl(line.type)
    ) {
      event.preventDefault();
      mediaRef.current.pause();
      setIsPlayRequested(true);
    }
  }

  if (is404) {
    return (
      <div className="renderedSongMediaMissing">Missing media file: {path}</div>
    );
  }

  if (line.type === 'video') {
    return (
      <video
        ref={mediaRef as VideoRef}
        controls
        {...props}
        onPlay={handlePlay}
        src="/blank.mp4"
      ></video>
    );
  }

  return (
    <audio
      ref={mediaRef as AudioRef}
      controls
      {...props}
      src={objectUrl}
      onPlaying={handlePlay}
    />
  );
}

function getLineTypeKey(line: T.LineType): string {
  const index = String(line.lineIndex);
  switch (line.type) {
    case 'section':
      return 'section' + index + line.text;
    case 'space':
      return 'space' + index;
    case 'link':
      return 'link' + index + line.href;
    case 'line': {
      let key = 'line' + index;
      for (const span of line.spans) {
        switch (span.type) {
          case 'text':
            key += span.text;
            break;
          case 'chord':
            key += span.chord;
            break;
          default:
            throw new UnhandledCaseError(span, 'TextOrChord');
        }
      }
      return key;
    }
    case 'image': {
      return 'image:' + index + line.src;
    }
    case 'audio': {
      return 'audio:' + index + line.src;
    }
    case 'video': {
      return 'video:' + index + line.src;
    }
    case 'comment': {
      return 'comment:' + index + line.text;
    }
    default:
      throw new UnhandledCaseError(line, 'LineType');
  }
}

/**
 * Handle what happens when a user drops a file in the rendered song.
 */
function uploadFileHook(
  renderedSongRef: React.RefObject<null | HTMLElement>,
  path: string,
  folderPath: string,
) {
  const dispatch = Hooks.useDispatch();

  Hooks.useFileDrop(renderedSongRef, async (fileList, target) => {
    const closest = target.closest('[data-line-index]') as HTMLElement;
    const lineIndex = Number(closest?.dataset.lineIndex ?? 0);
    for (const file of fileList) {
      const [type, _subtype] = file.type.split('/');
      let makeTag;
      switch (type) {
        case 'audio':
          makeTag = (src: string) => `{audio: src="${src}"}`;
          break;
        case 'video':
          makeTag = (src: string) =>
            `{video: src="${src}" mimetype="${file.type}"}`;
          break;
        case 'image': {
          makeTag = (src: string) => `{image: src="${src}"}`;
          break;
        }
        default:
        // Do nothing.
      }

      if (!makeTag) {
        // This is an unhandled file type.
        console.error(`Unknown file type`, file);
        dispatch(
          A.addMessage({
            message: `"${file.name}" has a mime type of "${file.type}" and is not supported by Browser Chords.`,
          }),
        );
        return;
      }

      const savedFilePath = await dispatch(
        A.saveAssetFile(folderPath, file.name, file),
      );

      if (!savedFilePath) {
        // The A.saveAssetFile() handles the `addMessage`.
        return;
      }

      dispatch(
        A.insertTextAtLineInActiveFile(lineIndex, makeTag(savedFilePath)),
      );
    }
  });
}

let _emptyAudio: string;
function getEmptyMediaUrl(type: 'video' | 'audio') {
  if (type === 'video') {
    return '/blank.mp4';
  }

  if (!_emptyAudio) {
    // Lazily initialize the audio.
    _emptyAudio =
      'data:audio/x-wav;base64,UklGRooWAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YWYW' +
      'A'.repeat(7000);
  }

  return _emptyAudio;
}
