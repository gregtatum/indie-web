import readline from 'readline';

const sites = [
  { key: 'floppydisk', label: 'Floppy Disk' },
  { key: 'browserchords', label: 'Browser Chords' },
];

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

async function chooseSite() {
  const envSite = process.env.SITE;
  if (envSite) {
    return envSite;
  }

  const options = sites
    .map((site, index) => `${index + 1}) ${site.label}`)
    .join('\n');
  const answer = await prompt(`Select a site:\n${options}\n> `);
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

const site = await chooseSite();
if (site !== 'floppydisk' && site !== 'browserchords') {
  throw new Error('SITE must be set to "floppydisk" or "browserchords".');
}

process.stdout.write(`export SITE=${site}\n`);
