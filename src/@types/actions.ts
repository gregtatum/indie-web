import * as App from './app';

export type Action =
  | { type: 'set-dropbox-access-token'; token: string }
  | { type: 'remove-dropbox-access-token' }
  | { type: 'clear-api-cache' }
  | { type: 'set-api-cache' }
  | { type: 'change-active-file'; value: string }
  | { type: 'modify-active-file'; value: string }
  | { type: 'change-view'; value: App.View }
  | { type: 'dismiss-message'; generation: number }
  | { type: 'dismiss-all-messages' }
  | {
      type: 'add-message';
      message: React.ReactNode;
      generation: number;
    }
  | APICalls.ListFiles
  | APICalls.DownloadFile;

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

export type ListFilesCache = Map<string, APICalls.ListFiles>;
export type DownloadFileCache = Map<string, APICalls.DownloadFile>;

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
}
