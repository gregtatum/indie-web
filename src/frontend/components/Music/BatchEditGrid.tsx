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

interface CellPos {
  row: number;
  column: number;
}

interface EditingCell extends CellPos {
  value: string;
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

  const [cursor, setCursorState] = React.useState<CellPos | null>(null);
  const cursorRef = React.useRef<CellPos | null>(null);
  function setCursor(pos: CellPos | null) {
    cursorRef.current = pos;
    setCursorState(pos);
  }

  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const editingRef = React.useRef<EditingCell | null>(null);
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

  const anchorPathRef = React.useRef<string | null>(null);
  const cancelEditRef = React.useRef(false);
  const pendingMoveRef = React.useRef<PendingMove | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  const columnsRef = React.useRef(columns);
  columnsRef.current = columns;
  const rowOrderRef = React.useRef(rowOrder);
  rowOrderRef.current = rowOrder;
  const tracksByPathRef = React.useRef(tracksByPath);
  tracksByPathRef.current = tracksByPath;

  async function commitEdit(
    path: string,
    columnDef: BatchEditColumn,
    rawValue: string,
  ) {
    const track = tracksByPath.get(path);
    const oldValue = getCellValue(track, columnDef);
    const newValue = columnDef.numeric
      ? rawValue.replace(/[^0-9]/g, '')
      : rawValue;
    const statusKey = `${path}:${columnDef.frameId}`;
    if (newValue === oldValue) {
      setStatus(statusKey, null);
      return;
    }
    setStatus(statusKey, { status: 'saving', value: newValue });
    const changes: T.TrackTagUpdate[] = [
      { frameId: columnDef.frameId, value: newValue },
    ];
    try {
      const res = await fetch(`${server.url}/music/write-track-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [path], changes }),
      });
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const data = (await res.json()) as WriteTrackTagsResponse;
      if (!data.updated.includes(path)) {
        setStatus(statusKey, { status: 'error', value: newValue });
        return;
      }
      dispatch(
        A.setMusicTracks(
          tracksRef.current.map((t) =>
            t.path === path ? applyIndexedTrackChanges(t, changes) : t,
          ),
          needsRescan,
          servedIndexVersion,
        ),
      );
      setStatus(statusKey, null);
    } catch {
      setStatus(statusKey, { status: 'error', value: newValue });
    }
  }

  // Ref-based (not closing over `rowOrder`/`columns` directly) so the single
  // persistent document keydown listener below always sees current values.
  function startEdit(row: number, column: number, seedValue?: string) {
    const path = rowOrderRef.current[row];
    const columnDef = columnsRef.current[column];
    if (!path || !columnDef) {
      return;
    }
    const value =
      seedValue !== undefined
        ? seedValue
        : getCellValue(tracksByPathRef.current.get(path), columnDef);
    setEditing({ row, column, value });
    setCursor({ row, column });
  }

  function handleCellClick(
    row: number,
    column: number,
    event: React.MouseEvent,
  ) {
    const path = rowOrder[row];
    const columnDef = columns[column];
    if (!path || !columnDef) {
      return;
    }
    const statusKey = `${path}:${columnDef.frameId}`;
    const status = cellStatus.get(statusKey);
    if (status?.status === 'error') {
      void commitEdit(path, columnDef, status.value);
      return;
    }
    setCursor({ row, column });
    if (event.metaKey || event.ctrlKey) {
      const currentPaths = $.getMusicSelectedTrackPaths(getState());
      const isSelected = currentPaths.includes(path);
      const next = isSelected
        ? currentPaths.filter((p) => p !== path)
        : [...currentPaths, path];
      if (!isSelected) {
        anchorPathRef.current = path;
      }
      dispatch(A.setMusicSelectedTracks(next));
    } else if (event.shiftKey && anchorPathRef.current !== null) {
      const anchorIndex = rowOrder.indexOf(anchorPathRef.current);
      const [start, end] =
        anchorIndex <= row ? [anchorIndex, row] : [row, anchorIndex];
      dispatch(A.setMusicSelectedTracks(rowOrder.slice(start, end + 1)));
    } else {
      anchorPathRef.current = path;
      dispatch(A.setMusicSelectedTracks([path]));
    }
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
    if (!current) {
      return;
    }
    const path = rowOrder[current.row];
    const columnDef = columns[current.column];
    if (path && columnDef) {
      void commitEdit(path, columnDef, current.value);
    }
    const move = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (move?.type === 'down' && current.row < rowOrder.length - 1) {
      setCursor({ row: current.row + 1, column: current.column });
    } else if (
      move?.type === 'next-column' &&
      current.column < columns.length - 1
    ) {
      setCursor({ row: current.row, column: current.column + 1 });
    } else if (move?.type === 'prev-column' && current.column > 0) {
      setCursor({ row: current.row, column: current.column - 1 });
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
    function handleKeyDown(event: KeyboardEvent) {
      if (document.activeElement !== gridRef.current) {
        return;
      }
      const currentColumns = columnsRef.current;
      const currentRowOrder = rowOrderRef.current;
      const currentCursor = cursorRef.current;
      if (!currentCursor) {
        if (currentRowOrder.length > 0 && currentColumns.length > 0) {
          event.preventDefault();
          setCursor({ row: 0, column: 0 });
        }
        return;
      }
      const { row, column } = currentCursor;
      switch (getKeyboardString(event)) {
        case 'ArrowUp':
          event.preventDefault();
          if (row > 0) {
            setCursor({ row: row - 1, column });
          }
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (row < currentRowOrder.length - 1) {
            setCursor({ row: row + 1, column });
          }
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (column > 0) {
            setCursor({ row, column: column - 1 });
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (column < currentColumns.length - 1) {
            setCursor({ row, column: column + 1 });
          }
          break;
        case 'Tab':
          event.preventDefault();
          if (column < currentColumns.length - 1) {
            setCursor({ row, column: column + 1 });
          } else if (row < currentRowOrder.length - 1) {
            setCursor({ row: row + 1, column: 0 });
          }
          break;
        case 'Shift+Tab':
          event.preventDefault();
          if (column > 0) {
            setCursor({ row, column: column - 1 });
          } else if (row > 0) {
            setCursor({ row: row - 1, column: currentColumns.length - 1 });
          }
          break;
        case 'Enter':
          event.preventDefault();
          startEdit(row, column);
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
            startEdit(row, column, event.key);
          }
          break;
        }
      }
    }
    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
    // startEdit/setCursor read current rowOrder/columns/tracksByPath via refs,
    // so this listener never needs to be re-registered.
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
                rowIndex={virtualItem.index}
                columns={columns}
                isSelected={selectedPaths.includes(path)}
                cursor={cursor}
                editing={editing}
                cellStatus={cellStatus}
                offsetTop={virtualItem.start}
                gridTemplateColumns={gridTemplateColumns}
                onCellClick={handleCellClick}
                onCellDoubleClick={(row, column) => startEdit(row, column)}
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
  rowIndex: number;
  columns: BatchEditColumn[];
  isSelected: boolean;
  cursor: CellPos | null;
  editing: EditingCell | null;
  cellStatus: Map<string, CellStatus>;
  offsetTop: number;
  gridTemplateColumns: string;
  onCellClick: (row: number, column: number, event: React.MouseEvent) => void;
  onCellDoubleClick: (row: number, column: number) => void;
  onEditingChange: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onInputBlur: () => void;
}

function BatchEditRow({
  path,
  track,
  rowIndex,
  columns,
  isSelected,
  cursor,
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
        const isCursor =
          cursor?.row === rowIndex && cursor.column === columnIndex;
        const isEditing =
          editing?.row === rowIndex && editing.column === columnIndex;
        const statusKey = `${path}:${column.frameId}`;
        const status = cellStatus.get(statusKey);
        const value = isEditing ? editing.value : getCellValue(track, column);
        return (
          <div
            key={column.key}
            role="gridcell"
            className={[
              'musicBatchEditCell',
              column.numeric ? 'musicBatchEditCell-numeric' : '',
              isCursor ? 'cursor' : '',
              status?.status === 'error' ? 'error' : '',
              status?.status === 'saving' ? 'saving' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => onCellClick(rowIndex, columnIndex, event)}
            onDoubleClick={() => onCellDoubleClick(rowIndex, columnIndex)}
          >
            {isEditing ? (
              <input
                className="musicBatchEditCellInput"
                autoFocus
                value={editing.value}
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
