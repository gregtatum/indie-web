import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import process from 'node:process';

function ensureNetlifyCli() {
  const cached = execFileSync('npm', ['cache', 'npx', 'ls'], {
    encoding: 'utf8',
  });
  if (!cached.includes(': netlify-cli')) {
    execFileSync('npx', ['netlify-cli', '--version'], { stdio: 'inherit' });
  }
}

function netlifyApi(method, data) {
  let stdout;
  try {
    stdout = execFileSync(
      'npx',
      ['netlify-cli', 'api', method, '--data', JSON.stringify(data)],
      { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] },
    );
  } catch {
    console.error('Netlify API call failed. Try `npx netlify-cli login`.');
    process.exit(1);
  }
  return JSON.parse(stdout);
}

const dockerImage = 'tatumcreative/floppydisk.link';

const deployCount = 5;

const isInteractive = Boolean(process.stdout.isTTY);
const colors = {
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function styled(text, ...colorNames) {
  if (!isInteractive) {
    return text;
  }
  return colorNames.map((name) => colors[name]).join('') + text + colors.reset;
}

function link(text, url) {
  if (!isInteractive) {
    return text;
  }
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function stateStyle(state) {
  if (state === 'ready') {
    return { glyph: '✓', color: 'green' };
  }
  if (state === 'error') {
    return { glyph: 'x', color: 'red' };
  }
  return { glyph: '•', color: 'yellow' };
}

function stateLabel(state) {
  return state === 'ready' || state === 'active' ? 'deployed' : state;
}

function formatAge(isoDate) {
  const seconds = Math.max(0, (Date.now() - Date.parse(isoDate)) / 1000);
  const units = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size) {
      return `${Math.floor(seconds / size)}${unit} ago`;
    }
  }
  return 'just now';
}

function truncate(text, length) {
  return text.length > length ? text.slice(0, length - 1) + '…' : text;
}

function printNetlify() {
  const sites = netlifyApi('listSites', { filter: 'all' });
  for (const site of sites) {
    const deploys = netlifyApi('listSiteDeploys', {
      site_id: site.id,
      per_page: deployCount,
    });
    const domain = site.custom_domain ?? site.name;
    console.log(
      `\n${styled(link(domain, site.ssl_url ?? site.url), 'bold', 'cyan')} ${styled(link(site.name, site.admin_url), 'dim')}`,
    );
    const ageWidth = Math.max(
      ...deploys.map((d) => formatAge(d.created_at).length),
    );
    const branchWidth = Math.max(...deploys.map((d) => d.branch.length));
    for (const deploy of deploys) {
      const { glyph, color } = stateStyle(deploy.state);
      console.log(
        [
          styled(glyph, color),
          styled(stateLabel(deploy.state).padEnd(8), color),
          styled(formatAge(deploy.created_at).padStart(ageWidth), 'dim'),
          styled((deploy.commit_ref ?? '').slice(0, 7).padEnd(7), 'cyan'),
          styled(deploy.branch.padEnd(branchWidth), 'dim'),
          truncate((deploy.title ?? '').split('\n')[0], 50),
        ].join(' '),
      );
      if (deploy.error_message) {
        console.log(`  ${styled(deploy.error_message, 'dim')}`);
      }
    }
  }
}

function releaseCommit(version) {
  try {
    const [hash, subject] = execFileSync(
      'git',
      ['log', '-1', '--format=%h%n%s', `v${version}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .trim()
      .split('\n');
    return { hash, subject };
  } catch {
    return { hash: '', subject: '' };
  }
}

async function printDocker() {
  const hubApi = `https://hub.docker.com/v2/repositories/${dockerImage}`;
  let tags;
  try {
    const response = await fetch(`${hubApi}/tags?page_size=100`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    tags = (await response.json()).results;
  } catch (error) {
    console.error(`Docker Hub request failed: ${error.message}`);
    process.exit(1);
  }

  const versions = tags
    .filter((tag) => /^\d+\.\d+\.\d+$/.test(tag.name))
    .slice(0, deployCount);
  const latest = tags.find((tag) => tag.name === 'latest');
  const packageVersion = JSON.parse(
    readFileSync(new URL('../../server/package.json', import.meta.url), 'utf8'),
  ).version;

  console.log(
    `\n${styled(link(dockerImage, `https://hub.docker.com/r/${dockerImage}`), 'bold', 'cyan')} ${styled('docker hub', 'dim')}`,
  );
  const ageWidth = Math.max(
    ...versions.map((tag) => formatAge(tag.last_updated).length),
  );
  const tagWidth = Math.max(...versions.map((tag) => tag.name.length));
  for (const tag of versions) {
    const isActive = tag.tag_status === 'active';
    const { hash, subject } = releaseCommit(tag.name);
    console.log(
      [
        styled(isActive ? '✓' : 'x', isActive ? 'green' : 'red'),
        styled(
          stateLabel(tag.tag_status).padEnd(8),
          isActive ? 'green' : 'red',
        ),
        styled(formatAge(tag.last_updated).padStart(ageWidth), 'dim'),
        styled(hash.padEnd(7), 'cyan'),
        styled(tag.name.padEnd(tagWidth), 'dim'),
        truncate(subject, 50),
      ].join(' '),
    );
  }

  if (versions[0]?.name !== packageVersion) {
    console.log(
      `${styled('•', 'yellow')} ${styled(`package.json is ${packageVersion} but the newest published version is ${versions[0]?.name}`, 'yellow')}`,
    );
  }
  if (latest && versions[0] && latest.digest !== versions[0].digest) {
    console.log(
      `${styled('x', 'red')} ${styled(`"latest" does not point at ${versions[0].name}`, 'red')}`,
    );
  }
}

ensureNetlifyCli();
printNetlify();
await printDocker();
