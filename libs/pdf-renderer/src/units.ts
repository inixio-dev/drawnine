export const MM_TO_PT = 72 / 25.4;

export const CARD_WIDTH_MM = 63;
export const CARD_HEIGHT_MM = 88;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export const GRID_COLUMNS = 3;
export const GRID_ROWS = 3;
export const CARDS_PER_PAGE = GRID_COLUMNS * GRID_ROWS;

/** Converts millimetres to PDF points. Use only at drawing time. */
export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}
