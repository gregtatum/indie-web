import * as React from 'react';
import { LinkDropbox, UnlinkDropbox } from './LinkDropbox';

import './App.css';
import { ListFiles } from './ListFiles';

export function App() {
  return (
    <LinkDropbox>
      <p>
        <UnlinkDropbox />
      </p>
      <p>Your dropbox is linked!</p>
      <ListFiles />
    </LinkDropbox>
  );
}
