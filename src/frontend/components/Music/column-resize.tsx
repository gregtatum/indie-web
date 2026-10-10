import * as React from 'react';

export function clampColumnWidths<K extends string>(
  order: K[],
  prev: Record<K, number>,
  maxAvailableWidth: number,
  minWidth: number,
  flexMinWidth: number,
): Record<K, number> {
  const maxForResizable = maxAvailableWidth - flexMinWidth;
  const total = order.reduce((sum, key) => sum + prev[key], 0);
  if (total <= maxForResizable) {
    return prev;
  }
  const result = { ...prev };
  let excess = total - maxForResizable;
  for (let i = order.length - 1; i >= 0 && excess > 0; i--) {
    const key = order[i];
    const shrinkBy = Math.min(excess, Math.max(0, result[key] - minWidth));
    result[key] -= shrinkBy;
    excess -= shrinkBy;
  }
  return result;
}

export function layoutColumns<K extends string>(
  order: K[],
  stored: Record<K, number>,
  referenceWidth: number,
  availableWidth: number,
  minWidth: number,
  flexMinWidth: number,
): Record<K, number> {
  const scale = referenceWidth > 0 ? availableWidth / referenceWidth : 1;
  const result = { ...stored };
  for (const key of order) {
    result[key] = Math.max(minWidth, stored[key] * scale);
  }

  const total = order.reduce((sum, key) => sum + result[key], 0);
  const excess = total - (availableWidth - flexMinWidth);
  if (excess <= 0) {
    return result;
  }

  const slack = order.reduce((sum, key) => sum + result[key] - minWidth, 0);
  for (const key of order) {
    const share = slack > 0 ? (result[key] - minWidth) / slack : 0;
    result[key] = Math.max(minWidth, result[key] - excess * share);
  }
  return result;
}

export function resizeColumnsOnDrag<K extends string>(
  order: K[],
  prev: Record<K, number>,
  columnKey: K,
  dx: number,
  minWidth: number,
  maxAvailableWidth: number,
  flexMinWidth: number,
): Record<K, number> {
  const result = { ...prev };
  const myIndex = order.indexOf(columnKey);

  if (dx > 0) {
    let remaining = dx;
    for (let i = myIndex; i < order.length && remaining > 0; i++) {
      const key = order[i];
      const shrinkBy = Math.min(remaining, Math.max(0, result[key] - minWidth));
      result[key] -= shrinkBy;
      remaining -= shrinkBy;
    }
    if (myIndex > 0) {
      result[order[myIndex - 1]] += dx - remaining;
    }
  } else {
    let remaining = -dx;
    for (let i = myIndex - 1; i >= 0 && remaining > 0; i--) {
      const key = order[i];
      const canTake = Math.max(0, result[key] - minWidth);
      const taken = Math.min(remaining, canTake);
      result[key] -= taken;
      result[columnKey] += taken;
      remaining -= taken;
    }
    if (remaining > 0) {
      const flexCurrent =
        maxAvailableWidth - order.reduce((sum, key) => sum + result[key], 0);
      const canTake = Math.max(0, flexCurrent - flexMinWidth);
      result[columnKey] += Math.min(remaining, canTake);
    }
  }

  return result;
}

export function ColumnResizeHandle({
  onDrag,
  onDragEnd,
}: {
  onDrag: (dx: number) => void;
  onDragEnd?: () => void;
}) {
  const onMouseDown: React.MouseEventHandler = (event) => {
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    let lastX = event.pageX;

    function handleMove(ev: MouseEvent) {
      onDrag(ev.pageX - lastX);
      lastX = ev.pageX;
    }
    function handleUp() {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      onDragEnd?.();
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div className="musicTrackColumnResize" onMouseDown={onMouseDown}>
      <div className="musicTrackColumnResizeVisible" />
    </div>
  );
}
