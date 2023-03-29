import * as React from 'react';
import { A, $, T, Hooks } from 'src';
import {
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
          const blob: Blob = (result as any).fileBlob;
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
      switch (type) {
        case 'audio':
          console.log(`!!! add audio file`, file, lineIndex);
          break;
        case 'video':
          console.log(`!!! add video file`, file, lineIndex);
          break;
        case 'image': {
          const savedFilePath = await dispatch(
            A.saveAssetFile(folderPath, file.name, file),
          );
          if (savedFilePath) {
            dispatch(
              A.insertTextAtLineInActiveFile(
                lineIndex,
                `{image: src="${savedFilePath}"}`,
              ),
            );
          }
          break;
        }
        default: {
          console.error(`Unknown file type`, file);
          dispatch(
            A.addMessage({
              message: `"${file.name}" has a mime type of "${file.type}" and is not supported by Browser Chords.`,
            }),
          );
        }
      }
    }
  });
}
