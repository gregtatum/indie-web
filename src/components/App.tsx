import * as React from 'react';
import { useSelector } from 'react-redux';
import * as $ from 'src/store/selectors';

import './App.css';

export function App() {
  const isInit = useSelector($.getInit);
  if (!isInit) {
    throw new Error('Expected store to be init.');
  }
  return <h1>React is loaded</h1>;
}
