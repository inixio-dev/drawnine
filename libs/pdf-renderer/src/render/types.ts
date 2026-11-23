export interface CardImage {
  /**
   * Identifies identical images so each one is embedded only once in the PDF
   * (e.g. 4 copies of the same card).
   */
  key: string;
  /** PNG or JPG bytes with a ~63:88 aspect ratio. */
  bytes: Uint8Array;
  format: 'png' | 'jpg';
}

export interface RenderOptions {
  /** Small text printed at the top and bottom of every page (e.g. a playtest-only notice). */
  noticeText?: string;
  /** PDF metadata. */
  title?: string;
}
