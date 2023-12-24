import * as React from 'react';
import { A, $, Hooks } from 'src';
import { RenderedSong } from './RenderedSong';
import { TextArea } from './TextArea';
import { useRetainScroll } from '../hooks';
import { useNextPrevSwipe, NextPrevLinks } from './NextPrev';
import { Splitter } from './Splitter';
// @ts-expect-error This is untyped.
import { ChordPro } from 'codemirror-lang-chordpro';

export function ViewChopro() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = Hooks.useSelector($.getPath);
  const textFile = Hooks.useSelector($.getDownloadFileCache).get(path);
  const error = Hooks.useSelector($.getDownloadFileErrors).get(path);
  const songTitle = Hooks.useSelector($.getActiveFileSongTitleOrNull);
  const hideEditor = Hooks.useSelector($.getHideEditor);
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
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.downloadFile(path));
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
      start={<TextArea path={path} textFile={textFile} language={ChordPro} />}
      end={<RenderedSong />}
      persistLocalStorage="viewChoproSplitterOffset"
    />
  );
}
