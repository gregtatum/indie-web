import * as React from 'react';
// import { useSelector } from 'react-redux';
// import * as $ from 'src/store/selectors';
import { LinkDropbox, UnlinkDropbox } from './LinkDropbox';

import './App.css';

export function App() {
  return (
    <LinkDropbox>
      <p>
        <UnlinkDropbox />
      </p>
      <p>Your dropbox is linked!</p>
    </LinkDropbox>
  );
}
