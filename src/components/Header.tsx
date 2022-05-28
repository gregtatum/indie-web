import * as React from 'react';
import * as Redux from 'react-redux';
import { $, A } from 'src';
import * as Router from 'react-router-dom';

import './Header.css';
import { UnhandledCaseError } from '../utils';

export function Header() {
  const view = Redux.useSelector($.getView);
  const path = Redux.useSelector($.getActiveFileDisplayPath);
  const key = view + path;

  let title = (
    <div className="headerTitle" key={key}>
      <span>🎵</span>
      <span className="headerTitleTitle">Browser Chords</span>
    </div>
  );
  switch (view) {
    case null:
      break;
    case 'settings':
      title = <Path path="/" key={key} title="⚙️ Settings" />;
      break;
    case 'privacy':
      title = <Path path="/" key={key} title="👀 Privacy Policy and Usage" />;
      break;
    case 'view-file':
    case 'view-pdf':
    case 'view-image':
      title = <Path key={key} path={path} />;
      break;
    case 'list-files':
      if (location.pathname !== '/folder' && location.pathname !== '/') {
        title = <Path key={key} path={path} />;
      }
      break;
    default:
      throw new UnhandledCaseError(view, 'View');
  }

  const headerWrapperStyle: React.CSSProperties = {};
  if (Redux.useSelector($.shouldHideHeader)) {
    headerWrapperStyle.transform = 'translateY(var(--header-transform-y))';
  }

  return (
    <div className="headerWrapper" style={headerWrapperStyle}>
      <div className="header">
        <div className="headerStart">{title}</div>
        <div className="headerEnd">
          <SaveFileButton />
          <RequestFullScreen />
          <SettingsButton />
        </div>
      </div>
    </div>
  );
}

function RequestFullScreen() {
  const canGoFullScreen = Redux.useSelector($.canGoFullScreen);
  if (!canGoFullScreen) {
    return null;
  }
  return (
    <button
      type="button"
      className="button"
      onClick={() => {
        const element = document.querySelector('[data-fullscreen]');
        if (!element) {
          console.error('No [data-fullscreen] was found.');
          return;
        }
        if (element.requestFullscreen) {
          element.requestFullscreen();
        }
        if ((element as any).webkitRequestFullscreen) {
          (element as any).webkitRequestFullscreen();
        }
      }}
    >
      Fullscreen
    </button>
  );
}

function SettingsButton() {
  const view = Redux.useSelector($.getView);
  if (view === 'settings') {
    return null;
  }
  return (
    <a href="/settings" className="button headerSettings">
      Settings
    </a>
  );
}

function SaveFileButton() {
  const text = Redux.useSelector($.getModifiedText);
  const view = Redux.useSelector($.getView);
  const dispatch = Redux.useDispatch();
  const path = Redux.useSelector($.getPath);
  const request = Redux.useSelector($.getDownloadFileCache).get(path);

  if (!text || view !== 'view-file' || !request) {
    return null;
  }

  return (
    <button
      className="button headerSaveFile"
      onClick={() => {
        dispatch(A.saveFile(path, text, request));
      }}
    >
      Save
    </button>
  );
}

function Path({ path, title }: { path: string; title?: string }) {
  const songTitle = Redux.useSelector($.getActiveFileSongTitleOrNull);

  const breadcrumbs = [];
  let pathGrow = '';
  const parts = path.split('/');
  const fileName = parts.pop();
  for (const part of parts) {
    if (breadcrumbs.length === 0) {
      breadcrumbs.push(
        <Router.Link key="/" to="/">
          Home
        </Router.Link>,
      );
    } else {
      pathGrow += '/' + part;
      breadcrumbs.push(
        <span key={pathGrow + '»'}>»</span>,
        <Router.Link key={pathGrow} to={`/folder${pathGrow}`}>
          {part}
        </Router.Link>,
      );
    }
  }
  const backParts = path.split('/');
  backParts.pop();

  return (
    <>
      <div className="headerPath headerPathFull" key={'full' + path}>
        <span>🎵</span>
        {breadcrumbs}
        <span>»</span>
        {songTitle ?? fileName ? (
          <span title={fileName}>{songTitle ?? fileName}</span>
        ) : null}
        {title ? <span>{title}</span> : null}
      </div>
      <div className="headerPath headerPathMobile" key={'mobile' + path}>
        <Router.Link
          to={`/folder${backParts.join('/')}`}
          className="headerPathBack"
          aria-label="back"
        ></Router.Link>
      </div>
    </>
  );
}
