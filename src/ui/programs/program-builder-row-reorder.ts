import type { ProgramBuilderRow } from "../../services/programs/types.js";

export const BUILDER_REORDER_TOUCH_HOLD_MS = 280;
export const BUILDER_REORDER_TOUCH_SLOP_PX = 8;
export const BUILDER_REORDER_MOUSE_LIFT_PX = 4;
export const BUILDER_REORDER_EDGE_SCROLL_PX = 48;

export type ProgramBuilderDragState = {
  rowId: string;
  overIndex: number;
};

/** Row order shown while a row is lifted (preview insert at overIndex). */
export function programBuilderRowsWhileDragging(
  rows: ProgramBuilderRow[],
  drag: ProgramBuilderDragState,
): ProgramBuilderRow[] {
  const from = rows.findIndex((row) => row.id === drag.rowId);
  const lifted = rows[from];
  if (from < 0 || !lifted) {
    return rows;
  }
  const rest = rows.filter((row) => row.id !== drag.rowId);
  const over = Math.max(0, Math.min(drag.overIndex, rest.length));
  rest.splice(over, 0, lifted);
  return rest;
}

export function programBuilderDropIndexFromPointer(
  list: HTMLElement,
  draggedRowId: string,
  clientY: number,
): number {
  const others = [...list.querySelectorAll<HTMLElement>("[data-pg-row-id]")].filter(
    (element) => element.dataset.pgRowId !== draggedRowId,
  );
  return others.filter((element) => {
    const bounds = element.getBoundingClientRect();
    return clientY > bounds.top + bounds.height / 2;
  }).length;
}
