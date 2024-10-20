import * as React from 'react';
import { A, $$, Hooks } from 'src';
import { RenderedSong } from './RenderedSong';
import { TextArea } from './TextArea';
import { useRetainScroll } from '../hooks';
import { useNextPrevSwipe, NextPrevLinks } from './NextPrev';
import { Splitter } from './Splitter';
// @ts-expect-error This is untyped.
import { ChordPro } from 'codemirror-lang-chordpro';
import { EditorView } from 'codemirror';
import {
  getChordLineRatio,
  ultimateGuitarToChordPro,
} from '../logic/parse-chords';

export function ViewChopro() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const textFile = $$.getDownloadFileCache().get(path);
  const error = $$.getDownloadFileErrors().get(path);
  const songTitle = $$.getActiveFileSongTitleOrNull();
  const hideEditor = $$.getHideEditor();
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

  return (
    <Splitter
      data-testid="viewChopro"
      className="splitterSplit"
      start={
        <TextArea
          path={path}
          textFile={textFile}
          language={ChordPro}
          editorExtensions={[
            EditorView.domEventHandlers({
              paste(event, view) {
                const { clipboardData } = event;
                if (!clipboardData) {
                  return;
                }

                const text = clipboardData.getData('text/plain');

                if (getChordLineRatio(text) > 0.15) {
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

                  // console.log(`!!! ultimateGuitarToChordPro(text);`, {
                  //   converted: ultimateGuitarToChordPro(text),
                  //   original: text,
                  // });
                }
              },
            }),
          ]}
        />
      }
      end={<RenderedSong />}
      persistLocalStorage="viewChoproSplitterOffset"
    />
  );
}
