import * as React from 'react';
import { A, $, T, Hooks } from 'src';
import {
  getPathFileNameNoExt,
  getPathFolder,
  UnhandledCaseError,
} from 'src/utils';
import './RenderedSong.css';
import { NextPrevLinks } from './NextPrev';
import { MediaAudio, MediaImage, MediaVideo } from './Media';

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
                  return <div key={`-${spanIndex}`} />;
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
              <MediaImage line={line} folderPath={folderPath} key={lineKey} />
            );
          case 'audio':
            return (
              <MediaAudio line={line} folderPath={folderPath} key={lineKey} />
            );
          case 'video':
            return (
              <MediaVideo line={line} folderPath={folderPath} key={lineKey} />
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
          makeTag = (src: string) =>
            `{audio: src="${src}" mimetype="${file.type}"}`;
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
