import * as React from 'react';
import * as Redux from 'react-redux';
import { $, A } from 'src';
import * as Router from 'react-router-dom';
import { UnlinkDropbox } from './LinkDropbox';

import './Header.css';
import { UnhandledCaseError } from '../utils';

export function Header() {
  const view = Redux.useSelector($.getView);
  const path = Redux.useSelector($.getActiveFileDisplayPath);
  let title = <div className="headerTitle">🎵 Browser Chords</div>;
  switch (view) {
    case 'view-file':
      title = <Path key={path} path={path} />;
      break;
    case 'list-files':
      if (location.pathname !== '/folder' && location.pathname !== '/') {
        title = <Path key={path} path={path} />;
      }
      break;
    case 'link-dropbox':
      break;
    default:
      throw new UnhandledCaseError(view, 'View');
  }

  return (
    <div className="header">
      <div className="headerStart">{title}</div>
      <div className="headerEnd">
        <SaveFileButton />
        <UnlinkDropbox />
      </div>
    </div>
  );
}

function SaveFileButton() {
  const text = Redux.useSelector($.getModifiedText);
  const view = Redux.useSelector($.getView);
  const dispatch = Redux.useDispatch();
  const path = Redux.useSelector($.getActiveFile);
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

function Path({ path }: { path: string }) {
  const songTitle = Redux.useSelector($.getActiveFileSongTitleOrNull);

  const breadcrumbs = [];
  let pathGrow = '';
  const parts = path.split('/');
  const fileName = parts.pop();
  for (const part of parts) {
    if (breadcrumbs.length === 0) {
      breadcrumbs.push(
        <Router.Link key={'/'} to={`/`}>
          home
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
    <div className="headerPath" key={path}>
      <div className="headerPathFull">
        <span>🎵</span>
        {breadcrumbs}
        <span>»</span>
        <span title={fileName}>{songTitle ?? fileName}</span>
      </div>
      <div className="headerPathMobile">
        <Router.Link
          to={`/folder${backParts.join('/')}`}
          className="headerPathBack"
          aria-label="back"
        ></Router.Link>
      </div>
    </div>
  );
}
