import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, $ } from 'src';
import * as Hooks from 'src/hooks';

import { LinkDropbox } from './LinkDropbox';
import { LinkS3 } from './LinkS3';
import { Header } from './Header';
import { ListFiles } from './ListFiles';
import { ViewChopro } from './ViewChopro';
import { ViewPDF } from './ViewPDF';
import { ViewImage } from './ViewImage';
import { ViewMarkdown } from './ViewMarkdown';

import { Messages } from './Messages';
import { UnhandledCaseError } from 'src/utils';
import { Settings, Privacy } from './Page';
import { useFilesIndex } from 'src/logic/files-index';

import './App.css';
import { toFileSystemName } from 'src/logic/app-logic';

function ListFilesRouter() {
  const currentFileSystemName = Hooks.useSelector($.getCurrentFileSystemName);
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const { fs } = params;
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    const fileSystemName = toFileSystemName(fs) ?? currentFileSystemName;
    dispatch(A.viewListFiles(fileSystemName, path));
  }, [fs, path, currentFileSystemName]);
  return null;
}

function ViewChoproRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewFile(path));
  }, [path]);
  return null;
}

function ViewPDFRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewPDF(path));
  }, [path]);
  return null;
}

function ViewImageRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewImage(path));
  }, [path]);
  return null;
}

function ViewMarkdownRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewMarkdown(path));
  }, [path]);
  return null;
}

function SettingsRouter() {
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewSettings());
  });
  return null;
}

function PrivacyRouter() {
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewPrivacy());
  });
  return null;
}

export function App() {
  useFilesIndex();
  return (
    <Router.BrowserRouter>
      <AppRoutes />
    </Router.BrowserRouter>
  );
}

export function AppRoutes() {
  return (
    <>
      <Router.Routes>
        <Router.Route path="/" element={<ListFilesRouter />} />
        <Router.Route path="settings" element={<SettingsRouter />} />
        <Router.Route path="privacy" element={<PrivacyRouter />} />
        <Router.Route path="/:fs/folder" element={<ListFilesRouter />}>
          <Router.Route path="*" element={<ListFilesRouter />} />
        </Router.Route>
        <Router.Route path="/:fs/file" element={<ViewChoproRouter />}>
          <Router.Route path="*" element={<ViewChoproRouter />} />
        </Router.Route>
        <Router.Route path="/:fs/pdf" element={<ViewPDFRouter />}>
          <Router.Route path="*" element={<ViewPDFRouter />} />
        </Router.Route>
        <Router.Route path="/:fs/image" element={<ViewImageRouter />}>
          <Router.Route path="*" element={<ViewImageRouter />} />
        </Router.Route>
        <Router.Route path="/:fs/md" element={<ViewMarkdownRouter />}>
          <Router.Route path="*" element={<ViewMarkdownRouter />} />
        </Router.Route>
      </Router.Routes>
      <LinkServices>
        <MainView>
          <Views />
        </MainView>
      </LinkServices>
      <Messages />
    </>
  );
}

function LinkServices({ children }: { children: any }) {
  const fileSystemName = Hooks.useSelector($.getCurrentFileSystemName);
  switch (fileSystemName) {
    case 'dropbox':
      return <LinkDropbox>{children}</LinkDropbox>;
    case 's3':
      return <LinkS3>{children}</LinkS3>;
    case 'browser':
      return children;
    default:
      throw new UnhandledCaseError(fileSystemName, 'fileSystemName');
  }
}
/**
 * The main view of the app with a header and view area.
 */
export function MainView(props: { children: any }) {
  return (
    <div className="appView">
      <Header />
      {props.children}
    </div>
  );
}

function Views() {
  const view = Hooks.useSelector($.getView);
  const path = Hooks.useSelector($.getPath);
  const key = (view ?? '') + path;
  switch (view) {
    case null:
      return null;
    case 'list-files':
      return <ListFiles key={key} />;
    case 'view-file':
      return <ViewChopro key={key} />;
    case 'view-pdf':
      return <ViewPDF key={key} />;
    case 'view-image':
      return <ViewImage key={key} />;
    case 'view-markdown':
      return <ViewMarkdown key={key} />;
    case 'settings':
      return <Settings key={key} />;
    case 'privacy':
      return <Privacy key={key} />;
    default:
      throw new UnhandledCaseError(view, 'view');
  }
}
