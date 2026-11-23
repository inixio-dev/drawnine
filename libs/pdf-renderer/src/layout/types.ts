export interface LayoutOptions {
  /** Gap between cards in mm (0–10). */
  gapMm: number;
  /** Bleed around each card in mm. */
  bleedMm: number;
  cutMarks: boolean;
}

/** Axis-aligned rectangle in mm, origin at the bottom-left corner of the page. */
export interface RectMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/** Position of a card on a page. */
export interface CardSlot {
  /** 0-based page index. */
  page: number;
  /** Index of the card inside its page (0–8), row-major from the top-left. */
  index: number;
  /** Trim box: the 63×88 mm card itself. */
  trim: RectMm;
  /** Trim box grown by the bleed on every side (equals trim when bleed is 0). */
  bleed: RectMm;
}

/** Line segment in mm. */
export interface LineMm {
  x1Mm: number;
  y1Mm: number;
  x2Mm: number;
  y2Mm: number;
}

export interface PageLayout {
  pageCount: number;
  slots: CardSlot[];
  /** Cut marks, identical on every page. Empty when cut marks are disabled. */
  cutMarks: LineMm[];
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  gapMm: 0,
  bleedMm: 0,
  cutMarks: true,
};

export const MAX_GAP_MM = 10;
