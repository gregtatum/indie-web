import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rootDir, '..');

const allowedSites = new Set(['floppydisk', 'browserchords']);

async function pickSiteFromPrompt() {
  if (!process.stdin.isTTY) {
    throw new Error(
      'SITE must be set to either "floppydisk" or "browserchords" for docs build.',
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const choice = await new Promise((resolve) => {
    rl.question('Pick a site (floppydisk/browserchords): ', resolve);
  });

  rl.close();
  return String(choice || '').trim().toLowerCase();
}

let site = process.env.SITE;
if (!site) {
  site = await pickSiteFromPrompt();
}

if (!allowedSites.has(site)) {
  throw new Error(
    'SITE must be set to either "floppydisk" or "browserchords" for docs build.',
  );
}

const docsRoot = path.join(projectRoot, 'docs');
const templatePath = path.join(docsRoot, 'template.html');
const outputRoot = path.join(projectRoot, 'dist', 'docs');
const sourceDirs = [path.join(docsRoot, 'common'), path.join(docsRoot, site)];

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function titleFromTokens(tokens, fallback) {
  const heading = tokens.find((token) => token.type === 'heading');
  if (heading && typeof heading.text === 'string' && heading.text.trim()) {
    return heading.text.trim();
  }
  return fallback;
}

function descriptionFromTokens(tokens) {
  const paragraph = tokens.find((token) => token.type === 'paragraph');
  if (paragraph && typeof paragraph.text === 'string') {
    return paragraph.text.trim();
  }
  return '';
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function pathExists(checkPath) {
  try {
    await fs.access(checkPath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function writeMarkdown(targetPath, markdownText, sourceName) {
  const tokens = marked.lexer(markdownText);
  const title = titleFromTokens(tokens, sourceName);
  const description = descriptionFromTokens(tokens);
  const htmlBody = marked.parse(markdownText);
  const templateExists = await pathExists(templatePath);
  const template = templateExists
    ? await fs.readFile(templatePath, 'utf-8')
    : `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{title}}</title>
    {{metaDescription}}
  </head>
  <body>
    {{content}}
  </body>
</html>
`;
  const metaDescription = description
    ? `<meta name="description" content="${escapeHtml(description)}" />`
    : '';
  const html = template
    .replace('{{title}}', escapeHtml(title))
    .replace('{{metaDescription}}', metaDescription)
    .replace('{{content}}', htmlBody);

  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, html);
}

async function copyDocsFrom(sourceDir) {
  if (!(await pathExists(sourceDir))) {
    console.log(`[docs] skip missing directory: ${sourceDir}`);
    return;
  }

  console.log(`[docs] reading ${sourceDir}`);
  const files = await listFiles(sourceDir);
  for (const filePath of files) {
    const relativePath = path.relative(sourceDir, filePath);
    const targetPath = path.join(outputRoot, relativePath);
    if (filePath.toLowerCase().endsWith('.md')) {
      const markdownText = await fs.readFile(filePath, 'utf-8');
      const htmlPath = targetPath.replace(/\.md$/i, '.html');
      const fallbackTitle = path.basename(filePath, path.extname(filePath));
      await writeMarkdown(htmlPath, markdownText, fallbackTitle);
      console.log(
        `[docs] render ${relativePath} -> ${path.relative(projectRoot, htmlPath)}`,
      );
    } else {
      await ensureDir(path.dirname(targetPath));
      await fs.copyFile(filePath, targetPath);
      console.log(
        `[docs] copy ${relativePath} -> ${path.relative(projectRoot, targetPath)}`,
      );
    }
  }
}

async function buildDocs() {
  console.log(`[docs] site=${site}`);
  console.log(`[docs] output=${outputRoot}`);
  await ensureDir(outputRoot);
  await copyDocsFrom(sourceDirs[0]);
  await copyDocsFrom(sourceDirs[1]);
  console.log('[docs] done');
}

await buildDocs();
