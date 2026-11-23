import { PDFDocument, PDFPage } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import {
  type CardImage,
  DEFAULT_LAYOUT_OPTIONS,
  PdfRenderError,
  renderPdf,
} from '@drawnine/pdf-renderer';

// Smallest valid PNG: 1×1 pixel.
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);

const card = (key: string): CardImage => ({
  key,
  bytes: PNG_1PX,
  format: 'png',
});

describe('renderPdf', () => {
  it('creates one A4 page per 9 cards', async () => {
    const bytes = await renderPdf(
      Array.from({ length: 10 }, (_, i) => card(`c${i % 2}`)),
      DEFAULT_LAYOUT_OPTIONS,
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it('embeds each distinct image once', async () => {
    const spy = vi.spyOn(PDFDocument.prototype, 'embedPng');
    await renderPdf([card('a'), card('a'), card('a'), card('b')], {
      ...DEFAULT_LAYOUT_OPTIONS,
      bleedMm: 1,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('renders an empty document for no cards', async () => {
    const doc = await PDFDocument.load(
      await renderPdf([], DEFAULT_LAYOUT_OPTIONS),
    );
    expect(doc.getPageCount()).toBe(0);
  });

  it('writes the metadata', async () => {
    const bytes = await renderPdf([card('a')], DEFAULT_LAYOUT_OPTIONS, {
      noticeText: 'Playtest proxy · personal use only',
      title: 'Test deck',
    });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBe('Test deck');
    expect(doc.getProducer()).toBe('DrawNine');
  });

  it('writes the notice at the top and bottom of every page', async () => {
    const spy = vi.spyOn(PDFPage.prototype, 'drawText');
    await renderPdf(
      Array.from({ length: 10 }, () => card('a')),
      DEFAULT_LAYOUT_OPTIONS,
      { noticeText: 'Playtest proxy · personal use only' },
    );
    expect(spy).toHaveBeenCalledTimes(4);
    const ys = spy.mock.calls.map(([, options]) => options?.y ?? 0);
    const pageHeightPt = 841.89;
    // Two pages, each with one notice near the top and one near the bottom.
    expect(ys.filter((y) => y > pageHeightPt / 2)).toHaveLength(2);
    expect(ys.filter((y) => y < pageHeightPt / 2)).toHaveLength(2);
    expect(Math.max(...ys)).toBeLessThan(pageHeightPt);
    spy.mockRestore();
  });

  it('writes no notice when none is given', async () => {
    const spy = vi.spyOn(PDFPage.prototype, 'drawText');
    await renderPdf([card('a')], DEFAULT_LAYOUT_OPTIONS);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('wraps invalid image bytes in PdfRenderError', async () => {
    await expect(
      renderPdf(
        [{ key: 'bad', bytes: new Uint8Array([1, 2, 3]), format: 'png' }],
        DEFAULT_LAYOUT_OPTIONS,
      ),
    ).rejects.toThrow(PdfRenderError);
  });
});
