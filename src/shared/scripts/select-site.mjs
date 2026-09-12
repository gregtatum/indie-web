import readline from 'readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sites = [
  { key: 'floppydisk', label: 'Floppy Disk' },
  { key: 'browserchords', label: 'Browser Chords' },
];

const isTTY = Boolean(process.stderr.isTTY);
const ansi = {
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};
function paint(text, ...names) {
  if (!isTTY) {
    return text;
  }
  return names.map((name) => ansi[name]).join('') + text + ansi.reset;
}

function prompt(question) {
  if (!process.stdin.isTTY) {
    throw new Error(
      'SITE must be set to "floppydisk" or "browserchords" in non-interactive mode.',
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function chooseSite() {
  const envSite = process.env.SITE;
  if (envSite) {
    return envSite;
  }

  const options = sites
    .map((site, index) => `  ${paint(`${index + 1})`, 'cyan')} ${site.label}`)
    .join('\n');
  const answer = await prompt(
    `${paint('Select a site:', 'bold')}\n${options}\n${paint('>', 'cyan', 'bold')} `,
  );
  const choice = Number.parseInt(String(answer).trim(), 10);
  if (!Number.isNaN(choice) && choice >= 1 && choice <= sites.length) {
    return sites[choice - 1].key;
  }

  const normalized = String(answer).trim().toLowerCase();
  const named = sites.find((site) => site.key === normalized);
  if (named) {
    return named.key;
  }

  throw new Error('SITE must be set to "floppydisk" or "browserchords".');
}

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const site = await chooseSite();
  if (site !== 'floppydisk' && site !== 'browserchords') {
    throw new Error('SITE must be set to "floppydisk" or "browserchords".');
  }

  process.stdout.write(`export SITE=${site}\n`);
}
