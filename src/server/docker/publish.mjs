#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const image = 'tatumcreative/floppydisk.link';
const platforms = 'linux/amd64,linux/arm64';
const buildxBuilder = 'floppydisk-release';
const repoRoot = resolve(import.meta.dirname, '../../..');
const serverPackageJson = resolve(repoRoot, 'src/server/package.json');
const changelogPath = resolve(repoRoot, 'src/server/CHANGELOG.md');

/**
 * @typedef {'major' | 'minor' | 'patch'} VersionBump
 * @typedef {{ bump: VersionBump, dryRun: boolean, forceBump: boolean }} PublishOptions
 * @typedef {{ capture?: boolean }} RunOptions
 */

/**
 * Thrown for bad CLI usage, which will be caught and handled with a graceful
 * error message.
 */
export class UsageError extends Error {}

/**
 * @param {string[]} args
 * @returns {PublishOptions}
 */
export function parsePublishArgs(args) {
  /** @type {VersionBump[]} */
  const bumps = [];
  let dryRun = false;
  let forceBump = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--force-bump') {
      forceBump = true;
    } else if (arg === 'major' || arg === 'minor' || arg === 'patch') {
      bumps.push(arg);
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }

  if (bumps.length === 0) {
    throw new UsageError('Missing version bump: major, minor, or patch.');
  }

  if (bumps.length > 1) {
    throw new UsageError(
      'Specify exactly one version bump: major, minor, or patch.',
    );
  }

  return { bump: bumps[0], dryRun, forceBump };
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
  return [`${image}:${version}`, `${image}:latest`];
}

/**
 * @param {string[]} tags
 * @returns {string[]}
 */
function buildxBuildArgs(tags) {
  return [
    'buildx',
    'build',
    '--builder',
    buildxBuilder,
    '--platform',
    platforms,
    '--file',
    'src/server/docker/Dockerfile.prod',
    ...tags.flatMap((dockerTag) => ['--tag', dockerTag]),
    '--push',
    '.',
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

function usage() {
  return [
    'Usage: task docker-publish -- major|minor|patch [--dry-run] [--force-bump]',
    '',
    'Examples:',
    '  task docker-publish -- patch --dry-run',
    '  task docker-publish -- patch',
    '  task docker-publish -- patch --force-bump',
    '',
    '--force-bump ignores a pending release left by a previous failed',
    'attempt and bumps the version again instead of resuming it.',
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
 * @param {string} code
 * @returns {(text: string) => string}
 */
function ansi(code) {
  return (text) =>
    process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

const color = {
  bold: ansi('1'),
  dim: ansi('2'),
  green: ansi('32'),
  cyan: ansi('36'),
  yellow: ansi('33'),
};

/**
 * @param {string} command
 * @param {string[]} args
 */
function printCommand(command, args) {
  const [executable, ...rest] = [command, ...args].map(shellQuote);
  console.log(
    `  ${color.dim('$')} ${color.cyan(executable)} ${rest.join(' ')}`,
  );
}

/**
 * Multi-platform images can only be built by a `docker-container` (or
 * remote) buildx driver, not the classic `docker` driver. Create a
 * dedicated builder on demand so this doesn't depend on whatever the
 * default builder happens to be on the machine running the release.
 */
function ensureBuildxBuilder() {
  try {
    run('docker', ['buildx', 'inspect', buildxBuilder], { capture: true });
  } catch {
    run('docker', [
      'buildx',
      'create',
      '--name',
      buildxBuilder,
      '--driver',
      'docker-container',
    ]);
  }
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
 * Checks whether the "## [Unreleased]" section of a Keep a Changelog style
 * CHANGELOG.md has at least one bullet under it, so a release always ships
 * with a written-down reason.
 * @param {string} changelog
 * @returns {boolean}
 */
export function hasUnreleasedChangelogEntry(changelog) {
  const lines = changelog.split('\n');
  const startIndex = lines.findIndex(
    (line) => line.trim() === '## [Unreleased]',
  );

  if (startIndex === -1) {
    return false;
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^## \[/.test(line)) {
      break;
    }
    if (/^\s*-\s+\S/.test(line)) {
      return true;
    }
  }

  return false;
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
 * Steps to get a working Docker setup via colima instead of Docker Desktop.
 * colima only provides the VM/daemon, so the CLI and its plugins need to be
 * installed and wired in separately.
 */
const colimaSetupSteps = [
  'brew install colima docker docker-buildx docker-compose',
  'mkdir -p ~/.docker/cli-plugins',
  'ln -sfn "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx',
  'ln -sfn "$(brew --prefix)/opt/docker-compose/bin/docker-compose" ~/.docker/cli-plugins/docker-compose',
  'colima start',
  'docker run --privileged --rm tonistiigi/binfmt --install all  # one-time, enables multi-arch builds',
];

/**
 * @param {{ colimaInstalled: boolean }} state
 * @returns {string}
 */
function dockerCliMissingMessage({ colimaInstalled }) {
  return [
    'Docker CLI not found.',
    '',
    colimaInstalled
      ? 'colima is installed, but the Docker CLI and plugins are not set up yet:'
      : 'Install colima (lighter weight than Docker Desktop, no licensing):',
    ...colimaSetupSteps.map((step) => `  ${step}`),
    '',
    'Or install Docker Desktop: https://www.docker.com/products/docker-desktop/',
    'Confirm it works with: docker version',
  ].join('\n');
}

/**
 * @param {{ colimaInstalled: boolean, colimaRunning: boolean }} state
 * @returns {string}
 */
function dockerDaemonUnreachableMessage({ colimaInstalled, colimaRunning }) {
  if (colimaInstalled && !colimaRunning) {
    return [
      'Docker CLI found, but colima is not running.',
      '',
      'Start it:',
      '  colima start',
      '',
      'Confirm it works with: docker version',
    ].join('\n');
  }

  if (colimaInstalled && colimaRunning) {
    return [
      'Docker CLI found, and colima is running, but Docker is not using it.',
      '',
      'Point Docker at the colima context:',
      '  docker context use colima',
      '',
      'Confirm it works with: docker version',
    ].join('\n');
  }

  return [
    'Docker CLI not found or not responding.',
    '',
    'If Docker Desktop is installed, make sure it is running. Otherwise,',
    'install colima (lighter weight than Docker Desktop, no licensing):',
    ...colimaSetupSteps.map((step) => `  ${step}`),
    '',
    'Confirm it works with: docker version',
  ].join('\n');
}

/**
 * @param {{ colimaInstalled: boolean }} state
 * @returns {string}
 */
function buildxUnavailableMessage({ colimaInstalled }) {
  return [
    'Docker is installed, but the buildx plugin is not available.',
    '',
    colimaInstalled
      ? 'Wire up the buildx plugin colima needs:'
      : 'Docker Desktop bundles buildx by default. If you use colima instead, wire it up:',
    '  brew install docker-buildx',
    '  mkdir -p ~/.docker/cli-plugins',
    '  ln -sfn "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx',
    '',
    'Confirm it works with: docker buildx version',
  ].join('\n');
}

const credentialHelperMissingMessage = [
  'docker-credential-osxkeychain not found. Docker needs it to push images.',
  '',
  '  brew install docker-credential-helper',
].join('\n');

const dockerHubRegistry = 'https://index.docker.io/v1/';

const dockerLoginMissingMessage = [
  'Not logged in to Docker Hub.',
  '',
  '  docker login',
].join('\n');

/**
 * @returns {boolean}
 */
function isLoggedInToDockerHub() {
  try {
    execFileSync('docker-credential-osxkeychain', ['get'], {
      input: `${dockerHubRegistry}\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} command
 * @returns {boolean}
 */
function commandExists(command) {
  try {
    run('which', [command], { capture: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {boolean}
 */
function isColimaRunning() {
  try {
    run('colima', ['status'], { capture: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checked first so a missing Docker install never leaves a half-finished
 * release commit behind.
 */
function requireDockerAvailable() {
  const colimaInstalled = commandExists('colima');

  if (!commandExists('docker')) {
    throw new Error(dockerCliMissingMessage({ colimaInstalled }));
  }

  try {
    run('docker', ['version', '--format', '{{.Client.Version}}'], {
      capture: true,
    });
  } catch {
    throw new Error(
      dockerDaemonUnreachableMessage({
        colimaInstalled,
        colimaRunning: colimaInstalled && isColimaRunning(),
      }),
    );
  }

  try {
    run('docker', ['buildx', 'version'], { capture: true });
  } catch {
    throw new Error(buildxUnavailableMessage({ colimaInstalled }));
  }

  if (!commandExists('docker-credential-osxkeychain')) {
    throw new Error(credentialHelperMissingMessage);
  }

  if (!isLoggedInToDockerHub()) {
    throw new Error(dockerLoginMissingMessage);
  }
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
 * @param {VersionBump} bump
 */
function requireChangelogEntry(bump) {
  let changelog;
  try {
    changelog = readFileSync(changelogPath, 'utf8');
  } catch {
    throw new Error(
      retrySameReleaseMessage(`Missing changelog: ${changelogPath}`, bump),
    );
  }

  if (!hasUnreleasedChangelogEntry(changelog)) {
    throw new Error(
      retrySameReleaseMessage(
        [
          'CHANGELOG.md has no entries under "## [Unreleased]".',
          '',
          'Add at least one bullet describing this release, commit it, then',
          'retry:',
          `  ${changelogPath}`,
        ].join('\n'),
        bump,
      ),
    );
  }
}

/**
 * A version is only truly published once its tag has been pushed to
 * origin — that's the one signal that both the git history and the Docker
 * image push succeeded. A local "Release server vX.Y.Z" commit without a
 * pushed tag means a previous attempt started this version and didn't
 * finish, no matter how many other commits have since landed on top of it.
 * @param {{ releaseCommitExists: boolean, taggedOnOrigin: boolean }} info
 * @returns {boolean}
 */
export function isVersionPending({ releaseCommitExists, taggedOnOrigin }) {
  return releaseCommitExists && !taggedOnOrigin;
}

/**
 * @returns {{ version: string, tag: string } | null}
 */
function findPendingRelease() {
  const currentVersion = readServerVersion();
  const tag = `v${currentVersion}`;

  const taggedOnOrigin = Boolean(
    run('git', ['ls-remote', '--tags', 'origin', tag], { capture: true }),
  );

  const commitMessages = run('git', ['log', '--format=%s'], {
    capture: true,
  }).split('\n');
  const releaseCommitExists = commitMessages.includes(`Release server ${tag}`);

  return isVersionPending({ releaseCommitExists, taggedOnOrigin })
    ? { version: currentVersion, tag }
    : null;
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
 * @param {boolean} resuming
 */
function requireSyncedMain(bump, currentVersion, resuming) {
  const head = run('git', ['rev-parse', 'HEAD'], { capture: true });
  const originMain = run('git', ['rev-parse', 'origin/main'], {
    capture: true,
  });

  if (resuming) {
    // A pending release may have other local commits stacked on top of it
    // by now, so an exact match isn't expected. Just make sure origin/main
    // hasn't moved somewhere our local history doesn't contain.
    try {
      run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], {
        capture: true,
      });
    } catch {
      throw new Error(
        syncedMainFailureMessage(head, originMain, bump, currentVersion),
      );
    }
    return;
  }

  if (head !== originMain) {
    throw new Error(
      syncedMainFailureMessage(head, originMain, bump, currentVersion),
    );
  }
}

/**
 * @param {string} tag
 * @param {VersionBump} bump
 * @param {boolean} resuming
 */
function requireTagAvailable(tag, bump, resuming) {
  const localTag = run('git', ['tag', '--list', tag], { capture: true });

  if (localTag && !resuming) {
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
 * @param {{ currentVersion: string, nextVersion: string, tag: string, resuming: boolean }} release
 */
function printDryRun({ currentVersion, nextVersion, tag, resuming }) {
  const tags = dockerTags(nextVersion);

  console.log(
    color.bold(color.yellow('Dry run:')) +
      ' no files, commits, tags, images, or remotes changed.',
  );
  console.log('');
  console.log(`${color.dim('Current server version:')} ${currentVersion}`);
  console.log(
    `${color.dim('Next server version:')}    ${color.green(nextVersion)}`,
  );
  console.log(`${color.dim('Git tag:')}                ${color.green(tag)}`);
  console.log('');
  console.log(color.bold('Docker tags:'));
  for (const dockerTag of tags) {
    console.log(`  ${color.cyan(dockerTag)}`);
  }
  console.log('');
  console.log(color.bold('Planned commands:'));
  if (resuming) {
    console.log(
      color.dim(
        '  (skip version bump/commit — already done by a previous attempt)',
      ),
    );
  } else {
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
  }
  console.log(
    color.dim(
      `  (ensure buildx builder "${buildxBuilder}" exists, creating it if not)`,
    ),
  );
  printCommand('docker', buildxBuildArgs(tags));
  console.log(
    color.dim('  (create the git tag, unless it already exists locally)'),
  );
  printCommand('git', ['tag', '-a', tag, '-m', `Release server ${tag}`]);
  printCommand('git', ['push', 'origin', 'main']);
  printCommand('git', ['push', 'origin', tag]);
}

/**
 * @param {{ nextVersion: string, tag: string, bump: VersionBump, resuming: boolean }} release
 */
function publish({ nextVersion, tag, bump, resuming }) {
  const tags = dockerTags(nextVersion);
  let releaseCommitPushed = false;

  try {
    if (!resuming) {
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
    }

    ensureBuildxBuilder();
    run('docker', buildxBuildArgs(tags));

    // Idempotent: a previous attempt may have already created this tag
    // before failing on a later step.
    const tagExistsLocally = Boolean(
      run('git', ['tag', '--list', tag], { capture: true }),
    );
    if (!tagExistsLocally) {
      run('git', ['tag', '-a', tag, '-m', `Release server ${tag}`]);
    }

    // A no-op if there's nothing new to push, so this is safe to repeat.
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
        `Publishing ${tag} failed before the release was pushed to origin. Rerun the exact same command — it will resume from here.`,
        bump,
      ),
    );
  }

  console.log(color.bold(color.green('Published:')));
  for (const dockerTag of tags) {
    console.log(`  ${color.cyan(dockerTag)}`);
  }
}

/**
 * @param {string[]} args
 */
export function main(args) {
  if (args.length === 0 || args.includes('--help')) {
    console.log(usage());
    return;
  }

  const options = parsePublishArgs(args);

  requireDockerAvailable();
  requireMainBranch(options.bump);
  requireCleanTree(options.bump);
  requireChangelogEntry(options.bump);

  if (!options.dryRun) {
    try {
      run('git', ['fetch', 'origin', 'main', '--tags']);
    } catch {
      throw new Error(
        retrySameReleaseMessage(
          'Failed to fetch origin/main and tags.',
          options.bump,
        ),
      );
    }
  }

  const pending = findPendingRelease();
  const currentVersion = readServerVersion();
  const resuming = pending !== null && !options.forceBump;
  const nextVersion = resuming
    ? pending.version
    : bumpVersion(currentVersion, options.bump);
  const tag = resuming ? pending.tag : `v${nextVersion}`;

  if (resuming) {
    console.log(
      color.yellow(
        `Resuming pending release ${tag} left by a previous attempt.`,
      ),
    );
    console.log('');
  } else if (pending) {
    console.log(
      color.yellow(
        `Ignoring pending release ${pending.tag} left by a previous attempt (--force-bump).`,
      ),
    );
    console.log('');
  }

  requireSyncedMain(options.bump, currentVersion, resuming);
  requireTagAvailable(tag, options.bump, resuming);

  if (options.dryRun) {
    printDryRun({ currentVersion, nextVersion, tag, resuming });
    return;
  }

  publish({ nextVersion, tag, bump: options.bump, resuming });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof UsageError) {
      console.error('');
      console.error(usage());
    }
    process.exitCode = 1;
  }
}
