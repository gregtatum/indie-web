import { T } from 'src';
import { SongKey } from 'src/logic/parse';

export function removeDropboxAccessToken(): { type: 'remove-dropbox-oauth' } {
  localStorage.clear();
  return { type: 'remove-dropbox-oauth' as const };
}

export function setDropboxAccessToken(
  accessToken: string,
  expiresIn: number,
  refreshToken: string,
) {
  // Convert the expires into milliseconds, and end it at 90% of the time.
  const expires = Date.now() + expiresIn * 1000 * 0.9;

  const oauth: T.DropboxOauth = {
    accessToken,
    expires,
    refreshToken,
  };
  window.localStorage.setItem('dropboxOauth', JSON.stringify(oauth));

  return {
    type: 'set-dropbox-oauth' as const,
    oauth,
  };
}

export function draggingSplitter(isDragging: boolean) {
  return { type: 'dragging-splitter' as const, isDragging };
}

export function clearApiCache() {
  return { type: 'clear-api-cache' as const };
}

export function changeActiveFile(path: string) {
  return { type: 'change-active-file' as const, path };
}

export function modifyActiveFile(modifiedText: string, forceRefresh = true) {
  return { type: 'modify-active-file' as const, modifiedText, forceRefresh };
}

export function viewListFiles(path: string) {
  return { type: 'view-list-files' as const, path };
}

export function viewFile(path: string) {
  return { type: 'view-file' as const, path };
}

export function viewPDF(path: string) {
  return { type: 'view-pdf' as const, path };
}

export function viewImage(path: string) {
  return { type: 'view-image' as const, path };
}

export function viewLinkDropbox() {
  return { type: 'view-link-dropbox' as const };
}

export function viewSettings() {
  return { type: 'view-settings' as const };
}

export function viewPrivacy() {
  return { type: 'view-privacy' as const };
}

export function dismissMessage(generation: number) {
  return {
    type: 'dismiss-message' as const,
    generation,
  };
}

export function hideEditor(flag: boolean) {
  return {
    type: 'hide-editor' as const,
    flag,
  };
}

export function disconnectOfflineDB() {
  return { type: 'disconnect-offline-db' as const };
}

export function connectOfflineDB(db: T.OfflineDB) {
  return { type: 'connect-offline-db' as const, db };
}

export function invalidatePath(path: string) {
  return { type: 'invalidate-path' as const, path };
}

export function shouldHideHeader(hide: boolean) {
  return { type: 'should-hide-header' as const, hide };
}

export function viewFileMenu(clickedFileMenu: T.ClickedFileMenu) {
  return { type: 'view-file-menu' as const, clickedFileMenu };
}

export function viewSongKeyMenu(clickedSongKeyMenu: T.ClickedSongKeyMenu) {
  return { type: 'view-song-key-menu' as const, clickedSongKeyMenu };
}

export function dismissFileMenu() {
  return { type: 'dismiss-file-menu' as const };
}

export function dismissSongKeyMenu() {
  return { type: 'dismiss-song-key-menu' as const };
}

export function startRenameFile(path: string) {
  return { type: 'start-rename-file' as const, path };
}

export function stopRenameFile() {
  return { type: 'stop-rename-file' as const };
}

export function setSearchString(search: string) {
  return { type: 'set-search-string' as const, search };
}

export function transposeKey(path: string, songKey: SongKey) {
  return { type: 'transpose-key' as const, path, songKey };
}

export function applyCapo(path: string, capo: number) {
  return { type: 'apply-capo' as const, path, capo };
}

export function removeKeySettings(path: string) {
  return { type: 'remove-key-settings' as const, path };
}
