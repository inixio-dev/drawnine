import { zipSync, type Zippable } from 'fflate';
import sharp from 'sharp';

export async function makePng(
  width: number,
  height: number,
): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 30, b: 30 },
      },
    })
      .png()
      .toBuffer(),
  );
}

export async function makeJpg(
  width: number,
  height: number,
): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 30, g: 30, b: 200 },
      },
    })
      .jpeg()
      .toBuffer(),
  );
}

export function makeZip(files: Zippable): Uint8Array {
  return zipSync(files);
}

/** Overwrites the declared uncompressed size of every central directory entry. */
export function lieAboutUncompressedSize(
  zip: Uint8Array,
  size: number,
): Uint8Array {
  const copy = zip.slice();
  const view = new DataView(copy.buffer);
  for (let p = 0; p < copy.length - 4; p++) {
    if (view.getUint32(p, true) === 0x02014b50)
      view.setUint32(p + 24, size, true);
  }
  return copy;
}
