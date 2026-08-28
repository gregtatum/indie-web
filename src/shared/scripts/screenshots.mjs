/**
 * task screenshots — capture design-review screenshots of the indie-web apps in
 * known, "logged-in" states using Playwright + Firefox.
 *
 * Contract:
 *   - Never prompts. Every knob is a flag or env var.
 *   - Reuses dev/file servers that are already listening. It only starts the
 *     servers that are missing, and only stops the ones it started itself.
 *     Servers that were already running are left alone.
 *   - Deterministic output under artifacts/screenshots/ (git-ignored).
 *   - Logs go to stderr; the final stdout line is a JSON manifest:
 *       {"ok":true,"site":"browserchords","outDir":"...","screenshots":[...],
 *        "reusedServers":[...],"startedServers":[...],"failed":[...]}
 *   - Exit code is non-zero if any requested screenshot failed.
 *   - The Firefox binary is downloaded on first run into artifacts/.cache.
 *
 * Usage:
 *   task screenshots
 *   task screenshots -- --site floppydisk
 *   task screenshots -- --only tapeplayer-library,floppydisk-files
 *   task screenshots -- --headed --keep-servers
 *   task screenshots -- --list
 *   node src/shared/scripts/screenshots.mjs --help
 *
 * To add or change a screenshot, see the comment above the SHOTS array.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../..',
);
const serverDir = path.join(repoRoot, 'src', 'server');

const isTTY = Boolean(process.stderr.isTTY);
const ansi = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};
function paint(text, ...names) {
  if (!isTTY) {
    return text;
  }
  return names.map((n) => ansi[n]).join('') + text + ansi.reset;
}
function log(msg) {
  process.stderr.write(`${paint('[screenshots]', 'cyan')} ${msg}\n`);
}
function warn(msg) {
  process.stderr.write(`${paint('[screenshots]', 'yellow')} ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`${paint('[screenshots]', 'red')} ${msg}\n`);
}

// Adding or changing a screenshot
// -------------------------------
// Each entry in SHOTS produces one PNG at <out>/<name>.png. Fields:
//   name       kebab-case id; also the --only token and the output filename.
//   surface    'music' | 'files' — which file-store server must be running.
//   route      appended to the app origin (see the route map below).
//   waitFor    CSS selector that must exist before capture. Use the root
//              className of the view component (grep src/frontend/components):
//              .musicLibraryView, .listFiles, .viewMarkdownDiv, ...
//   waitState  'visible' (default) | 'attached'. Use 'attached' when the target
//              renders at zero height until its content loads.
//   settleMs   extra pause after waitFor, before capture (default 500).
//   describe   one line shown by --list.
//   prepare    optional async (page) => {} run after waitFor — click / hover /
//              scroll to reach an interaction state before the shot.
//
// Route map (react-router; see AppRoutes in src/frontend/components/App.tsx).
// The first segment `:fs` is a seeded server id — 'music' or 'files', from the
// `seed` object in main(). Only /:fs/folder and /:fs/music re-resolve the active
// store from `:fs`; /:fs/md, /:fs/file, /:fs/pdf and /:fs/image render against
// whichever server `seed.fileStoreServer` marks active, so a non-folder shot on
// the files surface needs that seed left pointing at 'files'.
//   /:fs/folder/<path>   file + folder listing
//   /:fs/md/<path>       Markdown source + preview
//   /:fs/file/<path>     ChordPro / lead sheet
//   /:fs/pdf/<path>      PDF viewer
//   /:fs/image/<path>    image viewer
//   /:fs/music/          TapePlayer library
//
// Seeded localStorage (onboarding, input density, configured servers) is the
// `seed` object in main(); its keys are defined in
// src/frontend/logic/persisted-state.ts.

const SHOTS = [
  {
    name: 'tapeplayer-library',
    surface: 'music',
    route: '/music/music/',
    waitFor: '.musicTrack',
    describe: 'TapePlayer: filter columns, track list, playback bar',
  },
  {
    name: 'floppydisk-files',
    surface: 'files',
    route: '/files/folder/',
    waitFor: '.listFiles',
    describe: 'FloppyDisk: file + folder browser listing',
  },
  {
    name: 'floppydisk-markdown',
    surface: 'files',
    // The md route does not re-resolve the active store, so this shot relies on
    // the seeded active store already being the files server.
    route: '/files/md/README.md',
    waitFor: '.viewMarkdownDiv',
    waitState: 'attached',
    settleMs: 1500,
    describe: 'FloppyDisk: Markdown source + rendered preview',
  },
];

function parseArgs(argv) {
  const opts = {
    site: process.env.SITE || 'browserchords',
    only: null,
    out: path.join(repoRoot, 'artifacts', 'screenshots'),
    appUrl: null,
    musicUrl: process.env.SCREENSHOTS_MUSIC_URL || 'http://localhost:6544',
    musicMount:
      process.env.SCREENSHOTS_MUSIC_MOUNT || path.join(repoRoot, 'music'),
    filesUrl: process.env.SCREENSHOTS_FILES_URL || 'http://localhost:6543',
    filesMount:
      process.env.SCREENSHOTS_FILES_MOUNT || path.join(repoRoot, 'mount'),
    viewport: { width: 1600, height: 1000 },
    browser: 'firefox',
    headed: false,
    keepServers: false,
    freeze: true,
    serverTimeoutMs: 90_000,
    list: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      return value;
    };
    switch (arg) {
      case '--help':
      case '-h':
        opts.help = true;
        break;
      case '--list':
        opts.list = true;
        break;
      case '--site':
        opts.site = next();
        break;
      case '--only':
        opts.only = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--out':
        opts.out = path.resolve(next());
        break;
      case '--app-url':
        opts.appUrl = next();
        break;
      case '--music-url':
        opts.musicUrl = next();
        break;
      case '--music-mount':
        opts.musicMount = path.resolve(next());
        break;
      case '--files-url':
        opts.filesUrl = next();
        break;
      case '--files-mount':
        opts.filesMount = path.resolve(next());
        break;
      case '--browser':
        opts.browser = next();
        break;
      case '--viewport': {
        const [w, h] = next().split('x').map(Number);
        if (!w || !h) {
          throw new Error('--viewport must look like 1600x1000');
        }
        opts.viewport = { width: w, height: h };
        break;
      }
      case '--timeout':
        opts.serverTimeoutMs = Number(next());
        break;
      case '--headed':
        opts.headed = true;
        break;
      case '--keep-servers':
        opts.keepServers = true;
        break;
      case '--no-freeze':
        opts.freeze = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.site !== 'browserchords' && opts.site !== 'floppydisk') {
    throw new Error('--site must be "browserchords" or "floppydisk"');
  }
  if (opts.browser !== 'firefox' && opts.browser !== 'chromium') {
    throw new Error('--browser must be "firefox" or "chromium"');
  }
  if (!opts.appUrl) {
    const port = opts.site === 'floppydisk' ? 2345 : 1234;
    opts.appUrl = `http://localhost:${port}`;
  }
  return opts;
}

const HELP = `task screenshots -- [options]

  --site <name>          browserchords (default) | floppydisk
  --only <a,b>           comma-separated screenshot names (see --list)
  --out <dir>            output directory (default artifacts/screenshots)
  --app-url <url>        override the app origin (default per --site)
  --music-url <url>      music file server     (default http://localhost:6544)
  --music-mount <dir>    music server mount    (default ./music)
  --files-url <url>      plain file server     (default http://localhost:6543)
  --files-mount <dir>    file server mount     (default ./mount)
  --browser <name>       firefox (default) | chromium
  --viewport <WxH>       browser viewport      (default 1600x1000)
  --timeout <ms>         how long to wait for a server to come up (default 90000)
  --headed               show the browser window
  --keep-servers         don't stop servers this script started
  --no-freeze            keep CSS transitions/animations during capture
  --list                 print the available screenshots and exit
  --help                 print this help and exit

Servers already listening are reused; only missing ones are started, and only
those are stopped again on exit.`;

async function isUp(base) {
  try {
    const res = await fetch(new URL('/', base), {
      signal: AbortSignal.timeout(1500),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function waitUntilUp(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(base)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const startedServers = [];

function pipePrefixed(child, prefix) {
  const forward = (stream) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim()) {
          process.stderr.write(`${paint(prefix, 'dim')} ${line}\n`);
        }
      }
    });
  };
  forward(child.stdout);
  forward(child.stderr);
}

/**
 * Ensure a server is listening at `url`. Returns 'reused' or 'started'.
 * `spec.start` is only invoked when nothing is already listening.
 */
async function ensureServer(name, url, spec, timeoutMs) {
  if (await isUp(url)) {
    log(`${paint('reuse', 'green')}  ${name} already listening at ${url}`);
    return 'reused';
  }
  log(`${paint('start', 'yellow')}  ${name} at ${url}`);
  const child = spawn(spec.cmd[0], spec.cmd.slice(1), {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('exit', (code) => {
    if (code && code !== 0 && !shuttingDown) {
      fail(`${name} exited early with code ${code}`);
    }
  });
  pipePrefixed(child, `  ${name}`);
  startedServers.push({ name, child });

  if (!(await waitUntilUp(url, timeoutMs))) {
    throw new Error(`${name} did not come up at ${url} within ${timeoutMs}ms`);
  }
  log(`${paint('ready', 'green')}  ${name}`);
  return 'started';
}

let shuttingDown = false;
async function shutdown(opts) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (opts?.keepServers || startedServers.length === 0) {
    return;
  }
  for (const { name, child } of startedServers) {
    log(`stopping ${name} (pid ${child.pid})`);
    child.kill('SIGTERM');
  }
  const deadline = Date.now() + 4000;
  for (const { child } of startedServers) {
    while (child.exitCode === null && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
}

async function loadEngine(browserName) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(
    repoRoot,
    'artifacts',
    '.cache',
    'playwright',
  );
  let pw;
  try {
    pw = await import('playwright');
  } catch {
    throw new Error(
      'The "playwright" package is not installed. Run: npm install --save-dev playwright',
    );
  }
  return { engine: pw[browserName], pw };
}

async function launchBrowser(engine, browserName, headed) {
  try {
    return await engine.launch({ headless: !headed });
  } catch (err) {
    const msg = String(err);
    if (
      !/executable doesn'?t exist|Failed to launch|playwright install/i.test(
        msg,
      )
    ) {
      throw err;
    }
    log(`downloading ${browserName} for Playwright (first run only)…`);
    await new Promise((resolve, reject) => {
      const child = spawn('npx', ['playwright', 'install', browserName], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
      });
      child.on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`playwright install exited ${code}`)),
      );
    });
    return engine.launch({ headless: !headed });
  }
}

const FREEZE_CSS = `*, *::before, *::after {
  transition-duration: 0s !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  caret-color: transparent !important;
}`;

// The webpack-dev-server "Compiled with problems" overlay is an obstruction in a
// design screenshot, never the subject. Build failures belong in the terminal.
function removeDevServerOverlay(page) {
  return page
    .evaluate(() => {
      /* eslint-disable-next-line no-undef */
      const doc = document;
      for (const id of [
        'webpack-dev-server-client-overlay',
        'webpack-dev-server-client-overlay-div',
      ]) {
        doc.getElementById(id)?.remove();
      }
    })
    .catch(() => {});
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    process.stderr.write(HELP + '\n');
    return 0;
  }
  if (opts.list) {
    for (const shot of SHOTS) {
      process.stderr.write(
        `  ${paint(shot.name.padEnd(22), 'bold')} ${shot.describe}\n`,
      );
    }
    return 0;
  }

  const shots = opts.only
    ? SHOTS.filter((s) => opts.only.includes(s.name))
    : SHOTS;
  if (shots.length === 0) {
    throw new Error(
      `No screenshots matched --only. Known: ${SHOTS.map((s) => s.name).join(', ')}`,
    );
  }

  const origin = new URL(opts.appUrl).origin;
  const needsMusic = shots.some((s) => s.surface === 'music');
  const needsFiles = shots.some((s) => s.surface === 'files');

  log(
    `site ${paint(opts.site, 'bold')}  app ${opts.appUrl}  browser ${opts.browser}`,
  );
  await mkdir(opts.out, { recursive: true });

  // The plain file server and music server are the same binary with a
  // different PORT + MOUNT_PATH. Make sure its deps are installed once.
  if (
    (needsMusic || needsFiles) &&
    !existsSync(path.join(serverDir, 'node_modules'))
  ) {
    log('installing src/server dependencies (first run only)…');
    await new Promise((resolve, reject) => {
      const child = spawn('npm', ['install'], {
        cwd: serverDir,
        stdio: 'inherit',
      });
      child.on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`npm install exited ${code}`)),
      );
    });
  }

  const serverEntry = ['node', '--disable-warning=ExperimentalWarning', '.'];
  const reusedServers = [];
  const started = [];
  const record = (name, outcome) =>
    (outcome === 'reused' ? reusedServers : started).push(name);

  try {
    record(
      'app',
      await ensureServer(
        'app',
        opts.appUrl,
        {
          cmd: ['node', path.join(repoRoot, 'webpack.server.js')],
          cwd: repoRoot,
          env: { NODE_ENV: 'development', SITE: opts.site },
        },
        opts.serverTimeoutMs,
      ),
    );

    if (needsMusic) {
      record(
        'music-server',
        await ensureServer(
          'music-server',
          opts.musicUrl,
          {
            cmd: serverEntry,
            cwd: serverDir,
            env: {
              PORT: new URL(opts.musicUrl).port,
              MOUNT_PATH: opts.musicMount,
            },
          },
          opts.serverTimeoutMs,
        ),
      );
    }
    if (needsFiles) {
      record(
        'files-server',
        await ensureServer(
          'files-server',
          opts.filesUrl,
          {
            cmd: serverEntry,
            cwd: serverDir,
            env: {
              PORT: new URL(opts.filesUrl).port,
              MOUNT_PATH: opts.filesMount,
            },
          },
          opts.serverTimeoutMs,
        ),
      );
    }

    const { engine } = await loadEngine(opts.browser);
    const browser = await launchBrowser(engine, opts.browser, opts.headed);
    const context = await browser.newContext({
      viewport: opts.viewport,
      deviceScaleFactor: 2,
    });

    const seed = {
      hasOnboarded: 'true',
      inputMode: 'mouse',
      fileStoreName: 'server',
      // Despite the key name, this stores the *active server id*. Shots reach
      // the music view through an explicit /music/music/ route, so the active
      // store is the files server — the md route needs that to be set already.
      fileStoreServer: 'files',
      fileStoreServers: JSON.stringify([
        { url: opts.musicUrl, name: 'Music', id: 'music', storeType: 'music' },
        { url: opts.filesUrl, name: 'Files', id: 'files', storeType: 'files' },
      ]),
    };
    await context.addInitScript(
      ({ seed, origin }) => {
        /* eslint-disable-next-line no-undef */
        const win = window;
        try {
          if (win.location.origin !== origin) {
            return;
          }
          for (const [key, value] of Object.entries(seed)) {
            win.localStorage.setItem(key, value);
          }
        } catch {
          /* localStorage unavailable on about:blank — ignore */
        }
      },
      { seed, origin },
    );

    const results = [];
    const failed = [];
    for (const shot of shots) {
      const outfile = path.join(opts.out, `${shot.name}.png`);
      const url = opts.appUrl.replace(/\/$/, '') + shot.route;
      const page = await context.newPage();
      try {
        log(`capture ${paint(shot.name, 'bold')}  →  ${url}`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        await page.waitForSelector(shot.waitFor, {
          timeout: 20_000,
          state: shot.waitState ?? 'visible',
        });
        if (shot.prepare) {
          await shot.prepare(page);
        }
        if (opts.freeze) {
          await page.addStyleTag({ content: FREEZE_CSS });
        }
        await page.waitForTimeout(shot.settleMs ?? 500);
        await removeDevServerOverlay(page);
        await page.screenshot({ path: outfile });
        results.push({ name: shot.name, path: outfile, url });
        log(`  ${paint('ok', 'green')}  ${path.relative(repoRoot, outfile)}`);
      } catch (err) {
        failed.push({
          name: shot.name,
          url,
          error: String(err?.message || err),
        });
        fail(`  ${shot.name}: ${err?.message || err}`);
      } finally {
        await page.close();
      }
    }

    await context.close();
    await browser.close();

    process.stdout.write(
      JSON.stringify({
        ok: failed.length === 0,
        site: opts.site,
        outDir: opts.out,
        screenshots: results,
        failed,
        reusedServers,
        startedServers: started,
      }) + '\n',
    );
    return failed.length === 0 ? 0 : 1;
  } finally {
    await shutdown(opts);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    warn(`received ${signal}, cleaning up…`);
    await shutdown({ keepServers: false });
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (err) {
  fail(err?.stack || String(err));
  await shutdown({ keepServers: false });
  exitCode = 1;
}
process.exit(exitCode);
