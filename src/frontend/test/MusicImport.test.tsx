import { fireEvent, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'frontend';
import {
  buildMp3WithTags,
  clearMusicMount,
  renderMusicApp,
  useMusicTestServer,
  waitForNetworkIdle,
} from './utils/music';

const jestDescribe = globalThis.describe;
let describe: (name: string, fn: () => void) => void = jestDescribe;
if (process.env.INDIE_WEB_SKIP_LOCALHOST_TESTS === '1') {
  describe = (name) => {
    process.stderr.write(`LOCALHOST_BIND_SKIPPED_TEST ${name}\n`);
  };
  it.skip('localhost-dependent tests skipped by check runner', () => {});
}

function makeDataTransfer(files: File[]): DataTransfer {
  return {
    files,
    types: ['Files'],
    items: [],
    setData: () => {},
    getData: () => '',
    clearData: () => {},
  } as unknown as DataTransfer;
}

/**
 * Covers the whole drag-and-drop import & organize feature (see
 * ORGANIZE_IMPORT_PLAN.md) in one file, nested by phase, rather than one
 * file per screen — this is a single feature with one end-to-end flow.
 */
describe('drag-and-drop import & organize', () => {
  const { getServer } = useMusicTestServer();

  afterEach(async () => {
    await clearMusicMount(getServer());
  });

  async function dropZone(): Promise<HTMLElement> {
    return waitFor(() => {
      const el = document.querySelector<HTMLElement>('.musicLibraryView');
      if (!el) {
        throw new Error('.musicLibraryView not rendered yet');
      }
      return el;
    });
  }

  describe('dropping MP3s onto the library view', () => {
    it('stages dropped MP3s and populates the import batch', async () => {
      const { store } = await renderMusicApp({ server: getServer() });
      const zone = await dropZone();

      const file = new File(
        [
          new Uint8Array(
            buildMp3WithTags({ title: 'Time', artist: 'Pink Floyd' }),
          ),
        ],
        'time.mp3',
        { type: 'audio/mpeg' },
      );
      const dataTransfer = makeDataTransfer([file]);

      await act(async () => {
        fireEvent.drop(zone, { dataTransfer });
        await waitForNetworkIdle();
      });

      await screen.findByText(/Staged 1 track/);

      const batch = $.getMusicImportBatch(store.getState());
      expect(batch?.tracks).toHaveLength(1);
      expect(batch?.tracks[0].title).toBe('Time');
      expect(batch?.tracks[0].artist).toBe('Pink Floyd');

      const stagingRoot = join(getServer().mountDir, '.music-staging');
      const batchDirs = await readdir(stagingRoot);
      expect(batchDirs).toHaveLength(1);
      const stagedFiles = await readdir(join(stagingRoot, batchDirs[0]));
      expect(stagedFiles).toEqual(['batch.json', 'time.mp3']);
    });

    it('rejects non-MP3 files with a message and stages nothing', async () => {
      await renderMusicApp({ server: getServer() });
      const zone = await dropZone();

      const file = new File(['not audio'], 'notes.txt', {
        type: 'text/plain',
      });
      const dataTransfer = makeDataTransfer([file]);

      await act(async () => {
        fireEvent.drop(zone, { dataTransfer });
        await waitForNetworkIdle();
      });

      await screen.findByText(/Only \.mp3 files can be imported/);

      const stagingRoot = join(getServer().mountDir, '.music-staging');
      await expect(readdir(stagingRoot)).rejects.toThrow();
    });
  });

  // Staged batch-edit screen (Phase 2), organize screen (Phase 3), and
  // commit (Phase 4) tests land here as nested `describe`s, once those
  // screens exist.
});
