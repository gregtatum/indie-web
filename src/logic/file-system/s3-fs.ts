/* eslint-disable @typescript-eslint/no-unused-vars */
import { FileSystemError, SaveMode, FileSystem } from 'src/logic/file-system';
import { T } from 'src';
import { openIDBFS } from './indexeddb-fs';
// TODO
// import {
//   S3Client,
//   ListBucketsCommand,
//   ListBucketsCommandOutput,
// } from '@aws-sdk/client-s3';

class S3Client {
  // eslint-disable-next-line no-useless-constructor
  constructor(opts: any) {}
  async send(opts: any): Promise<any> {}
}
const ListBucketsCommand: any = null;
type ListBucketsCommandOutput = any;

export const S3_CACHE_NAME = 's3-fs-cache';

export class S3Error extends FileSystemError {
  toString() {
    if (this.error?.status >= 500 && this.error?.status < 600) {
      return 'S3 seems to be down at the moment.';
    }
    const name = this.error?.name;
    if (typeof name === 'string') {
      if (name === 'TypeError') {
        return 'Unable to connect to the internet. Try again?';
      }
    }

    console.error(this.error);
    return 'There was an error with S3. Try refreshing?';
  }

  status() {
    return this.error?.status;
  }

  isNotFound() {
    // TODO
    return false;
  }

  static wrap(error: any) {
    return Promise.reject(new S3Error(error));
  }
}

export class S3FS extends FileSystem {
  #client: S3Client;
  cachePromise?: Promise<void>;

  constructor(credentials: T.S3Credentials) {
    super();
    const { region, accessKeyId, secretAccessKey } = credentials;
    this.#client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    if (process.env.NODE_ENV === 'test') {
      this.cachePromise = Promise.resolve();
    } else {
      const cachePromise = openIDBFS(S3_CACHE_NAME);
      void cachePromise.then((IDBFS) => {
        this.cache = IDBFS;
      });
      this.cachePromise = cachePromise.then(() => {});
    }

    const listBuckets = async () => {
      const command = new ListBucketsCommand({});

      try {
        const result: ListBucketsCommandOutput =
          await this.#client.send(command);
        const { Owner, Buckets } = result;
        console.log(
          `${Owner?.DisplayName} owns ${Buckets?.length} bucket${
            Buckets?.length === 1 ? '' : 's'
          }:`,
        );
        console.log(
          `${Buckets?.map((b: { Name: any }) => ` • ${b.Name}`).join('\n')}`,
        );
      } catch (err) {
        console.error(err);
      }
    };

    void listBuckets();
  }

  saveBlob(
    pathOrMetadata: string | T.FileMetadata,
    mode: SaveMode,
    contents: any,
  ): Promise<T.FileMetadata> {
    return Promise.reject(new Error('TODO'));
  }

  loadBlob(path: string): Promise<T.BlobFile> {
    return Promise.reject(new Error('TODO'));
  }

  listFiles(path: string): Promise<T.FolderListing> {
    return Promise.reject(new Error('TODO'));
  }

  move(
    fromPath: string,
    toPath: string,
  ): Promise<T.FileMetadata | T.FolderMetadata> {
    return Promise.reject(new Error('TODO'));
  }

  compressFolder(path: string): Promise<Blob> {
    return Promise.reject(new Error('TODO'));
  }

  delete(path: string): Promise<void> {
    return Promise.reject(new Error('TODO'));
  }
}
