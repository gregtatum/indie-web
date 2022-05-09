import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { A, $ } from 'src';

import { LinkDropbox } from './LinkDropbox';
import { Header } from './Header';
import { ListFiles } from './ListFiles';
import { ViewChopro } from './ViewChopro';
import { ViewPDF } from './ViewPDF';

import { Messages } from './Messages';
import './App.css';
import { UnhandledCaseError } from 'src/utils';

function ListFilesRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Redux.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewListFiles(path));
  }, [path]);
  return null;
}

function ViewChoproRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Redux.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewFile(path));
  }, [path]);
  return null;
}

function ViewPDFRouter() {
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const dispatch = Redux.useDispatch();
  React.useEffect(() => {
    dispatch(A.viewPDF(path));
  }, [path]);
  return null;
}

export function App() {
  return (
    <Router.BrowserRouter>
      <Router.Routes>
        <Router.Route path="/" element={<ListFilesRouter />} />
        <Router.Route path="folder" element={<ListFilesRouter />}>
          <Router.Route path="*" element={<ListFilesRouter />} />
        </Router.Route>
        <Router.Route path="file" element={<ViewChoproRouter />}>
          <Router.Route path="*" element={<ViewChoproRouter />} />
        </Router.Route>
        <Router.Route path="pdf" element={<ViewPDFRouter />}>
          <Router.Route path="*" element={<ViewPDFRouter />} />
        </Router.Route>
      </Router.Routes>
      <LinkDropbox>
        <div className="appView">
          <Header />
          <div className="appViewContents">
            <Views />
          </div>
        </div>
      </LinkDropbox>
      <Messages />
    </Router.BrowserRouter>
  );
}

function Views() {
  const view = Redux.useSelector($.getView);
  const path = Redux.useSelector($.getPath);
  switch (view) {
    case null:
      return null;
    case 'list-files':
      return <ListFiles key={path} />;
    case 'view-file':
      return <ViewChopro key={path} />;
    case 'view-pdf':
      return <ViewPDF key={path} />;
    default:
      throw new UnhandledCaseError(view, 'view');
  }
}
