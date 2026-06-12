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

/**
 * @param {VersionBump} bump
 * @returns {string}
 */
function publishCommand(bump) {
  return `task docker-publish -- ${bump}`;
}

/**
 * @param {string} message
 * @param {VersionBump} bump
 * @returns {string}
 */
function retrySameReleaseMessage(message, bump) {
  return [
    message,
    '',
    'Recovery:',
    '  1. Fix the error above.',
    '  2. Restore a clean, synced main if the failed command changed local files.',
    '  3. Retry the same release bump:',
    `     ${publishCommand(bump)}`,
  ].join('\n');
}

/**
 * @param {string} message
 * @returns {string}
 */
function retryPatchReleaseMessage(message) {
  return [
    message,
    '',
    'Recovery:',
    '  1. Fix Docker or GitHub access if needed.',
    '  2. Sync the release commit that was already pushed:',
    '     git pull --ff-only origin main',
    '  3. Publish a patch recovery release:',
    `     ${publishCommand('patch')}`,
    '',
    'Do not rerun the original major or minor bump. That version is already spent.',
  ].join('\n');
}

/**
 * @param {string} failedTag
 * @param {string} releaseTag
 * @returns {string}
 */
function dockerPushFailureMessage(failedTag, releaseTag) {
  return retryPatchReleaseMessage(
    [
      `Docker push failed for ${failedTag}.`,
      '',
      `The git release ${releaseTag} was already pushed, so this release version is spent.`,
      '',
      'Before retrying, authenticate Docker Hub:',
      '     docker login',
      'Confirm your Docker account can push this repository:',
      `     ${image}`,
    ].join('\n'),
  );
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

/**
 * @param {string} ref
 * @returns {string | null}
 */
function readServerVersionFromGitRef(ref) {
  try {
    const packageJson = run('git', ['show', `${ref}:src/server/package.json`], {
      capture: true,
    });
    const pkg = JSON.parse(packageJson);

    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} version
 * @returns {[number, number, number] | null}
 */
function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number | null}
 */
function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

/**
 * @param {VersionBump} bump
 */
function requireMainBranch(bump) {
  const branch = run('git', ['branch', '--show-current'], { capture: true });

  if (branch !== 'main') {
    throw new Error(
      retrySameReleaseMessage(
        `Publishing must run from main. Current branch: ${branch}`,
        bump,
      ),
    );
  }
}

/**
 * @param {VersionBump} bump
 */
function requireCleanTree(bump) {
  const status = run('git', ['status', '--porcelain=v1'], { capture: true });

  if (status) {
    throw new Error(
      retrySameReleaseMessage(
        `Publishing requires a clean working tree. Commit or remove these changes first:\n${status}`,
        bump,
      ),
    );
  }
}

/**
 * @param {string} head
 * @param {string} originMain
 * @param {VersionBump} bump
 * @param {string} currentVersion
 * @returns {string}
 */
function syncedMainFailureMessage(head, originMain, bump, currentVersion) {
  const originVersion = readServerVersionFromGitRef('origin/main');
  const originVersionComparison = originVersion
    ? compareSemver(originVersion, currentVersion)
    : null;
  const originIsAhead =
    originVersionComparison !== null && originVersionComparison > 0;

  const message = [
    'Publishing requires local main to match origin/main.',
    '',
    `Local HEAD:  ${head.slice(0, 12)}`,
    `origin/main: ${originMain.slice(0, 12)}`,
    `Local server version:  ${currentVersion}`,
    originVersion ? `Origin server version: ${originVersion}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (originIsAhead) {
    return [
      message,
      '',
      'origin/main already contains a newer server release, which usually means a previous publish pushed the release commit before failing later.',
      '',
      'Recovery:',
      '  1. Sync the pushed release commit:',
      '     git pull --ff-only origin main',
      '  2. Publish a patch recovery release:',
      `     ${publishCommand('patch')}`,
      '',
      'Do not rerun the original major or minor bump. That version is already spent.',
    ].join('\n');
  }

  return [
    message,
    '',
    'Recovery:',
    '  1. Update local main without creating a merge commit:',
    '     git pull --ff-only origin main',
    '  2. Retry the same release bump:',
    `     ${publishCommand(bump)}`,
  ].join('\n');
}

/**
 * @param {VersionBump} bump
 * @param {string} currentVersion
 */
function requireSyncedMain(bump, currentVersion) {
  const head = run('git', ['rev-parse', 'HEAD'], { capture: true });
  const originMain = run('git', ['rev-parse', 'origin/main'], {
    capture: true,
  });

  if (head !== originMain) {
    throw new Error(
      syncedMainFailureMessage(head, originMain, bump, currentVersion),
    );
  }
}

/**
 * @param {string} tag
 * @param {VersionBump} bump
 */
function requireTagAvailable(tag, bump) {
  const localTag = run('git', ['tag', '--list', tag], { capture: true });

  if (localTag) {
    throw new Error(
      retrySameReleaseMessage(`Git tag already exists locally: ${tag}`, bump),
    );
  }

  const remoteTag = run('git', ['ls-remote', '--tags', 'origin', tag], {
    capture: true,
  });

  if (remoteTag) {
    throw new Error(
      retryPatchReleaseMessage(
        `Git tag already exists on origin: ${tag}. That release version is already spent.`,
      ),
    );
  }
}

/**
 * @param {string} tag
 * @param {string} currentVersion
 * @param {PublishOptions} options
 */
function preflight(tag, currentVersion, { bump, dryRun }) {
  requireMainBranch(bump);
  requireCleanTree(bump);

  if (!dryRun) {
    try {
      run('git', ['fetch', 'origin', 'main', '--tags']);
    } catch {
      throw new Error(
        retrySameReleaseMessage('Failed to fetch origin/main and tags.', bump),
      );
    }
  }

  requireSyncedMain(bump, currentVersion);
  requireTagAvailable(tag, bump);
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
 * @param {{ nextVersion: string, tag: string, bump: VersionBump }} release
 */
function publish({ nextVersion, tag, bump }) {
  const tags = dockerTags(nextVersion);
  let releaseCommitPushed = false;

  try {
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
    releaseCommitPushed = true;
    run('git', ['push', 'origin', tag]);
  } catch {
    if (releaseCommitPushed) {
      throw new Error(
        retryPatchReleaseMessage(
          `Publishing ${tag} failed after the release commit was pushed. That release version is spent.`,
        ),
      );
    }

    throw new Error(
      retrySameReleaseMessage(
        `Publishing ${tag} failed before the release was pushed to origin.`,
        bump,
      ),
    );
  }

  for (const dockerTag of tags) {
    try {
      run('docker', ['push', dockerTag]);
    } catch {
      throw new Error(dockerPushFailureMessage(dockerTag, tag));
    }
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

  preflight(tag, currentVersion, options);

  if (options.dryRun) {
    printDryRun({ currentVersion, nextVersion, tag });
    return;
  }

  publish({ nextVersion, tag, bump: options.bump });
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
