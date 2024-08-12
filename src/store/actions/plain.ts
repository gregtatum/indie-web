import { T } from 'src';
import { IDB_CACHE_NAME } from 'src/logic/file-system/dropbox-fs';
import {
  BROWSER_FILES_DB_NAME,
  IDBFS,
} from 'src/logic/file-system/indexeddb-fs';
import { SongKey } from 'src/logic/parse';

export function removeDropboxAccessToken() {
  localStorage.clear();
  indexedDB.deleteDatabase(IDB_CACHE_NAME);
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

export function removeBrowserFiles() {
  localStorage.clear();
  indexedDB.deleteDatabase(BROWSER_FILES_DB_NAME);
  return { type: 'remove-browser-files' as const };
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

export function modifyActiveFile(
  modifiedText: string,
  path: string,
  forceRefresh: boolean,
) {
  return {
    type: 'modify-active-file' as const,
    modifiedText,
    path,
    forceRefresh,
  };
}

export function viewListFiles(fileSystemName: T.FileSystemName, path: string) {
  return { type: 'view-list-files' as const, fileSystemName, path };
}

export function viewLanguageCoach(path: string) {
  return { type: 'view-language-coach' as const, path };
}

export function setLanguageCoachSection(section: T.LanguageCoachSection) {
  return { type: 'set-language-coach-section' as const, section };
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

export function viewMarkdown(path: string) {
  return { type: 'view-markdown' as const, path };
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

export function invalidatePath(path: string) {
  return { type: 'invalidate-path' as const, path };
}

export function shouldHideHeader(hide: boolean) {
  return { type: 'should-hide-header' as const, hide };
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

export function changeFileSystem(fileSystemName: T.FileSystemName) {
  return { type: 'change-file-system' as const, fileSystemName };
}

export function connectIDBFS(idbfs: IDBFS) {
  return { type: 'connect-idbfs' as const, idbfs };
}

export function stemFrequencyAnalysis(stems: T.Stem[]) {
  return {
    type: 'stem-frequency-analysis' as const,
    stems,
  };
}

export function selectStem(stemIndex: number) {
  return {
    type: 'select-stem' as const,
    stemIndex,
  };
}

export function learnStem(stem: string) {
  return {
    type: 'learn-stem' as const,
    stem,
  };
}

export function ignoreStem(stem: string) {
  return {
    type: 'ignore-stem' as const,
    stem,
  };
}

export function updateLearnedWords(words: Set<string>) {
  return {
    type: 'update-learned-words' as const,
    words,
  };
}

export function loadLanguageData(languageData: T.LanguageDataV1) {
  return {
    type: 'load-language-data' as const,
    languageData,
  };
}
