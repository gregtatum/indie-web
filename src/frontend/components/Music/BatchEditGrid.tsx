import * as React from 'react';
import { $$, $, A, Hooks, T } from 'frontend';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getKeyboardString } from 'frontend/utils';
import { persistedState } from 'frontend/logic/persisted-state';
import {
  BATCH_EDIT_COLUMNS,
  applyIndexedTrackChanges,
  type BatchEditColumn,
  type BatchEditColumnKey,
} from 'frontend/logic/music/metadata';
import type { WriteTrackTagsResponse } from 'shared/@types/shared';

const ROW_HEIGHT = 32;

interface EditingState {
  value: string;
  /** The value before this edit session, so an unchanged commit is a no-op. */
  initialValue: string;
  /** "Mixed" when the selected tracks don't all share the same starting value. */
  placeholder: string;
  columnIndex: number;
  /** The selection this edit applies to — captured once, at edit start. */
  paths: string[];
}

interface CellStatus {
  status: 'saving' | 'error';
  /** The value that failed to save, so clicking to retry resends the same thing. */
  value: string;
}

type PendingMove =
  { type: 'down' } | { type: 'next-column' } | { type: 'prev-column' };

function getCellValue(
  track: T.TrackMetadata | undefined,
  column: BatchEditColumn,
): string {
  if (!track) {
    return '';
  }
  const value = track[column.metadataKey];
  return value === null || value === undefined ? '' : String(value);
}

function loadVisibleColumns(): Set<BatchEditColumnKey> {
  const stored = persistedState.musicBatchEditColumns.read();
  return new Set(stored ?? BATCH_EDIT_COLUMNS.map((column) => column.key));
}

function getGridTemplateColumns(columns: BatchEditColumn[]): string {
  return columns
    .map((column) => (column.key === 'track' ? '64px' : 'minmax(120px, 1fr)'))
    .join(' ');
}

interface BatchEditGridProps {
  trackPaths: string[];
}

export function BatchEditGrid({ trackPaths }: BatchEditGridProps) {
  const tracks = $$.getMusicTracks();
  const selectedPaths = $$.getMusicSelectedTrackPaths();
  const server = $$.getCurrentServer();
  const needsRescan = $$.getMusicNeedsRescan();
  const servedIndexVersion = $$.getMusicServedIndexVersion();
  const dispatch = Hooks.useDispatch();
  const { getState } = Hooks.useStore();

  const tracksRef = React.useRef(tracks);
  tracksRef.current = tracks;

  const tracksByPath = React.useMemo(() => {
    const map = new Map<string, T.TrackMetadata>();
    for (const track of tracks) {
      map.set(track.path, track);
    }
    return map;
  }, [tracks]);

  // The row order is frozen on entry (see BATCH_EDIT_PLAN.md "Row order").
  // Re-mounting BatchEditGrid (leaving and re-entering Batch Edit) is what
  // picks up a new trackPaths set — this never re-reads it while mounted.
  const [rowOrder, setRowOrder] = React.useState<string[]>(() =>
    tracks.filter((t) => trackPaths.includes(t.path)).map((t) => t.path),
  );

  const [visibleColumns, setVisibleColumns] =
    React.useState<Set<BatchEditColumnKey>>(loadVisibleColumns);
  React.useEffect(() => {
    persistedState.musicBatchEditColumns.write([...visibleColumns]);
  }, [visibleColumns]);

  const columns = React.useMemo(
    () => BATCH_EDIT_COLUMNS.filter((column) => visibleColumns.has(column.key)),
    [visibleColumns],
  );
  const gridTemplateColumns = getGridTemplateColumns(columns);

  const [sort, setSort] = React.useState<{
    column: BatchEditColumnKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  // The field cursor (which column) is independent of row selection. The row
  // side of "the cursor" IS the selection — moving it up/down changes which
  // track(s) are selected, rather than tracking a separate row index, so a
  // field can never be "open" on a track that isn't selected.
  const [cursorColumn, setCursorColumnState] = React.useState(0);
  const cursorColumnRef = React.useRef(0);
  function setCursorColumn(index: number) {
    cursorColumnRef.current = index;
    setCursorColumnState(index);
  }

  // The keyboard-focused row (mirrors Tracks' focusedPath/anchorPath model).
  // For a single selection this is that track; for a shift-extended range
  // it's the leading edge, and it's always the row that hosts the live
  // <input> when multiple rows are selected for a bulk edit.
  const [focusedPath, setFocusedPathState] = React.useState<string | null>(
    null,
  );
  const focusedPathRef = React.useRef<string | null>(null);
  function setFocusedPath(path: string | null) {
    focusedPathRef.current = path;
    setFocusedPathState(path);
  }
  const anchorPathRef = React.useRef<string | null>(null);

  // Sync focusedPath from Redux when selection has 0 or 1 item, so selection
  // changes made elsewhere (e.g. the sidebar) stay in sync.
  React.useEffect(() => {
    if (selectedPaths.length === 1) {
      const only = selectedPaths[0];
      if (focusedPathRef.current !== only) {
        focusedPathRef.current = only;
        setFocusedPathState(only);
        anchorPathRef.current = only;
      }
    } else if (selectedPaths.length === 0) {
      if (focusedPathRef.current !== null) {
        focusedPathRef.current = null;
        setFocusedPathState(null);
        anchorPathRef.current = null;
      }
    } else if (focusedPathRef.current === null) {
      // Batch Edit is entered with several tracks already selected (the
      // frozen set from the context menu), so there's no single row to sync
      // to above. Seed focus to one of them so typing right away still
      // knows which selection to bulk-edit, instead of silently no-oping
      // until the user clicks or arrow-keys onto a row first.
      const seed = selectedPaths[selectedPaths.length - 1];
      focusedPathRef.current = seed;
      setFocusedPathState(seed);
      anchorPathRef.current = seed;
    }
  }, [selectedPaths]);

  const [editing, setEditing] = React.useState<EditingState | null>(null);
  const editingRef = React.useRef<EditingState | null>(null);
  editingRef.current = editing;

  const [cellStatus, setCellStatus] = React.useState<Map<string, CellStatus>>(
    new Map(),
  );
  function setStatus(key: string, status: CellStatus | null) {
    setCellStatus((prev) => {
      const next = new Map(prev);
      if (status === null) {
        next.delete(key);
      } else {
        next.set(key, status);
      }
      return next;
    });
  }

  const cancelEditRef = React.useRef(false);
  const pendingMoveRef = React.useRef<PendingMove | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  const columnsRef = React.useRef(columns);
  columnsRef.current = columns;
  const rowOrderRef = React.useRef(rowOrder);
  rowOrderRef.current = rowOrder;
  const tracksByPathRef = React.useRef(tracksByPath);
  tracksByPathRef.current = tracksByPath;

  function getAggregateValue(
    paths: string[],
    column: BatchEditColumn,
  ): { value: string; mixed: boolean } {
    if (paths.length === 0) {
      return { value: '', mixed: false };
    }
    const values = paths.map((path) =>
      getCellValue(tracksByPathRef.current.get(path), column),
    );
    const allSame = values.every((value) => value === values[0]);
    return { value: allSame ? values[0] : '', mixed: !allSame };
  }

  async function commitEdit(
    paths: string[],
    columnDef: BatchEditColumn,
    rawValue: string,
  ) {
    if (paths.length === 0) {
      return;
    }
    const newValue = columnDef.numeric
      ? rawValue.replace(/[^0-9]/g, '')
      : rawValue;
    for (const path of paths) {
      setStatus(`${path}:${columnDef.frameId}`, {
        status: 'saving',
        value: newValue,
      });
    }
    const changes: T.TrackTagUpdate[] = [
      { frameId: columnDef.frameId, value: newValue },
    ];
    try {
      const res = await fetch(`${server.url}/music/write-track-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, changes }),
      });
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const data = (await res.json()) as WriteTrackTagsResponse;
      const updatedSet = new Set(data.updated);
      dispatch(
        A.setMusicTracks(
          tracksRef.current.map((t) =>
            updatedSet.has(t.path) ? applyIndexedTrackChanges(t, changes) : t,
          ),
          needsRescan,
          servedIndexVersion,
        ),
      );
      for (const path of paths) {
        setStatus(
          `${path}:${columnDef.frameId}`,
          updatedSet.has(path) ? null : { status: 'error', value: newValue },
        );
      }
    } catch {
      for (const path of paths) {
        setStatus(`${path}:${columnDef.frameId}`, {
          status: 'error',
          value: newValue,
        });
      }
    }
  }

  // Ref-based (not closing over `columns`/`selectedPaths` directly) so the
  // single persistent document keydown listener below always sees current
  // values. Editing always targets the focused row's current selection —
  // one track edits just that track, several bulk-apply to all of them.
  function startEdit(seedChar?: string) {
    const path = focusedPathRef.current;
    const columnDef = columnsRef.current[cursorColumnRef.current];
    if (!path || !columnDef) {
      return;
    }
    const paths = $.getMusicSelectedTrackPaths(getState());
    const aggregate = getAggregateValue(paths, columnDef);
    setEditing({
      value: seedChar ?? aggregate.value,
      initialValue: aggregate.value,
      placeholder: aggregate.mixed ? 'Mixed' : '',
      columnIndex: cursorColumnRef.current,
      paths,
    });
  }

  function selectSingleRow(path: string) {
    anchorPathRef.current = path;
    setFocusedPath(path);
    dispatch(A.setMusicSelectedTracks([path]));
  }

  function handleCellClick(
    path: string,
    columnIndex: number,
    event: React.MouseEvent,
  ) {
    const columnDef = columns[columnIndex];
    if (!columnDef) {
      return;
    }
    const statusKey = `${path}:${columnDef.frameId}`;
    const status = cellStatus.get(statusKey);
    if (status?.status === 'error') {
      void commitEdit([path], columnDef, status.value);
      return;
    }
    setCursorColumn(columnIndex);
    if (event.metaKey || event.ctrlKey) {
      const currentPaths = $.getMusicSelectedTrackPaths(getState());
      const isSelected = currentPaths.includes(path);
      const next = isSelected
        ? currentPaths.filter((p) => p !== path)
        : [...currentPaths, path];
      if (!isSelected) {
        anchorPathRef.current = path;
      }
      setFocusedPath(path);
      dispatch(A.setMusicSelectedTracks(next));
    } else if (event.shiftKey && anchorPathRef.current !== null) {
      const anchorIndex = rowOrder.indexOf(anchorPathRef.current);
      const targetIndex = rowOrder.indexOf(path);
      const [start, end] =
        anchorIndex <= targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
      setFocusedPath(path);
      dispatch(A.setMusicSelectedTracks(rowOrder.slice(start, end + 1)));
    } else {
      selectSingleRow(path);
    }
  }

  function handleCellDoubleClick(path: string, columnIndex: number) {
    setCursorColumn(columnIndex);
    const currentSelected = $.getMusicSelectedTrackPaths(getState());
    if (!currentSelected.includes(path)) {
      selectSingleRow(path);
    } else {
      setFocusedPath(path);
    }
    startEdit();
  }

  function handleHeaderSortClick(column: BatchEditColumn) {
    const direction: 'asc' | 'desc' =
      sort?.column === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
    setSort({ column: column.key, direction });
    setRowOrder((order) => {
      const next = [...order];
      next.sort((a, b) => {
        const aValue = getCellValue(tracksByPath.get(a), column);
        const bValue = getCellValue(tracksByPath.get(b), column);
        let cmp: number;
        if (column.numeric) {
          const aNum = aValue === '' ? Infinity : Number(aValue);
          const bNum = bValue === '' ? Infinity : Number(bValue);
          cmp = aNum - bNum;
        } else {
          cmp = aValue.localeCompare(bValue);
        }
        return direction === 'asc' ? cmp : -cmp;
      });
      return next;
    });
  }

  function toggleColumn(key: BatchEditColumnKey) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) {
          return prev;
        }
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleInputBlur() {
    const current = editingRef.current;
    setEditing(null);
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      pendingMoveRef.current = null;
      return;
    }
    if (current && current.value !== current.initialValue) {
      const columnDef = columnsRef.current[current.columnIndex];
      if (columnDef) {
        void commitEdit(current.paths, columnDef, current.value);
      }
    }
    const move = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (move?.type === 'down') {
      const currentRowOrder = rowOrderRef.current;
      const currentIndex = focusedPathRef.current
        ? currentRowOrder.indexOf(focusedPathRef.current)
        : -1;
      const nextPath = currentRowOrder[currentIndex + 1];
      if (nextPath) {
        selectSingleRow(nextPath);
      }
    } else if (move?.type === 'next-column') {
      if (cursorColumnRef.current < columnsRef.current.length - 1) {
        setCursorColumn(cursorColumnRef.current + 1);
      }
    } else if (move?.type === 'prev-column') {
      if (cursorColumnRef.current > 0) {
        setCursorColumn(cursorColumnRef.current - 1);
      }
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        // Stop this same keydown from bubbling to the document-level grid
        // listener below — by the time it would arrive there, the
        // `gridRef.current?.focus()` call a few lines down has already
        // moved focus onto the grid container, which would otherwise make
        // that listener treat this identical event as a fresh "start
        // editing the cursor cell" command.
        event.stopPropagation();
        pendingMoveRef.current = { type: 'down' };
        gridRef.current?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        cancelEditRef.current = true;
        gridRef.current?.focus();
        break;
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        pendingMoveRef.current = {
          type: event.shiftKey ? 'prev-column' : 'next-column',
        };
        gridRef.current?.focus();
        break;
      default:
        break;
    }
  }

  React.useEffect(() => {
    function moveRowFocus(direction: 1 | -1, extend: boolean) {
      const currentRowOrder = rowOrderRef.current;
      if (currentRowOrder.length === 0) {
        return;
      }
      const currentFocused = focusedPathRef.current;
      const currentIndex = currentFocused
        ? currentRowOrder.indexOf(currentFocused)
        : -1;
      const nextIndex =
        currentIndex < 0
          ? 0
          : Math.min(
              currentRowOrder.length - 1,
              Math.max(0, currentIndex + direction),
            );
      const nextPath = currentRowOrder[nextIndex];
      if (!nextPath) {
        return;
      }
      if (extend && anchorPathRef.current !== null) {
        const anchorIndex = currentRowOrder.indexOf(anchorPathRef.current);
        const [start, end] =
          anchorIndex <= nextIndex
            ? [anchorIndex, nextIndex]
            : [nextIndex, anchorIndex];
        setFocusedPath(nextPath);
        dispatch(
          A.setMusicSelectedTracks(currentRowOrder.slice(start, end + 1)),
        );
      } else {
        selectSingleRow(nextPath);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (document.activeElement !== gridRef.current) {
        return;
      }
      const currentColumns = columnsRef.current;
      const currentColumn = cursorColumnRef.current;
      switch (getKeyboardString(event)) {
        case 'ArrowUp':
          event.preventDefault();
          moveRowFocus(-1, false);
          break;
        case 'Shift+ArrowUp':
          event.preventDefault();
          moveRowFocus(-1, true);
          break;
        case 'ArrowDown':
          event.preventDefault();
          moveRowFocus(1, false);
          break;
        case 'Shift+ArrowDown':
          event.preventDefault();
          moveRowFocus(1, true);
          break;
        case 'ArrowLeft':
        case 'Shift+ArrowLeft':
          // Left/Right only ever move the field cursor — Shift never extends
          // the row selection here, unlike Up/Down.
          event.preventDefault();
          if (currentColumn > 0) {
            setCursorColumn(currentColumn - 1);
          }
          break;
        case 'ArrowRight':
        case 'Shift+ArrowRight':
          event.preventDefault();
          if (currentColumn < currentColumns.length - 1) {
            setCursorColumn(currentColumn + 1);
          }
          break;
        case 'Tab':
          event.preventDefault();
          if (currentColumn < currentColumns.length - 1) {
            setCursorColumn(currentColumn + 1);
          }
          break;
        case 'Shift+Tab':
          event.preventDefault();
          if (currentColumn > 0) {
            setCursorColumn(currentColumn - 1);
          }
          break;
        case 'Enter':
          event.preventDefault();
          startEdit();
          break;
        default: {
          // A plain (optionally shifted, for capitals) single character opens
          // the cell for editing, spreadsheet-style. Anything with Meta,
          // Control, or Alt held is left alone as a potential shortcut.
          const upperKey =
            event.key.length === 1 ? event.key.toUpperCase() : null;
          const keyString = getKeyboardString(event);
          if (
            upperKey &&
            (keyString === upperKey || keyString === `Shift+${upperKey}`)
          ) {
            event.preventDefault();
            startEdit(event.key);
          }
          break;
        }
      }
    }
    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
    // Reads current rowOrder/columns/selection via refs and getState(), so
    // this listener never needs to be re-registered.
  }, []);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rowOrder.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const [columnMenuFor, setColumnMenuFor] = React.useState<{
    rect: DOMRect;
  } | null>(null);

  return (
    <div className="musicBatchEditGrid">
      <div
        className="musicBatchEditGridHeader"
        style={{ gridTemplateColumns }}
        role="row"
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className="musicBatchEditHeaderCell"
            role="columnheader"
            onClick={() => handleHeaderSortClick(column)}
            onContextMenu={(event) => {
              event.preventDefault();
              setColumnMenuFor({
                rect: event.currentTarget.getBoundingClientRect(),
              });
            }}
          >
            <span className="musicBatchEditHeaderCellText">{column.label}</span>
            {sort?.column === column.key ? (
              <span className="musicBatchEditSortArrow" aria-hidden="true">
                {sort.direction === 'asc' ? '↑' : '↓'}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {columnMenuFor ? (
        <ColumnVisibilityPopover
          rect={columnMenuFor.rect}
          visibleColumns={visibleColumns}
          onToggle={toggleColumn}
          onDismiss={() => setColumnMenuFor(null)}
        />
      ) : null}
      <div
        className="musicBatchEditGridBody"
        role="grid"
        aria-label="Batch edit tracks"
        tabIndex={0}
        ref={gridRef}
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const path = rowOrder[virtualItem.index];
            const track = tracksByPath.get(path);
            return (
              <BatchEditRow
                key={path}
                path={path}
                track={track}
                columns={columns}
                isSelected={selectedPaths.includes(path)}
                isFocused={path === focusedPath}
                cursorColumn={cursorColumn}
                editing={editing}
                cellStatus={cellStatus}
                offsetTop={virtualItem.start}
                gridTemplateColumns={gridTemplateColumns}
                onCellClick={handleCellClick}
                onCellDoubleClick={handleCellDoubleClick}
                onEditingChange={(value) =>
                  setEditing((prev) => (prev ? { ...prev, value } : prev))
                }
                onInputKeyDown={handleInputKeyDown}
                onInputBlur={handleInputBlur}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface BatchEditRowProps {
  path: string;
  track: T.TrackMetadata | undefined;
  columns: BatchEditColumn[];
  isSelected: boolean;
  /** Whether this row hosts the live <input> for the current field. */
  isFocused: boolean;
  cursorColumn: number;
  editing: EditingState | null;
  cellStatus: Map<string, CellStatus>;
  offsetTop: number;
  gridTemplateColumns: string;
  onCellClick: (
    path: string,
    columnIndex: number,
    event: React.MouseEvent,
  ) => void;
  onCellDoubleClick: (path: string, columnIndex: number) => void;
  onEditingChange: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onInputBlur: () => void;
}

function BatchEditRow({
  path,
  track,
  columns,
  isSelected,
  isFocused,
  cursorColumn,
  editing,
  cellStatus,
  offsetTop,
  gridTemplateColumns,
  onCellClick,
  onCellDoubleClick,
  onEditingChange,
  onInputKeyDown,
  onInputBlur,
}: BatchEditRowProps) {
  return (
    <div
      className={`musicBatchEditRow${isSelected ? ' selected' : ''}`}
      role="row"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${ROW_HEIGHT}px`,
        transform: `translateY(${offsetTop}px)`,
        gridTemplateColumns,
      }}
    >
      {columns.map((column, columnIndex) => {
        const isActiveColumn = columnIndex === cursorColumn;
        // The field is only ever "open" on a selected track — a background
        // box shows on every selected row in the active column (they'll all
        // update together), and the one live <input> lives on the focused
        // row.
        const showActiveBox = isSelected && isActiveColumn;
        const isEditingHere = editing !== null && isFocused && isActiveColumn;
        const statusKey = `${path}:${column.frameId}`;
        const status = cellStatus.get(statusKey);
        const value = isEditingHere
          ? editing.value
          : getCellValue(track, column);
        return (
          <div
            key={column.key}
            role="gridcell"
            className={[
              'musicBatchEditCell',
              column.numeric ? 'musicBatchEditCell-numeric' : '',
              showActiveBox ? 'active' : '',
              status?.status === 'error' ? 'error' : '',
              status?.status === 'saving' ? 'saving' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => onCellClick(path, columnIndex, event)}
            onDoubleClick={() => onCellDoubleClick(path, columnIndex)}
          >
            {isEditingHere ? (
              <input
                className="musicBatchEditCellInput"
                autoFocus
                value={editing.value}
                placeholder={editing.placeholder}
                onChange={(event) => onEditingChange(event.target.value)}
                onKeyDown={onInputKeyDown}
                onBlur={onInputBlur}
                inputMode={column.numeric ? 'numeric' : 'text'}
              />
            ) : (
              <span className="musicBatchEditCellText">{value}</span>
            )}
            {status?.status === 'saving' ? (
              <span className="musicBatchEditCellSaving" aria-hidden="true" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface ColumnVisibilityPopoverProps {
  rect: DOMRect;
  visibleColumns: Set<BatchEditColumnKey>;
  onToggle: (key: BatchEditColumnKey) => void;
  onDismiss: () => void;
}

function ColumnVisibilityPopover({
  rect,
  visibleColumns,
  onToggle,
  onDismiss,
}: ColumnVisibilityPopoverProps) {
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  Hooks.useEscape(onDismiss, true);

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node | null)
      ) {
        onDismiss();
      }
    }
    document.addEventListener('mousedown', handleClick, true);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
    };
  }, [onDismiss]);

  return (
    <div
      className="musicBatchEditColumnPopover"
      role="menu"
      aria-label="Toggle columns"
      ref={popoverRef}
      style={{ top: rect.bottom, left: rect.left }}
    >
      {BATCH_EDIT_COLUMNS.map((column) => (
        <label key={column.key} className="musicBatchEditColumnPopoverItem">
          <input
            type="checkbox"
            checked={visibleColumns.has(column.key)}
            onChange={() => onToggle(column.key)}
          />
          {column.label}
        </label>
      ))}
    </div>
  );
}
