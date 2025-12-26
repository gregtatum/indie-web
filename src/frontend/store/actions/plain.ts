import { T } from 'frontend';
import { IDB_CACHE_NAME } from 'frontend/logic/file-store/dropbox-fs';
import {
  BROWSER_FILES_DB_NAME,
  IDBFS,
} from 'frontend/logic/file-store/indexeddb-fs';
import { SongKey } from 'frontend/logic/parse-chords';

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

export function addFileStoreServer(server: T.FileStoreServer) {
  return { type: 'add-server' as const, server };
}

export function removeFileStoreServer(server: T.FileStoreServer) {
  return { type: 'remove-server' as const, server };
}

export function updateFileStoreServer(
  oldServer: T.FileStoreServer,
  newServer: T.FileStoreServer,
) {
  return { type: 'update-server' as const, oldServer, newServer };
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

export function viewListFiles(
  fileStoreName: T.FileStoreName,
  fileStoreServer: T.FileStoreServer | null,
  path: string,
) {
  return {
    type: 'view-list-files' as const,
    fileStoreName,
    fileStoreServer,
    path,
  };
}

export function viewLanguageCoach(
  coachPath: string,
  path: string,
  invalidateOldData = false,
) {
  return {
    type: 'view-language-coach' as const,
    coachPath,
    path,
    invalidateOldData,
  };
}

export function setLanguageCoachSection(
  section: T.LanguageCoachSection,
  coachPath: string,
  path: string,
) {
  return {
    type: 'set-language-coach-section' as const,
    section,
    coachPath,
    path,
  };
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

export function viewConnect() {
  return { type: 'view-connect' as const };
}

export function viewFileStorage() {
  return { type: 'view-file-storage' as const };
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

export function setEditorOnly(isEditorOnly: boolean) {
  localStorage.setItem('appEditorOnly', isEditorOnly.toString());
  return {
    type: 'set-editor-only' as const,
    isEditorOnly,
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

export function setCopyFile(path: string, isCut: boolean) {
  return { type: 'set-copy-file' as const, path, isCut };
}

export function clearCopyFile() {
  return { type: 'clear-copy-file' as const };
}

export function changeFileStore(
  fileStoreName: T.FileStoreName,
  fileStoreServer?: T.FileStoreServer,
) {
  return {
    type: 'change-file-system' as const,
    fileStoreName,
    fileStoreServer,
  };
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

export function updateIgnoredWords(words: Set<string>) {
  return {
    type: 'update-ignored-words' as const,
    words,
  };
}

export function loadLanguageData(languageData: T.LanguageDataV1) {
  return {
    type: 'load-language-data' as const,
    languageData,
  };
}

export function setAreStemsActive(isActive: boolean) {
  return {
    type: 'set-are-stems-active' as const,
    isActive,
  };
}

export function setOpenAIApiKey(apiKey: string) {
  localStorage.setItem('openAIAPIKey', apiKey);
  return {
    type: 'set-open-ai-api-key' as const,
    apiKey,
  };
}

export function setHasOnboarded(value: boolean) {
  return {
    type: 'set-has-onboarded' as const,
    value,
  };
}

export function setExperimentalFeatures(value: boolean) {
  return {
    type: 'set-experimental-features' as const,
    value,
  };
}

export function setEditorAutocomplete(
  editor: 'markdown' | 'chordpro',
  value: boolean,
) {
  return {
    type: 'set-editor-autocomplete' as const,
    editor,
    value,
  };
}

export function changeFileFocus(folder: string, fileFocus: string) {
  return {
    type: 'change-file-focus' as const,
    folder,
    fileFocus,
  };
}
