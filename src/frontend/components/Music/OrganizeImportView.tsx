import * as React from 'react';
import { T, A, Hooks } from 'frontend';
import { useDiscardStagingPool } from 'frontend/hooks/music';
import {
  ORGANIZATION_PRESET_TEMPLATES,
  ORGANIZATION_TOKENS,
  resolveOrganizationPath,
} from 'shared/music';

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
  const [overrides, setOverrides] = React.useState<Map<string, string>>(
    new Map(),
  );
  const [collisionPaths, setCollisionPaths] = React.useState<Set<string>>(
    new Set(),
  );
  const [committing, setCommitting] = React.useState(false);
  const [remainingTracks, setRemainingTracks] =
    React.useState<T.TrackMetadata[]>(tracks);

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
        overrides.get(track.path) ?? resolveOrganizationPath(template, track);
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
          <div className="musicOrganizeSectionLabel">Filename format</div>
          <div className="musicOrganizeTemplateRow">
            <input
              className="musicOrganizeTemplateInput"
              type="text"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              aria-label="Naming template"
            />
            <select
              className="musicOrganizePresetsSelect"
              value=""
              aria-label="Insert a preset filename format"
              onChange={(event) => {
                if (event.target.value) {
                  setTemplate(event.target.value);
                }
              }}
            >
              <option value="">Presets</option>
              {ORGANIZATION_PRESET_TEMPLATES.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </div>
          <div className="musicOrganizeTokenList">
            {ORGANIZATION_TOKENS.map((t) => (
              <span key={t.token} className="musicOrganizeTokenChip">
                {t.token}
              </span>
            ))}
          </div>
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
              const computedPath = resolveOrganizationPath(template, track);
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
