import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, $, $$, T } from 'src';
import * as Hooks from 'src/hooks';

import { LinkDropbox } from './LinkDropbox';
import { Header } from './Header';
import { ListFiles } from './ListFiles';
import { ViewChopro } from './ViewChopro';
import { ViewPDF } from './ViewPDF';
import { ViewImage } from './ViewImage';
import { ViewMarkdown } from './ViewMarkdown';

import { Messages } from './Messages';
import { ensureNever, UnhandledCaseError } from 'src/utils';
import { Settings, Privacy } from './Page';
import { useFilesIndex } from 'src/logic/files-index';

import './App.css';
import { toFileSystemName } from 'src/logic/app-logic';
import { LanguageCoach } from './LanguageCoach';

function ListFilesRouter() {
  const currentFileSystemName = $$.getCurrentFileSystemName();
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

function toValidLanguageCoachSection(value: unknown): T.LanguageCoachSection {
  if (typeof value === 'string') {
    const view = value as T.LanguageCoachSection;
    switch (view) {
      case 'home':
        return view;
      case 'study-list':
        return view;
      case 'reading':
        return view;
      case 'learned':
        return view;
      default:
        ensureNever(view);
    }
  }
  return 'home';
}

function LanguageCoachRouter() {
  const params = Router.useParams();
  const [urlParams] = Router.useSearchParams();
  const section = toValidLanguageCoachSection(urlParams.get('section'));
  const path = '/' + (params['*'] ?? '');
  const { dispatch, getState } = Hooks.useStore();

  // Determine the path to the root part of the language coach.
  // e.g. /French.coach/reading/File.txt -> /French.coach
  const pathParts = path.split('/');
  const coachPartIndex = pathParts.findIndex((pathPart) =>
    pathPart.endsWith('.coach'),
  );
  const coachPath = pathParts.slice(0, coachPartIndex + 1).join('/');

  React.useEffect(() => {
    const invalidateOldData = $.getLanguageCoachPath(getState()) !== coachPath;
    dispatch(A.viewLanguageCoach(coachPath, path, invalidateOldData));
  }, [path]);

  React.useEffect(() => {
    dispatch(A.setLanguageCoachSection(section, coachPath, path));
  }, [section, path]);

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
        <Router.Route
          path="/:fs/language-coach"
          element={<LanguageCoachRouter />}
        >
          <Router.Route path="*" element={<LanguageCoachRouter />} />
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
      <LinkDropbox>
        <MainView>
          <Views />
        </MainView>
      </LinkDropbox>
      <Messages />
    </>
  );
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
  const view = $$.getView();
  const path = $$.getPath();
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
    case 'language-coach':
      return <LanguageCoach key={key} />;
    default:
      throw new UnhandledCaseError(view, 'view');
  }
}
