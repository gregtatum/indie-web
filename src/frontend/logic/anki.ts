import { Document, isCollection, isMap, isSeq, parseDocument } from 'yaml';
import * as T from 'frontend/@types';
import { splitFrontmatter } from 'frontend/logic/parse-anki';

const MAX_WEAK_TERMS = 10;
const DEFAULT_DECK = 'default';

/**
 * Records a finished study run in the `anki` section of the file's YAML
 * frontmatter, and returns the new file text. Returns null when the existing
 * frontmatter can't be safely edited.
 *
 *   anki:
 *     French::Basics:
 *       weak: [bonjour]
 *       runs:
 *         - { at: 2026-10-30T17:12Z, first: 8, of: 10, answers: 14, seconds: 142 }
 */
export function addAnkiRun(
  text: string,
  update: T.AnkiRunUpdate,
): string | null {
  const { frontmatter, body } = splitFrontmatter(text);
  const doc =
    frontmatter === null ? new Document({}) : parseDocument(frontmatter);
  if (
    doc.errors.length > 0 ||
    (doc.contents !== null && !isMap(doc.contents))
  ) {
    return null;
  }

  const deckPath = ['anki', update.deck ?? DEFAULT_DECK];
  if (doc.getIn(deckPath) !== undefined && !isMap(doc.getIn(deckPath))) {
    return null;
  }

  const weak = nextWeakTerms(
    readStrings(doc.getIn([...deckPath, 'weak'])),
    update,
  );
  if (weak.length > 0) {
    doc.setIn([...deckPath, 'weak'], flow(doc, weak));
  } else if (doc.hasIn([...deckPath, 'weak'])) {
    doc.deleteIn([...deckPath, 'weak']);
  }

  const run = flow(doc, {
    at: new Date().toISOString().slice(0, 16) + 'Z',
    ...update.run,
    ...(update.retry ? { retry: true } : null),
  });
  const runs = doc.getIn([...deckPath, 'runs']);
  if (isSeq(runs)) {
    runs.add(run);
  } else if (runs === undefined) {
    doc.setIn([...deckPath, 'runs'], doc.createNode([run]));
  } else {
    return null;
  }

  const yaml = doc.toString({ lineWidth: 0 });
  return `---\n${yaml}---\n${body}`;
}

function flow<V>(doc: Document, value: V) {
  const node = doc.createNode(value);
  if (isCollection(node)) {
    node.flow = true;
  }
  return node;
}

function readStrings(node: unknown): string[] {
  if (!isSeq(node)) {
    return [];
  }
  return (node.toJSON() as unknown[]).filter(
    (item): item is string => typeof item === 'string',
  );
}

function nextWeakTerms(previous: string[], update: T.AnkiRunUpdate): string[] {
  const current = new Set(update.current);
  const missed = new Set(update.missed);
  const cleared = update.retry ? new Set<string>() : new Set(update.clean);
  return [
    ...previous.filter(
      (term) => current.has(term) && !missed.has(term) && !cleared.has(term),
    ),
    ...update.missed,
  ].slice(-MAX_WEAK_TERMS);
}
