#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const image = 'tatumcreative/floppydisk.link';
const repoRoot = resolve(import.meta.dirname, '../../..');
const serverPackageJson = resolve(repoRoot, 'src/server/package.json');

/**
 * @typedef {'major' | 'minor' | 'patch'} VersionBump
 * @typedef {{ bump: VersionBump, dryRun: boolean }} PublishOptions
 * @typedef {{ capture?: boolean }} RunOptions
 */

/**
 * @param {string[]} args
 * @returns {PublishOptions}
 */
export function parsePublishArgs(args) {
  /** @type {VersionBump[]} */
  const bumps = [];
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === 'major' || arg === 'minor' || arg === 'patch') {
      bumps.push(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (bumps.length === 0) {
    throw new Error('Missing version bump: major, minor, or patch.');
  }

  if (bumps.length > 1) {
    throw new Error(
      'Specify exactly one version bump: major, minor, or patch.',
    );
  }

  return { bump: bumps[0], dryRun };
}

/**
 * @param {string} version
 * @param {VersionBump} bump
 * @returns {string}
 */
export function bumpVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    throw new Error(`Invalid server package version: ${version}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown version bump: ${bump}`);
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * @param {string} version
 * @returns {string[]}
 */
export function dockerTags(version) {
  const [major, minor] = version.split('.');

  return [
    `${image}:${version}`,
    `${image}:${major}.${minor}`,
    `${image}:${major}`,
    `${image}:latest`,
  ];
}

function usage() {
  return [
    'Usage: task docker-publish -- major|minor|patch [--dry-run]',
    '',
    'Examples:',
    '  task docker-publish -- patch --dry-run',
    '  task docker-publish -- patch',
  ].join('\n');
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {RunOptions} options
 * @returns {string}
 */
function run(command, args, { capture = false } = {}) {
  if (capture) {
    return execFileSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return '';
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function printCommand(command, args) {
  console.log(`  ${[command, ...args].map(shellQuote).join(' ')}`);
}

/**
 * @param {string} value
 * @returns {string}
 */
function shellQuote(value) {
  if (/^[A-Za-z0-9_/:=@%+.,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * @returns {string}
 */
function readServerVersion() {
  const pkg = JSON.parse(readFileSync(serverPackageJson, 'utf8'));

  if (typeof pkg.version !== 'string') {
    throw new Error(
      'src/server/package.json does not contain a string version.',
    );
  }

  return pkg.version;
}

function requireMainBranch() {
  const branch = run('git', ['branch', '--show-current'], { capture: true });

  if (branch !== 'main') {
    throw new Error(`Publishing must run from main. Current branch: ${branch}`);
  }
}

function requireCleanTree() {
  const status = run('git', ['status', '--porcelain=v1'], { capture: true });

  if (status) {
    throw new Error(
      `Publishing requires a clean working tree. Commit or remove these changes first:\n${status}`,
    );
  }
}

function requireSyncedMain() {
  const head = run('git', ['rev-parse', 'HEAD'], { capture: true });
  const originMain = run('git', ['rev-parse', 'origin/main'], {
    capture: true,
  });

  if (head !== originMain) {
    throw new Error('Publishing requires local main to match origin/main.');
  }
}

/**
 * @param {string} tag
 */
function requireTagAvailable(tag) {
  const localTag = run('git', ['tag', '--list', tag], { capture: true });

  if (localTag) {
    throw new Error(`Git tag already exists locally: ${tag}`);
  }

  const remoteTag = run('git', ['ls-remote', '--tags', 'origin', tag], {
    capture: true,
  });

  if (remoteTag) {
    throw new Error(`Git tag already exists on origin: ${tag}`);
  }
}

/**
 * @param {string} tag
 * @param {{ dryRun: boolean }} options
 */
function preflight(tag, { dryRun }) {
  requireMainBranch();
  requireCleanTree();

  if (!dryRun) {
    run('git', ['fetch', 'origin', 'main', '--tags']);
  }

  requireSyncedMain();
  requireTagAvailable(tag);
}

/**
 * @param {{ currentVersion: string, nextVersion: string, tag: string }} release
 */
function printDryRun({ currentVersion, nextVersion, tag }) {
  const tags = dockerTags(nextVersion);

  console.log('Dry run: no files, commits, tags, images, or remotes changed.');
  console.log('');
  console.log(`Current server version: ${currentVersion}`);
  console.log(`Next server version:    ${nextVersion}`);
  console.log(`Git tag:                ${tag}`);
  console.log('Docker tags:');
  for (const dockerTag of tags) {
    console.log(`  ${dockerTag}`);
  }
  console.log('');
  console.log('Planned commands:');
  printCommand('npm', [
    '--prefix',
    'src/server',
    'version',
    nextVersion,
    '--no-git-tag-version',
  ]);
  printCommand('git', [
    'add',
    'src/server/package.json',
    'src/server/package-lock.json',
  ]);
  printCommand('git', ['commit', '-m', `Release server ${tag}`]);
  printCommand('docker', [
    'build',
    '--file',
    'src/server/docker/Dockerfile.prod',
    '--tag',
    tags[0],
    '.',
  ]);
  for (let index = 1; index < tags.length; index += 1) {
    printCommand('docker', ['tag', tags[0], tags[index]]);
  }
  printCommand('git', ['tag', '-a', tag, '-m', `Release server ${tag}`]);
  printCommand('git', ['push', 'origin', 'main']);
  printCommand('git', ['push', 'origin', tag]);
  for (const dockerTag of tags) {
    printCommand('docker', ['push', dockerTag]);
  }
}

/**
 * @param {{ nextVersion: string, tag: string }} release
 */
function publish({ nextVersion, tag }) {
  const tags = dockerTags(nextVersion);

  run('npm', [
    '--prefix',
    'src/server',
    'version',
    nextVersion,
    '--no-git-tag-version',
  ]);
  run('git', [
    'add',
    'src/server/package.json',
    'src/server/package-lock.json',
  ]);
  run('git', ['commit', '-m', `Release server ${tag}`]);
  run('docker', [
    'build',
    '--file',
    'src/server/docker/Dockerfile.prod',
    '--tag',
    tags[0],
    '.',
  ]);

  for (let index = 1; index < tags.length; index += 1) {
    run('docker', ['tag', tags[0], tags[index]]);
  }

  run('git', ['tag', '-a', tag, '-m', `Release server ${tag}`]);
  run('git', ['push', 'origin', 'main']);
  run('git', ['push', 'origin', tag]);

  for (const dockerTag of tags) {
    run('docker', ['push', dockerTag]);
  }

  console.log('Published:');
  for (const dockerTag of tags) {
    console.log(`  ${dockerTag}`);
  }
}

/**
 * @param {string[]} args
 */
export function main(args) {
  const options = parsePublishArgs(args);
  const currentVersion = readServerVersion();
  const nextVersion = bumpVersion(currentVersion, options.bump);
  const tag = `v${nextVersion}`;

  preflight(tag, options);

  if (options.dryRun) {
    printDryRun({ currentVersion, nextVersion, tag });
    return;
  }

  publish({ nextVersion, tag });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('');
    console.error(usage());
    process.exitCode = 1;
  }
}
