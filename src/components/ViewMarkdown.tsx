import * as React from 'react';
import { A, $, Hooks } from 'src';

import './ViewMarkdown.css';
import { useRetainScroll } from '../hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';
import { Splitter } from './Splitter';
import { TextArea } from './TextArea';

export function ViewMarkdown() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = Hooks.useSelector($.getPath);
  const textFile = Hooks.useSelector($.getDownloadFileCache).get(path);
  const error = Hooks.useSelector($.getDownloadFileErrors).get(path);
  const songTitle = Hooks.useSelector($.getActiveFileSongTitleOrNull);
  const hideEditor = Hooks.useSelector($.getHideEditor);

  React.useEffect(() => {
    if (songTitle) {
      document.title = songTitle;
    } else {
      const parts = path.split('/');
      const file = parts[parts.length - 1];
      document.title = file.replace(/\.\w+$/, '');
    }
  }, [path, songTitle]);

  React.useEffect(() => {
    if (textFile === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.downloadFile(path));
    }
  }, [textFile]);

  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

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
        className="splitterSolo"
        ref={swipeDiv}
        key={path}
        data-fullscreen
        data-testid="viewMarkdown"
      >
        <RenderedMarkdown view="solo" />
      </div>
    );
  }

  return (
    <Splitter
      data-testid="viewMarkdown"
      className="splitterSplit"
      start={<TextArea path={path} textFile={textFile} />}
      end={<RenderedMarkdown view="split" />}
      persistLocalStorage="viewMarkdownSplitterOffset"
    />
  );
}

interface RenderedMarkdownProps {
  view: string;
}

function RenderedMarkdown({ view }: RenderedMarkdownProps) {
  const hideEditor = Hooks.useSelector($.getHideEditor);
  const htmlText = Hooks.useSelector($.getActiveFileMarkdown);
  const swipeDiv = React.useRef(null);
  const markdownDiv = React.useRef<HTMLDivElement | null>(null);
  const dispatch = Hooks.useDispatch();
  useNextPrevSwipe(swipeDiv);

  React.useEffect(() => {
    const div = markdownDiv.current;
    if (!div) {
      return;
    }
    const domParser = new DOMParser();
    const doc = domParser.parseFromString(htmlText, 'text/html');
    for (const node of [...div.childNodes]) {
      node.remove();
    }
    for (const node of doc.body.childNodes) {
      div.append(node);
    }
  }, [htmlText, view]);

  return (
    <div className="viewMarkdown" ref={swipeDiv}>
      {hideEditor ? <NextPrevLinks /> : null}
      <div className="viewMarkdownContainer">
        <div className="viewMarkdownStickyHeader">
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
        <div className="viewMarkdownDiv" ref={markdownDiv} />
      </div>
    </div>
  );
}
