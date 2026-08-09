import * as React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { AppRoutes } from 'frontend/components/App';
import { Connect } from 'frontend/components/Page';
import { persistedState } from 'frontend/logic/persisted-state';
import { createStore } from 'frontend/store/create-store';
import { A } from 'frontend';
import type { FetchMockSandbox } from 'fetch-mock';
import { createFileMetadata, mockServerListFiles } from './utils/fixtures';

beforeEach(() => {
  window.localStorage.clear();
});

describe('Connect', () => {
  function setup() {
    render(
      <MemoryRouter>
        <Provider store={createStore() as any}>
          <Connect />
        </Provider>
      </MemoryRouter>,
    );
  }

  it('does not select Dropbox before Dropbox auth completes', async () => {
    render(
      <MemoryRouter initialEntries={['/connect']}>
        <Provider store={createStore() as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Connect Dropbox' }),
      );
    });

    expect(await screen.findByText('Store Files on Dropbox')).toBeTruthy();
    expect(persistedState.fileStoreName.read()).toBeNull();
  });

  it('selects browser storage when browser storage is chosen', async () => {
    persistedState.fileStoreName.write('dropbox');
    setup();

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: /Use .* Storage/ }),
      );
    });

    expect(persistedState.fileStoreName.read()).toBe('browser');
  });

  it('shows the storage files after adding a storage provider', async () => {
    mockServerListFiles(
      {
        id: 'nas-storage',
        name: 'NAS Storage',
        url: 'http://localhost:6543',
        storeType: 'files',
      },
      [createFileMetadata('/attached-provider-file.md')],
    );

    render(
      <MemoryRouter initialEntries={['/add-storage-provider']}>
        <Provider store={createStore() as any}>
          <AppRoutes />
        </Provider>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('Name'), 'NAS Storage');
    await userEvent.clear(screen.getByLabelText('Server Address'));
    await userEvent.type(
      screen.getByLabelText('Server Address'),
      'http://localhost:6543',
    );

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Connect Folder' }),
      );
    });

    expect(
      await screen.findByRole('link', {
        name: /attached-provider-file\s*\.\s*md/,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Connect a Folder' }),
    ).toBeNull();
    expect(persistedState.fileStoreServers.read()).toEqual([
      {
        id: 'nas-storage',
        name: 'NAS Storage',
        url: 'http://localhost:6543',
        storeType: 'files',
      },
    ]);
    expect(persistedState.fileStoreName.read()).toBe('server');
    expect(persistedState.fileStoreServer.read()).toBe('nas-storage');

    await waitFor(() => {
      expect(
        (window.fetch as FetchMockSandbox).called(
          'http://localhost:6543/file-store/list-files',
        ),
      ).toBe(true);
    });
  });

  it.each([
    {
      name: 'missing name',
      existingServers: [],
      providerName: '',
      providerAddress: 'http://localhost:6543',
      error: /name of the server must be set/,
    },
    {
      name: 'missing address',
      existingServers: [],
      providerName: 'NAS Storage',
      providerAddress: '',
      error: /address of the server must be set/,
    },
    {
      name: 'invalid address',
      existingServers: [],
      providerName: 'NAS Storage',
      providerAddress: 'not a valid url',
      error: /not a valid URL/,
    },
    {
      name: 'duplicate provider name / slug',
      existingServers: [
        {
          id: 'nas-storage',
          name: 'NAS Storage',
          url: 'http://localhost:6543',
          storeType: 'files' as const,
        },
      ],
      providerName: 'NAS Storage',
      providerAddress: 'http://localhost:7654',
      error: /already has that name/,
    },
    {
      name: 'duplicate provider URL',
      existingServers: [
        {
          id: 'nas-storage',
          name: 'NAS Storage',
          url: 'http://localhost:6543',
          storeType: 'files' as const,
        },
      ],
      providerName: 'Other Storage',
      providerAddress: 'http://localhost:6543',
      error: /already uses that URL/,
    },
  ])(
    'blocks state changes for $name',
    async ({ existingServers, providerName, providerAddress, error }) => {
      const store = createStore();
      persistedState.fileStoreName.write('browser');

      for (const server of existingServers) {
        store.dispatch(A.addFileStoreServer(server));
      }

      render(
        <MemoryRouter initialEntries={['/add-storage-provider']}>
          <Provider store={store as any}>
            <AppRoutes />
          </Provider>
        </MemoryRouter>,
      );

      if (providerName) {
        await userEvent.type(screen.getByLabelText('Name'), providerName);
      }
      await userEvent.clear(screen.getByLabelText('Server Address'));
      if (providerAddress) {
        await userEvent.type(
          screen.getByLabelText('Server Address'),
          providerAddress,
        );
      }

      await act(async () => {
        await userEvent.click(
          screen.getByRole('button', { name: 'Connect Folder' }),
        );
      });

      expect(await screen.findByText(error)).toBeTruthy();
      expect(
        screen.getByRole('heading', { name: /Connect a Folder/ }),
      ).toBeTruthy();
      expect(persistedState.fileStoreServers.read()).toEqual(existingServers);
      expect(persistedState.fileStoreName.read()).toBe('browser');
      expect(persistedState.fileStoreServer.read()).toBeNull();
      expect((window.fetch as FetchMockSandbox).calls()).toHaveLength(0);
    },
  );
});
