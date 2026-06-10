import {
  clearAllLocalStorageForUserDataRemoval,
  localStorageEntries,
} from 'frontend/logic/local-storage';

beforeEach(() => {
  clearAllLocalStorageForUserDataRemoval();
});

describe('localStorageEntries', () => {
  it('round-trips structured JSON values', () => {
    localStorageEntries.dropboxOauth.write({
      accessToken: 'access',
      refreshToken: 'refresh',
      expires: 123,
    });

    expect(localStorageEntries.dropboxOauth.read()).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expires: 123,
    });
  });

  it('returns defaults for malformed JSON', () => {
    window.localStorage.setItem(localStorageEntries.dropboxOauth.key, '{');

    expect(localStorageEntries.dropboxOauth.read()).toBeNull();
  });

  it('returns defaults for structurally invalid JSON', () => {
    window.localStorage.setItem(
      localStorageEntries.dropboxOauth.key,
      JSON.stringify({ accessToken: 'access' }),
    );

    expect(localStorageEntries.dropboxOauth.read()).toBeNull();
  });

  it('keeps file store server migration parsing centralized', () => {
    window.localStorage.setItem(
      localStorageEntries.fileStoreServers.key,
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

    expect(localStorageEntries.fileStoreServers.read()).toEqual([
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
    localStorageEntries.fileStoreServer.write('server-id');
    localStorageEntries.hasOnboarded.write(true);
    localStorageEntries.splitterOffset('testSplitterOffset').write(12.5);

    expect(localStorageEntries.fileStoreServer.read()).toBe('server-id');
    expect(localStorageEntries.hasOnboarded.read()).toBe(true);
    expect(
      localStorageEntries.splitterOffset('testSplitterOffset').read(),
    ).toBe(12.5);
  });

  it('returns null for invalid scalar values', () => {
    window.localStorage.setItem(localStorageEntries.hasOnboarded.key, 'maybe');
    window.localStorage.setItem('testSplitterOffset', 'wide');

    expect(localStorageEntries.hasOnboarded.read()).toBeNull();
    expect(
      localStorageEntries.splitterOffset('testSplitterOffset').read(),
    ).toBe(null);
  });

  it('validates music playback resume structurally', () => {
    localStorageEntries.musicPlaybackResume.write({
      serverId: 'test-music',
      serverUrl: 'http://music.test',
      trackPath: '/music/a.mp3',
      currentTime: 15,
      updatedAt: 123,
    });

    expect(localStorageEntries.musicPlaybackResume.read()).toEqual({
      serverId: 'test-music',
      serverUrl: 'http://music.test',
      trackPath: '/music/a.mp3',
      currentTime: 15,
      updatedAt: 123,
    });
  });

  it('clears all localStorage for user data removal flows', () => {
    localStorageEntries.fileStoreServer.write('server-id');
    window.localStorage.setItem('unregisteredKey', 'value');

    clearAllLocalStorageForUserDataRemoval();

    expect(localStorageEntries.fileStoreServer.read()).toBeNull();
    expect(window.localStorage.getItem('unregisteredKey')).toBeNull();
  });
});
