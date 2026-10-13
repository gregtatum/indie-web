import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, lstat } from 'node:fs/promises';
import assert from 'node:assert/strict';

export interface TreeEntry {
  type: 'file' | 'directory';
  executable: boolean;
  mtimeSeconds: number;
  sha256: string;
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'en_US.UTF-8' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} failed (${code}): ${stdout}${stderr}`));
      }
    });
  });
}

/**
 * Info-ZIP's unzip checks every entry's CRC and size against the archive's
 * central directory and fails on anything malformed.
 */
export async function assertUnzipAccepts(zipPath: string): Promise<void> {
  const output = await run('unzip', ['-t', zipPath]);
  assert.match(output, /No errors detected/);
}

export async function extractZip(
  zipPath: string,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await run('unzip', ['-q', zipPath, '-d', destDir]);
}

export async function snapshotTree(
  root: string,
  prefix = '',
): Promise<Map<string, TreeEntry>> {
  const tree = new Map<string, TreeEntry>();
  for (const child of await readdir(`${root}/${prefix}`)) {
    const name = prefix + child;
    const stats = await lstat(`${root}/${name}`);
    if (stats.isDirectory()) {
      tree.set(`${name}/`, {
        type: 'directory',
        executable: false,
        mtimeSeconds: 0,
        sha256: '',
      });
      for (const [key, value] of await snapshotTree(root, `${name}/`)) {
        tree.set(key, value);
      }
    } else if (stats.isFile()) {
      tree.set(name, {
        type: 'file',
        executable: Boolean(stats.mode & 0o100),
        mtimeSeconds: Math.floor(stats.mtimeMs / 2000) * 2,
        sha256: createHash('sha256')
          .update(await readFile(`${root}/${name}`))
          .digest('hex'),
      });
    }
  }
  return tree;
}
