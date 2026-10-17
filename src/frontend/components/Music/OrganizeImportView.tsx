import * as React from 'react';
import { T, A, Hooks } from 'frontend';
import { useDiscardStagingPool } from 'frontend/hooks/music';
import { splitOutFileExtension } from 'frontend/utils';
import {
  ORGANIZATION_PRESET_TEMPLATES,
  ORGANIZATION_TOKENS,
  resolveOrganizationPath,
} from 'shared/music';

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
  const { discardConfirmPending, handleDiscardClick } = useDiscardStagingPool();
  const [template, setTemplate] = React.useState(
    () => ORGANIZATION_PRESET_TEMPLATES[0],
  );
  const [customSelected, setCustomSelected] = React.useState(false);
  const [collisionCount, setCollisionCount] = React.useState(0);
  const [committing, setCommitting] = React.useState(false);
  const [remainingTracks, setRemainingTracks] =
    React.useState<T.TrackMetadata[]>(tracks);

  function resolveTrackPath(track: T.TrackMetadata) {
    return resolveOrganizationPath(
      template,
      track,
      splitOutFileExtension(track.path).extension,
    );
  }

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
        </div>
        <div className="musicOrganizePreviewSection">
          <div className="musicOrganizeSectionLabel">Preview</div>
          {collisionCount > 0 ? (
            <div className="musicOrganizePreviewCollision" role="alert">
              {collisionCount === 1
                ? '1 file already exists at its destination'
                : `${collisionCount} files already exist at their destinations`}{' '}
              — choose a different pattern and save again
            </div>
          ) : null}
          <OrganizeTree paths={remainingTracks.map(resolveTrackPath)} />
        </div>
      </div>
    </div>
  );
}
