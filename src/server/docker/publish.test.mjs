import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bumpVersion,
  dockerTags,
  hasUnreleasedChangelogEntry,
  isVersionPending,
  parsePublishArgs,
  promoteUnreleasedChangelog,
} from './publish.mjs';

describe('docker publish helpers', () => {
  it('parses a positional patch bump with dry-run', () => {
    assert.deepEqual(parsePublishArgs(['patch', '--dry-run']), {
      bump: 'patch',
      dryRun: true,
      forceBump: false,
    });
  });

  it('parses dry-run before the bump', () => {
    assert.deepEqual(parsePublishArgs(['--dry-run', 'minor']), {
      bump: 'minor',
      dryRun: true,
      forceBump: false,
    });
  });

  it('parses --force-bump', () => {
    assert.deepEqual(parsePublishArgs(['patch', '--force-bump']), {
      bump: 'patch',
      dryRun: false,
      forceBump: true,
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

  it('is pending when the release commit exists but the tag never reached origin', () => {
    assert.equal(
      isVersionPending({ releaseCommitExists: true, taggedOnOrigin: false }),
      true,
    );
  });

  it('is not pending once the tag is fully pushed, even with a release commit', () => {
    assert.equal(
      isVersionPending({ releaseCommitExists: true, taggedOnOrigin: true }),
      false,
    );
  });

  it('is not pending when no release commit has been made yet', () => {
    assert.equal(
      isVersionPending({ releaseCommitExists: false, taggedOnOrigin: false }),
      false,
    );
  });

  it('is not pending when the tag exists without a matching local commit', () => {
    assert.equal(
      isVersionPending({ releaseCommitExists: false, taggedOnOrigin: true }),
      false,
    );
  });

  it('finds an unreleased changelog entry under a subheading', () => {
    assert.equal(
      hasUnreleasedChangelogEntry(
        [
          '## [Unreleased]',
          '',
          '### Added',
          '',
          '- Multi-arch Docker builds.',
          '',
          '## [2.0.0] - 2026-06-12',
        ].join('\n'),
      ),
      true,
    );
  });

  it('rejects an unreleased section with no bullets', () => {
    assert.equal(
      hasUnreleasedChangelogEntry(
        [
          '## [Unreleased]',
          '',
          '## [2.0.0] - 2026-06-12',
          '',
          '- old entry',
        ].join('\n'),
      ),
      false,
    );
  });

  it('rejects an unreleased section with only a subheading', () => {
    assert.equal(
      hasUnreleasedChangelogEntry(
        ['## [Unreleased]', '', '### Added', '', '## [2.0.0]'].join('\n'),
      ),
      false,
    );
  });

  it('rejects a changelog missing the Unreleased heading entirely', () => {
    assert.equal(
      hasUnreleasedChangelogEntry(
        ['## [2.0.0] - 2026-06-12', '', '- Some entry'].join('\n'),
      ),
      false,
    );
  });

  it('finds an entry when Unreleased is the last section in the file', () => {
    assert.equal(
      hasUnreleasedChangelogEntry(
        ['## [Unreleased]', '', '- Last section, no trailing heading.'].join(
          '\n',
        ),
      ),
      true,
    );
  });

  it('promotes the Unreleased body into a new dated version section', () => {
    const changelog = [
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- Multi-arch Docker builds.',
      '',
      '## [2.0.0] - 2026-06-12',
      '',
      '### Fixed',
      '',
      '- Something old.',
      '',
      '[unreleased]: https://github.com/gregtatum/indie-web/compare/v2.0.0...HEAD',
      '[2.0.0]: https://github.com/gregtatum/indie-web/compare/v1.0.0...v2.0.0',
    ].join('\n');

    const result = promoteUnreleasedChangelog(changelog, {
      version: '2.1.0',
      date: '2026-08-10',
    });

    assert.equal(
      result,
      [
        '## [Unreleased]',
        '',
        '## [2.1.0] - 2026-08-10',
        '',
        '### Added',
        '',
        '- Multi-arch Docker builds.',
        '',
        '## [2.0.0] - 2026-06-12',
        '',
        '### Fixed',
        '',
        '- Something old.',
        '',
        '[unreleased]: https://github.com/gregtatum/indie-web/compare/v2.1.0...HEAD',
        '[2.1.0]: https://github.com/gregtatum/indie-web/compare/v2.0.0...v2.1.0',
        '[2.0.0]: https://github.com/gregtatum/indie-web/compare/v1.0.0...v2.0.0',
      ].join('\n'),
    );
  });

  it('throws when promoting a changelog with no Unreleased section', () => {
    assert.throws(
      () =>
        promoteUnreleasedChangelog(['## [2.0.0]', '', '- old'].join('\n'), {
          version: '2.1.0',
          date: '2026-08-10',
        }),
      /no "## \[Unreleased\]" section/,
    );
  });

  it('throws when promoting a changelog with no prior version section', () => {
    assert.throws(
      () =>
        promoteUnreleasedChangelog(
          ['## [Unreleased]', '', '- new entry'].join('\n'),
          { version: '1.0.0', date: '2026-08-10' },
        ),
      /no prior "## \[x\.y\.z\]" section/,
    );
  });
});
