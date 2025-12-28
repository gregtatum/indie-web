import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
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
  return String(choice || '')
    .trim()
    .toLowerCase();
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

if (site === 'floppydisk') {
  dotenv.config({ path: './.env.floppydisk' });
} else if (site === 'browserchords') {
  dotenv.config({ path: './.env.browserchords' });
}

const docsRoot = path.join(projectRoot, 'docs');
const templatePath = path.join(docsRoot, 'template.html');
const outputRoot = path.join(projectRoot, 'dist', 'docs');
const sourceDirs = [path.join(docsRoot, 'common'), path.join(docsRoot, site)];
const siteName = process.env.SITE_DISPLAY_NAME ?? site;

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

async function writeMarkdown(
  targetPath,
  markdownText,
  sourceName,
  sidebarHtml,
) {
  const tokens = marked.lexer(markdownText);
  const title = titleFromTokens(tokens, sourceName);
  const description = descriptionFromTokens(tokens);
  const htmlBody = marked.parse(markdownText);
  if (!(await pathExists(templatePath))) {
    throw new Error('Could not find the template.');
  }
  const template = await fs.readFile(templatePath, 'utf-8');
  const metaDescription = description
    ? `<meta name="description" content="${escapeHtml(description)}" />`
    : '';
  const html = template
    .replaceAll('{{title}}', escapeHtml(title))
    .replaceAll('{{metaDescription}}', metaDescription)
    .replaceAll('{{siteName}}', escapeHtml(siteName))
    .replaceAll('{{sidebar}}', sidebarHtml)
    .replaceAll('{{content}}', htmlBody);

  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, html);
}

async function copyDocsFrom(sourceDir, sidebarHtml) {
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
      await writeMarkdown(htmlPath, markdownText, fallbackTitle, sidebarHtml);
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

async function buildSidebarEntries() {
  const entries = [];
  for (const sourceDir of sourceDirs) {
    if (!(await pathExists(sourceDir))) {
      continue;
    }
    const files = await listFiles(sourceDir);
    for (const filePath of files) {
      if (!filePath.toLowerCase().endsWith('.md')) {
        continue;
      }
      const relativePath = path.relative(sourceDir, filePath);
      const outputPath = relativePath.replace(/\.md$/i, '.html');
      const markdownText = await fs.readFile(filePath, 'utf-8');
      const tokens = marked.lexer(markdownText);
      const title = titleFromTokens(tokens, path.basename(filePath, '.md'));
      entries.push({
        title,
        outputPath,
      });
    }
  }

  const seen = new Set();
  const uniqueEntries = entries.filter((entry) => {
    if (seen.has(entry.outputPath)) {
      return false;
    }
    seen.add(entry.outputPath);
    return true;
  });

  uniqueEntries.sort((a, b) => a.title.localeCompare(b.title));
  return uniqueEntries;
}

function renderSidebarHtml(entries) {
  const listItems = entries
    .map((entry) => {
      return `<li><a href="/docs/${entry.outputPath}">${escapeHtml(entry.title)}</a></li>`;
    })
    .join('');
  return `<h2>Docs</h2><ul>${listItems}</ul>`;
}

async function buildDocs() {
  const sidebarEntries = await buildSidebarEntries();
  const sidebarHtml = renderSidebarHtml(sidebarEntries);
  console.log(`[docs] site=${site}`);
  console.log(`[docs] output=${outputRoot}`);
  await ensureDir(outputRoot);
  await copyDocsFrom(sourceDirs[0], sidebarHtml);
  await copyDocsFrom(sourceDirs[1], sidebarHtml);
  console.log('[docs] done');
}

await buildDocs();
