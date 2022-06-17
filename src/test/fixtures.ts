import { T } from 'src';

export function createMetadata(name: string, path: string): T.FileMetadata {
  return {
    type: 'file',
    name,
    path,
    id: 'id:AAAAAAAAAAAAAAAAAAAAAA',
    clientModified: '2022-05-08T15:20:46Z',
    serverModified: '2022-05-15T13:31:17Z',
    rev: '0123456789abcdef0123456789abcde',
    size: 3103,
    isDownloadable: true,
    hash: '0cae1bd6b2d4686a6389c6f0f7f41d42c4ab406a6f6c2af4dc084f1363617336',
  };
}
