import { T } from 'src';

export function removeDropboxAccessToken(): { type: 'remove-dropbox-oauth' } {
  localStorage.clear();
  return { type: 'remove-dropbox-oauth' as const };
}

export function setDropboxAccessToken(
  accessToken: string,
  expiresIn: number,
  refreshToken: string,
) {
  const expires =
    Date.now() + expiresIn * 1000 - 5 * 60 * 1000; /* subtract five minutes */

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

export function modifyActiveFile(modifiedText: string) {
  return { type: 'modify-active-file' as const, modifiedText };
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

export function dismissFileMenu() {
  return { type: 'dismiss-file-menu' as const };
}
