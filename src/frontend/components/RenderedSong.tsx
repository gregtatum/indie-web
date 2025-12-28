import * as React from 'react';
import { A, $$, T, Hooks } from 'frontend';
import {
  getEnv,
  getPathFileNameNoExt,
  getDirName,
  UnhandledCaseError,
  htmlElementOrNull,
} from 'frontend/utils';
import {
  SongKey,
  nashvilleChordText,
  romanChordText,
} from 'frontend/logic/parse-chords';
import './RenderedSong.css';
import { NextPrevLinks } from './NextPrev';
import { MediaAudio, MediaImage, MediaVideo } from './Media';

function getSpotifyLink(
  { title, artist, subtitle }: Record<string, string>,
  fileName: string,
) {
  let search: string = '';
  if (title) {
    search = title;
  }
  const postfix = artist || subtitle;
  if (postfix) {
    if (search) {
      search += ' ';
    }
    search += postfix;
  }
  if (!search) {
    search = fileName;
  }

  return 'https://open.spotify.com/search/' + encodeURIComponent(search);
}

export function RenderedSong() {
  const displayPath = $$.getActiveFileDisplayPath();
  const folderPath = getDirName(displayPath);
  const fileNameNoExt = getPathFileNameNoExt(displayPath);

  const renderedSongRef = React.useRef(null);
  const path = $$.getPath();
  const hideEditor = $$.getHideEditor();
  const songKey = $$.getActiveFileSongKey();
  const { directives, lines } = $$.getActiveFileParsedTransformed();
  const chordDisplay = directives.chords;
  const dispatch = Hooks.useDispatch();
  uploadFileHook(renderedSongRef, path, folderPath);

  return (
    <div
      className="renderedSong"
      data-testid="renderedSong"
      key={path}
      data-fullscreen
      ref={renderedSongRef}
    >
      {hideEditor ? <NextPrevLinks /> : null}
      <div className="renderedSongStickyHeader">
        <RenderedSongKeyReadOnly />
        {hideEditor ? (
          <button
            className="button"
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
          {directives.artist ? <h2>{directives.artist}</h2> : null}
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
                data-testid="renderedSongLine"
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
                        {renderChordText(span.chord, songKey, chordDisplay)}
                      </span>
                      <span className="renderedSongLineChordExtras">
                        {span.chord.extras}
                      </span>
                    </span>
                  );
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

function RenderedSongKeyReadOnly() {
  const songKey = $$.getActiveFileSongKey();
  const songKeyRaw = $$.getActiveFileSongKeyRaw();
  const transposeRaw = $$.getActiveFileTransposeRaw();
  const capoRaw = $$.getActiveFileCapoRaw();
  const transposeKey = transposeRaw ? SongKey.fromRaw(transposeRaw) : null;
  const capoValue = capoRaw ? Number.parseInt(capoRaw, 10) : null;

  if (!songKey && !songKeyRaw && !transposeRaw && !capoRaw) {
    return null;
  }

  if (capoValue && transposeKey) {
    return (
      <div className="renderedSongStickyHeaderRow">
        <span>
          Transposed: {transposeRaw} (Capo: {capoValue})
        </span>
      </div>
    );
  }

  if (songKeyRaw && transposeKey) {
    return (
      <div className="renderedSongStickyHeaderRow">
        <span>
          Key: {songKeyRaw} (Transposed: {transposeKey.display})
        </span>
      </div>
    );
  }

  if (songKeyRaw && capoValue) {
    return (
      <div className="renderedSongStickyHeaderRow">
        <span>
          Key: {songKeyRaw} (Capo: {capoValue})
        </span>
      </div>
    );
  }

  if (songKeyRaw) {
    return (
      <div className="renderedSongStickyHeaderRow">
        <span>Key: {songKeyRaw}</span>
      </div>
    );
  }

  return (
    <div className="renderedSongStickyHeaderRow">
      <span>
        Key:{' '}
        {songKey?.display ?? transposeKey?.display ?? transposeRaw ?? capoRaw}
      </span>
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
            key += span.chord.text;
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

function renderChordText(
  chord: T.Chord,
  songKey: SongKey | null,
  chordDisplay: string | undefined,
) {
  const parts = getChordDisplayParts(chord, songKey, chordDisplay);
  if (!parts) {
    return chord.chordText ?? chord.text;
  }
  return (
    <>
      {parts.base}
      {parts.decoration ? <sup>{parts.decoration}</sup> : null}
    </>
  );
}

function getChordDisplayParts(
  chord: T.Chord,
  songKey: SongKey | null,
  chordDisplay: string | undefined,
) {
  if (chordDisplay === 'nashville' && songKey) {
    const nashvilleText = nashvilleChordText(chord, songKey);
    if (!nashvilleText) {
      return null;
    }
    const formattedText = formatChordDisplayText(nashvilleText);
    const match = formattedText.match(/^([♭♯]?[1-7])/);
    const baseRoot = match?.[1] ?? nashvilleText;
    const decoration = formattedText.slice(baseRoot.length);
    return splitChordDecoration(baseRoot, decoration);
  }

  if (chordDisplay === 'roman' && songKey) {
    const romanText = romanChordText(chord, songKey);
    if (!romanText) {
      return null;
    }
    const formattedText = formatChordDisplayText(romanText, {
      useJazzMaj7: true,
    });
    const match = formattedText.match(/^([♭♯]?)([ivIV]+)/);
    if (!match) {
      return { base: formattedText, decoration: '' };
    }
    const baseRoot = match[1] + match[2];
    const decoration = formattedText.slice(baseRoot.length);
    return { base: baseRoot, decoration };
  }

  if (chord.baseNote && chord.chordText) {
    const decoration = chord.chordText.slice(chord.baseNote.length);
    return splitChordDecoration(chord.baseNote, decoration);
  }

  if (chord.chordText) {
    return { base: chord.chordText, decoration: '' };
  }

  return null;
}

function splitChordDecoration(baseRoot: string, decoration: string) {
  if (
    decoration &&
    (decoration.startsWith('m') || decoration.startsWith('-')) &&
    !decoration.toLowerCase().startsWith('maj') &&
    !decoration.toLowerCase().startsWith('mj')
  ) {
    return {
      base: baseRoot + decoration[0],
      decoration: decoration.slice(1),
    };
  }

  return {
    base: baseRoot,
    decoration,
  };
}

function formatChordDisplayText(
  text: string,
  options: { useJazzMaj7?: boolean } = {},
) {
  let formatted = text
    .replace(/b(?=[0-9IV])/g, '♭')
    .replace(/#(?=[0-9IV])/g, '♯');
  formatted = formatted.replace(/dim/g, '°');
  if (options.useJazzMaj7) {
    formatted = formatted.replace(/maj7/g, '△').replace(/\^7/g, '△');
  }
  return formatted;
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

  Hooks.useFileDrop(renderedSongRef, async (event) => {
    const target = htmlElementOrNull(event.target);
    const closest = htmlElementOrNull(target?.closest('[data-line-index]'));
    const lineIndex = Number(closest?.dataset.lineIndex ?? 0);
    const files = event.dataTransfer?.files ?? [];

    for (const file of files) {
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
            message: `"${file.name}" has a mime type of "${
              file.type
            }" and is not supported by ${getEnv('SITE_DISPLAY_NAME')}.`,
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
