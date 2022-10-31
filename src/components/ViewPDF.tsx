import * as React from 'react';
import { A, $, Hooks } from 'src';

import './ViewPDF.css';
import { ensureExists, UnhandledCaseError } from 'src/utils';
import {
  usePromiseSelector,
  useInfalliblePromise,
  useRetainScroll,
} from '../hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';

export function ViewPDF() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = Hooks.useSelector($.getPath);
  const blob = Hooks.useSelector($.getDownloadBlobCache).get(path);
  const error = Hooks.useSelector($.getDownloadFileErrors).get(path);
  const songTitle = Hooks.useSelector($.getActiveFileSongTitleOrNull);

  React.useEffect(() => {
    if (songTitle) {
      document.title = songTitle;
    } else {
      const parts = path.split('/');
      const file = parts[parts.length - 1];
      document.title = file.replace(/\.pdf$/, '');
    }
  }, [path, songTitle]);

  React.useEffect(() => {
    if (!blob) {
      dispatch(A.downloadBlob(path));
    }
  }, [blob]);

  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  if (!blob) {
    if (error) {
      return (
        <div className="status" ref={swipeDiv}>
          <NextPrevLinks />
          There was an error: {error}
        </div>
      );
    }
    return (
      <div className="status" ref={swipeDiv}>
        <NextPrevLinks />
        Downloading…
      </div>
    );
  }

  return <LoadPDF />;
}

function LoadPDF() {
  const pdf = usePromiseSelector($.getActivePDF);
  switch (pdf.type) {
    case 'fulfilled':
      if (!pdf.value) {
        return <div className="status">Error downloading PDF</div>;
      }
      return <PDF pdf={pdf.value} />;
    case 'pending':
      return <div className="status">Rendering PDF</div>;
    case 'rejected':
      return <div className="status">Error loading PDF</div>;
    default:
      throw new UnhandledCaseError(pdf, 'promise');
  }
}

interface PDFProps {
  pdf: PDFDocumentProxy;
}

function PDF({ pdf }: PDFProps) {
  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  const container = React.useRef<HTMLDivElement | null>(null);
  const getAllPages = React.useMemo(() => {
    const pages = [];
    for (let i = 0; i < pdf.numPages; i++) {
      pages.push(pdf.getPage(i + 1));
    }
    return Promise.all(pages);
  }, [pdf]);
  const pages = useInfalliblePromise(getAllPages);

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
    <div className="viewPDFSolo" data-fullscreen ref={swipeDiv}>
      <NextPrevLinks />
      <div className="viewPDFSoloWidth" ref={container}></div>
    </div>
  );
}
