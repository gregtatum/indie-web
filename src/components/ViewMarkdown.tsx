import * as React from 'react';
import { A, $, Hooks, T } from 'src';
import { markdown } from '@codemirror/lang-markdown';
import './ViewMarkdown.css';
import { useRetainScroll } from '../hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';
import { Splitter } from './Splitter';
import { TextArea } from './TextArea';
import { downloadImage } from 'src/logic/download-image';
import { getPathFolder } from 'src/utils';

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
      start={<TextArea path={path} textFile={textFile} language={markdown} />}
      end={<RenderedMarkdown view="split" />}
      persistLocalStorage="viewMarkdownSplitterOffset"
    />
  );
}

interface RenderedMarkdownProps {
  view: string;
}

function RenderedMarkdown({ view }: RenderedMarkdownProps) {
  const dropbox = Hooks.useSelector($.getDropbox);
  const hideEditor = Hooks.useSelector($.getHideEditor);
  const htmlText = Hooks.useSelector($.getActiveFileMarkdown);
  const swipeDiv = React.useRef(null);
  const markdownDiv = React.useRef<HTMLDivElement | null>(null);
  const displayPath = Hooks.useSelector($.getActiveFileDisplayPath);
  const db = Hooks.useSelector($.getOfflineDB);

  const dispatch = Hooks.useDispatch();
  useNextPrevSwipe(swipeDiv);

  React.useEffect(() => {
    const div = markdownDiv.current;
    if (!div) {
      return;
    }
    const domParser = new DOMParser();
    const doc = domParser.parseFromString(htmlText, 'text/html');

    // Download any images that are in the Markdown.
    const folderPath = getPathFolder(displayPath);
    for (const img of doc.querySelectorAll('img')) {
      let { src } = img;
      // Take off the file name to get the file path.
      const rootURL =
        window.location.toString().split('/').slice(0, -1).join('/') + '/';
      src = src.replace(rootURL, '');
      console.log(`!!! src`, src);
      try {
        new URL(src);
        // The URL parsed, it's an absolute URL.
        continue;
      } catch {}
      img.removeAttribute('src');

      downloadImage(dropbox, db, folderPath, src)
        .then((objectURL) => {
          console.log(`!!! `, img.src, objectURL);
          img.src = objectURL;
        })
        .catch(() => {
          // downloadImage uses console.error.
        });
    }

    // Remove the old nodes.
    for (const node of [...div.childNodes]) {
      node.remove();
    }

    // Add the elements to the page.
    for (const node of doc.body.childNodes) {
      div.append(node);
    }
  }, [htmlText, view, displayPath, dropbox]);

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
