import { createReadStream, promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import { Readable, Transform, pipeline } from 'node:stream';
import { crc32, createDeflateRaw } from 'node:zlib';

/**
 * A streaming zip writer. Each file is deflated as it is read and followed by
 * a data descriptor holding its CRC and sizes, so nothing is buffered and the
 * archive can be sent while it is still being made. Memory use stays flat no
 * matter how big the folder is. It is checked against Info-ZIP's unzip. See
 * src/server/test/zip-oracle.ts.
 *
 * Folders and regular files are written, with their permissions and modified
 * times. Symbolic links and other special files are skipped, so a link can't
 * pull in a file from outside the folder. Files over about 4 GB, archives over
 * 4 GB, and archives of more than 65,535 entries use the ZIP64 extensions.
 */

const LOCAL_HEADER = 0x04034b50;
const DATA_DESCRIPTOR = 0x08074b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EXTRA_ID = 0x0001;

const VERSION_DEFLATE = 20;
const VERSION_ZIP64 = 45;
const MADE_BY_UNIX = 3 << 8;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_UTF8_NAMES = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const DOS_DIRECTORY_ATTRIBUTE = 0x10;

const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const ZIP64_FILE_SIZE = 0xf0000000;
const DEFLATE_LEVEL = 9;

export interface ZipOptions {
  forceZip64?: boolean;
}

/**
 * One file or folder in the archive, with what the central directory records
 * about it.
 */
interface Entry {
  name: Buffer; // path inside the archive, ending in / for a folder
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  attributes: number;
  offset: number; // where the local header starts
  crc: number;
  compressedSize: number;
  size: number;
  zip64: boolean; // the sizes are 64-bit
}

interface WalkedPath {
  name: string;
  fullPath: string;
  stats: Stats;
}

async function* walk(root: string, prefix = ''): AsyncGenerator<WalkedPath> {
  const children = await fs.readdir(`${root}/${prefix}`, {
    withFileTypes: true,
  });
  children.sort((a, b) => Number(a.name > b.name) - Number(a.name < b.name));
  for (const child of children) {
    const name = prefix + child.name;
    const fullPath = `${root}/${name}`;
    let stats: Stats;
    try {
      stats = await fs.lstat(fullPath);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    if (stats.isDirectory()) {
      yield { name: `${name}/`, fullPath, stats };
      yield* walk(root, `${name}/`);
    } else if (stats.isFile()) {
      yield { name, fullPath, stats };
    }
  }
}

function dosDateTime(mtime: Date): { dosTime: number; dosDate: number } {
  const year = Math.min(Math.max(mtime.getFullYear(), 1980), 2107);
  return {
    dosTime:
      (mtime.getHours() << 11) |
      (mtime.getMinutes() << 5) |
      (mtime.getSeconds() >> 1),
    dosDate:
      ((year - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate(),
  };
}

function zip64Extra(...values: number[]): Buffer {
  if (values.length === 0) {
    return Buffer.alloc(0);
  }
  const extra = Buffer.alloc(4 + values.length * 8);
  extra.writeUInt16LE(ZIP64_EXTRA_ID, 0);
  extra.writeUInt16LE(values.length * 8, 2);
  values.forEach((value, index) => {
    extra.writeBigUInt64LE(BigInt(value), 4 + index * 8);
  });
  return extra;
}

function localHeader(entry: Entry): Buffer {
  const extra = entry.zip64 ? zip64Extra(0, 0) : Buffer.alloc(0);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_HEADER, 0);
  header.writeUInt16LE(entry.zip64 ? VERSION_ZIP64 : VERSION_DEFLATE, 4);
  header.writeUInt16LE(entry.flags, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  if (entry.zip64) {
    header.writeUInt32LE(MAX_UINT32, 18);
    header.writeUInt32LE(MAX_UINT32, 22);
  }
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, entry.name, extra]);
}

function dataDescriptor(entry: Entry): Buffer {
  const descriptor = Buffer.alloc(entry.zip64 ? 24 : 16);
  descriptor.writeUInt32LE(DATA_DESCRIPTOR, 0);
  descriptor.writeUInt32LE(entry.crc, 4);
  if (entry.zip64) {
    descriptor.writeBigUInt64LE(BigInt(entry.compressedSize), 8);
    descriptor.writeBigUInt64LE(BigInt(entry.size), 16);
  } else {
    descriptor.writeUInt32LE(entry.compressedSize, 8);
    descriptor.writeUInt32LE(entry.size, 12);
  }
  return descriptor;
}

function centralHeader(entry: Entry, forceZip64: boolean): Buffer {
  const offsetOverflows = forceZip64 || entry.offset >= MAX_UINT32;
  const extra = zip64Extra(
    ...(entry.zip64 ? [entry.size, entry.compressedSize] : []),
    ...(offsetOverflows ? [entry.offset] : []),
  );
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_HEADER, 0);
  header.writeUInt16LE(MADE_BY_UNIX | VERSION_ZIP64, 4);
  header.writeUInt16LE(
    entry.zip64 || offsetOverflows ? VERSION_ZIP64 : VERSION_DEFLATE,
    6,
  );
  header.writeUInt16LE(entry.flags, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.zip64 ? MAX_UINT32 : entry.compressedSize, 20);
  header.writeUInt32LE(entry.zip64 ? MAX_UINT32 : entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt32LE(entry.attributes, 38);
  header.writeUInt32LE(offsetOverflows ? MAX_UINT32 : entry.offset, 42);
  return Buffer.concat([header, entry.name, extra]);
}

function endOfCentralDirectory(
  entryCount: number,
  directorySize: number,
  directoryOffset: number,
  forceZip64: boolean,
): Buffer {
  const needsZip64 =
    forceZip64 ||
    entryCount >= MAX_UINT16 ||
    directorySize >= MAX_UINT32 ||
    directoryOffset >= MAX_UINT32;
  const parts: Buffer[] = [];
  if (needsZip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(ZIP64_END_OF_CENTRAL_DIRECTORY, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(MADE_BY_UNIX | VERSION_ZIP64, 12);
    record.writeUInt16LE(VERSION_ZIP64, 14);
    record.writeBigUInt64LE(BigInt(entryCount), 24);
    record.writeBigUInt64LE(BigInt(entryCount), 32);
    record.writeBigUInt64LE(BigInt(directorySize), 40);
    record.writeBigUInt64LE(BigInt(directoryOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(ZIP64_LOCATOR, 0);
    locator.writeBigUInt64LE(BigInt(directoryOffset + directorySize), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(Math.min(entryCount, MAX_UINT16), 8);
  end.writeUInt16LE(Math.min(entryCount, MAX_UINT16), 10);
  end.writeUInt32LE(Math.min(directorySize, MAX_UINT32), 12);
  end.writeUInt32LE(Math.min(directoryOffset, MAX_UINT32), 16);
  parts.push(end);
  return Buffer.concat(parts);
}

/**
 * Deflates a file, yielding the compressed bytes. The CRC and sizes of the
 * file are filled into the entry once the file has been read to its end.
 */
async function* deflateFile(
  fullPath: string,
  entry: Entry,
): AsyncGenerator<Buffer> {
  let crc = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      crc = crc32(chunk, crc);
      entry.size += chunk.length;
      callback(null, chunk);
    },
  });
  const deflater = createDeflateRaw({ level: DEFLATE_LEVEL });
  pipeline(createReadStream(fullPath), counter, deflater, () => {});
  try {
    for await (const chunk of deflater) {
      entry.compressedSize += chunk.length;
      yield chunk;
    }
  } finally {
    deflater.destroy();
  }
  entry.crc = crc;
}

async function* zipChunks(
  root: string,
  { forceZip64 = false }: ZipOptions,
): AsyncGenerator<Buffer> {
  const entries: Entry[] = [];
  let offset = 0;
  const counted = (bytes: Buffer): Buffer => {
    offset += bytes.length;
    return bytes;
  };

  for await (const { name, fullPath, stats } of walk(root)) {
    const isDirectory = stats.isDirectory();
    const entry: Entry = {
      name: Buffer.from(name, 'utf8'),
      flags: FLAG_UTF8_NAMES | (isDirectory ? 0 : FLAG_DATA_DESCRIPTOR),
      method: isDirectory ? METHOD_STORE : METHOD_DEFLATE,
      ...dosDateTime(stats.mtime),
      attributes:
        ((stats.mode & MAX_UINT16) * 0x10000 +
          (isDirectory ? DOS_DIRECTORY_ATTRIBUTE : 0)) >>>
        0,
      offset,
      crc: 0,
      compressedSize: 0,
      size: 0,
      zip64: !isDirectory && (forceZip64 || stats.size >= ZIP64_FILE_SIZE),
    };
    yield counted(localHeader(entry));
    if (!isDirectory) {
      for await (const chunk of deflateFile(fullPath, entry)) {
        yield counted(chunk);
      }
      yield counted(dataDescriptor(entry));
    }
    entries.push(entry);
  }

  const directoryOffset = offset;
  for (const entry of entries) {
    yield counted(centralHeader(entry, forceZip64));
  }
  yield counted(
    endOfCentralDirectory(
      entries.length,
      offset - directoryOffset,
      directoryOffset,
      forceZip64,
    ),
  );
}

/**
 * Streams a zip of everything inside a folder. The folder itself is not an
 * entry. Destroying the stream stops reading files.
 */
export function zipFolder(root: string, options: ZipOptions = {}): Readable {
  return Readable.from(zipChunks(root, options), { objectMode: false });
}
