import * as React from 'react';
import { A, $$, T, Hooks } from 'src';
import {
  ensureExists,
  getEnv,
  getPathFileNameNoExt,
  getDirName,
  UnhandledCaseError,
  htmlElementOrNull,
  isVexTabFilePath,
} from 'src/utils';
import './RenderedSong.css';
import { NextPrevLinks } from './NextPrev';
import { MediaAudio, MediaImage, MediaVideo } from './Media';
import { SongKey } from 'src/logic/parse-chords';
import { Menu } from './Menus';
import { overlayPortal } from 'src/hooks';
import { Vex } from 'vexflow';

function getSpotifyLink(
  title: string | void | null,
  subtitle: string | void | null,
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
  const displayPath = $$.getActiveFileDisplayPath();
  const folderPath = getDirName(displayPath);
  const fileNameNoExt = getPathFileNameNoExt(displayPath);

  const renderedSongRef = React.useRef(null);
  const path = $$.getPath();
  const hideEditor = $$.getHideEditor();
  const songTitle = $$.getActiveFileTitle();
  const songSubTitle = $$.getActiveSongSubTitle();
  const chordPro = $$.getActiveChordProOrNull();
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
        <div className="renderedSongStickyHeaderRow">
          <RenderedSongKey />
        </div>
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
            {songTitle}{' '}
            <a
              href={getSpotifyLink(songTitle, songSubTitle, fileNameNoExt)}
              className="button renderedSongHeaderSpotify"
              target="_blank"
              rel="noreferrer"
            >
              Spotify
            </a>
          </h1>
          {songSubTitle ? <h2>{songSubTitle}</h2> : null}
        </div>
      </div>
      {chordPro ? <ChordPro chordPro={chordPro} /> : <VexTabDisplay />}
      <div className="renderedSongEndPadding" />
    </div>
  );
}

function RenderedSongKey() {
  const path = $$.getPath();
  const songKey = $$.getActiveSongKey();
  const songKeyRaw = $$.getActiveSongKeyRaw();
  const songKeySettings = $$.getActiveSongKeySettings();
  const dispatch = Hooks.useDispatch();
  const isVexTab = isVexTabFilePath(path);

  if (!songKey) {
    if (!songKeyRaw) {
      return null;
    }
    return <div className="renderedSongStickyHeaderRow">Key: {songKeyRaw}</div>;
  }

  const songKeyType = songKeySettings?.type;
  switch (songKeyType) {
    case 'capo':
      return <div className="renderedSongStickyHeaderRow">Capo</div>;
    case 'transpose': {
      function onChange(event: any) {
        dispatch(
          A.transposeKey(
            path,
            ensureExists(
              SongKey.fromRaw(event.target.value),
              'Could not parse song key',
            ),
          ),
        );
      }

      // Remove the enharmonic keys.
      let adjustedKey = songKey.key;
      switch (songKey.key) {
        case 'Db':
          adjustedKey = 'C#';
          break;
        case 'Gb':
          adjustedKey = 'F#';
          break;
        case 'B':
          adjustedKey = 'Cb';
          break;
        default:
        // Do nothing.
      }

      return (
        <div className="renderedSongStickyHeaderRow">
          <label htmlFor="select-transpose">Transpose: </label>
          <select
            disabled={isVexTab}
            id="select-transpose"
            onChange={onChange}
            value={adjustedKey}
          >
            <option>C</option>
            <option>Db</option>
            <option>D</option>
            <option>Eb</option>
            <option>E</option>
            <option>F</option>
            <option>Gb</option>
            <option>G</option>
            <option>Ab</option>
            <option>A</option>
            <option>Bb</option>
            <option>B</option>
          </select>
        </div>
      );
    }
    case undefined: {
      return <SongKeyMenu songKey={songKey} isVexTab={isVexTab} />;
    }
    default:
      throw new UnhandledCaseError(songKeyType, 'Unhandled song key setting');
  }
}

interface SongKeyMenu {
  songKey: SongKey;
  isVexTab: boolean;
}

function SongKeyMenu({ songKey, isVexTab }: SongKeyMenu) {
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);
  const [openGeneration, setOpenGeneration] = React.useState(0);

  return (
    <div className="renderedSongStickyHeaderRow">
      <button
        type="button"
        className="renderedSongKey"
        disabled={isVexTab}
        ref={buttonRef}
        onClick={(event) => {
          setOpenGeneration((generation) => generation + 1);
          setOpenEventDetail(event.detail);
        }}
      >
        Key: {songKey.display}
      </button>
      {overlayPortal(
        <Menu
          clickedElement={buttonRef}
          openEventDetail={openEventDetail}
          openGeneration={openGeneration}
          buttons={[
            {
              key: 'Transpose',
              children: 'Transpose',
              onClick() {
                dispatch(A.transposeKey(path, ensureExists(songKey)));
              },
            },
            // TODO
            // {
            //   key: 'Apply Capo',
            //   children: 'Apply Capo',
            //   onClick() {
            //     dispatch(A.transposeKey(path, ensureExists(songKey)));
            //   },
            // },
          ]}
        />,
      )}
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

interface ChordProProps {
  chordPro: T.ParsedChordPro;
}

function ChordPro({ chordPro }: ChordProProps) {
  const { lines } = chordPro;
  const displayPath = $$.getActiveFileDisplayPath();
  const folderPath = getDirName(displayPath);

  return (
    <>
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
                        {span.chord.chordText}
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
    </>
  );
}

function VexTabDisplay() {
  const text = $$.getActiveFileText();
  const mountRef = React.useRef<null | HTMLDivElement>(null);

  React.useEffect(() => {
    const div = mountRef.current;
    if (!div) {
      return;
    }
    let node;
    while ((node = div.lastChild)) {
      node.remove();
    }
    const vf = new Vex.Flow.Factory({
      renderer: { elementId: 'vexFlowElement' },
    });
    const score = vf.EasyScore();
    const system = vf.System();

    system
      .addStave({
        voices: [score.voice(score.notes('C#5/q, B4, A4, G#4'))],
      })
      .addClef('treble')
      .addTimeSignature('4/4');

    vf.draw();
  }, [text]);

  return <div className="vexTab" id="vexFlowElement" ref={mountRef}></div>;
}
