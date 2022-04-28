import * as React from 'react';
import { LinkDropbox, HandleAuth } from './LinkDropbox';
import { Header } from './Header';

import './App.css';
import { ListFiles } from './ListFiles';
import { ViewFile } from './ViewFile';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

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
            </Routes>
          </div>
        </div>
      </LinkDropbox>
    </BrowserRouter>
  );
}
