import {
  PDFDocument,
  type PDFImage,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { computeGridLayout } from '../layout/grid.js';
import type { LayoutOptions, RectMm } from '../layout/types.js';
import { A4_HEIGHT_MM, A4_WIDTH_MM, mmToPt } from '../units.js';
import type { CardImage, RenderOptions } from './types.js';

export class PdfRenderError extends Error {
  override readonly name = 'PdfRenderError';
}

const CUT_MARK_THICKNESS_PT = 0.5;
const NOTICE_FONT_SIZE_PT = 6;
/** Distance from the top and bottom page edges to the notice text. */
const NOTICE_MARGIN_MM = 4;

/** Draws the cards with pdf-lib and returns the PDF bytes. */
export async function renderPdf(
  cards: readonly CardImage[],
  layoutOptions: LayoutOptions,
  renderOptions: RenderOptions = {},
): Promise<Uint8Array> {
  const layout = computeGridLayout(cards.length, layoutOptions);
  const doc = await PDFDocument.create();
  doc.setTitle(renderOptions.title ?? 'DrawNine proxies');
  doc.setProducer('DrawNine');
  doc.setCreator('DrawNine');

  const font = renderOptions.noticeText
    ? await doc.embedFont(StandardFonts.Helvetica)
    : undefined;

  const embedded = new Map<string, PDFImage>();
  const embed = async (card: CardImage): Promise<PDFImage> => {
    const cached = embedded.get(card.key);
    if (cached) return cached;
    try {
      const image =
        card.format === 'png'
          ? await doc.embedPng(card.bytes)
          : await doc.embedJpg(card.bytes);
      embedded.set(card.key, image);
      return image;
    } catch (error) {
      throw new PdfRenderError(`Could not embed image "${card.key}"`, {
        cause: error,
      });
    }
  };

  const pages: PDFPage[] = [];
  for (let i = 0; i < layout.pageCount; i++) {
    const page = doc.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)]);
    pages.push(page);

    for (const mark of layout.cutMarks) {
      page.drawLine({
        start: { x: mmToPt(mark.x1Mm), y: mmToPt(mark.y1Mm) },
        end: { x: mmToPt(mark.x2Mm), y: mmToPt(mark.y2Mm) },
        thickness: CUT_MARK_THICKNESS_PT,
        color: rgb(0, 0, 0),
      });
    }

    if (font && renderOptions.noticeText) {
      const text = renderOptions.noticeText;
      const size = NOTICE_FONT_SIZE_PT;
      const x = (mmToPt(A4_WIDTH_MM) - font.widthOfTextAtSize(text, size)) / 2;
      const textHeight = font.heightAtSize(size, { descender: false });
      const style = { size, font, color: rgb(0.4, 0.4, 0.4) };
      // Same notice at the top and bottom so it survives trimming either edge.
      page.drawText(text, {
        ...style,
        x,
        y: mmToPt(A4_HEIGHT_MM - NOTICE_MARGIN_MM) - textHeight,
      });
      page.drawText(text, { ...style, x, y: mmToPt(NOTICE_MARGIN_MM) });
    }
  }

  for (const [i, slot] of layout.slots.entries()) {
    const card = cards[i];
    const page = pages[slot.page];
    if (!card || !page) continue;
    const image = await embed(card);

    if (layoutOptions.bleedMm > 0) {
      // Card images have no bleed: fill it with black, the usual border colour.
      page.drawRectangle({ ...toPt(slot.bleed), color: rgb(0, 0, 0) });
    }
    page.drawImage(image, toPt(slot.trim));
  }

  return doc.save({ addDefaultPage: false });
}

function toPt(rect: RectMm): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: mmToPt(rect.xMm),
    y: mmToPt(rect.yMm),
    width: mmToPt(rect.widthMm),
    height: mmToPt(rect.heightMm),
  };
}
