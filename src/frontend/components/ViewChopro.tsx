import * as React from 'react';
import { EditorView } from '@codemirror/view';
import { A, $$, Hooks } from 'frontend';
import { ChordPro } from 'frontend/logic/chordpo-lang';
import {
  SongKey,
  getChordLineRatio,
  ultimateGuitarToChordPro,
} from 'frontend/logic/parse-chords';
import { overlayPortal, useRetainScroll } from 'frontend/hooks';
import { ensureExists, UnhandledCaseError } from 'frontend/utils';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';
import { RenderedSong } from './RenderedSong';
import { Splitter } from './Splitter';
import { TextArea } from './TextArea';
import { Popup } from './Popup';

import './ViewChopro.css';

export function ViewChopro() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const textFile = $$.getDownloadFileCache().get(path);
  const error = $$.getDownloadFileErrors().get(path);
  const songTitle = $$.getActiveFileSongTitleOrNull();
  const hideEditor = $$.getHideEditor();
  const editorOnly = $$.getEditorOnly();
  const editorAutocomplete = $$.getEditorAutocompleteSettings();
  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  React.useEffect(() => {
    if (songTitle) {
      document.title = songTitle;
    } else {
      if (path.startsWith('/')) {
        document.title = path.slice(1);
      } else {
        document.title = path;
      }
    }
  }, [path, songTitle]);

  React.useEffect(() => {
    if (textFile === undefined) {
      void dispatch(A.downloadFile(path));
    }
  }, [textFile]);

  if (textFile === undefined) {
    if (error) {
      return (
        <div className="status" ref={swipeDiv} data-testid="viewChopro">
          <NextPrevLinks />
          {error}
        </div>
      );
    }
    return (
      <div className="status" ref={swipeDiv} data-testid="viewChopro">
        <NextPrevLinks />
        Downloading…
      </div>
    );
  }

  if (hideEditor) {
    return (
      <div
        className="splitterSolo viewChoproSolo"
        ref={swipeDiv}
        key={path}
        data-testid="viewChopro"
      >
        <RenderedSong />
      </div>
    );
  }

  const textArea = (
    <TextArea
      path={path}
      textFile={textFile}
      language={ChordPro}
      enableAutocomplete={editorAutocomplete.chordpro}
      header={
        <div className="viewChoproHeaderContent">
          <KeyManager />
          <SongInfoPopup />
        </div>
      }
      editorExtensions={[
        EditorView.domEventHandlers({
          paste(event, view) {
            const { clipboardData } = event;
            if (!clipboardData) {
              return;
            }

            // Skip the conversion if it's just HTML.
            const hasHtmlPaste = clipboardData.getData('text/html');
            const text = clipboardData.getData('text/plain');

            if (hasHtmlPaste && getChordLineRatio(text) > 0.15) {
              // Treat this as an ultimate guitar file.
              event.preventDefault();
              const insert = ultimateGuitarToChordPro(text);
              const [range] = view.state.selection.ranges;
              const anchor = range.from + insert.length;
              const from = range.from;
              const to = range.to;

              view.dispatch({
                changes: {
                  from,
                  to,
                  insert,
                },
                selection: { anchor },
                effects: EditorView.scrollIntoView(anchor),
              });

              const modifier = window.navigator.platform
                .toLowerCase()
                .includes('mac')
                ? 'cmd'
                : 'ctrl';
              dispatch(
                A.addMessage({
                  message: `Converted from Ultimate Guitar tab to ChordPro. Paste with ${modifier}+shift+v to avoid this conversion.`,
                  timeout: true,
                }),
              );
            }
          },
        }),
      ]}
    />
  );

  if (editorOnly) {
    return (
      <div
        className="splitterSolo"
        ref={swipeDiv}
        key={path}
        data-testid="viewChopro"
      >
        {textArea}
      </div>
    );
  }

  return (
    <Splitter
      data-testid="viewChopro"
      className="splitterSplit"
      start={textArea}
      end={<RenderedSong />}
      persistLocalStorage="viewChoproSplitterOffset"
    />
  );
}

function SongInfoPopup() {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [openGeneration, setOpenGeneration] = React.useState(0);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const activeText = $$.getActiveFileText();
  const directives = $$.getActiveFileParsedOrNull()?.directives;
  const songKey = $$.getActiveFileSongKey();
  const songKeyRaw = typeof directives?.key === 'string' ? directives.key : '';
  const title = typeof directives?.title === 'string' ? directives.title : '';
  const artist = typeof directives?.artist === 'string' ? directives.artist : '';
  const subtitle =
    typeof directives?.subtitle === 'string' ? directives.subtitle : '';
  const keyOptions = [
    'C',
    'Db',
    'D',
    'Eb',
    'E',
    'F',
    'Gb',
    'G',
    'Ab',
    'A',
    'Bb',
    'B',
  ];
  let selectedKey = songKeyRaw;
  switch (songKeyRaw) {
    case 'C#':
      selectedKey = 'Db';
      break;
    case 'D#':
      selectedKey = 'Eb';
      break;
    case 'F#':
      selectedKey = 'Gb';
      break;
    case 'G#':
      selectedKey = 'Ab';
      break;
    case 'A#':
      selectedKey = 'Bb';
      break;
    default:
    // Use the key as-is.
  }

  function updateDirective(directive: string, value: string) {
    const updatedText = updateDirectiveInText(activeText, directive, value);
    if (updatedText !== activeText) {
      dispatch(A.modifyActiveFile(updatedText, path, true));
    }
  }

  return (
    <>
      <button
        className="viewChoproSongInfoButton"
        type="button"
        ref={buttonRef}
        onClick={(event) => {
          setOpenGeneration((generation) => generation + 1);
          setOpenEventDetail(event.detail);
        }}
      >
        Song Info
      </button>
      {overlayPortal(
        <Popup
          clickedElement={buttonRef}
          openEventDetail={openEventDetail}
          openGeneration={openGeneration}
          className="viewChoproSongInfoMenu"
        >
          <div className="viewChoproSongInfoRow">
            <label
              className="viewChoproSongInfoLabel"
              htmlFor="song-info-title"
            >
              Title
            </label>
            <input
              className="viewChoproSongInfoInput"
              id="song-info-title"
              type="text"
              value={title}
              onChange={(event) =>
                updateDirective('title', event.currentTarget.value)
              }
            />
          </div>
          <div className="viewChoproSongInfoRow">
            <label
              className="viewChoproSongInfoLabel"
              htmlFor="song-info-artist"
            >
              Artist
            </label>
            <input
              className="viewChoproSongInfoInput"
              id="song-info-artist"
              type="text"
              value={artist}
              onChange={(event) =>
                updateDirective('artist', event.currentTarget.value)
              }
            />
          </div>
          <div className="viewChoproSongInfoRow">
            <label
              className="viewChoproSongInfoLabel"
              htmlFor="song-info-subtitle"
            >
              Subtitle
            </label>
            <input
              className="viewChoproSongInfoInput"
              id="song-info-subtitle"
              type="text"
              value={subtitle}
              onChange={(event) =>
                updateDirective('subtitle', event.currentTarget.value)
              }
            />
          </div>
          <div className="viewChoproSongInfoRow">
            <label className="viewChoproSongInfoLabel" htmlFor="song-info-key">
              Key
            </label>
            <select
              className="viewChoproSongInfoSelect"
              id="song-info-key"
              value={selectedKey}
              onChange={(event) =>
                updateDirective('key', event.currentTarget.value)
              }
            >
              <option value="">Select</option>
              {keyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <button
            className="viewChoproSongInfoButton"
            type="button"
            disabled={!songKey}
            onClick={() => {
              if (songKey) {
                dispatch(A.transposeKey(path, ensureExists(songKey)));
              }
            }}
          >
            Transpose
          </button>
        </Popup>,
        'song-info-menu',
      )}
    </>
  );
}

function updateDirectiveInText(
  text: string,
  directive: string,
  value: string,
) {
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const directivesOrder = ['title', 'artist', 'subtitle', 'key'];
  const directiveValues = new Map<string, string>();

  for (const entry of directivesOrder) {
    const match = lines.find((line) =>
      new RegExp(`^\\s*\\{${entry}\\s*:(.*)\\}\\s*$`).test(line),
    );
    if (match) {
      const valueMatch = match.match(
        new RegExp(`^\\s*\\{${entry}\\s*:(.*)\\}\\s*$`),
      );
      const rawValue = valueMatch?.[1] ?? '';
      directiveValues.set(entry, rawValue.trim());
    }
  }

  directiveValues.set(directive, value.trim());

  const nextLines = lines.filter(
    (line) =>
      !directivesOrder.some((entry) =>
        new RegExp(`^\\s*\\{${entry}\\s*:(.*)\\}\\s*$`).test(line),
      ),
  );

  const directiveLines = directivesOrder
    .map((entry) => {
      const entryValue = directiveValues.get(entry);
      if (!entryValue) {
        return null;
      }
      return `{${entry}: ${entryValue}}`;
    })
    .filter((line) => line !== null);

  if (directiveLines.length === 0) {
    return nextLines.join(lineEnding);
  }

  return [...directiveLines, ...nextLines].join(lineEnding);
}

function KeyManager() {
  const path = $$.getPath();
  const songKey = $$.getActiveFileSongKey();
  const songKeyRaw = $$.getActiveFileSongKeyRaw();
  const songKeySettings = $$.getActiveSongKeySettings();
  const dispatch = Hooks.useDispatch();

  if (!songKey) {
    if (!songKeyRaw) {
      return null;
    }
    return <div className="viewChoproSongKeyWrapper">Key: {songKeyRaw}</div>;
  }

  const songKeyType = songKeySettings?.type;
  switch (songKeyType) {
    case 'capo':
      return <div className="viewChoproSongKeyWrapper">Capo</div>;
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
        <div className="viewChoproSongKeyWrapper">
          <label htmlFor="select-transpose">Transpose: </label>
          <select id="select-transpose" onChange={onChange} value={adjustedKey}>
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
      return (
        <div className="viewChoproSongKeyWrapper">Key: {songKey.display}</div>
      );
    }
    default:
      throw new UnhandledCaseError(songKeyType, 'Unhandled song key setting');
  }
}
