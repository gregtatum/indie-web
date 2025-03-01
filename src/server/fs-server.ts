import { promises as fs } from 'fs';
import * as path from 'path';
import express, { type Request, type Response } from 'express';
import { type T } from './index.ts';

export class NodeFSServer {
  app = express();

  constructor() {
    this.app.use(express.json());

    this.app.post('/saveBlob', async (req: Request, res: Response) => {
      const { filePath, contents } = req.body;
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, Buffer.from(contents, 'base64'));
        const stats = await fs.stat(filePath);
        const file: T.FileMetadata = {
          type: 'file',
          name: path.basename(filePath),
          path: filePath,
          id: stats.ino.toString(),
          clientModified: new Date().toISOString(),
          serverModified: stats.mtime.toISOString(),
          rev: stats.ino.toString(),
          size: stats.size,
          isDownloadable: true,
          hash: '',
        };
        res.json(file);
      } catch (error) {
        handleUnexpectedError(res, error);
      }
    });

    this.app.post('/loadBlob', async (req: Request, res: Response) => {
      const { filePath } = req.body;
      try {
        const buffer = await fs.readFile(filePath);
        const stats = await fs.stat(filePath);
        res.json({
          metadata: {
            type: 'file',
            name: path.basename(filePath),
            path: filePath,
            id: stats.ino.toString(),
            clientModified: stats.ctime.toISOString(),
            serverModified: stats.mtime.toISOString(),
            rev: stats.ino.toString(),
            size: stats.size,
            isDownloadable: true,
            hash: '',
          },
          contents: buffer.toString('base64'),
        });
      } catch (error) {
        handleUnexpectedError(res, error);
      }
    });

    this.app.post('/listFiles', async (req: Request, res: Response) => {
      const { dirPath } = req.body;
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const listings = await Promise.all(
          entries.map(async (entry) => {
            const entryPath = path.join(dirPath, entry.name);
            const stats = await fs.stat(entryPath);
            if (entry.isDirectory()) {
              return {
                type: 'folder',
                name: entry.name,
                path: entryPath,
                id: stats.ino.toString(),
              };
            } else {
              return {
                type: 'file',
                name: entry.name,
                path: entryPath,
                id: stats.ino.toString(),
                clientModified: stats.ctime.toISOString(),
                serverModified: stats.mtime.toISOString(),
                rev: stats.ino.toString(),
                size: stats.size,
                isDownloadable: true,
                hash: '',
              };
            }
          }),
        );
        res.json(listings);
      } catch (error) {
        handleUnexpectedError(res, error);
      }
    });

    this.app.post('/move', async (req: Request, res: Response) => {
      const { fromPath, toPath } = req.body;
      try {
        await fs.mkdir(path.dirname(toPath), { recursive: true });
        await fs.rename(fromPath, toPath);
        const stats = await fs.stat(toPath);
        if (stats.isDirectory()) {
          res.json({
            type: 'folder',
            name: path.basename(toPath),
            path: toPath,
            id: stats.ino.toString(),
          });
        } else {
          res.json({
            type: 'file',
            name: path.basename(toPath),
            path: toPath,
            id: stats.ino.toString(),
            clientModified: stats.ctime.toISOString(),
            serverModified: stats.mtime.toISOString(),
            rev: stats.ino.toString(),
            size: stats.size,
            isDownloadable: true,
            hash: '',
          });
        }
      } catch (error) {
        handleUnexpectedError(res, error);
      }
    });

    this.app.post('/createFolder', async (req: Request, res: Response) => {
      const { folderPath } = req.body;
      try {
        await fs.mkdir(folderPath, { recursive: true });
        const stats = await fs.stat(folderPath);
        res.json({
          type: 'folder',
          name: path.basename(folderPath),
          path: folderPath,
          id: stats.ino.toString(),
        });
      } catch (error) {
        handleUnexpectedError(res, error);
      }
    });

    this.app.post('/delete', async (req: Request, res: Response) => {
      const { targetPath } = req.body;
      try {
        const stats = await fs.stat(targetPath);
        if (stats.isDirectory()) {
          await fs.rmdir(targetPath, { recursive: true });
        } else {
          await fs.unlink(targetPath);
        }
        res.sendStatus(200);
      } catch (error) {
        handleUnexpectedError(res, error);
      }
    });
  }

  start(port: number): void {
    this.app.listen(port, () => {
      console.log(`NodeFSServer is running on port ${port}`);
    });
  }
}

function handleUnexpectedError(res: Response, error: unknown) {
  const message = errorToString(error);
  console.error(error);
  res.status(500).send(message);
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = error?.toString?.();
  if (message && message !== '[object Object]') {
    return message;
  }
  return 'An unknown error occured.';
}
