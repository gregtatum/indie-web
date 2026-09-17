import * as React from 'react';
import { $$, $, A, Hooks, T } from 'frontend';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getKeyboardString } from 'frontend/utils';
import { persistedState } from 'frontend/logic/persisted-state';
import {
  BATCH_EDIT_COLUMN_KEYS,
  BATCH_EDIT_COLUMNS,
  applyIndexedTrackChanges,
  type BatchEditColumn,
  type BatchEditColumnKey,
  type MusicTrackSource,
} from 'frontend/logic/music/metadata';
import type { WriteTrackTagsResponse } from 'shared/@types/shared';
import {
  ColumnResizeHandle,
  clampColumnWidths,
  resizeColumnsOnDrag,
} from './column-resize';

const ROW_HEIGHT = 32;
const COL_MIN_WIDTH = 60;
const FLEX_MIN_WIDTH = 100; // matches minmax(100px, 1fr) on the flex column
const BATCH_EDIT_GAP = 12; // matches --music-gap CSS variable
const BATCH_EDIT_PADDING_H = 12; // matches --music-padding-h CSS variable

const PREFERRED_FLEX_COLUMN: BatchEditColumnKey = 'title';

const DEFAULT_COLUMN_WIDTHS: Record<BatchEditColumnKey, number> = {
  track: 70,
  title: 200,
  artist: 160,
  albumArtist: 160,
  album: 160,
  genre: 120,
};

type ColumnWidths = Record<BatchEditColumnKey, number>;

interface EditingState {
  value: string;
  initialValue: string;
  placeholder: string;
  columnIndex: number;
  paths: string[];
}

interface CellStatus {
  status: 'saving' | 'error';
  value: string;
}

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

function getFlexColumnKey(columns: BatchEditColumn[]): BatchEditColumnKey {
  return columns.some((column) => column.key === PREFERRED_FLEX_COLUMN)
    ? PREFERRED_FLEX_COLUMN
    : columns[0].key;
}

function getResizableColumnOrder(
  columns: BatchEditColumn[],
  flexColumnKey: BatchEditColumnKey,
): BatchEditColumnKey[] {
  return columns
    .filter((column) => column.key !== flexColumnKey)
    .map((column) => column.key);
}

function getGridTemplateColumns(
  columns: BatchEditColumn[],
  flexColumnKey: BatchEditColumnKey,
): string {
  return columns
    .map((column) =>
      column.key === flexColumnKey
        ? `minmax(${FLEX_MIN_WIDTH}px, 1fr)`
        : `var(--batchcol-${column.key})`,
    )
    .join(' ');
}

function loadColumnWidths(): ColumnWidths {
  const stored = persistedState.musicBatchEditColumnWidths.read();
  return {
    ...DEFAULT_COLUMN_WIDTHS,
    ...(stored ?? {}),
  };
}

function useColumnWidths() {
  const [columnWidths, setColumnWidths] =
    React.useState<ColumnWidths>(loadColumnWidths);

  React.useEffect(() => {
    persistedState.musicBatchEditColumnWidths.write(columnWidths);
  }, [columnWidths]);

  return { columnWidths, setColumnWidths };
}

interface BatchEditGridProps {
  trackPaths: string[];
  trackSource: MusicTrackSource;
}

export function BatchEditGrid({ trackPaths, trackSource }: BatchEditGridProps) {
  const tracks = trackSource.tracks;
  const selectedPaths = $$.getMusicSelectedTrackPaths();
  const server = $$.getCurrentServer();
  const dispatch = Hooks.useDispatch();
  const { getState } = Hooks.useStore();

  const trackSourceRef = React.useRef(trackSource);
  trackSourceRef.current = trackSource;

  const tracksByPath = React.useMemo(() => {
    const map = new Map<string, T.TrackMetadata>();
    for (const track of tracks) {
      map.set(track.path, track);
    }
    return map;
  }, [tracks]);

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
  const flexColumnKey = getFlexColumnKey(columns);
  const resizableColumnOrder = getResizableColumnOrder(columns, flexColumnKey);
  const gridTemplateColumns = getGridTemplateColumns(columns, flexColumnKey);

  const { columnWidths, setColumnWidths } = useColumnWidths();
  const [scrollbarWidth, setScrollbarWidth] = React.useState(0);
  const [maxAvailableWidth, setMaxAvailableWidth] = React.useState(400);

  const displayColumnWidths = React.useMemo(
    () =>
      clampColumnWidths(
        resizableColumnOrder,
        columnWidths,
        maxAvailableWidth,
        COL_MIN_WIDTH,
        FLEX_MIN_WIDTH,
      ),
    [resizableColumnOrder, columnWidths, maxAvailableWidth],
  );

  const gridStyle = React.useMemo(() => {
    const style: Record<string, string> = {
      '--scrollbar-width': `${scrollbarWidth}px`,
    };
    for (const key of BATCH_EDIT_COLUMN_KEYS) {
      style[`--batchcol-${key}`] = `${displayColumnWidths[key]}px`;
    }
    return style as React.CSSProperties;
  }, [displayColumnWidths, scrollbarWidth]);

  const [sort, setSort] = React.useState<{
    column: BatchEditColumnKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  const [cursorColumn, setCursorColumnState] = React.useState(0);
  const cursorColumnRef = React.useRef(0);
  function setCursorColumn(index: number) {
    cursorColumnRef.current = index;
    setCursorColumnState(index);
  }

  const [focusedPath, setFocusedPathState] = React.useState<string | null>(
    null,
  );
  const focusedPathRef = React.useRef<string | null>(null);
  function setFocusedPath(path: string | null) {
    focusedPathRef.current = path;
    setFocusedPathState(path);
  }
  const anchorPathRef = React.useRef<string | null>(null);

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
  const pendingAdvanceRef = React.useRef(false);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  const columnsRef = React.useRef(columns);
  columnsRef.current = columns;
  const rowOrderRef = React.useRef(rowOrder);
  rowOrderRef.current = rowOrder;
  const tracksByPathRef = React.useRef(tracksByPath);
  tracksByPathRef.current = tracksByPath;

  const headerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      const numCols = columnsRef.current.length;
      setMaxAvailableWidth(
        entry.contentRect.width -
          2 * BATCH_EDIT_PADDING_H -
          (numCols - 1) * BATCH_EDIT_GAP,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) {
      return;
    }
    const style = getComputedStyle(el);
    const contentWidth =
      el.getBoundingClientRect().width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    setMaxAvailableWidth(
      contentWidth -
        2 * BATCH_EDIT_PADDING_H -
        (columns.length - 1) * BATCH_EDIT_GAP,
    );
  }, [columns.length]);

  React.useEffect(() => {
    const el = gridRef.current;
    if (!el) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setScrollbarWidth(el.offsetWidth - el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      trackSourceRef.current.updateTracks(
        trackSourceRef.current.tracks.map((t) =>
          updatedSet.has(t.path) ? applyIndexedTrackChanges(t, changes) : t,
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
      pendingAdvanceRef.current = false;
      return;
    }
    if (current && current.value !== current.initialValue) {
      const columnDef = columnsRef.current[current.columnIndex];
      if (columnDef) {
        void commitEdit(current.paths, columnDef, current.value);
      }
    }
    if (pendingAdvanceRef.current) {
      pendingAdvanceRef.current = false;
      const currentRowOrder = rowOrderRef.current;
      const currentIndex = focusedPathRef.current
        ? currentRowOrder.indexOf(focusedPathRef.current)
        : -1;
      const nextPath = currentRowOrder[currentIndex + 1];
      if (nextPath) {
        selectSingleRow(nextPath);
      }
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        // Without this, the event bubbles to the grid's own keydown handler
        // after focus() below moves onto it, re-triggering "start edit".
        event.stopPropagation();
        pendingAdvanceRef.current = true;
        gridRef.current?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        cancelEditRef.current = true;
        gridRef.current?.focus();
        break;
      default:
        break;
    }
  }

  React.useEffect(() => {
    gridRef.current?.focus();
  }, []);

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
        case 'Enter':
          event.preventDefault();
          startEdit();
          break;
        default: {
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
  }, []);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rowOrder.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualizerRef = React.useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const focusedRowIndex = focusedPath ? rowOrder.indexOf(focusedPath) : -1;

  React.useEffect(() => {
    if (focusedRowIndex >= 0) {
      virtualizerRef.current.scrollToIndex(focusedRowIndex, {
        align: 'auto',
      });
    }
  }, [focusedRowIndex]);

  React.useEffect(() => {
    gridRef.current
      ?.querySelector('.musicBatchEditCell.active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [cursorColumn, focusedRowIndex]);

  const [columnMenuFor, setColumnMenuFor] = React.useState<{
    rect: DOMRect;
  } | null>(null);

  return (
    <div className="musicBatchEditGrid" style={gridStyle}>
      <div
        className="musicBatchEditGridHeader"
        style={{ gridTemplateColumns }}
        role="row"
        ref={headerRef}
      >
        {columns.map((column) => {
          const isFlexColumn = column.key === flexColumnKey;
          return (
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
              {isFlexColumn ? null : (
                <div
                  style={{ display: 'contents' }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <ColumnResizeHandle
                    onDrag={(dx) =>
                      setColumnWidths((prev) =>
                        resizeColumnsOnDrag(
                          resizableColumnOrder,
                          clampColumnWidths(
                            resizableColumnOrder,
                            prev,
                            maxAvailableWidth,
                            COL_MIN_WIDTH,
                            FLEX_MIN_WIDTH,
                          ),
                          column.key,
                          dx,
                          COL_MIN_WIDTH,
                          maxAvailableWidth,
                          FLEX_MIN_WIDTH,
                        ),
                      )
                    }
                  />
                </div>
              )}
              <span className="musicBatchEditHeaderCellText">
                {column.label}
              </span>
              {sort?.column === column.key ? (
                <span className="musicBatchEditSortArrow" aria-hidden="true">
                  {sort.direction === 'asc' ? '↑' : '↓'}
                </span>
              ) : null}
            </div>
          );
        })}
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

function findNearestColumnIndex(row: HTMLElement, clientX: number): number {
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  const cells = row.children;
  for (let i = 0; i < cells.length; i++) {
    const rect = cells[i].getBoundingClientRect();
    let distance = 0;
    if (clientX < rect.left) {
      distance = rect.left - clientX;
    } else if (clientX > rect.right) {
      distance = clientX - rect.right;
    }
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  return nearestIndex;
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
  function handleRowClick(event: React.MouseEvent<HTMLDivElement>) {
    // Only reached by a click that missed every cell (row gap/padding).
    if (event.target !== event.currentTarget) {
      return;
    }
    const columnIndex = findNearestColumnIndex(
      event.currentTarget,
      event.clientX,
    );
    onCellClick(path, columnIndex, event);
  }

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
      onClick={handleRowClick}
    >
      {columns.map((column, columnIndex) => {
        const isActiveColumn = columnIndex === cursorColumn;
        const showActiveBox = isFocused && isActiveColumn;
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
              <span className="musicBatchEditCellText">{value || ' '}</span>
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
