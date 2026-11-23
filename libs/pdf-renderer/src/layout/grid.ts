import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  CARDS_PER_PAGE,
  GRID_COLUMNS,
  GRID_ROWS,
} from '../units.js';
import { LayoutError } from './errors.js';
import {
  MAX_GAP_MM,
  type CardSlot,
  type LayoutOptions,
  type LineMm,
  type PageLayout,
  type RectMm,
} from './types.js';

/** Length of each cut mark and distance from the grid edge, in mm. */
export const CUT_MARK_LENGTH_MM = 5;
export const CUT_MARK_OFFSET_MM = 1;

interface GridGeometry {
  cellWidth: number;
  cellHeight: number;
  originX: number;
  /** Top edge of the grid. */
  topY: number;
  gridWidth: number;
  gridHeight: number;
}

/**
 * Pure function: computes the position of every card on a centred 3×3 A4 grid.
 * Each cell is the card plus bleed; `gapMm` separates cells.
 */
export function computeGridLayout(
  cardCount: number,
  options: LayoutOptions,
): PageLayout {
  if (!Number.isInteger(cardCount) || cardCount < 0) {
    throw new LayoutError(`Invalid card count: ${cardCount}`);
  }
  const geometry = computeGeometry(options);

  const slots: CardSlot[] = [];
  for (let i = 0; i < cardCount; i++) {
    const index = i % CARDS_PER_PAGE;
    slots.push({
      page: Math.floor(i / CARDS_PER_PAGE),
      index,
      ...slotRects(index, geometry, options),
    });
  }

  return {
    pageCount: Math.ceil(cardCount / CARDS_PER_PAGE),
    slots,
    cutMarks: options.cutMarks ? computeCutMarks(geometry, options) : [],
  };
}

function computeGeometry(options: LayoutOptions): GridGeometry {
  const { gapMm, bleedMm } = options;
  if (!Number.isFinite(gapMm) || gapMm < 0 || gapMm > MAX_GAP_MM) {
    throw new LayoutError(`Gap must be between 0 and ${MAX_GAP_MM} mm`);
  }
  if (!Number.isFinite(bleedMm) || bleedMm < 0) {
    throw new LayoutError('Bleed must be a non-negative number');
  }

  const cellWidth = CARD_WIDTH_MM + 2 * bleedMm;
  const cellHeight = CARD_HEIGHT_MM + 2 * bleedMm;
  const gridWidth = GRID_COLUMNS * cellWidth + (GRID_COLUMNS - 1) * gapMm;
  const gridHeight = GRID_ROWS * cellHeight + (GRID_ROWS - 1) * gapMm;

  if (gridWidth > A4_WIDTH_MM || gridHeight > A4_HEIGHT_MM) {
    throw new LayoutError(
      `A ${GRID_COLUMNS}×${GRID_ROWS} grid with gap ${gapMm} mm and bleed ${bleedMm} mm does not fit on A4`,
    );
  }

  return {
    cellWidth,
    cellHeight,
    gridWidth,
    gridHeight,
    originX: (A4_WIDTH_MM - gridWidth) / 2,
    topY: A4_HEIGHT_MM - (A4_HEIGHT_MM - gridHeight) / 2,
  };
}

function slotRects(
  index: number,
  g: GridGeometry,
  options: LayoutOptions,
): { trim: RectMm; bleed: RectMm } {
  const column = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS);
  const bleed: RectMm = {
    xMm: g.originX + column * (g.cellWidth + options.gapMm),
    yMm: g.topY - (row + 1) * g.cellHeight - row * options.gapMm,
    widthMm: g.cellWidth,
    heightMm: g.cellHeight,
  };
  const trim: RectMm = {
    xMm: bleed.xMm + options.bleedMm,
    yMm: bleed.yMm + options.bleedMm,
    widthMm: CARD_WIDTH_MM,
    heightMm: CARD_HEIGHT_MM,
  };
  return { trim, bleed };
}

/**
 * Short lines in the page margins, aligned with every trim edge, so they stay
 * visible after neighbouring cards are cut.
 */
function computeCutMarks(g: GridGeometry, options: LayoutOptions): LineMm[] {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (let index = 0; index < CARDS_PER_PAGE; index++) {
    const { trim } = slotRects(index, g, options);
    xs.add(round(trim.xMm));
    xs.add(round(trim.xMm + trim.widthMm));
    ys.add(round(trim.yMm));
    ys.add(round(trim.yMm + trim.heightMm));
  }

  const left = g.originX;
  const right = g.originX + g.gridWidth;
  const top = g.topY;
  const bottom = g.topY - g.gridHeight;
  const hLen = markLength(left);
  const vLen = markLength(A4_HEIGHT_MM - top);

  const marks: LineMm[] = [];
  if (vLen > 0) {
    for (const x of [...xs].sort((a, b) => a - b)) {
      const above = top + CUT_MARK_OFFSET_MM;
      const below = bottom - CUT_MARK_OFFSET_MM;
      marks.push({ x1Mm: x, y1Mm: above, x2Mm: x, y2Mm: above + vLen });
      marks.push({ x1Mm: x, y1Mm: below, x2Mm: x, y2Mm: below - vLen });
    }
  }
  if (hLen > 0) {
    for (const y of [...ys].sort((a, b) => a - b)) {
      const l = left - CUT_MARK_OFFSET_MM;
      const r = right + CUT_MARK_OFFSET_MM;
      marks.push({ x1Mm: l, y1Mm: y, x2Mm: l - hLen, y2Mm: y });
      marks.push({ x1Mm: r, y1Mm: y, x2Mm: r + hLen, y2Mm: y });
    }
  }
  return marks;
}

function markLength(margin: number): number {
  return Math.max(0, Math.min(CUT_MARK_LENGTH_MM, margin - CUT_MARK_OFFSET_MM));
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
