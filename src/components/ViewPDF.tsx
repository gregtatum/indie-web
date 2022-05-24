import * as React from 'react';
import * as Redux from 'react-redux';
import { A, $ } from 'src';

import './ViewPDF.css';
import { ensureExists, maybeGetProperty, UnhandledCaseError } from 'src/utils';
import { UnlinkDropbox } from './LinkDropbox';
import {
  usePromiseSelector,
  useInfalliblePromise,
  useShouldHideHeader,
} from './hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function ViewPDF() {
  const dispatch = Redux.useDispatch();
  const path = Redux.useSelector($.getPath);
  const request = Redux.useSelector($.getDownloadBlobCache).get(path);
  const songTitle = Redux.useSelector($.getActiveFileSongTitleOrNull);

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
    if (!request) {
      dispatch(A.downloadBlob(path));
    }
  }, [request]);

  switch (request?.type) {
    case 'download-blob-received': {
      if (request.value.error) {
        console.error(request.value.error);
        return (
          <div>
            There was an error:
            {maybeGetProperty(request.value.error, 'message')}
          </div>
        );
      }
      return <LoadPDF />;
    }
    case 'download-blob-failed': {
      return (
        <div className="viewPDFError">
          <div>
            <p>Unable to access DropBox account.</p>
            <UnlinkDropbox />
          </div>
        </div>
      );
    }
    case 'download-blob-requested':
    default:
      return <div className="viewPDFMessage">Requesting pdf.</div>;
  }
}

function LoadPDF() {
  const pdf = usePromiseSelector($.getActivePDF);
  switch (pdf.type) {
    case 'fulfilled':
      if (!pdf.value) {
        return <div className="viewPDFLoading">Error loading PDF.</div>;
      }
      return <PDF pdf={pdf.value} />;
    case 'pending':
      return <div className="viewPDFLoading">Loading PDF.</div>;
    case 'rejected':
      return <div className="viewPDFLoading">Error loading PDF.</div>;
    default:
      throw new UnhandledCaseError(pdf, 'promise');
  }
}

interface PDFProps {
  pdf: PDFDocumentProxy;
}

function PDF({ pdf }: PDFProps) {
  const container = React.useRef<HTMLDivElement | null>(null);
  const getAllPages = React.useMemo(() => {
    const pages = [];
    for (let i = 0; i < pdf.numPages; i++) {
      pages.push(pdf.getPage(i + 1));
    }
    return Promise.all(pages);
  }, [pdf]);
  const pages = useInfalliblePromise(getAllPages);
  const hideHeaderRef = useShouldHideHeader();

  React.useEffect(() => {
    const div = container.current;
    if (pages === null || div === null) {
      return;
    }
    for (const page of pages) {
      const pdfViewport = page.getViewport({ scale: 1 });
      const divRect = ensureExists(
        div.parentElement,
        'Div parent',
      ).getBoundingClientRect();
      const scale =
        (window.devicePixelRatio * divRect.width) / pdfViewport.width;
      const viewport = page.getViewport({ scale });

      // Prepare canvas using PDF page dimensions
      const canvas = document.createElement('canvas');
      canvas.className = 'viewPDFSoloCanvas';
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      div.appendChild(canvas);

      const renderTask = page.render({
        canvasContext: ensureExists(context, '2d rendering context'),
        viewport: viewport,
      });

      renderTask.promise.catch((error) => {
        console.error(error);
      });
    }
  }, [pages]);

  return (
    <div className="viewPDFSolo" ref={hideHeaderRef}>
      <div className="viewPDFSoloWidth" ref={container}></div>
    </div>
  );
}
