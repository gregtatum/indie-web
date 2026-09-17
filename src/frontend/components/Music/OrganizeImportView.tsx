import * as React from 'react';
import { T, A, Hooks } from 'frontend';
import { debounce } from 'shared/utils';
import {
  ORGANIZATION_PRESET_TEMPLATES,
  ORGANIZATION_TOKENS,
  resolveOrganizationPath,
} from 'shared/music';
import { useMusicImportDiscardConfirm } from 'frontend/hooks/music';

const TEMPLATE_PERSIST_DELAY = 400;

export function OrganizeImportView({ batch }: { batch: T.MusicImportBatch }) {
  const dispatch = Hooks.useDispatch();
  const [template, setTemplateState] = React.useState(
    () => batch.template || ORGANIZATION_PRESET_TEMPLATES[0],
  );
  const [overrides, setOverrides] = React.useState<Map<string, string>>(
    new Map(),
  );
  const [collisionPaths, setCollisionPaths] = React.useState<Set<string>>(
    new Set(),
  );
  const [committing, setCommitting] = React.useState(false);

  const { discardConfirmPending, handleDiscardOrEscape } =
    useMusicImportDiscardConfirm(batch.batchId);

  function persistTemplateNow(nextTemplate: string) {
    persistTemplateDebounced.cancel();
    void dispatch(
      A.updateMusicImportBatchStep(batch.batchId, 'organizing', nextTemplate),
    );
  }

  const persistTemplateDebounced = React.useMemo(
    () => debounce(persistTemplateNow, TEMPLATE_PERSIST_DELAY),
    [dispatch, batch.batchId],
  );
  React.useEffect(
    () => persistTemplateDebounced.cancel,
    [persistTemplateDebounced],
  );

  React.useEffect(() => {
    if (!batch.template) {
      persistTemplateNow(template);
    }
  }, []);

  // Free-text edits are debounced so every keystroke doesn't hit the server;
  // a preset click or navigating away persists immediately instead.
  function setTemplate(value: string) {
    setTemplateState(value);
    persistTemplateDebounced(value);
  }

  function selectPreset(preset: string) {
    setTemplateState(preset);
    persistTemplateNow(preset);
  }

  function handleBackClick() {
    persistTemplateDebounced.cancel();
    void dispatch(
      A.updateMusicImportBatchStep(batch.batchId, 'editing', template),
    );
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
    for (const track of batch.tracks) {
      destinations[track.path] =
        overrides.get(track.path) ?? resolveOrganizationPath(template, track);
    }
    const result = await dispatch(
      A.commitMusicImportBatch(batch.batchId, destinations),
    );
    setCollisionPaths(new Set(result.collisions));
    setCommitting(false);
  }

  return (
    <div className="musicBatchEditView">
      <div className="musicBatchEditHeader">
        <h2 className="musicBatchEditHeaderTitle">
          Organize · {batch.tracks.length}{' '}
          {batch.tracks.length === 1 ? 'track' : 'tracks'}
        </h2>
        <div className="musicImportBatchHeaderActions">
          {discardConfirmPending ? (
            <span className="musicImportDiscardWarning">
              Click again to discard
            </span>
          ) : null}
          <button
            type="button"
            className="musicBatchEditCloseButton"
            aria-label="Discard staged import"
            onClick={handleDiscardOrEscape}
          >
            <img src="/svg/xmark.svg" alt="" />
          </button>
          <button
            type="button"
            className="button"
            onClick={handleBackClick}
            disabled={committing}
          >
            Back to edit
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void handleDoneClick()}
            disabled={committing}
          >
            {committing ? 'Organizing…' : 'Done'}
          </button>
        </div>
      </div>
      <div className="musicBatchEditBody musicOrganizeBody">
        <div className="musicOrganizeTemplateSection">
          <div className="musicOrganizePresets">
            {ORGANIZATION_PRESET_TEMPLATES.map((preset) => (
              <button
                key={preset}
                type="button"
                className={
                  'musicOrganizePresetButton' +
                  (template === preset ? ' active' : '')
                }
                onClick={() => selectPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            className="musicOrganizeTemplateInput"
            type="text"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            aria-label="Naming template"
          />
          <div className="musicOrganizeTokenHint">
            Tokens: {ORGANIZATION_TOKENS.map((t) => t.token).join(' ')}
          </div>
        </div>
        <div className="musicOrganizePreviewList">
          {batch.tracks.map((track) => {
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
                      setOverride(track.path, event.target.value, computedPath);
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
  );
}
