import * as React from 'react';
import { T, A, $$, Hooks } from 'frontend';
import { useDiscardStagingPool } from 'frontend/hooks/music';
import { getDirName, splitOutFileExtension } from 'frontend/utils';
import { persistedState } from 'frontend/logic/persisted-state';
import {
  IMPORT_BITRATE_TOLERANCE_PERCENT,
  IMPORT_QUALITY_LEVELS,
  LOSSY_FORMATS,
  type ImportQualitySettings,
} from 'shared';
import {
  ORGANIZATION_PRESET_TEMPLATES,
  ORGANIZATION_TOKENS,
  getAlbumArtworkKey,
  resolveOrganizationPath,
} from 'shared/music';

const PATTERN_PARTS = /(\{[^}]*\}|\/)/;

function splitPattern(template: string): string[] {
  const pattern = template.startsWith('/') ? template : '/' + template;
  return pattern.split(PATTERN_PARTS).filter(Boolean);
}

interface RadioChoiceProps {
  name: string;
  checked: boolean;
  onChange(): void;
  id?: string;
  children: React.ReactNode;
}

export function RadioChoice({
  name,
  checked,
  onChange,
  id,
  children,
}: RadioChoiceProps) {
  return (
    <label className="musicOrganizeChoice">
      <input
        type="radio"
        id={id}
        name={name}
        checked={checked}
        onChange={onChange}
      />
      <span className="musicOrganizeChoiceBody">{children}</span>
    </label>
  );
}

interface ImportQualityPickerProps {
  idPrefix: string;
  value: ImportQualitySettings;
  onChange(value: ImportQualitySettings): void;
}

export function ImportQualityPicker({
  idPrefix,
  value,
  onChange,
}: ImportQualityPickerProps) {
  const selected = IMPORT_QUALITY_LEVELS.find(
    (level) => level.id === value.maximumQuality,
  );
  const isLossyLevel = selected !== undefined && selected.maxKbps !== null;
  const formatLabel =
    LOSSY_FORMATS.find((format) => format.id === value.lossyFormat)?.label ??
    '';

  return (
    <div className="musicOrganizeQuality">
      <fieldset className="musicOrganizeQualityGroup musicOrganizeChoiceList">
        {IMPORT_QUALITY_LEVELS.map((level) => {
          const id = `${idPrefix}-quality-${level.id}`;
          const detail =
            typeof level.detail === 'string'
              ? level.detail
              : level.detail[value.lossyFormat];
          return (
            <RadioChoice
              key={level.id}
              id={id}
              name={`${idPrefix}-maximum-quality`}
              checked={value.maximumQuality === level.id}
              onChange={() => onChange({ ...value, maximumQuality: level.id })}
            >
              <span className="musicOrganizeQualityLabel">
                <span className="musicOrganizeQualityName">{level.label}</span>
                <span className="musicOrganizeQualityDetail">{detail}</span>
              </span>
            </RadioChoice>
          );
        })}
      </fieldset>
      <div className="musicOrganizeQualitySide">
        {selected && (
          <div className="musicOrganizeQualityInfo">
            <p>{selected.description}</p>
            <ul className="musicOrganizeQualityHow">
              {getHowItWorks(selected, formatLabel).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {isLossyLevel && (
              <fieldset className="musicOrganizeQualityGroup musicOrganizeChoiceList musicOrganizeFormatGroup">
                <legend>Convert FLAC to</legend>
                {LOSSY_FORMATS.map((format) => {
                  const id = `${idPrefix}-lossy-format-${format.id}`;
                  return (
                    <RadioChoice
                      key={format.id}
                      id={id}
                      name={`${idPrefix}-lossy-format`}
                      checked={value.lossyFormat === format.id}
                      onChange={() =>
                        onChange({ ...value, lossyFormat: format.id })
                      }
                    >
                      <span className="musicOrganizeQualityName">
                        {format.label}
                      </span>
                    </RadioChoice>
                  );
                })}
              </fieldset>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getHowItWorks(
  level: (typeof IMPORT_QUALITY_LEVELS)[number],
  formatLabel: string,
): string[] {
  switch (level.id) {
    case 'original':
      return [
        'Files are imported exactly as they are, with nothing converted.',
      ];
    case 'lossless':
      return [
        'FLAC files above 16-bit / 44.1 kHz are reduced to CD quality.',
        'Other FLAC files, MP3s and m4a files are left alone.',
        'Converted originals are not kept.',
      ];
    default:
      return [
        `FLAC files are converted to ${formatLabel} at up to ${level.maxKbps} kbps.`,
        `MP3 and m4a files more than ${IMPORT_BITRATE_TOLERANCE_PERCENT}% above ${level.maxKbps} kbps are re-encoded in their own format, which slightly reduces quality.`,
        'Everything else is left alone.',
        'Converted originals are not kept.',
      ];
  }
}

function OrganizeCard({
  title,
  hint,
  className = '',
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`musicOrganizeCard ${className}`}>
      <div className="musicOrganizeCardTitle">{title}</div>
      {hint ? <p className="musicOrganizeCardHint">{hint}</p> : null}
      {children}
    </section>
  );
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

function getArtworkNotices(
  tracks: T.TrackMetadata[],
  resolveTrackPath: (track: T.TrackMetadata) => string,
): string[] {
  const artworkPathsByFolder = new Map<string, Set<string>>();
  const albumsByArtworkPath = new Map<string, Map<string, string>>();
  for (const track of tracks) {
    if (!track.folderArtworkPath) {
      continue;
    }
    const folder = getDirName(resolveTrackPath(track));
    const artworkPaths = artworkPathsByFolder.get(folder) ?? new Set<string>();
    artworkPaths.add(track.folderArtworkPath);
    artworkPathsByFolder.set(folder, artworkPaths);
    const key = getAlbumArtworkKey(track);
    if (key !== null) {
      const albums =
        albumsByArtworkPath.get(track.folderArtworkPath) ??
        new Map<string, string>();
      albums.set(key, track.album ?? '');
      albumsByArtworkPath.set(track.folderArtworkPath, albums);
    }
  }
  const notices: string[] = [];
  for (const [folder, artworkPaths] of artworkPathsByFolder) {
    if (artworkPaths.size > 1) {
      notices.push(
        `Different covers would land in ${folder}, so no cover will be written there.`,
      );
    }
  }
  for (const albums of albumsByArtworkPath.values()) {
    if (albums.size > 1) {
      notices.push(
        `One cover is shared by ${[...albums.values()].join(', ')} and will be written to each album's folder.`,
      );
    }
  }
  return notices;
}

type TreeRow = { kind: 'folder' | 'file'; name: string; depth: number };

interface TreeFolder {
  folders: Map<string, TreeFolder>;
  files: string[];
}

function buildTreeRows(paths: string[]): TreeRow[] {
  const root: TreeFolder = { folders: new Map(), files: [] };
  for (const path of paths) {
    const segments = path.split('/').filter(Boolean);
    const fileName = segments.pop();
    if (fileName === undefined) {
      continue;
    }
    let folder = root;
    for (const segment of segments) {
      let next = folder.folders.get(segment);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(segment, next);
      }
      folder = next;
    }
    folder.files.push(fileName);
  }
  const rows: TreeRow[] = [];
  function walk(folder: TreeFolder, depth: number) {
    for (const [name, child] of folder.folders) {
      rows.push({ kind: 'folder', name, depth });
      walk(child, depth + 1);
    }
    for (const name of folder.files) {
      rows.push({ kind: 'file', name, depth });
    }
  }
  walk(root, 0);
  return rows;
}

function OrganizeTree({ paths }: { paths: string[] }) {
  return (
    <ul className="musicOrganizeTree" aria-label="Organized folders">
      {buildTreeRows(paths).map((row, index) => (
        <li
          key={index}
          className="musicOrganizeTreeRow"
          style={{ '--tree-depth': row.depth } as React.CSSProperties}
        >
          <span
            className={`musicOrganizeTreeIcon musicOrganizeTreeIcon-${row.kind}`}
            aria-hidden="true"
          />
          {row.name}
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
  const importQuality = $$.getMusicImportQuality();
  const { discardConfirmPending, handleDiscardClick } = useDiscardStagingPool();
  const [savedPattern] = React.useState(() =>
    persistedState.musicOrganizePattern.read(),
  );
  const [template, setTemplate] = React.useState(
    () => savedPattern?.template ?? ORGANIZATION_PRESET_TEMPLATES[0],
  );
  const [customSelected, setCustomSelected] = React.useState(
    () => savedPattern?.custom ?? false,
  );
  const [collisionCount, setCollisionCount] = React.useState(0);
  const [committing, setCommitting] = React.useState(false);
  const [remainingTracks, setRemainingTracks] =
    React.useState<T.TrackMetadata[]>(tracks);

  React.useEffect(() => {
    persistedState.musicOrganizePattern.write({
      template,
      custom: customSelected,
    });
  }, [template, customSelected]);

  function resolveTrackPath(track: T.TrackMetadata) {
    return resolveOrganizationPath(
      template,
      track,
      splitOutFileExtension(track.path).extension,
    );
  }

  const artworkNotices = getArtworkNotices(remainingTracks, resolveTrackPath);

  function changeTemplate(next: string) {
    setTemplate(next);
    setCollisionCount(0);
  }

  function selectPreset(preset: string) {
    changeTemplate(preset);
    setCustomSelected(false);
  }

  async function handleDoneClick() {
    setCommitting(true);
    const destinations: Record<string, string> = {};
    for (const track of remainingTracks) {
      destinations[track.path] = resolveTrackPath(track);
    }
    const result = await dispatch(A.commitStagingPoolTracks(destinations));
    const collisionSet = new Set(result.collisions);
    setCollisionCount(collisionSet.size);
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
        <div className="musicOrganizeCards">
          <OrganizeCard title="Organize files">
            <div
              className="musicOrganizePresetList musicOrganizeChoiceList"
              role="radiogroup"
              aria-label="Filename format"
            >
              {ORGANIZATION_PRESET_TEMPLATES.map((preset) => (
                <div key={preset} className="musicOrganizePreset">
                  <RadioChoice
                    name="organizePreset"
                    checked={!customSelected && template === preset}
                    onChange={() => selectPreset(preset)}
                  >
                    <PatternText pattern={preset} />
                  </RadioChoice>
                </div>
              ))}
              <div className="musicOrganizePreset">
                <RadioChoice
                  name="organizePreset"
                  checked={customSelected}
                  onChange={() => setCustomSelected(true)}
                >
                  <span className="musicOrganizePresetCustomLabel">
                    Custom…
                    <span
                      className="musicOrganizePresetChevron"
                      aria-hidden="true"
                    />
                  </span>
                </RadioChoice>
                {customSelected ? (
                  <div className="musicOrganizePresetCustom">
                    <input
                      className="musicOrganizeTemplateInput"
                      type="text"
                      value={template}
                      onChange={(event) => changeTemplate(event.target.value)}
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
          </OrganizeCard>
          <OrganizeCard title="Audio quality">
            <ImportQualityPicker
              idPrefix="organize"
              value={importQuality}
              onChange={(value) => dispatch(A.setMusicImportQuality(value))}
            />
          </OrganizeCard>
        </div>
        <OrganizeCard title="Preview" className="musicOrganizeCardPreview">
          {collisionCount > 0 ? (
            <div className="musicOrganizePreviewCollision" role="alert">
              {collisionCount === 1
                ? '1 file already exists at its destination'
                : `${collisionCount} files already exist at their destinations`}{' '}
              — choose a different pattern and save again
            </div>
          ) : null}
          {artworkNotices.map((notice) => (
            <div
              key={notice}
              className="musicOrganizePreviewNotice"
              role="status"
            >
              {notice}
            </div>
          ))}
          <OrganizeTree paths={remainingTracks.map(resolveTrackPath)} />
        </OrganizeCard>
      </div>
    </div>
  );
}
