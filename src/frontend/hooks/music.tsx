import * as React from 'react';
import { A, $$, Hooks, T } from 'frontend';
import { getDirName, getKeyboardString } from 'frontend/utils';
import type { WriteFolderArtworkResponse } from 'shared/@types/shared';
import type { MusicTrackSource } from 'frontend/logic/music/metadata';

/**
 * Pick the artwork file out of a drop. Only a single image applies cleanly —
 * a blank MIME type is still allowed through (the server validates the bytes),
 * but multiple files or a single non-image file are reported as an error so
 * the caller can tell the user why nothing happened.
 */
export function artworkFileFromDrop(
  dataTransfer: DataTransfer | null,
): { file: File } | { error: string } {
  const files = Array.from(dataTransfer?.files ?? []);
  if (files.length === 0) {
    return { error: 'No image found in the drop.' };
  }
  if (files.length > 1) {
    return { error: 'Drop a single image to set the folder artwork.' };
  }
  const [file] = files;
  if (file.type && !file.type.startsWith('image/')) {
    return { error: "That doesn't look like an image file." };
  }
  return { file };
}

async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  // readEntries only returns a batch at a time — call it until it's empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) {
      break;
    }
    entries.push(...batch);
  }
  return entries;
}

async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [file];
  }
  if (entry.isDirectory) {
    const entries = await readAllDirectoryEntries(
      (entry as FileSystemDirectoryEntry).createReader(),
    );
    const nested = await Promise.all(entries.map(collectFilesFromEntry));
    return nested.flat();
  }
  return [];
}

/**
 * Flattens a drop's files, recursing into any dropped folders (e.g. an album
 * folder dragged straight from Finder) via the FileSystem Entry API so
 * non-MP3 siblings — cover art, playlists, `.DS_Store` — don't block the
 * drop. Falls back to `dataTransfer.files` when entries aren't available
 * (older browsers, or a test's synthetic DataTransfer).
 */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer | null,
): Promise<File[]> {
  if (!dataTransfer) {
    return [];
  }
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length === 0) {
    return Array.from(dataTransfer.files ?? []);
  }

  const nested = await Promise.all(entries.map(collectFilesFromEntry));
  return nested.flat();
}

/**
 * Pull an image off the async clipboard. Mirrors `artworkFileFromDrop`: it takes
 * the first image the clipboard offers. Returns null when the clipboard holds no
 * image, or the read is unavailable/denied — no permission, the document isn't
 * focused, or an older browser without `navigator.clipboard.read`.
 */
export async function artworkBlobFromClipboard(): Promise<Blob | null> {
  if (!navigator.clipboard?.read) {
    return null;
  }
  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch {
    return null;
  }
  for (const item of items) {
    const type = item.types.find((entry) => entry.startsWith('image/'));
    if (type) {
      try {
        return await item.getType(type);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * POST an image to `/music/artwork` (or, with no body, promote a track's
 * embedded picture) and track the shared save status. `onSaved` is called with
 * the written folder-artwork path once the write succeeds.
 */
export function useFolderArtworkSave(
  serverUrl: string,
  onSaved: (folderArtworkPath: string) => void,
) {
  const dispatch = Hooks.useDispatch();
  const saveStatus = $$.getMusicFolderArtworkSaveStatus();
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    if (saveStatus === 'idle') {
      setActive(false);
    }
  }, [saveStatus]);

  const save = React.useCallback(
    (trackPath: string, body?: { data: Blob; contentType: string }) => {
      setActive(true);
      dispatch(A.musicFolderArtworkSaveStart());
      fetch(
        `${serverUrl}/music/artwork?path=${encodeURIComponent(trackPath)}`,
        body
          ? {
              method: 'POST',
              headers: { 'Content-Type': body.contentType },
              body: body.data,
            }
          : { method: 'POST' },
      )
        .then((res) => {
          if (!res.ok) {
            return res.text().then((t) => {
              throw new Error(t || `${res.status}`);
            });
          }
          return res.json() as Promise<WriteFolderArtworkResponse>;
        })
        .then((data) => {
          if (data.folderArtworkPath) {
            onSaved(data.folderArtworkPath);
          }
          dispatch(A.musicFolderArtworkSaveSuccess());
        })
        .catch(() => dispatch(A.musicFolderArtworkSaveError()));
    },
    [dispatch, serverUrl, onSaved],
  );

  return { saveStatus, active, save };
}

/**
 * Returns a callback that patches the in-memory music index so every track in
 * the written folder carries `folderArtworkPath`. The folder-artwork write does
 * not touch the server's index, so this keeps the library and edit views
 * current until the next scan.
 */
export function useMusicIndexFolderArtworkPatch() {
  const dispatch = Hooks.useDispatch();
  const tracks = $$.getMusicTracks();
  const needsRescan = $$.getMusicNeedsRescan();
  const servedIndexVersion = $$.getMusicServedIndexVersion();

  return React.useCallback(
    (folderArtworkPath: string) => {
      const folderDir = getDirName(folderArtworkPath);
      dispatch(
        A.setMusicTracks(
          tracks.map((track) =>
            getDirName(track.path) === folderDir
              ? { ...track, folderArtworkPath }
              : track,
          ),
          needsRescan,
          servedIndexVersion,
        ),
      );
    },
    [dispatch, tracks, needsRescan, servedIndexVersion],
  );
}

export function useMusicIndexFolderArtworkClear() {
  const dispatch = Hooks.useDispatch();
  const tracks = $$.getMusicTracks();
  const needsRescan = $$.getMusicNeedsRescan();
  const servedIndexVersion = $$.getMusicServedIndexVersion();

  return React.useCallback(
    (folderDir: string) => {
      dispatch(
        A.setMusicTracks(
          tracks.map((track) =>
            getDirName(track.path) === folderDir && track.folderArtworkPath
              ? { ...track, folderArtworkPath: null }
              : track,
          ),
          needsRescan,
          servedIndexVersion,
        ),
      );
    },
    [dispatch, tracks, needsRescan, servedIndexVersion],
  );
}

export function useFolderArtworkRemove(
  serverUrl: string,
  onRemoved?: () => void,
) {
  const dispatch = Hooks.useDispatch();
  const removeStatus = $$.getMusicFolderArtworkRemoveStatus();
  const clearIndex = useMusicIndexFolderArtworkClear();
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    if (removeStatus === 'idle') {
      setActive(false);
    }
  }, [removeStatus]);

  const remove = React.useCallback(
    (trackPath: string) => {
      setActive(true);
      dispatch(A.musicFolderArtworkRemoveStart());
      fetch(
        `${serverUrl}/music/artwork/remove?path=${encodeURIComponent(trackPath)}`,
        { method: 'POST' },
      )
        .then((res) => {
          if (!res.ok) {
            return res.text().then((t) => {
              throw new Error(t || `${res.status}`);
            });
          }
          return res.json();
        })
        .then(() => {
          clearIndex(getDirName(trackPath));
          onRemoved?.();
          dispatch(A.musicFolderArtworkRemoveSuccess());
        })
        .catch(() => dispatch(A.musicFolderArtworkRemoveError()));
    },
    [dispatch, serverUrl, clearIndex, onRemoved],
  );

  return { removeStatus, active, remove };
}

interface FolderArtworkDropOptions {
  /** A track in the target folder; the written Folder.jpg lands beside it. */
  trackPath: string | null;
  serverUrl: string;
  /** When false, drags are ignored (no drop target, no `dragging` class). */
  canEdit?: boolean;
  /** Extra work after the write, on top of the in-memory index patch. */
  onSaved?: (folderArtworkPath: string) => void;
}

/**
 * Wires drag-and-drop of an image file onto an element so it becomes the folder
 * artwork for `trackPath`'s folder. Attach the returned `ref` to the drop
 * target; `dragging` is true while a valid file is hovering (the shared
 * Hooks.useFileDrop also toggles a `dragging` class on the element for styling).
 */
export function useFolderArtworkDrop({
  trackPath,
  serverUrl,
  canEdit = true,
  onSaved,
}: FolderArtworkDropOptions) {
  const ref = React.useRef<HTMLDivElement>(null);
  const dispatch = Hooks.useDispatch();
  const patchIndex = useMusicIndexFolderArtworkPatch();

  const handleSaved = React.useCallback(
    (folderArtworkPath: string) => {
      patchIndex(folderArtworkPath);
      onSaved?.(folderArtworkPath);
    },
    [patchIndex, onSaved],
  );

  const { saveStatus, save } = useFolderArtworkSave(serverUrl, handleSaved);

  const onDrop = React.useCallback(
    (event: DragEvent) => {
      if (!trackPath) {
        return;
      }
      const result = artworkFileFromDrop(event.dataTransfer);
      if ('error' in result) {
        dispatch(A.addMessage({ message: result.error, timeout: true }));
        return;
      }
      save(trackPath, {
        data: result.file,
        contentType: result.file.type || 'image/jpeg',
      });
    },
    [dispatch, save, trackPath],
  );

  const canAcceptDrop = React.useCallback(
    (event: DragEvent) =>
      canEdit &&
      !!trackPath &&
      saveStatus !== 'saving' &&
      Array.from(event.dataTransfer?.types ?? []).includes('Files'),
    [canEdit, trackPath, saveStatus],
  );

  const dragging = Hooks.useFileDrop(ref, onDrop, canAcceptDrop);

  return { ref, dragging, saveStatus };
}

interface FolderArtworkPasteOptions {
  trackPath: string | null;
  canEdit?: boolean;
  isActive?: () => boolean;
  onSaved?: (folderArtworkPath: string) => void;
}

export function useFolderArtworkPaste({
  trackPath,
  canEdit = true,
  isActive,
  onSaved,
}: FolderArtworkPasteOptions) {
  const serverUrl = $$.getCurrentServer().url;
  const patchIndex = useMusicIndexFolderArtworkPatch();

  const { saveStatus, save } = useFolderArtworkSave(
    serverUrl,
    (folderArtworkPath) => {
      patchIndex(folderArtworkPath);
      onSaved?.(folderArtworkPath);
    },
  );

  const latest = React.useRef({
    trackPath,
    canEdit,
    isActive,
    saveStatus,
    save,
  });
  latest.current = { trackPath, canEdit, isActive, saveStatus, save };

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const shortcut = getKeyboardString(event);
      if (shortcut !== 'Meta+V' && shortcut !== 'Control+V') {
        return;
      }
      const current = latest.current;
      if (
        !current.canEdit ||
        !current.trackPath ||
        current.saveStatus === 'saving' ||
        (current.isActive && !current.isActive())
      ) {
        return;
      }
      event.preventDefault();
      const targetPath = current.trackPath;
      artworkBlobFromClipboard()
        .then((blob) => {
          if (blob) {
            current.save(targetPath, {
              data: blob,
              contentType: blob.type || 'image/jpeg',
            });
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }

    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return { saveStatus };
}

/**
 * A track source backed by the real, indexed music library.
 */
export function useMusicLibraryTrackSource(): MusicTrackSource {
  const dispatch = Hooks.useDispatch();
  const tracks = $$.getMusicTracks();
  const needsRescan = $$.getMusicNeedsRescan();
  const servedIndexVersion = $$.getMusicServedIndexVersion();

  return React.useMemo(
    () => ({
      tracks,
      updateTracks: (nextTracks: T.TrackMetadata[]) => {
        dispatch(A.setMusicTracks(nextTracks, needsRescan, servedIndexVersion));
      },
    }),
    [dispatch, tracks, needsRescan, servedIndexVersion],
  );
}

/**
 * A track source backed by the flat drag-and-drop staging pool, rather than
 * the real music index.
 */
export function useMusicStagingPoolTrackSource(): MusicTrackSource {
  const dispatch = Hooks.useDispatch();
  const tracks = $$.getMusicStagingPool();

  return React.useMemo(
    () => ({
      tracks,
      updateTracks: (nextTracks: T.TrackMetadata[]) => {
        dispatch(A.setMusicStagingPool(nextTracks));
      },
      removeTracks: (paths: string[]) => {
        void dispatch(A.removeMusicStagingPoolTracks(paths));
      },
    }),
    [dispatch, tracks],
  );
}
