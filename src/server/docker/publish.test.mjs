import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bumpVersion, dockerTags, parsePublishArgs } from './publish.mjs';

describe('docker publish helpers', () => {
  it('parses a positional patch bump with dry-run', () => {
    assert.deepEqual(parsePublishArgs(['patch', '--dry-run']), {
      bump: 'patch',
      dryRun: true,
    });
  });

  it('parses dry-run before the bump', () => {
    assert.deepEqual(parsePublishArgs(['--dry-run', 'minor']), {
      bump: 'minor',
      dryRun: true,
    });
  });

  it('rejects missing bump arguments', () => {
    assert.throws(
      () => parsePublishArgs(['--dry-run']),
      /Missing version bump/,
    );
  });

  it('rejects unknown arguments', () => {
    assert.throws(() => parsePublishArgs(['patch', '--nope']), /Unknown/);
  });

  it('rejects multiple bump arguments', () => {
    assert.throws(
      () => parsePublishArgs(['minor', 'patch']),
      /exactly one version bump/,
    );
  });

  it('bumps semantic versions', () => {
    assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
    assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
    assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  });

  it('rejects non-semver versions', () => {
    assert.throws(() => bumpVersion('1.2', 'patch'), /Invalid/);
  });

  it('builds Docker tag aliases from a version', () => {
    assert.deepEqual(dockerTags('1.2.3'), [
      'tatumcreative/floppydisk.link:1.2.3',
      'tatumcreative/floppydisk.link:1.2',
      'tatumcreative/floppydisk.link:1',
      'tatumcreative/floppydisk.link:latest',
    ]);
  });
});
