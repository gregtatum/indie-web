import { render } from '@testing-library/react';
import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { A, T } from 'frontend';
import { AppRoutes } from 'frontend/components/App';
import { createStore } from 'frontend/store/create-store';
import { MusicTestServer } from './server';

interface RenderMusicAppOptions {
  server: MusicTestServer;
  search?: string;
}

export function renderMusicApp({ server, search = '' }: RenderMusicAppOptions) {
  const testServer: T.FileStoreServer = {
    url: server.baseUrl,
    name: 'Test Music',
    id: 'test-music',
    storeType: 'music',
  };

  const store = createStore();
  store.dispatch(A.addFileStoreServer(testServer));

  render(
    <MemoryRouter initialEntries={[`/${testServer.id}/music${search}`]}>
      <Provider store={store as any}>
        <AppRoutes />
      </Provider>
    </MemoryRouter>,
  );

  return { store, testServer };
}

export function mockMusicMediaElement() {
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation();
  jest
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
}
