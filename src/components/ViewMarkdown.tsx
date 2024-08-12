import * as React from 'react';
import { A, T, $, $$, Hooks } from 'src';
import { markdown } from '@codemirror/lang-markdown';
import './ViewMarkdown.css';
import { useRetainScroll } from '../hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';
import { Splitter } from './Splitter';
import { TextArea } from './TextArea';
import { downloadImage } from 'src/logic/download-image';
import { getEnv, getPathFolder } from 'src/utils';
import { EditorView } from 'codemirror';
import TurndownService from 'turndown';

export function ViewMarkdown() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const textFile = $$.getDownloadFileCache().get(path);
  const error = $$.getDownloadFileErrors().get(path);
  const hideEditor = $$.getHideEditor();
  const displayPath = $$.getActiveFileDisplayPath();

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

  function addText(
    view: EditorView,
    insert: string,
    coords?: { x: number; y: number },
  ) {
    let anchor: number;
    let from: number;
    let to: number;
    if (coords) {
      anchor = view.posAtCoords(coords) ?? 0;
      from = anchor;
      to = anchor;
    } else {
      const [range] = view.state.selection.ranges;
      anchor = range.from + insert.length;
      from = range.from;
      to = range.to;
    }

    view.dispatch({
      changes: {
        from,
        to,
        insert,
      },
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor),
    });
  }

  function paste(event: ClipboardEvent, view: EditorView) {
    const { clipboardData } = event;
    if (!clipboardData) {
      return;
    }

    // For for files in the list.
    if (clipboardData.types.includes('Files')) {
      uploadFromFileList(clipboardData.files, displayPath, dispatch).then(
        (markdowns) => {
          for (const markdown of markdowns) {
            addText(view, markdown);
          }
        },
        (error) => void console.error(error),
      );
      return;
    }

    // Check for HTML in the paste.
    const html = clipboardData.getData('text/html');
    if (html) {
      // Convert HTML to Markdown.
      event.preventDefault();

      const turndownService: TurndownService = new TurndownService();
      addText(view, turndownService.turndown(html));
    }
  }

  function drop(event: DragEvent, view: EditorView) {
    const { dataTransfer } = event;
    if (!dataTransfer) {
      return;
    }

    // This should be infallible, as a message is dispatched on failure.
    void uploadFromFileList(dataTransfer.files, displayPath, dispatch).then(
      (markdowns) => {
        for (const markdown of markdowns) {
          addText(view, markdown, { x: event.clientX, y: event.clientY });
        }
      },
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
              paste,
              drop,
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
  const fileSystem = $$.getCurrentFS();
  const hideEditor = $$.getHideEditor();
  const htmlText = $$.getActiveFileMarkdown();
  const containerRef = React.useRef(null);
  const markdownDiv = React.useRef<HTMLDivElement | null>(null);
  const displayPath = $$.getActiveFileDisplayPath();
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
 * Uploads the file to dropbox, and then returns the markdown to render it.
 */
async function uploadFromFileList(
  fileList: FileList,
  displayPath: string,
  dispatch: T.Dispatch,
): Promise<string[]> {
  const responsePromises = [...fileList].map(async (file) => {
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
        makeTag = (src: string) => /* html */ `<img src="${src}" />\n`;
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
      return null;
    }

    const folderPath = getPathFolder(displayPath);
    const savedFilePath = await dispatch(
      A.saveAssetFile(
        folderPath,
        prompt('What do you want to name this file?', file.name) || file.name,
        file,
      ),
    );

    if (!savedFilePath) {
      // The A.saveAssetFile() handles the `addMessage`.
      return null;
    }

    return makeTag(savedFilePath);
  });
  const markdownsOrNull: Array<string | null> =
    await Promise.all(responsePromises);

  // TypeScript doesn't understand Array.prototype.filter.
  const markdowns: Array<string> = markdownsOrNull.filter((v) => v) as any;

  return markdowns;
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

    for (const markdown of await uploadFromFileList(
      fileList,
      displayPath,
      dispatch,
    )) {
      dispatch(A.insertTextAtLineInActiveFile(lineIndex, markdown));
    }
  });
}
