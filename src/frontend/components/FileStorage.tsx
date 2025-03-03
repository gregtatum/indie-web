import * as React from 'react';

import './FileStorage.css';
import dedent from 'dedent';
import { $, $$, A, T, Hooks } from 'frontend';

export function FileStorage() {
  const fileStoreServers = $$.getFileStoreServers();
  const { dispatch, getState } = Hooks.useStore();
  const nameRef = React.useRef<null | HTMLInputElement>(null);
  const urlRef = React.useRef<null | HTMLInputElement>(null);
  const { error, setError } = Hooks.useError();

  function addFileServer(event: Event) {
    event.preventDefault();
    setError(null);
    const servers = $.getFileStoreServers(getState());
    const name = nameRef.current?.value;
    const url = urlRef.current?.value;
    const server = validateFileStoreServer(name, url, servers, setError);
    if (server) {
      dispatch(A.addFileStoreServer(server));
    }
  }

  return (
    <div className="page">
      <div className="pageInner">
        <h1>Manage File Storage</h1>
        <FileStorageList fileStoreServers={fileStoreServers} />
        <h2>Add a File Storage Server</h2>
        <p>
          Whether you are accessing files stored locally on your machine, or you
          want to access files on your NAS (Network Attached Storage), you can
          run the file storage server, and mount a folder on a machine you have
          access to.
        </p>

        <h3>1: Start the server</h3>
        <pre className="file-storage-pre">
          {dedent`
              git clone git@github.com:gregtatum/indie-web.git
              cd indie-web/src/server
              npm install
              npm start
          `}
        </pre>
        <p>Follow the installation instructions.</p>

        <h3>2: Add the Server</h3>
        <form onSubmit={(event) => addFileServer(event.nativeEvent)}>
          <div className="file-storage-input">
            <label htmlFor="file-storage-name">File Storage Name</label>
            <input
              type="text"
              id="file-storage-name"
              placeholder="NAS Storage"
              ref={nameRef}
              maxLength={200}
            ></input>
          </div>
          <div className="file-storage-input">
            <label htmlFor="file-storage-name">File Storage Address</label>
            <input
              type="text"
              id="file-storage-name"
              ref={urlRef}
              defaultValue="http://localhost:6543"
            ></input>
          </div>
          {error}
          <button type="submit">Add File Server</button>
        </form>
      </div>
    </div>
  );
}

interface FileStorageListProps {
  fileStoreServers: T.FileStoreServer[];
}

function FileStorageList({ fileStoreServers }: FileStorageListProps) {
  const { dispatch, getState } = Hooks.useStore();
  const { error, setError } = Hooks.useError();

  if (fileStoreServers.length === 0) {
    return null;
  }
  function update(event: Event, oldServer: T.FileStoreServer) {
    event.preventDefault();
    const { target } = event;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const form = target.closest('form');
    if (!form) {
      return;
    }
    const [nameInput, urlInput] = form.querySelectorAll('input');
    const otherServers = $.getFileStoreServers(getState()).filter(
      (server) =>
        server.name !== oldServer.name && server.url !== oldServer.url,
    );
    if (
      oldServer.name === nameInput.value &&
      oldServer.url === urlInput.value
    ) {
      // Nothing changed.
      return;
    }
    const server = validateFileStoreServer(
      nameInput.value,
      urlInput.value,
      otherServers,
      setError,
    );
    if (server) {
      dispatch(A.updateFileStoreServer(oldServer, server));
      dispatch(
        A.addMessage({
          message: <>File store server updated</>,
          timeout: true,
        }),
      );
    }
  }

  return (
    <>
      {error}
      <div className="file-storage-list">
        {fileStoreServers.map(({ name, url }) => (
          <form
            key={name + url}
            onSubmit={(event) => update(event.nativeEvent, { name, url })}
          >
            <input
              type="text"
              defaultValue={name}
              onBlur={(event) => update(event.nativeEvent, { name, url })}
            ></input>
            <input
              type="text"
              defaultValue={url}
              onBlur={(event) => update(event.nativeEvent, { name, url })}
            ></input>
            <input type="submit" style={{ display: 'none' }}></input>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    'Are you sure you want to remove this file store server?',
                  )
                ) {
                  dispatch(A.removeFileStoreServer({ name, url }));
                }
              }}
            >
              Remove
            </button>
          </form>
        ))}
      </div>
    </>
  );
}

function validateFileStoreServer(
  name: string | undefined,
  url: string | undefined,
  servers: T.FileStoreServer[],
  setError: (error: string) => void,
): null | T.FileStoreServer {
  // Make sure all the values are set.
  if (!name) {
    setError('The name of the server must be set');
    return null;
  }
  if (!url) {
    setError('The address of the server must be set');
    return null;
  }

  // Validate the URL.
  try {
    new URL(url);
  } catch {
    url = 'http://' + url;
    try {
      new URL(url);
    } catch {
      setError('The address of the server was not a valid URL.');
      return null;
    }
  }

  if (name.length > 200) {
    setError('The server name should be less than 200 characters.');
    return null;
  }

  if (servers.some((server) => server.name === name)) {
    setError(`Another server already has the name "${name}"`);
    return null;
  }
  const existingURL = servers.find((server) => server.url === url);
  if (existingURL) {
    setError(`The server "${existingURL.name}" already uses that URL.`);
    return null;
  }

  return { name, url };
}
