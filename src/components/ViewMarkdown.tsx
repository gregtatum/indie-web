import * as React from 'react';
import { A, $, Hooks } from 'src';
import { markdown } from '@codemirror/lang-markdown';
import './ViewMarkdown.css';
import { useRetainScroll } from '../hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';
import { Splitter } from './Splitter';
import { TextArea } from './TextArea';
import { downloadImage } from 'src/logic/download-image';
import { getEnv, getPathFileNameNoExt, getPathFolder } from 'src/utils';
import { EditorView } from 'codemirror';
import TurndownService from 'turndown';

export function ViewMarkdown() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = Hooks.useSelector($.getPath);
  const textFile = Hooks.useSelector($.getDownloadFileCache).get(path);
  const error = Hooks.useSelector($.getDownloadFileErrors).get(path);
  const hideEditor = Hooks.useSelector($.getHideEditor);
  const displayPath = Hooks.useSelector($.getActiveFileDisplayPath);

  React.useEffect(() => {
    const parts = path.split('/');
    const file = parts[parts.length - 1];
    document.title = file.replace(/\.\w+$/, '');
  }, [path]);

  React.useEffect(() => {
    if (textFile === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.downloadFile(path));
    }
  }, [textFile]);

  const containerRef = React.useRef(null);
  useNextPrevSwipe(containerRef);

  if (textFile === undefined) {
    if (error) {
      return (
        <div className="status" ref={containerRef} data-testid="viewChopro">
          <NextPrevLinks />
          {error}
        </div>
      );
    }
    return (
      <div className="status" ref={containerRef} data-testid="viewChopro">
        <NextPrevLinks />
        Downloading…
      </div>
    );
  }

  if (hideEditor) {
    return (
      <div
        className="splitterSolo"
        ref={containerRef}
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
      start={
        <TextArea
          path={path}
          textFile={textFile}
          language={markdown}
          editorExtensions={[
            EditorView.lineWrapping,
            EditorView.domEventHandlers({
              paste(event, view) {
                const { clipboardData } = event;
                if (!clipboardData) {
                  return;
                }

                const [range] = view.state.selection.ranges;
                const addText = (insert: string) => {
                  const anchor = range.from + insert.length;
                  view.dispatch({
                    changes: {
                      from: range.from,
                      to: range.to,
                      insert,
                    },
                    selection: { anchor },
                    effects: EditorView.scrollIntoView(anchor),
                  });
                };

                // Check for an image in the paste.
                if (clipboardData.types.includes('Files')) {
                  const file = clipboardData.files[0];
                  if (file && file.type.startsWith('image/')) {
                    event.preventDefault();

                    const folderPath = getPathFolder(displayPath);
                    const name = getPathFileNameNoExt(displayPath);
                    const ext = file.type.replace('image/', '');
                    const number = Math.floor(Math.random() * 10_000_000);
                    const fileName = `${name}-${number}.${ext}`;

                    dispatch(A.saveAssetFile(folderPath, fileName, file)).then(
                      () => {
                        addText(`![](assets/${fileName})`);
                      },
                      (error) => {
                        // The A.saveAssetFile() handles the `addMessage`.
                        console.error(error);
                      },
                    );
                  }
                  return;
                }

                // Check for HTML in the paste.
                const html = clipboardData.getData('text/html');
                if (html) {
                  // Convert HTML to Markdown.
                  event.preventDefault();

                  const turndownService: TurndownService =
                    new TurndownService();
                  addText(turndownService.turndown(html));
                }
              },
            }),
          ]}
        />
      }
      end={<RenderedMarkdown view="split" />}
      persistLocalStorage="viewMarkdownSplitterOffset"
    />
  );
}

interface RenderedMarkdownProps {
  view: string;
}

function RenderedMarkdown({ view }: RenderedMarkdownProps) {
  const fileSystem = Hooks.useSelector($.getCurrentFS);
  const hideEditor = Hooks.useSelector($.getHideEditor);
  const htmlText = Hooks.useSelector($.getActiveFileMarkdown);
  const containerRef = React.useRef(null);
  const markdownDiv = React.useRef<HTMLDivElement | null>(null);
  const displayPath = Hooks.useSelector($.getActiveFileDisplayPath);
  const dispatch = Hooks.useDispatch();

  useNextPrevSwipe(containerRef);
  uploadFileHook(containerRef, displayPath);

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
      // The src is the resolved URL, so will include the host name. This needs to be
      // transformed into a valid Dropbox path.
      let { src } = img;

      // Take off the file name to get the file path.
      const rootURL =
        window.location.toString().split('/').slice(0, -1).join('/') + '/';

      // Replace the root url for relative links, and the origin for absolute links.
      src = src.replace(rootURL, '').replace(window.location.origin, '');

      try {
        new URL(src);
        // The URL parsed, it's an external URL.
        continue;
      } catch {
        // Do nothing.
      }

      // Remove components like %20.
      src = decodeURI(src);

      // The img src will need to be replaced with the downloaded file.
      img.removeAttribute('src');

      downloadImage(fileSystem, folderPath, src)
        .then((objectURL) => {
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
    for (let node of doc.body.childNodes) {
      if ((node as any).tagName === 'TABLE') {
        const div = document.createElement('div');
        div.className = 'viewMarkdownTable';
        div.appendChild(node);
        node = div;
      }
      div.append(node);
    }
  }, [htmlText, view, displayPath, fileSystem]);

  return (
    <div
      className="viewMarkdown"
      data-testid="renderedMarkdown"
      ref={containerRef}
    >
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

/**
 * Handle what happens when a user drops a file in the rendered song.
 */
function uploadFileHook(
  markdownRef: React.RefObject<null | HTMLElement>,
  displayPath: string,
) {
  const { dispatch, getState } = Hooks.useStore();
  Hooks.useFileDrop(markdownRef, async (fileList, target) => {
    // As far as I can tell, there is no way to use `marked` to map from the rendered HTML
    // back to the source text. To work around this, try to find a line index to insert
    // the attachment into the markdown.
    const lines = $.getActiveFileText(getState()).split('\n');
    let searchNode: HTMLElement | null = target;
    let lineIndex = -1;
    while (searchNode) {
      const searchTerm = searchNode?.innerText.trim();
      lineIndex = lines.findIndex((line) => line.includes(searchTerm));
      if (lineIndex !== -1) {
        break;
      }
      searchNode = target.nextElementSibling as HTMLElement;
    }
    if (lineIndex === -1) {
      lineIndex = lines.length;
    } else {
      // Place it after this line.
      lineIndex++;
    }

    for (const file of fileList) {
      const [type, _subtype] = file.type.split('/');
      let makeTag;
      switch (type) {
        case 'audio':
          makeTag = (src: string) =>
            `\n<audio controls>\n` +
            `  <source src="${src}" type="${file.type}">\n` +
            `</audio>`;
          break;
        case 'video':
          makeTag = (src: string) =>
            `\n<video controls>\n` +
            `  <source src="${src}" type="${file.type}">\n` +
            `</video>\n`;

          break;
        case 'image': {
          makeTag = (src: string) => /* html */ `\n<img src="${src}" />\n`;
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

      const folderPath = getPathFolder(displayPath);
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
