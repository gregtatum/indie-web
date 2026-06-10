import {
  clearAllLocalStorageForUserDataRemoval,
  persistedState,
} from 'frontend/logic/persisted-state';

beforeEach(() => {
  clearAllLocalStorageForUserDataRemoval();
});

describe('localStorageEntries', () => {
  it('round-trips structured JSON values', () => {
    persistedState.dropboxOauth.write({
      accessToken: 'access',
      refreshToken: 'refresh',
      expires: 123,
    });

    expect(persistedState.dropboxOauth.read()).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expires: 123,
    });
  });

  it('returns defaults for malformed JSON', () => {
    window.localStorage.setItem(persistedState.dropboxOauth.key, '{');

    expect(persistedState.dropboxOauth.read()).toBeNull();
  });

  it('returns defaults for structurally invalid JSON', () => {
    window.localStorage.setItem(
      persistedState.dropboxOauth.key,
      JSON.stringify({ accessToken: 'access' }),
    );

    expect(persistedState.dropboxOauth.read()).toBeNull();
  });

  it('keeps file store server migration parsing centralized', () => {
    window.localStorage.setItem(
      persistedState.fileStoreServers.key,
      JSON.stringify([
        { url: 'http://files.test', name: 'Files Test' },
        {
          url: 'http://music.test',
          name: 'Music Test',
          id: 'music-test',
          storeType: 'music',
        },
      ]),
    );

    expect(persistedState.fileStoreServers.read()).toEqual([
      {
        url: 'http://files.test',
        name: 'Files Test',
        id: 'files-test',
        storeType: 'files',
      },
      {
        url: 'http://music.test',
        name: 'Music Test',
        id: 'music-test',
        storeType: 'music',
      },
    ]);
  });

  it('round-trips scalar values', () => {
    persistedState.fileStoreServer.write('server-id');
    persistedState.hasOnboarded.write(true);
    persistedState.splitterOffset('testSplitterOffset').write(12.5);

    expect(persistedState.fileStoreServer.read()).toBe('server-id');
    expect(persistedState.hasOnboarded.read()).toBe(true);
    expect(persistedState.splitterOffset('testSplitterOffset').read()).toBe(
      12.5,
    );
  });

  it('returns null for invalid scalar values', () => {
    window.localStorage.setItem(persistedState.hasOnboarded.key, 'maybe');
    window.localStorage.setItem('testSplitterOffset', 'wide');

    expect(persistedState.hasOnboarded.read()).toBeNull();
    expect(persistedState.splitterOffset('testSplitterOffset').read()).toBe(
      null,
    );
  });

  it('validates music playback resume structurally', () => {
    persistedState.musicPlaybackResume.write({
      serverId: 'test-music',
      serverUrl: 'http://music.test',
      trackPath: '/music/a.mp3',
      currentTime: 15,
      updatedAt: 123,
    });

    expect(persistedState.musicPlaybackResume.read()).toEqual({
      serverId: 'test-music',
      serverUrl: 'http://music.test',
      trackPath: '/music/a.mp3',
      currentTime: 15,
      updatedAt: 123,
    });
  });

  it('clears all localStorage for user data removal flows', () => {
    persistedState.fileStoreServer.write('server-id');
    window.localStorage.setItem('unregisteredKey', 'value');

    clearAllLocalStorageForUserDataRemoval();

    expect(persistedState.fileStoreServer.read()).toBeNull();
    expect(window.localStorage.getItem('unregisteredKey')).toBeNull();
  });
});
