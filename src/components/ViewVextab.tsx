import * as React from 'react';
import { A, $$, Hooks } from 'src';
import { RenderedSong } from './RenderedSong';
import { TextArea } from './TextArea';
import { useRetainScroll } from '../hooks';
import { useNextPrevSwipe, NextPrevLinks } from './NextPrev';
import { Splitter } from './Splitter';
import { VexTab } from 'src/logic/vextab-grammar';

export function ViewVextab() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const textFile = $$.getDownloadFileCache().get(path);
  const error = $$.getDownloadFileErrors().get(path);
  const hideEditor = $$.getHideEditor();
  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);
  Hooks.useFileAsDocumentTitle();

  React.useEffect(() => {
    if (textFile === undefined) {
      void dispatch(A.downloadFile(path));
    }
  }, [textFile]);

  if (textFile === undefined) {
    if (error) {
      return (
        <div className="status" ref={swipeDiv} data-testid="viewVextab">
          <NextPrevLinks />
          {error}
        </div>
      );
    }
    return (
      <div className="status" ref={swipeDiv} data-testid="viewVextab">
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
        data-testid="viewVextab"
      >
        <RenderedSong />
      </div>
    );
  }

  return (
    <Splitter
      data-testid="viewVextab"
      className="splitterSplit"
      start={<TextArea path={path} textFile={textFile} language={VexTab} />}
      end={<RenderedSong />}
      persistLocalStorage="viewChoproSplitterOffset"
    />
  );
}
