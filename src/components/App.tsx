import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, $ } from 'src';
import * as Hooks from 'src/hooks';

import { LinkDropbox } from './LinkDropbox';
import { Header } from './Header';
import { ListFiles } from './ListFiles';
import { ViewChopro } from './ViewChopro';
import { ViewPDF } from './ViewPDF';
import { ViewImage } from './ViewImage';

import { Messages } from './Messages';
import './App.css';
import { UnhandledCaseError } from 'src/utils';
import { Settings, Privacy } from './Page';
import { Menus } from './Menus';

function ListFilesRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Hooks.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewListFiles(path));
  }, [path]);
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
  return (
    <Router.BrowserRouter>
      <Router.Routes>
        <Router.Route path="/" element={<ListFilesRouter />} />
        <Router.Route path="settings" element={<SettingsRouter />} />
        <Router.Route path="privacy" element={<PrivacyRouter />} />
        <Router.Route path="folder" element={<ListFilesRouter />}>
          <Router.Route path="*" element={<ListFilesRouter />} />
        </Router.Route>
        <Router.Route path="file" element={<ViewChoproRouter />}>
          <Router.Route path="*" element={<ViewChoproRouter />} />
        </Router.Route>
        <Router.Route path="pdf" element={<ViewPDFRouter />}>
          <Router.Route path="*" element={<ViewPDFRouter />} />
        </Router.Route>
        <Router.Route path="image" element={<ViewImageRouter />}>
          <Router.Route path="*" element={<ViewImageRouter />} />
        </Router.Route>
      </Router.Routes>
      <LinkDropbox>
        <div className="appView">
          <Header />
          <Views />
        </div>
      </LinkDropbox>
      <Messages />
      <Menus />
    </Router.BrowserRouter>
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
    case 'settings':
      return <Settings key={key} />;
    case 'privacy':
      return <Privacy key={key} />;
    default:
      throw new UnhandledCaseError(view, 'view');
  }
}
