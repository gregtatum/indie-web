import * as App from './app';

export type Action =
  | {
      type: 'set-dropbox-oauth';
      oauth: App.DropboxOauth;
    }
  | { type: 'remove-dropbox-oauth' }
  | { type: 'clear-api-cache' }
  | { type: 'set-api-cache' }
  | { type: 'change-active-file'; path: string }
  | { type: 'modify-active-file'; modifiedText: string }
  | { type: 'view-list-files'; path: string }
  | { type: 'view-file'; path: string }
  | { type: 'view-pdf'; path: string }
  | { type: 'view-link-dropbox' }
  | { type: 'dismiss-message'; generation: number }
  | { type: 'dismiss-all-messages' }
  | { type: 'hide-editor'; flag: boolean }
  | { type: 'keep-awake'; flag: boolean }
  | { type: 'expired-access-token' }
  | {
      type: 'add-message';
      message: React.ReactNode;
      generation: number;
    }
  | APICalls.ListFiles
  | APICalls.DownloadFile
  | APICalls.DownloadBlob;

export type APIAction<Type extends string, Args, T> =
  | { type: `${Type}-requested`; generation: number; args: Args }
  | { type: `${Type}-received`; generation: number; args: Args; value: T }
  | {
      type: `${Type}-failed`;
      generation: number;
      args: Args;
      // The old value could be retained.
      value?: T;
      error: unknown;
    };

export namespace APICalls {
  export type ListFiles = APIAction<
    'list-files',
    { path: string },
    Array<App.DropboxFile>
  >;
  export type DownloadFile = APIAction<
    'download-file',
    { path: string },
    App.DownloadedTextFile
  >;
  export type DownloadBlob = APIAction<
    'download-blob',
    { path: string },
    App.DownloadedBlob
  >;
}

export type ListFilesCache = Map<string, APICalls.ListFiles>;
export type DownloadFileCache = Map<string, APICalls.DownloadFile>;
export type DownloadBlobCache = Map<string, APICalls.DownloadBlob>;
