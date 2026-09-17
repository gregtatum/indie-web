import * as React from 'react';
import { T, A, Hooks } from 'frontend';
import { debounce } from 'shared/utils';
import { ORGANIZATION_TOKENS, resolveOrganizationPath } from 'shared/music';
import { useMusicImportDiscardConfirm } from 'frontend/hooks/music';

const PRESET_TEMPLATES = [
  '{Genre}/{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}',
  '{Genre}/{Artist}/{AlbumArtist}/{Track} - {Title}',
  '{Artist}/{Year} - {AlbumArtist}/{Track} - {Title}',
  '{Artist}/{AlbumArtist}/{Track} - {Title}',
];

const TEMPLATE_PERSIST_DELAY = 400;

export function OrganizeImportView({ batch }: { batch: T.MusicImportBatch }) {
  const dispatch = Hooks.useDispatch();
  const [template, setTemplateState] = React.useState(
    () => batch.template || PRESET_TEMPLATES[0],
  );
  const [overrides, setOverrides] = React.useState<Map<string, string>>(
    new Map(),
  );

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
            className="musicImportPrimaryButton"
            onClick={handleBackClick}
          >
            Back to edit
          </button>
        </div>
      </div>
      <div className="musicBatchEditBody musicOrganizeBody">
        <div className="musicOrganizeTemplateSection">
          <div className="musicOrganizePresets">
            {PRESET_TEMPLATES.map((preset) => (
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
            return (
              <div key={track.path} className="musicOrganizePreviewRow">
                <span className="musicOrganizePreviewSource">
                  {track.title ?? track.path}
                </span>
                <span className="musicOrganizePreviewArrow" aria-hidden="true">
                  →
                </span>
                <input
                  className="musicOrganizePreviewDest"
                  type="text"
                  value={destPath}
                  aria-label={`Destination path for ${track.title ?? track.path}`}
                  onChange={(event) =>
                    setOverride(track.path, event.target.value, computedPath)
                  }
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
