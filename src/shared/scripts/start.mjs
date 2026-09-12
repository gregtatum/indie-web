import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseSite, sites } from './select-site.mjs';

const repoRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../..',
);

const HELP = `task start -- [options]

  --site <name>   ${sites.map((site) => site.key).join(' | ')}
                  (default: $SITE, otherwise an interactive prompt)
  --help          print this help and exit

Starts the Webpack dev server and the docs watcher in parallel for the
selected site.

Example:
  task start -- --site floppydisk
`;

function parseArgs(argv) {
  const opts = { site: null, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        opts.help = true;
        break;
      case '--site': {
        const value = argv[++i];
        if (value === undefined) {
          throw new Error('Missing value for --site');
        }
        opts.site = value;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.site && !sites.some((site) => site.key === opts.site)) {
    throw new Error(
      `--site must be one of: ${sites.map((site) => site.key).join(', ')}`,
    );
  }

  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }

  let site = opts.site || process.env.SITE;
  if (!site) {
    site = await chooseSite();
    process.stderr.write(`\ntask start -- --site ${site}\n\n`);
  }

  const child = spawn(
    'task',
    ['--parallel', 'start-webpack', 'start-docs-watch'],
    {
      cwd: repoRoot,
      env: { ...process.env, SITE: site },
      stdio: 'inherit',
    },
  );

  return new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      resolve(signal ? 1 : (code ?? 0));
    });
  });
}

let exitCode;
try {
  exitCode = await main();
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  exitCode = 1;
}
process.exit(exitCode);
