import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const rootDir = path.join(
  process.cwd(),
  'src',
  'frontend',
  'logic',
  'chordpo-lang',
);
const grammarPath = path.join(rootDir, 'syntax.grammar');
const generatedParserJs = path.join(rootDir, 'syntax.grammar.js');
const generatedTermsJs = path.join(rootDir, 'syntax.grammar.terms.js');
const generatedParserTs = path.join(rootDir, 'syntax.grammar.ts');
const generatedTermsTs = path.join(rootDir, 'syntax.grammar.terms.ts');
const generatorPath = path.join(
  rootDir,
  '..',
  '..',
  '..',
  '..',
  'node_modules',
  '@lezer',
  'generator',
  'src',
  'lezer-generator.cjs',
);

/**
 * @param {string} message
 */
function logStep(message) {
  console.log(`[chordpo-lang] ${message}`);
}

function runGenerator() {
  logStep(`Generating parser from ${grammarPath}`);
  const result = spawnSync(
    'node',
    [generatorPath, grammarPath, '--output', generatedParserJs],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    logStep('Lezer generator failed.');
    process.exit(result.status ?? 1);
  }
  logStep(`Wrote ${generatedParserJs} and ${generatedTermsJs}`);
}

function rewriteParserImport() {
  logStep(`Rewriting token import in ${generatedParserJs}`);
  const contents = fs.readFileSync(generatedParserJs, 'utf8');
  const updated = contents.replace('./tokens.js', './tokens');
  fs.writeFileSync(generatedParserJs, updated);
}

function finalizeOutputs() {
  logStep(`Renaming ${generatedParserJs} -> ${generatedParserTs}`);
  logStep(`Renaming ${generatedTermsJs} -> ${generatedTermsTs}`);
  fs.renameSync(generatedParserJs, generatedParserTs);
  fs.renameSync(generatedTermsJs, generatedTermsTs);
}

// Build Lezer parser + term tokens from syntax.grammar.
// We keep TypeScript files so webpack/babel can compile them.
logStep(`Using generator at ${generatorPath}`);
runGenerator();
rewriteParserImport();
finalizeOutputs();
logStep('Done.');
