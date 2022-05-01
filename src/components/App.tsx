import * as React from 'react';
import { DropboxExpired, LinkDropbox } from './LinkDropbox';
import { Header } from './Header';

import './App.css';
import { ListFiles } from './ListFiles';
import { ViewFile } from './ViewFile';
import { ViewPDF } from './ViewPDF';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Messages } from './Messages';

export function App() {
  return (
    <BrowserRouter>
      <LinkDropbox>
        <div className="appView">
          <Header />
          <div className="appViewContents">
            <Routes>
              <Route path="/" element={<ListFiles />} />
              <Route path="folder" element={<ListFiles />}>
                <Route path="*" element={<ListFiles />} />
              </Route>
              <Route path="file" element={<ViewFile />}>
                <Route path="*" element={<ViewFile />} />
              </Route>
              <Route path="pdf" element={<ViewPDF />}>
                <Route path="*" element={<ViewPDF />} />
              </Route>
              <Route path="expired" element={<DropboxExpired />} />
            </Routes>
          </div>
        </div>
      </LinkDropbox>
      <Messages />
    </BrowserRouter>
  );
}
