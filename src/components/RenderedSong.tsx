import * as React from 'react';
import * as Redux from 'react-redux';
import { A, $, T } from 'src';
import { UnhandledCaseError } from 'src/utils';
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
  const path = Redux.useSelector($.getPath);
  const displayPath = Redux.useSelector($.getActiveFileDisplayPath);
  const fileKey = Redux.useSelector($.getActiveFileSongKey);
  const hideEditor = Redux.useSelector($.getHideEditor);
  const { directives, lines } = Redux.useSelector($.getActiveFileParsed);
  const dispatch = Redux.useDispatch();

  const parts = displayPath.split('/');
  let fileName = parts[parts.length - 1].replace('.chopro', '');
  if (fileName.endsWith('.chopro')) {
    fileName = fileName.slice(0, fileName.length - '.chopro'.length);
  }
  const folderPath = parts.slice(0, parts.length - 1).join('/');

  return (
    <div className="renderedSong" key={path} data-fullscreen>
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
            {directives.title ?? fileName}{' '}
            <a
              href={getSpotifyLink(directives, fileName)}
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
      {lines.map((line, lineIndex) => {
        const lineKey = getLineTypeKey(line, lineIndex);
        switch (line.type) {
          case 'line': {
            return (
              <div
                className={`renderedSongLine renderedSongLine-${line.content}`}
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
                src={pathJoin(folderPath, line.src)}
                key={lineKey}
              />
            );
          case 'link':
            return (
              <a href={line.href} target="_blank" rel="noreferrer">
                {line.href}
              </a>
            );
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
  const dropbox = Redux.useSelector($.getDropbox);
  const [objectUrl, setObjectUrl] = React.useState<string>('');
  const generationRef = React.useRef(0);
  const { getState } = Redux.useStore();

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
          const { fileBlob } = result as any;
          handleBlob(fileBlob);
          if (db) {
            const metadata = fixupFileMetadata(result);
            db.addBlobFile(metadata, fileBlob);
          }
        })
        .catch((error) => {
          console.error('<DropboxImage /> error:', error);
        });
    })();
  }, [dropbox, src]);

  return <img {...props} src={objectUrl} />;
}

function getLineTypeKey(line: T.LineType, index: number): string {
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
    default:
      throw new UnhandledCaseError(line, 'LineType');
  }
}
