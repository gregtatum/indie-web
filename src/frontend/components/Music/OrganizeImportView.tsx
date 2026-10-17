import * as React from 'react';
import { T, A, Hooks } from 'frontend';
import { useDiscardStagingPool } from 'frontend/hooks/music';
import { splitOutFileExtension } from 'frontend/utils';
import {
  ORGANIZATION_PRESET_TEMPLATES,
  ORGANIZATION_TOKENS,
  resolveOrganizationPath,
  sanitizeFilenameSegment,
} from 'shared/music';

const EXAMPLE_TRACKS: ReadonlyArray<T.OrganizationTrackFields> = [
  {
    genre: 'Rock',
    artist: 'Fleetwood Mac',
    albumArtist: 'Fleetwood Mac',
    album: 'Rumours',
    year: '1977',
    title: 'Dreams',
    track: 2,
    composer: null,
  },
  {
    genre: 'Rock',
    artist: 'Jimi Hendrix',
    albumArtist: 'Jimi Hendrix',
    album: 'Are You Experienced',
    year: '1967',
    title: 'Hey Joe',
    track: 3,
    composer: null,
  },
  {
    genre: 'Rock',
    artist: 'Led Zeppelin',
    albumArtist: 'Led Zeppelin',
    album: 'Houses of the Holy',
    year: '1973',
    title: 'The Rain Song',
    track: 2,
    composer: null,
  },
  {
    genre: 'Rock',
    artist: 'Pink Floyd',
    albumArtist: 'Pink Floyd',
    album: 'The Dark Side of the Moon',
    year: '1973',
    title: 'Money',
    track: 6,
    composer: null,
  },
  {
    genre: 'Rock',
    artist: 'Queen',
    albumArtist: 'Queen',
    album: 'A Night at the Opera',
    year: '1975',
    title: 'Bohemian Rhapsody',
    track: 11,
    composer: null,
  },
  {
    genre: 'Rock',
    artist: 'The Eagles',
    albumArtist: 'The Eagles',
    album: 'Hotel California',
    year: '1976',
    title: 'Hotel California',
    track: 1,
    composer: null,
  },
];

const PATTERN_PARTS = /(\{[^}]*\}|\/)/;

function splitPattern(template: string): string[] {
  const pattern = template.startsWith('/') ? template : '/' + template;
  return pattern.split(PATTERN_PARTS).filter(Boolean);
}

function PatternText({ pattern }: { pattern: string }) {
  return (
    <span>
      {splitPattern(pattern).map((part, index) => {
        if (part === '/') {
          return (
            <span key={index} className="musicOrganizePatternSlash">
              /
            </span>
          );
        }
        if (part.startsWith('{') && part.endsWith('}')) {
          const name = part.slice(1, -1);
          return (
            <span
              key={index}
              className="musicOrganizePatternPill"
              data-token={name}
            >
              <span className="musicOrganizePatternBrace">{'{'}</span>
              <span className="musicOrganizePatternToken">{name}</span>
              <span className="musicOrganizePatternBrace">{'}'}</span>
            </span>
          );
        }
        return (
          <span key={index} className="musicOrganizePatternLiteral">
            {part}
          </span>
        );
      })}
    </span>
  );
}

function ExamplePath({
  template,
  track,
}: {
  template: string;
  track: T.OrganizationTrackFields;
}) {
  return (
    <>
      {splitPattern(template).map((part, index) => {
        const token = ORGANIZATION_TOKENS.find((t) => t.token === part);
        if (token) {
          return (
            <span
              key={index}
              className="musicOrganizeExampleValue"
              data-token={part.slice(1, -1)}
            >
              {sanitizeFilenameSegment(token.getValue(track))}
            </span>
          );
        }
        return (
          <span key={index} className="musicOrganizeExampleSeparator">
            {part}
          </span>
        );
      })}
      <span className="musicOrganizeExampleSeparator">.mp3</span>
    </>
  );
}

function OrganizeExamples({ template }: { template: string }) {
  return (
    <ul className="musicOrganizeExamples">
      {EXAMPLE_TRACKS.map((track) => (
        <li key={track.album}>
          <ExamplePath template={template} track={track} />
        </li>
      ))}
    </ul>
  );
}

export function OrganizeImportView({
  tracks,
  onBack,
  onClose,
}: {
  tracks: T.TrackMetadata[];
  onBack: () => void;
  onClose: () => void;
}) {
  const dispatch = Hooks.useDispatch();
  const { discardConfirmPending, handleDiscardClick } = useDiscardStagingPool();
  const [template, setTemplate] = React.useState(
    () => ORGANIZATION_PRESET_TEMPLATES[0],
  );
  const [customSelected, setCustomSelected] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Map<string, string>>(
    new Map(),
  );
  const [collisionPaths, setCollisionPaths] = React.useState<Set<string>>(
    new Set(),
  );
  const [committing, setCommitting] = React.useState(false);
  const [remainingTracks, setRemainingTracks] =
    React.useState<T.TrackMetadata[]>(tracks);

  function selectPreset(preset: string) {
    setTemplate(preset);
    setCustomSelected(false);
  }

  function setOverride(path: string, value: string, computedPath: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (value === computedPath) {
        next.delete(path);
      } else {
        next.set(path, value);
      }
      return next;
    });
  }

  function resetOverride(path: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }

  async function handleDoneClick() {
    setCommitting(true);
    const destinations: Record<string, string> = {};
    for (const track of remainingTracks) {
      destinations[track.path] =
        overrides.get(track.path) ??
        resolveOrganizationPath(
          template,
          track,
          splitOutFileExtension(track.path).extension,
        );
    }
    const result = await dispatch(A.commitStagingPoolTracks(destinations));
    const collisionSet = new Set(result.collisions);
    setCollisionPaths(collisionSet);
    setCommitting(false);
    if (collisionSet.size === 0) {
      onBack();
      return;
    }
    setRemainingTracks((prev) =>
      prev.filter((track) => collisionSet.has(track.path)),
    );
  }

  return (
    <div className="musicBatchEditView">
      <div className="musicBatchEditHeader">
        <h2 className="musicBatchEditHeaderTitle">
          Organize · {remainingTracks.length}{' '}
          {remainingTracks.length === 1 ? 'track' : 'tracks'}
        </h2>
        <div className="musicImportBatchHeaderActions">
          <button
            type="button"
            className="button"
            onClick={onBack}
            disabled={committing}
          >
            ← Back
          </button>
          {discardConfirmPending ? (
            <span className="musicImportDiscardWarning">
              Click again to discard
            </span>
          ) : null}
          <button
            type="button"
            className="button"
            onClick={handleDiscardClick}
            disabled={committing}
          >
            Discard
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void handleDoneClick()}
            disabled={committing}
          >
            {committing ? 'Organizing…' : 'Save'}
          </button>
          <button
            type="button"
            className="musicBatchEditCloseButton"
            aria-label="Back to library"
            onClick={onClose}
            disabled={committing}
          >
            <img src="/svg/xmark.svg" alt="" />
          </button>
        </div>
      </div>
      <div className="musicBatchEditBody musicOrganizeBody">
        <div className="musicOrganizeTemplateSection">
          <div className="musicOrganizeSectionLabel">Organize files</div>
          <div
            className="musicOrganizePresetList"
            role="radiogroup"
            aria-label="Filename format"
          >
            {ORGANIZATION_PRESET_TEMPLATES.map((preset) => (
              <div key={preset} className="musicOrganizePreset">
                <label className="musicOrganizePresetPattern">
                  <input
                    type="radio"
                    name="organizePreset"
                    checked={!customSelected && template === preset}
                    onChange={() => selectPreset(preset)}
                  />
                  <PatternText pattern={preset} />
                </label>
              </div>
            ))}
            <div className="musicOrganizePreset">
              <label className="musicOrganizePresetPattern">
                <input
                  type="radio"
                  name="organizePreset"
                  checked={customSelected}
                  onChange={() => setCustomSelected(true)}
                />
                Custom…
                <span
                  className="musicOrganizePresetChevron"
                  aria-hidden="true"
                />
              </label>
              {customSelected ? (
                <div className="musicOrganizePresetCustom">
                  <input
                    className="musicOrganizeTemplateInput"
                    type="text"
                    value={template}
                    onChange={(event) => setTemplate(event.target.value)}
                    aria-label="Naming template"
                  />
                  <div className="musicOrganizeTokenList">
                    {ORGANIZATION_TOKENS.map((t) => (
                      <span
                        key={t.token}
                        className="musicOrganizeTokenChip"
                        data-token={t.token.slice(1, -1)}
                      >
                        {t.token}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="musicOrganizeSectionLabel">Example</div>
          <OrganizeExamples template={template} />
        </div>
        <div className="musicOrganizePreviewSection">
          <div className="musicOrganizeSectionLabel">Preview</div>
          <div className="musicOrganizePreviewHeader" aria-hidden="true">
            <span>Current name</span>
            <span />
            <span>Destination</span>
            <span />
          </div>
          <div className="musicOrganizePreviewList">
            {remainingTracks.map((track) => {
              const computedPath = resolveOrganizationPath(
                template,
                track,
                splitOutFileExtension(track.path).extension,
              );
              const overridden = overrides.get(track.path);
              const destPath = overridden ?? computedPath;
              const hasCollision = collisionPaths.has(track.path);
              return (
                <div key={track.path} className="musicOrganizePreviewItem">
                  <div className="musicOrganizePreviewRow">
                    <span className="musicOrganizePreviewSource">
                      {track.title ?? track.path}
                    </span>
                    <span
                      className="musicOrganizePreviewArrow"
                      aria-hidden="true"
                    >
                      →
                    </span>
                    <input
                      className={
                        'musicOrganizePreviewDest' +
                        (hasCollision ? ' error' : '')
                      }
                      type="text"
                      value={destPath}
                      aria-label={`Destination path for ${track.title ?? track.path}`}
                      onChange={(event) => {
                        setCollisionPaths((prev) => {
                          if (!prev.has(track.path)) {
                            return prev;
                          }
                          const next = new Set(prev);
                          next.delete(track.path);
                          return next;
                        });
                        setOverride(
                          track.path,
                          event.target.value,
                          computedPath,
                        );
                      }}
                    />
                    {overridden !== undefined ? (
                      <button
                        type="button"
                        className="musicOrganizePreviewResetButton"
                        aria-label={`Reset ${track.title ?? track.path} to the template path`}
                        onClick={() => resetOverride(track.path)}
                      >
                        ↺
                      </button>
                    ) : null}
                  </div>
                  {hasCollision ? (
                    <div className="musicOrganizePreviewCollision">
                      Already exists — change the name or path and retry
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
