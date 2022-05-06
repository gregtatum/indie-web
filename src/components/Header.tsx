import * as React from 'react';
import * as Redux from 'react-redux';
import { $ } from 'src';
import * as Router from 'react-router-dom';
import { UnlinkDropbox } from './LinkDropbox';

import './Header.css';
import { UnhandledCaseError } from '../utils';

export function Header() {
  const view = Redux.useSelector($.getView);
  let title = <div className="headerTitle">🎵 Browser Chords</div>;
  switch (view) {
    case 'view-file':
      title = <ActiveFile />;
      break;
    case 'list-files':
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
        <UnlinkDropbox />
      </div>
    </div>
  );
}

function ActiveFile() {
  const path = Redux.useSelector($.getActiveFile);
  const songTitle = Redux.useSelector($.getActiveFileSongTitleOrNull);
  const modifiedText = Redux.useSelector($.getModifiedText);

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
        <>
          <span>»</span>
          <Router.Link key={pathGrow} to={`/folder${pathGrow}`}>
            {part}
          </Router.Link>
        </>,
      );
    }
  }
  return (
    <div className="headerActiveFile" key={path}>
      <span>🎵</span>
      {breadcrumbs}
      <span>»</span>
      <span title={fileName}>{songTitle ?? fileName}</span>
      {modifiedText ? (
        <span className="headerActiveFileModified">modified</span>
      ) : null}
    </div>
  );
}
